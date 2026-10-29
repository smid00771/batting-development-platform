-- Grade-drop comparisons use the latest completed, linked match line-up even
-- when that team was never published through Mirelion. Unknown recent rounds
-- must not silently send the comparison back to an older published team.
create or replace function club_selection_private.drop_prior_lineups(c uuid)
returns table(fixture_id uuid,details jsonb,slots jsonb,ends date,lineup_source text)
language sql stable set search_path='' as $f$
 with fixtures as materialized (
  select f.id,coalesce(f.published->'details',f.details) d,f.published,
   rs.source_match_id,rs.team_id
  from club_selection_private.fixtures f
  left join club_selection_private.fixture_result_sources rs on rs.club_id=c and rs.fixture_id=f.id
  where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
   and not coalesce((f.published#>>'{details,cancelled}')::boolean,false) and rs.no_play is null
 ), evidence as materialized (
  select f.*,team.value actual_team
  from fixtures f
  left join lateral (
   select s.scorecard from public.match_review_scorecards s
   where s.club_id=c and s.source_match_id=f.source_match_id
   order by s.created_at desc,s.id desc limit 1
  ) latest on true
  left join lateral (
   select t.value from jsonb_array_elements(latest.scorecard->'teams') t(value)
   where t.value->>'id'=f.team_id::text and t.value->>'lineup_available'='true'
    and jsonb_typeof(t.value->'players')='array'
    and latest.scorecard->>'status'='completed'
    and latest.scorecard->>'provider' in ('playhq_au','playcricket_au')
    and latest.scorecard->>'match_id'=f.source_match_id::text
    and latest.scorecard->>'format_key'=f.d->>'format'
    and latest.scorecard->'dates'=(select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(f.d->'days') day)
  ) team on true
 )
 select f.id,f.d,
  case when f.actual_team is not null then coalesce((
   select jsonb_agg(jsonb_build_object('d1',mapped.roster_id,'d2',null) order by mapped.roster_id)
   from (
    select distinct r.id roster_id
    from jsonb_array_elements(f.actual_team->'players') person
    left join club_selection_private.scorecard_roster_links l on l.club_id=c and l.source_player_id::text=person->>'player_id'
    left join public.match_review_player_links pl on pl.club_id=c and pl.source_player_id::text=person->>'player_id'
    left join club_batting_private.roster_players rp on rp.club_id=c and rp.player_id=pl.player_id
    join club_selection_private.roster r on r.club_id=c and r.id=coalesce(l.roster_id,rp.roster_id)
   ) mapped
  ),'[]'::jsonb) else coalesce(f.published->'slots','[]'::jsonb) end,
  (select max((day->>'date')::date) from jsonb_array_elements(f.d->'days') day),
  case when f.actual_team is not null then 'completed_scorecard' when f.published is not null then 'published' else 'unknown' end
 from evidence f
$f$;
revoke all on function club_selection_private.drop_prior_lineups(uuid) from public,anon,authenticated;

create or replace function club_selection_private.lower_grade_moves(c uuid)
returns table(fixture_id uuid,roster_id uuid,previous_fixture_id uuid,previous_grade text,grade text,competition text,format text,start_date text,movement_key text,previous_captains uuid[])
language sql stable set search_path='' as $f$
 with prior as materialized (
  select p.fixture_id id,p.details d,p.slots,p.ends,
   club_selection_private.selection_scope(c,p.details) scope,
   club_selection_private.grade_level(c,p.details->>'competition',p.details->>'grade') level
  from club_selection_private.drop_prior_lineups(c) p
 ), current_fixtures as materialized (
  select f.*,(f.details->'days'->0->>'date')::date starts,
   club_selection_private.selection_scope(c,f.details) scope,
   club_selection_private.grade_level(c,f.details->>'competition',f.details->>'grade') level
  from club_selection_private.fixtures f
  where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
   and not exists(select 1 from club_selection_private.fixture_result_sources rs where rs.club_id=c and rs.fixture_id=f.id and rs.no_play is not null)
 )
 select f.id,person.pid,p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts::text,
  md5(jsonb_build_array(p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts)::text),
  club_selection_private.match_captain_users(c,p.d)
 from current_fixtures f
 cross join lateral (select distinct nullif(ids.value,'')::uuid pid from jsonb_array_elements(f.slots) slot,
  lateral (select slot->>'d1' value union select slot->>'d2') ids where nullif(ids.value,'') is not null) person
 cross join lateral (
  select p.* from prior p
  where p.scope=f.scope and coalesce(p.d->>'format','')=coalesce(f.details->>'format','')
   and coalesce(p.d->>'season','')=coalesce(f.details->>'season','')
   and date_trunc('week',p.ends::timestamp)=(
    select max(date_trunc('week',q.ends::timestamp)) from prior q
    where q.scope=f.scope and coalesce(q.d->>'format','')=coalesce(f.details->>'format','')
     and coalesce(q.d->>'season','')=coalesce(f.details->>'season','')
     and q.ends<f.starts and date_trunc('week',q.ends::timestamp)<date_trunc('week',f.starts::timestamp)
     and q.ends>=f.starts-120)
   and exists(select 1 from jsonb_array_elements(p.slots) slot where slot->>'d1'=person.pid::text or slot->>'d2'=person.pid::text)
  order by p.level desc nulls first,p.ends desc,p.id limit 1
 ) p
 where f.level>p.level
$f$;

-- Reading saved reminders remains a small join: no historical/source scan.
-- Unpublished actual teams retain their captain/coach permissions too.
do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.saved_drop_context(uuid,uuid,boolean)'::regprocedure);
begin
 if position('p.published -> ''details''' in definition)>0 then
  raise exception 'Unexpected normalized reminder definition';
 end if;
 if position('p.published->''details''' in definition)=0 then raise exception 'Unexpected saved reminder context';end if;
 definition:=replace(definition,'p.published->''details''','coalesce(p.published->''details'',p.details)');
 definition:=replace(definition,'''previous_grade'',m.previous_grade,',
  '''previous_grade'',m.previous_grade,''previous_date'',(select max(day->>''date'') from jsonb_array_elements(coalesce(p.published->''details'',p.details)->''days'') day),');
 execute definition;
end $patch$;

-- Discard only derived reminders contradicted by the corrected comparison.
-- Keep every saved spoken-to record; the next explicit request captures new drops.
with clubs as materialized (select distinct club_id from club_selection_private.dropped_player_reminders),
valid as materialized (select c.club_id,m.* from clubs c cross join lateral club_selection_private.lower_grade_moves(c.club_id) m)
delete from club_selection_private.dropped_player_reminders r
where not exists(select 1 from valid v where v.club_id=r.club_id and v.fixture_id=r.fixture_id and v.roster_id=r.roster_id and v.movement_key=r.movement_key);
