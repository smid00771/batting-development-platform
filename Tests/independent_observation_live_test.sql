-- Runs only against a synthetic club. Every record and queued message rolls back.
do $test$
declare
 c uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();other_actor uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();pid uuid;u uuid;request_id uuid;values jsonb;res jsonb;again jsonb;item jsonb;
 first_player uuid;first_match uuid;first_observation uuid;first_updated timestamptz;row public.player_match_coach_feedback%rowtype;rejected boolean;
 day date:=current_date-1;
begin
 begin
  foreach u in array array[actor,other_actor,outsider] loop
   insert into auth.users(id,email) values(u,'observation-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic contributor');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic observation test','observation-test-'||c,actor);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,actor,'admin','admin',null),(c,other_actor,'player','coach',null),(c,outsider,'player','none','player');
  insert into public.club_access_grants(club_id,user_id,scope,can_view,can_edit) values(c,other_actor,'whole_club',true,true);
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',actor);
  insert into public.playing_groups(id,club_id,name,active,created_by) values(g,c,'Synthetic grade',true,actor);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Synthetic group',true);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g,sg);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,jsonb_build_object('grade','Synthetic grade','grade_group_id',g,'format','limited_overs','opposition','Synthetic visitors','days',jsonb_build_array(jsonb_build_object('date',day::text))), '[]');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  for item in select value from jsonb_array_elements('[{"note":"A comment on its own"},{"batting_to_plan":"yes"},{"dismissal_classification":"plan_execution"},{"main_issue":"execution"},{"dismissal_summary":"A useful observation between overs"},{"next_training_focus":"Practise calling early"},{"needs_conversation":true}]'::jsonb) loop
   pid:=gen_random_uuid();request_id:=gen_random_uuid();
   insert into public.players(id,club_id,display_name,active) values(pid,c,'Synthetic player',true);
   values:=jsonb_build_object('fixture_id',fid,'match_date',day,'format_key','limited_overs','opposition','Synthetic visitors','innings_number',1,'score_text','')||item;
   res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',null,null,request_id,values,null,null);
   select * into row from public.player_match_coach_feedback where id=(res->>'observation_id')::uuid;
   assert row.id is not null and row.author_user_id=actor,'Contribution persisted with its author';
   assert row.batting_to_plan is not distinct from item->>'batting_to_plan','Unanswered innings assessment stays null';
   assert row.dismissal_classification is not distinct from item->>'dismissal_classification','Unanswered dismissal assessment stays null';
   assert row.main_issue is not distinct from item->>'main_issue','Main issue stays independent';
   assert row.note=coalesce(item->>'note','') and row.innings_note=coalesce(item->>'dismissal_summary',''),'Comments stay in their supplied fields';
   again:=public.save_individual_fixture_observation(c,g,fid,pid,'match',null,null,request_id,values,null,null);
   assert again->>'observation_id'=res->>'observation_id','Retry returns original observation';
   assert (select count(*)=1 from public.player_match_coach_feedback where player_id=pid),'Retry does not duplicate';
   if item ? 'batting_to_plan' then
    insert into public.player_match_reflections(match_entry_id,player_id,author_user_id,batting_to_plan,dismissal_classification) values(row.match_entry_id,pid,actor,'yes','outside_plan');
    assert not club_batting_private.coaching_message_needed((res->>'action_id')::uuid),'Unanswered dismissal is not disagreement';
    update public.player_match_reflections set batting_to_plan='no' where match_entry_id=row.match_entry_id;
    assert club_batting_private.coaching_message_needed((res->>'action_id')::uuid),'An actual differing answer still needs attention';
   end if;
   if first_player is null then first_player:=pid;first_match:=row.match_entry_id;first_observation:=row.id;first_updated:=row.updated_at;end if;
  end loop;
  -- Empty or invalid requests stay rejected; other contributors cannot edit the author.
  values:=jsonb_build_object('fixture_id',fid,'match_date',day,'format_key','limited_overs','opposition','Synthetic visitors','innings_number',1);
  rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,first_player,'match',null,null,gen_random_uuid(),values,null,null);exception when raise_exception then rejected:=true;end;assert rejected,'No empty observation';
  rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,first_player,'match',null,null,gen_random_uuid(),values||'{"batting_to_plan":"invalid"}',null,null);exception when raise_exception then rejected:=true;end;assert rejected,'Invalid supplied choice rejected';
  perform set_config('request.jwt.claim.sub',other_actor::text,true);
  rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,first_player,'match',first_observation,first_updated,gen_random_uuid(),values||jsonb_build_object('match_id',first_match,'note','Attempted edit'),null,null);exception when raise_exception then rejected:=true;end;assert rejected,'Authorship enforced';
  res:=public.save_individual_fixture_observation(c,g,fid,first_player,'match',null,null,gen_random_uuid(),values||jsonb_build_object('note','Second contributor'),null,null);
  assert res->>'match_id'=first_match::text,'Contributors share the same fixture innings';
  assert (select count(*)=2 from public.player_match_coach_feedback where match_entry_id=first_match),'Both attributed contributions remain';
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  rejected:=false;begin perform public.save_individual_fixture_observation(c,g,fid,first_player,'match',null,null,gen_random_uuid(),values||'{"note":"No coaching access"}',null,null);exception when others then rejected:=true;end;assert rejected,'Player without coaching access cannot contribute';
  raise exception using errcode='P0314',message='Roll back synthetic observation checks';
 exception when sqlstate 'P0314' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'All synthetic data rolled back';
end $test$;
select 'Independent observation checks passed; synthetic records rolled back' as result;
