-- Keep group/grade resolution out of correlated player and fixture joins.
-- Materialize each draft/published scope once; retain all movement and availability rules.

CREATE OR REPLACE FUNCTION club_selection_private.lower_grade_moves(c uuid)
 RETURNS TABLE(fixture_id uuid, roster_id uuid, previous_fixture_id uuid, previous_grade text, grade text, competition text, format text, start_date text, movement_key text, previous_captains uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 -- Resolve each snapshot's scope once, before joining fixtures and player slots.
 -- Calling the grade resolver inside those joins can exceed the RPC timeout.
 with prior as materialized (
  select f.id,f.published, f.published->'details' d,
   club_selection_private.selection_scope(c,f.published->'details') scope,
   (f.published->'details'->'days'->0->>'date')::date starts,
   club_selection_private.grade_level(c,f.published->'details'->>'competition',f.published->'details'->>'grade') level
  from club_selection_private.fixtures f where f.club_id=c and f.published is not null and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
 ), current_fixtures as materialized (
  select f.*, (f.details->'days'->0->>'date')::date starts,
   club_selection_private.selection_scope(c,f.details) scope,
   club_selection_private.grade_level(c,f.details->>'competition',f.details->>'grade') level
  from club_selection_private.fixtures f where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
 )
 select f.id,person.pid,p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts::text,
  md5(jsonb_build_array(p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts)::text),
  array(select distinct r.user_id from jsonb_each(coalesce(p.d->'match_roles','{}')) role
   join club_selection_private.roster r on r.club_id=c and r.id::text=role.value->>'captain_id'
   where r.user_id is not null
   union select nullif(p.d->>'captain_id','')::uuid where not(p.d ? 'match_roles') and nullif(p.d->>'captain_id','') is not null)
 from current_fixtures f
 cross join lateral (select distinct nullif(ids.value,'')::uuid pid from jsonb_array_elements(f.slots) slot,
  lateral (select slot->>'d1' value union select slot->>'d2') ids where nullif(ids.value,'') is not null) person
 cross join lateral (
  select p.* from prior p
  where p.scope=f.scope
   and coalesce(p.d->>'format','')=coalesce(f.details->>'format','')
   and coalesce(p.d->>'season','')=coalesce(f.details->>'season','')
   and date_trunc('week',p.starts::timestamp)=(
    select max(date_trunc('week',q.starts::timestamp)) from prior q
    where q.scope=f.scope
     and coalesce(q.d->>'format','')=coalesce(f.details->>'format','')
     and coalesce(q.d->>'season','')=coalesce(f.details->>'season','')
     and q.starts<f.starts and date_trunc('week',q.starts::timestamp)<date_trunc('week',f.starts::timestamp)
     and q.starts>=f.starts-120)
   and exists(select 1 from jsonb_array_elements(p.published->'slots') slot where slot->>'d1'=person.pid::text or slot->>'d2'=person.pid::text)
  order by p.level desc nulls first,p.starts desc,p.id limit 1
 ) p
 where f.level>p.level
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.selection_followups(c uuid)
 RETURNS TABLE(fixture_id uuid, roster_id uuid, previous_fixture_id uuid, previous_grade text, grade text, competition text, format text, start_date text, movement_key text, previous_captains uuid[], kind text, availability text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with prior as materialized (
  select f.id,f.published,f.published->'details' d,
   club_selection_private.selection_scope(c,f.published->'details') scope,
   (select max((day->>'date')::date) from jsonb_array_elements(f.published->'details'->'days') day) ends
  from club_selection_private.fixtures f where f.club_id=c and f.published is not null
   and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
   and not exists(select 1 from club_selection_private.fixture_result_sources rs where rs.fixture_id=f.id and rs.no_play is not null)
 ), picked_fixtures as materialized (
  select f.id,f.details d,f.slots,
   club_selection_private.selection_scope(c,f.details) scope
  from club_selection_private.fixtures f where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
 ), current_fixtures as materialized (
  select f.*,(f.d->'days'->0->>'date')::date starts,
   date_trunc('week',(f.d->'days'->0->>'date')::date)::date week
  from picked_fixtures f
  where not exists(select 1 from club_selection_private.fixture_result_sources rs where rs.fixture_id=f.id and rs.no_play is not null)
 ), omitted as (
  select distinct on (f.week,f.scope,coalesce(f.d->>'season',''),coalesce(f.d->>'format',''),person.pid)
   f.id fixture_id,person.pid roster_id,p.id previous_fixture_id,p.d->>'grade' previous_grade,f.d->>'grade' grade,
   f.d->>'competition' competition,f.d->>'format' format,f.starts::text start_date,
   md5(jsonb_build_array('left_out',p.id,f.week,lower(btrim(f.d->>'competition')),f.d->>'season',f.d->>'format')::text) movement_key,
   club_selection_private.match_captain_users(c,p.d) previous_captains,
   case when not exists(select 1 from jsonb_array_elements(f.d->'days') day where club_selection_private.day_status(person.pid,day)<>'available') then 'available'
    when exists(select 1 from club_selection_private.availability a,jsonb_array_elements(f.d->'days') day where a.roster_id=person.pid and coalesce(to_jsonb(a)->'unavailable_dates','[]'::jsonb) ? (day->>'date')) then 'unavailable'
    else 'unknown' end availability
  from current_fixtures f join prior p on p.scope=f.scope
   and coalesce(p.d->>'format','')=coalesce(f.d->>'format','') and coalesce(p.d->>'season','')=coalesce(f.d->>'season','')
   and date_trunc('week',p.ends)::date=(select max(date_trunc('week',q.ends)::date) from prior q
    where q.scope=f.scope
     and coalesce(q.d->>'format','')=coalesce(f.d->>'format','') and coalesce(q.d->>'season','')=coalesce(f.d->>'season','')
     and q.ends<f.week and q.ends>=f.week-120)
  cross join lateral (select distinct nullif(ids.value,'')::uuid pid from jsonb_array_elements(p.published->'slots') slot,
   lateral (select slot->>'d1' value union select slot->>'d2') ids where nullif(ids.value,'') is not null) person
  join club_selection_private.roster r on r.id=person.pid and r.club_id=c and r.active
  where not exists(select 1 from picked_fixtures picked,jsonb_array_elements(picked.slots) slot
   where picked.scope=f.scope
    and coalesce(picked.d->>'season','')=coalesce(f.d->>'season','') and coalesce(picked.d->>'format','')=coalesce(f.d->>'format','')
    and exists(select 1 from jsonb_array_elements(picked.d->'days') with ordinality day(value,n)
     where date_trunc('week',(day.value->>'date')::date)::date=f.week and slot->>('d'||day.n)=person.pid::text))
  order by f.week,f.scope,coalesce(f.d->>'season',''),coalesce(f.d->>'format',''),person.pid,
   (f.d->>'grade'=p.d->>'grade') desc,p.ends desc,club_selection_private.grade_level(c,p.d->>'competition',p.d->>'grade') desc nulls last,f.starts,f.id,p.id
 )
 select m.*, 'lower_grade'::text,'available'::text from club_selection_private.lower_grade_moves(c) m
 union all select fixture_id,roster_id,previous_fixture_id,previous_grade,grade,competition,format,start_date,movement_key,previous_captains,'left_out'::text,availability from omitted
$function$;

