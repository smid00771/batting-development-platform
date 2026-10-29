-- Exercise grade-drop follow-ups only; left-out records are a separate workflow.
-- Synthetic users and fixtures only; every inserted row is rolled back.
begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();
 coach_id uuid:=gen_random_uuid();captain_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();outsider_id uuid:=gen_random_uuid();wrong_captain uuid:=gen_random_uuid();u uuid;
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();p3 uuid:=gen_random_uuid();previous_id uuid:=gen_random_uuid();current_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();
 day date:=(date_trunc('week',current_date)+interval '19 days')::date;details jsonb;slots jsonb;res jsonb;move jsonb;req jsonb;before_count integer;rev integer;rejected boolean;
 mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();source1 uuid:=gen_random_uuid();source2 uuid:=gen_random_uuid();old_id uuid:=gen_random_uuid();card jsonb;variant jsonb;
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

  -- The older published team includes the returning player, but the latest
  -- actual team did not. Publication must not choose which round is compared.
  insert into club_selection_private.fixtures(id,club_id,details,slots,published)
   select old_id,c,jsonb_set(f.details,'{days}',jsonb_build_array(jsonb_build_object('date',(day-14)::text))),f.slots,
    jsonb_set(f.published,'{details,days}',jsonb_build_array(jsonb_build_object('date',(day-14)::text)))
   from club_selection_private.fixtures f where id=previous_id;
  update club_selection_private.fixtures set published=null,publication=0 where id=previous_id;
  card:=jsonb_build_object('provider','playhq_au','status','completed','match_id',mid,'format_key','limited_overs','dates',jsonb_build_array((day-7)::text),
   'teams',jsonb_build_array(jsonb_build_object('id',tid,'lineup_available',true,'players',jsonb_build_array(
    jsonb_build_object('player_id',source1,'name','Synthetic dropped player'),jsonb_build_object('player_id',source2,'name','Synthetic previous captain'),
    jsonb_build_object('player_id',gen_random_uuid(),'name','Synthetic current captain')))));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,head_id,card);
  insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(previous_id,c,mid,tid,head_id);
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source1,p1,head_id),(c,source2,p2,head_id);
  assert (select count(*)=1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Actual unpublished lineup finds the drop; an older player and a same-name unlinked identity are not matches';
  assert exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id and roster_id=p1 and previous_fixture_id=previous_id);
  assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id and roster_id=p3),'Do not fall back per player to the older team';
  -- Publishing the stale draft cannot replace the saved actual lineup.
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id) where id=previous_id;
  assert (select count(*)=1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Actual lineup wins over a published selection';
  update club_selection_private.fixtures set published=null where id=previous_id;
  for variant in select value from jsonb_array_elements(jsonb_build_array(
   jsonb_set(card,'{status}','"in_progress"'),jsonb_set(card,'{format_key}','"t20"'),
   jsonb_set(card,'{dates}',jsonb_build_array((day-8)::text)),jsonb_set(card,'{teams,0,id}',to_jsonb(gen_random_uuid())),
   jsonb_set(card,'{teams,0,lineup_available}','false'),jsonb_set(card,'{match_id}',to_jsonb(gen_random_uuid()))
  )) loop
   update public.match_review_scorecards set scorecard=variant where id=sid;
   assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Invalid/missing latest evidence never falls back to the older published week';
  end loop;
  update public.match_review_scorecards set scorecard=card where id=sid;
  insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard,created_at) values(c,mid,head_id,jsonb_set(card,'{teams,0,players}','[]'),now()+interval '1 second');
  assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Latest correction supersedes older scorecard';
  delete from public.match_review_scorecards where club_id=c and id<>sid;
  update club_selection_private.fixtures f set details=jsonb_set(f.details,'{season}','"Other season"') where id=current_id;
  assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Seasons remain isolated';
  update club_selection_private.fixtures f set details=f.details-'season' where id=current_id;
  assert public.club_selections_api(c,'context')->'conversations'='[]'::jsonb,'Evidence is not calculated on board open';
  res:=public.club_selections_api(c,'show_dropped',jsonb_build_object('ids',jsonb_build_array(current_id),'request_id',gen_random_uuid()));
  assert (res->>'count')::int=1,'Explicit request captures only the actual drop';
  move:=(public.club_selections_api(c,'context')->'conversations')->0;
  assert move->>'previous_date'=(day-7)::text,'Previous match date accompanies the saved marker';
  assert move->>'roster_id'=p1::text;
  -- Quiet reads and marking do not revisit the scorecards or history.
  execute $guard$create or replace function club_selection_private.drop_prior_lineups(c uuid)
   returns table(fixture_id uuid,details jsonb,slots jsonb,ends date,lineup_source text)
   language plpgsql stable set search_path='' as $n$begin raise exception 'Unexpected source scan';end$n$$guard$;
  assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=1;
  perform set_config('request.jwt.claim.sub',captain_id::text,true);
  assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=1,'Unpublished prior captain retains access';
  res:=public.club_selections_api(c,'conversation',move||jsonb_build_object('spoken',true,'request_id',gen_random_uuid()));
  assert (res->>'spoken')::boolean,'Previous captain can complete the saved reminder without rescanning';
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  assert public.club_selections_api(c,'context')->'conversations'='[]'::jsonb,'Shared completion removes the highlight';
  assert not has_function_privilege('authenticated','club_selection_private.drop_prior_lineups(uuid)','EXECUTE');
  assert not has_function_privilege('anon','club_selection_private.drop_prior_lineups(uuid)','EXECUTE');
  raise exception using errcode='P0299',message='Actual previous-lineup checks passed';
 exception when sqlstate 'P0299' then raise notice 'Actual previous-lineup checks passed; synthetic records rolled back';end;
end $tests$;
rollback;
