-- Preserve deliberate player names, remember confirmed imports and allow multiple usual teams.
-- Additive schema only: no bulk roster updates, alias backfill, identity merges or grant changes to existing APIs.
-- Every changed function must match the reviewed pre-release hash. A mismatch or 5s lock wait rolls back all changes.
-- Verified against these exact baseline functions in Tests/player_identity_preferences_database_test.cjs.
-- Existing source bodies for rollback/review are in Tests/fixtures/identity_preferences_before_341.sql.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table club_selection_private.roster
 add column if not exists preferred_name boolean not null default false,
 add column if not exists usual_grades text[] not null default '{}';

create or replace function club_selection_private.player_name_key(value text) returns text
language sql immutable parallel safe set search_path='' as $$
 select lower(regexp_replace(regexp_replace(btrim(coalesce(value,'')),'[''’‘]','','g'),'[[:space:]]+',' ','g'))
$$;

create or replace function club_selection_private.normal_usual_grades(grades text[]) returns text[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(name order by first_position),'{}') from (
  select min(btrim(name)) name,min(n) first_position from unnest(grades) with ordinality g(name,n)
  where nullif(btrim(name),'') is not null group by club_selection_private.player_name_key(name)
 ) names
$$;

create or replace function club_selection_private.keep_usual_grades() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.usual_grades:=club_selection_private.normal_usual_grades(case when cardinality(new.usual_grades)>0 then new.usual_grades else array[new.grade] end);
 elsif new.usual_grades is distinct from old.usual_grades then
  new.usual_grades:=club_selection_private.normal_usual_grades(new.usual_grades);
 elsif new.grade is distinct from old.grade then
  new.usual_grades:=club_selection_private.normal_usual_grades(array[new.grade]||array_remove(old.usual_grades,old.grade));
 end if;
 if cardinality(new.usual_grades)=0 and new.grade<>'' and (tg_op='INSERT' or new.usual_grades is not distinct from old.usual_grades) then new.usual_grades:=array[new.grade];end if;
 if cardinality(new.usual_grades)>30 or exists(select 1 from unnest(new.usual_grades) g where length(g)>120) then raise exception 'Choose up to 30 usual teams';end if;
 new.grade:=coalesce(new.usual_grades[1],'');
 return new;
end $$;
create trigger roster_usual_grades before insert or update of grade,usual_grades on club_selection_private.roster
 for each row execute function club_selection_private.keep_usual_grades();


-- A remembered source spelling is evidence from an explicit match, scoped to club
-- and provider. Ambiguous spellings remain several rows and require review again.
create table club_selection_private.player_source_names(
 club_id uuid not null references public.clubs(id),provider text not null,name_key text not null,
 roster_id uuid not null references club_selection_private.roster(id),source_name text not null,
 confirmed_by uuid references auth.users(id),updated_at timestamptz not null default now(),
 primary key(club_id,provider,name_key,roster_id)
);
alter table club_selection_private.player_source_names enable row level security;
create index player_source_names_roster_idx on club_selection_private.player_source_names(roster_id);
create table club_selection_private.scorecard_identity_reviews(
 club_id uuid not null references public.clubs(id),source_player_id uuid not null,source_name text not null,
 snapshot_id uuid not null references public.match_review_scorecards(id),fixture_id uuid not null references club_selection_private.fixtures(id),
 team_id uuid not null,updated_at timestamptz not null default now(),primary key(club_id,source_player_id)
);
alter table club_selection_private.scorecard_identity_reviews enable row level security;
create index scorecard_identity_reviews_fixture_idx on club_selection_private.scorecard_identity_reviews(fixture_id);
create index scorecard_identity_reviews_snapshot_idx on club_selection_private.scorecard_identity_reviews(snapshot_id);

create or replace function club_selection_private.remember_source_name(c uuid,sid uuid,tid uuid,source uuid,rid uuid,actor uuid) returns void
language plpgsql set search_path='' as $$
declare card jsonb;name text;
begin
 select scorecard into card from public.match_review_scorecards where club_id=c and id=sid;
 select p->>'name' into name from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') p
  where t->>'id'=tid::text and p->>'player_id'=source::text;
 if nullif(btrim(name),'') is null or not exists(select 1 from club_selection_private.roster where id=rid and club_id=c and active) then return;end if;
 insert into club_selection_private.player_source_names(club_id,provider,name_key,roster_id,source_name,confirmed_by)
 values(c,coalesce(card->>'provider','playcricket_au'),club_selection_private.player_name_key(name),rid,name,actor)
 on conflict(club_id,provider,name_key,roster_id) do update set source_name=excluded.source_name,updated_at=now();
 delete from club_selection_private.scorecard_identity_reviews where club_id=c and source_player_id=source;
end $$;

create or replace function club_selection_private.queue_scorecard_identities(c uuid,sid uuid,fid uuid,tid uuid) returns void
language plpgsql set search_path='' as $$
declare card jsonb;
begin
 select scorecard into card from public.match_review_scorecards where club_id=c and id=sid;
 if card->>'status' is distinct from 'completed' then return;end if;
 delete from club_selection_private.scorecard_identity_reviews q where q.club_id=c and q.fixture_id=fid
  and not exists(select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') p
   where t->>'id'=tid::text and p->>'player_id'=q.source_player_id::text);
 insert into club_selection_private.scorecard_identity_reviews(club_id,source_player_id,source_name,snapshot_id,fixture_id,team_id)
 select c,(p->>'player_id')::uuid,p->>'name',sid,fid,tid
 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') p
 where t->>'id'=tid::text and p->>'player_id' is not null and nullif(btrim(p->>'name'),'') is not null
  and not exists(select 1 from club_selection_private.scorecard_roster_links l join club_selection_private.roster r on r.id=l.roster_id and r.active
   where l.club_id=c and l.source_player_id=(p->>'player_id')::uuid)
 on conflict(club_id,source_player_id) do update set source_name=excluded.source_name,snapshot_id=excluded.snapshot_id,fixture_id=excluded.fixture_id,team_id=excluded.team_id,updated_at=now();
 delete from club_selection_private.scorecard_identity_reviews q where q.club_id=c and exists(
  select 1 from club_selection_private.scorecard_roster_links l join club_selection_private.roster r on r.id=l.roster_id and r.active
  where l.club_id=c and l.source_player_id=q.source_player_id);
end $$;





-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 if md5(definition)<>'dfa15533818c106833d70cacb24c064d' then raise exception 'Function changed before identity update: club_selection_private.api';end if;
 definition:=replace(definition,$before341$  'groups',case when (adm or sel) then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'captain_user_ids',club_selection_private.season_captains(c,g.id),'captain_roster_ids',club_selection_private.season_captain_roster_ids(c,g.id),'captain_name',club_selection_private.season_captain_name(c,g.id))) from public.playing_groups g where club_id=c and active),'[]') else '[]'::jsonb end,
  'batting_users',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(p.user_id) from public.players p where club_id=c and active),'[]') else '[]'::jsonb end,
  'roster',coalesce((select jsonb_agg((case when adm or sel then to_jsonb(p) when p.user_id=me then to_jsonb(p)-'account_email'-'auto_link_disabled' else jsonb_build_object('id',p.id,'name',p.name,'grade',p.grade,'active',p.active,'user_id',null,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'spin_style',p.spin_style,'keeper',p.keeper,'fielding',p.fielding) end)||jsonb_build_object('availability',coalesce(to_jsonb(av)-'checked_by',jsonb_build_object('revision',0,'usual_available',false,'blocks','[]'::jsonb,'available_dates','[]'::jsonb)))) from club_selection_private.roster p left join club_selection_private.availability av on av.roster_id=p.id where p.club_id=c and (adm or sel or cap or p.user_id=me)),'[]'::jsonb),
  'members',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'name',coalesce(up.display_name,'Club member'),'email',u.email,'selector',club_selection_private.selection_viewer(c,cm.user_id),'is_admin',cm.permission_role='admin','explicit_selector',exists(select 1 from club_selection_private.selectors sx where sx.club_id=c and sx.user_id=cm.user_id))) from public.club_memberships cm left join public.user_profiles up on up.user_id=cm.user_id left join auth.users u on u.id=cm.user_id where cm.club_id=c),'[]') else '[]'::jsonb end,
  'fixtures',coalesce((select jsonb_agg((case when adm or club_selection_private.selection_view(c,f.details,me) then to_jsonb(f)||jsonb_build_object('can_comment',club_selection_private.review_audience(f.id,me),'comment_count',(select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id),'issues','[]'::jsonb,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp())) else jsonb_build_object('id',f.id,'published',f.published,'publication',f.publication,'published_at',f.published_at,'can_comment',club_selection_private.review_audience(f.id,me),'comment_count',case when club_selection_private.review_audience(f.id,me) then (select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id) else 0 end,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp()))||case when (not club_selection_private.scoped_selections(c) and (adm or cap)) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('details',f.details,'revision',f.revision,'selection_unlocked_until',f.selection_unlocked_until) else '{}'::jsonb end||case when (not club_selection_private.scoped_selections(c) and cap) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('slots',f.slots,'scorecard_sync',f.scorecard_sync) else '{}'::jsonb end end)||jsonb_build_object('can_edit',club_selection_private.selection_edit(c,f.details,me),'can_publish',adm or club_selection_private.fixture_publisher(c,f.details)=me,'can_unlock',adm or case when club_selection_private.scoped_selections(c) then club_selection_private.fixture_publisher(c,f.details)=me else acc.head_selector_id=me or club_selection_private.publication_head(c)=me end,'can_post_match',club_selection_private.match_contributor(f.id,me),'can_post_comment',club_selection_private.selection_edit(c,f.details,me) or club_selection_private.fixture_captain(c,f.details,me),'group_head_id',club_selection_private.fixture_publisher(c,f.details)) order by f.details->'days'->0->>'date',f.details->>'grade') from club_selection_private.fixtures f where f.club_id=c and (adm or (not club_selection_private.scoped_selections(c) and (sel or cap)) or club_selection_private.fixture_view(c,f.details,me) or f.published is not null)),'[]'::jsonb));
$before341$,$after341$  'groups',case when (adm or sel) then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'captain_user_ids',club_selection_private.season_captains(c,g.id),'captain_roster_ids',club_selection_private.season_captain_roster_ids(c,g.id),'captain_name',club_selection_private.season_captain_name(c,g.id))) from public.playing_groups g where club_id=c and active),'[]') else '[]'::jsonb end,
  'batting_users',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(p.user_id) from public.players p where club_id=c and active),'[]') else '[]'::jsonb end,
  'roster',coalesce((select jsonb_agg((case when adm or sel then to_jsonb(p) when p.user_id=me then to_jsonb(p)-'account_email'-'auto_link_disabled' else jsonb_build_object('id',p.id,'name',p.name,'grade',p.grade,'usual_grades',to_jsonb(p.usual_grades),'active',p.active,'user_id',null,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'spin_style',p.spin_style,'keeper',p.keeper,'fielding',p.fielding) end)||jsonb_build_object('availability',coalesce(to_jsonb(av)-'checked_by',jsonb_build_object('revision',0,'usual_available',false,'blocks','[]'::jsonb,'available_dates','[]'::jsonb)))) from club_selection_private.roster p left join club_selection_private.availability av on av.roster_id=p.id where p.club_id=c and (adm or sel or cap or p.user_id=me)),'[]'::jsonb),
  'members',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'name',coalesce(up.display_name,'Club member'),'email',u.email,'selector',club_selection_private.selection_viewer(c,cm.user_id),'is_admin',cm.permission_role='admin','explicit_selector',exists(select 1 from club_selection_private.selectors sx where sx.club_id=c and sx.user_id=cm.user_id))) from public.club_memberships cm left join public.user_profiles up on up.user_id=cm.user_id left join auth.users u on u.id=cm.user_id where cm.club_id=c),'[]') else '[]'::jsonb end,
  'fixtures',coalesce((select jsonb_agg((case when adm or club_selection_private.selection_view(c,f.details,me) then to_jsonb(f)||jsonb_build_object('can_comment',club_selection_private.review_audience(f.id,me),'comment_count',(select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id),'issues','[]'::jsonb,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp())) else jsonb_build_object('id',f.id,'published',f.published,'publication',f.publication,'published_at',f.published_at,'can_comment',club_selection_private.review_audience(f.id,me),'comment_count',case when club_selection_private.review_audience(f.id,me) then (select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id) else 0 end,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp()))||case when (not club_selection_private.scoped_selections(c) and (adm or cap)) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('details',f.details,'revision',f.revision,'selection_unlocked_until',f.selection_unlocked_until) else '{}'::jsonb end||case when (not club_selection_private.scoped_selections(c) and cap) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('slots',f.slots,'scorecard_sync',f.scorecard_sync) else '{}'::jsonb end end)||jsonb_build_object('can_edit',club_selection_private.selection_edit(c,f.details,me),'can_publish',adm or club_selection_private.fixture_publisher(c,f.details)=me,'can_unlock',adm or case when club_selection_private.scoped_selections(c) then club_selection_private.fixture_publisher(c,f.details)=me else acc.head_selector_id=me or club_selection_private.publication_head(c)=me end,'can_post_match',club_selection_private.match_contributor(f.id,me),'can_post_comment',club_selection_private.selection_edit(c,f.details,me) or club_selection_private.fixture_captain(c,f.details,me),'group_head_id',club_selection_private.fixture_publisher(c,f.details)) order by f.details->'days'->0->>'date',f.details->>'grade') from club_selection_private.fixtures f where f.club_id=c and (adm or (not club_selection_private.scoped_selections(c) and (sel or cap)) or club_selection_private.fixture_view(c,f.details,me) or f.published is not null)),'[]'::jsonb));
$after341$);
 definition:=replace(definition,$before341$     -- Do not create or rename another entry to the same normalized player name.
     -- Existing legacy duplicates can still be edited/deactivated without a merge.
     if (r.id is null or club_selection_private.account_name_key(row->>'name')<>club_selection_private.account_name_key(r.name))
      and exists(select 1 from club_selection_private.roster other where other.club_id=c
       and other.id is distinct from r.id
       and club_selection_private.account_name_key(other.name)=club_selection_private.account_name_key(row->>'name')) then
      raise exception '% is already on the playing list. Edit the existing entry.',btrim(row->>'name');
     end if;
$before341$,$after341$     -- Do not create or rename another entry to the same normalized player name.
     -- Existing legacy duplicates can still be edited/deactivated without a merge.
     if (r.id is null or club_selection_private.player_name_key(row->>'name')<>club_selection_private.player_name_key(r.name))
      and exists(select 1 from club_selection_private.roster other where other.club_id=c
       and other.id is distinct from r.id and other.active
       and club_selection_private.player_name_key(other.name)=club_selection_private.player_name_key(row->>'name')) then
      raise exception '% is already on the playing list. Edit the existing entry.',btrim(row->>'name');
     end if;
$after341$);
 definition:=replace(definition,$before341$
    if p_action='save_roster' then
     if row ? 'spin_style' and (jsonb_typeof(row->'spin_style') is distinct from 'string'
      or row->>'spin_style' not in ('unknown','off_spin','left_arm_orthodox','leg_spin','left_arm_wrist')) then
      raise exception 'Choose a valid spin type';
$before341$,$after341$
    if p_action='save_roster' then
     if row ? 'usual_grades' then
      if jsonb_typeof(row->'usual_grades') is distinct from 'array' or jsonb_array_length(row->'usual_grades')>30
       or exists(select 1 from jsonb_array_elements(row->'usual_grades') g where jsonb_typeof(g)<>'string' or length(btrim(g#>>'{}')) not between 1 and 120)
       then raise exception 'Choose valid usual teams';end if;
      update club_selection_private.roster set usual_grades=array(select jsonb_array_elements_text(row->'usual_grades')) where id=pid and club_id=c;
     end if;
     if r.id is null or r.name is distinct from btrim(row->>'name') then
      update club_selection_private.roster set preferred_name=true where id=pid and club_id=c;
      update public.players p set display_name=btrim(row->>'name') from club_batting_private.roster_players rp
       where rp.club_id=c and rp.roster_id=pid and p.id=rp.player_id and p.club_id=c;
     end if;
     if row ? 'spin_style'  and (jsonb_typeof(row->'spin_style') is distinct from 'string'
      or row->>'spin_style' not in ('unknown','off_spin','left_arm_orthodox','leg_spin','left_arm_wrist')) then
      raise exception 'Choose a valid spin type';
$after341$);
 if md5(definition)<>'116a5e5b049876c12dd5be8ccc179bc5' then raise exception 'Identity patch did not match: club_selection_private.api';end if;
 execute definition;
end $patch341$;

-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.import_player(uuid,jsonb)'::regprocedure);
 if md5(definition)<>'8b776f334ac9f331fb70f156548efd8d' then raise exception 'Function changed before identity update: club_selection_private.import_player';end if;
 definition:=replace(definition,$before341$begin
 key:=nullif(btrim(item->>'external_id'),'');email:=nullif(lower(btrim(item->>'account_email')),'');
 name_key:=club_selection_private.account_name_key(item->>'name');
 if key is null or length(key)>120 then raise exception 'Every imported row needs a stable registration ID';end if;
 if name_key='' then raise exception 'Every imported row needs a name';end if;
$before341$,$after341$begin
 key:=nullif(btrim(item->>'external_id'),'');email:=nullif(lower(btrim(item->>'account_email')),'');
 name_key:=club_selection_private.player_name_key(item->>'name');
 if key is null or length(key)>120 then raise exception 'Every imported row needs a stable registration ID';end if;
 if name_key='' then raise exception 'Every imported row needs a name';end if;
$after341$);
 definition:=replace(definition,$before341$ if r.id is null then
  select count(*) into matches from club_selection_private.roster where club_id=c
   and club_selection_private.account_name_key(name)=name_key;
  if matches>1 then raise exception '% has more than one possible match. Check the playing list before importing.',btrim(item->>'name');end if;
  if matches=1 then
   select * into r from club_selection_private.roster where club_id=c and club_selection_private.account_name_key(name)=name_key;
   if r.external_id is not null or (email is not null and r.account_email is not null and email<>r.account_email) then
    raise exception '% has different registration details. Check the existing player before importing.',btrim(item->>'name');end if;
$before341$,$after341$ if r.id is null then
  select count(*) into matches from club_selection_private.roster where club_id=c
   and club_selection_private.player_name_key(name)=name_key;
  if matches>1 then raise exception '% has more than one possible match. Check the playing list before importing.',btrim(item->>'name');end if;
  if matches=1 then
   select * into r from club_selection_private.roster where club_id=c and club_selection_private.player_name_key(name)=name_key;
   if r.external_id is not null or (email is not null and r.account_email is not null and email<>r.account_email) then
    raise exception '% has different registration details. Check the existing player before importing.',btrim(item->>'name');end if;
$after341$);
 definition:=replace(definition,$before341$  end if;
 end if;
 if (r.id is null or club_selection_private.account_name_key(r.name)<>name_key)
  and exists(select 1 from club_selection_private.roster where club_id=c and id is distinct from r.id and club_selection_private.account_name_key(name)=name_key) then
  raise exception '% is already on the playing list. Check the existing player.',btrim(item->>'name');end if;
 if r.id is null then
$before341$,$after341$  end if;
 end if;
 if (r.id is null or club_selection_private.player_name_key(r.name)<>name_key)
  and exists(select 1 from club_selection_private.roster where club_id=c and id is distinct from r.id and club_selection_private.player_name_key(name)=name_key) then
  raise exception '% is already on the playing list. Check the existing player.',btrim(item->>'name');end if;
 if r.id is null then
$after341$);
 definition:=replace(definition,$before341$  values(c,key,btrim(item->>'name'),coalesce(item->>'grade',''),email) returning id into r.id;
 else
  update club_selection_private.roster set external_id=key,name=btrim(item->>'name'),
   grade=coalesce(item->>'grade',grade),account_email=coalesce(email,account_email),updated_at=now() where id=r.id;
 end if;
$before341$,$after341$  values(c,key,btrim(item->>'name'),coalesce(item->>'grade',''),email) returning id into r.id;
 else
  update club_selection_private.roster set external_id=key,name=case when preferred_name then name else btrim(item->>'name') end,
   grade=coalesce(item->>'grade',grade),account_email=coalesce(email,account_email),updated_at=now() where id=r.id;
 end if;
$after341$);
 if md5(definition)<>'d63ce3008fcde7511efc7f96b9488b0c' then raise exception 'Identity patch did not match: club_selection_private.import_player';end if;
 execute definition;
end $patch341$;

-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('club_batting_private.consolidate_scorecard_roster(uuid,uuid,uuid,text)'::regprocedure);
 if md5(definition)<>'bf32e90693b560a6586988ea40ac734f' then raise exception 'Function changed before identity update: club_batting_private.consolidate_scorecard_roster';end if;
 definition:=replace(definition,$before341$<<merge_state>>
declare original club_selection_private.roster%rowtype;canonical club_selection_private.roster%rowtype;
 a club_selection_private.availability%rowtype;b club_selection_private.availability%rowtype;
 f club_selection_private.fixtures%rowtype;published jsonb;sync jsonb;slots jsonb;details jsonb;unavailable jsonb;available jsonb;
$before341$,$after341$<<merge_state>>
declare original club_selection_private.roster%rowtype;canonical club_selection_private.roster%rowtype;
 old_pid uuid;new_pid uuid;ref record;references_count bigint;
 a club_selection_private.availability%rowtype;b club_selection_private.availability%rowtype;
 f club_selection_private.fixtures%rowtype;published jsonb;sync jsonb;slots jsonb;details jsonb;unavailable jsonb;available jsonb;
$after341$);
 definition:=replace(definition,$before341$ select * into canonical from club_selection_private.roster where id=new_id and club_id=c for update;
 if original.id is null or canonical.id is null or old_id=new_id
  or original.user_id is not null or nullif(btrim(original.account_email),'') is not null or canonical.user_id is not null
  or exists(select 1 from club_batting_private.roster_players rp join public.players p on p.id=rp.player_id where rp.roster_id=old_id and (rp.claimed_user_id is not null or p.user_id is not null))
  or exists(select 1 from club_batting_private.roster_players where roster_id=new_id)
  then raise exception 'These records have account or player history links that need Club Admin review';end if;
 -- A confirmed identity is not permission to remove a selection from either team.
 if exists(
$before341$,$after341$ select * into canonical from club_selection_private.roster where id=new_id and club_id=c for update;
 if original.id is null or canonical.id is null or old_id=new_id
  or original.user_id is not null or nullif(btrim(original.account_email),'') is not null
  or exists(select 1 from club_batting_private.roster_players rp join public.players p on p.id=rp.player_id where rp.roster_id=old_id and (rp.claimed_user_id is not null or p.user_id is not null))
  then raise exception 'These records have account or player history links that need Club Admin review';end if;
 if length(btrim(source_name)) not between 1 and 120 then raise exception 'Choose the player name to retain';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select player_id into old_pid from club_batting_private.roster_players where roster_id=old_id and club_id=c;
 select player_id into new_pid from club_batting_private.roster_players where roster_id=new_id and club_id=c;
 if old_pid is not null and new_pid is not null and old_pid<>new_pid then
  -- Established histories are never silently combined. Only an empty duplicate
  -- can retire into the retained history, including future plan dates/groups.
  for ref in select k.conrelid::regclass tbl,attr.attname col from pg_constraint k
   join pg_attribute attr on attr.attrelid=k.conrelid and attr.attnum=k.conkey[1]
   where k.contype='f' and k.confrelid='public.players'::regclass and cardinality(k.conkey)=1
    and k.conrelid not in ('club_batting_private.roster_players'::regclass,'public.player_playing_groups'::regclass,'club_batting_private.selection_plan_dates'::regclass)
  loop
   execute format('select count(*) from %s where %I=$1',ref.tbl,ref.col) into references_count using old_pid;
   if references_count>0 then raise exception 'Both records have saved player history. Review those records before merging';end if;
  end loop;
  insert into public.player_playing_groups(club_id,player_id,playing_group_id)
   select club_id,new_pid,playing_group_id from public.player_playing_groups where club_id=c and player_id=old_pid on conflict do nothing;
  update club_batting_private.selection_plan_dates set player_id=new_pid where club_id=c and player_id=old_pid;
  update club_batting_private.fixture_review_rosters set player_ids=array_replace(player_ids,old_pid,new_pid),
   captain_player_id=case when captain_player_id=old_pid then new_pid else captain_player_id end,
   keeper_player_id=case when keeper_player_id=old_pid then new_pid else keeper_player_id end,revision=revision+1,updated_at=now()
   where club_id=c and (old_pid=any(player_ids) or captain_player_id=old_pid or keeper_player_id=old_pid);
  update public.players set active=false where id=old_pid and club_id=c;
 end if;

 -- A confirmed identity is not permission to remove a selection from either team.
 if exists(
$after341$);
 definition:=replace(definition,$before341$ end if;
 update club_selection_private.roster set name=source_name,active=true,
  grade=case when grade='' then original.grade else grade end,
  batting=case when batting='unknown' then original.batting else batting end,
  bowling=case when bowling='unknown' then original.bowling else bowling end,
$before341$,$after341$ end if;
 update club_selection_private.roster set name=source_name,active=true,
  usual_grades=club_selection_private.normal_usual_grades(array[grade]||usual_grades||array[original.grade]||original.usual_grades),
  preferred_name=preferred_name or original.preferred_name,
  fielding=case when fielding='unknown' then original.fielding else fielding end,
  batting=case when batting='unknown' then original.batting else batting end,
  bowling=case when bowling='unknown' then original.bowling else bowling end,
$after341$);
 definition:=replace(definition,$before341$   else 'unknown' end,
  keeper=keeper or original.keeper,updated_at=now() where id=new_id;
 update club_batting_private.roster_players set roster_id=new_id where roster_id=old_id and club_id=c;
 -- Retain the saved follow-up, appointments and artwork references as well.
 -- A conflicting unique record aborts the entire confirmation, never discards it.
$before341$,$after341$   else 'unknown' end,
  keeper=keeper or original.keeper,updated_at=now() where id=new_id;
 if new_pid is null then update club_batting_private.roster_players set roster_id=new_id where roster_id=old_id and club_id=c;end if;
 update public.players set display_name=source_name where club_id=c and id=coalesce(new_pid,old_pid);
 update club_selection_private.scorecard_roster_links set roster_id=new_id,updated_at=now() where club_id=c and roster_id=old_id;
 insert into club_selection_private.player_source_names(club_id,provider,name_key,roster_id,source_name,confirmed_by)
  select club_id,provider,name_key,new_id,player_source_names.source_name,confirmed_by from club_selection_private.player_source_names where club_id=c and roster_id=old_id on conflict do nothing;
 delete from club_selection_private.player_source_names where club_id=c and roster_id=old_id;
 update club_selection_private.dropped_player_reminders set roster_id=new_id where club_id=c and roster_id=old_id;
 update club_selection_private.player_link_choices set roster_id=new_id where club_id=c and roster_id=old_id;
 -- Retain the saved follow-up, appointments and artwork references as well.
 -- A conflicting unique record aborts the entire confirmation, never discards it.
$after341$);
 definition:=replace(definition,$before341$ update club_selection_private.roster set active=false,auto_link_disabled=true,updated_at=now() where id=old_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_roster_consolidated',
  jsonb_build_object('retired_roster_id',old_id,'active_roster_id',new_id,'previous_name',original.name,'name',source_name,'old_availability',to_jsonb(a),'registration_availability',to_jsonb(b)));
end $function$
$before341$,$after341$ update club_selection_private.roster set active=false,auto_link_disabled=true,updated_at=now() where id=old_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_roster_consolidated',
  jsonb_build_object('retired_roster_id',old_id,'active_roster_id',new_id,'old_roster',to_jsonb(original),'canonical_roster',to_jsonb(canonical),'old_player_id',old_pid,'canonical_player_id',new_pid,'previous_name',original.name,'name',source_name,'old_availability',to_jsonb(a),'registration_availability',to_jsonb(b)));
end $function$
$after341$);
 if md5(definition)<>'660c954c3288f2c50af8e7eb4fcc58c3' then raise exception 'Identity patch did not match: club_batting_private.consolidate_scorecard_roster';end if;
 execute definition;
end $patch341$;

-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure);
 if md5(definition)<>'276f99cfdc28605cd4ccf551a3b31d0a' then raise exception 'Function changed before identity update: club_batting_private.confirm_scorecard_player';end if;
 definition:=replace(definition,$before341$declare sid uuid:=(v->>'snapshot_id')::uuid;source_id uuid:=(v->>'source_player_id')::uuid;
 pid uuid:=nullif(v->>'player_id','')::uuid;rid uuid:=nullif(v->>'roster_id','')::uuid;fid uuid:=nullif(v->>'fixture_id','')::uuid;
 card jsonb;source_name text;old_name text;source_names integer;linked_pid uuid;linked_rid uuid;other_id uuid;
 r club_selection_private.roster%rowtype;old_r club_selection_private.roster%rowtype;p public.players%rowtype;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;
$before341$,$after341$declare sid uuid:=(v->>'snapshot_id')::uuid;source_id uuid:=(v->>'source_player_id')::uuid;
 pid uuid:=nullif(v->>'player_id','')::uuid;rid uuid:=nullif(v->>'roster_id','')::uuid;fid uuid:=nullif(v->>'fixture_id','')::uuid;
 card jsonb;source_name text;provider_name text;old_name text;source_names integer;linked_pid uuid;linked_rid uuid;other_id uuid;
 r club_selection_private.roster%rowtype;old_r club_selection_private.roster%rowtype;p public.players%rowtype;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;
$after341$);
 definition:=replace(definition,$before341$ if pid is null and rid is null then raise exception 'Choose an existing club player';end if;
 if v->>'expected_name' is distinct from old_name then raise exception 'The player name changed. Check the updated name before confirming';end if;
 if card->>'provider'='playhq_au' then
  if fid is null or rid is null then raise exception 'Choose this scorecard’s fixture and club player';end if;
$before341$,$after341$ if pid is null and rid is null then raise exception 'Choose an existing club player';end if;
 if v->>'expected_name' is distinct from old_name then raise exception 'The player name changed. Check the updated name before confirming';end if;
 provider_name:=source_name;
 if r.preferred_name then source_name:=r.name;end if;
 if card->>'provider'='playhq_au' then
  if fid is null or rid is null then raise exception 'Choose this scorecard’s fixture and club player';end if;
$after341$);
 definition:=replace(definition,$before341$   or exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id and exists(select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') person where person->>'player_id'=l.source_player_id::text))
   then raise exception 'This match already has a different player link. Ask Club Admin to review it';end if;
  -- The explicit identity confirmation adopts the trusted source spelling.
  -- Keep account identities and all score/coaching IDs; opted-out teams do not write Batting.
  update club_selection_private.roster set name=source_name,updated_at=now() where id=rid and club_id=c and name is distinct from source_name;
$before341$,$after341$   or exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id and exists(select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') person where person->>'player_id'=l.source_player_id::text))
   then raise exception 'This match already has a different player link. Ask Club Admin to review it';end if;
  -- An explicit club display name survives; the source spelling remains in the scorecard.
  -- Keep account identities and all score/coaching IDs; opted-out teams do not write Batting.
  update club_selection_private.roster set name=source_name,updated_at=now() where id=rid and club_id=c and name is distinct from source_name;
$after341$);
 definition:=replace(definition,$before341$  insert into club_selection_private.requests values(c,auth.uid(),request_id,'scorecard_player_identity',v,result,now());
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_match_player_identity',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'source_player_id',source_id,'roster_id',rid,'player_id',pid,'previous_name',old_name,'name',source_name));
  perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,(v->>'team_id')::uuid,auth.uid());
  return result;
$before341$,$after341$  insert into club_selection_private.requests values(c,auth.uid(),request_id,'scorecard_player_identity',v,result,now());
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_match_player_identity',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'source_player_id',source_id,'roster_id',rid,'player_id',pid,'previous_name',old_name,'name',source_name));
  perform club_selection_private.remember_source_name(c,sid,(v->>'team_id')::uuid,source_id,rid,auth.uid());
  perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,(v->>'team_id')::uuid,auth.uid());
  return result;
$after341$);
 definition:=replace(definition,$before341$  update club_selection_private.roster set active=false,updated_at=now() where id=old_r.id;
 end if;
 result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',source_name,'fixture_repaired',repair or retired_id is not null,'needs_team_review',needs_team_review,'retired_roster_id',retired_id);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_player_identity',result||jsonb_build_object('previous_name',old_name,'previous_roster_id',old_r.id,'snapshot_id',sid));
$before341$,$after341$  update club_selection_private.roster set active=false,updated_at=now() where id=old_r.id;
 end if;
 if rid is not null then perform club_selection_private.remember_source_name(c,sid,(v->>'team_id')::uuid,source_id,rid,auth.uid());end if;
 result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',source_name,'fixture_repaired',repair or retired_id is not null,'needs_team_review',needs_team_review,'retired_roster_id',retired_id);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_player_identity',result||jsonb_build_object('previous_name',old_name,'previous_roster_id',old_r.id,'snapshot_id',sid));
$after341$);
 if md5(definition)<>'664b5667fe6a3ce946c1008d4190eeea' then raise exception 'Identity patch did not match: club_batting_private.confirm_scorecard_player';end if;
 execute definition;
end $patch341$;

-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.link_selected_scorecard_players(uuid,uuid,uuid,uuid,uuid,boolean)'::regprocedure);
 if md5(definition)<>'893b9190faec3cefc74b18583a3df653' then raise exception 'Function changed before identity update: club_selection_private.link_selected_scorecard_players';end if;
 definition:=replace(definition,$before341$ card jsonb; team jsonb; f club_selection_private.fixtures%rowtype; d jsonb; picks jsonb;
 person jsonb; rid uuid; pid uuid; source_id uuid; name_key text; candidates uuid[];
 linked jsonb:='[]'; changed integer:=0; added integer; club_timezone text;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
$before341$,$after341$ card jsonb; team jsonb; f club_selection_private.fixtures%rowtype; d jsonb; picks jsonb;
 person jsonb; rid uuid; pid uuid; source_id uuid; name_key text; candidates uuid[];
 remembered boolean; linked jsonb:='[]'; changed integer:=0; added integer; club_timezone text;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
$after341$);
 definition:=replace(definition,$before341$ for person in select p from jsonb_array_elements(team->'players') p where p->>'player_id' is not null and nullif(btrim(p->>'name'),'') is not null loop
  source_id:=(person->>'player_id')::uuid;
  name_key:=club_selection_private.account_name_key(person->>'name');
  -- At least a complete given name and surname, unique on both lists.
  if name_key !~ '^[[:alpha:]][[:alpha:]''’-]+[[:space:]]+[[:alpha:]][[:alpha:]''’ -]+$'
   or (select count(*) from jsonb_array_elements(team->'players') p where club_selection_private.account_name_key(p->>'name')=name_key)<>1
   or (select count(*) from jsonb_array_elements(team->'players') p where p->>'player_id'=source_id::text)<>1 then continue;end if;
  select array_agg(r.id) into candidates from club_selection_private.roster r
   where r.club_id=c and r.active and club_selection_private.account_name_key(r.name)=name_key;
  if cardinality(candidates) is distinct from 1 then continue;end if;
  rid:=candidates[1];
  if not exists(select 1 from jsonb_array_elements(picks) slot where slot->>'d1'=rid::text or slot->>'d2'=rid::text) then continue;end if;
  -- A future or duplicate identity must never claim an existing source mapping.
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and
$before341$,$after341$ for person in select p from jsonb_array_elements(team->'players') p where p->>'player_id' is not null and nullif(btrim(p->>'name'),'') is not null loop
  source_id:=(person->>'player_id')::uuid;
  name_key:=club_selection_private.player_name_key(person->>'name');
  remembered:=false;
  -- At least a complete given name and surname, unique on both lists.
  if name_key !~ '^[[:alpha:]][[:alpha:]''’-]+[[:space:]]+[[:alpha:]][[:alpha:]''’ -]+$'
   or (select count(*) from jsonb_array_elements(team->'players') p where club_selection_private.player_name_key(p->>'name')=name_key)<>1
   or (select count(*) from jsonb_array_elements(team->'players') p where p->>'player_id'=source_id::text)<>1 then continue;end if;
  select array_agg(distinct n.roster_id) into candidates from club_selection_private.player_source_names n
   join club_selection_private.roster r on r.id=n.roster_id and r.club_id=c and r.active
   where n.club_id=c and n.provider=coalesce(card->>'provider','playcricket_au') and n.name_key=link_state.name_key;
  remembered:=cardinality(candidates)=1;
  if coalesce(cardinality(candidates),0)>1 then continue;end if;
  if remembered then
   if exists(select 1 from club_selection_private.roster r where r.club_id=c and r.active and r.id<>candidates[1]
    and club_selection_private.player_name_key(r.name)=name_key) then continue;end if;
  else
   select array_agg(r.id) into candidates from club_selection_private.roster r
    where r.club_id=c and r.active and club_selection_private.player_name_key(r.name)=name_key;
  end if;
  if cardinality(candidates) is distinct from 1 then continue;end if;
  rid:=candidates[1];
  if not remembered and not exists(select 1 from jsonb_array_elements(picks) slot where slot->>'d1'=rid::text or slot->>'d2'=rid::text) then continue;end if;
  -- A future or duplicate identity must never claim an existing source mapping.
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and
$after341$);
 definition:=replace(definition,$before341$   values(c,actor,'scorecard_selected_identities',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'method',case when f.published is null then 'unique_full_name_in_selected_team' else 'unique_full_name_in_published_team' end,'players',linked));
 end if;
 if apply_links then perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,tid,actor);end if;
 return linked;
end $function$
$before341$,$after341$   values(c,actor,'scorecard_selected_identities',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'method',case when f.published is null then 'unique_full_name_in_selected_team' else 'unique_full_name_in_published_team' end,'players',linked));
 end if;
 if apply_links then
  perform club_selection_private.queue_scorecard_identities(c,sid,fid,tid);
  perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,tid,actor);
 end if;
 return linked;
end $function$
$after341$);
 if md5(definition)<>'826d38008d0abc7bd4ac0fc264ba533a' then raise exception 'Identity patch did not match: club_selection_private.link_selected_scorecard_players';end if;
 execute definition;
end $patch341$;

-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.scorecard_team_api(uuid,text,jsonb)'::regprocedure);
 if md5(definition)<>'57afbdd082286aba991e8a53e452b1fb' then raise exception 'Function changed before identity update: club_selection_private.scorecard_team_api';end if;
 definition:=replace(definition,$before341$    from club_selection_private.fixtures fx where fx.club_id=c and (not club_selection_private.scoped_selections(c) or club_selection_private.fixture_view(c,fx.details,auth.uid()) or club_selection_private.result_editor(fx.id,auth.uid())) and not coalesce((fx.details->>'cancelled')::boolean,false)
    and (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(fx.details->'days') day)=card->'dates'),'[]'),
   'roster',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'external_id',r.external_id,'active',r.active,'identity_unlinked',r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id),'imported_stub',r.id=md5('playcricket-roster:'||c::text||lower(r.external_id))::uuid and r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id)) order by r.name,r.id) from club_selection_private.roster r where r.club_id=c),'[]'),
   'links',coalesce((select jsonb_agg(jsonb_build_object('source_id',links.source_player_id,'roster_id',links.roster_id)) from (
    select l.source_player_id,l.roster_id from club_selection_private.scorecard_roster_links l where l.club_id=c
$before341$,$after341$    from club_selection_private.fixtures fx where fx.club_id=c and (not club_selection_private.scoped_selections(c) or club_selection_private.fixture_view(c,fx.details,auth.uid()) or club_selection_private.result_editor(fx.id,auth.uid())) and not coalesce((fx.details->>'cancelled')::boolean,false)
    and (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(fx.details->'days') day)=card->'dates'),'[]'),
   'roster',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'external_id',r.external_id,'active',r.active,'preferred_name',r.preferred_name,'identity_unlinked',r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id),'imported_stub',r.id=md5('playcricket-roster:'||c::text||lower(r.external_id))::uuid and r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id)) order by r.name,r.id) from club_selection_private.roster r where r.club_id=c),'[]'),
   'links',coalesce((select jsonb_agg(jsonb_build_object('source_id',links.source_player_id,'roster_id',links.roster_id)) from (
    select l.source_player_id,l.roster_id from club_selection_private.scorecard_roster_links l where l.club_id=c
$after341$);
 definition:=replace(definition,$before341$ end loop;
 for r in select * from jsonb_array_elements(plan->'mapping') loop
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,(r->>'source_id')::uuid,(r->>'roster_id')::uuid,auth.uid())
   on conflict(club_id,source_player_id) do update set roster_id=excluded.roster_id,confirmed_by=excluded.confirmed_by,updated_at=now();
$before341$,$after341$ end loop;
 for r in select * from jsonb_array_elements(plan->'mapping') loop
  perform club_selection_private.remember_source_name(c,sid,tid::uuid,(r->>'source_id')::uuid,(r->>'roster_id')::uuid,auth.uid());
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,(r->>'source_id')::uuid,(r->>'roster_id')::uuid,auth.uid())
   on conflict(club_id,source_player_id) do update set roster_id=excluded.roster_id,confirmed_by=excluded.confirmed_by,updated_at=now();
$after341$);
 if md5(definition)<>'3dedb60900f6eb352e763d535748662f' then raise exception 'Identity patch did not match: club_selection_private.scorecard_team_api';end if;
 execute definition;
end $patch341$;

-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 if md5(definition)<>'d7535c96ba8acac80356971acc878b59' then raise exception 'Function changed before identity update: public.club_selections_api';end if;
 definition:=replace(definition,$before341$  result:=result||jsonb_build_object('returning_context',club_selection_private.selection_returning_context(p_club_id,result->'fixtures'));
 end if;
 return result;
end $function$
$before341$,$after341$  result:=result||jsonb_build_object('returning_context',club_selection_private.selection_returning_context(p_club_id,result->'fixtures'));
 end if;
 if p_action='context' and (coalesce((result->>'admin')::boolean,false) or coalesce((result->>'selection_editor')::boolean,false)) then
  result:=result||jsonb_build_object('identity_reviews',coalesce((select jsonb_agg(jsonb_build_object('fixture_id',q.fixture_id,'snapshot_id',q.snapshot_id,'team_id',q.team_id,'source_id',q.source_player_id,'name',q.source_name) order by q.updated_at desc)
   from club_selection_private.scorecard_identity_reviews q
   where q.club_id=p_club_id and (coalesce((result->>'admin')::boolean,false) or club_selection_private.result_editor(q.fixture_id,auth.uid()))
    and not exists(select 1 from club_selection_private.scorecard_roster_links l join club_selection_private.roster r on r.id=l.roster_id and r.active where l.club_id=q.club_id and l.source_player_id=q.source_player_id)),'[]'));
 end if;
 return result;
end $function$
$after341$);
 if md5(definition)<>'efae26454140c6e98be319501eebbf8a' then raise exception 'Identity patch did not match: public.club_selections_api';end if;
 execute definition;
end $patch341$;

-- Change only reviewed fragments; abort on any concurrent function change.
do $patch341$
declare definition text;
begin
 definition:=pg_get_functiondef('club_selection_private.availability_fixtures(uuid)'::regprocedure);
 if md5(definition)<>'c8cbff322459ddb6f9b40012fd64b41a' then raise exception 'Function changed before identity update: club_selection_private.availability_fixtures';end if;
 definition:=replace(definition,$before341$ SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); player uuid; usual_team uuid; season uuid; tz text; today text; answer jsonb;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
$before341$,$after341$ SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); player uuid; usual_team uuid;usual_teams uuid[]; season uuid; tz text; today text; answer jsonb;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
$after341$);
 definition:=replace(definition,$before341$ select r.id,club_selection_private.fixture_group_id(c,jsonb_build_object('grade',r.grade)) into player,usual_team from club_selection_private.roster r where r.club_id=c and r.user_id=me and r.active;
 if player is null then raise exception 'Link your playing-list entry before finding fixtures';end if;
 select a.timezone into tz from club_selection_private.access a where a.club_id=c;
 tz:=coalesce(tz,'Australia/Sydney');today:=(now() at time zone tz)::date::text;
$before341$,$after341$ select r.id,club_selection_private.fixture_group_id(c,jsonb_build_object('grade',r.grade)) into player,usual_team from club_selection_private.roster r where r.club_id=c and r.user_id=me and r.active;
 if player is null then raise exception 'Link your playing-list entry before finding fixtures';end if;
 select array_agg(distinct club_selection_private.fixture_group_id(c,jsonb_build_object('grade',g))) into usual_teams
 from club_selection_private.roster r cross join unnest(case when cardinality(r.usual_grades)>0 then r.usual_grades else array[r.grade] end) g where r.id=player;
 select a.timezone into tz from club_selection_private.access a where a.club_id=c;
 tz:=coalesce(tz,'Australia/Sydney');today:=(now() at time zone tz)::date::text;
$after341$);
 definition:=replace(definition,$before341$   from jsonb_array_elements(t.days) with ordinality x(d,ord) where d->>'date'>=today
  ) days where t.club_id=c and t.included and days.value is not null
   and (t.audience='club' or usual_team=any(t.team_ids))
 ), team_choices as (
  select team_id,name from upcoming union
  select g.id::text,g.name from trials t join public.playing_groups g on g.id=any(t.team_ids) and g.club_id=c and g.active
 ), teams as (
  select distinct u.team_id,u.name,u.team_id=usual_team::text usual,exists(select 1 from candidates history
   where history.team_id=u.team_id and history.published is not null
    and exists(select 1 from jsonb_array_elements(coalesce(history.published->'slots','[]'::jsonb)) slot
$before341$,$after341$   from jsonb_array_elements(t.days) with ordinality x(d,ord) where d->>'date'>=today
  ) days where t.club_id=c and t.included and days.value is not null
   and (t.audience='club' or usual_teams && t.team_ids)
 ), team_choices as (
  select team_id,name from upcoming union
  select g.id::text,g.name from trials t join public.playing_groups g on g.id=any(t.team_ids) and g.club_id=c and g.active
 ), teams as (
  select distinct u.team_id,u.name,u.team_id=any(usual_teams::text[]) usual,exists(select 1 from candidates history
   where history.team_id=u.team_id and history.published is not null
    and exists(select 1 from jsonb_array_elements(coalesce(history.published->'slots','[]'::jsonb)) slot
$after341$);
 definition:=replace(definition,$before341$  from team_choices u
 )
 select jsonb_build_object('club_id',c,'player_id',player,'season_id',season,'usual_team_id',usual_team,'timezone',tz,'from_date',today,
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',team_id,'name',name,'usual',coalesce(usual,false),'suggested',suggested or coalesce(usual,false)) order by name,team_id) from teams),'[]'::jsonb),
  'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',fixture_id,'team_id',team_id,'source',source,
$before341$,$after341$  from team_choices u
 )
 select jsonb_build_object('club_id',c,'player_id',player,'season_id',season,'usual_team_id',usual_team,'usual_team_ids',usual_teams,'timezone',tz,'from_date',today,
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',team_id,'name',name,'usual',coalesce(usual,false),'suggested',suggested or coalesce(usual,false)) order by name,team_id) from teams),'[]'::jsonb),
  'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',fixture_id,'team_id',team_id,'source',source,
$after341$);
 if md5(definition)<>'30c69dacd4b960690d944282c603a772' then raise exception 'Identity patch did not match: club_selection_private.availability_fixtures';end if;
 execute definition;
end $patch341$;

-- Existing roster rows are untouched until an authorised save or confirmation.
revoke all on club_selection_private.player_source_names,club_selection_private.scorecard_identity_reviews from public,anon,authenticated;
revoke all on function club_selection_private.player_name_key(text),club_selection_private.normal_usual_grades(text[]),club_selection_private.keep_usual_grades(),club_selection_private.remember_source_name(uuid,uuid,uuid,uuid,uuid,uuid),club_selection_private.queue_scorecard_identities(uuid,uuid,uuid,uuid) from public,anon,authenticated;
commit;
