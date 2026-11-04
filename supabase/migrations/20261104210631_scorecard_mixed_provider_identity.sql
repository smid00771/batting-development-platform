-- PlayHQ appearance IDs identify one match, not a separate person.
-- Preserve their explicit links when a volunteer confirms a stable PlayCricket ID.
-- Only known, namespaced PlayHQ appearances receive this exception; unknown or
-- global identities and two appearances in the same scorecard remain conflicts.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function club_selection_private.is_playhq_appearance(c uuid,source uuid) returns boolean
language sql stable set search_path='' as $$
 select substr(source::text,15,1)='8' and exists(
  select 1 from public.match_review_scorecards s
  where s.club_id=c and s.scorecard->>'provider'='playhq_au'
   and s.scorecard @> jsonb_build_object('teams',jsonb_build_array(
    jsonb_build_object('players',jsonb_build_array(jsonb_build_object('player_id',source)))))
 )
$$;
revoke all on function club_selection_private.is_playhq_appearance(uuid,uuid) from public,anon,authenticated;

do $patch$
declare definition text;old_fragment text;new_fragment text;
begin
 definition:=pg_get_functiondef('club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure);
 if md5(definition)<>'664b5667fe6a3ce946c1008d4190eeea' then
  raise exception 'Player confirmation changed before mixed-provider identity update';
 end if;
 old_fragment:=$old$ if pid is not null and exists(select 1 from public.match_review_player_links where club_id=c and player_id=pid and source_player_id<>source_id) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
 if rid is not null and exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and roster_id=rid and source_player_id<>source_id) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
$old$;
 new_fragment:=$new$ -- A confirmed PlayHQ appearance from another match is not a second global identity.
 -- Never collapse two appearances in this scorecard into the same club player.
 if exists(
  select 1 from (
   select l.source_player_id from public.match_review_player_links l where l.club_id=c and l.player_id=pid and l.source_player_id<>source_id
   union select l.source_player_id from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id
  ) previous where exists(
   select 1 from (
    select person->>'player_id' id from jsonb_array_elements(card->'teams') team cross join lateral jsonb_array_elements(team->'players') person
    union all select person->>'player_id' from jsonb_array_elements(card->'innings') innings cross join lateral jsonb_array_elements(innings->'batters') person
    union all select person->>'player_id' from jsonb_array_elements(card->'innings') innings cross join lateral jsonb_array_elements(innings->'bowlers') person
   ) present where present.id=previous.source_player_id::text
  )
 ) then raise exception 'This match already has a different player link. Ask Club Admin to review it';end if;
 if pid is not null and exists(select 1 from public.match_review_player_links l where l.club_id=c and l.player_id=pid and l.source_player_id<>source_id
  and not club_selection_private.is_playhq_appearance(c,l.source_player_id)) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
 if rid is not null and exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id
  and not club_selection_private.is_playhq_appearance(c,l.source_player_id)) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
$new$;
 if length(definition)-length(replace(definition,old_fragment,''))<>length(old_fragment) then
  raise exception 'Expected identity conflict checks were not found exactly once';
 end if;
 execute replace(definition,old_fragment,new_fragment);
end $patch$;
commit;
