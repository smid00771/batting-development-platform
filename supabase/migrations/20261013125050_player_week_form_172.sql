-- Keep ducks in recent-form comparisons; Team of the Week remains unchanged.
create function club_selection_private.player_week_performances(cards jsonb) returns jsonb
language sql immutable set search_path='' as $$
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
 ) select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('key',snapshot_id||':'||team_id||':'||player_id) order by grade,name,player_id),'[]') from players p where jsonb_array_length(batting)>0 or jsonb_array_length(bowling)>0
$$;
revoke all on function club_selection_private.player_week_performances(jsonb) from public,anon,authenticated;

create or replace function club_selection_private.player_week_candidates(c uuid,cards jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(p||jsonb_build_object('format',card#>>'{scorecard,format_key}',
  'roster_id',r.id,'usual_grade',r.grade) order by p->>'name'),'[]')
 from jsonb_array_elements(club_selection_private.player_week_performances(cards)) p
 join lateral (select x from jsonb_array_elements(cards) x where x->>'snapshot_id'=p->>'snapshot_id') s(card) on true
 left join lateral (
  select (array_agg(id))[1] id,(array_agg(grade))[1] grade from club_selection_private.roster r
  where r.club_id=c and (r.external_id=p->>'player_id' or r.user_id in
   (select pl.user_id from public.match_review_score_links l join public.players pl on pl.id=l.player_id and pl.club_id=c
    where l.club_id=c and l.source_player_id::text=p->>'player_id' and pl.user_id is not null)) having count(*)=1
 ) r on true
$$;
