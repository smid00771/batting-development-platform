-- Rollback-only synthetic test: preferred names must not detach historical records.
begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();
 f1 uuid:=gen_random_uuid();f2 uuid:=gen_random_uuid();ctx jsonb;req jsonb;saved jsonb;before_fixtures jsonb;rejected boolean;
begin
 insert into auth.users(id,email) values(u,'grade-name-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Any Club','grade-name-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'admin','admin','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 insert into public.playing_groups(id,club_id,name) values(g1,c,'Old Navy'),(g2,c,'Old Sky');
 insert into club_selection_private.season_appointments(group_id,club_id,captain_user_id,updated_by) values(g1,c,u,u);
 insert into club_selection_private.fixtures(id,club_id,details) values
  (f1,c,jsonb_build_object('grade','Old Navy','competition','Local league','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date','2099-10-03')))),
  (f2,c,jsonb_build_object('grade','Old Navy','grade_group_id',g1,'competition','Local league','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date','2099-10-10'))));
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where club_id=c;
 select jsonb_agg(to_jsonb(f) order by f.id) into before_fixtures from club_selection_private.fixtures f where f.club_id=c;
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 ctx:=public.club_selection_groups(c,'context');
 req:=jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades',
  'groups',jsonb_build_array(jsonb_build_object('id',sg,'name','Saturday teams')),
  'grades',jsonb_build_array(jsonb_build_object('id',g1,'selection_group_id',sg,'name','Dev League Navy'),jsonb_build_object('id',g2,'selection_group_id',sg,'name','Dev League Sky')));
 rejected:=false;begin perform public.club_selection_groups(c,'save',jsonb_set(req,'{grades,1,name}','"Dev League Navy"'));exception when raise_exception then rejected:=true;end;
 assert rejected,'Duplicate preferred names rejected';assert not exists(select 1 from club_selection_private.selection_grade_aliases where club_id=c),'Failed save does not leave aliases';
 assert (select name='Old Navy' from public.playing_groups where id=g1),'Failed save rolls back earlier rename';
 rejected:=false;begin perform public.club_selection_groups(c,'save',jsonb_set(req,'{grades,0,name}','" "'));exception when raise_exception then rejected:=true;end;
 assert rejected,'Empty preferred names rejected';
 saved:=public.club_selection_groups(c,'save',req);assert saved=public.club_selection_groups(c,'save',req),'Renaming is idempotent';
 assert (select count(*)=2 from public.playing_groups where club_id=c),'Names never replace grade identities';
 assert (select name='Dev League Navy' from public.playing_groups where id=g1),'Preferred name is saved';
 assert (select captain_user_id=u from club_selection_private.season_appointments where group_id=g1),'Captain remains on original grade';
 assert (select jsonb_agg(to_jsonb(f) order by f.id)=before_fixtures from club_selection_private.fixtures f where f.club_id=c),'All draft and published fixture data remains byte-equivalent';
 assert club_selection_private.fixture_group_id(c,'{"grade":" old navy "}')=g1,'Legacy name resolves after rename';
 assert club_selection_private.fixture_group_id(c,'{"grade":"Dev League Navy"}')=g1,'Preferred name resolves';
 assert club_selection_private.fixture_selection_group(c,'{"grade":"Old Navy"}')=sg,'Legacy fixture retains selection scope';
 assert u=any(club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,'{"grade":"Old Navy"}'))),'Legacy fixture retains captain authority';
 assert club_selection_private.fixture_group_id(gen_random_uuid(),' {"grade":"Old Navy"}') is null,'Aliases are club scoped';

 -- Later name changes retain every prior label. Neither source IDs nor fixture snapshots change.
 ctx:=public.club_selection_groups(c,'context');req:=req||jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades');
 req:=jsonb_set(req,'{grades,0,name}','"Navy XI"');perform public.club_selection_groups(c,'save',req);
 assert club_selection_private.fixture_group_id(c,'{"grade":"Old Navy"}')=g1 and club_selection_private.fixture_group_id(c,'{"grade":"Dev League Navy"}')=g1,'Multiple historical labels retain one identity';
 assert (select count(*)=2 from club_selection_private.selection_grade_aliases where club_id=c and grade_id=g1),'Only actual renames add aliases';
 ctx:=public.club_selection_groups(c,'context');req:=req||jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades');
 rejected:=false;begin perform public.club_selection_groups(c,'save',jsonb_set(req,'{grades,1,name}','"Old Navy"'));exception when raise_exception then rejected:=true;end;
 assert rejected,'Another grade cannot take a historical name through setup';
 -- If an older manual workflow reuses a label, fail closed rather than guessing.
 update public.playing_groups set name='Old Navy' where id=g2;
 assert club_selection_private.fixture_group_id(c,'{"grade":"Old Navy"}') is null,'Ambiguous alias/current name does not misattribute history';
 assert club_selection_private.fixture_group_id(c,jsonb_build_object('grade','Old Navy','grade_group_id',g1))=g1,'Explicit identity always wins';
 assert not has_table_privilege('authenticated','club_selection_private.selection_grade_aliases','INSERT,UPDATE,SELECT'),'Historical aliases have no direct client access';
 assert not has_function_privilege('authenticated','club_selection_private.fixture_group_id(uuid,jsonb)','EXECUTE'),'Private resolver has no direct client access';
 assert (select relrowsecurity from pg_class where oid='club_selection_private.selection_grade_aliases'::regclass),'Alias table has RLS';
end $tests$;
rollback;
select 'Preferred names: original IDs/captains, unchanged snapshots, legacy scope, ambiguity, atomic retry and private access passed.' result;
