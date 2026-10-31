-- Real schema, synthetic club, and automatic trigger path. All test rows and
-- queued events roll back before the migration/verification transaction commits.
do $test$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();g uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();
 p uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 r uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 a uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 source_match uuid:=gen_random_uuid();team uuid:=gen_random_uuid();innings uuid:=gen_random_uuid();snapshot uuid;match_id uuid;note_id uuid;review_id uuid:=gen_random_uuid();
 day date:=current_date-1;d jsonb;card jsonb;players jsonb:='[]';batters jsonb:='[]';res jsonb;stamp timestamptz;i int;before_rows int;
begin
 begin
  insert into auth.users(id,email) values(u,'auto-score-'||u||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Synthetic coach');
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic automatic scores','auto-score-'||c,u);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',u);
  insert into public.playing_groups(id,club_id,name,active,batting_enabled) values(g,c,'Synthetic XI',true,true);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Synthetic group',true);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g,sg);
  d:=jsonb_build_object('grade','Synthetic XI','grade_group_id',g,'format','limited_overs','opposition','Synthetic visitors','days',jsonb_build_array(jsonb_build_object('date',day)));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,d,'[]');
  for i in 1..4 loop
   insert into public.players(id,club_id,display_name,active) values(p[i],c,'Synthetic batter '||i,true);
   insert into public.player_playing_groups(club_id,player_id,playing_group_id) values(c,p[i],g);
   insert into club_selection_private.roster(id,club_id,name,active) values(r[i],c,'Synthetic batter '||i,true);
   insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,r[i],p[i]);
   if i<4 then insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,a[i],r[i],u);end if;
   players:=players||jsonb_build_array(jsonb_build_object('player_id',a[i],'name','Synthetic batter '||i));
   batters:=batters||jsonb_build_array(jsonb_build_object('player_id',a[i],'name','Synthetic batter '||i,'status',case when i=2 then 'did_not_bat' else 'played' end,'runs',case when i=1 then 44 when i=3 then 0 when i=4 then 12 end,'balls',58,'not_out',i=3,'importable',true));
  end loop;
  -- A coach has already commented on the innings before the result arrives.
  perform set_config('request.jwt.claim.sub',u::text,true);
  insert into public.player_match_entries(club_id,player_id,match_date,format_key,opposition,innings_number,created_by)
   values(c,p[1],day,'limited_overs','Synthetic visitors',1,u) returning id into match_id;
  insert into public.player_match_coach_feedback(player_id,match_entry_id,author_user_id,note,plan_related)
   values(p[1],match_id,u,'Keep the original coaching contribution',false) returning id into note_id;
  insert into public.team_review_sessions(id,club_id,author_user_id,fixture_id,group_id,group_scope,group_name,match_date,format_key,opposition,innings_number)
   values(review_id,c,u,fid,g,'group','Synthetic XI',day,'limited_overs','Synthetic visitors',1);
  insert into public.team_review_items(review_id,player_id,match_id) values(review_id,p[1],match_id);
  insert into public.playing_groups(id,club_id,name,active,batting_enabled) values(g2,c,'Another grade',true,true);
  insert into club_selection_private.fixtures(club_id,details,slots) values(c,d||jsonb_build_object('grade','Another grade','grade_group_id',g2),'[]');
  perform set_config('request.jwt.claim.sub','',true);
  card:=jsonb_build_object('provider','playhq_au','match_id',source_match,'status','completed','format_key','limited_overs','dates',jsonb_build_array(day),'teams',jsonb_build_array(jsonb_build_object('id',team,'players',players)),
   'innings',jsonb_build_array(jsonb_build_object('id',innings,'number',1,'team_id',team,'complete',true,'batters',batters)));
  insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by) values(c,source_match,card,u) returning id into snapshot;
  insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(fid,c,source_match,team,u);
  assert (select score_text='' from public.player_match_entries where id=match_id),'Wait for all fixture and identity writes';
  set constraints all immediate;
  assert (select score_text='44' from public.player_match_entries where id=match_id),'Existing comment innings receives downloaded 44';
  assert (select count(*)=3 from public.player_match_entries where club_id=c),'Confirmed batters only, no duplicate comment innings';
  assert (select participation_status='did_not_bat' and score_text='' from public.player_match_entries where player_id=p[2]),'DNB remains distinct';
  assert (select score_text='0*' from public.player_match_entries where player_id=p[3]),'Zero not out remains distinct';
  assert not exists(select 1 from public.player_match_entries where player_id=p[4]),'No name-based identity guess';
  assert (select count(*)=1 from public.player_match_coach_feedback where player_id=any(p)),'Score sync creates no coaching assessments';
  assert (select note='Keep the original coaching contribution' from public.player_match_coach_feedback where id=note_id),'Comment preserved';
  assert not exists(select 1 from public.player_match_reflections where player_id=any(p)),'No fabricated player reflections';
  assert (select published is null from club_selection_private.fixtures where id=fid),'No team publication';
  select updated_at into stamp from public.player_match_entries where id=match_id;
  res:=club_batting_private.sync_fixture_batting_scores(c,fid);
  assert res->>'added'='0' and res->>'updated'='0' and res->'issues'='[]','Identical delivery is idempotent';
  assert (select updated_at=stamp from public.player_match_entries where id=match_id),'No save conflict from unchanged results';
  -- Identity confirmation after the original download completes automatically.
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,a[4],r[4],u);
  assert (select score_text='12' from public.player_match_entries where player_id=p[4]),'Late confirmed identity receives saved result';
  -- Corrected official source scores update without any signed-in coach.
  card:=jsonb_set(card,'{innings,0,batters,0,runs}','46');
  insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by) values(c,source_match,card,u);
  assert (select score_text='46' from public.player_match_entries where id=match_id),'Service result refresh updates the same innings';
  -- A deliberate staff correction stays intact on later downloads.
  perform set_config('request.jwt.claim.sub',u::text,true);
  update public.player_match_entries set score_text='48' where id=match_id;
  perform set_config('request.jwt.claim.sub','',true);
  card:=jsonb_set(card,'{innings,0,batters,0,runs}','50');
  insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by) values(c,source_match,card,u);
  assert (select score_text='48' from public.player_match_entries where id=match_id),'Manual correction retained';
  -- The internal transaction permit cannot be reused for arbitrary scores.
  begin update public.player_match_entries set score_text='999' where id=match_id;raise exception 'Unexpected score write';exception when raise_exception then assert sqlerrm='Result permission is required to correct an imported score','No permission bypass';end;
  assert not has_table_privilege('authenticated','club_batting_private.automatic_score_sync','INSERT'),'Private ledger cannot be forged';
  assert not has_function_privilege('authenticated','club_batting_private.sync_fixture_batting_scores(uuid,uuid)','EXECUTE'),'No client sync endpoint';
  assert not has_function_privilege('anon','club_batting_private.sync_fixture_batting_scores(uuid,uuid)','EXECUTE'),'No anonymous sync';
  -- Keep a second innings distinct; incomplete matches and opt-outs do not flow.
  card:=card||jsonb_build_object('innings',card->'innings'||jsonb_build_array((card->'innings'->0)||jsonb_build_object('id',gen_random_uuid(),'number',2)));
  card:=jsonb_set(card,'{status}','"in_progress"');
  insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by) values(c,source_match,card,u);
  assert (select count(*)=4 from public.player_match_entries where club_id=c),'No unfinished-match import';
  card:=jsonb_set(card,'{status}','"completed"');
  update public.playing_groups set batting_enabled=false where id=g;
  insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by) values(c,source_match,card,u);
  assert (select count(*)=4 from public.player_match_entries where club_id=c),'Opted-out team does not receive new innings';
  update public.playing_groups set batting_enabled=true where id=g;
  res:=club_batting_private.sync_fixture_batting_scores(c,fid);
  assert res->'issues'='[]',res::text;
  assert (select count(*)=8 from public.player_match_entries where club_id=c),'Separate second innings';
  -- Ordinary authorised reads now expose the same saved score everywhere.
  perform set_config('request.jwt.claim.sub',u::text,true);
  res:=club_batting_private.get_coach_observation_context(p[3]);
  assert exists(select 1 from jsonb_array_elements(res->'matches') m where m->>'score_text'='0*'),'Observation context reads the downloaded score';
  res:=club_batting_private.get_individual_match_fixtures(c,p[3],null);
  assert jsonb_array_length(res->'player_innings')=2,'Picker resolves both canonical innings';
  assert (select count(*)=1 from public.team_review_sessions where club_id=c),'Never creates another Match Review';
  -- Batting-only fixture storage supports the same automatic result path.
  update club_selection_private.access set status='disabled',fixture_defaults='{"batting_fixtures_only":true}' where club_id=c;
  assert not club_selection_private.enabled(c),'Select remains disabled';
  perform set_config('request.jwt.claim.sub','',true);
  card:=jsonb_set(card,'{innings,0,batters,3,runs}','18');
  insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by) values(c,source_match,card,u);
  assert (select score_text='18' from public.player_match_entries where player_id=p[4] and innings_number=1),'Batting-only automatic update';
  update club_selection_private.access set mode='standalone' where club_id=c;
  card:=jsonb_set(card,'{innings,0,batters,3,runs}','19');
  insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by) values(c,source_match,card,u);
  assert (select score_text='18' from public.player_match_entries where player_id=p[4] and innings_number=1),'Select-only club does not write Batting';
  raise exception using errcode='P0317',message='Roll back automatic score tests';
 exception when sqlstate 'P0317' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'All synthetic test data rolled back';
end $test$;
