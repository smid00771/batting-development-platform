-- An unnamed wicketkeeper is informational; other selection guards still apply.
do $keeper$
declare definition text:=pg_get_functiondef('club_selection_private.issues(uuid)'::regprocedure);
 needle text:=$needle$  foreach key in array array['captain','keeper'] loop$needle$;
begin
 if position(needle in definition)=0 then raise exception 'Unexpected match appointment validation';end if;
 definition:=replace(definition,needle,needle||$insert$
   if key='keeper' and nullif(m.details->'match_roles'->('d'||i)->>'keeper_id','') is null then
    notes:=notes||jsonb_build_array(jsonb_build_object('level','warning','code','missing_keeper','match_role',true,'text','Day '||i||': Wicketkeeper not named'));
    continue;
   end if;$insert$);
 definition:=replace(definition,
  $old$if k=0 and nullif(m.details->'match_roles'->key->>'keeper_id','') is null then$old$,
  $new$if k=0 and not (m.details ? 'match_roles') then$new$);
 definition:=replace(definition,
  $old$'level','warning','text','Day '||i||': no wicketkeeper'$old$,
  $new$'level','warning','code','missing_keeper','text','Day '||i||': Wicketkeeper not named'$new$);
 execute definition;
 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 definition:=replace(definition,
  $old$n->>'level'='warning' and n->>'code' is distinct from 'short_team'$old$,
  $new$n->>'level'='warning' and n->>'code' is distinct from 'short_team' and n->>'code' is distinct from 'missing_keeper'$new$);
 execute definition;
end $keeper$;

-- Full selection validation is requested once when opening publication review.
-- Ordinary board context remains quiet. This endpoint makes no writes.
create or replace function club_selection_private.publication_check(c uuid,data jsonb)
returns jsonb language plpgsql stable set search_path='' as $f$
declare u uuid:=auth.uid();ids uuid[];
begin
 if u is null or not club_selection_private.member(c,u) then raise exception 'Club membership required';end if;
 if not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if not club_selection_private.selection_viewer(c,u) then raise exception 'Selector access required';end if;
 if jsonb_typeof(data->'ids') is distinct from 'array' or jsonb_array_length(data->'ids') not between 1 and 30 then raise exception 'Choose between 1 and 30 teams to review';end if;
 ids:=array(select jsonb_array_elements_text(data->'ids')::uuid);
 if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'Choose each team once';end if;
 if cardinality(ids)<>(select count(*) from club_selection_private.fixtures f where f.club_id=c and f.id=any(ids) and club_selection_private.selection_view(c,f.details,u)) then
  raise exception 'View access to each Selection Group is required';
 end if;
 return jsonb_build_object('fixtures',(select jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,
  'issues',case when coalesce((f.details->>'cancelled')::boolean,false) then '[]'::jsonb else club_selection_private.issues(f.id) end)
  order by array_position(ids,f.id)) from club_selection_private.fixtures f where f.club_id=c and f.id=any(ids)));
end $f$;
revoke all on function club_selection_private.publication_check(uuid,jsonb) from public,anon,authenticated;

do $patch$
declare definition text:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 needle text:=$needle$ if p_action='set_access' then$needle$;
begin
 if position(needle in definition)=0 or position('publication_check' in definition)>0 then raise exception 'Unexpected selection wrapper';end if;
 definition:=replace(definition,needle,
  $insert$ if p_action='publication_check' then return club_selection_private.publication_check(p_club_id,p_data);end if;
$insert$||needle);
 execute definition;
end $patch$;
