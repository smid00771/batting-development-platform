-- Include the small meeting state in the board's existing authorised read.
-- Selectors do not need to open Selection Room or poll a separate status API.
do $patch$
declare definition text;needle text:=$old$ return result;
end $old$;
begin
 definition:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected board context API';end if;
 definition:=replace(definition,needle,$new$ if p_action='context' and coalesce((result->>'selector')::boolean,false) then
  result:=result||jsonb_build_object('selection_meetings',coalesce((select jsonb_agg(jsonb_build_object('scope_id',s.scope_id)||club_selection_private.selection_meeting_state(p_club_id,s.scope_id))
   from club_selection_private.selection_room_settings s where s.club_id=p_club_id and club_selection_private.selection_group_level(p_club_id,s.scope_id,auth.uid())>0),'[]'));
 end if;
 return result;
end $new$);
 execute definition;
end $patch$;
