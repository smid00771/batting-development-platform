-- Club-owned preferences and recoverable award templates. No match facts are changed.
create table club_selection_private.social_graphic_preferences(
 club_id uuid primary key references public.clubs(id) on delete cascade,
 grade_labels jsonb not null default '[]',style jsonb not null default '{}',
 revision integer not null default 1 check(revision>0),updated_at timestamptz not null default now(),updated_by uuid
);
create table club_selection_private.social_graphic_versions(
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,
 kind text not null check(kind in ('preferences','team_week','player_week','results','century','five_wickets')),
 revision integer not null check(revision>=0),snapshot jsonb not null,
 saved_at timestamptz not null default now(),saved_by uuid,
 unique(club_id,kind,revision)
);
alter table club_selection_private.social_graphic_preferences enable row level security;
alter table club_selection_private.social_graphic_versions enable row level security;
revoke all on club_selection_private.social_graphic_preferences,club_selection_private.social_graphic_versions from public,anon,authenticated;

create function club_selection_private.graphic_label_family(value text) returns text
language plpgsql immutable set search_path='' as $$
declare k text:=lower(btrim(regexp_replace(regexp_replace(replace(value,'.',''),'\s*\([^)]*\)','','g'),'\s+',' ','g')));m text[];
begin
 m:=regexp_match(k,'(^|\s)women([''’]?s)?\s+(1st|2nd)(\s+grade)?$');if m is not null then return 'women-'||m[3];end if;
 if k~'^(rippit )?(dev(elopment)?( league)?)( (navy|sky))?$' then return 'development';end if;
 if k~'^(gilmour cup )?masters$' then return 'masters';end if;
 if k~'^(u16 |under 16 )?((sg|simon) )?moore cup$' then return 'moore';end if;
 if k~'^denis broad( oam)?( cup)?$' then return 'broad';end if;
 return null;
end $$;

create function club_selection_private.graphic_preferences(c uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('revision',revision,'grade_labels',grade_labels,'style',style) from club_selection_private.social_graphic_preferences where club_id=c),'{"revision":0,"grade_labels":[],"style":{}}'::jsonb)
$$;

create function club_selection_private.graphic_club_layout(c uuid,value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pref jsonb:=club_selection_private.graphic_preferences(c); kept jsonb;
begin
 select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') into kept
 from jsonb_array_elements(coalesce(value->'grade_labels','[]')) with ordinality x(value,ordinality)
 where not exists(select 1 from jsonb_array_elements(pref->'grade_labels') p where
  lower(btrim(p->>'grade'))=lower(btrim(x.value->>'grade')) or
  club_selection_private.graphic_label_family(p->>'grade')=club_selection_private.graphic_label_family(x.value->>'grade'));
 return coalesce(value,'{}')||jsonb_build_object('grade_labels',kept||(pref->'grade_labels'))||(pref->'style');
end $$;

create function club_selection_private.graphic_design_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text; previous jsonb; current_value jsonb;
begin
 if tg_table_name='team_week_design' then k:='team_week';elsif tg_table_name='player_week_design' then k:='player_week';elsif tg_table_name='social_graphic_preferences' then k:='preferences';else k:=new.kind;end if;
 if tg_op='UPDATE' then
  previous:=to_jsonb(old)-'club_id'-'revision'-'updated_at'-'updated_by';
  insert into club_selection_private.social_graphic_versions(club_id,kind,revision,snapshot,saved_by) values(new.club_id,k,old.revision,previous,auth.uid()) on conflict(club_id,kind,revision) do nothing;
 elsif k='preferences' then
  insert into club_selection_private.social_graphic_versions(club_id,kind,revision,snapshot,saved_by) values(new.club_id,k,0,'{"grade_labels":[],"style":{}}',auth.uid()) on conflict do nothing;
 end if;
 current_value:=to_jsonb(new)-'club_id'-'revision'-'updated_at'-'updated_by';
 insert into club_selection_private.social_graphic_versions(club_id,kind,revision,snapshot,saved_by) values(new.club_id,k,new.revision,current_value,auth.uid()) on conflict(club_id,kind,revision) do nothing;
 return new;
end $$;
create trigger graphic_history after insert or update on club_selection_private.team_week_design for each row execute function club_selection_private.graphic_design_history();
create trigger graphic_history after insert or update on club_selection_private.player_week_design for each row execute function club_selection_private.graphic_design_history();
create trigger graphic_history after insert or update on club_selection_private.social_award_designs for each row execute function club_selection_private.graphic_design_history();
create trigger graphic_history after insert or update on club_selection_private.social_graphic_preferences for each row execute function club_selection_private.graphic_design_history();
insert into club_selection_private.social_graphic_versions(club_id,kind,revision,snapshot)
 select club_id,'team_week',revision,jsonb_build_object('layout',layout,'background_path',background_path) from club_selection_private.team_week_design
 union all select club_id,'player_week',revision,jsonb_build_object('layout',layout) from club_selection_private.player_week_design
 union all select club_id,kind,revision,jsonb_build_object('layout',layout) from club_selection_private.social_award_designs;

create function club_selection_private.graphic_setup_context(c uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('preferences',club_selection_private.graphic_preferences(c),
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_order,name,id) from public.playing_groups where club_id=c and active),'[]'),
  'designs',coalesce((select jsonb_object_agg(kind,jsonb_build_object('revision',revision,'layout',club_selection_private.graphic_club_layout(c,layout),'background_path',background_path)) from (
   select 'team_week' kind,revision,layout,background_path from club_selection_private.team_week_design where club_id=c
   union all select 'player_week',revision,layout,null from club_selection_private.player_week_design where club_id=c
   union all select kind,revision,layout,null from club_selection_private.social_award_designs where club_id=c) d),'{}'))
$$;

create function club_selection_private.graphic_validate_preferences(labels jsonb,style jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare v jsonb;k text;n integer;
begin
 if jsonb_typeof(labels) is distinct from 'array' or jsonb_array_length(labels)>200 or jsonb_typeof(style) is distinct from 'object' then raise exception 'Check the club style settings';end if;
 for v in select * from jsonb_array_elements(labels) loop
  if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'grade') is distinct from 'string' or jsonb_typeof(v->'label') is distinct from 'string'
   or length(btrim(v->>'grade')) not between 1 and 160 or length(btrim(v->>'label')) not between 1 and 40 or (v->>'label')~'[<>[:cntrl:]]' then raise exception 'Enter a preferred label of 1–40 characters for each team';end if;
 end loop;
 select count(distinct lower(btrim(x->>'grade'))) into n from jsonb_array_elements(labels) x;
 if n<>jsonb_array_length(labels) then raise exception 'A team name was supplied twice';end if;
 for k,v in select * from jsonb_each(style) loop
  if k='text_colour' then if jsonb_typeof(v)<>'string' or v#>>'{}'!~'^#[0-9a-fA-F]{6}$' then raise exception 'Choose a text colour';end if;
  elsif k in ('title_font','week_font','grade_font','player_font','score_font') then
   if jsonb_typeof(v)<>'string' or v#>>'{}' not in ('sporting','modern','classic','condensed','sans','script') then raise exception 'Choose an available font';end if;
  else raise exception 'Unsupported shared style field';end if;
 end loop;
end $$;

create function club_selection_private.graphic_setup_api(c uuid,action text,data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();pref jsonb;kind text;rid uuid;old_request club_selection_private.requests%rowtype;
 old_version club_selection_private.social_graphic_versions%rowtype;labels jsonb;style jsonb;current_revision integer;payload jsonb;result jsonb;changes jsonb;
begin
 if me is null or not club_selection_private.social_allowed(c) then raise exception 'Club Admin or socials manager access required';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>60000 then raise exception 'Invalid club design request';end if;
 if action='context' then return club_selection_private.graphic_setup_context(c);end if;
 kind:=data->>'kind';
 if action='history' then
  if kind not in ('preferences','team_week','player_week','results','century','five_wickets') or kind is null then raise exception 'Choose a design';end if;
  select case when kind='preferences' then (club_selection_private.graphic_preferences(c)->>'revision')::int else coalesce((club_selection_private.graphic_setup_context(c)#>>array['designs',kind,'revision'])::int,0) end into current_revision;
  return jsonb_build_object('versions',coalesce((select jsonb_agg(to_jsonb(v) order by revision desc) from (select id,revision,saved_at from club_selection_private.social_graphic_versions where club_id=c and social_graphic_versions.kind=data->>'kind' and revision<current_revision order by revision desc limit 30) v),'[]'));
 end if;
 if action not in ('save_preferences','save_design','restore') then raise exception 'Unknown club design action';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,35400));
 rid:=(data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into old_request from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if old_request.action<>'graphic-setup:'||action or old_request.payload<>data then raise exception 'Retry the original club design change';end if;return old_request.result;end if;
 pref:=club_selection_private.graphic_preferences(c);
 if action='restore' then
  select * into old_version from club_selection_private.social_graphic_versions v where v.id=(data->>'version_id')::uuid and v.club_id=c and v.kind=data->>'kind';
  if not found then raise exception 'Choose a previous version from this club';end if;
 end if;
 if action='save_preferences' or (action='restore' and kind='preferences') then
  if coalesce(data->>'revision','')!~'^[0-9]+$' or (data->>'revision')::int<>(pref->>'revision')::int then raise exception 'Club preferences changed. Reload before saving';end if;
  labels:=case when action='restore' then old_version.snapshot->'grade_labels' else data->'grade_labels' end;
  style:=case when action='restore' then old_version.snapshot->'style' else data->'style' end;
  perform club_selection_private.graphic_validate_preferences(labels,style);
  insert into club_selection_private.social_graphic_preferences(club_id,grade_labels,style,updated_by) values(c,labels,style,me)
   on conflict(club_id) do update set grade_labels=excluded.grade_labels,style=excluded.style,revision=social_graphic_preferences.revision+1,updated_at=now(),updated_by=me;
  result:=club_selection_private.graphic_setup_context(c);
 else
  if kind is null or kind not in ('team_week','player_week','results','century','five_wickets') then raise exception 'Choose an award design';end if;
  if coalesce(data->>'shared_revision','')!~'^[0-9]+$' or (data->>'shared_revision')::int<>(pref->>'revision')::int then raise exception 'Club preferences changed. Reload before saving';end if;
  changes:=coalesce(data->'label_changes','[]');perform club_selection_private.graphic_validate_preferences(changes,'{}');
  if action='save_design' and jsonb_array_length(changes)>0 then
   select coalesce(jsonb_agg(x),'[]') into labels from jsonb_array_elements(pref->'grade_labels') x where not exists(select 1 from jsonb_array_elements(changes) y where lower(btrim(y->>'grade'))=lower(btrim(x->>'grade')));
   labels:=labels||changes;perform club_selection_private.graphic_validate_preferences(labels,pref->'style');
   insert into club_selection_private.social_graphic_preferences(club_id,grade_labels,style,updated_by) values(c,labels,pref->'style',me)
    on conflict(club_id) do update set grade_labels=excluded.grade_labels,revision=social_graphic_preferences.revision+1,updated_at=now(),updated_by=me;
  end if;
  payload:=case when action='restore' then old_version.snapshot||jsonb_build_object('revision',data->'revision') else data end;
  payload:=payload||jsonb_build_object('layout',club_selection_private.graphic_club_layout(c,payload->'layout'));
  if kind='team_week' then result:=club_selection_private.team_week_api(c,'save_design',payload);
  elsif kind='player_week' then result:=club_selection_private.player_week_api(c,'save_design',payload);
  else result:=club_selection_private.social_awards_api(c,'save_design',payload||jsonb_build_object('kind',kind,'request_id',rid));end if;
  if action='restore' then result:=club_selection_private.graphic_setup_context(c);
  else
   select coalesce((club_selection_private.graphic_setup_context(c)#>>array['designs',kind,'revision'])::int,0) into current_revision;
   result:=jsonb_build_object('saved',true,'revision',current_revision,'layout',payload->'layout','preferences',club_selection_private.graphic_preferences(c));
  end if;
 end if;
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,me,rid,'graphic-setup:'||action,data,result);
 return result;
end $$;

create function public.club_graphic_setup_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql set search_path='' as $$select club_selection_private.graphic_setup_api(p_club_id,p_action,p_data)$$;
revoke all on function public.club_graphic_setup_api(uuid,text,jsonb) from public,anon;
revoke all on function club_selection_private.graphic_setup_api(uuid,text,jsonb) from public,anon;
grant execute on function public.club_graphic_setup_api(uuid,text,jsonb),club_selection_private.graphic_setup_api(uuid,text,jsonb) to authenticated;
revoke all on function club_selection_private.graphic_label_family(text),club_selection_private.graphic_preferences(uuid),club_selection_private.graphic_club_layout(uuid,jsonb),club_selection_private.graphic_design_history(),club_selection_private.graphic_setup_context(uuid),club_selection_private.graphic_validate_preferences(jsonb,jsonb) from public,anon,authenticated;

-- Apply confirmed preferences on reads too, including older clients and AI requests.
create function club_selection_private.graphic_context_result(c uuid,kind text,action text,value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare k text;
begin
 if action<>'context' then return value;end if;
 if auth.uid() is null or not club_selection_private.social_allowed(c) then raise exception 'Club socials access required';end if;
 value:=value||jsonb_build_object('graphic_preferences',club_selection_private.graphic_preferences(c));
 if kind='workspace' then return value;end if;
 if kind in ('team_week','player_week') then return jsonb_set(value,'{design,layout}',club_selection_private.graphic_club_layout(c,value#>'{design,layout}'));end if;
 if kind='awards' then
  foreach k in array array['results','century','five_wickets'] loop
   if value#>array['designs',k] is not null then value:=jsonb_set(value,array['designs',k,'layout'],club_selection_private.graphic_club_layout(c,value#>array['designs',k,'layout']));end if;
  end loop;
 end if;
 return value;
end $$;
revoke all on function club_selection_private.graphic_context_result(uuid,text,text,jsonb) from public,anon;
grant execute on function club_selection_private.graphic_context_result(uuid,text,text,jsonb) to authenticated;
create or replace function public.team_of_week_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql set search_path='' as $$select club_selection_private.graphic_context_result(p_club_id,'team_week',p_action,club_selection_private.team_week_api(p_club_id,p_action,p_data))$$;
create or replace function public.player_of_week_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql set search_path='' as $$select club_selection_private.graphic_context_result(p_club_id,'player_week',p_action,club_selection_private.player_week_api(p_club_id,p_action,p_data))$$;
create or replace function public.club_social_awards_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql set search_path='' as $$select club_selection_private.graphic_context_result(p_club_id,'awards',p_action,club_selection_private.social_awards_api(p_club_id,p_action,p_data))$$;
create or replace function public.club_socials_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql set search_path='' as $$select club_selection_private.graphic_context_result(p_club_id,'workspace',p_action,club_selection_private.social_api(p_club_id,p_action,p_data))$$;
