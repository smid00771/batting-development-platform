-- Avoid loading the complete player workspace twice for one shared review.
create or replace function club_batting_private.get_shared_team_review(p_club_id uuid,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.team_review_sessions%rowtype; mine public.team_review_sessions%rowtype;
 result jsonb; permitted uuid[]; same_innings uuid[]; people jsonb; siblings jsonb;
 sid uuid; source_id uuid; team_id uuid; preview jsonb; anchor uuid;
begin
 if auth.uid() is null or not club_batting_private.team_review_staff(p_club_id) then
  raise exception 'Current club coaching access is required';
 end if;
 -- Apply the same target/player checks before loading the caller workspace once.
 select * into target from public.team_review_sessions where id=p_review_id and club_id=p_club_id and deleted_at is null;
 if target.id is null or not exists(select 1 from public.team_review_items i
  where i.review_id=target.id and i.removed_at is null and public.can_read_coaching_action_player(i.player_id) and public.can_edit_player(i.player_id)) then
  raise exception 'This team review is unavailable';
 end if;
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
