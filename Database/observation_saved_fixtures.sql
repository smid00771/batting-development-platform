-- The observation picker reads the same saved fixtures as Match Review.
-- No source download, selection publication or fixture creation happens here.
create or replace function club_batting_private.get_individual_match_fixtures(p_club_id uuid,p_player_id uuid,p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare linked uuid;
begin
 if auth.uid() is null or not club_batting_private.team_review_staff(p_club_id)
  or not exists(select 1 from public.players p where p.id=p_player_id and p.club_id=p_club_id and p.active)
  or not(public.can_read_coaching_action_player(p_player_id) and public.can_edit_player(p_player_id))
 then raise exception 'Coaching edit access is required for this player';end if;
 if p_match_id is not null and not exists(select 1 from public.player_match_entries m where m.id=p_match_id and m.player_id=p_player_id and m.club_id=p_club_id)
 then raise exception 'This player innings is unavailable';end if;
 select fixture_id into linked from club_batting_private.fixture_innings where club_id=p_club_id and match_id=p_match_id;
 return jsonb_build_object('linked_fixture_id',linked,
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.sort_order,g.name)
   from public.playing_groups g where g.club_id=p_club_id and g.active
    and (club_batting_private.group_uses_batting(p_club_id,g.id) or exists(select 1 from club_selection_private.fixtures f where f.id=linked and f.club_id=p_club_id and club_selection_private.fixture_group_id(p_club_id,f.details)=g.id))),'[]'::jsonb),
  'player_innings',coalesce((select jsonb_agg(jsonb_build_object('match_id',m.id,'innings_number',m.innings_number,'fixture_id',fi.fixture_id) order by m.match_date,m.innings_number,m.id)
   from public.player_match_entries m left join club_batting_private.fixture_innings fi on fi.match_id=m.id and fi.club_id=m.club_id
   where m.club_id=p_club_id and m.player_id=p_player_id),'[]'::jsonb),
  'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'group_id',g.id,'grade',g.name,
   'match_date',f.details->'days'->0->>'date','days',f.details->'days',
   'start',f.details->'days'->0->>'start','ground',coalesce(nullif(f.details->'days'->0->>'ground',''),f.details->>'ground'),
   'opposition',f.details->>'opposition','format_key',club_selection_private.fixture_identity(p_club_id,f.details)->>'format_key')
   order by f.details->'days'->0->>'date' desc,g.sort_order,f.id)
   from club_selection_private.fixtures f join public.playing_groups g
    on g.id=club_selection_private.fixture_group_id(p_club_id,f.details) and g.club_id=p_club_id and g.active
   where f.club_id=p_club_id and (f.id=linked or not coalesce((f.details->>'cancelled')::boolean,false) and club_batting_private.group_uses_batting(p_club_id,g.id))),'[]'::jsonb));
end $$;
revoke all on function club_batting_private.get_individual_match_fixtures(uuid,uuid,uuid) from public,anon;
grant execute on function club_batting_private.get_individual_match_fixtures(uuid,uuid,uuid) to authenticated;

-- A selected fixture is a stronger identity than date/format alone. Keep the
-- original path for callers without one, including old pending save receipts.
do $patch$
declare source text;marker text:=' if (select count(*) from public.player_match_entries m where m.player_id=p_player_id';
begin
 source:=pg_get_functiondef('club_batting_private.find_shared_innings(uuid,uuid,jsonb)'::regprocedure);
 if position('Selected fixture innings identity' in source)>0 then raise exception 'Fixture-aware innings lookup is already installed';end if;
 if length(source)-length(replace(source,marker,''))<>length(marker) then raise exception 'Unexpected shared innings lookup';end if;
 source:=replace(source,marker,$branch$
 -- Selected fixture innings identity; a date never implies a different fixture.
 if nullif(p_values->>'fixture_id','') is not null then
  declare fid uuid:=(p_values->>'fixture_id')::uuid;candidate uuid;ids uuid[];c uuid;
  begin
   select club_id into c from public.players where id=p_player_id;
   if not exists(select 1 from club_selection_private.fixtures fx where fx.id=fid and fx.club_id=c
    and fx.details->'days'->0->>'date'=d::text
    and club_selection_private.fixture_identity(c,fx.details)->>'format_key'=f
    and club_batting_private.innings_opposition_key(fx.details->>'opposition')=o)
   then raise exception 'Choose the saved fixture for this innings';end if;
   select array_agg(m.id) into ids from public.player_match_entries m
    join club_batting_private.fixture_innings fi on fi.match_id=m.id and fi.club_id=c and fi.fixture_id=fid
    where m.player_id=p_player_id and m.innings_number=n;
   if cardinality(ids)>1 then raise exception 'More than one innings is linked to this fixture. Open the correct existing innings';end if;
   if cardinality(ids)=1 then return ids[1];end if;
   select array_agg(m.id) into ids from public.player_match_entries m
    where m.player_id=p_player_id and m.match_date=d and m.format_key=f and m.innings_number=n
     and club_batting_private.innings_opposition_key(m.opposition)=o
     and not exists(select 1 from club_batting_private.fixture_innings fi where fi.match_id=m.id);
   if cardinality(ids)>1 or cardinality(ids)=1 and (select count(*) from club_selection_private.fixtures fx where fx.club_id=c
    and fx.details->'days'->0->>'date'=d::text and club_selection_private.fixture_identity(c,fx.details)->>'format_key'=f
    and club_batting_private.innings_opposition_key(fx.details->>'opposition')=o)>1
   then raise exception 'Existing innings need checking. Open the correct innings before linking this fixture';end if;
   if cardinality(ids)=1 then return ids[1];end if;
   if exists(select 1 from public.player_match_entries m where m.player_id=p_player_id and m.match_date=d and m.format_key=f and m.innings_number=n and club_batting_private.innings_opposition_key(m.opposition)=o)
   then raise exception 'An innings with these details belongs to another fixture. Ask Club Admin to check the fixture links';end if;
   return null;
  end;
 end if;
$branch$||marker);
 execute source;
end $patch$;
