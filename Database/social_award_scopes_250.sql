-- Award eligibility is independent of participation in Club Batting.
create table if not exists club_selection_private.social_award_scope_preferences (
 club_id uuid not null references public.clubs(id) on delete cascade,
 kind text not null check (kind in ('team_week','player_week','results','five_wickets','century')),
 scope jsonb not null,
 revision integer not null default 1,
 request_id uuid not null,
 updated_at timestamptz not null default now(),
 primary key(club_id,kind)
);
alter table club_selection_private.social_award_scope_preferences enable row level security;
revoke all on club_selection_private.social_award_scope_preferences from public,anon,authenticated;

create or replace function club_selection_private.award_scope_key(scope jsonb)
returns text language sql immutable set search_path='' as $$
 select case when coalesce(scope->>'mode','all')='all' then 'all'
 else (scope->>'mode')||':'||coalesce((select string_agg(distinct x,',' order by x) from jsonb_array_elements_text(scope->'ids') x),'') end
$$;

create or replace function club_selection_private.award_scope(c uuid, value jsonb default null)
returns jsonb language plpgsql stable set search_path='' as $$
declare mode text:=coalesce(value->>'mode','all');ids jsonb;grades jsonb;label text;
begin
 if value is not null and jsonb_typeof(value)<>'object' then raise exception 'Choose the selection groups included';end if;
 if mode='all' then return jsonb_build_object('mode','all','ids','[]'::jsonb,'grade_ids','[]'::jsonb,'key','all','label','All');end if;
 if mode not in ('groups','grades') or jsonb_typeof(value->'ids') is distinct from 'array' then raise exception 'Choose selection groups or grades';end if;
 if jsonb_array_length(value->'ids') not between 1 and 100 then raise exception 'Select at least one selection group or grade';end if;
 if exists(select 1 from jsonb_array_elements_text(value->'ids') x where x is null or x!~'^[0-9a-f-]{36}$') then raise exception 'Choose selection groups or grades from this club';end if;
 select jsonb_agg(distinct x order by x) into ids from jsonb_array_elements_text(value->'ids') x;
 if mode='groups' then
  if exists(select 1 from jsonb_array_elements_text(ids) x where not exists(select 1 from club_selection_private.selection_groups g where g.club_id=c and g.id::text=x)) then raise exception 'Choose selection groups from this club';end if;
  select string_agg(g.name,', ' order by g.name,g.id) into label from club_selection_private.selection_groups g where g.club_id=c and ids ? g.id::text;
  select coalesce(jsonb_agg(g.id::text order by g.id),'[]') into grades from public.playing_groups g join club_selection_private.selection_group_grades a on a.club_id=c and a.grade_id=g.id where g.club_id=c and g.active and ids ? a.selection_group_id::text;
 else
  if exists(select 1 from jsonb_array_elements_text(ids) x where not exists(select 1 from public.playing_groups g where g.club_id=c and g.active and g.id::text=x)) then raise exception 'Choose active grades from this club';end if;
  select string_agg(g.name,', ' order by g.name,g.id) into label from public.playing_groups g where g.club_id=c and ids ? g.id::text;
  grades:=ids;
 end if;
 return jsonb_build_object('mode',mode,'ids',ids,'grade_ids',grades,'key',club_selection_private.award_scope_key(jsonb_build_object('mode',mode,'ids',ids)),'label',label);
end $$;

create or replace function club_selection_private.award_scope_includes(scope jsonb, grade_id uuid)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(scope->>'mode','all')='all' or coalesce(scope->'grade_ids' ? grade_id::text,false)
$$;

create or replace function club_selection_private.award_card_grade(c uuid, card jsonb)
returns uuid language sql stable set search_path='' as $$
 select coalesce(
  (select (array_agg(distinct club_selection_private.fixture_group_id(c,coalesce(f.published->'details',f.details))))[1]
   from club_selection_private.fixtures f
   where f.club_id=c and (f.id::text=card->>'fixture_id' or f.scorecard_sync->>'match_id'=card#>>'{scorecard,match_id}'
    or exists(select 1 from club_selection_private.fixture_result_sources l where l.club_id=c and l.fixture_id=f.id and l.source_match_id::text=card#>>'{scorecard,match_id}')
    or exists(select 1 from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=f.id and l.match_id::text=card#>>'{scorecard,match_id}'))
   having count(distinct club_selection_private.fixture_group_id(c,coalesce(f.published->'details',f.details)))=1),
  club_selection_private.fixture_group_id(c,jsonb_build_object('grade',coalesce(card->>'grade_hint',card#>>'{scorecard,grade}'),'competition',card#>>'{scorecard,competition}')))
$$;

create or replace function club_selection_private.award_scope_cards(c uuid,cards jsonb,scope jsonb)
returns jsonb language sql stable set search_path='' as $$
 select case when coalesce(scope->>'mode','all')='all' then cards else
 coalesce((select jsonb_agg(x order by n) from jsonb_array_elements(cards) with ordinality a(x,n)
  where club_selection_private.award_scope_includes(scope,club_selection_private.award_card_grade(c,x))),'[]') end
$$;

create or replace function club_selection_private.award_edition_scope(c uuid,eid uuid)
returns jsonb language sql stable set search_path='' as $$
 select coalesce((select request->'award_scope' from (
  select request from club_selection_private.team_week_editions where club_id=c and id=eid
  union all select request from club_selection_private.player_week_editions where club_id=c and id=eid
  union all select request from club_selection_private.social_award_editions where club_id=c and id=eid
 ) e limit 1),jsonb_build_object('mode','all','ids','[]'::jsonb,'grade_ids','[]'::jsonb,'key','all','label','All'))
$$;

create or replace function club_selection_private.award_scope_api(c uuid,action text,data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare k text:=data->>'kind';p club_selection_private.social_award_scope_preferences%rowtype;value jsonb;rid uuid;
begin
 if k is null or k not in ('team_week','player_week','results','five_wickets','century') then raise exception 'Choose an award';end if;
 if action='save_scope' then
  perform pg_advisory_xact_lock(hashtextextended(c::text||k,25000));
  value:=club_selection_private.award_scope(c,data->'award_scope');rid:=(data->>'request_id')::uuid;
  if rid is null then raise exception 'Save identity required';end if;
  select * into p from club_selection_private.social_award_scope_preferences where club_id=c and kind=k;
  if p.request_id=rid then
   if club_selection_private.award_scope_key(p.scope)<>value->>'key' then raise exception 'Retry the original selection group choice';end if;
  else
   if coalesce(p.revision,0) is distinct from (data->>'revision')::integer then raise exception 'Selection group choices changed. Reload before applying';end if;
   insert into club_selection_private.social_award_scope_preferences(club_id,kind,scope,revision,request_id)
    values(c,k,value,1,rid) on conflict(club_id,kind) do update set scope=excluded.scope,revision=club_selection_private.social_award_scope_preferences.revision+1,request_id=excluded.request_id,updated_at=now();
  end if;
 end if;
 select * into p from club_selection_private.social_award_scope_preferences where club_id=c and kind=k;
 -- A removed/retired choice must still be editable, never silently broadened to All.
 begin value:=club_selection_private.award_scope(c,p.scope);
 exception when raise_exception then value:=p.scope||jsonb_build_object('needs_review',true);end;
 return jsonb_build_object('kind',k,'award_scope',value,'revision',coalesce(p.revision,0),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.name,g.id) from club_selection_private.selection_groups g where g.club_id=c),'[]'),
  'grades',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'group_id',a.selection_group_id) order by g.sort_order,g.name,g.id) from public.playing_groups g left join club_selection_private.selection_group_grades a on a.club_id=c and a.grade_id=g.id where g.club_id=c and g.active),'[]'));
end $$;

-- Provider abandonment is separate from a manually cancelled fixture. Retain any real figures.
create or replace function club_selection_private.fixture_source_no_play(c uuid,fid uuid)
returns text language sql stable set search_path='' as $$
 select case when upper(coalesce(l.source_fixture->>'source_status',l.summary->>'source_status','')) in ('ABANDONED','CANCELLED','CANCELED','BYE')
  and not coalesce((l.summary->>'has_figures')::boolean,false)
  and not exists(select 1 from
   (select s.scorecard from public.match_review_scorecards s where s.club_id=c and s.source_match_id=l.match_id order by s.created_at desc,s.id desc limit 1) latest
   cross join lateral jsonb_array_elements(latest.scorecard->'innings') i
   where jsonb_array_length(coalesce(i->'batters','[]'))>0 or jsonb_array_length(coalesce(i->'bowlers','[]'))>0)
  then 'abandoned' end
 from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=fid
$$;

-- Private helpers are reachable only through existing authorised APIs.
revoke all on function club_selection_private.award_scope_key(jsonb),club_selection_private.award_scope(uuid,jsonb),club_selection_private.award_scope_includes(jsonb,uuid),club_selection_private.award_card_grade(uuid,jsonb),club_selection_private.award_scope_cards(uuid,jsonb,jsonb),club_selection_private.award_edition_scope(uuid,uuid),club_selection_private.award_scope_api(uuid,text,jsonb),club_selection_private.fixture_source_no_play(uuid,uuid) from public,anon,authenticated;

-- Existing APIs, retaining their permissions, artwork and retry checks.

CREATE OR REPLACE FUNCTION club_selection_private.team_week_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();cards jsonb;cfg club_selection_private.team_week_design%rowtype;
 e club_selection_private.team_week_editions%rowtype;last_day date;first_day date;sid uuid;card jsonb;
 candidates jsonb;chosen jsonb:='[]';row_input jsonb;candidate jsonb;used text[]:='{}';layout jsonb;path text;
begin
 if me is null or not club_selection_private.social_allowed(c) then raise exception 'Club socials access is required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>40000 then raise exception 'Invalid Team of the Week request';end if;
 if p_action in ('context','profile','reserve_image') then p_data:=p_data||jsonb_build_object('award_scope',club_selection_private.award_scope(c,p_data->'award_scope'));end if;
 if p_action='access' then return jsonb_build_object('allowed',true);end if;
 if p_action in ('context','reserve_image') then
  last_day:=(p_data->>'week_end')::date;if last_day is null then raise exception 'Choose the week ending date';end if;first_day:=last_day-6;
 end if;
 if p_action='context' then
  cards:=club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,first_day,last_day),p_data->'award_scope'),coalesce((p_data->>'include_provisional')::boolean,false));
  select * into cfg from club_selection_private.team_week_design where club_id=c;
  return jsonb_build_object('award_scope',p_data->'award_scope','provisional_available',exists(select 1 from jsonb_array_elements(cards) x where x->>'provisional_available'='true'),'cards',cards,'candidates',club_selection_private.team_week_candidates(cards),
   'design',jsonb_build_object('background_path',cfg.background_path,'layout',coalesce(cfg.layout,'{}'),'revision',coalesce(cfg.revision,0)),
   'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.week_end desc,h.created_at desc) from
    (select id,week_end,title,rows,image_path,created_at,request->>'blurb' blurb from club_selection_private.team_week_editions where club_id=c and sealed_at is not null and club_selection_private.award_scope_key(request->'award_scope')=p_data#>>'{award_scope,key}' order by week_end desc,created_at desc limit 100) h),'[]'));
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
   or coalesce(layout->>'top','')!~'^[0-9]{1,4}$' or (layout->>'top')::integer not between 50 and 1200
   or coalesce(layout->>'bottom','')!~'^[0-9]{1,4}$' or (layout->>'bottom')::integer not between 150 and 1320 or (layout->>'bottom')::integer-(layout->>'top')::integer<100 then raise exception 'Check the artwork layout';end if;

  if coalesce(layout->>'font_scale','100')!~'^[0-9]{2,3}$' or coalesce((layout->>'font_scale')::integer,100) not between 75 and 120
   or coalesce(layout->>'logo_scale','100')!~'^[0-9]{2,3}$' or coalesce((layout->>'logo_scale')::integer,100) not between 70 and 150
   or coalesce(layout->>'text_colour','#FFFFFF')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Check text and logo sizing';end if;
  for candidate in select * from jsonb_array_elements(jsonb_build_array(layout->'example_path',layout->'logo_path')) loop
   if candidate#>>'{}' is not null and ((candidate#>>'{}') !~ ('^'||c::text||'/backgrounds/[0-9a-f-]{36}\.png$')
    or not exists(select 1 from storage.objects where bucket_id='club-team-week' and name=candidate#>>'{}')) then raise exception 'Upload artwork from this club before saving';end if;
  end loop;

  for candidate in select * from jsonb_array_elements('[ ["title_y",0,1300],["title_size",40,160],["week_y",0,1320],["left",20,160],["figures_right",650,910],["grade_right",950,1060],["logo_x",0,100],["logo_y",0,100],["logo_width",3,60] ]') loop
   if layout ? (candidate->>0) and (jsonb_typeof(layout->(candidate->>0)) is distinct from 'number' or layout->>(candidate->>0)!~'^[0-9]{1,4}$' or (layout->>(candidate->>0))::int not between (candidate->>1)::int and (candidate->>2)::int) then raise exception 'Check overlay positions';end if;
  end loop;
  if layout ? 'show_logo' and jsonb_typeof(layout->'show_logo') is distinct from 'boolean' then raise exception 'Choose whether to add a logo';end if;
  if layout ? 'reference' then
   if jsonb_typeof(layout->'reference') is distinct from 'object' or jsonb_typeof(layout#>'{reference,names}') is distinct from 'array' or jsonb_array_length(layout#>'{reference,names}')>20
    or (layout#>>'{reference,week_end}' is not null and layout#>>'{reference,week_end}'!~'^\d{4}-\d{2}-\d{2}$') then raise exception 'Check example names and week';end if;
   for candidate in select * from jsonb_array_elements(layout#>'{reference,names}') loop
    if jsonb_typeof(candidate) is distinct from 'object' or jsonb_typeof(candidate->'name') is distinct from 'string' or length(btrim(candidate->>'name')) not between 1 and 80 or length(coalesce(candidate->>'grade',''))>80 or length(coalesce(candidate->>'figures',''))>100 then raise exception 'Use short player names and grades';end if;
   end loop;
  end if;
  insert into club_selection_private.team_week_design values(c,path,layout,1)
   on conflict(club_id) do update set background_path=excluded.background_path,layout=excluded.layout,revision=club_selection_private.team_week_design.revision+1;
  return jsonb_build_object('saved',true);
 elsif p_action='reserve_image' then
  sid:=(p_data->>'id')::uuid;if sid is null then raise exception 'Image identity required';end if;
  select * into e from club_selection_private.team_week_editions where id=sid;
  if found then
   if e.club_id<>c or e.created_by<>me or (e.request-'award_scope')<>(p_data-'award_scope') or club_selection_private.award_scope_key(e.request->'award_scope')<>p_data#>>'{award_scope,key}' then raise exception 'This image identity was already used';end if;
   return jsonb_build_object('id',e.id,'path',e.image_path,'sealed',e.sealed_at is not null);
  end if;
  if length(coalesce(p_data->>'blurb',''))>2000 or length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>60 or jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')<>11
   or coalesce(p_data->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'bytes','')!~'^[0-9]{1,8}$' or (p_data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Choose 11 players and check the graphic';end if;
  candidates:=club_selection_private.team_week_candidates(club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,first_day,last_day),p_data->'award_scope'),coalesce((p_data->>'include_provisional')::boolean,false)));
  for row_input in select * from jsonb_array_elements(p_data->'rows') loop
   select x into candidate from jsonb_array_elements(candidates) x where x->>'key'=row_input->>'key';
   if candidate is null or candidate->>'player_id'=any(used) or coalesce(row_input->>'display','') not in ('batting','bowling','both') then raise exception 'Scores changed or a player is duplicated. Reload scores and review the XI';end if;
   if (row_input->>'display' in ('batting','both') and jsonb_array_length(candidate->'batting')=0) or (row_input->>'display' in ('bowling','both') and jsonb_array_length(candidate->'bowling')=0) then raise exception 'Choose available batting or bowling figures';end if;
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
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.player_week_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();last_day date;cards jsonb;prior_cards jsonb;past jsonb;candidates jsonb;
 cfg club_selection_private.player_week_design%rowtype;profile club_selection_private.player_week_profiles%rowtype;
 e club_selection_private.player_week_editions%rowtype;layout jsonb;field jsonb;chosen_winner jsonb;sid uuid;latest uuid;
begin
 if me is null or not club_selection_private.social_allowed(c) then raise exception 'Club socials access is required';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>30000 then raise exception 'Invalid Player of the Week request';end if;
 if p_action in ('context','profile','reserve_image') then p_data:=p_data||jsonb_build_object('award_scope',club_selection_private.award_scope(c,p_data->'award_scope'));end if;
 if p_action in ('context','profile','reserve_image') then
  last_day:=(p_data->>'week_end')::date;if last_day is null then raise exception 'Choose a week ending date';end if;
  cards:=club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,last_day-6,last_day),p_data->'award_scope'),coalesce((p_data->>'include_provisional')::boolean,false));
  candidates:=club_selection_private.player_week_candidates(c,cards);
 end if;
 if p_action='context' then
  prior_cards:=club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,last_day-90,last_day-7),p_data->'award_scope');
  past:=club_selection_private.player_week_candidates(c,prior_cards);
  select * into cfg from club_selection_private.player_week_design where club_id=c;
  return jsonb_build_object('award_scope',p_data->'award_scope','provisional_available',exists(select 1 from jsonb_array_elements(cards) x where x->>'provisional_available'='true'),'cards',cards,'candidates',coalesce((select jsonb_agg(p||jsonb_build_object('previous',coalesce(
   (select jsonb_agg(q) from jsonb_array_elements(past) q where q->>'player_id'=p->>'player_id'),'[]'))) from jsonb_array_elements(candidates) p),'[]'),
   'profiles',coalesce((select jsonb_object_agg(player_id,jsonb_build_object('stage',stage,'note',note,'revision',revision)) from club_selection_private.player_week_profiles where club_id=c),'{}'),
   'design',jsonb_build_object('layout',coalesce(cfg.layout,'{}'),'revision',coalesce(cfg.revision,0)),
   'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.week_end desc,h.created_at desc) from
    (select id,week_end,winner,title,blurb,image_path,sealed_at as created_at from club_selection_private.player_week_editions where club_id=c and sealed_at is not null and club_selection_private.award_scope_key(request->'award_scope')=p_data#>>'{award_scope,key}' order by week_end desc,sealed_at desc limit 150) h),'[]'));
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
   if e.club_id<>c or e.created_by<>me or (e.request-'award_scope')<>(p_data-'award_scope') or club_selection_private.award_scope_key(e.request->'award_scope')<>p_data#>>'{award_scope,key}' then raise exception 'Image identity already used';end if;
   return jsonb_build_object('id',e.id,'path',e.image_path,'sealed',e.sealed_at is not null);
  end if;
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=last_day and sealed_at is not null and club_selection_private.award_scope_key(request->'award_scope')=p_data#>>'{award_scope,key}' order by sealed_at desc limit 1;
  if latest is distinct from (p_data->>'previous_id')::uuid then raise exception 'This week’s winner changed. Reload scores before saving';end if;
  select p into chosen_winner from jsonb_array_elements(candidates) p where p->>'key'=p_data->>'key';
  if chosen_winner is null then raise exception 'Scores changed. Reload and choose the winner again';end if;
  if chosen_winner->'batting' is distinct from p_data->'batting' or chosen_winner->'bowling' is distinct from p_data->'bowling' then raise exception 'Figures changed. Reload and review the winner';end if;
  if length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>60 or length(coalesce(p_data->>'blurb',''))>2000
   or coalesce(p_data->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'bytes','')!~'^[0-9]{1,8}$' or (p_data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Check the winner and graphic';end if;
  if not club_selection_private.player_week_asset(c,nullif(p_data->>'photo_path','')) then raise exception 'Upload the player photo first';end if;
  insert into club_selection_private.player_week_editions(id,club_id,week_end,winner,title,blurb,image_path,image_sha,image_bytes,request,created_by)
   values(sid,c,last_day,chosen_winner,p_data->>'title',coalesce(p_data->>'blurb',''),c::text||'/editions/'||sid||'.png',p_data->>'sha256',(p_data->>'bytes')::integer,p_data,me) returning * into e;
  return jsonb_build_object('id',sid,'path',e.image_path,'sealed',false);
 elsif p_action='finish_image' then
  select * into e from club_selection_private.player_week_editions where club_id=c and id=(p_data->>'id')::uuid and created_by=me for update;
  if e.id is null then raise exception 'Saved image not found';end if;
  if e.sealed_at is not null then return jsonb_build_object('saved',true);end if;
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=e.week_end and sealed_at is not null and club_selection_private.award_scope_key(request->'award_scope')=club_selection_private.award_scope_key(e.request->'award_scope') order by sealed_at desc limit 1;
  if latest is distinct from (e.request->>'previous_id')::uuid then raise exception 'Another winner was saved. Reload scores before saving';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-player-week' and name=e.image_path and (metadata->>'size')::bigint=e.image_bytes) then raise exception 'Upload not confirmed. Retry saving';end if;
  update club_selection_private.player_week_editions set sealed_at=clock_timestamp() where id=e.id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown Player of the Week action';
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_awards_api(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); last_day date; cards jsonb; candidates jsonb; cfg club_selection_private.social_award_settings%rowtype;
 design club_selection_private.social_award_designs%rowtype; portrait club_selection_private.social_award_portraits%rowtype;
 edition club_selection_private.social_award_editions%rowtype; req club_selection_private.social_award_requests%rowtype;
 k text; x jsonb; f jsonb; value jsonb; chosen jsonb:='[]'; rid uuid; enabled_values text[];
begin
 if me is null then raise exception 'Sign in to manage social awards';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>100000 then raise exception 'Invalid social awards request';end if;
 if action in ('admin_context','admin_update') then
  if not public.has_platform_role(array['owner','commercial_admin']) then raise exception 'Platform owner access required';end if;
  if action='admin_context' then return jsonb_build_object('requests',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('club_name',cl.name) order by r.created_at desc) from club_selection_private.social_award_requests r join public.clubs cl on cl.id=r.club_id),'[]'));end if;
  if coalesce(data->>'status','') not in ('requested','in_progress','ready','closed') or length(coalesce(data->>'reply',''))>2000 then raise exception 'Check the request status and reply';end if;
  update club_selection_private.social_award_requests set status=data->>'status',reply=coalesce(data->>'reply',''),revision=revision+1,updated_at=now()
   where id=(data->>'id')::uuid and revision=(data->>'revision')::integer returning * into req;
  if req.id is null then raise exception 'Request changed. Refresh before saving';end if;
  return jsonb_build_object('saved',true,'revision',req.revision);
 end if;
 if c is null or not club_selection_private.social_allowed(c) then raise exception 'Club Admin or socials manager access required';end if;
 if action in ('scope_context','save_scope') then return club_selection_private.award_scope_api(c,action,data);end if;
 select * into cfg from club_selection_private.social_award_settings where club_id=c;
 if action='settings' then return jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0));end if;
 if action in ('context','save_photo','reserve_image') then
  data:=data||jsonb_build_object('award_scope',club_selection_private.award_scope(c,data->'award_scope'));
  last_day:=(data->>'week_end')::date;if last_day is null then raise exception 'Choose a week ending date';end if;
  cards:=club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,last_day-6,last_day),data->'award_scope'),coalesce((data->>'include_provisional')::boolean,false));candidates:=club_selection_private.social_award_candidates(cards);
 end if;
 if action='context' then return jsonb_build_object('award_scope',data->'award_scope','provisional_available',exists(select 1 from jsonb_array_elements(cards) day1card where day1card->>'provisional_available'='true'),
  'settings',jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0)),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('grade',entry#>>'{scorecard,grade}','status',entry#>>'{scorecard,status}','matched',entry->>'our_team' is not null)) from jsonb_array_elements(cards) entry),'[]'),
  'candidates',candidates,
  'designs',coalesce((select jsonb_object_agg(kind,jsonb_build_object('layout',layout,'revision',revision)) from club_selection_private.social_award_designs where club_id=c),'{}'),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'player_id',player_id,'photo',photo,'revision',revision)) from club_selection_private.social_award_portraits where club_id=c),'[]'),
  'editions',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('award_scope',club_selection_private.award_edition_scope(c,e.id),'scores_current',club_selection_private.social_award_scores_current(c,e.id),'sources',coalesce((select a.sources from club_selection_private.social_award_editions a where a.id=e.id),'[]'::jsonb),'performance_keys',coalesce((select jsonb_agg(entry->>'key') from club_selection_private.social_award_editions a cross join lateral jsonb_array_elements(a.sources) entry where a.id=e.id),'[]')) order by created_at) from club_selection_private.social_award_collection(c,last_day) e),'[]'),
  'requests',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from club_selection_private.social_award_requests r where club_id=c),'[]'));end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,17800));
 if action in ('scope_context','save_scope') then return club_selection_private.award_scope_api(c,action,data);end if;
 select * into cfg from club_selection_private.social_award_settings where club_id=c;
 if action='save_settings' then
  if coalesce(cfg.revision,0) is distinct from (data->>'revision')::integer then raise exception 'Award choices changed. Reload before saving';end if;
  if jsonb_typeof(data->'enabled') is distinct from 'array' or jsonb_array_length(data->'enabled')>5 or exists(select 1 from jsonb_array_elements_text(data->'enabled') e where e not in ('team_week','player_week','results','five_wickets','century')) then raise exception 'Choose awards from the list';end if;
  select coalesce(array_agg(distinct e),'{}'::text[]) into enabled_values from jsonb_array_elements_text(data->'enabled') e;
  insert into club_selection_private.social_award_settings values(c,enabled_values,1) on conflict(club_id) do update set enabled=excluded.enabled,revision=club_selection_private.social_award_settings.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(cfg.revision,0)+1,'enabled',enabled_values);
 elsif action='save_design' then
  k:=data->>'kind';if coalesce(k,'') not in ('results','five_wickets','century') then raise exception 'Choose a graphic type';end if;
  select * into design from club_selection_private.social_award_designs where club_id=c and kind=k;
  if design.layout=data->'layout' then return jsonb_build_object('saved',true,'revision',design.revision);end if;
  if coalesce(design.revision,0) is distinct from (data->>'revision')::integer then raise exception 'Artwork changed. Reload before saving';end if;
  value:=data->'layout';if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>30000 then raise exception 'Check the artwork settings';end if;
  foreach k in array array['background_path','logo_path','example_path'] loop
   if not club_selection_private.social_award_asset(c,nullif(value->>k,'')) then raise exception 'Upload artwork for this club first';end if;
  end loop;
  if value ? 'opponent_logos' then
   if jsonb_typeof(value->'opponent_logos') is distinct from 'object' or (select count(*) from jsonb_object_keys(value->'opponent_logos'))>50 then raise exception 'Check the opposition logos';end if;
   for k,x in select key,v from jsonb_each(value->'opponent_logos') as j(key,v) loop
    if k!~'^[0-9a-f-]{36}$' or jsonb_typeof(x) is distinct from 'object' or x->>'path' is null or not club_selection_private.social_award_asset(c,x->>'path') or length(coalesce(x->>'name',''))>255 then raise exception 'Upload opposition logos for this club first';end if;
   end loop;
  end if;
  for f in select * from jsonb_array_elements('[["title_y",0,100],["title_size",20,160],["name_y",0,100],["name_size",20,120],["figures_y",0,100],["figures_size",20,160],["grade_y",0,100],["week_y",0,100],["rows_top",15,65],["rows_bottom",70,98],["logo_x",0,100],["logo_y",0,100],["logo_size",3,40]]') loop
   if value ? (f->>0) and (jsonb_typeof(value->(f->>0)) is distinct from 'number' or (value->>(f->>0))::numeric not between (f->>1)::numeric and (f->>2)::numeric) then raise exception 'Check the text and logo positions';end if;
  end loop;
  foreach k in array array['includes_title','show_logo','text_panel'] loop
   if value ? k and jsonb_typeof(value->k) is distinct from 'boolean' then raise exception 'Check the artwork options';end if;
  end loop;
  if value ? 'text_colour' and coalesce(value->>'text_colour','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Choose a text colour';end if;
  insert into club_selection_private.social_award_designs values(c,data->>'kind',value,1) on conflict(club_id,kind) do update set layout=excluded.layout,revision=club_selection_private.social_award_designs.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(design.revision,0)+1);
 elsif action='save_photo' then
  k:=data->>'kind';if coalesce(k,'') not in ('five_wickets','century') or not exists(select 1 from jsonb_array_elements(candidates) entry where entry->>'kind'=k and entry->>'player_id'=data->>'player_id') then raise exception 'Choose a qualifying player from this week';end if;
  value:=data->'photo';if jsonb_typeof(value) is distinct from 'object' or not club_selection_private.social_award_asset(c,nullif(value->>'path','')) then raise exception 'Upload the player photo first';end if;
  for f in select * from jsonb_array_elements('[["x",0,100],["y",0,100],["size",10,100]]') loop
   if jsonb_typeof(value->(f->>0)) is distinct from 'number' or (value->>(f->>0))::numeric not between (f->>1)::numeric and (f->>2)::numeric then raise exception 'Check the photo position';end if;
  end loop;
  select * into portrait from club_selection_private.social_award_portraits where club_id=c and kind=k and player_id=data->>'player_id';
  if portrait.photo=value then return jsonb_build_object('saved',true,'revision',portrait.revision);end if;
  if coalesce(portrait.revision,0) is distinct from (data->>'revision')::integer then raise exception 'This player photo changed. Reload before saving';end if;
  insert into club_selection_private.social_award_portraits values(c,k,data->>'player_id',value,1) on conflict(club_id,kind,player_id) do update set photo=excluded.photo,revision=club_selection_private.social_award_portraits.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(portrait.revision,0)+1);
 elsif action='request' then
  rid:=(data->>'id')::uuid;if rid is null or length(btrim(coalesce(data->>'name',''))) not between 1 and 80 or length(btrim(coalesce(data->>'criteria',''))) not between 1 and 2000 or length(coalesce(data->>'artwork_notes',''))>2000 or jsonb_typeof(data->'files') is distinct from 'array' or jsonb_array_length(data->'files')>6 then raise exception 'Add the award name, criteria and up to six artwork examples';end if;
  for x in select * from jsonb_array_elements(data->'files') loop
   if x->>'path' is null or not club_selection_private.social_award_asset(c,x->>'path') or length(coalesce(x->>'name',''))>255 then raise exception 'Upload request artwork for this club first';end if;
  end loop;
  select * into req from club_selection_private.social_award_requests where id=rid;
  if req.id is not null then
   if req.club_id<>c or req.requested_by<>me or req.name<>btrim(data->>'name') or req.criteria<>btrim(data->>'criteria') or req.artwork_notes<>coalesce(data->>'artwork_notes','') or req.files<>data->'files' then raise exception 'This request already exists. Refresh to check it';end if;
  else
   insert into club_selection_private.social_award_requests(id,club_id,name,criteria,artwork_notes,files,requested_by) values(rid,c,btrim(data->>'name'),btrim(data->>'criteria'),coalesce(data->>'artwork_notes',''),data->'files',me);
  end if;
  return jsonb_build_object('saved',true,'id',rid);
 elsif action='reserve_image' then
  rid:=(data->>'id')::uuid;k:=data->>'kind';
  if rid is null or coalesce(k,'') not in ('results','five_wickets','century') or not k=any(coalesce(cfg.enabled,array['team_week','player_week'])) then raise exception 'Enable this graphic in Socials Awards first';end if;
  select * into edition from club_selection_private.social_award_editions where id=rid;
  if edition.id is not null then
   if edition.club_id<>c or edition.created_by<>me or (edition.request-'award_scope')<>(data-'award_scope') or club_selection_private.award_scope_key(edition.request->'award_scope')<>data#>>'{award_scope,key}' then raise exception 'This image identity was already used';end if;
   return jsonb_build_object('id',rid,'path',edition.image_path,'sealed',edition.sealed_at is not null);
  end if;
  if jsonb_typeof(data->'sources') is distinct from 'array' or jsonb_array_length(data->'sources') not between 1 and 4 or (k<>'results' and jsonb_array_length(data->'sources')<>1) then raise exception 'Choose the performances for this graphic';end if;
  if (select count(distinct entry->>'key') from jsonb_array_elements(data->'sources') entry)<>jsonb_array_length(data->'sources') then raise exception 'A performance was selected twice';end if;
  for x in select * from jsonb_array_elements(data->'sources') loop
   select p into value from jsonb_array_elements(candidates) p where p->>'key'=x->>'key' and p->>'kind'=k and p->>'signature'=x->>'signature';
   if value is null then raise exception 'Scores changed. Reload and review the graphic';end if;
   chosen:=chosen||jsonb_build_array(value);
  end loop;
  if k<>'results' and exists(select 1 from club_selection_private.social_award_editions e cross join lateral jsonb_array_elements(e.sources) src where e.club_id=c and e.kind=k and e.week_end=last_day and club_selection_private.award_scope_key(e.request->'award_scope')=data#>>'{award_scope,key}' and e.sealed_at is not null and src->>'key'=chosen->0->>'key' and src->>'signature'=chosen->0->>'signature' and e.id in (select id from club_selection_private.social_award_collection(c,last_day))) then raise exception 'This graphic is already created. Reload to see it in the post collection';end if;
  if length(btrim(coalesce(data->>'label',''))) not between 1 and 160 or coalesce(data->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(data->>'bytes','')!~'^[0-9]{1,8}$' or (data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Check the graphic before saving';end if;
  insert into club_selection_private.social_award_editions(id,club_id,kind,week_end,label,sources,image_path,image_sha,image_bytes,request,created_by)
   values(rid,c,k,last_day,data->>'label',chosen,c::text||'/editions/'||rid::text||'.png',data->>'sha256',(data->>'bytes')::integer,data,me) returning * into edition;
  return jsonb_build_object('id',rid,'path',edition.image_path,'sealed',false);
 elsif action='finish_image' then
  select * into edition from club_selection_private.social_award_editions where id=(data->>'id')::uuid and club_id=c and created_by=me for update;
  if edition.id is null then raise exception 'Saved image not found';end if;
  if edition.sealed_at is not null then return jsonb_build_object('saved',true,'id',edition.id);end if;
  candidates:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,edition.week_end-6,edition.week_end),edition.request->'award_scope'),coalesce((edition.request->>'include_provisional')::boolean,false)));
  if exists(select 1 from jsonb_array_elements(edition.sources) src where not exists(select 1 from jsonb_array_elements(candidates) p where p->>'key'=src->>'key' and p->>'signature'=src->>'signature')) then raise exception 'Scores changed. Reload and review the graphic';end if;
  if edition.kind<>'results' and exists(select 1 from club_selection_private.social_award_editions e cross join lateral jsonb_array_elements(e.sources) src where e.club_id=c and e.kind=edition.kind and club_selection_private.award_scope_key(e.request->'award_scope')=club_selection_private.award_scope_key(edition.request->'award_scope') and e.sealed_at is not null and src->>'key'=edition.sources->0->>'key' and src->>'signature'=edition.sources->0->>'signature' and e.id in (select id from club_selection_private.social_award_collection(c,edition.week_end))) then raise exception 'This graphic is already created. Reload to see it in the post collection';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-social-awards' and name=edition.image_path and (metadata->>'size')::bigint=edition.image_bytes) then raise exception 'Image upload not confirmed. Retry saving';end if;
  update club_selection_private.social_award_editions set sealed_at=coalesce(sealed_at,clock_timestamp()) where id=edition.id;
  return jsonb_build_object('saved',true,'id',edition.id);
 end if;
 raise exception 'Unknown social awards action';
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_award_collection(c uuid, last_day date)
 RETURNS TABLE(id uuid, kind text, week_end date, label text, bucket text, image_path text, image_sha text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with editions as (
  select e.*,case when e.kind in ('team_week','player_week') then e.kind
   else coalesce((select string_agg(src->>'key','|' order by src->>'key')
    from club_selection_private.social_award_editions a cross join lateral jsonb_array_elements(a.sources) src
    where a.id=e.id),e.id::text) end||':'||club_selection_private.award_scope_key(club_selection_private.award_edition_scope(c,e.id)) as identity_key
  from club_selection_private.social_award_sources(c) e where e.week_end=last_day
 )
 select distinct on (e.kind,e.identity_key) e.id,e.kind,e.week_end,e.label||case when club_selection_private.award_scope_key(club_selection_private.award_edition_scope(c,e.id))='all' then '' else ' · '||(club_selection_private.award_edition_scope(c,e.id)->>'label') end,e.bucket,e.image_path,e.image_sha,e.created_at
 from editions e order by e.kind,e.identity_key,e.created_at desc,e.id desc
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_award_scores_current(c uuid, eid uuid, cards jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare e record; saved jsonb; current_rows jsonb;
begin
 select * into e from club_selection_private.social_award_sources(c) where id=eid;
 if not found then return false;end if;
 cards:=club_selection_private.award_scope_cards(c,coalesce(cards,club_selection_private.team_week_cards(c,e.week_end-6,e.week_end)),club_selection_private.award_edition_scope(c,eid));
 if e.kind in ('results','century','five_wickets') then
  select sources into saved from club_selection_private.social_award_editions where id=eid and club_id=c;
  current_rows:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,cards,exists(select 1 from jsonb_array_elements(saved) x where x->>'provisional'='true')));
  return coalesce(jsonb_array_length(saved)>0 and not exists(
   select 1 from jsonb_array_elements(saved) src where not exists(
    select 1 from jsonb_array_elements(current_rows) p where p->>'kind'=e.kind
     and p->>'key'=src->>'key' and p->>'signature'=src->>'signature')),false);
 end if;
 if e.kind='team_week' then
  select rows into saved from club_selection_private.team_week_editions where id=eid and club_id=c;
 else
  select jsonb_build_array(winner) into saved from club_selection_private.player_week_editions where id=eid and club_id=c;
 end if;
 current_rows:=club_selection_private.player_week_performances(club_selection_private.award_scorecards(c,cards,exists(select 1 from jsonb_array_elements(saved) x where x->>'provisional'='true')));
 return coalesce(jsonb_array_length(saved)>0 and not exists(
  select 1 from jsonb_array_elements(saved) src where not exists(
   select 1 from jsonb_array_elements(current_rows) p
   where coalesce(p->>'provisional','false')=coalesce(src->>'provisional','false') and club_selection_private.social_award_facts(p)=club_selection_private.social_award_facts(src))),false);
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_post_validate(c uuid, fs jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare x jsonb; fid uuid;
begin
 if jsonb_typeof(fs) is distinct from 'array' or jsonb_array_length(fs) not between 1 and 10 then raise exception 'Choose up to ten graphics for one post';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(fs))<>jsonb_array_length(fs) then raise exception 'A graphic was included twice';end if;
 -- Reject old duplicate revisions even if an older browser submits them.
 if exists(
  select 1 from jsonb_array_elements(fs) item
  join club_selection_private.social_award_sources(c) e on e.id::text=item->>'id'
  where item->>'source_type'='award' and e.kind in ('team_week','player_week')
  group by e.kind,e.week_end,club_selection_private.award_scope_key(club_selection_private.award_edition_scope(c,e.id)) having count(*)>1
 ) then raise exception 'Choose one version of each weekly award for the same selection groups. Reload the Award post collection';end if;
 for x in select value from jsonb_array_elements(fs) loop
  fid:=(x->>'id')::uuid;
  if x->>'source_type'='award' then
   if not exists(select 1 from club_selection_private.social_award_sources(c) e where e.id=fid and e.kind=x->>'kind' and e.image_sha=x->>'artwork_key') then raise exception 'A saved award is unavailable. Reload the Award post collection';end if;
   if not club_selection_private.social_award_scores_current(c,fid) then raise exception 'Scores changed. Review and recreate this award before posting';end if;
   continue;
  end if;
  if x ? 'source_type' and x->>'source_type'<>'fixture' then raise exception 'Unknown graphic source';end if;
  if exists(select 1 from club_selection_private.fixtures f
    join club_selection_private.access a on a.club_id=f.club_id
    where f.club_id=c and f.id=fid and
      (club_selection_private.fixture_completed(f.published->'details',a.timezone)
       or club_selection_private.fixture_completed(f.details,a.timezone))) then
   raise exception 'This fixture is completed. Its team announcement cannot be posted or reposted.';
  end if;
  if not exists(select 1 from club_selection_private.fixtures where id=fid and club_id=c and published is not null)
   or coalesce(x->>'artwork_key','') is distinct from club_selection_private.social_artwork_key(fid)
   or not club_selection_private.social_features_valid(fid) then
   raise exception 'A team or its artwork changed. Refresh the graphics and review again';
  end if;
 end loop;
end$function$;

CREATE OR REPLACE FUNCTION club_selection_private.match_results_api(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare me uuid:=auth.uid();social boolean;coach boolean;selecting boolean;last_day date;first_day date;cards jsonb;card jsonb;choices jsonb;
 f club_selection_private.fixtures%rowtype;src club_selection_private.fixture_result_sources%rowtype;
 snapshot public.match_review_scorecards%rowtype;d jsonb;team text;match_id uuid;sid uuid;fid uuid;grade text;preview jsonb;award_scope jsonb;scopes jsonb;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then raise exception 'Current club membership is required';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>30000 then raise exception 'Invalid results request';end if;
 social:=club_selection_private.social_allowed(c);coach:=club_batting_private.team_review_staff(c);selecting:=club_selection_private.enabled(c) and club_selection_private.selection_viewer(c,me);
 if not social and not coach and not selecting then raise exception 'Selection, coaching or socials access is required';end if;
 if action in ('fixture','fixture_access') then
  fid:=nullif(data->>'fixture_id','')::uuid;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null then raise exception 'Choose a fixture in this club';end if;
  selecting:=club_selection_private.selection_view(c,f.details,me);
  if not social and not selecting and not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
  if action='fixture_access' then return jsonb_build_object('allowed',true);end if;
  d:=coalesce(f.published->'details',f.details);
  first_day:=(d->'days'->0->>'date')::date;
  select max((day->>'date')::date) into last_day from jsonb_array_elements(d->'days') day;
  select * into src from club_selection_private.fixture_result_sources where fixture_id=fid and club_id=c;
  match_id:=coalesce(src.source_match_id,nullif(f.scorecard_sync->>'match_id','')::uuid);
  cards:=club_selection_private.shared_result_cards(c,first_day,last_day);
  return jsonb_build_object('can_review',coach and exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text),'playhq',(select jsonb_build_object('linked',true,'can_check',club_selection_private.selection_edit(c,f.details,me) or public.is_club_admin(c),'pending_change',l.pending_fixture is not null,'error',l.result_error,'checked_at',l.summary_checked_at) from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=fid),'week_end',last_day,'fixtures',jsonb_build_array(jsonb_build_object('id',f.id,'grade',d->>'grade','opposition',d->>'opposition','format',d->>'format','days',d->'days','cancelled',coalesce((d->>'cancelled')::boolean,false),'match_id',match_id,'no_play',coalesce(src.no_play,club_selection_private.fixture_source_no_play(c,fid)))),
   'cards',coalesce((select jsonb_agg(x) from jsonb_array_elements(cards) x where x#>>'{scorecard,dates,0}'=first_day::text and x#>>'{scorecard,format_key}'=d->>'format' and (nullif(x->>'fixture_id','') is null or x->>'fixture_id'=fid::text or x#>>'{scorecard,match_id}'=match_id::text) and (social or coach or club_selection_private.selection_scorecard_view(c,x->'scorecard',me))),'[]'));
 end if;
 if action='context' then
  if not social then raise exception 'Club socials access is required';end if;
  last_day:=(data->>'week_end')::date;if last_day is null then raise exception 'Choose a week';end if;first_day:=last_day-6;
  award_scope:=club_selection_private.award_scope(c,data->'award_scope');
  if data ? 'award_edition_ids' then
   if jsonb_typeof(data->'award_edition_ids') is distinct from 'array' or jsonb_array_length(data->'award_edition_ids') not between 1 and 10 then raise exception 'Choose up to ten awards';end if;
   if exists(select 1 from jsonb_array_elements_text(data->'award_edition_ids') selected(value) where not exists(select 1 from club_selection_private.social_award_sources(c) e where e.id::text=selected.value and e.week_end=last_day)) then raise exception 'Choose saved awards from this club and week';end if;
   select jsonb_agg(club_selection_private.award_edition_scope(c,selected.value::uuid)) into scopes from jsonb_array_elements_text(data->'award_edition_ids') selected(value);
   if exists(select 1 from jsonb_array_elements(scopes) x where x->>'mode'='all') then award_scope:=club_selection_private.award_scope(c,null);
   else award_scope:=jsonb_build_object('mode','grades','grade_ids',coalesce((select jsonb_agg(distinct g) from jsonb_array_elements(scopes) x cross join lateral jsonb_array_elements(x->'grade_ids') g),'[]'));end if;
  end if;
  cards:=club_selection_private.award_scope_cards(c,club_selection_private.shared_result_cards(c,first_day,last_day),award_scope);
  return jsonb_build_object('award_scope',award_scope,'week_end',last_day,'cards',cards,'fixtures',coalesce((
   select jsonb_agg(jsonb_build_object('id',f.id,'grade',d->>'grade','opposition',d->>'opposition','format',d->>'format','days',d->'days',
    'cancelled',coalesce((d->>'cancelled')::boolean,false),'grade_id',club_selection_private.fixture_group_id(c,d),'match_id',coalesce(l.source_match_id::text,f.scorecard_sync->>'match_id',hq.match_id::text),'no_play',coalesce(l.no_play,club_selection_private.fixture_source_no_play(c,f.id))) order by d->'days'->0->>'date',d->>'grade',f.id)
   from club_selection_private.fixtures f cross join lateral(select coalesce(f.published->'details',f.details) d) v
   left join club_selection_private.fixture_result_sources l on l.club_id=c and l.fixture_id=f.id
   left join club_selection_private.playhq_links hq on hq.club_id=c and hq.fixture_id=f.id
   where f.club_id=c and club_selection_private.award_scope_includes(award_scope,club_selection_private.fixture_group_id(c,d)) and exists(select 1 from jsonb_array_elements(d->'days') day where day->>'date' between first_day::text and last_day::text)
  ),'[]'));
 elsif action='review' then
  if not coach then raise exception 'Current club coaching access is required';end if;
  first_day:=(data->>'match_date')::date;if first_day is null then raise exception 'Choose a match date';end if;
  fid:=nullif(data->>'fixture_id','')::uuid;
  if fid is not null then
   if not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
   select * into f from club_selection_private.fixtures where id=fid and club_id=c;
   select * into src from club_selection_private.fixture_result_sources where fixture_id=fid and club_id=c;
   match_id:=coalesce(src.source_match_id,nullif(f.scorecard_sync->>'match_id','')::uuid);grade:=f.details->>'grade';
  elsif nullif(data->>'group_id','') is not null then
   select g.name into grade from public.playing_groups g where g.club_id=c and g.id=(data->>'group_id')::uuid and g.active and g.batting_enabled;
   if grade is null then raise exception 'Choose a team that uses Club Batting';end if;
  end if;
  match_id:=coalesce(match_id,nullif(data->>'existing_match_id','')::uuid);
  cards:=club_selection_private.shared_result_cards(c,first_day,first_day);
  select coalesce(jsonb_agg(x),'[]') into choices from jsonb_array_elements(cards) x
   where x#>>'{scorecard,dates,0}'=first_day::text and (nullif(data->>'format_key','') is null or x#>>'{scorecard,format_key}'=data->>'format_key')
   and (nullif(x->>'fixture_id','') is null or exists(select 1 from club_selection_private.fixtures available where available.club_id=c and available.id=(x->>'fixture_id')::uuid and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,available.details))));
  sid:=nullif(data->>'snapshot_id','')::uuid;
  if sid is not null then
   select x into card from jsonb_array_elements(choices) x where x->>'snapshot_id'=sid::text;
   if card is null then raise exception 'Choose a scorecard for this match date and format';end if;
  elsif match_id is not null then
   select x into card from jsonb_array_elements(choices) x where x#>>'{scorecard,match_id}'=match_id::text;
  else
   select case when count(*)=1 then jsonb_agg(x)->0 end into card from jsonb_array_elements(choices) x
    where grade is not null and regexp_replace(lower(coalesce(x->>'grade_hint',x#>>'{scorecard,grade}')),'[^a-z0-9]','','g')=regexp_replace(lower(grade),'[^a-z0-9]','','g');
  end if;
  if card is not null then
   preview:=club_batting_private.get_match_review_scorecard(c,(card->>'snapshot_id')::uuid)||jsonb_build_object('our_team_id',card->'our_team');
  end if;
  return jsonb_build_object('preview',preview,'choices',coalesce((select jsonb_agg(jsonb_build_object('snapshot_id',x->'snapshot_id','grade',x#>'{scorecard,grade}','teams',x#>'{scorecard,teams}','match_id',x#>'{scorecard,match_id}')) from jsonb_array_elements(choices) x),'[]'));
 end if;
 if action not in ('link','identify','no_play') then raise exception 'Unknown results action';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,19900));
 fid:=nullif(data->>'fixture_id','')::uuid;
 if selecting and not social and not coach and fid is null then raise exception 'Choose a club fixture';end if;
 if fid is not null then
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null then raise exception 'Choose a fixture in this club';end if;
  selecting:=club_selection_private.selection_view(c,f.details,me);
  if not social and not selecting and not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
  if club_selection_private.scoped_selections(c) and not club_selection_private.result_editor(fid,me) then raise exception 'Edit access to this Selection Group is required';end if;
  select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
  d:=coalesce(f.published->'details',f.details);
 end if;
 if action='no_play' then
  if fid is null then raise exception 'Choose a club fixture';end if;
  if src.source_match_id is not null or f.scorecard_sync->>'match_id' is not null then raise exception 'A scorecard is already linked. Check the PlayCricket result';end if;
  if coalesce(data->>'reason','')='' then delete from club_selection_private.fixture_result_sources where fixture_id=fid and no_play is not null;
  else
   if data->>'reason' not in ('washed_out','bye','cancelled') then raise exception 'Choose why the match did not take place';end if;
   insert into club_selection_private.fixture_result_sources(fixture_id,club_id,no_play,updated_by) values(fid,c,data->>'reason',me)
    on conflict(fixture_id) do update set no_play=excluded.no_play,updated_by=me,updated_at=now();
  end if;
 else
  sid:=(data->>'snapshot_id')::uuid;
  select * into snapshot from public.match_review_scorecards where id=sid and club_id=c;
  if snapshot.id is null then raise exception 'Choose a scorecard imported for this club';end if;
  -- Use the latest version even if another volunteer refreshed during this request.
  select * into snapshot from public.match_review_scorecards where club_id=c and source_match_id=snapshot.source_match_id order by created_at desc,id desc limit 1;
  card:=snapshot.scorecard;team:=coalesce(nullif(data->>'team_id',''),(select t.team_id::text from club_selection_private.team_week_sources t where t.club_id=c and t.source_match_id=snapshot.source_match_id),club_batting_private.scorecard_club_team(c,card));
  if team is not null and not exists(select 1 from jsonb_array_elements(card->'teams') x where x->>'id'=team) then raise exception 'Choose our team from this scorecard';end if;
  if action='identify' and team is null then raise exception 'Choose our team';end if;
  if action='link' then
   if fid is null then raise exception 'Choose a club fixture';end if;
   if d->'days'->0->>'date' is distinct from card->'dates'->>0 or d->>'format' is distinct from card->>'format_key' then raise exception 'This scorecard has a different match date or format';end if;
   if src.source_match_id is not null and src.source_match_id<>snapshot.source_match_id and src.source_match_id is distinct from nullif(data->>'expected_match_id','')::uuid then raise exception 'The match link changed. Refresh results before replacing it';end if;
   if f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>snapshot.source_match_id::text then raise exception 'This team is confirmed against a different PlayCricket match';end if;
   insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(fid,c,snapshot.source_match_id,team::uuid,me)
    on conflict(fixture_id) do update set source_match_id=excluded.source_match_id,team_id=excluded.team_id,no_play=null,updated_by=me,updated_at=now();
  end if;
  if team is not null then
   if club_selection_private.scoped_selections(c) and exists(select 1 from club_selection_private.fixture_result_sources linked where linked.club_id=c and linked.source_match_id=snapshot.source_match_id and not club_selection_private.result_editor(linked.fixture_id,me)) then raise exception 'Edit access to each linked Selection Group is required';end if;
   insert into club_selection_private.team_week_sources(club_id,source_match_id,team_id,updated_by) values(c,snapshot.source_match_id,team::uuid,me)
    on conflict(club_id,source_match_id) do update set team_id=excluded.team_id,updated_by=me;
   update club_selection_private.fixture_result_sources set team_id=team::uuid,updated_by=me,updated_at=now() where club_id=c and source_match_id=snapshot.source_match_id;
  end if;
 end if;
 if action in ('link','identify') and fid is not null and team is not null then
  perform club_selection_private.link_selected_scorecard_players(c,snapshot.id,fid,team::uuid,me);
 end if;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'shared_result_'||action,jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',team,'reason',data->>'reason'));
 return jsonb_build_object('saved',true);
end $function$;
