-- Preserve the existing authenticated wrapper access after replacing its implementation.
grant execute on function club_selection_private.season_stats_api(uuid,text,jsonb) to authenticated;
