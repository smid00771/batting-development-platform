-- Synthetic club only. Every change, including any queued notification, is rolled back.
begin;
do $tests$
declare c uuid:=gen_random_uuid();other uuid:=gen_random_uuid();u uuid:=gen_random_uuid();viewer uuid:=gen_random_uuid();
 sg uuid:=gen_random_uuid();offsg uuid:=gen_random_uuid();g uuid:=gen_random_uuid();offg uuid:=gen_random_uuid();moved uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid();offp uuid:=gen_random_uuid();r uuid:=gen_random_uuid();offr uuid:=gen_random_uuid();f uuid:=gen_random_uuid();offf uuid:=gen_random_uuid();
 mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();appearance uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();legacy uuid:=gen_random_uuid();
 d jsonb;offd jsonb;card jsonb;res jsonb;request jsonb;before_players jsonb;denied boolean;played date:=current_date-1;
begin
 insert into auth.users(id,email) values(u,'group-test-'||u||'@example.invalid'),(viewer,'group-test-'||viewer||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Group Test Admin'),(viewer,'Group Test Viewer');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic Batting Groups','batting-groups-'||c,u),(other,'Other Synthetic Club','other-'||other,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin'),(c,viewer,'player','none');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,'Senior teams'),(offsg,c,'Masters');
 insert into public.playing_groups(id,club_id,name,active) values(g,c,'First XI',true),(offg,c,'Masters XI',true),(moved,c,'New XI',true);
 insert into club_selection_private.selection_group_grades values(c,g,sg),(c,offg,offsg),(c,moved,offsg);
 res:=public.club_selection_groups(c,'context');
 assert res->>'batting_available'='true','Bundled club gets the control';
 assert not exists(select 1 from public.playing_groups where club_id=c and batting_enabled),'New groups and teams are off';
 request:=jsonb_build_object('revision',res->'revision','request_id',gen_random_uuid(),'selection_group_id',sg,'batting_enabled',true);
 res:=public.club_selection_group_manage(c,'set_batting',request);
 assert res=public.club_selection_group_manage(c,'set_batting',request),'Checkbox retry returns the same receipt';
 assert (select batting_enabled from public.playing_groups where id=g) and not (select batting_enabled from public.playing_groups where id=offg),'Only the chosen group is enabled';
 denied:=false;begin perform public.club_selection_group_manage(c,'set_batting',request||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then denied:=true;end;assert denied,'Stale checkbox rejected';
 request:=jsonb_build_object('revision',res->'revision','request_id',gen_random_uuid(),'selection_group_id',sg,'grade_id',moved);
 res:=public.club_selection_group_manage(c,'move_team',request);
 assert (select batting_enabled from public.playing_groups where id=moved),'Moving into the selected group inherits its choice';
 insert into public.players(id,club_id,display_name,active) values(p,c,'Alex Player',true),(offp,c,'Morgan Master',true);
 insert into club_selection_private.roster(id,club_id,name,active) values(r,c,'Alex Player',true),(offr,c,'Morgan Master',true);
 insert into club_batting_private.roster_players(roster_id,club_id,player_id) values(r,c,p),(offr,c,offp);
 insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by) values(c,p,g,u),(c,offp,offg,u);
 d:=jsonb_build_object('grade','First XI','grade_group_id',g,'competition','Test','opposition','Visitors','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',played)));
 offd:=d||jsonb_build_object('grade','Masters XI','grade_group_id',offg);
 insert into club_selection_private.fixtures(id,club_id,details,slots,published) values
 (f,c,d,jsonb_build_array(jsonb_build_object('d1',r)),jsonb_build_object('details',d,'slots',jsonb_build_array(jsonb_build_object('d1',r)))),
 (offf,c,offd,jsonb_build_array(jsonb_build_object('d1',offr)),jsonb_build_object('details',offd,'slots',jsonb_build_array(jsonb_build_object('d1',offr))));
 assert club_batting_private.player_uses_batting(c,p) and not club_batting_private.player_uses_batting(c,offp),'Off group does not participate';
 assert not club_batting_private.player_uses_batting(other,p),'Participation is club scoped';
 assert club_batting_private.plan_reminder_due(c,offp)='[]'::jsonb,'Off group has no plan reminders';
 res:=public.get_team_review_roster(c);
 assert exists(select 1 from jsonb_array_elements(res->'fixtures') x where x->>'id'=f::text) and not exists(select 1 from jsonb_array_elements(res->'fixtures') x where x->>'id'=offf::text),'Match Review excludes the off group';
 -- An existing global PlayCricket identity must not block a separate API appearance.
 insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by) values(c,legacy,p,u);
 insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,legacy,r,u);
 card:=jsonb_build_object('provider','playhq_au','status','completed','match_id',mid,'dates',jsonb_build_array(played),'format_key','limited_overs','grade','First XI',
 'teams',jsonb_build_array(jsonb_build_object('id',tid,'lineup_available',true,'name','Synthetic Batting Groups','players',jsonb_build_array(jsonb_build_object('player_id',appearance,'name','Alex Player')))),
 'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'number',1,'team_id',tid,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',appearance,'name','Alex Player','runs',42,'status','played','not_out',false,'importable',true)))));
 insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard,fetched_by) values(sid,c,mid,card,u);
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(f,c,mid,tid,u);
 perform club_selection_private.link_selected_scorecard_players(c,sid,f,tid,u);
 assert exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=appearance and roster_id=r),'Published full-name identity linked within this match';
 assert (select count(*)=1 from public.match_review_player_links where club_id=c and player_id=p),'Global identity remains unchanged';
 res:=public.get_match_review_scorecard(c,sid);
 assert exists(select 1 from jsonb_array_elements(res->'player_links') l where l->>'source_player_id'=appearance::text and l->>'player_id'=p::text),'Match Review receives the scoped identity';
 res:=public.club_match_results_api(c,'review',jsonb_build_object('fixture_id',f,'group_id',g,'match_date',played,'format_key','limited_overs'));
 assert res#>>'{preview,snapshot_id}'=sid::text,'Automatically saved scorecard is available without another upload';
 assert public.club_match_results_api(c,'fixture',jsonb_build_object('fixture_id',f))->>'can_review'='true','Participating team offers Match Review link';
 select jsonb_agg(to_jsonb(x) order by id) into before_players from public.players x where club_id=c;
 res:=public.club_selection_groups(c,'context');
 request:=jsonb_build_object('revision',res->'revision','request_id',gen_random_uuid(),'selection_group_id',sg,'batting_enabled',false);
 res:=public.club_selection_group_manage(c,'set_batting',request);
 assert not club_batting_private.player_uses_batting(c,p),'Turning off stops participation';
 assert public.club_match_results_api(c,'fixture',jsonb_build_object('fixture_id',f))->>'can_review'='false','Opt-out removes Match Review link';
 assert before_players=(select jsonb_agg(to_jsonb(x) order by id) from public.players x where club_id=c),'Existing player records are preserved';
 assert exists(select 1 from public.player_playing_groups where club_id=c and player_id=p and playing_group_id=g),'Existing membership is preserved';
 assert exists(select 1 from public.match_review_scorecards where id=sid),'Downloaded results are retained for Teams';
 res:=public.club_match_results_api(c,'review',jsonb_build_object('match_date',played,'format_key','limited_overs'));
 assert jsonb_array_length(res->'choices')=0,'Off group scores do not flow through another review picker';
 -- Product entitlement and role both gate writes, including stale clients.
 perform set_config('request.jwt.claim.sub',viewer::text,true);
 denied:=false;begin perform public.club_selection_group_manage(c,'set_batting',request||jsonb_build_object('request_id',gen_random_uuid(),'revision',res->'revision'));exception when raise_exception then denied:=true;end;assert denied,'Ordinary member cannot configure groups';
 perform set_config('request.jwt.claim.sub',u::text,true);
 update club_selection_private.access set mode='standalone' where club_id=c;
 res:=public.club_selection_groups(c,'context');assert res->>'batting_available'='false','Teams-only clubs hide the control';
 denied:=false;begin perform public.club_selection_group_manage(c,'set_batting',jsonb_build_object('request_id',gen_random_uuid(),'revision',res->'revision','selection_group_id',sg,'batting_enabled',true));exception when raise_exception then denied:=true;end;assert denied,'Teams-only club cannot bypass hidden control';
 assert not has_function_privilege('authenticated','club_batting_private.scorecard_player_links(uuid,jsonb)','execute'),'Private bridge cannot be called directly';
end $tests$;
rollback;
select 'Group opt-in, inherited team choice, idempotency, access, no-plan exclusion and shared automatic scores passed; all synthetic data rolled back.' as result;
