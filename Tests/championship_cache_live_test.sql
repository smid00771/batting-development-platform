-- Verify production triggers and authenticated RPCs; all synthetic rows roll back.
do $test$
declare c uuid:=gen_random_uuid();a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();v uuid;
 sid uuid:=gen_random_uuid();grade uuid:=gen_random_uuid();local_grade uuid:=gen_random_uuid();team uuid:=gen_random_uuid();org uuid:=gen_random_uuid();
 source jsonb;req jsonb;res jsonb;before_cache jsonb;stamp timestamptz;denied boolean;rev integer;
begin
 begin
  foreach v in array array[a,u] loop
   insert into auth.users(id,email) values(v,'champ-cache-'||v||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(v,'Synthetic cache tester');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic Championship Cache','champ-cache-'||c,a);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,a,'admin','admin'),(c,u,'player','none');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',a);
  insert into public.playing_groups(id,club_id,name,active) values(local_grade,c,'Test First',true);
  insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,updated_by,active_season_id,polling_enabled)
   values(c,org,gen_random_uuid(),gen_random_uuid(),a,sid,false);
  insert into club_selection_private.playhq_grade_mappings(club_id,season_id,team_id,source_grade_id,grade_id) values(c,sid,team,grade,local_grade);
  insert into club_standings_private.catalogues(season_id,grades,teams) values(sid,jsonb_build_array(jsonb_build_object('id',grade,'name','Test First')),'[]');
  source:=jsonb_build_object('grade_id',grade,'season_id',sid,'name','Test First','ladders',jsonb_build_array(jsonb_build_object('type','overall',
   'headers',jsonb_build_array(jsonb_build_object('key','competitionPoints','name','Points')),
   'rows',jsonb_build_array(jsonb_build_object('team_id',team,'club_id',org,'club_name','Synthetic Championship Cache','name','First XI','position',1,'values',jsonb_build_object('competitionPoints',10))))));
  insert into club_standings_private.ladders(season_id,grade_id,data,checked_at) values(sid,grade,source,now());
  select revision into rev from club_standings_private.settings where club_id=c;
  req:=jsonb_build_object('request_id',gen_random_uuid(),'revision',rev,'season_id',sid,'ladder_audience','members','championship_audience','members',
   'title','Test Championship','calculation','total','minimum_teams',1,'rules',jsonb_build_array(jsonb_build_object('grade_id',grade,'name','Test First','weight',5,'type','auto','points_column','competitionPoints','aggregation','sum')));
  perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
  res:=public.club_standings_api(c,'save_settings',req);assert (res#>>'{championship,rows,0,points}')::numeric=50;
  assert public.club_standings_api(c,'save_settings',req)=res,'Settings receipt still works';reset role;
  select to_jsonb(t),computed_at into before_cache,stamp from club_standings_private.championship_totals t where club_id=c;
  perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
  for i in 1..5 loop
   res:=public.club_standings_api(c);assert (res#>>'{championship,rows,0,points}')::numeric=50;
   assert res->'settings'='null'::jsonb and not res ? 'roster' and not res ? 'fixtures';
  end loop;
  denied:=false;begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'Private statistics remain restricted';reset role;
  assert (select to_jsonb(t)=before_cache from club_standings_private.championship_totals t where club_id=c),'Page reads leave the saved table untouched';
  update club_standings_private.ladders set data=data,checked_at=clock_timestamp() where season_id=sid and grade_id=grade;
  assert (select computed_at=stamp from club_standings_private.championship_totals where club_id=c),'Unchanged check does not rebuild';
  update club_standings_private.ladders set last_error='Synthetic provider error' where season_id=sid and grade_id=grade;
  set local role authenticated;res:=public.club_standings_api(c);reset role;
  assert res#>>'{championship,stale}'='true' and (res#>>'{championship,rows,0,points}')::numeric=50;
  assert (select computed_at=stamp from club_standings_private.championship_totals where club_id=c),'Failed check retains saved totals';
  update club_standings_private.ladders set last_error=null,checked_at=clock_timestamp(),data=jsonb_set(data,'{ladders,0,rows,0,values,competitionPoints}','12') where season_id=sid and grade_id=grade;
  assert (select computed_at>stamp and (data#>>'{rows,0,points}')::numeric=60 from club_standings_private.championship_totals where club_id=c),'Changed result is calculated before any player read';
  perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
  res:=public.club_standings_api(c);req:=jsonb_set(req||jsonb_build_object('request_id',gen_random_uuid(),'revision',res#>'{settings,revision}'),'{rules,0,weight}','4');
  res:=public.club_standings_api(c,'save_settings',req);assert (res#>>'{championship,rows,0,points}')::numeric=48,'Saved settings immediately return the new cached result';reset role;
  select computed_at into stamp from club_standings_private.championship_totals where club_id=c;
  req:=req||jsonb_build_object('request_id',gen_random_uuid(),'revision',res#>'{settings,revision}');
  set local role authenticated;res:=public.club_standings_api(c,'save_settings',req);reset role;
  assert (select computed_at=stamp from club_standings_private.championship_totals where club_id=c),'Saving identical settings skips calculation';
  update club_standings_private.ladders set data=null where season_id=sid and grade_id=grade;
  set local role authenticated;res:=public.club_standings_api(c);reset role;
  assert res#>>'{championship,complete}'='false' and res#>'{championship,rows}'='[]'::jsonb,'Missing source cannot keep the old rank';
  assert not has_table_privilege('authenticated','club_standings_private.championship_totals','select');
  assert not has_function_privilege('authenticated','club_standings_private.calculate_championship(uuid,uuid)','execute');
  assert not has_function_privilege('authenticated','club_standings_private.refresh_championship(uuid,boolean)','execute');
  set constraints all immediate;
  raise exception using errcode='P0346',message='Rollback Championship cache test';
 exception when sqlstate 'P0346' then null;end;
 assert not exists(select 1 from public.clubs where id=c);
 assert not exists(select 1 from auth.users where id=any(array[a,u]));
 assert not exists(select 1 from club_standings_private.catalogues where season_id=sid);
end $test$;
select 'Championship cache triggers, authenticated reads and settings passed; synthetic data rolled back.' result;
