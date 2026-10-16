-- Synthetic club only; all users, selections and notification rows roll back.
do $tests$
declare c uuid:=gen_random_uuid();other_club uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();member_id uuid:=gen_random_uuid();
 fixtures uuid[]:=array(select gen_random_uuid() from generate_series(1,5));foreign_fixture uuid:=gen_random_uuid();
 players uuid[]:=array(select gen_random_uuid() from generate_series(1,45));
 match_day date:=(now() at time zone 'Australia/Sydney')::date+14;
 u uuid;d jsonb;draft_slots jsonb;source_slots jsonb;target_slots jsonb;third_slots jsonb;before_rows jsonb;req jsonb;res jsonb;notes jsonb;
 revisions jsonb;rejected boolean;request_count integer;size integer;
begin
 begin
  foreach u in array array[head_id,member_id] loop
   insert into auth.users(id,email) values(u,'board-move-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic selector '||u);
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic board moves','board-move-test-'||c,head_id),
   (other_club,'Synthetic other club','board-other-test-'||other_club,head_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement)
   values(c,head_id,'admin','admin',null),(c,member_id,'player','none','player'),(other_club,head_id,'admin','admin',null);
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',head_id);
  for i in 1..45 loop
   insert into club_selection_private.roster(id,club_id,name,batting,bowling,bowling_load,keeper,active)
    values(players[i],c,'Synthetic player '||i,'top','pace','frontline',true,true);
   insert into club_selection_private.availability(roster_id,available_dates)
    values(players[i],jsonb_build_array(match_day::text,(match_day+7)::text,(match_day+14)::text));
  end loop;
  for i in 1..3 loop
   d:=jsonb_build_object('grade','Grade '||i,'competition','Test','format','limited_overs','opposition','Synthetic opposition',
    'days',jsonb_build_array(jsonb_build_object('date',match_day::text)),'min_quicks',0,'min_batters',0,'brackets',false,'captain_id',head_id);
   select jsonb_agg(jsonb_build_object('d1',players[(i-1)*11+n],'d2',null) order by n) into draft_slots from generate_series(1,11) n;
   insert into club_selection_private.fixtures(id,club_id,details,slots) values(fixtures[i],c,d,draft_slots);
  end loop;
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(foreign_fixture,other_club,d,draft_slots);
  perform set_config('request.jwt.claim.sub',head_id::text,true);

  -- A full destination accepts a twelfth player; the source and target save together.
  select jsonb_set(f.slots,'{10,d1}','null') into source_slots from club_selection_private.fixtures f where id=fixtures[1];
  select f.slots||jsonb_build_array(jsonb_build_object('d1',players[11],'d2',null)) into target_slots from club_selection_private.fixtures f where id=fixtures[2];
  select jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'details',f.details,
   'slots',case when f.id=fixtures[1] then source_slots else target_slots end) order by f.id)) into req
   from club_selection_private.fixtures f where f.id=any(fixtures[1:2]);
  res:=public.club_selections_api(c,'save_board',req);
  assert res->>'saved'='true';
  assert (select f.slots->10->>'d1' is null from club_selection_private.fixtures f where f.id=fixtures[1]),'Source slot cleared';
  assert (select jsonb_array_length(f.slots)=12 and f.slots->11->>'d1'=players[11]::text from club_selection_private.fixtures f where f.id=fixtures[2]),'Full destination keeps the transferred player';
  notes:=club_selection_private.issues(fixtures[2]);
  assert exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='over_team' and n->>'level'='error' and n->>'count'='12'),'Overfull draft has a distinct blocking issue';
  assert exists(select 1 from jsonb_array_elements(club_selection_private.issues(fixtures[1])) n where n->>'code'='short_team' and n->>'level'='warning'),'Short draft still has a warning';
  select count(*) into request_count from club_selection_private.requests where club_id=c;
  assert public.club_selections_api(c,'save_board',req)=res,'Lost response reuses the atomic move receipt';
  assert (select count(*)=request_count from club_selection_private.requests where club_id=c),'Retry does not create another move';
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req||jsonb_build_object('different_payload',true));exception when raise_exception then rejected:=true;end;
  assert rejected,'Request ID cannot be reused for another payload';

  select jsonb_object_agg(id::text,revision) into revisions from club_selection_private.fixtures f where id=any(fixtures[1:3]);
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fixtures[2]),'revisions',revisions,'acknowledge_balance',true,'acknowledge_short',to_jsonb(fixtures));
  rejected:=false;begin perform public.club_selections_api(c,'send_review',req);exception when raise_exception then
   if sqlerrm not like 'Fit the team into 11%' then raise;end if;rejected:=true;end;
  assert rejected,'Overfull teams cannot be sent to captains';
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then
   if sqlerrm not like 'Fix selection or availability issues%' then raise;end if;rejected:=true;end;
  assert rejected,'Acknowledgements cannot bypass an overfull team';
  assert (select review is null and published is null from club_selection_private.fixtures f where f.id=fixtures[2]),'Rejected actions leave snapshots unchanged';

  -- A stale second fixture rolls back the first fixture as well.
  select jsonb_agg(to_jsonb(f) order by f.id) into before_rows from club_selection_private.fixtures f where f.id=any(fixtures[1:3]);
  select jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_agg(jsonb_build_object('id',f.id,
   'revision',case when f.id=fixtures[2] then f.revision-1 else f.revision end,'details',f.details,'slots',f.slots) order by array_position(fixtures,f.id))) into req
   from club_selection_private.fixtures f where f.id=any(fixtures[1:2]);
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
   if sqlerrm not like 'A team changed in another session%' then raise;end if;rejected:=true;end;
  assert rejected,'Stale target revision is rejected';
  assert (select jsonb_agg(to_jsonb(f) order by f.id)=before_rows from club_selection_private.fixtures f where f.id=any(fixtures[1:3])),'Stale move changes neither fixture';

  -- Complete a three-team chain in one request, with destination entries first.
  select jsonb_set(f.slots,'{10,d1}',to_jsonb(players[33]::text)) into source_slots from club_selection_private.fixtures f where id=fixtures[1];
  select jsonb_set(f.slots,'{10,d1}','null') into target_slots from club_selection_private.fixtures f where id=fixtures[2];
  select jsonb_set(f.slots,'{10,d1}',to_jsonb(players[22]::text)) into third_slots from club_selection_private.fixtures f where id=fixtures[3];
  select jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'details',f.details,
   'slots',case when f.id=fixtures[1] then source_slots when f.id=fixtures[2] then target_slots else third_slots end) order by array_position(array[fixtures[3],fixtures[1],fixtures[2]],f.id))) into req
   from club_selection_private.fixtures f where f.id=any(fixtures[1:3]);
  res:=public.club_selections_api(c,'save_board',req);
  assert res->>'saved'='true','Final-state duplicate check allows an atomic chain';
  assert (select f.slots->10->>'d1'=players[33]::text from club_selection_private.fixtures f where f.id=fixtures[1]);
  assert (select f.slots->11->>'d1'=players[11]::text from club_selection_private.fixtures f where f.id=fixtures[2]);
  assert (select f.slots->10->>'d1'=players[22]::text from club_selection_private.fixtures f where f.id=fixtures[3]);
  assert not exists(select 1 from unnest(fixtures[1:3]) f,jsonb_array_elements(club_selection_private.issues(f)) n where n->>'code' in ('short_team','over_team')),'Each team has eleven after the chain';

  assert exists(select 1 from jsonb_array_elements(club_selection_private.issues(fixtures[2])) n where n->>'code'='over_slots'),'A populated twelfth slot still needs arranging';
  select jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(f.id),'revisions',jsonb_build_object(f.id::text,f.revision)) into req from club_selection_private.fixtures f where id=fixtures[2];
  rejected:=false;begin perform public.club_selections_api(c,'send_review',req);exception when raise_exception then
   if sqlerrm not like 'Fit the team into 11%' then raise;end if;rejected:=true;end;assert rejected,'Eleven players spread across twelve rows cannot be shared';
  select jsonb_set(f.slots,'{10,d1}',to_jsonb(players[11]::text))-11 into draft_slots from club_selection_private.fixtures f where id=fixtures[2];
  select jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',f.id,'revision',f.revision,'details',f.details,'slots',draft_slots))) into req from club_selection_private.fixtures f where id=fixtures[2];
  res:=public.club_selections_api(c,'save_board',req);assert res->>'saved'='true','Selector can arrange the same eleven players into eleven rows';

  -- A one-sided transfer, foreign fixture and unassigned member remain forbidden.
  select jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',f.id,'revision',f.revision,'details',f.details,
   'slots',f.slots||jsonb_build_array(jsonb_build_object('d1',players[12],'d2',null))))) into req from club_selection_private.fixtures f where id=fixtures[1];
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
   if sqlerrm not like '%already selected%' then raise;end if;rejected:=true;end;assert rejected,'Duplicate player cannot be copied into another team';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',foreign_fixture,'revision',1,'details',d,'slots',draft_slots)));
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
   if sqlerrm not like 'Fixture belongs to another club%' then raise;end if;rejected:=true;end;assert rejected,'Cross-club movement is rejected';
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
   if sqlerrm not like 'Selector access required%' then raise;end if;rejected:=true;end;assert rejected,'Non-selector cannot move players';
  perform set_config('request.jwt.claim.sub',head_id::text,true);

  update club_selection_private.fixtures f set published=club_selection_private.draft_snapshot(id),publication=1 where id=fixtures[2];
  select jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'details',f.details,'slots',f.slots))) into req
   from club_selection_private.fixtures f where f.id=any(fixtures[1:2]);
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
   if sqlerrm not like 'Published team is locked%' then raise;end if;rejected:=true;end;assert rejected,'Published target cannot be changed without unlocking';
  update club_selection_private.fixtures f set published=null,publication=0 where id=fixtures[2];

  -- Draft capacity is bounded; existing player and availability validation remains.
  select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) into draft_slots from generate_series(1,100);
  d:=jsonb_build_object('grade','Spare grade','opposition','Synthetic opposition','days',jsonb_build_array(jsonb_build_object('date',(match_day+7)::text)),'min_quicks',0,'min_batters',0);
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fixtures[4],'revision',0,'details',d,'slots',draft_slots)));
  res:=public.club_selections_api(c,'save_board',req);assert res->>'saved'='true','Draft slots allow room for repeated moves';
  for size in select unnest(array[10,101]) loop
   select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) into draft_slots from generate_series(1,size);
   req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fixtures[4],'revision',1,'details',d,'slots',draft_slots)));
   rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
    if sqlerrm not like 'Draft teams need 11 to 100%' then raise;end if;rejected:=true;end;assert rejected,'Malformed draft size is rejected';
  end loop;
  update club_selection_private.availability set available_dates='[]' where roster_id=players[34];
  select jsonb_set(f.slots,'{0,d1}',to_jsonb(players[34]::text)) into draft_slots from club_selection_private.fixtures f where id=fixtures[4];
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fixtures[4],'revision',1,'details',d,'slots',draft_slots)));
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
   if sqlerrm not like 'Mark availability before selecting%' then raise;end if;rejected:=true;end;assert rejected,'Overflow does not bypass availability';
  update club_selection_private.roster set active=false where id=players[34];
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then
   if sqlerrm not like 'Choose an active player%' then raise;end if;rejected:=true;end;assert rejected,'Overflow does not bypass active-player validation';
  update club_selection_private.roster set active=true where id=players[34];
  update club_selection_private.availability set available_dates=jsonb_build_array((match_day+7)::text,(match_day+14)::text) where roster_id=players[34];

  -- Brackets are counted separately on each day, including extra rows.
  d:=jsonb_build_object('grade','Two-day grade','opposition','Synthetic opposition','days',jsonb_build_array(jsonb_build_object('date',(match_day+7)::text),jsonb_build_object('date',(match_day+14)::text)),
   'format','long_form','brackets',true,'min_quicks',0,'min_batters',0,'captain_id',head_id);
  select jsonb_agg(jsonb_build_object('d1',case when n<12 then players[33+n] end,'d2',players[33+n]) order by n) into draft_slots from generate_series(1,12) n;
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fixtures[5],'revision',0,'details',d,'slots',draft_slots)));
  res:=public.club_selections_api(c,'save_board',req);notes:=club_selection_private.issues(fixtures[5]);
  assert (select count(*)=1 from jsonb_array_elements(notes) n where n->>'code'='over_team' and n->>'day'='2'),'Only Day 2 is overfull';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fixtures[5]),'revisions',jsonb_build_object(fixtures[5]::text,1));
  rejected:=false;begin perform public.club_selections_api(c,'send_review',req);exception when raise_exception then
   if sqlerrm not like 'Fit the team into 11%' then raise;end if;rejected:=true;end;assert rejected,'Overfull Day 2 blocks captain review';

  draft_slots:=jsonb_set(jsonb_set(draft_slots,'{0,d1}','null'),'{11,d2}','null');
  draft_slots:=jsonb_set(draft_slots,'{11,d1}',to_jsonb(players[45]::text));
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fixtures[5],'revision',1,'details',d,'slots',draft_slots)));
  res:=public.club_selections_api(c,'save_board',req);notes:=club_selection_private.issues(fixtures[5]);
  assert not exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='over_team'),'Complementary brackets have eleven players per day';
  assert exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='over_slots'),'Twelve bracket rows still require explicit pairing';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fixtures[5]),'revisions',res->'revisions','acknowledge_balance',true);
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then
   if sqlerrm not like 'Fix selection or availability issues%' then raise;end if;rejected:=true;end;assert rejected,'Extra bracket rows cannot be published';

  -- Ten-player reviews and deliberately acknowledged short publication still work.
  select jsonb_set(f.slots,'{10,d1}','null') into draft_slots from club_selection_private.fixtures f where id=fixtures[1];
  select jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',f.id,'revision',f.revision,'details',f.details,'slots',draft_slots))) into req
   from club_selection_private.fixtures f where id=fixtures[1];
  res:=public.club_selections_api(c,'save_board',req);
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fixtures[1]),'revisions',res->'revisions');
  res:=public.club_selections_api(c,'send_review',req);assert res->>'sent'='true','Short team can be reviewed';
  req:=req||jsonb_build_object('request_id',gen_random_uuid(),'acknowledge_balance',true);
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then
   if sqlerrm not like 'Confirm publishing this team with vacant places%' then raise;end if;rejected:=true;end;assert rejected,'Short publication still requires acknowledgement';
  req:=req||jsonb_build_object('acknowledge_short',jsonb_build_array(fixtures[1]));
  res:=public.club_selections_api(c,'publish',req);assert res->>'published'='true','Acknowledged short team can publish';

  raise exception using errcode='P0197',message='Rollback synthetic board moves';
 exception when sqlstate 'P0197' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_club));
 assert not exists(select 1 from auth.users where id in(head_id,member_id));
end $tests$;
select 'Atomic moves, overflow drafts, revisions, duplicate guards, access, brackets and short-team workflow passed; synthetic data rolled back.' as result;
