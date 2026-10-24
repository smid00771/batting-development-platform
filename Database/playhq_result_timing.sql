-- Check each playing day's results from its expected finish in the club timezone.
-- Expected times schedule downloads; they do not declare a match completed.
create or replace function club_selection_private.fixture_day_expected_finish(details jsonb,day jsonb,tz text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare start_text text:=btrim(coalesce(day->>'start',''));end_text text:=btrim(coalesce(day->>'end',''));
 start_minutes integer;end_minutes integer;overs integer;duration integer;local_day timestamp;
begin
 if coalesce(day->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then return null;end if;
 local_day:=(day->>'date')::date::timestamp;
 if start_text~'^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then start_minutes:=split_part(start_text,':',1)::integer*60+split_part(start_text,':',2)::integer;end if;
 if end_text~'^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then end_minutes:=split_part(end_text,':',1)::integer*60+split_part(end_text,':',2)::integer;end if;
 if end_minutes is not null and (start_minutes is null or end_minutes>start_minutes) then
  return (local_day+make_interval(mins=>end_minutes)) at time zone coalesce(nullif(tz,''),'Australia/Sydney');
 end if;
 -- Same allowances as the selection overlap guard. Unknown starts use 18:00.
 if start_minutes is null then return (local_day+interval '18 hours') at time zone coalesce(nullif(tz,''),'Australia/Sydney');end if;
 overs:=case when coalesce(details->>'overs','')~'^[0-9]{1,3}$' then (details->>'overs')::integer end;
 duration:=case when details->>'format'='t20' then 210 when details->>'format'='limited_overs' and overs>0 then greatest(180,least(600,overs*8+45)) else 480 end;
 return (local_day+make_interval(mins=>start_minutes+duration)) at time zone coalesce(nullif(tz,''),'Australia/Sydney');
end $$;
revoke all on function club_selection_private.fixture_day_expected_finish(jsonb,jsonb,text) from public,anon,authenticated,service_role;

create or replace function club_selection_private.playhq_results_due(fid uuid,last_checked timestamptz default null,at_time timestamptz default now()) returns timestamptz
language plpgsql stable set search_path='' as $$
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
 if previous_finish is null then return coalesce(next_finish,at_time+interval '1 day');end if;
 if last_checked is null or last_checked<previous_finish then return at_time;end if;
 cadence:=case when at_time<previous_finish+interval '1 day' then interval '30 minutes' when at_time<previous_finish+interval '7 days' then interval '2 hours' else interval '1 day' end;
 -- A later playing day starts a fresh results-check window, including Day 2.
 return greatest(at_time,least(last_checked+cadence,next_finish));
end $$;
revoke all on function club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;

-- Change only scheduling expressions in the current guarded APIs.
do $patch$
declare definition text;old_text text;new_text text;signature regprocedure;
begin
 for signature,old_text,new_text in values
  ('club_selection_private.playhq_import_all(uuid,uuid,uuid,uuid,jsonb)'::regprocedure,
   $old$result_due:=greatest(now(),coalesce(nullif(src#>>'{days,0,start_at}','')::timestamptz,(src#>>'{days,0,date}')::date::timestamp at time zone coalesce(tz,'Australia/Sydney'))+interval '8 hours');$old$,
   $new$result_due:=club_selection_private.playhq_results_due(fid);$new$),
  ('public.playhq_sync_api(uuid,text,jsonb)'::regprocedure,
   $old$preview.team_id,greatest(now(),(row#>>'{days,0,start_at}')::timestamptz+interval '8 hours'))$old$,
   $new$preview.team_id,club_selection_private.playhq_results_due(fid))$new$),
  ('club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure,
   $old$due_at=greatest(now(),(l.pending_fixture#>>'{days,0,start_at}')::timestamptz+interval '8 hours')$old$,
   $new$due_at=club_selection_private.playhq_results_due(l.fixture_id)$new$),
  ('public.playhq_sync_worker(text,jsonb)'::regprocedure,
   $old$select max((x->>'date')::date) into last_day from jsonb_array_elements(link.source_fixture->'days') x;
   next_due:=now()+case when last_day>=current_date-3 then interval '4 hours' when last_day>=current_date-14 then interval '1 day' else interval '7 days' end;$old$,
   $new$next_due:=club_selection_private.playhq_results_due(link.fixture_id,now());$new$)
 loop
  definition:=replace(pg_get_functiondef(signature),E'\r\n',E'\n');
  if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then raise exception 'Unexpected result scheduling definition: %',signature;end if;
  execute replace(definition,old_text,new_text);
 end loop;
end $patch$;

create or replace function club_selection_private.reschedule_fixture_results() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.details->'days',new.details->'format',new.details->'overs') is not distinct from (old.details->'days',old.details->'format',old.details->'overs') then return new;end if;
 update club_selection_private.playhq_jobs job set due_at=club_selection_private.playhq_results_due(new.id,job.checked_at)
 from club_selection_private.playhq_links link where link.fixture_id=new.id and job.club_id=link.club_id and job.kind='results' and job.source_id=link.match_id and job.team_id=link.team_id
 and coalesce(job.leased_until,'-infinity')<now() and job.last_error is null;
 return new;
end $$;
revoke all on function club_selection_private.reschedule_fixture_results() from public,anon,authenticated,service_role;
create trigger reschedule_fixture_results after update of details on club_selection_private.fixtures for each row execute function club_selection_private.reschedule_fixture_results();

-- Re-time existing jobs, including today's double headers. Preserve paused
-- connections, active leases and provider-error backoff; do not touch selections.
update club_selection_private.playhq_jobs job set due_at=club_selection_private.playhq_results_due(link.fixture_id,job.checked_at)
from club_selection_private.playhq_links link join club_selection_private.playhq_connections connection on connection.club_id=link.club_id and connection.active_season_id=link.season_id
where job.club_id=link.club_id and job.kind='results' and job.source_id=link.match_id and job.team_id=link.team_id
and coalesce(job.leased_until,'-infinity')<now() and job.last_error is null;
