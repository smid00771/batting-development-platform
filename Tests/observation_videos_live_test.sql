-- All users, observations and queued messages are synthetic and rolled back.
do $test$
declare
 c uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();other_actor uuid:=gen_random_uuid();player_user uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();u uuid;request_id uuid;legacy_request uuid:=gen_random_uuid();
 base jsonb;values jsonb;legacy_values jsonb;res jsonb;again jsonb;clips jsonb;shown jsonb;bad jsonb;
 mid uuid;oid uuid;aid uuid;stamp timestamptz;revision integer;rejected boolean;day date:=current_date-1;
begin
 begin
  foreach u in array array[actor,other_actor,player_user,outsider] loop
   insert into auth.users(id,email) values(u,'video-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic video contributor');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic video test','video-test-'||c,actor);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,actor,'admin','admin',null),(c,other_actor,'player','coach',null),(c,player_user,'player','none','player');
  insert into public.club_access_grants(club_id,user_id,scope,can_view,can_edit) values(c,other_actor,'whole_club',true,true);
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',actor);
  insert into public.playing_groups(id,club_id,name,active,created_by) values(g,c,'Synthetic grade',true,actor);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Synthetic group',true);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g,sg);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,jsonb_build_object('grade','Synthetic grade','grade_group_id',g,'format','limited_overs','opposition','Synthetic visitors','days',jsonb_build_array(jsonb_build_object('date',day::text))),'[]');
  insert into public.players(id,club_id,user_id,display_name,active) values(pid,c,player_user,'Synthetic player',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  base:=jsonb_build_object('fixture_id',fid,'match_date',day,'format_key','limited_overs','opposition','Synthetic visitors','innings_number',1,'score_text','','note','Useful match comment','plan_related',false);
  legacy_values:=base||jsonb_build_object('video_url','https://youtu.be/abcdefghijk?t=12','video_note','Original clip');
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',null,null,legacy_request,legacy_values,null,null);
  mid:=(res->>'match_id')::uuid;oid:=(res->>'observation_id')::uuid;aid:=(res->>'action_id')::uuid;
  assert (select additional_links='[]'::jsonb from public.coaching_video_links where action_id=aid),'Legacy save retains one clip';
  select updated_at into stamp from public.player_match_coach_feedback where id=oid;select a.revision into revision from public.player_coaching_actions a where id=aid;
  clips:='[{"url":"https://youtu.be/abcdefghijk?t=12","note":"Second ball"},{"url":"https://www.youtube.com/watch?v=abcdefghijk&t=1m24s","note":"Dismissal"}]'::jsonb;
  values:=base||jsonb_build_object('match_id',mid,'videos',clips);request_id:=gen_random_uuid();
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,request_id,values,null,revision);
  shown:=public.coaching_conversation_video(aid);
  assert jsonb_array_length(shown->'links')=2 and shown->'links'->1->>'note'='Dismissal','Both clips and descriptions read back';
  assert shown->'links'->0->>'url'='https://www.youtube.com/watch?v=abcdefghijk&t=12' and shown->'links'->1->>'url'='https://www.youtube.com/watch?v=abcdefghijk&t=1m24s','Same-video timestamps remain distinct';
  assert (select count(*)=1 from public.coaching_video_links where action_id=aid),'One shared action stores the clip list';
  assert jsonb_array_length(club_batting_private.shared_innings_json(mid)->'coach_feedback'->0->'video'->'links')=2,'Shared innings includes every clip';
  again:=public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,request_id,values,null,revision);
  assert (again->>'already_saved')::boolean and public.coaching_conversation_video(aid)=shown,'Identical receipt does not duplicate or change clips';
  again:=public.save_individual_fixture_observation(c,g,fid,pid,'match',null,null,legacy_request,legacy_values,null,null);
  assert (again->>'already_saved')::boolean and public.coaching_conversation_video(aid)=shown,'Older receipt cannot undo newer clips';
  rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,request_id,values||'{"videos":[]}',null,revision);exception when raise_exception then rejected:=true;end;assert rejected,'A receipt cannot be reused with another clip list';
  perform set_config('request.jwt.claim.sub',player_user::text,true);assert jsonb_array_length(public.coaching_conversation_video(aid)->'links')=2,'General note clips are shared with the player';
  perform set_config('request.jwt.claim.sub',outsider::text,true);assert public.coaching_conversation_video(aid) is null,'Outsider cannot read clips';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  select updated_at into stamp from public.player_match_coach_feedback where id=oid;select a.revision into revision from public.player_coaching_actions a where id=aid;
  for bad in select value from jsonb_array_elements('[{"videos":{}},{"videos":[{"url":"https://example.com/invalid","note":"Wrong host"}]},{"videos":[{"url":"","note":"Missing link"}]},{"videos":[{"url":42}]}]'::jsonb) loop
   rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,gen_random_uuid(),values||bad,null,revision);exception when raise_exception then rejected:=true;end;assert rejected,'Invalid extra clip rejected';
  end loop;
  assert public.coaching_conversation_video(aid)=shown,'Rejected edits keep the complete previous list';
  -- A legacy client can edit its visible first link without erasing extra links.
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,gen_random_uuid(),base||jsonb_build_object('match_id',mid,'video_url','https://youtu.be/abcdefghijk?t=13','video_note','Corrected first clip'),null,revision);
  assert jsonb_array_length(public.coaching_conversation_video(aid)->'links')=2,'Legacy edit preserves later clips';
  select updated_at into stamp from public.player_match_coach_feedback where id=oid;select a.revision into revision from public.player_coaching_actions a where id=aid;
  rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,gen_random_uuid(),base||jsonb_build_object('match_id',mid,'video_url','','video_note',''),null,revision);exception when raise_exception then rejected:=true;end;assert rejected,'Old client cannot unknowingly remove hidden clips';
  values:=base||jsonb_build_object('match_id',mid,'videos',clips,'plan_related',true,'batting_to_plan','mostly');
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,gen_random_uuid(),values,null,revision);
  perform set_config('request.jwt.claim.sub',player_user::text,true);assert public.coaching_conversation_video(aid) is null,'Plan-related clips wait for independent reflection';
  insert into public.player_match_reflections(match_entry_id,player_id,author_user_id,batting_to_plan,dismissal_classification) values(mid,pid,player_user,'yes','plan_execution');
  assert jsonb_array_length(public.coaching_conversation_video(aid)->'links')=2,'All clips become available after reflection';
  perform set_config('request.jwt.claim.sub',other_actor::text,true);
  select updated_at into stamp from public.player_match_coach_feedback where id=oid;select a.revision into revision from public.player_coaching_actions a where id=aid;
  rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,gen_random_uuid(),values,null,revision);exception when raise_exception then rejected:=true;end;assert rejected,'Other coach cannot replace the author clips';
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',null,null,gen_random_uuid(),(base-'note')||jsonb_build_object('videos',jsonb_build_array(clips->1)),null,null);
  assert res->>'match_id'=mid::text and res->>'action_id'<>aid::text,'Other coach contributes to the same innings with own clip list';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,gen_random_uuid(),base||jsonb_build_object('match_id',mid,'videos',jsonb_build_array(clips->1)),null,revision);
  assert jsonb_array_length(public.coaching_conversation_video(aid)->'links')=1 and public.coaching_conversation_video(aid)->>'note'='Dismissal','Removing one clip retains the chosen remaining clip';
  select updated_at into stamp from public.player_match_coach_feedback where id=oid;select a.revision into revision from public.player_coaching_actions a where id=aid;
  res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',oid,stamp,gen_random_uuid(),base||jsonb_build_object('match_id',mid,'videos','[]'::jsonb),null,revision);
  assert not exists(select 1 from public.coaching_video_links where action_id=aid),'Explicit empty list removes only this contribution clips';
  assert (select count(*)=1 from public.coaching_video_links v join public.player_coaching_actions a on a.id=v.action_id where a.player_id=pid),'Other contributor clip remains';
  raise exception using errcode='P0315',message='Roll back synthetic video checks';
 exception when sqlstate 'P0315' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic records rolled back';
end $test$;
select 'Observation video checks passed; synthetic records rolled back' as result;
