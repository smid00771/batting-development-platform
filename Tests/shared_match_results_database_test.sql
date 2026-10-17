-- Synthetic data only. Changes are rolled back, including all import associations.
do $test$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();mgr uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();u uuid;
 f1 uuid:=gen_random_uuid();f2 uuid:=gen_random_uuid();f3 uuid:=gen_random_uuid();gid uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid();new_sid uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();our uuid:=gen_random_uuid();them uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();bowler uuid:=gen_random_uuid();
 card jsonb;d jsonb;res jsonb;review jsonb;denied boolean;
begin
 begin
  foreach u in array array[adm,mgr,ordinary] loop
   insert into auth.users(id,email) values(u,'shared-results-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic results tester');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Shared Results Test Club','shared-results-'||c,adm),(other_c,'Other Results Club','other-results-'||other_c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,mgr,'player','none'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status) values(c,'standalone','active');
  insert into club_selection_private.social_managers values(c,mgr);
  insert into public.playing_groups(id,club_id,name,active,created_by) values(gid,c,'1st Grade',true,adm);
  d:=jsonb_build_object('grade','1st Grade','competition','Test','format','limited_overs','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date','2026-10-17')),'brackets',false);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(f1,c,d,'[]'),(f2,c,d||'{"grade":"2nd Grade"}','[]'),(f3,c,d||'{"grade":"3rd Grade","format":"long_form","days":[{"date":"2026-10-17"},{"date":"2026-10-24"}]}','[]');
  card:=jsonb_build_object('provider','playcricket_au','schema_version',2,'status','completed','match_id',mid,'url','https://play.cricket.com.au/match/'||mid,'dates',jsonb_build_array('2026-10-17'),'grade','1st Grade','format_key','limited_overs','result','Shared Results Test Club won',
   'teams',jsonb_build_array(jsonb_build_object('id',our,'name','Shared Results Test Club'),jsonb_build_object('id',them,'name','Visitors')),
   'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',our,'number',1,'complete',true,'bowling_available',true,'batters',jsonb_build_array(jsonb_build_object('player_id',pid,'name','Century Batter','runs',112,'status','played','not_out',false,'importable',true)),'bowlers','[]'::jsonb),
    jsonb_build_object('id',gen_random_uuid(),'team_id',them,'number',1,'complete',true,'bowling_available',true,'batters','[]'::jsonb,'bowlers',jsonb_build_array(jsonb_build_object('player_id',bowler,'name','Five Wicket Bowler','team_id',our,'wickets',5,'runs',27,'importable',true)))));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,mgr,card);
  perform set_config('request.jwt.claim.sub',mgr::text,true);
  res:=public.club_match_results_api(c,'context','{"week_end":"2026-10-18"}');
  assert jsonb_array_length(res->'fixtures')=3 and jsonb_array_length(res->'cards')=1,'Standalone socials manager sees expected and imported matches';
  assert not club_batting_private.team_review_staff(c),'Results import never grants coaching access';
  perform public.club_match_results_api(c,'link',jsonb_build_object('fixture_id',f1,'snapshot_id',sid,'team_id',our));
  perform public.club_match_results_api(c,'link',jsonb_build_object('fixture_id',f1,'snapshot_id',sid,'team_id',our));
  assert (select count(*)=1 from club_selection_private.fixture_result_sources where club_id=c),'Retry creates no duplicate association';
  assert (select count(*)=1 from public.match_review_scorecards where club_id=c),'Linking never copies a scorecard';
  denied:=false;begin perform public.club_match_results_api(c,'review',jsonb_build_object('match_date','2026-10-17','group_id',gid,'format_key','limited_overs'));exception when raise_exception then denied:=true;end;assert denied,'Socials-only user cannot read coaching preview';
  perform set_config('request.jwt.claim.sub',adm::text,true);
  review:=public.club_match_results_api(c,'review',jsonb_build_object('match_date','2026-10-17','group_id',gid,'format_key','limited_overs'));
  assert review#>>'{preview,snapshot_id}'=sid::text and review#>>'{preview,our_team_id}'=our::text,'Match Review reuses the exact Teams-imported snapshot';
  assert review#>>'{preview,scorecard,innings,0,batters,0,runs}'='112','Shared batting figures reach Match Review without another import';
  -- A Match Review refresh replaces the current version for Teams too.
  card:=jsonb_set(card,'{innings,0,batters,0,runs}','118');
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard,created_at) values(new_sid,c,mid,adm,card,now()+interval '1 second');
  perform set_config('request.jwt.claim.sub',mgr::text,true);
  res:=public.club_match_results_api(c,'context','{"week_end":"2026-10-18"}');
  assert jsonb_array_length(res->'cards')=1 and res#>>'{cards,0,snapshot_id}'=new_sid::text,'Teams uses the latest version imported through Match Review';
  assert res#>>'{cards,0,scorecard,innings,0,batters,0,runs}'='118','Updated figures are shared';
  if to_regprocedure('public.club_social_awards_api(uuid,text,jsonb)') is not null then
   res:=public.club_social_awards_api(c,'context','{"week_end":"2026-10-18"}');
   assert exists(select 1 from jsonb_array_elements(res->'candidates') x where x->>'kind'='century' and x#>>'{stat,runs}'='118'),'Century awards use the shared update';
   assert exists(select 1 from jsonb_array_elements(res->'candidates') x where x->>'kind'='five_wickets'),'Bowling awards use the same import';
   assert jsonb_array_length(public.team_of_week_api(c,'context','{"week_end":"2026-10-18"}')->'candidates')=2,'Team of Week uses shared performances';
   assert jsonb_array_length(public.player_of_week_api(c,'context','{"week_end":"2026-10-18"}')->'candidates')=2,'Player of Week uses shared performances';
  end if;
  perform public.club_match_results_api(c,'no_play',jsonb_build_object('fixture_id',f2,'reason','washed_out'));
  res:=public.club_match_results_api(c,'context','{"week_end":"2026-10-18"}');
  assert exists(select 1 from jsonb_array_elements(res->'fixtures') x where x->>'id'=f2::text and x->>'no_play'='washed_out'),'No play is accounted for';
  perform public.club_match_results_api(c,'no_play',jsonb_build_object('fixture_id',f2,'reason',''));
  assert not exists(select 1 from club_selection_private.fixture_result_sources where fixture_id=f2),'No-play choice can be undone';
  denied:=false;begin perform public.club_match_results_api(c,'link',jsonb_build_object('fixture_id',f3,'snapshot_id',sid));exception when raise_exception then denied:=true;end;assert denied,'Wrong format rejected';
  denied:=false;begin perform public.club_match_results_api(other_c,'context','{"week_end":"2026-10-18"}');exception when raise_exception then denied:=true;end;assert denied,'Other club denied';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  denied:=false;begin perform public.club_match_results_api(c,'context','{"week_end":"2026-10-18"}');exception when raise_exception then denied:=true;end;assert denied,'Ordinary member denied';
  raise exception using errcode='P0199',message='Rollback synthetic shared results';
 exception when sqlstate 'P0199' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_c));
end $test$;
select 'Standalone results, both-way reuse, latest versions, awards, no-play undo and permission checks passed; synthetic data rolled back.' as result;
