-- Club-week workflows; private storage and existing selection authority are retained.
create table club_selection_private.week_settings (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 reminders_enabled boolean not null default false,
 deadline_weekday integer not null default 4 check(deadline_weekday between 1 and 7),
 deadline_time time not null default '18:00',
 acknowledgement_enabled boolean not null default false,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table club_selection_private.availability_reminders (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 deadline timestamptz not null, stage integer not null check(stage in (1,2)),
 dates jsonb not null, message_id uuid references club_batting_private.club_messages(id) on delete set null,
 cancelled_at timestamptz, unique(club_id,user_id,deadline,stage)
);
create table club_selection_private.team_acknowledgements (
 fixture_id uuid not null references club_selection_private.fixtures(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, publication integer not null,
 seen_at timestamptz not null default now(), primary key(fixture_id,user_id,publication)
);
create table club_selection_private.withdrawal_plans (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 fixtures jsonb not null, withdrawn jsonb not null, state text not null default 'proposed' check(state in ('proposed','applied','dismissed')),
 applied_by uuid references auth.users(id), applied_at timestamptz, revision integer not null default 1
);
create index withdrawal_plans_club_state on club_selection_private.withdrawal_plans(club_id,state,created_at);
create table club_selection_private.calendar_subscriptions (
 club_id uuid not null references public.clubs(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 token_hash bytea not null unique, created_at timestamptz not null default now(), primary key(club_id,user_id)
);
create table club_selection_private.calendar_events (
 club_id uuid not null references public.clubs(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
 fixture_id uuid not null references club_selection_private.fixtures(id) on delete cascade, day_number integer not null check(day_number in(1,2)),
 event jsonb not null, sequence integer not null, updated_at timestamptz not null default now(),
 primary key(club_id,user_id,fixture_id,day_number)
);
do $secure$
declare t text;
begin
 foreach t in array array['week_settings','availability_reminders','team_acknowledgements','withdrawal_plans','calendar_subscriptions','calendar_events'] loop
  execute format('alter table club_selection_private.%I enable row level security',t);
  execute format('revoke all on club_selection_private.%I from public,anon,authenticated',t);
 end loop;
end $secure$;

create function club_selection_private.week_message(c uuid,users uuid[],title_text text,body_text text,message_key text)
returns uuid language plpgsql set search_path='' as $f$
declare mid uuid;
begin
 if cardinality(users)=0 then return null;end if;
 select id into mid from club_batting_private.club_messages where club_id=c and system_key=message_key;
 if found then return mid;end if;
 insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
 values(c,null,gen_random_uuid(),title_text,left(body_text,1500),'teams',true,message_key) returning id into mid;
 insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy)
 select mid,u,false from unnest(users) u where club_selection_private.member(c,u) on conflict do nothing;
 return mid;
end $f$;

create function club_selection_private.week_missing_dates(c uuid,u uuid,dates jsonb)
returns jsonb language sql stable set search_path='' as $f$
 select coalesce(jsonb_agg(d order by d),'[]') from (
  select distinct d from jsonb_array_elements_text(dates) d
  where exists(select 1 from club_selection_private.roster r left join club_selection_private.availability a on a.roster_id=r.id
   where r.club_id=c and r.user_id=u and r.active and not coalesce(a.available_dates,'[]') ? d and not coalesce(a.unavailable_dates,'[]') ? d)
 ) q
$f$;

create function club_selection_private.week_deadline(first_day date,weekday integer,at_time time,tz text)
returns timestamptz language sql stable set search_path='' as $f$
 select ((first_day-((extract(isodow from first_day)::integer-weekday+7)%7))+at_time) at time zone tz
$f$;

create function club_selection_private.cancel_answered_availability_reminders()
returns trigger language plpgsql security definer set search_path='' as $f$
declare c uuid;u uuid;r record;
begin
 select club_id,user_id into c,u from club_selection_private.roster where id=new.roster_id;
 if u is null then return new;end if;
 for r in select * from club_selection_private.availability_reminders where club_id=c and user_id=u and cancelled_at is null
  and club_selection_private.week_missing_dates(c,u,dates)='[]'::jsonb loop
  update club_selection_private.availability_reminders set cancelled_at=now() where id=r.id;
  -- Remove an obsolete reminder, without pretending the player opened it.
  update club_batting_private.club_message_recipients set deleted_at=now() where message_id=r.message_id and user_id=u;
  update public.outbound_messages o set cancelled_at=now(),status='cancelled'
   from club_batting_private.club_message_recipients mr where mr.message_id=r.message_id and mr.user_id=u and o.id=mr.email_id and o.sent_at is null;
  update club_batting_private.phone_deliveries d set status='cancelled',finished_at=now(),error_code='answered'
   from club_batting_private.phone_subscriptions s where d.subscription_id=s.id and s.user_id=u
    and d.kind='message' and d.source_key=r.message_id::text and d.status in('queued','sending');
 end loop;
 return new;
end $f$;
create trigger cancel_answered_availability_reminders after insert or update of available_dates,unavailable_dates on club_selection_private.availability
 for each row execute function club_selection_private.cancel_answered_availability_reminders();

create function club_selection_private.run_availability_reminders(at_time timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $f$
declare item record;person record;due_stage integer;missing jsonb;reminder uuid;mid uuid;n integer:=0;
begin
 if not pg_try_advisory_xact_lock(9200221) then return 0;end if;
 for item in
  with fixtures as (
   select f.club_id,a.timezone,club_selection_private.week_deadline((f.details->'days'->0->>'date')::date,s.deadline_weekday,s.deadline_time,a.timezone) deadline,
    f.details->'days' days
   from club_selection_private.fixtures f join club_selection_private.access a on a.club_id=f.club_id
   join club_selection_private.week_settings s on s.club_id=f.club_id
   where s.reminders_enabled and club_selection_private.enabled(f.club_id) and f.published is null
    and not coalesce((f.details->>'cancelled')::boolean,false)
    and (f.details->'days'->0->>'date')::date between (at_time at time zone a.timezone)::date and (at_time at time zone a.timezone)::date+8
  ) select club_id,timezone,deadline,jsonb_agg(distinct day->>'date') dates from fixtures,jsonb_array_elements(days) day
   where (day->>'date')::date>=(at_time at time zone timezone)::date group by club_id,timezone,deadline
 loop
  -- One reminder in the preceding 24 hours, and one at the deadline. Never catch up stale reminders.
  due_stage:=case when at_time>=item.deadline and at_time<item.deadline+interval '2 hours' then 2
   when at_time>=item.deadline-interval '24 hours' and at_time<item.deadline then 1 else null end;
  if due_stage is null then continue;end if;
  for person in select distinct r.user_id from club_selection_private.roster r where r.club_id=item.club_id and r.active
   and r.user_id is not null and club_selection_private.member(item.club_id,r.user_id) loop
   missing:=club_selection_private.week_missing_dates(item.club_id,person.user_id,item.dates);
   if missing='[]'::jsonb then continue;end if;
   insert into club_selection_private.availability_reminders(club_id,user_id,deadline,stage,dates)
    values(item.club_id,person.user_id,item.deadline,due_stage,missing)
    on conflict(club_id,user_id,deadline,stage) do nothing returning id into reminder;
   if reminder is null then continue;end if;
   mid:=club_selection_private.week_message(item.club_id,array[person.user_id],'Please set your availability',
    'Please mark available or unavailable for '||(select string_agg(to_char(d::date,'DD Mon'),', ' order by d) from jsonb_array_elements_text(missing) d)
    ||'. Selection deadline: '||to_char(item.deadline at time zone item.timezone,'Dy DD Mon, HH24:MI')||' ('||item.timezone||').'
    ||E'\nhttps://clubbatting.com/app.html?club='||item.club_id::text||'&tab=teams&team_view=availability&team_date='||(missing->>0),
    'availability-reminder:'||reminder);
   update club_selection_private.availability_reminders set message_id=mid where id=reminder;n:=n+1;
  end loop;
 end loop;
 return n;
end $f$;

create function club_selection_private.refresh_calendar_events(fid uuid)
returns void language plpgsql set search_path='' as $f$
declare f club_selection_private.fixtures%rowtype;tz text;item record;event_data jsonb;
begin
 select * into f from club_selection_private.fixtures where id=fid;
 if f.published is null then return;end if;
 select timezone into tz from club_selection_private.access where club_id=f.club_id;
 update club_selection_private.calendar_events set event=jsonb_set(event,'{status}','"CANCELLED"'),sequence=f.publication,updated_at=coalesce(f.published_at,now())
  where fixture_id=fid and event->>'status'<>'CANCELLED';
 if coalesce((f.published->'details'->>'cancelled')::boolean,false) then return;end if;
 for item in select distinct r.user_id,day.n::integer day_number,day.value play_day
  from jsonb_array_elements(f.published->'details'->'days') with ordinality day(value,n)
  cross join jsonb_array_elements(f.published->'slots') slot
  join club_selection_private.roster r on r.id::text=slot->>('d'||day.n) and r.club_id=f.club_id
  where r.user_id is not null and r.active and club_selection_private.member(f.club_id,r.user_id)
 loop
  event_data:=jsonb_build_object('date',item.play_day->>'date','status','CONFIRMED',
   'start',case when nullif(item.play_day->>'start','') is not null then to_char(((item.play_day->>'date')::date+(item.play_day->>'start')::time) at time zone tz at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"') end,
   'end',case when nullif(item.play_day->>'end','') is not null and nullif(item.play_day->>'start','') is not null and (item.play_day->>'end')::time>(item.play_day->>'start')::time then to_char(((item.play_day->>'date')::date+(item.play_day->>'end')::time) at time zone tz at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"') end,
   'title',coalesce(f.published->'details'->>'grade','Cricket')||' v '||coalesce(f.published->'details'->>'opposition','Opposition')
    ||case when jsonb_array_length(f.published->'details'->'days')>1 then ' · Day '||item.day_number else '' end,
   'ground',coalesce(f.published->'details'->>'ground',''),'instructions',coalesce(f.published->'details'->>'meeting',''),
   'url','https://clubbatting.com/app.html?club='||f.club_id||'&tab=teams&team_view=published&fixture='||f.id);
  insert into club_selection_private.calendar_events(club_id,user_id,fixture_id,day_number,event,sequence,updated_at)
   values(f.club_id,item.user_id,f.id,item.day_number,event_data,f.publication,coalesce(f.published_at,now()))
   on conflict(club_id,user_id,fixture_id,day_number) do update set event=excluded.event,sequence=excluded.sequence,updated_at=excluded.updated_at;
 end loop;
end $f$;
create function club_selection_private.calendar_publication_changed()
returns trigger language plpgsql security definer set search_path='' as $f$
begin perform club_selection_private.refresh_calendar_events(new.id);return new;end $f$;
create trigger calendar_publication_changed after insert or update of published,publication on club_selection_private.fixtures
 for each row execute function club_selection_private.calendar_publication_changed();

create function club_selection_private.calendar_feed(token text)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare s club_selection_private.calendar_subscriptions%rowtype;
begin
 if token !~ '^[0-9a-f]{64}$' then return null;end if;
 select * into s from club_selection_private.calendar_subscriptions where token_hash=extensions.digest(token,'sha256');
 if not found or not club_selection_private.member(s.club_id,s.user_id) or not club_selection_private.enabled(s.club_id) then return null;end if;
 return jsonb_build_object('name',(select name from public.clubs where id=s.club_id)||' · My matches',
  'events',coalesce((select jsonb_agg(jsonb_build_object('uid',fixture_id||'-d'||day_number||'-'||s.user_id||'@clubbatting.com',
   'event',event,'sequence',sequence,'updated_at',updated_at) order by event->>'date',fixture_id,day_number)
   from club_selection_private.calendar_events e where e.club_id=s.club_id and e.user_id=s.user_id
    and (event->>'date')::date>=current_date-90),'[]'));
end $f$;
create function public.selection_calendar_feed(p_token text)
returns jsonb language sql set search_path='' as $f$ select club_selection_private.calendar_feed(p_token) $f$;
revoke all on function public.selection_calendar_feed(text) from public,anon,authenticated;
grant execute on function public.selection_calendar_feed(text) to service_role;
revoke all on function club_selection_private.calendar_feed(text) from public,anon,authenticated;
grant execute on function club_selection_private.calendar_feed(text) to service_role;

create function club_selection_private.week_context(c uuid,u uuid)
returns jsonb language plpgsql set search_path='' as $f$
declare settings jsonb;sel boolean:=club_selection_private.selector(c,u);adm boolean;
begin
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role='admin');
 select to_jsonb(s)-'club_id' into settings from club_selection_private.week_settings s where club_id=c;
 return jsonb_build_object('settings',coalesce(settings,jsonb_build_object('reminders_enabled',false,'deadline_weekday',4,'deadline_time','18:00','acknowledgement_enabled',false,'revision',0)),
  'can_manage',adm or club_selection_private.publication_head(c)=u,
  'calendar_active',exists(select 1 from club_selection_private.calendar_subscriptions where club_id=c and user_id=u),
  'plans',case when sel then coalesce((select jsonb_agg(to_jsonb(p) order by created_at desc) from club_selection_private.withdrawal_plans p
   where p.club_id=c and p.state='proposed' and p.created_at>now()-interval '30 days'),'[]') else '[]'::jsonb end,
  'acknowledgements',coalesce((select jsonb_agg(jsonb_build_object('fixture_id',f.id,'roster_id',r.id,'publication',f.publication,'seen_at',a.seen_at,'linked',r.user_id is not null))
   from club_selection_private.fixtures f cross join jsonb_array_elements(coalesce(f.published->'players','[]')) p
   join club_selection_private.roster r on r.id::text=p->>'id' and r.club_id=c
   left join club_selection_private.team_acknowledgements a on a.fixture_id=f.id and a.user_id=r.user_id and a.publication=f.publication
   where f.club_id=c and f.published is not null and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
    and (r.user_id=u or club_selection_private.review_audience(f.id,u))),'[]'));
end $f$;

create function club_selection_private.validate_withdrawal_plan(c uuid,fixtures jsonb,withdrawn jsonb)
returns void language plpgsql set search_path='' as $f$
declare x jsonb;y jsonb;m club_selection_private.fixtures%rowtype;pid text;dates jsonb;ids uuid[]:='{}';
begin
 if jsonb_typeof(fixtures) is distinct from 'array' or jsonb_array_length(fixtures) not between 1 and 30 then raise exception 'Choose 1 to 30 affected teams';end if;
 for x in select * from jsonb_array_elements(fixtures) loop
  select * into m from club_selection_private.fixtures where id=(x->>'id')::uuid and club_id=c;
  if not found then raise exception 'Choose teams from this club';end if;
  if m.id=any(ids) then raise exception 'Duplicate team in the proposal';end if;ids:=array_append(ids,m.id);
  if coalesce((m.details->>'cancelled')::boolean,false) or club_selection_private.fixture_completed(m.details,(select timezone from club_selection_private.access where club_id=c)) then raise exception 'Choose an upcoming, active fixture';end if;
  if m.revision<>coalesce((x->>'revision')::integer,-1) then raise exception 'A team changed. Reopen the proposal and review the current teams';end if;
  -- Proposals can change selections and appointments, never silently rewrite match facts.
  if ((x->'details')-'match_roles'-'captain_id') is distinct from (m.details-'match_roles'-'captain_id') then raise exception 'Fixture details changed. Review the current teams';end if;
  if jsonb_typeof(x->'slots') is distinct from 'array' or jsonb_array_length(x->'slots') not between 11 and 100 then raise exception 'Invalid team places';end if;
  for y in select * from jsonb_array_elements(x->'slots') loop
   for pid in select unnest(array[nullif(y->>'d1',''),nullif(y->>'d2','')]) loop
    if pid is not null and not exists(select 1 from club_selection_private.roster where id=pid::uuid and club_id=c and active) then raise exception 'Choose active players from this club';end if;
   end loop;
  end loop;
 end loop;
 if jsonb_typeof(withdrawn) is distinct from 'array' or jsonb_array_length(withdrawn) not between 1 and 10 then raise exception 'Choose the withdrawing players';end if;
 for x in select * from jsonb_array_elements(withdrawn) loop
  pid:=x->>'roster_id';dates:=x->'dates';
  if not exists(select 1 from club_selection_private.roster where id=pid::uuid and club_id=c and active) then raise exception 'Choose the withdrawing player from this club';end if;
  if jsonb_typeof(dates) is distinct from 'array' or jsonb_array_length(dates) not between 1 and 2 then raise exception 'Choose the withdrawal dates';end if;
  for y in select * from jsonb_array_elements(dates) loop
   if not exists(select 1 from club_selection_private.fixtures f,jsonb_array_elements(f.details->'days') with ordinality d(day,n),jsonb_array_elements(f.slots) s
    where f.club_id=c and f.id=any(ids) and d.day->>'date'=y#>>'{}' and s->>('d'||d.n)=pid) then raise exception 'The withdrawing player is no longer selected on that date';end if;
   if exists(select 1 from jsonb_array_elements(fixtures) f,jsonb_array_elements(f->'details'->'days') with ordinality d(day,n),jsonb_array_elements(f->'slots') s
    where d.day->>'date'=y#>>'{}' and s->>('d'||d.n)=pid) then raise exception 'Remove the withdrawing player from the affected date';end if;
  end loop;
 end loop;
end $f$;

create function club_selection_private.week_api(c uuid,action text,d jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $f$
declare me uuid:=auth.uid();sel boolean;adm boolean;settings club_selection_private.week_settings%rowtype;
 plan club_selection_private.withdrawal_plans%rowtype;f club_selection_private.fixtures%rowtype;a club_selection_private.availability%rowtype;
 rr club_selection_private.requests%rowtype;rid uuid;res jsonb;x jsonb;y jsonb;payload jsonb:='[]';tmp jsonb;pid uuid;token text;fid uuid;pub integer;
begin
 if me is null or not club_selection_private.member(c,me) or not club_selection_private.enabled(c) then raise exception 'Active club membership required';end if;
 if length(d::text)>1000000 then raise exception 'Request too large';end if;
 sel:=club_selection_private.selector(c,me);
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 if action='context' then return club_selection_private.week_context(c,me);end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 -- Tokens are returned once and never stored in request receipts.
 if action in('calendar_create','calendar_revoke') then
  if action='calendar_revoke' then delete from club_selection_private.calendar_subscriptions where club_id=c and user_id=me;return jsonb_build_object('saved',true);end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into club_selection_private.calendar_subscriptions(club_id,user_id,token_hash)
   values(c,me,extensions.digest(token,'sha256')) on conflict(club_id,user_id) do update set token_hash=excluded.token_hash,created_at=now();
  -- Populate only on explicit subscription; publication triggers keep it current.
  for fid in select id from club_selection_private.fixtures where club_id=c and published is not null loop perform club_selection_private.refresh_calendar_events(fid);end loop;
  return jsonb_build_object('token',token);
 end if;
 rid:=(d->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into rr from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if rr.action<>'week:'||action or rr.payload<>d then raise exception 'Request ID already used';end if;return rr.result;end if;
 if action='settings' then
  if not(adm or club_selection_private.publication_head(c)=me) then raise exception 'Club Admin or current Head of Selections required';end if;
  select * into settings from club_selection_private.week_settings where club_id=c;
  if coalesce(settings.revision,0)<>coalesce((d->>'revision')::integer,-1) then raise exception 'Settings changed. Reload before saving';end if;
  if jsonb_typeof(d->'reminders_enabled') is distinct from 'boolean' or jsonb_typeof(d->'acknowledgement_enabled') is distinct from 'boolean'
   or coalesce(d->>'deadline_time','')!~'^[0-2][0-9]:[0-5][0-9](:00)?$' then raise exception 'Choose the reminder and acknowledgement settings';end if;
  insert into club_selection_private.week_settings(club_id,reminders_enabled,deadline_weekday,deadline_time,acknowledgement_enabled)
   values(c,(d->>'reminders_enabled')::boolean,(d->>'deadline_weekday')::integer,(d->>'deadline_time')::time,(d->>'acknowledgement_enabled')::boolean)
   on conflict(club_id) do update set reminders_enabled=excluded.reminders_enabled,deadline_weekday=excluded.deadline_weekday,
    deadline_time=excluded.deadline_time,acknowledgement_enabled=excluded.acknowledgement_enabled,revision=club_selection_private.week_settings.revision+1,updated_at=now();
  res:=jsonb_build_object('saved',true);
 elsif action='acknowledge' then
  if not coalesce((select acknowledgement_enabled from club_selection_private.week_settings where club_id=c),false) then raise exception 'Team acknowledgements are not enabled';end if;
  fid:=(d->>'fixture_id')::uuid;pub:=(d->>'publication')::integer;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.published is null or f.publication is distinct from pub or coalesce((f.published->'details'->>'cancelled')::boolean,false) then raise exception 'The published team changed. Read the current team before acknowledging';end if;
  if not exists(select 1 from club_selection_private.roster r,jsonb_array_elements(f.published->'slots') s
   where r.club_id=c and r.user_id=me and r.active and (s->>'d1'=r.id::text or s->>'d2'=r.id::text)) then raise exception 'Acknowledge only your own published selection';end if;
  insert into club_selection_private.team_acknowledgements(fixture_id,user_id,publication) values(fid,me,pub) on conflict do nothing;
  res:=jsonb_build_object('saved',true);
 elsif action='plan_save' then
  if not sel then raise exception 'Selector access required';end if;
  perform club_selection_private.validate_withdrawal_plan(c,d->'fixtures',d->'withdrawn');
  insert into club_selection_private.withdrawal_plans(club_id,created_by,fixtures,withdrawn) values(c,me,d->'fixtures',d->'withdrawn') returning id into pid;
  perform club_selection_private.week_message(c,array[club_selection_private.publication_head(c)],'Replacement proposal ready',
   'A selector has prepared changes after a withdrawal. Review the affected teams before applying and republishing.'
   ||E'\nhttps://clubbatting.com/app.html?club='||c||'&tab=teams&team_view=board&replacement='||pid,'withdrawal-plan:'||pid);
  res:=jsonb_build_object('saved',true,'id',pid);
 elsif action in('plan_apply','plan_dismiss') then
  if not sel then raise exception 'Selector access required';end if;
  select * into plan from club_selection_private.withdrawal_plans where club_id=c and id=(d->>'id')::uuid for update;
  if not found or plan.state<>'proposed' then raise exception 'This proposal is no longer awaiting review';end if;
  if action='plan_dismiss' then
   if plan.created_by<>me and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the proposer or current Head can dismiss this proposal';end if;
   update club_selection_private.withdrawal_plans set state='dismissed',revision=revision+1 where id=plan.id;
   res:=jsonb_build_object('saved',true);
  else
   if club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can apply and unlock';end if;
   perform club_selection_private.validate_withdrawal_plan(c,plan.fixtures,plan.withdrawn);
   for x in select * from jsonb_array_elements(plan.fixtures) loop
    select * into f from club_selection_private.fixtures where club_id=c and id=(x->>'id')::uuid for update;
    if f.published is not null or club_selection_private.fixture_completed(f.details,(select timezone from club_selection_private.access where club_id=c)) then
     perform club_selection_private.api(c,'fixture_lock',jsonb_build_object('id',f.id,'revision',f.revision,'unlock',true,'request_id',gen_random_uuid()));
    end if;
    select revision into pub from club_selection_private.fixtures where id=f.id;
    payload:=payload||jsonb_build_array(x||jsonb_build_object('revision',pub));
   end loop;
   for x in select * from jsonb_array_elements(plan.withdrawn) loop
    pid:=(x->>'roster_id')::uuid;select * into a from club_selection_private.availability where roster_id=pid;
    select coalesce(jsonb_agg(v),'[]') into tmp from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) v where not x->'dates' ? v;
    select coalesce(jsonb_agg(distinct v),'[]') into y from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')||(x->'dates')) v;
    perform club_selection_private.api(c,'availability',jsonb_build_object('id',pid,'revision',coalesce(a.revision,0),'calendar_mode','opt_in',
     'available_dates',tmp,'unavailable_dates',y,'usual_available',false,'blocks','[]'::jsonb,'request_id',gen_random_uuid()));
   end loop;
   perform club_selection_private.api(c,'save_board',jsonb_build_object('fixtures',payload,'request_id',gen_random_uuid()));
   update club_selection_private.withdrawal_plans set state='applied',applied_by=me,applied_at=now(),revision=revision+1 where id=plan.id;
   res:=jsonb_build_object('saved',true,'fixture_ids',(select jsonb_agg(entry.value->>'id') from jsonb_array_elements(payload) entry(value)));
  end if;
 else raise exception 'Unknown club-week action';
 end if;
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,me,rid,'week:'||action,d,res);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'week:'||action,jsonb_build_object('request_id',rid,'result',res));
 return res;
end $f$;
create function public.club_week_api(p_club_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql set search_path='' as $f$ select club_selection_private.week_api(p_club_id,p_action,p_data) $f$;
revoke all on function public.club_week_api(uuid,text,jsonb) from public,anon;
grant execute on function public.club_week_api(uuid,text,jsonb) to authenticated;
revoke all on function club_selection_private.week_api(uuid,text,jsonb) from public,anon;
grant execute on function club_selection_private.week_api(uuid,text,jsonb) to authenticated;
do $grants$
declare fn regprocedure;
begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private'
  and p.proname in ('week_message','week_missing_dates','week_deadline','cancel_answered_availability_reminders','run_availability_reminders',
   'refresh_calendar_events','calendar_publication_changed','week_context','validate_withdrawal_plan') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn);
 end loop;
end $grants$;

-- Retain one alert per recipient per publication batch.
CREATE OR REPLACE FUNCTION club_selection_private.notify_publication_batch(p_club_id uuid, p_changes jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare delivery record;fixture record;mid uuid;title_text text;body_text text;tail_text text;line_text text;
 first_count int;updated_count int;shown int;total int;recipients int:=0;
begin
 if p_changes='[]'::jsonb then return 0;end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 30 then raise exception 'Invalid publication batch';end if;
 if (select count(distinct f.id) from jsonb_array_elements(p_changes) x
 join club_selection_private.fixtures f on f.id=(x->>'fixture_id')::uuid and f.club_id=p_club_id and f.published is not null)<>jsonb_array_length(p_changes)
 then raise exception 'Publication fixtures must belong to this club';end if;
 for delivery in
  with people as (
   select cm.user_id,club_selection_private.selector(p_club_id,cm.user_id) is_selector,
    cm.involvement in ('player','both') is_playing,
    array(select f.id from jsonb_array_elements(p_changes) x
     join club_selection_private.fixtures f on f.id=(x->>'fixture_id')::uuid and f.club_id=p_club_id
     where club_selection_private.audience(f.id,cm.user_id) or exists(
      select 1 from club_selection_private.roster r,
      jsonb_array_elements(coalesce(x->'old_snapshot'->'slots','[]'::jsonb)) slot
      where r.club_id=p_club_id and r.user_id=cm.user_id and (slot->>'d1'=r.id::text or slot->>'d2'=r.id::text))
     order by f.id) fixture_ids
   from public.club_memberships cm where cm.club_id=p_club_id
  )
  select is_selector,is_playing,fixture_ids,array_agg(user_id order by user_id) user_ids
  from people where cardinality(fixture_ids)>0 group by is_selector,is_playing,fixture_ids
 loop
  select count(*) filter(where x->'old_snapshot' is null or x->'old_snapshot'='null'::jsonb),
   count(*) filter(where x->'old_snapshot' is not null and x->'old_snapshot'<>'null'::jsonb)
  into first_count,updated_count from jsonb_array_elements(p_changes) x where (x->>'fixture_id')::uuid=any(delivery.fixture_ids);
  title_text:=case when updated_count=0 then 'Teams published' when first_count=0 then 'Teams updated' else 'Teams published and updated' end;
  body_text:=case when delivery.is_selector then 'The Head of Selection has ' else 'Teams have been ' end||
   case when updated_count=0 then 'published' when first_count=0 then 'updated' else 'published and updated' end||
   case when delivery.is_selector then ' teams for:' else ' for:' end;
  tail_text:=E'\n\n'||case
   when delivery.is_selector and delivery.is_playing then 'Open Teams to view all teams and check your own selection and playing dates.'
   when delivery.is_selector then 'Open Teams to view the published teams.'
   when delivery.is_playing then 'Open Teams to check your selection and playing dates, or contact a selector.'
   else 'Open Teams to view the published teams for your matches.' end;
  shown:=0;total:=cardinality(delivery.fixture_ids);
  for fixture in select f.id,f.published->'details' details,
   x->'old_snapshot'->'details' old_details,x->'old_snapshot' is null or x->'old_snapshot'='null'::jsonb first_publication
   from jsonb_array_elements(p_changes) x join club_selection_private.fixtures f on f.id=(x->>'fixture_id')::uuid
   where f.id=any(delivery.fixture_ids)
   order by f.published->'details'->'days'->0->>'date',f.published->'details'->>'grade',f.id
  loop
   line_text:=E'\n'||club_selection_private.publication_fixture_label(fixture.details)||
    case when first_count>0 and updated_count>0 then case when fixture.first_publication then ' [published]' else ' [updated]' end else '' end;
   if not fixture.first_publication then
    if coalesce((fixture.details->>'cancelled')::boolean,false) then line_text:=line_text||' · MATCH CANCELLED';
    elsif coalesce((fixture.old_details->>'cancelled')::boolean,false) then line_text:=line_text||' · MATCH REINSTATED';end if;
    if fixture.details->>'ground' is distinct from fixture.old_details->>'ground' then line_text:=line_text||' · Ground changed: '||coalesce(nullif(fixture.details->>'ground',''),'to be confirmed');end if;
    if fixture.details->'days' is distinct from fixture.old_details->'days' then line_text:=line_text||' · Playing dates/times changed';end if;
    if fixture.details->>'meeting' is distinct from fixture.old_details->>'meeting' then line_text:=line_text||' · Meeting arrangements changed';end if;
   end if;
   -- Keep dates and formats intact. Very large batches link to the full list.
   if length(body_text)+length(line_text)+length(tail_text)+85>1500 then exit;end if;
   body_text:=body_text||line_text;shown:=shown+1;
  end loop;
  if shown<total then body_text:=body_text||E'\nAnd '||(total-shown)||' more fixtures; open Teams to view the full list.';end if;
  body_text:=body_text||tail_text;
  insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
   values(p_club_id,null,gen_random_uuid(),title_text,body_text,'teams',true,'selection:batch:publication:'||gen_random_uuid()::text) returning id into mid;
  insert into club_selection_private.notifications(message_id,fixture_id,kind)
   select mid,f,'publication' from unnest(delivery.fixture_ids) f;
  insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy)
   select mid,u,false from unnest(delivery.user_ids) u;
  recipients:=recipients+cardinality(delivery.user_ids);
 end loop;
 return recipients;
end
$function$

;

create function club_selection_private.week_message_allowed(mid uuid,u uuid)
returns boolean language sql stable security definer set search_path='' as $f$
 select exists(select 1 from club_selection_private.availability_reminders r
  join club_selection_private.week_settings s on s.club_id=r.club_id
  join club_selection_private.access a on a.club_id=r.club_id
  where r.message_id=mid and r.user_id=u and r.cancelled_at is null and s.reminders_enabled
   and club_selection_private.member(r.club_id,u) and club_selection_private.enabled(r.club_id)
   and now()<r.deadline+interval '12 hours' and club_selection_private.week_missing_dates(r.club_id,u,r.dates)<>'[]'::jsonb
   and exists(select 1 from club_selection_private.fixtures f where f.club_id=r.club_id and f.published is null
    and not coalesce((f.details->>'cancelled')::boolean,false)
    and club_selection_private.week_deadline((f.details->'days'->0->>'date')::date,s.deadline_weekday,s.deadline_time,a.timezone)=r.deadline
    and exists(select 1 from jsonb_array_elements(f.details->'days') d where r.dates ? (d->>'date'))))
 or exists(select 1 from club_selection_private.withdrawal_plans p join club_batting_private.club_messages m on m.system_key='withdrawal-plan:'||p.id
  where m.id=mid and p.state='proposed' and club_selection_private.member(p.club_id,u)
   and club_selection_private.enabled(p.club_id) and club_selection_private.publication_head(p.club_id)=u)
$f$;
revoke all on function club_selection_private.week_message_allowed(uuid,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION club_batting_private.message_recipient_allowed(p_message uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from club_batting_private.club_message_recipients visible where visible.message_id=p_message and visible.user_id=p_user and visible.deleted_at is null) and case when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and (m.system_key like 'availability-reminder:%' or m.system_key like 'withdrawal-plan:%')) then club_selection_private.week_message_allowed(p_message,p_user) when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'socials-attention:%') then exists(
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
$function$
;
grant usage on schema club_selection_private to service_role;


-- Task links for these system messages, with the usual inbox route for other messages.
create function club_selection_private.week_message_path(mid uuid,c uuid)
returns text language sql stable security definer set search_path='' as $f$
 select coalesce(
 (select 'app.html?club='||c||'&tab=teams&team_view=availability&team_date='||(r.dates->>0)
  from club_selection_private.availability_reminders r where r.message_id=mid and r.club_id=c),
 (select 'app.html?club='||c||'&tab=teams&team_view=board&replacement='||p.id
  from club_selection_private.withdrawal_plans p join club_batting_private.club_messages m on m.system_key='withdrawal-plan:'||p.id
  where m.id=mid and p.club_id=c),
 'app.html?club='||c||'&tab=messages&message='||mid)
$f$;
revoke all on function club_selection_private.week_message_path(uuid,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION club_batting_private.queue_message_email(p_message uuid, p_user uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare msg club_batting_private.club_messages%rowtype; rec club_batting_private.club_message_recipients%rowtype; mail text; eid uuid;
begin
 select * into msg from club_batting_private.club_messages where id=p_message;
 select * into rec from club_batting_private.club_message_recipients where message_id=p_message and user_id=p_user for update;
 if not found or not club_batting_private.message_recipient_allowed(p_message,p_user) then return null; end if;
 if rec.email_id is not null then return rec.email_id; end if;
 if p_reason='fallback' and rec.opened_at is not null then return null; end if;
 select email into mail from auth.users where id=p_user;
 if nullif(btrim(mail),'') is null then return null; end if;
 insert into public.outbound_messages(club_id,recipient_user_id,recipient_email,template_key,subject,payload)
 values(msg.club_id,p_user,mail,'club_staff_message','Club Batting — new message',
  jsonb_build_object('message_id',msg.id,'headline','You have a new club message','body','You have a new club message. Open Club Batting to read it.',
   'club_name',(select name from public.clubs where id=msg.club_id),
   'link_path',club_selection_private.week_message_path(msg.id,msg.club_id))) returning id into eid;
 update club_batting_private.club_message_recipients set email_id=eid,email_reason=p_reason where message_id=p_message and user_id=p_user;
 return eid;
end $function$

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

-- Stop already-queued reminders when their deadline, fixture or club settings change.
create function club_selection_private.expire_week_reminders(c uuid default null)
returns integer language plpgsql security definer set search_path='' as $f$
declare r record;n integer:=0;
begin
 for r in select ar.* from club_selection_private.availability_reminders ar
  where (c is null or ar.club_id=c) and ar.cancelled_at is null and ar.message_id is not null
   and not club_selection_private.week_message_allowed(ar.message_id,ar.user_id) loop
  update club_selection_private.availability_reminders set cancelled_at=now() where id=r.id;
  update club_batting_private.club_message_recipients set deleted_at=now() where message_id=r.message_id and user_id=r.user_id;
  update public.outbound_messages o set cancelled_at=now(),status='cancelled' from club_batting_private.club_message_recipients mr
   where mr.message_id=r.message_id and mr.user_id=r.user_id and o.id=mr.email_id and o.sent_at is null;
  update club_batting_private.phone_deliveries d set status='cancelled',finished_at=now(),error_code='no_longer_needed'
   from club_batting_private.phone_subscriptions s where d.subscription_id=s.id and s.user_id=r.user_id
    and d.kind='message' and d.source_key=r.message_id::text and d.status in('queued','sending');
  n:=n+1;
 end loop;
 return n;
end $f$;
create function club_selection_private.week_reminders_changed()
returns trigger language plpgsql security definer set search_path='' as $f$
begin perform club_selection_private.expire_week_reminders(new.club_id);return new;end $f$;
create trigger week_reminders_settings_changed after update on club_selection_private.week_settings
 for each row execute function club_selection_private.week_reminders_changed();
create trigger week_reminders_fixture_changed after update of details,published on club_selection_private.fixtures
 for each row execute function club_selection_private.week_reminders_changed();
revoke all on function club_selection_private.expire_week_reminders(uuid) from public,anon,authenticated;
revoke all on function club_selection_private.week_reminders_changed() from public,anon,authenticated;
-- Reuse this job name when applying the finalized collector command.
select cron.schedule('club-availability-reminders','*/5 * * * *','select club_selection_private.expire_week_reminders(); select club_selection_private.run_availability_reminders();');
