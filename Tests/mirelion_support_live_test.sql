-- Synthetic, rollback-only release check. Never claim another conversation's job.
begin;
do $test$
declare u uuid:=gen_random_uuid();c uuid:=gen_random_uuid();staff uuid:=gen_random_uuid();
 t uuid; result jsonb; job jsonb; receipt jsonb; denied boolean;
begin
 assert not exists(select 1 from mirelion_assist_private.support_jobs where state in ('pending','running')),'Run this release check before enabling automation';
 insert into auth.users(id,email,email_confirmed_at) values(u,u||'@example.invalid',now()),(staff,staff||'@example.invalid',now());
 insert into public.user_profiles(user_id,display_name) values(u,'Support release check'),(staff,'Support release staff');
 insert into public.clubs(id,name,slug,created_by) values(c,'Support release check','support-test-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin');
 insert into public.platform_admins(user_id,role) values(staff,'support_admin');
 update mirelion_assist_private.automation_settings set assist_enabled=true;
 perform set_config('request.jwt.claim.sub',u::text,true);
 result:=public.mirelion_assist('create',jsonb_build_object('club_id',c,'request_id',gen_random_uuid(),'subject','Synthetic release check','category','help','body','How do I mark availability?'));
 t:=(result->>'thread_id')::uuid;
 job:=public.mirelion_support_worker('claim');assert (job->>'thread_id')::uuid=t,'Only synthetic work claimed';
 result:=public.mirelion_support_worker('finish',job||jsonb_build_object('decision',jsonb_build_object('kind','reply','body','Synthetic checked reply','reason','routine','topics',jsonb_build_array('availability'))));
 assert result->>'message_id' is not null,'Reply recorded';
 assert (public.mirelion_support_worker('finish',job||jsonb_build_object('decision',jsonb_build_object('kind','reply','body','Do not duplicate')))->>'stale')::boolean,'Duplicate finish ignored';
 assert (select count(*)=2 from mirelion_assist_private.messages where thread_id=t),'Exactly one reply';
 result:=public.mirelion_assist('send',jsonb_build_object('club_id',c,'thread_id',t,'request_id',gen_random_uuid(),'body','Please help further'));
 job:=public.mirelion_support_worker('claim');
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform public.mirelion_assist('send',jsonb_build_object('platform',true,'thread_id',t,'request_id',gen_random_uuid(),'body','Synthetic human takeover'));
 assert (public.mirelion_support_worker('finish',job||jsonb_build_object('decision',jsonb_build_object('kind','reply','body','Stale reply')))->>'stale')::boolean,'Human reply wins';
 update mirelion_assist_private.automation_settings set email_enabled=true;
 receipt:=public.mirelion_support_worker('ingest',jsonb_build_object('provider_id',gen_random_uuid(),'sender_email','synthetic@example.invalid','subject','Synthetic email','body','Help','internet_id','<'||gen_random_uuid()||'@example.invalid>','authenticated',false,'attachments',false));
 perform set_config('request.jwt.claim.sub',u::text,true);
 denied:=false;
 begin perform public.mirelion_assist('thread',jsonb_build_object('club_id',c,'thread_id',receipt->>'thread_id'));exception when insufficient_privilege then denied:=true;end;
 assert denied,'Email thread cannot bypass NULL club identity checks';
 assert not has_function_privilege('authenticated','public.mirelion_support_worker(text,jsonb)','execute'),'Worker is service-only';
 assert not has_table_privilege('authenticated','mirelion_assist_private.support_incoming','select'),'Email contents remain private';
 assert (select bool_and(relrowsecurity) from pg_class where relnamespace='mirelion_assist_private'::regnamespace and relkind='r'),'Private RLS retained';
end $test$;
rollback;
