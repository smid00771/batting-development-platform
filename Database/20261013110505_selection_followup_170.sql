-- Selection follow-up is private staff information, never part of a team snapshot.
alter table club_selection_private.access add column if not exists grade_levels jsonb not null default '[]'::jsonb;
create table club_selection_private.player_conversations (
 fixture_id uuid not null references club_selection_private.fixtures(id) on delete cascade,
 roster_id uuid not null references club_selection_private.roster(id) on delete cascade,
 movement_key text not null,
 spoken_at timestamptz,
 spoken_by uuid references auth.users(id) on delete set null,
 revision integer not null default 1,
 primary key(fixture_id,roster_id,movement_key)
);
create index player_conversations_roster_idx on club_selection_private.player_conversations(roster_id);
create index player_conversations_actor_idx on club_selection_private.player_conversations(spoken_by);
alter table club_selection_private.player_conversations enable row level security;
revoke all on club_selection_private.player_conversations from public,anon,authenticated;

create or replace function club_selection_private.grade_level(c uuid, competition text, grade text)
returns integer language sql stable set search_path='' as $f$
 select coalesce(
  (select (x->>'level')::integer from club_selection_private.access a,jsonb_array_elements(a.grade_levels) x
   where a.club_id=c and lower(btrim(x->>'competition'))=lower(btrim(competition)) and lower(btrim(x->>'grade'))=lower(btrim(grade)) limit 1),
  case when btrim(grade) ~* '^([1-9][0-9]?)(st|nd|rd|th)?[ ]+grade$' then substring(btrim(grade) from '^([0-9]+)')::integer
   when btrim(grade) ~* '^grade[ ]+[1-9][0-9]?$' then substring(btrim(grade) from '([0-9]+)$')::integer end)
$f$;

create or replace function club_selection_private.lower_grade_moves(c uuid)
returns table(fixture_id uuid,roster_id uuid,previous_fixture_id uuid,previous_grade text,grade text,competition text,format text,start_date text,movement_key text,previous_captains uuid[])
language sql stable set search_path='' as $f$
 with prior as materialized (
  select f.id,f.published, f.published->'details' d,
   (f.published->'details'->'days'->0->>'date')::date starts,
   club_selection_private.grade_level(c,f.published->'details'->>'competition',f.published->'details'->>'grade') level
  from club_selection_private.fixtures f where f.club_id=c and f.published is not null and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
 ), current_fixtures as (
  select f.*, (f.details->'days'->0->>'date')::date starts,
   club_selection_private.grade_level(c,f.details->>'competition',f.details->>'grade') level
  from club_selection_private.fixtures f where f.club_id=c and not coalesce((f.details->>'cancelled')::boolean,false)
 )
 select f.id,person.pid,p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts::text,
  md5(jsonb_build_array(p.id,p.d->>'grade',f.details->>'grade',f.details->>'competition',f.details->>'format',f.starts)::text),
  array(select distinct r.user_id from jsonb_each(coalesce(p.d->'match_roles','{}')) role
   join club_selection_private.roster r on r.club_id=c and r.id::text=role.value->>'captain_id'
   where r.user_id is not null
   union select nullif(p.d->>'captain_id','')::uuid where not(p.d ? 'match_roles') and nullif(p.d->>'captain_id','') is not null)
 from current_fixtures f
 cross join lateral (select distinct nullif(ids.value,'')::uuid pid from jsonb_array_elements(f.slots) slot,
  lateral (select slot->>'d1' value union select slot->>'d2') ids where nullif(ids.value,'') is not null) person
 cross join lateral (
  select p.* from prior p
  where lower(btrim(p.d->>'competition'))=lower(btrim(f.details->>'competition'))
   and coalesce(p.d->>'format','')=coalesce(f.details->>'format','')
   and coalesce(p.d->>'season','')=coalesce(f.details->>'season','')
   and date_trunc('week',p.starts::timestamp)=(
    select max(date_trunc('week',q.starts::timestamp)) from prior q
    where lower(btrim(q.d->>'competition'))=lower(btrim(f.details->>'competition'))
     and coalesce(q.d->>'format','')=coalesce(f.details->>'format','')
     and coalesce(q.d->>'season','')=coalesce(f.details->>'season','')
     and q.starts<f.starts and date_trunc('week',q.starts::timestamp)<date_trunc('week',f.starts::timestamp)
     and q.starts>=f.starts-120)
   and exists(select 1 from jsonb_array_elements(p.published->'slots') slot where slot->>'d1'=person.pid::text or slot->>'d2'=person.pid::text)
  order by p.level desc nulls first,p.starts desc,p.id limit 1
 ) p
 where f.level>p.level
$f$;

create or replace function club_selection_private.conversation_context(c uuid,u uuid)
returns jsonb language sql stable set search_path='' as $f$
 select coalesce(jsonb_agg(jsonb_build_object(
  'fixture_id',m.fixture_id,'roster_id',m.roster_id,'name',r.name,'previous_grade',m.previous_grade,'grade',m.grade,
  'competition',m.competition,'format',m.format,'date',m.start_date,'movement_key',m.movement_key,
  'spoken_at',s.spoken_at,'spoken_by',case when s.spoken_at is not null then coalesce(up.display_name,'Club staff') end,
  'revision',coalesce(s.revision,0)) order by m.start_date desc,m.grade,r.name),'[]'::jsonb)
 from club_selection_private.lower_grade_moves(c) m
 join club_selection_private.roster r on r.id=m.roster_id and r.club_id=c
 left join club_selection_private.player_conversations s on s.fixture_id=m.fixture_id and s.roster_id=m.roster_id and s.movement_key=m.movement_key
 left join public.user_profiles up on up.user_id=s.spoken_by
 where club_selection_private.member(c,u) and (
  club_selection_private.selector(c,u)
  or exists(select 1 from public.club_memberships cm where cm.club_id=c and cm.user_id=u and cm.permission_role in ('coach','head_coach'))
  or u=any(m.previous_captains))
$f$;

revoke all on function club_selection_private.grade_level(uuid,text,text),club_selection_private.lower_grade_moves(uuid),club_selection_private.conversation_context(uuid,uuid) from public,anon,authenticated;

do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.issues(uuid)'::regprocedure);
begin
 if md5(definition)<>'889bad35aebbf5ce853d1391598594bc' then raise exception 'Function changed since review: club_selection_private.issues(uuid)';end if;
 definition:=replace(definition,$before0$if n<>11 then notes:=notes||jsonb_build_array(jsonb_build_object('level','error','text','Day '||i||': '||n||' of 11 places filled'));end if;$before0$,$after0$if n<>11 then notes:=notes||jsonb_build_array(jsonb_build_object('level',case when n between 1 and 10 then 'warning' else 'error' end,'code','short_team','text','Day '||i||': '||n||' of 11 places filled'));end if;$after0$);
 execute definition;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
begin
 if md5(definition)<>'cf11668cb77c414906d4e6c2014a35fa' then raise exception 'Function changed since review: club_selection_private.api(uuid,text,jsonb)';end if;
 definition:=replace(definition,$before0$perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);$before0$,$after0$perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);
   if m.published is not null and not coalesce(m.selection_unlocked_until>now(),false) then
    raise exception 'Published team is locked. The Head of Selections must unlock it before changes';
   end if;$after0$);
 definition:=replace(definition,$before1$'publication_head_id',club_selection_private.publication_head(c),$before1$,$after1$'publication_head_id',club_selection_private.publication_head(c),
  'conversations',club_selection_private.conversation_context(c,me),$after1$);
 definition:=replace(definition,$before2$elsif p_action='fixture_lock' then$before2$,$after2$elsif p_action='conversation' then
  fid:=nullif(p_data->>'fixture_id','')::uuid;pid:=nullif(p_data->>'roster_id','')::uuid;
  select item into x from jsonb_array_elements(club_selection_private.conversation_context(c,me)) item
   where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  if x is null then raise exception 'This selection conversation is no longer available to you';end if;
  if (x->>'revision')::integer<>coalesce((p_data->>'revision')::integer,-1) then raise exception 'Conversation status changed. Refresh before updating';end if;
  if jsonb_typeof(p_data->'spoken') is distinct from 'boolean' then raise exception 'Choose whether the player has been spoken to';end if;
  insert into club_selection_private.player_conversations(fixture_id,roster_id,movement_key,spoken_at,spoken_by)
   values(fid,pid,x->>'movement_key',case when (p_data->>'spoken')::boolean then now() end,case when (p_data->>'spoken')::boolean then me end)
   on conflict(fixture_id,roster_id,movement_key) do update set spoken_at=excluded.spoken_at,spoken_by=excluded.spoken_by,revision=club_selection_private.player_conversations.revision+1;
  res:=jsonb_build_object('saved',true,'spoken',(p_data->>'spoken')::boolean);
 elsif p_action='grade_levels' then
  if not adm then raise exception 'Club Admin permission required';end if;
  if acc.revision<>coalesce((p_data->>'revision')::integer,-1) then raise exception 'Settings changed. Refresh before saving';end if;
  if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>100 then raise exception 'Save up to 100 grade levels';end if;
  for x in select * from jsonb_array_elements(p_data->'rows') loop
   if length(btrim(coalesce(x->>'competition',''))) not between 1 and 120 or length(btrim(coalesce(x->>'grade',''))) not between 1 and 120
    or coalesce(x->>'level','')!~'^[1-9][0-9]?$' then raise exception 'Use a competition, grade and level from 1 to 99';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_data->'rows') x group by lower(btrim(x->>'competition')),lower(btrim(x->>'grade')) having count(*)>1) then raise exception 'Use one level per grade and competition';end if;
  update club_selection_private.access set grade_levels=p_data->'rows',revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  res:=jsonb_build_object('saved',true);
 elsif p_action='fixture_lock' then$after2$);
 definition:=replace(definition,$before3$if (p_data->>'unlock')::boolean and not club_selection_private.fixture_completed(m.details,acc.timezone) then raise exception 'This fixture is still open';end if;$before3$,$after3$if m.published is not null and me is distinct from acc.head_selector_id and me is distinct from club_selection_private.publication_head(c) then
   raise exception 'Only the current Head of Selections or Acting Head can unlock a published team';end if;
  if (p_data->>'unlock')::boolean and m.published is null and not club_selection_private.fixture_completed(m.details,acc.timezone) then raise exception 'This fixture is still open';end if;$after3$);
 definition:=replace(definition,$before4$cardinality(club_selection_private.match_captain_users(c,m.details))=0$before4$,$after4$cardinality(club_selection_private.match_captain_users(c,m.details)||club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,m.details)))=0$after4$);
 definition:=replace(definition,$before5$if jsonb_array_length(notes)>0 and not coalesce((p_data->>'acknowledge_balance')::boolean,false) then$before5$,$after5$if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='short_team')
      and not coalesce(p_data->'acknowledge_short' ? fid::text,false) then raise exception 'Confirm publishing this team with vacant places';end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='warning' and n->>'code' is distinct from 'short_team') and not coalesce((p_data->>'acknowledge_balance')::boolean,false) then$after5$);
 definition:=replace(definition,$before6$set published=res,publication=publication+1,published_at=now() where id=fid;$before6$,$after6$set published=res,publication=publication+1,published_at=now(),selection_unlocked_until=null,selection_unlocked_by=null where id=fid;$after6$);
 execute definition;
end $patch$;

-- Synthetic users and fixtures only; every inserted row is rolled back.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();
 coach_id uuid:=gen_random_uuid();captain_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();outsider_id uuid:=gen_random_uuid();wrong_captain uuid:=gen_random_uuid();u uuid;
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();p3 uuid:=gen_random_uuid();previous_id uuid:=gen_random_uuid();current_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();
 day date:=(date_trunc('week',current_date)+interval '19 days')::date;details jsonb;slots jsonb;res jsonb;move jsonb;req jsonb;before_count integer;rev integer;rejected boolean;
begin
 begin
  foreach u in array array[head_id,selector_id,coach_id,captain_id,player_id,outsider_id,wrong_captain] loop
   insert into auth.users(id,email) values(u,'selection-followup-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic staff');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Selection follow-up test','followup-'||c,head_id),(other_c,'Other follow-up club','followup-'||other_c,outsider_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values
   (c,head_id,'player','none','player'),(c,selector_id,'player','none','player'),(c,coach_id,'coach','coach','coach_captain'),
   (c,captain_id,'captain','captain','player'),(c,player_id,'player','none','player'),(c,wrong_captain,'captain','captain','player'),(other_c,outsider_id,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',head_id),(other_c,'standalone','active',outsider_id);
  insert into club_selection_private.selectors values(c,selector_id);
  insert into club_selection_private.roster(id,club_id,name,user_id,batting,bowling,bowling_load,keeper) values
   (p1,c,'Synthetic dropped player',player_id,'top','pace','frontline',false),
   (p2,c,'Synthetic previous captain',captain_id,'middle','spin','part_time',false),
   (p3,c,'Synthetic current captain',head_id,'middle','pace','frontline',true);
  insert into club_selection_private.availability(roster_id,available_dates) values(p1,jsonb_build_array(day::text)),(p2,jsonb_build_array(day::text)),(p3,jsonb_build_array(day::text));
  details:=jsonb_build_object('grade','1st Grade','competition','Competition A','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',(day-7)::text)),
   'opposition','Synthetic opponents','ground','Synthetic ground','meeting','','brackets',false,'min_quicks',0,'min_batters',0,
   'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',p2,'captain_manual',true,'keeper_id',p1,'keeper_manual',true)));
  slots:=jsonb_build_array(jsonb_build_object('d1',p1,'d2',null),jsonb_build_object('d1',p2,'d2',null))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,9));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(previous_id,c,details,slots);
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=previous_id;
  details:=jsonb_set(jsonb_set(jsonb_set(details,'{competition}','"Other competition"'),'{opposition}','"Other opponents"'),'{captain_id}',to_jsonb(wrong_captain::text))-'match_roles';
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(other_id,c,details,slots);
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=other_id;
  details:=jsonb_set(jsonb_set(jsonb_set(details,'{competition}','"Competition A"'),'{grade}','"2nd Grade"'),'{days}',jsonb_build_array(jsonb_build_object('date',day::text))) - 'captain_id';
  details:=details||jsonb_build_object('match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',p3,'captain_manual',true,'keeper_id',p3,'keeper_manual',true)));
  slots:=jsonb_build_array(jsonb_build_object('d1',p1,'d2',null),jsonb_build_object('d1',p3,'d2',null))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,9));
  insert into club_selection_private.fixtures(id,club_id,details,slots) values(current_id,c,details,slots);
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  res:=public.club_selections_api(c,'context');assert jsonb_array_length(res->'conversations')=1,'Lower-grade move detected';move:=res->'conversations'->0;
  assert move->>'previous_grade'='1st Grade';assert move->>'grade'='2nd Grade';assert move->>'roster_id'=p1::text;
  assert not exists(select 1 from jsonb_array_elements(club_selection_private.issues(current_id)) x where x->>'level'='error'),'Short team is a warning, not a hard error';
  res:=public.club_selections_api(c,'send_review',jsonb_build_object('ids',jsonb_build_array(current_id),'revisions',jsonb_build_object(current_id::text,1),'request_id',gen_random_uuid()));assert (res->>'sent')::boolean,'Incomplete team sent to captain';
  assert (select jsonb_array_length(review->'slots')=11 from club_selection_private.fixtures where id=current_id),'Vacancies retained';
  foreach u in array array[coach_id,captain_id] loop
   perform set_config('request.jwt.claim.sub',u::text,true);res:=public.club_selections_api(c,'context');assert jsonb_array_length(res->'conversations')=1,'Coach and previous captain can see marker';
  end loop;
  foreach u in array array[player_id,wrong_captain] loop
   perform set_config('request.jwt.claim.sub',u::text,true);res:=public.club_selections_api(c,'context');assert res->'conversations'='[]','Player and captain from other competition cannot see marker';
   rejected:=false;begin perform public.club_selections_api(c,'conversation',move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',true));exception when raise_exception then rejected:=true;end;assert rejected,'Unauthorized marker rejected';
  end loop;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club access rejected';
  perform set_config('request.jwt.claim.sub',captain_id::text,true);
  req:=move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',true);
  res:=public.club_selections_api(c,'conversation',req);assert (res->>'spoken')::boolean;
  assert public.club_selections_api(c,'conversation',req)=res,'Retry idempotent';
  perform set_config('request.jwt.claim.sub',coach_id::text,true);
  res:=public.club_selections_api(c,'context');assert res->'conversations'->0->>'spoken_at' is not null,'Status shared';
  rejected:=false;begin perform public.club_selections_api(c,'conversation',move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',false));exception when raise_exception then rejected:=true;end;assert rejected,'Stale toggle cannot overwrite colleague';
  move:=res->'conversations'->0;perform public.club_selections_api(c,'conversation',move||jsonb_build_object('request_id',gen_random_uuid(),'spoken',false));
  assert public.club_selections_api(c,'context')->'conversations'->0->>'spoken_at' is null,'Undo visible';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  req:=jsonb_build_object('ids',jsonb_build_array(current_id),'revisions',jsonb_build_object(current_id::text,1),'acknowledge_balance',true,'request_id',gen_random_uuid());
  rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Short publication needs deliberate confirmation';
  res:=public.club_selections_api(c,'publish',req||jsonb_build_object('acknowledge_short',jsonb_build_array(current_id)));assert (res->>'published')::boolean;
  assert (select selection_unlocked_until is null from club_selection_private.fixtures where id=current_id),'Publication locks team';
  select revision into rev from club_selection_private.fixtures where id=current_id;
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'fixture_lock',jsonb_build_object('id',current_id,'revision',rev,'unlock',true,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Regular selector cannot unlock published team';
  rejected:=false;begin perform public.club_selections_api(c,'save_board',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',current_id,'revision',rev,'details',details,'slots',slots)),'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Old clients cannot bypass lock';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  res:=public.club_selections_api(c,'fixture_lock',jsonb_build_object('id',current_id,'revision',rev,'unlock',true,'request_id',gen_random_uuid()));rev:=(res->>'revision')::integer;
  select count(*) into before_count from club_selection_private.notifications n join club_selection_private.fixtures f on f.id=n.fixture_id where f.id=current_id and n.kind='publication';
  slots:=jsonb_set(slots,'{0,d1}',to_jsonb(p2::text));
  res:=public.club_selections_api(c,'save_board',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',current_id,'revision',rev,'details',details,'slots',slots)),'request_id',gen_random_uuid()));rev:=(res->'revisions'->>current_id::text)::integer;
  assert (select published->'slots'->0->>'d1'=p1::text from club_selection_private.fixtures where id=current_id),'Draft does not silently change published team';
  assert (select count(*)=before_count from club_selection_private.notifications where fixture_id=current_id and kind='publication'),'Draft does not prematurely notify players';
  res:=public.club_selections_api(c,'publish',jsonb_build_object('ids',jsonb_build_array(current_id),'revisions',jsonb_build_object(current_id::text,rev),'acknowledge_balance',true,'acknowledge_short',jsonb_build_array(current_id),'request_id',gen_random_uuid()));
  foreach u in array array[player_id,captain_id] loop
   assert exists(select 1 from club_batting_private.club_message_recipients r join club_batting_private.club_messages cm on cm.id=r.message_id join club_selection_private.notifications n on n.message_id=cm.id
    where n.fixture_id=current_id and n.kind='publication' and cm.title='Teams updated' and r.user_id=u),'Added AND removed players notified';
  end loop;
  assert (select selection_unlocked_until is null from club_selection_private.fixtures where id=current_id),'Republishing locks again';
  assert club_selection_private.grade_level(c,'Competition A','Dev League Navy') is null,'Named parallel grades are not guessed';
  assert club_selection_private.grade_level(c,'Competition A','4th Grade')=4;
  update club_selection_private.access set grade_levels='[{"competition":"Competition A","grade":"Dev League Navy","level":5},{"competition":"Competition A","grade":"Dev League Sky","level":5}]' where club_id=c;
  assert club_selection_private.grade_level(c,'Competition A','Dev League Navy')=club_selection_private.grade_level(c,'Competition A','Dev League Sky'),'Equal grades supported';
  assert not has_table_privilege('authenticated','club_selection_private.player_conversations','SELECT,INSERT,UPDATE,DELETE');
  assert not has_function_privilege('authenticated','club_selection_private.lower_grade_moves(uuid)','EXECUTE');
  raise exception using errcode='P0170',message='Rollback follow-up tests';
 exception when sqlstate 'P0170' then null;
 end;
 assert not exists(select 1 from public.clubs where id in(c,other_c));
end $tests$;
select 'Selection follow-up tests passed; all synthetic data rolled back.' as result;
