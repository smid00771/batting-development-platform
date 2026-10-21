-- Synthetic fixtures. Run only with all migrations present; always rolls back.
begin;
do $tests$
declare c uuid:=gen_random_uuid();h uuid:=gen_random_uuid();u uuid:=gen_random_uuid();h2 uuid:=gen_random_uuid();
 g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();v1 uuid:=gen_random_uuid();v2 uuid:=gen_random_uuid();v0 uuid:=gen_random_uuid();
 e1 uuid:=gen_random_uuid();e2 uuid:=gen_random_uuid();eh uuid:=gen_random_uuid();e0 uuid:=gen_random_uuid();req uuid:=gen_random_uuid();
 x uuid;run uuid;token text:=repeat('a',64);r jsonb;rejected boolean;n integer;
begin
 foreach x in array array[h,u,h2] loop
  insert into auth.users(id,email,email_confirmed_at) values(x,x||'@example.invalid',now());
  insert into public.user_profiles(user_id,display_name) values(x,'Revocation test');
 end loop;
 insert into public.clubs(id,name,slug,created_by) values(c,'Revocation test','revoke-'||c,h);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,h,'admin','admin'),(c,u,'player','none'),(c,h2,'player','none');
 insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id,revision) values(c,'standalone','active','Australia/Sydney',h,1);
 insert into club_selection_private.selectors(club_id,user_id) values(c,u);
 insert into club_selection_private.selection_groups(id,club_id,name) values(g1,c,'One'),(g2,c,'Two');
 insert into club_selection_private.selection_video_policy(club_id,enabled,monthly_minutes) values(c,true,5000);
 insert into club_selection_private.selection_video_calls(id,club_id,expires_at,call_mode,scope_id) values(v0,c,now()+interval '60 minutes','audio','00000000-0000-0000-0000-000000000000');
 insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes) values(e0,v0,c,u,61);
 set constraints all immediate;set constraints all deferred;
 assert (select revoked_at is null from club_selection_private.selection_video_entries where id=e0),'Legacy authorized call remains active';
 -- Activating scope must not leave an old club-wide token live with partial rights.
 rejected:=false;
 begin
  insert into club_selection_private.selection_access_settings(club_id) values(c);
  set constraints all immediate;
 exception when raise_exception then rejected:=sqlerrm like '%Call revocation is not enabled%';end;
 assert rejected and not club_selection_private.scoped_selections(c),'Unsafe activation fails closed until revocation worker enabled';
 update club_selection_private.selection_video_revocation_settings set enabled=true;
 insert into club_selection_private.selection_access_settings(club_id) values(c);
 insert into club_selection_private.selection_group_access(club_id,selection_group_id,user_id,access) values(c,g1,u,'view'),(c,g2,u,'edit');
 insert into club_selection_private.selection_group_heads(club_id,selection_group_id,user_id) values(c,g1,h),(c,g2,h2);
 insert into club_selection_private.selection_video_calls(id,club_id,expires_at,call_mode,scope_id) values(v1,c,now()+interval '60 minutes','audio',g1),(v2,c,now()+interval '60 minutes','video',g2);
 insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes) values(e1,v1,c,u,61),(e2,v2,c,u,61),(eh,v1,c,h,61);
 set constraints all immediate;set constraints all deferred;
 assert (select revoked_at is not null from club_selection_private.selection_video_entries where id=e0),'Scope activation revokes old club-wide token';
 assert (select count(*)=1 from club_selection_private.selection_video_revocations where club_id=c),'Activation queues exact legacy entry only';
 assert (select count(*)=3 from club_selection_private.selection_video_entries where club_id=c and revoked_at is null),'Exact group calls retain authorized users';
 -- A save atomically deletes/rebuilds grants. Evaluate final state, not row order.
 delete from club_selection_private.selection_group_access where club_id=c and selection_group_id=g1 and user_id=u;
 insert into club_selection_private.selection_group_access(club_id,selection_group_id,user_id,access) values(c,g1,u,'view');
 set constraints all immediate;set constraints all deferred;
 assert (select revoked_at is null from club_selection_private.selection_video_entries where id=e1),'Atomic unchanged grant does not spuriously eject';
 perform set_config('request.jwt.claim.sub',u::text,true);
 r:=club_selection_private.selection_room_api(c,'confirm_video',jsonb_build_object('selection_group_id',g1,'entry_id',e1,'room_name','cb-'||replace(v1::text,'-','')));
 assert r->>'confirmed'='true','Current exact entry may receive its minted token';
 rejected:=false;begin perform club_selection_private.selection_room_api(c,'confirm_video',jsonb_build_object('selection_group_id',g2,'entry_id',e1,'room_name','cb-'||replace(v1::text,'-','')));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Final token check rejects cross-group entry';
 delete from club_selection_private.selection_group_access where club_id=c and selection_group_id=g1 and user_id=u;
 set constraints all immediate;set constraints all deferred;
 assert (select revoked_at is not null from club_selection_private.selection_video_entries where id=e1),'Grant removal revokes active exact-scope token';
 assert (select revoked_at is null from club_selection_private.selection_video_entries where id=e2),'Other authorized group call is preserved';
 assert exists(select 1 from public.club_memberships where club_id=c and user_id=u),'Player membership is untouched by selector revocation';
 assert (select count(*)=2 from club_selection_private.selection_video_revocations where club_id=c),'Each issued identity queues once';
 rejected:=false;begin perform club_selection_private.selection_room_api(c,'confirm_video',jsonb_build_object('selection_group_id',g1,'entry_id',e1,'room_name','cb-'||replace(v1::text,'-','')));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Revocation between reserve and token response blocks disclosure';
 -- Re-grant does not unban or reuse the old identity; a new request is permitted.
 insert into club_selection_private.selection_group_access(club_id,selection_group_id,user_id,access) values(c,g1,u,'view');
 set constraints all immediate;set constraints all deferred;
 rejected:=false;begin perform club_selection_private.selection_room_api(c,'reserve_video',jsonb_build_object('selection_group_id',g1,'request_id',e1));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Re-grant cannot reuse a revoked pilot identity';
 rejected:=false;begin perform club_selection_private.selection_room_api(c,'confirm_video',jsonb_build_object('selection_group_id',g1,'entry_id',e1,'room_name','cb-'||replace(v1::text,'-','')));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Re-grant cannot confirm an old banned token';
 r:=club_selection_private.selection_room_api(c,'reserve_video',jsonb_build_object('selection_group_id',g1,'request_id',req,'use_video',true));
 assert (r->>'entry_id')::uuid=req and r->>'call_mode'='audio' and r->>'room_name'='cb-'||replace(v1::text,'-',''),'Fresh identity retains existing session and audio mode';
 assert (select revoked_at is null from club_selection_private.selection_video_entries where id=req),'Fresh authorized entry starts unrevoked';
 -- The annual wallet admission path must reject the same revoked identity.
 update club_selection_private.selection_video_policy set enabled=false where club_id=c;
 insert into club_selection_private.video_credit_config(singleton,managed_enabled,payments_ready) select true,true,false where not exists(select 1 from club_selection_private.video_credit_config where singleton);
 update club_selection_private.video_credit_config set managed_enabled=true where singleton;
 insert into club_selection_private.video_credit_accounts(club_id,anchor_at) values(c,now()-interval '1 day');
 insert into club_selection_private.video_credit_periods(id,club_id,starts_at,ends_at,included_seconds) values(gen_random_uuid(),c,now()-interval '1 day',now()-interval '1 day'+interval '1 year',86400);
 rejected:=false;begin perform club_selection_private.selection_room_api(c,'reserve_video',jsonb_build_object('selection_group_id',g1,'request_id',e1));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Annual wallet path also rejects revoked entry retries';
 -- A changed head with an independent view grant remains authorized.
 insert into club_selection_private.selection_group_access(club_id,selection_group_id,user_id,access) values(c,g1,h,'view');
 update club_selection_private.selection_group_heads set user_id=h2 where club_id=c and selection_group_id=g1;
 set constraints all immediate;set constraints all deferred;
 assert (select revoked_at is null from club_selection_private.selection_video_entries where id=eh),'Head transfer preserves independent viewer right';
 delete from club_selection_private.selection_group_access where club_id=c and selection_group_id=g1 and user_id=h;
 set constraints all immediate;set constraints all deferred;
 assert (select revoked_at is not null from club_selection_private.selection_video_entries where id=eh),'Former head is revoked after last exact-group right ends';
 delete from public.club_memberships where club_id=c and user_id=u;
 set constraints all immediate;set constraints all deferred;
 assert (select revoked_at is not null from club_selection_private.selection_video_entries where id=e2),'Membership removal revokes other active group token';
 assert (select revoked_at is not null from club_selection_private.selection_video_entries where id=req),'Membership removal also revokes regranted fresh identity';
 assert (select bool_and(actual_seconds is null and reserved_minutes=61) from club_selection_private.selection_video_entries where id in(e0,e1,e2,eh)),'Revocation never guesses actual use or releases reserved credit';
 assert (select bool_and(expires_at=now()+interval '60 minutes') from club_selection_private.selection_video_calls where id in(v0,v1,v2)),'No room expiry or other participant session is shortened';
 -- Complete/defer require the service role, one-use run capability and exact lease.
 rejected:=false;begin perform public.selection_video_revocation_worker('claim','{}');exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Owner/browser cannot bypass service worker role check';
 insert into club_selection_private.selection_video_revocation_runs(token_hash) values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run;
 perform set_config('test.revocation_run',run::text,true);perform set_config('test.revocation_call',v1::text,true);perform set_config('test.revocation_entry',e1::text,true);perform set_config('test.revocation_club',c::text,true);
 assert not has_function_privilege('authenticated','public.selection_video_revocation_worker(text,jsonb)','execute'),'Browser cannot call revocation worker';
 assert not has_table_privilege('authenticated','club_selection_private.selection_video_revocations','select'),'Queue identities remain private';
 assert not has_function_privilege('authenticated','club_selection_private.schedule_selection_video_revocations()','execute'),'Browser cannot dispatch capability jobs';
end $tests$;
set local role service_role;
do $worker_tests$
declare run uuid:=current_setting('test.revocation_run')::uuid;v uuid:=current_setting('test.revocation_call')::uuid;e uuid:=current_setting('test.revocation_entry')::uuid;c uuid:=current_setting('test.revocation_club')::uuid;
 r jsonb;rejected boolean;ids jsonb;
begin
 rejected:=false;begin perform public.selection_video_revocation_worker('claim',jsonb_build_object('run_id',run,'token',repeat('b',64)));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Invalid capability cannot claim work';
 r:=public.selection_video_revocation_worker('claim',jsonb_build_object('run_id',run,'token',repeat('a',64)));
 assert jsonb_array_length(r)=3,'One job per room includes all three affected scopes';
 assert (select count(*)=5 from club_selection_private.selection_video_revocations where club_id=c and lease_run_id=run and attempts=1),'All revoked identities leased exactly once';
 rejected:=false;begin perform public.selection_video_revocation_worker('claim',jsonb_build_object('run_id',run,'token',repeat('a',64)));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Capability replay cannot obtain new work';
 rejected:=false;begin perform public.selection_video_revocation_worker('complete',jsonb_build_object('run_id',run,'call_id',gen_random_uuid(),'entry_ids',jsonb_build_array(e)));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Cross-room completion cannot acknowledge a ban';
 rejected:=false;begin perform public.selection_video_revocation_worker('complete',jsonb_build_object('run_id',run,'call_id',v,'entry_ids',jsonb_build_array(gen_random_uuid())));exception when insufficient_privilege then rejected:=true;end;
 assert rejected,'Unleased identity cannot be completed';
 select jsonb_agg(entry_id) into ids from club_selection_private.selection_video_revocations where call_id=v and lease_run_id=run;
 r:=public.selection_video_revocation_worker('defer',jsonb_build_object('run_id',run,'call_id',v,'entry_ids',ids,'code','provider_unavailable'));
 assert r->>'deferred'='true' and (select bool_and(completed_at is null and lease_until is null and next_attempt_at>now()) from club_selection_private.selection_video_revocations where call_id=v),'Provider failure retains pending bans for bounded retry';
 update club_selection_private.selection_video_revocations set next_attempt_at=now(),lease_until=now()-interval '1 second' where call_id=v;
 insert into club_selection_private.selection_video_revocation_runs(token_hash) values(encode(extensions.digest(repeat('c',64),'sha256'),'hex')) returning id into run;
 r:=public.selection_video_revocation_worker('claim',jsonb_build_object('run_id',run,'token',repeat('c',64)));
 assert jsonb_array_length(r)=1 and (select bool_and(attempts=2 and lease_run_id=run) from club_selection_private.selection_video_revocations where call_id=v),'Scheduled retry reclaims only due failed room';
 select call_id,jsonb_agg(entry_id) into v,ids from club_selection_private.selection_video_revocations where lease_run_id=run group by call_id limit 1;
 r:=public.selection_video_revocation_worker('complete',jsonb_build_object('run_id',run,'call_id',v,'entry_ids',ids));
 assert r->>'completed'='true' and (select bool_and(completed_at is not null and lease_until is null) from club_selection_private.selection_video_revocations where call_id=v),'Only acknowledged provider ban completes leased entries';
end $worker_tests$;
reset role;
rollback;
