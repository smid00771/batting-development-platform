-- Reuse the confirmed roster identity when sign-up created only a welcome-message shell.
-- Never match by name or combine independently populated player histories.
CREATE OR REPLACE FUNCTION club_batting_private.claim_roster_player(c uuid, rid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r club_selection_private.roster%rowtype;l club_batting_private.roster_players%rowtype;
 p public.players%rowtype;other_player uuid;ref record;used boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into r from club_selection_private.roster where id=rid and club_id=c;
 select * into l from club_batting_private.roster_players where roster_id=rid and club_id=c for update;
 if l.roster_id is null or r.user_id is null or not r.active or not club_batting_private.verified_roster_user(c,r.user_id) then return false;end if;
 select * into p from public.players where id=l.player_id and club_id=c for update;
 if p.id is null or not p.active or (l.claimed_user_id is not null and l.claimed_user_id<>r.user_id) then return false;end if;
 if p.user_id=r.user_id then return true;end if;
 if p.user_id is not null then return false;end if;
 select id into other_player from public.players where club_id=c and user_id=r.user_id and id<>p.id for update;
 if other_player is not null then
  if not exists(select 1 from public.players where id=other_player and active) then return false;end if;
  -- A sign-up welcome message is not a second batting history. Preserve it on
  -- the confirmed roster profile; retain the existing refusal for actual player work.
  if exists(select 1 from club_batting_private.club_message_recipients mr
    left join club_batting_private.club_messages m on m.id=mr.message_id
    where mr.player_id=other_player and (mr.user_id is distinct from r.user_id or m.club_id is distinct from c)) then return false;end if;
  -- Do not guess how to combine independently populated histories or erase inactive records.
  for ref in select ns.nspname,cl.relname,at.attname from pg_constraint k
   join pg_class cl on cl.oid=k.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
   join pg_attribute at on at.attrelid=cl.oid and at.attnum=k.conkey[1]
   where k.contype='f' and k.confrelid='public.players'::regclass and cardinality(k.conkey)=1
    and k.conrelid<>'club_batting_private.club_message_recipients'::regclass
  loop
   execute format('select exists(select 1 from %I.%I where %I=$1)',ref.nspname,ref.relname,ref.attname) into used using other_player;
   if used then return false;end if;
  end loop;
  if exists(select 1 from club_batting_private.fixture_review_rosters m where other_player=any(m.player_ids)) then return false;end if;
  update club_batting_private.club_message_recipients set player_id=p.id
   where player_id=other_player and user_id=r.user_id;
  delete from public.players where id=other_player and user_id=r.user_id;
 end if;
 -- The private marker authorises the matching identity change in the guard below.
 update club_batting_private.roster_players set claimed_user_id=r.user_id,claimed_at=now() where roster_id=rid;
 update public.players set user_id=r.user_id where id=p.id and user_id is null;
 insert into club_selection_private.audit(club_id,actor_id,action,detail)
 values(c,auth.uid(),'claim_review_player',jsonb_build_object('roster_id',rid,'player_id',p.id,'user_id',r.user_id));
 return true;
end $function$;
