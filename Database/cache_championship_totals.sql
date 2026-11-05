-- Build Championship tables on writes. Public standings reads never calculate.
create table club_standings_private.championship_totals (
 club_id uuid primary key references club_standings_private.settings(club_id) on delete cascade,
 season_id uuid not null, data jsonb not null,
 computed_at timestamptz not null, checked_at timestamptz, source_problem boolean not null default false
);
alter table club_standings_private.championship_totals enable row level security;
revoke all on club_standings_private.championship_totals from public,anon,authenticated,service_role;
create index standings_enabled_season on club_standings_private.settings(season_id)
 where championship_audience<>'off';

-- Settings saves may hold a totals lock while queuing new competitions. Do not
-- try inserting existing jobs: an active worker already owns those job rows.
do $queue$
declare definition text:=pg_get_functiondef('club_standings_private.queue(uuid)'::regprocedure);
 needle text:=') sources on conflict do nothing;';
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected standings queue';end if;
 execute replace(definition,needle,') sources where not exists(select 1 from club_selection_private.playhq_jobs j
  where j.club_id=c and j.kind=''ladder'' and j.source_id=sources.source_id and j.team_id=conn.organisation_id) on conflict do nothing;');
end $queue$;

-- Retain the verified calculation unchanged, under a write-only internal name.
do $copy$
declare definition text:=pg_get_functiondef('club_standings_private.championship(uuid,uuid)'::regprocedure);
begin
 if position('with settings as' in definition)=0 then raise exception 'Unexpected Championship calculation';end if;
 execute replace(definition,'FUNCTION club_standings_private.championship(',
  'FUNCTION club_standings_private.calculate_championship(');
end $copy$;
revoke all on function club_standings_private.calculate_championship(uuid,uuid) from public,anon,authenticated,service_role;

create function club_standings_private.refresh_championship(c uuid,recalculate boolean) returns void
language plpgsql set search_path='' as $$
declare s club_standings_private.settings%rowtype;result jsonb;oldest timestamptz;problem boolean;
begin
 -- Serialize shared-grade and settings writers without locking player reads.
 perform pg_advisory_xact_lock(hashtextextended(c::text,9346));
 select * into s from club_standings_private.settings where club_id=c;
 if s.club_id is null or s.season_id is null or s.championship_audience='off' then
  delete from club_standings_private.championship_totals where club_id=c;return;
 end if;
 if recalculate or not exists(select 1 from club_standings_private.championship_totals where club_id=c and season_id=s.season_id) then
  result:=club_standings_private.calculate_championship(c,s.season_id)-'checked_at'-'stale';
  insert into club_standings_private.championship_totals(club_id,season_id,data,computed_at)
   values(c,s.season_id,result,clock_timestamp())
   on conflict(club_id) do update set season_id=excluded.season_id,data=excluded.data,computed_at=excluded.computed_at;
 end if;
 -- An unchanged provider response or failed check changes freshness, not totals.
 select min(l.checked_at),coalesce(bool_or(l.last_error is not null or l.data is null or l.checked_at is null),true)
 into oldest,problem
 from jsonb_array_elements(s.rules) r left join club_standings_private.ladders l
  on l.season_id=s.season_id and l.grade_id=(r->>'grade_id')::uuid;
 update club_standings_private.championship_totals set checked_at=oldest,source_problem=problem
  where club_id=c and (checked_at,source_problem) is distinct from (oldest,problem);
end $$;
revoke all on function club_standings_private.refresh_championship(uuid,boolean) from public,anon,authenticated,service_role;

create function club_standings_private.championship_settings_changed() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.season_id,new.title,new.calculation,new.minimum_teams,new.rules,new.championship_audience='off')
  is not distinct from (old.season_id,old.title,old.calculation,old.minimum_teams,old.rules,old.championship_audience='off') then return null;end if;
 perform club_standings_private.refresh_championship(new.club_id,true);return null;
end $$;
revoke all on function club_standings_private.championship_settings_changed() from public,anon,authenticated,service_role;
create trigger championship_settings_changed after insert or update of season_id,title,calculation,minimum_teams,rules,championship_audience
 on club_standings_private.settings for each row execute function club_standings_private.championship_settings_changed();

create function club_standings_private.championship_ladder_changed() returns trigger
language plpgsql set search_path='' as $$
declare c uuid;recalculate boolean;
begin
 if tg_op='UPDATE' and (new.season_id,new.grade_id,new.data,new.checked_at,new.last_error)
  is not distinct from (old.season_id,old.grade_id,old.data,old.checked_at,old.last_error) then return null;end if;
 recalculate:=tg_op<>'UPDATE' or (new.season_id,new.grade_id,new.data) is distinct from (old.season_id,old.grade_id,old.data);
 -- A shared ladder updates only the clubs whose configured Championship uses it.
 for c in select s.club_id from club_standings_private.settings s where s.championship_audience<>'off' and (
   (tg_op<>'INSERT' and s.season_id=old.season_id and s.rules @> jsonb_build_array(jsonb_build_object('grade_id',old.grade_id::text)))
   or (tg_op<>'DELETE' and s.season_id=new.season_id and s.rules @> jsonb_build_array(jsonb_build_object('grade_id',new.grade_id::text))))
  order by s.club_id loop
  perform club_standings_private.refresh_championship(c,recalculate);
 end loop;
 return null;
end $$;
revoke all on function club_standings_private.championship_ladder_changed() from public,anon,authenticated,service_role;
create trigger championship_ladder_changed after insert or delete or update of season_id,grade_id,data,checked_at,last_error
 on club_standings_private.ladders for each row execute function club_standings_private.championship_ladder_changed();

create or replace function club_standings_private.championship(c uuid,sid uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce((select data||jsonb_build_object('checked_at',checked_at,
   'stale',source_problem or checked_at is null or checked_at<now()-interval '1 day')
  from club_standings_private.championship_totals where club_id=c and season_id=sid),
  jsonb_build_object('title','Club Championship','complete',false,'missing',jsonb_build_array('saved standings'),
   'rows','[]'::jsonb,'checked_at',null,'stale',true))
$$;
revoke all on function club_standings_private.championship(uuid,uuid) from public,anon,authenticated,service_role;

-- Warm existing enabled clubs once, so the first player also reads saved totals.
do $$ declare c uuid;begin
 for c in select club_id from club_standings_private.settings where championship_audience<>'off' order by club_id loop
  perform club_standings_private.refresh_championship(c,true);
 end loop;
end $$;
