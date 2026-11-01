-- All synthetic records and effects are rolled back. Exercise the actual API role.
begin;
do $test$
declare
 c uuid:=gen_random_uuid();captain uuid:=gen_random_uuid();coach uuid:=gen_random_uuid();pu uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();roster uuid:=gen_random_uuid();u uuid;
 mid uuid;rid uuid;oid uuid;aid uuid;res jsonb;review jsonb;individual jsonb;values jsonb;d jsonb;stamp timestamptz;revision int;denied boolean;
 source uuid:=gen_random_uuid();inn uuid:=gen_random_uuid();sp uuid:=gen_random_uuid();snapshot uuid:=gen_random_uuid();clip text;
 played date:=current_date-1;
begin
 foreach u in array array[captain,coach,pu,outsider] loop
  insert into auth.users(id,email) values(u,'shared-innings-'||u||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,case when u=captain then 'Synthetic captain' else 'Synthetic contributor' end);
 end loop;
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic shared innings','shared-innings-'||c,captain);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,captain,'admin','admin',null),(c,coach,'player','coach',null),(c,pu,'player','coach','player');
 insert into public.club_access_grants(club_id,user_id,scope,can_view,can_edit) values(c,coach,'whole_club',true,true),(c,pu,'whole_club',true,true);
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',captain);
 insert into public.playing_groups(id,club_id,name,active) values(g,c,'Synthetic XI',true);
 insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Synthetic group',true);
 insert into club_selection_private.selection_group_grades values(c,g,sg);
 insert into public.players(id,club_id,user_id,display_name,active) values(pid,c,pu,'Synthetic player',true);
 insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by) values(c,pid,g,captain);
 insert into club_selection_private.roster(id,club_id,name,active) values(roster,c,'Synthetic player',true);
 insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,roster,pid);
 d:=jsonb_build_object('grade','Synthetic XI','grade_group_id',g,'opposition','Synthetic visitors','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',played)));
 insert into club_selection_private.fixtures(id,club_id,details,slots,published) values(fid,c,d,jsonb_build_array(jsonb_build_object('d1',roster)),jsonb_build_object('details',d,'slots',jsonb_build_array(jsonb_build_object('d1',roster))));
 perform set_config('request.jwt.claim.sub',captain::text,true);
 set local role authenticated;
 assert current_user='authenticated';
 values:=jsonb_build_object('fixture_id',fid,'group_id',g,'group_scope','group','match_date',played,'format_key','limited_overs','opposition','Synthetic visitors','innings_number',1,'rows',jsonb_build_array(jsonb_build_object('player_id',pid,'batting_to_plan','mostly','dismissal_classification','plan_execution')));
 res:=public.save_team_match_review(c,gen_random_uuid(),values);rid:=(res->>'review_id')::uuid;mid:=(res#>>'{saved,0,match_id}')::uuid;
 assert mid is not null,'Captain quick review creates the shared innings';
 perform set_config('request.jwt.claim.sub',coach::text,true);
 individual:=public.get_development_feedback_for_player(pid);
 assert individual#>>'{matches,0,coach_feedback,0,batting_to_plan}'='mostly','Coach sees captain assessment in Match Observation';
 values:=jsonb_build_object('match_id',mid,'fixture_id',fid,'match_date',played,'format_key','limited_overs','opposition','Synthetic visitors','innings_number',1,'plan_related',false,'note','Coach adds useful detail','videos',jsonb_build_array(jsonb_build_object('url','https://youtu.be/abcdefghijk?t=12','note','Second ball')));
 res:=public.save_individual_fixture_observation(c,g,fid,pid,'match',null,null,gen_random_uuid(),values,null,null);
 assert res->>'match_id'=mid::text,'Individual entry reuses the exact innings';oid:=(res->>'observation_id')::uuid;aid:=(res->>'action_id')::uuid;
 review:=public.get_shared_team_review(c,rid);
 assert review->'own_review_id'='null'::jsonb,'Coach never borrows the captain review save target';
 assert jsonb_array_length(review#>'{players,0,observations}')=2,'Both contributions appear in the review';
 assert exists(select 1 from jsonb_array_elements(review#>'{players,0,observations}') n where n->>'author_user_id'=coach::text and n->>'note'='Coach adds useful detail' and n#>>'{video,links,0,note}'='Second ball'),'Coach note and clip are attributed';
 perform set_config('request.jwt.claim.sub',captain::text,true);
 review:=public.get_team_review_session(c,rid);
 assert review#>>'{players,0,batting_to_plan}'='mostly' and jsonb_array_length(review#>'{players,0,observations}')=2,'Own quick answer and both notes survive reopening';
 individual:=public.get_development_feedback_for_player(pid);
 assert (select count(*)=2 from jsonb_array_elements(individual->'matches') m cross join lateral jsonb_array_elements(m->'coach_feedback') n where m->>'id'=mid::text),'Individual view reads the same contributions';
 perform set_config('request.jwt.claim.sub',pu::text,true);
 review:=public.get_team_match_review(c,played,'limited_overs','Synthetic visitors',1,g);
 assert jsonb_array_length(review#>'{players,0,observations}')=1,'Playing staff cannot bypass reflection through Match Review';
 assert review#>>'{players,0,observations,0,note}'='Coach adds useful detail','General comment remains available';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 denied:=false;begin perform public.get_shared_team_review(c,rid);exception when others then denied:=true;end;assert denied,'Outsider rejected';
 assert not has_function_privilege('authenticated','club_batting_private.review_innings_observations(uuid)','execute'),'Internal helper is not directly callable';
 reset role;
 insert into public.player_match_reflections(match_entry_id,player_id,author_user_id,batting_to_plan,dismissal_classification) values(mid,pid,pu,'yes','plan_execution');
 perform set_config('request.jwt.claim.sub',pu::text,true);
 set local role authenticated;
 review:=public.get_team_match_review(c,played,'limited_overs','Synthetic visitors',1,g);
 assert jsonb_array_length(review#>'{players,0,observations}')=2,'Both observations available after independent reflection';
 reset role;
 assert (select count(*)=1 from public.player_match_entries where player_id=pid),'No duplicate innings';
 assert (select count(*)=2 from public.player_match_coach_feedback where match_entry_id=mid),'No duplicate observations';
 -- Provider clip follows confirmed source IDs, including when another innings comes first.
 clip:='https://play.cricket.com.au/match/'||source||'?tab=scorecard&highlightId='||gen_random_uuid();
 insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard,fetched_by) values(snapshot,c,source,jsonb_build_object('provider','playcricket_au','match_id',source,'innings',jsonb_build_array(
  jsonb_build_object('id',gen_random_uuid(),'batters',jsonb_build_array(jsonb_build_object('player_id',sp,'dismissal_video_url','wrong-innings'))),
  jsonb_build_object('id',inn,'batters',jsonb_build_array(jsonb_build_object('player_id',gen_random_uuid(),'dismissal_video_url','wrong-player'),jsonb_build_object('player_id',sp,'dismissal_video_url',clip,'dismissal_video_thumbnail_url','https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'))))),captain);
 insert into public.match_review_score_links(club_id,source_match_id,source_innings_id,source_player_id,player_id,match_id,snapshot_id,stats,confirmed_by) values(c,source,inn,sp,pid,mid,snapshot,'{"runs":12,"balls":14,"status":"played","not_out":false}',captain);
 set local role authenticated;
 individual:=public.get_development_feedback_for_player(pid);
 assert individual#>>'{matches,0,scorecard,dismissal_video_thumbnail_url}'='https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg','Verified match thumbnail follows the exact player innings';
 assert individual#>>'{matches,0,scorecard,dismissal_video_url}'=clip,'Verified clip follows only the exact source innings and player';
 reset role;
end $test$;
rollback;
