-- Synthetic records only. The deliberate exception rolls all fixtures back.
do $tests$
declare c uuid:=gen_random_uuid();other uuid:=gen_random_uuid();u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();
 call_id uuid:=gen_random_uuid();entry_one uuid:=gen_random_uuid();entry_two uuid:=gen_random_uuid();
 b jsonb;before_balance jsonb;blocked boolean;
begin
 begin
  insert into auth.users(id,email) values(u,'usage-summary-'||u||'@example.invalid'),(v,'usage-summary-'||v||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Usage summary selector'),(v,'Usage summary player');
  insert into public.clubs(id,name,slug,created_by) values(c,'Usage summary test','usage-summary-'||c,u),(other,'Other usage summary test','usage-summary-'||other,u);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'player','none'),(c,v,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id)
   values(c,'standalone','active','Australia/Sydney',u),(other,'standalone','active','Australia/Sydney',u);
  insert into club_selection_private.selection_video_policy(club_id,enabled,monthly_minutes) values(c,true,5000);
  b:=club_selection_private.video_credit_balance(c);assert b->'latest_call'='null'::jsonb,'No call is invented';
  insert into club_selection_private.selection_video_calls(id,club_id,created_at,expires_at)
   values(call_id,c,now()-interval '3 hours',now()-interval '90 minutes');
  insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes)
   values(entry_one,call_id,c,u,91),(entry_two,call_id,c,v,91);
  b:=club_selection_private.video_credit_balance(c);
  assert b#>>'{latest_call,status}'='pending';assert b#>'{latest_call,participant_seconds}'='null'::jsonb;
  assert (b->>'held_seconds')::bigint=10920,'Summary cannot release the reservation';
  update club_selection_private.selection_video_entries set actual_seconds=2700 where id in(entry_one,entry_two);
  update club_selection_private.selection_video_calls set usage_settled_at=now(),usage_records=jsonb_build_array(
   jsonb_build_object('entry_id',entry_one,'join_time',1000,'duration',2700),
   jsonb_build_object('entry_id',entry_two,'join_time',1000,'duration',2700)) where id=call_id;
  b:=club_selection_private.video_credit_balance(c);before_balance:=b;
  assert b#>>'{latest_call,status}'='confirmed';
  assert (b#>>'{latest_call,call_seconds}')::bigint=2700,'Overlapping participants are one 45-minute call';
  assert (b#>>'{latest_call,participant_seconds}')::bigint=5400,'Credit uses both participants';
  assert (b#>>'{latest_call,people}')::integer=2;
  assert (b->>'held_seconds')::bigint=0;assert (b->>'available_seconds')::bigint=294600;
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('role','authenticated',true);
  b:=public.selection_video_credit_api(c,'balance');assert b->'latest_call'=before_balance->'latest_call';
  blocked:=false;begin perform public.selection_video_credit_api(other,'balance');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Cross-club usage stays private';
  perform set_config('request.jwt.claim.sub',v::text,true);
  blocked:=false;begin perform public.selection_video_credit_api(c,'balance');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Players cannot see selector credit usage';
  perform set_config('role','postgres',true);
  update club_selection_private.selection_video_entries set actual_seconds=200 where id in(entry_one,entry_two);
  update club_selection_private.selection_video_calls set usage_records='[{"join_time":1000,"duration":100},{"join_time":1050,"duration":100},{"join_time":2000,"duration":200}]'::jsonb where id=call_id;
  b:=club_selection_private.video_credit_balance(c);assert (b#>>'{latest_call,call_seconds}')::bigint=350,'Reconnect gaps are excluded and overlaps counted once';
  update club_selection_private.selection_video_calls set usage_settled_at=null,usage_review_required=true where id=call_id;
  b:=club_selection_private.video_credit_balance(c);assert b#>>'{latest_call,status}'='review';assert b#>'{latest_call,call_seconds}'='null'::jsonb;
  assert not has_function_privilege('authenticated','club_selection_private.video_credit_balance(uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.selection_video_credit_api(uuid,text,jsonb)','EXECUTE');
  raise exception using errcode='P0229',message='Rollback usage summary fixtures';
 exception when sqlstate 'P0229' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Video usage summary: pending holds, verified duration, participant credit, reconnect gaps and access boundaries passed; fixtures rolled back' as result;
