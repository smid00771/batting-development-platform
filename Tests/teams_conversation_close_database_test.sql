-- All synthetic data, including test message/notification records, is rolled back.
do $tests$
declare c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();outsider_id uuid:=gen_random_uuid();
 roster_id uuid:=gen_random_uuid();past_id uuid:=gen_random_uuid();current_id uuid:=gen_random_uuid();two_id uuid:=gen_random_uuid();ended_two_id uuid:=gen_random_uuid();u uuid;fid uuid;
 today date:=(clock_timestamp() at time zone 'Australia/Sydney')::date;details jsonb;slots jsonb;res jsonb;req jsonb;row jsonb;rejected boolean;before_count int;before_messages int;
 first_match uuid:=gen_random_uuid();second_match uuid:=gen_random_uuid();lower_one uuid:=gen_random_uuid();lower_two uuid:=gen_random_uuid();team_id uuid:=gen_random_uuid();card jsonb;cards jsonb;
begin
 assert not club_selection_private.fixture_completed('{"days":[{"date":"2026-10-17"}]}','Australia/Sydney','2026-10-17 12:59:59+00');
 assert club_selection_private.fixture_completed('{"days":[{"date":"2026-10-17"}]}','Australia/Sydney','2026-10-17 13:00:00+00');
 assert not club_selection_private.fixture_completed('{"days":[{"date":"2026-10-17"},{"date":"2026-10-10"}]}','Australia/Sydney','2026-10-15 13:00:00+00');
 assert not club_selection_private.fixture_completed('{"days":[{"date":"2026-11-01"}]}','America/New_York','2026-11-02 04:59:59+00');
 assert club_selection_private.fixture_completed('{"days":[{"date":"2026-11-01"}]}','America/New_York','2026-11-02 05:00:00+00');
 begin
  foreach u in array array[head_id,player_id,outsider_id] loop
   insert into auth.users(id,email) values(u,'conversation-close-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic user');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Conversation closure test','conversation-close-'||c,head_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values
   (c,head_id,'player','admin','player'),(c,player_id,'player','none','player'),(c,outsider_id,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',head_id,'Australia/Sydney');
  insert into club_selection_private.roster(id,club_id,name,user_id,batting,bowling,bowling_load,keeper) values(roster_id,c,'Synthetic player',player_id,'top','none','unknown',false);
  slots:=jsonb_build_array(jsonb_build_object('d1',roster_id,'d2',roster_id))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,10));
  foreach fid in array array[past_id,current_id,two_id,ended_two_id] loop
   details:=jsonb_build_object('grade','1st Grade','competition','Synthetic competition','format','long_form','opposition','Synthetic opponent','ground','Synthetic ground','meeting','','staff','[]'::jsonb,'brackets',true,'min_quicks',0,'min_batters',0,'days',
    case when fid=past_id then jsonb_build_array(jsonb_build_object('date',(today-1)::text))
         when fid=current_id then jsonb_build_array(jsonb_build_object('date',today::text))
         when fid=two_id then jsonb_build_array(jsonb_build_object('date',(today-7)::text),jsonb_build_object('date',today::text))
         else jsonb_build_array(jsonb_build_object('date',(today-8)::text),jsonb_build_object('date',(today-1)::text)) end);
   insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,details,slots);
   update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=fid;
  end loop;
  insert into club_selection_private.posts(fixture_id,author_id,author_name,body) values(past_id,player_id,'Synthetic player','Historical message');
  -- Unlocking/editing a draft does not reopen the published match conversation.
  update club_selection_private.fixtures f set details=jsonb_set(f.details,'{days}',jsonb_build_array(jsonb_build_object('date',(today+7)::text))),selection_unlocked_until=clock_timestamp()+interval '1 hour' where id=past_id;
  foreach u in array array[head_id,player_id] loop
   perform set_config('request.jwt.claim.sub',u::text,true);
   res:=public.club_selections_api(c,'context');
   select value into row from jsonb_array_elements(res->'fixtures') where value->>'id'=past_id::text;
   assert (row->>'can_chat')::boolean and (row->>'chat_closed')::boolean,'Past conversation remains accessible but closed';
   select value into row from jsonb_array_elements(res->'fixtures') where value->>'id'=two_id::text;
   assert not (row->>'chat_closed')::boolean,'Two-day conversation stays open through final day';
   assert jsonb_array_length(public.club_selections_api(c,'posts',jsonb_build_object('id',past_id)))=1,'History remains readable';
   foreach fid in array array[past_id,ended_two_id] loop
    select count(*) into before_count from club_selection_private.posts where fixture_id=fid;
    select count(*) into before_messages from club_batting_private.club_messages where club_id=c;
    rejected:=false;
    begin
     perform public.club_selections_api(c,'post',jsonb_build_object('id',fid,'body','Must not be sent','request_id',gen_random_uuid()));
    exception when raise_exception then rejected:=sqlerrm like 'This match conversation is closed.%';end;
    assert rejected,'Closed match rejects new posts for selected player and Head/Admin';
    assert (select count(*)=before_count from club_selection_private.posts where fixture_id=fid),'No post written';
    assert (select count(*)=before_messages from club_batting_private.club_messages where club_id=c),'No notification created';
   end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',player_id::text,true);
  foreach fid in array array[current_id,two_id] loop
   req:=jsonb_build_object('id',fid,'body','Final-day message','request_id',gen_random_uuid());
   res:=public.club_selections_api(c,'post',req);assert res->>'id' is not null,'Still open on final day';
   assert public.club_selections_api(c,'post',req)=res,'Confirmed retry remains idempotent';
   assert (select count(*)=1 from club_selection_private.posts where fixture_id=fid),'Exactly one message';
  end loop;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);rejected:=false;
  begin perform public.club_selections_api(c,'posts',jsonb_build_object('id',past_id));exception when raise_exception then rejected:=true;end;
  assert rejected,'Closed history retains audience restrictions';
  -- Mixed grades: one-day results are ready in week one; two-day results belong to week two.
  foreach fid in array array[first_match,second_match,lower_one,lower_two] loop
   card:=jsonb_build_object('schema_version',2,'match_id',fid,'grade',case when fid=first_match then '1st Grade' when fid=second_match then '2nd Grade' else '3rd Grade' end,
    'status',case when fid in (first_match,second_match) then 'in_progress' else 'completed' end,
    'dates',case when fid in (first_match,second_match) then '["2026-10-10","2026-10-17"]'::jsonb when fid=lower_one then '["2026-10-10"]'::jsonb else '["2026-10-17"]'::jsonb end,
    'teams',jsonb_build_array(jsonb_build_object('id',team_id,'name','Conversation closure test')),'innings','[]'::jsonb,'result','Synthetic result');
   insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,fid,head_id,card);
  end loop;
  cards:=club_selection_private.team_week_cards(c,'2026-10-05','2026-10-11');
  res:=club_selection_private.social_award_candidates(cards);
  assert jsonb_array_length(res)=1 and res->0->>'match_id'=lower_one::text,'Week one has only its completed lower-grade result';
  cards:=club_selection_private.team_week_cards(c,'2026-10-12','2026-10-18');
  assert jsonb_array_length(cards)=3,'Second week includes continuing higher grades and the new lower-grade fixture';
  res:=club_selection_private.social_award_candidates(cards);
  assert jsonb_array_length(res)=1 and res->0->>'match_id'=lower_two::text,'Lower grade can prepare results while two-day matches remain unfinished';
  update public.match_review_scorecards set scorecard=jsonb_set(scorecard,'{status}','"completed"'::jsonb) where club_id=c and source_match_id in (first_match,second_match);
  res:=club_selection_private.social_award_candidates(club_selection_private.team_week_cards(c,'2026-10-12','2026-10-18'));
  assert jsonb_array_length(res)=3,'Completed higher-grade results join the second week independently';
  res:=club_selection_private.social_award_candidates(club_selection_private.team_week_cards(c,'2026-10-05','2026-10-11'));
  assert jsonb_array_length(res)=1 and res->0->>'match_id'=lower_one::text,'Completed two-day results do not move into their first week';
  raise exception using errcode='P0190',message='Rollback synthetic conversation tests';
 exception when sqlstate 'P0190' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic data removed';
end $tests$;
select 'Match conversation closure and mixed-grade results tests passed; synthetic records rolled back.' as result;
