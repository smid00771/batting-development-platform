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
 if action='delete_post' then return club_selection_private.delete_saved_post(c,data);end if;
 if nullif(data->>'id','') is not null then
  perform pg_advisory_xact_lock(hashtextextended(c::text,14300));
  if exists(select 1 from club_selection_private.social_post_deletions where post_id=(data->>'id')::uuid and club_id=c) then raise exception 'This saved post is being deleted. Return to Posting history';end if;
 end if;
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
  'posts',coalesce((select jsonb_agg(club_selection_private.social_post_view(id) order by created_at desc) from (select id,created_at from club_selection_private.social_posts stored_post where club_id=c and not exists(select 1 from club_selection_private.social_post_deletions d where d.post_id=stored_post.id and d.storage_deleted_at is not null) order by created_at desc limit 20) z),'[]'::jsonb));end if;
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
    (select id,week_end,winner,title,blurb,image_path,sealed_at as created_at from club_selection_private.player_week_editions where club_id=c and sealed_at is not null and not exists(select 1 from club_selection_private.social_image_deletions d where d.edition_id=club_selection_private.player_week_editions.id) and club_selection_private.award_scope_key(request->'award_scope')=p_data#>>'{award_scope,key}' order by week_end desc,sealed_at desc limit 150) h),'[]'));
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
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=last_day and sealed_at is not null and not exists(select 1 from club_selection_private.social_image_deletions d where d.edition_id=club_selection_private.player_week_editions.id) and club_selection_private.award_scope_key(request->'award_scope')=p_data#>>'{award_scope,key}' order by sealed_at desc limit 1;
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
  select id into latest from club_selection_private.player_week_editions where club_id=c and week_end=e.week_end and sealed_at is not null and not exists(select 1 from club_selection_private.social_image_deletions d where d.edition_id=club_selection_private.player_week_editions.id) and club_selection_private.award_scope_key(request->'award_scope')=club_selection_private.award_scope_key(e.request->'award_scope') order by sealed_at desc limit 1;
  if latest is distinct from (e.request->>'previous_id')::uuid then raise exception 'Another winner was saved. Reload scores before saving';end if;
  if not exists(select 1 from storage.objects where bucket_id='club-player-week' and name=e.image_path and (metadata->>'size')::bigint=e.image_bytes) then raise exception 'Upload not confirmed. Retry saving';end if;
  update club_selection_private.player_week_editions set sealed_at=clock_timestamp() where id=e.id;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown Player of the Week action';
end $function$;
