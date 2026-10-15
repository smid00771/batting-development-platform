-- Qualify JSON rows separately from PL/pgSQL loop variables.
create or replace function club_selection_private.social_awards_api(c uuid,action text,data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
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
  'editions',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('performance_keys',coalesce((select jsonb_agg(x->>'key') from club_selection_private.social_award_editions a cross join lateral jsonb_array_elements(a.sources) x where a.id=e.id),'[]')) order by created_at) from club_selection_private.social_award_sources(c) e where e.week_end=last_day),'[]'),
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
end $$;

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
 return jsonb_build_object('admin',adm,'can_connect',true,'attention_supported',true,
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
  if not adm then raise exception 'Club Admin connects the club social accounts';end if;
  update club_selection_private.social_connections set status='disconnected',credential='',revision=revision+1,updated_at=now() where club_id=c;
  update club_selection_private.social_post_destinations d set state='blocked',message='The club disconnected its accounts.',updated_at=now() from club_selection_private.social_posts p where p.id=d.post_id and p.club_id=c and d.state in ('queued','failed');
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
end$function$

;
