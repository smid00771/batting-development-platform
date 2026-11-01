-- Existing function definitions, captured for local before/after regression checks.
CREATE OR REPLACE FUNCTION public.can_view_player(target_player uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.players p
    where p.id=target_player
      and (
        p.user_id=auth.uid()
        or public.is_club_admin(p.club_id)
        or club_batting_private.roster_coaching_access(p.club_id,p.id,auth.uid(),false)
        or club_selection_private.temporary_captain_player(p.club_id,p.id,auth.uid())
        or club_selection_private.season_captain_player(p.club_id,p.id,auth.uid())
        or exists (
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
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_player(target_player uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.players p
    where p.id=target_player
      and (
        public.is_club_admin(p.club_id)
        or club_batting_private.roster_coaching_access(p.club_id,p.id,auth.uid(),true)
        or club_selection_private.temporary_captain_player(p.club_id,p.id,auth.uid())
        or club_selection_private.season_captain_player(p.club_id,p.id,auth.uid())
        or exists (
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
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION club_batting_private.roster_coaching_access(c uuid, pid uuid, u uuid, editing boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select u is not null and club_selection_private.member(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 and exists(select 1 from club_batting_private.roster_players rp join club_selection_private.roster r on r.id=rp.roster_id and r.club_id=c and r.active
 join (select fx.details,coalesce(fx.published,club_batting_private.completed_review_snapshot(c,fx.id)) published from club_selection_private.fixtures fx where fx.club_id=c) f on f.published is not null
 and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))
 join public.club_access_grants g on g.club_id=c and g.user_id=u
 where rp.club_id=c and rp.player_id=pid and (case when editing then g.can_edit else g.can_view end)
 and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
 and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
 and ((g.scope='playing_group' and g.playing_group_id=club_selection_private.fixture_group_id(c,f.published->'details'))
 or (g.scope='grade' and g.grade=f.published->'details'->>'grade'))
 and exists(select 1 from jsonb_array_elements(f.published->'slots') s where s->>'d1'=r.id::text or (jsonb_array_length(f.published->'details'->'days')>1 and s->>'d2'=r.id::text)))
$function$;

CREATE OR REPLACE FUNCTION club_batting_private.coaching_message_recipient(aid uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.player_coaching_actions a
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
    or g.scope='playing_group' and exists(select 1 from public.player_playing_groups pg where pg.player_id=p.id and pg.playing_group_id=g.playing_group_id)))))
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.temporary_captain_player(c uuid, pid uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) and exists(
 select 1 from club_selection_private.temporary_captain_days(c,u) d join club_selection_private.fixtures f on f.id=d.fixture_id and f.club_id=c
 join public.players p on p.id=pid and p.club_id=c and p.active
 where (d.day_key='manual' and exists(select 1 from club_batting_private.fixture_review_rosters r where r.fixture_id=f.id and r.club_id=c and p.id=any(r.player_ids)))
 or (d.day_key<>'manual' and exists(select 1 from jsonb_array_elements(coalesce(f.published->'slots',f.slots)) s join club_selection_private.roster r on r.club_id=c and r.active and (r.user_id=p.user_id or exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id and rp.club_id=c and rp.player_id=p.id)) and (s->>'d1'=r.id::text or s->>'d2'=r.id::text))))
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.temporary_captain_days(c uuid, u uuid, at_time timestamp with time zone DEFAULT now())
 RETURNS TABLE(fixture_id uuid, day_key text, match_date date, expires_at timestamp with time zone, group_id uuid, grade text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select f.id,'d'||d.n::text,(d.value->>'date')::date,club_selection_private.captain_expires(c,f.details),club_selection_private.fixture_group_id(c,f.details),f.details->>'grade'
 from club_selection_private.fixtures f cross join lateral (select coalesce(f.published->'details',f.details) details,coalesce(f.published->'slots',f.slots) slots) src
 cross join lateral jsonb_array_elements(src.details->'days') with ordinality d(value,n)
 join club_selection_private.roster cap on cap.club_id=c and cap.active and cap.user_id=u
 and case when jsonb_typeof(src.details->'match_roles')='object' then cap.id::text=src.details->'match_roles'->('d'||d.n::text)->>'captain_id' else u::text=src.details->>'captain_id' end
 where f.club_id=c and club_selection_private.member(c,u) and club_selection_private.enabled(c)
 and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((src.details->>'cancelled')::boolean,false) and at_time<club_selection_private.captain_expires(c,f.details)
 and not(f.published is null and exists(select 1 from club_batting_private.fixture_review_rosters r where r.fixture_id=f.id and r.club_id=c))
 and exists(select 1 from jsonb_array_elements(src.slots) s where s->>('d'||d.n::text)=cap.id::text)
 union all
 select f.id,'manual',(f.details->'days'->0->>'date')::date,club_selection_private.captain_expires(c,f.details),club_selection_private.fixture_group_id(c,f.details),f.details->>'grade'
 from club_selection_private.fixtures f join club_batting_private.fixture_review_rosters r on r.fixture_id=f.id and r.club_id=c
 join public.players p on p.id::text=club_selection_private.manual_match_roles(c,f.id)->>'captain_player_id' and p.club_id=c and p.active and p.user_id=u and p.id=any(r.player_ids)
 where f.club_id=c and f.published is null and club_selection_private.member(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 and not coalesce((f.details->>'cancelled')::boolean,false) and at_time<club_selection_private.captain_expires(c,f.details)
$function$;

CREATE OR REPLACE FUNCTION club_selection_private.season_captain_player(c uuid, pid uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select club_selection_private.member(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
 and exists(select 1 from public.players p where p.id=pid and p.club_id=c and p.active
 and exists(select 1 from club_selection_private.season_appointments a join public.playing_groups g on g.id=a.group_id and g.club_id=c and g.active
 where a.club_id=c and u=any(club_selection_private.season_captains(c,a.group_id)) and (
 exists(select 1 from public.player_playing_groups x where x.club_id=c and x.player_id=p.id and x.playing_group_id=g.id)
 or exists(select 1 from club_selection_private.fixtures f where f.club_id=c and club_selection_private.fixture_group_id(c,f.details)=g.id and not coalesce((f.details->>'cancelled')::boolean,false) and (
 (f.published is null and exists(select 1 from jsonb_array_elements(club_batting_private.completed_review_snapshot(c,f.id)->'slots') s join club_batting_private.roster_players rp on rp.club_id=c and rp.player_id=p.id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)))
 or (f.published is null and exists(select 1 from club_batting_private.fixture_review_rosters r where r.fixture_id=f.id and r.club_id=c and p.id=any(r.player_ids)))
 or(f.published is not null and not coalesce((f.published->'details'->>'cancelled')::boolean,false) and exists(select 1 from jsonb_array_elements(f.published->'slots') s join club_selection_private.roster r on r.club_id=c and (r.user_id=p.user_id or exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id and rp.club_id=c and rp.player_id=p.id)) and r.active and (s->>'d1'=r.id::text or s->>'d2'=r.id::text)))
 )))))
$function$;
