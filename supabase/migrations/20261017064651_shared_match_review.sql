-- One fixture workspace; author-owned contributions remain intact for attribution,
-- revisions and safe editing. No saved scores or observations are moved/deleted.
create function club_batting_private.get_shared_team_review(p_club_id uuid,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.team_review_sessions%rowtype; mine public.team_review_sessions%rowtype;
 result jsonb; permitted uuid[]; same_innings uuid[]; people jsonb; siblings jsonb;
 sid uuid; source_id uuid; team_id uuid; preview jsonb; anchor uuid;
begin
 if auth.uid() is null or not club_batting_private.team_review_staff(p_club_id) then
  raise exception 'Current club coaching access is required';
 end if;
 -- Reuse the existing per-player access checks before resolving the shared match.
 result:=club_batting_private.get_team_review_session(p_club_id,p_review_id);
 select * into target from public.team_review_sessions where id=p_review_id and club_id=p_club_id and deleted_at is null;
 select array_agg(r.id order by r.created_at,r.id) into permitted
 from public.team_review_sessions r
 where r.club_id=p_club_id and r.deleted_at is null
 and ((target.fixture_id is not null and r.fixture_id=target.fixture_id)
  or (target.fixture_id is null and r.fixture_id is null and r.group_scope=target.group_scope
   and r.group_id is not distinct from target.group_id and r.match_date=target.match_date
   and r.format_key=target.format_key
   and club_batting_private.innings_opposition_key(r.opposition)=club_batting_private.innings_opposition_key(target.opposition)))
 and exists(select 1 from public.team_review_items i where i.review_id=r.id and i.removed_at is null
  and public.can_read_coaching_action_player(i.player_id) and public.can_edit_player(i.player_id));
 select array_agg(r.id order by r.created_at,r.id) into same_innings from public.team_review_sessions r
 where r.id=any(permitted) and r.innings_number=target.innings_number;
 anchor:=same_innings[1];
 select * into mine from public.team_review_sessions r where r.id=any(same_innings) and r.author_user_id=auth.uid()
 order by r.updated_at desc,r.id limit 1;
 if mine.id is not null then
  result:=club_batting_private.get_team_review_session(p_club_id,mine.id);
 else
  -- A new contributor starts from their own observations, never another author's
  -- editable values. The existing save function continues enforcing ownership.
  result:=club_batting_private.get_team_match_review(p_club_id,target.match_date,target.format_key,target.opposition,target.innings_number,null)
   ||jsonb_build_object('review',club_batting_private.team_review_metadata(target.id),
    'review_fixture',(select jsonb_build_object('id',f.id,'cancelled',coalesce((f.details->>'cancelled')::boolean,false),'publication',f.publication)
     from club_selection_private.fixtures f where f.id=target.fixture_id and f.club_id=p_club_id));
 end if;
 -- Use verified shared innings identities to restore saved scores even when a
 -- contributor's own entry did not import the scorecard or assess every player.
 select coalesce(jsonb_agg(p||jsonb_build_object(
  'shared_included_in_review',linked.match_id is not null,
  'included_in_review',coalesce((p->>'included_in_review')::boolean,false) and mine.id is not null,
  'match_id',coalesce(nullif(p->>'match_id','')::uuid,linked.match_id),
  'match_updated_at',coalesce(m.updated_at,nullif(p->>'match_updated_at','')::timestamptz),
  'participation_status',coalesce(m.participation_status,p->>'participation_status'),
  'score_text',coalesce(m.score_text,p->>'score_text'),
  'scorecard',coalesce(club_batting_private.match_review_score_json(m.id),nullif(p->'scorecard','null'::jsonb)),
  'shared_observations',coalesce(notes.items,'[]'::jsonb)) order by p->>'display_name'),'[]') into people
 from jsonb_array_elements(result->'players') p
 left join lateral(select case when count(distinct i.match_id)=1 then min(i.match_id::text)::uuid end as match_id
  from public.team_review_items i where i.review_id=any(same_innings) and i.removed_at is null and i.player_id=(p->>'player_id')::uuid) linked on true
 left join public.player_match_entries m on m.id=coalesce(nullif(p->>'match_id','')::uuid,linked.match_id)
  and m.club_id=p_club_id and m.player_id=(p->>'player_id')::uuid
 left join lateral(select jsonb_agg(jsonb_build_object('author_user_id',f.author_user_id,
   'author_name',club_batting_private.call_name(f.author_user_id),'batting_to_plan',f.batting_to_plan,
   'dismissal_classification',f.dismissal_classification,'updated_at',f.updated_at) order by f.updated_at,f.id) as items
  from public.player_match_coach_feedback f where f.match_entry_id=m.id and f.author_user_id<>auth.uid()
  and (not f.plan_related or not exists(select 1 from public.players own where own.id=f.player_id and own.user_id=auth.uid())
   or exists(select 1 from public.player_match_reflections pr where pr.match_entry_id=f.match_entry_id and pr.player_id=f.player_id and pr.author_user_id=auth.uid()))) notes on true
 where public.can_read_coaching_action_player((p->>'player_id')::uuid) and public.can_edit_player((p->>'player_id')::uuid);
 -- A source saved by any contributor belongs to this match. Always read the
 -- latest snapshot; refreshing is not required merely to reopen the review.
 select case when count(distinct s.source_match_id)=1 then min(s.source_match_id::text)::uuid end,
  case when count(distinct r.source_team_id)=1 then min(r.source_team_id::text)::uuid end
 into source_id,team_id from public.team_review_sessions r join public.match_review_scorecards s on s.id=r.scorecard_id and s.club_id=p_club_id
 where r.id=any(permitted);
 if source_id is not null then
  select s.id into sid from public.match_review_scorecards s where s.club_id=p_club_id and s.source_match_id=source_id order by s.created_at desc,s.id desc limit 1;
  preview:=club_batting_private.get_match_review_scorecard(p_club_id,sid)||jsonb_build_object('our_team_id',team_id);
 else preview:=result->'scorecard_preview';end if;
 select coalesce(jsonb_agg(club_batting_private.team_review_metadata(r.id) order by r.innings_number),'[]') into siblings
 from (select distinct on(s.innings_number) s.* from public.team_review_sessions s where s.id=any(permitted)
  order by s.innings_number,(s.author_user_id=auth.uid()) desc,s.created_at,s.id) r;
 return result||jsonb_build_object('shared_review_id',anchor,'own_review_id',mine.id,'players',people,
  'contributors',(select coalesce(jsonb_agg(club_batting_private.team_review_metadata(r.id) order by r.created_at,r.id),'[]') from public.team_review_sessions r where r.id=any(same_innings)),
  'scorecard_preview',preview,'sibling_reviews',siblings,
  'review',(result->'review')||jsonb_build_object('source_team_id',coalesce(nullif(result#>>'{review,source_team_id}','')::uuid,team_id)));
end $$;
revoke all on function club_batting_private.get_shared_team_review(uuid,uuid) from public,anon;
grant execute on function club_batting_private.get_shared_team_review(uuid,uuid) to authenticated;
create function public.get_shared_team_review(p_club_id uuid,p_review_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select club_batting_private.get_shared_team_review(p_club_id,p_review_id)
$$;
revoke all on function public.get_shared_team_review(uuid,uuid) from public,anon;
grant execute on function public.get_shared_team_review(uuid,uuid) to authenticated;

-- Recognise legacy imports by their saved fixture identity, not by grade wording.
create or replace function club_selection_private.shared_result_cards(c uuid,first_day date,last_day date) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('snapshot_id',s.id,'scorecard',s.scorecard,'fetched_at',s.created_at,
  'our_team',coalesce(t.team_id::text,l.team_id::text,confirmed.team_id,club_batting_private.scorecard_club_team(c,s.scorecard)),
  'grade_hint',(select coalesce(fx.published->'details',fx.details)->>'grade' from club_selection_private.fixture_result_sources known join club_selection_private.fixtures fx on fx.id=known.fixture_id and fx.club_id=c where known.club_id=c and known.team_id::text=coalesce(t.team_id::text,l.team_id::text,confirmed.team_id,club_batting_private.scorecard_club_team(c,s.scorecard)) order by known.updated_at desc,known.fixture_id limit 1),
  'fixture_id',coalesce(l.fixture_id,official.id,saved.id)) order by s.scorecard->>'grade',s.source_match_id),'[]')
 from (select distinct on(source_match_id) * from public.match_review_scorecards where club_id=c order by source_match_id,created_at desc,id desc) s
 left join club_selection_private.team_week_sources t on t.club_id=c and t.source_match_id=s.source_match_id
 left join club_selection_private.fixture_result_sources l on l.club_id=c and l.source_match_id=s.source_match_id
 left join lateral (select f.id from club_selection_private.fixtures f where f.club_id=c and f.scorecard_sync->>'match_id'=s.source_match_id::text order by f.id limit 1) official on true
 left join lateral(select case when count(distinct r.fixture_id)=1 then min(r.fixture_id::text)::uuid end id
  from public.team_review_sessions r join public.match_review_scorecards original on original.id=r.scorecard_id and original.club_id=c
  join club_selection_private.fixtures f on f.id=r.fixture_id and f.club_id=c
  where r.club_id=c and r.deleted_at is null and original.source_match_id=s.source_match_id) saved on true
 left join lateral (
  select case when count(distinct i->>'team_id')=1 then min(i->>'team_id') end team_id
  from public.match_review_score_links z join public.match_review_scorecards original on original.id=z.snapshot_id and original.club_id=c
  cross join lateral jsonb_array_elements(original.scorecard->'innings') i
  where z.club_id=c and z.source_match_id=s.source_match_id and i->>'id'=z.source_innings_id::text
 ) confirmed on true
 where exists(select 1 from jsonb_array_elements_text(s.scorecard->'dates') d where d between first_day::text and last_day::text)
$$;
revoke all on function club_selection_private.shared_result_cards(uuid,date,date) from public,anon,authenticated;
