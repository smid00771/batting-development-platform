-- A lower-grade selection is not a grade drop when recorded unavailability
-- prevents the player meeting the higher grade's current playing-day rules.
-- A representative-duty exception does not grant general bracketing eligibility.
create or replace function club_selection_private.drop_previous_grade_available(c uuid,player uuid,previous jsonb,current_match jsonb)
returns boolean language sql stable set search_path='' as $function$
 with candidates as materialized (
  select f.details
  from club_selection_private.fixtures f
  where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
   and not exists(select 1 from club_selection_private.fixture_result_sources rs where rs.club_id=c and rs.fixture_id=f.id and rs.no_play is not null)
   and club_selection_private.selection_scope(c,f.details)=club_selection_private.selection_scope(c,current_match)
   and coalesce(f.details->>'season','')=coalesce(current_match->>'season','')
   and (case when f.details->>'format' in ('limited_overs','long_form') then 'limited_overs' else coalesce(f.details->>'format','') end)
     =(case when current_match->>'format' in ('limited_overs','long_form') then 'limited_overs' else coalesce(current_match->>'format','') end)
   and case when nullif(previous->>'grade_group_id','') is not null and nullif(f.details->>'grade_group_id','') is not null
    then previous->>'grade_group_id'=f.details->>'grade_group_id'
    else lower(btrim(previous->>'grade'))=lower(btrim(f.details->>'grade')) end
   and (select min((d->>'date')::date) from jsonb_array_elements(f.details->'days') d)<=(select max((d->>'date')::date) from jsonb_array_elements(current_match->'days') d)
   and (select max((d->>'date')::date) from jsonb_array_elements(f.details->'days') d)>=(select min((d->>'date')::date) from jsonb_array_elements(current_match->'days') d)
 ), blocked as (
  select true from candidates h join club_selection_private.availability a on a.roster_id=player
  where (select count(*) from candidates)=1
   and case when h.details->>'brackets'='true' and coalesce(h.details->>'bracket_basis','general')='general'
    then not exists(select 1 from jsonb_array_elements(h.details->'days') d where not (coalesce(a.unavailable_dates,'[]'::jsonb) ? (d->>'date')))
    else exists(select 1 from jsonb_array_elements(h.details->'days') d where coalesce(a.unavailable_dates,'[]'::jsonb) ? (d->>'date')) end
 )
 select not exists(select 1 from blocked)
$function$;
revoke all on function club_selection_private.drop_previous_grade_available(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;

do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.lower_grade_moves(uuid)'::regprocedure);
 if position('where f.level>p.level' in definition)=0 then raise exception 'Unexpected drop comparison';end if;
 if position('drop_previous_grade_available(' in definition)=0 then
  definition:=replace(definition,'where f.level>p.level','where f.level>p.level and club_selection_private.drop_previous_grade_available(c,person.pid,p.d,f.details)');
 end if;
 execute definition;
 definition:=pg_get_functiondef('club_selection_private.saved_drop_context(uuid,uuid,boolean)'::regprocedure);
 if position('and m.fixture_identity=club_selection_private.drop_fixture_identity(f.details)' in definition)=0 then raise exception 'Unexpected saved reminders';end if;
 if position('drop_previous_grade_available(' in definition)=0 then
 definition:=replace(definition,'and m.fixture_identity=club_selection_private.drop_fixture_identity(f.details)',
  'and m.fixture_identity=club_selection_private.drop_fixture_identity(f.details) and club_selection_private.drop_previous_grade_available(c,r.id,coalesce(p.published->''details'',p.details),f.details)');
 end if;
 execute definition;
 definition:=pg_get_functiondef('club_selection_private.validate_details(jsonb)'::regprocedure);
 if position('declare day jsonb;seen text[]:=''{}'';v text;' in definition)=0 then raise exception 'Unexpected fixture validation';end if;
 if position('bracket_basis' in definition)=0 then
  definition:=replace(definition,'begin',E'begin\n if d->>''bracket_basis'' is not null and d->>''bracket_basis'' not in (''general'',''representative'') then raise exception ''Choose general bracketing or representative duty only'';end if;');
 end if;
 execute definition;
end $patch$;
