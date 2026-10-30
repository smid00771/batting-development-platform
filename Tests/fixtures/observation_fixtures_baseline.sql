create role anon;create role authenticated;create schema auth;create schema club_selection_private;create schema club_batting_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create table public.players(id uuid primary key,club_id uuid,active boolean);
create table public.playing_groups(id uuid primary key,club_id uuid,name text,active boolean,sort_order integer,batting_enabled boolean);
create table public.player_match_entries(id uuid primary key,club_id uuid,player_id uuid,match_date date,format_key text,opposition text,innings_number integer);
create table club_selection_private.fixtures(id uuid primary key,club_id uuid,details jsonb);
create table club_batting_private.fixture_innings(match_id uuid primary key,club_id uuid,fixture_id uuid);
create table public.test_access(user_id uuid,club_id uuid,player_id uuid);
create function club_batting_private.team_review_staff(c uuid) returns boolean language sql stable as $$select exists(select 1 from public.test_access where club_id=c and user_id=auth.uid())$$;
create function public.can_read_coaching_action_player(p uuid) returns boolean language sql stable as $$select exists(select 1 from public.test_access where player_id=p and user_id=auth.uid())$$;
create function public.can_edit_player(p uuid) returns boolean language sql stable as $$select public.can_read_coaching_action_player(p)$$;
create function club_batting_private.group_uses_batting(c uuid,g uuid) returns boolean language sql stable as $$select exists(select 1 from public.playing_groups where id=g and club_id=c and active and batting_enabled)$$;
create function club_batting_private.innings_opposition_key(o text) returns text language sql immutable as $$select lower(trim(o))$$;
create function club_selection_private.fixture_group_id(c uuid,d jsonb) returns uuid language sql stable as $$select (d->>'grade_group_id')::uuid$$;
create function club_selection_private.fixture_identity(c uuid,d jsonb) returns jsonb language sql stable as $$select jsonb_build_object('format_key',d->>'format')$$;
CREATE OR REPLACE FUNCTION club_batting_private.find_shared_innings(p_player_id uuid, p_match_id uuid, p_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid;mid uuid;n integer:=coalesce((p_values->>'innings_number')::int,1);d date:=(p_values->>'match_date')::date;f text:=p_values->>'format_key';o text:=club_batting_private.innings_opposition_key(p_values->>'opposition');
begin
 if auth.uid() is null or not public.can_read_coaching_action_player(p_player_id) then raise exception 'Player access is required';end if;
 select id into pid from public.players where id=p_player_id and active for update;
 if pid is null then raise exception 'Player not found';end if;
 if n<1 or n>10 or d is null or f not in ('t20','limited_overs','long_form') then raise exception 'Choose match date, format and innings number';end if;
 if p_match_id is not null then
  select id into mid from public.player_match_entries where id=p_match_id and player_id=p_player_id;
  if mid is null then raise exception 'That innings belongs to another player';end if;
  return mid;
 end if;
 if (select count(*) from public.player_match_entries m where m.player_id=p_player_id and m.match_date=d and m.format_key=f and m.innings_number=n and club_batting_private.innings_opposition_key(m.opposition)=o)>1 then raise exception 'More than one historical innings matches. Select the correct innings explicitly.' using detail='shared_innings_selection_required';end if;
 select id into mid from public.player_match_entries m where m.player_id=p_player_id and m.match_date=d and m.format_key=f and m.innings_number=n and club_batting_private.innings_opposition_key(m.opposition)=o;
 if mid is not null then return mid;end if;
 if exists(select 1 from public.player_match_entries m where m.player_id=p_player_id and m.match_date=d and m.format_key=f and m.innings_number=n) then
  raise exception 'An innings already exists on this date and format with different opposition. Select that innings, or use a different innings number for a separate innings.' using detail='shared_innings_selection_required';
 end if;
 return null;
end $function$
