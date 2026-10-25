-- Player identity belongs to the club playing list, independently of each team's
-- Club Batting choice. The PlayHQ branch writes only the confirmed roster link;
-- existing fixture, permission, conflict and retry checks remain intact.
do $patch$
declare definition text;old_text text;new_text text;before_acl aclitem[];
begin
 old_text:=$old$  if pid is not null and not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,coalesce(f.published->'details',f.details))) then raise exception 'This team does not use Club Batting';end if;$old$;
 new_text:=$new$  -- A selection-only team can share existing grade players without enabling coaching.$new$;
 select pg_get_functiondef(oid),proacl into definition,before_acl
  from pg_proc where oid='club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure;
 if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then
  raise exception 'Unexpected scorecard identity definition';
 end if;
 execute replace(definition,old_text,new_text);
 assert (select proacl is not distinct from before_acl from pg_proc
  where oid='club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure),
  'Existing identity API grants are preserved';
end $patch$;

-- The regression checks run atomically; their synthetic records roll back.
-- Real API and schema; every synthetic record is rolled back inside this block.
do $tests$
declare
 c uuid:=gen_random_uuid();other uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();member_id uuid:=gen_random_uuid();
 senior_group uuid:=gen_random_uuid();masters_group uuid:=gen_random_uuid();grade uuid:=gen_random_uuid();masters uuid:=gen_random_uuid();
 fid uuid:=gen_random_uuid();grade_fid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();
 shared_roster uuid:=gen_random_uuid();masters_roster uuid:=gen_random_uuid();different_roster uuid:=gen_random_uuid();foreign_roster uuid:=gen_random_uuid();
 player_id uuid:=gen_random_uuid();grade_source uuid:=gen_random_uuid();shared_source uuid:=gen_random_uuid();masters_source uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid();played date:=(now() at time zone 'Australia/Sydney')::date-1;
 details jsonb;card jsonb;values jsonb;result jsonb;ctx jsonb;before_fixtures jsonb;before_players jsonb;before_links jsonb;before_review jsonb;
 rejected boolean;
begin
 begin
  insert into auth.users(id,email) values(staff,'selection-identity-'||staff||'@example.invalid'),(member_id,'selection-identity-'||member_id||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(staff,'Synthetic Admin'),(member_id,'Synthetic Member');
  insert into public.clubs(id,name,slug,created_by) values(c,'Selection Identity Test','selection-identity-'||c,staff),(other,'Other Identity Test','selection-identity-'||other,staff);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,staff,'admin','admin'),(c,member_id,'player','none');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'bundle','active',staff,'Australia/Sydney');
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(senior_group,c,'Senior grade',true),(masters_group,c,'Masters',false);
  insert into public.playing_groups(id,club_id,name,active) values(grade,c,'First XI',true),(masters,c,'Masters XI',true);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,grade,senior_group),(c,masters,masters_group);
  insert into club_selection_private.roster(id,club_id,name,user_id,active) values
   (shared_roster,c,'Alex Example',member_id,true),(masters_roster,c,'Bailey Example',null,true),(different_roster,c,'Casey Example',null,true),(foreign_roster,other,'Alex Example',null,true);
  insert into public.players(id,club_id,user_id,display_name,active) values(player_id,c,member_id,'Alex Example',true);
  insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,shared_roster,player_id);
  insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by) values(c,player_id,grade,staff);
  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by) values(c,grade_source,player_id,staff);
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,grade_source,shared_roster,staff);
  details:=jsonb_build_object('grade','Masters XI','grade_group_id',masters,'competition','Masters Cup','opposition','Visitors','format','t20','days',jsonb_build_array(jsonb_build_object('date',played,'start','12:00')));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,details,'[]'),(grade_fid,c,details||jsonb_build_object('grade','First XI','grade_group_id',grade,'days',jsonb_build_array(jsonb_build_object('date',played-1,'start','12:00'))),jsonb_build_array(jsonb_build_object('d1',shared_roster)));
  insert into club_batting_private.fixture_review_rosters(club_id,fixture_id,player_ids,revision,updated_by) values(c,grade_fid,array[player_id],1,staff);
  card:=jsonb_build_object('provider','playhq_au','status','completed','match_id',mid,'dates',jsonb_build_array(played),'format_key','t20','grade','Masters XI',
   'teams',jsonb_build_array(jsonb_build_object('id',tid,'name','Selection Identity Test','lineup_available',false,'players',jsonb_build_array(jsonb_build_object('player_id',shared_source,'name','Alex Example'),jsonb_build_object('player_id',masters_source,'name','Bailey Example'),jsonb_build_object('player_id',null,'name',null)))),
   'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'number',1,'team_id',tid,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',shared_source,'name','Alex Example','runs',42,'balls',30,'status','played','not_out',false,'importable',true)),'bowlers','[]'::jsonb)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard,fetched_by) values(sid,c,mid,card,staff);
  insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(fid,c,mid,tid,staff);
  perform set_config('request.jwt.claim.sub',staff::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
  assert club_batting_private.player_uses_batting(c,player_id),'The shared player already uses Club Batting through grade cricket';
  assert not club_batting_private.group_uses_batting(c,masters),'The Masters team is opted out';
  select jsonb_agg(to_jsonb(f) order by f.id) into before_fixtures from club_selection_private.fixtures f where f.club_id=c;
  select jsonb_agg(to_jsonb(p) order by p.id) into before_players from public.players p where p.club_id=c;
  select jsonb_agg(to_jsonb(l) order by l.source_player_id) into before_links from public.match_review_player_links l where l.club_id=c;
  select jsonb_agg(to_jsonb(r) order by r.fixture_id) into before_review from club_batting_private.fixture_review_rosters r where r.club_id=c;
  values:=jsonb_build_object('snapshot_id',sid,'team_id',tid,'source_player_id',shared_source,'roster_id',shared_roster,'fixture_id',fid,'expected_name','Alex Example','prefer_registration',true);
  -- This is the existing Yes, link player payload, including an already-linked batting profile.
  result:=public.confirm_scorecard_player(c,request_id,values);
  assert result->>'confirmed'='true' and result->>'roster_id'=shared_roster::text and result->>'player_id'=player_id::text,'The overlapping grade/Masters player keeps both existing IDs';
  assert exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=shared_source and roster_id=shared_roster),'Masters figures link to the existing playing-list identity';
  assert public.confirm_scorecard_player(c,request_id,values)=result,'Retry returns the same confirmed result';
  assert (select count(*)=1 from club_selection_private.audit where club_id=c and action='scorecard_match_player_identity'),'Retry cannot duplicate the audit';
  result:=public.confirm_scorecard_player(c,gen_random_uuid(),values||jsonb_build_object('source_player_id',masters_source,'roster_id',masters_roster,'expected_name','Bailey Example'));
  assert result->>'confirmed'='true' and result->>'player_id' is null,'A Masters-only player links without creating a batting profile';
  ctx:=public.club_season_stats_api(c,'context');
  assert exists(select 1 from jsonb_array_elements(ctx->'identities') i where i->>'source_id'=shared_source::text and i->>'roster_id'=shared_roster::text),'Season stats use the shared identity';
  assert exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=grade_source and roster_id=shared_roster),'Existing grade identity is preserved';
  assert before_fixtures=(select jsonb_agg(to_jsonb(f) order by f.id) from club_selection_private.fixtures f where f.club_id=c),'Withheld lineup does not replace either team';
  assert before_players=(select jsonb_agg(to_jsonb(p) order by p.id) from public.players p where p.club_id=c),'Names, accounts and batting profiles are unchanged';
  assert before_links=(select jsonb_agg(to_jsonb(l) order by l.source_player_id) from public.match_review_player_links l where l.club_id=c),'Masters source IDs do not create coaching links';
  assert before_review=(select jsonb_agg(to_jsonb(r) order by r.fixture_id) from club_batting_private.fixture_review_rosters r where r.club_id=c),'Grade coaching records are unchanged and Masters creates none';
  assert not exists(select 1 from public.match_review_score_links where club_id=c and source_player_id in (shared_source,masters_source)),'Masters figures do not enter coaching score records';
  assert not (select batting_enabled from club_selection_private.selection_groups where id=masters_group),'Linking does not opt Masters into Club Batting';
  assert (select batting_enabled from club_selection_private.selection_groups where id=senior_group),'Grade participation remains enabled';
  -- Keep the identity, request, club and saved-scorecard safeguards.
  rejected:=false;begin perform public.confirm_scorecard_player(c,request_id,values||'{"expected_name":"Changed"}');exception when raise_exception then rejected:=sqlerrm='Request ID already used';end;assert rejected,'Request IDs cannot be repurposed';
  rejected:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values||'{"expected_name":"Stale"}');exception when raise_exception then rejected:=sqlerrm like 'The player name changed%';end;assert rejected,'Stale names remain rejected';
  rejected:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values||jsonb_build_object('roster_id',different_roster,'expected_name','Casey Example'));exception when raise_exception then rejected:=sqlerrm like 'This match already has a different player link%';end;assert rejected,'A confirmed identity cannot be reassigned to another player';
  rejected:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values||jsonb_build_object('roster_id',foreign_roster));exception when raise_exception then rejected:=sqlerrm='Choose an active club player';end;assert rejected,'A roster from another club remains rejected';
  rejected:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values||jsonb_build_object('fixture_id',grade_fid));exception when raise_exception then rejected:=sqlerrm like 'Confirm this player against the fixture%';end;assert rejected,'An unrelated fixture remains rejected';
  update public.match_review_scorecards set scorecard=jsonb_set(card,'{status}','"in_progress"') where id=sid;
  rejected:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values);exception when raise_exception then rejected:=sqlerrm like 'Confirm this player against the fixture%';end;assert rejected,'An unfinished scorecard remains rejected';
  update public.match_review_scorecards set scorecard=card where id=sid;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  rejected:=false;begin perform public.confirm_scorecard_player(c,gen_random_uuid(),values);exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary players cannot confirm identities';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  rejected:=false;begin perform public.confirm_scorecard_player(other,gen_random_uuid(),values);exception when raise_exception then rejected:=true;end;assert rejected,'Club membership remains required';
  -- The same path works with a complete lineup and still creates no Masters coaching team.
  card:=jsonb_set(jsonb_set(card,'{teams,0,lineup_available}','true'),'{teams,0,players}',jsonb_build_array(jsonb_build_object('player_id',shared_source,'name','Alex Example'),jsonb_build_object('player_id',masters_source,'name','Bailey Example')));
  update public.match_review_scorecards set scorecard=card where id=sid;
  perform public.confirm_scorecard_player(c,gen_random_uuid(),values);
  assert (select scorecard_sync->>'source'='completed_scorecard' and published is null and publication=0 from club_selection_private.fixtures where id=fid),'Complete actual team recovery still works without publication';
  assert not exists(select 1 from club_batting_private.fixture_review_rosters where club_id=c and fixture_id=fid),'Actual Masters team recovery does not create coaching activity';
  assert before_review=(select jsonb_agg(to_jsonb(r) order by r.fixture_id) from club_batting_private.fixture_review_rosters r where r.club_id=c),'Grade coaching records remain intact after recovery';
  assert not has_function_privilege('anon','public.confirm_scorecard_player(uuid,uuid,jsonb)','execute'),'Anonymous calls remain denied';
  raise exception using errcode='ZX002',message='Rollback synthetic selection identity checks';
 exception when sqlstate 'ZX002' then null;
 end;
 assert not exists(select 1 from public.clubs where id in (c,other)),'All synthetic club records are rolled back';
 assert not exists(select 1 from auth.users where id in (staff,member_id)),'All synthetic user records are rolled back';
end $tests$;
