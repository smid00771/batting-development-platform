-- An explicit, read-only lookup. This does not run from startup, calendar paint,
-- selection saves or a scheduled job, and never contacts PlayHQ itself.
-- Club trials are calendar events, not teams or unpublished selection lists.
create table club_selection_private.fixture_calendar_trials (
 id uuid primary key,club_id uuid not null references public.clubs(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 120),days jsonb not null,
 audience text not null check(audience in ('club','teams')),team_ids uuid[] not null default '{}',
 included boolean not null default false,revision integer not null default 1,
 updated_at timestamptz not null default now(),updated_by uuid not null,
 check((audience='club' and cardinality(team_ids)=0) or (audience='teams' and cardinality(team_ids) between 1 and 100))
);
create index fixture_calendar_trials_club on club_selection_private.fixture_calendar_trials(club_id);
alter table club_selection_private.fixture_calendar_trials enable row level security;
revoke all on club_selection_private.fixture_calendar_trials from public,anon,authenticated;

create function club_selection_private.calendar_trial_edit(c uuid,audience text,teams uuid[],u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role='admin')
 or (audience='teams' and cardinality(teams)>0 and not exists(select 1 from unnest(teams) requested(team_id)
  left join public.playing_groups g on g.id=requested.team_id and g.club_id=c and g.active
  where g.id is null or not club_selection_private.selection_edit(c,jsonb_build_object('grade_group_id',g.id,'grade',g.name),u)))
$$;
revoke all on function club_selection_private.calendar_trial_edit(uuid,text,uuid[],uuid) from public,anon,authenticated;

create function club_selection_private.fixture_calendar_trials_api(c uuid,action text,data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();adm boolean;teams jsonb;trials jsonb;ids uuid[];r club_selection_private.fixture_calendar_trials%rowtype;
 receipt club_selection_private.requests%rowtype;rid uuid;fid uuid;result jsonb;trial_title text;
begin
 if me is null or not club_selection_private.member(c,me) or not club_selection_private.enabled(c) then raise exception 'Active club Selections access required';end if;
 if not exists(select 1 from auth.users where id=me and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())) then raise exception 'A verified active account is required';end if;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.name),'[]') into teams
 from public.playing_groups g where g.club_id=c and g.active and (adm or club_selection_private.selection_edit(c,jsonb_build_object('grade_group_id',g.id,'grade',g.name),me));
 if not adm and jsonb_array_length(teams)=0 then raise exception 'Fixture editing access required';end if;
 if action='context' then
  select coalesce(jsonb_agg(to_jsonb(t)-'club_id'-'updated_by' order by t.days->0->>'date',t.title),'[]') into trials
  from club_selection_private.fixture_calendar_trials t where t.club_id=c and club_selection_private.calendar_trial_edit(c,t.audience,t.team_ids,me)
   and exists(select 1 from jsonb_array_elements(t.days) day where day->>'date'>=(now() at time zone (select timezone from club_selection_private.access where club_id=c))::date::text);
  return jsonb_build_object('can_whole_club',adm,'teams',teams,'trials',trials);
 end if;
 if action<>'save' or jsonb_typeof(data) is distinct from 'object' or length(data::text)>20000 then raise exception 'Invalid trial request';end if;
 fid:=nullif(data->>'id','')::uuid;rid:=nullif(data->>'request_id','')::uuid;
 trial_title:=btrim(coalesce(data->>'title',''));
 if fid is null or rid is null or length(trial_title) not between 1 and 120 or coalesce(data->>'audience','') not in ('club','teams')
  or jsonb_typeof(data->'included') is distinct from 'boolean' or jsonb_typeof(data->'team_ids') is distinct from 'array'
 then raise exception 'Check the trial name, dates and audience';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(data->'team_ids');
 if exists(select 1 from unnest(ids) x(id) where id is null or not exists(select 1 from public.playing_groups g where g.id=x.id and g.club_id=c and g.active)) then raise exception 'Choose active teams from this club';end if;
 if (data->>'audience'='club' and cardinality(ids)<>0) or (data->>'audience'='teams' and cardinality(ids) not between 1 and 100)
  or not club_selection_private.calendar_trial_edit(c,data->>'audience',ids,me) then raise exception 'You cannot manage trials for this audience';end if;
 perform club_selection_private.validate_details(jsonb_build_object('grade','Club trial','opposition',trial_title,'days',data->'days','staff','[]'::jsonb));
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into receipt from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then
  if receipt.action<>'calendar_trial_save' or receipt.payload<>data then raise exception 'This request was used for different changes';end if;
  return receipt.result;
 end if;
 select * into r from club_selection_private.fixture_calendar_trials where id=fid for update;
 if found and (r.club_id<>c or not club_selection_private.calendar_trial_edit(c,r.audience,r.team_ids,me)) then raise exception 'Trial editing access required';end if;
 if coalesce(r.revision,0)<>coalesce((data->>'revision')::integer,-1) then raise exception 'This trial changed. Close and reopen it before saving';end if;
 if r.id is null then
  insert into club_selection_private.fixture_calendar_trials(id,club_id,title,days,audience,team_ids,included,updated_by)
  values(fid,c,trial_title,data->'days',data->>'audience',ids,(data->>'included')::boolean,me) returning * into r;
 else
  update club_selection_private.fixture_calendar_trials set title=trial_title,days=data->'days',audience=data->>'audience',team_ids=ids,
   included=(data->>'included')::boolean,revision=revision+1,updated_at=now(),updated_by=me where id=fid returning * into r;
 end if;
 result:=jsonb_build_object('saved',true,'id',fid,'revision',r.revision);
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,me,rid,'calendar_trial_save',data,result);
 return result;
end $$;
revoke all on function club_selection_private.fixture_calendar_trials_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function club_selection_private.fixture_calendar_trials_api(uuid,text,jsonb) to authenticated;
create function public.club_fixture_calendar_trials(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.fixture_calendar_trials_api(p_club_id,p_action,p_data)$$;
revoke all on function public.club_fixture_calendar_trials(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.club_fixture_calendar_trials(uuid,text,jsonb) to authenticated;

create or replace function club_selection_private.availability_fixtures(c uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); player uuid; usual_team uuid; season uuid; tz text; today text; answer jsonb;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 if not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if not exists(select 1 from auth.users u where u.id=me and u.email_confirmed_at is not null
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 then raise exception 'A verified active account is required';end if;
 select r.id,club_selection_private.fixture_group_id(c,jsonb_build_object('grade',r.grade)) into player,usual_team from club_selection_private.roster r where r.club_id=c and r.user_id=me and r.active;
 if player is null then raise exception 'Link your playing-list entry before finding fixtures';end if;
 select a.timezone into tz from club_selection_private.access a where a.club_id=c;
 tz:=coalesce(tz,'Australia/Sydney');today:=(now() at time zone tz)::date::text;
 select cn.active_season_id into season from club_selection_private.playhq_connections cn where cn.club_id=c;
 -- Imported fixtures require the explicitly selected PlayHQ season. Manual
 -- fixtures are a separate, deliberate opt-in (for example, a trial game).
 -- Trial eligibility uses the saved usual grade, including before any selections.
 -- The team picker affects match highlights only; eligible trials are always shown.
 with imported as materialized (
  select l.fixture_id,g.id::text team_id,g.name,'playhq'::text source,
   coalesce(l.pending_fixture,l.source_fixture) src,f.published
  from club_selection_private.playhq_links l
  join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c
  join club_selection_private.playhq_grade_mappings m on m.club_id=c and m.season_id=season and m.team_id=l.team_id
  join public.playing_groups g on g.id=m.grade_id and g.club_id=c and g.active
  where l.club_id=c and l.season_id=season
 ), manual as (
  select f.id fixture_id,coalesce(g.id::text,'manual:'||md5(jsonb_build_array(f.details->>'competition',f.details->>'grade')::text)) team_id,
   coalesce(g.name,f.details->>'grade') name,'manual'::text source,
   jsonb_build_object('opposition',f.details->>'opposition','cancelled',f.details->'cancelled','days',
    (select jsonb_agg(jsonb_build_object('date',day->>'date','time',day->>'start','ground',coalesce(day->>'ground',f.details->>'ground','')) order by ord)
     from jsonb_array_elements(f.details->'days') with ordinality x(day,ord))) src,f.published
  from club_selection_private.fixtures f
  left join public.playing_groups g on g.club_id=c and g.active and g.id::text=f.details->>'grade_group_id'
  where f.club_id=c and f.details->'include_in_fixture_calendar'='true'::jsonb
   and not exists(select 1 from club_selection_private.playhq_links l where l.fixture_id=f.id)
 ), candidates as materialized (
  select * from imported union all select * from manual
 ), upcoming as materialized (
  select i.*,days.value days from candidates i cross join lateral (
   select jsonb_agg(jsonb_build_object('date',d->>'date','start',coalesce(d->>'time',''),
    'ground',coalesce(d->>'ground',d->>'venue',''),'day',ord) order by ord) value
   from jsonb_array_elements(case when jsonb_typeof(i.src->'days')='array' then i.src->'days' else '[]'::jsonb end) with ordinality x(d,ord)
   where d->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and d->>'date'>=today
  ) days where days.value is not null and coalesce(i.src->>'cancelled','false')<>'true'
   and upper(coalesce(i.src->>'source_status','')) not in ('CANCELLED','CANCELED','ABANDONED','BYE')
 ), trials as materialized (
  select t.*,days.value future_days from club_selection_private.fixture_calendar_trials t cross join lateral (
   select jsonb_agg(jsonb_build_object('date',d->>'date','start',coalesce(d->>'start',''),'ground',coalesce(d->>'ground',''),'day',ord) order by ord) value
   from jsonb_array_elements(t.days) with ordinality x(d,ord) where d->>'date'>=today
  ) days where t.club_id=c and t.included and days.value is not null
   and (t.audience='club' or usual_team=any(t.team_ids))
 ), team_choices as (
  select team_id,name from upcoming union
  select g.id::text,g.name from trials t join public.playing_groups g on g.id=any(t.team_ids) and g.club_id=c and g.active
 ), teams as (
  select distinct u.team_id,u.name,u.team_id=usual_team::text usual,exists(select 1 from candidates history
   where history.team_id=u.team_id and history.published is not null
    and exists(select 1 from jsonb_array_elements(coalesce(history.published->'slots','[]'::jsonb)) slot
     where slot->>'d1'=player::text or slot->>'d2'=player::text)) suggested
  from team_choices u
 )
 select jsonb_build_object('club_id',c,'player_id',player,'season_id',season,'usual_team_id',usual_team,'timezone',tz,'from_date',today,
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',team_id,'name',name,'usual',coalesce(usual,false),'suggested',suggested or coalesce(usual,false)) order by name,team_id) from teams),'[]'::jsonb),
  'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',fixture_id,'team_id',team_id,'source',source,
   'opposition',coalesce(src->>'opposition','Opponent to be confirmed'),'days',days) order by days->0->>'date',name,fixture_id) from upcoming),'[]'::jsonb)
   ||coalesce((select jsonb_agg(jsonb_build_object('id',id,'source','trial','title',title,'audience',audience,'team_ids',team_ids,'days',future_days) order by future_days->0->>'date',title) from trials),'[]'::jsonb)) into answer;
 return answer;
end $$;
revoke all on function club_selection_private.availability_fixtures(uuid) from public,anon,authenticated;
grant execute on function club_selection_private.availability_fixtures(uuid) to authenticated;

create or replace function public.club_availability_fixtures(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select club_selection_private.availability_fixtures(p_club_id)
$$;
revoke all on function public.club_availability_fixtures(uuid) from public,anon,authenticated;
grant execute on function public.club_availability_fixtures(uuid) to authenticated;
comment on function public.club_availability_fixtures(uuid) is 'On-demand current-season PlayHQ fixtures and explicitly opted-in manual fixtures for a linked club player; no draft line-ups, writes, analysis, polling or provider requests.';
