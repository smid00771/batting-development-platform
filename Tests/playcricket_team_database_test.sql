-- Real functions, synthetic club, full rollback. No notifications are sent.
do $tests$
#variable_conflict use_column
declare c uuid:=gen_random_uuid();foreign_club uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();member_id uuid:=gen_random_uuid();
 fixture_ids uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 players uuid[]:=array(select gen_random_uuid() from generate_series(1,45));
 snapshots uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 matches uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 teams uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 day date:='2026-10-10';d jsonb;slots jsonb;listed jsonb;mapping jsonb;card jsonb;req jsonb;plan jsonb;result jsonb;saved jsonb;before_rows jsonb;bad boolean;u uuid;new_id uuid:=gen_random_uuid();
begin
 begin
  foreach u in array array[staff,member_id] loop
   insert into auth.users(id,email) values(u,'scorecard-team-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic scorecard user');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic scorecard club','scorecard-team-test-'||c,staff),(foreign_club,'Other synthetic club','scorecard-other-'||foreign_club,staff);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,staff,'admin','admin',null),(c,member_id,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',staff);
  for i in 1..45 loop
   insert into club_selection_private.roster(id,club_id,external_id,name,batting,bowling,bowling_load,keeper) values(players[i],c,players[i]::text,'Player '||i,'top','pace','frontline',true);
  end loop;
  for i in 1..3 loop
   d:=jsonb_build_object('grade','Grade '||i,'competition','Test','format','limited_overs','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date',day::text)),'brackets',false);
   select jsonb_agg(jsonb_build_object('d1',players[(i-1)*11+n],'d2',null) order by n) into slots from generate_series(1,11) n;
   insert into club_selection_private.fixtures(id,club_id,details,slots,publication,published_at) values(fixture_ids[i],c,d,slots,1,now());
   update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(fixture_ids[i]) where id=fixture_ids[i];
   insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) select id,1,published,staff from club_selection_private.fixtures where id=fixture_ids[i];
  end loop;
  update club_selection_private.fixtures set details=details||'{"meeting":"Unpublished setup edit"}'::jsonb where id=fixture_ids[1];
  perform set_config('request.jwt.claim.sub',staff::text,true);
  -- Source A: first ten players plus Player 12, selected in the published Grade 2.
  select jsonb_agg(jsonb_build_object('player_id',players[n],'name','Player '||n) order by n),jsonb_agg(jsonb_build_object('source_id',players[n],'roster_id',players[n],'days',jsonb_build_array(day::text)) order by n) into listed,mapping from unnest(array[1,2,3,4,5,6,7,8,9,10,12]) n;
  card:=jsonb_build_object('provider','playcricket_au','schema_version',2,'match_id',matches[1],'status','completed','dates',jsonb_build_array(day::text),'format_key','limited_overs','url','https://play.cricket.com.au/match/'||matches[1],'grade','Grade 1','teams',jsonb_build_array(jsonb_build_object('id',teams[1],'name','Synthetic scorecard club','lineup_available',true,'players',listed)),'innings','[]'::jsonb);
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(snapshots[1],c,matches[1],staff,card);
  result:=public.playcricket_team_api(c,'context',jsonb_build_object('snapshot_id',snapshots[1]));assert jsonb_array_length(result->'fixtures')=3,'Context returns matching fixtures';
  req:=jsonb_build_object('snapshot_id',snapshots[1],'team_id',teams[1],'fixture_id',fixture_ids[1],'mapping',mapping);
  plan:=public.playcricket_team_api(c,'preview',req);
  assert plan->>'changed'='true' and jsonb_array_length(plan->'fixtures')=2,'Preview lists target and displaced team';
  assert plan->'fixtures'->0->'added' ? 'Player 12' and plan->'fixtures'->0->'removed' ? 'Player 11','Preview identifies incoming and outgoing names';
  assert (select slots->10->>'d1'=players[11]::text from club_selection_private.fixtures where id=fixture_ids[1]),'Preview never changes selections';
  -- Stale edits are rejected atomically, including changes to the other team.
  update club_selection_private.fixtures set revision=revision+1 where id=fixture_ids[2];
  bad:=false;begin perform public.playcricket_team_api(c,'apply',req||jsonb_build_object('expected',plan->>'expected','request_id',gen_random_uuid()));exception when raise_exception then bad:=sqlerrm like 'A team or player match changed%';end;assert bad,'Reject a stale displaced-team revision';
  plan:=public.playcricket_team_api(c,'preview',req);
  req:=req||jsonb_build_object('expected',plan->>'expected','request_id',gen_random_uuid());
  result:=public.playcricket_team_api(c,'apply',req);assert result->>'saved'='true','Historical published team can be corrected without unlocking or availability';
  assert (select slots->10->>'d1'=players[12]::text and published->'slots'->10->>'d1'=players[12]::text from club_selection_private.fixtures where id=fixture_ids[1]);
  assert (select details->>'meeting'='Unpublished setup edit' and published->'details'->>'meeting' is null from club_selection_private.fixtures where id=fixture_ids[1]),'Correcting players does not publish unrelated fixture edits';
  assert (select slots->0->>'d1' is null and published->'slots'->0->>'d1' is null and jsonb_array_length(scorecard_sync->'pending')=1 from club_selection_private.fixtures where id=fixture_ids[2]),'Both selected and published lists show the gap';
  assert (select snapshot->'slots'->10->>'d1'=players[11]::text from club_selection_private.publications where fixture_id=fixture_ids[1] and version=1),'Original published selection remains in history';
  assert public.playcricket_team_api(c,'apply',req)=result,'Retry returns the original receipt';
  assert (select count(*)=2 from club_selection_private.publications where fixture_id=fixture_ids[1]),'Retry creates no duplicate correction';
  -- Next scorecard fills Grade 2 and creates the next gap in Grade 3.
  select jsonb_agg(jsonb_build_object('player_id',players[n],'name','Player '||n) order by n),jsonb_agg(jsonb_build_object('source_id',players[n],'roster_id',players[n],'days',jsonb_build_array(day::text)) order by n) into listed,mapping from generate_series(13,23) n;
  card:=card||jsonb_build_object('match_id',matches[2],'url','https://play.cricket.com.au/match/'||matches[2],'grade','Grade 2','teams',jsonb_build_array(jsonb_build_object('id',teams[2],'lineup_available',true,'players',listed)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(snapshots[2],c,matches[2],staff,card);
  req:=jsonb_build_object('snapshot_id',snapshots[2],'team_id',teams[2],'fixture_id',fixture_ids[2],'mapping',mapping);
  plan:=public.playcricket_team_api(c,'preview',req);result:=public.playcricket_team_api(c,'apply',req||jsonb_build_object('expected',plan->>'expected','request_id',gen_random_uuid()));
  assert (select jsonb_array_length(scorecard_sync->'pending')=0 and (select count(*) from jsonb_array_elements(slots) s where s->>'d1' is not null)=11 from club_selection_private.fixtures where id=fixture_ids[2]),'Next official team fills and clears its gap';
  assert (select jsonb_array_length(scorecard_sync->'pending')=1 from club_selection_private.fixtures where id=fixture_ids[3]);
  -- Unknown replacement may be added, retaining source ID without inventing an account.
  select jsonb_agg(jsonb_build_object('player_id',players[n],'name','Player '||n) order by n),jsonb_agg(jsonb_build_object('source_id',players[n],'roster_id',players[n],'days',jsonb_build_array(day::text)) order by n) into listed,mapping from generate_series(24,33) n;
  listed:=listed||jsonb_build_array(jsonb_build_object('player_id',new_id,'name','Late replacement'));
  mapping:=mapping||jsonb_build_array(jsonb_build_object('source_id',new_id,'roster_id','new','days',jsonb_build_array(day::text)));
  card:=card||jsonb_build_object('match_id',matches[3],'teams',jsonb_build_array(jsonb_build_object('id',teams[3],'lineup_available',true,'players',listed)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(snapshots[3],c,matches[3],staff,card);
  req:=jsonb_build_object('snapshot_id',snapshots[3],'team_id',teams[3],'fixture_id',fixture_ids[3],'mapping',mapping);plan:=public.playcricket_team_api(c,'preview',req);
  result:=public.playcricket_team_api(c,'apply',req||jsonb_build_object('expected',plan->>'expected','request_id',gen_random_uuid()));
  assert exists(select 1 from club_selection_private.roster where club_id=c and external_id=new_id::text and user_id is null),'New official player has no invented account';
  assert not exists(select 1 from club_selection_private.fixtures where id=any(fixture_ids[1:3]) and jsonb_array_length(scorecard_sync->'pending')>0),'Three-team chain finishes without unresolved gaps';
  -- Completed source on another team cannot silently override an already confirmed fact.
  card:=jsonb_set(card,'{teams,0,players}',jsonb_build_array(jsonb_build_object('player_id',players[12],'name','Player 12')));
  card:=card||jsonb_build_object('match_id',matches[4]);insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(snapshots[4],c,matches[4],staff,card);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fixture_ids[6],c,d||'{"grade":"Additional team"}',(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,11)));
  bad:=false;begin perform public.playcricket_team_api(c,'preview',jsonb_build_object('snapshot_id',snapshots[4],'team_id',teams[3],'fixture_id',fixture_ids[6],'mapping',jsonb_build_array(jsonb_build_object('source_id',players[12],'roster_id',players[12],'days',jsonb_build_array(day::text)))));exception when raise_exception then bad:=sqlerrm like '%also confirmed from PlayCricket%';end;assert bad,'Contradictory official teams need a corrected scorecard';
  -- A foreign snapshot, ordinary member, missing identities and wrong dates are all rejected.
  bad:=false;begin perform public.playcricket_team_api(foreign_club,'context',jsonb_build_object('snapshot_id',snapshots[1]));exception when raise_exception then bad:=true;end;assert bad;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  bad:=false;begin perform public.playcricket_team_api(c,'context',jsonb_build_object('snapshot_id',snapshots[1]));exception when raise_exception then bad:=sqlerrm like 'Coaching, selection%';end;assert bad;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  bad:=false;begin perform public.playcricket_team_api(c,'preview',req||jsonb_build_object('mapping','[]'::jsonb));exception when raise_exception then bad:=true;end;assert bad;
  -- Bracketed match: remove the replacement only on their actual playing date.
  d:=d||jsonb_build_object('format','long_form','brackets',true,'days',jsonb_build_array(jsonb_build_object('date','2026-10-24'),jsonb_build_object('date','2026-10-31')));
  select jsonb_agg(jsonb_build_object('d1',players[33+n],'d2',players[33+n])) into slots from generate_series(1,11) n;
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fixture_ids[4],c,d,slots);
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fixture_ids[5],c,d||'{"grade":"Other bracket","brackets":false}',jsonb_build_array(jsonb_build_object('d1',players[45],'d2',players[45]))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,10)));
  listed:=jsonb_build_array(jsonb_build_object('player_id',players[34],'name','Player 34'),jsonb_build_object('player_id',players[45],'name','Player 45'));
  mapping:=jsonb_build_array(jsonb_build_object('source_id',players[34],'roster_id',players[34],'days',jsonb_build_array('2026-10-24')),jsonb_build_object('source_id',players[45],'roster_id',players[45],'days',jsonb_build_array('2026-10-31')));
  card:=card||jsonb_build_object('match_id',matches[5],'format_key','long_form','dates',jsonb_build_array('2026-10-24','2026-10-31'),'teams',jsonb_build_array(jsonb_build_object('id',teams[5],'lineup_available',true,'players',listed)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(snapshots[5],c,matches[5],staff,card);
  req:=jsonb_build_object('snapshot_id',snapshots[5],'team_id',teams[5],'fixture_id',fixture_ids[4],'mapping',mapping);plan:=public.playcricket_team_api(c,'preview',req);
  result:=public.playcricket_team_api(c,'apply',req||jsonb_build_object('expected',plan->>'expected','request_id',gen_random_uuid()));
  assert (select slots->0->>'d1'=players[45]::text and slots->0->>'d2' is null and details->>'brackets'='true' from club_selection_private.fixtures where id=fixture_ids[5]),'Only overlapping day is cleared; other day remains selected';
  -- Incomplete source team is never interpreted as a shorter actual team.
  card:=jsonb_set(card,'{teams,0,lineup_available}','false');card:=card||jsonb_build_object('match_id',matches[6]);
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(snapshots[6],c,matches[6],staff,card);
  bad:=false;begin perform public.playcricket_team_api(c,'preview',req||jsonb_build_object('snapshot_id',snapshots[6]));exception when raise_exception then bad:=sqlerrm like 'Refresh the scorecard%';end;assert bad;
  raise exception using errcode='P0198',message='Rollback synthetic scorecard teams';
 exception when sqlstate 'P0198' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,foreign_club));
 assert not exists(select 1 from auth.users where id in(staff,member_id));
end $tests$;
select 'Published-team correction, three-team chain, gaps, history, retry, stale revisions, new players, permissions and bracketed dates passed; synthetic data rolled back.' as result;
