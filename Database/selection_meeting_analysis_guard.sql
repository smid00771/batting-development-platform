-- Enforce the pause for all clients, including tabs opened before this release.
-- Season evidence uses this same API. Save, availability and publish APIs do not.
do $patch$
declare definition text;needle text:=$old$ if action not in ('context','set_season') or action is null then raise exception 'Unknown season stats action';end if;$old$;
begin
 definition:=pg_get_functiondef('club_selection_private.season_stats_api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected season stats API';end if;
 definition:=replace(definition,needle,needle||$new$
 if exists(select 1 from club_selection_private.selection_room_settings where club_id=c and meeting_id is not null and meeting_ended_at is null) then
  raise exception using errcode='P0285',message='Analysis is paused while a selection meeting is active. End the meeting before requesting analysis';
 end if;$new$);
 execute definition;
end $patch$;
