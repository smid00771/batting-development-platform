-- Synthetic clubs, scorecards and storage records; never retain test data.
begin;
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();
 sg uuid:=gen_random_uuid();sg2 uuid:=gen_random_uuid();g uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();foreign_g uuid:=gen_random_uuid();
 f uuid;abandoned uuid:=gen_random_uuid();mid uuid;our uuid:=gen_random_uuid();their uuid:=gen_random_uuid();sid uuid;eid uuid;team_eid uuid;all_eid uuid;
 first_fixture uuid;card jsonb;bats jsonb;ctx jsonb;scope jsonb;other_scope jsonb;req jsonb;r jsonb;p jsonb;rows jsonb;wrong_rows jsonb;refs jsonb;denied boolean;i integer;k text;
begin
 insert into auth.users(id,email) values(u,'scopes-'||u||'@example.invalid'),(ordinary,'scopes-'||ordinary||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic award scope admin'),(ordinary,'Synthetic member');
 insert into public.clubs(id,name,slug,created_by) values(c,'Scope Test Club','scopes-'||c,u),(other_c,'Other Scope Club','scopes-'||other_c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin'),(c,ordinary,'player','none');
 insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
 insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Grade cricket',false),(sg2,c,'Masters',false);
 insert into public.playing_groups(id,club_id,name,batting_enabled) values(g,c,'First XI',false),(g2,c,'Masters XI',false),(foreign_g,other_c,'Foreign XI',false);
 insert into club_selection_private.selection_group_grades values(c,g,sg),(c,g2,sg2);
 perform set_config('request.jwt.claim.sub',u::text,true);
 for i in 1..2 loop
  f:=gen_random_uuid();mid:=gen_random_uuid();sid:=gen_random_uuid();if i=1 then first_fixture:=f;end if;
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(f,c,jsonb_build_object('grade_group_id',case when i=1 then g else g2 end,'grade',case when i=1 then 'First XI' else 'Masters XI' end,'format','limited_overs','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date','2026-10-17'))),'[]');
  insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,season_id,grade_id,team_id,source_fixture,summary)
   values(f,c,mid,gen_random_uuid(),gen_random_uuid(),our,'{"source_status":"FINAL"}','{"complete":true,"has_figures":true}');
  select jsonb_agg(jsonb_build_object('player_id',gen_random_uuid(),'name','Player '||i||'-'||n,'runs',case when n=1 then 110 else 30 end,'not_out',false,'dismissal','Bowled','status','played','importable',true)) into bats from generate_series(1,11) n;
  card:=jsonb_build_object('schema_version',2,'provider','playhq_au','status','completed','source_status','FINAL','match_id',mid,'url','https://www.playhq.com/cricket-australia/org/test/game-centre/'||mid,
   'format_key','limited_overs','grade','Provider grade '||i,'dates',jsonb_build_array('2026-10-17'),'result','Scope Test Club won by 20 runs',
   'teams',jsonb_build_array(jsonb_build_object('id',our,'name','Scope Test Club'),jsonb_build_object('id',their,'name','Visitors')),
   'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',our,'number',1,'complete',true,'bowling_available',true,'batters',bats,'bowlers','[]'::jsonb),
    jsonb_build_object('id',gen_random_uuid(),'team_id',their,'number',1,'complete',true,'bowling_available',true,'batters','[]'::jsonb,'bowlers',jsonb_build_array(jsonb_build_object('player_id',bats->0->>'player_id','name',bats->0->>'name','team_id',our,'wickets',5,'runs',20,'importable',true)))));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,mid,u,card);
 end loop;
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(abandoned,c,jsonb_build_object('grade_group_id',g2,'grade','Masters XI','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date','2026-10-14'))),'[]');
 insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,season_id,grade_id,team_id,source_fixture,summary) values(abandoned,c,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),our,'{"source_status":"ABANDONED","cancelled":false}','{"complete":false,"has_figures":false}');
 assert club_selection_private.fixture_source_no_play(c,abandoned)='abandoned','Provider abandonment requires no volunteer flag';
 update club_selection_private.playhq_links set source_fixture='{"source_status":"ABANDONED"}',summary='{"has_figures":false}' where fixture_id=first_fixture;
 assert club_selection_private.fixture_source_no_play(c,first_fixture) is null,'Existing genuine figures survive an abandonment status';
 ctx:=public.club_match_results_api(c,'context','{"week_end":"2026-10-18"}');
 assert jsonb_array_length(ctx->'fixtures')=3,'All includes every fixture';
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') x where x->>'id'=abandoned::text and x->>'no_play'='abandoned'),'Coverage knows abandoned fixture needs no scores';
 scope:=club_selection_private.award_scope(c,jsonb_build_object('mode','groups','ids',jsonb_build_array(sg)));
 other_scope:=club_selection_private.award_scope(c,jsonb_build_object('mode','grades','ids',jsonb_build_array(g2)));
 req:=jsonb_build_object('kind','team_week','revision',0,'request_id',gen_random_uuid(),'award_scope',scope);
 r:=public.club_social_awards_api(c,'save_scope',req);
 assert r->>'revision'='1' and r#>>'{award_scope,label}'='Grade cricket','Club choice saved';
 assert public.club_social_awards_api(c,'save_scope',req)=r,'Retry is idempotent';
 assert public.club_social_awards_api(c,'scope_context','{"kind":"player_week"}')#>>'{award_scope,key}'='all','Awards have independent choices';
 denied:=false;begin perform public.club_social_awards_api(c,'save_scope',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then denied:=true;end;assert denied,'Stale choice cannot overwrite';
 denied:=false;begin perform public.club_social_awards_api(c,'scope_context',jsonb_build_object('kind','unknown'));exception when raise_exception then denied:=true;end;assert denied,'Only real award types';
 denied:=false;begin perform public.team_of_week_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_scope',jsonb_build_object('mode','grades','ids',jsonb_build_array(foreign_g))));exception when raise_exception then denied:=true;end;assert denied,'Foreign grade rejected by server';
 denied:=false;begin perform public.team_of_week_api(c,'context','{"week_end":"2026-10-18","award_scope":{"mode":"groups","ids":[]}}');exception when raise_exception then denied:=true;end;assert denied,'Empty selection never becomes All';
 ctx:=public.team_of_week_api(c,'context','{"week_end":"2026-10-18"}');
 assert jsonb_array_length(ctx->'candidates')=22,'Old clients retain All despite a saved preference';
 ctx:=public.team_of_week_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_scope',scope));
 assert jsonb_array_length(ctx->'candidates')=11,'Stable fixture link resolves a different provider grade name without Club Batting';
 select jsonb_agg(jsonb_build_object('key',x->>'key','display','batting')) into rows from jsonb_array_elements(ctx->'candidates') x;
 ctx:=public.club_match_results_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_scope',scope));
 assert jsonb_array_length(ctx->'fixtures')=1 and jsonb_array_length(ctx->'cards')=1,'Score checks and candidates use identical groups';
 ctx:=public.player_of_week_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_scope',other_scope));
 assert jsonb_array_length(ctx->'candidates')=11,'Individual grade selection works';
 select jsonb_agg(jsonb_build_object('key',x->>'key','display','batting')) into wrong_rows from jsonb_array_elements(ctx->'candidates') x;
 denied:=false;begin perform public.team_of_week_api(c,'reserve_image',jsonb_build_object('id',gen_random_uuid(),'week_end','2026-10-18','award_scope',scope,'rows',wrong_rows,'title','Week 2','sha256',repeat('a',64),'bytes',1000));exception when raise_exception then denied:=true;end;assert denied,'Excluded players cannot be saved through a forged request';
 for i in 1..2 loop
  eid:=gen_random_uuid();if i=1 then team_eid:=eid;else all_eid:=eid;end if;
  req:=jsonb_build_object('id',eid,'week_end','2026-10-18','award_scope',case when i=1 then scope else club_selection_private.award_scope(c,null) end,'rows',rows,'title','Week 2','sha256',repeat('a',64),'bytes',1000);
  r:=public.team_of_week_api(c,'reserve_image',req);
  assert public.team_of_week_api(c,'reserve_image',req)=r,'Reservation retry is stable';
  insert into storage.objects(bucket_id,name,metadata) values('club-team-week',r->>'path','{"size":1000}');
  perform public.team_of_week_api(c,'finish_image',jsonb_build_object('id',eid));
 end loop;
 assert (select count(*)=2 from club_selection_private.social_award_collection(c,'2026-10-18') where kind='team_week'),'Group and club-wide editions coexist';
 select jsonb_agg(jsonb_build_object('id',e.id,'source_type','award','kind',e.kind,'artwork_key',e.image_sha)) into refs from club_selection_private.social_award_collection(c,'2026-10-18') e;
 perform club_selection_private.social_post_validate(c,refs);
 ctx:=public.club_match_results_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_edition_ids',jsonb_build_array(team_eid)));
 assert jsonb_array_length(ctx->'fixtures')=1,'Post preflight uses saved award scope';
 ctx:=public.club_match_results_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_edition_ids',jsonb_build_array(team_eid,all_eid)));
 assert jsonb_array_length(ctx->'fixtures')=3,'Combined post checks union of included scopes';
 for i in 1..2 loop
  ctx:=public.player_of_week_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_scope',case when i=1 then scope else club_selection_private.award_scope(c,null) end));p:=ctx->'candidates'->0;eid:=gen_random_uuid();
  req:=jsonb_build_object('id',eid,'week_end','2026-10-18','award_scope',ctx->'award_scope','key',p->>'key','batting',p->'batting','bowling',p->'bowling','title','Week 2','sha256',repeat('b',64),'bytes',1000);
  r:=public.player_of_week_api(c,'reserve_image',req);
  insert into storage.objects(bucket_id,name,metadata) values('club-player-week',r->>'path','{"size":1000}');
  perform public.player_of_week_api(c,'finish_image',jsonb_build_object('id',eid));
 end loop;
 assert (select count(*)=2 from club_selection_private.social_award_collection(c,'2026-10-18') where kind='player_week'),'Winners and concurrency locks are scoped';
 perform public.club_social_awards_api(c,'save_settings','{"revision":0,"enabled":["team_week","player_week","results","century","five_wickets"]}');
 foreach k in array array['results','century','five_wickets'] loop
  for i in 1..2 loop
   ctx:=public.club_social_awards_api(c,'context',jsonb_build_object('kind',k,'week_end','2026-10-18','award_scope',case when i=1 then scope else club_selection_private.award_scope(c,null) end));
   assert (select count(*) from jsonb_array_elements(ctx->'candidates') x where x->>'kind'=k)=i,'All three additional awards filter candidates';
   select x into p from jsonb_array_elements(ctx->'candidates') x where x->>'kind'=k order by x->>'key' limit 1;
   eid:=gen_random_uuid();req:=jsonb_build_object('id',eid,'kind',k,'week_end','2026-10-18','award_scope',ctx->'award_scope','label',k||' Week 2','sha256',repeat('c',64),'bytes',1000,'sources',jsonb_build_array(jsonb_build_object('key',p->>'key','signature',p->>'signature')));
   r:=public.club_social_awards_api(c,'reserve_image',req);
   insert into storage.objects(bucket_id,name,metadata) values('club-social-awards',r->>'path','{"size":1000}');
   perform public.club_social_awards_api(c,'finish_image',jsonb_build_object('id',eid));
  end loop;
 end loop;
 ctx:=public.club_social_awards_api(c,'context',jsonb_build_object('week_end','2026-10-18','award_scope',other_scope));
 assert not exists(select 1 from jsonb_array_elements(ctx->'editions') e where e->>'scores_current'<>'true'),'Editing another scope does not invalidate saved graphics';
 assert not has_table_privilege('authenticated','club_selection_private.social_award_scope_preferences','SELECT');
 assert not has_function_privilege('authenticated','club_selection_private.award_scope_api(uuid,text,jsonb)','EXECUTE');
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 denied:=false;begin perform public.club_social_awards_api(c,'scope_context','{"kind":"team_week"}');exception when raise_exception then denied:=true;end;assert denied,'Ordinary member cannot manage award choices';
end $tests$;
rollback;
select 'Award scopes, all five awards, saved editions, posting, no-play and permissions passed.' as result;
