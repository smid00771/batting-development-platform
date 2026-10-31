-- Preserve independent contributions and keep unanswered assessments null.
do $patch$
declare source text;old_guard text:=$old$  if not is_plan and not coalesce(completion,false) and task_text='' and note_text='' then raise exception 'Add a coaching note or training focus'; end if;$old$;
begin
 source:=pg_get_functiondef('club_batting_private.save_coach_observation_base(uuid,text,uuid,timestamptz,uuid,jsonb,date,integer)'::regprocedure);
 if position(old_guard in source)=0 or position($old$or (is_plan and coalesce(p_values->>'batting_to_plan','') not in ('yes','mostly','no'))$old$ in source)=0 or position($old$or (is_plan and not(source='team_review' and p_values->>'dismissal_classification' is null) and coalesce(p_values->>'dismissal_classification','') not in ('plan_execution','outside_plan','not_applicable'))$old$ in source)=0 then raise exception 'Unexpected observation save definition';end if;
 source:=replace(source,old_guard,$new$  -- Match contributions can contain any subset of the available answers.
  if p_kind='match' then
    p_values:=p_values||jsonb_build_object('batting_to_plan',nullif(p_values->>'batting_to_plan',''),'dismissal_classification',nullif(p_values->>'dismissal_classification',''));
    if p_values->>'batting_to_plan' is null and p_values->>'dismissal_classification' is null and nullif(p_values->>'main_issue','') is null then is_plan:=false;end if;
  end if;
  if not is_plan and not coalesce(completion,false) and task_text='' and note_text=''
    and not(p_kind='match' and (personal_innings_note<>'' or coalesce((p_values->>'needs_conversation')::boolean,false) or p_review_on is not null or nullif(trim(p_values->>'video_url'),'') is not null))
  then raise exception 'Add a comment or choose something to record';end if;$new$);
 source:=replace(source,$old$or (is_plan and coalesce(p_values->>'batting_to_plan','') not in ('yes','mostly','no'))$old$,$new$or (is_plan and p_values->>'batting_to_plan' is not null and p_values->>'batting_to_plan' not in ('yes','mostly','no'))$new$);
 source:=replace(source,$old$or (is_plan and not(source='team_review' and p_values->>'dismissal_classification' is null) and coalesce(p_values->>'dismissal_classification','') not in ('plan_execution','outside_plan','not_applicable'))$old$,$new$or (is_plan and p_values->>'dismissal_classification' is not null and p_values->>'dismissal_classification' not in ('plan_execution','outside_plan','not_applicable'))$new$);
 execute source;
end $patch$;

-- An unanswered field is not a disagreement with the player's reflection.
CREATE OR REPLACE FUNCTION club_batting_private.coaching_message_needed(aid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce((select a.status='open' and (a.follow_up_requested or a.is_player_request or a.preferred_user_id is not null or a.review_on is not null
  or exists(select 1 from public.player_match_coach_feedback f join public.player_match_reflections r on r.match_entry_id=f.match_entry_id and r.player_id=f.player_id
   where f.id=a.match_feedback_id and ((f.batting_to_plan is not null and r.batting_to_plan is not null and f.batting_to_plan<>r.batting_to_plan) or (f.dismissal_classification is not null and r.dismissal_classification is not null and f.dismissal_classification<>r.dismissal_classification)
    or f.dismissal_classification='outside_plan' or f.batting_to_plan='no')))
 from public.player_coaching_actions a where a.id=aid),false)
$function$
;
