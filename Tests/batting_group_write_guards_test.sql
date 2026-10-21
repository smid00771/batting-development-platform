-- Synthetic club only. Run after batting_group_write_guards.sql inside a
-- transaction; every record and queued effect is discarded by ROLLBACK.
begin;
do $tests$
declare
 c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();sg2 uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();p uuid:=gen_random_uuid();offp uuid:=gen_random_uuid();
 roster uuid:=gen_random_uuid();f uuid:=gen_random_uuid();f2 uuid:=gen_random_uuid();
 source uuid:=gen_random_uuid();team uuid:=gen_random_uuid();snapshot uuid:=gen_random_uuid();
 request uuid:=gen_random_uuid();review uuid;played date:=current_date-3;d jsonb;d2 jsonb;values jsonb;res jsonb;before_review jsonb;
 denied boolean;checks integer:=0;
begin
 insert into auth.users(id,email) values(u,'batting-write-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic Review Admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic Batting Write Club','batting-write-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'First group',true),(sg2,c,'Other group',true);
 insert into public.playing_groups(id,club_id,name,active) values(g,c,'First XI',true),(g2,c,'Other XI',true);
 insert into club_selection_private.selection_group_grades values(c,g,sg),(c,g2,sg2);
 insert into public.players(id,club_id,display_name,active) values(p,c,'Shared Player',true),(offp,c,'Off Player',true);
 insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by) values(c,p,g,u),(c,p,g2,u),(c,offp,g,u);
 insert into club_selection_private.roster(id,club_id,name,active) values(roster,c,'Shared Player',true);
 insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,roster,p);
 d:=jsonb_build_object('grade','First XI','grade_group_id',g,'opposition','First Visitors','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',played)));
 d2:=jsonb_build_object('grade','Other XI','grade_group_id',g2,'opposition','Other Visitors','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',played-1)));
 insert into club_selection_private.fixtures(id,club_id,details,slots,published) values
  (f,c,d,jsonb_build_array(jsonb_build_object('d1',roster)),jsonb_build_object('details',d,'slots',jsonb_build_array(jsonb_build_object('d1',roster)))),
  (f2,c,d2,jsonb_build_array(jsonb_build_object('d1',roster)),jsonb_build_object('details',d2,'slots',jsonb_build_array(jsonb_build_object('d1',roster))));
 values:=jsonb_build_object('fixture_id',f,'group_id',g,'group_scope','group','match_date',played,'format_key','limited_overs','opposition','First Visitors','innings_number',1,
  'rows',jsonb_build_array(jsonb_build_object('player_id',p,'batting_to_plan','did_not_bat')));
 res:=public.save_team_match_review(c,request,values);review:=(res->>'review_id')::uuid;
 assert review is not null,'An opted-in published team saves normally';checks:=checks+1;
 select to_jsonb(r) into before_review from public.team_review_sessions r where r.id=review;
 insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard,fetched_by) values(snapshot,c,source,
  jsonb_build_object('provider','playhq_au','match_id',source,'dates',jsonb_build_array(played),'format_key','limited_overs','teams',jsonb_build_array(jsonb_build_object('id',team)),'innings','[]'::jsonb),u);
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(f,c,source,team,u);
 update club_selection_private.selection_groups set batting_enabled=false where id=sg;
 assert club_batting_private.player_uses_batting(c,p) and not club_batting_private.player_uses_batting(c,offp),'Another opted-in group keeps its player participating';checks:=checks+1;
 -- A client with the exact old review, current revision and valid author must
 -- still be rejected. This tests the public writer, not only the helper.
 denied:=false;begin
  perform public.save_team_match_review(c,gen_random_uuid(),values||jsonb_build_object('review_id',review,'expected_revision',res->'revision'));
 exception when raise_exception then denied:=position('does not use Club Batting' in sqlerrm)>0;end;
 assert denied,'Stale existing review cannot write after opt-out';checks:=checks+1;
 assert public.save_team_match_review(c,request,values)->>'already_saved'='true','Retrying an already committed save remains idempotent';checks:=checks+1;
 denied:=false;begin
  perform public.save_team_match_review(c,gen_random_uuid(),(values-'fixture_id')||jsonb_build_object('match_date',played-2,'opposition','No Fixture Visitors'));
 exception when raise_exception then denied:=position('does not use Club Batting' in sqlerrm)>0;end;
 assert denied,'Removing fixture_id does not bypass a disabled group';checks:=checks+1;
 denied:=false;begin
  perform public.save_team_match_review(c,gen_random_uuid(),(values-'fixture_id'-'group_id')||jsonb_build_object('group_scope','all','rows',jsonb_build_array(jsonb_build_object('player_id',offp,'batting_to_plan','did_not_bat'))));
 exception when raise_exception then denied:=position('no longer participates in Club Batting' in sqlerrm)>0;end;
 assert denied,'An unscoped review cannot write for an opted-out-only player';checks:=checks+1;
 denied:=false;begin
  perform public.save_team_match_review(c,gen_random_uuid(),(values-'fixture_id'-'group_id')||jsonb_build_object('group_scope','all','rows','[]'::jsonb,
   'scorecard_import',jsonb_build_object('snapshot_id',snapshot,'team_id',team,'rows',jsonb_build_array(jsonb_build_object('player_id',p)))));
 exception when raise_exception then denied:=position('scorecard team does not use Club Batting' in sqlerrm)>0;end;
 assert denied,'Fixture-less import cannot reuse an opted-out team source even for a still-participating player';checks:=checks+1;
 denied:=false;begin
  perform club_batting_private.apply_match_review_scores(c,review,values,jsonb_build_object('snapshot_id',snapshot,'team_id',team,'rows',jsonb_build_array(jsonb_build_object('player_id',p))),'[]'::jsonb);
 exception when raise_exception then denied:=position('does not use Club Batting' in sqlerrm)>0;end;
 assert denied,'Score application itself rechecks the saved review group';checks:=checks+1;
 assert before_review=(select to_jsonb(r) from public.team_review_sessions r where r.id=review),'Rejected writes preserve the saved review';checks:=checks+1;
 assert exists(select 1 from public.team_review_items where review_id=review and player_id=p and removed_at is null),'Saved review items are retained';checks:=checks+1;
 assert exists(select 1 from public.match_review_scorecards where id=snapshot),'Shared Teams results are retained';checks:=checks+1;
 assert public.get_shared_team_review(c,review)#>>'{review,id}'=review::text,'History remains readable';checks:=checks+1;
 res:=public.save_team_match_review(c,gen_random_uuid(),values||jsonb_build_object('fixture_id',f2,'group_id',g2,'match_date',played-1,'opposition','Other Visitors'));
 assert res->>'review_id' is not null,'Other opted-in group work still saves';checks:=checks+1;
 res:=public.save_team_match_review(c,gen_random_uuid(),(values-'fixture_id'-'group_id')||jsonb_build_object('group_scope','all','match_date',played-2,'opposition','Independent Visitors'));
 assert res->>'review_id' is not null,'A participating player still permits a fixture-less review';checks:=checks+1;
 assert not has_function_privilege('authenticated','club_batting_private.assert_review_batting_write(uuid,uuid,uuid,jsonb,uuid,uuid)','execute')
  and not has_function_privilege('anon','club_batting_private.assert_review_batting_write(uuid,uuid,uuid,jsonb,uuid,uuid)','execute'),'Private guard is not directly callable';checks:=checks+1;
 raise notice 'Batting group write guards: % assertions passed',checks;
end $tests$;
rollback;
select 'Stale review writes, fixture-less imports, retained history, retries and other enabled-group work passed; all synthetic changes rolled back.' as result;
