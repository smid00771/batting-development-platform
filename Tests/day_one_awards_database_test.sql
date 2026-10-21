-- Synthetic data only; everything is rolled back, including mock image records.
begin;
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();our uuid:=gen_random_uuid();their uuid:=gen_random_uuid();
 today date:=(now() at time zone 'Australia/Sydney')::date;card jsonb;wrap jsonb;cards jsonb;bats jsonb;ctx jsonb;p jsonb;req jsonb;result jsonb;eid uuid:=gen_random_uuid();rows jsonb;player uuid:=gen_random_uuid();bad jsonb;path text;
begin
 insert into auth.users(id,email) values(u,'day-one-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic Day 1 test');
 insert into public.clubs(id,name,slug,created_by) values(c,'Day One Test Club','day-one-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin');
 insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
 perform set_config('request.jwt.claim.sub',u::text,true);
 select jsonb_agg(jsonb_build_object('player_id',case when n=1 then player else gen_random_uuid() end,'name','Player '||n,'runs',case when n=1 then 100 else 30 end,'not_out',true,'dismissal','NotOut','status','played','importable',false)) into bats from generate_series(1,11) n;
 card:=jsonb_build_object('schema_version',2,'provider','playcricket_au','status','in_progress','source_status','LIVE','match_id',mid,'url','https://play.cricket.com.au/match/'||mid,
  'format_key','long_form','grade','Test grade','dates',jsonb_build_array(today-1,today+6),
  'teams',jsonb_build_array(jsonb_build_object('id',our,'name','Day One Test Club'),jsonb_build_object('id',their,'name','Visitors')),
  'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',our,'number',1,'complete',false,'batters',bats,'bowlers','[]'::jsonb),
  jsonb_build_object('id',gen_random_uuid(),'team_id',their,'number',1,'complete',false,'batters','[]'::jsonb,'bowlers',jsonb_build_array(jsonb_build_object('player_id',player,'name','Player 1','team_id',our,'wickets',5,'runs',40,'importable',false)))));
 wrap:=jsonb_build_array(jsonb_build_object('snapshot_id',sid,'our_team',our,'scorecard',card));
 assert club_selection_private.award_scorecards(c,wrap,false)#>>'{0,provisional_available}'='true','Day 1 figures available after the first day';
 assert club_selection_private.team_week_candidates(club_selection_private.award_scorecards(c,wrap,false))='[]','Default excludes unfinished matches';
 cards:=club_selection_private.award_scorecards(c,wrap,true);
 assert jsonb_array_length(club_selection_private.team_week_candidates(cards))=11,'Opt-in admits actual batting and bowling achievements';
 assert cards#>>'{0,scorecard,status}'='in_progress' and cards#>>'{0,scorecard,innings,0,complete}'='false','Awards never pretend the match or innings is complete';
 bad:=jsonb_set(wrap,'{0,scorecard,dates}',jsonb_build_array(today,today+7));
 assert club_selection_private.award_scorecards(c,bad,true)#>>'{0,provisional_available}'='false','Hidden during Day 1';
 bad:=jsonb_set(bad,'{0,scorecard,source_status}','"STUMPS"');
 assert club_selection_private.award_scorecards(c,bad,true)#>>'{0,provisional_available}'='true','Available at stumps on Day 1';
 bad:=jsonb_set(bad,'{0,scorecard,dates}',jsonb_build_array(today+1,today+8));
 assert club_selection_private.award_scorecards(c,bad,true)#>>'{0,provisional_available}'='false','Future stumps cannot enable option';
 bad:=jsonb_set(wrap,'{0,scorecard,format_key}','"limited_overs"');
 assert club_selection_private.award_scorecards(c,bad,true)#>>'{0,provisional_available}'='false','Never offered for a one-day game';
 bad:=jsonb_set(wrap,'{0,scorecard,status}','"completed"');
 assert club_selection_private.award_scorecards(c,bad,true)#>>'{0,provisional_available}'='false','Hidden after match completion';
 bad:=jsonb_set(jsonb_set(wrap,'{0,scorecard,innings,0,batters,0,dismissal}','"Unknown"'),'{0,scorecard,innings,0,batters,0,not_out}','false');
 assert not exists(select 1 from jsonb_array_elements(club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,bad,true))) x where x->>'kind'='century'),'Unknown dismissal cannot become an award figure';
 insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,u,card);
 ctx:=public.team_of_week_api(c,'context',jsonb_build_object('week_end',today));
 assert ctx->>'provisional_available'='true' and ctx->'candidates'='[]','Context finds first-day week even though game ends next week';
 ctx:=public.team_of_week_api(c,'context',jsonb_build_object('week_end',today,'include_provisional',true));
 select jsonb_agg(jsonb_build_object('key',x->>'key','display','batting')) into rows from jsonb_array_elements(ctx->'candidates') x;
 result:=public.team_of_week_api(c,'reserve_image',jsonb_build_object('id',gen_random_uuid(),'week_end',today,'include_provisional',true,'rows',rows,'title','Week 1','sha256',repeat('a',64),'bytes',1000));
 assert result->>'path' is not null,'Day 1 XI can be saved';
 ctx:=public.player_of_week_api(c,'context',jsonb_build_object('week_end',today,'include_provisional',true));
 select x into p from jsonb_array_elements(ctx->'candidates') x where x->>'player_id'=player::text;
 result:=public.player_of_week_api(c,'reserve_image',jsonb_build_object('id',gen_random_uuid(),'week_end',today,'include_provisional',true,'key',p->>'key','batting',p->'batting','bowling',p->'bowling','title','Week 1','sha256',repeat('b',64),'bytes',1000));
 assert result->>'path' is not null,'Day 1 Player of the Week can be saved';
 perform public.club_social_awards_api(c,'save_settings','{"revision":0,"enabled":["team_week","player_week","century","five_wickets","results"]}');
 ctx:=public.club_social_awards_api(c,'context',jsonb_build_object('week_end',today,'include_provisional',true));
 assert jsonb_array_length(ctx->'candidates')=3,'Century, five wickets and match update are available';
 select x into p from jsonb_array_elements(ctx->'candidates') x where x->>'kind'='century';
 req:=jsonb_build_object('id',eid,'kind','century','week_end',today,'include_provisional',true,'label','Century: Player 1','sha256',repeat('c',64),'bytes',1000,'sources',jsonb_build_array(jsonb_build_object('key',p->>'key','signature',p->>'signature')));
 result:=public.club_social_awards_api(c,'reserve_image',req);path:=result->>'path';
 insert into storage.objects(bucket_id,name,metadata) values('club-social-awards',path,'{"size":1000,"mimetype":"image/png"}');
 perform public.club_social_awards_api(c,'finish_image',jsonb_build_object('id',eid));
 ctx:=public.club_social_awards_api(c,'context',jsonb_build_object('week_end',today));
 assert ctx->'candidates'='[]' and ctx#>>'{editions,0,scores_current}'='true','Saved Day 1 graphic remains usable with checkbox off';
 assert (select scorecard=card from public.match_review_scorecards where id=sid),'Stored scorecard remains untouched';
 assert not has_function_privilege('authenticated','club_selection_private.award_scorecards(uuid,jsonb,boolean)','EXECUTE'),'Private helper is not client-callable';
end $tests$;
rollback;
select 'Day 1 eligibility, default-off, all awards, saved-graphic freshness and source isolation passed.' as result;
