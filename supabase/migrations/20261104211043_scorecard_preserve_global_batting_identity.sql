-- Keep the one-global-identity rule in Club Batting. Only the selection link
-- table permits several confirmed PlayHQ appearances for one club player.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $patch$
declare definition text;old_fragment text;new_fragment text;
begin
 definition:=pg_get_functiondef('club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure);
 if md5(definition)<>'2f66521f004ffb2f92c8bdcb80fa6adb' then
  raise exception 'Player confirmation changed before preserving global batting identity';
 end if;
 old_fragment:=$old$ if pid is not null and exists(select 1 from public.match_review_player_links l where l.club_id=c and l.player_id=pid and l.source_player_id<>source_id
  and not club_selection_private.is_playhq_appearance(c,l.source_player_id)) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
$old$;
 new_fragment:=$new$ if pid is not null and exists(select 1 from public.match_review_player_links where club_id=c and player_id=pid and source_player_id<>source_id) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
$new$;
 if length(definition)-length(replace(definition,old_fragment,''))<>length(old_fragment) then
  raise exception 'Expected global batting identity guard was not found exactly once';
 end if;
 execute replace(definition,old_fragment,new_fragment);
end $patch$;
commit;
