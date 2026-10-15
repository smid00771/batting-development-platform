-- Synthetic accounts, club and published fixtures only. All changes roll back.
-- No messages, storage uploads or external social posts are created.
begin;
do $tests$
<<suite>>
declare c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();u uuid;
 fid uuid:=gen_random_uuid();other_fid uuid:=gen_random_uuid();players uuid[];slots jsonb;details jsonb;data jsonb;result jsonb;ctx jsonb;feature jsonb;
 trial_path text;k text;
 old_key text;new_key text;bad jsonb;rejected boolean;today date:=(now() at time zone 'Australia/Sydney')::date;
begin
 foreach u in array array[adm,ordinary] loop
  insert into auth.users(id,email) values(u,'photo-position-test-'||u::text||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Synthetic photo position test');
 end loop;
 insert into public.clubs(id,name,slug,created_by) values(c,'Temporary photo test','photo-test-'||c::text,adm);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,ordinary,'player','none');
 insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
 perform set_config('request.jwt.claim.sub',adm::text,true);
 players:=array(select gen_random_uuid() from generate_series(1,11));
 for i in 1..11 loop insert into club_selection_private.roster(id,club_id,name,active,keeper) values(players[i],c,'Test Player '||i,true,i=3);end loop;
 slots:=(select jsonb_agg(jsonb_build_object('d1',players[x],'d2',players[x]) order by x) from generate_series(1,11) x);
 details:=jsonb_build_object('grade','Test XI','opposition','Synthetic visitors','competition','Test','days',jsonb_build_array(jsonb_build_object('date',(today+2)::text),jsonb_build_object('date',(today+9)::text)),
 'format','long_form','cancelled',false,'brackets',false,'min_quicks',0,'min_batters',0,'staff','[]'::jsonb,
 'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',players[1],'captain_manual',true,'keeper_id',players[3],'keeper_manual',true),'d2',jsonb_build_object('captain_id',players[1],'captain_manual',true,'keeper_id',players[3],'keeper_manual',true)));
 insert into club_selection_private.fixtures(id,club_id,details,slots,publication) values(fid,c,details,slots,1),(other_fid,c,details||jsonb_build_object('opposition','Different synthetic visitors'),slots,1);
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id) where id in(fid,other_fid);
 old_key:=club_selection_private.social_artwork_key(fid);
 data:=jsonb_build_object('request_id',gen_random_uuid(),'fixture_id',fid,'publication',1,'days',jsonb_build_array(1,2),'revisions',jsonb_build_object('d1',0,'d2',0),'mode','player','roster_id',players[1],'photo_x',-9,'photo_y',6);
 result:=public.club_socials_api(c,'feature',data);assert result->>'saved'='true';
 assert public.club_socials_api(c,'feature',data)=result;
 assert (select count(*)=2 and bool_and(photo_x=-9 and photo_y=6 and revision=1) from club_selection_private.social_features where fixture_id=fid);
 ctx:=public.club_socials_api(c,'context','{}');
 select x into feature from jsonb_array_elements(ctx->'fixtures') x where x->>'id'=fid::text;
 assert jsonb_array_length(feature->'features')=2 and feature->'features'->0->>'photo_x'='-9' and feature->'features'->0->>'photo_y'='6';
 new_key:=club_selection_private.social_artwork_key(fid);assert new_key<>old_key;
 rejected:=false;begin perform public.club_socials_api(c,'validate_export',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',fid,'artwork_key',old_key))));exception when raise_exception then rejected:=true;end;assert rejected;
 assert public.club_socials_api(c,'validate_export',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',fid,'artwork_key',new_key))))->>'current'='true';
 -- Reject out-of-range, noninteger and wrong-type input without changing either day.
 foreach bad in array array['31'::jsonb,'-31'::jsonb,'1.5'::jsonb,'"7"'::jsonb,'null'::jsonb,'100'::jsonb] loop
  rejected:=false;begin perform public.club_socials_api(c,'feature',data||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',1,'d2',1),'photo_x',bad));exception when raise_exception then rejected:=true;end;assert rejected;
 end loop;
 rejected:=false;begin perform public.club_socials_api(c,'feature',data||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'Featured photo changed%';end;assert rejected;
 rejected:=false;begin perform public.club_socials_api(c,'feature',data||jsonb_build_object('request_id',gen_random_uuid(),'publication',2));exception when raise_exception then rejected:=sqlerrm like 'Published team changed%';end;assert rejected;
 assert (select bool_and(revision=1 and photo_y=6) from club_selection_private.social_features where fixture_id=fid);
 -- Moving one day leaves its other day and every other fixture unchanged.
 data:=data||jsonb_build_object('request_id',gen_random_uuid(),'days',jsonb_build_array(1),'revisions',jsonb_build_object('d1',1),'photo_x',5,'photo_y',-7);
 perform public.club_socials_api(c,'feature',data);
 assert (select photo_x=5 and photo_y=-7 and revision=2 from club_selection_private.social_features where fixture_id=fid and day=1);
 assert (select photo_x=-9 and photo_y=6 and revision=1 from club_selection_private.social_features where fixture_id=fid and day=2);
 assert not exists(select 1 from club_selection_private.social_features where fixture_id=other_fid);
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 rejected:=false;begin perform public.club_socials_api(c,'feature',data||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',2)));exception when raise_exception then rejected:=true;end;assert rejected;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 -- Reset and old clients that omit the new coordinates both use original placement.
 perform public.club_socials_api(c,'feature',(data-'photo_x'-'photo_y')||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',2)));
 assert (select photo_x=0 and photo_y=0 and revision=3 from club_selection_private.social_features where fixture_id=fid and day=1);

 -- An ongoing two-day fixture stays editable even when its first day is past.
 details:=details||jsonb_build_object('days',jsonb_build_array(jsonb_build_object('date',(today-7)::text),jsonb_build_object('date',today::text)));
 update club_selection_private.fixtures set details=suite.details,published=jsonb_set(published,'{details}',suite.details) where id=fid;
 data:=data||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',3));
 assert public.club_socials_api(c,'feature',data)->>'saved'='true';
 ctx:=public.club_socials_api(c,'context','{}');
 select x into feature from jsonb_array_elements(ctx->'fixture_calendar') x where x->>'id'=fid::text;
 assert feature->>'completed'='false' and feature->>'last_date'=today::text;
 -- Completion locks artwork even if selections are temporarily unlocked for corrections.
 details:=details||jsonb_build_object('days',jsonb_build_array(jsonb_build_object('date',(today-8)::text),jsonb_build_object('date',(today-1)::text)));
 update club_selection_private.fixtures set details=suite.details,published=jsonb_set(published,'{details}',suite.details),selection_unlocked_until=now()+interval '30 minutes' where id=fid;
 data:=data||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',4));
 rejected:=false;begin perform public.club_socials_api(c,'feature',data);exception when sqlstate 'P0159' then rejected:=true;end;assert rejected;
 assert (select revision=4 from club_selection_private.social_features where fixture_id=fid and day=1);
 new_key:=club_selection_private.social_artwork_key(fid);
 rejected:=false;begin perform club_selection_private.social_post_validate(c,jsonb_build_array(jsonb_build_object('id',fid,'artwork_key',new_key)));exception when raise_exception then rejected:=sqlerrm like 'This fixture is completed%';end;assert rejected,'Completed team announcements stay blocked when awards are enabled';
 foreach k in array array['validate_export','record_export'] loop
  rejected:=false;begin perform public.club_socials_api(c,k,jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fid,'artwork_key',new_key))));exception when sqlstate 'P0159' then rejected:=true;end;assert rejected;
 end loop;
 assert not exists(select 1 from club_selection_private.social_exports where fixture_id=fid);
 -- A photo upload cannot indirectly replace a completed fixture's featured player.
 trial_path:=c::text||'/photo/'||gen_random_uuid()::text||'.png';
 insert into storage.objects(bucket_id,name) values('club-socials',trial_path);
 rejected:=false;begin
  perform public.club_socials_api(c,'add_asset',jsonb_build_object('request_id',gen_random_uuid(),'kind','photo','roster_id',players[1],'path',trial_path,'label','Synthetic photo','feature',data));
 exception when sqlstate 'P0159' then rejected:=true;end;assert rejected;
 assert not exists(select 1 from club_selection_private.social_assets where club_id=c);
 -- Sydney's midnight, including daylight saving, determines completion.
 assert not club_selection_private.fixture_completed('{"days":[{"date":"2026-10-10"}]}','Australia/Sydney','2026-10-10 12:59:59+00');
 assert club_selection_private.fixture_completed('{"days":[{"date":"2026-10-10"}]}','Australia/Sydney','2026-10-10 13:00:00+00');
end
$tests$;
select 'Completed-fixture and photo-position database checks passed' as result;
rollback;
