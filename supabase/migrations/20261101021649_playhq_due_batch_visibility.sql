-- Drain a bounded batch of already-due work. Preserve the existing match timing,
-- one-use run tokens, per-job leases, provider backoff and correction cadence.
create or replace function club_selection_private.playhq_job_active(c uuid,kind text,source uuid,team uuid,season uuid) returns boolean
language sql stable set search_path='' as $$
 select club_selection_private.fixtures_enabled(c) and (
  kind='season' and source=season
  or kind='fixtures' and exists(select 1 from club_selection_private.playhq_grade_mappings m where m.club_id=c and m.season_id=season and m.source_grade_id=source and m.team_id=team)
  or kind='results' and exists(select 1 from club_selection_private.playhq_links l where l.club_id=c and l.season_id=season and l.match_id=source and l.team_id=team)
 )
$$;
revoke all on function club_selection_private.playhq_job_active(uuid,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;

do $patch$
declare definition text:=pg_get_functiondef('public.playhq_sync_worker(text,jsonb)'::regprocedure);old_text text;new_text text;
begin
 old_text:=$old$and club_selection_private.fixtures_enabled(q.club_id)
   and (q.kind='season' and q.source_id=x.active_season_id or q.kind='fixtures' and exists(select 1 from club_selection_private.playhq_grade_mappings m where m.club_id=q.club_id and m.season_id=x.active_season_id and m.source_grade_id=q.source_id and m.team_id=q.team_id)
    or q.kind='results' and exists(select 1 from club_selection_private.playhq_links l where l.club_id=q.club_id and l.season_id=x.active_season_id and l.match_id=q.source_id and l.team_id=q.team_id))
   order by q.due_at$old$;
 new_text:=$new$and club_selection_private.playhq_job_active(q.club_id,q.kind,q.source_id,q.team_id,x.active_season_id)
   order by case when q.kind='results' then 0 else 1 end,q.due_at,q.club_id,q.source_id,q.team_id$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected scheduled PlayHQ claim definition';end if;
 execute replace(definition,old_text,new_text);
end $patch$;

create or replace function club_selection_private.schedule_playhq_check() returns bigint
language plpgsql security definer set search_path='' as $$
declare token text;run_id uuid;request_id bigint;dispatch_count integer;pending_count integer;
begin
 if not pg_try_advisory_xact_lock(19821,19821) then return null;end if;
 delete from club_selection_private.playhq_runs where expires_at<now();
 select count(*) into dispatch_count from (
  select 1 from club_selection_private.playhq_jobs j join club_selection_private.playhq_connections c using(club_id)
  where c.polling_enabled and c.verified_at is not null and j.due_at<=now() and coalesce(j.leased_until,'-infinity')<now()
   and club_selection_private.playhq_job_active(j.club_id,j.kind,j.source_id,j.team_id,c.active_season_id)
  limit 8
 ) due;
 -- Repeated scheduling must not issue another batch while tokens await workers.
 select count(*) into pending_count from club_selection_private.playhq_runs where expires_at>now();
 dispatch_count:=greatest(0,dispatch_count-pending_count);
 if dispatch_count=0 then return null;end if;
 for n in 1..dispatch_count loop
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into club_selection_private.playhq_runs(token_hash) values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run_id;
  select net.http_post(url:='https://txrmgwoiowlqbuulmztd.supabase.co/functions/v1/playhq-sync',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('action','run','run_id',run_id,'token',token),timeout_milliseconds:=60000) into request_id;
 end loop;
 return request_id;
end $$;
revoke all on function club_selection_private.schedule_playhq_check() from public,anon,authenticated,service_role;

-- Reuse the on-demand fixture read: no extra browser polling or source request.
do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure);old_text text;new_text text;
begin
 old_text:=$old$'checked_at',l.summary_checked_at) from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=fid)$old$;
 new_text:=$new$'checked_at',l.summary_checked_at,'next_check_at',j.due_at,
    'automatic_enabled',coalesce(conn.polling_enabled and conn.verified_at is not null and club_selection_private.playhq_job_active(j.club_id,j.kind,j.source_id,j.team_id,conn.active_season_id),false),
    'timezone',(select a.timezone from club_selection_private.access a where a.club_id=c))
    from club_selection_private.playhq_links l
    left join club_selection_private.playhq_jobs j on j.club_id=l.club_id and j.kind='results' and j.source_id=l.match_id and j.team_id=l.team_id
    left join club_selection_private.playhq_connections conn on conn.club_id=l.club_id
    where l.club_id=c and l.fixture_id=fid)$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected fixture result context definition';end if;
 execute replace(definition,old_text,new_text);
end $patch$;
