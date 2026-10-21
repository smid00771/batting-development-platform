-- Manage the saved club setup without downloading or importing a season.
create or replace function public.selection_group_management_context(p_club_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; season uuid; catalogue club_selection_private.playhq_team_catalogues%rowtype;
begin
 if auth.uid() is null or not club_selection_private.member(p_club_id,auth.uid()) or not public.is_club_admin(p_club_id) then raise exception 'Club Admin manages Selection Groups';end if;
 if not club_selection_private.enabled(p_club_id) then raise exception 'Club Selections access required';end if;
 result:=club_selection_private.selection_groups_context(p_club_id)||jsonb_build_object('can_edit',true);
 select active_season_id into season from club_selection_private.playhq_connections where club_id=p_club_id;
 select t.* into catalogue from club_selection_private.playhq_team_catalogues t
 join club_selection_private.playhq_connections c on c.club_id=t.club_id and c.generation=t.generation
 where t.club_id=p_club_id and t.season_id=season;
 return result||jsonb_build_object('season',season,'catalogue',catalogue.id,'teams',coalesce(catalogue.teams,'[]'::jsonb));
end $$;
revoke all on function public.selection_group_management_context(uuid) from public,anon;
grant execute on function public.selection_group_management_context(uuid) to authenticated;
