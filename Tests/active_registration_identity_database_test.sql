-- Synthetic records only; the nested transaction always rolls them back.
do $tests$
#variable_conflict use_column
declare c uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();
 original uuid:=gen_random_uuid();registered uuid:=gen_random_uuid();source uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();
 previous uuid:=gen_random_uuid();fixture uuid:=gen_random_uuid();request uuid:=gen_random_uuid();
 details jsonb;slots jsonb;card jsonb;command jsonb;result jsonb;bad boolean;before_state jsonb;
begin
 begin
  insert into auth.users(id,email) values(staff,'registration-test-'||staff||'@example.invalid');
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic registration club','registration-test-'||c,staff);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,staff,'admin','admin');
  insert into club_selection_private.access(club_id,status,head_selector_id) values(c,'active',staff);
  perform set_config('request.jwt.claim.sub',staff::text,true);
  insert into public.players(id,club_id,display_name,active) values(pid,c,'Sam Example',true);
  insert into club_selection_private.roster(id,club_id,name,active,batting,bowling,bowling_load) values(original,c,'Sam Example',true,'top','spin','frontline');
  insert into club_batting_private.roster_players(roster_id,club_id,player_id) values(original,c,pid);
  insert into club_selection_private.roster(id,club_id,external_id,name,active,account_email) values(registered,c,gen_random_uuid()::text,'Samuel James Example',false,'registered@example.invalid');
  insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates) values(original,'["2026-10-10","2026-10-17","2026-10-24"]','["2026-10-31"]'),(registered,'["2026-10-24","2026-10-31"]','[]');
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source,registered,staff);
  card:=jsonb_build_object('match_id',mid,'status','completed','dates',jsonb_build_array('2026-10-17'),'teams',jsonb_build_array(jsonb_build_object('id',tid,'name','Our team','lineup_available',true,'players',jsonb_build_array(jsonb_build_object('player_id',source,'name','Samuel James Example')))),'innings','[]'::jsonb);
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,staff,card);
  details:='{"grade":"Second Grade","competition":"Test","format":"limited_overs","opposition":"Visitors","days":[{"date":"2026-10-10"}]}';
  details:=details||jsonb_build_object('captain_id',original,'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',original)));
  slots:=jsonb_build_array(jsonb_build_object('d1',original,'d2',null));
  insert into club_selection_private.fixtures(id,club_id,details,slots,published,publication) values(previous,c,details||'{"meeting":"Draft only"}',slots,jsonb_build_object('details',details,'slots',slots,'players',jsonb_build_array(jsonb_build_object('id',original,'name','Sam Example'))),1);
  details:=jsonb_set(details,'{days}','[{"date":"2026-10-17"}]');
  details:=club_selection_private.scorecard_identity_roles(details,original,registered)-'captain_id';
  slots:=jsonb_build_array(jsonb_build_object('d1',registered,'d2',null));
  insert into club_selection_private.fixtures(id,club_id,details,slots,published,publication) values(fixture,c,details,slots,jsonb_build_object('details',details,'slots',slots,'players',jsonb_build_array(jsonb_build_object('id',registered,'name','Samuel James Example','batting','unknown'))),1);
  insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) select id,1,published,staff from club_selection_private.fixtures where club_id=c;
  insert into club_batting_private.fixture_review_rosters(club_id,fixture_id,player_ids,revision,updated_by) values(c,previous,array[pid],1,staff);
  result:=public.playcricket_team_api(c,'context',jsonb_build_object('snapshot_id',sid));
  assert exists(select 1 from jsonb_array_elements(result->'roster') x where x->>'id'=registered::text and x->>'identity_unlinked'='true'),'An ordinary registration import exposes the unresolved identity';
  command:=jsonb_build_object('snapshot_id',sid,'team_id',tid,'source_player_id',source,'roster_id',original,'fixture_id',fixture,'expected_name','Sam Example','prefer_registration',true);
  -- Same-day duplicates must be resolved deliberately before consolidating.
  update club_selection_private.fixtures set slots=slots||jsonb_build_array(jsonb_build_object('d1',original,'d2',null)) where id=fixture;
  bad:=false;begin perform public.confirm_scorecard_player(c,request,command);exception when raise_exception then bad:=sqlerrm like 'Both name entries are selected%';end;
  assert bad,'Two current selections cannot collapse into one silently';
  assert (select active from club_selection_private.roster where id=original),'Rejected consolidation leaves the original active';
  assert (select not active from club_selection_private.roster where id=registered),'Rejected consolidation leaves the registered entry unchanged';
  update club_selection_private.fixtures set slots=slots-1 where id=fixture;
  result:=public.confirm_scorecard_player(c,request,command);
  assert result->>'confirmed'='true' and result->>'roster_id'=registered::text and result->>'player_id'=pid::text and result->>'retired_roster_id'=original::text,'Confirmation selects the registration and retains the batting ID';
  assert (select not active and name='Sam Example' from club_selection_private.roster where id=original),'Old spelling is inactive and remains in history';
  assert (select active and name='Samuel James Example' and account_email='registered@example.invalid' and user_id is null and batting='top' and bowling='spin' from club_selection_private.roster where id=registered),'Registered spelling becomes active with existing roles and invitation intact';
  assert (select count(*)=1 from public.players where club_id=c),'No duplicate batting history';
  assert (select display_name='Samuel James Example' from public.players where id=pid),'Existing batting history uses the official name';
  assert (select roster_id=registered from club_batting_private.roster_players where player_id=pid),'History points to the active entry';
  assert (select available_dates='["2026-10-10","2026-10-17","2026-10-24"]'::jsonb and unavailable_dates='["2026-10-31"]'::jsonb from club_selection_private.availability where roster_id=registered),'Known availability transfers; explicit unavailability is not overturned';
  assert (select published->'slots'->0->>'d1'=registered::text and published#>>'{details,match_roles,d1,captain_id}'=registered::text and published#>>'{details,captain_id}'=registered::text from club_selection_private.fixtures where id=previous),'Copy previous team and roles use the active ID';
  assert (select details->>'meeting'='Draft only' and published#>>'{details,meeting}' is null from club_selection_private.fixtures where id=previous),'Unpublished fixture changes remain unpublished';
  assert (select snapshot->'slots'->0->>'d1'=original::text from club_selection_private.publications where fixture_id=previous and version=1),'Original publication retained';
  assert (select player_ids=array[pid] from club_batting_private.fixture_review_rosters where fixture_id=previous),'Existing match review remains attached';
  assert (select player_id=pid from public.match_review_player_links where club_id=c and source_player_id=source),'Imported scores resolve to the original history';
  assert public.confirm_scorecard_player(c,request,command)=result,'Uncertain retries do not repeat the merge';
  result:=public.playcricket_team_api(c,'context',jsonb_build_object('snapshot_id',sid));
  assert exists(select 1 from jsonb_array_elements(result->'roster') x where x->>'id'=registered::text and x->>'identity_unlinked'='false'),'The confirmed registration no longer prompts as a duplicate';
  assert not has_function_privilege('authenticated','club_batting_private.consolidate_scorecard_roster(uuid,uuid,uuid,text)','execute'),'Consolidation is accessible only through the guarded confirmation';
  raise exception using errcode='P0198',message='Rollback synthetic active-registration test';
 exception when sqlstate 'P0198' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic club rolled back';
 assert not exists(select 1 from auth.users where id=staff),'Synthetic account rolled back';
end $tests$;
