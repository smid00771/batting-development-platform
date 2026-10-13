-- Synthetic club only. Every test row is rolled back.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();
 sid uuid:=gen_random_uuid();source_id uuid:=gen_random_uuid();our_id uuid:=gen_random_uuid();their_id uuid:=gen_random_uuid();
 edition uuid:=gen_random_uuid();ids uuid[];card jsonb;batters jsonb;bowlers jsonb;result jsonb;request jsonb;
 rows_json jsonb;path text;bg text;rejected boolean;u uuid;
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
  select jsonb_agg(jsonb_build_object('player_id',ids[n],'name','Test player '||n,'runs',n*5,'not_out',n=1,'status','played','importable',true)) into batters from generate_series(1,14) n;
  select jsonb_agg(jsonb_build_object('player_id',ids[n],'name','Test player '||n,'team_id',our_id,'wickets',3,'runs',20+n,'balls',30,'importable',true)) into bowlers from generate_series(8,14) n;
  card:=jsonb_build_object('schema_version',2,'provider','playcricket_au','status','completed','match_id',source_id,'url','https://play.cricket.com.au/match/'||source_id,'dates',jsonb_build_array('2026-10-10'),'grade','4th Grade',
   'teams',jsonb_build_array(jsonb_build_object('id',our_id,'name','Weekly Test Club'),jsonb_build_object('id',their_id,'name','Visitors')),
   'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',our_id,'number',1,'complete',true,'batters',batters,'bowlers','[]'::jsonb,'bowling_available',true),
    jsonb_build_object('id',gen_random_uuid(),'team_id',their_id,'number',1,'complete',true,'batters','[]'::jsonb,'bowlers',bowlers,'bowling_available',true)));
  insert into public.match_review_scorecards(id,club_id,source_match_id,fetched_by,scorecard) values(sid,c,source_id,adm,card);
  result:=public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}');
  assert result->'cards'->0->>'our_team'=our_id::text,'Club must be identified without asking';
  assert jsonb_array_length(result->'candidates')=14,'Batters and bowlers must be included once';
  assert (select (x->>'runs')::integer=40 and (x->>'wickets')::integer=3 from jsonb_array_elements(result->'candidates') x where x->>'player_id'=ids[8]::text),'Bowling belongs to the fielding team';
  assert public.team_of_week_api(c,'context','{"week_end":"2026-10-18"}')->'candidates'='[]'::jsonb,'No performance outside the week';
  assert club_batting_private.scorecard_club_team(c,card||jsonb_build_object('teams',jsonb_build_array(jsonb_build_object('id',our_id,'name','Weekly Test Club'),jsonb_build_object('id',their_id,'name','Weekly Test Club')))) is null,'Ambiguous clubs must not be guessed';
  assert jsonb_array_length(club_selection_private.team_week_candidates(jsonb_build_array(jsonb_build_object('snapshot_id',sid,'our_team',our_id,'scorecard',card||'{"status":"in_progress"}'::jsonb))))=0;
  bg:=c::text||'/backgrounds/'||gen_random_uuid()||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('club-team-week',bg,'{"size":1000,"mimetype":"image/png"}');
  perform public.team_of_week_api(c,'save_design',jsonb_build_object('revision',0,'background_path',bg,'layout',jsonb_build_object('includes_title',true,'top',580,'bottom',1260,'font_scale',100,'logo_scale',100,'text_colour','#FFFFFF','example_path',bg,'logo_path',bg)));
  assert public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'design'->>'background_path'=bg;
  rejected:=false;begin perform public.team_of_week_api(c,'save_design',jsonb_build_object('revision',1,'background_path',bg,'layout',jsonb_build_object('includes_title',true,'top',580,'bottom',1260,'example_path',other_c::text||'/backgrounds/'||gen_random_uuid()||'.png')));exception when raise_exception then rejected:=true;end;assert rejected,'Reference artwork must belong to this club';
  perform public.team_of_week_api(c,'save_design',jsonb_build_object('revision',1,'background_path',bg,'layout',jsonb_build_object('includes_title',false,'top',100,'bottom',1100,'show_logo',false,'logo_x',100,'logo_y',0,'logo_width',60,'title_y',400,'reference',jsonb_build_object('week_end','2026-10-11','names',jsonb_build_array(jsonb_build_object('name','Test player 1','grade','4TH'))))));
  assert public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'design'->'layout'->>'top'='100';
  rejected:=false;begin perform public.team_of_week_api(c,'save_design',jsonb_build_object('revision',2,'background_path',bg,'layout','{"includes_title":false,"top":620,"bottom":1200,"logo_x":101}'::jsonb));exception when raise_exception then rejected:=true;end;assert rejected,'Logo must stay inside the image';
  rejected:=false;begin perform public.team_of_week_api(c,'save_design',jsonb_build_object('revision',2,'background_path',bg,'layout','{"includes_title":false,"top":1190,"bottom":1200}'::jsonb));exception when raise_exception then rejected:=true;end;assert rejected,'Player rows need space';
  rejected:=false;begin perform public.team_of_week_api(c,'save_design',jsonb_build_object('revision',2,'background_path',bg,'layout','{"includes_title":false,"top":620,"bottom":1200,"reference":{"names":[{"name":""}]}}'::jsonb));exception when raise_exception then rejected:=true;end;assert rejected,'Empty example names rejected';
  select jsonb_agg(jsonb_build_object('key',x->>'key','display','batting')) into rows_json from (select x from jsonb_array_elements(result->'candidates') x limit 11) q;
  request:=jsonb_build_object('id',edition,'week_end','2026-10-11','title','Week 1','blurb','Great efforts across all grades.','rows',rows_json,'sha256',repeat('a',64),'bytes',1000);
  result:=public.team_of_week_api(c,'reserve_image',request);path:=result->>'path';
  assert (public.team_of_week_api(c,'reserve_image',request)->>'path')=path,'Retry must reuse the edition';
  assert club_selection_private.team_week_storage_allowed(path,true),'Author can upload pending edition';
  rejected:=false;begin perform public.team_of_week_api(c,'finish_image',jsonb_build_object('id',edition));exception when raise_exception then rejected:=true;end;assert rejected,'No archive without image';
  insert into storage.objects(bucket_id,name,metadata) values('club-team-week',path,'{"size":1000,"mimetype":"image/png"}');
  perform public.team_of_week_api(c,'finish_image',jsonb_build_object('id',edition));
  assert not club_selection_private.team_week_storage_allowed(path,true),'Sealed image is immutable';
  assert club_selection_private.team_week_storage_allowed(path,false),'Sealed image stays readable';
  assert jsonb_array_length(public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'history')=1;
  assert public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'history'->0->>'blurb'='Great efforts across all grades.';
  update public.clubs set primary_colour='#123456' where id=c;
  assert public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}')->'history'->0->>'image_path'=path;
  rejected:=false;begin perform public.team_of_week_api(c,'reserve_image',request||jsonb_build_object('id',gen_random_uuid(),'rows',jsonb_build_array(rows_json->0)|| (rows_json-10)));exception when raise_exception then rejected:=true;end;assert rejected;
  rejected:=false;begin perform public.team_of_week_api(other_c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club access denied';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  rejected:=false;begin perform public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary membership does not grant socials access';
  assert not club_selection_private.team_week_storage_allowed(path,false);
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.team_of_week_api(c,'context','{"week_end":"2026-10-11"}');exception when raise_exception then rejected:=true;end;assert rejected;
  raise exception using errcode='P0162',message='Rollback successful weekly tests';
 exception when sqlstate 'P0162' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Team of the Week database checks passed' as result;
