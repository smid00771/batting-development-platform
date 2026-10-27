-- T20 selection slots are three hours unless a recorded finish says otherwise.
-- Keep missing-time handling, explicit end times and all selection write guards.
do $fix$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.fixture_day_conflict(jsonb,jsonb,jsonb,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,'then 210 when','')))/length('then 210 when')<>2 then
  raise exception 'Unexpected T20 conflict function shape';
 end if;
 execute replace(definition,'then 210 when','then 180 when');
end $fix$;
