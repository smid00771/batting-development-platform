-- Reuse club and published-fixture facts instead of rescanning the whole season for every recipient.
CREATE OR REPLACE FUNCTION club_selection_private.notify_publication_batch(p_club_id uuid, p_changes jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare delivery record;fixture record;mid uuid;title_text text;body_text text;tail_text text;line_text text;
 first_count int;updated_count int;shown int;total int;recipients int:=0;
begin
 if p_changes='[]'::jsonb then return 0;end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 30 then raise exception 'Invalid publication batch';end if;
 if (select count(distinct f.id) from jsonb_array_elements(p_changes) x
 join club_selection_private.fixtures f on f.id=(x->>'fixture_id')::uuid and f.club_id=p_club_id and f.published is not null)<>jsonb_array_length(p_changes)
 then raise exception 'Publication fixtures must belong to this club';end if;
 for delivery in
  with matches as materialized (
   select f.*,x->'old_snapshot'->'slots' old_slots,
    club_selection_private.season_captains(p_club_id,club_selection_private.fixture_group_id(p_club_id,f.published->'details')) captain_users,
    not coalesce((f.details->>'cancelled')::boolean,false)
     and not coalesce((f.published#>>'{details,cancelled}')::boolean,false)
     and now()<club_selection_private.captain_expires(p_club_id,f.details) captain_current
   from jsonb_array_elements(p_changes) x
   join club_selection_private.fixtures f on f.id=(x->>'fixture_id')::uuid and f.club_id=p_club_id and f.published is not null
  ), selected as materialized (
   select distinct f.id fixture_id,r.user_id
   from matches f,jsonb_array_elements(f.published->'slots') slot,club_selection_private.roster r
   where r.club_id=p_club_id and r.active and r.user_id is not null and (slot->>'d1'=r.id::text or slot->>'d2'=r.id::text)
  ), captains as materialized (
   -- All these fixtures are published: the manual, unpublished captain branch cannot apply.
   select distinct f.id fixture_id,cap.user_id
   from matches f cross join lateral jsonb_array_elements(f.published#>'{details,days}') with ordinality day(value,n)
   join club_selection_private.roster cap on cap.club_id=p_club_id and cap.active and cap.user_id is not null
    and case when jsonb_typeof(f.published#>'{details,match_roles}')='object'
     then cap.id::text=f.published#>'{details,match_roles}'->('d'||day.n::text)->>'captain_id'
     else cap.user_id::text=f.published#>>'{details,captain_id}' end
   where f.captain_current and exists(select 1 from jsonb_array_elements(f.published->'slots') slot where slot->>('d'||day.n::text)=cap.id::text)
  ), club_access as materialized (select club_selection_private.enabled(p_club_id) enabled),
  people as materialized (
   select cm.user_id,club_selection_private.selection_viewer(p_club_id,cm.user_id) is_selector,
    cm.involvement in ('player','both') is_playing,
    array(select f.id from matches f
     where exists(select 1 from club_selection_private.roster r,jsonb_array_elements(coalesce(f.old_slots,'[]'::jsonb)) slot
      where r.club_id=p_club_id and r.user_id=cm.user_id and (slot->>'d1'=r.id::text or slot->>'d2'=r.id::text))
     or (select enabled from club_access) and case
      when exists(select 1 from selected s where s.fixture_id=f.id and s.user_id=cm.user_id) then true
      when cm.user_id=any(f.captain_users) then true
      when (f.published#>'{details,staff}') ? cm.user_id::text then true
      when exists(select 1 from captains cap where cap.fixture_id=f.id and cap.user_id=cm.user_id) then true
      else club_selection_private.selection_view(p_club_id,f.details,cm.user_id) end
     order by f.id) fixture_ids
   from public.club_memberships cm where cm.club_id=p_club_id
  )
  select is_selector,is_playing,fixture_ids,array_agg(user_id order by user_id) user_ids
  from people where cardinality(fixture_ids)>0 group by is_selector,is_playing,fixture_ids
 loop
  select count(*) filter(where x->'old_snapshot' is null or x->'old_snapshot'='null'::jsonb),
   count(*) filter(where x->'old_snapshot' is not null and x->'old_snapshot'<>'null'::jsonb)
  into first_count,updated_count from jsonb_array_elements(p_changes) x where (x->>'fixture_id')::uuid=any(delivery.fixture_ids);
  title_text:=case when updated_count=0 then 'Teams published' when first_count=0 then 'Teams updated' else 'Teams published and updated' end;
  body_text:=case when delivery.is_selector then 'The Head of Selection has ' else 'Teams have been ' end||
   case when updated_count=0 then 'published' when first_count=0 then 'updated' else 'published and updated' end||
   case when delivery.is_selector then ' teams for:' else ' for:' end;
  tail_text:=E'\n\n'||case
   when delivery.is_selector and delivery.is_playing then 'Open Teams to view all teams and check your own selection and playing dates.'
   when delivery.is_selector then 'Open Teams to view the published teams.'
   when delivery.is_playing then 'Open Teams to check your selection and playing dates, or contact a selector.'
   else 'Open Teams to view the published teams for your matches.' end;
  shown:=0;total:=cardinality(delivery.fixture_ids);
  for fixture in select f.id,f.published->'details' details,
   x->'old_snapshot'->'details' old_details,x->'old_snapshot' is null or x->'old_snapshot'='null'::jsonb first_publication
   from jsonb_array_elements(p_changes) x join club_selection_private.fixtures f on f.id=(x->>'fixture_id')::uuid
   where f.id=any(delivery.fixture_ids)
   order by f.published->'details'->'days'->0->>'date',f.published->'details'->>'grade',f.id
  loop
   line_text:=E'\n'||club_selection_private.publication_fixture_label(fixture.details)||
    case when first_count>0 and updated_count>0 then case when fixture.first_publication then ' [published]' else ' [updated]' end else '' end;
   if not fixture.first_publication then
    if coalesce((fixture.details->>'cancelled')::boolean,false) then line_text:=line_text||' · MATCH CANCELLED';
    elsif coalesce((fixture.old_details->>'cancelled')::boolean,false) then line_text:=line_text||' · MATCH REINSTATED';end if;
    if fixture.details->>'ground' is distinct from fixture.old_details->>'ground' then line_text:=line_text||' · Ground changed: '||coalesce(nullif(fixture.details->>'ground',''),'to be confirmed');end if;
    if fixture.details->'days' is distinct from fixture.old_details->'days' then line_text:=line_text||' · Playing dates/times changed';end if;
    if fixture.details->>'meeting' is distinct from fixture.old_details->>'meeting' then line_text:=line_text||' · Meeting arrangements changed';end if;
   end if;
   -- Keep dates and formats intact. Very large batches link to the full list.
   if length(body_text)+length(line_text)+length(tail_text)+85>1500 then exit;end if;
   body_text:=body_text||line_text;shown:=shown+1;
  end loop;
  if shown<total then body_text:=body_text||E'\nAnd '||(total-shown)||' more fixtures; open Teams to view the full list.';end if;
  body_text:=body_text||tail_text;
  insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
   values(p_club_id,null,gen_random_uuid(),title_text,body_text,'teams',true,'selection:batch:publication:'||gen_random_uuid()::text) returning id into mid;
  insert into club_selection_private.notifications(message_id,fixture_id,kind)
   select mid,f,'publication' from unnest(delivery.fixture_ids) f;
  insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy)
   select mid,u,false from unnest(delivery.user_ids) u;
  recipients:=recipients+cardinality(delivery.user_ids);
 end loop;
 return recipients;
end
$function$;
