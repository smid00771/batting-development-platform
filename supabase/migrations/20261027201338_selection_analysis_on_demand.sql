-- Analysis is always opt-in. Old clients cannot start background requests;
-- explicit requests do not depend on the retired selection-meeting mode.
do $patch$
declare definition text;old_guard text:=$old$ if exists(select 1 from club_selection_private.selection_room_settings where club_id=c and meeting_id is not null and meeting_ended_at is null) then
  raise exception using errcode='P0285',message='Analysis is paused while a selection meeting is active. End the meeting before requesting analysis';
 end if;$old$;
 old_context text:=$old$ if p_action='context' and coalesce((result->>'selector')::boolean,false) then
  result:=result||jsonb_build_object('selection_meetings',coalesce((select jsonb_agg(jsonb_build_object('scope_id',s.scope_id)||club_selection_private.selection_meeting_state(p_club_id,s.scope_id))
   from club_selection_private.selection_room_settings s where s.club_id=p_club_id and club_selection_private.selection_group_level(p_club_id,s.scope_id,auth.uid())>0),'[]'));
 end if;
$old$;
begin
 definition:=pg_get_functiondef('club_selection_private.season_stats_api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,old_guard,'')))/length(old_guard)<>1 then raise exception 'Unexpected analysis guard';end if;
 definition:=replace(definition,old_guard,$new$ if action='context' and data->'on_demand' is distinct from 'true'::jsonb then
  raise exception using errcode='P0285',message='Analysis runs on request. Use Show form indicators or Compare returning players to calculate once.';
 end if;$new$);
 execute definition;
 definition:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,old_context,'')))/length(old_context)<>1 then raise exception 'Unexpected meeting context';end if;
 execute replace(definition,old_context,'');
end $patch$;
