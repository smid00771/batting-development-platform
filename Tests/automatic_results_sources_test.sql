-- Rollback-only checks. No provider requests, secret reads or cron activation.
begin;
do $tests$
declare c uuid;u uuid;g uuid;generation uuid;mid uuid:=gen_random_uuid();grade uuid:=gen_random_uuid();team uuid:=gen_random_uuid();season uuid:=gen_random_uuid();preview uuid;fid uuid;
 src jsonb;r jsonb;job jsonb;review jsonb;req jsonb;card jsonb;ns uuid:=gen_random_uuid();ours uuid:=gen_random_uuid();theirs uuid:=gen_random_uuid();sid uuid;again uuid;count_before integer;old_slots jsonb;rejected boolean;
begin
 select cn.club_id,m.user_id,pg.id,cn.generation into c,u,g,generation from club_selection_private.playhq_connections cn join public.club_memberships m using(club_id) join public.playing_groups pg on pg.club_id=cn.club_id and pg.active where m.permission_role='admin' and club_selection_private.enabled(cn.club_id) limit 1;
 assert c is not null,'Existing configured club required for rollback test';
 assert not has_function_privilege('authenticated','public.playhq_sync_worker(text,jsonb)','EXECUTE');
 assert not has_function_privilege('authenticated','club_selection_private.playhq_store_scorecard(uuid,uuid,jsonb)','EXECUTE');
 assert not has_function_privilege('anon','public.playhq_fixture_review(uuid,text,jsonb)','EXECUTE');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 update club_selection_private.playhq_connections set active_season_id=season where club_id=c;
 insert into club_selection_private.playhq_grade_mappings(club_id,season_id,team_id,source_grade_id,grade_id) values(c,season,team,grade,g);
 src:=jsonb_build_object('source_match_id',mid,'source_grade_id',grade,'source_team_id',team,'status','PENDING','cancelled',false,'requires_review',false,'opposition','Rollback Visitors','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date','2099-12-27','time','12:00','start_at','2099-12-27T01:00:00Z','ground','Old ground')));
 insert into club_selection_private.playhq_previews(club_id,generation,season_id,grade_id,team_id,fixtures) values(c,generation,season,grade,team,jsonb_build_array(src)) returning id into preview;
 req:=jsonb_build_object('preview_id',preview,'group_id',g,'choices',jsonb_build_array(jsonb_build_object('match_id',mid)));
 r:=public.playhq_sync_api(c,'import',req);fid:=(r#>>'{fixture_ids,0}')::uuid;
 assert public.playhq_sync_api(c,'import',req)#>>'{fixture_ids,0}'=fid::text,'Import retry is idempotent';
 select slots into old_slots from club_selection_private.fixtures where id=fid;
 -- Connection verification is simulated only inside this rolled-back transaction.
 update club_selection_private.playhq_connections set verified_at=now() where club_id=c;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 job:=public.playhq_sync_worker('claim_fixture',jsonb_build_object('club_id',c,'generation',generation,'fixture_id',fid,'kind','fixtures'));
 perform public.playhq_sync_worker('finish',jsonb_build_object('club_id',c,'generation',generation,'job',job,'result',jsonb_build_object('fixtures',jsonb_build_array(src||'{"status":"IN_PROGRESS"}'::jsonb))));
 assert not exists(select 1 from club_selection_private.playhq_links where fixture_id=fid and pending_fixture is not null),'Status alone creates no fixture review';
 rejected:=false;begin perform public.playhq_sync_worker('claim_fixture',jsonb_build_object('club_id',c,'generation',generation,'fixture_id',fid,'kind','fixtures'));exception when raise_exception then rejected:=true;end;assert rejected,'Manual check throttle retained';
 src:=jsonb_set(src,'{days,0,ground}','"New ground"');
 update club_selection_private.playhq_links set pending_fixture=src where fixture_id=fid;
 review:=public.playhq_fixture_review(c,'preview',jsonb_build_object('fixture_id',fid));
 assert review->>'can_apply'='true' and review#>>'{before,ground}'='Old ground' and review#>>'{after,ground}'='New ground','Review compares current and imported arrangements';
 req:=jsonb_build_object('fixture_id',fid,'revision',review->'revision','token',review->>'token');
 rejected:=false;begin perform public.playhq_fixture_review(c,'apply',req||'{"token":"stale"}'::jsonb);exception when raise_exception then rejected:=true;end;assert rejected,'Stale source preview rejected';
 perform public.playhq_fixture_review(c,'apply',req);
 assert public.playhq_fixture_review(c,'apply',req)->>'already_saved'='true','Apply retry reuses completed change';
 assert (select slots=old_slots and details->>'ground'='New ground' from club_selection_private.fixtures where id=fid),'Reviewed change preserves team positions';
 update club_selection_private.fixtures set published=jsonb_build_object('details',details,'slots',slots) where id=fid;
 update club_selection_private.playhq_links set pending_fixture=jsonb_set(src,'{days,0,ground}','"Third ground"') where fixture_id=fid;
 assert public.playhq_fixture_review(c,'preview',jsonb_build_object('fixture_id',fid))->>'can_apply'='false','Publication lock blocks source change';
 update club_selection_private.fixtures set published=null where id=fid;
 card:=jsonb_build_object('schema_version',2,'provider','playhq_au','upstream_match_id',mid,'upstream_grade_id',grade,'upstream_team_id',team,'match_id',ns,'our_team_id',ours,'status','in_progress','dates',jsonb_build_array('2099-12-27'),'format_key','limited_overs','grade','Test grade',
  'teams',jsonb_build_array(jsonb_build_object('id',ours,'source_team_id',team,'name','Provider club name'),jsonb_build_object('id',theirs,'name','Visitors')),
  'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',ours,'number',1,'complete',false,'batters','[]'::jsonb,'bowlers','[]'::jsonb)));
 select count(*) into count_before from public.match_review_scorecards where club_id=c;
 sid:=club_selection_private.playhq_store_scorecard(c,fid,card);again:=club_selection_private.playhq_store_scorecard(c,fid,card);
 assert sid is not null and again=sid and (select count(*)=count_before+1 from public.match_review_scorecards where club_id=c),'Same response does not duplicate stored scores';
 assert (select source_match_id=ns and team_id=ours from club_selection_private.fixture_result_sources where fixture_id=fid),'Fixture uses namespaced shared scorecard';
 assert exists(select 1 from jsonb_array_elements(club_selection_private.team_week_cards(c,'2099-12-26','2099-12-31')) x where x->>'snapshot_id'=sid::text and x->>'our_team'=ours::text),'Awards use verified club team even when names differ';
 assert club_selection_private.playhq_store_scorecard(c,fid,jsonb_set(card,'{dates}','["2099-12-28"]')) is null,'Moved dates cannot overwrite linked scores';
 assert (select result_error is not null from club_selection_private.playhq_links where fixture_id=fid),'Mismatch is reviewable';
 update public.match_review_scorecards set created_at=now()-interval '1 second' where id=sid;
 card:=card||'{"status":"completed"}'::jsonb;
 again:=club_selection_private.playhq_store_scorecard(c,fid,card);
 assert again<>sid and (select source_match_id=ns from public.match_review_scorecards where id=again),'Final scores replace the same shared match identity';
 assert (select result_error is null from club_selection_private.playhq_links where fixture_id=fid),'Successful retry clears error';
 -- An already confirmed PlayCricket source stays canonical when refreshing via the API job.
 ns:=gen_random_uuid();ours:=gen_random_uuid();
 update club_selection_private.fixture_result_sources set source_match_id=ns,team_id=ours where fixture_id=fid;
 card:=card||jsonb_build_object('provider','playcricket_au','match_id',ns,'our_team_id',ours,'teams',jsonb_build_array(jsonb_build_object('id',ours,'name','Our club'),jsonb_build_object('id',theirs,'name','Visitors')));
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,ns,u,card);
 card:=card||jsonb_build_object('result','Corrected final result');
 sid:=club_selection_private.playhq_store_scorecard(c,fid,card);
 assert sid is not null and (select source_match_id=ns and team_id=ours from club_selection_private.fixture_result_sources where fixture_id=fid),'Legacy canonical match and team IDs retained';
 assert club_selection_private.playhq_store_scorecard(c,fid,card)=sid,'Identical canonical refresh is idempotent';
 rejected:=false;begin perform club_selection_private.playhq_store_scorecard(c,fid,card||jsonb_build_object('match_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Arbitrary legacy identity cannot replace the confirmed source';
 -- Explicit cancellation is preserved when importing a new fixture.
 mid:=gen_random_uuid();src:=jsonb_set(src,'{source_match_id}',to_jsonb(mid))||'{"cancelled":true}'::jsonb;
 src:=jsonb_set(src,'{days,0,date}','"2099-12-28"');
 insert into club_selection_private.playhq_previews(club_id,generation,season_id,grade_id,team_id,fixtures) values(c,generation,season,grade,team,jsonb_build_array(src)) returning id into preview;
 r:=public.playhq_sync_api(c,'import',jsonb_build_object('preview_id',preview,'group_id',g,'choices',jsonb_build_array(jsonb_build_object('match_id',mid))));
 assert (select details->>'cancelled'='true' from club_selection_private.fixtures where id=(r#>>'{fixture_ids,0}')::uuid),'Cancelled source remains cancelled';
end $tests$;
rollback;
select 'Automatic results: confirmed legacy sources, scoped API identities, review locks, retries, final replacement and cancellations passed.' as result;
