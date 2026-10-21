begin;
do $$
declare c uuid;u uuid;g uuid;generation uuid:=gen_random_uuid();preview uuid;match uuid:=gen_random_uuid();r jsonb;fid uuid;before_count integer;job jsonb;run uuid;token text:='test-token';
begin
 if has_function_privilege('anon','public.playhq_sync_api(uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.playhq_sync_worker(text,jsonb)','EXECUTE') then raise exception 'PlayHQ RPC grant leak';end if;
 if exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='club_selection_private' and t.relname like 'playhq_%' and t.relkind='r' and not t.relrowsecurity) then raise exception 'RLS is missing';end if;
 if exists(select 1 from cron.job where jobname='playhq-sync' and active) then raise exception 'Schedule must remain inactive';end if;
 select m.club_id,m.user_id,pg.id into c,u,g from public.club_memberships m join public.playing_groups pg on pg.club_id=m.club_id and pg.active where m.permission_role='admin' and club_selection_private.enabled(m.club_id) limit 1;
 if c is null then raise exception 'No existing admin/grade available for rollback test';end if;
 if exists(select 1 from club_selection_private.playhq_connections where club_id=c) then raise exception 'Use an unconfigured test club';end if;
 select count(*) into before_count from club_selection_private.fixtures where club_id=c;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,generation,updated_by) values(c,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),generation,u);
 insert into club_selection_private.playhq_previews(club_id,generation,season_id,grade_id,team_id,fixtures) values(c,generation,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),jsonb_build_array(jsonb_build_object('source_match_id',match,'requires_review',false,'opposition','PlayHQ rollback test','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date','2099-12-27','time','12:00','start_at','2099-12-27T01:00:00Z','ground','Test ground'))))) returning id into preview;
 r:=public.playhq_sync_api(c,'import',jsonb_build_object('preview_id',preview,'group_id',g,'choices',jsonb_build_array(jsonb_build_object('match_id',match))));
 fid:=(r->'fixture_ids'->>0)::uuid;
 if exists(select 1 from club_selection_private.playhq_jobs where club_id=c and kind='results' and source_id=match and due_at<='2099-12-27T01:00:00Z') then raise exception 'Future results polled before play';end if;
 if not exists(select 1 from club_selection_private.fixtures where id=fid and club_id=c and jsonb_array_length(slots)=11 and published is null) then raise exception 'Draft import failed';end if;
 perform public.playhq_sync_api(c,'import',jsonb_build_object('preview_id',preview,'group_id',g,'choices',jsonb_build_array(jsonb_build_object('match_id',match))));
 if (select count(*) from club_selection_private.fixtures where club_id=c)<>before_count+1 then raise exception 'Repeat import duplicated a fixture';end if;
 begin
  perform public.playhq_sync_api(c,'enable');raise exception 'Unverified connection activated';
 exception when others then if sqlerrm='Unverified connection activated' then raise;end if;end;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 begin
  perform public.playhq_sync_worker('claim',jsonb_build_object('run_id',gen_random_uuid(),'token','wrong'));raise exception 'Invalid token accepted';
 exception when others then if sqlerrm='Invalid token accepted' then raise;end if;end;
 -- Enable only inside this rolled-back transaction; no cron or HTTP call is made.
 update club_selection_private.playhq_connections set verified_at=now(),polling_enabled=true where club_id=c;
 insert into club_selection_private.playhq_runs(token_hash) values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run;
 job:=public.playhq_sync_worker('claim',jsonb_build_object('run_id',run,'token',token));
 if job is null then raise exception 'Job was not claimed';end if;
 perform public.playhq_sync_worker('job_error',jsonb_build_object('club_id',c,'generation',generation,'job',job,'status',403,'error','Test access rejection'));
 if exists(select 1 from club_selection_private.playhq_connections where club_id=c and (polling_enabled or verified_at is not null)) then raise exception '403 did not stop polling';end if;
end $$;
rollback;
