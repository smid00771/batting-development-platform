-- Exercise grade-drop follow-ups only; left-out records are a separate workflow.
-- Synthetic users and fixtures only; every inserted row is rolled back.
begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();
 coach_id uuid:=gen_random_uuid();captain_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();outsider_id uuid:=gen_random_uuid();wrong_captain uuid:=gen_random_uuid();u uuid;
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();p3 uuid:=gen_random_uuid();previous_id uuid:=gen_random_uuid();current_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();
 day date:=(date_trunc('week',current_date)+interval '19 days')::date;details jsonb;slots jsonb;res jsonb;move jsonb;req jsonb;before_count integer;rev integer;rejected boolean;
begin
 begin
  foreach u in array array[head_id,selector_id,coach_id,captain_id,player_id,outsider_id,wrong_captain] loop
   insert into auth.users(id,email) values(u,'selection-followup-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic staff');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Selection follow-up test','followup-'||c,head_id),(other_c,'Other follow-up club','followup-'||other_c,outsider_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values
   (c,head_id,'player','none','player'),(c,selector_id,'player','none','player'),(c,coach_id,'coach','coach','coach_captain'),
   (c,captain_id,'captain','captain','player'),(c,player_id,'player','none','player'),(c,wrong_captain,'captain','captain','player'),(other_c,outsider_id,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',head_id),(other_c,'standalone','active',outsider_id);
  insert into club_selection_private.selectors values(c,selector_id);
  insert into club_selection_private.roster(id,club_id,name,user_id,batting,bowling,bowling_load,keeper) values
   (p1,c,'Synthetic dropped player',player_id,'top','pace','frontline',false),
   (p2,c,'Synthetic previous captain',captain_id,'middle','spin','part_time',false),
   (p3,c,'Synthetic current captain',head_id,'middle','pace','frontline',true);
  insert into club_selection_private.availability(roster_id,available_dates) values(p1,jsonb_build_array(day::text)),(p2,jsonb_build_array(day::text)),(p3,jsonb_build_array(day::text));
  details:=jsonb_build_object('grade','1st Grade','competition','Competition A','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',(day-7)::text)),
   'opposition','Synthetic opponents','ground','Synthetic ground','meeting','','brackets',false,'min_quicks',0,'min_batters',0,
   'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',p2,'captain_manual',true,'keeper_id',p1,'keeper_manual',true)));
  slots:=jsonb_build_array(jsonb_build_object('d1',p1,'d2',null),jsonb_build_object('d1',p2,'d2',null),jsonb_build_object('d1',p3,'d2',null))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,9));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(previous_id,c,details,slots);
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=previous_id;
  details:=jsonb_set(jsonb_set(jsonb_set(details,'{competition}','"Other competition"'),'{opposition}','"Other opponents"'),'{captain_id}',to_jsonb(wrong_captain::text))-'match_roles';
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(other_id,c,details,slots);
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=other_id;
  details:=jsonb_set(jsonb_set(jsonb_set(details,'{competition}','"Competition A"'),'{grade}','"2nd Grade"'),'{days}',jsonb_build_array(jsonb_build_object('date',day::text))) - 'captain_id';
  details:=details||jsonb_build_object('match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',p3,'captain_manual',true,'keeper_id',p3,'keeper_manual',true)));
  slots:=jsonb_build_array(jsonb_build_object('d1',p1,'d2',null),jsonb_build_object('d1',p3,'d2',null))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,9));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(current_id,c,details,slots);
  perform set_config('request.jwt.claim.sub',selector_id::text,true);

  assert public.club_selections_api(c,'context')->'conversations'='[]'::jsonb,'No history scan or reminders until requested';
  req:=jsonb_build_object('ids',jsonb_build_array(current_id),'request_id',gen_random_uuid());
  res:=public.club_selections_api(c,'show_dropped',req);assert (res->>'count')::int=2,'Only requested grade drops captured';
  assert public.club_selections_api(c,'show_dropped',req)=res,'Retry is idempotent';
  select x into move from jsonb_array_elements(public.club_selections_api(c,'context')->'conversations') x where x->>'roster_id'=p1::text;
  assert move->>'previous_grade'='1st Grade' and move->>'grade'='2nd Grade';
  assert (select count(*)=2 from club_selection_private.dropped_player_reminders where club_id=c);
  -- Make any accidental historical scan fail during passive reads and marking.
  execute $guard$create or replace function club_selection_private.lower_grade_moves(c uuid)
   returns table(fixture_id uuid,roster_id uuid,previous_fixture_id uuid,previous_grade text,grade text,competition text,format text,start_date text,movement_key text,previous_captains uuid[])
   language plpgsql stable set search_path='' as $n$begin raise exception 'Unexpected grade-history scan';end$n$$guard$;
  execute $guard$create or replace function club_selection_private.conversation_context(c uuid,u uuid) returns jsonb
   language plpgsql stable set search_path='' as $n$begin raise exception 'Unexpected follow-up scan';end$n$$guard$;
  assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=2,'Saved reminders survive refresh without calculating';
  update club_selection_private.fixtures f set details=jsonb_set(f.details,'{ground}','"Changed venue"') where id=current_id;
  assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=2,'Unrelated fixture edits retain reminders';
  update club_selection_private.availability set unavailable_dates=jsonb_build_array(day::text) where roster_id=p1;
  assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=1,'Explicit unavailability is excluded';
  update club_selection_private.availability set unavailable_dates='[]' where roster_id=p1;
  update club_selection_private.roster set active=false where id=p1;
  assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=1,'Inactive player excluded';
  update club_selection_private.roster set active=true where id=p1;
  foreach u in array array[coach_id,captain_id] loop
   perform set_config('request.jwt.claim.sub',u::text,true);
   assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=2,'Coach and previous captain retain private follow-up';
  end loop;
  foreach u in array array[player_id,wrong_captain] loop
   perform set_config('request.jwt.claim.sub',u::text,true);
   assert public.club_selections_api(c,'context')->'conversations'='[]'::jsonb,'Unrelated staff and player cannot see private reminders';
   rejected:=false;begin perform public.club_selections_api(c,'show_dropped',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected;
  end loop;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club denied';
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.club_selections_api(c,'show_dropped',req);exception when raise_exception then rejected:=true;end;assert rejected,'Anonymous denied';
  perform set_config('request.jwt.claim.sub',captain_id::text,true);
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=current_id;
  req:=move||jsonb_build_object('spoken',true,'request_id',gen_random_uuid());
  res:=public.club_selections_api(c,'conversation',req);assert (res->>'spoken')::boolean,'Can mark a locked team without history scans';
  assert public.club_selections_api(c,'conversation',req)=res,'Mark retry is idempotent';
  perform set_config('request.jwt.claim.sub',coach_id::text,true);
  assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=1,'Only outstanding reminder remains for another staff account';
  rejected:=false;begin perform public.club_selections_api(c,'conversation',move||jsonb_build_object('spoken',false,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Stale status cannot overwrite a colleague';
  update club_selection_private.fixtures f set details=jsonb_set(f.details,'{grade}','"1st Grade"') where id=current_id;
  assert public.club_selections_api(c,'context')->'conversations'='[]'::jsonb,'A changed grade hides the obsolete relationship without calculating';
  assert not has_table_privilege('authenticated','club_selection_private.dropped_player_reminders','SELECT'),'Private snapshots are not a public Data API';
  assert not has_function_privilege('authenticated','club_selection_private.capture_drop_reminders(uuid,uuid,uuid[])','EXECUTE');
  raise exception using errcode='P0298',message='Synthetic dropped-player checks passed';
 exception when sqlstate 'P0298' then raise notice 'Synthetic dropped-player checks passed; all test data rolled back';end;
end $tests$;
rollback;
