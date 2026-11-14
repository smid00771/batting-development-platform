-- Long-form scorecards become available when the match finishes, not at Day 1
-- stumps. Preserve official early finals, no-play outcomes and correction checks.
do $patch$
declare definition text;old_text text;new_text text;signature regprocedure;acl aclitem[];
begin
 signature:='club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz)'::regprocedure;
 select pg_get_functiondef(oid),proacl into definition,acl from pg_proc where oid=signature;
 if md5(definition)<>'34d645b1fd269b37f3c0055daf130203' then
  raise exception 'Unexpected result timing definition; review before applying';
 end if;
 old_text:=$old$ -- A FINAL provider summary alone is insufficient: wait for the saved scorecard.$old$;
 new_text:=$new$ -- For long form, only the last playing day's finish opens the result window.
 if details->>'format'='long_form' and final_finish is not null then
  previous_finish:=case when final_finish<=at_time then final_finish end;
  next_finish:=case when final_finish>at_time then final_finish end;
 end if;
 -- A FINAL provider summary alone is insufficient: wait for the saved scorecard.$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected result timing anchor';end if;
 execute replace(definition,old_text,new_text);
 assert (select proacl is not distinct from acl from pg_proc where oid=signature),'Timing grants retained';

 -- Guard dispatch and the eventual claim as well as saved due times. This also
 -- covers an old/error job, a resumed connection, or a changed final date.
 for signature,old_text,new_text in values
  ('club_selection_private.schedule_playhq_check()'::regprocedure,
   $old$and club_selection_private.playhq_job_active(j.club_id,j.kind,j.source_id,j.team_id,c.active_season_id)$old$,
   $new$and club_selection_private.playhq_job_active(j.club_id,j.kind,j.source_id,j.team_id,c.active_season_id)
   and (j.kind<>'results' or not exists(
    select 1 from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=l.club_id
    where l.club_id=j.club_id and l.match_id=j.source_id and l.team_id=j.team_id
     and f.details->>'format'='long_form'
     and not coalesce((f.details->>'cancelled')::boolean,false)
     and coalesce(l.pending_fixture,l.source_fixture)->>'source_status' is distinct from 'FINAL'
     and club_selection_private.fixture_no_play(f.club_id,f.id) is null
     and not exists(select 1 from club_selection_private.fixture_result_sources src
      join lateral (select sc.scorecard from public.match_review_scorecards sc where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id order by sc.created_at desc,sc.id desc limit 1) saved on true
      where src.fixture_id=f.id and saved.scorecard->>'status'='completed')
     and club_selection_private.playhq_results_due(f.id,j.checked_at)>now()
   ))$new$),
  ('public.playhq_sync_worker(text,jsonb)'::regprocedure,
   $old$and club_selection_private.playhq_job_active(q.club_id,q.kind,q.source_id,q.team_id,x.active_season_id)$old$,
   $new$and club_selection_private.playhq_job_active(q.club_id,q.kind,q.source_id,q.team_id,x.active_season_id)
   and (q.kind<>'results' or not exists(
    select 1 from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=l.club_id
    where l.club_id=q.club_id and l.match_id=q.source_id and l.team_id=q.team_id
     and f.details->>'format'='long_form'
     and not coalesce((f.details->>'cancelled')::boolean,false)
     and coalesce(l.pending_fixture,l.source_fixture)->>'source_status' is distinct from 'FINAL'
     and club_selection_private.fixture_no_play(f.club_id,f.id) is null
     and not exists(select 1 from club_selection_private.fixture_result_sources src
      join lateral (select sc.scorecard from public.match_review_scorecards sc where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id order by sc.created_at desc,sc.id desc limit 1) saved on true
      where src.fixture_id=f.id and saved.scorecard->>'status'='completed')
     and club_selection_private.playhq_results_due(f.id,q.checked_at)>now()
   ))$new$)
 loop
  select pg_get_functiondef(oid),proacl into definition,acl from pg_proc where oid=signature;
  if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected automatic result claim definition: %',signature;end if;
  execute replace(definition,old_text,new_text);
  assert (select proacl is not distinct from acl from pg_proc where oid=signature),'Worker and dispatcher grants retained';
 end loop;
end $patch$;

-- Defer only premature pending long-form jobs in the active season. A later
-- provider backoff stays later; active leases and all other job fields survive.
update club_selection_private.playhq_jobs job
set due_at=club_selection_private.playhq_results_due(f.id,job.checked_at)
from club_selection_private.playhq_links link
join club_selection_private.fixtures f on f.id=link.fixture_id and f.club_id=link.club_id
join club_selection_private.playhq_connections connection
 on connection.club_id=link.club_id and connection.active_season_id=link.season_id
left join club_selection_private.access a on a.club_id=f.club_id
where job.club_id=link.club_id and job.kind='results'
 and job.source_id=link.match_id and job.team_id=link.team_id
 and coalesce(job.leased_until,'-infinity')<now()
 and f.details->>'format'='long_form' and not coalesce((f.details->>'cancelled')::boolean,false)
 and coalesce(link.pending_fixture,link.source_fixture)->>'source_status' is distinct from 'FINAL'
 and club_selection_private.fixture_no_play(f.club_id,f.id) is null
 and (select max(club_selection_private.fixture_day_expected_finish(f.details,day,a.timezone))
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
 and club_selection_private.playhq_results_due(f.id,job.checked_at)>job.due_at;
