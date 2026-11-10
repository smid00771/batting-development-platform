-- Synthetic club only; all records roll back, with no publication or messages.
do $test$
declare c uuid:=gen_random_uuid();a uuid:=gen_random_uuid();h uuid:=gen_random_uuid();u uuid:=gen_random_uuid();o uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();v uuid;
 players uuid[]:=array(select gen_random_uuid() from generate_series(1,14));
 day date:=current_date+30;details jsonb;original jsonb;merged jsonb;req jsonb;res jsonb;fixture jsonb;rejected boolean;
begin
 begin
  foreach v in array array[a,h,u,o] loop
   insert into auth.users(id,email) values(v,'copy-merge-'||v||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(v,'Synthetic copy user');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic copy merge','copy-merge-'||c,a);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,a,'admin','admin'),(c,h,'player','none'),(c,u,'player','none'),(c,o,'player','none');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',h);
  insert into club_selection_private.selectors(club_id,user_id) values(c,u);
  insert into public.playing_groups(id,club_id,name,active,created_by) values(g,c,'Copy test grade',true,a);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Copy test group',false);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g,sg);
  for i in 1..14 loop
   insert into club_selection_private.roster(id,club_id,name,active) values(players[i],c,'Copy test player '||i,true);
   insert into club_selection_private.availability(roster_id,available_dates) values(players[i],case when i=1 then jsonb_build_array(day::text) when i=2 then jsonb_build_array((day+7)::text) else jsonb_build_array(day::text,(day+7)::text) end);
  end loop;
  details:=jsonb_build_object('grade','Copy test grade','grade_group_id',g,'competition','Copy test','format','long_form','opposition','Visitors','ground','Test ground',
   'days',jsonb_build_array(jsonb_build_object('date',day::text),jsonb_build_object('date',(day+7)::text)),'brackets',true,'min_quicks',0,'min_batters',0);
  original:=(select jsonb_agg(case when i=1 then jsonb_build_object('d1',players[1],'d2',players[2]) else jsonb_build_object('d1',null,'d2',null) end order by i) from generate_series(1,11) i);
  merged:=jsonb_build_array(original->0)||(select jsonb_agg(jsonb_build_object('d1',players[i],'d2',players[i]) order by i) from generate_series(3,14) i);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,details,original);
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fid,'revision',1,'details',details,'slots',merged)));
  perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
  res:=public.club_selections_api(c,'save_board',req);assert res->>'saved'='true','An ordinary selector can save the combined oversized draft';
  assert public.club_selections_api(c,'save_board',req)=res,'Lost-response retry returns the same receipt';
  select x into fixture from jsonb_array_elements(public.club_selections_api(c,'context')->'fixtures') x where x->>'id'=fid::text;
  assert fixture->'slots'=merged and fixture->>'revision'='2','All thirteen daily choices and the original bracket are retained once';
  assert fixture->'published'='null'::jsonb,'Saving does not publish';
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then
   assert sqlerrm like '%another session%';rejected:=true;end;assert rejected,'Stale copies cannot replace a newer team';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fid,'revision',2,'details',details,'slots',original)));
  perform public.club_selections_api(c,'save_board',req);
  select x into fixture from jsonb_array_elements(public.club_selections_api(c,'context')->'fixtures') x where x->>'id'=fid::text;
  assert fixture->'slots'=original and fixture->>'revision'='3','Undo restores the existing bracket, not an empty team';
  reset role;perform set_config('request.jwt.claim.sub',o::text,true);set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary players cannot edit selections';
  reset role;
  raise exception using errcode='P0356',message='Rollback synthetic copy merge test';
 exception when sqlstate 'P0356' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic data removed';
end $test$;
select 'Authenticated selector save, retained bracket, oversized draft, retry, stale-save rejection, Undo and ordinary-player denial passed; all test data rolled back.' result;
