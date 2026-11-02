-- Club Admin publication and explicitly scoped bulk availability.
-- Preserve existing selection editors, validation, locks and receipt handling.

-- The publication's shared Playing Group sync must recognise the same Admin authority.
do $migration$
declare definition text;before text;after text;
begin
 definition:=pg_get_functiondef('club_selection_private.sync_publication_groups(uuid,uuid[])'::regprocedure);
 before:=$old$or club_selection_private.publication_head(c) is distinct from auth.uid()$old$;
 after:=$new$or (club_selection_private.publication_head(c) is distinct from auth.uid()
   and not exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role='admin'))$new$;
 if position(before in definition)=0 then raise exception 'Unexpected publication group-sync authority';end if;
 execute replace(definition,before,after);
end $migration$;

do $migration$
declare definition text;before text;after text;
begin
 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 before:=$old$if p_action in ('save_board','publish','send_review','history') and not sel then$old$;
 after:=$new$if p_action in ('save_board','publish','send_review','history') and not sel and not (adm and p_action in ('publish','history')) then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 0';end if;
 definition:=replace(definition,before,after);
 before:=$old$if p_action='publish' and not club_selection_private.scoped_selections(c)$old$;
 after:=$new$if p_action='publish' and not adm and not club_selection_private.scoped_selections(c)$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 1';end if;
 definition:=replace(definition,before,after);
 before:=$old$if club_selection_private.scoped_selections(c) and (not club_selection_private.selection_edit(c,m.details,me) or (p_action='publish' and club_selection_private.fixture_publisher(c,m.details) is distinct from me)) then$old$;
 after:=$new$if club_selection_private.scoped_selections(c) and not (adm and p_action='publish') and (not club_selection_private.selection_edit(c,m.details,me) or (p_action='publish' and club_selection_private.fixture_publisher(c,m.details) is distinct from me)) then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 2';end if;
 definition:=replace(definition,before,after);
 before:=$old$'can_view_board',sel or cap$old$;
 after:=$new$'can_view_board',adm or sel or cap$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 3';end if;
 definition:=replace(definition,before,after);
 before:=$old$case when club_selection_private.selection_view(c,f.details,me) then to_jsonb(f)$old$;
 after:=$new$case when adm or club_selection_private.selection_view(c,f.details,me) then to_jsonb(f)$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 4';end if;
 definition:=replace(definition,before,after);
 before:=$old$'can_publish',club_selection_private.fixture_publisher(c,f.details)=me,'can_unlock',case$old$;
 after:=$new$'can_publish',adm or club_selection_private.fixture_publisher(c,f.details)=me,'can_unlock',adm or case$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 5';end if;
 definition:=replace(definition,before,after);
 before:=$old$where f.club_id=c and ((not club_selection_private.scoped_selections(c) and (adm or sel or cap))$old$;
 after:=$new$where f.club_id=c and (adm or (not club_selection_private.scoped_selections(c) and (sel or cap))$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 6';end if;
 definition:=replace(definition,before,after);
 before:=$old$if club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,m.details,me) then$old$;
 after:=$new$if not adm and club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,m.details,me) then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 7';end if;
 definition:=replace(definition,before,after);
 before:=$old$if m.published is not null and ((club_selection_private.scoped_selections(c)$old$;
 after:=$new$if not adm and m.published is not null and ((club_selection_private.scoped_selections(c)$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 8';end if;
 definition:=replace(definition,before,after);
 before:=$old$   if not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then$old$;
 after:=$new$   if not adm and not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 9';end if;
 definition:=replace(definition,before,after);
 before:=$old$  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active order by id loop$old$;
 after:=$new$  -- Omitted scope retains old clients' whole-club workflow. A supplied scope is exact.
  if p_data ? 'scope_ids' then
   if jsonb_typeof(p_data->'scope_ids') is distinct from 'array' then raise exception 'Choose players for this date';end if;
   ids:=array(select jsonb_array_elements_text(p_data->'scope_ids')::uuid);
   if cardinality(ids) not between 1 and 2000 or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
    or cardinality(ids)<>(select count(*) from club_selection_private.roster where club_id=c and active and id=any(ids)) then
    raise exception 'Choose active players from this club playing list';end if;
   if exists(select 1 from jsonb_array_elements_text((p_data->'unavailable_ids')||coalesce(p_data->'available_ids','[]')) p where not p_data->'scope_ids' ? p.value) then
    raise exception 'Availability choices must belong to the selected players';end if;
  end if;
  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active
   and (not p_data ? 'scope_ids' or p_data->'scope_ids' ? id::text) order by id loop$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.api patch 10';end if;
 definition:=replace(definition,before,after);
 execute definition;
end $migration$;

do $migration$
declare definition text;before text;after text;
begin
 definition:=pg_get_functiondef('club_selection_private.publication_check(uuid,jsonb)'::regprocedure);
 before:=$old$if not club_selection_private.selection_viewer(c,u) then$old$;
 after:=$new$if not club_selection_private.selection_viewer(c,u) and not exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role='admin') then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.publication_check patch 0';end if;
 definition:=replace(definition,before,after);
 before:=$old$and club_selection_private.selection_view(c,f.details,u)) then$old$;
 after:=$new$and (club_selection_private.selection_view(c,f.details,u) or exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role='admin'))) then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected club_selection_private.publication_check patch 1';end if;
 definition:=replace(definition,before,after);
 execute definition;
end $migration$;


-- Loaded only when staff explicitly ask for players who played a grade.
create function club_selection_private.availability_candidates(c uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $function$
declare u uuid:=auth.uid();tz text;result jsonb;
begin
 if u is null or not club_selection_private.member(c,u) then raise exception 'Club membership required';end if;
 if not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if not club_selection_private.selection_editor(c,u) and not exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role='admin') then raise exception 'Club Admin or selector access required';end if;
 select timezone into tz from club_selection_private.access where club_id=c;
 with prior as materialized (
  select club_selection_private.fixture_group_id(c,p.details) grade_id,p.details,p.slots
  from club_selection_private.drop_prior_lineups(c) p
  where p.ends<=(now() at time zone tz)::date and p.lineup_source<>'unknown'
   and (p.lineup_source='completed_scorecard' or club_selection_private.fixture_completed(p.details,tz,now()))
 ), players as (
  select distinct p.grade_id,p.details->>'grade' grade,r.id
  from prior p cross join lateral jsonb_array_elements(p.slots) slot
  cross join lateral (values(nullif(slot->>'d1','')::uuid),(nullif(slot->>'d2','')::uuid)) pick(id)
  join club_selection_private.roster r on r.id=pick.id and r.club_id=c and r.active
 ), teams as (
  select grade_id,case when grade_id is null then grade end legacy_grade,
   min(grade) grade,jsonb_agg(distinct id order by id) player_ids from players
  group by grade_id,case when grade_id is null then grade end
 )
 select coalesce(jsonb_agg(jsonb_build_object('grade_id',grade_id,'grade',grade,'player_ids',player_ids) order by grade),'[]') into result from teams;
 return jsonb_build_object('teams',result);
end $function$;
revoke all on function club_selection_private.availability_candidates(uuid) from public,anon,authenticated,service_role;

do $migration$
declare definition text;before text;after text;
begin
 definition:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 before:=$old$ if p_action='publication_check' then$old$;
 after:=$new$ if p_action='availability_candidates' then return club_selection_private.availability_candidates(p_club_id);end if;
 if p_action='publication_check' then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected public.club_selections_api patch 0';end if;
 definition:=replace(definition,before,after);
 before:=$old$'can_view',club_selection_private.selection_group_level(p_club_id,g.id,auth.uid())>0$old$;
 after:=$new$'can_view',coalesce((result->>'admin')::boolean,false) or club_selection_private.selection_group_level(p_club_id,g.id,auth.uid())>0$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected public.club_selections_api patch 1';end if;
 definition:=replace(definition,before,after);
 execute definition;
end $migration$;
