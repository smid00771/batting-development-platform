-- Drafts may temporarily exceed eleven while selectors move players between teams.
-- The existing batch save retains its locks, revisions and idempotency checks.
do $migration$
declare definition text;before text;after text;
begin
 select pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure) into definition;
 before:=$before$    if jsonb_typeof(row->'slots') is distinct from 'array' or jsonb_array_length(row->'slots')<>11 then raise exception 'Teams have exactly 11 selection slots';end if;$before$;
 after:=$after$    if jsonb_typeof(row->'slots') is distinct from 'array' or jsonb_array_length(row->'slots') not between 11 and 100 then raise exception 'Draft teams need 11 to 100 selection slots';end if;$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Selection slot validation changed; review migration';end if;
 definition:=replace(definition,before,after);
 before:=$before$    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Reload before sending';end if;
    if cardinality(club_selection_private.match_captain_users(c,m.details)||club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,m.details)))=0 then raise exception 'The match captain needs a linked club account to receive a private check';end if;$before$;
 after:=$after$    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Reload before sending';end if;
    if not coalesce((m.details->>'cancelled')::boolean,false) then
     notes:=club_selection_private.issues(fid);
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code' in ('over_team','over_slots')) then
      raise exception 'Fit the team into 11 slots before sending to captains' using detail=notes::text;
     end if;
    end if;
    if cardinality(club_selection_private.match_captain_users(c,m.details)||club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,m.details)))=0 then raise exception 'The match captain needs a linked club account to receive a private check';end if;$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Captain review validation changed; review migration';end if;
 definition:=replace(definition,before,after);
 execute definition;

 select pg_get_functiondef('club_selection_private.issues(uuid)'::regprocedure) into definition;
 before:=$before$ if n<>11 then notes:=notes||jsonb_build_array(jsonb_build_object('level',case when n between 1 and 10 then 'warning' else 'error' end,'code','short_team','text','Day '||i||': '||n||' of 11 places filled'));end if;$before$;
 after:=$after$ if n>11 then
 notes:=notes||jsonb_build_array(jsonb_build_object('level','error','code','over_team','day',i,'count',n,'text','Day '||i||': '||n||' players selected ('||(n-11)||' too many)'));
 elsif n<11 then
 notes:=notes||jsonb_build_array(jsonb_build_object('level',case when n between 1 and 10 then 'warning' else 'error' end,'code','short_team','text','Day '||i||': '||n||' of 11 places filled'));end if;$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Selection issues changed; review migration';end if;
 definition:=replace(definition,before,after);
 before:=$before$ if not (m.details ? 'match_roles') then return notes;end if; -- Older website versions retain their previous workflow.$before$;
 after:=$after$ if jsonb_array_length(m.slots)>11 and not exists(select 1 from jsonb_array_elements(notes) issue where issue->>'code'='over_team') then
  notes:=notes||jsonb_build_array(jsonb_build_object('level','error','code','over_slots','text','Arrange the selected players into 11 slots before sharing the team'));
 end if;
 if not (m.details ? 'match_roles') then return notes;end if; -- Older website versions retain their previous workflow.$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Selection slot issues changed; review migration';end if;
 execute replace(definition,before,after);
end $migration$;
