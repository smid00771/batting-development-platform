-- Cached public ladders; their read access is independent of private Season stats.
create schema if not exists club_standings_private;
revoke all on schema club_standings_private from public,anon;
grant usage on schema club_standings_private to authenticated,service_role;
create table club_standings_private.settings (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 ladder_audience text not null default 'members' check(ladder_audience in ('staff','members')),
 championship_audience text not null default 'off' check(championship_audience in ('off','staff','members')),
 season_id uuid, title text not null default 'Club Championship' check(length(title) between 1 and 100),
 calculation text not null default 'total' check(calculation in ('total','per_team')),
 minimum_teams integer not null default 1 check(minimum_teams between 1 and 100),
 rules jsonb not null default '[]' check(jsonb_typeof(rules)='array' and jsonb_array_length(rules)<=60),
 revision integer not null default 1, updated_by uuid, updated_at timestamptz not null default now()
);
create table club_standings_private.catalogues (
 season_id uuid primary key, grades jsonb not null, teams jsonb not null, checked_at timestamptz not null default now()
);
create table club_standings_private.ladders (
 season_id uuid not null, grade_id uuid not null, data jsonb, checked_at timestamptz,
 lease_id uuid, leased_until timestamptz, last_error text, primary key(season_id,grade_id)
);
alter table club_standings_private.settings enable row level security;
alter table club_standings_private.catalogues enable row level security;
alter table club_standings_private.ladders enable row level security;
revoke all on all tables in schema club_standings_private from public,anon,authenticated,service_role;

create function club_standings_private.flags(c uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); staff boolean; s club_standings_private.settings%rowtype; connected boolean;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then
  return jsonb_build_object('can_view_ladders',false,'can_view_championship',false,'can_manage_standings',false);
 end if;
 staff:=public.is_club_admin(c) or club_selection_private.selection_viewer(c,me) or club_selection_private.captain(c,me)
  or (coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) and club_batting_private.team_review_staff(c));
 select * into s from club_standings_private.settings where club_id=c;
 select exists(select 1 from club_selection_private.playhq_connections where club_id=c and active_season_id is not null) into connected;
 return jsonb_build_object(
  'can_view_ladders',connected and club_selection_private.fixtures_enabled(c) and (staff or coalesce(s.ladder_audience,'members')='members'),
  'can_view_championship',connected and club_selection_private.fixtures_enabled(c) and coalesce(s.championship_audience<>'off' and (staff or s.championship_audience='members'),false),
  'can_manage_standings',public.is_club_admin(c) and connected and club_selection_private.fixtures_enabled(c));
end $$;
revoke all on function club_standings_private.flags(uuid) from public,anon,authenticated,service_role;

create function club_standings_private.queue(c uuid) returns void
language plpgsql security definer set search_path='' as $$
declare conn club_selection_private.playhq_connections%rowtype;
begin
 select * into conn from club_selection_private.playhq_connections where club_id=c;
 if conn.active_season_id is null then return;end if;
 insert into club_standings_private.settings(club_id,season_id) values(c,conn.active_season_id) on conflict do nothing;
 insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id)
 select c,'ladder',source_id,conn.organisation_id from (
  select distinct m.source_grade_id source_id from club_selection_private.playhq_grade_mappings m
  where m.club_id=c and m.season_id=conn.active_season_id and m.source_grade_id is not null
  union select (r->>'grade_id')::uuid from club_standings_private.settings s cross join jsonb_array_elements(s.rules) r
  where s.club_id=c and s.season_id=conn.active_season_id and s.championship_audience<>'off'
 ) sources on conflict do nothing;
end $$;
revoke all on function club_standings_private.queue(uuid) from public,anon,authenticated,service_role;

alter table club_selection_private.playhq_jobs drop constraint playhq_jobs_kind_check;
alter table club_selection_private.playhq_jobs add constraint playhq_jobs_kind_check check(kind in ('fixtures','results','season','ladder'));
create or replace function club_selection_private.playhq_job_active(c uuid,kind text,source uuid,team uuid,season uuid) returns boolean
language sql stable set search_path='' as $$
 select club_selection_private.fixtures_enabled(c) and (
  kind='season' and source=season
  or kind='fixtures' and exists(select 1 from club_selection_private.playhq_grade_mappings m where m.club_id=c and m.season_id=season and m.source_grade_id=source and m.team_id=team)
  or kind='results' and exists(select 1 from club_selection_private.playhq_links l where l.club_id=c and l.season_id=season and l.match_id=source and l.team_id=team)
  or kind='ladder' and team=(select organisation_id from club_selection_private.playhq_connections where club_id=c) and (
   exists(select 1 from club_selection_private.playhq_grade_mappings m where m.club_id=c and m.season_id=season and m.source_grade_id=source)
   or exists(select 1 from club_standings_private.settings s,jsonb_array_elements(s.rules) r where s.club_id=c and s.season_id=season and s.championship_audience<>'off' and r->>'grade_id'=source::text))
 )
$$;

create function club_standings_private.changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name in ('playhq_connections','playhq_grade_mappings') then
  perform club_standings_private.queue(new.club_id);
 elsif tg_table_name='playhq_links' and new.summary is distinct from old.summary then
  -- Let published results settle, and never fetch the same ladder more than twice an hour.
  update club_selection_private.playhq_jobs j set due_at=least(j.due_at,greatest(now()+interval '2 minutes',coalesce(l.checked_at,'-infinity')+interval '30 minutes'))
  from club_standings_private.ladders l where j.kind='ladder' and j.source_id=new.grade_id and l.grade_id=new.grade_id and l.season_id=new.season_id;
 end if;
 return null;
end $$;
revoke all on function club_standings_private.changed() from public,anon,authenticated,service_role;
create trigger standings_connection after insert or update of active_season_id on club_selection_private.playhq_connections for each row execute function club_standings_private.changed();
create trigger standings_mapping after insert or update on club_selection_private.playhq_grade_mappings for each row execute function club_standings_private.changed();
create trigger standings_result after update of summary on club_selection_private.playhq_links for each row execute function club_standings_private.changed();

create function club_standings_private.worker(action text,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=(d->>'club_id')::uuid; conn club_selection_private.playhq_connections%rowtype;
 j club_selection_private.playhq_jobs%rowtype; cached club_standings_private.ladders%rowtype; catalogue club_standings_private.catalogues%rowtype;
 next_due timestamptz;answer jsonb;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'Backend access required';end if;
 select * into conn from club_selection_private.playhq_connections where club_id=c;
 if conn.generation::text is distinct from d->>'generation' or conn.verified_at is null then raise exception 'Connection changed';end if;
 select * into j from club_selection_private.playhq_jobs where club_id=c and kind='ladder'
  and source_id=(d#>>'{job,source_id}')::uuid and team_id=(d#>>'{job,team_id}')::uuid
  and lease_id=(d#>>'{job,lease_id}')::uuid and leased_until>now() for update;
 if j.club_id is null or not club_selection_private.playhq_job_active(c,j.kind,j.source_id,j.team_id,conn.active_season_id) then raise exception 'Ladder check expired';end if;
 insert into club_standings_private.ladders(season_id,grade_id) values(conn.active_season_id,j.source_id) on conflict do nothing;
 select * into cached from club_standings_private.ladders where season_id=conn.active_season_id and grade_id=j.source_id for update;
 if action='begin' then
  if cached.checked_at>now()-interval '30 minutes' or cached.leased_until>now() then
   update club_selection_private.playhq_jobs set lease_id=null,leased_until=null,attempts=0,due_at=case when cached.leased_until>now() then now()+interval '10 minutes' else cached.checked_at+interval '4 hours' end where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
   return jsonb_build_object('skip',true);
  end if;
  update club_standings_private.ladders set lease_id=j.lease_id,leased_until=now()+interval '5 minutes' where season_id=conn.active_season_id and grade_id=j.source_id;
  select * into catalogue from club_standings_private.catalogues where season_id=conn.active_season_id and checked_at>now()-interval '1 day';
  return jsonb_build_object('season_id',conn.active_season_id,'directory',catalogue.teams,'catalogue',catalogue.grades);
 end if;
 if cached.lease_id is distinct from j.lease_id then raise exception 'Ladder cache check expired';end if;
 if action='store' then
  if octet_length(d::text)>4000000 or d#>>'{result,grade_id}' is distinct from j.source_id::text
   or d#>>'{result,season_id}' is distinct from conn.active_season_id::text
   or jsonb_typeof(d#>'{result,ladders}') is distinct from 'array' or jsonb_array_length(d#>'{result,ladders}')>40
   then raise exception 'Invalid ladder response';end if;
  if d->'directory' is not null and d->'directory'<>'null'::jsonb then
   if jsonb_typeof(d->'directory')<>'array' or jsonb_array_length(d->'directory')>10000 or jsonb_typeof(d->'catalogue') is distinct from 'array' then raise exception 'Invalid team directory';end if;
   insert into club_standings_private.catalogues(season_id,teams,grades) values(conn.active_season_id,d->'directory',d->'catalogue')
   on conflict(season_id) do update set teams=excluded.teams,grades=excluded.grades,checked_at=now();
  end if;
  update club_standings_private.ladders set data=d->'result',checked_at=now(),last_error=null,lease_id=null,leased_until=null where season_id=conn.active_season_id and grade_id=j.source_id;
  next_due:=now()+interval '4 hours';
  update club_selection_private.playhq_jobs set lease_id=null,leased_until=null,attempts=0,last_error=null,checked_at=now(),due_at=next_due,last_result=jsonb_build_object('saved',true)
   where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
  return jsonb_build_object('saved',true);
 elsif action='error' then
  next_due:=now()+case when d->>'status' in ('401','403') then interval '1 day' else least(interval '1 day',interval '15 minutes'*power(2,least(j.attempts,6))) end;
  update club_standings_private.ladders set last_error='The latest ladder could not be checked',lease_id=null,leased_until=null where season_id=conn.active_season_id and grade_id=j.source_id;
  update club_selection_private.playhq_jobs set lease_id=null,leased_until=null,last_error='The latest ladder could not be checked',due_at=next_due where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown standings worker action';
end $$;
revoke all on function club_standings_private.worker(text,jsonb) from public,anon,authenticated;
grant execute on function club_standings_private.worker(text,jsonb) to service_role;
create function public.club_standings_worker(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select club_standings_private.worker(p_action,p_data) $$;
revoke all on function public.club_standings_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.club_standings_worker(text,jsonb) to service_role;

create function club_standings_private.championship(c uuid,sid uuid) returns jsonb
language sql stable set search_path='' as $$
 with settings as (select * from club_standings_private.settings where club_id=c and season_id=sid),
 rules as (select r.*,r.value->>'grade_id' grade_id,r.value->>'name' name from settings,jsonb_array_elements(rules) r),
 chosen as (
  select r.value rule,r.grade_id,r.name,ca.checked_at,ca.last_error,l.value ladder
  from rules r left join club_standings_private.ladders ca on ca.season_id=sid and ca.grade_id::text=r.grade_id
  left join lateral jsonb_array_elements(ca.data->'ladders') l on l.value->>'type'=coalesce(nullif(r.value->>'type','auto'),
   case when exists(select 1 from jsonb_array_elements(ca.data->'ladders') all_l where all_l->>'type'='overall') then 'overall'
    when (select count(distinct all_l->>'type') from jsonb_array_elements(ca.data->'ladders') all_l)=1 then ca.data#>>'{ladders,0,type}' end)
 ), entries as (
  select ch.*,row, row->>'club_id' club_id,row->>'club_name' club_name,row->>'team_id' team_id,
   (row->'values'->>coalesce(rule->>'points_column','competitionPoints'))::numeric points
  from chosen ch left join lateral jsonb_array_elements(ladder->'rows') row on true
 ), contributions as (
  select club_id,min(club_name) club_name,grade_id,min(name) name,count(distinct team_id) teams,
   case min(rule->>'aggregation') when 'best' then max(points) when 'average' then avg(points) else sum(points) end raw_points,
   min((rule->>'weight')::numeric) weight
  from entries where club_id is not null group by club_id,grade_id
 ), totals as (
  select club_id,min(club_name) name,sum(teams) teams,
   sum(raw_points*weight)/case when (select calculation from settings)='per_team' then nullif(sum(teams),0) else 1 end total,
   jsonb_agg(jsonb_build_object('name',name,'points',raw_points,'weight',weight,'contribution',raw_points*weight,'teams',teams) order by name) contributions
  from contributions group by club_id
 ), ranked as (
  select *,rank() over(order by total desc) position from totals where teams>=(select minimum_teams from settings)
 ), health as (
  select exists(select 1 from rules) and not exists(select 1 from entries where ladder is null or (row is not null and (club_id is null or points is null))) complete,
   coalesce((select jsonb_agg(distinct name) from entries where ladder is null or (row is not null and (club_id is null or points is null))),'[]') missing
 ) select jsonb_build_object('title',coalesce((select title from settings),'Club Championship'),'complete',complete,'missing',missing,
  'checked_at',(select min(checked_at) from chosen),'stale',exists(select 1 from chosen where last_error is not null or checked_at<now()-interval '1 day'),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('club_id',club_id,'name',name,'points',total,'position',case when complete then position end,'teams',teams,'contributions',contributions) order by total desc,name) from ranked),'[]')) from health
$$;
revoke all on function club_standings_private.championship(uuid,uuid) from public,anon,authenticated,service_role;

create function club_standings_private.api(c uuid,action text,d jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare flags jsonb; s club_standings_private.settings%rowtype;conn club_selection_private.playhq_connections%rowtype;
 old club_selection_private.requests%rowtype;rid uuid;answer jsonb;rules jsonb;rule_item jsonb;seen text[]:='{}';
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid()) then raise exception 'Current club membership is required';end if;
 flags:=club_standings_private.flags(c);
 if not coalesce((flags->>'can_view_ladders')::boolean or (flags->>'can_view_championship')::boolean or (flags->>'can_manage_standings')::boolean,false) then raise exception 'Club standings access is not available';end if;
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>30000 then raise exception 'Invalid standings request';end if;
 select * into conn from club_selection_private.playhq_connections where club_id=c;
 if action='save_settings' then
  if not (flags->>'can_manage_standings')::boolean then raise exception 'Club Admin can change standings settings';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
  rid:=(d->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
  select * into old from club_selection_private.requests where club_id=c and user_id=auth.uid() and request_id=rid;
  if old.request_id is not null then
   if old.action<>'standings_settings' or old.payload<>d then raise exception 'Request ID already used';end if;return old.result;
  end if;
  select * into s from club_standings_private.settings where club_id=c for update;
  if coalesce(s.revision,0)<>coalesce((d->>'revision')::integer,-1) or d->>'season_id' is distinct from conn.active_season_id::text then raise exception 'Standings settings changed. Reopen settings before saving';end if;
  rules:=d->'rules';
  if jsonb_typeof(rules) is distinct from 'array' or jsonb_array_length(rules)>60 then raise exception 'Choose up to 60 competitions';end if;
  for rule_item in select value from jsonb_array_elements(rules) loop
   if rule_item->>'grade_id'=any(seen) or not exists(select 1 from club_standings_private.catalogues cat,jsonb_array_elements(cat.grades) g where cat.season_id=conn.active_season_id and g->>'id'=rule_item->>'grade_id')
    or coalesce(rule_item->>'type','') not in ('auto','overall','oneDay','twoDay','t20')
    or coalesce(rule_item->>'points_column','') not in ('competitionPoints','pointsAverage')
    or coalesce(rule_item->>'aggregation','') not in ('sum','average','best')
    or jsonb_typeof(rule_item->'weight') is distinct from 'number' or (rule_item->>'weight')::numeric not between 0 and 10000
    or length(coalesce(rule_item->>'name','')) not between 1 and 160 then raise exception 'Check the selected competitions and multipliers';end if;
   seen:=seen||array[rule_item->>'grade_id'];
  end loop;
  if d->>'championship_audience'<>'off' and jsonb_array_length(rules)=0 then raise exception 'Choose the championship competitions';end if;
  insert into club_standings_private.settings(club_id,ladder_audience,championship_audience,season_id,title,calculation,minimum_teams,rules,revision,updated_by)
   values(c,d->>'ladder_audience',d->>'championship_audience',conn.active_season_id,btrim(d->>'title'),d->>'calculation',(d->>'minimum_teams')::integer,rules,1,auth.uid())
   on conflict(club_id) do update set ladder_audience=excluded.ladder_audience,championship_audience=excluded.championship_audience,season_id=excluded.season_id,title=excluded.title,calculation=excluded.calculation,minimum_teams=excluded.minimum_teams,rules=excluded.rules,revision=settings.revision+1,updated_by=auth.uid(),updated_at=now();
  perform club_standings_private.queue(c);
  answer:=club_standings_private.api(c,'context','{}');
  insert into club_selection_private.requests values(c,auth.uid(),rid,'standings_settings',d,answer,now());
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'standings_settings',jsonb_build_object('request_id',rid,'settings',d-'request_id'));
  return answer;
 elsif action<>'context' then raise exception 'Unknown standings action';end if;
 select * into s from club_standings_private.settings where club_id=c;
 return flags||jsonb_build_object('season_id',conn.active_season_id,'club_organisation_id',conn.organisation_id,
  'automatic_enabled',conn.polling_enabled and conn.verified_at is not null,
  'settings',case when (flags->>'can_manage_standings')::boolean then coalesce(to_jsonb(s),jsonb_build_object('revision',0,'ladder_audience','members','championship_audience','off','rules','[]'::jsonb))-'updated_by' else null end,
  'catalogue',case when (flags->>'can_manage_standings')::boolean then coalesce((select grades from club_standings_private.catalogues where season_id=conn.active_season_id),'[]') else '[]'::jsonb end,
  'own_grades',coalesce((select jsonb_agg(distinct m.source_grade_id) from club_selection_private.roster p join public.playing_groups g on g.club_id=c and g.active and g.name=any(p.usual_grades)
   join club_selection_private.playhq_grade_mappings m on m.club_id=c and m.grade_id=g.id and m.season_id=conn.active_season_id where p.club_id=c and p.user_id=auth.uid() and p.active),'[]'),
  'ladders',case when (flags->>'can_view_ladders')::boolean then coalesce((select jsonb_agg(jsonb_build_object('grade_id',src.grade_id,'name',coalesce(l.data->>'name',src.name),'checked_at',l.checked_at,'error',l.last_error,'ladders',coalesce(l.data->'ladders','[]')) order by src.name)
   from (select m.source_grade_id grade_id,min(g.name) name from club_selection_private.playhq_grade_mappings m join public.playing_groups g on g.id=m.grade_id and g.club_id=c where m.club_id=c and m.season_id=conn.active_season_id and m.source_grade_id is not null group by m.source_grade_id
    union select (r->>'grade_id')::uuid,r->>'name' from jsonb_array_elements(case when s.season_id=conn.active_season_id and s.championship_audience<>'off' then s.rules else '[]' end) r
     where not exists(select 1 from club_selection_private.playhq_grade_mappings m where m.club_id=c and m.season_id=conn.active_season_id and m.source_grade_id::text=r->>'grade_id')) src
   left join club_standings_private.ladders l on l.season_id=conn.active_season_id and l.grade_id=src.grade_id),'[]') else '[]'::jsonb end,
  'championship',case when (flags->>'can_view_championship')::boolean and s.season_id=conn.active_season_id then club_standings_private.championship(c,conn.active_season_id) else null end,
  'championship_season_changed',s.championship_audience<>'off' and s.season_id is distinct from conn.active_season_id);
end $$;
revoke all on function club_standings_private.api(uuid,text,jsonb) from public,anon,service_role;
grant execute on function club_standings_private.api(uuid,text,jsonb) to authenticated;
create function public.club_standings_api(p_club_id uuid,p_action text default 'context',p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select club_standings_private.api(p_club_id,p_action,p_data)$$;
revoke all on function public.club_standings_api(uuid,text,jsonb) from public,anon;
grant execute on function public.club_standings_api(uuid,text,jsonb) to authenticated;

do $patch$
declare definition text:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);needle text:='if p_action=''access'' then';
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected access wrapper';end if;
 execute replace(definition,needle,needle||E'\n  result:=result||club_standings_private.flags(p_club_id);');
end $patch$;
do $$ declare c uuid;begin for c in select club_id from club_selection_private.playhq_connections where active_season_id is not null loop perform club_standings_private.queue(c);end loop;end $$;
