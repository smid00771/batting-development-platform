-- Production public wrapper before the permission correction; no club data.
CREATE OR REPLACE FUNCTION public.confirm_scorecard_player(p_club_id uuid, p_request_id uuid, p_values jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select club_batting_private.confirm_scorecard_player(p_club_id,p_request_id,p_values)$function$;
revoke all on function public.confirm_scorecard_player(uuid,uuid,jsonb),club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_scorecard_player(uuid,uuid,jsonb) to authenticated;
grant usage on schema club_batting_private to authenticated;
