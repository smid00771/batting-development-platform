-- Maintain the existing small roster field when evidence changes, never on reads.
create table club_selection_private.usual_team_preferences (
 roster_id uuid primary key references club_selection_private.roster(id) on delete cascade,
 club_id uuid not null references public.clubs(id),manual_names text[] not null default '{}',suppressed_grades uuid[] not null default '{}'
);
create index usual_team_preferences_club_idx on club_selection_private.usual_team_preferences(club_id);
create table club_selection_private.usual_team_evidence (
 club_id uuid not null references public.clubs(id),fixture_id uuid not null references club_selection_private.fixtures(id) on delete cascade,
 roster_id uuid not null references club_selection_private.roster(id) on delete cascade,grade_id uuid not null,
 played_on date not null,basis text not null check(basis in ('published','completed')),primary key(fixture_id,roster_id)
);
create index usual_team_evidence_roster_idx on club_selection_private.usual_team_evidence(roster_id);
create index usual_team_evidence_player_idx on club_selection_private.usual_team_evidence(club_id,roster_id,played_on);
create table club_selection_private.usual_team_pending(club_id uuid primary key references public.clubs(id) on delete cascade);
alter table club_selection_private.usual_team_preferences enable row level security;
alter table club_selection_private.usual_team_evidence enable row level security;
alter table club_selection_private.usual_team_pending enable row level security;
revoke all on club_selection_private.usual_team_preferences,club_selection_private.usual_team_evidence,club_selection_private.usual_team_pending from public,anon,authenticated,service_role;
insert into club_selection_private.usual_team_preferences(roster_id,club_id,manual_names) select id,club_id,usual_grades from club_selection_private.roster;

create function club_selection_private.usual_team_lineups(c uuid) returns table(fixture_id uuid,roster_id uuid,grade_id uuid,played_on date,basis text)
language sql stable set search_path='' as $$
 with fixtures as materialized (
  select f.id,coalesce(f.published->'details',f.details) d,f.published,rs.source_match_id,rs.team_id
  from club_selection_private.fixtures f left join club_selection_private.fixture_result_sources rs on rs.club_id=c and rs.fixture_id=f.id
  where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
   and not coalesce((f.published#>>'{details,cancelled}')::boolean,false) and rs.no_play is null
 ), source as materialized (
  select f.*,team.value actual_team from fixtures f
  left join lateral(select s.scorecard from public.match_review_scorecards s where s.club_id=c and s.source_match_id=f.source_match_id order by s.created_at desc,s.id desc limit 1) latest on true
  left join lateral(select t.value from jsonb_array_elements(latest.scorecard->'teams') t(value)
   where t.value->>'id'=f.team_id::text and t.value->>'lineup_available'='true' and jsonb_typeof(t.value->'players')='array' and jsonb_array_length(t.value->'players')>0
    and latest.scorecard->>'status'='completed' and latest.scorecard->>'provider' in ('playhq_au','playcricket_au')
    and latest.scorecard->>'match_id'=f.source_match_id::text and latest.scorecard->>'format_key'=f.d->>'format'
    and latest.scorecard->'dates'=(select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(f.d->'days') day)) team on true
 ), mappings as materialized (
  select f.id,person->>'player_id' source_id,r.id roster_id
  from source f cross join lateral jsonb_array_elements(f.actual_team->'players') person
  left join club_selection_private.scorecard_roster_links l on l.club_id=c and l.source_player_id::text=person->>'player_id'
  left join public.match_review_player_links pl on pl.club_id=c and pl.source_player_id::text=person->>'player_id'
  left join club_batting_private.roster_players rp on rp.club_id=c and rp.player_id=pl.player_id
  left join club_selection_private.roster r on r.club_id=c and r.id=coalesce(l.roster_id,rp.roster_id)
 ), confirmed as (
  select f.*,f.actual_team is not null and not exists(select 1 from mappings m where m.id=f.id and m.roster_id is null)
   and (select count(*)=count(distinct roster_id) from mappings m where m.id=f.id) complete
  from source f
 ), lineups as (
  select f.id,f.d,case when complete then 'completed' else 'published' end basis,
   case when complete then (select jsonb_agg(jsonb_build_object('d1',roster_id)) from mappings m where m.id=f.id) else coalesce(f.published->'slots','[]') end slots
  from confirmed f
 ) select distinct f.id,r.id,g.id,(select min((day->>'date')::date) from jsonb_array_elements(f.d->'days') day),f.basis
 from lineups f cross join lateral jsonb_array_elements(f.slots) slot
 cross join lateral(values(nullif(slot->>'d1','')::uuid),(nullif(slot->>'d2','')::uuid)) pick(id)
 join club_selection_private.roster r on r.club_id=c and r.id=pick.id
 join public.playing_groups g on g.club_id=c and g.id=club_selection_private.fixture_group_id(c,f.d) and g.active
$$;

create function club_selection_private.refresh_usual_teams(c uuid) returns void
language plpgsql security definer set search_path='' as $$
declare evidence jsonb;season jsonb;today date;p record;names text[];previous_flag text;changed integer:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select coalesce(jsonb_agg(to_jsonb(e)),'[]') into evidence from club_selection_private.usual_team_lineups(c) e where played_on is not null;
 delete from club_selection_private.usual_team_evidence e where e.club_id=c and not exists(select 1 from jsonb_to_recordset(evidence) as x(fixture_id uuid,roster_id uuid) where x.fixture_id=e.fixture_id and x.roster_id=e.roster_id);
 insert into club_selection_private.usual_team_evidence(club_id,fixture_id,roster_id,grade_id,played_on,basis)
  select c,x.* from jsonb_to_recordset(evidence) as x(fixture_id uuid,roster_id uuid,grade_id uuid,played_on date,basis text)
  on conflict(fixture_id,roster_id) do update set grade_id=excluded.grade_id,played_on=excluded.played_on,basis=excluded.basis
   where (usual_team_evidence.grade_id,usual_team_evidence.played_on,usual_team_evidence.basis) is distinct from (excluded.grade_id,excluded.played_on,excluded.basis);
 season:=club_selection_private.selection_returning_context(c,'[]')->'season';
 select (now() at time zone coalesce(timezone,'Australia/Sydney'))::date into today from club_selection_private.access where club_id=c;
 previous_flag:=current_setting('mirelion.usual_teams_refresh',true);perform set_config('mirelion.usual_teams_refresh','yes',true);
 for p in select r.id,r.usual_grades,coalesce(pref.manual_names,'{}'::text[]) manual_names,coalesce(pref.suppressed_grades,'{}'::uuid[]) suppressed
  from club_selection_private.roster r left join club_selection_private.usual_team_preferences pref on pref.roster_id=r.id where r.club_id=c and r.active loop
  with grades as (
   select g.name,count(*) filter(where e.played_on<=today) matches,max(e.played_on) recent
   from club_selection_private.usual_team_evidence e join public.playing_groups g on g.id=e.grade_id and g.club_id=c and g.active
   where e.club_id=c and e.roster_id=p.id and e.played_on between (season->>'start')::date and (season->>'end')::date and not e.grade_id=any(p.suppressed)
   group by g.id,g.name
  ), ordered as (
   select name,case when (select coalesce(sum(matches),0) from grades)>=3 then 0 else 2 end priority,-matches frequency,recent,
    0::bigint manual_position from grades
   union all select name,1,0,null,n from unnest(p.manual_names) with ordinality m(name,n)
  ), names as (
   select distinct on (club_selection_private.player_name_key(name)) name,priority,frequency,recent,manual_position
   from ordered order by club_selection_private.player_name_key(name),priority,frequency,recent desc nulls last,manual_position
  ) select coalesce(array_agg(name order by priority,frequency,recent desc nulls last,manual_position,name),'{}') into names
   from (select * from names order by priority,frequency,recent desc nulls last,manual_position,name limit 30) limited;
  if names is distinct from p.usual_grades then update club_selection_private.roster set usual_grades=names,updated_at=now() where id=p.id and club_id=c;changed:=changed+1;end if;
 end loop;
 perform set_config('mirelion.usual_teams_refresh',coalesce(previous_flag,''),true);
 if changed>0 then update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;end if;
end $$;

create function club_selection_private.usual_team_roster_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare pref club_selection_private.usual_team_preferences%rowtype;manual text[];suppressed uuid[];
begin
 if current_setting('mirelion.usual_teams_refresh',true)='yes' then return null;end if;
 if tg_op='INSERT' then
  insert into club_selection_private.usual_team_preferences(roster_id,club_id,manual_names) values(new.id,new.club_id,new.usual_grades) on conflict do nothing;
 elsif new.usual_grades is distinct from old.usual_grades then
  select * into pref from club_selection_private.usual_team_preferences where roster_id=new.id for update;
  select club_selection_private.normal_usual_grades(coalesce(array_agg(name order by n),'{}')) into manual from unnest(new.usual_grades) with ordinality x(name,n)
   where name=any(coalesce(pref.manual_names,old.usual_grades)) or not name=any(old.usual_grades);
  select coalesce(array_agg(distinct id),'{}') into suppressed from (
   select g.id from public.playing_groups g where g.club_id=new.club_id and g.name=any(old.usual_grades) and not g.name=any(new.usual_grades)
   union select g.id from public.playing_groups g where g.club_id=new.club_id and g.id=any(pref.suppressed_grades) and not g.name=any(new.usual_grades)
  ) removed;
  insert into club_selection_private.usual_team_preferences(roster_id,club_id,manual_names,suppressed_grades) values(new.id,new.club_id,manual,suppressed)
   on conflict(roster_id) do update set manual_names=excluded.manual_names,suppressed_grades=excluded.suppressed_grades;
 end if;
 insert into club_selection_private.usual_team_pending values(new.club_id) on conflict do nothing;
 return null;
end $$;

create function club_selection_private.usual_team_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if tg_table_name='playing_groups' and tg_op='UPDATE' then
  if new.name is distinct from old.name then
   update club_selection_private.usual_team_preferences set manual_names=club_selection_private.normal_usual_grades(array_replace(manual_names,old.name,new.name))
    where club_id=new.club_id and old.name=any(manual_names);
  end if;
 end if;
 if tg_op<>'INSERT' then c:=old.club_id;insert into club_selection_private.usual_team_pending values(c) on conflict do nothing;end if;
 if tg_op<>'DELETE' then c:=new.club_id;insert into club_selection_private.usual_team_pending values(c) on conflict do nothing;end if;
 return null;
end $$;
create function club_selection_private.usual_team_flush() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from club_selection_private.usual_team_pending where club_id=new.club_id;
 if found then perform club_selection_private.refresh_usual_teams(new.club_id);end if;return null;
end $$;
create trigger usual_teams_roster after insert or update of usual_grades,active on club_selection_private.roster for each row execute function club_selection_private.usual_team_roster_changed();
create trigger usual_teams_fixtures after insert or delete or update of published,details on club_selection_private.fixtures for each row execute function club_selection_private.usual_team_changed();
create trigger usual_teams_scores after insert or update or delete on public.match_review_scorecards for each row execute function club_selection_private.usual_team_changed();
create trigger usual_teams_sources after insert or update or delete on club_selection_private.fixture_result_sources for each row execute function club_selection_private.usual_team_changed();
create trigger usual_teams_identities after insert or update or delete on club_selection_private.scorecard_roster_links for each row execute function club_selection_private.usual_team_changed();
create trigger usual_teams_batting_identities after insert or update or delete on public.match_review_player_links for each row execute function club_selection_private.usual_team_changed();
create trigger usual_teams_roster_links after insert or update or delete on club_batting_private.roster_players for each row execute function club_selection_private.usual_team_changed();
create trigger usual_teams_grades after insert or update or delete on public.playing_groups for each row execute function club_selection_private.usual_team_changed();
create trigger usual_teams_season after insert or update or delete on club_selection_private.season_stats_settings for each row execute function club_selection_private.usual_team_changed();
create constraint trigger usual_teams_apply after insert on club_selection_private.usual_team_pending deferrable initially deferred for each row execute function club_selection_private.usual_team_flush();

-- Merge only explicit preferences. Final fixture/source identities rebuild evidence.
create function club_selection_private.merge_usual_teams(c uuid,old_id uuid,new_id uuid) returns void
language plpgsql set search_path='' as $$
begin
 update club_selection_private.usual_team_preferences p set manual_names=club_selection_private.normal_usual_grades(p.manual_names||o.manual_names),
  suppressed_grades=array(select distinct unnest(p.suppressed_grades||o.suppressed_grades))
 from club_selection_private.usual_team_preferences o where p.club_id=c and o.club_id=c and p.roster_id=new_id and o.roster_id=old_id;
end $$;
do $patch$
declare definition text:=pg_get_functiondef('club_batting_private.consolidate_scorecard_roster(uuid,uuid,uuid,text)'::regprocedure);
 needle text:='usual_grades=club_selection_private.normal_usual_grades(array[grade]||usual_grades||array[original.grade]||original.usual_grades),';
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected roster merge';end if;
 definition:=replace(definition,needle,'');
 definition:=replace(definition,'update club_selection_private.roster set name=source_name,active=true,','perform club_selection_private.merge_usual_teams(c,old_id,new_id);'||E'\n update club_selection_private.roster set name=source_name,active=true,');
 execute definition;
end $patch$;

-- Quiet daily rollover also lets a published selection become a played appearance.
create function club_selection_private.queue_usual_teams_rollover() returns void
language sql security definer set search_path='' as $$
 insert into club_selection_private.usual_team_pending select club_id from club_selection_private.access where status='active' on conflict do nothing
$$;
revoke all on function club_selection_private.usual_team_lineups(uuid),club_selection_private.refresh_usual_teams(uuid),club_selection_private.usual_team_roster_changed(),club_selection_private.usual_team_changed(),club_selection_private.usual_team_flush(),club_selection_private.merge_usual_teams(uuid,uuid,uuid),club_selection_private.queue_usual_teams_rollover() from public,anon,authenticated,service_role;
select cron.schedule('usual-teams-rollover','15 16 * * *','select club_selection_private.queue_usual_teams_rollover()');
select club_selection_private.queue_usual_teams_rollover();
