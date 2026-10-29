-- Achievement alerts reuse normal results imports after the match finishes.
-- No extra live polling or weekly-awards wait is required.

do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.playhq_results_due(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure);old_text text;new_text text;
begin
 old_text:=$old$received boolean;cadence interval;live_due timestamptz;$old$;
 new_text:=$new$received boolean;cadence interval;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected definition: playhq_results_due';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$ if not received and exists(select 1 from club_selection_private.fixtures f join club_selection_private.social_award_settings s on s.club_id=f.club_id and s.milestone_alerts where f.id=fid) then
  select min(greatest(at_time,coalesce(last_checked+interval '10 minutes',at_time),starts)) into live_due
  from (select ((d->>'date')::date+case when d->>'start' ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then (d->>'start')::time else time '10:00' end) at time zone coalesce(tz,'Australia/Sydney')+interval '30 minutes' starts,
   club_selection_private.fixture_day_expected_finish(details,d,tz) finish from jsonb_array_elements(coalesce(details->'days','[]')) d) times
  where finish>at_time;
  if live_due is not null then return least(live_due,coalesce(next_finish,live_due));end if;
 end if;
$old$;
 new_text:=$new$$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected definition: playhq_results_due';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.social_milestone_candidates(jsonb)'::regprocedure);old_text text;new_text text;
begin
 old_text:=$old$and x#>>'{scorecard,status}' in ('completed','in_progress')$old$;
 new_text:=$new$and x#>>'{scorecard,status}'='completed'$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected definition: social_milestone_candidates';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.collect_social_milestones(uuid,uuid)'::regprocedure);old_text text;new_text text;
begin
 old_text:=$old$if card is null or not exists$old$;
 new_text:=$new$if card is null or card->>'status' is distinct from 'completed' or not exists$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected definition: collect_social_milestones';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.social_awards_api(uuid,text,jsonb)'::regprocedure);old_text text;new_text text;
begin
 old_text:=$old$  if coalesce(cfg.milestone_alerts,false) is distinct from (value#>>'{}')::boolean then
   update club_selection_private.playhq_jobs job set due_at=club_selection_private.playhq_results_due(link.fixture_id,job.checked_at)
    from club_selection_private.playhq_links link where link.club_id=c and job.club_id=c and job.kind='results' and job.source_id=link.match_id and job.team_id=link.team_id
    and coalesce(job.leased_until,'-infinity')<now() and job.last_error is null;
  end if;
$old$;
 new_text:=$new$$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected definition: social_awards_api';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Remove any earlier live-check due time without interrupting leases or retries.
update club_selection_private.playhq_jobs job
set due_at=club_selection_private.playhq_results_due(link.fixture_id,job.checked_at)
from club_selection_private.playhq_links link,club_selection_private.social_award_settings settings
where link.club_id=job.club_id and job.kind='results' and job.source_id=link.match_id and job.team_id=link.team_id
 and settings.club_id=job.club_id and settings.milestone_alerts
 and coalesce(job.leased_until,'-infinity')<now() and job.last_error is null
 and job.due_at<club_selection_private.playhq_results_due(link.fixture_id,job.checked_at);

