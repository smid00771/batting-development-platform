-- Isolated database only. Check rollout scheduling before and after the migration.
create temporary table qa_post_match(key text,club_id uuid,user_id uuid,fixture_id uuid,match_id uuid,team_id uuid);
do $seed$
declare k text;c uuid;u uuid;fid uuid;mid uuid;tid uuid;tomorrow date:=(now() at time zone 'Australia/Sydney')::date+1;
begin
 foreach k in array array['pending','leased','backoff','disabled'] loop
  c:=gen_random_uuid();u:=gen_random_uuid();fid:=gen_random_uuid();mid:=gen_random_uuid();tid:=gen_random_uuid();
  insert into qa_post_match values(k,c,u,fid,mid,tid);
  insert into auth.users(id,email,email_confirmed_at) values(u,'post-match-'||k||'@example.invalid',now());
  insert into public.clubs(id,name,slug,created_by) values(c,'Fictional post-match club','qa-'||c,u);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'player','none');
  insert into club_selection_private.access(club_id,status,mode,timezone) values(c,'pilot','bundle','Australia/Sydney');
  insert into club_selection_private.social_managers values(c,u);
  insert into club_selection_private.social_award_settings(club_id,enabled,milestone_alerts,milestone_alerts_since)
   values(c,array['century','five_wickets'],k<>'disabled',now()-interval '1 hour');
  insert into club_selection_private.fixtures(id,club_id,details,updated_by)
   values(fid,c,jsonb_build_object('format','t20','days',jsonb_build_array(jsonb_build_object('date',tomorrow,'start','10:00'))),u);
  insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,team_id,source_fixture)
   values(fid,c,mid,tid,'{}');
  insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at,leased_until,last_error)
   values(c,'results',mid,tid,(tomorrow+time '10:30') at time zone 'Australia/Sydney',
    case when k='leased' then now()+interval '5 minutes' end,case when k='backoff' then 'Provider rate limit' end);
 end loop;
end $seed$;

-- APPLY POST-MATCH MIGRATION

do $tests$
declare r record;today date:=(now() at time zone 'Australia/Sydney')::date;tomorrow date:=today+1;expected timestamptz;
 c uuid;u uuid;mid uuid;ours uuid;theirs uuid:=gen_random_uuid();inning uuid:=gen_random_uuid();batter uuid:=gen_random_uuid();bowler uuid:=gen_random_uuid();
 card jsonb;result jsonb;aid uuid;message uuid;edition_id uuid:=gen_random_uuid();request_data jsonb;candidate jsonb;
begin
 for r in select q.*,j.due_at from qa_post_match q join club_selection_private.playhq_jobs j on j.club_id=q.club_id loop
  expected:=(tomorrow+case when r.key='pending' then time '13:30' else time '10:30' end) at time zone 'Australia/Sydney';
  assert r.due_at=expected,'Rollout restores pending checks and preserves leases, backoff and disabled clubs: '||r.key;
  assert club_selection_private.playhq_results_due(r.fixture_id,null,(tomorrow+time '10:00') at time zone 'Australia/Sydney')=(tomorrow+time '13:30') at time zone 'Australia/Sydney','No in-play check regardless of alert preference';
  assert club_selection_private.playhq_results_due(r.fixture_id,(tomorrow+time '13:30') at time zone 'Australia/Sydney',(tomorrow+time '13:30') at time zone 'Australia/Sydney')=(tomorrow+time '14:00') at time zone 'Australia/Sydney','Normal post-match retry cadence retained';
 end loop;
 select club_id,user_id,match_id,team_id into c,u,mid,ours from qa_post_match where key='pending';
 perform set_config('request.jwt.claim.sub',u::text,true);
 -- A setting change must not disturb the source worker's existing schedule.
 update club_selection_private.playhq_jobs set due_at=(tomorrow+time '17:00') at time zone 'Australia/Sydney' where club_id=c;
 perform club_selection_private.social_awards_api(c,'save_settings','{"revision":1,"enabled":["century","five_wickets"],"milestone_alerts":false}');
 perform club_selection_private.social_awards_api(c,'save_settings','{"revision":2,"enabled":["century","five_wickets"],"milestone_alerts":true}');
 assert (select due_at from club_selection_private.playhq_jobs where club_id=c)=(tomorrow+time '17:00') at time zone 'Australia/Sydney','Alert opt-in creates no additional download';
 card:=jsonb_build_object('schema_version',2,'provider','playhq_au','match_id',mid,'status','in_progress','format_key','limited_overs','grade','Fictional grade','dates',jsonb_build_array(today),
  'teams',jsonb_build_array(jsonb_build_object('id',ours,'name','Our team'),jsonb_build_object('id',theirs,'name','Visitors')),
  'innings',jsonb_build_array(jsonb_build_object('id',inning,'number',1,'team_id',ours,'complete',false,'batters',jsonb_build_array(jsonb_build_object('player_id',batter,'name','Fictional Batter','status','played','runs',100,'not_out',true,'importable',false,'figures_valid',true))),
   jsonb_build_object('id',gen_random_uuid(),'number',1,'team_id',theirs,'complete',false,'bowlers',jsonb_build_array(jsonb_build_object('player_id',bowler,'name','Fictional Bowler','team_id',ours,'wickets',5,'runs',20,'importable',false)))));
 insert into club_selection_private.team_week_sources(club_id,source_match_id,team_id,updated_by) values(c,mid,ours,u);
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,u,card);
 set constraints all immediate;
 assert not exists(select 1 from club_selection_private.social_milestone_alerts where club_id=c),'In-progress imports send no alerts';
 assert club_selection_private.social_milestone_candidates(club_selection_private.social_milestone_card(c,mid))='[]','In-progress achievements are excluded';
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,u,jsonb_set(card,'{source_status}','"STUMPS"'));
 assert not exists(select 1 from club_selection_private.social_milestone_alerts where club_id=c),'Stumps alone is not a completed match';
 card:=jsonb_set(card,'{status}','"completed"');
 card:=jsonb_set(jsonb_set(card,'{innings,0,complete}','true'),'{innings,1,complete}','true');
 card:=jsonb_set(jsonb_set(card,'{innings,0,batters,0,importable}','true'),'{innings,1,bowlers,0,importable}','true');
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,u,card);
 assert (select count(*) from club_selection_private.social_milestone_alerts where club_id=c)=2,'Completed import immediately creates both achievement alerts without a week-ending action';
 select id,message_id into aid,message from club_selection_private.social_milestone_alerts where club_id=c and kind='century';
 assert club_batting_private.message_recipient_allowed(message,u),'The Socials Manager can receive the post-match alert';
 result:=club_selection_private.social_milestone_context(c,jsonb_build_object('milestone_id',aid));candidate:=result->'candidate';
 request_data:=jsonb_build_object('id',edition_id,'milestone_id',aid,'kind','century','week_end',result->>'week_end','award_scope',result->'award_scope','label','Fictional post-match century','sources',jsonb_build_array(candidate),'sha256',repeat('a',64),'bytes',100);
 result:=club_selection_private.social_awards_api(c,'context',request_data);
 assert exists(select 1 from jsonb_array_elements(result->'candidates') x where x->>'key'=candidate->>'key'),'The alert opens its exact individual award';
 result:=club_selection_private.social_awards_api(c,'reserve_image',request_data);
 insert into storage.objects(bucket_id,name,metadata) values('club-social-awards',result->>'path','{"size":100}');
 result:=club_selection_private.social_awards_api(c,'finish_image',jsonb_build_object('id',edition_id));
 assert result->>'saved'='true' and club_selection_private.social_award_scores_current(c,edition_id),'The individual graphic can be saved before weekly awards';
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,u,card);
 assert (select count(*) from club_selection_private.social_milestone_alerts where club_id=c)=2,'Correction refreshes never duplicate alerts';
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,u,jsonb_set(card,'{innings,0,batters,0,runs}','99'));
 assert not club_selection_private.social_milestone_message_allowed(message,u),'Corrected-away achievements stop pending delivery';
 assert not has_function_privilege('authenticated','club_selection_private.collect_social_milestones(uuid,uuid)','EXECUTE'),'Collector access remains private';
end $tests$;
