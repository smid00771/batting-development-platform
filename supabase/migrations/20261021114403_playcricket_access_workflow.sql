-- A club-owned access request. No keys, provider responses or request bodies are stored here.
create table club_selection_private.playhq_access_requests (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 association text not null default '' check(length(association)<=160),
 club_url text not null default '' check(length(club_url)<=500),
 contact_name text not null default '' check(length(contact_name)<=100),
 contact_email text not null default '' check(length(contact_email)<=254),
 contact_role text not null default '' check(length(contact_role)<=100),
 requested_at timestamptz, requested_by uuid references auth.users(id),
 revision integer not null default 1,updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id)
);
alter table club_selection_private.playhq_access_requests enable row level security;
revoke all on club_selection_private.playhq_access_requests from public,anon,authenticated,service_role;

create function public.playhq_onboarding(p_club_id uuid,p_action text default 'context',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();r club_selection_private.playhq_access_requests%rowtype;
 conn club_selection_private.playhq_connections%rowtype;details jsonb;rid uuid;receipt club_selection_private.requests%rowtype;
begin
 if me is null or not club_selection_private.member(p_club_id,me) or not public.is_club_admin(p_club_id) then
  raise exception using errcode='42501',message='Club Admin manages the PlayCricket connection';
 end if;
 if not exists(select 1 from club_selection_private.access where club_id=p_club_id) then raise exception 'Club Selections access is required';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>5000 then raise exception 'Invalid access request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,9200));
 select * into r from club_selection_private.playhq_access_requests where club_id=p_club_id;
 select * into conn from club_selection_private.playhq_connections where club_id=p_club_id;
 if p_action='context' then
  return jsonb_build_object('club_name',(select name from public.clubs where id=p_club_id),
   'revision',coalesce(r.revision,0),'requested_at',r.requested_at,
   'request',jsonb_build_object('association',coalesce(r.association,''),'club_url',coalesce(r.club_url,''),
    'contact_name',coalesce(r.contact_name,(select display_name from public.user_profiles where user_id=me),''),
    'contact_email',coalesce(r.contact_email,(select email from auth.users where id=me),''),'contact_role',coalesce(r.contact_role,'')),
   'configured',conn.club_id is not null,'verified',conn.verified_at is not null,
   'connection_version',conn.generation,'organisation_id',conn.organisation_id,'association_id',conn.association_id,
   'polling_enabled',coalesce(conn.polling_enabled,false),'error',conn.last_error,
   'state',case when conn.verified_at is not null then 'connected' when conn.club_id is not null then 'needs_check' when r.requested_at is not null then 'awaiting_key' else 'not_requested' end);
 elsif p_action='configure' then
  rid:=nullif(p_data->>'request_id','')::uuid;if rid is null then raise exception 'Connection request ID required';end if;
  details:=jsonb_build_object('organisation_id',p_data->>'organisation_id','association_id',p_data->>'association_id','authorised',p_data->'authorised');
  select * into receipt from club_selection_private.requests where club_id=p_club_id and user_id=me and request_id=rid;
  if found then
   if receipt.action<>'playhq_connect' or receipt.payload<>details then raise exception 'Connection request ID already used';end if;
   if receipt.result->>'connection_version' is distinct from conn.generation::text then raise exception 'Another connection was saved. Reload before continuing';end if;
   return public.playhq_onboarding(p_club_id);
  end if;
  if p_data->>'connection_version' is distinct from conn.generation::text then raise exception 'The connection changed. Reload before replacing its credentials';end if;
  if p_data->'authorised' is distinct from 'true'::jsonb then raise exception 'Confirm these credentials were issued for your club';end if;
  perform public.playhq_sync_api(p_club_id,'configure',jsonb_build_object(
   'organisation_id',p_data->>'organisation_id','association_id',p_data->>'association_id','api_key',p_data->>'api_key'));
  select * into conn from club_selection_private.playhq_connections where club_id=p_club_id;
  insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result,created_at)
   values(p_club_id,me,rid,'playhq_connect',details,jsonb_build_object('connection_version',conn.generation),now());
 elsif p_action in ('save_request','mark_requested','clear_requested') then
  -- Repeating the confirmation after an uncertain response does not change its date.
  if p_action='mark_requested' and r.requested_at is not null then return public.playhq_onboarding(p_club_id);end if;
  if coalesce((p_data->>'revision')::integer,-1)<>coalesce(r.revision,0) then raise exception 'The request changed. Reload before saving';end if;
  if p_action='save_request' then
   if r.requested_at is not null then raise exception 'Clear the sent status before changing this request';end if;
   details:=p_data->'request';
   if jsonb_typeof(details) is distinct from 'object' then raise exception 'Enter the club contact details';end if;
   if exists(select 1 from jsonb_object_keys(details) k where k not in ('association','club_url','contact_name','contact_email','contact_role')) then raise exception 'Unexpected request field';end if;
   if length(btrim(coalesce(details->>'association',''))) not between 1 and 160
    or length(btrim(coalesce(details->>'contact_name',''))) not between 1 and 100
    or length(btrim(coalesce(details->>'contact_role',''))) not between 1 and 100
    or length(btrim(coalesce(details->>'contact_email',''))) not between 3 and 254
    or btrim(details->>'contact_email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter your association, name, role and email';end if;
   if length(coalesce(details->>'club_url',''))>500 or (coalesce(details->>'club_url','')<>'' and (details->>'club_url')!~'^https://(www\.)?(playhq\.com|play\.cricket\.com\.au)/[^[:space:]]*$') then raise exception 'Use the club’s public PlayHQ or PlayCricket link';end if;
   insert into club_selection_private.playhq_access_requests(club_id,association,club_url,contact_name,contact_email,contact_role,updated_by)
    values(p_club_id,btrim(details->>'association'),coalesce(details->>'club_url',''),btrim(details->>'contact_name'),btrim(details->>'contact_email'),btrim(details->>'contact_role'),me)
    on conflict(club_id) do update set association=excluded.association,club_url=excluded.club_url,contact_name=excluded.contact_name,
     contact_email=excluded.contact_email,contact_role=excluded.contact_role,revision=playhq_access_requests.revision+1,updated_at=now(),updated_by=me;
  elsif p_action='mark_requested' then
   if r.club_id is null then raise exception 'Prepare the request first';end if;
   if p_data->'authorised' is distinct from 'true'::jsonb then raise exception 'Confirm you sent this request on behalf of the club';end if;
   update club_selection_private.playhq_access_requests set requested_at=now(),requested_by=me,revision=revision+1,updated_at=now(),updated_by=me where club_id=p_club_id;
  else
   update club_selection_private.playhq_access_requests set requested_at=null,requested_by=null,revision=revision+1,updated_at=now(),updated_by=me where club_id=p_club_id;
  end if;
 else raise exception 'Unknown access request action';end if;
 return public.playhq_onboarding(p_club_id);
end $$;
revoke all on function public.playhq_onboarding(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.playhq_onboarding(uuid,text,jsonb) to authenticated;
