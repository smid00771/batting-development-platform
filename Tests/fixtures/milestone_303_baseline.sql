-- Schema-only .303 baseline for the additive migration regression. No club data.
set check_function_bodies=off;
create table public.club_call_settings(club_id uuid primary key,enabled boolean);
create schema club_selection_private;create schema club_batting_private;
create table public.playing_groups (id uuid default gen_random_uuid(),club_id uuid,name text,sort_order integer default 0,active boolean default true,created_by uuid,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),batting_enabled boolean default false,PRIMARY KEY (id));
create table public.philosophy_workshops (club_id uuid,mode text default 'solo'::text,status text default 'collecting'::text,philosophy_lead_user_id uuid,final_draft_ready boolean default false,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),final_draft_started_at timestamp with time zone,how_we_bat_selected_at timestamp with time zone,how_we_bat_selected_by uuid,how_we_bat_selected_response_ids uuid[],how_we_bat_selection_round integer,how_we_bat_selection_request_id uuid,how_we_bat_selection_fingerprint text,how_we_bat_reopened_at timestamp with time zone,player_plan_completed_at timestamp with time zone,PRIMARY KEY (club_id));
create table public.match_review_scorecards (id uuid default gen_random_uuid(),club_id uuid,source_match_id uuid,fetched_by uuid,scorecard jsonb,created_at timestamp with time zone default clock_timestamp(),PRIMARY KEY (id));
create table club_batting_private.club_message_recipients (message_id uuid,user_id uuid,player_id uuid,opened_at timestamp with time zone,email_id uuid,staff_copy boolean default false,plan_sections jsonb default '[]'::jsonb,email_reason text,deleted_at timestamp with time zone,PRIMARY KEY (message_id, user_id));
create table club_selection_private.access (club_id uuid,mode text default 'bundle'::text,status text default 'disabled'::text,valid_until date,timezone text default 'Australia/Sydney'::text,revision integer default 1,roster_revision integer default 0,updated_at timestamp with time zone default now(),updated_by uuid,active_from date,fixture_defaults jsonb default '{"rows": [], "revision": 0}'::jsonb,head_selector_id uuid,publication_delegate_id uuid,publication_delegate_from date,publication_delegate_until date,grade_levels jsonb default '[]'::jsonb,PRIMARY KEY (club_id));
create table club_selection_private.fixtures (id uuid default gen_random_uuid(),club_id uuid,details jsonb,slots jsonb default '[]'::jsonb,revision integer default 1,published jsonb,publication integer default 0,published_at timestamp with time zone,updated_at timestamp with time zone default now(),updated_by uuid,review jsonb,review_requested_at timestamp with time zone,selection_unlocked_until timestamp with time zone,selection_unlocked_by uuid,scorecard_sync jsonb,UNIQUE (club_id, id),PRIMARY KEY (id));
create table club_batting_private.club_messages (id uuid default gen_random_uuid(),club_id uuid,sender_id uuid,request_id uuid,title text,body text,target text default ''::text,email_requested boolean default false,created_at timestamp with time zone default now(),requested_player_ids uuid[],requested_staff_user_ids uuid[],kind text default 'general'::text,requested_email_user_ids uuid[] default '{}'::uuid[],auto_email_fallback boolean default false,skipped jsonb default '{}'::jsonb,system_key text,sender_deleted_at timestamp with time zone,UNIQUE (club_id, sender_id, request_id),PRIMARY KEY (id));
create table club_selection_private.social_managers (club_id uuid,user_id uuid,PRIMARY KEY (club_id, user_id));
create table club_selection_private.social_posting_delegations (club_id uuid,delegated_by uuid,delegate_id uuid,starts_on date,ends_on date,revision integer default 1,message_id uuid,UNIQUE (message_id),PRIMARY KEY (club_id));
create table club_selection_private.team_week_sources (club_id uuid,source_match_id uuid,team_id uuid,updated_by uuid,PRIMARY KEY (club_id, source_match_id));
create table club_selection_private.social_award_editions (id uuid,club_id uuid,kind text,week_end date,label text,sources jsonb,image_path text,image_sha text,image_bytes integer,request jsonb,created_by uuid,created_at timestamp with time zone default now(),sealed_at timestamp with time zone,UNIQUE (image_path),PRIMARY KEY (id));
create table club_selection_private.social_award_requests (id uuid,club_id uuid,name text,criteria text,artwork_notes text default ''::text,files jsonb default '[]'::jsonb,status text default 'requested'::text,reply text default ''::text,revision integer default 1,requested_by uuid,created_at timestamp with time zone default now(),updated_at timestamp with time zone default now(),PRIMARY KEY (id));
create table club_selection_private.social_award_settings (club_id uuid,enabled text[] default ARRAY['team_week'::text, 'player_week'::text],revision integer default 1,PRIMARY KEY (club_id));
create table club_selection_private.social_award_designs (club_id uuid,kind text,layout jsonb default '{}'::jsonb,revision integer default 1,PRIMARY KEY (club_id, kind));
create table club_selection_private.social_award_portraits (club_id uuid,kind text,player_id text,photo jsonb,revision integer default 1,PRIMARY KEY (club_id, kind, player_id));
create table club_selection_private.fixture_result_sources (fixture_id uuid,club_id uuid,source_match_id uuid,team_id uuid,no_play text,updated_by uuid,updated_at timestamp with time zone default now(),UNIQUE (club_id, source_match_id, team_id),PRIMARY KEY (fixture_id));
create table club_selection_private.playhq_jobs (club_id uuid,kind text,source_id uuid,team_id uuid,due_at timestamp with time zone default now(),lease_id uuid,leased_until timestamp with time zone,attempts integer default 0,last_error text,last_manual_check timestamp with time zone,last_result jsonb,checked_at timestamp with time zone,PRIMARY KEY (club_id, kind, source_id, team_id));
create table club_selection_private.playhq_links (fixture_id uuid,club_id uuid,match_id uuid,season_id uuid,grade_id uuid,team_id uuid,source_fixture jsonb,pending_fixture jsonb,summary jsonb,summary_checked_at timestamp with time zone,result_error text,last_change_token text,import_created boolean default false,original_details jsonb,last_applied_revision integer,import_touched boolean default false,UNIQUE (club_id, match_id, team_id),PRIMARY KEY (fixture_id));
create table club_selection_private.selection_groups (id uuid default gen_random_uuid(),club_id uuid,name text,batting_enabled boolean default false,UNIQUE (club_id, id),PRIMARY KEY (id));
create table club_selection_private.selection_group_grades (club_id uuid,grade_id uuid,selection_group_id uuid,PRIMARY KEY (grade_id));

create table public.qa_staff(club_id uuid,user_id uuid,kind text);
create function club_selection_private.member(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id where m.club_id=c and m.user_id=u and cl.archived_at is null)$$;
create function club_selection_private.enabled(c uuid) returns boolean language sql stable as $$select exists(select 1 from club_selection_private.access where club_id=c and status in ('active','pilot'))$$;
create function club_selection_private.selection_viewer(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.qa_staff where club_id=c and user_id=u and kind='selector')$$;
create function club_selection_private.captain(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.qa_staff where club_id=c and user_id=u and kind='captain')$$;
create function club_selection_private.social_allowed(c uuid) returns boolean language sql stable security definer set search_path='' as $$select club_selection_private.social_allowed_at(c,auth.uid(),now())$$;
create function club_selection_private.api(c uuid,action text,data jsonb) returns jsonb language plpgsql as $$begin if not public.is_club_member(c) then raise exception 'No club access';end if;return jsonb_build_object('enabled',club_selection_private.enabled(c));end$$;
create function club_selection_private.award_scope_key(v jsonb) returns text language sql as $$select coalesce(v->>'mode','all')$$;
create function club_batting_private.message_recipient_allowed(p_message uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from club_batting_private.club_message_recipients where message_id=p_message and user_id=p_user) and case when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'old:%') then true else false end
$$;
CREATE OR REPLACE FUNCTION club_selection_private.social_permanent_allowed(c uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select u is not null and club_selection_private.member(c,u) and club_selection_private.enabled(c)
 and (exists(select 1 from public.club_memberships where club_id=c and user_id=u and permission_role='admin')
 or exists(select 1 from club_selection_private.social_managers where club_id=c and user_id=u))
$function$
;
CREATE OR REPLACE FUNCTION club_selection_private.social_allowed_at(c uuid, u uuid, at_time timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select club_selection_private.member(c,u) and club_selection_private.enabled(c) and (
 club_selection_private.social_permanent_allowed(c,u) or exists(
 select 1 from club_selection_private.social_posting_delegations d join club_selection_private.access a on a.club_id=d.club_id
 where d.club_id=c and d.delegate_id=u and (at_time at time zone a.timezone)::date between d.starts_on and d.ends_on
 and club_selection_private.social_permanent_allowed(c,d.delegated_by)))
$function$
;
CREATE OR REPLACE FUNCTION club_selection_private.social_award_candidates(cards jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 with matches as (
  select x->>'snapshot_id' snapshot_id,x->>'our_team' our_team,x->'scorecard' card
  from jsonb_array_elements(cards) x where x->>'our_team' is not null and x#>>'{scorecard,schema_version}'='2'
   and (x#>>'{scorecard,status}'='completed' or x#>>'{scorecard,award_provisional}'='true')
   and (x#>>'{scorecard,award_provisional}'='true' or not exists(select 1 from jsonb_array_elements(x#>'{scorecard,innings}') i where i->>'complete' is distinct from 'true'))
 ), performances as (
  select m.*, 'century' kind,i->>'id' innings_id,i->>'number' innings_number,b stat
  from matches m cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') b
  where i->>'team_id'=our_team and b->>'importable'='true' and b->>'status'='played' and (b->>'runs')::integer>=100
  union all
  select m.*,'five_wickets',i->>'id',i->>'number',b
  from matches m cross join lateral jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(coalesce(i->'bowlers','[]')) b
  where i->>'team_id'<>our_team and b->>'team_id'=our_team and b->>'importable'='true' and (b->>'wickets')::integer>=5
 ), items as (
  select (case when card->>'award_provisional'='true' then jsonb_build_object('provisional',true) else '{}'::jsonb end)||jsonb_build_object('key',(card->>'match_id')||':results','kind','results','snapshot_id',snapshot_id,'match_id',card->>'match_id',
   'grade',card->>'grade','dates',card->'dates','result',card->>'result','our_team',our_team,'teams',card->'teams','innings',card->'innings') item from matches
  union all
  select (case when card->>'award_provisional'='true' then jsonb_build_object('provisional',true) else '{}'::jsonb end)||jsonb_build_object('key',(card->>'match_id')||':'||kind||':'||innings_id||':'||(stat->>'player_id'),'kind',kind,'snapshot_id',snapshot_id,
   'match_id',card->>'match_id','grade',card->>'grade','dates',card->'dates','player_id',stat->>'player_id','name',stat->>'name',
   'innings_id',innings_id,'innings_number',innings_number,'stat',stat,'opposition',(select t->>'name' from jsonb_array_elements(card->'teams') t where t->>'id'<>our_team limit 1)) from performances
 ) select coalesce(jsonb_agg(item||jsonb_build_object('signature',md5((item-'snapshot_id')::text)) order by item->>'grade',item->>'name',item->>'key'),'[]') from items
$function$
;
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
end $function$
;
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
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.award_scope(c uuid, value jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
end $function$
;
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
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.playhq_results_due(fid uuid, last_checked timestamp with time zone DEFAULT NULL::timestamp with time zone, at_time timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare details jsonb;tz text;previous_finish timestamptz;next_finish timestamptz;final_finish timestamptz;received boolean;cadence interval;
begin
 select f.details,a.timezone into details,tz from club_selection_private.fixtures f left join club_selection_private.access a on a.club_id=f.club_id where f.id=fid;
 if details is null then return at_time+interval '1 day';end if;
 select max(finish) filter(where finish<=at_time),min(finish) filter(where finish>at_time),max(finish)
 into previous_finish,next_finish,final_finish
 from (select club_selection_private.fixture_day_expected_finish(details,d,tz) finish from jsonb_array_elements(coalesce(details->'days','[]')) d) times;
 -- A FINAL provider summary alone is insufficient: wait for the saved scorecard.
 select coalesce((details->>'cancelled')::boolean,false) or exists(
  select 1 from club_selection_private.fixture_result_sources src
  left join lateral (select sc.scorecard from public.match_review_scorecards sc where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id order by sc.created_at desc,sc.id desc limit 1) saved on true
  where src.fixture_id=fid and (src.no_play is not null or saved.scorecard->>'status'='completed')) into received;
 if received and last_checked is not null then
  -- Retain the existing slower refreshes for corrections after results arrive.
  cadence:=case when at_time<=final_finish+interval '3 days' then interval '4 hours' when at_time<=final_finish+interval '14 days' then interval '1 day' else interval '7 days' end;
  return greatest(at_time,last_checked+cadence);
 end if;
 if previous_finish is null then return coalesce(next_finish,at_time+interval '1 day');end if;
 if last_checked is null or last_checked<previous_finish then return at_time;end if;
 cadence:=case when at_time<previous_finish+interval '1 day' then interval '30 minutes' when at_time<previous_finish+interval '7 days' then interval '2 hours' else interval '1 day' end;
 -- A later playing day starts a fresh results-check window, including Day 2.
 return greatest(at_time,least(last_checked+cadence,next_finish));
end $function$
;
-- Check each playing day's results from its expected finish in the club timezone.
-- Expected times schedule downloads; they do not declare a match completed.
create or replace function club_selection_private.fixture_day_expected_finish(details jsonb,day jsonb,tz text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare start_text text:=btrim(coalesce(day->>'start',''));end_text text:=btrim(coalesce(day->>'end',''));
 start_minutes integer;end_minutes integer;overs integer;duration integer;local_day timestamp;
begin
 if coalesce(day->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then return null;end if;
 local_day:=(day->>'date')::date::timestamp;
 if start_text~'^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then start_minutes:=split_part(start_text,':',1)::integer*60+split_part(start_text,':',2)::integer;end if;
 if end_text~'^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then end_minutes:=split_part(end_text,':',1)::integer*60+split_part(end_text,':',2)::integer;end if;
 if end_minutes is not null and (start_minutes is null or end_minutes>start_minutes) then
  return (local_day+make_interval(mins=>end_minutes)) at time zone coalesce(nullif(tz,''),'Australia/Sydney');
 end if;
 -- Same allowances as the selection overlap guard. Unknown starts use 18:00.
 if start_minutes is null then return (local_day+interval '18 hours') at time zone coalesce(nullif(tz,''),'Australia/Sydney');end if;
 overs:=case when coalesce(details->>'overs','')~'^[0-9]{1,3}$' then (details->>'overs')::integer end;
 duration:=case when details->>'format'='t20' then 210 when details->>'format'='limited_overs' and overs>0 then greatest(180,least(600,overs*8+45)) else 480 end;
 return (local_day+make_interval(mins=>start_minutes+duration)) at time zone coalesce(nullif(tz,''),'Australia/Sydney');
end $$;
revoke all on function club_selection_private.fixture_day_expected_finish(jsonb,jsonb,text) from public,anon,authenticated,service_role;


-- Minimal infrastructure around the real award lifecycle for the isolated database.
create schema storage;
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
create table public.match_review_score_links(club_id uuid,source_match_id uuid,snapshot_id uuid,source_innings_id uuid);
create function club_batting_private.scorecard_club_team(c uuid,card jsonb) returns text language sql as $$select null::text$$;
create function club_selection_private.award_scope_cards(c uuid,cards jsonb,scope jsonb) returns jsonb language sql as $$select cards$$;
create function club_selection_private.social_award_collection(c uuid,last_day date) returns setof club_selection_private.social_award_editions language sql as $$select * from club_selection_private.social_award_editions where club_id=c and week_end=last_day and sealed_at is not null$$;
create function club_selection_private.award_edition_scope(c uuid,eid uuid) returns jsonb language sql as $$select request->'award_scope' from club_selection_private.social_award_editions where club_id=c and id=eid$$;
create function club_selection_private.social_award_sources(c uuid) returns setof club_selection_private.social_award_editions language sql as $$select * from club_selection_private.social_award_editions where club_id=c and sealed_at is not null$$;
create table club_selection_private.social_image_deletions(club_id uuid,edition_id uuid,storage_deleted_at timestamptz);
CREATE OR REPLACE FUNCTION club_selection_private.team_week_cards(c uuid, first_day date, last_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('snapshot_id',s.id,'scorecard',s.scorecard,'our_team',coalesce(t.team_id::text,confirmed.team_id,club_batting_private.scorecard_club_team(c,s.scorecard))) order by s.scorecard->>'grade',s.source_match_id),'[]')
 from (select distinct on(source_match_id) * from public.match_review_scorecards where club_id=c order by source_match_id,created_at desc,id desc) s
 left join club_selection_private.team_week_sources t on t.club_id=c and t.source_match_id=s.source_match_id
 left join lateral (
  select case when count(distinct i->>'team_id')=1 then min(i->>'team_id') end team_id
  from public.match_review_score_links l join public.match_review_scorecards original on original.id=l.snapshot_id and original.club_id=c
  cross join lateral jsonb_array_elements(original.scorecard->'innings') i
  where l.club_id=c and l.source_match_id=s.source_match_id and i->>'id'=l.source_innings_id::text
 ) confirmed on true
 where (select max(d) from jsonb_array_elements_text(s.scorecard->'dates') d) between first_day::text and last_day::text
 or (s.scorecard->>'status'='in_progress' and s.scorecard->>'format_key'='long_form' and jsonb_array_length(s.scorecard->'dates')=2 and s.scorecard#>>'{dates,0}' between first_day::text and last_day::text)
$function$
;
CREATE OR REPLACE FUNCTION club_selection_private.award_scorecards(c uuid, cards jsonb, include_provisional boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare wrapped jsonb;card jsonb;inning jsonb;person jsonb;out_cards jsonb:='[]';innings jsonb;batters jsonb;bowlers jsonb;eligible boolean;today date;tz text;
begin
 select coalesce(timezone,'Australia/Sydney') into tz from club_selection_private.access where club_id=c;
 today:=(now() at time zone coalesce(tz,'Australia/Sydney'))::date;
 for wrapped in select * from jsonb_array_elements(coalesce(cards,'[]')) loop
  card:=wrapped->'scorecard';
  eligible:=coalesce(card->>'status'='in_progress' and card->>'format_key'='long_form' and jsonb_array_length(card->'dates')=2
   and (card->'dates'->>0)::date<=today and ((card->'dates'->>0)::date<today or card->>'source_status'='STUMPS')
   and exists(select 1 from jsonb_array_elements(card->'innings') i where jsonb_array_length(coalesce(i->'batters','[]'))>0 or jsonb_array_length(coalesce(i->'bowlers','[]'))>0),false);
  if include_provisional and eligible then
   innings:='[]';
   for inning in select * from jsonb_array_elements(card->'innings') loop
    batters:='[]';bowlers:='[]';
    for person in select * from jsonb_array_elements(coalesce(inning->'batters','[]')) loop
     person:=person||jsonb_build_object('importable',coalesce(nullif(person->>'player_id','') is not null and nullif(person->>'name','') is not null and
      (person->>'status'='did_not_bat' or person->>'status'='played' and coalesce(person->>'runs','')~'^\d{1,4}$' and jsonb_typeof(person->'not_out')='boolean' and coalesce((person->>'figures_valid')::boolean,person->>'importable'='true' or lower(regexp_replace(coalesce(person->>'dismissal',''),'[^a-zA-Z]','','g')) in ('notout','retirednotout','retiredhurt','out','bowled','caught','caughtandbowled','lbw','runout','stumped','hitwicket','retiredout','obstructingthefield','timedout','hittheballtwice','handledtheball'))),false));
     batters:=batters||jsonb_build_array(person);
    end loop;
    for person in select * from jsonb_array_elements(coalesce(inning->'bowlers','[]')) loop
     person:=person||jsonb_build_object('importable',coalesce(nullif(person->>'player_id','') is not null and nullif(person->>'name','') is not null and coalesce(person->>'runs','')~'^\d{1,4}$' and coalesce(person->>'wickets','')~'^([0-9]|10)$',false));
     bowlers:=bowlers||jsonb_build_array(person);
    end loop;
    innings:=innings||jsonb_build_array(inning||jsonb_build_object('batters',batters,'bowlers',bowlers));
   end loop;
   card:=card||jsonb_build_object('innings',innings,'award_provisional',true);
  else card:=card-'award_provisional';end if;
  out_cards:=out_cards||jsonb_build_array(wrapped||jsonb_build_object('scorecard',card,'provisional_available',eligible));
 end loop;
 return out_cards;
end $function$
;
