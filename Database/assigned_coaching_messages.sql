-- Notify the responsible coach. Shared coaching access does not make someone a recipient.
alter table club_batting_private.coaching_duties add column if not exists receives_batting_conversations boolean not null default false;
update club_batting_private.coaching_duties set receives_batting_conversations=true where lower(btrim(title))='batting coach';

create or replace function club_batting_private.coaching_message_recipient(aid uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.player_coaching_actions a
 join public.players p on p.id=a.player_id and p.club_id=a.club_id and p.active
 join public.clubs c on c.id=a.club_id and c.archived_at is null
 join public.club_memberships m on m.club_id=c.id and m.user_id=u
 where a.id=aid and club_batting_private.player_uses_batting(c.id,p.id)
 and (case when a.preferred_user_id is not null then a.preferred_user_id=u else exists(
  select 1 from club_batting_private.coaching_duties d join club_batting_private.coaching_duty_members dm on dm.club_id=d.club_id and dm.duty_id=d.id
  where d.club_id=c.id and d.receives_batting_conversations and dm.user_id=u) end)
 and (a.is_player_request and a.preferred_user_id=u or m.permission_role='admin'
  or club_batting_private.roster_coaching_access(c.id,p.id,u,false)
  or club_selection_private.temporary_captain_player(c.id,p.id,u)
  or club_selection_private.season_captain_player(c.id,p.id,u)
  or exists(select 1 from public.club_access_grants g where g.club_id=c.id and g.user_id=u and g.can_view
   and (g.scope='whole_club' or g.scope='player' and g.player_id=p.id or g.scope='grade' and coalesce(p.grade,'')=g.grade
    or g.scope='playing_group' and exists(select 1 from public.player_playing_groups pg where pg.player_id=p.id and pg.playing_group_id=g.playing_group_id)))))
$$;
revoke all on function club_batting_private.coaching_message_recipient(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function club_batting_private.coaching_message_needed(aid uuid) returns boolean
language sql stable set search_path='' as $$
 select coalesce((select a.status='open' and (a.follow_up_requested or a.is_player_request or a.preferred_user_id is not null or a.review_on is not null
  or exists(select 1 from public.player_match_coach_feedback f join public.player_match_reflections r on r.match_entry_id=f.match_entry_id and r.player_id=f.player_id
   where f.id=a.match_feedback_id and (f.batting_to_plan is distinct from r.batting_to_plan or f.dismissal_classification is distinct from r.dismissal_classification
    or f.dismissal_classification='outside_plan' or f.batting_to_plan='no')))
 from public.player_coaching_actions a where a.id=aid),false)
$$;
revoke all on function club_batting_private.coaching_message_needed(uuid) from public,anon,authenticated,service_role;

-- Store the exact conversation on a normal inbox message, with normal unread/read/delete behaviour.
alter table club_batting_private.club_messages add column if not exists coaching_action_id uuid references public.player_coaching_actions(id) on delete cascade;
create index if not exists club_messages_coaching_action_idx on club_batting_private.club_messages(coaching_action_id) where coaching_action_id is not null;
alter table club_batting_private.club_messages drop constraint club_messages_target_check;
alter table club_batting_private.club_messages add constraint club_messages_target_check check(target in ('','myplan','howwetrain','prepare','innings','make_your_call','workshop','teams','products','conversations'));

create or replace function club_batting_private.sync_coaching_message(aid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.player_coaching_actions%rowtype;mid uuid;person text;rec record;changed boolean;content text;message_title text;stamp text;actor uuid;
begin
 select * into a from public.player_coaching_actions where id=aid;
 if a.id is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(a.id::text,309));
 select id into mid from club_batting_private.club_messages where club_id=a.club_id and system_key='coaching-conversation:'||aid::text;
 if mid is null and not club_batting_private.coaching_message_needed(aid) then return;end if;
 select display_name into person from public.players where id=a.player_id and club_id=a.club_id and active;
 if person is null then return;end if;
 select reviewed_by into actor from public.player_coaching_action_reviews where action_id=aid order by revision desc,reviewed_at desc limit 1;
 actor:=coalesce(actor,a.recorded_by);
 message_title:=left(case when a.status='open' then 'Coach Conversation · ' when a.status='completed' then 'Discussed · ' else 'Closed · ' end||person,80);
 content:=left(case when a.status='open' then 'A conversation with '||person||' needs your attention.' else 'This conversation with '||person||' is '||case when a.status='completed' then 'marked discussed.' else 'closed.' end end,1500);
 -- Revision and source timestamp identify an update, without exposing the coaching note in alerts.
 stamp:=a.revision::text||':'||a.updated_at::text||':'||coalesce((select greatest(f.updated_at,r.updated_at)::text from public.player_match_coach_feedback f left join public.player_match_reflections r on r.match_entry_id=f.match_entry_id and r.player_id=f.player_id where f.id=a.match_feedback_id),'');
 if mid is null then
  if not exists(select 1 from public.club_memberships m where m.club_id=a.club_id and club_batting_private.coaching_message_recipient(aid,m.user_id)) then return;end if;
  insert into club_batting_private.club_messages(club_id,request_id,title,body,target,kind,auto_email_fallback,system_key,coaching_action_id,skipped)
   values(a.club_id,gen_random_uuid(),message_title,content,'conversations','general',false,'coaching-conversation:'||aid::text,aid,jsonb_build_object('conversation_version',stamp)) returning id into mid;
  changed:=false;
 else
  select skipped->>'conversation_version' is distinct from stamp into changed from club_batting_private.club_messages where id=mid;
  update club_batting_private.club_messages set title=message_title,body=content,skipped=jsonb_build_object('conversation_version',stamp) where id=mid;
 end if;
 for rec in select m.user_id from public.club_memberships m where m.club_id=a.club_id and club_batting_private.coaching_message_recipient(aid,m.user_id) loop
  insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy) values(mid,rec.user_id,true) on conflict do nothing;
  if changed and a.status='open' and actor is distinct from rec.user_id then
   update club_batting_private.club_message_recipients set opened_at=null where message_id=mid and user_id=rec.user_id and deleted_at is null;
  end if;
 end loop;
end $$;
revoke all on function club_batting_private.sync_coaching_message(uuid) from public,anon,authenticated,service_role;

create or replace function club_batting_private.coaching_message_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='player_coaching_action_reviews' then perform club_batting_private.sync_coaching_message(new.action_id);
 elsif tg_table_name='player_coaching_actions' then perform club_batting_private.sync_coaching_message(new.id);
 elsif tg_table_name='player_match_reflections' then
  perform club_batting_private.sync_coaching_message(a.id) from public.player_coaching_actions a join public.player_match_coach_feedback f on f.id=a.match_feedback_id where f.match_entry_id=new.match_entry_id and a.player_id=new.player_id;
 else
  perform club_batting_private.sync_coaching_message(a.id) from public.player_coaching_actions a where a.club_id=new.club_id and a.status='open';
 end if;
 return new;
end $$;
revoke all on function club_batting_private.coaching_message_changed() from public,anon,authenticated,service_role;
create constraint trigger coaching_message_action after insert or update on public.player_coaching_actions deferrable initially deferred for each row execute function club_batting_private.coaching_message_changed();
create constraint trigger coaching_message_review after insert on public.player_coaching_action_reviews deferrable initially deferred for each row execute function club_batting_private.coaching_message_changed();
create constraint trigger coaching_message_reflection after insert or update on public.player_match_reflections deferrable initially deferred for each row execute function club_batting_private.coaching_message_changed();
create constraint trigger coaching_message_assignment after insert or update on club_batting_private.coaching_duty_members deferrable initially deferred for each row execute function club_batting_private.coaching_message_changed();
CREATE OR REPLACE FUNCTION club_batting_private.coaching_staff_api(p_club_id uuid, p_action text DEFAULT 'get'::text, p_values jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); can_manage boolean; cfg club_batting_private.coaching_staff_settings%rowtype;
 roles jsonb; prior_routing jsonb; item jsonb; member_id uuid; role_id uuid; role_title text; ordinal integer:=0;
 request_id uuid; payload jsonb; duplicate_request boolean:=false;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id
  where m.club_id=p_club_id and m.user_id=me and c.archived_at is null) then raise exception 'Current club membership required';end if;
 can_manage:=public.is_club_admin(p_club_id);
 if p_action not in ('get','save') or p_action is null then raise exception 'Unknown coaching staff action';end if;
 if p_action='save' then
  if not can_manage then raise exception 'Club Admin access is required to set coaching duties';end if;
  if jsonb_typeof(p_values) is distinct from 'object' or jsonb_typeof(p_values->'roles') is distinct from 'array' then raise exception 'Choose coaching titles and people before saving';end if;
  roles:=p_values->'roles';request_id:=(p_values->>'request_id')::uuid;
  if request_id is null or p_values->>'expected_revision' is null then raise exception 'Reload coaching staff before saving';end if;
  if jsonb_array_length(roles)>50 then raise exception 'Use up to 50 coaching titles';end if;
  -- Serialize writers and membership changes while validating the complete replacement.
  perform 1 from public.clubs where id=p_club_id for update;
  insert into club_batting_private.coaching_staff_settings(club_id) values(p_club_id) on conflict do nothing;
  select * into cfg from club_batting_private.coaching_staff_settings where club_id=p_club_id for update;
  payload:=jsonb_build_object('roles',roles,'expected_revision',p_values->'expected_revision');
  if cfg.last_request_id=request_id and cfg.updated_by=me then
   if cfg.last_payload is distinct from payload then raise exception 'This save was already used for different coaching duties';end if;
   duplicate_request:=true;
  elsif cfg.revision<>(p_values->>'expected_revision')::integer then
   raise exception 'Coaching staff changed since you opened it. Load the latest setup before saving';
  end if;
  if not duplicate_request then
   -- Validate before deleting. Transaction rollback also protects the previous setup.
   for item in select value from jsonb_array_elements(roles) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'user_ids') is distinct from 'array' then raise exception 'Choose people for each coaching title';end if;
    role_id:=(item->>'id')::uuid;role_title:=btrim(item->>'title');
    if role_id is null or role_title is null or length(role_title) not between 2 and 60 or role_title ~ '[[:cntrl:]]' then raise exception 'Use a coaching title of 2–60 characters';end if;
    if jsonb_array_length(item->'user_ids')>500 then raise exception 'Choose up to 500 people for each title';end if;
    for member_id in select value::uuid from jsonb_array_elements_text(item->'user_ids') loop
     if member_id is null or not exists(select 1 from public.club_memberships m where m.club_id=p_club_id and m.user_id=member_id) then raise exception 'Choose current members of this club only';end if;
    end loop;
   end loop;
   if exists(select 1 from jsonb_array_elements(roles) r group by lower(btrim(r->>'title')) having count(*)>1) then raise exception 'Each coaching title must be different';end if;
   if exists(select 1 from jsonb_array_elements(roles) r group by (r->>'id')::uuid having count(*)>1) then raise exception 'A coaching title was included more than once';end if;
   select jsonb_object_agg(id::text,receives_batting_conversations) into prior_routing from club_batting_private.coaching_duties where club_id=p_club_id;
   delete from club_batting_private.coaching_duties where club_id=p_club_id;
   for item in select value from jsonb_array_elements(roles) loop
    role_id:=(item->>'id')::uuid;
    insert into club_batting_private.coaching_duties(club_id,id,title,sort_order,receives_batting_conversations) values(p_club_id,role_id,btrim(item->>'title'),ordinal,coalesce((item->>'receives_batting_conversations')::boolean,(prior_routing->>role_id::text)::boolean,lower(btrim(item->>'title'))='batting coach'));
    ordinal:=ordinal+1;
    insert into club_batting_private.coaching_duty_members select p_club_id,role_id,value::uuid from jsonb_array_elements_text(item->'user_ids') on conflict do nothing;
   end loop;
   update club_batting_private.coaching_staff_settings set revision=revision+1,updated_at=clock_timestamp(),updated_by=me,last_request_id=request_id,last_payload=payload where club_id=p_club_id;
  end if;
 end if;
 return jsonb_build_object('ok',true,'already_saved',duplicate_request,'can_manage',can_manage,
  'revision',coalesce((select revision from club_batting_private.coaching_staff_settings where club_id=p_club_id),0),
  'roles',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'receives_batting_conversations',d.receives_batting_conversations,'user_ids',coalesce((select jsonb_agg(a.user_id order by a.user_id) from club_batting_private.coaching_duty_members a where a.club_id=d.club_id and a.duty_id=d.id),'[]'::jsonb)) order by d.sort_order,d.id) from club_batting_private.coaching_duties d where d.club_id=p_club_id),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',coalesce(nullif(p.display_name,''),'Club member'),'permission_role',m.permission_role,'involvement',m.involvement) order by lower(p.display_name),m.user_id) from public.club_memberships m left join public.user_profiles p on p.user_id=m.user_id where m.club_id=p_club_id),'[]'::jsonb));
end $function$;

CREATE OR REPLACE FUNCTION club_batting_private.message_recipient_allowed(p_message uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from club_batting_private.club_message_recipients visible where visible.message_id=p_message and visible.user_id=p_user and visible.deleted_at is null) and case when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.coaching_action_id is not null) then exists(select 1 from club_batting_private.club_messages m where m.id=p_message and club_batting_private.coaching_message_recipient(m.coaching_action_id,p_user)) when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'selection-plan:%') then club_batting_private.selection_plan_message_allowed(p_message,p_user) when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'social-milestone:%') then club_selection_private.social_milestone_message_allowed(p_message,p_user) when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and (m.system_key like 'availability-reminder:%' or m.system_key like 'withdrawal-plan:%')) then club_selection_private.week_message_allowed(p_message,p_user) when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'socials-attention:%') then exists(
 select 1 from club_selection_private.social_attention a where a.message_id=p_message and a.resolved_at is null
 and club_selection_private.social_preparer_allowed(a.club_id,p_user))
 when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'socials-cover:%') then exists(
 select 1 from club_selection_private.social_posting_delegations d join club_selection_private.access a on a.club_id=d.club_id
 where d.message_id=p_message and d.delegate_id=p_user and (now() at time zone a.timezone)::date<=d.ends_on
 and club_selection_private.member(d.club_id,p_user) and club_selection_private.social_permanent_allowed(d.club_id,d.delegated_by))
 when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'socials-manager:%') then exists(
 select 1 from club_batting_private.club_messages m where m.id=p_message and club_selection_private.social_permanent_allowed(m.club_id,p_user))
 when exists(select 1 from club_selection_private.notifications n where n.message_id=p_message)
 then exists(select 1 from club_selection_private.notifications n join club_batting_private.club_messages m on m.id=n.message_id
 join club_batting_private.club_message_recipients r on r.message_id=m.id and r.user_id=p_user
 where n.message_id=p_message and club_selection_private.enabled(m.club_id) and club_selection_private.member(m.club_id,p_user)
 and (n.kind='republication' and exists(
  select 1 from club_selection_private.republication_alerts ra
  join club_selection_private.fixtures fx on fx.id=ra.fixture_id
  join club_selection_private.access ac on ac.club_id=fx.club_id
  where ra.message_id=p_message and ra.publisher_id=p_user
   and club_selection_private.publication_head(m.club_id)=p_user
   and club_selection_private.needs_republication(fx)
   and (not club_selection_private.fixture_completed(fx.details,ac.timezone)
     or fx.selection_unlocked_until>now())) or n.kind='publication' or (n.kind='availability' and (club_selection_private.selector(m.club_id,p_user) or exists(select 1 from public.club_memberships cm where cm.club_id=m.club_id and cm.user_id=p_user and cm.permission_role='admin'))) or (n.kind='post' and club_selection_private.audience(n.fixture_id,p_user)) or (n.kind='review' and club_selection_private.review_audience(n.fixture_id,p_user))))
 else club_batting_private.message_recipient_allowed_before_selections(p_message,p_user) end
$function$;

CREATE OR REPLACE FUNCTION club_batting_private.club_messages_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); staff boolean; msg club_batting_private.club_messages%rowtype;
 ids uuid[]; staff_ids uuid[]; email_ids uuid[]; eligible_ids uuid[]; kind text:=coalesce(p_data->>'kind','general'); due jsonb; pid uuid; skipped_complete integer:=0; skipped_cooldown integer:=0; recipient_count integer; rid uuid; rec record; v_email_id uuid; result jsonb; title text; body text; target text; email boolean;
begin
 if not club_batting_private.message_member(p_club_id) then raise exception 'Club membership required'; end if;
 staff:=club_batting_private.message_staff(p_club_id);
 if p_action='context' then
  return jsonb_build_object('can_send',staff,'can_remind',public.is_club_admin(p_club_id),'email_mode',(select email_mode from public.platform_settings where singleton),'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'user_id',p.user_id,'name',p.display_name,'phone_ready',club_batting_private.message_phone_ready(p_club_id,p.user_id),'overdue_plan_sections',club_batting_private.plan_reminder_due(p_club_id,p.id),'next_reminder_at',club_batting_private.plan_reminder_next(p_club_id,p.id),
   'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.sort_order,g.name)
    from public.player_playing_groups pg join public.playing_groups g on g.id=pg.playing_group_id
    where pg.player_id=p.id and pg.club_id=p_club_id and g.club_id=p_club_id and g.active),'[]'::jsonb)) order by p.display_name)
   from public.players p where p.club_id=p_club_id and club_batting_private.message_player_allowed(p_club_id,p.id)),'[]'::jsonb),
   'staff',case when staff then coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',cm.user_id,'name',coalesce(nullif(up.display_name,''),'Club staff'),
    'phone_ready',club_batting_private.message_phone_ready(p_club_id,cm.user_id),'role',cm.permission_role,'default_included',cm.permission_role in ('admin','head_coach','coach','captain'))
    order by coalesce(up.display_name,''),cm.user_id)
    from public.club_memberships cm left join public.user_profiles up on up.user_id=cm.user_id
    where cm.club_id=p_club_id and cm.user_id<>me
     and club_batting_private.message_staff_recipient(p_club_id,cm.user_id)),'[]'::jsonb) else '[]'::jsonb end);
 elsif p_action='badge' then
  return jsonb_build_object('unread',(select count(*) from club_batting_private.club_message_recipients r join club_batting_private.club_messages m on m.id=r.message_id where m.club_id=p_club_id and r.user_id=me and club_batting_private.message_recipient_allowed(m.id,me) and r.opened_at is null));
 elsif p_action='list' then
  return jsonb_build_object('can_send',staff,'inbox',coalesce((select jsonb_agg(q.entry order by q.created_at desc) from (
   select m.created_at,jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'target',m.target,'created_at',m.created_at,'coaching_action_id',m.coaching_action_id,'coaching_player_id',(select a.player_id from public.player_coaching_actions a where a.id=m.coaching_action_id),
    'sender',case when m.system_key is not null then 'Club Batting' else coalesce(nullif(up.display_name,''),'Club staff') end,'opened_at',r.opened_at) entry
   from club_batting_private.club_messages m join club_batting_private.club_message_recipients r on r.message_id=m.id
   left join public.user_profiles up on up.user_id=m.sender_id where m.club_id=p_club_id and r.user_id=me and club_batting_private.message_recipient_allowed(m.id,me)
   order by m.created_at desc limit 100) q),'[]'::jsonb),
   'unread',(select count(*) from club_batting_private.club_message_recipients r join club_batting_private.club_messages m on m.id=r.message_id where m.club_id=p_club_id and r.user_id=me and club_batting_private.message_recipient_allowed(m.id,me) and r.opened_at is null),
   'sent',case when staff then coalesce((select jsonb_agg(q.entry order by q.created_at desc) from (
    select m.created_at,jsonb_build_object('id',m.id,'title',m.title,'body',m.body,'target',m.target,'created_at',m.created_at,'coaching_action_id',m.coaching_action_id,'coaching_player_id',(select a.player_id from public.player_coaching_actions a where a.id=m.coaching_action_id),
     'recipients',(select count(*) from club_batting_private.club_message_recipients r where r.message_id=m.id),
     'opened',(select count(*) from club_batting_private.club_message_recipients r where r.message_id=m.id and r.opened_at is not null),
     'email_requested',m.email_requested,'email_total',(select count(*) from club_batting_private.club_message_recipients r where r.message_id=m.id and r.email_id is not null),
     'email_sent',(select count(*) from club_batting_private.club_message_recipients r join public.outbound_messages o on o.id=r.email_id where r.message_id=m.id and o.sent_at is not null),
     'email_failed',(select count(*) from club_batting_private.club_message_recipients r join public.outbound_messages o on o.id=r.email_id where r.message_id=m.id and (o.failed_at is not null or o.cancelled_at is not null)),
     'push_sent',(select count(distinct s.user_id) from club_batting_private.phone_deliveries d join club_batting_private.phone_subscriptions s on s.id=d.subscription_id where d.kind='message' and d.source_key=m.id::text and d.status='sent')) entry
    from club_batting_private.club_messages m where m.club_id=p_club_id and m.sender_id=me and m.sender_deleted_at is null order by m.created_at desc limit 100)q),'[]'::jsonb) else '[]'::jsonb end);
 elsif p_action='delete' then
  if coalesce(p_data->>'box','inbox') not in ('inbox','sent') then raise exception 'Choose Inbox or Sent';end if;
  if jsonb_typeof(p_data->'ids') is distinct from 'array' then raise exception 'Choose messages to delete';end if;
  if jsonb_array_length(p_data->'ids') not between 1 and 100 then raise exception 'Choose between 1 and 100 messages';end if;
  select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_data->'ids');
  if exists(select 1 from unnest(ids) chosen(id) where chosen.id is null or not exists(
   select 1 from club_batting_private.club_messages m where m.id=chosen.id and m.club_id=p_club_id
   and case when coalesce(p_data->>'box','inbox')='sent' then m.sender_id=me else
    exists(select 1 from club_batting_private.club_message_recipients r where r.message_id=m.id and r.user_id=me) end))
   then raise exception 'One or more messages are unavailable in this account';end if;
  if coalesce(p_data->>'box','inbox')='sent' then
   update club_batting_private.club_messages set sender_deleted_at=coalesce(sender_deleted_at,now()) where id=any(ids) and club_id=p_club_id and sender_id=me;
  else
   update club_batting_private.club_message_recipients r set deleted_at=coalesce(r.deleted_at,now())
   from club_batting_private.club_messages m where m.id=r.message_id and m.club_id=p_club_id and r.user_id=me and m.id=any(ids);
  end if;
  return jsonb_build_object('deleted',true,'ids',ids,'box',coalesce(p_data->>'box','inbox'));
 elsif p_action='open' then
  update club_batting_private.club_message_recipients r set opened_at=coalesce(opened_at,now())
  from club_batting_private.club_messages m where r.message_id=m.id and m.club_id=p_club_id and r.user_id=me and m.id=(p_data->>'id')::uuid and club_batting_private.message_recipient_allowed(m.id,me);
  if not found then raise exception 'Message unavailable'; end if;
  return jsonb_build_object('opened',true);
 elsif p_action='send' then
  if not staff then raise exception 'Staff messaging permission required'; end if;
  if kind not in ('general','plan_reminder') then raise exception 'Unknown message kind'; end if;
  if kind='plan_reminder' and not public.is_club_admin(p_club_id) then raise exception 'Club Admin access required'; end if;
  if jsonb_typeof(coalesce(p_data->'email_user_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_data->'email_user_ids','[]'::jsonb))>300 then raise exception 'Choose email recipients from the list'; end if;
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into email_ids from jsonb_array_elements_text(coalesce(p_data->'email_user_ids','[]'::jsonb));
  if jsonb_typeof(coalesce(p_data->'player_ids','[]'::jsonb))<>'array'
   or jsonb_typeof(coalesce(p_data->'staff_user_ids','[]'::jsonb))<>'array' then raise exception 'Choose recipients from the list'; end if;
  if jsonb_array_length(coalesce(p_data->'player_ids','[]'::jsonb))>300
   or jsonb_array_length(coalesce(p_data->'staff_user_ids','[]'::jsonb))>300 then raise exception 'Choose up to 300 people'; end if;
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into ids
   from jsonb_array_elements_text(coalesce(p_data->'player_ids','[]'::jsonb));
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into staff_ids
   from jsonb_array_elements_text(coalesce(p_data->'staff_user_ids','[]'::jsonb));
  if kind='plan_reminder' then
   if cardinality(staff_ids)>0 or coalesce(p_data->>'target','')<>'myplan' then raise exception 'Player Plan reminders are for selected players and link to My Player Plan'; end if;
   -- One lock per club serializes overlapping bulk/single reminder sends.
   perform pg_advisory_xact_lock(hashtextextended(p_club_id::text||':plan-reminders',90));
  end if;
  rid:=(p_data->>'request_id')::uuid;
  if rid is null then raise exception 'Send request is missing'; end if;
  -- Serialize double taps/retries before checking the idempotency key.
  perform pg_advisory_xact_lock(hashtextextended(p_club_id::text||me::text||rid::text,77));
  select * into msg from club_batting_private.club_messages where club_id=p_club_id and sender_id=me and request_id=rid;
  if found then
   if msg.kind is distinct from kind or msg.requested_email_user_ids is distinct from email_ids or msg.title is distinct from btrim(p_data->>'title') or msg.body is distinct from btrim(p_data->>'body')
    or msg.target is distinct from coalesce(p_data->>'target','') or msg.email_requested is distinct from coalesce((p_data->>'email')::boolean,false)
    or ids is distinct from coalesce(msg.requested_player_ids,
       (select array_agg(distinct r.player_id order by r.player_id) from club_batting_private.club_message_recipients r where r.message_id=msg.id and r.player_id is not null),'{}'::uuid[])
    or staff_ids is distinct from coalesce(msg.requested_staff_user_ids,'{}'::uuid[]) then
    raise exception 'The earlier message was already sent. Open Sent to check it, then start a new message';
   end if;
   return club_batting_private.message_send_result(msg.id,true);
  end if;
  if cardinality(ids)+cardinality(staff_ids)=0 then raise exception 'Choose at least one person'; end if;
  if exists(select 1 from unnest(staff_ids) id where id is null or not club_batting_private.message_staff_recipient(p_club_id,id)) then raise exception 'Staff membership changed. Choose your recipients again'; end if;
  if exists(select 1 from unnest(ids) id where id is null or not club_batting_private.message_player_allowed(p_club_id,id)) then raise exception 'Player access changed. Choose your recipients again'; end if;
  if exists(select 1 from unnest(email_ids) e(user_id) where e.user_id is null or not (e.user_id=any(staff_ids) or exists(select 1 from public.players p where p.id=any(ids) and p.user_id=e.user_id))) then raise exception 'Email recipients must be selected message recipients'; end if;
  eligible_ids:=ids;
  if kind='plan_reminder' then
   eligible_ids:='{}';
   foreach pid in array ids loop
    due:=club_batting_private.plan_reminder_due(p_club_id,pid);
    if jsonb_array_length(due)=0 then skipped_complete:=skipped_complete+1;
    elsif club_batting_private.plan_reminder_next(p_club_id,pid)>now() then skipped_cooldown:=skipped_cooldown+1;
    else eligible_ids:=array_append(eligible_ids,pid);end if;
   end loop;
   if cardinality(eligible_ids)=0 then raise exception 'No reminders sent: the selected players are no longer overdue or were reminded within 48 hours. Refresh the player list.'; end if;
  end if;
  select count(*) into recipient_count from (select p.user_id from public.players p where p.id=any(ids) union select unnest(staff_ids)) chosen;
  if recipient_count not between 1 and 300 then raise exception 'Choose between 1 and 300 people'; end if;
  title:=btrim(coalesce(p_data->>'title','')); body:=btrim(coalesce(p_data->>'body','')); target:=coalesce(p_data->>'target',''); email:=coalesce((p_data->>'email')::boolean,false);
  if length(title) not between 1 and 80 or length(body) not between 1 and 1500 then raise exception 'Add a short title and message (up to 1,500 characters)'; end if;
  if target not in ('','myplan','howwetrain','prepare','innings','make_your_call') then raise exception 'Choose an available app link'; end if;
  if (select count(*) from club_batting_private.club_messages where sender_id=me and created_at>now()-interval '1 hour')>=20 then raise exception 'Message limit reached. Try again later'; end if;
  insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,email_requested,requested_player_ids,requested_staff_user_ids,kind,requested_email_user_ids,auto_email_fallback,skipped)
   values(p_club_id,me,rid,title,body,target,email,ids,staff_ids,kind,email_ids,true,jsonb_build_object('no_longer_overdue',skipped_complete,'cooldown',skipped_cooldown)) returning * into msg;
  for rec in select chosen.user_id,u.email,
   (select p.id from public.players p where p.id=any(eligible_ids) and p.user_id=chosen.user_id order by p.id limit 1) player_id,
   chosen.user_id=any(staff_ids) staff_copy
   from (select p.user_id from public.players p where p.id=any(eligible_ids) union select unnest(staff_ids)) chosen
   join auth.users u on u.id=chosen.user_id order by chosen.user_id loop
   insert into club_batting_private.club_message_recipients(message_id,user_id,player_id,staff_copy)
    values(msg.id,rec.user_id,rec.player_id,rec.staff_copy);
   if kind='plan_reminder' then update club_batting_private.club_message_recipients
    set plan_sections=club_batting_private.plan_reminder_due(p_club_id,rec.player_id) where message_id=msg.id and user_id=rec.user_id; end if;
   if email or rec.user_id=any(email_ids) then
    perform club_batting_private.queue_message_email(msg.id,rec.user_id,'requested');
   elsif not club_batting_private.message_phone_ready(p_club_id,rec.user_id,msg.created_at) then
    perform club_batting_private.queue_message_email(msg.id,rec.user_id,'fallback');
   end if;
  end loop;
  return club_batting_private.message_send_result(msg.id,false);
 end if;
 raise exception 'Unknown message action';
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_coach_conversations(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('actions',coalesce(jsonb_agg(public.coaching_conversation_json(a.id) order by (a.status='open') desc,a.review_on nulls last,a.updated_at desc),'[]'::jsonb))
  from public.player_coaching_actions a join public.players p on p.id=a.player_id
  where a.club_id=p_club_id and public.can_read_coaching_conversation(a.id)
    and (club_batting_private.coaching_message_recipient(a.id,auth.uid()) or p.user_id=auth.uid() or (a.is_player_request and (a.preferred_user_id=auth.uid() or public.can_edit_player(p.id))))
$function$;

CREATE OR REPLACE FUNCTION public.coaching_conversation_json(p_action_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select public.coaching_conversation_json_before_weekly_loop(a.id)||jsonb_build_object(
  'is_responsible_coach',club_batting_private.coaching_message_recipient(a.id,auth.uid()),
  'can_access_focus',public.can_read_coaching_action_player(a.player_id),
  'focus_review_ready',public.can_read_focus_context(a.player_id,'conversation',a.id) and not exists(select 1 from public.player_match_coach_feedback f where f.id=a.match_feedback_id and f.plan_related and not exists(select 1 from public.player_match_reflections r where r.match_entry_id=f.match_entry_id and r.player_id=a.player_id)))
 from public.player_coaching_actions a where a.id=p_action_id and public.can_read_coaching_conversation(a.id)
$function$;


CREATE OR REPLACE FUNCTION public.my_coaching_update_sources_before_weekly_loop(p_club_id uuid)
 RETURNS TABLE(source_key text, player_id uuid, source_kind text, source_id uuid, match_id uuid, changed_at timestamp with time zone, author_name text, can_open boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select * from public.my_coaching_update_sources_before_requests(p_club_id)
  union all
  select 'conversation:'||a.id::text,a.player_id,'conversation',a.id,null::uuid,a.updated_at,
    coalesce(nullif(up.display_name,''),'Club member'),true
  from public.player_coaching_actions a join public.players p on p.id=a.player_id
  left join lateral(select reviewed_by from public.player_coaching_action_reviews r where r.action_id=a.id order by revision desc,reviewed_at desc limit 1) last_review on true
  left join public.user_profiles up on up.user_id=coalesce(last_review.reviewed_by,a.recorded_by)
  where a.club_id=p_club_id and a.is_player_request and a.status='open'
    and public.can_read_coaching_conversation(a.id)
    and (p.user_id=auth.uid() or club_batting_private.coaching_message_recipient(a.id,auth.uid()))
    and coalesce(last_review.reviewed_by,a.recorded_by)<>auth.uid()
$function$;

-- Pick up still-open assigned work once. Closed discussions are not reopened or replayed.
do $$begin
 perform club_batting_private.sync_coaching_message(a.id) from public.player_coaching_actions a
 where a.status='open' and club_batting_private.coaching_message_needed(a.id);
end $$;
