CREATE OR REPLACE FUNCTION club_batting_private.verified_roster_user(c uuid, u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select u is not null and exists(select 1 from auth.users a
 join public.club_memberships m on m.user_id=a.id and m.club_id=c and m.involvement in ('player','both')
 join public.clubs cl on cl.id=c and cl.archived_at is null
 where a.id=u and a.email_confirmed_at is not null and a.deleted_at is null
 and (a.banned_until is null or a.banned_until<=now()))
$function$;
CREATE OR REPLACE FUNCTION club_batting_private.guard_roster_player_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l club_batting_private.roster_players%rowtype;
begin
 select * into l from club_batting_private.roster_players where player_id=old.id;
 if l.roster_id is null then return new;end if;
 if new.id<>old.id or new.club_id<>old.club_id then raise exception 'The shared Teams player identity cannot be changed';end if;
 if new.user_id is distinct from old.user_id then
  if new.user_id is null and not exists(select 1 from auth.users where id=old.user_id) then return new;end if;
  if old.user_id is not null or new.user_id is distinct from l.claimed_user_id
   or not club_batting_private.verified_roster_user(l.club_id,new.user_id)
   or not exists(select 1 from club_selection_private.roster where id=l.roster_id and club_id=l.club_id and user_id=new.user_id)
   then raise exception 'Link this player through their verified Teams account';end if;
 end if;
 return new;
end $function$;
