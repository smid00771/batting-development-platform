-- Keep the same access rules; stop before fixture scans when simpler checks decide access.

CREATE OR REPLACE FUNCTION public.can_view_player(target_player uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.players%rowtype; u uuid:=auth.uid();
begin
 if u is null then return false; end if;
 select * into p from public.players where id=target_player;
 if not found then return false; end if;
 if p.user_id=u then return true; end if;
 if public.is_club_admin(p.club_id) then return true; end if;
 if exists (
          select 1
          from public.club_access_grants g
          where g.club_id=p.club_id
            and g.user_id=auth.uid()
            and g.can_view=true
            and (
              g.scope='whole_club'
              or (
                g.scope='playing_group'
                and exists (
                  select 1
                  from public.player_playing_groups ppg
                  where ppg.player_id=p.id
                    and ppg.playing_group_id=g.playing_group_id
                )
              )
              or (g.scope='grade' and coalesce(p.grade,'')=g.grade)
              or (g.scope='player' and g.player_id=p.id)
            )
        ) then return true; end if;
 if club_batting_private.roster_coaching_access(p.club_id,p.id,u,false) then return true; end if;
 if club_selection_private.temporary_captain_player(p.club_id,p.id,u) then return true; end if;
 return coalesce(club_selection_private.season_captain_player(p.club_id,p.id,u),false);
end
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_player(target_player uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.players%rowtype; u uuid:=auth.uid();
begin
 if u is null then return false; end if;
 select * into p from public.players where id=target_player;
 if not found then return false; end if;

 if public.is_club_admin(p.club_id) then return true; end if;
 if exists (
          select 1
          from public.club_access_grants g
          where g.club_id=p.club_id
            and g.user_id=auth.uid()
            and g.can_edit=true
            and (
              g.scope='whole_club'
              or (
                g.scope='playing_group'
                and exists (
                  select 1
                  from public.player_playing_groups ppg
                  where ppg.player_id=p.id
                    and ppg.playing_group_id=g.playing_group_id
                )
              )
              or (g.scope='grade' and coalesce(p.grade,'')=g.grade)
              or (g.scope='player' and g.player_id=p.id)
            )
        ) then return true; end if;
 if club_batting_private.roster_coaching_access(p.club_id,p.id,u,true) then return true; end if;
 if club_selection_private.temporary_captain_player(p.club_id,p.id,u) then return true; end if;
 return coalesce(club_selection_private.season_captain_player(p.club_id,p.id,u),false);
end
$function$;

CREATE OR REPLACE FUNCTION club_batting_private.roster_coaching_access(c uuid, pid uuid, u uuid, editing boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
 -- No grade/group grant can use the fixture-based coaching path.
 if u is null or not exists(select 1 from public.club_access_grants g
  where g.club_id=c and g.user_id=u and g.scope in ('playing_group','grade')
  and case when editing then g.can_edit else g.can_view end) then return false; end if;
 return (select u is not null and club_selection_private.member(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 and exists(select 1 from club_batting_private.roster_players rp join club_selection_private.roster r on r.id=rp.roster_id and r.club_id=c and r.active
 join (select fx.details,coalesce(fx.published,club_batting_private.completed_review_snapshot(c,fx.id)) published from club_selection_private.fixtures fx where fx.club_id=c) f on f.published is not null
 and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))
 join public.club_access_grants g on g.club_id=c and g.user_id=u
 where rp.club_id=c and rp.player_id=pid and (case when editing then g.can_edit else g.can_view end)
 and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
 and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
 and ((g.scope='playing_group' and g.playing_group_id=club_selection_private.fixture_group_id(c,f.published->'details'))
 or (g.scope='grade' and g.grade=f.published->'details'->>'grade'))
 and exists(select 1 from jsonb_array_elements(f.published->'slots') s where s->>'d1'=r.id::text or (jsonb_array_length(f.published->'details'->'days')>1 and s->>'d2'=r.id::text))));
end
$function$;

CREATE OR REPLACE FUNCTION club_batting_private.coaching_message_recipient(aid uuid, u uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 -- Decide whether this person is a recipient before checking coaching access.
 if not (select exists(select 1 from public.player_coaching_actions a
 join public.players p on p.id=a.player_id and p.club_id=a.club_id and p.active
 join public.clubs c on c.id=a.club_id and c.archived_at is null
 join public.club_memberships m on m.club_id=c.id and m.user_id=u
 where a.id=aid and club_batting_private.player_uses_batting(c.id,p.id)
 and (case when a.preferred_user_id is not null then a.preferred_user_id=u else exists(
  select 1 from club_batting_private.coaching_duties d join club_batting_private.coaching_duty_members dm on dm.club_id=d.club_id and dm.duty_id=d.id
  where d.club_id=c.id and d.receives_batting_conversations and dm.user_id=u) end))) then return false; end if;
 return (select exists(select 1 from public.player_coaching_actions a
 join public.players p on p.id=a.player_id and p.club_id=a.club_id and p.active
 join public.clubs c on c.id=a.club_id and c.archived_at is null
 join public.club_memberships m on m.club_id=c.id and m.user_id=u
 where a.id=aid and club_batting_private.player_uses_batting(c.id,p.id)
 and (case when a.preferred_user_id is not null then a.preferred_user_id=u else exists(
  select 1 from club_batting_private.coaching_duties d join club_batting_private.coaching_duty_members dm on dm.club_id=d.club_id and dm.duty_id=d.id
  where d.club_id=c.id and d.receives_batting_conversations and dm.user_id=u) end)
 and (a.is_player_request and a.preferred_user_id=u or m.permission_role='admin'
  or club_batting_private.roster_coaching_access(c.id,p.id,u,false)
  or club_selection_private.temporary_captain_player(c.id,p.id,u)
  or club_selection_private.season_captain_player(c.id,p.id,u)
  or exists(select 1 from public.club_access_grants g where g.club_id=c.id and g.user_id=u and g.can_view
   and (g.scope='whole_club' or g.scope='player' and g.player_id=p.id or g.scope='grade' and coalesce(p.grade,'')=g.grade
    or g.scope='playing_group' and exists(select 1 from public.player_playing_groups pg where pg.player_id=p.id and pg.playing_group_id=g.playing_group_id))))));
end
$function$;

-- A notification opens its one observation, not a player's whole innings history.
create or replace function club_batting_private.get_my_coaching_observation(p_club_id uuid,p_observation_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare pid uuid; mid uuid; entry jsonb;
begin
 select p.id into pid from public.players p
 join public.clubs c on c.id=p.club_id and c.archived_at is null
 join public.club_memberships cm on cm.club_id=p.club_id and cm.user_id=auth.uid()
 where p.club_id=p_club_id and p.user_id=auth.uid() and p.active;
 if pid is null then raise exception 'An active player registration is required'; end if;
 select m.id into mid from public.player_match_coach_feedback f
 join public.player_match_entries m on m.id=f.match_entry_id and m.player_id=f.player_id
 where f.id=p_observation_id and f.player_id=pid and m.club_id=p_club_id;
 if mid is null then return jsonb_build_object('player_id',pid,'matches','[]'::jsonb); end if;
 entry:=club_batting_private.shared_innings_json(mid)-'scorecard';
 entry:=jsonb_set(entry,'{coach_feedback}',coalesce((select jsonb_agg(f) from jsonb_array_elements(entry->'coach_feedback') f where f->>'id'=p_observation_id::text),'[]'::jsonb));
 return jsonb_build_object('player_id',pid,'matches',jsonb_build_array(entry));
end
$function$;
revoke all on function club_batting_private.get_my_coaching_observation(uuid,uuid) from public,anon;
grant execute on function club_batting_private.get_my_coaching_observation(uuid,uuid) to authenticated;
create or replace function public.get_my_coaching_observation(p_club_id uuid,p_observation_id uuid)
returns jsonb language sql stable set search_path='' as $function$
 select club_batting_private.get_my_coaching_observation(p_club_id,p_observation_id)
$function$;
revoke all on function public.get_my_coaching_observation(uuid,uuid) from public,anon;
grant execute on function public.get_my_coaching_observation(uuid,uuid) to authenticated;
