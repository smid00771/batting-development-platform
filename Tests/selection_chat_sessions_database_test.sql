-- Synthetic clubs/users only, rolled back. No billing settings, payments or reservations are changed.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();
 outsider_id uuid:=gen_random_uuid();u uuid;call_id uuid:=gen_random_uuid();next_call uuid:=gen_random_uuid();request_id uuid:=gen_random_uuid();
 result jsonb;again jsonb;chat_key text;rejected boolean;
begin
 begin
  foreach u in array array[head_id,selector_id,outsider_id] loop
   insert into auth.users(id,email) values(u,'selection-chat-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic selector');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Chat Session Test','chat-session-'||c,head_id),(other_c,'Other Chat Test','chat-session-'||other_c,outsider_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,head_id,'player','none'),(c,selector_id,'player','none'),(other_c,outsider_id,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id) values(c,'standalone','active','Australia/Sydney',head_id),(other_c,'standalone','active','Australia/Sydney',outsider_id);
  insert into club_selection_private.selectors(club_id,user_id) values(c,selector_id);
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.selection_room_api(c,'context');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Anonymous cannot read chat';
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  rejected:=false;begin perform public.selection_room_api(c,'context');exception when insufficient_privilege then rejected:=true;end;assert rejected,'Another club cannot read chat';
  perform public.selection_room_api(other_c,'post',jsonb_build_object('body','Other club','request_id',gen_random_uuid(),'chat_session','waiting'));
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  result:=public.selection_room_api(c,'context');assert result->>'chat_session'='waiting';assert result->'messages'='[]';
  perform public.selection_room_api(c,'post',jsonb_build_object('body','Before first call','request_id',request_id,'chat_session','waiting'));
  update club_selection_private.selection_room_messages set created_at=now()-interval '3 hours' where club_id=c;
  insert into club_selection_private.selection_video_calls(id,club_id,created_at,expires_at,call_mode) values(call_id,c,now()-interval '2 minutes',now()+interval '58 minutes','audio');
  result:=public.selection_room_api(c,'context');chat_key:=result->>'chat_session';
  assert chat_key='call:'||call_id;assert result->'messages'='[]','A new call discards pre-call comments';assert not (result->>'has_older')::boolean;
  assert not exists(select 1 from club_selection_private.selection_room_messages where club_id=c),'Old comments deleted, not hidden';
  rejected:=false;begin perform public.selection_room_api(c,'post',jsonb_build_object('body','Before first call','request_id',request_id,'chat_session','waiting'));exception when sqlstate 'P0230' then rejected:=true;end;assert rejected,'An old retry cannot re-create a discarded comment';
  request_id:=gen_random_uuid();
  result:=public.selection_room_api(c,'post',jsonb_build_object('body','Current call comment','request_id',request_id,'chat_session',chat_key));
  again:=public.selection_room_api(c,'post',jsonb_build_object('body','Current call comment','request_id',request_id,'chat_session',chat_key));assert result=again,'Same-call retries stay idempotent';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  again:=public.selection_room_api(c,'context');assert again->>'chat_session'=chat_key;assert jsonb_array_length(again->'messages')=1,'Another selector sees the same live call';
  perform club_selection_private.purge_selection_chat_messages(c);
  assert (select count(*)=1 from club_selection_private.selection_room_messages where club_id=c),'Cleanup retains active call comments';
  -- Expiry is the shared end boundary; one participant leaving cannot clear another's chat.
  update club_selection_private.selection_room_messages set created_at=now()-interval '90 seconds' where club_id=c;
  update club_selection_private.selection_video_calls set expires_at=now()-interval '1 minute' where id=call_id;
  perform club_selection_private.purge_selection_chat_messages(c);
  assert not exists(select 1 from club_selection_private.selection_room_messages where club_id=c),'Expired call comments deleted without a client request';
  assert (select count(*)=1 from club_selection_private.selection_room_messages where club_id=other_c),'Club-scoped cleanup cannot touch another club';
  result:=public.selection_room_api(c,'context');chat_key:=result->>'chat_session';assert chat_key='after:'||call_id;assert result->'messages'='[]';
  perform public.selection_room_api(c,'post',jsonb_build_object('body','Between calls','request_id',gen_random_uuid(),'chat_session',chat_key));
  update club_selection_private.selection_room_messages set created_at=now()-interval '10 seconds' where club_id=c;
  insert into club_selection_private.selection_video_calls(id,club_id,created_at,expires_at,call_mode) values(next_call,c,now(),now()+interval '90 minutes','video');
  result:=public.selection_room_api(c,'context');assert result->>'chat_session'='call:'||next_call;assert result->'messages'='[]','The next video call also starts empty';
  assert not exists(select 1 from club_selection_private.selection_room_messages where club_id=c);
  rejected:=false;begin perform public.selection_room_api(c,'post',jsonb_build_object('body','Stale between-call send','request_id',gen_random_uuid(),'chat_session',chat_key));exception when sqlstate 'P0230' then rejected:=true;end;assert rejected;
  assert not has_function_privilege('anon','public.selection_room_api(uuid,text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','club_selection_private.selection_chat_window(uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','club_selection_private.purge_selection_chat_messages(uuid)','EXECUTE');
  assert not has_function_privilege('authenticated','club_selection_private.selection_room_api_before_credits(uuid,text,jsonb)','EXECUTE');
  assert not has_table_privilege('authenticated','club_selection_private.selection_room_messages','SELECT,INSERT,UPDATE,DELETE');
  assert (select relrowsecurity from pg_class where oid='club_selection_private.selection_room_messages'::regclass);
  raise exception using errcode='P0231',message='Rollback synthetic chat tests';
 exception when sqlstate 'P0231' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_c));
end $tests$;
select 'Temporary selection chat tests passed; synthetic rows rolled back.' as result;
