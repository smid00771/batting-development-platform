-- Synthetic identities only. The successful test raises and catches a private
-- exception so all rows and permission changes roll back inside this statement.
do $tests$
declare c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();viewer uuid:=gen_random_uuid();editor uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();
 g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();u uuid;meeting_id uuid;call_id uuid:=gen_random_uuid();request_id uuid:=gen_random_uuid();
 ctx jsonb;result jsonb;again jsonb;rejected boolean;locks_before bigint;wallets_before bigint;start_time timestamptz;elapsed_ms numeric;
begin
 begin
  foreach u in array array[adm,head_id,viewer,editor,outsider] loop
   insert into auth.users(id,email,email_confirmed_at) values(u,u||'@example.invalid',now());
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic meeting test');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Meeting test','meeting-'||c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,head_id,'player','none'),(c,viewer,'player','none'),(c,editor,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id) values(c,'standalone','active','Australia/Sydney',head_id);
  insert into club_selection_private.selection_groups(id,club_id,name) values(g1,c,'Saturday'),(g2,c,'Masters');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  ctx:=public.selection_group_permissions(c,'context');
  perform public.selection_group_permissions(c,'save_group',jsonb_build_object('group_id',g1,'head_id',head_id,'revision',ctx->>'revision','request_id',gen_random_uuid(),
   'members',jsonb_build_array(jsonb_build_object('user_id',head_id,'access','edit'),jsonb_build_object('user_id',viewer,'access','view'),jsonb_build_object('user_id',editor,'access','edit'))));
  foreach u in array array[adm,outsider] loop
   perform set_config('request.jwt.claim.sub',u::text,true);
   rejected:=false;begin perform public.selection_room_api(c,'meeting',jsonb_build_object('selection_group_id',g1));exception when insufficient_privilege then rejected:=true;end;assert rejected,'Admins and outsiders do not gain selector access';
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.selection_room_api(c,'context',jsonb_build_object('selection_group_id',g1));exception when insufficient_privilege then rejected:=true;end;assert rejected,'Anonymous chat denied';
  perform set_config('request.jwt.claim.sub',editor::text,true);
  select count(*) into locks_before from pg_locks where pid=pg_backend_pid() and locktype='advisory';
  select count(*) into wallets_before from club_selection_private.video_credit_accounts where club_id=c;
  start_time:=clock_timestamp();
  result:=public.selection_room_api(c,'context',jsonb_build_object('selection_group_id',g1));
  elapsed_ms:=extract(epoch from clock_timestamp()-start_time)*1000;
  assert result->'messages'='[]' and (result->>'can_post')::boolean;
  assert (select count(*) from pg_locks where pid=pg_backend_pid() and locktype='advisory')=locks_before,'Chat read acquires no advisory locks';
  assert (select count(*) from club_selection_private.video_credit_accounts where club_id=c)=wallets_before,'Chat read does not create or calculate a wallet';
  result:=public.selection_room_api(c,'start_meeting',jsonb_build_object('selection_group_id',g1,'request_id',request_id));
  assert (result->>'active')::boolean;meeting_id:=(result->>'id')::uuid;
  again:=public.selection_room_api(c,'start_meeting',jsonb_build_object('selection_group_id',g1,'request_id',gen_random_uuid()));assert again=result,'Concurrent starts share one active meeting';
  assert not exists(select 1 from club_selection_private.selection_video_calls where club_id=c),'Starting a meeting cannot reserve a paid call';
  ctx:=public.club_selections_api(c,'context');assert exists(select 1 from jsonb_array_elements(ctx->'selection_meetings') m where m->>'scope_id'=g1::text and (m->>'active')::boolean),'Board includes shared meeting status without a chat request';
  rejected:=false;begin perform public.club_season_stats_api(c,'context');exception when sqlstate 'P0285' then rejected:=true;end;assert rejected,'Older clients cannot recalculate season evidence during a meeting';
  perform set_config('request.jwt.claim.sub',viewer::text,true);
  result:=public.selection_room_api(c,'meeting',jsonb_build_object('selection_group_id',g1));assert (result->>'active')::boolean and not (result->>'can_manage')::boolean,'Viewers see shared status without edit rights';
  result:=public.selection_room_api(c,'context',jsonb_build_object('selection_group_id',g1));assert not (result->>'can_post')::boolean,'View-only chat remains read-only';
  rejected:=false;begin perform public.selection_room_api(c,'end_meeting',jsonb_build_object('selection_group_id',g1,'meeting_id',meeting_id));exception when insufficient_privilege then rejected:=true;end;assert rejected;
  rejected:=false;begin perform public.selection_room_api(c,'meeting',jsonb_build_object('selection_group_id',g2));exception when insufficient_privilege then rejected:=true;end;assert rejected,'Other group state is private';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  result:=public.selection_room_api(c,'meeting',jsonb_build_object('selection_group_id',g2));assert not (result->>'active')::boolean,'Starting one group leaves another group unchanged';
  result:=public.selection_room_api(c,'end_meeting',jsonb_build_object('selection_group_id',g1,'meeting_id',meeting_id));assert not (result->>'active')::boolean;
  result:=public.club_season_stats_api(c,'context');assert jsonb_typeof(result->'cards')='array','Ending the meeting permits an explicit analysis request';
  result:=public.selection_room_api(c,'start_meeting',jsonb_build_object('selection_group_id',g1,'request_id',request_id));assert not (result->>'active')::boolean,'A late retry cannot resurrect an ended meeting';
  result:=public.selection_room_api(c,'start_meeting',jsonb_build_object('selection_group_id',g1,'request_id',gen_random_uuid()));assert (result->>'active')::boolean;
  rejected:=false;begin perform public.selection_room_api(c,'end_meeting',jsonb_build_object('selection_group_id',g1,'meeting_id',meeting_id));exception when raise_exception then rejected:=true;end;assert rejected,'Stale end cannot end a newer meeting';
  -- Cutoffs hide old chat immediately, without a delete on every poll. Existing
  -- post/worker cleanup still physically removes messages from ended sessions.
  insert into club_selection_private.selection_room_messages(club_id,scope_id,author_id,author_name,body,request_id,created_at)
   values(c,g1,head_id,'Test','Old',gen_random_uuid(),now()-interval '10 minutes'),(c,g1,head_id,'Test','Current',gen_random_uuid(),now()-interval '2 minutes');
  insert into club_selection_private.selection_video_calls(id,club_id,scope_id,created_at,expires_at,call_mode) values(call_id,c,g1,now()-interval '5 minutes',now()+interval '60 minutes','audio');
  result:=public.selection_room_api(c,'context',jsonb_build_object('selection_group_id',g1));assert result->>'chat_session'='call:'||call_id;assert jsonb_array_length(result->'messages')=1;assert result#>>'{messages,0,body}'='Current';
  assert (select count(*) from club_selection_private.selection_room_messages where club_id=c)=2,'Read performs no cleanup writes';
  perform club_selection_private.purge_selection_chat_messages(c);assert (select count(*) from club_selection_private.selection_room_messages where club_id=c)=1;
  update club_selection_private.selection_video_calls set expires_at=now()-interval '1 minute' where id=call_id;
  result:=public.selection_room_api(c,'context',jsonb_build_object('selection_group_id',g1));assert result->'messages'='[]','Ended chat is never exposed while awaiting cleanup';
  rejected:=false;begin perform public.selection_room_api(c,'post',jsonb_build_object('selection_group_id',g1,'request_id',gen_random_uuid(),'body','Stale','chat_session','call:'||call_id));exception when sqlstate 'P0230' then rejected:=true;end;assert rejected;
  perform club_selection_private.purge_selection_chat_messages(c);assert not exists(select 1 from club_selection_private.selection_room_messages where club_id=c);
  assert not has_function_privilege('anon','public.selection_room_api(uuid,text,jsonb)','EXECUTE');
  assert has_function_privilege('authenticated','public.selection_room_api(uuid,text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','club_selection_private.selection_room_context(uuid,jsonb)','EXECUTE');
  assert not has_table_privilege('authenticated','club_selection_private.selection_room_settings','SELECT,INSERT,UPDATE,DELETE');
  raise notice 'Synthetic chat context completed in % ms without acquiring advisory locks',round(elapsed_ms,2);
  raise exception using errcode='P0284',message='Rollback meeting test';
 exception when sqlstate 'P0284' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Meeting scope, permissions, retries, chat cutoffs, read locks and rollback verified' as result;
