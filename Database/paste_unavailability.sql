-- One atomic, receipt-protected change to explicitly reviewed players and dates.
create function club_selection_private.paste_unavailability(c uuid,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();rid uuid;prior club_selection_private.requests%rowtype;
 ids uuid[];days text[];p club_selection_private.roster%rowtype;a club_selection_private.availability%rowtype;
 available jsonb;unavailable jsonb;affected uuid[]:='{}';fid uuid;answer jsonb;recipients integer:=0;
begin
 if me is null or not club_selection_private.member(c,me) or not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Current club membership required';end if;
 if not club_selection_private.enabled(c) or not (club_selection_private.selection_editor(c,me) or public.is_club_admin(c)) then raise exception 'Club Admin or selector access required';end if;
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>250000 then raise exception 'Invalid availability request';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 rid:=(d->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into prior from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if prior.request_id is not null then if prior.action<>'availability_paste' or prior.payload<>d then raise exception 'Request ID already used';end if;return prior.result;end if;
 if jsonb_typeof(d->'player_ids') is distinct from 'array' or jsonb_typeof(d->'dates') is distinct from 'array' or jsonb_typeof(d->'revisions') is distinct from 'object' then raise exception 'Review players and dates before saving';end if;
 ids:=array(select jsonb_array_elements_text(d->'player_ids')::uuid);days:=array(select jsonb_array_elements_text(d->'dates'));
 if cardinality(ids) not between 1 and 500 or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
  or cardinality(ids)<>(select count(*) from club_selection_private.roster where club_id=c and active and id=any(ids)) then raise exception 'Choose active players from this club';end if;
 if cardinality(days) not between 1 and 31 or cardinality(days)<>(select count(distinct day) from unnest(days) day)
  or exists(select 1 from unnest(days) day where day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or day::date::text<>day) then raise exception 'Choose up to 31 valid dates';end if;
 if (select roster_revision from club_selection_private.access where club_id=c) is distinct from (d->>'roster_revision')::integer then raise exception 'Playing list changed. Reopen and review the names before saving';end if;
 for p in select * from club_selection_private.roster where club_id=c and id=any(ids) order by id loop
  select * into a from club_selection_private.availability where roster_id=p.id for update;
  if coalesce(a.revision,0)<>coalesce((d->'revisions'->>p.id::text)::integer,-1) then raise exception 'A player updated their calendar. Reopen and review before saving';end if;
  select coalesce(jsonb_agg(value order by value),'[]') into available from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where not value=any(days);
  select jsonb_agg(value order by value) into unavailable from (select value from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) union select unnest(days)) dates;
  affected:=affected||club_selection_private.availability_affected(c,p.id,a.available_dates,available);
  insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates,checked_by) values(p.id,available,unavailable,me)
   on conflict(roster_id) do update set available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,
    revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
 end loop;
 for fid in select distinct unnest(affected) loop recipients:=recipients+club_selection_private.notify_availability(fid);end loop;
 answer:=jsonb_build_object('saved',true,'players',cardinality(ids),'dates',to_jsonb(days),'alert_recipients',recipients);
 insert into club_selection_private.requests values(c,me,rid,'availability_paste',d,answer,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'availability_paste',jsonb_build_object('players',ids,'dates',days,'request_id',rid));
 return answer;
end $$;
revoke all on function club_selection_private.paste_unavailability(uuid,jsonb) from public,anon,authenticated;
do $patch$
declare definition text:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);needle text:='result:=club_selection_private.api(p_club_id,p_action,p_data);';
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected selections wrapper';end if;
 execute replace(definition,needle,'if p_action=''availability_paste'' then return club_selection_private.paste_unavailability(p_club_id,p_data);end if;'||E'\n '||needle);
end $patch$;
