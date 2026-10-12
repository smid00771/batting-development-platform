-- Carry a single Club Batting group into an unassigned Teams usual grade.
-- Use established player identities; never match by name or replace a saved grade.
create or replace function club_selection_private.fill_roster_grade(c uuid, target_player uuid default null)
returns integer
language plpgsql
set search_path = ''
as $function$
declare changed integer;
begin
 if c is null then return 0;end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 with identities as (
  select rp.roster_id,rp.player_id
  from club_batting_private.roster_players rp
  join public.players p on p.id=rp.player_id and p.club_id=rp.club_id and p.active
  where rp.club_id=c and (target_player is null or p.id=target_player)
  union
  select r.id,p.id
  from club_selection_private.roster r
  join public.players p on p.club_id=r.club_id and p.user_id=r.user_id and p.active
  where r.club_id=c and r.user_id is not null and (target_player is null or p.id=target_player)
 ), choices as (
  select i.roster_id,min(g.name) grade
  from identities i
  join public.player_playing_groups pg on pg.player_id=i.player_id and pg.club_id=c
  join public.playing_groups g on g.id=pg.playing_group_id and g.club_id=c and g.active
  group by i.roster_id having count(distinct g.id)=1
 )
 update club_selection_private.roster r set grade=ch.grade,updated_at=now()
 from choices ch
 where r.id=ch.roster_id and r.club_id=c and r.active and btrim(r.grade)=''
  and length(ch.grade) between 1 and 80;
 get diagnostics changed=row_count;
 if changed>0 then
  update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;
 end if;
 return changed;
end
$function$;
revoke all on function club_selection_private.fill_roster_grade(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function club_selection_private.fill_roster_grade_after_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
 -- Group membership writes and roster-player links already enforce club access.
 -- Deferred execution evaluates the final group list, including bulk assignments.
 if tg_op='DELETE' then
  perform club_selection_private.fill_roster_grade(old.club_id,old.player_id);
 else
  perform club_selection_private.fill_roster_grade(new.club_id,new.player_id);
 end if;
 return null;
end
$function$;
revoke all on function club_selection_private.fill_roster_grade_after_group() from public,anon,authenticated,service_role;

create constraint trigger fill_usual_grade_after_membership
 after insert or update or delete on public.player_playing_groups
 deferrable initially deferred for each row
 execute function club_selection_private.fill_roster_grade_after_group();
create constraint trigger fill_usual_grade_after_player_link
 after insert or update on club_batting_private.roster_players
 deferrable initially deferred for each row
 execute function club_selection_private.fill_roster_grade_after_group();

-- Existing named grades, roles, accounts, group memberships and plans stay intact.
do $backfill$
declare c uuid;
begin
 for c in select distinct club_id from club_selection_private.roster where active and btrim(grade)='' order by club_id loop
  perform club_selection_private.fill_roster_grade(c);
 end loop;
end
$backfill$;
