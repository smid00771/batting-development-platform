-- A match-day fact shared by all observers and innings; never an author-owned note.
create table club_batting_private.match_arrivals (
 fixture_id uuid not null references club_selection_private.fixtures(id),
 player_id uuid not null references public.players(id),
 club_id uuid not null references public.clubs(id),
 late boolean not null default false,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id),
 discussed_at timestamptz,
 discussed_by uuid references auth.users(id),
 primary key(fixture_id,player_id),
 check((discussed_at is null)=(discussed_by is null))
);
create index match_arrivals_club_player on club_batting_private.match_arrivals(club_id,player_id);
create index match_arrivals_player on club_batting_private.match_arrivals(player_id);
create index match_arrivals_updated_by on club_batting_private.match_arrivals(updated_by);
create index match_arrivals_discussed_by on club_batting_private.match_arrivals(discussed_by) where discussed_by is not null;
alter table club_batting_private.match_arrivals enable row level security;
revoke all on club_batting_private.match_arrivals from public,anon,authenticated;

-- Receipts are also the audit trail. A retry must not overwrite a newer correction.
create table club_batting_private.match_arrival_requests (
 club_id uuid not null references public.clubs(id),
 actor_id uuid not null references auth.users(id),
 request_id uuid not null,
 command jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(club_id,actor_id,request_id)
);
create index match_arrival_requests_actor on club_batting_private.match_arrival_requests(actor_id);
alter table club_batting_private.match_arrival_requests enable row level security;
revoke all on club_batting_private.match_arrival_requests from public,anon,authenticated;

create function club_batting_private.match_arrivals_api(c uuid,action text,data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();fid uuid;pid uuid;gid uuid;ids uuid[];identity jsonb;f club_selection_private.fixtures%rowtype;
 r club_batting_private.match_arrivals%rowtype;receipt club_batting_private.match_arrival_requests%rowtype;
 req uuid;command jsonb;result jsonb;item jsonb;wanted boolean;expected integer;
 today date;season_from date;season_to date;month integer;rows jsonb;
begin
 if u is null or not club_batting_private.team_review_staff(c)
 or not coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 then raise exception 'Current club coaching access is required' using errcode='42501';end if;
 if action not in ('get','save','roll','discuss') or action is null or jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>32768 then raise exception 'Invalid arrival request';end if;
 today:=(now() at time zone coalesce((select timezone from club_selection_private.access where club_id=c),'Australia/Sydney'))::date;
 month:=coalesce((select season_start_month from public.club_call_settings where club_id=c),7);
 season_from:=make_date(extract(year from today)::int,month,1);
 if today<season_from then season_from:=(season_from-interval '1 year')::date;end if;
 season_to:=(season_from+interval '1 year')::date;
 if action='roll' then
  with permitted as materialized (
   select a.*,p.display_name,fx.details, (fx.details#>>'{days,0,date}')::date match_date
   from club_batting_private.match_arrivals a
   join public.players p on p.id=a.player_id and p.club_id=c and p.active
   join club_selection_private.fixtures fx on fx.id=a.fixture_id and fx.club_id=c
   where a.club_id=c and a.late
    and (fx.details#>>'{days,0,date}')::date>=season_from and (fx.details#>>'{days,0,date}')::date<season_to
    and not coalesce((fx.details->>'cancelled')::boolean,false)
    and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,fx.details))
    and public.can_read_coaching_action_player(p.id) and public.can_edit_player(p.id)
  ), people as (
   select player_id,display_name,count(*) count,count(*) filter(where discussed_at is null) outstanding,
    jsonb_agg(jsonb_build_object('fixture_id',fixture_id,'revision',revision,'match_date',match_date,
     'grade',details->>'grade','opposition',details->>'opposition','discussed_at',discussed_at) order by match_date desc,fixture_id) matches
   from permitted group by player_id,display_name
  )
  select coalesce(jsonb_agg(to_jsonb(people) order by (count>=2 and outstanding>0) desc,outstanding>0 desc,count desc,display_name,player_id),'[]') into rows from people;
  return jsonb_build_object('players',rows,'season_from',season_from,'season_to',season_to-1,'repeat_threshold',2);
 end if;
 if action in ('save','discuss') then
  req:=nullif(data->>'request_id','')::uuid;
  if req is null then raise exception 'Provide an arrival save request';end if;
  command:=jsonb_build_object('action',action,'data',data);
  -- Same lock order as fixture creation and other Match Review saves.
  perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 end if;
 if action='discuss' then
  pid:=(data->>'player_id')::uuid;
  if not exists(select 1 from public.players where id=pid and club_id=c and active)
   or not(public.can_read_coaching_action_player(pid) and public.can_edit_player(pid)) then raise exception 'Coaching edit access is required for this player' using errcode='42501';end if;
 else
  if jsonb_typeof(data->'player_ids') is distinct from 'array' or jsonb_array_length(data->'player_ids') not between 1 and 100 then raise exception 'Choose the players for this match';end if;
  select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(data->'player_ids');
  if exists(select 1 from unnest(ids) requested(player_id) where not exists(select 1 from public.players p where p.id=requested.player_id and p.club_id=c and p.active and public.can_read_coaching_action_player(p.id) and public.can_edit_player(p.id))) then raise exception 'Coaching edit access is required for these players' using errcode='42501';end if;
  if action='save' and cardinality(ids)<>1 then raise exception 'Save one player at a time';end if;
 end if;
 if action in ('save','discuss') then
  select * into receipt from club_batting_private.match_arrival_requests where club_id=c and actor_id=u and request_id=req;
  if found then
   if receipt.command<>command then raise exception 'This save request belongs to different arrival choices';end if;
   return receipt.result;
  end if;
 end if;
 if action='discuss' then
  if jsonb_typeof(data->'matches') is distinct from 'array' or jsonb_array_length(data->'matches') not between 1 and 200 then raise exception 'Choose the late arrivals you have discussed';end if;
  for item in select value from jsonb_array_elements(data->'matches') loop
   select a.* into r from club_batting_private.match_arrivals a join club_selection_private.fixtures fx on fx.id=a.fixture_id and fx.club_id=c
   where a.club_id=c and a.player_id=pid and a.fixture_id=(item->>'fixture_id')::uuid
    and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,fx.details)) for update of a;
   if not found or not r.late then raise exception 'An arrival changed. Reload the late-arrivals list.' using errcode='40001';end if;
   if r.discussed_at is null then
    if r.revision is distinct from (item->>'revision')::integer then raise exception 'An arrival changed. Reload the late-arrivals list.' using errcode='40001';end if;
    update club_batting_private.match_arrivals set discussed_at=now(),discussed_by=u,revision=revision+1
     where fixture_id=r.fixture_id and player_id=pid;
   end if;
  end loop;
  result:=jsonb_build_object('discussed',true,'player_id',pid);
 else
  fid:=nullif(data->>'fixture_id','')::uuid;gid:=nullif(data->>'group_id','')::uuid;identity:=data->'identity';
  if fid is not null then
   select * into f from club_selection_private.fixtures where id=fid and club_id=c;
   if f.id is null then raise exception 'Fixture unavailable in this club';end if;
   gid:=club_selection_private.fixture_group_id(c,f.details);
   if (nullif(data->>'group_id','') is not null and (data->>'group_id')::uuid<>gid)
    or (jsonb_typeof(identity)='object' and club_selection_private.fixture_identity(c,f.details) is distinct from jsonb_build_object('group_id',gid,'match_date',identity->>'match_date','format_key',identity->>'format_key','opposition',club_batting_private.innings_opposition_key(identity->>'opposition'))) then
    raise exception 'The match details changed. Reload this fixture before recording arrival.' using errcode='40001';
   end if;
  else
   if gid is null or jsonb_typeof(identity) is distinct from 'object' or coalesce(identity->>'opposition','')='' then raise exception 'Choose the match and grade first';end if;
   if action='save' then
    fid:=club_batting_private.resolve_review_fixture(c,gid,identity,null);
    select * into f from club_selection_private.fixtures where id=fid and club_id=c;
   else
    select array_agg(id) into ids from club_selection_private.fixtures where club_id=c
     and club_selection_private.fixture_identity(c,details)=jsonb_build_object('group_id',gid,'match_date',identity->>'match_date','format_key',identity->>'format_key','opposition',club_batting_private.innings_opposition_key(identity->>'opposition'));
    if cardinality(ids)>1 then raise exception 'More than one fixture matches. Choose the saved fixture.';end if;
    fid:=ids[1];select * into f from club_selection_private.fixtures where id=fid and club_id=c;
   end if;
  end if;
  if not exists(select 1 from public.playing_groups where id=gid and club_id=c and active)
   or not coalesce(club_batting_private.group_uses_batting(c,gid),false) then raise exception 'Choose a Club Batting team';end if;
  if coalesce((f.details->>'cancelled')::boolean,false) then raise exception 'This match is cancelled';end if;
  select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(data->'player_ids');
  if action='get' then
   select jsonb_agg(jsonb_build_object('player_id',p,'late',coalesce(a.late,false),'revision',coalesce(a.revision,0),'discussed_at',a.discussed_at)) into rows
    from unnest(ids) p left join club_batting_private.match_arrivals a on a.player_id=p and a.fixture_id=fid and a.club_id=c;
   return jsonb_build_object('fixture_id',fid,'players',rows);
  end if;
  if (f.details#>>'{days,0,date}')::date>today then raise exception 'Record arrival on or after the match day';end if;
  if jsonb_typeof(data->'late') is distinct from 'boolean' or jsonb_typeof(data->'revision') is distinct from 'number' then raise exception 'Provide the arrival choice and revision';end if;
  pid:=ids[1];wanted:=(data->>'late')::boolean;expected:=(data->>'revision')::integer;
  select * into r from club_batting_private.match_arrivals where fixture_id=fid and player_id=pid and club_id=c for update;
  if coalesce(r.late,false) is distinct from wanted then
   if coalesce(r.revision,0)<>expected then raise exception 'The arrival record changed. Reload before changing it.' using errcode='40001';end if;
   insert into club_batting_private.match_arrivals(fixture_id,player_id,club_id,late,updated_by)
    values(fid,pid,c,wanted,u)
   on conflict(fixture_id,player_id) do update set late=excluded.late,revision=match_arrivals.revision+1,
    updated_at=now(),updated_by=u,discussed_at=null,discussed_by=null returning * into r;
  end if;
  result:=jsonb_build_object('fixture_id',fid,'player_id',pid,'late',coalesce(r.late,false),'revision',coalesce(r.revision,0),'discussed_at',r.discussed_at);
 end if;
 insert into club_batting_private.match_arrival_requests(club_id,actor_id,request_id,command,result) values(c,u,req,command,result);
 return result;
end $$;
revoke all on function club_batting_private.match_arrivals_api(uuid,text,jsonb) from public,anon,authenticated;
create function public.match_arrivals_api(p_club_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security definer set search_path='' as $$select club_batting_private.match_arrivals_api(p_club_id,p_action,p_data)$$;
revoke all on function public.match_arrivals_api(uuid,text,jsonb) from public,anon;
grant execute on function public.match_arrivals_api(uuid,text,jsonb) to authenticated;
