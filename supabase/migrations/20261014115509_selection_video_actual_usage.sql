-- Reconcile temporary admission reservations against Daily's verified usage.
-- Active/unverified calls continue to reserve their maximum potential cost.
alter table club_selection_private.selection_video_entries
 add column actual_seconds bigint check(actual_seconds>=0);
alter table club_selection_private.selection_video_calls
 add column usage_settled_at timestamptz,
 add column usage_checked_at timestamptz,
 add column usage_observed_at timestamptz,
 add column usage_snapshot jsonb,
 add column usage_records jsonb,
 add column usage_error text,
 add column usage_review_required boolean not null default false,
 add column usage_run_id uuid,
 add column usage_lease_until timestamptz;
create index selection_video_usage_pending on club_selection_private.selection_video_calls(expires_at)
 where usage_settled_at is null and not usage_review_required;

-- The cron job creates a single-use, short-lived capability. Its plaintext is
-- sent only to the worker; only the hash is stored. No service key in cron SQL.
create table club_selection_private.selection_video_usage_runs (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 claimed_at timestamptz
);
alter table club_selection_private.selection_video_usage_runs enable row level security;
revoke all on club_selection_private.selection_video_usage_runs from public,anon,authenticated;
grant usage on schema club_selection_private to service_role;
grant select,update on club_selection_private.selection_video_usage_runs,
 club_selection_private.selection_video_calls,club_selection_private.selection_video_entries to service_role;

-- INVOKER functions, callable only by the worker's server-side service role.
create function club_selection_private.selection_video_usage_worker(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r uuid;call_uuid uuid;row_call club_selection_private.selection_video_calls%rowtype;
 calls jsonb;normalised jsonb;item jsonb;entry_uuid uuid;seconds bigint;entry_count integer;
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='Server usage worker only';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>250000 then raise exception 'Invalid usage work';end if;
 r:=(p_data->>'run_id')::uuid;
 if p_action='claim' then
  update club_selection_private.selection_video_usage_runs set claimed_at=now()
   where id=r and claimed_at is null and expires_at>now()
   and token_hash=encode(extensions.digest(p_data->>'token','sha256'),'hex');
  if not found then raise exception using errcode='42501',message='Invalid or expired worker capability';end if;
  with pending as (
   select c.id from club_selection_private.selection_video_calls c
    where c.club_id=(p_data->>'club_id')::uuid and c.usage_settled_at is null and not c.usage_review_required
     and c.expires_at<now()-interval '2 minutes'
     and (c.usage_checked_at is null or c.usage_checked_at<now()-interval '3 minutes')
     and (c.usage_lease_until is null or c.usage_lease_until<now())
    order by c.expires_at for update skip locked limit 3
  ), leased as (
   update club_selection_private.selection_video_calls c set usage_run_id=r,usage_lease_until=now()+interval '5 minutes'
    from pending p where p.id=c.id returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'club_id',c.club_id,'created_at',c.created_at,'expires_at',c.expires_at,
   'entries',(select jsonb_agg(jsonb_build_object('id',e.id,'created_at',e.created_at,'reserved_minutes',e.reserved_minutes) order by e.id)
    from club_selection_private.selection_video_entries e where e.call_id=c.id))),'[]') into calls from leased c;
  return calls;
 end if;
 if p_action not in ('observe','defer') then raise exception 'Invalid usage action';end if;
 if not exists(select 1 from club_selection_private.selection_video_usage_runs where id=r and claimed_at is not null and expires_at>now()) then
  raise exception using errcode='42501',message='Worker run expired';
 end if;
 call_uuid:=(p_data->>'call_id')::uuid;
 -- Same lock as admission: returning credit and issuing new tokens are atomic.
 perform pg_advisory_xact_lock(16700,16700);
 select * into row_call from club_selection_private.selection_video_calls
  where id=call_uuid and usage_run_id=r and usage_lease_until>now() for update;
 if not found then raise exception 'Usage lease expired';end if;
 if row_call.usage_settled_at is not null or row_call.expires_at>=now()-interval '2 minutes' then raise exception 'Call not ready to settle';end if;
 if p_action='defer' then
  update club_selection_private.selection_video_calls set usage_checked_at=now(),usage_lease_until=null,usage_run_id=null,
   usage_error=left(coalesce(p_data->>'code','verification_failed'),100),
   usage_review_required=(p_data->>'code'='history_unavailable') where id=call_uuid;
  return jsonb_build_object('deferred',true);
 end if;
 if jsonb_typeof(p_data->'usage') is distinct from 'array' or jsonb_typeof(p_data->'records') is distinct from 'array' then raise exception 'Usage records required';end if;
 select count(*) into entry_count from club_selection_private.selection_video_entries where call_id=call_uuid;
 if entry_count=0 or jsonb_array_length(p_data->'usage')<>entry_count then raise exception 'Incomplete entry totals';end if;
 if (select count(distinct v->>'entry_id') from jsonb_array_elements(p_data->'usage')v)<>entry_count then raise exception 'Duplicate entry totals';end if;
 for item in select value from jsonb_array_elements(p_data->'usage') loop
  entry_uuid:=(item->>'entry_id')::uuid;
  if (item->>'seconds') !~ '^[0-9]{1,12}$' or item->>'seconds' is null then raise exception 'Invalid duration';end if;
  seconds:=(item->>'seconds')::bigint;
  if not exists(select 1 from club_selection_private.selection_video_entries e
   where e.id=entry_uuid and e.call_id=call_uuid and e.club_id=row_call.club_id and seconds<=e.reserved_minutes::bigint*60) then
   raise exception 'Usage does not match reservation';
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('entry_id',(v->>'entry_id')::uuid,'seconds',(v->>'seconds')::bigint) order by v->>'entry_id')
  into normalised from jsonb_array_elements(p_data->'usage')v;
 -- Two complete, identical provider reads, at least three minutes apart, avoid
 -- turning a transient empty/partial analytics response into a credit refund.
 if row_call.usage_snapshot is distinct from normalised or row_call.usage_records is distinct from p_data->'records' then
  update club_selection_private.selection_video_calls set usage_snapshot=normalised,usage_records=p_data->'records',
   usage_observed_at=now(),usage_checked_at=now(),usage_error=null,usage_lease_until=null,usage_run_id=null where id=call_uuid;
  return jsonb_build_object('settled',false);
 end if;
 if row_call.usage_observed_at>now()-interval '3 minutes' then raise exception 'Usage confirmation too soon';end if;
 update club_selection_private.selection_video_entries e set actual_seconds=(v->>'seconds')::bigint
  from jsonb_array_elements(normalised)v where e.id=(v->>'entry_id')::uuid and e.call_id=call_uuid;
 update club_selection_private.selection_video_calls set usage_settled_at=now(),usage_checked_at=now(),usage_error=null,
  usage_lease_until=null,usage_run_id=null where id=call_uuid;
 return jsonb_build_object('settled',true);
end $$;
create function public.selection_video_usage_worker(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.selection_video_usage_worker(p_action,p_data)$$;
revoke all on function public.selection_video_usage_worker(text,jsonb),club_selection_private.selection_video_usage_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.selection_video_usage_worker(text,jsonb),club_selection_private.selection_video_usage_worker(text,jsonb) to service_role;

create function club_selection_private.schedule_video_usage_check() returns bigint
language plpgsql security invoker set search_path='' as $$
declare run_id uuid;token text;request_id bigint;
begin
 if not pg_try_advisory_xact_lock(17600,17600) then return null;end if;
 delete from club_selection_private.selection_video_usage_runs where expires_at<now()-interval '1 day';
 if not exists(select 1 from club_selection_private.selection_video_calls
  where club_id='c6022ec7-00d9-4c91-a208-710272a0b866'::uuid
   and usage_settled_at is null and not usage_review_required and expires_at<now()-interval '2 minutes'
   and (usage_checked_at is null or usage_checked_at<now()-interval '3 minutes')
   and (usage_lease_until is null or usage_lease_until<now())) then return null;end if;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into club_selection_private.selection_video_usage_runs(token_hash)
  values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run_id;
 select net.http_post(
  url:='https://txrmgwoiowlqbuulmztd.supabase.co/functions/v1/selection-video-usage',
  headers:=jsonb_build_object('Content-Type','application/json'),
  body:=jsonb_build_object('run_id',run_id,'token',token),timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function club_selection_private.schedule_video_usage_check() from public,anon,authenticated,service_role;

-- Install the schedule inactive. Activate only after the worker is deployed.
select cron.schedule('selection-video-actual-usage','*/5 * * * *','select club_selection_private.schedule_video_usage_check()');
select cron.alter_job((select jobid from cron.job where jobname='selection-video-actual-usage'),active:=false);

create or replace function club_selection_private.selection_room_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=p_club_id;me uuid:=auth.uid();cfg club_selection_private.selection_room_settings%rowtype;
 msg club_selection_private.selection_room_messages%rowtype;call_row club_selection_private.selection_video_calls%rowtype;
 entry club_selection_private.selection_video_entries%rowtype;policy club_selection_private.selection_video_policy%rowtype;
 rid uuid;body_text text;v text;posts jsonb;can_manage boolean;cursor_id bigint;oldest bigint;
 month_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 cost integer;club_used bigint;total_used bigint;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false)
  or not coalesce(club_selection_private.selector(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid Selection Room request';end if;
 can_manage:=coalesce(club_selection_private.publication_head(c)=me,false)
  or exists(select 1 from club_selection_private.access where club_id=c and head_selector_id=me);
 select * into cfg from club_selection_private.selection_room_settings where club_id=c;
 select * into policy from club_selection_private.selection_video_policy where club_id=c;
 if p_action='access' then
  return jsonb_build_object('allowed',true,'video_enabled',coalesce(policy.enabled,false));
 elsif p_action='context' then
  if p_data ? 'after' and p_data ? 'before' then raise exception 'Choose one message cursor';end if;
  v:=coalesce(p_data->>'after',p_data->>'before');
  if v is not null then
   if v !~ '^[0-9]{1,18}$' then raise exception 'Invalid message cursor';end if;cursor_id:=v::bigint;
  end if;
  if p_data ? 'after' then
   select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]') into posts from
    (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
     where club_id=c and id>cursor_id order by id limit 100) m;
  else
   select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]'),min(m.id) into posts,oldest from
    (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
     where club_id=c and (cursor_id is null or id<cursor_id) order by id desc limit 100) m;
  end if;
  return jsonb_build_object('messages',posts,'has_older',exists(select 1 from club_selection_private.selection_room_messages where club_id=c and id<oldest),
   'backup_url',coalesce(cfg.backup_url,''),'revision',coalesce(cfg.revision,0),'can_manage',can_manage,
   'video_enabled',coalesce(policy.enabled,false),'call_active',exists(select 1 from club_selection_private.selection_video_calls where club_id=c and expires_at>now()));
 elsif p_action='post' then
  body_text:=btrim(p_data->>'body');rid:=(p_data->>'request_id')::uuid;
  if rid is null or body_text is null or length(body_text) not between 1 and 1500 then raise exception 'Write a message of up to 1,500 characters';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  select * into msg from club_selection_private.selection_room_messages where club_id=c and author_id=me and request_id=rid;
  if found then
   if msg.body<>body_text then raise exception 'This message request was already used';end if;
  else
   insert into club_selection_private.selection_room_messages(club_id,author_id,author_name,body,request_id)
    values(c,me,left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100),body_text,rid) returning * into msg;
  end if;
  return jsonb_build_object('message',jsonb_build_object('id',msg.id::text,'author_id',msg.author_id,'author_name',msg.author_name,'body',msg.body,'created_at',msg.created_at));
 elsif p_action='save_backup' then
  if not can_manage then raise exception using errcode='42501',message='The Head of Selections can change the backup call';end if;
  v:=btrim(coalesce(p_data->>'url',''));
  if length(v)>2048 or (v<>'' and (v !~* '^https://(teams[.]microsoft[.]com|teams[.]live[.]com|teams[.]cloud[.]microsoft|meet[.]google[.]com|([a-z0-9-]+[.])*zoom[.]us|([a-z0-9-]+[.])*zoom[.]com)/.+'
   or v ~ '[[:space:]]' or position(chr(92) in v)>0)) then raise exception 'Paste a Teams, Google Meet or Zoom meeting link';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  select * into cfg from club_selection_private.selection_room_settings where club_id=c;
  if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'The backup call changed. Refresh it before saving';end if;
  insert into club_selection_private.selection_room_settings(club_id,backup_url,updated_by) values(c,v,me)
   on conflict(club_id) do update set backup_url=excluded.backup_url,revision=club_selection_private.selection_room_settings.revision+1,updated_by=me,updated_at=now()
   returning * into cfg;
  return jsonb_build_object('backup_url',cfg.backup_url,'revision',cfg.revision,'saved',true);
 elsif p_action='reserve_video' then
  -- Reserve an upper bound before issuing a token. Retries reuse the same entry.
  -- Confirmed usage replaces expired reservations. Active holds retain the spending cap.
  if not coalesce(policy.enabled,false) then raise exception 'Video is not enabled for this club yet';end if;
  rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Video request required';end if;
  perform pg_advisory_xact_lock(16700,16700);
  select * into entry from club_selection_private.selection_video_entries where id=rid;
  if found then
   if entry.club_id<>c or entry.user_id<>me then raise exception 'Video request belongs to another session';end if;
   select * into call_row from club_selection_private.selection_video_calls where id=entry.call_id;
   if call_row.expires_at<=now() then raise exception 'This call has ended. Join a new call';end if;
  else
   select * into call_row from club_selection_private.selection_video_calls where club_id=c and expires_at>now()+interval '1 minute' order by expires_at desc limit 1;
   if not found then
    insert into club_selection_private.selection_video_calls(club_id,expires_at)
     values(c,least(now()+interval '90 minutes',month_start+interval '1 month')) returning * into call_row;
   end if;
   cost:=least(91,ceil(extract(epoch from (call_row.expires_at-now()))/60)::integer+1);
   select coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)) filter(where club_id=c),0),coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)),0) into club_used,total_used
    from club_selection_private.selection_video_entries where created_at>=month_start;
   if club_used+cost::bigint*60>policy.monthly_minutes::bigint*60 or total_used+cost::bigint*60>9000::bigint*60 then raise exception 'This month’s video allowance is used. Use the backup call';end if;
   insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes)
    values(rid,call_row.id,c,me,cost) returning * into entry;
  end if;
  return jsonb_build_object('room_name','cb-'||replace(call_row.id::text,'-',''),'expires_at',call_row.expires_at,
   'entry_id',entry.id,'user_name',left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100));
 end if;
 raise exception 'Unknown Selection Room action';
end $$;
