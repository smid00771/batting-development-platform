-- Synthetic clubs and users; the deliberate exception rolls all fixtures back.
do $tests$
declare c uuid;u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();rid uuid;r jsonb;again jsonb;pilot boolean;blocked boolean;
begin
 begin
  insert into auth.users(id,email) values(u,'call-mode-'||u||'@example.invalid'),(v,'call-mode-'||v||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Mode test head'),(v,'Mode test selector');
  update club_selection_private.video_credit_config set managed_enabled=true;
  foreach pilot in array array[true,false] loop
   c:=gen_random_uuid();rid:=gen_random_uuid();
   insert into public.clubs(id,name,slug,created_by) values(c,'Call mode test','call-mode-'||c,u);
   insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'player','none'),(c,v,'player','none');
   insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id) values(c,'standalone','active','Australia/Sydney',u);
   insert into club_selection_private.selectors(club_id,user_id) values(c,v);
   if pilot then insert into club_selection_private.selection_video_policy(club_id,enabled,monthly_minutes) values(c,true,5000);end if;
   perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('role','authenticated',true);
   assert public.selection_room_api(c,'access')->'active_call'='null'::jsonb;
   r:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',rid));
   assert r->>'call_mode'='audio','New calls default to audio-only';
   again:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',rid,'use_video',true));
   assert again=r,'Retry cannot upgrade the original audio reservation';
   perform set_config('request.jwt.claim.sub',v::text,true);
   again:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid(),'use_video',true,'call_mode','video'));
   assert again->>'call_mode'='audio' and again->>'room_name'=r->>'room_name','A later selector inherits audio even if they request video';
   assert public.selection_room_api(c,'access')#>>'{active_call,mode}'='audio';
   assert public.selection_room_api(c,'context')#>>'{active_call,mode}'='audio';
   blocked:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid(),'use_video','true'));exception when raise_exception then blocked:=true;end;assert blocked,'Mode must be a boolean';
   assert not has_table_privilege('authenticated','club_selection_private.selection_video_calls','UPDATE');
   perform set_config('role','postgres',true);
   assert (select count(*)=2 from club_selection_private.selection_video_entries where club_id=c),'Retries and invalid choices do not reserve again';
   update club_selection_private.selection_video_calls set expires_at=now()-interval '1 minute' where club_id=c;
   perform set_config('role','authenticated',true);
   assert public.selection_room_api(c,'context')->'active_call'='null'::jsonb;
   again:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid(),'use_video',true));
   assert again->>'call_mode'='video' and again->>'room_name'<>r->>'room_name','Video requires a new room';
   r:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid(),'use_video',false));
   assert r->>'call_mode'='video' and r->>'room_name'=again->>'room_name','An existing video room also keeps its mode';
   perform set_config('role','postgres',true);
  end loop;
  assert not has_function_privilege('authenticated','club_selection_private.selection_room_api_before_credits(uuid,text,jsonb)','EXECUTE');
  raise exception using errcode='P0229',message='Rollback call mode fixtures';
 exception when sqlstate 'P0229' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Call modes: audio default, room-wide inheritance, retries, access boundaries and new video rooms passed for pilot and annual clubs; fixtures rolled back' as result;
