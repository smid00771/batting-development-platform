-- Separate award, context and immutable images. Existing team awards are untouched.
create table club_selection_private.player_week_design (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 layout jsonb not null default '{}', revision integer not null default 1
);
create table club_selection_private.player_week_profiles (
 club_id uuid not null references public.clubs(id) on delete cascade, player_id text not null,
 stage text not null check(stage in ('unspecified','emerging','established','experienced')),
 note text not null default '' check(length(note)<=300),revision integer not null default 1,
 updated_by uuid not null references auth.users(id), primary key(club_id,player_id)
);
create table club_selection_private.player_week_editions (
 id uuid primary key, club_id uuid not null references public.clubs(id) on delete cascade,
 week_end date not null,winner jsonb not null,title text not null,blurb text not null default '',
 image_path text not null unique,image_sha text not null,image_bytes integer not null,request jsonb not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),sealed_at timestamptz
);
create index player_week_history on club_selection_private.player_week_editions(club_id,week_end desc,sealed_at desc) where sealed_at is not null;
alter table club_selection_private.player_week_design enable row level security;
alter table club_selection_private.player_week_profiles enable row level security;
alter table club_selection_private.player_week_editions enable row level security;
revoke all on club_selection_private.player_week_design,club_selection_private.player_week_profiles,club_selection_private.player_week_editions from public,anon,authenticated;

create function club_selection_private.player_week_candidates(c uuid,cards jsonb) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(p||jsonb_build_object('format',card#>>'{scorecard,format_key}',
  'roster_id',r.id,'usual_grade',r.grade) order by p->>'name'),'[]')
 from jsonb_array_elements(club_selection_private.team_week_candidates(cards)) p
 join lateral (select x from jsonb_array_elements(cards) x where x->>'snapshot_id'=p->>'snapshot_id') s(card) on true
 left join lateral (
  select (array_agg(id))[1] id,(array_agg(grade))[1] grade from club_selection_private.roster r
  where r.club_id=c and (r.external_id=p->>'player_id' or r.user_id in
   (select pl.user_id from public.match_review_score_links l join public.players pl on pl.id=l.player_id and pl.club_id=c
    where l.club_id=c and l.source_player_id::text=p->>'player_id' and pl.user_id is not null)) having count(*)=1
 ) r on true
$$;
revoke all on function club_selection_private.player_week_candidates(uuid,jsonb) from public,anon,authenticated;

create function club_selection_private.player_week_asset(c uuid,path text) returns boolean
language sql stable set search_path='' as $$
 select path is null or (path ~ ('^'||c::text||'/artwork/[0-9a-f-]{36}\.png$') and
  exists(select 1 from storage.objects where bucket_id='club-player-week' and name=path))
$$;
revoke all on function club_selection_private.player_week_asset(uuid,text) from public,anon,authenticated;

create function club_selection_private.player_week_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=p_club_id;me uuid:=auth.uid();last_day date;cards jsonb;prior_cards jsonb;past jsonb;candidates jsonb;
 cfg club_selection_private.player_week_design%rowtype;profile club_selection_private.player_week_profiles%rowtype;
 e club_selection_private.player_week_editions%rowtype;layout jsonb;field jsonb;winner jsonb;sid uuid;latest uuid;
begin
 if me is null or not club_selection_private.social_allowed(c) or not club_batting_private.team_review_staff(c) then raise exception 'Club socials and Match Review access are required';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>30000 then raise exception 'Invalid Player of the Week request';end if;
 if p_action in ('context','profile','reserve_image') then
  last_day:=(p_data->>'week_end')::date;if last_day is null then raise exception 'Choose a week ending date';end if;
  cards:=club_selection_private.team_week_cards(c,last_day-6,last_day);
  candidates:=club_selection_private.player_week_candidates(c,cards);
 end if;
 if p_action='context' then
  prior_cards:=club_selection_private.team_week_cards(c,last_day-90,last_day-7);
  past:=club_selection_private.player_week_candidates(c,prior_cards);
  select * into cfg from club_selection_private.player_week_design where club_id=c;
  return jsonb_build_object('cards',cards,'candidates',coalesce((select jsonb_agg(p||jsonb_build_object('previous',coalesce(
   (select jsonb_agg(q) from jsonb_array_elements(past) q where q->>'player_id'=p->>'player_id'),'[]'))) from jsonb_array_elements(candidates) p),'[]'),
   'profiles',coalesce((select jsonb_object_agg(player_id,jsonb_build_object('stage',stage,'note',note,'revision',revision)) from club_selection_private.player_week_profiles where club_id=c),'{}'),
   'design',jsonb_build_object('layout',coalesce(cfg.layout,'{}'),'revision',coalesce(cfg.revision,0)),
   'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.week_end desc,h.created_at desc) from
    (select id,week_end,winner,title,blurb,image_path,sealed_at as created_at from club_selection_private.player_week_editions where club_id=c and sealed_at is not null order by week_end desc,sealed_at desc limit 150) h),'[]'));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,17200));
 if p_action='profile' then
  if not exists(select 1 from jsonb_array_elements(candidates) p where p->>'player_id'=p_data->>'player_id') then raise exception 'Choose a player from this week’s imported scores';end if;
  if coalesce(p_data->>'stage','') not in ('unspecified','emerging','established','experienced') or length(coalesce(p_data->>'note',''))>300 then raise exception 'Check the player context';end if;
  select * into profile from club_selection_private.player_week_profiles where club_id=c and player_id=p_data->>'player_id';
  if coalesce(profile.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'Player context changed. Reload scores before saving';end if;
  insert into club_selection_private.player_week_profiles(club_id,player_id,stage,note,updated_by) values(c,p_data->>'player_id',p_data->>'stage',coalesce(p_data->>'note',''),me)
   on conflict(club_id,player_id) do update set stage=excluded.stage,note=excluded.note,updated_by=me,revision=club_selection_private.player_week_profiles.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(profile.revision,0)+1);
 elsif p_action='save_design' then
  select * into cfg from club_selection_private.player_week_design where club_id=c;
  if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'Layout changed. Reload scores before saving';end if;
  layout:=p_data->'layout';if jsonb_typeof(layout) is distinct from 'object' then raise exception 'Check the layout';end if;
  for field in select * from jsonb_array_elements('["background_path","logo_path","example_path"]') loop
   if not club_selection_private.player_week_asset(c,nullif(layout->>(field#>>'{}'),'')) then raise exception 'Upload artwork for this club first';end if;
  end loop;
  for field in select * from jsonb_array_elements('[["title_y",0,100],["week_y",0,100],["name_y",0,100],["figures_y",0,100],["grade_y",0,100],["photo_x",0,100],["photo_y",0,100],["photo_size",10,100],["logo_x",0,100],["logo_y",0,100],["logo_size",3,50],["text_x",0,100],["text_width",25,95],["title_size",20,120],["name_size",20,120],["figures_size",16,100]]') loop
   if layout ? (field->>0) and (jsonb_typeof(layout->(field->>0)) is distinct from 'number' or layout->>(field->>0)!~'^[0-9]{1,3}$' or (layout->>(field->>0))::integer not between (field->>1)::integer and (field->>2)::integer) then raise exception 'Check artwork sizes and positions';end if;
  end loop;
  for field in select * from jsonb_array_elements('["includes_title","show_logo","show_photo","text_panel"]') loop
   if layout ? (field#>>'{}') and jsonb_typeof(layout->(field#>>'{}')) is distinct from 'boolean' then raise exception 'Check artwork options';end if;
  end loop;
  if layout ? 'text_colour' and coalesce(layout->>'text_colour','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Choose a text colour';end if;
  insert into club_selection_private.player_week_design values(c,layout,1) on conflict(club_id) do update set layout=excluded.layout,revision=club_selection_private.player_week_design.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(cfg.revision,0)+1);
 elsif p_action='reserve_image' then
  sid:=(p_data->>'id')::uuid;if sid is null then raise exception 'Image identity required';end if;
  select * into e from club_selection_private.player_week_editions where id=sid;
  if found then
   if e.club_id<>c or e.created_by<>me or e.request<>p_data then raise exception 'Image identity already used';end if;
   return jsonb_build_object('id',e.id,'path',e.image_path,'sealed',e.sealed_at is not null);
  end if;
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=last_day and sealed_at is not null order by sealed_at desc limit 1;
  if latest is distinct from (p_data->>'previous_id')::uuid then raise exception 'This week’s winner changed. Reload scores before saving';end if;
  select p into winner from jsonb_array_elements(candidates) p where p->>'key'=p_data->>'key';
  if winner is null then raise exception 'Scores changed. Reload and choose the winner again';end if;
  if winner->'batting' is distinct from p_data->'batting' or winner->'bowling' is distinct from p_data->'bowling' then raise exception 'Figures changed. Reload and review the winner';end if;
  if length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>60 or length(coalesce(p_data->>'blurb',''))>2000
   or coalesce(p_data->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'bytes','')!~'^[0-9]{1,8}$' or (p_data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Check the winner and graphic';end if;
  if not club_selection_private.player_week_asset(c,nullif(p_data->>'photo_path','')) then raise exception 'Upload the player photo first';end if;
  insert into club_selection_private.player_week_editions(id,club_id,week_end,winner,title,blurb,image_path,image_sha,image_bytes,request,created_by)
   values(sid,c,last_day,winner,p_data->>'title',coalesce(p_data->>'blurb',''),c::text||'/editions/'||sid||'.png',p_data->>'sha256',(p_data->>'bytes')::integer,p_data,me) returning * into e;
  return jsonb_build_object('id',sid,'path',e.image_path,'sealed',false);
 elsif p_action='finish_image' then
  select * into e from club_selection_private.player_week_editions where club_id=c and id=(p_data->>'id')::uuid and created_by=me for update;
  if e.id is null then raise exception 'Saved image not found';end if;
  if e.sealed_at is not null then return jsonb_build_object('saved',true);end if;
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=e.week_end and sealed_at is not null order by sealed_at desc limit 1;
  if latest is distinct from (e.request->>'previous_id')::uuid then raise exception 'Another winner was saved. Reload scores before saving';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-player-week' and name=e.image_path and (metadata->>'size')::bigint=e.image_bytes) then raise exception 'Upload not confirmed. Retry saving';end if;
  update club_selection_private.player_week_editions set sealed_at=clock_timestamp() where id=e.id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown Player of the Week action';
end $$;
create function public.player_of_week_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql set search_path='' as $$select club_selection_private.player_week_api(p_club_id,p_action,p_data)$$;
revoke all on function public.player_of_week_api(uuid,text,jsonb),club_selection_private.player_week_api(uuid,text,jsonb) from public,anon;
grant execute on function public.player_of_week_api(uuid,text,jsonb),club_selection_private.player_week_api(uuid,text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('club-player-week','club-player-week',false,10485760,array['image/png']);
create function club_selection_private.player_week_storage_allowed(object_name text,writing boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(object_name,'/');c uuid;
begin
 if auth.uid() is null or array_length(parts,1)<>3 or parts[1]!~'^[0-9a-f-]{36}$' or parts[3]!~'^[0-9a-f-]{36}\.png$' then return false;end if;
 begin c:=parts[1]::uuid;exception when invalid_text_representation then return false;end;
 if not club_selection_private.social_allowed(c) or not club_batting_private.team_review_staff(c) then return false;end if;
 if parts[2]='artwork' then return true;end if;
 return parts[2]='editions' and exists(select 1 from club_selection_private.player_week_editions e where e.club_id=c and e.image_path=object_name and
  (case when writing then e.created_by=auth.uid() and e.sealed_at is null else e.sealed_at is not null or e.created_by=auth.uid() end));
end $$;
revoke all on function club_selection_private.player_week_storage_allowed(text,boolean) from public,anon;
grant execute on function club_selection_private.player_week_storage_allowed(text,boolean) to authenticated;
create policy player_week_read on storage.objects for select to authenticated using(bucket_id='club-player-week' and club_selection_private.player_week_storage_allowed(name,false));
create policy player_week_insert on storage.objects for insert to authenticated with check(bucket_id='club-player-week' and club_selection_private.player_week_storage_allowed(name,true));
-- Deliberately no UPDATE or DELETE policy: saved originals cannot be overwritten.
