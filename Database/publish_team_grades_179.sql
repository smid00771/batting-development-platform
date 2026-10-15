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
