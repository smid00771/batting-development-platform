-- Exercise the public API with synthetic clubs. Every test record is rolled back.
do $tests$
declare c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();p3 uuid:=gen_random_uuid();inactive_id uuid:=gen_random_uuid();u uuid;
 day text:='2026-10-17';next_day text:='2026-10-24';scenario jsonb;req jsonb;res jsonb;actual jsonb;before_state text;rejected boolean;stamp timestamptz;revision integer;
begin
 begin
  foreach u in array array[head_id,player_id] loop
   insert into auth.users(id,email) values(u,'availability-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic user');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Availability preservation test','availability-test-'||c,head_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,head_id,'player','admin','player'),(c,player_id,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',head_id,'Australia/Sydney');
  insert into club_selection_private.roster(id,club_id,name,user_id,batting,bowling,bowling_load,keeper,active) values
   (p1,c,'Alice',player_id,'top','none','unknown',false,true),(p2,c,'Bob',null,'top','none','unknown',false,true),(p3,c,'Casey',null,'top','none','unknown',false,true),(inactive_id,c,'Inactive',null,'top','none','unknown',false,false);
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  for scenario in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_build_object('date',day,'unavailable_ids',jsonb_build_array(p1),'expected',jsonb_build_array(p1)),
   jsonb_build_object('date',day,'unavailable_ids',jsonb_build_array(p2),'expected',jsonb_build_array(p1,p2)),
   jsonb_build_object('date',next_day,'unavailable_ids',jsonb_build_array(p2),'expected',jsonb_build_array(p2)),
   jsonb_build_object('date',day,'unavailable_ids','[]'::jsonb,'available_ids',jsonb_build_array(p1),'expected',jsonb_build_array(p2)),
   jsonb_build_object('date',day,'unavailable_ids',jsonb_build_array(p3),'reset_unavailable',true,'expected',jsonb_build_array(p3))
  )) loop
   req:=(scenario-'expected')||jsonb_build_object('make_all_available',true,'request_id',gen_random_uuid(),'roster_revision',(select roster_revision from club_selection_private.access where club_id=c),
    'revisions',(select jsonb_object_agg(r.id,coalesce(a.revision,0)) from club_selection_private.roster r left join club_selection_private.availability a on a.roster_id=r.id where r.club_id=c and r.active));
   res:=public.club_selections_api(c,'availability_batch',req);assert (res->>'saved')::boolean;
   select coalesce(jsonb_agg(r.id),'[]') into actual from club_selection_private.roster r join club_selection_private.availability a on a.roster_id=r.id where r.club_id=c and a.unavailable_dates ? (scenario->>'date');
   assert actual @> (scenario->'expected') and (scenario->'expected') @> actual,'Saved exceptions must be preserved or explicitly changed';
   assert not exists(select 1 from club_selection_private.roster r join club_selection_private.availability a on a.roster_id=r.id where r.club_id=c and (a.available_dates ? (scenario->>'date'))=(a.unavailable_dates ? (scenario->>'date'))),'Each active player has one status for this date';
   assert public.club_selections_api(c,'availability_batch',req)=res,'Retry is idempotent';
  end loop;
  assert not exists(select 1 from club_selection_private.availability where roster_id=inactive_id),'Inactive players are unchanged';
  assert (select unavailable_dates ? next_day from club_selection_private.availability where roster_id=p2),'Reset affects only the selected playing day';
  res:=public.club_selections_api(c,'context');assert jsonb_array_length(res->'availability_dates')=2,'Saved dates persist in shared context';
  assert res->'availability_dates'->0->>'updated_at' is not null,'Saved timestamp is supplied';
  -- A player's own calendar removal becomes a preserved exception.
  update club_selection_private.availability_date_setups set updated_at=now()-interval '1 day' where club_id=c;
  select a.revision into revision from club_selection_private.availability a where roster_id=p1;
  perform set_config('request.jwt.claim.sub',player_id::text,true);
  perform public.club_selections_api(c,'availability',jsonb_build_object('id',p1,'revision',revision,'calendar_mode','opt_in','available_dates',jsonb_build_array(next_day),'request_id',gen_random_uuid()));
  assert (select unavailable_dates ? day from club_selection_private.availability where roster_id=p1),'Individual removal is remembered';
  assert (select updated_at=now() from club_selection_private.availability_date_setups where club_id=c and match_date=day::date),'Changed date timestamp advances';
  assert (select updated_at<now() from club_selection_private.availability_date_setups where club_id=c and match_date=next_day::date),'Other date timestamp is unchanged';
  res:=public.club_selections_api(c,'context');assert res->'availability_dates'='[]','Bulk setup status is limited to authorised staff';
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Player cannot bulk reset availability';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  req:=jsonb_build_object('date',day,'make_all_available',true,'unavailable_ids','[]'::jsonb,'request_id',gen_random_uuid(),'roster_revision',(select roster_revision from club_selection_private.access where club_id=c),
   'revisions',(select jsonb_object_agg(r.id,coalesce(a.revision,0)) from club_selection_private.roster r left join club_selection_private.availability a on a.roster_id=r.id where r.club_id=c and r.active));
  perform public.club_selections_api(c,'availability_batch',req);
  assert (select unavailable_dates ? day and not available_dates ? day from club_selection_private.availability where roster_id=p1),'Old clients also retain individual unavailability';
  -- Restoring availability through the individual calendar removes that exception.
  select a.revision into revision from club_selection_private.availability a where roster_id=p1;
  perform public.club_selections_api(c,'availability',jsonb_build_object('id',p1,'revision',revision,'calendar_mode','opt_in','available_dates',jsonb_build_array(day,next_day),'request_id',gen_random_uuid()));
  assert (select not unavailable_dates ? day and available_dates ? day from club_selection_private.availability where roster_id=p1),'Individual restoration clears exception';
  -- A stale request cannot overwrite somebody else's new calendar change.
  select md5(string_agg(to_jsonb(a)::text,'' order by a.roster_id)) into before_state from club_selection_private.availability a join club_selection_private.roster r on r.id=a.roster_id where r.club_id=c;
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req||jsonb_build_object('request_id',gen_random_uuid(),'reset_unavailable',true));exception when raise_exception then rejected:=sqlerrm like 'A player updated their calendar.%';end;assert rejected,'Concurrent update rejected';
  assert (select md5(string_agg(to_jsonb(a)::text,'' order by a.roster_id))=before_state from club_selection_private.availability a join club_selection_private.roster r on r.id=a.roster_id where r.club_id=c),'Rejected request changes nothing';
  req:=req||jsonb_build_object('request_id',gen_random_uuid(),'available_ids',jsonb_build_array(gen_random_uuid()));
  rejected:=false;begin perform public.club_selections_api(c,'availability_batch',req);exception when raise_exception then rejected:=sqlerrm like 'Choose unavailable players from this club%';end;assert rejected,'Cannot restore a player outside the club';
  assert not has_table_privilege('authenticated','club_selection_private.availability_date_setups','select'),'No direct table access';
  raise exception using errcode='P0191',message='Rollback availability tests';
 exception when sqlstate 'P0191' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic records removed';
end $tests$;
select 'Availability preservation tests passed; all synthetic records rolled back.' result;
