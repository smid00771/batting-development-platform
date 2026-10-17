-- Run against a local test database with the real migration installed. Synthetic data only.
do $tests$
#variable_conflict use_column
declare c uuid:=gen_random_uuid();other_club uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();
 pid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();source uuid:=gen_random_uuid();stub uuid;
 fid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();request uuid:=gen_random_uuid();
 p2 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();stub2 uuid;
 card jsonb;details jsonb;slots jsonb;values jsonb;result jsonb;bad boolean;prior jsonb;
begin
 begin
  insert into auth.users(id,email) values(staff,'identity-staff-'||staff||'@example.invalid'),(ordinary,'identity-member-'||ordinary||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(staff,'Synthetic staff'),(ordinary,'Unchanged global name');
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic identity club','identity-test-'||c,staff),(other_club,'Other synthetic club','identity-test-'||other_club,staff);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,staff,'admin','admin',null),(c,ordinary,'player','none','player');
  insert into club_selection_private.access(club_id,status,head_selector_id) values(c,'active',staff);
  insert into public.players(id,club_id,user_id,display_name,active) values(pid,c,ordinary,'Sulaiman Muhammad',true),(p2,c,null,'Ollie Smith',true);
  stub:=md5('playcricket-roster:'||c::text||source::text)::uuid;stub2:=md5('playcricket-roster:'||c::text||s2::text)::uuid;
  insert into club_selection_private.roster(id,club_id,external_id,name,user_id) values(rid,c,'club-import','Sulaiman Muhammad',ordinary),(stub,c,source::text,'Sulaiman Moin Muhammad',null),(r2,c,'other-import','Ollie Smith',null),(stub2,c,s2::text,'Oliver Smith',null);
  insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,rid,pid),(c,r2,p2);
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source,stub,staff),(c,s2,stub2,staff);
  card:=jsonb_build_object('match_id',mid,'status','completed','dates',jsonb_build_array('2026-10-10'),'grade','First Grade','teams',jsonb_build_array(jsonb_build_object('id',tid,'name','Our club','lineup_available',true,'players',jsonb_build_array(jsonb_build_object('player_id',source,'name','Sulaiman Moin Muhammad'),jsonb_build_object('player_id',s2,'name','Oliver Smith')))),'innings','[]'::jsonb);
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,staff,card);
  details:=jsonb_build_object('grade','First Grade','competition','Test','format','limited_overs','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date','2026-10-10')),'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',stub,'keeper_id',stub)));
  slots:=jsonb_build_array(jsonb_build_object('d1',stub,'d2',null));
  insert into club_selection_private.fixtures(id,club_id,details,slots,publication,published,scorecard_sync) values(fid,c,details||'{"meeting":"Unpublished edit"}',slots,1,jsonb_build_object('details',details,'slots',slots,'players',jsonb_build_array(jsonb_build_object('id',stub,'name','Sulaiman Moin Muhammad'))),jsonb_build_object('match_id',mid,'team_id',tid,'players',jsonb_build_array(jsonb_build_object('source_id',source,'roster_id',stub,'name','Sulaiman Moin Muhammad'))));
  insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) select id,1,published,staff from club_selection_private.fixtures where id=fid;
  insert into club_batting_private.fixture_review_rosters(club_id,fixture_id,player_ids) values(c,fid,'{}');
  perform set_config('request.jwt.claim.sub',staff::text,true);
  result:=public.playcricket_team_api(c,'context',jsonb_build_object('snapshot_id',sid));
  assert exists(select 1 from jsonb_array_elements(result->'roster') r where r->>'id'=stub::text and r->>'imported_stub'='true'),'Context identifies only the empty imported record';
  values:=jsonb_build_object('snapshot_id',sid,'team_id',tid,'source_player_id',source,'player_id',pid,'fixture_id',fid,'expected_name','Sulaiman Muhammad');
  bad:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values||'{"expected_name":"Stale name"}');exception when raise_exception then bad:=sqlerrm like 'The player name changed%';end;assert bad,'Stale confirmations rejected';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  bad:=false;begin perform public.confirm_scorecard_player(c,request,values);exception when raise_exception then bad:=true;end;assert bad,'An ordinary member cannot confirm another player';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  bad:=false;begin perform public.confirm_scorecard_player(other_club,request,values);exception when raise_exception then bad:=true;end;assert bad,'Club boundary enforced';
  result:=public.confirm_scorecard_player(c,request,values);
  assert result->>'confirmed'='true' and result->>'player_id'=pid::text and result->>'roster_id'=rid::text,'Existing identities retained';
  assert result->>'fixture_repaired'='true' and result->>'needs_team_review'='false','Empty imported placeholder repaired';
  assert (select display_name='Sulaiman Moin Muhammad' and user_id=ordinary from public.players where id=pid),'Club name updated without changing account';
  assert (select display_name='Unchanged global name' from public.user_profiles where user_id=ordinary),'Global account profile unchanged';
  assert (select count(*)=2 from public.players where club_id=c),'No duplicate batting players';
  assert (select player_id=pid from public.match_review_player_links where club_id=c and source_player_id=source),'Scores remember existing player';
  assert (select roster_id=rid from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=source),'Teams remember existing player';
  assert (select slots->0->>'d1'=rid::text and published->'slots'->0->>'d1'=rid::text and details#>>'{match_roles,d1,captain_id}'=rid::text and published#>>'{details,match_roles,d1,keeper_id}'=rid::text from club_selection_private.fixtures where id=fid),'Draft, publication and captain/keeper references repaired together';
  assert (select details->>'meeting'='Unpublished edit' and published->'details'->>'meeting' is null from club_selection_private.fixtures where id=fid),'Other draft edits stay unpublished';
  assert (select snapshot->'slots'->0->>'d1'=stub::text from club_selection_private.publications where fixture_id=fid and version=1),'Original publication preserved';
  assert (select player_ids @> array[pid] from club_batting_private.fixture_review_rosters where fixture_id=fid),'Saved review can use the original player again';
  assert (select not active from club_selection_private.roster where id=stub),'Unused placeholder archived without deleting history';
  assert public.confirm_scorecard_player(c,request,values)=result,'Uncertain retry returns the same receipt';
  assert (select count(*)=2 from club_selection_private.publications where fixture_id=fid),'Retry never duplicates publications';
  bad:=false;begin perform public.confirm_scorecard_player(c,request,values||'{"expected_name":"Different"}');exception when raise_exception then bad:=sqlerrm='Request ID already used';end;assert bad,'Receipt cannot be reused for another command';
  -- A real cross-team selection conflict is left for the explicit Update team action.
  update club_selection_private.fixtures set slots=slots||jsonb_build_array(jsonb_build_object('d1',stub2,'d2',null)),published=published||jsonb_build_object('slots',published->'slots'||jsonb_build_array(jsonb_build_object('d1',stub2,'d2',null))) where id=fid;
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(gen_random_uuid(),c,details||'{"grade":"Second Grade"}',jsonb_build_array(jsonb_build_object('d1',r2,'d2',null)));
  result:=public.confirm_scorecard_player(c,gen_random_uuid(),jsonb_build_object('snapshot_id',sid,'team_id',tid,'source_player_id',s2,'roster_id',r2,'fixture_id',fid,'expected_name','Ollie Smith'));
  assert result->>'needs_team_review'='true' and result->>'fixture_repaired'='false','Genuine transfer still needs reviewed team correction';
  assert (select slots->1->>'d1'=stub2::text from club_selection_private.fixtures where id=fid),'Confirmation does not silently move another team player';
  assert (select active from club_selection_private.roster where id=stub2),'Referenced placeholder retained until selection correction';
  assert (select display_name='Oliver Smith' from public.players where id=p2),'Teams confirmation updates linked batting identity';
  -- Distinct established histories can never be merged through a same-player prompt.
  bad:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values||jsonb_build_object('player_id',p2,'expected_name','Oliver Smith'));exception when raise_exception then bad:=sqlerrm like '%different player history%';end;assert bad,'Two established player histories remain separate';
  -- Batting-only clubs can link names, and an empty imported slot can attach to
  -- a known batting record that did not previously have a Teams roster identity.
  declare p3 uuid:=gen_random_uuid();source3 uuid:=gen_random_uuid();sid3 uuid:=gen_random_uuid();stub3 uuid;
  begin
   insert into public.players(id,club_id,display_name,active) values(p3,c,'Rob Taylor',true);
   card:=jsonb_build_object('dates',jsonb_build_array('2026-10-10'),'teams',jsonb_build_array(jsonb_build_object('id',tid)),'innings',jsonb_build_array(jsonb_build_object('team_id',tid,'batters',jsonb_build_array(jsonb_build_object('player_id',source3,'name','Robert Taylor')))));
   insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid3,c,gen_random_uuid(),staff,card);
   values:=jsonb_build_object('snapshot_id',sid3,'team_id',tid,'source_player_id',source3,'player_id',p3,'expected_name','Rob Taylor');
   result:=public.confirm_scorecard_player(c,gen_random_uuid(),values);assert result->>'player_id'=p3::text and result->>'roster_id' is null,'Batting-only identity needs no invented Teams record';
   stub3:=md5('playcricket-roster:'||c::text||source3::text)::uuid;
   insert into club_selection_private.roster(id,club_id,external_id,name) values(stub3,c,source3::text,'Robert Taylor');
   insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source3,stub3,staff);
   result:=public.confirm_scorecard_player(c,gen_random_uuid(),values||'{"expected_name":"Robert Taylor"}');
   assert result->>'roster_id'=stub3::text and result->>'player_id'=p3::text,'Empty Teams slot attaches to the existing batting identity';
   assert (select player_id=p3 from club_batting_private.roster_players where roster_id=stub3),'Bridge preserves original player ID';
   assert (select count(*)=3 from public.players where club_id=c),'Neither flow duplicates a batting player';
  end;
  assert not has_function_privilege('anon','public.confirm_scorecard_player(uuid,uuid,jsonb)','execute'),'Anonymous execution denied';
  assert not has_function_privilege('authenticated','club_selection_private.scorecard_identity_slots(jsonb,uuid,uuid)','execute'),'Private helper execution denied';
  raise exception using errcode='P0198',message='Rollback synthetic identity test';
 exception when sqlstate 'P0198' then null;
 end;
end $tests$;
