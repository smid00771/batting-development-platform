-- Synthetic records only. The complete test transaction is rolled back.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid();source_id uuid:=gen_random_uuid();our_id uuid:=gen_random_uuid();their_id uuid:=gen_random_uuid();
 edition uuid:=gen_random_uuid();racing_edition uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();ids uuid[];card jsonb;result jsonb;request jsonb;candidate jsonb;refs jsonb;post_request jsonb;other_card jsonb;
 path text;bg text;rejected boolean;u uuid;first_signature text;first_key text;
begin
 begin
  foreach u in array array[adm,ordinary] loop
   insert into auth.users(id,email) values(u,'social-awards-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic social awards test');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Awards Test Club','awards-test-'||c,adm),(other_c,'Other Club','other-awards-'||other_c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  ids:=array(select gen_random_uuid() from generate_series(1,4));
  card:=jsonb_build_object('schema_version',2,'format_key','long_form','provider','playcricket_au','status','completed','match_id',source_id,'url','https://play.cricket.com.au/match/'||source_id,'dates',jsonb_build_array('2026-10-03','2026-10-10'),'grade','1st Grade',
   'teams',jsonb_build_array(jsonb_build_object('id',our_id,'name','Awards Test Club'),jsonb_build_object('id',their_id,'name','Visitors')),
   'innings',jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'team_id',our_id,'number',1,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',ids[1],'name','Century One','runs',100,'not_out',true,'status','played','importable',true),jsonb_build_object('player_id',ids[2],'name','Two Fifties','runs',60,'status','played','importable',true)),'bowlers','[]'::jsonb),
    jsonb_build_object('id',gen_random_uuid(),'team_id',their_id,'number',1,'complete',true,'batters','[]'::jsonb,'bowlers',jsonb_build_array(jsonb_build_object('player_id',ids[3],'name','Five Wickets','team_id',our_id,'wickets',5,'runs',24,'importable',true),jsonb_build_object('player_id',ids[4],'name','Two Threes','team_id',our_id,'wickets',3,'runs',30,'importable',true))),
    jsonb_build_object('id',gen_random_uuid(),'team_id',our_id,'number',2,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',ids[1],'name','Century One','runs',127,'status','played','importable',true),jsonb_build_object('player_id',ids[2],'name','Two Fifties','runs',60,'status','played','importable',true)),'bowlers','[]'::jsonb),
    jsonb_build_object('id',gen_random_uuid(),'team_id',their_id,'number',2,'complete',true,'batters','[]'::jsonb,'bowlers',jsonb_build_array(jsonb_build_object('player_id',ids[3],'name','Five Wickets','team_id',our_id,'wickets',6,'runs',42,'importable',true),jsonb_build_object('player_id',ids[4],'name','Two Threes','team_id',our_id,'wickets',3,'runs',30,'importable',true)))));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,source_id,adm,card);
  result:=public.club_social_awards_api(c,'context','{"week_end":"2026-10-11"}');
  assert (select count(*)=2 from jsonb_array_elements(result->'candidates') x where x->>'kind'='century'),'Two separate centuries, no sum of fifties';
  assert (select count(*)=2 from jsonb_array_elements(result->'candidates') x where x->>'kind'='five_wickets'),'Two separate five-fors, no sum of threes';
  assert jsonb_array_length(result->'candidates')=5,'Results and four innings milestones';
  assert public.club_social_awards_api(c,'context','{"week_end":"2026-10-04"}')->'candidates'='[]','Uses final day for two-day matches';
  other_card:=jsonb_set(card,'{status}','"in_progress"');
  assert club_selection_private.social_award_candidates(jsonb_build_array(jsonb_build_object('snapshot_id',sid,'our_team',our_id,'scorecard',other_card)))='[]','In-progress match cannot qualify';
  other_card:=jsonb_set(card,'{innings,3,complete}','false');
  assert club_selection_private.social_award_candidates(jsonb_build_array(jsonb_build_object('snapshot_id',sid,'our_team',our_id,'scorecard',other_card)))='[]','Unfinished innings cannot qualify';
  select x into candidate from jsonb_array_elements(result->'candidates') x where x->>'kind'='century' limit 1;
  first_key:=candidate->>'key';first_signature:=candidate->>'signature';
  result:=club_selection_private.social_award_candidates(jsonb_build_array(jsonb_build_object('snapshot_id',gen_random_uuid(),'our_team',our_id,'scorecard',card)));
  assert exists(select 1 from jsonb_array_elements(result) x where x->>'key'=first_key and x->>'signature'=first_signature),'Re-importing same scores preserves performance identity';
  perform public.club_social_awards_api(c,'save_settings','{"enabled":["century","five_wickets","results","team_week","player_week"],"revision":0}');
  rejected:=false;begin perform public.club_social_awards_api(c,'save_settings','{"enabled":[],"revision":0}');exception when raise_exception then rejected:=true;end;assert rejected,'Stale choices rejected';
  bg:=c::text||'/artwork/'||gen_random_uuid()||'.png';insert into storage.objects(bucket_id,name,metadata) values('club-social-awards',bg,'{"size":1000,"mimetype":"image/png"}');
  perform public.club_social_awards_api(c,'save_design',jsonb_build_object('kind','results','revision',0,'layout',jsonb_build_object('opponent_logos',jsonb_build_object(their_id::text,jsonb_build_object('path',bg,'name','Visitors')))));
  rejected:=false;begin perform public.club_social_awards_api(c,'save_design',jsonb_build_object('kind','century','revision',0,'layout',jsonb_build_object('background_path',other_c||'/artwork/'||gen_random_uuid()||'.png')));exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club artwork rejected';
  perform public.club_social_awards_api(c,'save_photo',jsonb_build_object('week_end','2026-10-11','kind','century','player_id',ids[1],'revision',0,'photo',jsonb_build_object('path',bg,'x',74,'y',38,'size',65)));
  assert public.club_social_awards_api(c,'save_photo',jsonb_build_object('week_end','2026-10-11','kind','century','player_id',ids[1],'revision',0,'photo',jsonb_build_object('path',bg,'x',74,'y',38,'size',65)))->>'revision'='1','Lost photo confirmation is idempotent';
  rejected:=false;begin perform public.club_social_awards_api(c,'save_photo',jsonb_build_object('week_end','2026-10-11','kind','century','player_id',ids[2],'revision',0,'photo',jsonb_build_object('path',bg,'x',50,'y',38,'size',65)));exception when raise_exception then rejected:=true;end;assert rejected,'Nonqualifying player rejected';
  request:=jsonb_build_object('id',edition,'kind','century','week_end','2026-10-11','sources',jsonb_build_array(jsonb_build_object('key',first_key,'signature',first_signature)),'label','Century · Century One','sha256',repeat('a',64),'bytes',1000);
  rejected:=false;begin perform public.club_social_awards_api(c,'reserve_image',jsonb_set(request,'{sources,0,signature}','"forged"'));exception when raise_exception then rejected:=true;end;assert rejected,'Invented figures rejected';
  result:=public.club_social_awards_api(c,'reserve_image',request);path:=result->>'path';
  assert public.club_social_awards_api(c,'reserve_image',request)->>'path'=path,'Retry retains image identity';
  assert club_selection_private.social_award_storage_allowed(path,true),'Author can upload';
  assert public.club_social_awards_api(c,'context','{"week_end":"2026-10-11"}')->'editions'='[]','Unconfirmed upload remains out of collection';
  rejected:=false;begin perform public.club_social_awards_api(c,'finish_image',jsonb_build_object('id',edition));exception when raise_exception then rejected:=true;end;assert rejected,'Missing upload rejected';
  perform public.club_social_awards_api(c,'reserve_image',request||jsonb_build_object('id',racing_edition));
  insert into storage.objects(bucket_id,name,metadata) values('club-social-awards',path,'{"size":1000,"mimetype":"image/png"}'),('club-social-awards',c||'/editions/'||racing_edition||'.png','{"size":1000,"mimetype":"image/png"}');
  perform public.club_social_awards_api(c,'finish_image',jsonb_build_object('id',edition));
  perform public.club_social_awards_api(c,'finish_image',jsonb_build_object('id',edition));
  rejected:=false;begin perform public.club_social_awards_api(c,'finish_image',jsonb_build_object('id',racing_edition));exception when raise_exception then rejected:=true;end;assert rejected,'Competing editor cannot confirm duplicate';
  assert not club_selection_private.social_award_storage_allowed(path,true),'Confirmed originals cannot be overwritten';
  result:=public.club_social_awards_api(c,'context','{"week_end":"2026-10-11"}');assert jsonb_array_length(result->'editions')=1 and result->'editions'->0->'performance_keys' ? first_key,'Confirmed graphic is in collection with its performance key';
  refs:=jsonb_build_array(jsonb_build_object('id',edition,'source_type','award','kind','century','artwork_key',repeat('a',64)));
  perform club_selection_private.social_post_validate(c,refs);
  rejected:=false;begin perform club_selection_private.social_post_validate(other_c,refs);exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club posting rejected';
  rejected:=false;begin perform club_selection_private.social_post_validate(c,jsonb_set(refs,'{0,artwork_key}','"forged"'));exception when raise_exception then rejected:=true;end;assert rejected,'Wrong award hash rejected';
  post_request:=jsonb_build_object('id',pid,'renderer','social-awards.178','fixtures',refs,'images',jsonb_build_array(jsonb_build_object('path',c||'/'||pid||'/0.jpg','fixture_id',edition,'sha256',repeat('b',64),'bytes',1000,'label','Century One')),'caption','Our round’s achievements.');
  result:=public.club_socials_publish_api(c,'draft',post_request);assert result->>'state'='draft' and result->>'caption'='Our round’s achievements.','Award uses same reviewed-post pipeline';
  assert public.club_socials_publish_api(c,'draft',post_request)->>'id'=pid::text,'Posting draft retry reuses identity';
  assert not exists(select 1 from club_selection_private.social_post_destinations d where d.post_id=pid),'Draft does not publish';
  rejected:=false;begin perform public.club_socials_publish_api(c,'draft',post_request||jsonb_build_object('id',gen_random_uuid(),'renderer','0.8.62.143'));exception when raise_exception then rejected:=true;end;assert rejected,'Team renderer cannot bypass award review';
  request:=jsonb_build_object('id',gen_random_uuid(),'name','Spirit of cricket','criteria','Club nomination','artwork_notes','Blue background','files',jsonb_build_array(jsonb_build_object('path',bg,'name','Example')));
  perform public.club_social_awards_api(c,'request',request);perform public.club_social_awards_api(c,'request',request);
  assert jsonb_array_length(public.club_social_awards_api(c,'context','{"week_end":"2026-10-11"}')->'requests')=1,'Request retries do not duplicate';
  rejected:=false;begin perform public.club_social_awards_api(null,'admin_context','{}');exception when raise_exception then rejected:=true;end;assert rejected,'Club admin cannot read platform queue';
  assert not has_table_privilege('authenticated','club_selection_private.social_award_editions','SELECT,INSERT,UPDATE,DELETE');
  assert not has_function_privilege('anon','public.club_social_awards_api(uuid,text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','club_selection_private.social_award_candidates(jsonb)','EXECUTE');
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  rejected:=false;begin perform public.club_social_awards_api(c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary player cannot access award editor';
  assert not club_selection_private.social_award_storage_allowed(path,false),'Ordinary player cannot read originals';
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.club_social_awards_api(c,'settings','{}');exception when raise_exception then rejected:=true;end;assert rejected,'Signed-out access denied';
  raise exception using errcode='P0178',message='Rollback successful Socials Awards tests';
 exception when sqlstate 'P0178' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Socials Awards database checks passed; all synthetic rows rolled back.' as result;
