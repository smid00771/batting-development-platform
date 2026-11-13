-- Existing functions are private invokers with owner-only execution (verified before release).
-- CREATE OR REPLACE retains those privileges; this migration makes no access-control changes.
-- One social graphic covers the whole two-day fixture. Either bracket partner may feature.
-- Keep per-day revisions for existing clients; whole-fixture saves update both atomically.
CREATE OR REPLACE FUNCTION club_selection_private.social_set_feature(c uuid, d jsonb, actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f club_selection_private.fixtures%rowtype;choice club_selection_private.social_features%rowtype;
 fid uuid:=nullif(d->>'fixture_id','')::uuid;person uuid:=nullif(d->>'roster_id','')::uuid;aid uuid:=nullif(d->>'asset_id','')::uuid;
 m text:=d->>'mode';daynum integer;item jsonb;offset_x integer;offset_y integer;requested_size integer;saved_size integer;
begin
 if (d ? 'photo_x' and (jsonb_typeof(d->'photo_x') is distinct from 'number' or (d->>'photo_x')!~'^-?[0-9]{1,2}$'))
 or (d ? 'photo_y' and (jsonb_typeof(d->'photo_y') is distinct from 'number' or (d->>'photo_y')!~'^-?[0-9]{1,2}$')) then raise exception 'Use a whole-number photo position';end if;
 offset_x:=coalesce((d->>'photo_x')::integer,0);offset_y:=coalesce((d->>'photo_y')::integer,0);
 if offset_x not between -30 and 30 or offset_y not between -30 and 30 then raise exception 'Move the photo by up to 30%% in either direction';end if;
 if d ? 'photo_scale' then
  if jsonb_typeof(d->'photo_scale') is distinct from 'number' or (d->>'photo_scale')!~'^[0-9]{2,3}$' then raise exception 'Use a whole-number photo size';end if;
  requested_size:=(d->>'photo_scale')::integer;
  if requested_size not between 50 and 150 then raise exception 'Choose a photo size from 50%% to 150%%';end if;
 end if;
 select * into f from club_selection_private.fixtures where club_id=c and id=fid and published is not null;
 if not found or f.publication is distinct from (d->>'publication')::integer then raise exception 'Published team changed. Refresh before choosing a photo';end if;
 if club_selection_private.fixture_completed(f.published->'details',(select timezone from club_selection_private.access where club_id=c),clock_timestamp()) then
  raise exception using errcode='P0159',message='Completed fixtures are read-only. Use Design sandbox to try artwork.';
 end if;
 if m is null or m not in ('default','none','player') or (m='player' and person is null) or (m<>'player' and (person is not null or aid is not null))
 or jsonb_typeof(d->'days') is distinct from 'array' or jsonb_array_length(d->'days') not between 1 and 2 then raise exception 'Choose the photo and playing day';end if;
 if (select count(distinct value) from jsonb_array_elements(d->'days'))<>jsonb_array_length(d->'days') then raise exception 'Choose each playing day once';end if;
 if aid is not null and not exists(select 1 from club_selection_private.social_assets where id=aid and club_id=c and kind in ('photo','portrait') and roster_id=person)
 then raise exception 'Choose a saved photo of this player';end if;
 for item in select * from jsonb_array_elements(d->'days') loop
  if jsonb_typeof(item)<>'number' or item::text not in ('1','2') then raise exception 'Invalid playing day';end if;
  daynum:=(item::text)::integer;
  if daynum>jsonb_array_length(f.published->'details'->'days') then raise exception 'Invalid playing day';end if;
  if m='player' and (not exists(select 1 from club_selection_private.roster where club_id=c and id=person)
   or not exists(select 1 from jsonb_array_elements(f.published->'slots') z where z->>'d1'=person::text or (jsonb_array_length(f.published->'details'->'days')=2 and z->>'d2'=person::text))) then raise exception 'Choose a player selected in this published fixture';end if;
  select * into choice from club_selection_private.social_features where club_id=c and fixture_id=fid and day=daynum;
  if coalesce(choice.revision,0)<>coalesce((d->'revisions'->>('d'||daynum))::integer,-1) then raise exception 'Featured photo changed. Refresh before saving';end if;
  saved_size:=case when d ? 'photo_scale' then requested_size
    when choice.mode=m and choice.roster_id is not distinct from person and choice.asset_id is not distinct from aid then choice.photo_scale else null end;
  insert into club_selection_private.social_features(club_id,fixture_id,day,mode,roster_id,asset_id,photo_x,photo_y,photo_scale,updated_by)
   values(c,fid,daynum,m,person,aid,offset_x,offset_y,saved_size,actor) on conflict(club_id,fixture_id,day) do update
   set mode=excluded.mode,roster_id=excluded.roster_id,asset_id=excluded.asset_id,photo_x=excluded.photo_x,photo_y=excluded.photo_y,photo_scale=excluded.photo_scale,revision=club_selection_private.social_features.revision+1,updated_at=now(),updated_by=actor;
 end loop;
 return jsonb_build_object('saved',true);
end;
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_features_valid(fid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select not exists(select 1 from club_selection_private.social_features a join club_selection_private.fixtures f on f.id=a.fixture_id and f.club_id=a.club_id
 where f.id=fid and a.mode='player' and (a.day>jsonb_array_length(f.published->'details'->'days')
 or not exists(select 1 from jsonb_array_elements(f.published->'slots') z where z->>'d1'=a.roster_id::text or (jsonb_array_length(f.published->'details'->'days')=2 and z->>'d2'=a.roster_id::text))
 or (a.asset_id is not null and not exists(select 1 from club_selection_private.social_assets p where p.id=a.asset_id and p.club_id=a.club_id and p.roster_id=a.roster_id and p.kind in ('portrait','photo')))))
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_artwork_key(fid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select md5(jsonb_build_object('renderer',case when jsonb_array_length(f.published->'details'->'days')=2 then '0.8.62.362' else '0.8.62.138' end,'publication',f.publication,'snapshot',f.published,'design',coalesce(s.design,'{}'),
 'brand',jsonb_build_array(c.name,c.logo_data_url,c.primary_colour,c.accent_colour),
 'season_portrait',club_selection_private.social_season_portrait(f.club_id,f.published->'details'),
 'features',(select jsonb_agg(jsonb_build_array(g.day,g.mode,g.roster_id,g.asset_id,g.revision) order by g.day) from club_selection_private.social_features g where g.club_id=f.club_id and g.fixture_id=f.id),'assets',(select jsonb_agg(jsonb_build_array(a.id,a.path,a.revision) order by a.id) from club_selection_private.social_assets a where a.club_id=f.club_id))::text)
 from club_selection_private.fixtures f join public.clubs c on c.id=f.club_id
 left join club_selection_private.social_settings s on s.club_id=f.club_id where f.id=fid and f.published is not null
$function$;
