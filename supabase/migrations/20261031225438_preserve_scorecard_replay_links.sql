-- A verified match replay page is independent of score figures and player IDs.
-- Retain it during an ordinary refresh of the exact same PlayHQ source only.
do $patch$
declare s text;needle text:=' if prior.id is not null and prior.scorecard=card then sid:=prior.id;';
begin
 select pg_get_functiondef('club_selection_private.playhq_store_scorecard(uuid,uuid,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,needle,''))<>length(needle) then raise exception 'Unexpected scorecard storage definition';end if;
 s:=replace(s,needle,$replacement$
 if card->>'provider'='playhq_au' and prior.scorecard->>'provider'='playhq_au'
 and card->>'upstream_match_id'=prior.scorecard->>'upstream_match_id'
 and card->>'upstream_grade_id'=prior.scorecard->>'upstream_grade_id'
 and card->>'upstream_team_id'=prior.scorecard->>'upstream_team_id'
 and not card ? 'replay_url'
 and prior.scorecard->>'replay_url' ~ '^https://play[.]cricket[.]com[.]au/match/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(/[a-z0-9-]+)?[?]tab=highlights$' then
  card:=card||jsonb_build_object('replay_url',prior.scorecard->>'replay_url');
 end if;
 if prior.id is not null and prior.scorecard=card then sid:=prior.id;$replacement$);
 execute s;
end $patch$;
