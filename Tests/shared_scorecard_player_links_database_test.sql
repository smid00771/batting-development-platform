-- Synthetic records only; the nested exception rolls back every test change.
do $test$
declare c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();f uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();our uuid:=gen_random_uuid();them uuid:=gen_random_uuid();
 r1 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();r3 uuid:=gen_random_uuid();r4 uuid:=gen_random_uuid();r5 uuid:=gen_random_uuid();r6 uuid:=gen_random_uuid();r7 uuid:=gen_random_uuid();r8 uuid:=gen_random_uuid();
 s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();s3 uuid:=gen_random_uuid();s4 uuid:=gen_random_uuid();s5 uuid:=gen_random_uuid();s6 uuid:=gen_random_uuid();s7 uuid:=gen_random_uuid();s8 uuid:=gen_random_uuid();p1 uuid:=gen_random_uuid();
 d jsonb;card jsonb;picks jsonb;res jsonb;before_fixture jsonb;before_players jsonb;played date:=(now() at time zone 'Australia/Sydney')::date-1;
begin
 begin
  insert into auth.users(id,email) values(adm,'score-links-'||adm||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(adm,'Synthetic tester');
  insert into public.clubs(id,name,slug,created_by) values(c,'Score Links Test Club','score-links-'||c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin');
  insert into club_selection_private.access(club_id,mode,status) values(c,'standalone','active');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  insert into club_selection_private.roster(id,club_id,name,active) values
   (r1,c,'Alex Smith',true),(r2,c,'Jordan Lee',true),(r3,c,'Casey Jones',true),(r4,c,'Casey Jones',true),
   (r5,c,'Pat Jones',false),(r6,c,'A Smith',true),(r7,c,'Taylor Brown',true),(r8,c,'Morgan White',true);
  insert into public.players(id,club_id,display_name) values(p1,c,'Alex');
  insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,r1,p1);
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,s8,r8,adm);
  d:=jsonb_build_object('grade','1st Grade','competition','Test','format','limited_overs','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date',played)));
  picks:=jsonb_build_array(jsonb_build_object('d1',r1),jsonb_build_object('d1',r2),jsonb_build_object('d1',r3),jsonb_build_object('d1',r5),jsonb_build_object('d1',r6),jsonb_build_object('d1',r8));
  insert into club_selection_private.fixtures(id,club_id,details,slots,published) values(f,c,d,picks,jsonb_build_object('details',d,'slots',picks));
  card:=jsonb_build_object('provider','playcricket_au','schema_version',2,'status','completed','match_id',mid,'url','https://play.cricket.com.au/match/'||mid,'dates',jsonb_build_array(played),'grade','1st Grade','format_key','limited_overs',
   'teams',jsonb_build_array(jsonb_build_object('id',our,'name','Score Links Test Club','lineup_available',true,'players',jsonb_build_array(
    jsonb_build_object('player_id',s1,'name','Alex Smith'),jsonb_build_object('player_id',s2,'name','Jordan Lee'),jsonb_build_object('player_id',s3,'name','Casey Jones'),
    jsonb_build_object('player_id',s4,'name','Pat Jones'),jsonb_build_object('player_id',s5,'name','A Smith'),jsonb_build_object('player_id',s6,'name','Taylor Brown'),jsonb_build_object('player_id',s7,'name','Morgan White'))),jsonb_build_object('id',them,'name','Visitors')),
   'innings',jsonb_build_array(jsonb_build_object('team_id',our,'number',1,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',s1,'name','Alex Smith','runs',19,'balls',26,'not_out',false,'status','played','importable',true)),'bowlers','[]'::jsonb)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,adm,card);
  select to_jsonb(x) into before_fixture from club_selection_private.fixtures x where id=f;
  select jsonb_agg(to_jsonb(x)) into before_players from public.players x where club_id=c;
  assert jsonb_array_length(club_selection_private.link_selected_scorecard_players(c,sid,f,our,adm,false))=0,'No match association means no identity inference';
  perform public.club_match_results_api(c,'link',jsonb_build_object('fixture_id',f,'snapshot_id',sid,'team_id',our));
  assert (select count(*)=3 from club_selection_private.scorecard_roster_links where club_id=c),'Only two safe identities added; ambiguous, inactive, initial, unselected and conflicting identities skipped';
  assert exists(select 1 from public.match_review_player_links where club_id=c and source_player_id=s1 and player_id=p1),'Existing batting identity is bridged';
  assert (select count(*)=1 from public.players where club_id=c),'Teams-only player does not create a coaching record';
  assert exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=s2 and roster_id=r2),'Teams-only selected player linked';
  assert before_fixture=(select to_jsonb(x) from club_selection_private.fixtures x where id=f),'Published and draft selections unchanged';
  assert before_players=(select jsonb_agg(to_jsonb(x)) from public.players x where club_id=c),'Names, accounts and batting records unchanged';
  res:=public.club_season_stats_api(c);
  assert exists(select 1 from jsonb_array_elements(res->'identities') x where x->>'source_id'=s1::text and x->>'roster_id'=r1::text),'Season comparison gets selected roster identity';
  assert res#>>'{cards,0,scorecard,innings,0,batters,0,runs}'='19','Same imported runs reach stats';
  res:=public.club_match_results_api(c,'fixture',jsonb_build_object('fixture_id',f));
  assert res#>>'{cards,0,snapshot_id}'=sid::text,'Fixture reads the same upload';
  perform public.club_match_results_api(c,'link',jsonb_build_object('fixture_id',f,'snapshot_id',sid,'team_id',our));
  assert (select count(*)=1 from club_selection_private.audit where club_id=c and action='scorecard_selected_identities'),'Retry does not duplicate identity audit';
  assert jsonb_array_length(club_selection_private.link_selected_scorecard_players(c,sid,f,our,adm,false))=0,'Dry run sees nothing left to link';
  delete from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=s2;
  update club_selection_private.fixtures set published=null where id=f;
  assert jsonb_array_length(club_selection_private.link_selected_scorecard_players(c,sid,f,our,adm,false))=0,'Draft-only lineup is insufficient';
  update club_selection_private.fixtures set published=before_fixture->'published' where id=f;
  update public.match_review_scorecards set scorecard=jsonb_set(card,'{dates}',jsonb_build_array(played-1)) where id=sid;
  assert jsonb_array_length(club_selection_private.link_selected_scorecard_players(c,sid,f,our,adm,false))=0,'Wrong date cannot link';
  update public.match_review_scorecards set scorecard=jsonb_set(card,'{status}','"playing"') where id=sid;
  assert jsonb_array_length(club_selection_private.link_selected_scorecard_players(c,sid,f,our,adm,false))=0,'Unfinished match cannot infer identities';
  assert not has_function_privilege('anon','club_selection_private.link_selected_scorecard_players(uuid,uuid,uuid,uuid,uuid,boolean)','EXECUTE') and not has_function_privilege('authenticated','club_selection_private.link_selected_scorecard_players(uuid,uuid,uuid,uuid,uuid,boolean)','EXECUTE'),'Private helper is not client callable';
  raise exception using errcode='P0199',message='Rollback synthetic identity links';
 exception when sqlstate 'P0199' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $test$;
select 'Shared scorecard identity links: permissions, safe matching, ambiguity guards, reuse and idempotency passed; synthetic data rolled back.' as result;
