-- One attributed contribution per saved observation, read by both workspaces.
-- Internal only; public review entry points retain their existing access checks.
create or replace function club_batting_private.review_innings_observations(p_match_id uuid)
returns jsonb language sql stable security definer set search_path='' as $function$
 select coalesce(jsonb_agg(to_jsonb(f)-'player_id'-'match_entry_id'||jsonb_build_object(
  'author_name',coalesce(up.display_name,'Coach / Captain'),
  'video',public.coaching_conversation_video(a.id),'action_id',a.id)
  order by f.created_at desc,f.id),'[]'::jsonb)
 from public.player_match_entries m
 join public.players p on p.id=m.player_id and p.club_id=m.club_id
 join public.player_match_coach_feedback f on f.match_entry_id=m.id and f.player_id=p.id
 left join public.user_profiles up on up.user_id=f.author_user_id
 left join public.player_coaching_actions a on a.match_feedback_id=f.id
 where m.id=p_match_id and auth.uid() is not null and public.can_read_coaching_action_player(p.id)
  and (not f.plan_related or f.author_user_id=auth.uid() or p.user_id is distinct from auth.uid()
   or exists(select 1 from public.player_match_reflections r where r.match_entry_id=m.id and r.player_id=p.id and r.author_user_id=auth.uid()))
$function$;
revoke all on function club_batting_private.review_innings_observations(uuid) from public,anon,authenticated;

-- Preserve the deployed functions and all ownership/revision checks.
do $migration$
declare d text; old text; replacement text; signature text;
begin
 signature:='club_batting_private.get_team_match_review(uuid,date,text,text,integer,uuid)';
 old:=$old$'scorecard',club_batting_private.match_review_score_json(m.id)$old$; replacement:=$new$'observations',club_batting_private.review_innings_observations(m.id),'scorecard',club_batting_private.match_review_score_json(m.id)$new$;
 d:=pg_get_functiondef(signature::regprocedure);
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'Unexpected definition: %',signature;end if;
 execute replace(d,old,replacement);
 signature:='club_batting_private.get_team_review_session(uuid,uuid)';
 old:=$old$'scorecard',coalesce(club_batting_private.match_review_score_json(m.id),p->'scorecard')$old$; replacement:=$new$'observations',case when i.player_id is not null then club_batting_private.review_innings_observations(m.id) else p->'observations' end,'scorecard',coalesce(club_batting_private.match_review_score_json(m.id),p->'scorecard')$new$;
 d:=pg_get_functiondef(signature::regprocedure);
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'Unexpected definition: %',signature;end if;
 execute replace(d,old,replacement);
 signature:='club_batting_private.get_shared_team_review(uuid,uuid)';
 old:=$old$'shared_observations',coalesce(notes.items,'[]'::jsonb)$old$; replacement:=$new$'observations',club_batting_private.review_innings_observations(m.id),'shared_observations',coalesce(notes.items,'[]'::jsonb)$new$;
 d:=pg_get_functiondef(signature::regprocedure);
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'Unexpected definition: %',signature;end if;
 execute replace(d,old,replacement);
end $migration$;

CREATE OR REPLACE FUNCTION club_batting_private.match_review_score_json(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select l.stats||jsonb_build_object(
  'source_runs',l.stats->'runs','source_score_date',l.stats->'score_date',
  'score_date',coalesce(official.score_date,(l.stats->>'score_date')::date,m.match_date),
  'runs',case when m.participation_status='did_not_bat' then null when m.score_text ~ '^[0-9]+[*]?$' then regexp_replace(m.score_text,'[*]$','')::int else (l.stats->>'runs')::int end,
  'not_out',right(m.score_text,1)='*','status',m.participation_status,
  'corrected',m.score_text<>case when l.stats->>'status'='did_not_bat' then '' else l.stats->>'runs'||case when l.stats->'not_out'='true' then '*' else '' end end or (official.score_date is not null and official.score_date is distinct from (l.stats->>'score_date')::date),
  'dismissal_video_url',batter.row->'dismissal_video_url','replay_url',latest.scorecard->'replay_url',
  'url',case when latest.scorecard->>'provider'='playhq_au' then null else 'https://play.cricket.com.au/match/'||l.source_match_id end,'source_match_id',l.source_match_id,'source_innings_id',l.source_innings_id,'confirmed_at',l.updated_at,'confirmed_by',club_batting_private.call_name(l.confirmed_by))
 from public.match_review_score_links l join public.player_match_entries m on m.id=l.match_id
 left join lateral(select s.scorecard from public.match_review_scorecards s where s.club_id=l.club_id and s.source_match_id=l.source_match_id order by s.created_at desc,s.id desc limit 1) latest on true
 left join lateral(select b as row from jsonb_array_elements(latest.scorecard->'innings') i cross join lateral jsonb_array_elements(i->'batters') b where i->>'id'=l.source_innings_id::text and b->>'player_id'=l.source_player_id::text limit 1) batter on true
 left join lateral(select r.score_date from public.club_call_entries e join public.club_call_results r on r.entry_id=e.id where e.club_id=m.club_id and e.player_id=m.player_id and e.match_date=m.match_date and e.format_key=m.format_key and (club_batting_private.resolve_preparation_innings(e.preparation_id)->>'match_id')::uuid=m.id limit 1) official on true
 where l.match_id=p_match_id
$function$;
