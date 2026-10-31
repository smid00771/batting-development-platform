-- One on-demand Season stats service for either product, retaining role scopes.
begin;
CREATE OR REPLACE FUNCTION club_selection_private.season_stats_api(c uuid, action text DEFAULT 'context'::text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
 me uuid:=auth.uid(); adm boolean; selecting boolean; coaching boolean; coaching_fixtures jsonb:='[]'; shared_cards jsonb; selection_cards jsonb:='[]'; timezone text; today date; starts date; ends date; base_year integer; shift integer;
 settings club_selection_private.season_stats_settings%rowtype; cards jsonb; fixtures jsonb; identities jsonb;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then
  raise exception 'Current club membership is required';
 end if;
 adm:=public.is_club_admin(c);
 selecting:=club_selection_private.enabled(c) and (adm or club_selection_private.selection_viewer(c,me) or club_selection_private.captain(c,me));
 coaching:=coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) and club_batting_private.team_review_staff(c);
 if not (selecting or coaching) then raise exception 'Current club coaching, selection or captain access is required';end if;
 if action not in ('context','set_season') or action is null then raise exception 'Unknown season stats action';end if;
 if action='context' and data->'on_demand' is distinct from 'true'::jsonb then
  raise exception using errcode='P0285',message='Analysis runs on request. Open Season stats, Show form indicators or Compare returning players to calculate once.';
 end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>1500 then raise exception 'Invalid season stats request';end if;
 if action='set_season' then
  if not adm then raise exception 'Club Admin can change season dates';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,20500));
 end if;
 select * into settings from club_selection_private.season_stats_settings where club_id=c;
 if action='set_season' then
  if coalesce((data->>'expected_revision')::integer,-1)<>coalesce(settings.revision,0) then raise exception 'Season dates changed. Update totals before saving again';end if;
  if coalesce(data->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(data->>'end','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose both season dates';end if;
  starts:=(data->>'start')::date;ends:=(data->>'end')::date;
  if ends<starts or ends-starts>366 then raise exception 'Choose season dates in order, up to one year apart';end if;
  insert into club_selection_private.season_stats_settings(club_id,starts,ends,updated_by)
   values(c,starts,ends,me)
   on conflict(club_id) do update set starts=excluded.starts,ends=excluded.ends,revision=season_stats_settings.revision+1,updated_by=me,updated_at=now()
   returning * into settings;
 end if;
 select a.timezone into timezone from club_selection_private.access a where a.club_id=c;
 timezone:=coalesce(timezone,'Australia/Sydney');today:=(now() at time zone timezone)::date;
 if settings.club_id is not null then
  -- The saved season window repeats annually; the completed season remains visible
  -- through the off-season, until the next season's start date.
  shift:=greatest(0,extract(year from today)::integer-extract(year from settings.starts)::integer);
  if (settings.starts + make_interval(years=>shift))::date>today then shift:=greatest(0,shift-1);end if;
  starts:=(settings.starts + make_interval(years=>shift))::date;
  ends:=(settings.ends + make_interval(years=>shift))::date;
 else
  -- Defaults are visible and editable in-place; billing dates are never repurposed.
  base_year:=extract(year from today)::integer;
  if timezone ~ '^(Australia|Pacific)/' then
   if extract(month from today)<7 then base_year:=base_year-1;end if;
   starts:=make_date(base_year,7,1);ends:=make_date(base_year+1,6,30);
  else starts:=make_date(base_year,1,1);ends:=make_date(base_year,12,31);
  end if;
 end if;
 -- Reuse saved shared scorecards and existing role scopes. This neither enables
 -- Select nor returns its draft line-ups, availability, contacts or private notes.
 if coaching and not adm then coaching_fixtures:=club_batting_private.review_fixture_options(c);end if;
 shared_cards:=club_selection_private.shared_result_cards(c,starts,ends);
 if selecting then selection_cards:=club_selection_private.filter_result_cards(c,shared_cards,me);end if;
 select coalesce(jsonb_agg(x),'[]') into cards from jsonb_array_elements(shared_cards) x
 where adm or exists(select 1 from jsonb_array_elements(selection_cards) allowed where allowed=x)
  or exists(select 1 from jsonb_array_elements(coaching_fixtures) allowed where allowed->>'id'=x->>'fixture_id')
  or (nullif(x->>'fixture_id','') is null and exists(
   select 1 from club_selection_private.fixtures f join jsonb_array_elements(coaching_fixtures) allowed on allowed->>'id'=f.id::text
   where f.club_id=c and f.details->>'grade'=coalesce(x->>'grade_hint',x#>>'{scorecard,grade}')
    and coalesce(f.details->>'competition','')=coalesce(x#>>'{scorecard,competition}','')));
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'grade',d->>'grade','grade_group_id',d->>'grade_group_id','competition',d->>'competition','format',d->>'format','opposition',d->>'opposition','days',d->'days',
  'playhq_season_id',phq.season_id,'playhq_grade_id',phq.grade_id,
  'cancelled',coalesce((d->>'cancelled')::boolean,false),'match_id',coalesce(l.source_match_id::text,f.scorecard_sync->>'match_id'),'no_play',l.no_play
 ) order by d->'days'->0->>'date',f.id),'[]') into fixtures
 from club_selection_private.fixtures f
 cross join lateral(select coalesce(f.published->'details',f.details) d) details
 left join club_selection_private.fixture_result_sources l on l.fixture_id=f.id and l.club_id=c
 left join club_selection_private.playhq_links phq on phq.fixture_id=f.id and phq.club_id=c
 where f.club_id=c and (adm or (selecting and (not club_selection_private.scoped_selections(c) or club_selection_private.fixture_view(c,d,me)))
  or exists(select 1 from jsonb_array_elements(coaching_fixtures) allowed where allowed->>'id'=f.id::text)) and d->'days'->0->>'date' between starts::text and ends::text;

 -- Return only source identity mappings needed by these scorecards, never contact,
 -- availability, coaching, account or unpublished-selection details.
 with source_people as (
  select distinct person->>'player_id' source_id
  from jsonb_array_elements(cards) wrapped,
   lateral (select p person from jsonb_array_elements(wrapped#>'{scorecard,teams}') t,jsonb_array_elements(t->'players') p
    union all select p from jsonb_array_elements(wrapped#>'{scorecard,innings}') i,jsonb_array_elements(i->'batters') p
    union all select p from jsonb_array_elements(wrapped#>'{scorecard,innings}') i,jsonb_array_elements(i->'bowlers') p) people
  where person->>'player_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ), mapped as (
  select s.source_id,r.id direct_roster,pr.id player_id,pr.display_name player_name,
   r.name roster_name,bridge.ids bridge_ids,bridge.roster_id bridge_roster,bridge.name bridge_name
  from source_people s
  left join club_selection_private.scorecard_roster_links sr on sr.club_id=c and sr.source_player_id=s.source_id::uuid
  left join club_selection_private.roster r on r.club_id=c and r.id=sr.roster_id
  left join public.match_review_player_links pl on pl.club_id=c and pl.source_player_id=s.source_id::uuid
  left join public.players pr on pr.club_id=c and pr.id=pl.player_id
  left join lateral (
   select count(distinct rp.roster_id) ids,min(rp.roster_id::text) roster_id,min(br.name) name
   from club_batting_private.roster_players rp join club_selection_private.roster br on br.id=rp.roster_id and br.club_id=c
   where rp.club_id=c and rp.player_id=pr.id
  ) bridge on true
 )
 select coalesce(jsonb_agg(jsonb_build_object('source_id',source_id,'roster_id',coalesce(direct_roster::text,case when bridge_ids=1 then bridge_roster end),
  'player_id',player_id,'name',coalesce(roster_name,case when bridge_ids=1 then bridge_name end,player_name),
  'conflict',bridge_ids>1 or (direct_roster is not null and bridge_roster is not null and direct_roster::text<>bridge_roster))),'[]') into identities from mapped;

 return jsonb_build_object('season',jsonb_build_object('start',starts,'end',ends,'revision',coalesce(settings.revision,0),
  'label',case when extract(year from starts)=extract(year from ends) then to_char(starts,'YYYY') else to_char(starts,'YYYY')||'/'||to_char(ends,'YY') end),
  'today',today,'can_set_season',adm,'cards',cards,'fixtures',fixtures,'identities',identities);
end $function$

;
revoke all on function club_selection_private.season_stats_api(uuid,text,jsonb) from public,anon,authenticated;
commit;
