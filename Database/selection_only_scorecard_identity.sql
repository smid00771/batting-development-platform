-- Player identity belongs to the club playing list, independently of each team's
-- Club Batting choice. The PlayHQ branch writes only the confirmed roster link;
-- existing fixture, permission, conflict and retry checks remain intact.
do $patch$
declare definition text;old_text text;new_text text;before_acl aclitem[];
begin
 old_text:=$old$  if pid is not null and not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,coalesce(f.published->'details',f.details))) then raise exception 'This team does not use Club Batting';end if;$old$;
 new_text:=$new$  -- A selection-only team can share existing grade players without enabling coaching.$new$;
 select pg_get_functiondef(oid),proacl into definition,before_acl
  from pg_proc where oid='club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure;
 if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then
  raise exception 'Unexpected scorecard identity definition';
 end if;
 execute replace(definition,old_text,new_text);
 assert (select proacl is not distinct from before_acl from pg_proc
  where oid='club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure),
  'Existing identity API grants are preserved';
end $patch$;
