-- Exactly twelve is a warning requiring the current fixture publisher's explicit
-- acknowledgement. Existing authorization, revisions and request receipts remain.
do $migration$
declare definition text;before text;after text;
begin
 definition:=pg_get_functiondef('club_selection_private.issues(uuid)'::regprocedure);
 before:=$old$ if n>11 then$old$;
 after:=$new$ if n=12 then
 notes:=notes||jsonb_build_array(jsonb_build_object('level','warning','code','twelve_team','day',i,'count',n,'text','Day '||i||': 12 players selected; Head of Selections must confirm this competition permits 12'));
 elsif n>12 then$new$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected team-size validation';end if;
 definition:=replace(definition,before,after);
 before:=$old$ if jsonb_array_length(m.slots)>11 and not exists(select 1 from jsonb_array_elements(notes) issue where issue->>'code'='over_team') then$old$;
 after:=$new$ if jsonb_array_length(m.slots)>11
  and not (jsonb_array_length(m.slots)=12 and exists(select 1 from jsonb_array_elements(notes) issue where issue->>'code'='twelve_team'))
  and not exists(select 1 from jsonb_array_elements(notes) issue where issue->>'code'='over_team') then$new$;
 if position(before in definition)=0 then raise exception 'Unexpected selection-slot validation';end if;
 execute replace(definition,before,after);

 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 before:=$old$     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='short_team')$old$;
 after:=$new$     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='twelve_team')
      and (jsonb_typeof(p_data->'acknowledge_twelve') is distinct from 'array'
       or not coalesce(p_data->'acknowledge_twelve' ? fid::text,false)) then
      raise exception 'Confirm publishing this team with 12 players';
     end if;
$new$||before;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Unexpected publication acknowledgement';end if;
 definition:=replace(definition,before,after);
 before:=$old$n->>'code' is distinct from 'missing_keeper') and not coalesce((p_data->>'acknowledge_balance')::boolean,false)$old$;
 after:=$new$n->>'code' is distinct from 'missing_keeper' and n->>'code' is distinct from 'twelve_team') and not coalesce((p_data->>'acknowledge_balance')::boolean,false)$new$;
 if position(before in definition)=0 then raise exception 'Unexpected publication warnings';end if;
 execute replace(definition,before,after);
end $migration$;
