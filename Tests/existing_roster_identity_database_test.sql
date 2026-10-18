-- An ordinary playing-list import can already own the PlayCricket identity.
-- Confirmation must attach it to the existing batting player, without an account signup.
do $tests$
#variable_conflict use_column
declare c uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();account uuid:=gen_random_uuid();
 pid uuid;rid uuid;original_rid uuid;source uuid;sid uuid;fid uuid;tid uuid:=gen_random_uuid();mid uuid;
 card jsonb;details jsonb;slots jsonb;command jsonb;result jsonb;request uuid;bad boolean;has_roster boolean;
begin
 begin
  insert into auth.users(id,email) values(staff,'existing-roster-'||staff||'@example.invalid'),(account,'existing-player-'||account||'@example.invalid');
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic identity club','existing-roster-'||c,staff);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,staff,'admin','admin',null),(c,account,'player','none','player');
  insert into club_selection_private.access(club_id,status,head_selector_id) values(c,'active',staff);
  perform set_config('request.jwt.claim.sub',staff::text,true);
  foreach has_roster in array array[false,true] loop
   pid:=gen_random_uuid();rid:=gen_random_uuid();original_rid:=case when has_roster then gen_random_uuid() end;
   source:=gen_random_uuid();sid:=gen_random_uuid();fid:=gen_random_uuid();mid:=gen_random_uuid();request:=gen_random_uuid();
   insert into public.players(id,club_id,display_name,active) values(pid,c,'Sulaiman Muhammad',true);
   -- Random ID is intentional: this player came from the playing list, not the scorecard importer.
   insert into club_selection_private.roster(id,club_id,external_id,name,account_email) values(rid,c,source::text,'Sulaiman Moin Muhammad',null);
   if has_roster then
    insert into club_selection_private.roster(id,club_id,external_id,name) values(original_rid,c,'legacy-'||pid,'Sulaiman Muhammad');
    insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,original_rid,pid);
   end if;
   insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source,rid,staff);
   card:=jsonb_build_object('match_id',mid,'status','completed','dates',jsonb_build_array('2026-10-17'),'teams',jsonb_build_array(jsonb_build_object('id',tid,'players',jsonb_build_array(jsonb_build_object('player_id',source,'name','Sulaiman Moin Muhammad')))),'innings',jsonb_build_array(jsonb_build_object('team_id',tid,'number',1,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',source,'name','Sulaiman Moin Muhammad','runs',42)))));
   insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,staff,card);
   -- Independent cases must not collide with the live shared-fixture guard.
   details:=jsonb_build_object('grade',case when has_roster then 'Second Grade' else 'First Grade' end,'format','limited_overs','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date','2026-10-17')));
   slots:=jsonb_build_array(jsonb_build_object('d1',rid,'d2',null));
   insert into club_selection_private.fixtures(id,club_id,details,slots,published,publication,scorecard_sync) values(fid,c,details,slots,jsonb_build_object('details',details,'slots',slots,'players',jsonb_build_array(jsonb_build_object('id',rid,'name','Sulaiman Moin Muhammad'))),1,jsonb_build_object('match_id',mid,'team_id',tid,'players',jsonb_build_array(jsonb_build_object('source_id',source,'roster_id',rid))));
   insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) select id,1,published,staff from club_selection_private.fixtures where id=fid;
   command:=jsonb_build_object('snapshot_id',sid,'team_id',tid,'source_player_id',source,'player_id',pid,'fixture_id',fid,'expected_name','Sulaiman Muhammad');
   -- This action cannot take over another person's account or pending invitation.
   update club_selection_private.roster set user_id=account where id=rid;
   bad:=false;begin perform public.confirm_scorecard_player(c,request,command);exception when raise_exception then bad:=sqlerrm like '%another club record%';end;assert bad,'Account-backed roster cannot be reassigned';
   update club_selection_private.roster set user_id=null,account_email='invited@example.invalid' where id=rid;
   bad:=false;begin perform public.confirm_scorecard_player(c,request,command);exception when raise_exception then bad:=sqlerrm like '%another club record%';end;assert bad,'Pending account invitation cannot be reassigned';
   update club_selection_private.roster set account_email=null where id=rid;
   result:=public.confirm_scorecard_player(c,request,command);
   assert result->>'confirmed'='true' and result->>'player_id'=pid::text,'Existing batting identity retained';
   assert result->>'roster_id'=coalesce(original_rid,rid)::text and result->>'fixture_repaired'='true','Selected playing-list identity repaired';
   assert (select display_name='Sulaiman Moin Muhammad' and user_id is null from public.players where id=pid),'Canonical club name changes without inventing an account';
   assert (select player_id=pid from club_batting_private.roster_players where roster_id=coalesce(original_rid,rid)),'Selection now has its batting record';
   assert (select l.player_id=pid from public.match_review_player_links l where l.club_id=c and l.source_player_id=source),'Future imports use the same player ID';
   assert (select published->'slots'->0->>'d1'=coalesce(original_rid,rid)::text from club_selection_private.fixtures where id=fid),'Published team follows the confirmed identity';
   assert (select snapshot->'slots'->0->>'d1'=rid::text from club_selection_private.publications where fixture_id=fid and version=1),'Earlier publication remains in history';
   assert (select sc.scorecard#>>'{innings,0,batters,0,runs}'='42' from public.match_review_scorecards sc join public.match_review_player_links l on l.club_id=sc.club_id and l.source_player_id=(sc.scorecard#>>'{innings,0,batters,0,player_id}')::uuid where sc.id=sid and l.player_id=pid),'The imported score resolves to that original player';
   assert public.confirm_scorecard_player(c,request,command)=result,'Retry returns the original confirmation';
  end loop;
  assert (select count(*)=2 from public.players where club_id=c),'Confirmation never creates a duplicate player';
  raise exception using errcode='P0198',message='Rollback synthetic existing-roster test';
 exception when sqlstate 'P0198' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic club rolled back';
 assert not exists(select 1 from auth.users where id in(staff,account)),'Synthetic accounts rolled back';
end $tests$;
