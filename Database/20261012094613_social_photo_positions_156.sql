-- Per-announcement photo offsets, as percentages of the 1080 x 1350 graphic.
-- Existing rows retain their current placement. Permissions and API routes stay unchanged.
alter table club_selection_private.social_features
 add column photo_x integer not null default 0 check (photo_x between -30 and 30),
 add column photo_y integer not null default 0 check (photo_y between -30 and 30);

CREATE OR REPLACE FUNCTION club_selection_private.social_set_feature(c uuid, d jsonb, actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f club_selection_private.fixtures%rowtype;choice club_selection_private.social_features%rowtype;
 fid uuid:=nullif(d->>'fixture_id','')::uuid;person uuid:=nullif(d->>'roster_id','')::uuid;aid uuid:=nullif(d->>'asset_id','')::uuid;
 m text:=d->>'mode';daynum integer;item jsonb;offset_x integer;offset_y integer;
begin
 if (d ? 'photo_x' and (jsonb_typeof(d->'photo_x') is distinct from 'number' or (d->>'photo_x')!~'^-?[0-9]{1,2}$'))
 or (d ? 'photo_y' and (jsonb_typeof(d->'photo_y') is distinct from 'number' or (d->>'photo_y')!~'^-?[0-9]{1,2}$')) then raise exception 'Use a whole-number photo position';end if;
 offset_x:=coalesce((d->>'photo_x')::integer,0);offset_y:=coalesce((d->>'photo_y')::integer,0);
 if offset_x not between -30 and 30 or offset_y not between -30 and 30 then raise exception 'Move the photo by up to 30%% in either direction';end if;
 select * into f from club_selection_private.fixtures where club_id=c and id=fid and published is not null;
 if not found or f.publication is distinct from (d->>'publication')::integer then raise exception 'Published team changed. Refresh before choosing a photo';end if;
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
   or not exists(select 1 from jsonb_array_elements(f.published->'slots') z where z->>('d'||daynum)=person::text)) then raise exception 'Choose a player selected in the published team for this day';end if;
  select * into choice from club_selection_private.social_features where club_id=c and fixture_id=fid and day=daynum;
  if coalesce(choice.revision,0)<>coalesce((d->'revisions'->>('d'||daynum))::integer,-1) then raise exception 'Featured photo changed. Refresh before saving';end if;
  insert into club_selection_private.social_features(club_id,fixture_id,day,mode,roster_id,asset_id,photo_x,photo_y,updated_by)
   values(c,fid,daynum,m,person,aid,offset_x,offset_y,actor) on conflict(club_id,fixture_id,day) do update
   set mode=excluded.mode,roster_id=excluded.roster_id,asset_id=excluded.asset_id,photo_x=excluded.photo_x,photo_y=excluded.photo_y,revision=club_selection_private.social_features.revision+1,updated_at=now(),updated_by=actor;
 end loop;
 return jsonb_build_object('saved',true);
end$function$
;
-- social_api context already returns these columns via to_jsonb.
-- social_artwork_key includes the feature revision, which every position save increments.

