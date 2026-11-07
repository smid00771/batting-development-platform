-- Schema and function definitions only. No production records, credentials, or network access.
create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
create table club_batting_private.phone_subscriptions (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "endpoint" text not null,
 "p256dh" text not null,
 "auth_key" text not null,
 "binding" uuid default gen_random_uuid() not null,
 "created_at" timestamp with time zone default now() not null,
 "last_seen_at" timestamp with time zone default now() not null,
 "disabled_at" timestamp with time zone,
 constraint "phone_subscriptions_endpoint_key" UNIQUE (endpoint),
 constraint "phone_subscriptions_pkey" PRIMARY KEY (id),
 constraint "phone_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create table club_batting_private.phone_preferences (
 "subscription_id" uuid not null,
 "club_id" uuid not null,
 "messages" boolean default true not null,
 "coaching" boolean default true not null,
 "messages_since" timestamp with time zone default now() not null,
 "coaching_since" timestamp with time zone default now() not null,
 constraint "phone_preferences_club_id_fkey" FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
 constraint "phone_preferences_pkey" PRIMARY KEY (subscription_id, club_id),
 constraint "phone_preferences_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES club_batting_private.phone_subscriptions(id) ON DELETE CASCADE
);
create table club_batting_private.phone_deliveries (
 "id" uuid default gen_random_uuid() not null,
 "subscription_id" uuid not null,
 "club_id" uuid not null,
 "kind" text not null,
 "source_key" text not null,
 "source_at" timestamp with time zone not null,
 "status" text default 'queued'::text not null,
 "attempts" integer default 0 not null,
 "next_attempt_at" timestamp with time zone default now() not null,
 "lease" uuid,
 "leased_at" timestamp with time zone,
 "finished_at" timestamp with time zone,
 "error_code" text,
 constraint "phone_deliveries_club_id_fkey" FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
 constraint "phone_deliveries_kind_check" CHECK ((kind = ANY (ARRAY['message'::text, 'coaching'::text]))),
 constraint "phone_deliveries_pkey" PRIMARY KEY (id),
 constraint "phone_deliveries_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'sending'::text, 'sent'::text, 'cancelled'::text, 'failed'::text]))),
 constraint "phone_deliveries_subscription_id_club_id_kind_source_key_so_key" UNIQUE (subscription_id, club_id, kind, source_key, source_at),
 constraint "phone_deliveries_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES club_batting_private.phone_subscriptions(id) ON DELETE CASCADE
);
CREATE OR REPLACE FUNCTION public.phone_notification_worker(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select club_batting_private.phone_worker(p_action,p_data)$function$
;
CREATE OR REPLACE FUNCTION club_batting_private.phone_worker(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; u jsonb; result jsonb:='[]'; lease_id uuid; n integer:=0; code text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Worker access required'; end if;
 if p_action='config' then
  return (select jsonb_object_agg(replace(name,'club_batting_push_',''),decrypted_secret) from vault.decrypted_secrets where name in ('club_batting_push_worker_token','club_batting_push_public_key','club_batting_push_private_key'));
 elsif p_action='email_pending' then
  -- Retry only this feature's unsent messages; never flush another email queue.
  return coalesce((select jsonb_agg(id) from (select o.id from public.outbound_messages o
   where o.template_key in ('club_staff_message','club_action_required') and o.sent_at is null and o.failed_at is null and o.cancelled_at is null
    and (o.processing_at is null or o.processing_at<now()-interval '10 minutes')
    and o.created_at<now()-interval '90 seconds' and o.created_at>now()-interval '3 days'
   order by o.created_at limit 5) q),'[]'::jsonb);
 elsif p_action='collect' then
  perform club_batting_private.collect_message_email_fallbacks();
  perform club_batting_private.collect_coaching_email_fallbacks();
  for r in select s.id,s.user_id,p.* from club_batting_private.phone_preferences p join club_batting_private.phone_subscriptions s on s.id=p.subscription_id
   join public.club_memberships m on m.user_id=s.user_id and m.club_id=p.club_id join public.clubs c on c.id=m.club_id
   where s.disabled_at is null and c.archived_at is null and (p.messages or p.coaching) loop
   if r.messages then
    insert into club_batting_private.phone_deliveries(subscription_id,club_id,kind,source_key,source_at)
    select r.subscription_id,r.club_id,'message',m.id::text,m.created_at from club_batting_private.club_messages m
    join club_batting_private.club_message_recipients mr on mr.message_id=m.id join club_batting_private.phone_subscriptions s on s.id=r.subscription_id
    where m.club_id=r.club_id and mr.user_id=r.user_id and mr.opened_at is null and m.created_at>=greatest(r.messages_since,s.created_at,now()-interval '7 days')
    on conflict do nothing;
   end if;
   if r.coaching then
    for u in select value from jsonb_array_elements(club_batting_private.phone_source_updates(r.user_id,r.club_id)) loop
     if (u->>'changed_at')::timestamptz>=greatest(r.coaching_since,(select created_at from club_batting_private.phone_subscriptions where id=r.subscription_id),now()-interval '7 days') then
      insert into club_batting_private.phone_deliveries(subscription_id,club_id,kind,source_key,source_at)
       values(r.subscription_id,r.club_id,'coaching',u->>'source_key',(u->>'changed_at')::timestamptz) on conflict do nothing;
     end if;
    end loop;
   end if;
  end loop;
  -- Keep only the newest revision of each source before delivery.
  update club_batting_private.phone_deliveries d set status='cancelled',finished_at=now(),error_code='superseded'
   where d.status='queued' and exists(select 1 from club_batting_private.phone_deliveries newer where newer.subscription_id=d.subscription_id and newer.club_id=d.club_id and newer.kind=d.kind and newer.source_key=d.source_key and newer.source_at>d.source_at);
  return jsonb_build_object('pending',(select count(*) from club_batting_private.phone_deliveries where status in ('queued','sending')));
 elsif p_action='claim' then
  for r in select d.* from club_batting_private.phone_deliveries d where (d.status='queued' and d.next_attempt_at<=now() or d.status='sending' and d.leased_at<now()-interval '3 minutes')
   and d.attempts<5 order by d.source_at for update skip locked limit 25 loop
   if not club_batting_private.phone_delivery_valid(r.id) then
    update club_batting_private.phone_deliveries set status='cancelled',finished_at=now(),error_code='no_longer_needed' where id=r.id; continue;
   end if;
   lease_id:=gen_random_uuid();
   update club_batting_private.phone_deliveries set status='sending',attempts=attempts+1,lease=lease_id,leased_at=now() where id=r.id;
   result:=result||jsonb_build_array((select jsonb_build_object('id',r.id,'lease',lease_id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key),
    'payload',jsonb_build_object('title','Club Batting','body',case when r.kind='message' then 'You have a new club message.' else 'You have a new coaching update.' end,
     'tag','cb-'||r.kind||'-'||r.source_key,'binding',s.binding,
     'url',case when r.kind='message' then './'||club_selection_private.week_message_path(r.source_key::uuid,r.club_id) else './app.html?club='||r.club_id::text||'&tab=conversations&coaching='||r.source_key end))
    from club_batting_private.phone_subscriptions s where s.id=r.subscription_id));
  end loop;
  -- Retire exhausted leases if a worker died after its fifth attempt.
  update club_batting_private.phone_deliveries set status='failed',finished_at=now(),error_code='attempt_limit' where status='sending' and attempts>=5 and leased_at<now()-interval '3 minutes';
  return result;
 elsif p_action='check' then
  return jsonb_build_object('valid',exists(select 1 from club_batting_private.phone_deliveries d where d.id=(p_data->>'id')::uuid and d.lease=(p_data->>'lease')::uuid and d.status='sending' and club_batting_private.phone_delivery_valid(d.id)));
 elsif p_action='finish' then
  code:=left(coalesce(p_data->>'code','error'),40);
  select * into r from club_batting_private.phone_deliveries where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid and status='sending' for update;
  if not found then return jsonb_build_object('updated',false); end if;
  if code in ('404','410') then update club_batting_private.phone_subscriptions set disabled_at=now(),binding=gen_random_uuid() where id=r.subscription_id; end if;
  update club_batting_private.phone_deliveries set status=case when code='sent' then 'sent' when code in ('cancelled','404','410') then 'cancelled' when attempts>=5 then 'failed' else 'queued' end,
   finished_at=case when code in ('sent','cancelled','404','410') or attempts>=5 then now() end,error_code=case when code='sent' then null else code end,
   next_attempt_at=now()+make_interval(secs=>least(3600,60*(2^attempts)::integer)) where id=r.id;
  return jsonb_build_object('updated',true);
 end if;
 raise exception 'Unknown worker action';
end $function$
;
CREATE OR REPLACE FUNCTION club_batting_private.phone_delivery_valid(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d record; updates jsonb;
begin
 select q.*,s.user_id,s.created_at subscribed_at,s.disabled_at,p.messages,p.coaching,p.messages_since,p.coaching_since into d
 from club_batting_private.phone_deliveries q join club_batting_private.phone_subscriptions s on s.id=q.subscription_id
 join club_batting_private.phone_preferences p on p.subscription_id=q.subscription_id and p.club_id=q.club_id where q.id=p_id;
 if not found or d.disabled_at is not null or d.source_at<d.subscribed_at or d.source_at<now()-interval '7 days' or not exists(
  select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id where m.user_id=d.user_id and m.club_id=d.club_id and c.archived_at is null) then return false; end if;
 if d.kind='message' then return d.messages and d.source_at>=d.messages_since and exists(select 1 from club_batting_private.club_messages m
  join club_batting_private.club_message_recipients r on r.message_id=m.id where m.id::text=d.source_key and m.club_id=d.club_id and r.user_id=d.user_id and r.opened_at is null and club_batting_private.message_recipient_allowed(m.id,d.user_id));
 end if;
 if not d.coaching or d.source_at<d.coaching_since then return false; end if;
 updates:=club_batting_private.phone_source_updates(d.user_id,d.club_id);
 return exists(select 1 from jsonb_array_elements(updates) u where u->>'source_key'=d.source_key and (u->>'changed_at')::timestamptz=d.source_at);
end $function$
;
revoke all on function public.phone_notification_worker(text,jsonb),club_batting_private.phone_worker(text,jsonb) from public,anon,authenticated;
grant usage on schema club_batting_private,auth to service_role;
grant execute on function public.phone_notification_worker(text,jsonb),club_batting_private.phone_worker(text,jsonb) to service_role;
