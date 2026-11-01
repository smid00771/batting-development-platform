-- Only an explicit overall batting-plan answer requests an independent reflection.
-- Comments, dismissal-only observations and optional issue notes remain readable.
-- Preserve the same player, author, club and reflection permissions in every read.
do $migration$
declare item record; definition text; needle text:='f.plan_related'; replacement text:=$gate$(f.plan_related and coalesce(f.batting_to_plan in ('yes','mostly','no'),false))$gate$;
begin
 for item in select * from (values
  ('club_batting_private.shared_innings_json(uuid)',2),
  ('club_batting_private.review_innings_observations(uuid)',1),
  ('public.my_coaching_update_sources_before_requests(uuid)',1),
  ('public.my_coaching_update_sources(uuid)',1),
  ('public.coaching_conversation_video(uuid)',1),
  ('public.can_read_focus_context(uuid,text,uuid)',1),
  ('public.coaching_conversation_json(uuid)',1),
  ('club_batting_private.get_my_coaching_updates(uuid)',1)
 ) as patches(signature,expected_count) loop
  definition:=pg_get_functiondef(item.signature::regprocedure);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>item.expected_count then
   raise exception 'Unexpected reflection visibility definition: %',item.signature;
  end if;
  execute replace(definition,needle,replacement);
 end loop;
end $migration$;

alter policy "authorised users read coach feedback" on public.player_match_coach_feedback
using (
 public.can_read_coaching_action_player(player_id)
 and (
  author_user_id=auth.uid()
  or not (plan_related and coalesce(batting_to_plan in ('yes','mostly','no'),false))
  or not exists(select 1 from public.players p where p.id=player_match_coach_feedback.player_id and p.user_id=auth.uid())
  or exists(select 1 from public.player_match_reflections r where r.match_entry_id=player_match_coach_feedback.match_entry_id and r.player_id=player_match_coach_feedback.player_id)
 )
);

-- Verify visibility with the authenticated role before committing this migration.
-- Synthetic records only, with the real authenticated API role. Caller rolls back.
do $test$
declare
 c uuid:=gen_random_uuid();coach uuid:=gen_random_uuid();pu uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();u uuid;
 g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();fid uuid;mid uuid;oid uuid;aid uuid;
 item jsonb;v jsonb;res jsonb;data jsonb;feedback jsonb;entry jsonb;updates jsonb;note jsonb;expected_lock boolean;denied boolean;i int:=0;
 played date:=current_date-1;
begin
 begin
 foreach u in array array[coach,pu,outsider] loop
  insert into auth.users(id,email) values(u,'comment-visibility-'||u||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Synthetic comment reader');
 end loop;
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic comment visibility','comment-visibility-'||c,coach);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,coach,'admin','admin',null),(c,pu,'player','none','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',coach);
 insert into public.playing_groups(id,club_id,name,active) values(g,c,'Synthetic XI',true);
 insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Synthetic group',true);
 insert into club_selection_private.selection_group_grades values(c,g,sg);
 insert into public.players(id,club_id,user_id,display_name,active) values(pid,c,pu,'Synthetic player',true);
 insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by) values(c,pid,g,coach);
 for item in select value from jsonb_array_elements('[{}, {"main_issue":"execution"}, {"dismissal_classification":"plan_execution"}, {"batting_to_plan":"yes"}, {"batting_to_plan":"mostly"}, {"batting_to_plan":"no"}, {"batting_to_plan":"no_plan"}]'::jsonb) loop
  i:=i+1;fid:=gen_random_uuid();
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,jsonb_build_object('grade','Synthetic XI','grade_group_id',g,'format','limited_overs','opposition','Synthetic visitors','days',jsonb_build_array(jsonb_build_object('date',(played-i)::text))),'[]');
  perform set_config('request.jwt.claim.sub',coach::text,true);set local role authenticated;
  v:=jsonb_build_object('match_date',played-i,'format_key','limited_overs','opposition','Synthetic visitors','innings_number',1,'score_text','44','note','Read this one comment','videos',jsonb_build_array(jsonb_build_object('url','https://youtu.be/abcdefghijk?t=12','note','The shot')))||item;
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',null,null,gen_random_uuid(),v,null,null);
  mid:=(res->>'match_id')::uuid;oid:=(res->>'observation_id')::uuid;aid:=(res->>'action_id')::uuid;
  assert mid is not null and oid is not null,'Observation persisted';
  reset role;
  -- Older records may have the broad plan_related flag without any answer.
  if i=1 then update public.player_match_coach_feedback set plan_related=true where id=oid;end if;
  expected_lock:=coalesce(item->>'batting_to_plan' in ('yes','mostly','no'),false);
  perform set_config('request.jwt.claim.sub',pu::text,true);set local role authenticated;
  assert current_user='authenticated','Tests use the real API role';
  data:=public.get_my_innings(c);
  select x into entry from jsonb_array_elements(data->'matches') x where x->>'id'=mid::text;
  note:=entry#>'{coach_feedback,0}';
  assert coalesce((note->>'reflection_required')::boolean,false)=expected_lock,'Only an explicit plan assessment gates the comment';
  assert (note->>'note'='Read this one comment') is not distinct from case when expected_lock then null else true end,'Hidden comment never leaks; other comments are returned';
  assert (select count(*) from public.player_match_coach_feedback where id=oid)=case when expected_lock then 0 else 1 end,'Direct table RLS uses the same visibility';
  assert ((public.coaching_conversation_json(aid)->>'video') is null)=expected_lock,'Videos follow the same per-observation gate';
  updates:=public.get_my_coaching_updates(c);
  select x into feedback from jsonb_array_elements(updates->'updates') x where x->>'source_id'=oid::text;
  assert (feedback->>'can_open')::boolean=not expected_lock,'Notification matches actual comment visibility';
  if expected_lock then
   denied:=false;begin perform public.mark_my_coaching_update_seen(c,'match:'||oid::text,(feedback->>'changed_at')::timestamptz);exception when raise_exception then denied:=sqlerrm='Add your own reflection before viewing this coach feedback';end;assert denied,'Hidden feedback is not marked read';
   res:=public.save_my_fixture_innings(c,null,mid,(entry->>'updated_at')::timestamptz,null,gen_random_uuid(),jsonb_build_object('match_date',played-i,'format_key','limited_overs','opposition','Synthetic visitors','innings_number',1,'score_text','44','player_note','','reflection',jsonb_build_object('batting_to_plan','yes','dismissal_classification','not_applicable','main_issue',null,'next_training_focus','','note','')));
   data:=public.get_my_innings(c);
   select x into entry from jsonb_array_elements(data->'matches') x where x->>'id'=mid::text;
   assert entry#>>'{coach_feedback,0,note}'='Read this one comment','Two saved answers reveal the comment';
   assert entry->>'score_text'='44','Reading feedback does not change the score';
   assert (public.coaching_conversation_json(aid)->>'video') is not null,'Video opens after reflection';
  end if;
  reset role;
 end loop;
 perform set_config('request.jwt.claim.sub',outsider::text,true);set local role authenticated;
 denied:=false;begin perform public.get_development_feedback_for_player(pid);exception when others then denied:=true;end;assert denied,'Other accounts cannot read the player comments';
 assert (select count(*)=0 from public.player_match_coach_feedback where player_id=pid),'RLS still rejects outsiders';
 assert (public.coaching_conversation_json(aid)->>'video') is null,'An outsider cannot read the linked clip';
 reset role;
 raise exception using errcode='PT330',message='Rollback synthetic visibility checks';
 exception when sqlstate 'PT330' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic records are rolled back';
end $test$;
select 'Comment visibility, reflection, video, notification and access checks passed' as result;
