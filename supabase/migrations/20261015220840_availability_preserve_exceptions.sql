-- Preserve deliberate unavailability when a club repeats its bulk date setup.
alter table club_selection_private.availability add column unavailable_dates jsonb not null default '[]'::jsonb
 check(jsonb_typeof(unavailable_dates)='array');
create table club_selection_private.availability_date_setups (
 club_id uuid not null references public.clubs(id) on delete cascade,
 match_date date not null,bulk_saved_at timestamptz not null,updated_at timestamptz not null,
 primary key(club_id,match_date)
);
alter table club_selection_private.availability_date_setups enable row level security;
revoke all on club_selection_private.availability_date_setups from public,anon,authenticated;

-- Recover existing setup dates and exceptions without changing any available dates.
insert into club_selection_private.availability_date_setups(club_id,match_date,bulk_saved_at,updated_at)
 select club_id,(payload->>'date')::date,max(created_at),max(created_at)
 from club_selection_private.requests where action='availability_batch' and result->>'saved'='true'
 group by club_id,(payload->>'date')::date;
with latest as (
 select distinct on(club_id,payload->>'date') club_id,payload,created_at
 from club_selection_private.requests where action='availability_batch' and result->>'saved'='true'
 order by club_id,payload->>'date',created_at desc,request_id desc
), exceptions as (
 select r.id,jsonb_agg(distinct l.payload->>'date') dates from latest l
 join club_selection_private.roster r on r.club_id=l.club_id and (l.payload->'revisions') ? r.id::text
 join club_selection_private.availability a on a.roster_id=r.id
 where not a.available_dates ? (l.payload->>'date') group by r.id
)
update club_selection_private.availability a set unavailable_dates=e.dates from exceptions e where a.roster_id=e.id;

do $migration$
declare definition text;before text;after text;
begin
 select pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure) into definition;
 before:=$before$  'publication_head_id',club_selection_private.publication_head(c),$before$;
 after:=$after$  'availability_dates',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('date',ds.match_date,'bulk_saved_at',ds.bulk_saved_at,'updated_at',ds.updated_at) order by ds.match_date desc) from club_selection_private.availability_date_setups ds where ds.club_id=c),'[]') else '[]'::jsonb end,
  'publication_head_id',club_selection_private.publication_head(c),$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Availability API changed; review migration';end if;
 definition:=replace(definition,before,after);
 before:=$before$ elsif p_action='availability' then
  pid:=(p_data->>'id')::uuid;select * into r from club_selection_private.roster where id=pid and club_id=c and active;
  if not found or not (adm or sel or r.user_id=me) then raise exception 'Edit only your own availability';end if;
  select * into a from club_selection_private.availability where roster_id=pid;
  if coalesce(a.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Availability changed. Reload before saving';end if;
  if p_data->>'calendar_mode' is distinct from 'opt_in' then raise exception 'Reload the updated app to mark available dates';end if;
  if coalesce((p_data->>'usual_available')::boolean,false) or coalesce(p_data->'blocks','[]'::jsonb)<>'[]'::jsonb then raise exception 'Mark individual available dates; automatic availability and blackouts are no longer used';end if;
  if jsonb_typeof(p_data->'available_dates') is distinct from 'array' or jsonb_array_length(p_data->'available_dates')>1500 then raise exception 'Invalid availability calendar';end if;
  for x in select * from jsonb_array_elements(p_data->'available_dates') loop
   v:=x#>>'{}';
   if jsonb_typeof(x)<>'string' or coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Invalid available date';end if;
  end loop;
  select coalesce(jsonb_agg(value order by value),'[]') into notes from (select distinct value from jsonb_array_elements_text(p_data->'available_dates')) dates;
  insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,checked_by) values(pid,false,'[]',notes,me)
  on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
  -- One private selector alert per affected future fixture, including published lists.
  for fid in select unnest(club_selection_private.availability_affected(c,pid,a.available_dates,notes)) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'alert_recipients',changed);
 elsif p_action='availability_batch' then
  if not (adm or sel) then raise exception 'Selector access required';end if;
  if not coalesce((p_data->>'make_all_available')::boolean,false) then raise exception 'Confirm Make all players available for this date';end if;
  v:=p_data->>'date';
  if coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Choose a valid date';end if;
  if acc.roster_revision<>coalesce((p_data->>'roster_revision')::int,-1) then raise exception 'Playing list changed. Reload before setting this date';end if;
  if jsonb_typeof(p_data->'unavailable_ids') is distinct from 'array' or jsonb_typeof(p_data->'revisions') is distinct from 'object' then raise exception 'Review the playing list before setting this date';end if;
  for uid in select jsonb_array_elements_text(p_data->'unavailable_ids')::uuid loop
   if uid is null or not exists(select 1 from club_selection_private.roster where id=uid and club_id=c and active) then raise exception 'Choose unavailable players from this club playing list';end if;
  end loop;
  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active order by id loop
   select * into a from club_selection_private.availability where roster_id=r.id;
   if coalesce(a.revision,0)<>coalesce((p_data->'revisions'->>r.id::text)::int,-1) then raise exception 'A player updated their calendar. Reload before setting this date';end if;
   select coalesce(jsonb_agg(d order by d),'[]') into notes from (
    select distinct value as d from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where value<>v
    union select v where not (p_data->'unavailable_ids') ? r.id::text
   ) dates;
   ids:=ids||club_selection_private.availability_affected(c,r.id,a.available_dates,notes);
   insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,checked_by) values(r.id,false,'[]',notes,me)
   on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
   data_limit:=data_limit+1;
  end loop;
  if data_limit=0 then raise exception 'Add players before setting availability';end if;
  for fid in select distinct unnest(ids) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'date',v,'players',data_limit,'alert_recipients',changed);
$before$;
 after:=$after$ elsif p_action='availability' then
  pid:=(p_data->>'id')::uuid;select * into r from club_selection_private.roster where id=pid and club_id=c and active;
  if not found or not (adm or sel or r.user_id=me) then raise exception 'Edit only your own availability';end if;
  select * into a from club_selection_private.availability where roster_id=pid;
  if coalesce(a.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Availability changed. Reload before saving';end if;
  if p_data->>'calendar_mode' is distinct from 'opt_in' then raise exception 'Reload the updated app to mark available dates';end if;
  if coalesce((p_data->>'usual_available')::boolean,false) or coalesce(p_data->'blocks','[]'::jsonb)<>'[]'::jsonb then raise exception 'Mark individual available dates; automatic availability and blackouts are no longer used';end if;
  if jsonb_typeof(p_data->'available_dates') is distinct from 'array' or jsonb_array_length(p_data->'available_dates')>1500 then raise exception 'Invalid availability calendar';end if;
  for x in select * from jsonb_array_elements(p_data->'available_dates') loop
   v:=x#>>'{}';
   if jsonb_typeof(x)<>'string' or coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Invalid available date';end if;
  end loop;
  select coalesce(jsonb_agg(value order by value),'[]') into notes from (select distinct value from jsonb_array_elements_text(p_data->'available_dates')) dates;
  -- Remember deliberately removed dates, independently of dates not yet answered.
  select coalesce(jsonb_agg(d order by d),'[]') into old from (
   select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where not notes ? value
   union select value from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where not notes ? value
  ) dates;
  insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(pid,false,'[]',notes,old,me)
  on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
  update club_selection_private.availability_date_setups ds set updated_at=now()
   where ds.club_id=c and (coalesce(a.available_dates,'[]') ? ds.match_date::text) is distinct from (notes ? ds.match_date::text);
  -- One private selector alert per affected future fixture, including published lists.
  for fid in select unnest(club_selection_private.availability_affected(c,pid,a.available_dates,notes)) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'alert_recipients',changed);
 elsif p_action='availability_batch' then
  if not (adm or sel) then raise exception 'Selector access required';end if;
  if not coalesce((p_data->>'make_all_available')::boolean,false) then raise exception 'Confirm Make all players available for this date';end if;
  v:=p_data->>'date';
  if coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Choose a valid date';end if;
  if acc.roster_revision<>coalesce((p_data->>'roster_revision')::int,-1) then raise exception 'Playing list changed. Reload before setting this date';end if;
  if jsonb_typeof(p_data->'unavailable_ids') is distinct from 'array' or jsonb_typeof(p_data->'revisions') is distinct from 'object' then raise exception 'Review the playing list before setting this date';end if;
  if jsonb_typeof(coalesce(p_data->'available_ids','[]')) is distinct from 'array' then raise exception 'Review the players being marked available';end if;
  if p_data ? 'reset_unavailable' and jsonb_typeof(p_data->'reset_unavailable') is distinct from 'boolean' then raise exception 'Choose whether to clear saved unavailability';end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'available_ids','[]')) p where p_data->'unavailable_ids' ? p.value) then raise exception 'A player cannot be both available and unavailable';end if;
  for uid in select jsonb_array_elements_text((p_data->'unavailable_ids')||coalesce(p_data->'available_ids','[]'))::uuid loop
   if uid is null or not exists(select 1 from club_selection_private.roster where id=uid and club_id=c and active) then raise exception 'Choose unavailable players from this club playing list';end if;
  end loop;
  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active order by id loop
   select * into a from club_selection_private.availability where roster_id=r.id;
   if coalesce(a.revision,0)<>coalesce((p_data->'revisions'->>r.id::text)::int,-1) then raise exception 'A player updated their calendar. Reload before setting this date';end if;
   select coalesce(jsonb_agg(d order by d),'[]') into old from (
    select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where value<>v
    union select v where (p_data->'unavailable_ids') ? r.id::text
     or (coalesce(a.unavailable_dates,'[]') ? v and not coalesce((p_data->>'reset_unavailable')::boolean,false)
         and not coalesce(p_data->'available_ids','[]') ? r.id::text)
   ) dates;
   select coalesce(jsonb_agg(d order by d),'[]') into notes from (
    select distinct value as d from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where value<>v
    union select v where not old ? v
   ) dates;
   ids:=ids||club_selection_private.availability_affected(c,r.id,a.available_dates,notes);
   insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(r.id,false,'[]',notes,old,me)
   on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
   data_limit:=data_limit+1;
  end loop;
  if data_limit=0 then raise exception 'Add players before setting availability';end if;
  insert into club_selection_private.availability_date_setups(club_id,match_date,bulk_saved_at,updated_at) values(c,v::date,now(),now())
  on conflict(club_id,match_date) do update set bulk_saved_at=excluded.bulk_saved_at,updated_at=excluded.updated_at;
  for fid in select distinct unnest(ids) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'date',v,'players',data_limit,'saved_at',now(),'alert_recipients',changed);
$after$;
 if (length(definition)-length(replace(definition,before,'')))/length(before)<>1 then raise exception 'Availability API changed; review migration';end if;
 definition:=replace(definition,before,after);
 execute definition;
end $migration$;
