begin;

do $tests$
declare
 c uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();
 morning_id uuid:=gen_random_uuid();afternoon_id uuid:=gen_random_uuid();overlap_id uuid:=gen_random_uuid();
 match_day date:=(now() at time zone 'Australia/Sydney')::date+14;
 base_details jsonb;morning_details jsonb;afternoon_details jsonb;overlap_details jsonb;blank_slots jsonb;selected_slots jsonb;
 req jsonb;res jsonb;rejected boolean;message text;
begin
 assert not club_selection_private.fixture_day_conflict(
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','10:00'),
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','14:00')),
  '10:00 and 14:00 T20 fixtures do not overlap';
 assert club_selection_private.fixture_day_conflict(
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','10:00'),
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','12:59')),
  'A T20 starting before the inferred 13:00 finish overlaps';
 assert not club_selection_private.fixture_day_conflict(
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','09:00'),
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','12:00')),
  '09:00 and 12:00 T20 fixtures do not overlap';
 assert not club_selection_private.fixture_day_conflict(
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','12:00'),
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','15:00')),
  '12:00 and 15:00 T20 fixtures do not overlap';
 assert club_selection_private.fixture_day_conflict(
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text,'start','10:00'),
  jsonb_build_object('format','t20'),jsonb_build_object('date',match_day::text)),
  'A missing start time stays a conservative conflict';

 insert into auth.users(id,email) values(selector_id,'same-day-games-'||selector_id||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(selector_id,'Synthetic same-day selector');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic same-day games','same-day-games-'||c,selector_id);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,selector_id,'admin','admin',null);
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',selector_id);
 insert into club_selection_private.roster(id,club_id,name,batting,bowling,bowling_load,keeper,active)
  values(player_id,c,'Synthetic double-header player','middle','pace','frontline',false,true);
 insert into club_selection_private.availability(roster_id,available_dates) values(player_id,jsonb_build_array(match_day::text));
 select jsonb_agg(jsonb_build_object('d1',null,'d2',null) order by n) into blank_slots from generate_series(1,11) n;
 selected_slots:=jsonb_set(blank_slots,'{0,d1}',to_jsonb(player_id::text));
 base_details:=jsonb_build_object('competition','SG Moore Cup','format','t20','opposition','Synthetic opposition','ground','Synthetic oval',
  'days',jsonb_build_array(jsonb_build_object('date',match_day::text)),'brackets',false,'min_quicks',0,'min_batters',0,
  'staff','[]'::jsonb,'meeting','','cancelled',false,'captain_id',selector_id);
 morning_details:=jsonb_set(base_details||jsonb_build_object('grade','Cup morning'),'{days,0,start}',to_jsonb('10:00'::text));
 afternoon_details:=jsonb_set(base_details||jsonb_build_object('grade','Cup afternoon'),'{days,0,start}',to_jsonb('14:00'::text));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values
  (morning_id,c,morning_details,selected_slots),(afternoon_id,c,afternoon_details,blank_slots),(overlap_id,c,base_details||jsonb_build_object('grade','Cup overlap'),blank_slots);
 perform set_config('request.jwt.claim.sub',selector_id::text,true);

 req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object(
  'id',afternoon_id,'revision',1,'details',afternoon_details,'slots',selected_slots)));
 res:=public.club_selections_api(c,'save_board',req);
 assert res->>'saved'='true','The same player can be saved in the 10:00 and 14:00 T20s';

 overlap_details:=jsonb_set(base_details||jsonb_build_object('grade','Cup overlap'),'{days,0,start}',to_jsonb('12:59'::text));
 req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object(
  'id',overlap_id,'revision',1,'details',overlap_details,'slots',selected_slots)));
 rejected:=false;message:='';
 begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then rejected:=true;message:=sqlerrm;end;
 assert rejected and message like '%overlapping games%' and message like '% at %','An overlapping game is blocked with fixture times in the message';
 assert (select slots=blank_slots from club_selection_private.fixtures where id=overlap_id),'Rejected overlap rolls back the fixture update';

 req:=jsonb_set(req,'{request_id}',to_jsonb(gen_random_uuid()::text));
 req:=jsonb_set(req,'{fixtures,0,details}',base_details||jsonb_build_object('grade','Cup time unknown'));
 rejected:=false;
 begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then rejected:=sqlerrm like '%time not set%';end;
 assert rejected,'A same-date selection with no reliable time remains blocked and explains the missing time';

 select jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(morning_id),'revisions',jsonb_build_object(morning_id::text,revision),
  'acknowledge_short',jsonb_build_array(morning_id),'acknowledge_balance',true) into req from club_selection_private.fixtures where id=morning_id;
 res:=public.club_selections_api(c,'publish',req);assert res->>'published'='true','Morning team publishes';
 select jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(afternoon_id),'revisions',jsonb_build_object(afternoon_id::text,revision),
  'acknowledge_short',jsonb_build_array(afternoon_id),'acknowledge_balance',true) into req from club_selection_private.fixtures where id=afternoon_id;
 res:=public.club_selections_api(c,'publish',req);assert res->>'published'='true','Afternoon team publishes despite the same player appearing in the earlier published T20';
end $tests$;

rollback;
select 'Same-day non-overlapping selection, conservative missing-time handling, rollback and publication passed.' result;
