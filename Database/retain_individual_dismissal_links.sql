-- Retain explicitly verified viewing links only for the same source and the
-- same unchanged batting record. Corrections require fresh verification.
create or replace function club_selection_private.retain_dismissal_links(next_card jsonb, prior_card jsonb)
returns jsonb language plpgsql immutable set search_path='' as $function$
declare result jsonb:=next_card; innings jsonb:='[]';batters jsonb;inn jsonb;old_inn jsonb;b jsonb;old_b jsonb;
begin
 if next_card->>'provider' is distinct from 'playhq_au' or prior_card->>'provider' is distinct from 'playhq_au'
  or nullif(next_card->>'upstream_match_id','') is null or nullif(next_card->>'match_id','') is null
  or next_card->>'match_id' is distinct from prior_card->>'match_id'
  or next_card->>'upstream_match_id' is distinct from prior_card->>'upstream_match_id'
  or next_card->>'upstream_grade_id' is distinct from prior_card->>'upstream_grade_id'
  or next_card->>'upstream_team_id' is distinct from prior_card->>'upstream_team_id'
  or next_card->'dates' is distinct from prior_card->'dates'
  or next_card->>'format_key' is distinct from prior_card->>'format_key'
 then return next_card;end if;
 for inn in select value from jsonb_array_elements(next_card->'innings') loop
  old_inn:=null;
  select value into old_inn from jsonb_array_elements(prior_card->'innings')
   where value->>'id'=inn->>'id' and value->>'team_id'=inn->>'team_id' and value->>'number'=inn->>'number';
  batters:='[]';
  for b in select value from jsonb_array_elements(inn->'batters') loop
   old_b:=null;
   if b->>'player_id' is not null and b->>'status'='played' and b->>'not_out'='false' and not b ? 'dismissal_video_url' then
    select value into old_b from jsonb_array_elements(old_inn->'batters') where value->>'player_id'=b->>'player_id';
    if old_b- 'dismissal_video_url'- 'dismissal_replay_source'- 'dismissal_video_thumbnail_url'=b
     and old_b#>>'{dismissal_replay_source,provider}'='playcricket_au'
     and old_b->>'dismissal_video_url' ~ '^https://play[.]cricket[.]com[.]au/match/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}[?]tab=scorecard&highlightId=[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
     and split_part(split_part(old_b->>'dismissal_video_url','/match/',2),'?',1)=old_b#>>'{dismissal_replay_source,match_id}'
    then
     b:=b||jsonb_build_object('dismissal_video_url',old_b->'dismissal_video_url','dismissal_replay_source',old_b->'dismissal_replay_source');
     if old_b->>'dismissal_video_thumbnail_url' ~ '^https://i[.]ytimg[.]com/vi/[A-Za-z0-9_-]{11}/hqdefault[.]jpg$'
      then b:=b||jsonb_build_object('dismissal_video_thumbnail_url',old_b->'dismissal_video_thumbnail_url');end if;
    end if;
   end if;
   batters:=batters||jsonb_build_array(b);
  end loop;
  innings:=innings||jsonb_build_array(jsonb_set(inn,'{batters}',batters));
 end loop;
 return jsonb_set(result,'{innings}',innings);
end $function$;
revoke all on function club_selection_private.retain_dismissal_links(jsonb,jsonb) from public,anon,authenticated;

do $patch$
declare definition text;needle text:=' if prior.id is not null and prior.scorecard=card then sid:=prior.id;';
begin
 definition:=pg_get_functiondef('club_selection_private.playhq_store_scorecard(uuid,uuid,jsonb)'::regprocedure);
 if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'Unexpected scorecard storage definition';end if;
 execute replace(definition,needle,E' card:=club_selection_private.retain_dismissal_links(card,prior.scorecard);\n'||needle);
 definition:=pg_get_functiondef('club_batting_private.match_review_score_json(uuid)'::regprocedure);
 needle:=$needle$'dismissal_video_url',batter.row->'dismissal_video_url'$needle$;
 if length(definition)-length(replace(definition,needle,''))<>length(needle) then raise exception 'Unexpected score readback definition';end if;
 execute replace(definition,needle,$replacement$'dismissal_video_thumbnail_url',batter.row->'dismissal_video_thumbnail_url','dismissal_video_url',batter.row->'dismissal_video_url'$replacement$);
end $patch$;
