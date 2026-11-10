-- Official no-play outcomes are shared fixture facts, including future forfeits.
-- No player, scorecard, saved line-up or published snapshot is deleted or rewritten.
create or replace function club_selection_private.fixture_source_no_play(c uuid,fid uuid) returns text
language sql stable set search_path='' as $$
 select case when not coalesce((l.summary->>'has_figures')::boolean,false)
  and not exists(select 1 from public.match_review_scorecards sc
   where sc.club_id=c and sc.source_match_id in (l.match_id,
    (select r.source_match_id from club_selection_private.fixture_result_sources r where r.club_id=c and r.fixture_id=fid),
    nullif(f.scorecard_sync->>'match_id','')::uuid)
    and exists(select 1 from jsonb_array_elements(coalesce(sc.scorecard->'innings','[]')) i
      where jsonb_array_length(coalesce(i->'batters','[]'))>0 or jsonb_array_length(coalesce(i->'bowlers','[]'))>0))
 then case
  when src->>'no_play' in ('won_by_forfeit','lost_by_forfeit') and src->>'source_status'='FINAL' then src->>'no_play'
  when src->>'no_play'='bye' and src->>'source_status' in ('FINAL','BYE') then 'bye'
  when upper(src->>'source_status')='BYE' then 'bye'
  when upper(src->>'source_status') in ('CANCELLED','CANCELED') then 'cancelled'
  when upper(src->>'source_status')='ABANDONED' then 'abandoned'
 end end
 from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c
 cross join lateral(select coalesce(l.pending_fixture,l.source_fixture) src) v
 where l.club_id=c and l.fixture_id=fid
$$;
revoke all on function club_selection_private.fixture_source_no_play(uuid,uuid) from public,anon,authenticated,service_role;

create function club_selection_private.fixture_no_play(c uuid,fid uuid) returns text
language sql stable set search_path='' as $$
 select coalesce((select r.no_play from club_selection_private.fixture_result_sources r where r.club_id=c and r.fixture_id=fid),
  club_selection_private.fixture_source_no_play(c,fid))
$$;
revoke all on function club_selection_private.fixture_no_play(uuid,uuid) from public,anon,authenticated,service_role;

alter table club_selection_private.fixture_result_sources drop constraint fixture_result_sources_no_play_check;
alter table club_selection_private.fixture_result_sources add constraint fixture_result_sources_no_play_check
 check(no_play in ('washed_out','bye','cancelled','won_by_forfeit','lost_by_forfeit'));

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='public.club_selections_api(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$result:=club_selection_private.api(p_club_id,p_action,p_data);$old$,'')))/length($old$result:=club_selection_private.api(p_club_id,p_action,p_data);$old$)<>1 then raise exception 'Unexpected club_selections_api definition';end if;
 execute replace(d,$old$result:=club_selection_private.api(p_club_id,p_action,p_data);$old$,$new$result:=club_selection_private.api(p_club_id,p_action,p_data);
 if p_action='context' then
  result:=jsonb_set(result,'{fixtures}',coalesce((select jsonb_agg(f||jsonb_build_object('no_play',club_selection_private.fixture_no_play(p_club_id,(f->>'id')::uuid))) from jsonb_array_elements(result->'fixtures') f),'[]'));
 end if;$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='public.club_selections_api(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$'pending_change',l.pending_fixture is not null$old$,'')))/length($old$'pending_change',l.pending_fixture is not null$old$)<>1 then raise exception 'Unexpected match_results_api definition';end if;
 execute replace(d,$old$'pending_change',l.pending_fixture is not null$old$,$new$'source_no_play',club_selection_private.fixture_source_no_play(c,fid),'pending_change',l.pending_fixture is not null$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$if action='no_play' then$old$,'')))/length($old$if action='no_play' then$old$)<>1 then raise exception 'Unexpected match_results_api definition';end if;
 execute replace(d,$old$if action='no_play' then$old$,$new$if action='no_play' then
  if club_selection_private.fixture_source_no_play(c,fid) is not null then raise exception 'This result is recorded by PlayHQ. Check fixture changes to refresh it';end if;$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$not in ('washed_out','bye','cancelled')$old$,'')))/length($old$not in ('washed_out','bye','cancelled')$old$)<>1 then raise exception 'Unexpected match_results_api definition';end if;
 execute replace(d,$old$not in ('washed_out','bye','cancelled')$old$,$new$not in ('washed_out','bye','cancelled','won_by_forfeit','lost_by_forfeit')$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz)'::regprocedure;
 if (length(d)-length(replace(d,$old$if previous_finish is null then return coalesce(next_finish,at_time+interval '1 day');end if;$old$,'')))/length($old$if previous_finish is null then return coalesce(next_finish,at_time+interval '1 day');end if;$old$)<>1 then raise exception 'Unexpected playhq_results_due definition';end if;
 execute replace(d,$old$if previous_finish is null then return coalesce(next_finish,at_time+interval '1 day');end if;$old$,$new$if club_selection_private.fixture_no_play((select club_id from club_selection_private.fixtures where id=fid),fid) is not null then
  return greatest(at_time,coalesce(last_checked,at_time)+interval '1 day');
 end if;
 if previous_finish is null then
  if exists(select 1 from club_selection_private.playhq_links l where l.fixture_id=fid and coalesce(l.pending_fixture,l.source_fixture)->>'source_status'='FINAL') then
   return case when last_checked is null then at_time else greatest(at_time,least(next_finish,last_checked+interval '4 hours')) end;
  end if;
  return coalesce(next_finish,at_time+interval '1 day');
 end if;$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.playhq_import_all(uuid,uuid,uuid,uuid,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$on conflict(club_id,kind,source_id,team_id) do nothing;$old$,'')))/length($old$on conflict(club_id,kind,source_id,team_id) do nothing;$old$)<>1 then raise exception 'Unexpected playhq_import_all definition';end if;
 execute replace(d,$old$on conflict(club_id,kind,source_id,team_id) do nothing;$old$,$new$on conflict(club_id,kind,source_id,team_id) do update set due_at=least(club_selection_private.playhq_jobs.due_at,excluded.due_at)
   where src->>'source_status'='FINAL' and club_selection_private.playhq_jobs.checked_at is null and club_selection_private.playhq_jobs.last_error is null
    and coalesce(club_selection_private.playhq_jobs.leased_until,'-infinity')<now();$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.playhq_import_all(uuid,uuid,uuid,uuid,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='public.playhq_sync_worker(text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$   perform club_selection_private.playhq_store_scorecard(c,link.fixture_id,p_data#>'{result,shared_scorecard}');$old$,'')))/length($old$   perform club_selection_private.playhq_store_scorecard(c,link.fixture_id,p_data#>'{result,shared_scorecard}');$old$)<>1 then raise exception 'Unexpected playhq_sync_worker definition';end if;
 execute replace(d,$old$   perform club_selection_private.playhq_store_scorecard(c,link.fixture_id,p_data#>'{result,shared_scorecard}');$old$,$new$   -- Summary checks may discover the same official result before the next draw check.
   if p_data->'result' ? 'no_play' then
    if p_data#>>'{result,source_grade_id}' is distinct from link.grade_id::text or p_data#>>'{result,source_team_id}' is distinct from link.team_id::text then raise exception 'Wrong match result team or grade';end if;
    if coalesce(link.pending_fixture,link.source_fixture)->>'no_play' is distinct from p_data#>>'{result,no_play}' then
     perform club_selection_private.playhq_import_all(c,link.season_id,link.grade_id,link.team_id,jsonb_build_array(coalesce(link.pending_fixture,link.source_fixture)||jsonb_build_object(
      'source_status',p_data#>>'{result,source_status}','source_outcome',p_data#>>'{result,source_outcome}','no_play',p_data#>>'{result,no_play}',
      'cancelled',p_data#>>'{result,no_play}' is not null or p_data#>>'{result,source_status}' in ('CANCELLED','CANCELED'))));
    end if;
   end if;
   perform club_selection_private.playhq_store_scorecard(c,link.fixture_id,p_data#>'{result,shared_scorecard}');$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='public.playhq_sync_worker(text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.api(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);$old$,'')))/length($old$   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);$old$)<>1 then raise exception 'Unexpected api definition';end if;
 execute replace(d,$old$   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);$old$,$new$   if p_action in ('save_board','publish','send_review') and club_selection_private.fixture_no_play(c,m.id) is not null then
    raise exception 'No team selection is needed for a bye or a match that will not be played';
   end if;
   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.api(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.api(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)$old$,'')))/length($old$where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)$old$)<>2 then raise exception 'Unexpected api definition';end if;
 execute replace(d,$old$where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)$old$,$new$where fx.club_id=c and club_selection_private.fixture_no_play(c,fx.id) is null and not coalesce((fx.details->>'cancelled')::boolean,false)$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.api(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.api(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$where other.club_id=c and other.id<>all(ids) and not coalesce$old$,'')))/length($old$where other.club_id=c and other.id<>all(ids) and not coalesce$old$)<>1 then raise exception 'Unexpected api definition';end if;
 execute replace(d,$old$where other.club_id=c and other.id<>all(ids) and not coalesce$old$,$new$where other.club_id=c and other.id<>all(ids) and club_selection_private.fixture_no_play(c,other.id) is null and not coalesce$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.api(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.issues(uuid)'::regprocedure;
 if (length(d)-length(replace(d,$old$ normal_limit:=club_selection_private.normal_player_limit(m.club_id,m.details);$old$,'')))/length($old$ normal_limit:=club_selection_private.normal_player_limit(m.club_id,m.details);$old$)<>1 then raise exception 'Unexpected issues definition';end if;
 execute replace(d,$old$ normal_limit:=club_selection_private.normal_player_limit(m.club_id,m.details);$old$,$new$ if club_selection_private.fixture_no_play(m.club_id,m.id) is not null then return '[]'::jsonb;end if;
 normal_limit:=club_selection_private.normal_player_limit(m.club_id,m.details);$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.issues(uuid)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.issues(uuid)'::regprocedure;
 if (length(d)-length(replace(d,$old$where other.club_id=m.club_id and other.id<>m.id and not coalesce$old$,'')))/length($old$where other.club_id=m.club_id and other.id<>m.id and not coalesce$old$)<>1 then raise exception 'Unexpected issues definition';end if;
 execute replace(d,$old$where other.club_id=m.club_id and other.id<>m.id and not coalesce$old$,$new$where other.club_id=m.club_id and other.id<>m.id and club_selection_private.fixture_no_play(m.club_id,other.id) is null and not coalesce$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.issues(uuid)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.availability_fixtures(uuid)'::regprocedure;
 if (length(d)-length(replace(d,$old$days where days.value is not null and coalesce(i.src->>'cancelled','false')<>'true'$old$,'')))/length($old$days where days.value is not null and coalesce(i.src->>'cancelled','false')<>'true'$old$)<>1 then raise exception 'Unexpected availability_fixtures definition';end if;
 execute replace(d,$old$days where days.value is not null and coalesce(i.src->>'cancelled','false')<>'true'$old$,$new$days where days.value is not null and club_selection_private.fixture_no_play(c,i.fixture_id) is null and coalesce(i.src->>'cancelled','false')<>'true'$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.availability_fixtures(uuid)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.run_availability_reminders(timestamptz)'::regprocedure;
 if (length(d)-length(replace(d,$old$and not coalesce((f.details->>'cancelled')::boolean,false)$old$,'')))/length($old$and not coalesce((f.details->>'cancelled')::boolean,false)$old$)<>1 then raise exception 'Unexpected run_availability_reminders definition';end if;
 execute replace(d,$old$and not coalesce((f.details->>'cancelled')::boolean,false)$old$,$new$and club_selection_private.fixture_no_play(f.club_id,f.id) is null and not coalesce((f.details->>'cancelled')::boolean,false)$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.run_availability_reminders(timestamptz)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.week_message_allowed(uuid,uuid)'::regprocedure;
 if (length(d)-length(replace(d,$old$and not coalesce((f.details->>'cancelled')::boolean,false)$old$,'')))/length($old$and not coalesce((f.details->>'cancelled')::boolean,false)$old$)<>1 then raise exception 'Unexpected week_message_allowed definition';end if;
 execute replace(d,$old$and not coalesce((f.details->>'cancelled')::boolean,false)$old$,$new$and club_selection_private.fixture_no_play(f.club_id,f.id) is null and not coalesce((f.details->>'cancelled')::boolean,false)$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.week_message_allowed(uuid,uuid)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.week_context(uuid,uuid)'::regprocedure;
 if (length(d)-length(replace(d,$old$and not coalesce((f.published->'details'->>'cancelled')::boolean,false)$old$,'')))/length($old$and not coalesce((f.published->'details'->>'cancelled')::boolean,false)$old$)<>1 then raise exception 'Unexpected week_context definition';end if;
 execute replace(d,$old$and not coalesce((f.published->'details'->>'cancelled')::boolean,false)$old$,$new$and club_selection_private.fixture_no_play(c,f.id) is null and not coalesce((f.published->'details'->>'cancelled')::boolean,false)$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.week_context(uuid,uuid)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.validate_withdrawal_plan(uuid,jsonb,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$if coalesce((m.details->>'cancelled')::boolean,false)$old$,'')))/length($old$if coalesce((m.details->>'cancelled')::boolean,false)$old$)<>1 then raise exception 'Unexpected validate_withdrawal_plan definition';end if;
 execute replace(d,$old$if coalesce((m.details->>'cancelled')::boolean,false)$old$,$new$if club_selection_private.fixture_no_play(c,m.id) is not null or coalesce((m.details->>'cancelled')::boolean,false)$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.validate_withdrawal_plan(uuid,jsonb,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$'after',d,'can_apply'$old$,'')))/length($old$'after',d,'can_apply'$old$)<>1 then raise exception 'Unexpected playhq_fixture_review definition';end if;
 execute replace(d,$old$'after',d,'can_apply'$old$,$new$'after',d||jsonb_build_object('no_play',l.pending_fixture->>'no_play'),'can_apply'$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$if f.published is not null then warnings:=warnings||jsonb_build_array('The Head of Selections must review and republish the changed arrangements.');end if;$old$,'')))/length($old$if f.published is not null then warnings:=warnings||jsonb_build_array('The Head of Selections must review and republish the changed arrangements.');end if;$old$)<>1 then raise exception 'Unexpected playhq_fixture_review definition';end if;
 execute replace(d,$old$if f.published is not null then warnings:=warnings||jsonb_build_array('The Head of Selections must review and republish the changed arrangements.');end if;$old$,$new$if f.published is not null then warnings:=warnings||jsonb_build_array(case when l.pending_fixture->>'no_play' is not null then 'No match to play. The previous published team is retained as history.' else 'The Head of Selections must review and republish the changed arrangements.' end);end if;$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

do $patch$
declare d text; acl aclitem[];
begin
 select pg_get_functiondef(oid),proacl into d,acl from pg_proc where oid='club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure;
 if (length(d)-length(replace(d,$old$'requires_republish',f.published is not null$old$,'')))/length($old$'requires_republish',f.published is not null$old$)<>1 then raise exception 'Unexpected playhq_fixture_review definition';end if;
 execute replace(d,$old$'requires_republish',f.published is not null$old$,$new$'requires_republish',f.published is not null and club_selection_private.fixture_no_play(c,f.id) is null$new$);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure),'Existing grants retained';
end $patch$;

CREATE OR REPLACE FUNCTION club_selection_private.refresh_calendar_events(fid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f club_selection_private.fixtures%rowtype;tz text;item record;event_data jsonb;active_events text[]:='{}';
begin
 select * into f from club_selection_private.fixtures where id=fid;
 if f.published is null then return;end if;
 select timezone into tz from club_selection_private.access where club_id=f.club_id;
 if club_selection_private.fixture_no_play(f.club_id,fid) is not null or coalesce((f.published->'details'->>'cancelled')::boolean,false) then
  update club_selection_private.calendar_events set event=jsonb_set(event,'{status}','"CANCELLED"'),sequence=greatest(sequence+1,f.publication),updated_at=now()
   where fixture_id=fid and event->>'status'<>'CANCELLED';
  return;
 end if;
 for item in select distinct r.user_id,day.n::integer day_number,day.value play_day
  from jsonb_array_elements(f.published->'details'->'days') with ordinality day(value,n)
  cross join jsonb_array_elements(f.published->'slots') slot
  join club_selection_private.roster r on r.id::text=slot->>('d'||day.n) and r.club_id=f.club_id
  where r.user_id is not null and r.active and club_selection_private.member(f.club_id,r.user_id)
 loop
  event_data:=jsonb_build_object('date',item.play_day->>'date','status','CONFIRMED',
   'start',case when nullif(item.play_day->>'start','') is not null then to_char(((item.play_day->>'date')::date+(item.play_day->>'start')::time) at time zone tz at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"') end,
   'end',case when nullif(item.play_day->>'end','') is not null and nullif(item.play_day->>'start','') is not null and (item.play_day->>'end')::time>(item.play_day->>'start')::time then to_char(((item.play_day->>'date')::date+(item.play_day->>'end')::time) at time zone tz at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"') end,
   'title',coalesce(f.published->'details'->>'grade','Cricket')||' v '||coalesce(f.published->'details'->>'opposition','Opposition')
    ||case when jsonb_array_length(f.published->'details'->'days')>1 then ' · Day '||item.day_number else '' end,
   'ground',coalesce(f.published->'details'->>'ground',''),'instructions',coalesce(f.published->'details'->>'meeting',''),
   'url','https://mirelionhq.com/app.html?club='||f.club_id||'&tab=teams&team_view=published&fixture='||f.id);
  active_events:=array_append(active_events,item.user_id::text||':'||item.day_number);
  insert into club_selection_private.calendar_events(club_id,user_id,fixture_id,day_number,event,sequence,updated_at)
   values(f.club_id,item.user_id,f.id,item.day_number,event_data,f.publication,coalesce(f.published_at,now()))
   on conflict(club_id,user_id,fixture_id,day_number) do update set event=excluded.event,
    sequence=greatest(club_selection_private.calendar_events.sequence+case when club_selection_private.calendar_events.event is distinct from excluded.event then 1 else 0 end,excluded.sequence),
    updated_at=case when club_selection_private.calendar_events.event is distinct from excluded.event or club_selection_private.calendar_events.sequence<excluded.sequence then now() else club_selection_private.calendar_events.updated_at end;
 end loop;
 update club_selection_private.calendar_events set event=jsonb_set(event,'{status}','"CANCELLED"'),sequence=greatest(sequence+1,f.publication),updated_at=now()
  where fixture_id=fid and event->>'status'<>'CANCELLED' and not (user_id::text||':'||day_number=any(active_events));
end $function$;

create function club_selection_private.refresh_no_play_calendar() returns trigger
language plpgsql set search_path='' as $$
begin
 perform club_selection_private.refresh_calendar_events(case when tg_op='DELETE' then old.fixture_id else new.fixture_id end);
 return coalesce(new,old);
end $$;
revoke all on function club_selection_private.refresh_no_play_calendar() from public,anon,authenticated,service_role;
create trigger playhq_no_play_calendar after update of source_fixture,pending_fixture on club_selection_private.playhq_links
for each row when (coalesce(old.pending_fixture,old.source_fixture)->>'no_play' is distinct from coalesce(new.pending_fixture,new.source_fixture)->>'no_play')
execute function club_selection_private.refresh_no_play_calendar();
create trigger manual_no_play_calendar_insert after insert on club_selection_private.fixture_result_sources
for each row when (new.no_play is not null) execute function club_selection_private.refresh_no_play_calendar();
create trigger manual_no_play_calendar_update after update of no_play on club_selection_private.fixture_result_sources
for each row when (old.no_play is distinct from new.no_play) execute function club_selection_private.refresh_no_play_calendar();
create trigger manual_no_play_calendar_delete after delete on club_selection_private.fixture_result_sources
for each row when (old.no_play is not null) execute function club_selection_private.refresh_no_play_calendar();
