-- Event-driven support. Deploy disabled; existing conversations stay with people.
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='mirelion_assist_private.api(text,jsonb)'::regprocedure)<>'57961f88c1053cbaf570ecde92d53202'
 then raise exception 'Assist API changed; review this migration before applying it.'; end if;
end $$;
alter table mirelion_assist_private.threads
 add column channel text not null default 'assist' check(channel in ('assist','email')),
 add column assistance text not null default 'human' check(assistance in ('auto','human')),
 add column sender_email text,
 add column sender_name text,
 add column handover_reason text,
 add column attention_after bigint not null default 0,
 alter column club_id drop not null,
 alter column requester_id drop not null;
alter table mirelion_assist_private.threads add constraint assist_identity
 check((channel='assist' and club_id is not null and requester_id is not null and sender_email is null)
 or (channel='email' and club_id is null and requester_id is null and sender_email is not null));
alter table mirelion_assist_private.messages add column automated boolean not null default false;

create table mirelion_assist_private.automation_settings (
 singleton boolean primary key default true check(singleton),
 assist_enabled boolean not null default false,
 email_enabled boolean not null default false,
 daily_limit integer not null default 200 check(daily_limit between 1 and 1000)
);
insert into mirelion_assist_private.automation_settings(singleton) values(true);
create table mirelion_assist_private.support_jobs (
 message_id bigint primary key references mirelion_assist_private.messages(id) on delete cascade,
 thread_id uuid not null references mirelion_assist_private.threads(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','running','done','superseded')),
 lease uuid, started_at timestamptz, created_at timestamptz not null default now(),
 decision jsonb
);
create index support_job_pending on mirelion_assist_private.support_jobs(created_at) where state in ('pending','running');
create index support_job_thread on mirelion_assist_private.support_jobs(thread_id,message_id);
create index support_job_usage on mirelion_assist_private.support_jobs(started_at) where started_at is not null;
create table mirelion_assist_private.support_incoming (
 provider_id uuid primary key,
 message_id bigint not null references mirelion_assist_private.messages(id) on delete cascade,
 thread_id uuid not null references mirelion_assist_private.threads(id) on delete cascade,
 internet_id text not null check(char_length(internet_id) between 1 and 300),
 sender_email text not null,
 authenticated boolean not null,
 attachments boolean not null default false,
 created_at timestamptz not null default now()
);
create index support_incoming_thread on mirelion_assist_private.support_incoming(thread_id,message_id desc);
create unique index support_incoming_reply on mirelion_assist_private.support_incoming(sender_email,internet_id);
create index support_incoming_sender on mirelion_assist_private.support_incoming(sender_email,created_at);
create table mirelion_assist_private.support_deliveries (
 message_id bigint primary key references mirelion_assist_private.messages(id) on delete cascade,
 thread_id uuid not null references mirelion_assist_private.threads(id) on delete cascade,
 incoming_id uuid not null references mirelion_assist_private.support_incoming(provider_id),
 state text not null default 'pending' check(state in ('pending','running','sent','failed','cancelled')),
 lease uuid, started_at timestamptz, first_attempt_at timestamptz, attempts integer not null default 0,
 provider_id text, internet_id text, created_at timestamptz not null default now()
);
create index support_delivery_pending on mirelion_assist_private.support_deliveries(created_at) where state in ('pending','running');
create index support_delivery_thread on mirelion_assist_private.support_deliveries(thread_id,message_id);
create index support_delivery_incoming on mirelion_assist_private.support_deliveries(incoming_id);
create index support_delivery_reply on mirelion_assist_private.support_deliveries(internet_id) where internet_id is not null;
alter table mirelion_assist_private.automation_settings enable row level security;
alter table mirelion_assist_private.support_jobs enable row level security;
alter table mirelion_assist_private.support_incoming enable row level security;
alter table mirelion_assist_private.support_deliveries enable row level security;
revoke all on mirelion_assist_private.automation_settings,mirelion_assist_private.support_jobs,
 mirelion_assist_private.support_incoming,mirelion_assist_private.support_deliveries from public,anon,authenticated;

create function mirelion_assist_private.support_new_thread() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.channel='assist' and new.legacy_thread_id is null and exists(select 1 from mirelion_assist_private.automation_settings where assist_enabled)
 then new.assistance:='auto'; end if;
 return new;
end $$;
revoke all on function mirelion_assist_private.support_new_thread() from public,anon,authenticated;
create trigger support_new_thread before insert on mirelion_assist_private.threads
 for each row execute function mirelion_assist_private.support_new_thread();

create function mirelion_assist_private.support_attention(p_thread uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare mid bigint;
begin
 update mirelion_assist_private.threads set assistance='human',handover_reason=left(p_reason,40),last_side='club',
  attention_after=coalesce((select max(id) from mirelion_assist_private.messages where thread_id=p_thread),0),version=version+1,updated_at=now() where id=p_thread;
 select max(id) into mid from mirelion_assist_private.messages where thread_id=p_thread and side='club';
 if mid is not null then
  insert into mirelion_assist_private.notification_state(thread_id,side,message_id,due_at) values(p_thread,'club',mid,now())
  on conflict(thread_id,side) do update set message_id=excluded.message_id,due_at=now(),queued_through=least(mirelion_assist_private.notification_state.queued_through,mid-1);
 end if;
end $$;
revoke all on function mirelion_assist_private.support_attention(uuid,text) from public,anon,authenticated;

create function mirelion_assist_private.support_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare th mirelion_assist_private.threads%rowtype; inbound uuid;
begin
 select * into th from mirelion_assist_private.threads where id=new.thread_id;
 if new.side='team' then
  if not new.automated then
   update mirelion_assist_private.threads set assistance='human' where id=th.id;
   update mirelion_assist_private.support_jobs set state='superseded',lease=null where thread_id=th.id and state in ('pending','running');
  end if;
  if th.channel='email' then
   select provider_id into inbound from mirelion_assist_private.support_incoming where thread_id=th.id order by message_id desc limit 1;
   if inbound is not null then insert into mirelion_assist_private.support_deliveries(message_id,thread_id,incoming_id) values(new.id,th.id,inbound); end if;
  end if;
 elsif th.assistance='auto' then
  update mirelion_assist_private.support_jobs set state='superseded',lease=null where thread_id=th.id and state in ('pending','running');
  insert into mirelion_assist_private.support_jobs(message_id,thread_id) values(new.id,th.id);
 end if;
 return new;
end $$;
revoke all on function mirelion_assist_private.support_message() from public,anon,authenticated;
create trigger support_message after insert on mirelion_assist_private.messages
 for each row execute function mirelion_assist_private.support_message();

-- Keep ordinary manual support alerts. Routine bot conversations do not notify
-- the owner on every question; handover explicitly restores the existing alert.
create or replace function mirelion_assist_private.notification_data(p_thread uuid,p_side text,p_message bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('deliver',true,'thread_id',t.id,'club_id',t.club_id,'side',p_side,
 'recipient_user_id',case when p_side='team' then t.requester_id else null end,
 'recipient_email',case when p_side='team' then u.email else 'support@mirelionhq.com' end)
 from mirelion_assist_private.threads t
 join mirelion_assist_private.messages m on m.thread_id=t.id and m.id=p_message and m.side=p_side
 left join public.clubs c on c.id=t.club_id
 left join public.club_memberships cm on cm.club_id=t.club_id and cm.user_id=t.requester_id
 left join auth.users u on u.id=t.requester_id
 where t.id=p_thread and t.status='open' and t.last_side=p_side
 and ((t.channel='assist' and c.archived_at is null and cm.user_id is not null and u.email_confirmed_at is not null) or (t.channel='email' and p_side='club'))
 and exists(select 1 from mirelion_assist_private.notification_settings where singleton and enabled)
 and ((p_side='team' and not exists(select 1 from mirelion_assist_private.reads r where r.thread_id=t.id and r.user_id=t.requester_id and r.last_message_id>=p_message))
 or (p_side='club' and t.assistance='human' and not exists(select 1 from mirelion_assist_private.reads r join public.platform_admins pa on pa.user_id=r.user_id
 where r.thread_id=t.id and r.user_id is distinct from t.requester_id and r.last_message_id>=greatest(p_message,t.attention_after) and pa.role in ('owner','commercial_admin','support_admin','technical_admin'))));
$$;

-- Only the service worker can claim jobs, receive verified webhooks and commit
-- generated replies. The browser API below remains checked per account/club.
create function mirelion_assist_private.support_worker(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare th mirelion_assist_private.threads%rowtype; job mirelion_assist_private.support_jobs%rowtype;
 delivery mirelion_assist_private.support_deliveries%rowtype; incoming mirelion_assist_private.support_incoming%rowtype;
 settings mirelion_assist_private.automation_settings%rowtype; tid uuid; mid bigint; receipt uuid; plan jsonb; history jsonb;
 allowed boolean; exhausted boolean; from_email text; reply_id text; result jsonb;
begin
 select * into settings from mirelion_assist_private.automation_settings where singleton;
 if p_action='status' then return jsonb_build_object('assist_enabled',settings.assist_enabled,'email_enabled',settings.email_enabled); end if;
 if p_action='ingest' then
  if not settings.email_enabled then return jsonb_build_object('disabled',true); end if;
  receipt:=(p_data->>'provider_id')::uuid;from_email:=lower(btrim(p_data->>'sender_email'));
  if coalesce(from_email,'')!~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' or length(from_email)>254
   or char_length(coalesce(p_data->>'internet_id','')) not between 1 and 300 or char_length(coalesce(p_data->>'body','')) not between 1 and 6000 then raise exception 'Invalid incoming support email.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(from_email,295));
  select * into incoming from mirelion_assist_private.support_incoming where provider_id=receipt;
  if found then return jsonb_build_object('thread_id',incoming.thread_id,'duplicate',true); end if;
  if exists(select 1 from mirelion_assist_private.support_incoming where sender_email=from_email and internet_id=p_data->>'internet_id') then return jsonb_build_object('duplicate',true); end if;
  if (select count(*) from mirelion_assist_private.support_incoming where sender_email=from_email and created_at>now()-interval '1 hour')>=30 then raise exception 'Support email rate limit.'; end if;
  reply_id:=nullif(p_data->>'in_reply_to','');
  -- Never join an email to a signed-in member's private conversation by address.
  select t.id into tid from mirelion_assist_private.threads t where t.channel='email' and t.sender_email=from_email and
   (exists(select 1 from mirelion_assist_private.support_incoming i where i.thread_id=t.id and i.internet_id=reply_id)
    or exists(select 1 from mirelion_assist_private.support_deliveries d where d.thread_id=t.id and d.internet_id=reply_id))
   order by t.updated_at desc limit 1;
  if tid is null then
   insert into mirelion_assist_private.threads(channel,sender_email,sender_name,subject,category,assistance)
   values('email',from_email,left(coalesce(p_data->>'sender_name',from_email),120),left(coalesce(nullif(btrim(p_data->>'subject'),''),'Support email'),120),'help',
    case when coalesce((p_data->>'authenticated')::boolean,false) and not coalesce((p_data->>'attachments')::boolean,false) then 'auto' else 'human' end) returning id into tid;
  else
   select * into th from mirelion_assist_private.threads where id=tid for update;
   update mirelion_assist_private.threads set status='open',last_side='club',version=version+1,updated_at=now(),
    assistance=case when not coalesce((p_data->>'authenticated')::boolean,false) or coalesce((p_data->>'attachments')::boolean,false) then 'human' else assistance end where id=tid;
  end if;
  insert into mirelion_assist_private.messages(thread_id,side,body) values(tid,'club',p_data->>'body') returning id into mid;
  insert into mirelion_assist_private.support_incoming(provider_id,message_id,thread_id,internet_id,sender_email,authenticated,attachments)
   values(receipt,mid,tid,p_data->>'internet_id',from_email,coalesce((p_data->>'authenticated')::boolean,false),coalesce((p_data->>'attachments')::boolean,false));
  return jsonb_build_object('thread_id',tid,'message_id',mid);
 elsif p_action='claim' then
  -- A vanished worker or disabled rollout passes responsibility back to people.
  for th in select t.* from mirelion_assist_private.threads t where t.assistance='auto' and exists(
   select 1 from mirelion_assist_private.support_jobs j where j.thread_id=t.id and j.state in ('pending','running')
    and (j.created_at<now()-interval '4 minutes' or (t.channel='assist' and not settings.assist_enabled) or (t.channel='email' and not settings.email_enabled)))
   for update of t skip locked limit 10
  loop
   perform mirelion_assist_private.support_attention(th.id,'unavailable');
   update mirelion_assist_private.support_jobs set state='superseded',lease=null where thread_id=th.id and state in ('pending','running');
  end loop;
  select t.* into th from mirelion_assist_private.threads t where t.status='open' and t.assistance='auto'
   and ((t.channel='assist' and settings.assist_enabled) or (t.channel='email' and settings.email_enabled))
   and exists(select 1 from mirelion_assist_private.support_jobs j where j.thread_id=t.id and j.state='pending')
   order by t.updated_at for update of t skip locked limit 1;
  if not found then return null; end if;
  select * into job from mirelion_assist_private.support_jobs where thread_id=th.id and state='pending' order by message_id desc limit 1 for update;
  if th.channel='assist' and not exists(select 1 from public.club_memberships cm join public.clubs c on c.id=cm.club_id and c.archived_at is null
   where cm.club_id=th.club_id and cm.user_id=th.requester_id) then
   update mirelion_assist_private.support_jobs set state='superseded' where message_id=job.message_id;return null;
  end if;
  -- Serialize the short budget check. Provider requests happen after this commit.
  perform pg_advisory_xact_lock(295295);
  exhausted:=(select count(*)>=settings.daily_limit from mirelion_assist_private.support_jobs where started_at>date_trunc('day',now()));
  exhausted:=exhausted or (select count(*)>=20 from mirelion_assist_private.support_jobs j join mirelion_assist_private.threads t on t.id=j.thread_id
   where j.started_at>date_trunc('day',now()) and ((th.requester_id is not null and t.requester_id=th.requester_id) or (th.sender_email is not null and t.sender_email=th.sender_email)));
  update mirelion_assist_private.support_jobs set state='running',lease=gen_random_uuid(),started_at=now() where message_id=job.message_id returning * into job;
  select coalesce(jsonb_agg(jsonb_build_object('side',m.side,'body',m.body) order by m.id),'[]') into history
   from (select * from mirelion_assist_private.messages where thread_id=th.id order by id desc limit 8) m;
  return jsonb_build_object('thread_id',th.id,'message_id',job.message_id,'lease',job.lease,'subject',th.subject,'category',th.category,'channel',th.channel,
   'messages',history,'budget_exhausted',exhausted,
   'auto_replies',(select count(*) from mirelion_assist_private.messages where thread_id=th.id and automated),
   'previous_topics',coalesce((select jsonb_agg(distinct topic) from mirelion_assist_private.support_jobs j cross join lateral jsonb_array_elements(j.decision->'topics') topic where j.thread_id=th.id and j.state='done'),'[]'));
 elsif p_action='finish' then
  select * into th from mirelion_assist_private.threads where id=(p_data->>'thread_id')::uuid for update;
  select * into job from mirelion_assist_private.support_jobs where message_id=(p_data->>'message_id')::bigint and thread_id=th.id for update;
  if not found or job.state<>'running' or job.lease is distinct from (p_data->>'lease')::uuid then return jsonb_build_object('stale',true); end if;
  allowed:=th.status='open' and th.assistance='auto' and th.last_side='club'
   and job.message_id=(select max(id) from mirelion_assist_private.messages where thread_id=th.id)
   and ((th.channel='assist' and settings.assist_enabled and exists(select 1 from public.club_memberships cm join public.clubs c on c.id=cm.club_id and c.archived_at is null where cm.club_id=th.club_id and cm.user_id=th.requester_id)) or (th.channel='email' and settings.email_enabled));
  if not coalesce(allowed,false) then update mirelion_assist_private.support_jobs set state='superseded',lease=null where message_id=job.message_id;return jsonb_build_object('stale',true); end if;
  plan:=p_data->'decision';
  if plan->>'kind' not in ('reply','handoff') or plan->>'kind' is null or char_length(coalesce(plan->>'body','')) not between 1 and 6000 then raise exception 'Invalid support reply.'; end if;
  update mirelion_assist_private.support_jobs set state='done',lease=null,decision=plan where message_id=job.message_id;
  update mirelion_assist_private.threads set last_side='team',version=version+1,updated_at=now() where id=th.id;
  insert into mirelion_assist_private.messages(thread_id,side,body,automated) values(th.id,'team',plan->>'body',true) returning id into mid;
  if plan->>'kind'='handoff' then perform mirelion_assist_private.support_attention(th.id,plan->>'reason'); end if;
  return jsonb_build_object('message_id',mid);
 elsif p_action='claim_delivery' then
  if not settings.email_enabled then return null; end if;
  select * into delivery from mirelion_assist_private.support_deliveries where state='pending' or (state='running' and started_at<now()-interval '2 minutes')
   order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  if exists(select 1 from mirelion_assist_private.messages m where m.id=delivery.message_id and m.automated)
   and exists(select 1 from mirelion_assist_private.messages m where m.thread_id=delivery.thread_id and m.id>delivery.message_id) then
   update mirelion_assist_private.support_deliveries set state='cancelled',lease=null where message_id=delivery.message_id;return null;
  end if;
  if delivery.attempts>=3 or delivery.first_attempt_at<now()-interval '20 hours' then
   update mirelion_assist_private.support_deliveries set state='failed',lease=null where message_id=delivery.message_id;
   perform mirelion_assist_private.support_attention(delivery.thread_id,'email_delivery');return null;
  end if;
  update mirelion_assist_private.support_deliveries set state='running',lease=gen_random_uuid(),started_at=now(),first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1
   where message_id=delivery.message_id returning * into delivery;
  select jsonb_build_object('message_id',d.message_id,'thread_id',d.thread_id,'lease',d.lease,'recipient',t.sender_email,'subject',t.subject,'body',m.body,'automated',m.automated,'in_reply_to',i.internet_id)
   into result from mirelion_assist_private.support_deliveries d join mirelion_assist_private.threads t on t.id=d.thread_id
    join mirelion_assist_private.messages m on m.id=d.message_id join mirelion_assist_private.support_incoming i on i.provider_id=d.incoming_id where d.message_id=delivery.message_id;
  return result;
 elsif p_action='finish_delivery' then
  update mirelion_assist_private.support_deliveries set state=case when coalesce((p_data->>'sent')::boolean,false) then 'sent' else 'pending' end,
   provider_id=left(p_data->>'provider_id',200),internet_id=left(p_data->>'internet_id',300),lease=null
   where message_id=(p_data->>'message_id')::bigint and lease=(p_data->>'lease')::uuid and state='running';
  return jsonb_build_object('recorded',found);
 end if;
 raise exception 'Unknown support worker action.';
end $$;
revoke all on function mirelion_assist_private.support_worker(text,jsonb) from public,anon,authenticated;
grant execute on function mirelion_assist_private.support_worker(text,jsonb) to service_role;
create function public.mirelion_support_worker(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select mirelion_assist_private.support_worker(p_action,p_data) $$;
revoke all on function public.mirelion_support_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.mirelion_support_worker(text,jsonb) to service_role;

-- Schedule only when new work exists. Reuse the already configured server-only
-- dispatcher credential; no token is copied to source, logs or client responses.
create function mirelion_assist_private.run_support() returns bigint
language plpgsql security definer set search_path='' as $$
declare args text[]; candidate record; candidate_url text; endpoint text; headers jsonb; n integer:=0; request_id bigint;
begin
 if not exists(select 1 from mirelion_assist_private.support_jobs where state in ('pending','running'))
 and not exists(select 1 from mirelion_assist_private.support_deliveries where state in ('pending','running')) then return null; end if;
 for candidate in select t.tgargs from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid join pg_catalog.pg_namespace ns on ns.oid=p.pronamespace
  where t.tgrelid='public.outbound_messages'::regclass and not t.tgisinternal and t.tgenabled in ('O','A') and (t.tgtype::integer & 4)=4 and ns.nspname='supabase_functions' and p.proname='http_request'
 loop
  args:=string_to_array(encode(candidate.tgargs,'escape'),E'\\000');
  if array_length(args,1)<3 or convert_from(decode(args[2],'escape'),'UTF8')<>'POST' then continue; end if;
  candidate_url:=convert_from(decode(args[1],'escape'),'UTF8');
  if candidate_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/dispatch-outbox/?$' then continue; end if;
  endpoint:=candidate_url;
  headers:=convert_from(decode(args[3],'escape'),'UTF8')::jsonb;n:=n+1;
 end loop;
 if n<>1 then return null; end if;
 select net.http_post(url:=regexp_replace(endpoint,'/dispatch-outbox/?$','/mirelion-support'),headers:=headers,body:='{"action":"run"}',timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;
revoke all on function mirelion_assist_private.run_support() from public,anon,authenticated;
select cron.schedule('mirelion-support-worker','* * * * *','select mirelion_assist_private.run_support();');

create or replace function mirelion_assist_private.api(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); c uuid:=nullif(p_data->>'club_id','')::uuid;
 team boolean:=coalesce((p_data->>'platform')::boolean,false);
 staff boolean; t mirelion_assist_private.threads%rowtype;
 cmd mirelion_assist_private.commands%rowtype;
 rid uuid; tid uuid:=nullif(p_data->>'thread_id','')::uuid;
 body text:=btrim(coalesce(p_data->>'body','')); subj text:=btrim(coalesce(p_data->>'subject',''));
 cat text:=coalesce(p_data->>'category','help'); result jsonb; mid bigint; ctx jsonb:='[]';
 before_id bigint:=nullif(p_data->>'before','')::bigint;
 cutoff bigint; skip integer:=greatest(0,least(10000,coalesce((p_data->>'offset')::integer,0)));
 filter_status text:=coalesce(p_data->>'status','open'); search_term text:=left(btrim(coalesce(p_data->>'search','')),120);
begin
 if u is null then raise exception 'Sign in to use Mirelion Assist.' using errcode='42501'; end if;
 staff:=public.has_platform_role(array['owner','commercial_admin','support_admin','technical_admin']);
 if team then
  if not staff then raise exception 'Mirelion team access required.' using errcode='42501'; end if;
 else
  if c is null or not public.is_club_member(c) then raise exception 'Your club access has changed. Sign in again.' using errcode='42501'; end if;
 end if;
 if p_action not in ('summary','list','thread','read','create','send','status','handover','legacy','legacy_close') then raise exception 'Unknown Assist action.'; end if;
 if p_action in ('legacy','legacy_close') then
  if not team then raise exception 'Mirelion team access required.' using errcode='42501'; end if;
  if p_action='legacy_close' then
   if exists(select 1 from mirelion_assist_private.threads where legacy_thread_id=tid) then raise exception 'Resolve this conversation in Assist.'; end if;
   perform public.platform_close_guide_request(tid);return jsonb_build_object('resolved',true);
  end if;
  return coalesce((select jsonb_agg(item) from jsonb_array_elements(public.platform_get_guide_requests()) item
   where not exists(select 1 from mirelion_assist_private.threads where legacy_thread_id=(item->>'id')::uuid)),'[]');
 end if;
 if p_action in ('create','send','status','handover') then
  rid:=nullif(p_data->>'request_id','')::uuid;
  if rid is null then raise exception 'A request reference is required.'; end if;
  -- Serialize retries from one user, including requests from multiple browser tabs.
  perform pg_advisory_xact_lock(hashtextextended(u::text,754));
  select * into cmd from mirelion_assist_private.commands where user_id=u and request_id=rid;
  if found then
   if cmd.action<>p_action or cmd.payload<>p_data then raise exception 'This request reference was already used. Reopen the message.'; end if;
   -- Re-check current access before returning even an old receipt.
   select * into t from mirelion_assist_private.threads where id=(cmd.result->>'thread_id')::uuid;
   if not found or (not team and (t.channel<>'assist' or t.club_id is distinct from c or t.requester_id is distinct from u)) then raise exception 'Message unavailable.' using errcode='42501'; end if;
   return cmd.result;
  end if;
 end if;
 if p_action in ('thread','read','send','status','handover') then
  select * into t from mirelion_assist_private.threads where id=tid for update;
  if not found or (not team and (t.channel<>'assist' or t.club_id is distinct from c or t.requester_id is distinct from u)) then raise exception 'Message unavailable.' using errcode='42501'; end if;
 end if;
 if p_action='summary' then
  return jsonb_build_object('unread',(select count(*) from mirelion_assist_private.messages m
   join mirelion_assist_private.threads th on th.id=m.thread_id
   left join mirelion_assist_private.reads r on r.thread_id=th.id and r.user_id=u
   where (team or (th.club_id=c and th.requester_id=u))
   and (not team or th.assistance='human') and (m.side=case when team then 'club' else 'team' end or (team and th.last_side='club' and m.id=th.attention_after)) and m.id>coalesce(r.last_message_id,0)));
 elsif p_action='list' then
  if filter_status not in ('open','resolved') then raise exception 'Choose open or resolved messages.'; end if;
  select coalesce(jsonb_agg(item order by priority,updated_at desc,id),'[]') into result from (
   select th.id,th.updated_at,case when team and th.assistance='human' and th.last_side='club' then 0 else 1 end priority,jsonb_build_object('id',th.id,'subject',th.subject,'category',th.category,'status',th.status,
    'version',th.version,'channel',th.channel,'assistance',th.assistance,'last_side',th.last_side,'updated_at',th.updated_at,'club_name',coalesce(cl.name,'Support email'),
    'requester_name',coalesce(nullif(pr.display_name,''),th.sender_name,th.sender_email,'Club member'),
    'preview',(select left(m.body,160) from mirelion_assist_private.messages m where m.thread_id=th.id order by m.id desc limit 1),
    'unread',(select count(*) from mirelion_assist_private.messages m where m.thread_id=th.id
     and (not team or th.assistance='human') and (m.side=case when team then 'club' else 'team' end or (team and th.last_side='club' and m.id=th.attention_after)) and m.id>coalesce(r.last_message_id,0))) item
   from mirelion_assist_private.threads th left join public.clubs cl on cl.id=th.club_id
   left join public.user_profiles pr on pr.user_id=th.requester_id
   left join mirelion_assist_private.reads r on r.thread_id=th.id and r.user_id=u
   where (team or (th.club_id=c and th.requester_id=u)) and th.status=filter_status
    and (search_term='' or strpos(lower(th.subject||' '||coalesce(cl.name,'')||' '||coalesce(pr.display_name,th.sender_email,'')),lower(search_term))>0)
   order by priority,th.updated_at desc,th.id limit 51 offset skip
  ) items;
  return jsonb_build_object('threads',case when jsonb_array_length(result)>50 then result-50 else result end,'has_more',jsonb_array_length(result)>50);
 elsif p_action='thread' then
  select coalesce(jsonb_agg(item order by id),'[]') into result from (
   select m.id,jsonb_build_object('id',m.id,'side',m.side,'automated',m.automated,'body',m.body,'created_at',m.created_at,
    'delivery_state',case when team and t.channel='email' then (select state from mirelion_assist_private.support_deliveries where message_id=m.id) else null end) item
   from mirelion_assist_private.messages m where m.thread_id=tid and (before_id is null or m.id<before_id) order by m.id desc limit 100
  ) page;
  cutoff:=nullif(result->0->>'id','')::bigint;
  return jsonb_build_object('thread',jsonb_build_object('id',t.id,'subject',t.subject,'category',t.category,'status',t.status,'version',t.version,'channel',t.channel,'assistance',t.assistance,
   'last_side',t.last_side,'club_name',coalesce((select name from public.clubs where id=t.club_id),'Support email'),
   'requester_name',coalesce((select display_name from public.user_profiles where user_id=t.requester_id),t.sender_name,t.sender_email),'sender_email',case when team then t.sender_email else null end,'email_reply_enabled',case when t.channel='email' then (select email_enabled from mirelion_assist_private.automation_settings where singleton) else true end,'guide_context',t.guide_context),
   'messages',result,'has_older',exists(select 1 from mirelion_assist_private.messages where thread_id=tid and id<cutoff));
 elsif p_action='read' then
  mid:=coalesce((p_data->>'through')::bigint,0);
  if not exists(select 1 from mirelion_assist_private.messages where thread_id=tid and id=mid) then raise exception 'Read reference unavailable.'; end if;
  insert into mirelion_assist_private.reads(thread_id,user_id,last_message_id) values(tid,u,mid)
   on conflict(thread_id,user_id) do update set last_message_id=greatest(mirelion_assist_private.reads.last_message_id,excluded.last_message_id);
  return jsonb_build_object('read',true);
 elsif p_action in ('create','send') then
  if char_length(body) not between 1 and 6000 then raise exception 'Enter a message of 1–6,000 characters.'; end if;
  if (select count(*) from mirelion_assist_private.messages where author_id=u and created_at>now()-interval '1 minute')>=20 then raise exception 'Please wait a moment before sending another message.'; end if;
  if p_action='create' then
   if team then raise exception 'Open a club message to reply.'; end if;
   if char_length(subj) not between 1 and 120 then raise exception 'Add a subject of 1–120 characters.'; end if;
   if cat not in ('help','enquiry','idea') then raise exception 'Choose help, enquiry or a suggested change.'; end if;
   if coalesce((p_data->>'include_guide')::boolean,false) then
    select coalesce(jsonb_agg(jsonb_build_object('role',g.role,'content',left(g.content,6000),'created_at',g.created_at) order by g.created_at),'[]') into ctx
     from (select m.* from public.club_batting_guide_messages m where m.thread_id=(select id from public.club_batting_guide_threads where club_id=c and user_id=u order by updated_at desc limit 1) order by m.created_at desc limit 40) g;
   end if;
   insert into mirelion_assist_private.threads(club_id,requester_id,subject,category,guide_context) values(c,u,subj,cat,ctx) returning * into t;
   tid:=t.id;
  else
   update mirelion_assist_private.threads set status='open',last_side=case when team then 'team' else 'club' end,version=version+1,updated_at=now() where id=tid returning * into t;
  end if;
  if team and t.channel='email' and not exists(select 1 from mirelion_assist_private.automation_settings where email_enabled) then raise exception 'The support email connection is paused. Reply in the existing mailbox.'; end if;
  insert into mirelion_assist_private.messages(thread_id,author_id,side,body) values(tid,u,case when team then 'team' else 'club' end,body) returning id into mid;
  result:=jsonb_build_object('thread_id',tid,'message_id',mid,'version',t.version);
 elsif p_action='handover' then
  if t.status<>'open' then raise exception 'Reopen this conversation before requesting a person.'; end if;
  if t.assistance='auto' then
   insert into mirelion_assist_private.messages(thread_id,side,body,automated)
    values(tid,'team','A person from the Mirelion team will reply here. You can add any details below.',true) returning id into mid;
   perform mirelion_assist_private.support_attention(tid,'person_requested');
   update mirelion_assist_private.support_jobs set state='superseded',lease=null where thread_id=tid and state in ('pending','running');
  end if;
  select * into t from mirelion_assist_private.threads where id=tid;
  result:=jsonb_build_object('thread_id',tid,'version',t.version,'status',t.status);
 elsif p_action='status' then
  if p_data->>'status' not in ('open','resolved') or p_data->>'status' is null then raise exception 'Choose open or resolved.'; end if;
  if coalesce((p_data->>'version')::bigint,-1)<>t.version then raise exception 'This conversation changed. Read the latest messages and try again.'; end if;
  update mirelion_assist_private.threads set status=p_data->>'status',version=version+1,updated_at=now() where id=tid returning * into t;
  if t.status='resolved' and t.legacy_thread_id is not null then
   update public.club_batting_guide_threads set status='closed',updated_at=now() where id=t.legacy_thread_id;
  end if;
  result:=jsonb_build_object('thread_id',tid,'version',t.version,'status',t.status);
 end if;
 insert into mirelion_assist_private.commands(user_id,request_id,action,payload,result) values(u,rid,p_action,p_data,result);
 insert into public.platform_audit_events(actor_user_id,club_id,event_type,details)
 values(u,t.club_id,'mirelion_assist_'||p_action,jsonb_build_object('thread_id',tid,'message_id',mid,'status',t.status));
 return result;
end;
$$;

notify pgrst,'reload schema';
