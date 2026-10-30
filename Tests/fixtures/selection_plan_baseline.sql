CREATE OR REPLACE FUNCTION club_batting_private.plan_reminder_due(p_club uuid, p_player uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare structure jsonb; raw jsonb; enabled jsonb; version integer; current_version integer; hwb_version integer;
 today date; r record; questions jsonb; q jsonb; answer jsonb; required integer; answered integer; any_answer integer; filled boolean; result jsonb:='[]';
begin
 if not club_batting_private.player_uses_batting(p_club,p_player) then return result;end if;
 if not exists(select 1 from public.players p join public.club_memberships m on m.club_id=p.club_id and m.user_id=p.user_id
  where p.id=p_player and p.club_id=p_club and p.active and m.involvement in ('player','both')) then return result; end if;
 select snapshot,philosophy_version into structure,version from public.player_plan_structure_versions where club_id=p_club order by philosophy_version desc limit 1;
 select version_number into current_version from public.philosophy_versions where club_id=p_club order by version_number desc limit 1;
 select philosophy_version into hwb_version from public.how_we_bat_versions where club_id=p_club order by philosophy_version desc limit 1;
 if version is null or version is distinct from current_version or version is distinct from hwb_version then return result; end if;
 select raw_answers into raw from public.player_plan_workflows where player_id=p_player;
 select formats_enabled into enabled from public.philosophy_profiles where club_id=p_club;
 select (now() at time zone coalesce((select timezone from public.club_call_settings where club_id=p_club),'UTC'))::date into today;
 for r in select pr.format_key,min(pr.due_date) due_date from public.player_plan_requirements pr
  where pr.club_id=p_club and pr.active and pr.due_date<today and coalesce(enabled->pr.format_key,'true')<>'false'::jsonb
   and (pr.target_type='all' or pr.target_type='player' and pr.player_id=p_player
    or pr.target_type='playing_group' and exists(select 1 from public.player_playing_groups pg join public.playing_groups g on g.id=pg.playing_group_id and g.club_id=pg.club_id and g.active and g.batting_enabled
       where pg.player_id=p_player and pg.club_id=p_club and pg.playing_group_id=pr.playing_group_id))
  group by pr.format_key order by min(pr.due_date),pr.format_key loop
  questions:=structure->'formats'->r.format_key;
  -- Current published questions are authoritative, not a stale section_status stamp.
  if jsonb_typeof(questions) is distinct from 'array' then continue; end if;
  required:=0;answered:=0;any_answer:=0;
  for q in select value from jsonb_array_elements(questions) where value->'active' is distinct from 'false'::jsonb loop
   answer:=raw->'formats'->r.format_key->(q->>'id');
   filled:=case when jsonb_typeof(answer->'choices')='array' then jsonb_array_length(answer->'choices')>0 else false end or length(btrim(coalesce(answer->>'comment','')))>0;
   if filled then any_answer:=any_answer+1; end if;
   if q->'required' is distinct from 'false'::jsonb then required:=required+1;if filled then answered:=answered+1;end if;end if;
  end loop;
  if not(case when required>0 then required=answered else any_answer>0 end) then
   result:=result||jsonb_build_array(jsonb_build_object('format_key',r.format_key,'due_date',r.due_date));
  end if;
 end loop;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_player_plan_rollout(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pid uuid;
  groups_json jsonb;
  requirements_json jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select id into pid
  from public.players
  where club_id=p_club_id
    and user_id=auth.uid()
    and active=true
  limit 1;

  if pid is null or not club_batting_private.player_uses_batting(p_club_id,pid) then
    return jsonb_build_object('groups','[]'::jsonb,'requirements','[]'::jsonb);
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id',q.id,'name',q.name)
      order by q.sort_order,q.name
    ),
    '[]'::jsonb
  )
  into groups_json
  from (
    select pg.id,pg.name,pg.sort_order
    from public.player_playing_groups ppg
    join public.playing_groups pg on pg.id=ppg.playing_group_id
    where ppg.player_id=pid
      and pg.active=true and pg.batting_enabled
  ) q;

  with format_list(format_key,sort_order) as (
    values
      ('t20'::text,1),
      ('limited_overs'::text,2),
      ('long_form'::text,3)
  ),
  matched as (
    select
      f.format_key,
      f.sort_order,
      r.id,
      r.due_date,
      case
        when r.target_type='all' then 'All players'
        when r.target_type='playing_group' then pg.name
        when r.target_type='player' then 'Individual requirement'
        else null
      end as source_label
    from format_list f
    left join public.player_plan_requirements r
      on r.club_id=p_club_id
     and r.format_key=f.format_key
     and r.active=true
     and (
       r.target_type='all'
       or (r.target_type='player' and r.player_id=pid)
       or (
         r.target_type='playing_group'
         and club_batting_private.group_uses_batting(p_club_id,r.playing_group_id)
         and exists (
           select 1
           from public.player_playing_groups ppg
           where ppg.player_id=pid
             and ppg.playing_group_id=r.playing_group_id
         )
       )
     )
    left join public.playing_groups pg on pg.id=r.playing_group_id
  ),
  rolled as (
    select
      format_key,
      sort_order,
      bool_or(id is not null) as required,
      case
        when bool_or(id is not null and due_date is null) then null
        else min(due_date)
      end as due_date,
      coalesce(
        array_agg(distinct source_label order by source_label)
          filter (where source_label is not null),
        array[]::text[]
      ) as sources
    from matched
    group by format_key,sort_order
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'format_key',format_key,
        'required',required,
        'due_date',due_date,
        'sources',to_jsonb(sources)
      )
      order by sort_order
    ),
    '[]'::jsonb
  )
  into requirements_json
  from rolled;

  return jsonb_build_object(
    'groups',groups_json,
    'requirements',requirements_json
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_plan_rollout_progress(p_club_id uuid)
 RETURNS TABLE(requirement_id uuid, eligible_count bigint, completed_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_club_admin(p_club_id) then
    raise exception 'Club Admin access required';
  end if;

  return query
  select
    r.id as requirement_id,
    count(distinct p.id) as eligible_count,
    count(distinct p.id) filter (
      where coalesce(w.section_status,'{}'::jsonb) ? r.format_key
    ) as completed_count
  from public.player_plan_requirements r
  left join public.players p
    on p.club_id=r.club_id
   and p.active=true
   and (
     r.target_type='all'
     or (r.target_type='player' and r.player_id=p.id)
     or (
       r.target_type='playing_group'
       and exists (
         select 1
         from public.player_playing_groups ppg
         where ppg.player_id=p.id
           and ppg.playing_group_id=r.playing_group_id
       )
     )
   )
  left join public.player_plan_workflows w on w.player_id=p.id
  where r.club_id=p_club_id
    and r.active=true
  group by r.id;
end;
$function$;

CREATE OR REPLACE FUNCTION club_batting_private.player_uses_batting(c uuid, pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.players p where p.club_id=c and p.id=pid and p.active and (
  not exists(select 1 from club_selection_private.access a where a.club_id=c)
  or exists(select 1 from public.player_playing_groups x join public.playing_groups g on g.id=x.playing_group_id and g.club_id=c and g.active and g.batting_enabled where x.club_id=c and x.player_id=p.id)
  or exists(select 1 from club_selection_private.roster r left join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=r.id
   join club_selection_private.fixtures f on f.club_id=c and f.published is not null
   where r.club_id=c and r.active and (rp.player_id=p.id or (rp.player_id is null and r.user_id=p.user_id))
   and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
   and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
   and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))
   and exists(select 1 from jsonb_array_elements(f.published->'slots') s where s->>'d1'=r.id::text or s->>'d2'=r.id::text))
 ))
$function$;

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
          'id',vp.id,
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
                  when r.target_type='player' then 'Individual requirement'
                  when r.target_type='playing_group' then coalesce(target_group.name,'Playing Group')
                  else null
                end
              )
              order by r.format_key,r.due_date nulls first,r.created_at
            )
            from public.player_plan_requirements r
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
