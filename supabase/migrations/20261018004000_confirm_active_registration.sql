-- Explicit same-person confirmation may retain the registered playing-list row.
-- The original batting player ID survives. No account or two batting histories merge.
create function club_batting_private.consolidate_scorecard_roster(c uuid,old_id uuid,new_id uuid,source_name text) returns void
language plpgsql set search_path='' as $$
<<merge_state>>
declare original club_selection_private.roster%rowtype;canonical club_selection_private.roster%rowtype;
 a club_selection_private.availability%rowtype;b club_selection_private.availability%rowtype;
 f club_selection_private.fixtures%rowtype;published jsonb;sync jsonb;slots jsonb;details jsonb;unavailable jsonb;available jsonb;
begin
 select * into original from club_selection_private.roster where id=old_id and club_id=c for update;
 select * into canonical from club_selection_private.roster where id=new_id and club_id=c for update;
 if original.id is null or canonical.id is null or old_id=new_id
  or original.user_id is not null or nullif(btrim(original.account_email),'') is not null or canonical.user_id is not null
  or exists(select 1 from club_batting_private.roster_players rp join public.players p on p.id=rp.player_id where rp.roster_id=old_id and (rp.claimed_user_id is not null or p.user_id is not null))
  or exists(select 1 from club_batting_private.roster_players where roster_id=new_id)
  then raise exception 'These records have account or player history links that need Club Admin review';end if;
 -- A confirmed identity is not permission to remove a selection from either team.
 if exists(
  select 1 from club_selection_private.fixtures x cross join club_selection_private.fixtures y
  where x.club_id=c and y.club_id=c and not coalesce((x.details->>'cancelled')::boolean,false) and not coalesce((y.details->>'cancelled')::boolean,false)
   and exists(select 1 from jsonb_array_elements(x.details->'days') with ordinality xd(d,n)
    join jsonb_array_elements(y.details->'days') with ordinality yd(d,n) on xd.d->>'date'=yd.d->>'date'
    where exists(select 1 from jsonb_array_elements(x.slots||coalesce(x.published->'slots','[]')) s where s->>('d'||xd.n)=old_id::text)
     and exists(select 1 from jsonb_array_elements(y.slots||coalesce(y.published->'slots','[]')) s where s->>('d'||yd.n)=new_id::text))
 ) then raise exception 'Both name entries are selected on the same date. Resolve that selection before confirming the player';end if;
 select * into a from club_selection_private.availability where roster_id=old_id for update;
 select * into b from club_selection_private.availability where roster_id=new_id for update;
 -- Preserve explicit unavailability from either record; a name confirmation cannot
 -- overturn it or invent availability from a scorecard appearance.
 select coalesce(jsonb_agg(value order by value),'[]') into unavailable from
  (select distinct value from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')||coalesce(b.unavailable_dates,'[]'))) d;
 select coalesce(jsonb_agg(value order by value),'[]') into available from
  (select distinct value from jsonb_array_elements_text(coalesce(a.available_dates,'[]')||coalesce(b.available_dates,'[]')) where not unavailable ? value) d;
 if a.roster_id is not null or b.roster_id is not null then
  insert into club_selection_private.availability(roster_id,usual_available,available_dates,unavailable_dates,blocks,checked_by)
   values(new_id,false,available,unavailable,coalesce(a.blocks,'[]')||coalesce(b.blocks,'[]'),auth.uid())
   on conflict(roster_id) do update set usual_available=false,available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,
    blocks=excluded.blocks,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=auth.uid();
 end if;
 update club_selection_private.roster set name=source_name,active=true,
  grade=case when grade='' then original.grade else grade end,
  batting=case when batting='unknown' then original.batting else batting end,
  bowling=case when bowling='unknown' then original.bowling else bowling end,
  bowling_load=case when bowling_load='unknown' then original.bowling_load else bowling_load end,
  keeper=keeper or original.keeper,updated_at=now() where id=new_id;
 update club_batting_private.roster_players set roster_id=new_id where roster_id=old_id and club_id=c;
 -- Retain the saved follow-up, appointments and artwork references as well.
 -- A conflicting unique record aborts the entire confirmation, never discards it.
 update club_selection_private.player_conversations set roster_id=new_id where roster_id=old_id;
 update club_selection_private.season_appointments set captain_roster_id=new_id where captain_roster_id=old_id and club_id=c;
 update club_selection_private.social_assets set roster_id=new_id where roster_id=old_id and club_id=c;
 update club_selection_private.social_features set roster_id=new_id where roster_id=old_id and club_id=c;
 update club_selection_private.social_preparations set roster_id=new_id where roster_id=old_id and club_id=c;
 for f in select * from club_selection_private.fixtures fx where fx.club_id=c and
  exists(select 1 from jsonb_array_elements(fx.slots||coalesce(fx.published->'slots','[]')) s where s->>'d1' in(old_id::text,new_id::text) or s->>'d2' in(old_id::text,new_id::text)) for update loop
  slots:=club_selection_private.scorecard_identity_slots(f.slots,old_id,new_id);
  details:=club_selection_private.scorecard_identity_roles(f.details,old_id,new_id);
  if details->>'captain_id'=old_id::text then details:=jsonb_set(details,'{captain_id}',to_jsonb(new_id));end if;
  published:=f.published;
  if published is not null then
   published:=published||jsonb_build_object('slots',club_selection_private.scorecard_identity_slots(published->'slots',old_id,new_id),
    'details',club_selection_private.scorecard_identity_roles(published->'details',old_id,new_id),
    'players',(select coalesce(jsonb_agg(case when x->>'id' in(old_id::text,new_id::text) then x||jsonb_build_object('id',new_id,'name',source_name,'batting',r.batting,'bowling',r.bowling,'bowling_load',r.bowling_load,'keeper',r.keeper) else x end order by n),'[]') from jsonb_array_elements(published->'players') with ordinality a(x,n) cross join club_selection_private.roster r where r.id=new_id));
   if published#>>'{details,captain_id}'=old_id::text then published:=jsonb_set(published,'{details,captain_id}',to_jsonb(new_id));end if;
   if published->'scorecard_sync' is not null then published:=jsonb_set(published,'{scorecard_sync,players}',
    (select coalesce(jsonb_agg(case when x->>'roster_id' in(old_id::text,new_id::text) then x||jsonb_build_object('roster_id',new_id,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(published#>'{scorecard_sync,players}') with ordinality a(x,n)));end if;
  end if;
  sync:=f.scorecard_sync;
  if sync is not null then sync:=sync||jsonb_build_object('players',
   (select coalesce(jsonb_agg(case when x->>'roster_id' in(old_id::text,new_id::text) then x||jsonb_build_object('roster_id',new_id,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(sync->'players') with ordinality a(x,n)));end if;
  if slots is distinct from f.slots or details is distinct from f.details or published is distinct from f.published or sync is distinct from f.scorecard_sync then
   if published is distinct from f.published and published is not null then
    insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) values(f.id,f.publication+1,published,auth.uid());
   end if;
   update club_selection_private.fixtures set slots=merge_state.slots,details=merge_state.details,published=merge_state.published,
    scorecard_sync=sync,revision=revision+1,publication=publication+case when merge_state.published is distinct from f.published and merge_state.published is not null then 1 else 0 end,
    updated_at=now(),updated_by=auth.uid() where id=f.id;
  end if;
 end loop;
 update club_selection_private.roster set active=false,auto_link_disabled=true,updated_at=now() where id=old_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_roster_consolidated',
  jsonb_build_object('retired_roster_id',old_id,'active_roster_id',new_id,'previous_name',original.name,'name',source_name,'old_availability',to_jsonb(a),'registration_availability',to_jsonb(b)));
end $$;
revoke all on function club_batting_private.consolidate_scorecard_roster(uuid,uuid,uuid,text) from public,anon,authenticated;

create or replace function club_batting_private.confirm_scorecard_player(c uuid,request_id uuid,v jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end $$;

-- Registered rows without a linked account/history may still be duplicate names.
-- Expose only this fact to the reconciliation UI, never email/account details.
do $$
declare definition text:=pg_get_functiondef('club_selection_private.scorecard_team_api(uuid,text,jsonb)'::regprocedure);
 old_text text:='''active'',r.active,''imported_stub''';
 new_text text:='''active'',r.active,''identity_unlinked'',r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id),''imported_stub''';
begin
 if position(old_text in definition)=0 then raise exception 'Scorecard context changed; review the registration confirmation migration';end if;
 execute replace(definition,old_text,new_text);
end $$;
