-- Limited overs and long form are consecutive formats of the same grade
-- competition. T20 keeps its own comparison history. Selection-group, season,
-- completed-round, identity and saved-conversation safeguards remain unchanged.
CREATE OR REPLACE FUNCTION club_selection_private.lower_grade_moves(c uuid)
 RETURNS TABLE(fixture_id uuid, roster_id uuid, previous_fixture_id uuid, previous_grade text, grade text, competition text, format text, start_date text, movement_key text, previous_captains uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with prior as materialized (
  select p.fixture_id id,p.details d,p.slots,p.ends,
   case when p.details->>'format' in ('limited_overs','long_form') then 'limited_overs' else coalesce(p.details->>'format','') end comparison_format,
   club_selection_private.selection_scope(c,p.details) scope,
   club_selection_private.grade_level(c,p.details->>'competition',p.details->>'grade') level
  from club_selection_private.drop_prior_lineups(c) p
 ), current_fixtures as materialized (
  select f.*,(f.details->'days'->0->>'date')::date starts,
   case when f.details->>'format' in ('limited_overs','long_form') then 'limited_overs' else coalesce(f.details->>'format','') end comparison_format,
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
  where p.scope=f.scope and p.comparison_format=f.comparison_format
   and coalesce(p.d->>'season','')=coalesce(f.details->>'season','')
   and date_trunc('week',p.ends::timestamp)=(
    select max(date_trunc('week',q.ends::timestamp)) from prior q
    where q.scope=f.scope and q.comparison_format=f.comparison_format
     and coalesce(q.d->>'season','')=coalesce(f.details->>'season','')
     and q.ends<f.starts and date_trunc('week',q.ends::timestamp)<date_trunc('week',f.starts::timestamp)
     and q.ends>=f.starts-120)
   and exists(select 1 from jsonb_array_elements(p.slots) slot where slot->>'d1'=person.pid::text or slot->>'d2'=person.pid::text)
  order by p.level desc nulls first,p.ends desc,p.id limit 1
 ) p
 where f.level>p.level
$function$
;
