-- Keep board and publication issues aligned with the time-aware selection guard.

create or replace function club_selection_private.issues(f uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m club_selection_private.fixtures%rowtype;s jsonb;d jsonb;p club_selection_private.roster%rowtype;
 i int:=0;key text;pid uuid;seen uuid[];q int;b int;k int;st text;notes jsonb:='[]';n int;
begin
 select * into m from club_selection_private.fixtures where id=f;
 for d in select * from jsonb_array_elements(m.details->'days') loop
 i:=i+1;key:='d'||i::text;seen:='{}';q:=0;b:=0;k:=0;n:=0;
 for s in select * from jsonb_array_elements(m.slots) loop
 pid:=nullif(s->>key,'')::uuid;if pid is null then continue;end if;n:=n+1;
 select * into p from club_selection_private.roster where id=pid and club_id=m.club_id and active;
 if not found then notes:=notes||jsonb_build_array(jsonb_build_object('level','error','text','An inactive or unknown player is selected'));continue;end if;
 if pid=any(seen) then notes:=notes||jsonb_build_array(jsonb_build_object('level','error','text',p.name||' is selected twice on Day '||i));end if;seen:=array_append(seen,pid);
 st:=club_selection_private.day_status(pid,d);
 if st<>'available' then notes:=notes||jsonb_build_array(jsonb_build_object('level','error','text',p.name||': '||st||' on '||(d->>'date')));end if;
 if p.bowling='pace' and p.bowling_load='frontline' then q:=q+1;end if;
 if p.batting in ('top','middle') then b:=b+1;end if;if p.keeper then k:=k+1;end if;
 if p.batting='unknown' or p.bowling='unknown' then notes:=notes||jsonb_build_array(jsonb_build_object('level','warning','text',p.name||': role details incomplete'));end if;
 if exists(select 1 from club_selection_private.fixtures other,jsonb_array_elements(other.details->'days') with ordinality od(day,j),jsonb_array_elements(other.slots) os
  where other.club_id=m.club_id and other.id<>m.id and not coalesce((other.details->>'cancelled')::boolean,false) and os->>('d'||od.j::text)=pid::text
  and club_selection_private.fixture_day_conflict(m.details,d,other.details,od.day)) then
 notes:=notes||jsonb_build_array(jsonb_build_object('level','error','text',p.name||' is also selected in an overlapping game on '||(d->>'date')));end if;
 end loop;
 if n>11 then
 notes:=notes||jsonb_build_array(jsonb_build_object('level','error','code','over_team','day',i,'count',n,'text','Day '||i||': '||n||' players selected ('||(n-11)||' too many)'));
 elsif n<11 then
 notes:=notes||jsonb_build_array(jsonb_build_object('level',case when n between 1 and 10 then 'warning' else 'error' end,'code','short_team','text','Day '||i||': '||n||' of 11 places filled'));end if;
 if q<coalesce((m.details->>'min_quicks')::int,3) then notes:=notes||jsonb_build_array(jsonb_build_object('level','warning','text','Day '||i||': only '||q||' frontline quicks'));end if;
 if b<coalesce((m.details->>'min_batters')::int,5) then notes:=notes||jsonb_build_array(jsonb_build_object('level','warning','text','Day '||i||': only '||b||' top/middle-order batters'));end if;
 if k=0 and nullif(m.details->'match_roles'->key->>'keeper_id','') is null then notes:=notes||jsonb_build_array(jsonb_build_object('level','warning','text','Day '||i||': no wicketkeeper'));end if;
 end loop;
 if jsonb_array_length(m.slots)>11 and not exists(select 1 from jsonb_array_elements(notes) issue where issue->>'code'='over_team') then
  notes:=notes||jsonb_build_array(jsonb_build_object('level','error','code','over_slots','text','Arrange the selected players into 11 slots before sharing the team'));end if;
 if not (m.details ? 'match_roles') then return notes;end if;
 for i in 1..jsonb_array_length(m.details->'days') loop
  foreach key in array array['captain','keeper'] loop
   if (not coalesce((m.details->'match_roles'->('d'||i)->>(key||'_manual'))::boolean,false) and
    (m.details->'match_roles'->('d'||i)->>(key||'_id')) is distinct from (club_selection_private.match_details(m.club_id,m.details-'match_roles',m.slots)->'match_roles'->('d'||i)->>(key||'_id')))
   or not exists(select 1 from club_selection_private.roster r,jsonb_array_elements(m.slots) slot
    where r.club_id=m.club_id and r.active and r.id::text=m.details->'match_roles'->('d'||i)->>(key||'_id') and slot->>('d'||i)=r.id::text)
   then notes:=notes||jsonb_build_array(jsonb_build_object('level','error','match_role',true,'text','Day '||i||': choose '||case when key='captain' then 'a captain' else 'who is keeping' end));end if;
  end loop;
 end loop;
 return notes;
end $$;
