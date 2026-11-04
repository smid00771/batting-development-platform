-- Exercise the browser RPC as authenticated, not only a postgres session with JWT claims.
-- Synthetic club and users only; all changes are rolled back, with no provider calls.
begin;
set local statement_timeout='25s';
do $tests$
declare
 c uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();member_id uuid:=gen_random_uuid();
 sg uuid:=gen_random_uuid();grade uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();
 short_id uuid:=gen_random_uuid();default_id uuid:=gen_random_uuid();source_short uuid:=gen_random_uuid();source_default uuid:=gen_random_uuid();
 request_id uuid:=gen_random_uuid();played date:=(now() at time zone 'Australia/Sydney')::date-1;
 details jsonb;card jsonb;command jsonb;result jsonb;retry jsonb;rejected boolean;
begin
 insert into auth.users(id,email) values(staff,'rpc-identity-'||staff||'@example.invalid'),(member_id,'rpc-identity-'||member_id||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(staff,'Synthetic Admin'),(member_id,'Synthetic Member');
 insert into public.clubs(id,name,slug,created_by) values(c,'Identity RPC Test','identity-rpc-'||c,staff);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,staff,'admin','admin'),(c,member_id,'player','none');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',staff,'Australia/Sydney');
 insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Synthetic teams',false);
 insert into public.playing_groups(id,club_id,name,active) values(grade,c,'Synthetic XI',true);
 insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,grade,sg);
 insert into club_selection_private.roster(id,club_id,name,active,preferred_name) values(short_id,c,'Alex Example',true,true),(default_id,c,'Bea Example',true,false);
 details:=jsonb_build_object('grade','Synthetic XI','grade_group_id',grade,'opposition','Visitors','format','t20','days',jsonb_build_array(jsonb_build_object('date',played,'start','17:00')));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,details,'[]');
 card:=jsonb_build_object('provider','playhq_au','status','completed','match_id',mid,'dates',jsonb_build_array(played),'format_key','t20',
  'teams',jsonb_build_array(jsonb_build_object('id',tid,'name','Synthetic XI','lineup_available',false,'players',jsonb_build_array(
   jsonb_build_object('player_id',source_short,'name','Alexander Example'),jsonb_build_object('player_id',source_default,'name','Beatrice Example')))),
  'innings','[]'::jsonb);
 insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard,fetched_by) values(sid,c,mid,card,staff);
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(fid,c,mid,tid,staff);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
 command:=jsonb_build_object('snapshot_id',sid,'team_id',tid,'source_player_id',source_short,'roster_id',short_id,'fixture_id',fid,'expected_name','Alex Example','prefer_registration',true);
 set local role authenticated;
 result:=public.confirm_scorecard_player(c,request_id,command);
 retry:=public.confirm_scorecard_player(c,request_id,command);
 reset role;
 assert result->>'confirmed'='true' and result->>'roster_id'=short_id::text and result->>'name'='Alex Example','Yes links the existing player and preserves a deliberate short name';
 assert result=retry,'An uncertain request retries the same receipt';
 assert (select count(*)=1 from club_selection_private.requests where club_id=c and action='scorecard_player_identity'),'Retry stores exactly one receipt';
 assert exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=source_short and roster_id=short_id),'The source identity is remembered';
 assert exists(select 1 from club_selection_private.player_source_names where club_id=c and roster_id=short_id and source_name='Alexander Example'),'Formal source spelling is remembered separately';
 set local role authenticated;
 result:=public.confirm_scorecard_player(c,gen_random_uuid(),command||jsonb_build_object('source_player_id',source_default,'roster_id',default_id,'expected_name','Bea Example'));
 reset role;
 assert result->>'confirmed'='true' and result->>'name'='Beatrice Example','Source names remain the default without a deliberate edit';
 assert (select count(*)=2 from club_selection_private.roster where club_id=c),'Confirmation creates no duplicate players';
 assert (select slots='[]'::jsonb and published is null from club_selection_private.fixtures where id=fid),'An incomplete lineup does not replace or publish selections';
 rejected:=false;
 begin
  set local role authenticated;
  perform public.confirm_scorecard_player(c,request_id,command||'{"expected_name":"Changed"}');
 exception when raise_exception then rejected:=sqlerrm='Request ID already used';end;
 reset role;assert rejected,'A receipt cannot be reused for a different confirmation';
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
 rejected:=false;
 begin set local role authenticated;perform public.confirm_scorecard_player(c,gen_random_uuid(),command);
 exception when raise_exception then rejected:=sqlerrm='Coaching, selection or socials access is required';end;
 reset role;assert rejected,'An ordinary member cannot link other players';
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
 rejected:=false;
 begin set local role authenticated;perform public.confirm_scorecard_player(gen_random_uuid(),gen_random_uuid(),command);
 exception when raise_exception then rejected:=sqlerrm='Current club membership is required';end;
 reset role;assert rejected,'A different club remains inaccessible';
 rejected:=false;
 begin set local role anon;perform public.confirm_scorecard_player(c,gen_random_uuid(),command);
 exception when insufficient_privilege then rejected:=true;end;
 reset role;assert rejected,'Anonymous execution remains denied';
 assert not has_function_privilege('authenticated','club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)','execute'),'The private helper stays private';
 assert not has_function_privilege('anon','public.confirm_scorecard_player(uuid,uuid,jsonb)','execute'),'The public entry point stays signed-in only';
end $tests$;
rollback;
select 'Authenticated identity RPC: confirmations, preferred names, remembered links, retries and access boundaries passed; synthetic data rolled back.' result;
