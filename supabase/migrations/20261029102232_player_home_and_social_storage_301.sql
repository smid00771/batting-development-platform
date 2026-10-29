-- Name-only matching is offered to the verified player, never silently claimed.
create table club_selection_private.player_link_choices (
 club_id uuid not null references public.clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 roster_id uuid not null references club_selection_private.roster(id) on delete cascade,
 declined_at timestamptz not null default now(),
 primary key(club_id,user_id,roster_id)
);
alter table club_selection_private.player_link_choices enable row level security;
revoke all on club_selection_private.player_link_choices from public,anon,authenticated;
create index player_link_choices_roster on club_selection_private.player_link_choices(roster_id);
create index player_link_choices_user on club_selection_private.player_link_choices(user_id);

create or replace function club_selection_private.player_link_api(c uuid, action text, data jsonb default '{}')
returns jsonb language plpgsql set search_path='' as $function$
declare me uuid:=auth.uid(); person text; linked club_selection_private.roster%rowtype;
 candidate club_selection_private.roster%rowtype; matches integer; confirmed uuid;
begin
 if me is null or not exists(select 1 from public.club_memberships m join auth.users u on u.id=m.user_id
  where m.club_id=c and m.user_id=me and m.involvement in ('player','both')
  and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 then raise exception 'A verified player account in this club is required';end if;
 if not club_selection_private.enabled(c) and not coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 then raise exception 'Club player access is not active';end if;
 if action not in ('player_link_context','confirm_player_link','decline_player_link') or jsonb_typeof(data) is distinct from 'object' or length(data::text)>1000
 then raise exception 'Invalid player link request';end if;
 -- Passive Home reads do not acquire the club-wide selection save lock.
 if action<>'player_link_context' then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 select * into linked from club_selection_private.roster where club_id=c and user_id=me and active limit 1;
 if linked.id is not null then return jsonb_build_object('status','linked','roster_id',linked.id,'name',linked.name,'grade',linked.grade);end if;
 if action='decline_player_link' and exists(select 1 from club_selection_private.player_link_choices where club_id=c and user_id=me and roster_id=nullif(data->>'roster_id','')::uuid)
 then return jsonb_build_object('status','club_help');end if;
 select club_selection_private.account_name_key(display_name) into person from public.user_profiles where user_id=me;
 select count(*) into matches from club_selection_private.roster r where r.club_id=c
  and club_selection_private.account_name_key(r.name)=person and person<>'';
 if matches=1 then
  select * into candidate from club_selection_private.roster r where r.club_id=c and r.active and r.user_id is null
   and not r.auto_link_disabled and nullif(btrim(r.account_email),'') is null
   and club_selection_private.account_name_key(r.name)=person
   and not exists(select 1 from club_selection_private.roster other where other.club_id=c and other.user_id=me)
   and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id and rp.claimed_user_id is not null and rp.claimed_user_id<>me)
   and not exists(select 1 from club_selection_private.player_link_choices choice where choice.club_id=c and choice.user_id=me and choice.roster_id=r.id);
 end if;
 if action='player_link_context' then
  if candidate.id is null then return jsonb_build_object('status','club_help');end if;
  return jsonb_build_object('status','confirm_name','candidate',jsonb_build_object('id',candidate.id,'name',candidate.name,'grade',candidate.grade));
 end if;
 if candidate.id is null or candidate.id is distinct from nullif(data->>'roster_id','')::uuid then raise exception 'This player entry changed. Return Home to check it again';end if;
 if action='decline_player_link' then
  insert into club_selection_private.player_link_choices(club_id,user_id,roster_id) values(c,me,candidate.id) on conflict do nothing;
  return jsonb_build_object('status','club_help');
 end if;
 update club_selection_private.roster set user_id=me,updated_at=now() where id=candidate.id and club_id=c and user_id is null returning id into confirmed;
 if confirmed is null then raise exception 'This player entry was linked by someone else. Return Home to check it again';end if;
 -- The existing trigger claims imported batting history and only removes an empty duplicate.
 -- If two established histories conflict, roll back the entire claim for the club to resolve.
 if exists(select 1 from club_batting_private.roster_players rp join public.players p on p.id=rp.player_id
  where rp.roster_id=confirmed and p.user_id is distinct from me)
 then raise exception 'Your club needs to check the existing player records before linking them';end if;
 perform club_selection_private.sync_players(c,me);
 update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;
 insert into club_selection_private.audit(club_id,actor_id,action,detail)
 values(c,me,'confirm_own_player_name',jsonb_build_object('roster_id',confirmed));
 return jsonb_build_object('status','linked','roster_id',confirmed,'name',candidate.name,'grade',candidate.grade);
end $function$;
revoke all on function club_selection_private.player_link_api(uuid,text,jsonb) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.club_selections_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if p_action in ('player_link_context','confirm_player_link','decline_player_link') then return club_selection_private.player_link_api(p_club_id,p_action,p_data);end if;
 if p_action='publication_check' then return club_selection_private.publication_check(p_club_id,p_data);end if;
 if p_action='set_access' then raise exception 'Use the Selections subscription controls';end if;
 if p_action in ('subscription_context','preview_subscription','set_selection_pricing','save_subscription') then return club_selection_private.billing_api(p_club_id,p_action,p_data);end if;
 result:=club_selection_private.api(p_club_id,p_action,p_data);
 if p_action='access' then
  result:=result||jsonb_build_object('predictions_enabled',coalesce((select s.enabled from public.club_call_settings s where s.club_id=p_club_id),false));
 end if;
 if p_action='context' and (coalesce((result->>'admin')::boolean,false) or coalesce((result->>'can_view_board')::boolean,false)) then
  result:=result||jsonb_build_object('selection_group_access',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'level',club_selection_private.selection_group_level(p_club_id,g.id,auth.uid()),'head_id',club_selection_private.selection_group_publisher(p_club_id,g.id),'can_view',club_selection_private.selection_group_level(p_club_id,g.id,auth.uid())>0 or exists(select 1 from club_selection_private.fixtures fx where fx.club_id=p_club_id and club_selection_private.fixture_selection_group(p_club_id,fx.details)=g.id and club_selection_private.fixture_captain(p_club_id,fx.details,auth.uid())))) from club_selection_private.selection_groups g where g.club_id=p_club_id),'[]'),'selection_setup',public.club_selection_groups(p_club_id,'context'),'fixtures',coalesce((select jsonb_agg(f||case when f->'details' is null and f->'published' is not null then jsonb_build_object('details',f#>'{published,details}','slots',f#>'{published,slots}','draft_visible',false) else jsonb_build_object('draft_visible',true) end||jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')),
  'result_complete',coalesce((select latest.scorecard->>'status'='completed'
   from club_selection_private.fixture_result_sources src
   join lateral (select sc.scorecard from public.match_review_scorecards sc
    where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id
    order by sc.created_at desc,sc.id desc limit 1) latest on true
   where src.club_id=p_club_id and src.fixture_id=(f->>'id')::uuid and src.no_play is null),false))) from jsonb_array_elements(result->'fixtures') f),'[]'));
 end if;
 if p_action='context' and coalesce((result->>'can_view_board')::boolean,false) then
  result:=result||jsonb_build_object('returning_context',club_selection_private.selection_returning_context(p_club_id,result->'fixtures'));
 end if;
 return result;
end $function$;

-- Keep the small award record for history; remove the actual object through Storage API.
CREATE OR REPLACE FUNCTION club_selection_private.social_award_all_sources(c uuid)
 RETURNS TABLE(id uuid, kind text, week_end date, label text, bucket text, image_path text, image_sha text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select id,kind,week_end,label,'club-social-awards',image_path,image_sha,sealed_at from club_selection_private.social_award_editions where club_id=c and sealed_at is not null
 union all select id,'team_week',week_end,'Team of the Week · '||title,'club-team-week',image_path,image_sha,sealed_at from club_selection_private.team_week_editions where club_id=c and sealed_at is not null
 union all select id,'player_week',week_end,'Player of the Week · '||(winner->>'name'),'club-player-week',image_path,image_sha,sealed_at from club_selection_private.player_week_editions where club_id=c and sealed_at is not null
$function$;

revoke all on function club_selection_private.social_award_all_sources(uuid) from public,anon,authenticated;
create table club_selection_private.social_image_deletions (
 edition_id uuid primary key,
 club_id uuid not null references public.clubs(id) on delete cascade,
 bucket text not null check(bucket in ('club-social-awards','club-team-week','club-player-week')),
 image_path text not null,
 requested_by uuid not null references auth.users(id),
 requested_at timestamptz not null default now(),
 storage_deleted_at timestamptz,
 unique(bucket,image_path)
);
alter table club_selection_private.social_image_deletions enable row level security;
revoke all on club_selection_private.social_image_deletions from public,anon,authenticated;
create index social_image_deletions_club on club_selection_private.social_image_deletions(club_id);
create index social_image_deletions_user on club_selection_private.social_image_deletions(requested_by);

create or replace function club_selection_private.delete_saved_image(c uuid, data jsonb)
returns jsonb language plpgsql set search_path='' as $function$
declare eid uuid:=nullif(data->>'id','')::uuid; source record; removed club_selection_private.social_image_deletions%rowtype;
begin
 if auth.uid() is null or not club_selection_private.social_allowed(c) then raise exception 'Club Admin or Socials Manager access required';end if;
 if eid is null or jsonb_typeof(data) is distinct from 'object' or length(data::text)>1000 then raise exception 'Choose a saved image';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,17800));
 select * into removed from club_selection_private.social_image_deletions where edition_id=eid and club_id=c;
 if removed.edition_id is null then
  select * into source from club_selection_private.social_award_all_sources(c) where id=eid;
  if source.id is null then raise exception 'Saved image not found in this club';end if;
  insert into club_selection_private.social_image_deletions(edition_id,club_id,bucket,image_path,requested_by)
   values(eid,c,source.bucket,source.image_path,auth.uid()) returning * into removed;
  insert into club_selection_private.audit(club_id,actor_id,action,detail)
   values(c,auth.uid(),'delete_saved_social_image',jsonb_build_object('edition_id',eid,'bucket',source.bucket));
 end if;
 if coalesce((data->>'finish')::boolean,false) and removed.storage_deleted_at is null then
  if exists(select 1 from storage.objects where bucket_id=removed.bucket and name=removed.image_path)
  then raise exception 'The stored file has not been deleted yet. Retry deleting the image';end if;
  update club_selection_private.social_image_deletions set storage_deleted_at=now() where edition_id=eid and club_id=c returning * into removed;
 end if;
 return jsonb_build_object('id',eid,'bucket',removed.bucket,'path',removed.image_path,'deleted',removed.storage_deleted_at is not null);
end $function$;
revoke all on function club_selection_private.delete_saved_image(uuid,jsonb) from public,anon,authenticated;

create or replace function club_selection_private.saved_image_delete_allowed(b text,n text)
returns boolean language sql stable security definer set search_path='' as $function$
 select auth.uid() is not null and exists(select 1 from club_selection_private.social_image_deletions d
  where d.bucket=b and d.image_path=n and d.storage_deleted_at is null and club_selection_private.social_allowed(d.club_id))
$function$;
revoke all on function club_selection_private.saved_image_delete_allowed(text,text) from public,anon;
grant execute on function club_selection_private.saved_image_delete_allowed(text,text) to authenticated;
create policy saved_award_image_delete on storage.objects for delete to authenticated
 using(bucket_id in ('club-social-awards','club-team-week','club-player-week') and club_selection_private.saved_image_delete_allowed(bucket_id,name));
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
  from club_selection_private.social_award_all_sources(c) e where e.week_end=last_day
 ), latest as (
 select distinct on (e.kind,e.identity_key) e.id,e.kind,e.week_end,e.label||case when club_selection_private.award_scope_key(club_selection_private.award_edition_scope(c,e.id))='all' then '' else ' · '||(club_selection_private.award_edition_scope(c,e.id)->>'label') end,e.bucket,e.image_path,e.image_sha,e.created_at
 from editions e order by e.kind,e.identity_key,e.created_at desc,e.id desc
 ) select e.* from latest e where not exists(select 1 from club_selection_private.social_image_deletions d where d.edition_id=e.id and d.club_id=c and d.storage_deleted_at is not null)
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.social_award_sources(c uuid)
 RETURNS TABLE(id uuid, kind text, week_end date, label text, bucket text, image_path text, image_sha text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select s.* from club_selection_private.social_award_all_sources(c) s
 where not exists(select 1 from club_selection_private.social_image_deletions d where d.club_id=c and d.edition_id=s.id)
$function$;

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
 if action='delete_image' then return club_selection_private.delete_saved_image(c,data);end if;
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
  'editions',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('deletion_pending',exists(select 1 from club_selection_private.social_image_deletions d where d.club_id=c and d.edition_id=e.id and d.storage_deleted_at is null),'award_scope',club_selection_private.award_edition_scope(c,e.id),'scores_current',club_selection_private.social_award_scores_current(c,e.id),'sources',coalesce((select a.sources from club_selection_private.social_award_editions a where a.id=e.id),'[]'::jsonb),'performance_keys',coalesce((select jsonb_agg(entry->>'key') from club_selection_private.social_award_editions a cross join lateral jsonb_array_elements(a.sources) entry where a.id=e.id),'[]')) order by created_at) from club_selection_private.social_award_collection(c,last_day) e),'[]'),
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

create table club_selection_private.social_post_deletions (
 post_id uuid primary key references club_selection_private.social_posts(id) on delete cascade,
 club_id uuid not null references public.clubs(id) on delete cascade,
 requested_by uuid not null references auth.users(id),
 requested_at timestamptz not null default now(),
 storage_deleted_at timestamptz
);
alter table club_selection_private.social_post_deletions enable row level security;
revoke all on club_selection_private.social_post_deletions from public,anon,authenticated;
create index social_post_deletions_club on club_selection_private.social_post_deletions(club_id);
create index social_post_deletions_user on club_selection_private.social_post_deletions(requested_by);

create or replace function club_selection_private.saved_post_can_delete(j uuid)
returns boolean language sql stable set search_path='' as $function$
 select exists(select 1 from club_selection_private.social_posts p where p.id=j
  and not exists(select 1 from club_selection_private.social_post_destinations d where d.post_id=p.id and d.state<>'published')
  and (p.state='draft' or exists(select 1 from club_selection_private.social_post_destinations d where d.post_id=p.id)))
$function$;
revoke all on function club_selection_private.saved_post_can_delete(uuid) from public,anon,authenticated;

create or replace function club_selection_private.delete_saved_post(c uuid,data jsonb)
returns jsonb language plpgsql set search_path='' as $function$
declare j uuid:=nullif(data->>'id','')::uuid; p club_selection_private.social_posts%rowtype;
 removed club_selection_private.social_post_deletions%rowtype;
begin
 if auth.uid() is null or not club_selection_private.social_allowed(c) then raise exception 'Club Admin or Socials Manager access required';end if;
 if j is null or jsonb_typeof(data) is distinct from 'object' or length(data::text)>1000 then raise exception 'Choose a saved post';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,14300));
 select * into p from club_selection_private.social_posts where id=j and club_id=c for update;
 if p.id is null then raise exception 'Saved post not found in this club';end if;
 perform 1 from club_selection_private.social_post_destinations where post_id=j for update;
 if not club_selection_private.saved_post_can_delete(j) then raise exception 'This post still has a scheduled, unfinished or unconfirmed delivery. Resolve that in Posting history first';end if;
 insert into club_selection_private.social_post_deletions(post_id,club_id,requested_by) values(j,c,auth.uid()) on conflict do nothing;
 select * into removed from club_selection_private.social_post_deletions where post_id=j and club_id=c;
 if coalesce((data->>'finish')::boolean,false) and removed.storage_deleted_at is null then
  if exists(select 1 from storage.objects o join jsonb_array_elements(p.images) i on o.name=i->>'path' where o.bucket_id='club-social-posts')
  then raise exception 'Some stored images have not been deleted yet. Retry deleting the saved post';end if;
  update club_selection_private.social_post_deletions set storage_deleted_at=now() where post_id=j returning * into removed;
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'delete_saved_social_post',jsonb_build_object('post_id',j));
 end if;
 return jsonb_build_object('id',j,'bucket','club-social-posts','paths',coalesce((select jsonb_agg(i->>'path') from jsonb_array_elements(p.images) i),'[]'),'deleted',removed.storage_deleted_at is not null);
end $function$;
revoke all on function club_selection_private.delete_saved_post(uuid,jsonb) from public,anon,authenticated;

create or replace function club_selection_private.saved_post_delete_allowed(n text)
returns boolean language sql stable security definer set search_path='' as $function$
 select auth.uid() is not null and exists(select 1 from club_selection_private.social_post_deletions d
 join club_selection_private.social_posts p on p.id=d.post_id and p.club_id=d.club_id
 where d.storage_deleted_at is null and club_selection_private.social_allowed(d.club_id)
 and exists(select 1 from jsonb_array_elements(p.images) i where i->>'path'=n))
$function$;
revoke all on function club_selection_private.saved_post_delete_allowed(text) from public,anon;
grant execute on function club_selection_private.saved_post_delete_allowed(text) to authenticated;
create policy saved_post_image_delete on storage.objects for delete to authenticated
 using(bucket_id='club-social-posts' and club_selection_private.saved_post_delete_allowed(name));
CREATE OR REPLACE FUNCTION club_selection_private.social_post_view(j uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select to_jsonb(p)||jsonb_build_object('can_delete',club_selection_private.saved_post_can_delete(j),'deletion_pending',exists(select 1 from club_selection_private.social_post_deletions d where d.post_id=j and d.storage_deleted_at is null),'attention',club_selection_private.social_attention_items(p.club_id,p.id),'destinations',coalesce((select jsonb_agg(jsonb_build_object('platform',d.platform,'account_id',d.account_id,'state',d.state,'remote_id',d.remote_id,'permalink',d.permalink,'message',d.message,'updated_at',d.updated_at) order by d.platform) from club_selection_private.social_post_destinations d where d.post_id=p.id),'[]'::jsonb)) from club_selection_private.social_posts p where p.id=j
$function$;
CREATE OR REPLACE FUNCTION club_selection_private.social_post_storage_allowed(n text, writing boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p club_selection_private.social_posts%rowtype;
begin
 if auth.uid() is null or n!~'^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]\.jpg$' then return false;end if;
 select * into p from club_selection_private.social_posts where id=split_part(n,'/',2)::uuid and club_id=split_part(n,'/',1)::uuid;
 return p.id is not null and club_selection_private.social_allowed(p.club_id)
 and exists(select 1 from jsonb_array_elements(p.images) i where i->>'path'=n)
 and (not writing or not exists(select 1 from club_selection_private.social_post_deletions d where d.post_id=p.id))
 and (not writing or (p.state='draft' and p.created_by=auth.uid()));
exception when invalid_text_representation then return false;
end$function$;
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
  'posts',coalesce((select jsonb_agg(club_selection_private.social_post_view(id) order by created_at desc) from (select id,created_at from club_selection_private.social_posts p where club_id=c and not exists(select 1 from club_selection_private.social_post_deletions d where d.post_id=p.id and d.storage_deleted_at is not null) order by created_at desc limit 20) z),'[]'::jsonb));end if;
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
    (select id,week_end,title,rows,image_path,created_at,request->>'blurb' blurb from club_selection_private.team_week_editions where club_id=c and sealed_at is not null and not exists(select 1 from club_selection_private.social_image_deletions d where d.edition_id=club_selection_private.team_week_editions.id) and club_selection_private.award_scope_key(request->'award_scope')=p_data#>>'{award_scope,key}' order by week_end desc,created_at desc limit 100) h),'[]'));
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
