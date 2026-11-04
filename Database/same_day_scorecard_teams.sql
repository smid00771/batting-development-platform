-- Scorecard reconciliation must use the same time-aware overlap rule as selections.
-- Separate games on one date keep their players in both teams; actual clashes and
-- uncertain times retain the existing review/transfer safeguards.
do $patch$
declare definition text;old_text text;new_text text;
begin
 if md5(pg_get_functiondef('club_selection_private.fixture_day_conflict(jsonb,jsonb,jsonb,jsonb)'::regprocedure))<>'1b0ea1a88d3f8b3abc04929cb65acda1' then
  raise exception 'Unexpected fixture overlap definition; review before applying';
 end if;
 definition:=pg_get_functiondef('club_selection_private.scorecard_team_plan(uuid,uuid,text,uuid,jsonb)'::regprocedure);
 if md5(definition)<>'c5e66ff864d2cdfe3813c87aa8964065' then raise exception 'Unexpected scorecard team plan definition';end if;
 old_text:=$old$  for i in 1..jsonb_array_length(o.details->'days') loop
   key:='d'||i;day:=o.details->'days'->(i-1)->>'date';
   for p in select x from jsonb_array_elements(rows) x where x->'days' ? day loop$old$;
 new_text:=$new$  for i in 1..jsonb_array_length(o.details->'days') loop
   key:='d'||i;day:=o.details->'days'->(i-1)->>'date';
   for p in select x from jsonb_array_elements(rows) x where x->'days' ? day
    and exists(select 1 from jsonb_array_elements(f.details->'days') target_day
     where club_selection_private.fixture_day_conflict(f.details,target_day,o.details,o.details->'days'->(i-1))) loop$new$;
 if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then raise exception 'Unexpected draft scorecard overlap check';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$   for i in 1..jsonb_array_length(pd->'days') loop
    key:='d'||i;day:=pd->'days'->(i-1)->>'date';
    for p in select x from jsonb_array_elements(rows) x where x->'days' ? day loop$old$;
 new_text:=$new$   for i in 1..jsonb_array_length(pd->'days') loop
    key:='d'||i;day:=pd->'days'->(i-1)->>'date';
    for p in select x from jsonb_array_elements(rows) x where x->'days' ? day
     and exists(select 1 from jsonb_array_elements(coalesce(f.published->'details',f.details)->'days') target_day
      where club_selection_private.fixture_day_conflict(coalesce(f.published->'details',f.details),target_day,pd,pd->'days'->(i-1))) loop$new$;
 if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then raise exception 'Unexpected published scorecard overlap check';end if;
 execute replace(definition,old_text,new_text);

 definition:=pg_get_functiondef('club_selection_private.recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid)'::regprocedure);
 if md5(definition)<>'236d2844ef1c1d0ec4f87cbef4c52f1e' then raise exception 'Unexpected automatic scorecard recovery definition';end if;
 old_text:=$old$   and ((slot->>'d1'=p->>'roster_id' and card->'dates' ? (state#>>'{details,days,0,date}'))
    or (slot->>'d2'=p->>'roster_id' and card->'dates' ? (state#>>'{details,days,1,date}')))) then return false;end if;$old$;
 new_text:=$new$   and exists(select 1 from jsonb_array_elements(d->'days') target_day
    cross join lateral jsonb_array_elements(state#>'{details,days}') with ordinality other_day(played_day,day_number)
    where slot->>('d'||day_number)=p->>'roster_id'
     and club_selection_private.fixture_day_conflict(d,target_day,state->'details',played_day))) then return false;end if;$new$;
 if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then raise exception 'Unexpected automatic scorecard overlap check';end if;
 execute replace(definition,old_text,new_text);
end $patch$;
