-- Match Review accepts a verified completed-scorecard lineup without publishing selections.
create or replace function club_batting_private.completed_review_snapshot(c uuid, fixture uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare f club_selection_private.fixtures%rowtype;card jsonb;team jsonb;sid uuid;people jsonb;selected_ids uuid[];source_ids uuid[];tz text;
begin
 select * into f from club_selection_private.fixtures where club_id=c and id=fixture;
 if f.id is null or f.published is not null or f.scorecard_sync->>'source' is distinct from 'completed_scorecard'
  or not club_selection_private.enabled(c)
  or not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.details))
  or coalesce((f.details->>'cancelled')::boolean,false) or coalesce((f.details->>'brackets')::boolean,false) then return null;end if;
 select s.id,s.scorecard into sid,card from club_selection_private.fixture_result_sources src
 join public.match_review_scorecards s on s.club_id=src.club_id and s.source_match_id=src.source_match_id
 where src.club_id=c and src.fixture_id=fixture and src.no_play is null
  and src.source_match_id::text=f.scorecard_sync->>'match_id' and src.team_id::text=f.scorecard_sync->>'team_id'
 order by s.created_at desc,s.id desc limit 1;
 select timezone into tz from club_selection_private.access where club_id=c;
 if sid is null or sid::text is distinct from f.scorecard_sync->>'snapshot_id'
  or card->>'status' is distinct from 'completed' or coalesce(card->>'provider','') not in ('playhq_au','playcricket_au')
  or card->>'match_id' is distinct from f.scorecard_sync->>'match_id'
  or card->>'format_key' is distinct from f.details->>'format'
  or (select jsonb_agg(d->>'date' order by d->>'date') from jsonb_array_elements(f.details->'days') d) is distinct from card->'dates'
  or exists(select 1 from jsonb_array_elements_text(card->'dates') d where d::date>(now() at time zone coalesce(tz,'Australia/Sydney'))::date) then return null;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=f.scorecard_sync->>'team_id';
 if team is null or team->>'lineup_available' is distinct from 'true' or jsonb_array_length(team->'players') not between 1 and 30 then return null;end if;
 select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'source_id',p->>'player_id') order by ord) into people
 from jsonb_array_elements(team->'players') with ordinality x(p,ord)
 left join club_selection_private.scorecard_roster_links l on l.club_id=c and l.source_player_id=(p->>'player_id')::uuid
 left join club_selection_private.roster r on r.club_id=c and r.id=l.roster_id and r.active;
 if exists(select 1 from jsonb_array_elements(people) p where p->>'id' is null or p->>'source_id' is null)
  or (select count(distinct p->>'id') from jsonb_array_elements(people) p)<>jsonb_array_length(people)
  or (select count(distinct p->>'source_id') from jsonb_array_elements(people) p)<>jsonb_array_length(people) then return null;end if;
 select array_agg((p->>'id')::uuid order by p->>'id') into source_ids from jsonb_array_elements(people) p;
 select array_agg((s->>'d1')::uuid order by s->>'d1') into selected_ids from jsonb_array_elements(f.slots) s where s->>'d1' is not null;
 if selected_ids is distinct from source_ids then return null;end if;
 if jsonb_array_length(card->'dates')>1 then
  select array_agg((s->>'d2')::uuid order by s->>'d2') into selected_ids from jsonb_array_elements(f.slots) s where s->>'d2' is not null;
  if selected_ids is distinct from source_ids then return null;end if;
 end if;
 return jsonb_build_object('details',f.details,'slots',f.slots,'players',people,'snapshot_id',sid,'source','completed_scorecard');
end $$;
revoke all on function club_batting_private.completed_review_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION club_batting_private.fixture_review_selection(c uuid, fixture uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f club_selection_private.fixtures%rowtype; selected jsonb; manual club_batting_private.fixture_review_rosters%rowtype; recovered boolean:=false;
begin
 if not club_batting_private.team_review_staff(c) then raise exception 'Current club coaching access is required';end if;
 select * into f from club_selection_private.fixtures where club_id=c and id=fixture;
 if f.id is null then raise exception 'Fixture unavailable in this club';end if;
 if coalesce((f.details->>'cancelled')::boolean,false) then return jsonb_build_object('status','cancelled','players','[]'::jsonb);end if;
 if f.published is null then
  f.published:=club_batting_private.completed_review_snapshot(c,f.id);
  recovered:=f.published is not null;
 end if;
 if f.published is null and (not club_selection_private.enabled(c) or exists(select 1 from club_batting_private.fixture_review_rosters r where r.fixture_id=f.id and r.club_id=c)) then
  select * into manual from club_batting_private.fixture_review_rosters where club_id=c and fixture_id=f.id;
  select coalesce(jsonb_agg(jsonb_build_object('player_id',p.id,'name',p.display_name,'can_edit',public.can_read_coaching_action_player(p.id) and public.can_edit_player(p.id)) order by x.position),'[]'::jsonb) into selected
  from unnest(manual.player_ids) with ordinality x(id,position) join public.players p on p.id=x.id and p.club_id=c and p.active;
  return jsonb_build_object('status','manual','revision',coalesce(manual.revision,0),'fixture_revision',f.revision,'roles',club_selection_private.manual_match_roles(c,f.id),'expires_at',club_selection_private.captain_expires(c,f.details),'players',selected);
 end if;
 if f.published is null then return jsonb_build_object('status','unpublished','fixture_revision',f.revision,'revision',0,'publication',0,'players','[]'::jsonb);end if;
 if coalesce((f.published->'details'->>'cancelled')::boolean,false) then return jsonb_build_object('status','cancelled','publication',f.publication,'players','[]'::jsonb);end if;
 if club_selection_private.fixture_identity(c,f.published->'details') is distinct from club_selection_private.fixture_identity(c,f.details) then
  return jsonb_build_object('status','changed_fixture','publication',f.publication,'players','[]'::jsonb);
 end if;
 with picks as (
  select (v.roster_id)::uuid roster_id,min(s.position) as slot,jsonb_agg(distinct v.day order by v.day) as days
  from jsonb_array_elements(f.published->'slots') with ordinality s(value,position)
  cross join lateral (values(1,s.value->>'d1'),(2,s.value->>'d2')) v(day,roster_id)
  where v.roster_id is not null and v.day<=jsonb_array_length(f.published->'details'->'days')
  group by v.roster_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('roster_id',pick.roster_id,'player_id',linked.id,
  'name',coalesce((select x->>'name' from jsonb_array_elements(f.published->'players') x where x->>'id'=pick.roster_id::text limit 1),r.name,'Selected player'),
  'slot',pick.slot,'days',pick.days,'account_pending',linked.id is not null and linked.user_id is null,'account_link_review',linked.id is not null and linked.user_id is null and r.user_id is not null,'can_edit',linked.id is not null and public.can_read_coaching_action_player(linked.id) and public.can_edit_player(linked.id),
  'link_status',case when linked.id is not null and linked.active_count=1 then case when not(public.can_read_coaching_action_player(linked.id) and public.can_edit_player(linked.id)) then 'no_coaching_access' else null end when r.user_id is null then 'missing_account' when linked.total_count=0 then 'missing_batting_account' when linked.active_count=0 then 'inactive_batting_account' when linked.active_count>1 then 'ambiguous_batting_account' when not(public.can_read_coaching_action_player(linked.id) and public.can_edit_player(linked.id)) then 'no_coaching_access' else null end)
  order by pick.slot,pick.days->>0,pick.roster_id),'[]'::jsonb) into selected
 from picks pick left join club_selection_private.roster r on r.id=pick.roster_id and r.club_id=c
 left join club_batting_private.roster_players rp on rp.roster_id=r.id and rp.club_id=c
 left join lateral(select case when count(*) filter(where p.active)=1 then (array_agg(p.id) filter(where p.active))[1] end id,
 (array_agg(p.user_id) filter(where p.active))[1] user_id,count(*) total_count,count(*) filter(where p.active) active_count
 from public.players p where p.club_id=c and ((rp.player_id is not null and p.id=rp.player_id) or (rp.player_id is null and p.user_id=r.user_id)))linked on true;
 return jsonb_build_object('status',case when recovered then 'scorecard' else 'published' end,'publication',f.publication,'fixture_revision',f.revision,'snapshot_id',case when recovered then f.published->'snapshot_id' end,'players',selected);
end $function$;

CREATE OR REPLACE FUNCTION club_batting_private.ensure_review_players(c uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r club_selection_private.roster%rowtype;pid uuid;u uuid;n integer;active_n integer;
begin
 if not club_batting_private.team_review_staff(c) then raise exception 'Current club coaching access is required';end if;
 if not coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 -- Existing verified signups are attached before new records are considered.
 perform club_selection_private.sync_players(c,null);
 for r in with recovered as materialized (
  select club_batting_private.completed_review_snapshot(c,f.id) snapshot from club_selection_private.fixtures f
  where f.club_id=c and f.published is null and f.scorecard_sync->>'source'='completed_scorecard'
 ) select rp.* from club_selection_private.roster rp where rp.club_id=c and rp.active and (
 exists(select 1 from club_selection_private.fixtures f where f.club_id=c and f.published is not null
  and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))
  and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
  and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
  and exists(select 1 from jsonb_array_elements(f.published->'slots') s where s->>'d1'=rp.id::text or (jsonb_array_length(f.published->'details'->'days')>1 and s->>'d2'=rp.id::text)))
 or exists(select 1 from recovered f cross join lateral jsonb_array_elements(f.snapshot->'slots') s
  where s->>'d1'=rp.id::text or (jsonb_array_length(f.snapshot->'details'->'days')>1 and s->>'d2'=rp.id::text))
 or exists(select 1 from club_selection_private.season_appointments a join public.playing_groups g on g.id=a.group_id and g.club_id=c and g.active and g.batting_enabled where a.club_id=c and a.captain_roster_id=rp.id))
 order by rp.id
 loop
  select player_id into pid from club_batting_private.roster_players where roster_id=r.id and club_id=c;
  if pid is not null then perform club_batting_private.claim_roster_player(c,r.id);continue;end if;
  select count(*),count(*) filter(where active),(array_agg(id) filter(where active))[1]
   into n,active_n,pid from public.players where club_id=c and user_id=r.user_id;
  if n>0 and (active_n<>1 or n<>1) then continue;end if;
  u:=case when club_batting_private.verified_roster_user(c,r.user_id) then r.user_id end;
  if n>0 and u is null then continue;end if;
  if pid is null then
   insert into public.players(club_id,user_id,display_name,grade,active)
   values(c,u,r.name,nullif(r.grade,''),true) returning id into pid;
  end if;
  insert into club_batting_private.roster_players(roster_id,club_id,player_id,claimed_user_id,claimed_at)
   values(r.id,c,pid,u,case when u is not null then now() end);
 end loop;
end $function$;

CREATE OR REPLACE FUNCTION club_batting_private.assert_fixture_review_players(c uuid, fixture uuid, ids jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare selection jsonb;
begin
 if jsonb_array_length(ids)=0 then return;end if;
 selection:=club_batting_private.fixture_review_selection(c,fixture);
 if selection->>'status' not in ('published','manual','scorecard') then raise exception 'No confirmed match team. Publish a selection, use a completed linked scorecard, or save the match team in Club Batting before adding a team review.';end if;
 if exists(select 1 from jsonb_array_elements_text(ids) id where not exists(select 1 from jsonb_array_elements(selection->'players') p where p->>'player_id'=id)) then
  raise exception 'The match team has changed, or this player is not in it. Refresh the team before saving.';
 end if;
end $function$;
CREATE OR REPLACE FUNCTION club_batting_private.roster_coaching_access(c uuid, pid uuid, u uuid, editing boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select u is not null and club_selection_private.member(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 and exists(select 1 from club_batting_private.roster_players rp join club_selection_private.roster r on r.id=rp.roster_id and r.club_id=c and r.active
 join (select fx.details,coalesce(fx.published,club_batting_private.completed_review_snapshot(c,fx.id)) published from club_selection_private.fixtures fx where fx.club_id=c) f on f.published is not null
 and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))
 join public.club_access_grants g on g.club_id=c and g.user_id=u
 where rp.club_id=c and rp.player_id=pid and (case when editing then g.can_edit else g.can_view end)
 and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
 and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
 and ((g.scope='playing_group' and g.playing_group_id=club_selection_private.fixture_group_id(c,f.published->'details'))
 or (g.scope='grade' and g.grade=f.published->'details'->>'grade'))
 and exists(select 1 from jsonb_array_elements(f.published->'slots') s where s->>'d1'=r.id::text or (jsonb_array_length(f.published->'details'->'days')>1 and s->>'d2'=r.id::text)))
$function$;

CREATE OR REPLACE FUNCTION club_batting_private.player_uses_batting(c uuid, pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.players p where p.club_id=c and p.id=pid and p.active and (
  not exists(select 1 from club_selection_private.access a where a.club_id=c)
  or exists(select 1 from club_batting_private.selection_plan_dates pd where pd.club_id=c and pd.player_id=pid and pd.active and pd.season_key=club_batting_private.selection_plan_season(c)) or exists(select 1 from public.player_playing_groups x join public.playing_groups g on g.id=x.playing_group_id and g.club_id=c and g.active and g.batting_enabled where x.club_id=c and x.player_id=p.id)
  or exists(select 1 from club_selection_private.roster r left join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=r.id
   join (select fx.details,coalesce(fx.published,club_batting_private.completed_review_snapshot(c,fx.id)) published from club_selection_private.fixtures fx where fx.club_id=c) f on f.published is not null
   where r.club_id=c and r.active and (rp.player_id=p.id or (rp.player_id is null and r.user_id=p.user_id))
   and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
   and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
   and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))
   and exists(select 1 from jsonb_array_elements(f.published->'slots') s where s->>'d1'=r.id::text or s->>'d2'=r.id::text))
 ))
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.season_captain_player(c uuid, pid uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select club_selection_private.member(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 and exists(select 1 from public.players p where p.id=pid and p.club_id=c and p.active
 and exists(select 1 from club_selection_private.season_appointments a join public.playing_groups g on g.id=a.group_id and g.club_id=c and g.active
 where a.club_id=c and u=any(club_selection_private.season_captains(c,a.group_id)) and (
 exists(select 1 from public.player_playing_groups x where x.club_id=c and x.player_id=p.id and x.playing_group_id=g.id)
 or exists(select 1 from club_selection_private.fixtures f where f.club_id=c and club_selection_private.fixture_group_id(c,f.details)=g.id and not coalesce((f.details->>'cancelled')::boolean,false) and (
 (f.published is null and exists(select 1 from jsonb_array_elements(club_batting_private.completed_review_snapshot(c,f.id)->'slots') s join club_batting_private.roster_players rp on rp.club_id=c and rp.player_id=p.id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)))
 or (f.published is null and exists(select 1 from club_batting_private.fixture_review_rosters r where r.fixture_id=f.id and r.club_id=c and p.id=any(r.player_ids)))
 or(f.published is not null and not coalesce((f.published->'details'->>'cancelled')::boolean,false) and exists(select 1 from jsonb_array_elements(f.published->'slots') s join club_selection_private.roster r on r.club_id=c and (r.user_id=p.user_id or exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id and rp.club_id=c and rp.player_id=p.id)) and r.active and (s->>'d1'=r.id::text or s->>'d2'=r.id::text)))
 )))))
$function$;
