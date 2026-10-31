-- Confirmed PlayHQ identities use the source name without replacing player history.
begin;
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
  -- A selection-only team can share existing grade players without enabling coaching.
  if exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.source_player_id=source_id and l.roster_id<>rid)
   or exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id and exists(select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') person where person->>'player_id'=l.source_player_id::text))
   then raise exception 'This match already has a different player link. Ask Club Admin to review it';end if;
  -- The explicit identity confirmation adopts the trusted source spelling.
  -- Keep account identities and all score/coaching IDs; opted-out teams do not write Batting.
  update club_selection_private.roster set name=source_name,updated_at=now() where id=rid and club_id=c and name is distinct from source_name;
  if pid is not null and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.details)) then
   update public.players set display_name=source_name where id=pid and club_id=c and display_name is distinct from source_name;
  end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source_id,rid,auth.uid()) on conflict(club_id,source_player_id) do nothing;
  result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',source_name);
  insert into club_selection_private.requests values(c,auth.uid(),request_id,'scorecard_player_identity',v,result,now());
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_match_player_identity',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'source_player_id',source_id,'roster_id',rid,'player_id',pid,'previous_name',old_name,'name',source_name));
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
end $function$

;
revoke all on function club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb) from public,anon,authenticated;
commit;
