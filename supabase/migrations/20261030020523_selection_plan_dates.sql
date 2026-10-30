-- Linked clubs choose teams once. Published selections maintain one date per
-- player/format/season. The delivery job reads those saved dates only.
create table club_batting_private.selection_plan_settings (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 team_ids uuid[] not null default '{}',revision integer not null default 1,
 updated_at timestamptz not null default now(),updated_by uuid
);
create table club_batting_private.selection_plan_dates (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade,season_key text not null,
 format_key text not null check(format_key in ('t20','limited_overs','long_form')),
 first_fixture date not null,next_fixture date,due_date date not null,active boolean not null default true,
 reminder_id uuid,completed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(club_id,player_id,season_key,format_key)
);
create index selection_plan_dates_due on club_batting_private.selection_plan_dates(due_date,club_id) where active and reminder_id is null and completed_at is null;
alter table club_batting_private.selection_plan_settings enable row level security;
alter table club_batting_private.selection_plan_dates enable row level security;
revoke all on club_batting_private.selection_plan_settings,club_batting_private.selection_plan_dates from public,anon,authenticated;

create function club_batting_private.linked_plan_club(c uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from club_selection_private.access a where a.club_id=c and a.mode='bundle')
$$;
create function club_batting_private.selection_plan_season(c uuid) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select active_season_id::text from club_selection_private.playhq_connections where club_id=c),
  'manual:'||extract(year from (now() at time zone coalesce((select timezone from club_selection_private.access where club_id=c),'Australia/Sydney'))
   -make_interval(months=>coalesce((select season_start_month from public.club_call_settings where club_id=c),7)-1))::integer::text)
$$;
revoke all on function club_batting_private.linked_plan_club(uuid),club_batting_private.selection_plan_season(uuid) from public,anon,authenticated;

create function club_batting_private.sync_selection_plan_dates(c uuid) returns void
language plpgsql security definer set search_path='' as $$
declare season text;start_date date;today date;month integer;tz text;
begin
 if not club_batting_private.linked_plan_club(c) then return;end if;
 -- Same club write lock as selection publication/settings. No request from calendar paint.
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 season:=club_batting_private.selection_plan_season(c);
 select coalesce(a.timezone,'Australia/Sydney') into tz from club_selection_private.access a where a.club_id=c;
 today:=(now() at time zone tz)::date;
 select coalesce((select season_start_month from public.club_call_settings where club_id=c),7) into month;
 start_date:=make_date(extract(year from today)::int,month,1);if start_date>today then start_date:= (start_date-interval '1 year')::date;end if;
 update club_batting_private.selection_plan_dates set active=false where club_id=c and active;
 with fixtures as materialized (
  select f.published->'details' details,f.published->'slots' slots from club_selection_private.fixtures f
  join club_batting_private.selection_plan_settings setting on setting.club_id=c
  left join club_selection_private.playhq_links l on l.fixture_id=f.id and l.club_id=c
  where f.club_id=c and f.published is not null
   and coalesce(f.details->>'cancelled','false')<>'true' and coalesce(f.published->'details'->>'cancelled','false')<>'true'
   and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
   and club_selection_private.fixture_group_id(c,f.published->'details')=any(setting.team_ids)
   and (l.fixture_id is null or l.season_id::text=season)
 ), selected as (
  select r.id roster_id,case when f.details->>'format' in ('two_day','long_form') then 'long_form' else f.details->>'format' end format_key,
   (day->>'date')::date fixture_date
  from fixtures f cross join lateral jsonb_array_elements(f.slots) slot
  cross join lateral jsonb_array_elements(f.details->'days') with ordinality d(day,ord)
  join club_selection_private.roster r on r.club_id=c and r.active and r.id::text=slot->>('d'||ord::text)
  where day->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and (day->>'date')::date>=start_date and (day->>'date')::date<start_date+interval '1 year'
 ), identities as materialized (
  select r.id roster_id,min(p.id::text)::uuid player_id from club_selection_private.roster r
  left join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=r.id
  join public.players p on p.club_id=c and p.active and case when rp.player_id is not null then p.id=rp.player_id else p.user_id=r.user_id end
  where r.club_id=c and r.active group by r.id having count(distinct p.id)=1
 ), dates as (
  select i.player_id,s.format_key,min(s.fixture_date) first_fixture,min(s.fixture_date) filter(where s.fixture_date>=today) next_fixture
  from selected s join identities i on i.roster_id=s.roster_id
  where s.format_key in ('t20','limited_overs','long_form') group by i.player_id,s.format_key
 )
 insert into club_batting_private.selection_plan_dates(club_id,player_id,season_key,format_key,first_fixture,next_fixture,due_date)
 select c,player_id,season,format_key,first_fixture,next_fixture,first_fixture-7 from dates
 on conflict(club_id,player_id,season_key,format_key) do update set first_fixture=excluded.first_fixture,next_fixture=excluded.next_fixture,
  due_date=excluded.due_date,active=true,updated_at=now();
 -- Adopt reminders already sent through the existing Messages system, without
 -- generating a second message when the automatic feature is enabled later.
 update club_batting_private.selection_plan_dates d set reminder_id=m.id
 from public.players p,club_batting_private.club_messages m
 where d.club_id=c and d.season_key=season and d.reminder_id is null and d.active
  and p.id=d.player_id and p.club_id=c and m.club_id=c
  and m.system_key='selection-plan:'||season||':'||p.user_id::text||':'||d.format_key;
end $$;
revoke all on function club_batting_private.sync_selection_plan_dates(uuid) from public,anon,authenticated;

-- Keep ordinary Club Batting dates intact, but exclude them for linked clubs.
create view club_batting_private.effective_plan_requirements as
 select r.id,r.club_id,r.format_key,r.target_type,r.playing_group_id,r.player_id,r.due_date,r.active,r.created_at
 from public.player_plan_requirements r where not club_batting_private.linked_plan_club(r.club_id)
 union all
 select d.id,d.club_id,d.format_key,'player'::text,null::uuid,d.player_id,d.due_date,d.active,d.created_at
 from club_batting_private.selection_plan_dates d where d.active and club_batting_private.linked_plan_club(d.club_id)
 and d.season_key=club_batting_private.selection_plan_season(d.club_id);
revoke all on club_batting_private.effective_plan_requirements from public,anon,authenticated;

do $patch$
declare item record;s text;
begin
 for item in select n.nspname,p.proname,p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and p.proname in ('get_my_player_plan_rollout','get_players_workspace','get_plan_rollout_progress'))
   or (n.nspname='club_batting_private' and p.proname='plan_reminder_due') loop
  s:=replace(pg_get_functiondef(item.oid),E'\r\n',E'\n');
  if position('public.player_plan_requirements' in s)=0 then raise exception 'Unexpected requirements reader: %',item.proname;end if;
  s:=replace(s,'public.player_plan_requirements','club_batting_private.effective_plan_requirements');
  if item.proname='plan_reminder_due' then s:=replace(s,'pr.due_date<today','(pr.due_date<today or club_batting_private.linked_plan_club(p_club) and pr.due_date=today)');end if;
  s:=replace(s,$old$when r.target_type='player' then 'Individual requirement'$old$,$new$when r.target_type='player' then case when club_batting_private.linked_plan_club(r.club_id) then 'First selected fixture · one week before' else 'Individual requirement' end$new$);
  execute s;
 end loop;
 -- Opted-in selected players can use their plan even when their cup team does
 -- not participate in the broader Club Batting coaching workflows.
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='player_uses_batting';
 s:=replace(s,E'\r\n',E'\n');
 if position('or exists(select 1 from public.player_playing_groups' in s)=0 then raise exception 'Unexpected batting participation function';end if;
 s:=replace(s,'or exists(select 1 from public.player_playing_groups',
  'or exists(select 1 from club_batting_private.selection_plan_dates pd where pd.club_id=c and pd.player_id=pid and pd.active and pd.season_key=club_batting_private.selection_plan_season(c)) or exists(select 1 from public.player_playing_groups');execute s;
end $patch$;

create function club_batting_private.selection_plan_settings_api(c uuid,action text,data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg club_batting_private.selection_plan_settings%rowtype;ids uuid[];rid uuid;receipt club_selection_private.requests%rowtype;answer jsonb;
begin
 if auth.uid() is null or not public.is_club_admin(c) or not club_selection_private.member(c,auth.uid()) or not club_batting_private.linked_plan_club(c) then raise exception 'Linked Club Admin access required';end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())) then raise exception 'A verified active account is required';end if;
 select * into cfg from club_batting_private.selection_plan_settings where club_id=c;
 if action='context' then return jsonb_build_object('revision',coalesce(cfg.revision,0),'team_ids',coalesce(cfg.team_ids,'{}'),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.sort_order,g.name) from public.playing_groups g where g.club_id=c and g.active),'[]'::jsonb));end if;
 if action<>'save' or jsonb_typeof(data->'team_ids') is distinct from 'array' or jsonb_array_length(data->'team_ids')>100 then raise exception 'Choose teams from this club';end if;
 rid:=nullif(data->>'request_id','')::uuid;if rid is null then raise exception 'Missing save request';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(data->'team_ids');
 if exists(select 1 from unnest(ids) x(id) where id is null or not exists(select 1 from public.playing_groups g where g.id=x.id and g.club_id=c and g.active)) then raise exception 'One of the teams is no longer active in this club';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into receipt from club_selection_private.requests where club_id=c and user_id=auth.uid() and request_id=rid;
 if found then if receipt.action<>'selection_plan_settings' or receipt.payload<>data then raise exception 'This request was used for different changes';end if;return receipt.result;end if;
 select * into cfg from club_batting_private.selection_plan_settings where club_id=c for update;
 if coalesce(cfg.revision,0)<>coalesce((data->>'revision')::integer,-1) then raise exception 'Plan reminder teams changed. Close and reopen before saving';end if;
 insert into club_batting_private.selection_plan_settings(club_id,team_ids,updated_by) values(c,ids,auth.uid())
 on conflict(club_id) do update set team_ids=excluded.team_ids,revision=selection_plan_settings.revision+1,updated_at=now(),updated_by=auth.uid();
 perform club_batting_private.sync_selection_plan_dates(c);
 answer:=jsonb_build_object('saved',true,'revision',coalesce(cfg.revision,0)+1);
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,auth.uid(),rid,'selection_plan_settings',data,answer);
 return answer;
end $$;
revoke all on function club_batting_private.selection_plan_settings_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function club_batting_private.selection_plan_settings_api(uuid,text,jsonb) to authenticated;
create function public.club_plan_reminder_settings(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select club_batting_private.selection_plan_settings_api(p_club_id,p_action,p_data)$$;
revoke all on function public.club_plan_reminder_settings(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.club_plan_reminder_settings(uuid,text,jsonb) to authenticated;

create function club_batting_private.selection_plan_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='fixtures' then
  if tg_op='INSERT' and new.published is null then return null;end if;
  if tg_op='DELETE' and old.published is null then return null;end if;
  if tg_op='UPDATE' and new.published is not distinct from old.published and new.details->'cancelled' is not distinct from old.details->'cancelled'
   and club_selection_private.fixture_identity(new.club_id,new.details)=club_selection_private.fixture_identity(old.club_id,old.details) then return null;end if;
 end if;
 perform club_batting_private.sync_selection_plan_dates(case when tg_op='DELETE' then old.club_id else new.club_id end);return null;
end $$;
revoke all on function club_batting_private.selection_plan_changed() from public,anon,authenticated;
create trigger selection_plan_publication after insert or delete or update of published,details on club_selection_private.fixtures
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_identity after insert or delete or update on club_batting_private.roster_players
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_player after insert or update of user_id,active on public.players
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_team after update of active on public.playing_groups
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_roster after update of user_id,active on club_selection_private.roster
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_season_changed after update of active_season_id on club_selection_private.playhq_connections
 for each row execute function club_batting_private.selection_plan_changed();

create function club_batting_private.selection_plan_message_allowed(mid uuid,uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from club_batting_private.selection_plan_dates d
 join public.players p on p.id=d.player_id and p.club_id=d.club_id and p.active and p.user_id=uid
 join public.club_memberships cm on cm.club_id=d.club_id and cm.user_id=uid and cm.involvement in ('player','both')
 join auth.users u on u.id=uid and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 where d.reminder_id=mid and d.active and d.season_key=club_batting_private.selection_plan_season(d.club_id)
 and club_selection_private.enabled(d.club_id) and club_selection_private.member(d.club_id,uid)
 and exists(select 1 from jsonb_array_elements(club_batting_private.plan_reminder_due(d.club_id,d.player_id)) section where section->>'format_key'=d.format_key))
$$;
revoke all on function club_batting_private.selection_plan_message_allowed(uuid,uuid) from public,anon,authenticated;
do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='message_recipient_allowed';
 if position('and case when exists' in s)=0 then raise exception 'Unexpected message access function';end if;
 s:=replace(s,'and case when exists', 'and case when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like ''selection-plan:%'') then club_batting_private.selection_plan_message_allowed(p_message,p_user) when exists');execute s;
end $patch$;

create function club_batting_private.queue_selection_plan_reminders(c uuid default null,p_format text default null) returns integer
language plpgsql security definer set search_path='' as $$
declare d record;mid uuid;key text;label text;today date;due jsonb;n integer:=0;
begin
 -- The worker scans a small indexed saved-date queue, not fixtures or PlayHQ.
 for d in select x.*,p.user_id,a.timezone from club_batting_private.selection_plan_dates x
 join public.players p on p.id=x.player_id and p.club_id=x.club_id and p.active
 join auth.users u on u.id=p.user_id and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 join public.club_memberships cm on cm.club_id=x.club_id and cm.user_id=p.user_id and cm.involvement in ('player','both')
 join club_selection_private.access a on a.club_id=x.club_id and a.mode='bundle'
 where x.active and x.reminder_id is null and x.completed_at is null and (p_format is null or x.format_key=p_format) and (c is null or x.club_id=c) and x.due_date<=(now() at time zone a.timezone)::date
  and x.next_fixture>=(now() at time zone a.timezone)::date and x.season_key=club_batting_private.selection_plan_season(x.club_id)
  and club_selection_private.enabled(x.club_id)
  and exists(select 1 from public.player_plan_structure_versions ps
   where ps.club_id=x.club_id and ps.philosophy_version=(select max(version_number) from public.philosophy_versions where club_id=x.club_id)
    and ps.philosophy_version=(select max(philosophy_version) from public.how_we_bat_versions where club_id=x.club_id))
 order by x.club_id,x.player_id,x.format_key for update of x skip locked limit 500 loop
  -- Serialize with manual reminders and reuse a reminder already covering this deadline.
  perform pg_advisory_xact_lock(hashtextextended(d.club_id::text||':plan-reminders',90));
  due:=club_batting_private.plan_reminder_due(d.club_id,d.player_id);
  if not exists(select 1 from jsonb_array_elements(due) section where section->>'format_key'=d.format_key) then
   update club_batting_private.selection_plan_dates set completed_at=now() where id=d.id;continue;end if;
  select m.id into mid from club_batting_private.club_messages m join club_batting_private.club_message_recipients r on r.message_id=m.id
   where m.club_id=d.club_id and r.player_id=d.player_id and m.kind='plan_reminder'
    and exists(select 1 from jsonb_array_elements(r.plan_sections) section where section->>'format_key'=d.format_key and section->>'due_date'=d.due_date::text)
   order by m.created_at desc limit 1;
  if mid is not null then update club_batting_private.selection_plan_dates set reminder_id=mid where id=d.id;continue;end if;
  key:='selection-plan:'||d.season_key||':'||d.user_id::text||':'||d.format_key;
  label:=case d.format_key when 't20' then 'T20' when 'limited_overs' then 'Limited-overs' else 'Long-form' end;
  today:=(now() at time zone d.timezone)::date;
  insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,kind,auto_email_fallback,system_key)
  values(d.club_id,null,gen_random_uuid(),label||' Player Plan '||case when d.due_date<today then 'overdue' else 'reminder' end,
   'Your '||label||' Player Plan '||case when d.due_date<today then 'was due on ' else 'is due on ' end||to_char(d.due_date,'FMDD Mon')||'. Complete it now so you can use it at training before your first '||label||' fixture of the season.','myplan','plan_reminder',true,key)
  on conflict(club_id,system_key) where system_key is not null do nothing returning id into mid;
  if mid is null then select id into mid from club_batting_private.club_messages where club_id=d.club_id and system_key=key;end if;
  update club_batting_private.selection_plan_dates set reminder_id=mid where id=d.id;
  insert into club_batting_private.club_message_recipients(message_id,user_id,player_id,plan_sections)
   values(mid,d.user_id,d.player_id,jsonb_build_array(jsonb_build_object('format_key',d.format_key,'due_date',d.due_date))) on conflict(message_id,user_id) do nothing;
  -- Existing phone delivery and its email fallback pick up this one message.
  n:=n+1;
 end loop;return n;
end $$;
revoke all on function club_batting_private.queue_selection_plan_reminders(uuid,text) from public,anon,authenticated;

-- Preserve current participation as each linked club's initial team choice.
insert into club_batting_private.selection_plan_settings(club_id,team_ids)
 select a.club_id,coalesce(array_agg(g.id) filter(where g.id is not null),'{}') from club_selection_private.access a
 left join public.playing_groups g on g.club_id=a.club_id and g.active and g.batting_enabled where a.mode='bundle' group by a.club_id;
do $$declare c uuid;begin for c in select club_id from club_batting_private.selection_plan_settings loop perform club_batting_private.sync_selection_plan_dates(c);end loop;end$$;
-- No messages are created while deploying. An hourly bounded queue check does
-- not scan fixtures, contact PlayHQ or add any work to player startup.
select cron.schedule('selection-player-plan-reminders','0 * * * *','select club_batting_private.queue_selection_plan_reminders();');
