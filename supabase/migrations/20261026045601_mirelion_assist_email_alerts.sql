-- Transactional Assist alerts. Conversations remain private; emails contain only a link.
-- Disabled until the matching dispatcher and app release have been verified.
create table mirelion_assist_private.notification_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into mirelion_assist_private.notification_settings(singleton) values(true);
create table mirelion_assist_private.notification_state (
 thread_id uuid not null references mirelion_assist_private.threads(id) on delete cascade,
 side text not null check(side in ('club','team')),
 message_id bigint not null,
 due_at timestamptz not null,
 queued_through bigint not null default 0,
 queued_at timestamptz,
 primary key(thread_id,side)
);
create index assist_notification_due on mirelion_assist_private.notification_state(due_at)
 where message_id>queued_through;
create table mirelion_assist_private.email_refs (
 outbound_id uuid primary key references public.outbound_messages(id) on delete cascade,
 thread_id uuid not null references mirelion_assist_private.threads(id) on delete cascade,
 side text not null check(side in ('club','team')),
 message_id bigint not null
);
create index assist_email_thread on mirelion_assist_private.email_refs(thread_id);
create index assist_email_pending on public.outbound_messages(created_at)
 where template_key='mirelion_assist' and sent_at is null and failed_at is null and cancelled_at is null;
alter table mirelion_assist_private.notification_settings enable row level security;
alter table mirelion_assist_private.notification_state enable row level security;
alter table mirelion_assist_private.email_refs enable row level security;
revoke all on mirelion_assist_private.notification_settings,mirelion_assist_private.notification_state,mirelion_assist_private.email_refs from public,anon,authenticated;

create function mirelion_assist_private.plan_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from mirelion_assist_private.notification_settings where singleton and enabled) then return new; end if;
 insert into mirelion_assist_private.notification_state(thread_id,side,message_id,due_at)
 values(new.thread_id,new.side,new.id,now()+interval '2 minutes')
 on conflict(thread_id,side) do update set
  message_id=greatest(mirelion_assist_private.notification_state.message_id,excluded.message_id),
  due_at=greatest(excluded.due_at,coalesce(mirelion_assist_private.notification_state.queued_at+interval '10 minutes',excluded.due_at));
 return new;
end $$;
revoke all on function mirelion_assist_private.plan_notification() from public,anon,authenticated;
create trigger assist_plan_notification after insert on mirelion_assist_private.messages
 for each row execute function mirelion_assist_private.plan_notification();

-- Derive recipients from current authorised records, never from browser-supplied email.
create function mirelion_assist_private.notification_data(p_thread uuid,p_side text,p_message bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('deliver',true,'thread_id',t.id,'club_id',t.club_id,'side',p_side,
  'recipient_user_id',case when p_side='team' then t.requester_id else null end,
  'recipient_email',case when p_side='team' then u.email else 'support@mirelionhq.com' end)
 from mirelion_assist_private.threads t
 join mirelion_assist_private.messages m on m.thread_id=t.id and m.id=p_message and m.side=p_side
 join public.clubs c on c.id=t.club_id and c.archived_at is null
 join public.club_memberships cm on cm.club_id=t.club_id and cm.user_id=t.requester_id
 join auth.users u on u.id=t.requester_id and u.email_confirmed_at is not null
 where t.id=p_thread and t.status='open' and t.last_side=p_side
 and exists(select 1 from mirelion_assist_private.notification_settings where singleton and enabled)
 and ((p_side='team' and not exists(select 1 from mirelion_assist_private.reads r
       where r.thread_id=t.id and r.user_id=t.requester_id and r.last_message_id>=p_message))
   or (p_side='club' and not exists(select 1 from mirelion_assist_private.reads r
       join public.platform_admins pa on pa.user_id=r.user_id
       where r.thread_id=t.id and r.user_id<>t.requester_id and r.last_message_id>=p_message
       and pa.role in ('owner','commercial_admin','support_admin','technical_admin'))));
$$;
revoke all on function mirelion_assist_private.notification_data(uuid,text,bigint) from public,anon,authenticated;

create function mirelion_assist_private.email_check(p_message_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select mirelion_assist_private.notification_data(r.thread_id,r.side,r.message_id)
  from mirelion_assist_private.email_refs r join public.outbound_messages o on o.id=r.outbound_id
  where r.outbound_id=p_message_id and o.template_key='mirelion_assist'
  and o.sent_at is null and o.cancelled_at is null),'{}'::jsonb);
$$;
revoke all on function mirelion_assist_private.email_check(uuid) from public,anon,authenticated;
grant usage on schema mirelion_assist_private to service_role;
grant execute on function mirelion_assist_private.email_check(uuid) to service_role;
create function public.mirelion_assist_email(p_message_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select mirelion_assist_private.email_check(p_message_id);
$$;
revoke all on function public.mirelion_assist_email(uuid) from public,anon,authenticated;
grant execute on function public.mirelion_assist_email(uuid) to service_role;

-- Reuse the existing, server-configured dispatcher webhook; no credential is copied
-- into a migration or returned to the app. This mirrors the existing retry worker.
create function mirelion_assist_private.retry_notifications()
returns bigint language plpgsql security definer set search_path='' as $$
declare
 args text[]; candidate record; webhook_url text; webhook_headers jsonb;
 auth_header text; webhook_count integer:=0; request_id bigint;
begin
 if not exists(select 1 from mirelion_assist_private.notification_settings where singleton and enabled)
 or not exists(select 1 from public.outbound_messages o
   join public.platform_settings s on s.singleton and s.email_mode='live'
   where o.template_key='mirelion_assist' and o.sent_at is null and o.failed_at is null
    and o.cancelled_at is null and o.created_at>=s.email_live_from
    and o.created_at<now()-interval '1 minute'
    and (o.processing_at is null or o.processing_at<now()-interval '10 minutes')) then return null; end if;
 for candidate in
  select t.tgargs from pg_catalog.pg_trigger t
  join pg_catalog.pg_proc p on p.oid=t.tgfoid join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where t.tgrelid='public.outbound_messages'::regclass and not t.tgisinternal and t.tgenabled in ('O','A')
   and (t.tgtype::integer & 4)=4 and n.nspname='supabase_functions' and p.proname='http_request'
 loop
  args:=string_to_array(encode(candidate.tgargs,'escape'),E'\\000');
  if array_length(args,1)<3 or convert_from(decode(args[2],'escape'),'UTF8')<>'POST' then continue; end if;
  if convert_from(decode(args[1],'escape'),'UTF8') !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/dispatch-outbox/?$' then continue; end if;
  webhook_count:=webhook_count+1;
  webhook_url:=convert_from(decode(args[1],'escape'),'UTF8');
  webhook_headers:=convert_from(decode(args[3],'escape'),'UTF8')::jsonb;
  select value into auth_header from jsonb_each_text(webhook_headers) where lower(key)='authorization';
 end loop;
 if webhook_count<>1 or coalesce(auth_header,'') !~ '^Bearer [^[:space:]]{32,}$' then
  raise exception 'Assist email retries need one enabled outbound dispatcher webhook.';
 end if;
 select net.http_post(url:=webhook_url,headers:=webhook_headers,
  body:=jsonb_build_object('action','dispatch','template_key','mirelion_assist','limit',12),
  timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;
revoke all on function mirelion_assist_private.retry_notifications() from public,anon,authenticated;

create function mirelion_assist_private.flush_notifications()
returns integer language plpgsql security definer set search_path='' as $$
declare row mirelion_assist_private.notification_state%rowtype; data jsonb; oid uuid; queued integer:=0;
begin
 if not exists(select 1 from mirelion_assist_private.notification_settings where singleton and enabled)
 or not exists(select 1 from public.platform_settings where singleton and email_mode='live') then return 0; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('mirelion-assist-alerts',271)) then return 0; end if;
 for row in select * from mirelion_assist_private.notification_state
  where message_id>queued_through and due_at<=now() order by due_at limit 50 for update skip locked
 loop
  data:=mirelion_assist_private.notification_data(row.thread_id,row.side,row.message_id);
  if data is not null then
   -- No club_id, subject, body or Guide text goes into the club-visible outbox.
   insert into public.outbound_messages(recipient_user_id,recipient_email,template_key,subject,payload)
   values(nullif(data->>'recipient_user_id','')::uuid,data->>'recipient_email','mirelion_assist',
    case when row.side='club' then 'New message in Mirelion Assist' else 'Mirelion replied to your support conversation' end,
    jsonb_build_object('notification','mirelion_assist')) returning id into oid;
   insert into mirelion_assist_private.email_refs(outbound_id,thread_id,side,message_id)
    values(oid,row.thread_id,row.side,row.message_id);
   queued:=queued+1;
  end if;
  update mirelion_assist_private.notification_state set queued_through=row.message_id,
   queued_at=case when data is not null then now() else queued_at end
   where thread_id=row.thread_id and side=row.side;
 end loop;
 perform mirelion_assist_private.retry_notifications();
 return queued;
end $$;
revoke all on function mirelion_assist_private.flush_notifications() from public,anon,authenticated;
select cron.schedule('mirelion-assist-email-alerts','* * * * *','select mirelion_assist_private.flush_notifications();');
