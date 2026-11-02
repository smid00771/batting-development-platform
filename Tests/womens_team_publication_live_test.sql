-- Synthetic club; no real teams or messages are changed. All test data rolls back.
do $test$
declare c uuid:=gen_random_uuid();h uuid:=gen_random_uuid();a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();
 roster uuid[]:=array(select gen_random_uuid() from generate_series(1,14));
 day date:=current_date+30;details jsonb;team_slots jsonb;req jsonb;res jsonb;notes jsonb;rejected boolean;v uuid;
begin
 begin
  foreach v in array array[h,a,u] loop
   insert into auth.users(id,email) values(v,'twelve-test-'||v||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(v,'Synthetic twelve-player user');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic twelve-player test','twelve-test-'||c,a);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values
   (c,a,'admin','admin',null),(c,h,'player','none','player'),(c,u,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',h);
  insert into public.playing_groups(id,club_id,name,active,created_by) values(g,c,'Synthetic twelve',true,a);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled,normal_player_limit) values(sg,c,'Synthetic women group',false,13);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g,sg);
  for i in 1..14 loop
   insert into club_selection_private.roster(id,club_id,user_id,name,active,batting,bowling,bowling_load)
    values(roster[i],c,case when i=13 then u end,'Synthetic twelve player '||i,true,'top','pace','frontline');
   insert into club_selection_private.availability(roster_id,available_dates) values(roster[i],jsonb_build_array(day::text));
  end loop;
  details:=jsonb_build_object('grade','Synthetic twelve','grade_group_id',g,'competition','Synthetic competition','format','limited_overs',
   'opposition','Synthetic visitors','ground','Synthetic ground','days',jsonb_build_array(jsonb_build_object('date',day::text)),
   'min_quicks',0,'min_batters',0,'brackets',false,'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',roster[1],'captain_manual',true,'keeper_id',roster[2],'keeper_manual',true)));
  team_slots:=(select jsonb_agg(jsonb_build_object('d1',roster[i],'d2',null) order by i) from generate_series(1,12) i);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,details,team_slots);
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fid),'revisions',jsonb_build_object(fid::text,1),'acknowledge_balance',true);
  perform set_config('request.jwt.claim.sub',h::text,true);
  set local role authenticated;
  res:=public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(fid)));
  notes:=res#>'{fixtures,0,issues}';
  assert not exists(select 1 from jsonb_array_elements(notes) n where n->>'code' in ('twelve_team','over_team','over_slots')),'Twelve is normal for this group';
  assert not exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='error');
  -- Prove twelve can publish without any team-size acknowledgement, then roll back just that trial.
  begin
   res:=public.club_selections_api(c,'publish',req);assert res->>'published'='true';
   raise exception using errcode='P0338',message='Rollback twelve-player trial';
  exception when sqlstate 'P0338' then null;end;
  reset role;
  update club_selection_private.fixtures f set slots=f.slots||jsonb_build_array(jsonb_build_object('d1',roster[13],'d2',null)) where id=fid;
  select f.slots into team_slots from club_selection_private.fixtures f where id=fid;
  assert club_selection_private.normal_player_limit(c,details)=13;
  assert club_selection_private.normal_player_limit(c,details-'grade_group_id')=13,'Canonical team resolves even with only its name';
  -- Client fixture fields cannot grant a larger allowance to another group.
  update club_selection_private.selection_groups set normal_player_limit=11 where id=sg;
  assert club_selection_private.normal_player_limit(c,details||'{"normal_player_limit":13}')=11;
  set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Other groups still reject thirteen';
  reset role;update club_selection_private.selection_groups set normal_player_limit=13 where id=sg;
  perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary members cannot publish teams';
  reset role;perform set_config('request.jwt.claim.sub',h::text,true);
  update club_selection_private.fixtures f set slots=f.slots||jsonb_build_array(jsonb_build_object('d1',roster[14],'d2',null)) where id=fid;
  set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Fourteen is still blocked';
  reset role;update club_selection_private.fixtures f set slots=team_slots where f.id=fid;
  update club_selection_private.availability set available_dates='[]' where roster_id=roster[13];
  set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Thirteen does not bypass availability';
  reset role;update club_selection_private.availability set available_dates=jsonb_build_array(day::text) where roster_id=roster[13];
  update club_selection_private.fixtures f set slots=jsonb_set(f.slots,'{12,d1}',to_jsonb(roster[12]::text)) where f.id=fid;
  set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Thirteen does not bypass duplicate checks';
  reset role;update club_selection_private.fixtures f set slots=team_slots where f.id=fid;
  set local role authenticated;
  res:=public.club_selections_api(c,'publish',req);assert res->>'published'='true';
  assert public.club_selections_api(c,'publish',req)=res,'Identical retry returns the original receipt';
  reset role;
  assert (select publication=1 and jsonb_array_length(published->'slots')=13 and published->'slots'=slots from club_selection_private.fixtures where id=fid),'All thirteen remain in the published snapshot';
  assert exists(select 1 from club_batting_private.club_message_recipients mr join club_batting_private.club_messages m on m.id=mr.message_id where m.club_id=c and mr.user_id=u),'Thirteenth linked player is notified';
  raise exception using errcode='P0318',message='Rollback synthetic twelve-player test';
 exception when sqlstate 'P0318' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic data removed';
end $test$;
select 'Women’s team publication: 12 and 13 without extra size approval; authenticated permissions, other groups, 14-player/availability/duplicate guards, notifications and retry passed; test data rolled back.' result;
