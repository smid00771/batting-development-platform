-- Fictional club only; all changes are rolled back by the inner exception.
do $test$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();sel uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();u uuid;
 f uuid:=gen_random_uuid();empty_f uuid:=gen_random_uuid();foreign_f uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();our uuid:=gen_random_uuid();them uuid:=gen_random_uuid();sid uuid;
 d jsonb;card jsonb;before_fixture jsonb;res jsonb;denied boolean;
begin
 begin
  foreach u in array array[adm,sel,ordinary] loop
   insert into auth.users(id,email) values(u,'fixture-results-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic fixture tester');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Fixture Results Club','fixture-results-'||c,adm),(other_c,'Other Club','fixture-results-'||other_c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,sel,'player','none'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',sel);
  d:=jsonb_build_object('grade','First XI','opposition','Visitors','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date','2026-10-10')));
  insert into club_selection_private.fixtures(id,club_id,details,slots,published,publication) values(f,c,d,'[]',jsonb_build_object('details',d,'slots','[]'::jsonb,'players','[]'::jsonb),1),(empty_f,c,d||'{"grade":"Second XI"}','[]',null,0),(foreign_f,other_c,d,'[]',null,0);
  select to_jsonb(fx) into before_fixture from club_selection_private.fixtures fx where id=f;
  perform set_config('request.jwt.claim.sub',sel::text,true);
  assert not club_batting_private.team_review_staff(c) and not club_selection_private.social_allowed(c),'Selector needs no coaching or socials role';
  assert (public.club_match_results_api(c,'fixture_access',jsonb_build_object('fixture_id',f))->>'allowed')::boolean,'Selector can load scores for a locked fixture';
  res:=public.club_match_results_api(c,'fixture',jsonb_build_object('fixture_id',f));assert jsonb_array_length(res->'fixtures')=1 and jsonb_array_length(res->'cards')=0,'Fixture context is scoped to one match';
  card:=jsonb_build_object('provider','playcricket_au','schema_version',2,'match_id',mid,'url','https://play.cricket.com.au/match/'||mid,'status','completed','grade','Official Competition Grade','dates',jsonb_build_array('2026-10-10'),'format_key','limited_overs','teams',jsonb_build_array(jsonb_build_object('id',our,'name','Fixture Results Club'),jsonb_build_object('id',them,'name','Visitors')),'innings','[]'::jsonb);
  sid:=(club_batting_private.stage_match_review_scorecard(c,sel,card)->>'id')::uuid;
  perform public.club_match_results_api(c,'link',jsonb_build_object('fixture_id',f,'snapshot_id',sid,'team_id',our));
  perform public.club_match_results_api(c,'link',jsonb_build_object('fixture_id',f,'snapshot_id',sid,'team_id',our));
  res:=public.club_match_results_api(c,'fixture',jsonb_build_object('fixture_id',f));assert res#>>'{cards,0,snapshot_id}'=sid::text and res#>>'{cards,0,fixture_id}'=f::text,'Fixture retains the explicit match identity even when grade wording differs';
  assert (select count(*)=1 from club_selection_private.fixture_result_sources where fixture_id=f),'Retry does not duplicate the association';
  assert (select to_jsonb(fx)=before_fixture from club_selection_private.fixtures fx where id=f),'Import does not unlock, republish or change the team';
  perform public.club_match_results_api(c,'no_play',jsonb_build_object('fixture_id',empty_f,'reason','washed_out'));
  assert public.club_match_results_api(c,'fixture',jsonb_build_object('fixture_id',empty_f))#>>'{fixtures,0,no_play}'='washed_out';
  perform public.club_match_results_api(c,'no_play',jsonb_build_object('fixture_id',empty_f,'reason',''));
  assert not exists(select 1 from club_selection_private.fixture_result_sources where fixture_id=empty_f);
  denied:=false;begin perform public.club_match_results_api(c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then denied:=true;end;assert denied,'Scorecard entry does not grant socials access';
  denied:=false;begin perform public.club_match_results_api(c,'identify',jsonb_build_object('snapshot_id',sid,'team_id',our));exception when raise_exception then denied:=true;end;assert denied,'Selector writes require a fixture';
  denied:=false;begin perform public.club_match_results_api(c,'fixture_access',jsonb_build_object('fixture_id',foreign_f));exception when raise_exception then denied:=true;end;assert denied,'Foreign fixture denied';
  perform set_config('request.jwt.claim.sub',adm::text,true);
  res:=public.club_match_results_api(c,'review',jsonb_build_object('existing_match_id',mid,'match_date','2026-10-10','format_key','limited_overs'));
  assert res#>>'{preview,snapshot_id}'=sid::text,'Match Review uses the fixture import';
  res:=public.club_match_results_api(c,'context','{"week_end":"2026-10-11"}');assert res#>>'{cards,0,snapshot_id}'=sid::text,'Awards use the same stored source';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  denied:=false;begin perform public.club_match_results_api(c,'fixture',jsonb_build_object('fixture_id',f));exception when raise_exception then denied:=true;end;assert denied,'Ordinary member cannot manage scorecards';
  denied:=false;begin perform club_batting_private.stage_match_review_scorecard(c,ordinary,card);exception when raise_exception then denied:=true;end;assert denied,'Staging checks the importer role independently';
  update club_selection_private.access set status='disabled' where club_id=c;
  perform set_config('request.jwt.claim.sub',sel::text,true);
  denied:=false;begin perform public.club_match_results_api(c,'fixture_access',jsonb_build_object('fixture_id',f));exception when raise_exception then denied:=true;end;assert denied,'Inactive standalone Teams does not grant selector import access';
  raise exception using errcode='P0201',message='Rollback fixture results test';
 exception when sqlstate 'P0201' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_c));
end $test$;
select 'Fixture imports, selection locks, shared reuse, retries, no-play and role boundaries passed; synthetic records rolled back.' as result;
