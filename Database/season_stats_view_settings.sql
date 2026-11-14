-- Shared display preferences are independent of season dates and their triggers.
create table club_selection_private.season_stats_view_settings (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 settings jsonb not null check (jsonb_typeof(settings)='object' and octet_length(settings::text)<=16000),
 revision integer not null default 1 check (revision>0),
 last_request uuid not null,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
create index season_stats_view_settings_updated_by_idx on club_selection_private.season_stats_view_settings(updated_by);
alter table club_selection_private.season_stats_view_settings enable row level security;
revoke all on club_selection_private.season_stats_view_settings from public,anon,authenticated,service_role;

do $patch$
declare definition text;acl aclitem[];old_text text;new_text text;
begin
 select pg_get_functiondef(oid),proacl into definition,acl from pg_proc
 where oid='club_selection_private.season_stats_api(uuid,text,jsonb)'::regprocedure;
 if md5(definition)<>'4bb87e035d1cf202df9b48da78c66df9' then raise exception 'Unexpected season stats API; review before applying';end if;
 definition:=replace(definition,'settings club_selection_private.season_stats_settings%rowtype; cards jsonb; fixtures jsonb; identities jsonb;',
  'settings club_selection_private.season_stats_settings%rowtype; cards jsonb; fixtures jsonb; identities jsonb; views club_selection_private.season_stats_view_settings%rowtype; view_config jsonb; view_policy jsonb; view_entry record; view_request uuid;');
 definition:=replace(definition,$old$action not in ('context','set_season')$old$,$new$action not in ('context','set_season','set_views')$new$);
 definition:=replace(definition,'octet_length(data::text)>1500','octet_length(data::text)>(case when action=''set_views'' then 20000 else 1500 end)');
 old_text:=$old$ select a.timezone into timezone from club_selection_private.access a where a.club_id=c;$old$;
 new_text:=$new$ if action='set_views' then
  if not adm then raise exception 'Club Admin can change stats setup';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,20501));
 end if;
 select * into views from club_selection_private.season_stats_view_settings where club_id=c;
 if action='set_views' then
  view_config:=data->'settings';
  if jsonb_typeof(view_config) is distinct from 'object' or octet_length(view_config::text)>16000 then raise exception 'Invalid stats setup';end if;
  if (select count(*) from jsonb_object_keys(view_config))<>2
   or jsonb_typeof(view_config->'default') is distinct from 'object'
   or jsonb_typeof(view_config->'competitions') is distinct from 'object' then raise exception 'Choose a club default and competition settings';end if;
  if (select count(*) from jsonb_object_keys(view_config->'competitions'))>50 then raise exception 'Choose up to 50 competition overrides';end if;
  for view_entry in select key,value from jsonb_each(view_config->'competitions') loop
   if length(view_entry.key) not between 1 and 160 or view_entry.key<>btrim(view_entry.key) then raise exception 'Choose a named competition';end if;
  end loop;
  for view_policy in select view_config->'default' union all select value from jsonb_each(view_config->'competitions') loop
   if jsonb_typeof(view_policy) is distinct from 'object' then raise exception 'Invalid competition setting';end if;
   if (select count(*) from jsonb_object_keys(view_policy))<>2 or jsonb_typeof(view_policy->'combine') is distinct from 'boolean'
    or coalesce(view_policy->>'default_view','') not in ('auto','competition','limited_overs','long_form','t20') then raise exception 'Choose a valid grouping and default view';end if;
   if view_policy->>'combine'='false' and view_policy->>'default_view'='competition' then raise exception 'A combined default needs combined formats';end if;
  end loop;
  view_request:=nullif(data->>'request_id','')::uuid;
  if view_request is null then raise exception 'A stats setup request ID is required';end if;
  if views.last_request=view_request then
   if views.updated_by is distinct from me or views.settings is distinct from view_config then raise exception 'Stats setup request was reused with different settings';end if;
  else
   if coalesce((data->>'expected_revision')::integer,-1)<>coalesce(views.revision,0) then raise exception 'Stats setup changed. Update totals before saving again';end if;
   insert into club_selection_private.season_stats_view_settings(club_id,settings,last_request,updated_by)
    values(c,view_config,view_request,me)
    on conflict(club_id) do update set settings=excluded.settings,revision=season_stats_view_settings.revision+1,
     last_request=excluded.last_request,updated_by=me,updated_at=now() returning * into views;
  end if;
 end if;
 select a.timezone into timezone from club_selection_private.access a where a.club_id=c;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected stats setup insertion point';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$ return jsonb_build_object('season',jsonb_build_object('start',starts,'end',ends,'revision',coalesce(settings.revision,0),$old$;
 new_text:=$new$ view_config:=coalesce(views.settings,'{"default":{"combine":true,"default_view":"auto"},"competitions":{}}'::jsonb);
 -- Scoped staff receive only competition names already present in their results.
 if not adm then
  view_config:=jsonb_set(view_config,'{competitions}',coalesce((
   select jsonb_object_agg(v.key,v.value) from jsonb_each(view_config->'competitions') v
   where exists(select 1 from jsonb_array_elements(fixtures) f where btrim(coalesce(f->>'competition',''))=v.key)
    or exists(select 1 from jsonb_array_elements(cards) x where btrim(coalesce(x#>>'{scorecard,competition}',''))=v.key)
  ),'{}'::jsonb));
 end if;
 return jsonb_build_object('stats_views',jsonb_build_object('settings',view_config,'revision',coalesce(views.revision,0)),
  'can_set_stats_views',adm,'season',jsonb_build_object('start',starts,'end',ends,'revision',coalesce(settings.revision,0),$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected stats response';end if;
 execute replace(definition,old_text,new_text);
 assert (select proacl is not distinct from acl from pg_proc where oid='club_selection_private.season_stats_api(uuid,text,jsonb)'::regprocedure),'Stats API grants retained';
end $patch$;
