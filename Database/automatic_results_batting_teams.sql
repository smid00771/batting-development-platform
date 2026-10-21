-- Clubs choose which teams participate in Club Batting. Teams/results stay available to all.
alter table public.playing_groups add column batting_enabled boolean not null default false;
update public.playing_groups g set batting_enabled=true where
 exists(select 1 from public.player_playing_groups p where p.club_id=g.club_id and p.playing_group_id=g.id)
 or not exists(select 1 from club_selection_private.access a where a.club_id=g.club_id);

-- One explicit group choice governs every team in that Selection Group.
alter table club_selection_private.selection_groups add column batting_enabled boolean not null default false;
update club_selection_private.selection_groups sg set batting_enabled=exists(
 select 1 from club_selection_private.selection_group_grades m join public.playing_groups g on g.id=m.grade_id and g.club_id=sg.club_id
 where m.selection_group_id=sg.id and m.club_id=sg.club_id and g.batting_enabled);
update public.playing_groups g set batting_enabled=sg.batting_enabled
 from club_selection_private.selection_group_grades m join club_selection_private.selection_groups sg on sg.id=m.selection_group_id and sg.club_id=m.club_id
 where g.id=m.grade_id and g.club_id=m.club_id;
-- A newly imported or moved team inherits the saved group choice automatically.
create function club_selection_private.sync_group_batting_choice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='selection_groups' then
  update public.playing_groups g set batting_enabled=new.batting_enabled
  from club_selection_private.selection_group_grades m where m.grade_id=g.id and m.club_id=g.club_id and m.club_id=new.club_id and m.selection_group_id=new.id;
 elsif tg_op='DELETE' then
  update public.playing_groups set batting_enabled=false where club_id=old.club_id and id=old.grade_id;
 else
  update public.playing_groups g set batting_enabled=sg.batting_enabled
  from club_selection_private.selection_groups sg where sg.id=new.selection_group_id and sg.club_id=new.club_id and g.id=new.grade_id and g.club_id=new.club_id;
 end if;
 return null;
end $$;
revoke all on function club_selection_private.sync_group_batting_choice() from public,anon,authenticated,service_role;
create trigger selection_group_batting_choice after update of batting_enabled on club_selection_private.selection_groups for each row execute function club_selection_private.sync_group_batting_choice();
create trigger selection_team_batting_choice after insert or update or delete on club_selection_private.selection_group_grades for each row execute function club_selection_private.sync_group_batting_choice();

create function club_batting_private.group_uses_batting(c uuid,g uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.playing_groups p where p.id=g and p.club_id=c and p.active and p.batting_enabled)
$$;
-- Memberships remain intact on opting out. Participation can also follow a published XI,
-- so turning a team on works immediately without republishing or a second score upload.
create function club_batting_private.player_uses_batting(c uuid,pid uuid) returns boolean
language sql stable security definer set search_path='' as $$
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
$$;
revoke all on function club_batting_private.group_uses_batting(uuid,uuid),club_batting_private.player_uses_batting(uuid,uuid) from public,anon,authenticated;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_playing_group';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$club_id,name,sort_order,active,created_by$old$,''))<>length($old$club_id,name,sort_order,active,created_by$old$) then raise exception 'Unexpected definition: create_playing_group';end if;
 s:=replace(s,$old$club_id,name,sort_order,active,created_by$old$,$new$club_id,name,sort_order,active,created_by,batting_enabled$new$);
 if length(s)-length(replace(s,$old$p_club_id,trim(p_name),next_order,true,auth.uid()$old$,''))<>length($old$p_club_id,trim(p_name),next_order,true,auth.uid()$old$) then raise exception 'Unexpected definition: create_playing_group';end if;
 s:=replace(s,$old$p_club_id,trim(p_name),next_order,true,auth.uid()$old$,$new$p_club_id,trim(p_name),next_order,true,auth.uid(),not exists(select 1 from club_selection_private.access where club_id=p_club_id)$new$);
 execute s;
end $patch$;


do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='sync_publication_groups';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$  -- An explicit shared player identity$old$,''))<>length($old$  -- An explicit shared player identity$old$) then raise exception 'Unexpected definition: sync_publication_groups';end if;
 s:=replace(s,$old$  -- An explicit shared player identity$old$,$new$  if not club_batting_private.group_uses_batting(c,gid) then continue;end if;
  -- An explicit shared player identity$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='ensure_review_players';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$exists(select 1 from club_selection_private.fixtures f where f.club_id=c and f.published is not null$old$,''))<>length($old$exists(select 1 from club_selection_private.fixtures f where f.club_id=c and f.published is not null$old$) then raise exception 'Unexpected definition: ensure_review_players';end if;
 s:=replace(s,$old$exists(select 1 from club_selection_private.fixtures f where f.club_id=c and f.published is not null$old$,$new$exists(select 1 from club_selection_private.fixtures f where f.club_id=c and f.published is not null
  and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))$new$);
 if length(s)-length(replace(s,$old$and g.active where a.club_id=c$old$,''))<>length($old$and g.active where a.club_id=c$old$) then raise exception 'Unexpected definition: ensure_review_players';end if;
 s:=replace(s,$old$and g.active where a.club_id=c$old$,$new$and g.active and g.batting_enabled where a.club_id=c$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='roster_coaching_access';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$ join club_selection_private.fixtures f on f.club_id=c and f.published is not null$old$,''))<>length($old$ join club_selection_private.fixtures f on f.club_id=c and f.published is not null$old$) then raise exception 'Unexpected definition: roster_coaching_access';end if;
 s:=replace(s,$old$ join club_selection_private.fixtures f on f.club_id=c and f.published is not null$old$,$new$ join club_selection_private.fixtures f on f.club_id=c and f.published is not null
 and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='review_fixture_options';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$and g.club_id=c and g.active
$old$,''))<>length($old$and g.club_id=c and g.active
$old$) then raise exception 'Unexpected definition: review_fixture_options';end if;
 s:=replace(s,$old$and g.club_id=c and g.active
$old$,$new$and g.club_id=c and g.active and g.batting_enabled
$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='get_team_review_roster';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$where g.club_id=p_club_id and g.active;$old$,''))<>length($old$where g.club_id=p_club_id and g.active;$old$) then raise exception 'Unexpected definition: get_team_review_roster';end if;
 s:=replace(s,$old$where g.club_id=p_club_id and g.active;$old$,$new$where g.club_id=p_club_id and g.active and g.batting_enabled;$new$);
 if length(s)-length(replace(s,$old$and pg.active and pg.club_id=p_club_id$old$,''))<>length($old$and pg.active and pg.club_id=p_club_id$old$) then raise exception 'Unexpected definition: get_team_review_roster';end if;
 s:=replace(s,$old$and pg.active and pg.club_id=p_club_id$old$,$new$and pg.active and pg.batting_enabled and pg.club_id=p_club_id$new$);
 if length(s)-length(replace(s,$old$where p.club_id=p_club_id and p.active and public.can_read$old$,''))<>length($old$where p.club_id=p_club_id and p.active and public.can_read$old$) then raise exception 'Unexpected definition: get_team_review_roster';end if;
 s:=replace(s,$old$where p.club_id=p_club_id and p.active and public.can_read$old$,$new$where p.club_id=p_club_id and p.active and club_batting_private.player_uses_batting(p_club_id,p.id) and public.can_read$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='plan_reminder_due';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$begin
 if not exists$old$,''))<>length($old$begin
 if not exists$old$) then raise exception 'Unexpected definition: plan_reminder_due';end if;
 s:=replace(s,$old$begin
 if not exists$old$,$new$begin
 if not club_batting_private.player_uses_batting(p_club,p_player) then return result;end if;
 if not exists$new$);
 if length(s)-length(replace(s,$old$and g.club_id=pg.club_id and g.active
$old$,''))<>length($old$and g.club_id=pg.club_id and g.active
$old$) then raise exception 'Unexpected definition: plan_reminder_due';end if;
 s:=replace(s,$old$and g.club_id=pg.club_id and g.active
$old$,$new$and g.club_id=pg.club_id and g.active and g.batting_enabled
$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_my_player_plan_rollout';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$if pid is null then$old$,''))<>length($old$if pid is null then$old$) then raise exception 'Unexpected definition: get_my_player_plan_rollout';end if;
 s:=replace(s,$old$if pid is null then$old$,$new$if pid is null or not club_batting_private.player_uses_batting(p_club_id,pid) then$new$);
 if length(s)-length(replace(s,$old$and pg.active=true$old$,''))<>length($old$and pg.active=true$old$) then raise exception 'Unexpected definition: get_my_player_plan_rollout';end if;
 s:=replace(s,$old$and pg.active=true$old$,$new$and pg.active=true and pg.batting_enabled$new$);
 if length(s)-length(replace(s,$old$r.target_type='playing_group'
         and exists$old$,''))<>length($old$r.target_type='playing_group'
         and exists$old$) then raise exception 'Unexpected definition: get_my_player_plan_rollout';end if;
 s:=replace(s,$old$r.target_type='playing_group'
         and exists$old$,$new$r.target_type='playing_group'
         and club_batting_private.group_uses_batting(p_club_id,r.playing_group_id)
         and exists$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='queue_player_plan_ready';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$where m.club_id=p_club_id and m.involvement$old$,''))<>length($old$where m.club_id=p_club_id and m.involvement$old$) then raise exception 'Unexpected definition: queue_player_plan_ready';end if;
 s:=replace(s,$old$where m.club_id=p_club_id and m.involvement$old$,$new$where m.club_id=p_club_id and exists(select 1 from public.players bp where bp.club_id=p_club_id and bp.user_id=m.user_id and club_batting_private.player_uses_batting(p_club_id,bp.id)) and m.involvement$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_players_workspace';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$and p.active=true
$old$,''))<>length($old$and p.active=true
$old$) then raise exception 'Unexpected definition: get_players_workspace';end if;
 s:=replace(s,$old$and p.active=true
$old$,$new$and p.active=true and club_batting_private.player_uses_batting(p_club_id,p.id)
$new$);
 if length(s)-length(replace(s,$old$and pg.active=true
      and ($old$,''))<>length($old$and pg.active=true
      and ($old$) then raise exception 'Unexpected definition: get_players_workspace';end if;
 s:=replace(s,$old$and pg.active=true
      and ($old$,$new$and pg.active=true and pg.batting_enabled
      and ($new$);
 if length(s)-length(replace(s,$old$and pg.active=true
          )$old$,''))<>length($old$and pg.active=true
          )$old$) then raise exception 'Unexpected definition: get_players_workspace';end if;
 s:=replace(s,$old$and pg.active=true
          )$old$,$new$and pg.active=true and pg.batting_enabled
          )$new$);
 if length(s)-length(replace(s,$old$r.target_type='playing_group'
                  and exists$old$,''))<>length($old$r.target_type='playing_group'
                  and exists$old$) then raise exception 'Unexpected definition: get_players_workspace';end if;
 s:=replace(s,$old$r.target_type='playing_group'
                  and exists$old$,$new$r.target_type='playing_group'
                  and club_batting_private.group_uses_batting(p_club_id,r.playing_group_id)
                  and exists$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='batting_captain';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$select club_selection_private.temporary_captain(c,u) or (club_selection_private.season_captain(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false))$old$,''))<>length($old$select club_selection_private.temporary_captain(c,u) or (club_selection_private.season_captain(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false))$old$) then raise exception 'Unexpected definition: batting_captain';end if;
 s:=replace(s,$old$select club_selection_private.temporary_captain(c,u) or (club_selection_private.season_captain(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false))$old$,$new$select club_selection_private.member(c,u) and coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) and (
 exists(select 1 from club_selection_private.temporary_captain_days(c,u) d where club_batting_private.group_uses_batting(c,d.group_id))
 or exists(select 1 from public.playing_groups g where g.club_id=c and g.active and g.batting_enabled and u=any(club_selection_private.season_captains(c,g.id))))$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='my_match_captain_access';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$g.club_id=c and g.active and auth.uid()$old$,''))<>length($old$g.club_id=c and g.active and auth.uid()$old$) then raise exception 'Unexpected definition: my_match_captain_access';end if;
 s:=replace(s,$old$g.club_id=c and g.active and auth.uid()$old$,$new$g.club_id=c and g.active and g.batting_enabled and auth.uid()$new$);
 if length(s)-length(replace(s,$old$club_selection_private.temporary_captain_days(c,auth.uid()) d)$old$,''))<>length($old$club_selection_private.temporary_captain_days(c,auth.uid()) d)$old$) then raise exception 'Unexpected definition: my_match_captain_access';end if;
 s:=replace(s,$old$club_selection_private.temporary_captain_days(c,auth.uid()) d)$old$,$new$club_selection_private.temporary_captain_days(c,auth.uid()) d where club_batting_private.group_uses_batting(c,d.group_id))$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='api';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$'selector',sel,'admin',adm);end if;$old$,''))<>length($old$'selector',sel,'admin',adm);end if;$old$) then raise exception 'Unexpected definition: api';end if;
 s:=replace(s,$old$'selector',sel,'admin',adm);end if;$old$,$new$'selector',sel,'admin',adm,'batting_participant',exists(select 1 from public.players bp where bp.club_id=c and bp.user_id=me and club_batting_private.player_uses_batting(c,bp.id)),'batting_captain',club_selection_private.batting_captain(c,me));end if;$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='match_results_api';
 s:=replace(s,E'\r\n',E'\n');
 if length(s)-length(replace(s,$old$g.id=(data->>'group_id')::uuid and g.active;$old$,''))<>length($old$g.id=(data->>'group_id')::uuid and g.active;$old$) then raise exception 'Unexpected definition: match_results_api';end if;
 s:=replace(s,$old$g.id=(data->>'group_id')::uuid and g.active;$old$,$new$g.id=(data->>'group_id')::uuid and g.active and g.batting_enabled;
   if grade is null then raise exception 'Choose a team that uses Club Batting';end if;$new$);
 execute s;
end $patch$;

-- Continue refreshing previously confirmed PlayCricket sources without replacing their identities.
do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='playhq_sync_worker';
 if length(s)-length(replace(s,$old$'timezone',a.timezone) into answer$old$,''))<>length($old$'timezone',a.timezone) into answer$old$) then raise exception 'Unexpected definition: playhq_sync_worker';end if;
 s:=replace(s,$old$'timezone',a.timezone) into answer$old$,$new$'timezone',a.timezone,'canonical_match',(
   select jsonb_build_object('provider','playcricket_au','match_id',src.source_match_id,'team_id',src.team_id)
   from club_selection_private.fixture_result_sources src where src.fixture_id=f.id and src.club_id=c and src.no_play is null and src.team_id is not null
   and exists(select 1 from public.match_review_scorecards sc where sc.club_id=c and sc.source_match_id=src.source_match_id and sc.scorecard->>'provider'='playcricket_au')
  )) into answer$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='playhq_store_scorecard';
 if length(s)-length(replace(s,$old$ if card->>'provider' is distinct from 'playhq_au' or card->>'upstream_match_id' is distinct from l.match_id::text or card->>'upstream_grade_id' is distinct from l.grade_id::text or card->>'upstream_team_id' is distinct from l.team_id::text or coalesce(card->>'status','') not in ('completed','in_progress') or jsonb_typeof(card->'innings') is distinct from 'array' or octet_length(card::text)>750000 then raise exception 'Invalid PlayHQ shared scorecard';end if;
 mid:=(card->>'match_id')::uuid;tid:=(card->>'our_team_id')::uuid;d:=coalesce(f.published->'details',f.details);
 if mid=l.match_id then raise exception 'PlayHQ source namespace required';end if;
 if not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text and t->>'source_team_id'=l.team_id::text) then raise exception 'Wrong shared scorecard team';end if;
 select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
$old$,''))<>length($old$ if card->>'provider' is distinct from 'playhq_au' or card->>'upstream_match_id' is distinct from l.match_id::text or card->>'upstream_grade_id' is distinct from l.grade_id::text or card->>'upstream_team_id' is distinct from l.team_id::text or coalesce(card->>'status','') not in ('completed','in_progress') or jsonb_typeof(card->'innings') is distinct from 'array' or octet_length(card::text)>750000 then raise exception 'Invalid PlayHQ shared scorecard';end if;
 mid:=(card->>'match_id')::uuid;tid:=(card->>'our_team_id')::uuid;d:=coalesce(f.published->'details',f.details);
 if mid=l.match_id then raise exception 'PlayHQ source namespace required';end if;
 if not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text and t->>'source_team_id'=l.team_id::text) then raise exception 'Wrong shared scorecard team';end if;
 select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
$old$) then raise exception 'Unexpected definition: playhq_store_scorecard';end if;
 s:=replace(s,$old$ if card->>'provider' is distinct from 'playhq_au' or card->>'upstream_match_id' is distinct from l.match_id::text or card->>'upstream_grade_id' is distinct from l.grade_id::text or card->>'upstream_team_id' is distinct from l.team_id::text or coalesce(card->>'status','') not in ('completed','in_progress') or jsonb_typeof(card->'innings') is distinct from 'array' or octet_length(card::text)>750000 then raise exception 'Invalid PlayHQ shared scorecard';end if;
 mid:=(card->>'match_id')::uuid;tid:=(card->>'our_team_id')::uuid;d:=coalesce(f.published->'details',f.details);
 if mid=l.match_id then raise exception 'PlayHQ source namespace required';end if;
 if not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text and t->>'source_team_id'=l.team_id::text) then raise exception 'Wrong shared scorecard team';end if;
 select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
$old$,$new$ select * into src from club_selection_private.fixture_result_sources where fixture_id=fid and club_id=c;
 if card->>'provider' not in ('playhq_au','playcricket_au') or card->>'provider' is null or card->>'upstream_match_id' is distinct from l.match_id::text or card->>'upstream_grade_id' is distinct from l.grade_id::text or card->>'upstream_team_id' is distinct from l.team_id::text or coalesce(card->>'status','') not in ('completed','in_progress') or jsonb_typeof(card->'innings') is distinct from 'array' or octet_length(card::text)>750000 then raise exception 'Invalid PlayHQ shared scorecard';end if;
 mid:=(card->>'match_id')::uuid;tid:=(card->>'our_team_id')::uuid;d:=coalesce(f.published->'details',f.details);
 if card->>'provider'='playcricket_au' then
  if mid is distinct from src.source_match_id or tid is distinct from src.team_id or not exists(select 1 from public.match_review_scorecards s where s.club_id=c and s.source_match_id=mid and s.scorecard->>'provider'='playcricket_au') then raise exception 'Only the confirmed scorecard source can be refreshed';end if;
  if not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text) then raise exception 'Wrong confirmed scorecard team';end if;
 else
  if mid=l.match_id then raise exception 'PlayHQ source namespace required';end if;
  if not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text and t->>'source_team_id'=l.team_id::text) then raise exception 'Wrong shared scorecard team';end if;
 end if;
$new$);
 if length(s)-length(replace(s,$old$elsif exists(select 1 from public.match_review_scorecards where club_id=c and source_match_id=l.match_id$old$,''))<>length($old$elsif exists(select 1 from public.match_review_scorecards where club_id=c and source_match_id=l.match_id$old$) then raise exception 'Unexpected definition: playhq_store_scorecard';end if;
 s:=replace(s,$old$elsif exists(select 1 from public.match_review_scorecards where club_id=c and source_match_id=l.match_id$old$,$new$elsif card->>'provider'='playhq_au' and exists(select 1 from public.match_review_scorecards where club_id=c and source_match_id=l.match_id$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='selection_groups_context';
 if length(s)-length(replace(s,$old$'revision',coalesce($old$,''))<>length($old$'revision',coalesce($old$) then raise exception 'Unexpected definition: selection_groups_context';end if;
 s:=replace(s,$old$'revision',coalesce($old$,$new$'batting_available',coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false),
  'revision',coalesce($new$);
 if length(s)-length(replace(s,$old$jsonb_build_object('id',id,'name',name) order by name,id) from club_selection_private.selection_groups$old$,''))<>length($old$jsonb_build_object('id',id,'name',name) order by name,id) from club_selection_private.selection_groups$old$) then raise exception 'Unexpected definition: selection_groups_context';end if;
 s:=replace(s,$old$jsonb_build_object('id',id,'name',name) order by name,id) from club_selection_private.selection_groups$old$,$new$jsonb_build_object('id',id,'name',name,'batting_enabled',batting_enabled) order by name,id) from club_selection_private.selection_groups$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='club_selection_group_manage';
 if length(s)-length(replace(s,$old$ elsif p_action='move_team' then$old$,''))<>length($old$ elsif p_action='move_team' then$old$) then raise exception 'Unexpected definition: club_selection_group_manage';end if;
 s:=replace(s,$old$ elsif p_action='move_team' then$old$,$new$ elsif p_action='set_batting' then
  if not coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) then raise exception 'This club does not use Club Batting';end if;
  if jsonb_typeof(p_data->'batting_enabled') is distinct from 'boolean' then raise exception 'Choose whether this group uses Club Batting';end if;
  update club_selection_private.selection_groups set batting_enabled=(p_data->>'batting_enabled')::boolean where club_id=c and id=sg;
  if not found then raise exception 'Selection Group unavailable';end if;
 elsif p_action='move_team' then$new$);
 execute s;
end $patch$;

-- API appearance IDs belong to a match, not a person. Keep their confirmed roster
-- links in the existing source/roster bridge, never in the global person-ID map.
create function club_batting_private.scorecard_player_links(c uuid,card jsonb) returns table(source_player_id uuid,player_id uuid)
language sql stable security definer set search_path='' as $$
 select l.source_player_id,l.player_id from public.match_review_player_links l where l.club_id=c and card->>'provider' is distinct from 'playhq_au'
 union all
 select l.source_player_id,rp.player_id from club_selection_private.scorecard_roster_links l
 join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=l.roster_id
 where l.club_id=c and card->>'provider'='playhq_au' and exists(
 select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') person where person->>'player_id'=l.source_player_id::text)
$$;
revoke all on function club_batting_private.scorecard_player_links(uuid,jsonb) from public,anon,authenticated,service_role;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='link_selected_scorecard_players';
 if length(s)-length(replace(s,$old$(s.roster_id=rid and s.source_player_id<>source_id)$old$,''))<>length($old$(s.roster_id=rid and s.source_player_id<>source_id)$old$) then raise exception 'Unexpected definition: link_selected_scorecard_players';end if;
 s:=replace(s,$old$(s.roster_id=rid and s.source_player_id<>source_id)$old$,$new$(card->>'provider' is distinct from 'playhq_au' and s.roster_id=rid and s.source_player_id<>source_id)$new$);
 if length(s)-length(replace(s,$old$(l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links$old$,''))<>length($old$(l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links$old$) then raise exception 'Unexpected definition: link_selected_scorecard_players';end if;
 s:=replace(s,$old$(l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links$old$,$new$(card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links$new$);
 if length(s)-length(replace(s,$old$(l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid$old$,''))<>length($old$(l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid$old$) then raise exception 'Unexpected definition: link_selected_scorecard_players';end if;
 s:=replace(s,$old$(l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid$old$,$new$(card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid$new$);
 if length(s)-length(replace(s,$old$and (pid is null or exists(select 1 from public.match_review_player_links$old$,''))<>length($old$and (pid is null or exists(select 1 from public.match_review_player_links$old$) then raise exception 'Unexpected definition: link_selected_scorecard_players';end if;
 s:=replace(s,$old$and (pid is null or exists(select 1 from public.match_review_player_links$old$,$new$and (card->>'provider'='playhq_au' or pid is null or exists(select 1 from public.match_review_player_links$new$);
 if length(s)-length(replace(s,$old$  if pid is not null then
   insert into public.match_review_player_links$old$,''))<>length($old$  if pid is not null then
   insert into public.match_review_player_links$old$) then raise exception 'Unexpected definition: link_selected_scorecard_players';end if;
 s:=replace(s,$old$  if pid is not null then
   insert into public.match_review_player_links$old$,$new$  if pid is not null and card->>'provider' is distinct from 'playhq_au' and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,d)) then
   insert into public.match_review_player_links$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='get_match_review_scorecard';
 if length(s)-length(replace(s,$old$from public.match_review_player_links l where l.club_id=p_club_id$old$,''))<>length($old$from public.match_review_player_links l where l.club_id=p_club_id$old$) then raise exception 'Unexpected definition: get_match_review_scorecard';end if;
 s:=replace(s,$old$from public.match_review_player_links l where l.club_id=p_club_id$old$,$new$from club_batting_private.scorecard_player_links(p_club_id,snap.scorecard) l where true$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='playhq_store_scorecard';
 if length(s)-length(replace(s,$old$ update club_selection_private.playhq_links set result_error=null$old$,''))<>length($old$ update club_selection_private.playhq_links set result_error=null$old$) then raise exception 'Unexpected definition: playhq_store_scorecard';end if;
 s:=replace(s,$old$ update club_selection_private.playhq_links set result_error=null$old$,$new$ perform club_selection_private.link_selected_scorecard_players(c,sid,fid,tid,conn.updated_by);
 update club_selection_private.playhq_links set result_error=null$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='confirm_scorecard_player';
 if length(s)-length(replace(s,$old$ select player_id into linked_pid from public.match_review_player_links$old$,''))<>length($old$ select player_id into linked_pid from public.match_review_player_links$old$) then raise exception 'Unexpected definition: confirm_scorecard_player';end if;
 s:=replace(s,$old$ select player_id into linked_pid from public.match_review_player_links$old$,$new$ if card->>'provider'='playhq_au' then
  if fid is null or rid is null then raise exception 'Choose the published fixture and its club player';end if;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.published is null or not exists(select 1 from club_selection_private.fixture_result_sources src where src.club_id=c and src.fixture_id=fid and src.source_match_id=(card->>'match_id')::uuid and src.team_id=(v->>'team_id')::uuid and src.no_play is null)
   or not exists(select 1 from jsonb_array_elements(f.published->'slots') pick where pick->>'d1'=rid::text or pick->>'d2'=rid::text)
   or club_selection_private.fixture_identity(c,f.details) is distinct from club_selection_private.fixture_identity(c,f.published->'details')
   or f.published#>>'{details,format}' is distinct from card->>'format_key'
   or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(f.published#>'{details,days}') day) is distinct from card->'dates'
   then raise exception 'Confirm this player against the published team for this scorecard';end if;
  if pid is not null and not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details')) then raise exception 'This team does not use Club Batting';end if;
  if exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.source_player_id=source_id and l.roster_id<>rid)
   or exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id and exists(select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') person where person->>'player_id'=l.source_player_id::text))
   then raise exception 'This match already has a different player link. Ask Club Admin to review it';end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source_id,rid,auth.uid()) on conflict(club_id,source_player_id) do nothing;
  result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',old_name);
  insert into club_selection_private.requests values(c,auth.uid(),request_id,'scorecard_player_identity',v,result,now());
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_match_player_identity',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'source_player_id',source_id,'roster_id',rid,'player_id',pid));
  return result;
 end if;
 select player_id into linked_pid from public.match_review_player_links$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_batting_private' and p.proname='apply_match_review_scores';
 if length(s)-length(replace(s,$old$  select * into mapping from public.match_review_player_links where club_id=p_club_id and source_player_id=(v->>'source_player_id')::uuid for update;$old$,''))<>length($old$  select * into mapping from public.match_review_player_links where club_id=p_club_id and source_player_id=(v->>'source_player_id')::uuid for update;$old$) then raise exception 'Unexpected definition: apply_match_review_scores';end if;
 s:=replace(s,$old$  select * into mapping from public.match_review_player_links where club_id=p_club_id and source_player_id=(v->>'source_player_id')::uuid for update;$old$,$new$  if snap.scorecard->>'provider'='playhq_au' then
   mapping:=null;
   select l.player_id into mapping.player_id from club_batting_private.scorecard_player_links(p_club_id,snap.scorecard) l where l.source_player_id=(v->>'source_player_id')::uuid;
   if mapping.player_id is distinct from pid then raise exception 'Confirm this player against the published team before using their score';end if;
  else
   select * into mapping from public.match_review_player_links where club_id=p_club_id and source_player_id=(v->>'source_player_id')::uuid for update;
  end if;$new$);
 if length(s)-length(replace(s,$old$  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by) values$old$,''))<>length($old$  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by) values$old$) then raise exception 'Unexpected definition: apply_match_review_scores';end if;
 s:=replace(s,$old$  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by) values$old$,$new$  if snap.scorecard->>'provider' is distinct from 'playhq_au' then
  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by) values$new$);
 if length(s)-length(replace(s,$old$updated_at=clock_timestamp();
  insert into public.match_review_score_links$old$,''))<>length($old$updated_at=clock_timestamp();
  insert into public.match_review_score_links$old$) then raise exception 'Unexpected definition: apply_match_review_scores';end if;
 s:=replace(s,$old$updated_at=clock_timestamp();
  insert into public.match_review_score_links$old$,$new$updated_at=clock_timestamp();
  end if;
  insert into public.match_review_score_links$new$);
 execute s;
end $patch$;

do $patch$
declare s text;begin
 select pg_get_functiondef(p.oid) into s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='club_selection_private' and p.proname='match_results_api';
 if length(s)-length(replace(s,$old$where x#>>'{scorecard,dates,0}'=first_day::text and (nullif(data->>'format_key','') is null or x#>>'{scorecard,format_key}'=data->>'format_key');$old$,''))<>length($old$where x#>>'{scorecard,dates,0}'=first_day::text and (nullif(data->>'format_key','') is null or x#>>'{scorecard,format_key}'=data->>'format_key');$old$) then raise exception 'Unexpected definition: match_results_api';end if;
 s:=replace(s,$old$where x#>>'{scorecard,dates,0}'=first_day::text and (nullif(data->>'format_key','') is null or x#>>'{scorecard,format_key}'=data->>'format_key');$old$,$new$where x#>>'{scorecard,dates,0}'=first_day::text and (nullif(data->>'format_key','') is null or x#>>'{scorecard,format_key}'=data->>'format_key')
   and (nullif(x->>'fixture_id','') is null or exists(select 1 from club_selection_private.fixtures available where available.club_id=c and available.id=(x->>'fixture_id')::uuid and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,available.details))));$new$);
 execute s;
end $patch$;
