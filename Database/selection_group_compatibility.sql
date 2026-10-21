-- Scoped read access must not rely on the legacy club-wide mutator predicate.
do $patch$
declare s text;old text:='club_selection_private.selector(c,me)';begin
 select pg_get_functiondef('public.club_selection_groups(uuid,text,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected group context authorization definition';end if;
 execute replace(s,old,'club_selection_private.selection_viewer(c,me)');
end $patch$;

-- Manual scorecard staging is permitted only for the editor's own group.
-- Canonical links outrank display names, and a shared snapshot spanning groups
-- requires edit access to each linked fixture. Other established staff roles retain access.
create function club_selection_private.selection_scorecard_edit(c uuid,card jsonb,u uuid) returns boolean
language sql stable set search_path='' as $$
 select case when not club_selection_private.scoped_selections(c) then club_selection_private.selector(c,u)
 when exists(select 1 from club_selection_private.fixtures f left join club_selection_private.fixture_result_sources src on src.fixture_id=f.id and src.club_id=c
  where f.club_id=c and (src.source_match_id::text=card->>'match_id' or f.scorecard_sync->>'match_id'=card->>'match_id')) then
  not exists(select 1 from club_selection_private.fixtures f left join club_selection_private.fixture_result_sources src on src.fixture_id=f.id and src.club_id=c
   where f.club_id=c and (src.source_match_id::text=card->>'match_id' or f.scorecard_sync->>'match_id'=card->>'match_id') and not club_selection_private.selection_edit(c,f.details,u))
 else club_selection_private.selection_edit(c,jsonb_build_object('grade',card->>'grade'),u) end
$$;
revoke all on function club_selection_private.selection_scorecard_edit(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
do $patch$
declare s text;old text:='club_selection_private.selector(p_club_id,p_actor_id)';begin
 select pg_get_functiondef('club_batting_private.stage_match_review_scorecard(uuid,uuid,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected scorecard staging authorization definition';end if;
 execute replace(s,old,'club_selection_private.selection_scorecard_edit(p_club_id,p_scorecard,p_actor_id)');
end $patch$;

-- Viewing shared call credit does not grant checkout; that branch still requires
-- Club Admin. Keep scoped selectors' publication summaries worded as staff updates.
do $patch$
declare s text;old text:='club_selection_private.selector(c,me)';begin
 select pg_get_functiondef('club_selection_private.video_credit_api(uuid,text,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected video-credit entry authorization definition';end if;
 execute replace(s,old,'club_selection_private.selection_viewer(c,me)');
 old:='club_selection_private.selector(p_club_id,cm.user_id)';
 select pg_get_functiondef('club_selection_private.notify_publication_batch(uuid,jsonb)'::regprocedure) into s;
 if length(s)-length(replace(s,old,''))<>length(old) then raise exception 'Unexpected publication audience description';end if;
 execute replace(s,old,'club_selection_private.selection_viewer(p_club_id,cm.user_id)');
end $patch$;
