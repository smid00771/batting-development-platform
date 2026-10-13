-- Team of the Week keeps score snapshots and exported artwork separate from team announcements.
create table club_selection_private.team_week_sources (
 club_id uuid not null references public.clubs(id) on delete cascade,
 source_match_id uuid not null, team_id uuid not null, updated_by uuid not null references auth.users(id),
 primary key(club_id,source_match_id)
);
create table club_selection_private.team_week_design (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 background_path text, layout jsonb not null default '{}', revision integer not null default 1
);
create table club_selection_private.team_week_editions (
 id uuid primary key, club_id uuid not null references public.clubs(id) on delete cascade,
 week_end date not null, title text not null, rows jsonb not null, image_path text not null unique,
 image_sha text not null, image_bytes integer not null, request jsonb not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), sealed_at timestamptz
);
create index team_week_editions_history on club_selection_private.team_week_editions(club_id,week_end desc,created_at desc);
create index if not exists match_review_scorecards_club_latest on public.match_review_scorecards(club_id,source_match_id,created_at desc);
alter table club_selection_private.team_week_sources enable row level security;
alter table club_selection_private.team_week_design enable row level security;
alter table club_selection_private.team_week_editions enable row level security;
revoke all on club_selection_private.team_week_sources,club_selection_private.team_week_design,club_selection_private.team_week_editions from public,anon,authenticated;

create function club_batting_private.scorecard_club_team(c uuid,card jsonb) returns text
language sql stable set search_path='' as $$
 with known as (
  select distinct i->>'team_id' team_id,team->>'organisation' organisation,team->>'organisation_id' organisation_id
  from public.match_review_score_links l join public.match_review_scorecards s on s.id=l.snapshot_id and s.club_id=c
  cross join lateral jsonb_array_elements(s.scorecard->'innings') i
  cross join lateral jsonb_array_elements(s.scorecard->'teams') team
  where l.club_id=c and l.source_innings_id::text=i->>'id' and team->>'id'=i->>'team_id'
 ), matches as (
  select t->>'id' id from jsonb_array_elements(card->'teams') t
  where exists(select 1 from public.clubs cl where cl.id=c and regexp_replace(lower(cl.name),'[^a-z0-9]','','g') in
    (regexp_replace(lower(t->>'name'),'[^a-z0-9]','','g'),regexp_replace(lower(t->>'organisation'),'[^a-z0-9]','','g')))
   or exists(select 1 from known k where k.team_id=t->>'id' or nullif(k.organisation_id,'')=t->>'organisation_id' or nullif(k.organisation,'')=t->>'organisation')
 ) select case when count(distinct id)=1 then min(id) end from matches
$$;
revoke all on function club_batting_private.scorecard_club_team(uuid,jsonb) from public,anon,authenticated;

create function club_selection_private.team_week_cards(c uuid, first_day date, last_day date) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('snapshot_id',s.id,'scorecard',s.scorecard,'our_team',coalesce(t.team_id::text,confirmed.team_id,club_batting_private.scorecard_club_team(c,s.scorecard))) order by s.scorecard->>'grade',s.source_match_id),'[]')
 from (select distinct on(source_match_id) * from public.match_review_scorecards where club_id=c order by source_match_id,created_at desc,id desc) s
 left join club_selection_private.team_week_sources t on t.club_id=c and t.source_match_id=s.source_match_id
 left join lateral (
  select case when count(distinct i->>'team_id')=1 then min(i->>'team_id') end team_id
  from public.match_review_score_links l join public.match_review_scorecards original on original.id=l.snapshot_id and original.club_id=c
  cross join lateral jsonb_array_elements(original.scorecard->'innings') i
  where l.club_id=c and l.source_match_id=s.source_match_id and i->>'id'=l.source_innings_id::text
 ) confirmed on true
 where (select max(d) from jsonb_array_elements_text(s.scorecard->'dates') d) between first_day::text and last_day::text
$$;

create function club_selection_private.team_week_candidates(cards jsonb) returns jsonb
language sql immutable set search_path='' as $$
 with source as (
  select x->>'snapshot_id' snapshot_id,x->>'our_team' team_id,x->'scorecard' card from jsonb_array_elements(cards) x
  where x->>'our_team' is not null and x->'scorecard'->>'status'='completed' and x->'scorecard'->>'schema_version'='2'
   and not exists(select 1 from jsonb_array_elements(x->'scorecard'->'innings') i where i->>'complete' is distinct from 'true')
 ), stats as (
  select s.*,b->>'player_id' player_id,b->>'name' name,'bat' kind,i->>'number' innings,b stat
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') b
  where i->>'team_id'=s.team_id and b->>'importable'='true' and b->>'status'='played'
  union all
  select s.*,b->>'player_id',b->>'name','bowl',i->>'number',b
  from source s cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(coalesce(i->'bowlers','[]')) b
  where i->>'team_id'<>s.team_id and b->>'team_id'=s.team_id and b->>'importable'='true'
 ), players as (
  select snapshot_id,team_id,card->>'match_id' match_id,card->>'grade' grade,card->>'url' url,player_id,min(name) name,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bat'),'[]') batting,
   coalesce(jsonb_agg(stat order by innings::integer) filter(where kind='bowl'),'[]') bowling,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bat'),0) runs,
   coalesce(sum((stat->>'wickets')::integer) filter(where kind='bowl'),0) wickets,
   coalesce(sum((stat->>'runs')::integer) filter(where kind='bowl'),0) conceded
  from stats group by snapshot_id,team_id,card->>'match_id',card->>'grade',card->>'url',player_id
 ) select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('key',snapshot_id||':'||team_id||':'||player_id) order by grade,name,player_id),'[]') from players p where runs>0 or wickets>0
$$;
revoke all on function club_selection_private.team_week_cards(uuid,date,date),club_selection_private.team_week_candidates(jsonb) from public,anon,authenticated;

create function club_selection_private.team_week_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=p_club_id;me uuid:=auth.uid();cards jsonb;cfg club_selection_private.team_week_design%rowtype;
 e club_selection_private.team_week_editions%rowtype;last_day date;first_day date;sid uuid;card jsonb;
 candidates jsonb;chosen jsonb:='[]';row_input jsonb;candidate jsonb;used text[]:='{}';layout jsonb;path text;
begin
 if me is null or not club_selection_private.social_allowed(c) or not club_batting_private.team_review_staff(c) then raise exception 'Club socials and Match Review access are required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>40000 then raise exception 'Invalid Team of the Week request';end if;
 if p_action='access' then return jsonb_build_object('allowed',true);end if;
 if p_action in ('context','reserve_image') then
  last_day:=(p_data->>'week_end')::date;if last_day is null then raise exception 'Choose the week ending date';end if;first_day:=last_day-6;
 end if;
 if p_action='context' then
  cards:=club_selection_private.team_week_cards(c,first_day,last_day);
  select * into cfg from club_selection_private.team_week_design where club_id=c;
  return jsonb_build_object('cards',cards,'candidates',club_selection_private.team_week_candidates(cards),
   'design',jsonb_build_object('background_path',cfg.background_path,'layout',coalesce(cfg.layout,'{}'),'revision',coalesce(cfg.revision,0)),
   'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.week_end desc,h.created_at desc) from
    (select id,week_end,title,rows,image_path,created_at from club_selection_private.team_week_editions where club_id=c and sealed_at is not null order by week_end desc,created_at desc limit 100) h),'[]'));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,16100));
 if p_action='use_team' then
  select scorecard into card from public.match_review_scorecards where id=(p_data->>'snapshot_id')::uuid and club_id=c;
  if card is null or not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=p_data->>'team_id') then raise exception 'Choose a team from this club’s imported scorecard';end if;
  insert into club_selection_private.team_week_sources values(c,(card->>'match_id')::uuid,(p_data->>'team_id')::uuid,me)
   on conflict(club_id,source_match_id) do update set team_id=excluded.team_id,updated_by=me;
  return jsonb_build_object('saved',true);
 elsif p_action='save_design' then
  select * into cfg from club_selection_private.team_week_design where club_id=c;
  if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'The background settings changed. Reload before saving';end if;
  path:=nullif(p_data->>'background_path','');layout:=p_data->'layout';
  if path is not null and (path !~ ('^'||c::text||'/backgrounds/[0-9a-f-]{36}\.png$') or not exists(select 1 from storage.objects where bucket_id='club-team-week' and name=path)) then raise exception 'Upload the background before saving';end if;
  if jsonb_typeof(layout) is distinct from 'object' or jsonb_typeof(layout->'includes_title') is distinct from 'boolean'
   or coalesce(layout->>'top','')!~'^[0-9]{3}$' or (layout->>'top')::integer not between 400 and 700
   or coalesce(layout->>'bottom','')!~'^1[0-9]{3}$' or (layout->>'bottom')::integer not between 1100 and 1290 then raise exception 'Check the artwork layout';end if;
  insert into club_selection_private.team_week_design values(c,path,layout,1)
   on conflict(club_id) do update set background_path=excluded.background_path,layout=excluded.layout,revision=club_selection_private.team_week_design.revision+1;
  return jsonb_build_object('saved',true);
 elsif p_action='reserve_image' then
  sid:=(p_data->>'id')::uuid;if sid is null then raise exception 'Image identity required';end if;
  select * into e from club_selection_private.team_week_editions where id=sid;
  if found then
   if e.club_id<>c or e.created_by<>me or e.request<>p_data then raise exception 'This image identity was already used';end if;
   return jsonb_build_object('id',e.id,'path',e.image_path,'sealed',e.sealed_at is not null);
  end if;
  if length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>60 or jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')<>11
   or coalesce(p_data->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'bytes','')!~'^[0-9]{1,8}$' or (p_data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Choose 11 players and check the graphic';end if;
  candidates:=club_selection_private.team_week_candidates(club_selection_private.team_week_cards(c,first_day,last_day));
  for row_input in select * from jsonb_array_elements(p_data->'rows') loop
   select x into candidate from jsonb_array_elements(candidates) x where x->>'key'=row_input->>'key';
   if candidate is null or candidate->>'player_id'=any(used) or coalesce(row_input->>'display','') not in ('batting','bowling','both') then raise exception 'Scores changed or a player is duplicated. Reload scores and review the XI';end if;
   if (row_input->>'display' in ('batting','both') and jsonb_array_length(candidate->'batting')=0) or (row_input->>'display' in ('bowling','both') and (candidate->>'wickets')::integer=0) then raise exception 'Choose available batting or bowling figures';end if;
   used:=array_append(used,candidate->>'player_id');chosen:=chosen||jsonb_build_array(candidate||jsonb_build_object('display',row_input->>'display'));
  end loop;
  path:=c::text||'/editions/'||sid::text||'.png';
  insert into club_selection_private.team_week_editions(id,club_id,week_end,title,rows,image_path,image_sha,image_bytes,request,created_by)
   values(sid,c,last_day,p_data->>'title',chosen,path,p_data->>'sha256',(p_data->>'bytes')::integer,p_data,me);
  return jsonb_build_object('id',sid,'path',path,'sealed',false);
 elsif p_action='finish_image' then
  select * into e from club_selection_private.team_week_editions where club_id=c and id=(p_data->>'id')::uuid and created_by=me for update;
  if e.id is null then raise exception 'Saved image not found';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-team-week' and name=e.image_path and (metadata->>'size')::bigint=e.image_bytes) then raise exception 'Image upload is not confirmed. Retry saving';end if;
  update club_selection_private.team_week_editions set sealed_at=coalesce(sealed_at,now()) where id=e.id;
  return jsonb_build_object('saved',true,'path',e.image_path);
 end if;
 raise exception 'Unknown Team of the Week action';
end $$;
create function public.team_of_week_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql set search_path='' as $$select club_selection_private.team_week_api(p_club_id,p_action,p_data)$$;
revoke all on function public.team_of_week_api(uuid,text,jsonb),club_selection_private.team_week_api(uuid,text,jsonb) from public,anon;
grant execute on function public.team_of_week_api(uuid,text,jsonb),club_selection_private.team_week_api(uuid,text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('club-team-week','club-team-week',false,10485760,array['image/png']);
create function club_selection_private.team_week_storage_allowed(object_name text,writing boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(object_name,'/');c uuid;
begin
 if array_length(parts,1)<>3 or parts[1]!~'^[0-9a-f-]{36}$' or parts[3]!~'^[0-9a-f-]{36}\.png$' then return false;end if;
 begin c:=parts[1]::uuid;exception when invalid_text_representation then return false;end;
 if not club_selection_private.social_allowed(c) or not club_batting_private.team_review_staff(c) then return false;end if;
 if parts[2]='backgrounds' then return true;end if;
 return parts[2]='editions' and exists(select 1 from club_selection_private.team_week_editions e where e.club_id=c and e.image_path=object_name and
  (case when writing then e.created_by=auth.uid() and e.sealed_at is null else e.sealed_at is not null or e.created_by=auth.uid() end));
end $$;
revoke all on function club_selection_private.team_week_storage_allowed(text,boolean) from public,anon;
grant execute on function club_selection_private.team_week_storage_allowed(text,boolean) to authenticated;
create policy team_week_read on storage.objects for select to authenticated using(bucket_id='club-team-week' and club_selection_private.team_week_storage_allowed(name,false));
create policy team_week_insert on storage.objects for insert to authenticated with check(bucket_id='club-team-week' and club_selection_private.team_week_storage_allowed(name,true));
-- No UPDATE or DELETE policy: saved images and backgrounds cannot be overwritten.

