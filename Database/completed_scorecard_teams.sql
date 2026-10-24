-- A completed, explicitly linked scorecard can record an unpublished actual XI.
-- This does not publish selections, send team messages, or merge player accounts.
create or replace function club_selection_private.recover_completed_scorecard_team(c uuid,sid uuid,fid uuid,tid uuid,actor uuid) returns boolean
language plpgsql set search_path='' as $$
#variable_conflict use_column
declare f club_selection_private.fixtures%rowtype;card jsonb;team jsonb;d jsonb;people jsonb;actual_slots jsonb;meta jsonb;timezone text;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
  or not club_selection_private.enabled(c) then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into f from club_selection_private.fixtures x where x.id=fid and x.club_id=c for update;
 select s.scorecard into card from public.match_review_scorecards s where s.id=sid and s.club_id=c;
 if f.id is null or f.published is not null or card->>'status' is distinct from 'completed'
  or card->>'provider' not in ('playhq_au','playcricket_au') then return false;end if;
 d:=f.details;
 select a.timezone into timezone from club_selection_private.access a where a.club_id=c;
 if coalesce((d->>'cancelled')::boolean,false) or coalesce((d->>'brackets')::boolean,false)
  or d->>'format' is distinct from card->>'format_key'
  or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(d->'days') day) is distinct from card->'dates'
  or exists(select 1 from jsonb_array_elements_text(card->'dates') day where day::date>(now() at time zone coalesce(timezone,'Australia/Sydney'))::date)
  or (f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>card->>'match_id')
  or not exists(select 1 from club_selection_private.fixture_result_sources src where src.club_id=c and src.fixture_id=fid
   and src.source_match_id=(card->>'match_id')::uuid and src.team_id=tid and src.no_play is null)
  or exists(select 1 from public.match_review_scorecards newer join public.match_review_scorecards original on original.id=sid
   where newer.club_id=c and newer.source_match_id=original.source_match_id and (newer.created_at,newer.id)>(original.created_at,original.id))
 then return false;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text;
 if team->>'lineup_available' is distinct from 'true' or jsonb_array_length(team->'players') not between 1 and 30 then return false;end if;
 -- Use only confirmed, club-scoped identities. Never create or rename a person here.
 select jsonb_agg(jsonb_build_object('source_id',p->>'player_id','roster_id',r.id,'name',p->>'name','days',card->'dates')
  order by coalesce((select min(n) from jsonb_array_elements(f.slots) with ordinality old(slot,n)
   where slot->>'d1'=r.id::text or slot->>'d2'=r.id::text),1000),ord) into people
 from jsonb_array_elements(team->'players') with ordinality source(p,ord)
 left join club_selection_private.scorecard_roster_links l on l.club_id=c and l.source_player_id=(p->>'player_id')::uuid
 left join club_selection_private.roster r on r.club_id=c and r.id=l.roster_id and r.active;
 if exists(select 1 from jsonb_array_elements(people) p where p->>'roster_id' is null or p->>'source_id' is null)
  or (select count(distinct p->>'roster_id') from jsonb_array_elements(people) p)<>jsonb_array_length(people)
  or (select count(distinct p->>'source_id') from jsonb_array_elements(people) p)<>jsonb_array_length(people) then return false;end if;
 -- A conflict in another team needs the existing team review, not an automatic transfer.
 if exists(select 1 from club_selection_private.fixtures other
  cross join lateral jsonb_array_elements(jsonb_build_array(jsonb_build_object('details',other.details,'slots',other.slots))
    ||case when other.published is null then '[]'::jsonb else jsonb_build_array(other.published) end) state
  cross join lateral jsonb_array_elements(state->'slots') slot
  cross join lateral jsonb_array_elements(people) p
  where other.club_id=c and other.id<>fid and not coalesce((state#>>'{details,cancelled}')::boolean,false)
   and ((slot->>'d1'=p->>'roster_id' and card->'dates' ? (state#>>'{details,days,0,date}'))
    or (slot->>'d2'=p->>'roster_id' and card->'dates' ? (state#>>'{details,days,1,date}')))) then return false;end if;
 select jsonb_agg(jsonb_build_object('d1',people->i->'roster_id','d2',case when jsonb_array_length(card->'dates')>1 then people->i->'roster_id' else 'null'::jsonb end) order by i)
 into actual_slots from generate_series(0,greatest(10,jsonb_array_length(people)-1)) i;
 meta:=coalesce(f.scorecard_sync,'{}')||jsonb_build_object('match_id',card->>'match_id','team_id',tid,'snapshot_id',sid,
  'url',card->>'url','pending','[]'::jsonb,'players',people,'source','completed_scorecard');
 if f.slots=actual_slots and f.scorecard_sync is not distinct from meta then return false;end if;
 update club_selection_private.fixtures set slots=actual_slots,details=club_selection_private.scorecard_team_details(c,d,actual_slots),
  scorecard_sync=meta,revision=revision+1,updated_at=now(),updated_by=actor where id=fid and club_id=c;
 update club_batting_private.fixture_review_rosters m set
  player_ids=coalesce((select array_agg(distinct rp.player_id) from club_batting_private.roster_players rp
   where rp.club_id=c and exists(select 1 from jsonb_array_elements(people) p where p->>'roster_id'=rp.roster_id::text)),'{}'),
  captain_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(people) p where rp.club_id=c and rp.player_id=m.captain_player_id and p->>'roster_id'=rp.roster_id::text) then m.captain_player_id end,
  keeper_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(people) p where rp.club_id=c and rp.player_id=m.keeper_player_id and p->>'roster_id'=rp.roster_id::text) then m.keeper_player_id end,
  revision=revision+1,updated_at=now(),updated_by=actor where m.club_id=c and m.fixture_id=fid;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,actor,'completed_scorecard_team',
  jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'before_slots',f.slots,'slots',actual_slots));
 return true;
end $$;
revoke all on function club_selection_private.recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION club_selection_private.link_selected_scorecard_players(c uuid, sid uuid, fid uuid, tid uuid, actor uuid, apply_links boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
<<link_state>>
declare
 card jsonb; team jsonb; f club_selection_private.fixtures%rowtype; d jsonb; picks jsonb;
 person jsonb; rid uuid; pid uuid; source_id uuid; name_key text; candidates uuid[];
 linked jsonb:='[]'; changed integer:=0; added integer; club_timezone text;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
  or not club_selection_private.enabled(c) then return '[]'::jsonb;end if;
 if apply_links then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 select s.scorecard into card from public.match_review_scorecards s where s.id=sid and s.club_id=c;
 select * into f from club_selection_private.fixtures x where x.id=fid and x.club_id=c;
 if card is null or f.id is null or card->>'status'<>'completed' then return '[]'::jsonb;end if;
 if exists(select 1 from public.match_review_scorecards newer join public.match_review_scorecards original on original.id=sid
  where newer.club_id=c and newer.source_match_id=original.source_match_id and (newer.created_at,newer.id)>(original.created_at,original.id)) then return '[]'::jsonb;end if;
 d:=coalesce(f.published->'details',f.details);picks:=coalesce(f.published->'slots',f.slots);
 select a.timezone into club_timezone from club_selection_private.access a where a.club_id=c;
 if exists(select 1 from jsonb_array_elements_text(card->'dates') day where day::date>(now() at time zone coalesce(club_timezone,'Australia/Sydney'))::date)
  or coalesce((d->>'cancelled')::boolean,false) or d->>'format' is distinct from card->>'format_key'
  or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(d->'days') day) is distinct from card->'dates'
  or not exists(select 1 from club_selection_private.fixture_result_sources s where s.club_id=c and s.fixture_id=fid
   and s.source_match_id=(card->>'match_id')::uuid and s.team_id=tid and s.no_play is null)
 then return '[]'::jsonb;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text;
 if team is null or jsonb_typeof(team->'players') is distinct from 'array' then return '[]'::jsonb;end if;
 for person in select p from jsonb_array_elements(team->'players') p where p->>'player_id' is not null and nullif(btrim(p->>'name'),'') is not null loop
  source_id:=(person->>'player_id')::uuid;
  name_key:=club_selection_private.account_name_key(person->>'name');
  -- At least a complete given name and surname, unique on both lists.
  if name_key !~ '^[[:alpha:]][[:alpha:]''’-]+[[:space:]]+[[:alpha:]][[:alpha:]''’ -]+$'
   or (select count(*) from jsonb_array_elements(team->'players') p where club_selection_private.account_name_key(p->>'name')=name_key)<>1
   or (select count(*) from jsonb_array_elements(team->'players') p where p->>'player_id'=source_id::text)<>1 then continue;end if;
  select array_agg(r.id) into candidates from club_selection_private.roster r
   where r.club_id=c and r.active and club_selection_private.account_name_key(r.name)=name_key;
  if cardinality(candidates) is distinct from 1 then continue;end if;
  rid:=candidates[1];
  if not exists(select 1 from jsonb_array_elements(picks) slot where slot->>'d1'=rid::text or slot->>'d2'=rid::text) then continue;end if;
  -- A future or duplicate identity must never claim an existing source mapping.
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and
   ((s.source_player_id=source_id and s.roster_id<>rid) or (card->>'provider' is distinct from 'playhq_au' and s.roster_id=rid and s.source_player_id<>source_id))) then continue;end if;
  select case when count(*)=1 then min(rp.player_id::text)::uuid end into pid
   from club_batting_private.roster_players rp where rp.club_id=c and rp.roster_id=rid;
  if exists(select 1 from public.match_review_player_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid is not null and exists(select 1 from club_batting_private.roster_players rp where rp.club_id=c and rp.player_id=pid and rp.roster_id<>rid) then continue;end if;
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and s.source_player_id=source_id and s.roster_id=rid)
   and (card->>'provider'='playhq_au' or pid is null or exists(select 1 from public.match_review_player_links l where l.club_id=c and l.source_player_id=source_id and l.player_id=pid)) then continue;end if;
  linked:=linked||jsonb_build_array(jsonb_build_object('source_id',source_id,'roster_id',rid,'player_id',pid,'name',person->>'name'));
  if not apply_links then continue;end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by)
   values(c,source_id,rid,actor) on conflict(club_id,source_player_id) do nothing;
  get diagnostics added=row_count;changed:=changed+added;
  if pid is not null and card->>'provider' is distinct from 'playhq_au' and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,d)) then
   insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by)
    values(c,source_id,pid,actor) on conflict(club_id,source_player_id) do nothing;
   get diagnostics added=row_count;changed:=changed+added;
  end if;
 end loop;
 if apply_links and changed>0 then
  insert into club_selection_private.audit(club_id,actor_id,action,detail)
   values(c,actor,'scorecard_selected_identities',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'method',case when f.published is null then 'unique_full_name_in_selected_team' else 'unique_full_name_in_published_team' end,'players',linked));
 end if;
 if apply_links then perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,tid,actor);end if;
 return linked;
end $function$;

CREATE OR REPLACE FUNCTION club_batting_private.confirm_scorecard_player(c uuid, request_id uuid, v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid:=(v->>'snapshot_id')::uuid;source_id uuid:=(v->>'source_player_id')::uuid;
 pid uuid:=nullif(v->>'player_id','')::uuid;rid uuid:=nullif(v->>'roster_id','')::uuid;fid uuid:=nullif(v->>'fixture_id','')::uuid;
 card jsonb;source_name text;old_name text;source_names integer;linked_pid uuid;linked_rid uuid;other_id uuid;
 r club_selection_private.roster%rowtype;old_r club_selection_private.roster%rowtype;p public.players%rowtype;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;
 snapshot jsonb;v_slots jsonb;v_details jsonb;sync jsonb;result jsonb;repair boolean:=false;needs_team_review boolean:=false;retired_id uuid;
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid())
  or not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Current club membership is required';end if;
 if not (club_batting_private.team_review_staff(c) or club_selection_private.selector(c,auth.uid())
  or club_selection_private.social_allowed_at(c,auth.uid(),now()) or public.is_club_admin(c)) then raise exception 'Coaching, selection or socials access is required';end if;
 if request_id is null or source_id is null or length(v::text)>5000 then raise exception 'A valid player confirmation is required';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into receipt from club_selection_private.requests q where q.club_id=c and q.user_id=auth.uid() and q.request_id=confirm_scorecard_player.request_id;
 if found then
  if receipt.action<>'scorecard_player_identity' or receipt.payload<>v then raise exception 'Request ID already used';end if;
  return receipt.result;
 end if;
 select scorecard into card from public.match_review_scorecards where id=sid and club_id=c;
 if card is null then raise exception 'Scorecard unavailable in this club';end if;
 select count(distinct name),min(name) into source_names,source_name from (
  select x->>'name' name from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') x
   where t->>'id'=v->>'team_id' and x->>'player_id'=source_id::text
  union all select x->>'name' from jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') x
   where i->>'team_id'=v->>'team_id' and x->>'player_id'=source_id::text
 ) names;
 if source_names<>1 or length(btrim(source_name)) not between 1 and 120 then raise exception 'Refresh the scorecard to check this player name';end if;
 if pid is not null then
  select * into p from public.players where id=pid and club_id=c and active for update;
  if p.id is null or not(public.can_edit_player(pid) and public.can_read_coaching_action_player(pid)) then raise exception 'Coaching edit access is required for this player';end if;
  old_name:=p.display_name;
  select roster_id into other_id from club_batting_private.roster_players where club_id=c and player_id=pid;
  if other_id is null and p.user_id is not null then select id into other_id from club_selection_private.roster where club_id=c and user_id=p.user_id and active;end if;
  if rid is not null and rid is distinct from other_id then raise exception 'The player link changed. Reload before confirming';end if;
  rid:=other_id;
 end if;
 if rid is not null then
  select * into r from club_selection_private.roster where id=rid and club_id=c and (active or coalesce((v->>'prefer_registration')::boolean,false) and exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id=source_id)) for update;
  if r.id is null then raise exception 'Choose an active club player';end if;
  old_name:=coalesce(old_name,r.name);
  if pid is null then
   select player_id into pid from club_batting_private.roster_players where club_id=c and roster_id=rid;
   if pid is null and club_batting_private.verified_roster_user(c,r.user_id) then select id into pid from public.players where club_id=c and user_id=r.user_id and active;end if;
   if pid is not null then select * into p from public.players where id=pid and club_id=c and active for update;
    if p.id is null then raise exception 'The linked player is unavailable';end if;
   end if;
  end if;
 end if;
 if pid is null and rid is null then raise exception 'Choose an existing club player';end if;
 if v->>'expected_name' is distinct from old_name then raise exception 'The player name changed. Check the updated name before confirming';end if;
 if card->>'provider'='playhq_au' then
  if fid is null or rid is null then raise exception 'Choose this scorecard’s fixture and club player';end if;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null or card->>'status' is distinct from 'completed' or not exists(select 1 from club_selection_private.fixture_result_sources src where src.club_id=c and src.fixture_id=fid and src.source_match_id=(card->>'match_id')::uuid and src.team_id=(v->>'team_id')::uuid and src.no_play is null)
   or (f.published is not null and club_selection_private.fixture_identity(c,f.details) is distinct from club_selection_private.fixture_identity(c,f.published->'details'))
   or coalesce(f.published->'details',f.details)->>'format' is distinct from card->>'format_key'
   or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(coalesce(f.published->'details',f.details)->'days') day) is distinct from card->'dates'
   then raise exception 'Confirm this player against the fixture for this completed scorecard';end if;
  if pid is not null and not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,coalesce(f.published->'details',f.details))) then raise exception 'This team does not use Club Batting';end if;
  if exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.source_player_id=source_id and l.roster_id<>rid)
   or exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id and exists(select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') person where person->>'player_id'=l.source_player_id::text))
   then raise exception 'This match already has a different player link. Ask Club Admin to review it';end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source_id,rid,auth.uid()) on conflict(club_id,source_player_id) do nothing;
  result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',old_name);
  insert into club_selection_private.requests values(c,auth.uid(),request_id,'scorecard_player_identity',v,result,now());
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_match_player_identity',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'source_player_id',source_id,'roster_id',rid,'player_id',pid));
  perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,(v->>'team_id')::uuid,auth.uid());
  return result;
 end if;
 select player_id into linked_pid from public.match_review_player_links where club_id=c and source_player_id=source_id;
 if linked_pid is not null and linked_pid is distinct from pid then raise exception 'This PlayCricket identity already has a different player history. Ask Club Admin to review the links';end if;
 if pid is not null and exists(select 1 from public.match_review_player_links where club_id=c and player_id=pid and source_player_id<>source_id) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
 if rid is not null and exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and roster_id=rid and source_player_id<>source_id) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
 select roster_id into linked_rid from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=source_id;
 if linked_rid is null then select id into linked_rid from club_selection_private.roster where club_id=c and lower(external_id)=source_id::text;end if;
 if linked_rid is not null and linked_rid is distinct from rid then
  select * into old_r from club_selection_private.roster where id=linked_rid and club_id=c for update;
  if coalesce((v->>'prefer_registration')::boolean,false) and r.id is not null
   and r.user_id is null and nullif(btrim(r.account_email),'') is null and p.user_id is null
   and old_r.user_id is null and not exists(select 1 from club_batting_private.roster_players where roster_id=old_r.id)
   and not exists(select 1 from club_batting_private.roster_players where roster_id=r.id and claimed_user_id is not null)
   and not exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and roster_id=old_r.id and source_player_id<>source_id) then
   perform club_batting_private.consolidate_scorecard_roster(c,r.id,old_r.id,source_name);
   retired_id:=r.id;rid:=old_r.id;r:=old_r;old_r:=null;
  else
  -- Explicit same-person confirmation may connect an existing playing-list row too.
  -- Its origin/UUID does not establish a separate identity; accounts and batting
  -- histories do. Preserve those boundaries, including pending invitations.
  if old_r.id is null or old_r.user_id is not null or nullif(btrim(old_r.account_email),'') is not null
   or exists(select 1 from club_batting_private.roster_players where roster_id=old_r.id)
   or exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and roster_id=old_r.id and source_player_id<>source_id)
   then raise exception 'This PlayCricket identity is linked to another club record. Ask Club Admin to review the links';end if;
  if rid is null and pid is not null then
   -- The chosen batting record has no Teams identity yet. Attach the unlinked
   -- playing-list record to that existing player, without creating another batting record.
   rid:=old_r.id;r:=old_r;old_r:=null;
   if club_batting_private.verified_roster_user(c,p.user_id) then
    update club_selection_private.roster set user_id=p.user_id where id=rid;r.user_id:=p.user_id;
   end if;
  end if;
  end if;
 end if;
 if pid is not null and rid is not null and not exists(select 1 from club_batting_private.roster_players where roster_id=rid) then
  if exists(select 1 from club_batting_private.roster_players where player_id=pid) then raise exception 'The player already has another Teams identity. Reload before confirming';end if;
  insert into club_batting_private.roster_players(roster_id,club_id,player_id,claimed_user_id,claimed_at)
   values(rid,c,pid,case when p.user_id=r.user_id and club_batting_private.verified_roster_user(c,p.user_id) then p.user_id end,case when p.user_id=r.user_id and club_batting_private.verified_roster_user(c,p.user_id) then now() end);
 end if;
 if pid is not null then
  update public.players set display_name=source_name where id=pid and club_id=c;
  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by)
   values(c,source_id,pid,auth.uid()) on conflict(club_id,source_player_id) do update set confirmed_by=excluded.confirmed_by,updated_at=now();
 end if;
 if rid is not null then
  update club_selection_private.roster set name=source_name,active=true,updated_at=now() where id=rid and club_id=c;
  update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by)
   values(c,source_id,rid,auth.uid()) on conflict(club_id,source_player_id) do update set roster_id=excluded.roster_id,confirmed_by=excluded.confirmed_by,updated_at=now();
 end if;
 if fid is not null and rid is not null then
  select * into f from club_selection_private.fixtures where id=fid and club_id=c for update;
  if f.id is null or (select jsonb_agg(d->>'date' order by d->>'date') from jsonb_array_elements(f.details->'days') d) is distinct from card->'dates'
   or (f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>card->>'match_id') then raise exception 'The fixture changed. Reload before confirming this player';end if;
  if old_r.id is not null then
   needs_team_review:=exists(select 1 from club_selection_private.fixtures other where other.club_id=c and other.id<>fid and not coalesce((other.details->>'cancelled')::boolean,false)
    and exists(select 1 from jsonb_array_elements(other.details->'days') d where card->'dates' ? (d->>'date'))
    and exists(select 1 from jsonb_array_elements(other.slots||coalesce(other.published->'slots','[]')) s where s->>'d1'=rid::text or s->>'d2'=rid::text))
    or exists(select 1 from jsonb_array_elements(f.slots||coalesce(f.published->'slots','[]')) s where s->>'d1'=rid::text or s->>'d2'=rid::text);
  end if;
  repair:=not needs_team_review and exists(select 1 from jsonb_array_elements(f.slots||coalesce(f.published->'slots','[]')) s
   where s->>'d1'=coalesce(old_r.id,rid)::text or s->>'d2'=coalesce(old_r.id,rid)::text);
  if repair and retired_id is null then
   v_slots:=club_selection_private.scorecard_identity_slots(f.slots,old_r.id,rid);v_details:=club_selection_private.scorecard_identity_roles(f.details,old_r.id,rid);
   snapshot:=f.published;
   if snapshot is not null then
    snapshot:=snapshot||jsonb_build_object('slots',club_selection_private.scorecard_identity_slots(snapshot->'slots',old_r.id,rid),
     'details',club_selection_private.scorecard_identity_roles(snapshot->'details',old_r.id,rid),
     'players',(select coalesce(jsonb_agg(case when x->>'id'=coalesce(old_r.id,rid)::text then x||jsonb_build_object('id',rid,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(snapshot->'players') with ordinality a(x,n)));
    if snapshot->'scorecard_sync' is not null then
     snapshot:=jsonb_set(snapshot,'{scorecard_sync,players}',(select coalesce(jsonb_agg(case when x->>'source_id'=source_id::text then x||jsonb_build_object('roster_id',rid,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(snapshot#>'{scorecard_sync,players}') with ordinality a(x,n)));
    end if;
    insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) values(fid,f.publication+1,snapshot,auth.uid());
   end if;
   sync:=f.scorecard_sync;
   if sync is not null then sync:=sync||jsonb_build_object('players',(select coalesce(jsonb_agg(case when x->>'source_id'=source_id::text then x||jsonb_build_object('roster_id',rid,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(sync->'players') with ordinality a(x,n)));end if;
   update club_selection_private.fixtures set slots=v_slots,details=v_details,published=snapshot,scorecard_sync=sync,
    revision=revision+1,publication=publication+case when snapshot is null then 0 else 1 end,updated_at=now(),updated_by=auth.uid() where id=fid;
   if pid is not null then update club_batting_private.fixture_review_rosters set player_ids=array(select distinct unnest(player_ids||array[pid])),revision=revision+1,updated_at=now(),updated_by=auth.uid() where club_id=c and fixture_id=fid;end if;
  end if;
 end if;
 if old_r.id is not null and not exists(select 1 from club_selection_private.fixtures fx cross join lateral jsonb_array_elements(fx.slots||coalesce(fx.published->'slots','[]')) s where fx.club_id=c and (s->>'d1'=old_r.id::text or s->>'d2'=old_r.id::text)) then
  update club_selection_private.roster set active=false,updated_at=now() where id=old_r.id;
 end if;
 result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',source_name,'fixture_repaired',repair or retired_id is not null,'needs_team_review',needs_team_review,'retired_roster_id',retired_id);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_player_identity',result||jsonb_build_object('previous_name',old_name,'previous_roster_id',old_r.id,'snapshot_id',sid));
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,auth.uid(),request_id,'scorecard_player_identity',v,result);
 return result;
end $function$;

-- Scores may arrive before publication. Reuse them in the publication transaction.
create or replace function club_selection_private.link_published_scorecard_players() returns trigger
language plpgsql set search_path='' as $$
declare src club_selection_private.fixture_result_sources%rowtype;sid uuid;
begin
 select * into src from club_selection_private.fixture_result_sources s where s.club_id=new.club_id and s.fixture_id=new.id and s.no_play is null;
 if src.source_match_id is null or src.team_id is null then return new;end if;
 select s.id into sid from public.match_review_scorecards s where s.club_id=new.club_id and s.source_match_id=src.source_match_id
 order by s.created_at desc,s.id desc limit 1;
 if sid is not null then perform club_selection_private.link_selected_scorecard_players(new.club_id,sid,new.id,src.team_id,new.updated_by);end if;
 return new;
end $$;
revoke all on function club_selection_private.link_published_scorecard_players() from public,anon,authenticated,service_role;
create trigger published_scorecard_players after update of published on club_selection_private.fixtures
for each row when (new.published is not null and old.published is distinct from new.published)
execute function club_selection_private.link_published_scorecard_players();
