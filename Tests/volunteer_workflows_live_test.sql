-- Actual authenticated roles and production helpers; synthetic changes roll back.
do $test$
declare c uuid:=gen_random_uuid();a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();v uuid;
 g uuid:=gen_random_uuid();dev uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();f uuid:=gen_random_uuid();
 players uuid[]:=array(select gen_random_uuid() from generate_series(1,3));
 sid uuid:=gen_random_uuid();source_grade uuid:=gen_random_uuid();team uuid:=gen_random_uuid();org uuid:=gen_random_uuid();
 day text:=current_date::text;otherday text:=(current_date+1)::text;untouched text:=(current_date+8)::text;
 req jsonb;res jsonb;prior jsonb;details jsonb;slots jsonb;settings jsonb;rev integer;denied boolean;
begin
 begin
  foreach v in array array[a,u,outsider] loop
   insert into auth.users(id,email) values(v,'release345-'||v||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(v,'Synthetic release345');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic release345','release345-'||c,a);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,a,'admin','admin'),(c,u,'player','none');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',a);
  insert into public.playing_groups(id,club_id,name,active) values(g,c,'Test First',true),(dev,c,'Test Dev',true);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Test Seniors',false);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g,sg),(c,dev,sg);
  for i in 1..3 loop
   insert into club_selection_private.roster(id,club_id,user_id,name,grade,active) values(players[i],c,case when i=1 then u end,'Test Player '||i,'Test First',true);
   insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates,usual_available)
    values(players[i],jsonb_build_array(day,otherday,untouched),'[]',true);
  end loop;
  set constraints all immediate;
  select roster_revision into rev from club_selection_private.access where club_id=c;
  select to_jsonb(av) into prior from club_selection_private.availability av where roster_id=players[3];
  req:=jsonb_build_object('request_id',gen_random_uuid(),'player_ids',to_jsonb(players[1:2]),'dates',jsonb_build_array(day,otherday),
   'roster_revision',rev,'revisions',(select jsonb_object_agg(roster_id,revision) from club_selection_private.availability where roster_id=any(players[1:2])));
  perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
  res:=public.club_selections_api(c,'availability_paste',req);assert res->>'players'='2';
  assert public.club_selections_api(c,'availability_paste',req)=res,'Lost-response retry returns original receipt';
  denied:=false;begin perform public.club_selections_api(c,'availability_paste',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then denied:=sqlerrm like 'A player updated their calendar.%';end;assert denied,'Stale calendars rejected';
  denied:=false;begin perform public.club_selections_api(c,'availability_paste',req||jsonb_build_object('request_id',gen_random_uuid(),'player_ids',jsonb_build_array(gen_random_uuid())));exception when raise_exception then denied:=true;end;assert denied,'Foreign player rejected';
  reset role;
  assert (select bool_and(unavailable_dates ? day and unavailable_dates ? otherday and available_dates=jsonb_build_array(untouched) and usual_available) from club_selection_private.availability where roster_id=any(players[1:2])),'Only reviewed dates changed';
  assert (select to_jsonb(av)=prior from club_selection_private.availability av where roster_id=players[3]),'Outside-scope calendar and revision untouched';
  perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
  denied:=false;begin perform public.club_selections_api(c,'availability_paste',req);exception when raise_exception then denied:=true;end;assert denied,'Ordinary player cannot bulk-save';reset role;
  -- Drafts are not evidence. Published teams add usual teams; correction removes only inferred ones.
  details:=jsonb_build_object('grade','Test Dev','grade_group_id',dev,'format','t20','days',jsonb_build_array(jsonb_build_object('date',day)));
  slots:=jsonb_build_array(jsonb_build_object('d1',players[3]));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(f,c,details,slots);
  assert (select usual_grades=array['Test First'] from club_selection_private.roster where id=players[3]),'Draft leaves usual teams unchanged';
  update club_selection_private.fixtures fixture set published=jsonb_build_object('details',fixture.details,'slots',fixture.slots),publication=1 where id=f;
  assert (select usual_grades=array['Test First','Test Dev'] from club_selection_private.roster where id=players[3]),'Publication adds the team';
  assert (select count(*)=1 from club_selection_private.usual_team_evidence where fixture_id=f),'One fixture contributes once';
  update club_selection_private.fixtures set published=null where id=f;
  assert (select usual_grades=array['Test First'] from club_selection_private.roster where id=players[3]),'Correction preserves the manual choice';
  -- No real provider connection or credential is used; polling remains disabled.
  insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,updated_by,active_season_id,polling_enabled)
   values(c,org,gen_random_uuid(),gen_random_uuid(),a,sid,false);
  insert into club_selection_private.playhq_grade_mappings(club_id,season_id,team_id,source_grade_id,grade_id) values(c,sid,team,source_grade,g);
  insert into club_standings_private.catalogues(season_id,grades,teams) values(sid,jsonb_build_array(jsonb_build_object('id',source_grade,'name','Test First')),'[]');
  insert into club_standings_private.ladders(season_id,grade_id,data,checked_at) values(sid,source_grade,jsonb_build_object('grade_id',source_grade,'name','Test First','ladders',
   jsonb_build_array(jsonb_build_object('type','overall','headers',jsonb_build_array(jsonb_build_object('key','competitionPoints','name','Points')),
   'rows',jsonb_build_array(jsonb_build_object('team_id',team,'name','Test XI','club_id',org,'club_name','Synthetic release345','position',1,'values',jsonb_build_object('competitionPoints',12)))))),now());
  select revision into rev from club_standings_private.settings where club_id=c;
  settings:=jsonb_build_object('request_id',gen_random_uuid(),'revision',coalesce(rev,0),'season_id',sid,'ladder_audience','members','championship_audience','members','title','Test Championship','calculation','total','minimum_teams',1,
   'rules',jsonb_build_array(jsonb_build_object('grade_id',source_grade,'name','Test First','weight',5,'type','auto','points_column','competitionPoints','aggregation','sum')));
  perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
  res:=public.club_standings_api(c,'save_settings',settings);assert (res#>>'{championship,rows,0,points}')::numeric=60,'Published points multiplied once';
  assert public.club_standings_api(c,'save_settings',settings)=res,'Settings receipt is idempotent';reset role;
  perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
  res:=public.club_standings_api(c);assert res->>'can_view_ladders'='true' and res->>'can_view_championship'='true';
  assert res#>>'{championship,complete}'='true' and (res#>>'{championship,rows,0,points}')::numeric=60;
  assert res->'settings'='null'::jsonb and not res ? 'fixtures' and not res ? 'roster','Player receives public standings only';
  denied:=false;begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'Private player stats remain denied';
  denied:=false;begin perform public.club_standings_api(c,'save_settings',settings);exception when raise_exception then denied:=true;end;assert denied,'Member cannot change settings';
  reset role;
  update club_standings_private.settings set ladder_audience='staff' where club_id=c;
  set local role authenticated;res:=public.club_standings_api(c);assert res->>'can_view_ladders'='false' and res->>'can_view_championship'='true' and res->'ladders'='[]'::jsonb,'Audiences are independent';reset role;
  perform set_config('request.jwt.claim.sub',outsider::text,true);set local role authenticated;
  denied:=false;begin perform public.club_standings_api(c);exception when raise_exception then denied:=true;end;assert denied,'Non-member cannot read standings';reset role;
  assert not has_function_privilege('authenticated','club_selection_private.paste_unavailability(uuid,jsonb)','execute');
  assert not has_table_privilege('authenticated','club_selection_private.usual_team_evidence','select');
  assert not has_table_privilege('authenticated','club_standings_private.ladders','select');
  raise exception using errcode='P0345',message='Rollback synthetic release345';
 exception when sqlstate 'P0345' then null;end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic club removed';
 assert not exists(select 1 from auth.users where id=any(array[a,u,outsider])),'Synthetic users removed';
 assert not exists(select 1 from club_standings_private.catalogues where season_id=sid),'Synthetic cache removed';
end $test$;
select 'Release345 authenticated paste, usual teams and standings checks passed; synthetic data rolled back.' result;
