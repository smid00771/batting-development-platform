-- Saved versions stay available to history and existing approved posts.
-- A new collection offers one current Team / Player of the Week per week.
-- Individual milestones and Results batches remain separate graphics.
create or replace function club_selection_private.social_award_collection(c uuid, last_day date)
returns table(id uuid,kind text,week_end date,label text,bucket text,image_path text,image_sha text,created_at timestamptz)
language sql stable set search_path='' as $$
 select distinct on (e.kind, case when e.kind in ('team_week','player_week') then e.kind else e.id::text end) e.*
 from club_selection_private.social_award_sources(c) e
 where e.week_end=last_day
 order by e.kind, case when e.kind in ('team_week','player_week') then e.kind else e.id::text end,
          e.created_at desc,e.id desc
$$;
revoke all on function club_selection_private.social_award_collection(uuid,date) from public,anon,authenticated;

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
 select * into cfg from club_selection_private.social_award_settings where club_id=c;
 if action='settings' then return jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0));end if;
 if action in ('context','save_photo','reserve_image') then
  last_day:=(data->>'week_end')::date;if last_day is null then raise exception 'Choose a week ending date';end if;
  cards:=club_selection_private.team_week_cards(c,last_day-6,last_day);candidates:=club_selection_private.social_award_candidates(cards);
 end if;
 if action='context' then return jsonb_build_object(
  'settings',jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0)),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('grade',entry#>>'{scorecard,grade}','status',entry#>>'{scorecard,status}','matched',entry->>'our_team' is not null)) from jsonb_array_elements(cards) entry),'[]'),
  'candidates',candidates,
  'designs',coalesce((select jsonb_object_agg(kind,jsonb_build_object('layout',layout,'revision',revision)) from club_selection_private.social_award_designs where club_id=c),'{}'),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'player_id',player_id,'photo',photo,'revision',revision)) from club_selection_private.social_award_portraits where club_id=c),'[]'),
  'editions',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('performance_keys',coalesce((select jsonb_agg(entry->>'key') from club_selection_private.social_award_editions a cross join lateral jsonb_array_elements(a.sources) entry where a.id=e.id),'[]')) order by created_at) from club_selection_private.social_award_collection(c,last_day) e),'[]'),
  'requests',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from club_selection_private.social_award_requests r where club_id=c),'[]'));end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,17800));
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
   if edition.club_id<>c or edition.created_by<>me or edition.request<>data then raise exception 'This image identity was already used';end if;
   return jsonb_build_object('id',rid,'path',edition.image_path,'sealed',edition.sealed_at is not null);
  end if;
  if jsonb_typeof(data->'sources') is distinct from 'array' or jsonb_array_length(data->'sources') not between 1 and 4 or (k<>'results' and jsonb_array_length(data->'sources')<>1) then raise exception 'Choose the performances for this graphic';end if;
  if (select count(distinct entry->>'key') from jsonb_array_elements(data->'sources') entry)<>jsonb_array_length(data->'sources') then raise exception 'A performance was selected twice';end if;
  for x in select * from jsonb_array_elements(data->'sources') loop
   select p into value from jsonb_array_elements(candidates) p where p->>'key'=x->>'key' and p->>'kind'=k and p->>'signature'=x->>'signature';
   if value is null then raise exception 'Scores changed. Reload and review the graphic';end if;
   chosen:=chosen||jsonb_build_array(value);
  end loop;
  if k<>'results' and exists(select 1 from club_selection_private.social_award_editions e cross join lateral jsonb_array_elements(e.sources) src where e.club_id=c and e.kind=k and e.week_end=last_day and e.sealed_at is not null and src->>'key'=chosen->0->>'key') then raise exception 'This graphic is already created. Reload to see it in the post collection';end if;
  if length(btrim(coalesce(data->>'label',''))) not between 1 and 160 or coalesce(data->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(data->>'bytes','')!~'^[0-9]{1,8}$' or (data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Check the graphic before saving';end if;
  insert into club_selection_private.social_award_editions(id,club_id,kind,week_end,label,sources,image_path,image_sha,image_bytes,request,created_by)
   values(rid,c,k,last_day,data->>'label',chosen,c::text||'/editions/'||rid::text||'.png',data->>'sha256',(data->>'bytes')::integer,data,me) returning * into edition;
  return jsonb_build_object('id',rid,'path',edition.image_path,'sealed',false);
 elsif action='finish_image' then
  select * into edition from club_selection_private.social_award_editions where id=(data->>'id')::uuid and club_id=c and created_by=me for update;
  if edition.id is null then raise exception 'Saved image not found';end if;
  if edition.sealed_at is not null then return jsonb_build_object('saved',true,'id',edition.id);end if;
  candidates:=club_selection_private.social_award_candidates(club_selection_private.team_week_cards(c,edition.week_end-6,edition.week_end));
  if exists(select 1 from jsonb_array_elements(edition.sources) src where not exists(select 1 from jsonb_array_elements(candidates) p where p->>'key'=src->>'key' and p->>'signature'=src->>'signature')) then raise exception 'Scores changed. Reload and review the graphic';end if;
  if edition.kind<>'results' and exists(select 1 from club_selection_private.social_award_editions e cross join lateral jsonb_array_elements(e.sources) src where e.club_id=c and e.kind=edition.kind and e.sealed_at is not null and src->>'key'=edition.sources->0->>'key') then raise exception 'This graphic is already created. Reload to see it in the post collection';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-social-awards' and name=edition.image_path and (metadata->>'size')::bigint=edition.image_bytes) then raise exception 'Image upload not confirmed. Retry saving';end if;
  update club_selection_private.social_award_editions set sealed_at=coalesce(sealed_at,clock_timestamp()) where id=edition.id;
  return jsonb_build_object('saved',true,'id',edition.id);
 end if;
 raise exception 'Unknown social awards action';
end $function$
;

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
  group by e.kind,e.week_end having count(*)>1
 ) then raise exception 'Choose one version of each weekly award. Reload the Award post collection';end if;
 for x in select value from jsonb_array_elements(fs) loop
  fid:=(x->>'id')::uuid;
  if x->>'source_type'='award' then
   if not exists(select 1 from club_selection_private.social_award_sources(c) e where e.id=fid and e.kind=x->>'kind' and e.image_sha=x->>'artwork_key') then raise exception 'A saved award is unavailable. Reload the Award post collection';end if;
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
end$function$
;

