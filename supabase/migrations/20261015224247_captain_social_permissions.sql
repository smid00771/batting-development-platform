-- Captain navigation and additive socials permissions. No existing appointments are changed.

-- Permanent appointments are additive; temporary cover cannot appoint permanent managers.
create table club_selection_private.social_manager_handovers (
 club_id uuid not null references public.clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid references auth.users(id) on delete set null,
 resolution text,
 primary key (club_id,user_id)
);
alter table club_selection_private.social_manager_handovers enable row level security;
revoke all on club_selection_private.social_manager_handovers from public,anon,authenticated;

create function club_selection_private.social_manager_change(c uuid, action text, data jsonb) returns jsonb
language plpgsql set search_path='' as $function$
declare me uuid:=auth.uid();uid uuid;adm boolean;mid uuid;person text;pending_count int;others int;
 h club_selection_private.social_manager_handovers%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,14300));
 if not club_selection_private.social_permanent_allowed(c,me) then
  raise exception using errcode='P0192',message='Permanent Socials Manager or Club Admin access required';
 end if;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 uid:=nullif(data->>'user_id','')::uuid;
 if uid is null or not club_selection_private.member(c,uid) then raise exception using errcode='P0192',message='Choose a current club member';end if;
 select coalesce(display_name,'Socials Manager') into person from public.user_profiles where user_id=uid;
 select * into h from club_selection_private.social_manager_handovers where club_id=c and user_id=uid;
 if action='manager_handover' then
  if data->>'operation'='request' then
   if uid<>me or not exists(select 1 from club_selection_private.social_managers where club_id=c and user_id=me) then
    raise exception using errcode='P0192',message='Only an appointed manager can request their own handover';
   end if;
   if h.requested_at is null or h.resolved_at is not null then
    insert into club_selection_private.social_manager_handovers(club_id,user_id) values(c,uid)
     on conflict(club_id,user_id) do update set requested_at=now(),resolved_at=null,resolved_by=null,resolution=null;
    insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
     values(c,null,gen_random_uuid(),'Socials handover needs attention',coalesce(person,'A Socials Manager')||' has asked to hand over socials. They remain appointed until a replacement is assigned or Club Admin takes responsibility. Open Teams → Social Graphics → Who handles socials to complete the handover.','teams',true,'socials-handover:'||gen_random_uuid()::text) returning id into mid;
    insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy)
     select mid,m.user_id,false from public.club_memberships m where m.club_id=c and m.user_id<>me and club_selection_private.social_permanent_allowed(c,m.user_id);
   end if;
   return jsonb_build_object('saved',true,'message','Handover requested. Club Admin has been notified. You remain a Socials Manager until the handover is completed.');
  elsif data->>'operation'='cancel' then
   if uid<>me then raise exception using errcode='P0192',message='Only the requesting manager can cancel this request';end if;
   update club_selection_private.social_manager_handovers set resolved_at=now(),resolved_by=me,resolution='cancelled' where club_id=c and user_id=uid and resolved_at is null;
   return jsonb_build_object('saved',true,'message','Handover request cancelled. You remain a Socials Manager.');
  else raise exception using errcode='P0192',message='Choose Request handover or Cancel request';end if;
 end if;
 if jsonb_typeof(data->'enabled') is distinct from 'boolean' then raise exception using errcode='P0192',message='Choose whether access is enabled';end if;
 if exists(select 1 from public.club_memberships where club_id=c and user_id=uid and permission_role='admin') then
  raise exception using errcode='P0192',message='Club Admin retains socials access through their admin role';
 end if;
 if (data->>'enabled')::boolean then
  insert into club_selection_private.social_managers(club_id,user_id) values(c,uid) on conflict do nothing;
  if found then
   insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
    values(c,null,gen_random_uuid(),'You are a Socials Manager','Open Teams → Social Graphics. Use Social accounts to connect the club Facebook Page and Instagram account, and review posts before publishing. Who handles socials lets you appoint other managers and arrange a handover.','teams',true,'socials-manager:'||gen_random_uuid()::text) returning id into mid;
   insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy) values(mid,uid,false);
  end if;
 else
  if not exists(select 1 from club_selection_private.social_managers where club_id=c and user_id=uid) then return jsonb_build_object('saved',true);end if;
  select count(*) into others from club_selection_private.social_managers z join public.club_memberships m on m.club_id=z.club_id and m.user_id=z.user_id
   where z.club_id=c and z.user_id<>uid and m.permission_role<>'admin';
  if others=0 and not (adm and coalesce((data->>'take_responsibility')::boolean,false) and h.requested_at is not null and h.resolved_at is null) then
   raise exception using errcode='P0192',message='The last Socials Manager must request a handover. Add a replacement, or ask Club Admin to explicitly take responsibility.';
  end if;
  select count(*) into pending_count from jsonb_array_elements(club_selection_private.social_cover_posts(c,uid)) p where (p->>'blocks_hand_back')::boolean;
  if pending_count>0 then raise exception using errcode='P0192',message='Review the scheduled posts before removing this manager. Another manager must take responsibility, or the schedules must be cancelled.';end if;
  delete from club_selection_private.social_managers where club_id=c and user_id=uid;
  update club_selection_private.social_manager_handovers set resolved_at=now(),resolved_by=me,
   resolution=case when others=0 then 'admin_takeover' else 'replacement_assigned' end where club_id=c and user_id=uid and resolved_at is null;
  delete from club_selection_private.social_connect_states where club_id=c and not club_selection_private.social_preparer_allowed(c,user_id);
 end if;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'socials:manager_change',data-'request_id');
 return jsonb_build_object('saved',true,'access_removed',not club_selection_private.social_allowed(c),
  'message',case when (data->>'enabled')::boolean then 'Socials Manager added.' when others=0 then 'Handover completed. Club Admin now handles socials.' else 'Socials Manager removed. Your other club roles are unchanged.' end);
end $function$;
revoke all on function club_selection_private.social_manager_change(uuid,text,jsonb) from public,anon,authenticated;

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
 if p_action='access' then return jsonb_build_object('allowed',allowed,'admin',adm,'handover_count',case when allowed then (select count(*) from club_selection_private.social_manager_handovers where club_id=c and resolved_at is null) else 0 end);end if;
 -- A removed manager can recover the receipt for their own completed change.
 if not allowed and p_action in ('manager','manager_handover') and p_data ? 'request_id' then
  select * into req from club_selection_private.requests where club_id=c and user_id=me and request_id=(p_data->>'request_id')::uuid;
  if found and req.action='socials:'||p_action and req.payload=p_data then return req.result;end if;
 end if;
 if not allowed then raise exception 'Club Admin or socials manager access required';end if;
 if p_action not in ('context','validate_export','history') then
 perform pg_advisory_xact_lock(hashtextextended(c::text,13500));
 rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into req from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if req.action<>'socials:'||p_action or req.payload<>p_data then raise exception 'Request ID already used';end if;return req.result;end if;
 end if;
 select * into cfg from club_selection_private.social_settings where club_id=c;
 if p_action='context' then
 return jsonb_build_object('admin',adm,'can_manage_managers',club_selection_private.social_permanent_allowed(c,me),
 'manager_handovers',coalesce((select jsonb_agg(jsonb_build_object('user_id',h.user_id,'name',coalesce(p.display_name,'Socials Manager'),'requested_at',h.requested_at) order by h.requested_at) from club_selection_private.social_manager_handovers h join public.club_memberships m on m.club_id=h.club_id and m.user_id=h.user_id left join public.user_profiles p on p.user_id=h.user_id where h.club_id=c and h.resolved_at is null),'[]'),
 'manager_posts',coalesce((select jsonb_object_agg(z.user_id,club_selection_private.social_cover_posts(c,z.user_id)) from club_selection_private.social_managers z where z.club_id=c),'{}'),
 'revision',coalesce(cfg.revision,0),'design',coalesce(cfg.design,'{}'),
 'style_suggestions_available',club_selection_private.social_artwork_ai_enabled(c),'artwork_ai_paused',not club_selection_private.social_artwork_ai_enabled(c),'grade_defaults',coalesce((select fixture_defaults->'rows' from club_selection_private.access where club_id=c),'[]'),'brand',(select jsonb_build_object('name',name,'logo',logo_data_url,'primary',primary_colour,'accent',accent_colour) from public.clubs where id=c),
 'assets',coalesce((select jsonb_agg(to_jsonb(a)-'updated_by' order by kind,id) from club_selection_private.social_assets a where club_id=c),'[]'),
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name,id) from club_selection_private.roster where club_id=c),'[]'),
 'members',case when club_selection_private.social_permanent_allowed(c,me) then coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.display_name,'Club member'),'manager',exists(select 1 from club_selection_private.social_managers z where z.club_id=c and z.user_id=m.user_id),'admin',m.permission_role='admin') order by p.display_name,m.user_id) from public.club_memberships m left join public.user_profiles p on p.user_id=m.user_id where m.club_id=c),'[]') else '[]'::jsonb end,
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
 elsif p_action='history' then
 if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or jsonb_array_length(p_data->'fixtures') not between 1 and 32 then raise exception 'Choose between 1 and 32 fixtures';end if;
 for x in select * from jsonb_array_elements(p_data->'fixtures') loop
  if not exists(select 1 from club_selection_private.fixtures where club_id=c and id=(x->>'id')::uuid and published is not null) then raise exception 'Choose published fixtures from this club';end if;
 end loop;
 return jsonb_build_object('posts',coalesce((
  select jsonb_agg(jsonb_build_object('id',p.id,'state',p.state,'caption',p.caption,'created_at',p.created_at,
   'posted',exists(select 1 from club_selection_private.social_post_destinations d where d.post_id=p.id and d.state='published'),
   'images',(select jsonb_agg(i order by ord) from jsonb_array_elements(p.images) with ordinality a(i,ord)
    where exists(select 1 from jsonb_array_elements(p_data->'fixtures') requested where requested->>'id'=i->>'fixture_id')))
   order by p.created_at desc,p.id)
  from (select p.* from club_selection_private.social_posts p where p.club_id=c and exists(
   select 1 from jsonb_array_elements(p.images) i join jsonb_array_elements(p_data->'fixtures') requested on requested->>'id'=i->>'fixture_id')
   order by p.created_at desc,p.id limit 100) p),'[]'::jsonb));
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
 elsif p_action in ('manager','manager_handover') then
 result:=club_selection_private.social_manager_change(c,p_action,p_data);
 elsif p_action in ('save_asset','remove_asset') then
 k:=p_data->>'kind';photo:=nullif(p_data->>'roster_id','')::uuid;
 if k is null or k not in ('portrait','sponsors','background','reference','logo') or (k='portrait')<>(photo is not null) then raise exception 'Choose a valid artwork type';end if;
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
  raise exception using errcode='P0159',message='Completed fixtures are read-only. Preview designs in Team-list artwork.';
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

CREATE OR REPLACE FUNCTION club_selection_private.api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();c uuid:=p_club_id;adm boolean;sel boolean;cap boolean;acc club_selection_private.access%rowtype;
 rr club_selection_private.requests%rowtype;rid uuid;res jsonb;row jsonb;x jsonb;s jsonb;v text;pid uuid;uid uuid;fid uuid;
 r club_selection_private.roster%rowtype;a club_selection_private.availability%rowtype;m club_selection_private.fixtures%rowtype;
 ids uuid[];old jsonb;notes jsonb;body text;changed int:=0;expected int;posted uuid;data_limit int;publication_changes jsonb:='[]'::jsonb;
begin
 if length(p_data::text)>1000000 then raise exception 'Request too large';end if;
 if me is null then raise exception 'Sign in to use Selections';end if;
 if p_action in ('access','set_access') then
  if not club_selection_private.member(c,me) and not public.has_platform_role(array['owner','commercial_admin','support_admin']) then raise exception 'Club access required';end if;
 else
  if not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 end if;
 if p_action not in ('access','context','posts','history','review_posts') then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 if p_action not in ('access','set_access') and not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 select * into acc from club_selection_private.access where club_id=c;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 sel:=club_selection_private.selector(c,me);cap:=club_selection_private.captain(c,me);
 if p_action not in ('access','set_access') and not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if p_action in ('save_board','publish','send_review','history') and not sel then raise exception 'Selector access required';end if;
 if p_action='publish' and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
 if p_action in ('save_fixture','import_roster','save_roster','availability_batch','fixture_lock') and not (adm or sel) then raise exception 'Club Admin or selector access required';end if;
 if p_action in ('selectors','group_links','fixture_defaults') and not adm then raise exception 'Club Admin permission required';end if;
 if p_action not in ('access','context','posts','history','review_posts') then
  rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
  select * into rr from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
  if found then if rr.action<>p_action or rr.payload<>p_data then raise exception 'This request ID was already used for a different change';end if;return rr.result;end if;
 end if;
 -- Check stored fixtures before any selection change, including old browser versions.
 -- Club advisory lock above and ordered row locks serialize unlock/save races.
 if p_action in ('save_board','save_fixture','publish','send_review') then
  if p_action='save_board' then
   ids:=array(select nullif(value->>'id','')::uuid from jsonb_array_elements(coalesce(p_data->'fixtures','[]')));
  elsif p_action='save_fixture' then ids:=array[nullif(p_data->>'id','')::uuid];
  else ids:=array(select jsonb_array_elements_text(coalesce(p_data->'ids','[]'))::uuid);
  end if;
  for m in select f.* from club_selection_private.fixtures f where f.club_id=c and f.id=any(ids) order by f.id for update loop
   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);
   if m.published is not null and not coalesce(m.selection_unlocked_until>now(),false) then
    raise exception 'Published team is locked. The Head of Selections must unlock it before changes';
   end if;
  end loop;
 end if;
 -- Existing members are matched automatically when their Selections access/context loads.
 if p_action in ('access','context') and club_selection_private.member(c,me) and club_selection_private.enabled(c) then
  perform club_selection_private.sync_players(c,case when adm or sel then null else me end);
  if p_action='context' and (adm or sel) then perform club_selection_private.sync_republication_alerts(c);end if;
  select * into acc from club_selection_private.access where club_id=c;
 end if;
 if p_action='access' then return jsonb_build_object('enabled',club_selection_private.enabled(c),'mode',coalesce(acc.mode,'bundle'),'status',coalesce(acc.status,'disabled'),'valid_until',acc.valid_until,'timezone',coalesce(acc.timezone,'Australia/Sydney'),'revision',coalesce(acc.revision,0),'selector',sel,'admin',adm);end if;
 if p_action='set_access' then
  if not public.has_platform_role(array['owner','commercial_admin']) then raise exception 'Platform commercial permission required';end if;
  if coalesce(acc.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Access changed. Reload before saving';end if;
  if not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Active club required';end if;
  if not exists(select 1 from pg_timezone_names where name=coalesce(p_data->>'timezone','Australia/Sydney')) then raise exception 'Choose a valid time zone';end if;
  insert into club_selection_private.access(club_id,mode,status,valid_until,timezone,updated_by) values(c,p_data->>'mode',p_data->>'status',nullif(p_data->>'valid_until','')::date,coalesce(p_data->>'timezone','Australia/Sydney'),me)
  on conflict(club_id) do update set mode=excluded.mode,status=excluded.status,valid_until=excluded.valid_until,timezone=excluded.timezone,revision=club_selection_private.access.revision+1,updated_by=me,updated_at=now();
  res:=jsonb_build_object('saved',true);
 else
 if not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if p_action='context' then
  return jsonb_build_object('access',to_jsonb(acc),'selector',sel,'admin',adm,'captain',cap,'roster_revision',acc.roster_revision,'availability_mode','opt_in','can_view_club_availability',adm or sel or cap,'head_selector',sel and club_selection_private.publication_head(c)=me,
  'availability_dates',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('date',ds.match_date,'bulk_saved_at',ds.bulk_saved_at,'updated_at',ds.updated_at) order by ds.match_date desc) from club_selection_private.availability_date_setups ds where ds.club_id=c),'[]') else '[]'::jsonb end,
  'publication_head_id',club_selection_private.publication_head(c),
  'conversations',club_selection_private.conversation_context(c,me),
  'can_delegate',adm or acc.head_selector_id=me,
  'can_hand_back',adm or acc.head_selector_id=me or acc.publication_delegate_id=me,
  'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'snapshot',f.review,'sent_at',f.review_requested_at,
   'draft_changed',not club_selection_private.review_current(f.id),
   'captain_name',club_selection_private.match_captain_names(c,f.details)) order by f.review->'details'->'days'->0->>'date',f.review->'details'->>'grade')
   from club_selection_private.fixtures f where f.club_id=c and club_selection_private.review_audience(f.id,me)),'[]'::jsonb),
  'group_links',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(to_jsonb(g)) from club_selection_private.group_links g where club_id=c),'[]') else '[]'::jsonb end,
  'groups',case when (adm or sel) then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'captain_user_ids',club_selection_private.season_captains(c,g.id),'captain_roster_ids',club_selection_private.season_captain_roster_ids(c,g.id),'captain_name',club_selection_private.season_captain_name(c,g.id))) from public.playing_groups g where club_id=c and active),'[]') else '[]'::jsonb end,
  'batting_users',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(p.user_id) from public.players p where club_id=c and active),'[]') else '[]'::jsonb end,
  'roster',coalesce((select jsonb_agg((case when adm or sel then to_jsonb(p) when p.user_id=me then to_jsonb(p)-'account_email'-'auto_link_disabled' else jsonb_build_object('id',p.id,'name',p.name,'grade',p.grade,'active',p.active,'user_id',null) end)||jsonb_build_object('availability',coalesce(to_jsonb(av)-'checked_by',jsonb_build_object('revision',0,'usual_available',false,'blocks','[]'::jsonb,'available_dates','[]'::jsonb)))) from club_selection_private.roster p left join club_selection_private.availability av on av.roster_id=p.id where p.club_id=c and (adm or sel or cap or p.user_id=me)),'[]'::jsonb),
  'members',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'name',coalesce(up.display_name,'Club member'),'email',u.email,'selector',club_selection_private.selector(c,cm.user_id),'is_admin',cm.permission_role='admin','explicit_selector',exists(select 1 from club_selection_private.selectors sx where sx.club_id=c and sx.user_id=cm.user_id))) from public.club_memberships cm left join public.user_profiles up on up.user_id=cm.user_id left join auth.users u on u.id=cm.user_id where cm.club_id=c),'[]') else '[]'::jsonb end,
  'fixtures',coalesce((select jsonb_agg(case when sel then to_jsonb(f)||jsonb_build_object('issues',club_selection_private.issues(f.id),'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp())) else jsonb_build_object('id',f.id,'published',f.published,'publication',f.publication,'published_at',f.published_at,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp()))||case when adm then jsonb_build_object('details',f.details,'revision',f.revision,'selection_unlocked_until',f.selection_unlocked_until) else '{}'::jsonb end end order by f.details->'days'->0->>'date',f.details->>'grade') from club_selection_private.fixtures f where f.club_id=c and (adm or sel or f.published is not null)),'[]'::jsonb));
 elsif p_action in ('posts','post','history') then
  fid:=(p_data->>'id')::uuid;select * into m from club_selection_private.fixtures where id=fid and club_id=c;
  if not found or not club_selection_private.audience(fid,me) then raise exception 'This match conversation is only for its current team and staff';end if;
  if p_action='history' then
   if not sel then raise exception 'Selector access required';end if;
   return coalesce((select jsonb_agg(to_jsonb(p) order by version desc) from club_selection_private.publications p where fixture_id=fid),'[]');
  end if;
  if p_action='posts' then return coalesce((select jsonb_agg(to_jsonb(p) order by created_at) from club_selection_private.posts p where fixture_id=fid),'[]');end if;
  if club_selection_private.fixture_completed(m.published->'details',acc.timezone,clock_timestamp()) then
   raise exception 'This match conversation is closed. The final playing day has ended.';
  end if;
  insert into club_selection_private.posts(fixture_id,author_id,author_name,body) values(fid,me,coalesce((select display_name from public.user_profiles where user_id=me),'Club member'),btrim(p_data->>'body')) returning id into posted;
  changed:=club_selection_private.notify(fid,'post');res:=jsonb_build_object('id',posted,'recipients',changed);
 elsif p_action in ('review_posts','review_post') then
  fid:=(p_data->>'id')::uuid;select * into m from club_selection_private.fixtures where id=fid and club_id=c;
  if not found or not club_selection_private.review_audience(fid,me) then raise exception 'Captain checks are private to assigned captains and selectors';end if;
  if p_action='review_posts' then return coalesce((select jsonb_agg(to_jsonb(p) order by created_at,id) from club_selection_private.review_posts p where fixture_id=fid),'[]');end if;
  if (m.review->>'draft_revision')::int<>coalesce((p_data->>'review_revision')::int,-1) then raise exception 'A newer draft was shared. Refresh before commenting';end if;
   insert into club_selection_private.review_posts(fixture_id,author_id,author_name,body,review_revision)
   values(fid,me,coalesce((select display_name from public.user_profiles where user_id=me),'Club member'),btrim(p_data->>'body'),(m.review->>'draft_revision')::int) returning id into posted;
  changed:=club_selection_private.notify_review(fid,false);res:=jsonb_build_object('saved',true,'id',posted,'recipients',changed);
 elsif p_action='publication_delegate' then
  if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Selection responsibilities changed. Refresh before saving';end if;
  if p_data->>'operation'='hand_back' then
   if not coalesce(adm or acc.head_selector_id=me or acc.publication_delegate_id=me,false) then raise exception 'Only the Head of Selections, their delegate or Club Admin can hand back';end if;
   update club_selection_private.access set publication_delegate_id=null,publication_delegate_from=null,publication_delegate_until=null,
    revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  elsif p_data->>'operation'='delegate' then
   if not coalesce(adm or acc.head_selector_id=me,false) then raise exception 'Only the Head of Selections or Club Admin can delegate publishing';end if;
   if acc.head_selector_id is null or not club_selection_private.member(c,acc.head_selector_id) then raise exception 'Assign a Head of Selections first';end if;
   uid:=nullif(p_data->>'user_id','')::uuid;
   if uid is null or uid=acc.head_selector_id or not club_selection_private.selector(c,uid) then raise exception 'Choose another assigned selector from this club';end if;
   if coalesce(p_data->>'from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_data->>'until','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_data->>'from')::date::text<>p_data->>'from' or (p_data->>'until')::date::text<>p_data->>'until'
    or (p_data->>'until')::date<(p_data->>'from')::date
    or (p_data->>'until')::date<(now() at time zone acc.timezone)::date then raise exception 'Choose a valid delegation period ending today or later';end if;
   update club_selection_private.access set publication_delegate_id=uid,publication_delegate_from=(p_data->>'from')::date,publication_delegate_until=(p_data->>'until')::date,
    revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  else raise exception 'Choose Delegate or Hand back';end if;
  res:=jsonb_build_object('saved',true,'operation',p_data->>'operation');
 elsif p_action='conversation' then
  fid:=nullif(p_data->>'fixture_id','')::uuid;pid:=nullif(p_data->>'roster_id','')::uuid;
  select item into x from jsonb_array_elements(club_selection_private.conversation_context(c,me)) item
   where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  if x is null then raise exception 'This selection conversation is no longer available to you';end if;
  if (x->>'revision')::integer<>coalesce((p_data->>'revision')::integer,-1) then raise exception 'Conversation status changed. Refresh before updating';end if;
  if jsonb_typeof(p_data->'spoken') is distinct from 'boolean' then raise exception 'Choose whether the player has been spoken to';end if;
  insert into club_selection_private.player_conversations(fixture_id,roster_id,movement_key,spoken_at,spoken_by)
   values(fid,pid,x->>'movement_key',case when (p_data->>'spoken')::boolean then now() end,case when (p_data->>'spoken')::boolean then me end)
   on conflict(fixture_id,roster_id,movement_key) do update set spoken_at=excluded.spoken_at,spoken_by=excluded.spoken_by,revision=club_selection_private.player_conversations.revision+1;
  res:=jsonb_build_object('saved',true,'spoken',(p_data->>'spoken')::boolean);
 elsif p_action='grade_levels' then
  if not adm then raise exception 'Club Admin permission required';end if;
  if acc.revision<>coalesce((p_data->>'revision')::integer,-1) then raise exception 'Settings changed. Refresh before saving';end if;
  if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>100 then raise exception 'Save up to 100 grade levels';end if;
  for x in select * from jsonb_array_elements(p_data->'rows') loop
   if length(btrim(coalesce(x->>'competition',''))) not between 1 and 120 or length(btrim(coalesce(x->>'grade',''))) not between 1 and 120
    or coalesce(x->>'level','')!~'^[1-9][0-9]?$' then raise exception 'Use a competition, grade and level from 1 to 99';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_data->'rows') x group by lower(btrim(x->>'competition')),lower(btrim(x->>'grade')) having count(*)>1) then raise exception 'Use one level per grade and competition';end if;
  update club_selection_private.access set grade_levels=p_data->'rows',revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  res:=jsonb_build_object('saved',true);
 elsif p_action='fixture_lock' then
  fid:=nullif(p_data->>'id','')::uuid;
  select * into m from club_selection_private.fixtures where club_id=c and id=fid for update;
  if not found then raise exception 'Unknown fixture';end if;
  if m.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture changed. Reload before changing its lock';end if;
  if jsonb_typeof(p_data->'unlock') is distinct from 'boolean' then raise exception 'Choose whether to unlock or lock the fixture';end if;
  if m.published is not null and me is distinct from acc.head_selector_id and me is distinct from club_selection_private.publication_head(c) then
   raise exception 'Only the current Head of Selections or Acting Head can unlock a published team';end if;
  if (p_data->>'unlock')::boolean and m.published is null and not club_selection_private.fixture_completed(m.details,acc.timezone) then raise exception 'This fixture is still open';end if;
  update club_selection_private.fixtures
   set selection_unlocked_until=case when (p_data->>'unlock')::boolean then now()+interval '30 minutes' end,
       selection_unlocked_by=case when (p_data->>'unlock')::boolean then me end,
       revision=revision+1,updated_at=now(),updated_by=me
   where club_id=c and id=fid returning * into m;
  res:=jsonb_build_object('saved',true,'id',fid,'revision',m.revision,'selection_unlocked_until',m.selection_unlocked_until);
 elsif p_action='availability' then
  pid:=(p_data->>'id')::uuid;select * into r from club_selection_private.roster where id=pid and club_id=c and active;
  if not found or not (adm or sel or r.user_id=me) then raise exception 'Edit only your own availability';end if;
  select * into a from club_selection_private.availability where roster_id=pid;
  if coalesce(a.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Availability changed. Reload before saving';end if;
  if p_data->>'calendar_mode' is distinct from 'opt_in' then raise exception 'Reload the updated app to mark available dates';end if;
  if coalesce((p_data->>'usual_available')::boolean,false) or coalesce(p_data->'blocks','[]'::jsonb)<>'[]'::jsonb then raise exception 'Mark individual available dates; automatic availability and blackouts are no longer used';end if;
  if jsonb_typeof(p_data->'available_dates') is distinct from 'array' or jsonb_array_length(p_data->'available_dates')>1500 then raise exception 'Invalid availability calendar';end if;
  for x in select * from jsonb_array_elements(p_data->'available_dates') loop
   v:=x#>>'{}';
   if jsonb_typeof(x)<>'string' or coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Invalid available date';end if;
  end loop;
  select coalesce(jsonb_agg(value order by value),'[]') into notes from (select distinct value from jsonb_array_elements_text(p_data->'available_dates')) dates;
  -- Remember deliberately removed dates, independently of dates not yet answered.
  select coalesce(jsonb_agg(d order by d),'[]') into old from (
   select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where not notes ? value
   union select value from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where not notes ? value
  ) dates;
  insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(pid,false,'[]',notes,old,me)
  on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
  update club_selection_private.availability_date_setups ds set updated_at=now()
   where ds.club_id=c and (coalesce(a.available_dates,'[]') ? ds.match_date::text) is distinct from (notes ? ds.match_date::text);
  -- One private selector alert per affected future fixture, including published lists.
  for fid in select unnest(club_selection_private.availability_affected(c,pid,a.available_dates,notes)) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'alert_recipients',changed);
 elsif p_action='availability_batch' then
  if not (adm or sel) then raise exception 'Selector access required';end if;
  if not coalesce((p_data->>'make_all_available')::boolean,false) then raise exception 'Confirm Make all players available for this date';end if;
  v:=p_data->>'date';
  if coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Choose a valid date';end if;
  if acc.roster_revision<>coalesce((p_data->>'roster_revision')::int,-1) then raise exception 'Playing list changed. Reload before setting this date';end if;
  if jsonb_typeof(p_data->'unavailable_ids') is distinct from 'array' or jsonb_typeof(p_data->'revisions') is distinct from 'object' then raise exception 'Review the playing list before setting this date';end if;
  if jsonb_typeof(coalesce(p_data->'available_ids','[]')) is distinct from 'array' then raise exception 'Review the players being marked available';end if;
  if p_data ? 'reset_unavailable' and jsonb_typeof(p_data->'reset_unavailable') is distinct from 'boolean' then raise exception 'Choose whether to clear saved unavailability';end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'available_ids','[]')) p where p_data->'unavailable_ids' ? p.value) then raise exception 'A player cannot be both available and unavailable';end if;
  for uid in select jsonb_array_elements_text((p_data->'unavailable_ids')||coalesce(p_data->'available_ids','[]'))::uuid loop
   if uid is null or not exists(select 1 from club_selection_private.roster where id=uid and club_id=c and active) then raise exception 'Choose unavailable players from this club playing list';end if;
  end loop;
  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active order by id loop
   select * into a from club_selection_private.availability where roster_id=r.id;
   if coalesce(a.revision,0)<>coalesce((p_data->'revisions'->>r.id::text)::int,-1) then raise exception 'A player updated their calendar. Reload before setting this date';end if;
   select coalesce(jsonb_agg(d order by d),'[]') into old from (
    select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where value<>v
    union select v where (p_data->'unavailable_ids') ? r.id::text
     or (coalesce(a.unavailable_dates,'[]') ? v and not coalesce((p_data->>'reset_unavailable')::boolean,false)
         and not coalesce(p_data->'available_ids','[]') ? r.id::text)
   ) dates;
   select coalesce(jsonb_agg(d order by d),'[]') into notes from (
    select distinct value as d from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where value<>v
    union select v where not old ? v
   ) dates;
   ids:=ids||club_selection_private.availability_affected(c,r.id,a.available_dates,notes);
   insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(r.id,false,'[]',notes,old,me)
   on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
   data_limit:=data_limit+1;
  end loop;
  if data_limit=0 then raise exception 'Add players before setting availability';end if;
  insert into club_selection_private.availability_date_setups(club_id,match_date,bulk_saved_at,updated_at) values(c,v::date,now(),now())
  on conflict(club_id,match_date) do update set bulk_saved_at=excluded.bulk_saved_at,updated_at=excluded.updated_at;
  for fid in select distinct unnest(ids) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'date',v,'players',data_limit,'saved_at',now(),'alert_recipients',changed);
 elsif p_action in ('import_roster','save_roster','save_board','publish','selectors','group_links','fixture_defaults','send_review','save_fixture') then
  if not (adm or sel) then raise exception 'Selector access required';end if;
  if p_action='fixture_defaults' then
   if not adm then raise exception 'Club Admin permission required';end if;
   if (acc.fixture_defaults->>'revision')::int<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture defaults changed. Reload before saving';end if;
   if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>100 then raise exception 'Save up to 100 grade and format defaults';end if;
   notes:='[]';
   for x in select * from jsonb_array_elements(p_data->'rows') loop
    if length(btrim(coalesce(x->>'grade',''))) not between 1 and 120 or coalesce(x->>'format','') not in ('t20','limited_overs','long_form') then raise exception 'Choose a grade and format for each default';end if;
    if x->>'overs' is not null and (x->>'overs' !~ '^[0-9]{1,3}$' or (x->>'overs')::int not between 1 and 999) then raise exception 'Overs must be a whole number between 1 and 999';end if;
    uid:=nullif(x->>'grade_group_id','')::uuid;
    if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
    v:=case when uid is null then btrim(x->>'grade') else (select name from public.playing_groups where id=uid) end;
    if exists(select 1 from jsonb_array_elements(notes) n where lower(n->>'grade')=lower(v) and n->>'format'=x->>'format') then raise exception 'Use one default per grade and format';end if;
    notes:=notes||jsonb_build_array(jsonb_build_object('grade',v,'grade_group_id',uid,'format',x->>'format','overs',nullif(x->>'overs','')::int));
   end loop;
   update club_selection_private.access set fixture_defaults=jsonb_build_object('revision',(acc.fixture_defaults->>'revision')::int+1,'rows',notes),updated_by=me,updated_at=now() where club_id=c;
   perform club_selection_private.sync_default_fixture_overs(c,acc.fixture_defaults->'rows',notes,me);
   res:=jsonb_build_object('saved',true);
  elsif p_action='send_review' then
   ids:=array(select distinct jsonb_array_elements_text(p_data->'ids')::uuid);
   if coalesce(array_length(ids,1),0) not between 1 and 30 then raise exception 'Choose teams to send to captains';end if;
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;
    if not found then raise exception 'Unknown fixture';end if;
    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Reload before sending';end if;
    if cardinality(club_selection_private.match_captain_users(c,m.details)||club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,m.details)))=0 then raise exception 'The match captain needs a linked club account to receive a private check';end if;
    if club_selection_private.review_current(fid) then continue;end if;
    update club_selection_private.fixtures set review=club_selection_private.draft_snapshot(fid)||jsonb_build_object('draft_revision',m.revision),review_requested_at=now() where id=fid;
    changed:=changed+club_selection_private.notify_review(fid,true);
   end loop;
   res:=jsonb_build_object('sent',true,'recipients',changed);
  elsif p_action='group_links' then
   if not adm or acc.mode<>'bundle' then raise exception 'Club Admin and both products are required';end if;
   if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Settings changed. Reload before saving';end if;
   delete from club_selection_private.group_links where club_id=c;
   for x in select * from jsonb_array_elements(p_data->'links') loop
    if not exists(select 1 from public.playing_groups where id=(x->>'group_id')::uuid and club_id=c and active) then raise exception 'Choose an active Playing Group from this club';end if;
    if length(btrim(coalesce(x->>'grade','')))=0 then raise exception 'A grade is required';end if;
    insert into club_selection_private.group_links(club_id,competition,grade,group_id) values(c,coalesce(x->>'competition',''),btrim(x->>'grade'),(x->>'group_id')::uuid);
   end loop;
   update club_selection_private.access set revision=revision+1 where club_id=c;
   res:=jsonb_build_object('saved',true);
  elsif p_action='selectors' then
   if not adm then raise exception 'Club Admin permission required';end if;
   if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Settings changed. Reload before saving';end if;
   if p_data ? 'head_selector_id' then
    uid:=nullif(p_data->>'head_selector_id','')::uuid;
    if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose the Head of Selections from current club members';end if;
    update club_selection_private.access set head_selector_id=uid,
     publication_delegate_id=case when head_selector_id is distinct from uid then null else publication_delegate_id end,
     publication_delegate_from=case when head_selector_id is distinct from uid then null else publication_delegate_from end,
     publication_delegate_until=case when head_selector_id is distinct from uid then null else publication_delegate_until end where club_id=c;
   end if;
   delete from club_selection_private.selectors where club_id=c;
   for v in select jsonb_array_elements_text(p_data->'users') loop
    if not club_selection_private.member(c,v::uuid) then raise exception 'Choose current club members';end if;
    insert into club_selection_private.selectors values(c,v::uuid) on conflict do nothing;
   end loop;
   update club_selection_private.access set publication_delegate_id=null,publication_delegate_from=null,publication_delegate_until=null
    where club_id=c and publication_delegate_id is not null and not club_selection_private.selector(c,publication_delegate_id);
   update club_selection_private.access set revision=revision+1 where club_id=c;res:=jsonb_build_object('saved',true);
  elsif p_action in ('import_roster','save_roster') then
   if acc.roster_revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Playing list changed. Reload before saving';end if;
   if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows') not between 1 and 1000 then raise exception 'Choose 1 to 1000 playing-list rows';end if;
   ids:='{}';
   for row in select * from jsonb_array_elements(p_data->'rows') loop
    if p_action='import_roster' then
     pid:=club_selection_private.import_player(c,row);
    else
     pid:=coalesce(nullif(row->>'id','')::uuid,gen_random_uuid());uid:=nullif(row->>'user_id','')::uuid;
     select * into r from club_selection_private.roster where id=pid and club_id=c;
     -- Do not create or rename another entry to the same normalized player name.
     -- Existing legacy duplicates can still be edited/deactivated without a merge.
     if (r.id is null or club_selection_private.account_name_key(row->>'name')<>club_selection_private.account_name_key(r.name))
      and exists(select 1 from club_selection_private.roster other where other.club_id=c
       and other.id is distinct from r.id
       and club_selection_private.account_name_key(other.name)=club_selection_private.account_name_key(row->>'name')) then
      raise exception '% is already on the playing list. Edit the existing entry.',btrim(row->>'name');
     end if;
     if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Link only a verified club member';end if;
     if exists(select 1 from club_selection_private.roster where id=pid and club_id<>c) then raise exception 'Player belongs to another club';end if;
     insert into club_selection_private.roster(id,club_id,external_id,name,grade,batting,bowling,bowling_load,keeper,active,user_id)
     values(pid,c,nullif(btrim(row->>'external_id'),''),btrim(row->>'name'),coalesce(row->>'grade',''),coalesce(row->>'batting','unknown'),coalesce(row->>'bowling','unknown'),coalesce(row->>'bowling_load','unknown'),coalesce((row->>'keeper')::boolean,false),coalesce((row->>'active')::boolean,true),uid)
     on conflict(id) do update set external_id=excluded.external_id,name=excluded.name,grade=excluded.grade,batting=excluded.batting,bowling=excluded.bowling,bowling_load=excluded.bowling_load,keeper=excluded.keeper,active=excluded.active,user_id=excluded.user_id,updated_at=now();
     -- A deliberate unlink is never silently undone by automatic matching.
     update club_selection_private.roster set auto_link_disabled=case
      when r.user_id is not null and uid is null then true
      when uid is not null then false else auto_link_disabled end where id=pid;
    end if;
    if row ? 'account_email' then
     v:=nullif(lower(btrim(row->>'account_email')),'');
     -- Imports with missing email preserve previous account-matching details.
     if p_action='save_roster' or v is not null then
      update club_selection_private.roster set account_email=v where id=pid;
     end if;
    end if;
    if pid=any(ids) then raise exception 'Duplicate player in import or update';end if;ids:=array_append(ids,pid);changed:=changed+1;
   end loop;
   update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;
   res:=jsonb_build_object('saved',changed);
  elsif p_action='save_fixture' then
   if p_data ?| array['slots','published','review','fixtures'] then raise exception 'Fixture setup cannot change team selections';end if;
   fid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
   select * into m from club_selection_private.fixtures where id=fid;
   if found and m.club_id<>c then raise exception 'Fixture belongs to another club';end if;
   if coalesce(m.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture changed. Reload before saving';end if;
   perform club_selection_private.validate_details(p_data->'details');
   if (p_data->'details'->'match_roles') is distinct from (m.details->'match_roles') then raise exception 'A selector must change the match captain or keeper on the selection board';end if;
   uid:=nullif(p_data->'details'->>'captain_id','')::uuid;
   if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose a captain from this club';end if;
   uid:=nullif(p_data->'details'->>'grade_group_id','')::uuid;
   if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
   for v in select jsonb_array_elements_text(coalesce(p_data->'details'->'staff','[]')) loop
    if not club_selection_private.member(c,v::uuid) then raise exception 'Choose staff from this club';end if;
   end loop;
   -- Preserve existing picks, captain snapshots and publications byte for byte.
   -- A selector must resolve a format change that would invalidate existing picks.
   if m.id is not null and exists(select 1 from jsonb_array_elements(m.slots) slot where
    (jsonb_array_length(p_data->'details'->'days')=1 and nullif(slot->>'d2','') is not null)
    or (jsonb_array_length(p_data->'details'->'days')=2 and not coalesce((p_data->'details'->>'brackets')::boolean,false) and (slot->>'d1') is distinct from (slot->>'d2'))
   ) then raise exception 'A selector must adjust the Day 2 selections before this format change';end if;
   if m.id is null then
    insert into club_selection_private.fixtures(id,club_id,details,slots,updated_by)
    values(fid,c,p_data->'details',(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,11)),me);
   else
    update club_selection_private.fixtures set details=p_data->'details',revision=revision+1,updated_by=me,updated_at=now() where id=fid;
   end if;
   res:=jsonb_build_object('saved',true,'id',fid,'revision',(select revision from club_selection_private.fixtures where id=fid));
  elsif p_action='save_board' then
   if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or jsonb_array_length(p_data->'fixtures') not between 1 and 30 then raise exception 'Save 1 to 30 teams together';end if;
   ids:='{}';
   for row in select * from jsonb_array_elements(p_data->'fixtures') loop
    fid:=coalesce(nullif(row->>'id','')::uuid,gen_random_uuid());
    if fid=any(ids) then raise exception 'Duplicate fixture';end if;ids:=array_append(ids,fid);
    select * into m from club_selection_private.fixtures where id=fid;
    if found and m.club_id<>c then raise exception 'Fixture belongs to another club';end if;
    if coalesce(m.revision,0)<>coalesce((row->>'revision')::int,-1) then raise exception 'A team changed in another session. Reload before saving';end if;
    perform club_selection_private.validate_details(row->'details');
    uid:=nullif(row->'details'->>'captain_id','')::uuid;
    if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose a captain from this club';end if;
    uid:=nullif(row->'details'->>'grade_group_id','')::uuid;
    if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
    for v in select jsonb_array_elements_text(coalesce(row->'details'->'staff','[]')) loop if not club_selection_private.member(c,v::uuid) then raise exception 'Choose staff from this club';end if;end loop;
    if jsonb_typeof(row->'slots') is distinct from 'array' or jsonb_array_length(row->'slots')<>11 then raise exception 'Teams have exactly 11 selection slots';end if;
    for s in select * from jsonb_array_elements(row->'slots') loop
     if jsonb_typeof(s) is distinct from 'object' then raise exception 'Invalid selection slot';end if;
     for v in select unnest(array[nullif(s->>'d1',''),nullif(s->>'d2','')]) loop
      if v is not null and not exists(select 1 from club_selection_private.roster where id=v::uuid and club_id=c and active) then raise exception 'Choose an active player from this club playing list';end if;
     end loop;
     if jsonb_array_length(row->'details'->'days')=1 and nullif(s->>'d2','') is not null then raise exception 'One-day fixtures have no Day 2 player';end if;
     if jsonb_array_length(row->'details'->'days')=2 and not coalesce((row->'details'->>'brackets')::boolean,false) and (s->>'d1') is distinct from (s->>'d2') then raise exception 'Enable bracketing for this grade before splitting a slot';end if;
    end loop;
    -- Keep existing drafts reviewable after a withdrawal; every new assignment requires a marked date.
    if not coalesce((row->'details'->>'cancelled')::boolean,false) then
     for x in select jsonb_build_object('day',day,'player',slot->>('d'||idx::text))
      from jsonb_array_elements(row->'details'->'days') with ordinality days(day,idx),jsonb_array_elements(row->'slots') slot
      where nullif(slot->>('d'||idx::text),'') is not null loop
      pid:=(x->>'player')::uuid;
      if club_selection_private.day_status(pid,x->'day')<>'available' and not exists(
       select 1 from jsonb_array_elements(m.details->'days') with ordinality days(day,idx),jsonb_array_elements(m.slots) slot
       where day->>'date'=x->'day'->>'date' and slot->>('d'||idx::text)=pid::text
      ) then raise exception 'Mark availability before selecting % on %',(select name from club_selection_private.roster where id=pid),x->'day'->>'date';end if;
     end loop;
    end if;
    if m.details ? 'match_roles' and not (row->'details' ? 'match_roles') then raise exception 'Reload the updated app before changing match appointments';end if;
    if row->'details' ? 'match_roles' then row:=jsonb_set(row,'{details}',club_selection_private.match_details(c,row->'details',row->'slots'));end if;
    insert into club_selection_private.fixtures(id,club_id,details,slots,updated_by) values(fid,c,row->'details',row->'slots',me)
    on conflict(id) do update set details=excluded.details,slots=excluded.slots,revision=club_selection_private.fixtures.revision+1,updated_by=me,updated_at=now();
   end loop;
   -- Check the final batch, so a confirmed transfer/swap can vacate the old place atomically.
   -- Compare actual dates, including Day 2, and normalized names for legacy duplicate records.
   for x in
    select jsonb_build_object('name',min(rp.name),'date',ad.day->>'date')
    from club_selection_private.fixtures fx
    cross join lateral jsonb_array_elements(fx.details->'days') with ordinality ad(day,n)
    cross join lateral jsonb_array_elements(fx.slots) ps(slot)
    join club_selection_private.roster rp on rp.club_id=c and rp.id=nullif(ps.slot->>('d'||ad.n::text),'')::uuid
    where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)
    group by club_selection_private.account_name_key(rp.name),ad.day->>'date'
    having count(*)>1 and bool_or(fx.id=any(ids))
   loop
    raise exception '% is already selected on %. Choose one place per player per date.',x->>'name',x->>'date';
   end loop;
   res:=jsonb_build_object('saved',true,'ids',ids,'revisions',(select jsonb_object_agg(f.id::text,f.revision) from club_selection_private.fixtures f where f.id=any(ids)));
  else
   if club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
   ids:=array(select distinct jsonb_array_elements_text(p_data->'ids')::uuid);
   if coalesce(array_length(ids,1),0) not between 1 and 30 then raise exception 'Choose teams to publish';end if;
   -- Check the final batch, so a confirmed transfer/swap can vacate the old place atomically.
   -- Compare actual dates, including Day 2, and normalized names for legacy duplicate records.
   for x in
    select jsonb_build_object('name',min(rp.name),'date',ad.day->>'date')
    from club_selection_private.fixtures fx
    cross join lateral jsonb_array_elements(fx.details->'days') with ordinality ad(day,n)
    cross join lateral jsonb_array_elements(fx.slots) ps(slot)
    join club_selection_private.roster rp on rp.club_id=c and rp.id=nullif(ps.slot->>('d'||ad.n::text),'')::uuid
    where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)
    group by club_selection_private.account_name_key(rp.name),ad.day->>'date'
    having count(*)>1 and bool_or(fx.id=any(ids))
   loop
    raise exception '% is already selected on %. Choose one place per player per date.',x->>'name',x->>'date';
   end loop;
   -- Every changed team is checked first. Cross-grade moves publish atomically.
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;
    if not found then raise exception 'Unknown fixture';end if;
    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Review the latest team before publishing';end if;
    if not coalesce((m.details->>'cancelled')::boolean,false) then
     notes:=club_selection_private.issues(fid);
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='error') then raise exception 'Fix selection or availability issues before publishing' using detail=notes::text;end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='short_team')
      and not coalesce(p_data->'acknowledge_short' ? fid::text,false) then raise exception 'Confirm publishing this team with vacant places';end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='warning' and n->>'code' is distinct from 'short_team') and not coalesce((p_data->>'acknowledge_balance')::boolean,false) then raise exception 'Review and acknowledge the balance warnings before publishing';end if;
     if exists(select 1 from club_selection_private.fixtures other,jsonb_array_elements(other.published->'details'->'days') with ordinality od(day,j),jsonb_array_elements(other.published->'slots') os,jsonb_array_elements(m.details->'days') with ordinality md(day,j),jsonb_array_elements(m.slots) ms
       where other.club_id=c and other.id<>all(ids) and not coalesce((other.published->'details'->>'cancelled')::boolean,false) and md.day->>'date'=od.day->>'date' and nullif(ms->>('d'||md.j::text),'')=os->>('d'||od.j::text)
       and (coalesce(md.day->>'start','')='' or coalesce(od.day->>'start','')='' or coalesce(md.day->>'end','')='' or coalesce(od.day->>'end','')='' or ((md.day->>'start')<(od.day->>'end') and (md.day->>'end')>(od.day->>'start')))) then raise exception 'A player is still published in another team. Include both changed teams in this publication';end if;
    end if;
   end loop;
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;old:=m.published;
    res:=club_selection_private.draft_snapshot(fid);
    if res=old then continue;end if;
    update club_selection_private.fixtures set published=res,publication=publication+1,published_at=now(),selection_unlocked_until=null,selection_unlocked_by=null where id=fid;
    insert into club_selection_private.publications values(fid,m.publication+1,res,now(),me);
    publication_changes:=publication_changes||jsonb_build_array(jsonb_build_object('fixture_id',fid,'old_snapshot',old));
   end loop;
   changed:=changed+club_selection_private.notify_publication_batch(c,publication_changes);
   res:=jsonb_build_object('published',true,'recipients',changed,'groups',club_selection_private.sync_publication_groups(c,ids));
  end if;
 else raise exception 'Unknown Selections action';end if;
 end if;
 if p_action in ('save_board','save_fixture','fixture_defaults','publish','selectors','publication_delegate','fixture_lock') then
  changed:=club_selection_private.sync_republication_alerts(c);
  res:=res||jsonb_build_object('republication_alerts',changed);
 end if;
 insert into club_selection_private.requests values(c,me,rid,p_action,p_data,res,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,p_action,jsonb_build_object('request_id',rid,'result',res));
 return res;
end$function$;

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
    (select id,week_end,title,rows,image_path,created_at,request->>'blurb' blurb from club_selection_private.team_week_editions where club_id=c and sealed_at is not null order by week_end desc,created_at desc limit 100) h),'[]'));
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
   if e.club_id<>c or e.created_by<>me or e.request<>p_data then raise exception 'This image identity was already used';end if;
   return jsonb_build_object('id',e.id,'path',e.image_path,'sealed',e.sealed_at is not null);
  end if;
  if length(coalesce(p_data->>'blurb',''))>2000 or length(btrim(coalesce(p_data->>'title','')))=0 or length(p_data->>'title')>60 or jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')<>11
   or coalesce(p_data->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(p_data->>'bytes','')!~'^[0-9]{1,8}$' or (p_data->>'bytes')::integer not between 100 and 10485760 then raise exception 'Choose 11 players and check the graphic';end if;
  candidates:=club_selection_private.team_week_candidates(club_selection_private.team_week_cards(c,first_day,last_day));
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
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=e.week_end and sealed_at is not null order by sealed_at desc limit 1;
  if latest is distinct from (e.request->>'previous_id')::uuid then raise exception 'Another winner was saved. Reload scores before saving';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-player-week' and name=e.image_path and (metadata->>'size')::bigint=e.image_bytes) then raise exception 'Upload not confirmed. Retry saving';end if;
  update club_selection_private.player_week_editions set sealed_at=clock_timestamp() where id=e.id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown Player of the Week action';
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.team_week_storage_allowed(object_name text, writing boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare parts text[]:=string_to_array(object_name,'/');c uuid;
begin
 if array_length(parts,1)<>3 or parts[1]!~'^[0-9a-f-]{36}$' or parts[3]!~'^[0-9a-f-]{36}\.png$' then return false;end if;
 begin c:=parts[1]::uuid;exception when invalid_text_representation then return false;end;
 if not club_selection_private.social_allowed(c) then return false;end if;
 if parts[2]='backgrounds' then return true;end if;
 return parts[2]='editions' and exists(select 1 from club_selection_private.team_week_editions e where e.club_id=c and e.image_path=object_name and
  (case when writing then e.created_by=auth.uid() and e.sealed_at is null else e.sealed_at is not null or e.created_by=auth.uid() end));
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.player_week_storage_allowed(object_name text, writing boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare parts text[]:=string_to_array(object_name,'/');c uuid;
begin
 if auth.uid() is null or array_length(parts,1)<>3 or parts[1]!~'^[0-9a-f-]{36}$' or parts[3]!~'^[0-9a-f-]{36}\.png$' then return false;end if;
 begin c:=parts[1]::uuid;exception when invalid_text_representation then return false;end;
 if not club_selection_private.social_allowed(c) then return false;end if;
 if parts[2]='artwork' then return true;end if;
 return parts[2]='editions' and exists(select 1 from club_selection_private.player_week_editions e where e.club_id=c and e.image_path=object_name and
  (case when writing then e.created_by=auth.uid() and e.sealed_at is null else e.sealed_at is not null or e.created_by=auth.uid() end));
end $function$;

CREATE OR REPLACE FUNCTION club_batting_private.stage_match_review_scorecard(p_club_id uuid, p_actor_id uuid, p_scorecard jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid;begin
 if not exists(select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id where m.club_id=p_club_id and m.user_id=p_actor_id and (m.permission_role in ('admin','head_coach','coach','captain') or club_selection_private.batting_captain(p_club_id,p_actor_id) or club_selection_private.social_allowed_at(p_club_id,p_actor_id,now())) and c.archived_at is null) then raise exception 'Current coaching or socials access is required';end if;
 if jsonb_typeof(p_scorecard)<>'object' or p_scorecard->>'provider'<>'playcricket_au' or p_scorecard->>'status' not in ('completed','in_progress') or jsonb_typeof(p_scorecard->'innings')<>'array' or octet_length(p_scorecard::text)>750000 then raise exception 'Invalid scorecard';end if;
 if (select count(*) from public.match_review_scorecards where fetched_by=p_actor_id and created_at>clock_timestamp()-interval '5 minutes')>=15 then raise exception 'Several scorecards were loaded recently. Please wait a few minutes.';end if;
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(p_club_id,(p_scorecard->>'match_id')::uuid,p_actor_id,p_scorecard) returning id into sid;return jsonb_build_object('id',sid);
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_publish_api(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); adm boolean; p club_selection_private.social_posts%rowtype;
 con club_selection_private.social_connections%rowtype; x jsonb; t text; account text; j uuid; n integer; paths jsonb;
begin
 if me is null or not club_selection_private.social_allowed(c) then raise exception 'Club Admin or socials manager access required';end if;
 if jsonb_typeof(data) is distinct from 'object' or length(data::text)>40000 then raise exception 'Invalid publishing request';end if;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 select * into con from club_selection_private.social_connections where club_id=c;
 if action='attention_handled' then return club_selection_private.social_attention_handled(c,data);end if;
 if action='cancel_unposted' then return club_selection_private.social_cancel_unposted(c,data);end if;
 if action='delegate' then return club_selection_private.social_delegation_change(c,data);end if;
 if action in ('reschedule','cancel_schedule') then return club_selection_private.social_schedule_change(c,action,data);end if;
 if action='context' then
 -- Add newly appointed managers to outstanding alerts, without duplicating
 -- existing recipients or alert messages.
 insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy)
 select a.message_id,m.user_id,false from club_selection_private.social_attention a
 join public.club_memberships m on m.club_id=a.club_id
 where a.club_id=c and a.resolved_at is null and a.message_id is not null
 and club_selection_private.social_preparer_allowed(c,m.user_id)
 and not exists(select 1 from club_batting_private.club_message_recipients r where r.message_id=a.message_id and r.user_id=m.user_id)
 on conflict do nothing;
 return jsonb_build_object('admin',adm,'can_connect',true,'can_disconnect',club_selection_private.social_permanent_allowed(c,me),'attention_supported',true,
 'attention',club_selection_private.social_attention_items(c),
 'handover_posts',club_selection_private.social_cover_posts(c,(select delegate_id from club_selection_private.social_posting_delegations where club_id=c)),
 'timezone',(select timezone from club_selection_private.access where club_id=c),
 'can_delegate',club_selection_private.social_permanent_allowed(c,me),
 'can_hand_back',exists(select 1 from club_selection_private.social_posting_delegations d where d.club_id=c and d.delegate_id is not null and (adm or me=d.delegated_by or me=d.delegate_id)),
 'delegation',coalesce((select to_jsonb(d)||jsonb_build_object('name',(select display_name from public.user_profiles where user_id=d.delegate_id),'manager_name',(select display_name from public.user_profiles where user_id=d.delegated_by)) from club_selection_private.social_posting_delegations d where d.club_id=c),'{"revision":0}'::jsonb),
 'delegation_members',case when club_selection_private.social_permanent_allowed(c,me) then coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(profile.display_name,'Club member')) order by profile.display_name,m.user_id) from public.club_memberships m left join public.user_profiles profile on profile.user_id=m.user_id where m.club_id=c and m.user_id<>me),'[]'::jsonb) else '[]'::jsonb end,
 'connection',case when con.club_id is not null then jsonb_build_object('page_id',con.page_id,'page_name',con.page_name,'instagram_id',con.instagram_id,'instagram_name',con.instagram_name,'status',con.status,'revision',con.revision) end,
  'posts',coalesce((select jsonb_agg(club_selection_private.social_post_view(id) order by created_at desc) from (select id,created_at from club_selection_private.social_posts where club_id=c order by created_at desc limit 20) z),'[]'::jsonb));end if;
 if action='connection_access' then if not club_selection_private.social_preparer_allowed(c,me) then raise exception 'Socials Manager or Club Admin access required';end if;return jsonb_build_object('allowed',true);end if;
 if action='disconnect' then
  if not club_selection_private.social_permanent_allowed(c,me) then raise exception 'Permanent Socials Manager or Club Admin access required';end if;
  update club_selection_private.social_connections set status='disconnected',credential='',revision=revision+1,updated_at=now() where club_id=c;
  update club_selection_private.social_post_destinations d set state='blocked',message='The club disconnected its accounts.',updated_at=now() from club_selection_private.social_posts posted where posted.id=d.post_id and posted.club_id=c and d.state in ('queued','failed');
  return jsonb_build_object('disconnected',true);
 end if;
 j:=(data->>'id')::uuid;if j is null then raise exception 'Post ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,14300));
 select * into p from club_selection_private.social_posts where id=j for update;
 if p.id is not null and p.club_id<>c then raise exception 'Post unavailable';end if;
 if action='draft' then
  if p.id is not null then
   if p.created_by<>me or p.fixtures<>data->'fixtures' or p.images<>data->'images' or p.renderer<>data->>'renderer' then raise exception 'This draft changed. Start a new review';end if;
   return club_selection_private.social_post_view(j);
  end if;
  if coalesce(data->>'renderer','') not in ('0.8.62.143','social-awards.178') then raise exception 'Refresh Club Batting before preparing this post';end if;
  if jsonb_typeof(data->'fixtures') is distinct from 'array' then raise exception 'Choose the graphics to post';end if;
  if data->>'renderer'='social-awards.178' and exists(select 1 from jsonb_array_elements(data->'fixtures') entry where entry->>'source_type' is distinct from 'award') then raise exception 'Choose saved award images';end if;
  if data->>'renderer'='0.8.62.143' and exists(select 1 from jsonb_array_elements(data->'fixtures') entry where entry->>'source_type'='award') then raise exception 'Use the awards posting review';end if;
  perform club_selection_private.social_post_validate(c,data->'fixtures');
  if jsonb_typeof(data->'images') is distinct from 'array' or jsonb_array_length(data->'images') not between 1 and 10 then raise exception 'Choose one to ten images for a post';end if;
  if length(coalesce(data->>'caption',''))>2200 then raise exception 'Keep the caption to 2,200 characters';end if;
  if (select count(*) from club_selection_private.social_posts where club_id=c and created_at>now()-interval '1 hour')>=40 then raise exception 'There are many recent drafts. Open an existing review from Posting history';end if;
  n:=0;paths:='[]';
  for x in select value from jsonb_array_elements(data->'images') loop
   if x->>'path' is distinct from c::text||'/'||j::text||'/'||n::text||'.jpg'
    or coalesce(x->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(x->>'bytes','')!~'^[0-9]{1,7}$'
    or (x->>'bytes')::int not between 100 and 8388608 or length(coalesce(x->>'label',''))>160
    or not exists(select 1 from jsonb_array_elements(data->'fixtures') f where f->>'id'=x->>'fixture_id')
    then raise exception 'Invalid social image';end if;
   n:=n+1;
  end loop;
  for x in select value from jsonb_array_elements(data->'fixtures') loop
   if not exists(select 1 from jsonb_array_elements(data->'images') i where i->>'fixture_id'=x->>'id') then raise exception 'A selected graphic has no image';end if;
  end loop;
  insert into club_selection_private.social_posts(id,club_id,created_by,renderer,fixtures,images,caption)
   values(j,c,me,data->>'renderer',data->'fixtures',data->'images',coalesce(data->>'caption',''));
  return club_selection_private.social_post_view(j);
 end if;
 if p.id is null then raise exception 'Post unavailable';end if;
 if action='get' then return club_selection_private.social_post_view(j);end if;
 if action='approve' then
  if p.state='approved' then
   if p.caption is distinct from data->>'caption' or p.targets is distinct from data->'targets' or p.scheduled_for is distinct from nullif(data->>'scheduled_for','')::timestamptz then raise exception 'This post is already approved. Check Posting history';end if;
   return club_selection_private.social_post_view(j);
  end if;
  perform club_selection_private.social_schedule_validate(c,me,p.fixtures,nullif(data->>'scheduled_for','')::timestamptz);
  if con.club_id is null or con.status<>'connected' or con.credential='' then raise exception 'Connect the club accounts before posting';end if;
  if con.revision is distinct from (data->>'connection_revision')::int then raise exception 'The connected account changed. Review the destinations again';end if;
  if jsonb_typeof(data->'targets') is distinct from 'array' or jsonb_array_length(data->'targets') not between 1 and 2
   or exists(select 1 from jsonb_array_elements_text(data->'targets') v where v not in ('facebook','instagram'))
   or (select count(distinct value) from jsonb_array_elements_text(data->'targets'))<>jsonb_array_length(data->'targets')
   or length(coalesce(data->>'caption',''))>2200 then raise exception 'Check the caption and destinations';end if;
  perform club_selection_private.social_post_validate(c,p.fixtures);
  for x in select value from jsonb_array_elements(p.images) loop
   if not exists(select 1 from storage.objects where bucket_id='club-social-posts' and name=x->>'path' and (metadata->>'size')::bigint=(x->>'bytes')::bigint) then raise exception 'An image is not uploaded yet. Reopen the review and try again';end if;
  end loop;
  for t in select value from jsonb_array_elements_text(data->'targets') loop
   account:=case when t='facebook' then con.page_id else con.instagram_id end;
   if account is null then raise exception 'This club has no connected Instagram professional account';end if;
   for x in select value from jsonb_array_elements(p.fixtures) loop
    if exists(select 1 from club_selection_private.social_post_claims where club_id=c and fixture_id=(x->>'id')::uuid and artwork_key=x->>'artwork_key' and renderer=p.renderer and platform=t and account_id=account) then
     raise exception 'These graphics already have a posting request for this account. Open Posting history to check it';
    end if;
    insert into club_selection_private.social_post_claims values(c,(x->>'id')::uuid,x->>'artwork_key',p.renderer,t,account,j);
   end loop;
   insert into club_selection_private.social_post_destinations(post_id,platform,account_id) values(j,t,account);
  end loop;
  update club_selection_private.social_posts set caption=coalesce(data->>'caption',''),targets=data->'targets',state='approved',approved_by=me,approved_at=now(),scheduled_for=nullif(data->>'scheduled_for','')::timestamptz,schedule_revision=schedule_revision+1 where id=j;
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'socials:approve_post',jsonb_build_object('post_id',j,'targets',data->'targets'));
 elsif action='retry' then
  if p.state<>'approved' then raise exception 'Review and approve the post first';end if;
  if con.status is distinct from 'connected' then raise exception 'Reconnect the club accounts first';end if;
  perform club_selection_private.social_post_validate(c,p.fixtures);
  -- Only destinations known not to be published can be retried.
  update club_selection_private.social_post_destinations set state='queued',checkpoint='{}',attempts=0,message=null,lease=null,lease_until=null,updated_at=now()
   where post_id=j and state in ('failed','blocked') and account_id=case when platform='facebook' then con.page_id else con.instagram_id end;
  update club_selection_private.social_posts set approved_by=me where id=j;
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'socials:retry_post',jsonb_build_object('post_id',j));
 else raise exception 'Unknown publishing action';end if;
 return club_selection_private.social_post_view(j);
end$function$;
