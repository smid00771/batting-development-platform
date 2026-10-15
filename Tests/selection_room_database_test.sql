-- Synthetic clubs and users only. All inserted rows are rolled back.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();
 admin_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();outsider_id uuid:=gen_random_uuid();u uuid;request_id uuid:=gen_random_uuid();video_id uuid:=gen_random_uuid();
 result jsonb;again jsonb;video jsonb;cursor_text text;rejected boolean;item text;call_id uuid;before_count integer;
begin
 begin
  -- Exercise the original pilot policy independently of commercial enablement.
  update club_selection_private.video_credit_config set managed_enabled=false;
  foreach u in array array[head_id,selector_id,admin_id,player_id,outsider_id] loop
   insert into auth.users(id,email) values(u,'selection-room-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic selector');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Selection Room Test','selection-room-'||c,head_id),(other_c,'Other Room Test','selection-room-'||other_c,outsider_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values
   (c,head_id,'player','none'),(c,selector_id,'player','none'),(c,admin_id,'admin','admin'),(c,player_id,'player','none'),(other_c,outsider_id,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id) values
   (c,'standalone','active','Australia/Sydney',head_id),(other_c,'standalone','active','Australia/Sydney',outsider_id);
  insert into club_selection_private.selectors(club_id,user_id) values(c,selector_id);
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.selection_room_api(c,'context');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Anonymous access rejected';
  foreach u in array array[player_id,admin_id,outsider_id] loop
   perform set_config('request.jwt.claim.sub',u::text,true);
   rejected:=false;begin perform public.selection_room_api(c,'context');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Players, unassigned admins and other clubs cannot read';
   rejected:=false;begin perform public.selection_room_api(c,'post',jsonb_build_object('body','No access','request_id',gen_random_uuid()));exception when insufficient_privilege then rejected:=true;end;assert rejected,'Cannot write either';
  end loop;
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  result:=public.selection_room_api(c,'context');assert result->'messages'='[]';assert not (result->>'can_manage')::boolean;
  assert not (public.selection_room_api(c,'access')->>'video_enabled')::boolean,'Video disabled by default';
  result:=public.selection_room_api(c,'post',jsonb_build_object('body','First discussion','request_id',request_id));
  again:=public.selection_room_api(c,'post',jsonb_build_object('body','First discussion','request_id',request_id));assert result=again,'Retry must return same message';cursor_text:=result->'message'->>'id';
  rejected:=false;begin perform public.selection_room_api(c,'post',jsonb_build_object('body','Changed body','request_id',request_id));exception when raise_exception then rejected:=true;end;assert rejected;
  rejected:=false;begin perform public.selection_room_api(c,'post',jsonb_build_object('body',repeat('x',1501),'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected;
  rejected:=false;begin perform public.selection_room_api(c,'save_backup','{"url":"https://meet.google.com/abc-defg-hij","revision":0}');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Only the head changes the fallback';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  assert (public.selection_room_api(c,'context')->>'can_manage')::boolean;
  foreach item in array array['https://evil.test/a','https://meet.google.com.evil.test/a','https://meet.google.com@evil.test/a','javascript:alert(1)'] loop
   rejected:=false;begin perform public.selection_room_api(c,'save_backup',jsonb_build_object('url',item,'revision',0));exception when raise_exception then rejected:=true;end;assert rejected,'Invalid meeting link rejected';
  end loop;
  result:=public.selection_room_api(c,'save_backup','{"url":"https://meet.google.com/abc-defg-hij","revision":0}');assert (result->>'revision')::integer=1;
  rejected:=false;begin perform public.selection_room_api(c,'save_backup','{"url":"https://meet.google.com/new-link","revision":0}');exception when raise_exception then rejected:=true;end;assert rejected,'Stale edit cannot overwrite another head edit';
  perform public.selection_room_api(c,'save_backup','{"url":"","revision":1}');assert public.selection_room_api(c,'context')->>'backup_url'='';
  insert into club_selection_private.selection_room_messages(club_id,author_id,author_name,body,request_id)
   select c,head_id,'Synthetic selector','History '||n,gen_random_uuid() from generate_series(1,105) n;
  result:=public.selection_room_api(c,'context');assert jsonb_array_length(result->'messages')=100;assert (result->>'has_older')::boolean;
  again:=public.selection_room_api(c,'context',jsonb_build_object('before',result->'messages'->0->>'id'));assert jsonb_array_length(again->'messages')=6;assert not (again->>'has_older')::boolean;
  result:=public.selection_room_api(c,'context',jsonb_build_object('after',cursor_text));assert jsonb_array_length(result->'messages')=100;
  result:=public.selection_room_api(c,'context',jsonb_build_object('after',result->'messages'->99->>'id'));assert jsonb_array_length(result->'messages')=5,'Forward paging loses no messages';
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);assert public.selection_room_api(other_c,'context')->'messages'='[]','Club histories isolated';
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  rejected:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',video_id));exception when raise_exception then rejected:=true;end;assert rejected,'Disabled video cannot reserve tokens';
  insert into club_selection_private.selection_video_policy(club_id,enabled,monthly_minutes) values(c,true,5000);
  video:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',video_id));assert (video->>'expires_at')::timestamptz>now();assert (video->>'expires_at')::timestamptz<=now()+interval '90 minutes';
  again:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',video_id));assert video=again,'Retry reserves once';
  assert (select count(*)=1 from club_selection_private.selection_video_entries where club_id=c);
  select e.call_id into call_id from club_selection_private.selection_video_entries e where e.id=video_id;
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  rejected:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',video_id));exception when raise_exception then rejected:=true;end;assert rejected,'Cannot reuse another selector token identity';
  again:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid()));assert again->>'room_name'=video->>'room_name','Selectors share their club call';
  update club_selection_private.selection_video_policy set monthly_minutes=0 where club_id=c;
  rejected:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Club allowance enforced';
  update club_selection_private.selection_video_policy set monthly_minutes=9000 where club_id=c;
  insert into club_selection_private.selection_video_policy(club_id,enabled,monthly_minutes) values(other_c,true,9000);
  insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes)
   select gen_random_uuid(),call_id,other_c,outsider_id,90 from generate_series(1,100);
  rejected:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Platform allowance enforced across clubs';
  update club_selection_private.selection_video_calls set expires_at=now()-interval '1 minute' where id=call_id;
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  rejected:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',video_id));exception when raise_exception then rejected:=true;end;assert rejected,'Expired reservation cannot reissue a token';
  delete from club_selection_private.selectors where club_id=c and user_id=selector_id;
  rejected:=false;begin perform public.selection_room_api(c,'context');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Revoked selector cannot read history';
  foreach item in array array['selection_room_settings','selection_room_messages','selection_video_policy','selection_video_calls','selection_video_entries'] loop
   assert not has_table_privilege('authenticated','club_selection_private.'||item,'SELECT,INSERT,UPDATE,DELETE');
   assert not has_table_privilege('anon','club_selection_private.'||item,'SELECT,INSERT,UPDATE,DELETE');
   assert (select relrowsecurity from pg_class where oid=('club_selection_private.'||item)::regclass);
  end loop;
  assert not has_function_privilege('anon','public.selection_room_api(uuid,text,jsonb)','EXECUTE');
  assert has_function_privilege('authenticated','public.selection_room_api(uuid,text,jsonb)','EXECUTE');
  raise exception using errcode='P0167',message='Rollback successful selection room tests';
 exception when sqlstate 'P0167' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_c));
end $tests$;
select 'Selection Room database tests passed; synthetic rows rolled back.' as result;
