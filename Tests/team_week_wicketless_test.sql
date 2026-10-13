-- Pure-function checks: no club, player or scorecard records are changed.
do $tests$
declare cards jsonb; result jsonb; player jsonb;
begin
 cards:='[{"snapshot_id":"sample","our_team":"ours","scorecard":{"schema_version":2,"status":"completed","match_id":"match","grade":"2nd Grade","innings":[
  {"team_id":"ours","number":1,"complete":true,"batters":[
   {"player_id":"zayan","name":"Zayan","runs":34,"status":"played","importable":true},
   {"player_id":"duck","name":"Duck","runs":0,"status":"played","importable":true},
   {"player_id":"dnb","name":"DNB","runs":null,"status":"did_not_bat","importable":true}
  ],"bowlers":[]},
  {"team_id":"theirs","number":1,"complete":true,"batters":[],"bowlers":[
   {"player_id":"zayan","name":"Zayan","team_id":"ours","wickets":0,"runs":42,"balls":48,"importable":true},
   {"player_id":"duck","name":"Duck","team_id":"ours","wickets":0,"runs":10,"balls":36,"importable":true},
   {"player_id":"dnb","name":"DNB","team_id":"ours","wickets":0,"runs":0,"balls":6,"importable":true},
   {"player_id":"unavailable","name":"Unavailable","team_id":"ours","wickets":null,"runs":null,"importable":false},
   {"player_id":"opponent","name":"Opponent","team_id":"theirs","wickets":0,"runs":20,"importable":true}
  ]}
 ]}}]'::jsonb;
 result:=club_selection_private.team_week_candidates(cards);
 assert jsonb_array_length(result)=3,'Keep every recorded club bowler, including a duck or DNB with no wickets';
 select x into player from jsonb_array_elements(result) x where x->>'player_id'='zayan';
 assert player->>'runs'='34' and player->'bowling'->0->>'wickets'='0' and player->'bowling'->0->>'runs'='42','Preserve wicketless figures exactly';
 select x into player from jsonb_array_elements(result) x where x->>'player_id'='dnb';
 assert player->'batting'='[]'::jsonb and player->'bowling'->0->>'runs'='0','A recorded 0/0 spell is not missing data';
 assert club_selection_private.team_week_candidates(jsonb_set(cards,'{0,scorecard,status}','"in_progress"'))='[]'::jsonb,'In-progress matches remain excluded';
 assert club_selection_private.team_week_candidates(jsonb_set(cards,'{0,scorecard,innings,1,complete}','false'))='[]'::jsonb,'Unfinished innings remain excluded';
end $tests$;
select 'Wicketless bowling database checks passed' as result;
