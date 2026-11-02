-- Exercise the public RPC as authenticated users; all synthetic rows roll back.
do $test$
declare c uuid:=gen_random_uuid();a uuid:=gen_random_uuid();h uuid:=gen_random_uuid();u uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 g uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();sg2 uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();past uuid:=gen_random_uuid();draft uuid:=gen_random_uuid();
 players uuid[]:=array(select gen_random_uuid() from generate_series(1,14));
 day text:=(current_date+30)::text;otherday text:=(current_date+31)::text;old_day text:=(current_date-30)::text;
 details jsonb;slots jsonb;req jsonb;res jsonb;before_state jsonb;rev integer;rejected boolean;v uuid;
begin
 begin
  foreach v in array array[a,h,u,outsider] loop
   insert into auth.users(id,email) values(v,'release339-'||v||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(v,'Synthetic release339');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic release339','release339-'||c,a);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values
   (c,a,'admin','admin',null),(c,h,'player','none','player'),(c,u,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',h);
  insert into public.playing_groups(id,club_id,name,active,created_by) values(g,c,'Test First',true,a),(g2,c,'Test Women',true,a);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled,normal_player_limit) values(sg,c,'Test Seniors',false,11),(sg2,c,'Test Women',false,13);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g,sg),(c,g2,sg2);
  insert into club_selection_private.selection_access_settings(club_id) values(c);
  insert into club_selection_private.selection_group_heads(club_id,selection_group_id,user_id) values(c,sg,h),(c,sg2,u);
  for i in 1..14 loop
   insert into club_selection_private.roster(id,club_id,user_id,name,grade,active,batting,bowling,bowling_load)
    values(players[i],c,case when i=13 then u end,'Test Player '||i,case when i<12 then 'Test First' else 'Test Women' end,i<>14,'top','pace','frontline');
   insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates) values(players[i],jsonb_build_array(otherday),jsonb_build_array(day));
  end loop;
  select roster_revision into rev from club_selection_private.access where club_id=c;
  select to_jsonb(av) into before_state from club_selection_private.availability av where roster_id=players[3];
  req:=jsonb_build_object('request_id',gen_random_uuid(),'date',day,'make_all_available',true,'scope_ids',jsonb_build_array(players[1],players[2]),
   'roster_revision',rev,'revisions',(select jsonb_object_agg(roster_id,revision) from club_selection_private.availability where roster_id=any(players[1:2])),
   'available_ids',jsonb_build_array(players[1]),'unavailable_ids','[]'::jsonb);
  perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
  res:=public.club_selections_api(c,'availability_batch',req);assert res->>'players'='2';
  assert public.club_selections_api(c,'availability_batch',req)=res,'Lost-response retry returns the same receipt';
  reset role;
  assert (select available_dates ? day and available_dates ? otherday and not unavailable_dates ? day from club_selection_private.availability where roster_id=players[1]),'Explicitly selected player becomes available; other dates remain';
  assert (select unavailable_dates ? day from club_selection_private.availability where roster_id=players[2]),'Existing exception is preserved';
  assert (select to_jsonb(av)=before_state from club_selection_private.availability av where roster_id=players[3]),'Outside-scope calendar and revision unchanged';
  -- Clearing exceptions is scoped too; an unrelated calendar change must not block it.
  req:=req||jsonb_build_object('request_id',gen_random_uuid(),'reset_unavailable',true,'revisions',(select jsonb_object_agg(roster_id,revision) from club_selection_private.availability where roster_id=any(players[1:2])));
  update club_selection_private.availability set revision=revision+1 where roster_id=players[3];
  set local role authenticated;res:=public.club_selections_api(c,'availability_batch',req);reset role;
  assert (select available_dates ? day and not unavailable_dates ? day from club_selection_private.availability where roster_id=players[2]),'Scoped exception reset works';
  select jsonb_agg(to_jsonb(av) order by roster_id) into before_state from club_selection_private.availability av where roster_id=any(players);
  set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'A player updated their calendar.%';end;assert rejected,'Stale selected calendar rejected';
  foreach v in array array[players[14],gen_random_uuid()] loop
   rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req||jsonb_build_object('request_id',gen_random_uuid(),'scope_ids',jsonb_build_array(v)));exception when raise_exception then rejected:=true;end;assert rejected,'Inactive or foreign player rejected';
  end loop;
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req||jsonb_build_object('request_id',gen_random_uuid(),'scope_ids','[]'::jsonb));exception when raise_exception then rejected:=true;end;assert rejected,'Empty scope cannot silently become whole club';
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req||jsonb_build_object('request_id',gen_random_uuid(),'scope_ids',jsonb_build_array(players[1],players[1])));exception when raise_exception then rejected:=true;end;assert rejected,'Duplicate scope rejected';
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req||jsonb_build_object('request_id',gen_random_uuid(),'unavailable_ids',jsonb_build_array(players[3])));exception when raise_exception then rejected:=true;end;assert rejected,'Outside-scope exception rejected';
  reset role;
  assert (select jsonb_agg(to_jsonb(av) order by roster_id)=before_state from club_selection_private.availability av where roster_id=any(players)),'Rejected batches are atomic';
  perform set_config('request.jwt.claim.sub',outsider::text,true);set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req);exception when raise_exception then rejected:=true;end;assert rejected,'Foreign user cannot reuse receipt';reset role;
  -- Add completed and draft teams: only the past published lineup is a candidate source.
  details:=jsonb_build_object('grade','Test First','grade_group_id',g,'competition','Test','format','limited_overs','opposition','Visitors','ground','Ground',
   'days',jsonb_build_array(jsonb_build_object('date',day)),'min_quicks',0,'min_batters',0,'brackets',false,
   'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',players[1],'captain_manual',true,'keeper_id',players[2],'keeper_manual',true)));
  slots:=(select jsonb_agg(jsonb_build_object('d1',players[i],'d2',null) order by i) from generate_series(1,11) i);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,details,slots),
   (past,c,jsonb_set(details,'{days,0,date}',to_jsonb(old_day)),jsonb_build_array(jsonb_build_object('d1',players[3],'d2',null))),
   (draft,c,jsonb_set(details,'{days,0,date}',to_jsonb((current_date-37)::text)),jsonb_build_array(jsonb_build_object('d1',players[4],'d2',null)));
  update club_selection_private.fixtures f set published=jsonb_build_object('details',f.details,'slots',f.slots),publication=1 where id=past;
  perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
  res:=public.club_selections_api(c,'availability_candidates');assert res#>'{teams,0,player_ids}'=jsonb_build_array(players[3]),'History excludes draft and upcoming teams';
  res:=public.club_selections_api(c,'context');
  assert (res->>'admin')::boolean and (res->>'can_view_board')::boolean and not (res->>'selection_editor')::boolean,'Admin can see board without editor grants';
  assert (select bool_and((f->>'can_publish')::boolean and not (f->>'can_edit')::boolean and f->'slots' is not null) from jsonb_array_elements(res->'fixtures') f),'Admin can review/publish all club drafts without editing';
  assert (select bool_and((entry->>'can_view')::boolean) from jsonb_array_elements(res->'selection_group_access') entry),'All selection groups are visible';
  rejected:=false;begin perform public.club_selections_api(c,'save_board',jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fid,'revision',1,'details',details,'slots',slots))));exception when raise_exception then rejected:=true;end;assert rejected,'Admin does not acquire selector editing';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fid),'revisions',jsonb_build_object(fid::text,1),'acknowledge_balance',true);
  res:=public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(fid)));
  assert exists(select 1 from jsonb_array_elements(res#>'{fixtures,0,issues}') i where i->>'level'='error'),'Admin sees availability blockers';
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Admin cannot bypass availability';
  rejected:=false;begin perform public.club_selections_api(c,'send_review',req);exception when raise_exception then rejected:=true;end;assert rejected,'Admin does not acquire selector review-sending';
  reset role;update club_selection_private.availability set available_dates=jsonb_build_array(day,otherday),unavailable_dates='[]' where roster_id=any(players);
  -- Another group's Head Selector still cannot publish this group.
  perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Unrelated group head cannot publish';reset role;
  perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
  res:=public.club_selections_api(c,'publish',req);assert res->>'published'='true';assert public.club_selections_api(c,'publish',req)=res,'Admin publication retry is idempotent';
  reset role;select revision into rev from club_selection_private.fixtures where id=fid;
  set local role authenticated;
  res:=public.club_selections_api(c,'fixture_lock',jsonb_build_object('request_id',gen_random_uuid(),'id',fid,'revision',rev,'unlock',true));assert res->>'selection_unlocked_until' is not null,'Admin may unlock for corrections';
  reset role;
  -- Independent women's group, 13 players, and no extra size acknowledgement.
  details:=jsonb_set(jsonb_set(details,'{grade_group_id}',to_jsonb(g2::text)),'{grade}','"Test Women"');
  slots:=(select jsonb_agg(jsonb_build_object('d1',players[i],'d2',null) order by i) from generate_series(1,13) i);
  -- Use a fresh day so the successful first publication does not overlap.
  details:=jsonb_set(details,'{days,0,date}',to_jsonb(otherday));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(gen_random_uuid(),c,details,slots) returning id into fid;
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fid),'revisions',jsonb_build_object(fid::text,1),'acknowledge_balance',true);
  set local role authenticated;res:=public.club_selections_api(c,'publish',req);assert res->>'published'='true','Admin publishes independent women group';reset role;
  assert (select jsonb_array_length(published->'slots')=13 from club_selection_private.fixtures where id=fid),'All thirteen are published';
  assert not has_function_privilege('authenticated','club_selection_private.availability_candidates(uuid)','execute'),'No direct private helper access';
  raise exception using errcode='P0339',message='Rollback synthetic release339';
 exception when sqlstate 'P0339' then null;end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic data removed';
end $test$;
select 'Authenticated Admin publishing and scoped availability checks passed; synthetic data rolled back.' result;
