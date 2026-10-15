-- Keep historical match conversations readable; close new messages after the final published playing day.
do $migration$
declare definition text;before text;after text;
begin
 select pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure) into definition;
 before:=$before$'can_chat',club_selection_private.audience(f.id,me)$before$;
 after:=$after$'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp())$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>2 then raise exception 'Match conversation context changed; review migration';end if;
 definition:=replace(definition,before,after);
 before:=$before$  insert into club_selection_private.posts(fixture_id,author_id,author_name,body)$before$;
 after:=$after$  if club_selection_private.fixture_completed(m.published->'details',acc.timezone,clock_timestamp()) then
   raise exception 'This match conversation is closed. The final playing day has ended.';
  end if;
  insert into club_selection_private.posts(fixture_id,author_id,author_name,body)$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Match conversation write path changed; review migration';end if;
 definition:=replace(definition,before,after);
 execute definition;
end $migration$;
