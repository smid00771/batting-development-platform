-- Revocation is sticky for an issued provider identity. Re-grants use a new request
-- ID, while the original entry and actual-usage settlement remain intact.
alter table club_selection_private.selection_video_entries add column revoked_at timestamptz;
create table club_selection_private.selection_video_revocation_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into club_selection_private.selection_video_revocation_settings values(true,false);
create table club_selection_private.selection_video_revocation_runs (
 id uuid primary key default gen_random_uuid(),token_hash text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes',claimed_at timestamptz
);
create table club_selection_private.selection_video_revocations (
 entry_id uuid primary key,call_id uuid not null,club_id uuid not null,expires_at timestamptz not null,
 queued_at timestamptz not null default now(),attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),lease_run_id uuid,lease_until timestamptz,
 completed_at timestamptz,last_error text
);
create index selection_video_revocations_due on club_selection_private.selection_video_revocations(next_attempt_at) where completed_at is null;
alter table club_selection_private.selection_video_revocation_settings enable row level security;
alter table club_selection_private.selection_video_revocation_runs enable row level security;
alter table club_selection_private.selection_video_revocations enable row level security;
revoke all on club_selection_private.selection_video_revocation_settings,club_selection_private.selection_video_revocation_runs,club_selection_private.selection_video_revocations from public,anon,authenticated;
grant select,insert,update,delete on club_selection_private.selection_video_revocation_runs,club_selection_private.selection_video_revocations to service_role;

create function club_selection_private.video_call_allowed(c uuid,g uuid,u uuid) returns boolean
language sql stable set search_path='' as $$
 select coalesce(club_selection_private.enabled(c),false)
 and coalesce(case when g='00000000-0000-0000-0000-000000000000'::uuid
 then not club_selection_private.scoped_selections(c) and club_selection_private.legacy_selector(c,u)
 else club_selection_private.scoped_selections(c) and club_selection_private.selection_group_level(c,g,u)>0 end,false)
$$;
revoke all on function club_selection_private.video_call_allowed(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function club_selection_private.revoke_invalid_video_entries(c uuid) returns integer
language plpgsql set search_path='' as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 if not exists(select 1 from club_selection_private.selection_video_entries e join club_selection_private.selection_video_calls v on v.id=e.call_id
  where e.club_id=c and e.revoked_at is null and v.expires_at>now() and not club_selection_private.video_call_allowed(c,v.scope_id,e.user_id)) then return 0;end if;
 -- Installation is fail-closed until the deployed worker and cron are enabled.
 if not (select enabled from club_selection_private.selection_video_revocation_settings where singleton) then
  raise exception 'Call revocation is not enabled. Finish the active call before changing its access';
 end if;
 with revoked as (
  update club_selection_private.selection_video_entries e set revoked_at=now()
  from club_selection_private.selection_video_calls v where v.id=e.call_id and e.club_id=c and e.revoked_at is null and v.expires_at>now()
   and not club_selection_private.video_call_allowed(c,v.scope_id,e.user_id)
  returning e.id,e.call_id,e.club_id,v.expires_at
 ) insert into club_selection_private.selection_video_revocations(entry_id,call_id,club_id,expires_at)
 select id,call_id,club_id,expires_at from revoked on conflict(entry_id) do nothing;
 get diagnostics n=row_count;return n;
end $$;
revoke all on function club_selection_private.revoke_invalid_video_entries(uuid) from public,anon,authenticated,service_role;

create function club_selection_private.schedule_selection_video_revocations() returns void
language plpgsql set search_path='' as $$
declare r uuid;t text;
begin
 if not (select enabled from club_selection_private.selection_video_revocation_settings where singleton) then return;end if;
 -- Match worker lock order before touching queue rows.
 perform pg_advisory_xact_lock(16702,16702);
 update club_selection_private.selection_video_revocations set completed_at=now(),last_error='token_expired',lease_run_id=null,lease_until=null where completed_at is null and expires_at<=now();
 delete from club_selection_private.selection_video_revocation_runs where expires_at<now()-interval '1 day';
 if not exists(select 1 from club_selection_private.selection_video_revocations where completed_at is null and next_attempt_at<=now() and (lease_until is null or lease_until<=now())) then return;end if;
 -- Coalesce the many deferred grant-row triggers from a single save.
 if exists(select 1 from club_selection_private.selection_video_revocation_runs where claimed_at is null and created_at>now()-interval '45 seconds') then return;end if;
 t:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into club_selection_private.selection_video_revocation_runs(token_hash) values(encode(extensions.digest(t,'sha256'),'hex')) returning id into r;
 perform net.http_post(url:='https://txrmgwoiowlqbuulmztd.supabase.co/functions/v1/selection-video-revoke',
  headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('run_id',r,'token',t),timeout_milliseconds:=60000);
end $$;
revoke all on function club_selection_private.schedule_selection_video_revocations() from public,anon,authenticated,service_role;

-- The periodic reconciliation has its own transaction; commit-time dispatch must
-- not acquire another club's permission lock while holding the changed club's.
create function club_selection_private.reconcile_selection_video_revocations() returns void
language plpgsql set search_path='' as $$
declare c uuid;
begin
 if not (select enabled from club_selection_private.selection_video_revocation_settings where singleton) then return;end if;
 for c in select distinct club_id from club_selection_private.selection_video_calls where expires_at>now() order by club_id loop
  perform club_selection_private.revoke_invalid_video_entries(c);
 end loop;
 perform club_selection_private.schedule_selection_video_revocations();
end $$;
revoke all on function club_selection_private.reconcile_selection_video_revocations() from public,anon,authenticated,service_role;

create function club_selection_private.selection_video_access_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare n integer:=0;
begin
 if tg_op<>'INSERT' then n:=club_selection_private.revoke_invalid_video_entries(old.club_id);end if;
 if tg_op<>'DELETE' and (tg_op='INSERT' or new.club_id is distinct from old.club_id) then n:=n+club_selection_private.revoke_invalid_video_entries(new.club_id);end if;
 if n>0 then perform club_selection_private.schedule_selection_video_revocations();end if;
 return null;
end $$;
revoke all on function club_selection_private.selection_video_access_changed() from public,anon,authenticated,service_role;
-- Final transaction state is essential: save_group deletes then re-inserts grants.
create constraint trigger selection_video_group_grant_changed after insert or update or delete on club_selection_private.selection_group_access deferrable initially deferred for each row execute function club_selection_private.selection_video_access_changed();
create constraint trigger selection_video_group_head_changed after insert or update or delete on club_selection_private.selection_group_heads deferrable initially deferred for each row execute function club_selection_private.selection_video_access_changed();
create constraint trigger selection_video_scope_changed after insert or update or delete on club_selection_private.selection_access_settings deferrable initially deferred for each row execute function club_selection_private.selection_video_access_changed();
create constraint trigger selection_video_legacy_selector_changed after insert or update or delete on club_selection_private.selectors deferrable initially deferred for each row execute function club_selection_private.selection_video_access_changed();
create constraint trigger selection_video_access_changed after insert or update or delete on club_selection_private.access deferrable initially deferred for each row execute function club_selection_private.selection_video_access_changed();
create constraint trigger selection_video_membership_changed after insert or update or delete on public.club_memberships deferrable initially deferred for each row execute function club_selection_private.selection_video_access_changed();
create constraint trigger selection_video_group_changed after insert or update or delete on club_selection_private.selection_groups deferrable initially deferred for each row execute function club_selection_private.selection_video_access_changed();

create function club_selection_private.selection_video_revocation_worker(p_action text,p_data jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare r uuid;token text;jobs jsonb;v_call uuid;ids uuid[];n integer;
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='Worker access required';end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>16000 then raise exception 'Invalid worker request';end if;
 r:=(p_data->>'run_id')::uuid;if r is null then raise exception 'Run required';end if;
 if p_action='claim' then
  token:=p_data->>'token';
  if token is null or token!~'^[a-f0-9]{64}$' then raise exception using errcode='42501',message='Invalid worker capability';end if;
  update club_selection_private.selection_video_revocation_runs set claimed_at=now()
   where id=r and claimed_at is null and expires_at>now() and token_hash=encode(extensions.digest(token,'sha256'),'hex');
  if not found then raise exception using errcode='42501',message='Invalid worker capability';end if;
  perform pg_advisory_xact_lock(16702,16702);
  update club_selection_private.selection_video_revocations set completed_at=now(),last_error='token_expired',lease_run_id=null,lease_until=null where completed_at is null and expires_at<=now();
  -- One room per job, at most 100 provider identities (Daily's request limit).
  with rooms as (select call_id,min(queued_at) q from club_selection_private.selection_video_revocations where completed_at is null and next_attempt_at<=now() and (lease_until is null or lease_until<=now()) group by call_id order by q limit 5),
  candidates as (select entry_id,row_number() over(partition by call_id order by queued_at,entry_id) as rn from club_selection_private.selection_video_revocations where call_id in(select call_id from rooms) and completed_at is null and next_attempt_at<=now() and (lease_until is null or lease_until<=now()))
  update club_selection_private.selection_video_revocations set lease_run_id=r,lease_until=now()+interval '2 minutes',attempts=attempts+1 where entry_id in(select entry_id from candidates where rn<=100);
  select coalesce(jsonb_agg(j),'[]'::jsonb) into jobs from (
   select jsonb_build_object('call_id',call_id,'room_name','cb-'||replace(call_id::text,'-',''),'expires_at',max(expires_at),'entry_ids',jsonb_agg(entry_id order by entry_id)) j
    from club_selection_private.selection_video_revocations where lease_run_id=r and completed_at is null group by call_id
  ) x;
  return jobs;
 end if;
 if p_action not in ('complete','defer') then raise exception 'Unknown worker action';end if;
 if not exists(select 1 from club_selection_private.selection_video_revocation_runs where id=r and claimed_at is not null and expires_at>now()) then raise exception using errcode='42501',message='Invalid worker lease';end if;
 v_call:=(p_data->>'call_id')::uuid;
 if jsonb_typeof(p_data->'entry_ids')<>'array' or jsonb_array_length(p_data->'entry_ids') not between 1 and 100 then raise exception 'Invalid worker entries';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'entry_ids');
 if v_call is null or (select count(distinct i) from unnest(ids) i)<>cardinality(ids) then raise exception 'Invalid worker entries';end if;
 select count(*) into n from club_selection_private.selection_video_revocations where call_id=v_call and entry_id=any(ids) and lease_run_id=r and lease_until>now() and completed_at is null;
 if n<>cardinality(ids) then raise exception using errcode='42501',message='Invalid worker lease';end if;
 if p_action='complete' then
  update club_selection_private.selection_video_revocations set completed_at=now(),last_error=null,lease_run_id=null,lease_until=null where call_id=v_call and entry_id=any(ids) and lease_run_id=r;
  return '{"completed":true}'::jsonb;
 end if;
 update club_selection_private.selection_video_revocations set next_attempt_at=now()+interval '20 seconds',last_error=left(coalesce(p_data->>'code','provider_error'),100),lease_run_id=null,lease_until=null where call_id=v_call and entry_id=any(ids) and lease_run_id=r;
 return '{"deferred":true}'::jsonb;
end $$;
revoke all on function club_selection_private.selection_video_revocation_worker(text,jsonb) from public,anon,authenticated;
grant execute on function club_selection_private.selection_video_revocation_worker(text,jsonb) to service_role;
create function public.selection_video_revocation_worker(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql set search_path='' as $$select club_selection_private.selection_video_revocation_worker(p_action,p_data)$$;
revoke all on function public.selection_video_revocation_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.selection_video_revocation_worker(text,jsonb) to service_role;

-- Keep cron disabled until the worker is deployed with verify_jwt=false. Enable
-- this job and the private settings row together after its capability smoke test.
select cron.schedule('selection-video-revocations','* * * * *','select club_selection_private.reconcile_selection_video_revocations()');
select cron.alter_job((select jobid from cron.job where jobname='selection-video-revocations'),active:=false);

-- Patch the two admission paths from selection_group_rooms, preserving all wallet
-- calculations, session duration, group scope and immutable audio/video mode.
do $patch$
declare fn text;src text;anchor text;
begin
 foreach fn in array array['selection_room_api','selection_room_api_before_credits'] loop
  src:=pg_get_functiondef(to_regprocedure('club_selection_private.'||fn||'(uuid,text,jsonb)'));
  anchor:=E'begin\n if me is null';
  if position(anchor in src)=0 then raise exception 'Admission lock patch target missing: %',fn;end if;
  src:=replace(src,anchor,E'begin\n if p_action in (''reserve_video'',''confirm_video'') then\n  perform pg_advisory_xact_lock(hashtextextended(c::text,9200));\n  room_scope:=club_selection_private.selection_room_scope(c,p_data);\n  if club_selection_private.scoped_selections(c) and not (select enabled from club_selection_private.selection_video_revocation_settings where singleton) then raise exception ''Selection calls are being updated. Try again shortly'';end if;\n end if;\n if me is null');
  anchor:='if entry.club_id<>c or entry.user_id<>me then';
  if position(anchor in src)=0 then raise exception 'Entry patch target missing: %',fn;end if;
  src:=replace(src,anchor,E'if entry.revoked_at is not null then raise exception using errcode=''42501'',message=''This call entry was revoked. Join again with a new request'';end if;\n  '||anchor);
  if fn='selection_room_api' then
   anchor:=E' -- Message resets share the admission lock:';
   if position(anchor in src)=0 then raise exception 'Confirmation patch target missing';end if;
   src:=replace(src,anchor,E' if p_action=''confirm_video'' then\n  select * into entry from club_selection_private.selection_video_entries where id=(p_data->>''entry_id'')::uuid;\n  select * into call_row from club_selection_private.selection_video_calls where id=entry.call_id;\n  if entry.id is null or call_row.id is null or entry.club_id<>c or entry.user_id<>me or entry.revoked_at is not null or call_row.scope_id<>room_scope or call_row.expires_at<=now() or (''cb-''||replace(call_row.id::text,''-'','''')) is distinct from p_data->>''room_name'' then\n   raise exception using errcode=''42501'',message=''Your access to this call changed. Join again if you still have access'';\n  end if;\n  return jsonb_build_object(''confirmed'',true,''entry_id'',entry.id);\n end if;\n'||anchor);
  end if;
  execute src;
 end loop;
end $patch$;
