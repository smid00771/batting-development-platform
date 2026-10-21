begin;
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();sel uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();g3 uuid:=gen_random_uuid();foreign_grade uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();
 org uuid:=gen_random_uuid();season uuid:=gen_random_uuid();generation uuid:=gen_random_uuid();team1 uuid:=gen_random_uuid();team3 uuid:=gen_random_uuid();source1 uuid:=gen_random_uuid();source3 uuid:=gen_random_uuid();
 catalogue jsonb;ctx jsonb;req jsonb;saved jsonb;bad jsonb;rejected boolean;pid uuid:=gen_random_uuid();old_fixture uuid:=gen_random_uuid();current_fixture uuid:=gen_random_uuid();duplicate_fixture uuid:=gen_random_uuid();d jsonb;slots jsonb;
begin
 insert into auth.users(id,email) values(u,'groups-'||u||'@example.invalid'),(sel,'groups-'||sel||'@example.invalid'),(outsider,'groups-'||outsider||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Test admin'),(sel,'Test selector'),(outsider,'Other club admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Any Club','groups-'||c,u),(other_c,'Other club','groups-'||other_c,outsider);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'admin','admin','player'),(c,sel,'player','none','player'),(other_c,outsider,'admin','admin','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 insert into club_selection_private.selectors(club_id,user_id) values(c,sel);
 insert into public.playing_groups(id,club_id,name) values(g1,c,'1st Grade'),(g2,c,'2nd Grade'),(foreign_grade,other_c,'Foreign Grade');
 insert into club_selection_private.season_appointments(group_id,club_id,captain_user_id,updated_by) values(g1,c,u,u);
 insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,generation,updated_by) values(c,org,gen_random_uuid(),gen_random_uuid(),generation,u);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 catalogue:=public.playhq_store_teams(c,generation,season,jsonb_build_array(
  jsonb_build_object('id',team1,'club',jsonb_build_object('id',org),'grade',jsonb_build_object('id',source1,'name','1st Grade')),
  jsonb_build_object('id',team3,'club',jsonb_build_object('id',org),'grade',jsonb_build_object('id',source3,'name','3rd Grade')),
  jsonb_build_object('id',gen_random_uuid(),'club',jsonb_build_object('id',gen_random_uuid()),'grade',jsonb_build_object('id',source3,'name','Other club team'))));
 assert jsonb_array_length(catalogue->'teams')=2,'Discovery is limited to this club';
 rejected:=false;begin perform public.playhq_store_teams(c,gen_random_uuid(),season,'[]');exception when raise_exception then rejected:=true;end;assert rejected,'Stale connection rejected';
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 rejected:=false;begin perform public.playhq_store_teams(c,generation,season,'[]');exception when raise_exception then rejected:=true;end;assert rejected,'Client cannot forge source teams';
 ctx:=public.club_selection_groups(c,'context');assert ctx->'selection_groups'='[]','No club-specific groups are preconfigured';
 req:=jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades','catalogue_id',catalogue->>'catalogue_id',
  'groups',jsonb_build_array(jsonb_build_object('id',a,'name','Weekend teams'),jsonb_build_object('id',b,'name','Separate cup')),
  'grades',jsonb_build_array(jsonb_build_object('id',g1,'selection_group_id',a,'team_id',team1),jsonb_build_object('id',g2,'selection_group_id',a),jsonb_build_object('id',g3,'name','3rd Grade','selection_group_id',b,'team_id',team3)));
 rejected:=false;begin perform public.club_selection_groups(c,'save',jsonb_set(req,'{grades,2,team_id}',to_jsonb(gen_random_uuid())));exception when raise_exception then rejected:=true;end;assert rejected,'Only downloaded club teams can create grades';
 assert not exists(select 1 from club_selection_private.selection_groups where club_id=c),'Invalid setup is atomic';
 rejected:=false;begin perform public.club_selection_groups(c,'save',jsonb_set(req,'{grades,2,id}',to_jsonb(foreign_grade)));exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club grade rejected';
 rejected:=false;begin perform public.club_selection_groups(c,'save',jsonb_set(req,'{grades}',(req->'grades')-1));exception when raise_exception then rejected:=true;end;assert rejected,'Existing grades require confirmation';
 perform set_config('request.jwt.claim.sub',sel::text,true);
 assert public.club_selection_groups(c,'context')->>'can_edit'='false';
 rejected:=false;begin perform public.club_selection_groups(c,'save',req);exception when raise_exception then rejected:=true;end;assert rejected,'Selector cannot change shared grade setup';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 rejected:=false;begin perform public.club_selection_groups(c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club context denied';
 perform set_config('request.jwt.claim.sub',u::text,true);
 saved:=public.club_selection_groups(c,'save',req);assert saved=public.club_selection_groups(c,'save',req),'Uncertain save retries are idempotent';
 assert (select count(*)=3 from public.playing_groups where club_id=c),'Only the chosen new grade is created';
 assert (select captain_user_id=u from club_selection_private.season_appointments where group_id=g1),'Season captain preserved';
 assert (select count(*)=2 from club_selection_private.playhq_grade_mappings where club_id=c),'Provider matches remembered';
 assert (select selection_group_id=a from club_selection_private.selection_group_grades where grade_id=g2),'Existing grade ID retained';
 rejected:=false;begin perform public.club_selection_groups(c,'save',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Stale setup cannot overwrite newer choices';
 -- A shared selection scope can span competition names, but never an unrelated group.
 insert into club_selection_private.roster(id,club_id,name,active) values(pid,c,'Test player',true);
 insert into club_selection_private.availability(roster_id,available_dates) values(pid,'["2099-10-17","2099-10-24"]');
 slots:=jsonb_build_array(jsonb_build_object('d1',pid,'d2',null))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,10));
 d:=jsonb_build_object('grade','1st Grade','grade_group_id',g1,'competition','Competition A','format','limited_overs','opposition','Visitors','ground','Oval','days',jsonb_build_array(jsonb_build_object('date','2099-10-17')),'brackets',false,'min_quicks',0,'min_batters',0,'staff','[]'::jsonb,'meeting','');
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(old_fixture,c,d,slots);
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=old_fixture;
 d:=d||jsonb_build_object('grade','3rd Grade','grade_group_id',g3,'days',jsonb_build_array(jsonb_build_object('date','2099-10-24')));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(current_fixture,c,d,slots);
 assert not exists(select 1 from club_selection_private.lower_grade_moves(c)),'Unrelated group never creates a grade drop';
 update club_selection_private.fixtures set details=details||jsonb_build_object('grade','2nd Grade','grade_group_id',g2,'competition','Competition B') where id=current_fixture;
 assert exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_fixture and previous_fixture_id=old_fixture),'Player movement is detected within the chosen group';
 ctx:=public.club_selections_api(c,'context');assert ctx#>>'{selection_setup,selection_groups,0,id}' is not null,'Board receives group metadata';
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') f where f->>'id'=current_fixture::text and f->>'selection_group_id'=a::text),'Board fixture is assigned without rewriting its details';
 insert into club_selection_private.fixtures(id,club_id,details) values(duplicate_fixture,c,d);
 bad:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',duplicate_fixture,'revision',1,'details',d,'slots',slots)));
 rejected:=false;begin perform public.club_selections_api(c,'save_board',bad);exception when raise_exception then rejected:=sqlerrm like '%already selected%';end;assert rejected,'Duplicate-date check still covers other Selection Groups';
 assert not has_table_privilege('authenticated','club_selection_private.selection_group_grades','INSERT'),'No direct client writes';
 assert not has_function_privilege('anon','public.club_selection_groups(uuid,text,jsonb)','EXECUTE'),'Anonymous API denied';
 assert has_function_privilege('authenticated','public.club_selection_groups(uuid,text,jsonb)','EXECUTE'),'Signed-in API available';
end $tests$;
rollback;
select 'Selection Groups: generic setup, preserved grades/captains, trusted discovery, permissions, retries, movement scope and club-wide conflicts passed.' result;
