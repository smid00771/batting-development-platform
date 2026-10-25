-- Add only completion metadata to fixtures already returned by the guarded API.
-- The latest explicitly linked, club-scoped saved scorecard is authoritative.
-- No fixture, selection, lock, publication or permission is changed.
do $patch$
declare definition text;old_text text;new_text text;before_acl aclitem[];
begin
 old_text:=$old$jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')))$old$;
 new_text:=$new$jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')),
  'result_complete',coalesce((select latest.scorecard->>'status'='completed'
   from club_selection_private.fixture_result_sources src
   join lateral (select sc.scorecard from public.match_review_scorecards sc
    where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id
    order by sc.created_at desc,sc.id desc limit 1) latest on true
   where src.club_id=p_club_id and src.fixture_id=(f->>'id')::uuid and src.no_play is null),false))$new$;
 select pg_get_functiondef(oid),proacl into definition,before_acl from pg_proc where oid='public.club_selections_api(uuid,text,jsonb)'::regprocedure;
 if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then raise exception 'Unexpected selection context definition';end if;
 execute replace(definition,old_text,new_text);
 assert (select proacl is not distinct from before_acl from pg_proc where oid='public.club_selections_api(uuid,text,jsonb)'::regprocedure),'Existing API grants are preserved';
end $patch$;
