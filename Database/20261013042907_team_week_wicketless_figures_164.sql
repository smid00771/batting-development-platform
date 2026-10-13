-- Keep recorded bowling spells visible even when both batting runs and wickets are zero.
CREATE OR REPLACE FUNCTION club_selection_private.team_week_candidates(cards jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 with source as (
  select x->>'snapshot_id' snapshot_id,x->>'our_team' team_id,x->'scorecard' card from jsonb_array_elements(cards) x
  where x->>'our_team' is not null and x->'scorecard'->>'status'='completed' and x->'scorecard'->>'schema_version'='2'
   and not exists(select 1 from jsonb_array_elements(x->'scorecard'->'innings') i where i->>'complete' is distinct from 'true')
 ), stats as (
  select s.*,b->>'player_id' player_id,b->>'name' name,'bat' kind,i->>'number' innings,b stat
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') b
  where i->>'team_id'=s.team_id and b->>'importable'='true' and b->>'status'='played'
  union all
  select s.*,b->>'player_id',b->>'name','bowl',i->>'number',b
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(coalesce(i->'bowlers','[]')) b
  where i->>'team_id'<>s.team_id and b->>'team_id'=s.team_id and b->>'importable'='true'
 ), players as (
  select snapshot_id,team_id,card->>'match_id' match_id,card->>'grade' grade,card->>'url' url,player_id,min(name) name,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bat'),'[]') batting,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bowl'),'[]') bowling,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bat'),0) runs,
   coalesce(sum((stat->>'wickets')::integer) filter(where kind='bowl'),0) wickets,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bowl'),0) conceded
  from stats group by snapshot_id,team_id,card->>'match_id',card->>'grade',card->>'url',player_id
 ) select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('key',snapshot_id||':'||team_id||':'||player_id) order by grade,name,player_id),'[]') from players p where runs>0 or wickets>0 or jsonb_array_length(bowling)>0
$function$;
