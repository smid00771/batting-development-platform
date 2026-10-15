-- Publication adds usual grades through shared grade and player identities.
-- Existing memberships remain; only the explicitly published fixtures are used.
create or replace function club_selection_private.sync_publication_groups(c uuid, fixture_ids uuid[])
returns jsonb language plpgsql set search_path='' as $$
declare f club_selection_private.fixtures%rowtype;gid uuid;added integer:=0;n integer;
 missing jsonb:='[]';unmapped jsonb:='[]';
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid())
  or club_selection_private.publication_head(c) is distinct from auth.uid()
  then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
 if not exists(select 1 from club_selection_private.access where club_id=c and mode='bundle')
  then return jsonb_build_object('skipped','standalone');end if;
 if coalesce(cardinality(fixture_ids),0) not between 1 and 30 or exists(
  select 1 from unnest(fixture_ids) chosen(id) where not exists(
   select 1 from club_selection_private.fixtures m where m.club_id=c and m.id=chosen.id and m.published is not null))
  then raise exception 'Choose published fixtures from this club';end if;
 for f in select m.* from club_selection_private.fixtures m where m.club_id=c and m.id=any(fixture_ids) order by m.id loop
  if coalesce((f.published->'details'->>'cancelled')::boolean,false) then continue;end if;
  gid:=club_selection_private.fixture_group_id(c,f.published->'details');
  if gid is null then
   unmapped:=unmapped||jsonb_build_array(jsonb_build_object('fixture_id',f.id,'grade',f.published->'details'->>'grade'));
   continue;
  end if;
  -- An explicit shared player identity also works before the player signs up.
  -- Fall back to a linked account only when no shared identity exists.
  insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by)
   select distinct c,p.id,gid,auth.uid()
   from club_selection_private.roster r
   left join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=r.id
   join public.players p on p.club_id=c and p.active
    and case when rp.player_id is not null then p.id=rp.player_id else p.user_id=r.user_id end
   where r.club_id=c and r.active and exists(select 1 from jsonb_array_elements(f.published->'slots') slot
    where slot->>'d1'=r.id::text or slot->>'d2'=r.id::text)
   on conflict(player_id,playing_group_id) do nothing;
  get diagnostics n=row_count;added:=added+n;
  missing:=missing||coalesce((select jsonb_agg(jsonb_build_object('roster_id',r.id,'name',r.name,'group_id',gid))
   from club_selection_private.roster r
   left join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=r.id
   where r.club_id=c and r.active and exists(select 1 from jsonb_array_elements(f.published->'slots') slot
    where slot->>'d1'=r.id::text or slot->>'d2'=r.id::text)
   and not exists(select 1 from public.players p where p.club_id=c and p.active
    and case when rp.player_id is not null then p.id=rp.player_id else p.user_id=r.user_id end)),'[]');
  update club_selection_private.group_links set source_fixture=f.id where club_id=c and group_id=gid;
 end loop;
 return jsonb_build_object('added_memberships',added,'unlinked_players',missing,'unmapped_grades',unmapped);
end $$;
revoke all on function club_selection_private.sync_publication_groups(uuid,uuid[]) from public,anon,authenticated;

-- Keep the existing atomic publish, notification, revision and retry protections.
do $$
declare source text:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 old_call text:='club_selection_private.sync_groups(c)';
begin
 if (length(source)-length(replace(source,old_call,'')))/length(old_call)<>1 then
  raise exception 'Expected one publication group-sync call';end if;
 execute replace(source,old_call,'club_selection_private.sync_publication_groups(c,ids)');
end $$;

-- Synthetic club only. All publication messages and memberships roll back.
do $tests$
declare c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();
 player_users uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 fixtures uuid[]:=array(select gen_random_uuid() from generate_series(1,6));
 grades uuid[]:=array(select gen_random_uuid() from generate_series(1,8));
 players uuid[]:=array(select gen_random_uuid() from generate_series(1,12));
 roster uuid[]:=array(select gen_random_uuid() from generate_series(1,12));
 day date:=(now() at time zone 'Australia/Sydney')::date+14;u uuid;d jsonb;slots jsonb;req jsonb;res jsonb;ctx jsonb;
 rejected boolean;message_count integer;membership_count integer;
begin
 begin
  foreach u in array array[head_id,admin_id]||player_users loop
   insert into auth.users(id,email) values(u,'publication-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,case when u=any(player_users) then 'Synthetic player '||array_position(player_users,u) else 'Synthetic staff '||u end);
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic publication test','publication-test-'||c,admin_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement)
   values(c,head_id,'player','none','player'),(c,admin_id,'admin','admin',null);
  foreach u in array player_users loop
   insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'player','none','player');
  end loop;
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',head_id);
  for i in 1..8 loop
   insert into public.playing_groups(id,club_id,name,active,created_by) values(grades[i],c,'Grade '||i,true,admin_id);
  end loop;
  for i in 1..12 loop
   insert into public.players(id,club_id,user_id,display_name,active) values(players[i],c,case when i<=6 then player_users[i] end,'Synthetic player '||i,true);
   insert into club_selection_private.roster(id,club_id,user_id,name,active) values(roster[i],c,case when i<=6 then player_users[i] end,'Synthetic player '||i,true);
   -- First six use account links; the others have a shared identity without an account.
   if i>6 then insert into club_batting_private.roster_players(roster_id,club_id,player_id) values(roster[i],c,players[i]);end if;
   insert into club_selection_private.availability(roster_id,available_dates) values(roster[i],jsonb_build_array(day::text));
   insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by)
    values(c,players[i],grades[7],admin_id),(c,players[i],grades[8],admin_id);
  end loop;
  for i in 1..6 loop
   d:=jsonb_build_object('grade','Grade '||i,'grade_group_id',grades[i],'competition','Test','format','limited_overs',
    'opposition','Synthetic opposition','ground','Test ground','days',jsonb_build_array(jsonb_build_object('date',day::text)),
    'min_quicks',3,'min_batters',5,'brackets',false,'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',roster[i],'captain_manual',true,'keeper_id',roster[i+6],'keeper_manual',true)));
   slots:=jsonb_build_array(jsonb_build_object('d1',roster[i],'d2',null),jsonb_build_object('d1',roster[i+6],'d2',null))
    ||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,9));
   insert into club_selection_private.fixtures(id,club_id,details,slots) values(fixtures[i],c,d,slots);
  end loop;
  assert not exists(select 1 from club_selection_private.group_links where club_id=c),'Reproduces shared grades without legacy mappings';
  perform set_config('request.jwt.claim.sub',player_users[1]::text,true);
  assert public.club_selections_api(c,'context')->'fixtures'='[]','Players cannot see drafts';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',to_jsonb(fixtures),'revisions',(select jsonb_object_agg(f.id::text,f.revision) from club_selection_private.fixtures f where f.club_id=c),'acknowledge_short',to_jsonb(fixtures));
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Player cannot publish';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  assert public.club_socials_api(c,'context')->'fixtures'='[]','Social graphics has no draft teams';
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Club Admin is not automatically Head of Selections';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then if sqlerrm not like 'Review and acknowledge%' then raise;end if;rejected:=true;end;assert rejected,'Warnings require confirmation';
  assert not exists(select 1 from club_selection_private.fixtures where club_id=c and published is not null);
  assert not exists(select 1 from club_batting_private.club_messages where club_id=c),'Rejected publication creates no messages';
  req:=req||jsonb_build_object('acknowledge_balance',true);
  res:=public.club_selections_api(c,'publish',req);
  assert res->>'published'='true';assert (res->>'recipients')::int=7,'Six players and Head receive messages';
  assert (res->'groups'->>'added_memberships')::int=12,'Both account and shared identities receive the selected grade';
  assert res->'groups'->'unlinked_players'='[]' and res->'groups'->'unmapped_grades'='[]';
  assert (select count(*)=6 and bool_and(publication=1 and published is not null) from club_selection_private.fixtures where club_id=c);
  for i in 1..12 loop
   assert (select count(*)=3 from public.player_playing_groups where player_id=players[i]),'Existing two usual grades retained';
   assert exists(select 1 from public.player_playing_groups where player_id=players[i] and playing_group_id=grades[case when i<=6 then i else i-6 end]);
  end loop;
  select count(*) into message_count from club_batting_private.club_message_recipients r join club_batting_private.club_messages m on m.id=r.message_id where m.club_id=c;
  select count(*) into membership_count from public.player_playing_groups where club_id=c;
  assert public.club_selections_api(c,'publish',req)=res,'Lost response retry returns same receipt';
  assert (select count(*)=message_count from club_batting_private.club_message_recipients r join club_batting_private.club_messages m on m.id=r.message_id where m.club_id=c),'Retry does not duplicate messages';
  assert (select count(*)=membership_count from public.player_playing_groups where club_id=c),'Retry does not duplicate usual grades';
  perform set_config('request.jwt.claim.sub',player_users[1]::text,true);
  ctx:=public.club_selections_api(c,'context');assert jsonb_array_length(ctx->'fixtures')=6,'All six Teams visible to a player';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  ctx:=public.club_socials_api(c,'context');assert jsonb_array_length(ctx->'fixtures')=6,'All six published teams available in Social Graphics';
  assert not has_function_privilege('authenticated','club_selection_private.sync_publication_groups(uuid,uuid[])','EXECUTE');
  -- Standalone clubs do not receive Club Batting usual-grade changes.
  update club_selection_private.access set mode='standalone' where club_id=c;
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  assert club_selection_private.sync_publication_groups(c,fixtures)->>'skipped'='standalone';
  assert (select count(*)=membership_count from public.player_playing_groups where club_id=c);
  raise exception using errcode='P0179',message='Rollback synthetic publication';
 exception when sqlstate 'P0179' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Publication, player messages, Social Graphics and additive usual grades passed; synthetic data rolled back.' as result;
