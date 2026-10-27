-- Emergency: a menu access check must not block behind selection saves.
do $pause$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 if position($old$ -- Existing members are matched automatically when their Selections access/context loads.
 if p_action='access' and club_selection_private.member(c,me) and club_selection_private.enabled(c) then
  perform club_selection_private.sync_players(c,case when adm or sel then null else me end);

  select * into acc from club_selection_private.access where club_id=c;
 end if;
$old$ in definition)=0 then raise exception 'Unexpected player-sync access block';end if;
 definition:=replace(definition,$old$ -- Existing members are matched automatically when their Selections access/context loads.
 if p_action='access' and club_selection_private.member(c,me) and club_selection_private.enabled(c) then
  perform club_selection_private.sync_players(c,case when adm or sel then null else me end);

  select * into acc from club_selection_private.access where club_id=c;
 end if;
$old$,$new$ -- Access and context reads must not acquire the player-sync advisory lock.
 -- Explicit signup, imports and account-link operations retain their sync paths.
$new$);
 execute definition;
end $pause$;
