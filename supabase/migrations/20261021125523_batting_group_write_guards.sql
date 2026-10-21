-- Opt-out is enforced when saving, including a stale screen and fixture-less
-- imports. Existing reviews remain readable; a completed request can be retried.
create function club_batting_private.assert_review_batting_write(
 c uuid, g uuid, fid uuid, ids jsonb, snapshot uuid default null, team uuid default null
) returns void language plpgsql set search_path='' as $$
declare fixture_group uuid; source_match uuid;
begin
 if auth.uid() is null or not club_batting_private.team_review_staff(c) then
  raise exception 'Current club coaching access is required';
 end if;
 -- The group toggle and review writer take the same lock. A concurrent opt-out
 -- cannot commit between this check and the review/score writes.
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 if g is not null and not club_batting_private.group_uses_batting(c,g) then
  raise exception 'This team does not use Club Batting. Reload your teams before saving';
 end if;
 if fid is not null then
  select club_selection_private.fixture_group_id(c,f.details) into fixture_group
   from club_selection_private.fixtures f where f.club_id=c and f.id=fid;
  if fixture_group is null or not club_batting_private.group_uses_batting(c,fixture_group) then
   raise exception 'This team does not use Club Batting. Reload your teams before saving';
  end if;
 end if;
 if jsonb_typeof(ids) is distinct from 'array' then raise exception 'Choose the review players';end if;
 if exists(select 1 from jsonb_array_elements_text(ids) p
   where not club_batting_private.player_uses_batting(c,p::uuid)) then
  raise exception 'A selected player no longer participates in Club Batting. Reload before saving';
 end if;
 -- Omitting group/fixture from an old client must not import an opted-out
 -- team's scorecard through the unrestricted/all-players review path.
 if snapshot is not null then
  select s.source_match_id into source_match from public.match_review_scorecards s
   where s.club_id=c and s.id=snapshot;
  if source_match is null then raise exception 'Reload the scorecard before saving';end if;
  if exists(select 1 from club_selection_private.fixture_result_sources src
   join club_selection_private.fixtures f on f.id=src.fixture_id and f.club_id=c
   where src.club_id=c and src.source_match_id=source_match and src.team_id=team
    and not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.details))) then
   raise exception 'This scorecard team does not use Club Batting. Reload before saving';
  end if;
 end if;
end $$;
revoke all on function club_batting_private.assert_review_batting_write(uuid,uuid,uuid,jsonb,uuid,uuid)
 from public,anon,authenticated,service_role;

do $patch$
declare definition text; marker text:=' -- Resolve only after the existing review/grade permissions and revision checks.';
begin
 select pg_get_functiondef('club_batting_private.save_team_match_review(uuid,uuid,jsonb)'::regprocedure) into definition;
 if length(definition)-length(replace(definition,marker,''))<>length(marker) then
  raise exception 'Unexpected definition: save_team_match_review';
 end if;
 definition:=replace(definition,marker,$guard$
 perform club_batting_private.assert_review_batting_write(p_club_id,gid,
  coalesce(nullif(p_values->>'fixture_id','')::uuid,s.fixture_id),
  coalesce((select jsonb_agg(guard_row.value->'player_id') from jsonb_array_elements(rows||coalesce(p_values#>'{scorecard_import,rows}','[]'::jsonb)) guard_row(value)),'[]'::jsonb)||remove_ids,
  nullif(p_values#>>'{scorecard_import,snapshot_id}','')::uuid,
  nullif(p_values#>>'{scorecard_import,team_id}','')::uuid);
$guard$||marker);
 execute definition;
end $patch$;

do $patch$
declare definition text; marker text:=' if snap.id is null or sr.id is null then raise exception ''Reload the scorecard and match review'';end if;';
begin
 select pg_get_functiondef('club_batting_private.apply_match_review_scores(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) into definition;
 if length(definition)-length(replace(definition,marker,''))<>length(marker) then
  raise exception 'Unexpected definition: apply_match_review_scores';
 end if;
 definition:=replace(definition,marker,marker||$guard$
 perform club_batting_private.assert_review_batting_write(p_club_id,sr.group_id,sr.fixture_id,
  coalesce((select jsonb_agg(guard_row.value->'player_id') from jsonb_array_elements(p_import->'rows') guard_row(value)),'[]'::jsonb),
  snap.id,nullif(p_import->>'team_id','')::uuid);
$guard$);
 execute definition;
end $patch$;
