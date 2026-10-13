-- Synthetic club and storage metadata only. Everything is rolled back.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid();source_id uuid:=gen_random_uuid();our_id uuid:=gen_random_uuid();their_id uuid:=gen_random_uuid();
 edition uuid:=gen_random_uuid();second_edition uuid:=gen_random_uuid();ids uuid[];card jsonb;batters jsonb;bowlers jsonb;result jsonb;request jsonb;candidate jsonb;
 path text;bg text;rejected boolean;u uuid;i integer;
begin
 begin
  foreach u in array array[adm,ordinary] loop
   insert into auth.users(id,email) values(u,'team-week-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic weekly test');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Weekly Test Club','weekly-test-'||c,adm),(other_c,'Other Club','other-weekly-'||other_c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  select array_agg(gen_random_uuid()) into ids from generate_series(1,14);
  select jsonb_agg(jsonb_build_object('player_id',ids[n],'name','Test player '||n,'runs',case when n=1 then 0 else n*5 end,'not_out',n=1,'status','played','importable',true)) into batters from generate_series(1,14) n;
  select jsonb_agg(jsonb_build_object('player_id',ids[n],'name','Test player '||n,'team_id',our_id,'wickets',case when n=14 then 0 else 3 end,'runs',20+n,'balls',30,'importable',true)) into bowlers from generate_series(8,14) n;
  card:=jsonb_build_object('schema_version',2,'format_key','limited_overs','provider','playcricket_au','status','completed','match_id',source_id,'url','https://play.cricket.com.au/match/'||source_id,'dates',jsonb_build_array('2026-10-10'),'grade','4th Grade',
   'teams',jsonb_build_array(jsonb_build_object('id',our_id,'name','Weekly Test Club'),jsonb_build_object('id',their_id,'name','Visitors')),
   'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',our_id,'number',1,'complete',true,'batters',batters,'bowlers','[]'::jsonb,'bowling_available',true),
    jsonb_build_object('id',gen_random_uuid(),'team_id',their_id,'number',1,'complete',true,'batters','[]'::jsonb,'bowlers',bowlers,'bowling_available',true)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,source_id,adm,card);
  result:=public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}');
  assert jsonb_array_length(result->'candidates')=14,'Both batting and bowling available';
  assert result->'history'='[]','No automatic winner';
  assert exists(select 1 from jsonb_array_elements(result->'candidates') p where p->>'player_id'=ids[1]::text and p->>'runs'='0'),'Ducks remain in imported performances';
  for i in 1..3 loop
   insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard)
    select c,id,adm,card||jsonb_build_object('match_id',id,'dates',jsonb_build_array(('2026-10-10'::date-i*7)::text)) from (select gen_random_uuid() id) q;
  end loop;
  result:=public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}');
  assert (select jsonb_array_length(p->'previous')=3 and (p->'previous'->0->>'runs')::integer=0 from jsonb_array_elements(result->'candidates') p where p->>'player_id'=ids[1]::text),'Comparable history includes ducks';

  candidate:=result->'candidates'->0;
  perform public.player_of_week_api(c,'profile',jsonb_build_object('week_end','2026-10-11','player_id',candidate->>'player_id','stage','emerging','note','First senior fifty','revision',0));
  assert public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'profiles'->(candidate->>'player_id')->>'stage'='emerging';
  rejected:=false;begin perform public.player_of_week_api(c,'profile',jsonb_build_object('week_end','2026-10-11','player_id',candidate->>'player_id','stage','experienced','revision',0));exception when raise_exception then rejected:=true;end;assert rejected,'Stale context cannot overwrite a colleague';
  bg:=c::text||'/artwork/'||gen_random_uuid()||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('club-player-week',bg,'{"size":1000,"mimetype":"image/png"}');
  perform public.player_of_week_api(c,'save_design',jsonb_build_object('revision',0,'layout',jsonb_build_object('background_path',bg,'photo_x',50,'text_colour','#FFFFFF')));
  assert public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'design'->'layout'->>'background_path'=bg;
  rejected:=false;begin perform public.player_of_week_api(c,'save_design',jsonb_build_object('revision',1,'layout',jsonb_build_object('logo_path',other_c::text||'/artwork/'||gen_random_uuid()||'.png')));exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club artwork rejected';
  rejected:=false;begin perform public.player_of_week_api(c,'save_design','{"revision":1,"layout":{"photo_x":101}}');exception when raise_exception then rejected:=true;end;assert rejected,'Invalid positions rejected';
  request:=jsonb_build_object('id',edition,'week_end','2026-10-11','key',candidate->>'key','batting',candidate->'batting','bowling',candidate->'bowling','title','Week 1','blurb','A great performance','sha256',repeat('a',64),'bytes',1000,'previous_id',null,'photo_path',bg);
  rejected:=false;begin perform public.player_of_week_api(c,'reserve_image',request||jsonb_build_object('batting','[]'::jsonb));exception when raise_exception then rejected:=true;end;assert rejected,'Invented figures rejected';
  result:=public.player_of_week_api(c,'reserve_image',request);path:=result->>'path';
  assert public.player_of_week_api(c,'reserve_image',request)->>'path'=path,'Retry reuses image';
  assert club_selection_private.player_week_storage_allowed(path,true),'Author can upload reserved image';
  assert public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'history'='[]','Unfinished uploads are not awards';
  rejected:=false;begin perform public.player_of_week_api(c,'finish_image',jsonb_build_object('id',edition));exception when raise_exception then rejected:=true;end;assert rejected,'Image required before final award';
  perform public.player_of_week_api(c,'reserve_image',request||jsonb_build_object('id',second_edition));
  insert into storage.objects(bucket_id,name,metadata) values('club-player-week',path,'{"size":1000,"mimetype":"image/png"}');
  perform public.player_of_week_api(c,'finish_image',jsonb_build_object('id',edition));
  perform public.player_of_week_api(c,'finish_image',jsonb_build_object('id',edition));
  assert not club_selection_private.player_week_storage_allowed(path,true),'Saved image is immutable';
  assert club_selection_private.player_week_storage_allowed(path,false),'Saved image is readable';
  assert jsonb_array_length(public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'history')=1;
  assert public.player_of_week_api(c,'context','{"week_end":"2026-10-18"}')->'candidates'='[]','No current-week leakage';
  assert public.player_of_week_api(c,'context','{"week_end":"2026-10-18"}')->'history'->0->'winner'->>'name'=candidate->>'name';
  rejected:=false;begin perform public.player_of_week_api(c,'finish_image',jsonb_build_object('id',second_edition));exception when raise_exception then rejected:=true;end;assert rejected,'Concurrent winner cannot overwrite the confirmed winner';
  rejected:=false;begin perform public.player_of_week_api(c,'reserve_image',request||jsonb_build_object('id',gen_random_uuid(),'key','not-a-candidate','previous_id',edition));exception when raise_exception then rejected:=true;end;assert rejected,'Unknown player rejected';
  assert public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'history'='[]','Team of the Week remains separate';
  assert not has_table_privilege('authenticated','club_selection_private.player_week_editions','SELECT,INSERT,UPDATE,DELETE');
  assert not has_function_privilege('anon','public.player_of_week_api(uuid,text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','club_selection_private.player_week_candidates(uuid,jsonb)','EXECUTE');
  rejected:=false;begin perform public.player_of_week_api(other_c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club API access denied';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  rejected:=false;begin perform public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary player cannot read award-editor context';
  assert not club_selection_private.player_week_storage_allowed(path,false),'Ordinary player cannot read award originals';
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.player_of_week_api(c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then rejected:=true;end;assert rejected,'Signed-out access denied';
  raise exception using errcode='P0172',message='Rollback successful award tests';
 exception when sqlstate 'P0172' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Player of the Week database checks passed; synthetic rows rolled back.' as result;
