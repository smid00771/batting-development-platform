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

-- Run regression assertions atomically with this migration, rolling back all
-- synthetic test rows. Any assertion failure aborts the entire migration.
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();season uuid:=gen_random_uuid();team uuid:=gen_random_uuid();grade uuid:=gen_random_uuid();generation uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();fid uuid;src jsonb;result jsonb;job jsonb;old_due timestamptz;card jsonb;sid uuid;ns uuid:=gen_random_uuid();ours uuid:=gen_random_uuid();theirs uuid:=gen_random_uuid();before_slots jsonb;
begin
 begin
 assert club_selection_private.fixture_day_expected_finish('{"format":"t20"}','{"date":"2026-10-25","start":"10:00"}','Australia/Sydney')='2026-10-25 02:30:00+00'::timestamptz,'Morning T20 due at 13:30 Sydney';
 assert club_selection_private.fixture_day_expected_finish('{"format":"t20"}','{"date":"2026-10-25","start":"14:00"}','Australia/Sydney')='2026-10-25 06:30:00+00'::timestamptz,'Afternoon T20 due at 17:30 Sydney';
 assert club_selection_private.fixture_day_expected_finish('{"format":"t20"}','{"date":"2026-06-01","start":"10:00"}','Australia/Sydney')='2026-06-01 03:30:00+00'::timestamptz,'Standard time is distinct from summer time';
 assert club_selection_private.fixture_day_expected_finish('{"format":"t20"}','{"date":"2026-10-25","start":"10:00","end":"13:00"}','Australia/Sydney')='2026-10-25 02:00:00+00'::timestamptz,'Recorded finish overrides estimate';
 assert club_selection_private.fixture_day_expected_finish('{"format":"t20"}','{"date":"2026-10-25"}','Australia/Sydney')='2026-10-25 07:00:00+00'::timestamptz,'Missing start uses 18:00 local';
 assert club_selection_private.fixture_day_expected_finish('{"format":"limited_overs","overs":50}','{"date":"2026-10-25","start":"10:00"}','Australia/Sydney')='2026-10-25 06:25:00+00'::timestamptz,'Overs-based allowance';
 assert club_selection_private.fixture_day_expected_finish('{"format":"long_form"}','{"date":"2026-10-25","start":"10:00"}','Australia/Sydney')='2026-10-25 07:00:00+00'::timestamptz,'Long-form allowance';
 assert not has_function_privilege('authenticated','club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz)','EXECUTE'),'Scheduler is private';
 assert not has_function_privilege('anon','club_selection_private.fixture_day_expected_finish(jsonb,jsonb,text)','EXECUTE'),'Timing helper is private';
 insert into auth.users(id,email) values(u,'result-timing-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic timing admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Timing test club','timing-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'admin','admin','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',u,'Australia/Sydney');
 insert into public.playing_groups(id,club_id,name) values(g,c,'Cup');
 insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,'Cup teams');
 insert into club_selection_private.selection_group_grades values(c,g,sg);
 insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,generation,updated_by,verified_at,active_season_id,polling_enabled) values(c,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),generation,u,now(),season,false);
 insert into club_selection_private.playhq_grade_mappings values(c,season,team,grade,g);
 src:=jsonb_build_object('source_match_id',mid,'source_team_id',team,'source_grade_id',grade,'opposition','Visitors','format','t20','days','[{"date":"2099-10-25","time":"10:00","start_at":"2099-10-24T23:00:00Z"}]'::jsonb);
 perform club_selection_private.playhq_import_all(c,season,grade,team,jsonb_build_array(src));
 select fixture_id into fid from club_selection_private.playhq_links where club_id=c and match_id=mid;
 select due_at into old_due from club_selection_private.playhq_jobs where club_id=c and kind='results';
 assert old_due='2099-10-25 02:30:00+00'::timestamptz,'New import schedules expected finish';
 select slots into before_slots from club_selection_private.fixtures where id=fid;
 update club_selection_private.fixtures set details=jsonb_set(details,'{days,0,start}','"14:00"') where id=fid;
 assert (select due_at='2099-10-25 06:30:00+00'::timestamptz from club_selection_private.playhq_jobs where club_id=c and kind='results'),'Manual time changes reschedule';
 assert (select slots=before_slots from club_selection_private.fixtures where id=fid),'Rescheduling preserves selections';
 assert not (select polling_enabled from club_selection_private.playhq_connections where club_id=c),'A paused connection stays paused';
 update club_selection_private.fixtures set details=jsonb_set(details,'{days}','[{"date":"2026-10-25","start":"10:00"}]') where id=fid;
 assert club_selection_private.playhq_results_due(fid,null,'2026-10-25 01:00+00')='2026-10-25 02:30+00'::timestamptz,'No scheduled check before expected finish';
 assert club_selection_private.playhq_results_due(fid,null,'2026-10-25 02:30+00')='2026-10-25 02:30+00'::timestamptz,'First check is due at expected finish';
 assert club_selection_private.playhq_results_due(fid,'2026-10-25 02:30+00','2026-10-25 02:30+00')='2026-10-25 03:00+00'::timestamptz,'Missing results retry in 30 minutes';
 assert club_selection_private.playhq_results_due(fid,'2026-10-26 03:00+00','2026-10-26 03:00+00')='2026-10-26 05:00+00'::timestamptz,'Delayed results retry every two hours';
 assert club_selection_private.playhq_results_due(fid,'2026-11-03 03:00+00','2026-11-03 03:00+00')='2026-11-04 03:00+00'::timestamptz,'Late results continue daily';
 update club_selection_private.fixtures set details=jsonb_set(details,'{days}','[{"date":"2026-10-25","start":"10:00"},{"date":"2026-11-01","start":"10:00"}]') where id=fid;
 assert club_selection_private.playhq_results_due(fid,null,'2026-10-25 01:00+00')='2026-10-25 02:30+00'::timestamptz,'Day 1 score downloads are retained';
 assert club_selection_private.playhq_results_due(fid,'2026-11-01 01:00+00','2026-11-01 01:00+00')='2026-11-01 02:30+00'::timestamptz,'Next playing day bounds the wait';
 assert club_selection_private.playhq_results_due(fid,'2026-11-01 02:30+00','2026-11-01 02:30+00')='2026-11-01 03:00+00'::timestamptz,'Day 2 gets a fresh 30-minute retry window';
 -- Exercise the actual worker with an expected finish earlier today.
 update club_selection_private.fixtures set details=jsonb_set(details,'{days}',jsonb_build_array(jsonb_build_object('date',to_char((now()-interval '6 hours') at time zone 'Australia/Sydney','YYYY-MM-DD'),'start',to_char((now()-interval '6 hours') at time zone 'Australia/Sydney','HH24:MI')))) where id=fid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 update club_selection_private.playhq_jobs set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=1 where club_id=c and kind='results' returning to_jsonb(playhq_jobs.*) into job;
 perform public.playhq_sync_worker('finish',jsonb_build_object('club_id',c,'generation',generation,'job',job,'result',jsonb_build_object('source_match_id',mid,'complete',true,'has_figures',false)));
 assert (select due_at=now()+interval '30 minutes' and lease_id is null and checked_at=now() from club_selection_private.playhq_jobs where club_id=c and kind='results'),'FINAL summary without a scorecard keeps retrying';
 card:=jsonb_build_object('schema_version',2,'provider','playhq_au','upstream_match_id',mid,'upstream_grade_id',grade,'upstream_team_id',team,'match_id',ns,'our_team_id',ours,'status','completed','dates',(select jsonb_agg(day->>'date') from club_selection_private.fixtures f,jsonb_array_elements(f.details->'days') day where f.id=fid),'format_key','t20','grade','Cup','teams',jsonb_build_array(jsonb_build_object('id',ours,'source_team_id',team,'name','Timing test club'),jsonb_build_object('id',theirs,'name','Visitors')),'innings','[]'::jsonb);
 sid:=club_selection_private.playhq_store_scorecard(c,fid,card);
 assert sid is not null,'Final scorecard is saved';
 update club_selection_private.playhq_jobs set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=1 where club_id=c and kind='results' returning to_jsonb(playhq_jobs.*) into job;
 perform public.playhq_sync_worker('finish',jsonb_build_object('club_id',c,'generation',generation,'job',job,'result',jsonb_build_object('source_match_id',mid,'complete',true,'shared_scorecard',card)));
 assert (select due_at=now()+interval '4 hours' from club_selection_private.playhq_jobs where club_id=c and kind='results'),'Saved final result switches to correction checks';
 update club_selection_private.playhq_jobs set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=2 where club_id=c and kind='results' returning to_jsonb(playhq_jobs.*) into job;
 perform public.playhq_sync_worker('job_error',jsonb_build_object('club_id',c,'generation',generation,'job',job,'status','429','error','Synthetic provider throttle'));
 select due_at into old_due from club_selection_private.playhq_jobs where club_id=c and kind='results';
 assert old_due=now()+interval '1 hour','Provider-error backoff remains in force';
 update club_selection_private.fixtures set details=jsonb_set(details,'{days,0,start}','"15:00"') where id=fid;
 assert (select due_at=old_due from club_selection_private.playhq_jobs where club_id=c and kind='results'),'Fixture edits do not bypass provider-error backoff';
 raise exception using errcode='ZX001',message='Synthetic result timing checks passed';
 exception when sqlstate 'ZX001' then null;
 end;
end $tests$;
