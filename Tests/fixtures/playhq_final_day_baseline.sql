-- Current deployed private scheduler and worker definitions, captured before
-- the final-day correction. No records, credentials or provider keys.
CREATE OR REPLACE FUNCTION public.playhq_sync_worker(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare c uuid:=(p_data->>'club_id')::uuid;conn club_selection_private.playhq_connections%rowtype;answer jsonb;sid uuid;j club_selection_private.playhq_jobs%rowtype; row jsonb;link club_selection_private.playhq_links%rowtype;next_due timestamptz;last_day date;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'Backend access required';end if;
 if p_action='claim' then
  delete from club_selection_private.playhq_runs where id=(p_data->>'run_id')::uuid and expires_at>now() and token_hash=encode(extensions.digest(p_data->>'token','sha256'),'hex') returning id into sid;
  if sid is null then raise exception 'Invalid scheduled check token';end if;
  select q.* into j from club_selection_private.playhq_jobs q join club_selection_private.playhq_connections x using(club_id)
   where x.polling_enabled and x.verified_at is not null and q.due_at<=now() and coalesce(q.leased_until,'-infinity')<now() and club_selection_private.playhq_job_active(q.club_id,q.kind,q.source_id,q.team_id,x.active_season_id)
   order by case when q.kind='results' then 0 else 1 end,q.due_at,q.club_id,q.source_id,q.team_id for update of q skip locked limit 1;
  if j.club_id is null then return null;end if;
  update club_selection_private.playhq_jobs set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1 where club_id=j.club_id and kind=j.kind and source_id=j.source_id and team_id=j.team_id returning * into j;
  return to_jsonb(j);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into conn from club_selection_private.playhq_connections where club_id=c for update;
 if conn.club_id is null then raise exception 'Configure the PlayHQ connection first';end if;
 if p_action='connection' then
  select jsonb_build_object('key',decrypted_secret,'organisation_id',conn.organisation_id,'association_id',conn.association_id,'generation',conn.generation,'timezone',coalesce(a.timezone,'Australia/Sydney')) into answer from vault.decrypted_secrets v left join club_selection_private.access a on a.club_id=c where v.id=conn.secret_id;
  return answer;
 end if;
 if conn.generation::text is distinct from p_data->>'generation' then raise exception 'Connection changed. Retry with the current connection';end if;
 if p_action='scorecard_context' then
  select jsonb_build_object('season_id',l.season_id,'source_fixture',l.source_fixture,'grade',f.details->>'grade','competition',f.details->>'competition','timezone',a.timezone,'canonical_match',(
   select jsonb_build_object('provider','playcricket_au','match_id',src.source_match_id,'team_id',src.team_id)
   from club_selection_private.fixture_result_sources src where src.fixture_id=f.id and src.club_id=c and src.no_play is null and src.team_id is not null
   and exists(select 1 from public.match_review_scorecards sc where sc.club_id=c and sc.source_match_id=src.source_match_id and sc.scorecard->>'provider'='playcricket_au')
  )) into answer
  from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c join club_selection_private.access a on a.club_id=c
  where l.club_id=c and l.match_id=(p_data->>'match_id')::uuid and l.team_id=(p_data->>'team_id')::uuid;
  if answer is null then raise exception 'Linked fixture unavailable';end if;return answer;
 elsif p_action='claim_fixture' then
  select * into link from club_selection_private.playhq_links where club_id=c and fixture_id=(p_data->>'fixture_id')::uuid;
  if link.fixture_id is null or p_data->>'kind' not in ('fixtures','results') then raise exception 'Choose a linked fixture';end if;
  if conn.verified_at is null then raise exception 'Load seasons to verify the connection first';end if;
  select * into j from club_selection_private.playhq_jobs where club_id=c and kind=p_data->>'kind' and source_id=case when p_data->>'kind'='fixtures' then link.grade_id else link.match_id end and team_id=link.team_id for update;
  if j.club_id is null or coalesce(j.leased_until,'-infinity')>now() then raise exception 'A check is already running. Try again shortly';end if;
  if j.last_manual_check>now()-interval '30 seconds' then raise exception 'Wait 30 seconds before checking this match again';end if;
  update club_selection_private.playhq_jobs set last_manual_check=now(),lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1 where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id returning * into j;
  return to_jsonb(j);
 elsif p_action='verified' then
  update club_selection_private.playhq_connections set verified_at=now(),last_error=null where club_id=c;
  return jsonb_build_object('verified',true);
 elsif p_action='error' then
  update club_selection_private.playhq_connections set last_error=left(p_data->>'error',200),polling_enabled=case when p_data->>'status' in ('401','403') then false else polling_enabled end,verified_at=case when p_data->>'status' in ('401','403') then null else verified_at end where club_id=c;
  return jsonb_build_object('saved',true);
 elsif p_action in ('finish','job_error') then
  select * into j from club_selection_private.playhq_jobs where club_id=c and kind=p_data#>>'{job,kind}' and source_id=(p_data#>>'{job,source_id}')::uuid and team_id=(p_data#>>'{job,team_id}')::uuid and lease_id=(p_data#>>'{job,lease_id}')::uuid and leased_until>now() for update;
  if j.club_id is null then raise exception 'Check lease expired';end if;
  if p_action='job_error' then
   if p_data->>'status' in ('401','403') then update club_selection_private.playhq_connections set polling_enabled=false,verified_at=null,last_error=left(p_data->>'error',200) where club_id=c;end if;
   update club_selection_private.playhq_jobs set leased_until=null,lease_id=null,last_error=left(p_data->>'error',200),due_at=now()+least(interval '24 hours',interval '15 minutes'*power(2,least(attempts,6))) where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
   if j.kind='results' then update club_selection_private.playhq_links set result_error=left(p_data->>'error',200) where club_id=c and match_id=j.source_id and team_id=j.team_id;end if;
   return jsonb_build_object('saved',true);
  end if;
  if octet_length(p_data::text)>5000000 then raise exception 'Provider response too large';end if;
  next_due:=now()+interval '24 hours';
  if j.kind='season' then
   if j.source_id is distinct from conn.active_season_id or jsonb_typeof(p_data#>'{result,teams}') is distinct from 'array' then raise exception 'Season changed. Reload setup';end if;
   for row in select value from jsonb_array_elements(p_data#>'{result,teams}') loop
    if nullif(row#>>'{grade,id}','') is not null then
     update club_selection_private.playhq_grade_mappings set source_grade_id=(row#>>'{grade,id}')::uuid where club_id=c and season_id=j.source_id and team_id=(row->>'id')::uuid and source_grade_id is distinct from (row#>>'{grade,id}')::uuid;
     insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id)
      select c,'fixtures',source_grade_id,team_id from club_selection_private.playhq_grade_mappings where club_id=c and season_id=j.source_id and team_id=(row->>'id')::uuid
      on conflict(club_id,kind,source_id,team_id) do nothing;
    end if;
   end loop;
  elsif j.kind='fixtures' then
   answer:=club_selection_private.playhq_import_all(c,conn.active_season_id,j.source_id,j.team_id,p_data#>'{result,fixtures}');
   update club_selection_private.playhq_jobs set last_result=answer where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
   if exists(select 1 from jsonb_array_elements(p_data#>'{result,fixtures}') x where (x#>>'{days,0,date}')::date between current_date and current_date+2) then next_due:=now()+interval '4 hours';end if;
  else
   if p_data#>>'{result,source_match_id}' is distinct from j.source_id::text then raise exception 'Wrong match result';end if;
   update club_selection_private.playhq_links set summary=(p_data->'result')-'shared_scorecard',summary_checked_at=now() where club_id=c and match_id=j.source_id and team_id=j.team_id returning * into link;
   -- Summary checks may discover the same official result before the next draw check.
   if p_data->'result' ? 'no_play' then
    if p_data#>>'{result,source_grade_id}' is distinct from link.grade_id::text or p_data#>>'{result,source_team_id}' is distinct from link.team_id::text then raise exception 'Wrong match result team or grade';end if;
    if coalesce(link.pending_fixture,link.source_fixture)->>'no_play' is distinct from p_data#>>'{result,no_play}' then
     perform club_selection_private.playhq_import_all(c,link.season_id,link.grade_id,link.team_id,jsonb_build_array(coalesce(link.pending_fixture,link.source_fixture)||jsonb_build_object(
      'source_status',p_data#>>'{result,source_status}','source_outcome',p_data#>>'{result,source_outcome}','no_play',p_data#>>'{result,no_play}',
      'cancelled',p_data#>>'{result,no_play}' is not null or p_data#>>'{result,source_status}' in ('CANCELLED','CANCELED'))));
    end if;
   end if;
   perform club_selection_private.playhq_store_scorecard(c,link.fixture_id,p_data#>'{result,shared_scorecard}');
   next_due:=club_selection_private.playhq_results_due(link.fixture_id,now());
  end if;
  update club_selection_private.playhq_jobs set lease_id=null,leased_until=null,attempts=0,last_error=null,due_at=next_due,checked_at=now() where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
  return jsonb_build_object('saved',true);
 elsif p_action='preview' then
  if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or octet_length(p_data::text)>2000000 then raise exception 'Invalid preview';end if;
  insert into club_selection_private.playhq_previews(club_id,generation,season_id,grade_id,team_id,fixtures) values(c,conn.generation,(p_data->>'season_id')::uuid,(p_data->>'grade_id')::uuid,(p_data->>'team_id')::uuid,p_data->'fixtures') returning id into sid;
  delete from club_selection_private.playhq_previews where club_id=c and created_at<now()-interval '1 day';
  return jsonb_build_object('preview_id',sid);
 end if;
 raise exception 'Unknown worker action';
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.playhq_results_due(fid uuid, last_checked timestamp with time zone DEFAULT NULL::timestamp with time zone, at_time timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare details jsonb;tz text;previous_finish timestamptz;next_finish timestamptz;final_finish timestamptz;received boolean;cadence interval;
begin
 select f.details,a.timezone into details,tz from club_selection_private.fixtures f left join club_selection_private.access a on a.club_id=f.club_id where f.id=fid;
 if details is null then return at_time+interval '1 day';end if;
 select max(finish) filter(where finish<=at_time),min(finish) filter(where finish>at_time),max(finish)
 into previous_finish,next_finish,final_finish
 from (select club_selection_private.fixture_day_expected_finish(details,d,tz) finish from jsonb_array_elements(coalesce(details->'days','[]')) d) times;
 -- A FINAL provider summary alone is insufficient: wait for the saved scorecard.
 select coalesce((details->>'cancelled')::boolean,false) or exists(
  select 1 from club_selection_private.fixture_result_sources src
  left join lateral (select sc.scorecard from public.match_review_scorecards sc where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id order by sc.created_at desc,sc.id desc limit 1) saved on true
  where src.fixture_id=fid and (src.no_play is not null or saved.scorecard->>'status'='completed')) into received;
 if received and last_checked is not null then
  -- Retain the existing slower refreshes for corrections after results arrive.
  cadence:=case when at_time<=final_finish+interval '3 days' then interval '4 hours' when at_time<=final_finish+interval '14 days' then interval '1 day' else interval '7 days' end;
  return greatest(at_time,last_checked+cadence);
 end if;
 if club_selection_private.fixture_no_play((select club_id from club_selection_private.fixtures where id=fid),fid) is not null then
  return greatest(at_time,coalesce(last_checked,at_time)+interval '1 day');
 end if;
 if previous_finish is null then
  if exists(select 1 from club_selection_private.playhq_links l where l.fixture_id=fid and coalesce(l.pending_fixture,l.source_fixture)->>'source_status'='FINAL') then
   return case when last_checked is null then at_time else greatest(at_time,least(next_finish,last_checked+interval '4 hours')) end;
  end if;
  return coalesce(next_finish,at_time+interval '1 day');
 end if;
 if last_checked is null or last_checked<previous_finish then return at_time;end if;
 cadence:=case when at_time<previous_finish+interval '1 day' then interval '30 minutes' when at_time<previous_finish+interval '7 days' then interval '2 hours' else interval '1 day' end;
 -- A later playing day starts a fresh results-check window, including Day 2.
 return greatest(at_time,least(last_checked+cadence,next_finish));
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.schedule_playhq_check()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

