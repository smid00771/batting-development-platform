-- Synthetic data is rolled back by the inner exception block, even during deployment.
do $tests$
declare c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();inactive uuid:=gen_random_uuid();
 pids uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 rids uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 initial_revision bigint;
begin
 begin
  insert into auth.users(id,email) values(adm,'usual-grade-test-'||adm::text||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(adm,'Synthetic grade test');
  insert into public.clubs(id,name,slug,created_by) values(c,'Temporary grade test','grade-test-'||c::text,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin');
  insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  insert into public.playing_groups(id,club_id,name,active,created_by) values(g1,c,'4th Grade',true,adm),(g2,c,'3rd Grade',true,adm),(inactive,c,'Old Grade',false,adm);
  for i in 1..6 loop
   insert into club_selection_private.roster(id,club_id,name,grade,batting,bowling,bowling_load)
    values(rids[i],c,'Test Player '||i,case when i=4 then 'Manual XI' else '' end,'lower','pace','frontline');
   insert into public.players(id,club_id,display_name,active) values(pids[i],c,'Test Player '||i,true);
   if i<5 then insert into club_batting_private.roster_players(roster_id,club_id,player_id) values(rids[i],c,pids[i]);end if;
  end loop;
  select roster_revision into initial_revision from club_selection_private.access where club_id=c;
  insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by)
   values(c,pids[1],g1,adm),(c,pids[2],g1,adm),(c,pids[2],g2,adm),(c,pids[3],inactive,adm),(c,pids[4],g1,adm),(c,pids[5],g1,adm),(c,pids[6],g1,adm);
  -- Both group rows must be visible before deciding a grade.
  assert (select grade='' from club_selection_private.roster where id=rids[1]);
  set constraints public.fill_usual_grade_after_membership,club_batting_private.fill_usual_grade_after_player_link immediate;
  assert (select grade='4th Grade' and user_id is null and batting='lower' and bowling='pace' and bowling_load='frontline' from club_selection_private.roster where id=rids[1]);
  assert (select grade='' from club_selection_private.roster where id=rids[2]);
  assert (select grade='' from club_selection_private.roster where id=rids[3]);
  assert (select grade='Manual XI' from club_selection_private.roster where id=rids[4]);
  assert (select grade='' from club_selection_private.roster where id=rids[5]);
  assert (select roster_revision>initial_revision from club_selection_private.access where club_id=c);
  -- An explicitly cleared grade does not get rewritten on roster edits.
  update club_selection_private.roster set grade='' where id=rids[1];
  assert (select grade='' from club_selection_private.roster where id=rids[1]);
  -- A later identity link can reuse an already assigned group, without sign-up.
  insert into club_batting_private.roster_players(roster_id,club_id,player_id) values(rids[6],c,pids[6]);
  assert (select grade='4th Grade' from club_selection_private.roster where id=rids[6]);
  delete from public.player_playing_groups where club_id=c and player_id=pids[2] and playing_group_id=g2;
  assert (select grade='4th Grade' from club_selection_private.roster where id=rids[2]);
  assert not has_function_privilege('authenticated','club_selection_private.fill_roster_grade(uuid,uuid)','EXECUTE');
  assert not has_function_privilege('anon','club_selection_private.fill_roster_grade_after_group()','EXECUTE');
  raise exception using errcode='P0160',message='Rollback successful synthetic test';
 exception when sqlstate 'P0160' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end
$tests$;
select 'Usual-grade carry-over checks passed' as result;
