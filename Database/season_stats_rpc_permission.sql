-- The public SQL wrapper runs as the signed-in caller. Its checked SECURITY
-- DEFINER implementation therefore also needs EXECUTE for authenticated users.
-- Membership, product, coaching/selection scope and on-demand checks stay inside.
grant execute on function club_selection_private.season_stats_api(uuid,text,jsonb) to authenticated;
