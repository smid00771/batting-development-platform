-- Exercise the real API with synthetic records; roll back every record before returning.
do $tests$
declare c uuid:=gen_random_uuid();other_club uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();p uuid:=gen_random_uuid();unlinked uuid:=gen_random_uuid();u uuid;
 day text:='2026-10-24';next_day text:='2026-10-31';req jsonb;res jsonb;bad jsonb;expected integer;rejected boolean;
begin
 begin
  foreach u in array array[head_id,player_id,stranger] loop
   insert into auth.users(id,email) values(u,'calendar-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic user');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Calendar test','calendar-'||c,head_id),(other_club,'Other test','calendar-'||other_club,stranger);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,head_id,'player','admin','player'),(c,player_id,'player','none','player'),(c,stranger,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',head_id,'Australia/Sydney');
  insert into club_selection_private.roster(id,club_id,name,user_id,batting,bowling,bowling_load,keeper,active) values(p,c,'Linked player',player_id,'top','none','unknown',false,true),(unlinked,c,'Unlinked player',null,'top','none','unknown',false,true);
  insert into club_selection_private.availability_date_setups(club_id,match_date,bulk_saved_at,updated_at) values(c,day::date,now()-interval '1 day',now()-interval '1 day'),(c,next_day::date,now()-interval '1 day',now()-interval '1 day');
  perform set_config('request.jwt.claim.sub',player_id::text,true);
  req:=jsonb_build_object('id',p,'revision',0,'calendar_mode','opt_in','available_dates','[]'::jsonb,'unavailable_dates',jsonb_build_array(day,day),'request_id',gen_random_uuid());
  res:=public.club_selections_api(c,'availability',req);assert (res->>'saved')::boolean;
  assert (select available_dates='[]' and unavailable_dates=jsonb_build_array(day) from club_selection_private.availability where roster_id=p),'New red dates save and deduplicate';
  assert (select updated_at=now() from club_selection_private.availability_date_setups where club_id=c and match_date=day::date),'New red date updates bulk status timestamp';
  assert (select updated_at<now() from club_selection_private.availability_date_setups where club_id=c and match_date=next_day::date),'Untouched dates retain their timestamp';
  select revision into expected from club_selection_private.availability where roster_id=p;
  assert public.club_selections_api(c,'availability',req)=res,'Retry returns original result';
  assert (select revision=expected from club_selection_private.availability where roster_id=p),'Retry does not write twice';
  req:=req||jsonb_build_object('revision',expected,'unavailable_dates','[]'::jsonb,'request_id',gen_random_uuid());
  perform public.club_selections_api(c,'availability',req);
  assert (select available_dates='[]' and unavailable_dates='[]' from club_selection_private.availability where roster_id=p),'Red can return to not set';
  select revision into expected from club_selection_private.availability where roster_id=p;
  req:=req||jsonb_build_object('revision',expected,'available_dates',jsonb_build_array(day),'unavailable_dates',jsonb_build_array(next_day),'request_id',gen_random_uuid());
  perform public.club_selections_api(c,'availability',req);
  assert (select available_dates=jsonb_build_array(day) and unavailable_dates=jsonb_build_array(next_day) from club_selection_private.availability where roster_id=p),'Independent green and red choices persist';
  select revision into expected from club_selection_private.availability where roster_id=p;
  req:=req||jsonb_build_object('revision',expected,'available_dates','[]'::jsonb,'unavailable_dates',jsonb_build_array(next_day),'request_id',gen_random_uuid());
  perform public.club_selections_api(c,'availability',req);
  assert (select not available_dates ? day and not unavailable_dates ? day and unavailable_dates ? next_day from club_selection_private.availability where roster_id=p),'Explicit clearing to not set preserves other dates';
  -- A stale version must not overwrite another edit.
  rejected:=false;begin perform public.club_selections_api(c,'availability',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'Availability changed.%';end;assert rejected,'Stale edits rejected';
  select revision into expected from club_selection_private.availability where roster_id=p;
  for bad in select value from jsonb_array_elements('[null,{},[null],[5],["2026-02-30"],["2026-1-01"],["2026-10-24"]]'::jsonb) loop
   rejected:=false;begin perform public.club_selections_api(c,'availability',req||jsonb_build_object('revision',expected,'available_dates',jsonb_build_array(day),'unavailable_dates',bad,'request_id',gen_random_uuid()));exception when others then rejected:=true;end;
   assert rejected,'Invalid and overlapping dates rejected';
  end loop;
  rejected:=false;begin perform public.club_selections_api(c,'availability',req||jsonb_build_object('revision',expected,'unavailable_dates',(select jsonb_agg(day) from generate_series(1,1501)),'request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm='Invalid unavailability calendar';end;assert rejected,'Oversized calendars rejected';
  assert (select revision=expected from club_selection_private.availability where roster_id=p),'Rejected changes leave saved data intact';
  -- Older clients omit unavailable_dates; they still preserve exceptions.
  req:=(req-'unavailable_dates')||jsonb_build_object('revision',expected,'available_dates',jsonb_build_array(day),'request_id',gen_random_uuid());
  perform public.club_selections_api(c,'availability',req);
  select revision into expected from club_selection_private.availability where roster_id=p;
  req:=req||jsonb_build_object('revision',expected,'available_dates','[]'::jsonb,'request_id',gen_random_uuid());
  perform public.club_selections_api(c,'availability',req);
  assert (select unavailable_dates ? day and unavailable_dates ? next_day from club_selection_private.availability where roster_id=p),'Legacy removals remain red and other red dates survive';
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  for u in select unnest(array[p,unlinked]) loop
   rejected:=false;begin perform public.club_selections_api(c,'availability',req||jsonb_build_object('id',u,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm='Edit only your own availability';end;assert rejected,'Ordinary members cannot edit another player, including unlinked entries';
  end loop;
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  req:=jsonb_build_object('id',unlinked,'revision',0,'calendar_mode','opt_in','available_dates','[]'::jsonb,'unavailable_dates',jsonb_build_array(day),'request_id',gen_random_uuid());
  perform public.club_selections_api(c,'availability',req);
  assert (select unavailable_dates ? day from club_selection_private.availability where roster_id=unlinked),'Authorised staff can mark an unlinked player unavailable';
  rejected:=false;begin perform public.club_selections_api(other_club,'availability',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm='Club membership required';end;assert rejected,'Cross-club changes rejected';
  raise exception using errcode='P0211',message='Rollback calendar tests';
 exception when sqlstate 'P0211' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic records removed';
end $tests$;
select 'Three-state calendar database checks passed; synthetic records rolled back.' result;
