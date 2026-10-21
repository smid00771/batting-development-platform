-- Selection Groups sit above the existing shared grades. No grade, captain or fixture is replaced.
create table club_selection_private.selection_groups (
 id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 100), unique(club_id,id)
);
create unique index selection_groups_name on club_selection_private.selection_groups(club_id,lower(btrim(name)));
create table club_selection_private.selection_group_grades (
 club_id uuid not null references public.clubs(id) on delete cascade,
 grade_id uuid primary key references public.playing_groups(id) on delete cascade,
 selection_group_id uuid not null,
 foreign key(club_id,selection_group_id) references club_selection_private.selection_groups(club_id,id)
);
create index selection_group_grades_group on club_selection_private.selection_group_grades(club_id,selection_group_id);
create table club_selection_private.playhq_team_catalogues (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,
 season_id uuid not null,generation uuid not null,teams jsonb not null,created_at timestamptz not null default now(),unique(club_id,season_id)
);
create table club_selection_private.playhq_grade_mappings (
 club_id uuid not null references public.clubs(id) on delete cascade,season_id uuid not null,team_id uuid not null,source_grade_id uuid not null,
 grade_id uuid not null references public.playing_groups(id) on delete cascade,
 primary key(club_id,season_id,team_id),unique(club_id,season_id,grade_id)
);
alter table club_selection_private.selection_groups enable row level security;
alter table club_selection_private.selection_group_grades enable row level security;
alter table club_selection_private.playhq_team_catalogues enable row level security;
alter table club_selection_private.playhq_grade_mappings enable row level security;
revoke all on club_selection_private.selection_groups,club_selection_private.selection_group_grades,club_selection_private.playhq_team_catalogues,club_selection_private.playhq_grade_mappings from public,anon,authenticated;

create function club_selection_private.selection_groups_context(c uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'revision',coalesce((select revision from club_selection_private.team_settings where club_id=c),0),
  'selection_groups',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id) from club_selection_private.selection_groups where club_id=c),'[]'),
  'grades',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'selection_group_id',m.selection_group_id) order by g.sort_order,g.name,g.id) from public.playing_groups g left join club_selection_private.selection_group_grades m on m.grade_id=g.id and m.club_id=c where g.club_id=c and g.active),'[]'),
  'expected_grades',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by id) from public.playing_groups where club_id=c and active),'[]'),
  'mappings',coalesce((select jsonb_agg(to_jsonb(m) - 'club_id' order by season_id,team_id) from club_selection_private.playhq_grade_mappings m join public.playing_groups g on g.id=m.grade_id and g.club_id=c and g.active where m.club_id=c),'[]'))
$$;
revoke all on function club_selection_private.selection_groups_context(uuid) from public,anon,authenticated;

create function club_selection_private.fixture_selection_group(c uuid,d jsonb) returns uuid
language sql stable set search_path='' as $$
 select selection_group_id from club_selection_private.selection_group_grades where club_id=c and grade_id=club_selection_private.fixture_group_id(c,d)
$$;
-- Before a club completes setup, retain its existing competition-scoped behaviour.
create function club_selection_private.selection_scope(c uuid,d jsonb) returns text
language sql stable set search_path='' as $$
 select coalesce('group:'||club_selection_private.fixture_selection_group(c,d)::text,'competition:'||lower(btrim(coalesce(d->>'competition',''))))
$$;
revoke all on function club_selection_private.fixture_selection_group(uuid,jsonb),club_selection_private.selection_scope(uuid,jsonb) from public,anon,authenticated;

-- Only the server-to-server PlayHQ adapter may save the club's discovered teams.
create function public.playhq_store_teams(p_club_id uuid,p_generation uuid,p_season_id uuid,p_teams jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg club_selection_private.playhq_connections%rowtype;tid uuid;clean jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server access required';end if;
 if p_season_id is null or jsonb_typeof(p_teams) is distinct from 'array' or jsonb_array_length(p_teams)>1000 or octet_length(p_teams::text)>2000000 then raise exception 'Invalid season teams';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,9200));
 select * into cfg from club_selection_private.playhq_connections where club_id=p_club_id;
 if not found or cfg.generation is distinct from p_generation then raise exception 'Connection changed. Reload the season';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',(t->>'id')::uuid,'name',left(t->>'name',200),'grade',case when nullif(t#>>'{grade,id}','') is not null then jsonb_build_object('id',(t#>>'{grade,id}')::uuid,'name',left(t#>>'{grade,name}',200)) end) order by t#>>'{grade,name}',t->>'name',t->>'id'),'[]') into clean
 from jsonb_array_elements(p_teams) t where lower(t#>>'{club,id}')=cfg.organisation_id::text;
 insert into club_selection_private.playhq_team_catalogues(club_id,season_id,generation,teams) values(p_club_id,p_season_id,p_generation,clean)
 on conflict(club_id,season_id) do update set id=gen_random_uuid(),generation=excluded.generation,teams=excluded.teams,created_at=now() returning id into tid;
 return jsonb_build_object('catalogue_id',tid,'teams',clean);
end $$;
revoke all on function public.playhq_store_teams(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.playhq_store_teams(uuid,uuid,uuid,jsonb) to service_role;

create function public.club_selection_groups(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=p_club_id;me uuid:=auth.uid();ctx jsonb;row jsonb;src jsonb;gid uuid;sg uuid;nm text;rid uuid;receipt club_selection_private.requests%rowtype;cat club_selection_private.playhq_team_catalogues%rowtype;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 if not(public.is_club_admin(c) or club_selection_private.selector(c,me) or club_selection_private.captain(c,me)) then raise exception 'Club setup or Selection Board access required';end if;
 if p_action='context' then return club_selection_private.selection_groups_context(c)||jsonb_build_object('can_edit',public.is_club_admin(c));end if;
 if p_action<>'save' then raise exception 'Unknown Selection Group action';end if;
 if not public.is_club_admin(c) then raise exception 'Club Admin manages grades and Selection Groups';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>250000 then raise exception 'Invalid setup request';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 rid:=nullif(p_data->>'request_id','')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into receipt from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if receipt.action<>'selection_groups' or receipt.payload<>p_data then raise exception 'This request ID was already used';end if;return receipt.result;end if;
 ctx:=club_selection_private.selection_groups_context(c);
 if ctx->'revision' is distinct from p_data->'revision' or ctx->'expected_grades' is distinct from p_data->'expected_grades' then raise exception 'Club setup changed. Reload before confirming the grades';end if;
 if jsonb_typeof(p_data->'groups') is distinct from 'array' or jsonb_array_length(p_data->'groups') not between 1 and 100 or jsonb_typeof(p_data->'grades') is distinct from 'array' or jsonb_array_length(p_data->'grades') not between 1 and 500 then raise exception 'Create a Selection Group and assign your grades';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'groups') x group by x->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_data->'groups') x group by lower(btrim(x->>'name')) having count(*)>1) then raise exception 'Use a different name for each Selection Group';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'grades') x group by x->>'id' having count(*)>1) then raise exception 'A grade can only belong to one Selection Group';end if;
 if exists(select 1 from public.playing_groups g where g.club_id=c and g.active and not exists(select 1 from jsonb_array_elements(p_data->'grades') x where x->>'id'=g.id::text)) then raise exception 'Confirm a Selection Group for every existing grade';end if;
 if nullif(p_data->>'catalogue_id','') is not null then
  select t.* into cat from club_selection_private.playhq_team_catalogues t join club_selection_private.playhq_connections cn on cn.club_id=t.club_id and cn.generation=t.generation where t.id=(p_data->>'catalogue_id')::uuid and t.club_id=c;
  if not found then raise exception 'The season download changed. Reload it before saving';end if;
 end if;
 for row in select value from jsonb_array_elements(p_data->'groups') loop
  sg:=(row->>'id')::uuid;nm:=btrim(row->>'name');
  if sg is null or nm is null or length(nm) not between 1 and 100 then raise exception 'Name each Selection Group';end if;
  if exists(select 1 from club_selection_private.selection_groups where id=sg and club_id<>c) then raise exception 'Selection Group belongs to another club';end if;
  insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,nm) on conflict(id) do update set name=excluded.name where club_selection_private.selection_groups.club_id=c;
 end loop;
 for row in select value from jsonb_array_elements(p_data->'grades') loop
  gid:=(row->>'id')::uuid;sg:=(row->>'selection_group_id')::uuid;
  if gid is null or sg is null or not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=sg::text) then raise exception 'Choose a Selection Group for each grade';end if;
  src:=null;
  if nullif(row->>'team_id','') is not null then
   select value into src from jsonb_array_elements(cat.teams) where value->>'id'=row->>'team_id';
   if src is null or nullif(src#>>'{grade,id}','') is null then raise exception 'Choose a grade from this club season';end if;
  end if;
  if not exists(select 1 from public.playing_groups where id=gid and club_id=c and active) then
   if exists(select 1 from public.playing_groups where id=gid) then raise exception 'Grade unavailable in this club';end if;
   if src is null then raise exception 'New grades must come from the season download. Use manual setup for other grades';end if;
   nm:=btrim(coalesce(nullif(row->>'name',''),src#>>'{grade,name}'));
   if nm is null or length(nm) not between 1 and 100 then raise exception 'Enter a grade name of up to 100 characters';end if;
   if exists(select 1 from public.playing_groups where club_id=c and lower(btrim(name))=lower(nm)) then raise exception 'That grade already exists. Match it to the existing grade or use a distinct name';end if;
   insert into public.playing_groups(id,club_id,name,created_by,sort_order) values(gid,c,nm,me,coalesce((select max(sort_order)+1 from public.playing_groups where club_id=c),0));
  end if;
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,gid,sg) on conflict(grade_id) do update set selection_group_id=excluded.selection_group_id where club_selection_private.selection_group_grades.club_id=c;
  if src is not null then
   if exists(select 1 from club_selection_private.playhq_grade_mappings where club_id=c and season_id=cat.season_id and team_id=(src->>'id')::uuid and grade_id<>gid) then raise exception 'This season team is already linked to a different club grade';end if;
   if exists(select 1 from club_selection_private.playhq_grade_mappings where club_id=c and season_id=cat.season_id and grade_id=gid and team_id<>(src->>'id')::uuid) then raise exception 'Two season teams need separate club grades';end if;
   insert into club_selection_private.playhq_grade_mappings(club_id,season_id,team_id,source_grade_id,grade_id) values(c,cat.season_id,(src->>'id')::uuid,(src#>>'{grade,id}')::uuid,gid) on conflict(club_id,season_id,team_id) do update set source_grade_id=excluded.source_grade_id;
  end if;
 end loop;
 delete from club_selection_private.selection_groups g where g.club_id=c and not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g.id::text) and not exists(select 1 from club_selection_private.selection_group_grades m where m.selection_group_id=g.id);
 insert into club_selection_private.team_settings(club_id,timezone,revision,updated_by) values(c,club_selection_private.captain_timezone(c),1,me)
 on conflict(club_id) do update set revision=club_selection_private.team_settings.revision+1,updated_by=me,updated_at=now();
 ctx:=club_selection_private.selection_groups_context(c)||jsonb_build_object('can_edit',true,'saved',true);
 insert into club_selection_private.requests values(c,me,rid,'selection_groups',p_data,ctx,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'selection_groups',jsonb_build_object('request_id',rid,'groups',p_data->'groups','grades',p_data->'grades'));
 return ctx;
end $$;
revoke all on function public.club_selection_groups(uuid,text,jsonb) from public,anon;
grant execute on function public.club_selection_groups(uuid,text,jsonb) to authenticated;

create or replace function public.club_selections_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_action='set_access' then raise exception 'Use the Selections subscription controls';end if;
 if p_action in ('subscription_context','preview_subscription','set_selection_pricing','save_subscription') then return club_selection_private.billing_api(p_club_id,p_action,p_data);end if;
 result:=club_selection_private.api(p_club_id,p_action,p_data);
 if p_action='context' and (coalesce((result->>'admin')::boolean,false) or coalesce((result->>'can_view_board')::boolean,false)) then
  result:=result||jsonb_build_object('selection_setup',public.club_selection_groups(p_club_id,'context'),'fixtures',coalesce((select jsonb_agg(f||jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')))) from jsonb_array_elements(result->'fixtures') f),'[]'));
 end if;
 return result;
end $$;

CREATE OR REPLACE FUNCTION club_selection_private.lower_grade_moves(c uuid)
 RETURNS TABLE(fixture_id uuid, roster_id uuid, previous_fixture_id uuid, previous_grade text, grade text, competition text, format text, start_date text, movement_key text, previous_captains uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with prior as materialized (
  select f.id,f.published, f.published->'details' d,
   (f.published->'details'->'days'->0->>'date')::date starts,
   club_selection_private.grade_level(c,f.published->'details'->>'competition',f.published->'details'->>'grade') level
  from club_selection_private.fixtures f where f.club_id=c and f.published is not null and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
 ), current_fixtures as (
  select f.*, (f.details->'days'->0->>'date')::date starts,
   club_selection_private.grade_level(c,f.details->>'competition',f.details->>'grade') level
  from club_selection_private.fixtures f where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
 )
 select f.id,person.pid,p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts::text,
  md5(jsonb_build_array(p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts)::text),
  array(select distinct r.user_id from jsonb_each(coalesce(p.d->'match_roles','{}')) role
   join club_selection_private.roster r on r.club_id=c and r.id::text=role.value->>'captain_id'
   where r.user_id is not null
   union select nullif(p.d->>'captain_id','')::uuid where not(p.d ? 'match_roles') and nullif(p.d->>'captain_id','') is not null)
 from current_fixtures f
 cross join lateral (select distinct nullif(ids.value,'')::uuid pid from jsonb_array_elements(f.slots) slot,
  lateral (select slot->>'d1' value union select slot->>'d2') ids where nullif(ids.value,'') is not null) person
 cross join lateral (
  select p.* from prior p
  where club_selection_private.selection_scope(c,p.d)=club_selection_private.selection_scope(c,f.details)
   and coalesce(p.d->>'format','')=coalesce(f.details->>'format','')
   and coalesce(p.d->>'season','')=coalesce(f.details->>'season','')
   and date_trunc('week',p.starts::timestamp)=(
    select max(date_trunc('week',q.starts::timestamp)) from prior q
    where club_selection_private.selection_scope(c,q.d)=club_selection_private.selection_scope(c,f.details)
     and coalesce(q.d->>'format','')=coalesce(f.details->>'format','')
     and coalesce(q.d->>'season','')=coalesce(f.details->>'season','')
     and q.starts<f.starts and date_trunc('week',q.starts::timestamp)<date_trunc('week',f.starts::timestamp)
     and q.starts>=f.starts-120)
   and exists(select 1 from jsonb_array_elements(p.published->'slots') slot where slot->>'d1'=person.pid::text or slot->>'d2'=person.pid::text)
  order by p.level desc nulls first,p.starts desc,p.id limit 1
 ) p
 where f.level>p.level
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.selection_followups(c uuid)
 RETURNS TABLE(fixture_id uuid, roster_id uuid, previous_fixture_id uuid, previous_grade text, grade text, competition text, format text, start_date text, movement_key text, previous_captains uuid[], kind text, availability text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with prior as materialized (
  select f.id,f.published,f.published->'details' d,
   (select max((day->>'date')::date) from jsonb_array_elements(f.published->'details'->'days') day) ends
  from club_selection_private.fixtures f where f.club_id=c and f.published is not null
   and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
   and not exists(select 1 from club_selection_private.fixture_result_sources rs where rs.fixture_id=f.id and rs.no_play is not null)
 ), current_fixtures as materialized (
  select f.id,f.details d,f.slots,(f.details->'days'->0->>'date')::date starts,
   date_trunc('week',(f.details->'days'->0->>'date')::date)::date week
  from club_selection_private.fixtures f where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
   and not exists(select 1 from club_selection_private.fixture_result_sources rs where rs.fixture_id=f.id and rs.no_play is not null)
 ), omitted as (
  select distinct on (f.week,club_selection_private.selection_scope(c,f.d),coalesce(f.d->>'season',''),coalesce(f.d->>'format',''),person.pid)
   f.id fixture_id,person.pid roster_id,p.id previous_fixture_id,p.d->>'grade' previous_grade,f.d->>'grade' grade,
   f.d->>'competition' competition,f.d->>'format' format,f.starts::text start_date,
   md5(jsonb_build_array('left_out',p.id,f.week,lower(btrim(f.d->>'competition')),f.d->>'season',f.d->>'format')::text) movement_key,
   club_selection_private.match_captain_users(c,p.d) previous_captains,
   case when not exists(select 1 from jsonb_array_elements(f.d->'days') day where club_selection_private.day_status(person.pid,day)<>'available') then 'available'
    when exists(select 1 from club_selection_private.availability a,jsonb_array_elements(f.d->'days') day where a.roster_id=person.pid and coalesce(to_jsonb(a)->'unavailable_dates','[]'::jsonb) ? (day->>'date')) then 'unavailable'
    else 'unknown' end availability
  from current_fixtures f join prior p on club_selection_private.selection_scope(c,p.d)=club_selection_private.selection_scope(c,f.d)
   and coalesce(p.d->>'format','')=coalesce(f.d->>'format','') and coalesce(p.d->>'season','')=coalesce(f.d->>'season','')
   and date_trunc('week',p.ends)::date=(select max(date_trunc('week',q.ends)::date) from prior q
    where club_selection_private.selection_scope(c,q.d)=club_selection_private.selection_scope(c,f.d)
     and coalesce(q.d->>'format','')=coalesce(f.d->>'format','') and coalesce(q.d->>'season','')=coalesce(f.d->>'season','')
     and q.ends<f.week and q.ends>=f.week-120)
  cross join lateral (select distinct nullif(ids.value,'')::uuid pid from jsonb_array_elements(p.published->'slots') slot,
   lateral (select slot->>'d1' value union select slot->>'d2') ids where nullif(ids.value,'') is not null) person
  join club_selection_private.roster r on r.id=person.pid and r.club_id=c and r.active
  where not exists(select 1 from club_selection_private.fixtures picked,jsonb_array_elements(picked.slots) slot
   where picked.club_id=c and not coalesce((picked.details->>'cancelled')::boolean,false)
    and club_selection_private.selection_scope(c,picked.details)=club_selection_private.selection_scope(c,f.d)
    and coalesce(picked.details->>'season','')=coalesce(f.d->>'season','') and coalesce(picked.details->>'format','')=coalesce(f.d->>'format','')
    and exists(select 1 from jsonb_array_elements(picked.details->'days') with ordinality day(value,n)
     where date_trunc('week',(day.value->>'date')::date)::date=f.week and slot->>('d'||day.n)=person.pid::text))
  order by f.week,club_selection_private.selection_scope(c,f.d),coalesce(f.d->>'season',''),coalesce(f.d->>'format',''),person.pid,
   (f.d->>'grade'=p.d->>'grade') desc,p.ends desc,club_selection_private.grade_level(c,p.d->>'competition',p.d->>'grade') desc nulls last,f.starts,f.id,p.id
 )
 select m.*, 'lower_grade'::text,'available'::text from club_selection_private.lower_grade_moves(c) m
 union all select fixture_id,roster_id,previous_fixture_id,previous_grade,grade,competition,format,start_date,movement_key,previous_captains,'left_out'::text,availability from omitted
$function$;

revoke all on function public.club_selections_api(uuid,text,jsonb) from public,anon;
grant execute on function public.club_selections_api(uuid,text,jsonb) to authenticated;
