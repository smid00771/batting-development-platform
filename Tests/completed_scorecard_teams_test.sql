-- Isolated synthetic club and users; schema and test data are rolled back by the runner.
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();f uuid:=gen_random_uuid();
 r1 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();r3 uuid:=gen_random_uuid();
 a1 uuid:=gen_random_uuid();a2 uuid:=gen_random_uuid();a3 uuid:=gen_random_uuid();
 mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();
 d jsonb;card jsonb;result jsonb;before_slots jsonb;revision_before integer;played date:=current_date-1;
begin
 insert into auth.users(id,email) values(u,'scorecard-'||u||'@example.invalid'),(outsider,'scorecard-'||outsider||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic Admin'),(outsider,'Synthetic Outsider');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic Scorecard Club','scorecard-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',u);
 insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,'Senior teams');
 insert into public.playing_groups(id,club_id,name,active) values(g,c,'First XI',true),(g2,c,'Second XI',true);
 insert into club_selection_private.selection_group_grades values(c,g,sg);
 insert into club_selection_private.roster(id,club_id,name,active) values(r1,c,'Alex Example',true),(r2,c,'Bailey Example',true),(r3,c,'Casey Example',true);
 d:=jsonb_build_object('grade','First XI','grade_group_id',g,'competition','Synthetic','opposition','Visitors','format','limited_overs','overs',40,'days',jsonb_build_array(jsonb_build_object('date',played,'start','12:00')));
 before_slots:=jsonb_build_array(jsonb_build_object('d1',r2,'d2',null),jsonb_build_object('d1',r1,'d2',null),jsonb_build_object('d1',r3,'d2',null));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(f,c,d,before_slots);
 card:=jsonb_build_object('provider','playhq_au','status','completed','match_id',mid,'dates',jsonb_build_array(played),'format_key','limited_overs','grade','First XI',
  'teams',jsonb_build_array(jsonb_build_object('id',tid,'name','Synthetic Scorecard Club','lineup_available',true,'players',jsonb_build_array(jsonb_build_object('player_id',a1,'name','Alex Example'),jsonb_build_object('player_id',a2,'name','Bailey Example')))),
  'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'number',1,'team_id',tid,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',a1,'name','Alex Example','runs',42,'status','played','not_out',false,'importable',true)))));
 insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard,fetched_by) values(sid,c,mid,card,u);
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(f,c,mid,tid,u);
 assert jsonb_array_length(club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u,false))=2,'Draft selections support a safe preview';
 assert not exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c),'Preview makes no identity writes';
 assert (select slots=before_slots from club_selection_private.fixtures where id=f),'Preview does not replace the team';
 assert club_selection_private.link_selected_scorecard_players(c,sid,f,tid,outsider)='[]'::jsonb,'Non-member cannot link';
 perform club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u);
 assert (select count(*)=2 from club_selection_private.scorecard_roster_links where club_id=c),'Known players linked without publication';
 assert (select published is null and publication=0 and slots#>>'{0,d1}'=r2::text and slots#>>'{1,d1}'=r1::text and slots#>>'{2,d1}' is null and scorecard_sync->>'source'='completed_scorecard' from club_selection_private.fixtures where id=f),'Actual XI removes a non-player, keeps selected order, and does not publish';
 assert not exists(select 1 from club_selection_private.publications where fixture_id=f),'Recovery creates no publication';
 select revision into revision_before from club_selection_private.fixtures where id=f;
 perform club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u);
 assert (select revision=revision_before from club_selection_private.fixtures where id=f),'Identical import is idempotent';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 result:=public.club_season_stats_api(c,'context');
 assert exists(select 1 from jsonb_array_elements(result->'identities') i where i->>'source_id'=a1::text and i->>'roster_id'=r1::text),'Season stats receive the recovered identities';
 -- Completed, latest and matching-source safeguards also apply to draft recovery.
 update public.match_review_scorecards set scorecard=jsonb_set(card,'{status}','"in_progress"') where id=sid;
 assert club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u,false)='[]'::jsonb,'Unfinished scorecards cannot link a team';
 assert not club_selection_private.recover_completed_scorecard_team(c,sid,f,tid,u),'Unfinished scorecards cannot recover a team';
 update public.match_review_scorecards set scorecard=card where id=sid;
 update club_selection_private.fixtures set published=jsonb_build_object('details',d,'slots',before_slots) where id=f;
 assert not club_selection_private.recover_completed_scorecard_team(c,sid,f,tid,u),'Published selections require the existing review flow';
 update club_selection_private.fixtures set published=null,details=d||'{"brackets":true}'::jsonb where id=f;
 assert not club_selection_private.recover_completed_scorecard_team(c,sid,f,tid,u),'Bracketed days cannot be inferred';
 update club_selection_private.fixtures set details=d where id=f;
 update club_selection_private.fixture_result_sources set no_play='washed_out',source_match_id=null,team_id=null where fixture_id=f;
 assert not club_selection_private.recover_completed_scorecard_team(c,sid,f,tid,u),'No-play decisions are retained';
 update club_selection_private.fixture_result_sources set no_play=null,source_match_id=mid,team_id=tid where fixture_id=f;
 assert not club_selection_private.recover_completed_scorecard_team(c,sid,f,gen_random_uuid(),u),'Wrong source team is rejected';
 assert not club_selection_private.recover_completed_scorecard_team(gen_random_uuid(),sid,f,tid,u),'Another club cannot recover the fixture';
 insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by,created_at) values(c,mid,card,u,now()+interval '1 second');
 assert club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u,false)='[]'::jsonb,'An older snapshot cannot link players';
 assert not club_selection_private.recover_completed_scorecard_team(c,sid,f,tid,u),'An older snapshot cannot replace a team';
 delete from public.match_review_scorecards where club_id=c and id<>sid;
 -- A confirmed source identity is not sufficient to move someone out of another match silently.
 update club_selection_private.fixtures set slots=before_slots,scorecard_sync=null where id=f;
 insert into club_selection_private.fixtures(club_id,details,slots) values(c,d||jsonb_build_object('grade','Second XI','grade_group_id',g2),jsonb_build_array(jsonb_build_object('d1',r1)));
 assert not club_selection_private.recover_completed_scorecard_team(c,sid,f,tid,u),'Cross-team conflicts require review';
 delete from club_selection_private.fixtures where club_id=c and id<>f;
 -- Hidden players do not prevent visible selected players from being linked.
 delete from club_selection_private.scorecard_roster_links where club_id=c;
 update club_selection_private.fixtures set slots=before_slots,scorecard_sync=null where id=f;
 card:=jsonb_set(card,'{teams,0,lineup_available}','false');
 card:=jsonb_set(card,'{teams,0,players}',card#>'{teams,0,players}'||jsonb_build_array(jsonb_build_object('player_id',null,'name',null)));
 update public.match_review_scorecards set scorecard=card where id=sid;
 perform club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u);
 assert (select count(*)=2 from club_selection_private.scorecard_roster_links where club_id=c),'Visible players still update stats';
 assert (select slots=before_slots and scorecard_sync is null from club_selection_private.fixtures where id=f),'Withheld lineup cannot replace a whole team';
 -- Publication after importing scores must not need another provider request.
 delete from club_selection_private.scorecard_roster_links where club_id=c;
 update club_selection_private.fixtures set updated_by=u,published=jsonb_build_object('details',d,'slots',before_slots) where id=f;
 assert (select count(*)=2 from club_selection_private.scorecard_roster_links where club_id=c),'Late publication reprocesses the existing scorecard';
 update club_selection_private.fixtures set published=null where id=f;
 -- A full-name duplicate is unresolved even if one duplicate is selected.
 delete from club_selection_private.scorecard_roster_links where club_id=c;
 insert into club_selection_private.roster(club_id,name,active) values(c,'Alex Example',true);
 perform club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u);
 assert not exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=a1),'Names never collapse duplicate club players';
 -- An explicit confirmation can link a replacement against the same completed fixture.
 card:=jsonb_set(card,'{teams,0,players}',jsonb_build_array(jsonb_build_object('player_id',a1,'name','Alex Example'),jsonb_build_object('player_id',a2,'name','Bailey Example'),jsonb_build_object('player_id',a3,'name','Casey Example')));
 update public.match_review_scorecards set scorecard=card where id=sid;
 update club_selection_private.fixtures set slots=jsonb_build_array(jsonb_build_object('d1',r2)) where id=f;
 result:=public.confirm_scorecard_player(c,gen_random_uuid(),jsonb_build_object('snapshot_id',sid,'team_id',tid,'source_player_id',a3,'roster_id',r3,'fixture_id',f,'expected_name','Casey Example'));
 assert result->>'confirmed'='true','Explicitly reviewed replacement does not require a published team';
 assert not has_function_privilege('authenticated','club_selection_private.recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid)','execute'),'No direct client bypass';
 assert not has_function_privilege('anon','club_selection_private.recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid)','execute'),'No anonymous recovery';
end $tests$;
