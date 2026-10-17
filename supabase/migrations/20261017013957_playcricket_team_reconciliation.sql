-- Official post-match corrections are separate from selecting/publishing future teams.
alter table club_selection_private.fixtures add column scorecard_sync jsonb;
create table club_selection_private.scorecard_roster_links (
 club_id uuid not null references public.clubs(id) on delete cascade,
 source_player_id uuid not null, roster_id uuid not null references club_selection_private.roster(id),
 confirmed_by uuid not null, updated_at timestamptz not null default now(), primary key(club_id,source_player_id)
);
alter table club_selection_private.scorecard_roster_links enable row level security;
revoke all on club_selection_private.scorecard_roster_links from public,anon,authenticated;

create function club_selection_private.scorecard_team_details(c uuid,d jsonb,picks jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare day text;kind text;v jsonb:=d;
begin
 for day in select 'd'||i from generate_series(1,jsonb_array_length(d->'days')) i loop
  foreach kind in array array['captain','keeper'] loop
   if not exists(select 1 from jsonb_array_elements(picks) s where s->>day=d->'match_roles'->day->>(kind||'_id')) then
    v:=jsonb_set(v,array['match_roles',day],coalesce(v->'match_roles'->day,'{}')||jsonb_build_object(kind||'_id',null,kind||'_manual',false));
   end if;
  end loop;
 end loop;
 return club_selection_private.match_details(c,v,picks);
end $$;

create function club_selection_private.scorecard_team_plan(c uuid,sid uuid,tid text,fid uuid,mapping jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare card jsonb;team jsonb;f club_selection_private.fixtures%rowtype;o club_selection_private.fixtures%rowtype;
 p jsonb;entry jsonb;pid uuid;source_id uuid;r club_selection_private.roster%rowtype;chosen uuid[]:='{}';
 rows jsonb:='[]';new_players jsonb:='[]';slots jsonb:='[]';newslots jsonb;pubslots jsonb;slot jsonb;d jsonb;pd jsonb;
 changes jsonb:='[]';removed jsonb;added jsonb;departures jsonb;pending jsonb;meta jsonb;key text;day text;days jsonb;
 i integer;j integer;target_dates jsonb;old_ids uuid[];new_ids uuid[];all_ids uuid[];linked uuid;published_changed boolean;
begin
 select scorecard into card from public.match_review_scorecards where id=sid and club_id=c;
 if card is null then raise exception 'Scorecard unavailable in this club';end if;
 if card->>'status'<>'completed' then raise exception 'Wait for the completed scorecard before updating the team';end if;
 if exists(select 1 from public.match_review_scorecards newer join public.match_review_scorecards original on original.id=sid where newer.club_id=c and newer.source_match_id=original.source_match_id and newer.created_at>original.created_at) then raise exception 'A newer scorecard is available. Refresh scores before updating the team';end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=tid;
 if team is null or team->>'lineup_available' is distinct from 'true' or jsonb_array_length(team->'players') not between 1 and 30 then raise exception 'Refresh the scorecard to load the full listed team. No selections have changed';end if;
 select * into f from club_selection_private.fixtures where id=fid and club_id=c;
 if f.id is null or coalesce((f.details->>'cancelled')::boolean,false) then raise exception 'Choose an existing, uncancelled fixture';end if;
 select jsonb_agg(z.value->>'date' order by z.value->>'date') into target_dates from jsonb_array_elements(f.details->'days') z(value);
 if target_dates is distinct from card->'dates' then raise exception 'The fixture dates must match the PlayCricket match dates';end if;
 if card->>'format_key' is not null and club_selection_private.fixture_identity(c,f.details)->>'format_key' is distinct from card->>'format_key' then raise exception 'The fixture format does not match PlayCricket';end if;
 if f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>card->>'match_id' then raise exception 'This fixture is linked to a different PlayCricket match';end if;
 if exists(select 1 from club_selection_private.fixtures other where other.club_id=c and other.id<>fid and other.scorecard_sync->>'match_id'=card->>'match_id' and other.scorecard_sync->>'team_id'=tid) then raise exception 'This PlayCricket team is already linked to another fixture';end if;
 if jsonb_typeof(mapping) is distinct from 'array' or jsonb_array_length(mapping)<>jsonb_array_length(team->'players') then raise exception 'Match every listed PlayCricket player';end if;
 for p in select value from jsonb_array_elements(team->'players') loop
  source_id:=(p->>'player_id')::uuid;
  if (select count(*) from jsonb_array_elements(mapping) x where x->>'source_id'=source_id::text)<>1 then raise exception 'Match each PlayCricket player once';end if;
  select x into entry from jsonb_array_elements(mapping) x where x->>'source_id'=source_id::text;
  if entry->>'roster_id'='new' then
   if exists(select 1 from club_selection_private.roster where club_id=c and lower(external_id)=source_id::text) then raise exception 'This registration is already in the playing list. Reload player matches';end if;
   pid:=md5('playcricket-roster:'||c::text||source_id::text)::uuid;
   if exists(select 1 from club_selection_private.roster where id=pid) then raise exception 'Player matches changed. Reload before continuing';end if;
   new_players:=new_players||jsonb_build_array(jsonb_build_object('id',pid,'name',p->>'name','external_id',source_id));
  else
   pid:=nullif(entry->>'roster_id','')::uuid;
   select * into r from club_selection_private.roster where id=pid and club_id=c;
   if r.id is null then raise exception 'Choose a club player for %',p->>'name';end if;
  end if;
  if pid=any(chosen) then raise exception 'Two PlayCricket names cannot use the same club player';end if;chosen:=array_append(chosen,pid);
  days:=entry->'days';
  if jsonb_typeof(days) is distinct from 'array' or jsonb_array_length(days)<1 or exists(select 1 from jsonb_array_elements_text(days) z(value) where not target_dates ? z.value) or (select count(distinct z.value) from jsonb_array_elements_text(days) z(value))<>jsonb_array_length(days) then raise exception 'Choose the days played for %',p->>'name';end if;
  if not coalesce((f.details->>'brackets')::boolean,false) and days is distinct from target_dates then raise exception 'This fixture uses the same team on each match day';end if;
  select roster_id into linked from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=source_id;
  rows:=rows||jsonb_build_array(jsonb_build_object('source_id',source_id,'roster_id',pid,'name',p->>'name','days',days,'previous_link',linked));
 end loop;
 -- Preserve the selected batting order for retained players; append replacements.
 for i in 1..jsonb_array_length(f.details->'days') loop
  key:='d'||i;day:=f.details->'days'->(i-1)->>'date';
  select coalesce(array_agg((x->>'roster_id')::uuid order by coalesce((select min(n) from jsonb_array_elements(f.slots) with ordinality s(v,n) where v->>key=x->>'roster_id'),1000),n),'{}') into new_ids from jsonb_array_elements(rows) with ordinality q(x,n) where x->'days' ? day;
  for j in 0..greatest(10,cardinality(new_ids)-1) loop
   if jsonb_array_length(slots)<=j then slots:=slots||jsonb_build_array(jsonb_build_object('d1',null,'d2',null));end if;
   slots:=jsonb_set(slots,array[j::text,key],coalesce(to_jsonb(new_ids[j+1]),'null'::jsonb));
  end loop;
 end loop;
 select coalesce(array_agg(distinct v::uuid),'{}') into old_ids from jsonb_array_elements(f.slots) s cross join lateral(values(s->>'d1'),(s->>'d2')) ids(v) where v is not null;
 select coalesce(jsonb_agg(x->>'name'),'[]') into added from jsonb_array_elements(rows) x where not (x->>'roster_id')::uuid=any(old_ids);
 select coalesce(jsonb_agg(rp.name order by rp.name),'[]') into removed from club_selection_private.roster rp where rp.id=any(old_ids) and not rp.id=any(chosen);
 meta:=jsonb_build_object('match_id',card->>'match_id','team_id',tid,'snapshot_id',sid,'url',card->>'url','pending','[]'::jsonb,'players',rows);
 changes:=jsonb_build_array(jsonb_build_object('id',f.id,'revision',f.revision,'publication',f.publication,'grade',f.details->>'grade','slots',slots,'published_slots',slots,'details',f.details,'published_details',f.details,'added',added,'removed',removed,'sync',meta,'target',true));
 -- Remove only the conflicting dates, independently in drafts and published lists.
 for o in select * from club_selection_private.fixtures where club_id=c and id<>fid and not coalesce((details->>'cancelled')::boolean,false) order by id loop
  newslots:=o.slots;pubslots:=o.published->'slots';departures:='[]';d:=o.details;pd:=o.published->'details';
  for i in 1..jsonb_array_length(o.details->'days') loop
   key:='d'||i;day:=o.details->'days'->(i-1)->>'date';
   for p in select x from jsonb_array_elements(rows) x where x->'days' ? day loop
    if exists(select 1 from jsonb_array_elements(newslots) s where s->>key=p->>'roster_id') then
     if o.scorecard_sync->>'match_id' is not null and exists(select 1 from jsonb_array_elements(o.scorecard_sync->'players') x where x->>'roster_id'=p->>'roster_id' and x->'days' ? day) then raise exception '% is also confirmed from PlayCricket in %. Check both scorecards before changing teams',p->>'name',o.details->>'grade';end if;
     select jsonb_agg(case when s->>key=p->>'roster_id' then jsonb_set(s,array[key],'null') else s end order by n) into newslots from jsonb_array_elements(newslots) with ordinality q(s,n);
     departures:=departures||jsonb_build_array(jsonb_build_object('name',p->>'name','date',day,'to',f.details->>'grade'));
    end if;
   end loop;
  end loop;
  if pubslots is not null then
   for i in 1..jsonb_array_length(pd->'days') loop
    key:='d'||i;day:=pd->'days'->(i-1)->>'date';
    for p in select x from jsonb_array_elements(rows) x where x->'days' ? day loop
     if exists(select 1 from jsonb_array_elements(pubslots) s where s->>key=p->>'roster_id') then
      if o.scorecard_sync->>'match_id' is not null and exists(select 1 from jsonb_array_elements(o.scorecard_sync->'players') x where x->>'roster_id'=p->>'roster_id' and x->'days' ? day) then raise exception '% is also confirmed from PlayCricket in %. Check both scorecards before changing teams',p->>'name',o.details->>'grade';end if;
      select jsonb_agg(case when s->>key=p->>'roster_id' then jsonb_set(s,array[key],'null') else s end order by n) into pubslots from jsonb_array_elements(pubslots) with ordinality q(s,n);
      if not departures @> jsonb_build_array(jsonb_build_object('name',p->>'name','date',day)) then departures:=departures||jsonb_build_array(jsonb_build_object('name',p->>'name','date',day,'to',f.details->>'grade'));end if;
     end if;
    end loop;
   end loop;
  end if;
  if jsonb_array_length(departures)=0 then continue;end if;
  if jsonb_array_length(d->'days')=2 and exists(select 1 from jsonb_array_elements(newslots) s where s->'d1' is distinct from s->'d2') then d:=d||'{"brackets":true}'::jsonb;end if;
  if jsonb_array_length(pd->'days')=2 and exists(select 1 from jsonb_array_elements(pubslots) s where s->'d1' is distinct from s->'d2') then pd:=pd||'{"brackets":true}'::jsonb;end if;
  pending:=coalesce(o.scorecard_sync->'pending','[]')||departures;
  changes:=changes||jsonb_build_array(jsonb_build_object('id',o.id,'revision',o.revision,'publication',o.publication,'grade',d->>'grade','slots',newslots,'published_slots',pubslots,'details',d,'published_details',pd,'departures',departures,'sync',coalesce(o.scorecard_sync,'{}')||jsonb_build_object('pending',pending),'target',false));
 end loop;
 return jsonb_build_object('fixtures',changes,'new_players',new_players,'mapping',rows,'snapshot_id',sid,'team_id',tid,'fixture_id',fid,
 'changed',f.slots is distinct from slots or coalesce(f.published->'slots',slots) is distinct from slots or jsonb_array_length(changes)>1 or jsonb_array_length(coalesce(f.scorecard_sync->'pending','[]'))>0);
end $$;

create function club_selection_private.scorecard_team_api(c uuid,action text,data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare card jsonb;sid uuid:=(data->>'snapshot_id')::uuid;fid uuid;tid text;plan jsonb;result jsonb;item jsonb;r jsonb;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;rid uuid;v_details jsonb;v_published jsonb;meta jsonb;
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid()) or not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Current club membership is required';end if;
 if not (club_batting_private.team_review_staff(c) or club_selection_private.selector(c,auth.uid()) or club_selection_private.social_allowed_at(c,auth.uid(),now()) or public.is_club_admin(c)) then raise exception 'Coaching, selection or socials access is required';end if;
 if length(data::text)>100000 then raise exception 'Team request is too large';end if;
 if not club_selection_private.enabled(c) then return jsonb_build_object('enabled',false);end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 if action='apply' then
  rid:=(data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
  select * into receipt from club_selection_private.requests where club_id=c and user_id=auth.uid() and request_id=rid;
  if found then if receipt.action<>'playcricket_team' or receipt.payload<>data then raise exception 'Request ID already used';end if;return receipt.result;end if;
 end if;
 select scorecard into card from public.match_review_scorecards where id=sid and club_id=c;
 if card is null then raise exception 'Scorecard unavailable in this club';end if;
 if action='context' then
  return jsonb_build_object('enabled',true,'card',card,'our_team',club_batting_private.scorecard_club_team(c,card),
   'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',fx.id,'grade',fx.details->>'grade','opposition',fx.details->>'opposition','days',fx.details->'days','brackets',fx.details->'brackets','slots',fx.slots,'sync',fx.scorecard_sync) order by fx.details->>'grade',fx.id)
    from club_selection_private.fixtures fx where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)
    and (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(fx.details->'days') day)=card->'dates'),'[]'),
   'roster',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'external_id',external_id,'active',active) order by name,id) from club_selection_private.roster where club_id=c),'[]'),
   'links',coalesce((select jsonb_agg(jsonb_build_object('source_id',links.source_player_id,'roster_id',links.roster_id)) from (
    select l.source_player_id,l.roster_id from club_selection_private.scorecard_roster_links l where l.club_id=c
    union all select l.source_player_id,rp.roster_id from public.match_review_player_links l join club_batting_private.roster_players rp on rp.club_id=c and rp.player_id=l.player_id
    where l.club_id=c and not exists(select 1 from club_selection_private.scorecard_roster_links saved where saved.club_id=c and saved.source_player_id=l.source_player_id)
   ) links),'[]'));
 end if;
 if action not in ('preview','apply') then raise exception 'Unknown team action';end if;
 fid:=(data->>'fixture_id')::uuid;tid:=data->>'team_id';
 plan:=club_selection_private.scorecard_team_plan(c,sid,tid,fid,data->'mapping');
 if action='preview' then return plan||jsonb_build_object('expected',md5(plan::text));end if;
 if data->>'expected' is distinct from md5(plan::text) then raise exception 'A team or player match changed. Review the updated changes before confirming';end if;
 for r in select * from jsonb_array_elements(plan->'new_players') loop
  insert into club_selection_private.roster(id,club_id,external_id,name) values((r->>'id')::uuid,c,r->>'external_id',r->>'name');
 end loop;
 if jsonb_array_length(plan->'new_players')>0 then update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;end if;
 for item in select * from jsonb_array_elements(plan->'fixtures') loop
  select * into f from club_selection_private.fixtures where id=(item->>'id')::uuid and club_id=c for update;
  meta:=(item->'sync')||jsonb_build_object('updated_at',now(),'updated_by',auth.uid());
  v_details:=club_selection_private.scorecard_team_details(c,item->'details',item->'slots');
  v_published:=f.published;
  if v_published is not null then
   v_published:=v_published||jsonb_build_object('details',club_selection_private.scorecard_team_details(c,item->'published_details',item->'published_slots'),'slots',item->'published_slots','scorecard_sync',meta,
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'keeper',p.keeper) order by p.id) from club_selection_private.roster p where p.club_id=c and exists(select 1 from jsonb_array_elements(item->'published_slots') s where s->>'d1'=p.id::text or s->>'d2'=p.id::text)),'[]'));
   insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) values(f.id,f.publication+1,v_published,auth.uid());
  end if;
  update club_selection_private.fixtures set details=v_details,slots=item->'slots',scorecard_sync=meta,published=v_published,
   publication=publication+case when v_published is null then 0 else 1 end,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=f.id;
  -- Existing manual review lists must not retain the displaced selection.
  update club_batting_private.fixture_review_rosters m set player_ids=coalesce((select array_agg(distinct rp.player_id) from club_batting_private.roster_players rp where rp.club_id=c and exists(select 1 from jsonb_array_elements(item->'slots') s where s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)),'{}'),
   captain_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(item->'slots') s where rp.club_id=c and rp.player_id=m.captain_player_id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)) then m.captain_player_id end,
   keeper_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(item->'slots') s where rp.club_id=c and rp.player_id=m.keeper_player_id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)) then m.keeper_player_id end,
   revision=revision+1,updated_at=now(),updated_by=auth.uid() where m.fixture_id=f.id and m.club_id=c;
 end loop;
 for r in select * from jsonb_array_elements(plan->'mapping') loop
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,(r->>'source_id')::uuid,(r->>'roster_id')::uuid,auth.uid())
   on conflict(club_id,source_player_id) do update set roster_id=excluded.roster_id,confirmed_by=excluded.confirmed_by,updated_at=now();
 end loop;
 result:=jsonb_build_object('saved',true,'fixture_id',fid,'affected',plan->'fixtures');
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'playcricket_team',plan);
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,auth.uid(),rid,'playcricket_team',data,result);
 return result;
end $$;

create function public.playcricket_team_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.scorecard_team_api(p_club_id,p_action,p_data)$$;
revoke all on function club_selection_private.scorecard_team_details(uuid,jsonb,jsonb),club_selection_private.scorecard_team_plan(uuid,uuid,text,uuid,jsonb),club_selection_private.scorecard_team_api(uuid,text,jsonb),public.playcricket_team_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function club_selection_private.scorecard_team_api(uuid,text,jsonb),public.playcricket_team_api(uuid,text,jsonb) to authenticated;
