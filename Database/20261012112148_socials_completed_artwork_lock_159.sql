-- Lock completed team artwork while retaining the existing authorization and retry rules.
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
   or not exists(select 1 from jsonb_array_elements(f.published->'slots') z where z->>('d'||daynum)=person::text)) then raise exception 'Choose a player selected in the published team for this day';end if;
  select * into choice from club_selection_private.social_features where club_id=c and fixture_id=fid and day=daynum;
  if coalesce(choice.revision,0)<>coalesce((d->'revisions'->>('d'||daynum))::integer,-1) then raise exception 'Featured photo changed. Refresh before saving';end if;
  insert into club_selection_private.social_features(club_id,fixture_id,day,mode,roster_id,asset_id,photo_x,photo_y,updated_by)
   values(c,fid,daynum,m,person,aid,offset_x,offset_y,actor) on conflict(club_id,fixture_id,day) do update
   set mode=excluded.mode,roster_id=excluded.roster_id,asset_id=excluded.asset_id,photo_x=excluded.photo_x,photo_y=excluded.photo_y,revision=club_selection_private.social_features.revision+1,updated_at=now(),updated_by=actor;
 end loop;
 return jsonb_build_object('saved',true);
end$function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();adm boolean;allowed boolean;cfg club_selection_private.social_settings%rowtype;
 asset club_selection_private.social_assets%rowtype;req club_selection_private.requests%rowtype;rid uuid;uid uuid;fid uuid;
 data jsonb;result jsonb;x jsonb;k text;v text;photo uuid;asset_id uuid;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>30000 then raise exception 'Invalid artwork request';end if;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 allowed:=club_selection_private.social_allowed(c);
 if p_action='access' then return jsonb_build_object('allowed',allowed,'admin',adm);end if;
 if not allowed then raise exception 'Club Admin or socials manager access required';end if;
 if p_action not in ('context','validate_export') then
 perform pg_advisory_xact_lock(hashtextextended(c::text,13500));
 rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into req from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if req.action<>'socials:'||p_action or req.payload<>p_data then raise exception 'Request ID already used';end if;return req.result;end if;
 end if;
 select * into cfg from club_selection_private.social_settings where club_id=c;
 if p_action='context' then
 return jsonb_build_object('admin',adm,'revision',coalesce(cfg.revision,0),'design',coalesce(cfg.design,'{}'),
 'style_suggestions_available',club_selection_private.social_artwork_ai_enabled(c),'artwork_ai_paused',not club_selection_private.social_artwork_ai_enabled(c),'grade_defaults',coalesce((select fixture_defaults->'rows' from club_selection_private.access where club_id=c),'[]'),'brand',(select jsonb_build_object('name',name,'logo',logo_data_url,'primary',primary_colour,'accent',accent_colour) from public.clubs where id=c),
 'assets',coalesce((select jsonb_agg(to_jsonb(a)-'updated_by' order by kind,id) from club_selection_private.social_assets a where club_id=c),'[]'),
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name,id) from club_selection_private.roster where club_id=c),'[]'),
 'members',case when adm then coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.display_name,'Club member'),'email',(select email from auth.users au where au.id=m.user_id),'manager',exists(select 1 from club_selection_private.social_managers z where z.club_id=c and z.user_id=m.user_id),'admin',m.permission_role='admin') order by p.display_name,m.user_id) from public.club_memberships m left join public.user_profiles p on p.user_id=m.user_id where m.club_id=c),'[]') else '[]'::jsonb end,
 'timezone',coalesce((select timezone from club_selection_private.access where club_id=c),'Australia/Sydney'),
 'fixture_calendar',coalesce((select jsonb_agg(jsonb_build_object(
   'id',f.id,'date',coalesce(f.published->'details',f.details)->'days'->0->>'date',
   'last_date',(select max(day->>'date') from jsonb_array_elements(coalesce(f.published->'details',f.details)->'days') day),
   'grade',coalesce(f.published->'details',f.details)->>'grade',
   'opposition',coalesce(f.published->'details',f.details)->>'opposition',
   'published',f.published is not null,
   'completed',club_selection_private.fixture_completed(coalesce(f.published->'details',f.details),(select timezone from club_selection_private.access where club_id=c)))
   order by coalesce(f.published->'details',f.details)->'days'->0->>'date',coalesce(f.published->'details',f.details)->>'grade')
   from club_selection_private.fixtures f where f.club_id=c),'[]'),
 'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'publication',f.publication,'published',f.published,'published_at',f.published_at,'completed',club_selection_private.fixture_completed(f.published->'details',(select timezone from club_selection_private.access where club_id=c)),
 'season_portrait_id',club_selection_private.social_season_portrait(c,f.published->'details'),'artwork_key',club_selection_private.social_artwork_key(f.id),
 'features',coalesce((select jsonb_agg(to_jsonb(g)-'updated_by' order by day) from club_selection_private.social_features g where g.club_id=c and g.fixture_id=f.id),'[]'),'feature_valid',club_selection_private.social_features_valid(f.id),'last_export',case when e.fixture_id is not null then jsonb_build_object('artwork_key',e.artwork_key,'at',e.exported_at) end)
 order by f.published->'details'->'days'->0->>'date' desc,f.published->'details'->>'grade')
 from (select * from club_selection_private.fixtures where club_id=c and published is not null order by published->'details'->'days'->0->>'date' desc,id limit 200) f
 left join club_selection_private.social_exports e on e.club_id=c and e.fixture_id=f.id),'[]'));
 elsif p_action='settings' then
 if coalesce(cfg.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Artwork settings changed. Refresh before saving';end if;
 data:=jsonb_build_object('header_height',310,'photo_scale',100,'photo_shift',0,'header_layout','separate','theme','gradient','frame','cutout','font','bold','marker','arrows','brief','')||coalesce(cfg.design,'{}')||coalesce(p_data->'design','{}');
 if jsonb_typeof(p_data->'design') is distinct from 'object' or coalesce(data->>'layout','') not in ('portrait','portrait_left','list') or coalesce(data->>'photo_policy','') not in ('choose','match','season')
 or coalesce(data->>'primary','')!~'^#[0-9a-fA-F]{6}$' or coalesce(data->>'accent','')!~'^#[0-9a-fA-F]{6}$'
 or coalesce(data->>'header_layout','') not in ('separate','banner','integrated') or coalesce(data->>'header_height','')!~'^[0-9]{3}$' or (data->>'header_height')::int not between 200 and 440 or coalesce(data->>'photo_scale','')!~'^[0-9]{2,3}$' or (data->>'photo_scale')::int not between 80 and 125 or coalesce(data->>'photo_shift','')!~'^-?[0-9]{1,3}$' or (data->>'photo_shift')::int not between -100 and 100 or coalesce(data->>'theme','') not in ('gradient','solid','split') or coalesce(data->>'frame','') not in ('cutout','rectangle','circle')
 or coalesce(data->>'font','') not in ('bold','clean','classic') or coalesce(data->>'marker','') not in ('arrows','badge','name')
 or length(coalesce(data->>'footer',''))>100 or length(coalesce(data->>'brief',''))>1500 then raise exception 'Check the layout, colours and style choices';end if;
 data:=jsonb_build_object('header_height',(data->>'header_height')::int,'photo_scale',(data->>'photo_scale')::int,'photo_shift',(data->>'photo_shift')::int,'header_layout',data->>'header_layout','layout',data->>'layout','photo_policy',data->>'photo_policy','primary',upper(data->>'primary'),'accent',upper(data->>'accent'),'footer',btrim(coalesce(data->>'footer','')),
 'theme',data->>'theme','frame',data->>'frame','font',data->>'font','marker',data->>'marker','brief',btrim(coalesce(data->>'brief','')));
 insert into club_selection_private.social_settings(club_id,design,updated_by) values(c,data,me)
 on conflict(club_id) do update set design=excluded.design,revision=club_selection_private.social_settings.revision+1,updated_at=now(),updated_by=me;
 result:=jsonb_build_object('saved',true);
 elsif p_action='feature' then
 result:=club_selection_private.social_set_feature(c,p_data,me);
 elsif p_action='add_asset' then
 k:=p_data->>'kind';photo:=nullif(p_data->>'roster_id','')::uuid;v:=p_data->>'path';
 if k is null or k not in ('photo','reference_extra') or (k='photo')<>(photo is not null) or length(coalesce(p_data->>'label',''))>120 then raise exception 'Choose the person in the photo or a design reference';end if;
 if photo is not null and not exists(select 1 from club_selection_private.roster where club_id=c and id=photo) then raise exception 'Choose a player from this club';end if;
 if k='photo' and (select count(*) from club_selection_private.social_assets where club_id=c and roster_id=photo)>=12 then raise exception 'Keep up to 12 photos per player. Remove an unused photo first';end if;
 if k='reference_extra' and (select count(*) from club_selection_private.social_assets where club_id=c and kind in ('reference','reference_extra'))>=4 then raise exception 'Keep up to four design examples';end if;
 if not club_selection_private.social_storage_allowed(v) or split_part(v,'/',1)<>c::text or split_part(v,'/',2)<>k
 or not exists(select 1 from storage.objects where bucket_id='club-socials' and name=v) then raise exception 'Upload an image for this club first';end if;
 insert into club_selection_private.social_assets(club_id,kind,roster_id,path,label,updated_by) values(c,k,photo,v,btrim(coalesce(p_data->>'label','')),me) returning id into asset_id;
 if p_data ? 'feature' then
  if k<>'photo' then raise exception 'Only a player photo can feature in a team';end if;
  perform club_selection_private.social_set_feature(c,(p_data->'feature')||jsonb_build_object('mode','player','roster_id',photo,'asset_id',asset_id),me);
 end if;
 result:=jsonb_build_object('saved',true,'id',asset_id);
 elsif p_action='remove_gallery_asset' then
 select * into asset from club_selection_private.social_assets where club_id=c and id=nullif(p_data->>'asset_id','')::uuid and kind in ('photo','reference_extra');
 if not found or asset.revision is distinct from (p_data->>'revision')::int then raise exception 'This image changed. Refresh before removing it';end if;
 delete from club_selection_private.social_assets where id=asset.id;
 result:=jsonb_build_object('saved',true,'old_path',asset.path);
 elsif p_action='style_request' then
 if not club_selection_private.social_artwork_ai_enabled(c) then raise exception 'AI artwork assistance is paused or its allowance is used. Saved artwork and manual design controls remain available';end if;
 if jsonb_typeof(p_data->'reference_ids') is distinct from 'array' or jsonb_array_length(p_data->'reference_ids')>4
 or length(coalesce(p_data->>'brief',''))>1500 then raise exception 'Use up to four examples and a short design brief';end if;
 if (select count(*) from club_selection_private.requests where club_id=c and action='socials:style_request' and created_at>now()-interval '1 hour')>=5
 or (select count(*) from club_selection_private.requests where club_id=c and action='socials:style_request' and created_at>now()-interval '1 day')>=30 then raise exception 'The club has used its style suggestions for now. Try again later or adjust the design controls';end if;
 for x in select * from jsonb_array_elements(p_data->'reference_ids') loop
  if not exists(select 1 from club_selection_private.social_assets where club_id=c and id=(x#>>'{}')::uuid and kind in ('reference','reference_extra')) then raise exception 'Choose a design reference from this club';end if;
 end loop;
 result:=jsonb_build_object('brand',(select jsonb_build_object('name',name,'primary',primary_colour,'accent',accent_colour) from public.clubs where id=c),
 'references',coalesce((select jsonb_agg(jsonb_build_object('id',id,'path',path)) from club_selection_private.social_assets where club_id=c and kind in ('reference','reference_extra') and p_data->'reference_ids' @> to_jsonb(id)::jsonb),'[]'));
 elsif p_action='manager' then
 perform pg_advisory_xact_lock(hashtextextended(c::text,14300));
 if not adm then raise exception 'Only Club Admin can assign socials managers';end if;
 uid:=(p_data->>'user_id')::uuid;
 if not club_selection_private.member(c,uid) then raise exception 'Choose a current club member';end if;
 if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Choose whether access is enabled';end if;
 if (p_data->>'enabled')::boolean then insert into club_selection_private.social_managers values(c,uid) on conflict do nothing;
 if found then
  with new_message as (insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
   values(c,null,gen_random_uuid(),'You are a Socials Manager',
    'Open Teams → Social graphics → Social accounts to connect the club Facebook and Instagram accounts. Then review the team images and blurb and choose Post now or Schedule post. If you are away, use Social accounts to arrange temporary cover.',
    'teams',true,'socials-manager:'||gen_random_uuid()::text) returning id)
  insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy) select id,uid,false from new_message;
 end if;
 else delete from club_selection_private.social_managers where club_id=c and user_id=uid;
 delete from club_selection_private.social_connect_states where club_id=c and not club_selection_private.social_preparer_allowed(c,user_id);
 end if;
 result:=jsonb_build_object('saved',true);
 elsif p_action in ('save_asset','remove_asset') then
 k:=p_data->>'kind';photo:=nullif(p_data->>'roster_id','')::uuid;
 if k is null or k not in ('portrait','sponsors','background','reference') or (k='portrait')<>(photo is not null) then raise exception 'Choose a valid artwork type';end if;
 if photo is not null and not exists(select 1 from club_selection_private.roster where id=photo and club_id=c) then raise exception 'Choose a player from this club';end if;
 select * into asset from club_selection_private.social_assets where club_id=c and kind=k and roster_id is not distinct from photo;
 if coalesce(asset.revision,0)<>coalesce((p_data->>'revision')::int,-1) or asset.id is distinct from nullif(p_data->>'asset_id','')::uuid then raise exception 'This image changed. Refresh before replacing it';end if;
 if p_action='remove_asset' then
 delete from club_selection_private.social_assets where id=asset.id;result:=jsonb_build_object('saved',true,'old_path',asset.path);
 else
 v:=p_data->>'path';
 if not club_selection_private.social_storage_allowed(v) or split_part(v,'/',1)<>c::text or split_part(v,'/',2)<>k
 or not exists(select 1 from storage.objects where bucket_id='club-socials' and name=v)
 then raise exception 'Upload an image for this club first';end if;
 if exists(select 1 from club_selection_private.social_assets where path=v and id is distinct from asset.id) then raise exception 'Image is already attached';end if;
 if asset.id is null then
 insert into club_selection_private.social_assets(club_id,kind,roster_id,path,updated_by) values(c,k,photo,v,me) returning id into asset_id;
 else
 update club_selection_private.social_assets set path=v,revision=revision+1,updated_at=now(),updated_by=me where id=asset.id returning id into asset_id;
 end if;
 result:=jsonb_build_object('saved',true,'id',asset_id,'old_path',case when asset.path<>v then asset.path end);
 end if;
 elsif p_action in ('validate_export','record_export') then
 if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or jsonb_array_length(p_data->'fixtures') not between 1 and 32 then raise exception 'Choose between 1 and 32 published fixtures';end if;
 for x in select * from jsonb_array_elements(p_data->'fixtures') loop
 fid:=(x->>'id')::uuid;
 if exists(select 1 from club_selection_private.fixtures f where f.id=fid and f.club_id=c and f.published is not null
  and club_selection_private.fixture_completed(f.published->'details',(select timezone from club_selection_private.access where club_id=c),clock_timestamp())) then
  raise exception using errcode='P0159',message='Completed fixtures are read-only. Use Design sandbox to try artwork.';
 end if;
 if not exists(select 1 from club_selection_private.fixtures where id=fid and club_id=c and published is not null)
 or coalesce(x->>'artwork_key','') is distinct from club_selection_private.social_artwork_key(fid)
 or not club_selection_private.social_features_valid(fid) then raise exception 'A published team, featured player or its artwork changed. Refresh the graphics before downloading';end if;
 end loop;
 if p_action='validate_export' then return jsonb_build_object('current',true);end if;
 for x in select * from jsonb_array_elements(p_data->'fixtures') loop
 insert into club_selection_private.social_exports(club_id,fixture_id,artwork_key,exported_by) values(c,(x->>'id')::uuid,x->>'artwork_key',me)
 on conflict(club_id,fixture_id) do update set artwork_key=excluded.artwork_key,exported_at=now(),exported_by=me;
 end loop;
 result:=jsonb_build_object('saved',true);
 else raise exception 'Unknown social artwork action';end if;
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,me,rid,'socials:'||p_action,p_data,result);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'socials:'||p_action,jsonb_build_object('request_id',rid));
 return result;
end$function$;
