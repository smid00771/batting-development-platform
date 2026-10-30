-- Only a genuine match conflict needs attention after automatic account claiming.
create or replace function club_batting_private.player_signup_status(c uuid,pid uuid) returns text
language sql stable set search_path='' as $$
 select case when p.user_id is not null then 'linked'
 when exists(select 1 from club_batting_private.roster_players rp join club_selection_private.roster r on r.id=rp.roster_id and r.club_id=rp.club_id
  where rp.club_id=c and rp.player_id=p.id and (
   club_batting_private.verified_roster_user(c,r.user_id)
   or exists(select 1 from public.club_memberships cm join public.user_profiles up on up.user_id=cm.user_id join auth.users u on u.id=cm.user_id
    where cm.club_id=c and club_batting_private.verified_roster_user(c,cm.user_id)
     and (r.account_email is not null and r.account_email=lower(btrim(u.email)) or club_selection_private.account_name_key(r.name)=club_selection_private.account_name_key(up.display_name))))) then 'clash'
 else 'no_confirmed_signup' end
 from public.players p where p.id=pid and p.club_id=c
$$;
revoke all on function club_batting_private.player_signup_status(uuid,uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_players_workspace(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  member_role text;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.permission_role
  into member_role
  from public.club_memberships m
  where m.club_id=p_club_id
    and m.user_id=auth.uid();

  if member_role is null then
    raise exception 'You are not a member of this club';
  end if;

  if member_role not in ('captain','coach','head_coach','admin') and club_selection_private.batting_captain(p_club_id,auth.uid()) then member_role:='captain';end if;

  if member_role not in ('captain','coach','head_coach','admin') then
    return jsonb_build_object(
      'role',member_role,
      'groups','[]'::jsonb,
      'players','[]'::jsonb
    );
  end if;

  with visible_players as (
    select p.id,p.user_id,p.display_name,p.active
    from public.players p
    where p.club_id=p_club_id
      and p.active=true and club_batting_private.player_uses_batting(p_club_id,p.id)
      and public.can_view_player(p.id)
  ),
  permitted_groups as (
    select pg.id,pg.name,pg.sort_order
    from public.playing_groups pg
    where pg.club_id=p_club_id
      and pg.active=true and pg.batting_enabled
      and (
        public.is_club_admin(p_club_id)
        or exists(select 1 from club_selection_private.temporary_captain_days(p_club_id,auth.uid()) d where d.group_id=pg.id)
        or auth.uid()=any(club_selection_private.season_captains(p_club_id,pg.id))
        or exists (
          select 1
          from public.club_access_grants g
          where g.club_id=p_club_id
            and g.user_id=auth.uid()
            and g.can_view=true
            and g.scope='whole_club'
        )
        or exists (
          select 1
          from public.club_access_grants g
          where g.club_id=p_club_id
            and g.user_id=auth.uid()
            and g.can_view=true
            and g.scope='playing_group'
            and g.playing_group_id=pg.id
        )
        or exists (
          select 1
          from public.club_access_grants g
          where g.club_id=p_club_id
            and g.user_id=auth.uid()
            and g.can_view=true
            and g.scope='grade'
            and lower(trim(coalesce(g.grade,'')))=lower(trim(pg.name))
        )
      )
  )
  select jsonb_build_object(
    'role',member_role,
    'groups',coalesce((
      select jsonb_agg(
        jsonb_build_object('id',g.id,'name',g.name)
        order by g.sort_order,g.name
      )
      from permitted_groups g
    ),'[]'::jsonb),
    'players',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',vp.id,'user_id',vp.user_id,'signup_status',club_batting_private.player_signup_status(p_club_id,vp.id),
          'display_name',vp.display_name,
          'can_edit',public.can_edit_player(vp.id),
          'overdue_plan_sections',club_batting_private.plan_reminder_due(p_club_id,vp.id),
          'groups',coalesce((
            select jsonb_agg(
              jsonb_build_object('id',pg.id,'name',pg.name)
              order by pg.sort_order,pg.name
            )
            from public.player_playing_groups ppg
            join public.playing_groups pg
              on pg.id=ppg.playing_group_id
             and pg.club_id=ppg.club_id
            where ppg.player_id=vp.id
              and pg.active=true and pg.batting_enabled
          ),'[]'::jsonb),
          'workflow',(
            select jsonb_build_object(
              'raw_answers',coalesce(w.raw_answers,'{}'::jsonb),
              'curated_draft',coalesce(w.curated_draft,'{}'::jsonb),
              'section_status',coalesce(w.section_status,'{}'::jsonb),
              'status',w.status,
              'submitted_at',w.submitted_at,
              'updated_at',w.updated_at
            )
            from public.player_plan_workflows w
            where w.player_id=vp.id
            limit 1
          ),
          'requirements',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'format_key',r.format_key,
                'due_date',r.due_date,
                'source_label',case
                  when r.target_type='all' then 'All players'
                  when r.target_type='player' then case when club_batting_private.linked_plan_club(r.club_id) then 'First selected fixture · one week before' else 'Individual requirement' end
                  when r.target_type='playing_group' then coalesce(target_group.name,'Playing Group')
                  else null
                end
              )
              order by r.format_key,r.due_date nulls first,r.created_at
            )
            from club_batting_private.effective_plan_requirements r
            left join public.playing_groups target_group
              on target_group.id=r.playing_group_id
            where r.club_id=p_club_id
              and r.active=true
              and (
                r.target_type='all'
                or (r.target_type='player' and r.player_id=vp.id)
                or (
                  r.target_type='playing_group'
                  and club_batting_private.group_uses_batting(p_club_id,r.playing_group_id)
                  and exists (
                    select 1
                    from public.player_playing_groups target_ppg
                    where target_ppg.player_id=vp.id
                      and target_ppg.playing_group_id=r.playing_group_id
                  )
                )
              )
          ),'[]'::jsonb)
        )
        order by lower(vp.display_name),vp.display_name
      )
      from visible_players vp
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$function$;
