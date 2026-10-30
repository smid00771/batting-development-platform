-- Fixtures define each team's formats. Normal team starts the season; known
-- season line-ups carry players into subsequent formats. Cup T20s need a
-- published selection. All calculations run on a saved, coalesced change queue.
create table club_batting_private.selection_plan_dirty (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 changed_at timestamptz not null default now(),last_error text
);
alter table club_batting_private.selection_plan_dirty enable row level security;
revoke all on club_batting_private.selection_plan_dirty from public,anon,authenticated;

create function club_batting_private.plan_season_fixtures(c uuid)
returns table(fixture_id uuid,team_id uuid,format_key text,first_day date,last_day date,source_dates jsonb,published jsonb,details jsonb)
language sql stable set search_path='' as $$
 with source as materialized (
  select f.id,g.id team_id,coalesce(l.pending_fixture,l.source_fixture) src,f.published,f.details
  from club_selection_private.playhq_connections cn
  join club_selection_private.playhq_links l on l.club_id=cn.club_id and l.season_id=cn.active_season_id
  join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c
  join club_selection_private.playhq_grade_mappings m on m.club_id=c and m.season_id=cn.active_season_id and m.team_id=l.team_id
  join public.playing_groups g on g.id=m.grade_id and g.club_id=c and g.active
  where cn.club_id=c and coalesce(f.details->>'cancelled','false')<>'true'
 ), usable as (
  select s.*,case when src->>'format' in ('two_day','long_form') then 'long_form' else src->>'format' end fmt,
   (select min((d->>'date')::date) from jsonb_array_elements(src->'days') d) starts,
   (select max((d->>'date')::date) from jsonb_array_elements(src->'days') d) ends,
   (select jsonb_agg(d->>'date' order by d->>'date') from jsonb_array_elements(src->'days') d) dates
  from source s where coalesce(src->>'cancelled','false')<>'true'
   and upper(coalesce(src->>'source_status','')) not in ('CANCELLED','CANCELED','ABANDONED','BYE')
   and jsonb_typeof(src->'days')='array' and jsonb_array_length(src->'days')>0
   and not exists(select 1 from jsonb_array_elements(src->'days') d where coalesce(d->>'date','') !~ '^\d{4}-\d{2}-\d{2}$')
 ) select id,team_id,fmt,starts,ends,dates,published,details from usable
 where fmt in ('t20','limited_overs','long_form')
$$;
revoke all on function club_batting_private.plan_season_fixtures(uuid) from public,anon,authenticated;

create or replace function club_batting_private.sync_selection_plan_dates(c uuid) returns void
language plpgsql security definer set search_path='' as $$
declare season text;today date;
begin
 if not club_batting_private.linked_plan_club(c) then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 season:=club_batting_private.selection_plan_season(c);
 select (now() at time zone coalesce(a.timezone,'Australia/Sydney'))::date into today from club_selection_private.access a where a.club_id=c;
 update club_batting_private.selection_plan_dates set active=false where club_id=c and active;
 with fixtures as materialized (
  select f.* from club_batting_private.plan_season_fixtures(c) f
  join club_batting_private.selection_plan_settings s on s.club_id=c and f.team_id=any(s.team_ids)
 ), identities as materialized (
  select r.id roster_id,min(p.id::text)::uuid player_id,
   club_selection_private.fixture_group_id(c,jsonb_build_object('grade',r.grade)) normal_team
  from club_selection_private.roster r
  left join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=r.id
  join public.players p on p.club_id=c and p.active and case when rp.player_id is not null then p.id=rp.player_id else p.user_id=r.user_id end
  where r.club_id=c and r.active group by r.id,r.grade having count(distinct p.id)=1
 ), known as materialized (
  -- The existing confirmed-identity reader prefers actual completed line-ups
  -- over publication. Joining the source fixtures excludes past seasons.
  select f.fixture_id,f.team_id,f.first_day,i.roster_id,i.player_id
  from club_selection_private.drop_prior_lineups(c) h join fixtures f on f.fixture_id=h.fixture_id
  cross join lateral jsonb_array_elements(h.slots) slot
  join identities i on i.roster_id::text=slot->>'d1' or i.roster_id::text=slot->>'d2'
  where h.lineup_source in ('published','completed_scorecard')
 ), regular_history as materialized (
  select k.roster_id,k.player_id,k.team_id,min(k.first_day) joined
  from known k where exists(select 1 from fixtures f where f.team_id=k.team_id and f.format_key in ('limited_overs','long_form'))
  group by k.roster_id,k.player_id,k.team_id
 ), memberships as (
  select roster_id,player_id,team_id,joined from regular_history
  union all
  select i.roster_id,i.player_id,i.normal_team,'-infinity'::date from identities i
  where i.normal_team is not null and not exists(select 1 from regular_history h where h.roster_id=i.roster_id)
 ), candidates as (
  -- Once someone has played senior cricket, that history includes them in the
  -- later long-form start even when their Normal team is a development side.
  select m.player_id,f.format_key,f.first_day from memberships m join fixtures f on f.team_id=m.team_id
  where f.format_key in ('limited_overs','long_form') and f.first_day>=m.joined
  union all
  -- An opening T20 for the Normal team can bootstrap the season. Later cup
  -- competitions do not infer a squad from the player's normal grade.
  select i.player_id,f.format_key,f.first_day from identities i join fixtures f on f.team_id=i.normal_team
  where f.format_key='t20' and f.first_day>=today
   and f.first_day=(select min(q.first_day) from fixtures q where q.team_id=f.team_id)
   and not exists(select 1 from regular_history h where h.roster_id=i.roster_id)
  union all
  select i.player_id,'t20',f.first_day from fixtures f
  cross join lateral jsonb_array_elements(coalesce(f.published->'slots','[]'::jsonb)) slot
  join identities i on i.roster_id::text=slot->>'d1' or i.roster_id::text=slot->>'d2'
  where f.format_key='t20' and f.published is not null
   and coalesce(f.published#>>'{details,cancelled}','false')<>'true'
   and f.published#>>'{details,format}'='t20'
   and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
   and f.source_dates=(select jsonb_agg(d->>'date' order by d->>'date') from jsonb_array_elements(f.published#>'{details,days}') d)
 ), dates as (
  select player_id,format_key,min(first_day) first_fixture,min(first_day) filter(where first_day>=today) next_fixture
  from candidates group by player_id,format_key
 )
 insert into club_batting_private.selection_plan_dates(club_id,player_id,season_key,format_key,first_fixture,next_fixture,due_date)
 select c,player_id,season,format_key,first_fixture,next_fixture,first_fixture-7 from dates
 on conflict(club_id,player_id,season_key,format_key) do update set first_fixture=excluded.first_fixture,next_fixture=excluded.next_fixture,
  due_date=excluded.due_date,active=true,updated_at=now();
 update club_batting_private.selection_plan_dates d set reminder_id=m.id
 from public.players p,club_batting_private.club_messages m
 where d.club_id=c and d.season_key=season and d.reminder_id is null and d.active and p.id=d.player_id and p.club_id=c
  and m.club_id=c and m.system_key='selection-plan:'||season||':'||p.user_id::text||':'||d.format_key;
 delete from club_batting_private.selection_plan_dirty where club_id=c;
end $$;

create or replace function club_batting_private.selection_plan_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare c uuid:=case when tg_op='DELETE' then old.club_id else new.club_id end;
begin
 if not club_batting_private.linked_plan_club(c) then return null;end if;
 if tg_table_name='fixtures' then
  if tg_op='INSERT' and new.published is null then return null;end if;
  if tg_op='DELETE' and old.published is null then return null;end if;
  if tg_op='UPDATE' and new.published is not distinct from old.published
   and new.details->'cancelled' is not distinct from old.details->'cancelled'
   and club_selection_private.fixture_identity(c,new.details)=club_selection_private.fixture_identity(c,old.details) then return null;end if;
 end if;
 -- Even an entire source import records only one pending club. Ordinary slot
 -- moves do not fire this trigger and never calculate plan dates.
 insert into club_batting_private.selection_plan_dirty(club_id) values(c) on conflict(club_id) do nothing;
 return null;
end $$;

drop trigger selection_plan_roster on club_selection_private.roster;
create trigger selection_plan_roster after insert or delete or update of user_id,active,grade on club_selection_private.roster
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_source after insert or delete or update of source_fixture,pending_fixture,season_id,team_id on club_selection_private.playhq_links
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_mapping after insert or delete or update on club_selection_private.playhq_grade_mappings
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_scorecard after insert or delete or update of scorecard,source_match_id on public.match_review_scorecards
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_result_source after insert or delete or update on club_selection_private.fixture_result_sources
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_scorecard_identity after insert or delete or update on club_selection_private.scorecard_roster_links
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_batting_identity after insert or delete or update on public.match_review_player_links
 for each row execute function club_batting_private.selection_plan_changed();
create trigger selection_plan_team_name after update of name on public.playing_groups
 for each row execute function club_batting_private.selection_plan_changed();

create function club_batting_private.refresh_changed_plan_dates() returns integer
language plpgsql security definer set search_path='' as $$
declare c uuid;n integer:=0;
begin
 for c in select club_id from club_batting_private.selection_plan_dirty order by changed_at limit 100 loop
  -- Keep the same lock order as publication: club, then saved queue row.
  if not pg_try_advisory_xact_lock(hashtextextended(c::text,9200)) then continue;end if;
  perform 1 from club_batting_private.selection_plan_dirty where club_id=c for update skip locked;
  if not found then continue;end if;
  begin
   if club_batting_private.linked_plan_club(c) then perform club_batting_private.sync_selection_plan_dates(c);
   else delete from club_batting_private.selection_plan_dirty where club_id=c;end if;
   n:=n+1;
  exception when others then update club_batting_private.selection_plan_dirty set last_error=left(sqlerrm,300) where club_id=c;
  end;
 end loop;return n;
end $$;
revoke all on function club_batting_private.refresh_changed_plan_dates() from public,anon,authenticated;

-- The existing hourly delivery job rebuilds changed clubs first. It never
-- sends from a stale club whose rebuild failed or was skipped for contention.
do $patch$
declare s text;
begin
 s:=pg_get_functiondef('club_batting_private.queue_selection_plan_reminders(uuid,text)'::regprocedure);
 if position('-- The worker scans' in s)=0 or position('where x.active and' in s)=0 then raise exception 'Unexpected reminder worker';end if;
 s:=replace(s,'-- The worker scans','perform club_batting_private.refresh_changed_plan_dates();'||chr(10)||' -- The worker scans');
 s:=replace(s,'where x.active and','where not exists(select 1 from club_batting_private.selection_plan_dirty dirty where dirty.club_id=x.club_id) and x.active and');execute s;
 for s in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('get_my_player_plan_rollout','get_players_workspace','get_plan_rollout_progress') loop
  execute replace(s,'First selected fixture · one week before','Season fixtures · one week before');
 end loop;
 -- Preserve the existing permission, revision, idempotency and save guards.
 s:=pg_get_functiondef('club_batting_private.selection_plan_settings_api(uuid,text,jsonb)'::regprocedure);
 if position('''id'',g.id,''name'',g.name' in s)=0 then raise exception 'Unexpected reminder settings';end if;
 s:=replace(s,'''id'',g.id,''name'',g.name',
  '''id'',g.id,''name'',g.name,''formats'',coalesce((select jsonb_agg(jsonb_build_object(''format'',q.format_key,''first_fixture'',q.first_day) order by q.first_day) from (select f.format_key,min(f.first_day) first_day from club_batting_private.plan_season_fixtures(c) f where f.team_id=g.id group by f.format_key) q),''[]''::jsonb)');execute s;
end $patch$;

insert into club_batting_private.selection_plan_dirty(club_id)
 select club_id from club_batting_private.selection_plan_settings on conflict(club_id) do nothing;
-- No real reminders, fixture edits or club checkbox changes run in this migration.
