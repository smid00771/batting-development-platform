-- Synthetic data only. Team identity is trusted even when its provider grade is absent.
begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();org uuid:=gen_random_uuid();season uuid:=gen_random_uuid();generation uuid:=gen_random_uuid();
 g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();t1 uuid:=gen_random_uuid();t2 uuid:=gen_random_uuid();source2 uuid:=gen_random_uuid();
 fixture_id uuid:=gen_random_uuid();snapshot jsonb;cat jsonb;ctx jsonb;req jsonb;saved jsonb;rejected boolean;
begin
 insert into auth.users(id,email) values(u,'pending-grade-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Any Club','pending-grade-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'admin','admin','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 insert into public.playing_groups(id,club_id,name) values(g1,c,'Women First XI');
 insert into club_selection_private.season_appointments(group_id,club_id,captain_user_id,updated_by) values(g1,c,u,u);
 insert into club_selection_private.fixtures(id,club_id,details) values(fixture_id,c,jsonb_build_object('grade','Women First XI','grade_group_id',g1,'competition','Existing competition','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date','2099-10-03'))));
 select to_jsonb(f) into snapshot from club_selection_private.fixtures f where f.id=fixture_id;
 insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,generation,updated_by)
  values(c,org,gen_random_uuid(),gen_random_uuid(),generation,u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 cat:=public.playhq_store_teams(c,generation,season,jsonb_build_array(
  jsonb_build_object('id',t1,'name','Example Women First XI','club',jsonb_build_object('id',org),'grade',null),
  jsonb_build_object('id',t2,'name','Example Women Second XI','club',jsonb_build_object('id',org)),
  jsonb_build_object('id',gen_random_uuid(),'name','Other club team','club',jsonb_build_object('id',gen_random_uuid()))));
 assert jsonb_array_length(cat->'teams')=2,'Only verified club teams enter the catalogue';
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 ctx:=public.club_selection_groups(c,'context');
 req:=jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades','catalogue_id',cat->>'catalogue_id',
  'groups',jsonb_build_array(jsonb_build_object('id',sg,'name','Club Women')),
  'grades',jsonb_build_array(jsonb_build_object('id',g1,'selection_group_id',sg,'team_id',t1),
   jsonb_build_object('id',g2,'selection_group_id',sg,'team_id',t2,'source_grade_id',gen_random_uuid())));
 rejected:=false;begin perform public.club_selection_groups(c,'save',jsonb_set(req,'{grades,1,team_id}',to_jsonb(gen_random_uuid())));exception when raise_exception then rejected:=true;end;
 assert rejected,'A missing provider grade never permits an unverified team';
 assert not exists(select 1 from club_selection_private.selection_groups where club_id=c),'Invalid requests remain atomic';
 saved:=public.club_selection_groups(c,'save',req);
 assert saved=public.club_selection_groups(c,'save',req),'Pending-grade saves retain idempotent retry';
 assert (select count(*)=2 from public.playing_groups where club_id=c),'Only the chosen new club grade is created';
 assert (select name='Women First XI' from public.playing_groups where id=g1),'Existing club grade identity and name retained';
 assert (select name='Example Women Second XI' from public.playing_groups where id=g2),'New grade defaults to the source team name';
 assert (select captain_user_id=u from club_selection_private.season_appointments where group_id=g1),'Existing captain retained';
 assert (select count(*)=2 from club_selection_private.selection_group_grades where club_id=c and selection_group_id=sg),'Both teams join the selected group';
 assert (select count(*)=2 from club_selection_private.playhq_grade_mappings where club_id=c and source_grade_id is null),'No provider grade ID is invented or accepted from the client';

 -- A later download enriches the same team link without creating/replacing club grades.
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 cat:=public.playhq_store_teams(c,generation,season,jsonb_build_array(
  jsonb_build_object('id',t1,'name','Example Women First XI','club',jsonb_build_object('id',org),'grade',jsonb_build_object('id',source2,'name','New competition label')),
  jsonb_build_object('id',t2,'name','Example Women Second XI','club',jsonb_build_object('id',org),'grade',jsonb_build_object('id',source2,'name','New competition label'))));
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 ctx:=public.club_selection_groups(c,'context');
 req:=req||jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades','catalogue_id',cat->>'catalogue_id');
 saved:=public.club_selection_groups(c,'save',req);
 assert (select source_grade_id=source2 and grade_id=g2 from club_selection_private.playhq_grade_mappings where club_id=c and team_id=t2),'Provider grade attaches to the original club grade';
 assert (select count(*)=2 and count(distinct grade_id)=2 from club_selection_private.playhq_grade_mappings where club_id=c and source_grade_id=source2),'Two teams sharing one provider grade retain separate local grades';
 assert (select count(*)=2 from public.playing_groups where club_id=c),'Later source details never duplicate club grades';
 assert (select name='Example Women Second XI' from public.playing_groups where id=g2),'A provider rename does not overwrite the club label';

 -- A temporarily incomplete refresh must not erase a known provider link.
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 cat:=public.playhq_store_teams(c,generation,season,jsonb_build_array(
  jsonb_build_object('id',t1,'name','Example Women First XI','club',jsonb_build_object('id',org)),
  jsonb_build_object('id',t2,'name','Example Women Second XI','club',jsonb_build_object('id',org))));
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 ctx:=public.club_selection_groups(c,'context');
 req:=req||jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades','catalogue_id',cat->>'catalogue_id');
 perform public.club_selection_groups(c,'save',req);
 assert (select source_grade_id=source2 from club_selection_private.playhq_grade_mappings where club_id=c and team_id=t2),'Known source link survives incomplete metadata';
 assert (select to_jsonb(f)=snapshot from club_selection_private.fixtures f where f.id=fixture_id),'Linking source teams preserves all existing fixture data';
 assert not has_table_privilege('authenticated','club_selection_private.playhq_grade_mappings','INSERT,UPDATE'),'No direct mapping writes';
 assert not has_function_privilege('anon','public.club_selection_groups(uuid,text,jsonb)','EXECUTE'),'Anonymous setup remains denied';
end $tests$;
rollback;
select 'Pending source grades: trusted teams, existing grades/captains, grouping, retries and later grade details passed.' result;
