-- Include only a boolean in the existing membership-checked startup response.
-- The prediction workspace and all award/statistics requests remain on demand.
do $patch$
declare definition text:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 anchor text:=' result:=club_selection_private.api(p_club_id,p_action,p_data);';
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'Unexpected Selections access wrapper';
 end if;
 definition:=replace(definition,anchor,anchor||$new$
 if p_action='access' then
  result:=result||jsonb_build_object('predictions_enabled',coalesce((select s.enabled from public.club_call_settings s where s.club_id=p_club_id),false));
 end if;$new$);
 execute definition;
end $patch$;
