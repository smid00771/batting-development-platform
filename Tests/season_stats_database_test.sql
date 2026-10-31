-- Synthetic club data only. The nested exception rolls every fixture and account back.
do $test$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();sel uuid:=gen_random_uuid();cap uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();u uuid;
 f uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();new_sid uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();our uuid:=gen_random_uuid();them uuid:=gen_random_uuid();
 source1 uuid:=gen_random_uuid();source2 uuid:=gen_random_uuid();source3 uuid:=gen_random_uuid();r1 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();r3 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();
 card jsonb;res jsonb;denied boolean;today date:=(now() at time zone 'Australia/Sydney')::date;season_start date;season_end date;played date;yr integer;
begin
 begin
  foreach u in array array[adm,sel,cap,ordinary] loop
   insert into auth.users(id,email) values(u,'season-stats-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic stats tester');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Season Stats Test Club','stats-'||c,adm),(other_c,'Other Stats Club','stats-other-'||other_c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,sel,'player','none'),(c,cap,'player','captain'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',sel);
  perform set_config('request.jwt.claim.sub',adm::text,true);
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');
  yr:=extract(year from today)::int-case when extract(month from today)<7 then 1 else 0 end;
  season_start:=make_date(yr,7,1);season_end:=make_date(yr+1,6,30);played:=season_start+7;
  assert res#>>'{season,start}'=season_start::text and res#>>'{season,end}'=season_end::text,'Australian default is July-June';
  assert res#>>'{season,revision}'='0' and res->>'can_set_season'='true','Unsaved defaults do not create settings';
  assert jsonb_array_length(res->'cards')=0 and jsonb_array_length(res->'fixtures')=0,'Empty season works';
  assert not exists(select 1 from club_selection_private.season_stats_settings where club_id=c),'Read does not write';

  insert into club_selection_private.fixtures(id,club_id,details,slots) values(f,c,jsonb_build_object('grade','1st Grade','competition','Test District','format','long_form','opposition','Visitors','meeting','private arrangements','days',jsonb_build_array(jsonb_build_object('date',played))),'[]');
  insert into club_selection_private.roster(id,club_id,name,account_email) values(r1,c,'Confirmed Name','do-not-return@example.invalid'),(r2,c,'Linked Batter',null),(r3,c,'Conflicting Link',null);
  insert into public.players(id,club_id,display_name) values(p2,c,'Batting-linked Name');
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source1,r1,adm);
  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by) values(c,source2,p2,adm);
  insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,r2,p2);
  card:=jsonb_build_object('provider','playcricket_au','schema_version',2,'status','completed','match_id',mid,'dates',jsonb_build_array(played),'grade','1st Grade','format_key','long_form',
   'teams',jsonb_build_array(jsonb_build_object('id',our,'name','Synthetic club','players',jsonb_build_array(jsonb_build_object('player_id',source1,'name','Source Name'),jsonb_build_object('player_id',source2,'name','Source Two'),jsonb_build_object('player_id',source3,'name','Unlinked Batter'))),jsonb_build_object('id',them,'name','Visitors','players','[]'::jsonb)),
   'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',our,'number',1,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',source1,'runs',41,'not_out',false,'importable',true)),'bowlers','[]'::jsonb)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard,created_at) values(sid,c,mid,adm,card,now()-interval '1 minute');
  insert into club_selection_private.fixture_result_sources(club_id,fixture_id,source_match_id,team_id,updated_by) values(c,f,mid,our,adm);
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');
  assert jsonb_array_length(res->'cards')=1 and res#>>'{cards,0,fixture_id}'=f::text,'Uses shared source association';
  assert res#>>'{cards,0,our_team}'=our::text,'Shared team choice is preserved';
  assert jsonb_array_length(res->'identities')=3,'Only scorecard identities returned';
  assert exists(select 1 from jsonb_array_elements(res->'identities') x where x->>'source_id'=source1::text and x->>'roster_id'=r1::text and x->>'name'='Confirmed Name'),'Teams-only identity link reused';
  assert exists(select 1 from jsonb_array_elements(res->'identities') x where x->>'source_id'=source2::text and x->>'roster_id'=r2::text),'Match Review link bridges to the same roster';
  assert res::text not like '%do-not-return%' and res::text not like '%private arrangements%','No contact or team arrangements in stats payload';
  card:=jsonb_set(card,'{innings,0,batters,0,runs}','73');
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard,created_at) values(new_sid,c,mid,adm,card,now());
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');
  assert jsonb_array_length(res->'cards')=1 and res#>>'{cards,0,scorecard,innings,0,batters,0,runs}'='73','Newest correction replaces original snapshot';
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source2,r3,adm);
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');
  assert exists(select 1 from jsonb_array_elements(res->'identities') x where x->>'source_id'=source2::text and x->>'conflict'='true'),'Conflicting linked identities are explicit';

  foreach u in array array[sel,cap] loop
   perform set_config('request.jwt.claim.sub',u::text,true);
   res:=public.club_season_stats_api(c,'context','{"on_demand":true}');assert res->>'can_set_season'='false' and jsonb_array_length(res->'cards')=1,'Selectors and captains can read';
   denied:=false;begin perform public.club_season_stats_api(c,'set_season',jsonb_build_object('start',season_start,'end',season_end,'expected_revision',0));exception when raise_exception then denied:=true;end;assert denied,'Only admin can set season';
  end loop;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  denied:=false;begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'Ordinary player denied';
  perform set_config('request.jwt.claim.sub',adm::text,true);
  denied:=false;begin perform public.club_season_stats_api(other_c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'Outsider club denied';
  perform set_config('request.jwt.claim.sub','',true);
  denied:=false;begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'Unauthenticated denied';
  perform set_config('request.jwt.claim.sub',adm::text,true);
  update club_selection_private.access set status='disabled' where club_id=c;
  denied:=false;begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'Disabled Teams denied';
  update club_selection_private.access set status='active' where club_id=c;
  update public.clubs set archived_at=now() where id=c;
  denied:=false;begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'Archived club denied';
  update public.clubs set archived_at=null where id=c;

  res:=public.club_season_stats_api(c,'set_season',jsonb_build_object('start',season_start,'end',season_end,'expected_revision',0));
  assert res#>>'{season,revision}'='1','Season save acknowledged';
  denied:=false;begin perform public.club_season_stats_api(c,'set_season',jsonb_build_object('start',season_start,'end',season_end,'expected_revision',0));exception when raise_exception then denied:=true;end;assert denied,'Stale admin write rejected';
  denied:=false;begin perform public.club_season_stats_api(c,'set_season',jsonb_build_object('start',season_end,'end',season_start,'expected_revision',1));exception when raise_exception then denied:=true;end;assert denied,'Reversed dates rejected';
  denied:=false;begin perform public.club_season_stats_api(c,'set_season',jsonb_build_object('start',season_start,'end',season_start+367,'expected_revision',1));exception when raise_exception then denied:=true;end;assert denied,'Unbounded season rejected';
  -- Stored prior-year dates advance to the latest begun season, not the next one.
  update club_selection_private.season_stats_settings set starts=season_start-interval '1 year',ends=season_end-interval '1 year' where club_id=c;
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');assert res#>>'{season,start}'=season_start::text,'Season repeats without yearly admin entry';
  delete from club_selection_private.season_stats_settings where club_id=c;
  update club_selection_private.access set timezone='Europe/London' where club_id=c;
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');assert res#>>'{season,start}'=extract(year from now() at time zone 'Europe/London')::text||'-01-01','Northern default uses calendar year';
  assert not has_function_privilege('anon','public.club_season_stats_api(uuid,text,jsonb)','execute'),'Anonymous RPC execute revoked';
  assert not has_table_privilege('authenticated','club_selection_private.season_stats_settings','select'),'Settings table not directly readable';
  assert has_function_privilege('authenticated','public.club_season_stats_api(uuid,text,jsonb)','execute'),'Authenticated RPC available';
  raise exception using errcode='P0198',message='Rollback synthetic season stats';
 exception when sqlstate 'P0198' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_c));
end $test$;
select 'Season stats permissions, latest shared scores, identity conflicts, season settings and rollover passed; synthetic data rolled back.' as result;
