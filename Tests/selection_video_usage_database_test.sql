-- Synthetic records only; the deliberate exception rolls every fixture back.
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();call_id uuid:=gen_random_uuid();
 ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 run_id uuid;token text:=repeat('a',64);claims jsonb;usage jsonb;answer jsonb;blocked boolean;entry_id uuid;
begin
 begin
  insert into auth.users(id,email) values(u,'video-usage-'||u||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Synthetic usage selector');
  insert into public.clubs(id,name,slug,created_by) values(c,'Video usage test','video-usage-'||c,u);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id) values(c,'standalone','active','Australia/Sydney',u);
  insert into club_selection_private.selection_video_policy(club_id,enabled,monthly_minutes) values(c,true,200);
  insert into club_selection_private.selection_video_calls(id,club_id,created_at,expires_at)
   values(call_id,c,now()-interval '3 hours',now()-interval '90 minutes');
  foreach entry_id in array ids loop
   insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes,created_at)
    values(entry_id,call_id,c,u,91,now()-interval '3 hours');
  end loop;
  perform set_config('request.jwt.claim.sub',u::text,true);
  blocked:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then blocked:=true;end;
  assert blocked,'The full reservation still protects the allowance before usage is verified';
  select jsonb_agg(jsonb_build_object('entry_id',v,'seconds',1200) order by v) into usage from unnest(ids)v;
  insert into club_selection_private.selection_video_usage_runs(token_hash) values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run_id;
  perform set_config('role','service_role',true);
  blocked:=false;begin perform public.selection_video_usage_worker('claim',jsonb_build_object('run_id',run_id,'token',repeat('b',64),'club_id',c));exception when insufficient_privilege then blocked:=true;end;
  assert blocked,'A false capability cannot claim work';
  claims:=public.selection_video_usage_worker('claim',jsonb_build_object('run_id',run_id,'token',token,'club_id',c));
  assert jsonb_array_length(claims)=1;
  blocked:=false;begin perform public.selection_video_usage_worker('claim',jsonb_build_object('run_id',run_id,'token',token,'club_id',c));exception when insufficient_privilege then blocked:=true;end;
  assert blocked,'A capability is single-use';
  blocked:=false;begin perform public.selection_video_usage_worker('observe',jsonb_build_object('run_id',run_id,'call_id',call_id,'usage',usage-0,'records','[]'::jsonb));exception when raise_exception then blocked:=true;end;
  assert blocked,'Incomplete totals cannot settle';
  answer:=public.selection_video_usage_worker('observe',jsonb_build_object('run_id',run_id,'call_id',call_id,'usage',usage,'records','[]'::jsonb));
  assert not (answer->>'settled')::boolean;
  assert (select bool_and(actual_seconds is null) from club_selection_private.selection_video_entries where club_id=c),'First read keeps all credit reserved';
  perform set_config('role','postgres',true);
  update club_selection_private.selection_video_calls set usage_checked_at=now()-interval '4 minutes',usage_observed_at=now()-interval '4 minutes' where id=call_id;
  insert into club_selection_private.selection_video_usage_runs(token_hash) values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run_id;
  perform set_config('role','service_role',true);
  perform public.selection_video_usage_worker('claim',jsonb_build_object('run_id',run_id,'token',token,'club_id',c));
  answer:=public.selection_video_usage_worker('observe',jsonb_build_object('run_id',run_id,'call_id',call_id,'usage',usage,'records','[]'::jsonb));
  assert (answer->>'settled')::boolean;
  assert (select sum(actual_seconds)=4800 from club_selection_private.selection_video_entries where club_id=c),'Four 20-minute participants count as 80 participant-minutes';
  blocked:=false;begin perform public.selection_video_usage_worker('observe',jsonb_build_object('run_id',run_id,'call_id',call_id,'usage',usage,'records','[]'::jsonb));exception when raise_exception then blocked:=true;end;
  assert blocked,'A retry cannot settle twice';
  perform set_config('role','postgres',true);
  answer:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid()));
  assert answer->>'room_name' is not null,'Returned allowance permits the next call';
  assert (select sum(coalesce(actual_seconds,reserved_minutes::bigint*60))<=200*60 from club_selection_private.selection_video_entries where club_id=c);
  blocked:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then blocked:=true;end;
  assert blocked,'Active calls still enforce the allowance';
  assert not has_function_privilege('authenticated','public.selection_video_usage_worker(text,jsonb)','EXECUTE');
  assert not has_function_privilege('anon','public.selection_video_usage_worker(text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','club_selection_private.schedule_video_usage_check()','EXECUTE');
  assert not has_table_privilege('authenticated','club_selection_private.selection_video_usage_runs','SELECT,INSERT,UPDATE,DELETE');
  assert (select relrowsecurity from pg_class where oid='club_selection_private.selection_video_usage_runs'::regclass);
  raise exception using errcode='P0176',message='Rollback verified usage test fixtures';
 exception when sqlstate 'P0176' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Video usage: actual seconds, refunds, cap enforcement, idempotency and server-only permissions passed; fixtures rolled back' as result;
