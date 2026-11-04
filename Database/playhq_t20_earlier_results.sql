-- Start T20 result checks after 2.5 hours instead of the conservative 3.5-hour
-- selection-overlap allowance. This schedules a check, never match completion.
-- Missing scorecards retain the existing 30-minute retries and error backoff.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.fixture_day_expected_finish(jsonb,jsonb,text)'::regprocedure);
 if md5(definition)<>'d909bfb2f71b07116c3c8dbc9d4efd14' then
  raise exception 'Unexpected T20 result timing definition; review before applying';
 end if;
 definition:=replace(definition,
  '-- Same allowances as the selection overlap guard. Unknown starts use 18:00.',
  '-- Initial result-check estimates. Unknown starts use 18:00; T20 checks start after 2.5 hours.');
 definition:=replace(definition,$old$details->>'format'='t20' then 210$old$,$new$details->>'format'='t20' then 150$new$);
 execute definition;
end $patch$;

-- Bring forward only upcoming eligible T20 checks. Preserve completed/no-play
-- results, earlier checks, paused connections, inactive seasons, leases and errors.
update club_selection_private.playhq_jobs job
set due_at=club_selection_private.playhq_results_due(f.id,job.checked_at)
from club_selection_private.playhq_links link
join club_selection_private.fixtures f on f.id=link.fixture_id and f.club_id=link.club_id
join club_selection_private.playhq_connections connection
 on connection.club_id=link.club_id and connection.active_season_id=link.season_id
left join club_selection_private.access a on a.club_id=f.club_id
where job.club_id=link.club_id and job.kind='results'
 and job.source_id=link.match_id and job.team_id=link.team_id
 and connection.polling_enabled and connection.verified_at is not null
 and club_selection_private.playhq_job_active(job.club_id,job.kind,job.source_id,job.team_id,connection.active_season_id)
 and job.last_error is null and coalesce(job.leased_until,'-infinity')<now()
 and f.details->>'format'='t20' and not coalesce((f.details->>'cancelled')::boolean,false)
 and (select min(club_selection_private.fixture_day_expected_finish(f.details,day,a.timezone))
      from jsonb_array_elements(coalesce(f.details->'days','[]')) day)>now()
 and not exists(
  select 1 from club_selection_private.fixture_result_sources src
  left join lateral (
   select sc.scorecard from public.match_review_scorecards sc
   where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id
   order by sc.created_at desc,sc.id desc limit 1
  ) saved on true
  where src.fixture_id=f.id and (src.no_play is not null or saved.scorecard->>'status'='completed')
 )
 and club_selection_private.playhq_results_due(f.id,job.checked_at)<job.due_at;
