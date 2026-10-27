-- Small read-only metadata for availability reminders. Never load scorecards,
-- calculate form/comparisons or take locks just to show a returning player's name.
create or replace function club_selection_private.selection_returning_context(c uuid, fixtures jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $function$
declare settings club_selection_private.season_stats_settings%rowtype;
 timezone text;today date;starts date;ends date;shift integer;base_year integer;
begin
 select a.timezone into timezone from club_selection_private.access a where a.club_id=c;
 timezone:=coalesce(timezone,'Australia/Sydney');today:=(now() at time zone timezone)::date;
 select * into settings from club_selection_private.season_stats_settings where club_id=c;
 -- Match the existing season-stats window, including custom seasons and rollover.
 if settings.club_id is not null then
  shift:=greatest(0,extract(year from today)::integer-extract(year from settings.starts)::integer);
  if (settings.starts+make_interval(years=>shift))::date>today then shift:=greatest(0,shift-1);end if;
  starts:=(settings.starts+make_interval(years=>shift))::date;
  ends:=(settings.ends+make_interval(years=>shift))::date;
 else
  base_year:=extract(year from today)::integer;
  if timezone ~ '^(Australia|Pacific)/' then
   if extract(month from today)<7 then base_year:=base_year-1;end if;
   starts:=make_date(base_year,7,1);ends:=make_date(base_year+1,6,30);
  else starts:=make_date(base_year,1,1);ends:=make_date(base_year,12,31);end if;
 end if;
 return jsonb_build_object('season',jsonb_build_object('start',starts,'end',ends),'no_play',
  coalesce((select jsonb_agg(src.fixture_id order by src.fixture_id)
   from club_selection_private.fixture_result_sources src
   where src.club_id=c and src.no_play is not null
    and exists(select 1 from jsonb_array_elements(fixtures) f where f->>'id'=src.fixture_id::text)), '[]'::jsonb));
end $function$;
revoke all on function club_selection_private.selection_returning_context(uuid,jsonb) from public,anon,authenticated;

-- The existing API first authenticates and constructs its scoped fixture response.
-- Only board viewers receive metadata; only IDs already in that response qualify.
do $patch$
declare definition text;needle text:=$old$ return result;
end $old$;
begin
 definition:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected board context API';end if;
 definition:=replace(definition,needle,$new$ if p_action='context' and coalesce((result->>'can_view_board')::boolean,false) then
  result:=result||jsonb_build_object('returning_context',club_selection_private.selection_returning_context(p_club_id,result->'fixtures'));
 end if;
 return result;
end $new$);
 execute definition;
end $patch$;
