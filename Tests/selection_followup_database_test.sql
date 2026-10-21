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
  slots:=jsonb_build_array(jsonb_build_object('d1',p1,'d2',null),jsonb_build_object('d1',p2,'d2',null))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,9));
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
  res:=public.club_selections_api(c,'context');res:=jsonb_set(res,'{conversations}',coalesce((select jsonb_agg(x) from jsonb_array_elements(res->'conversations') x where x->>'kind'='lower_grade'),'[]'::jsonb));assert jsonb_array_length(res->'conversations')=1,'Lower-grade move detected';move:=res->'conversations'->0;
  assert move->>'previous_grade'='1st Grade';assert move->>'grade'='2nd Grade';assert move->>'roster_id'=p1::text;
  assert not exists(select 1 from jsonb_array_elements(club_selection_private.issues(current_id)) x where x->>'level'='error'),'Short team is a warning, not a hard error';
  res:=public.club_selections_api(c,'send_review',jsonb_build_object('ids',jsonb_build_array(current_id),'revisions',jsonb_build_object(current_id::text,1),'request_id',gen_random_uuid()));assert (res->>'sent')::boolean,'Incomplete team sent to captain';
  assert (select jsonb_array_length(review->'slots')=11 from club_selection_private.fixtures where id=current_id),'Vacancies retained';
  foreach u in array array[coach_id,captain_id] loop
   perform set_config('request.jwt.claim.sub',u::text,true);res:=public.club_selections_api(c,'context');res:=jsonb_set(res,'{conversations}',coalesce((select jsonb_agg(x) from jsonb_array_elements(res->'conversations') x where x->>'kind'='lower_grade'),'[]'::jsonb));assert jsonb_array_length(res->'conversations')=1,'Coach and previous captain can see marker';
  end loop;
  foreach u in array array[player_id,wrong_captain] loop
   perform set_config('request.jwt.claim.sub',u::text,true);res:=public.club_selections_api(c,'context');res:=jsonb_set(res,'{conversations}',coalesce((select jsonb_agg(x) from jsonb_array_elements(res->'conversations') x where x->>'kind'='lower_grade'),'[]'::jsonb));assert res->'conversations'='[]','Player and captain from other competition cannot see marker';
   rejected:=false;begin perform public.club_selections_api(c,'conversation',move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',true));exception when raise_exception then rejected:=true;end;assert rejected,'Unauthorized marker rejected';
  end loop;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club access rejected';
  perform set_config('request.jwt.claim.sub',captain_id::text,true);
  req:=move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',true);
  res:=public.club_selections_api(c,'conversation',req);assert (res->>'spoken')::boolean;
  assert public.club_selections_api(c,'conversation',req)=res,'Retry idempotent';
  perform set_config('request.jwt.claim.sub',coach_id::text,true);
  res:=public.club_selections_api(c,'context');res:=jsonb_set(res,'{conversations}',coalesce((select jsonb_agg(x) from jsonb_array_elements(res->'conversations') x where x->>'kind'='lower_grade'),'[]'::jsonb));assert res->'conversations'->0->>'spoken_at' is not null,'Status shared';
  rejected:=false;begin perform public.club_selections_api(c,'conversation',move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',false));exception when raise_exception then rejected:=true;end;assert rejected,'Stale toggle cannot overwrite colleague';
  move:=res->'conversations'->0;perform public.club_selections_api(c,'conversation',move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',false));
  assert public.club_selections_api(c,'context')->'conversations'->0->>'spoken_at' is null,'Undo visible';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  req:=jsonb_build_object('ids',jsonb_build_array(current_id),'revisions',jsonb_build_object(current_id::text,1),'acknowledge_balance',true,'request_id',gen_random_uuid());
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Short publication needs deliberate confirmation';
  res:=public.club_selections_api(c,'publish',req||jsonb_build_object('acknowledge_short',jsonb_build_array(current_id)));assert (res->>'published')::boolean;
  assert (select selection_unlocked_until is null from club_selection_private.fixtures where id=current_id),'Publication locks team';
  select revision into rev from club_selection_private.fixtures where id=current_id;
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'fixture_lock',jsonb_build_object('id',current_id,'revision',rev,'unlock',true,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Regular selector cannot unlock published team';
  rejected:=false;begin perform public.club_selections_api(c,'save_board',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',current_id,'revision',rev,'details',details,'slots',slots)),'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Old clients cannot bypass lock';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  res:=public.club_selections_api(c,'fixture_lock',jsonb_build_object('id',current_id,'revision',rev,'unlock',true,'request_id',gen_random_uuid()));rev:=(res->>'revision')::integer;
  select count(*) into before_count from club_selection_private.notifications n join club_selection_private.fixtures f on f.id=n.fixture_id where f.id=current_id and n.kind='publication';
  slots:=jsonb_set(slots,'{0,d1}',to_jsonb(p2::text));
  res:=public.club_selections_api(c,'save_board',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',current_id,'revision',rev,'details',details,'slots',slots)),'request_id',gen_random_uuid()));rev:=(res->'revisions'->>current_id::text)::integer;
  assert (select published->'slots'->0->>'d1'=p1::text from club_selection_private.fixtures where id=current_id),'Draft does not silently change published team';
  assert (select count(*)=before_count from club_selection_private.notifications where fixture_id=current_id and kind='publication'),'Draft does not prematurely notify players';
  res:=public.club_selections_api(c,'publish',jsonb_build_object('ids',jsonb_build_array(current_id),'revisions',jsonb_build_object(current_id::text,rev),'acknowledge_balance',true,'acknowledge_short',jsonb_build_array(current_id),'request_id',gen_random_uuid()));
  foreach u in array array[player_id,captain_id] loop
   assert exists(select 1 from club_batting_private.club_message_recipients r join club_batting_private.club_messages cm on cm.id=r.message_id join club_selection_private.notifications n on n.message_id=cm.id
    where n.fixture_id=current_id and n.kind='publication' and cm.title='Teams updated' and r.user_id=u),'Added AND removed players notified';
  end loop;
  assert (select selection_unlocked_until is null from club_selection_private.fixtures where id=current_id),'Republishing locks again';
  assert club_selection_private.grade_level(c,'Competition A','Dev League Navy') is null,'Named parallel grades are not guessed';
  assert club_selection_private.grade_level(c,'Competition A','4th Grade')=4;
  update club_selection_private.access set grade_levels='[{"competition":"Competition A","grade":"Dev League Navy","level":5},{"competition":"Competition A","grade":"Dev League Sky","level":5}]' where club_id=c;
  assert club_selection_private.grade_level(c,'Competition A','Dev League Navy')=club_selection_private.grade_level(c,'Competition A','Dev League Sky'),'Equal grades supported';
  assert not has_table_privilege('authenticated','club_selection_private.player_conversations','SELECT,INSERT,UPDATE,DELETE');
  assert not has_function_privilege('authenticated','club_selection_private.lower_grade_moves(uuid)','EXECUTE');
  raise exception using errcode='P0170',message='Rollback follow-up tests';
 exception when sqlstate 'P0170' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_c));
end $tests$;
select 'Selection follow-up tests passed; all synthetic data rolled back.' as result;
rollback;
