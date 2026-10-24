-- Reapply the authoritative API with SQL aliases that cannot collide with PL/pgSQL records.

CREATE OR REPLACE FUNCTION club_selection_private.api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();c uuid:=p_club_id;adm boolean;sel boolean;cap boolean;acc club_selection_private.access%rowtype;
 rr club_selection_private.requests%rowtype;rid uuid;res jsonb;row jsonb;x jsonb;s jsonb;v text;pid uuid;uid uuid;fid uuid;
 r club_selection_private.roster%rowtype;a club_selection_private.availability%rowtype;m club_selection_private.fixtures%rowtype;
 ids uuid[];old jsonb;notes jsonb;body text;changed int:=0;expected int;posted uuid;data_limit int;publication_changes jsonb:='[]'::jsonb;
begin
 if length(p_data::text)>1000000 then raise exception 'Request too large';end if;
 if me is null then raise exception 'Sign in to use Selections';end if;
 if p_action in ('access','set_access') then
  if not club_selection_private.member(c,me) and not public.has_platform_role(array['owner','commercial_admin','support_admin']) then raise exception 'Club access required';end if;
 else
  if not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 end if;
 if p_action not in ('access','context','posts','history','review_posts') then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 if p_action not in ('access','set_access') and not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 select * into acc from club_selection_private.access where club_id=c;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 sel:=club_selection_private.selection_viewer(c,me);cap:=club_selection_private.captain(c,me);
 if p_action not in ('access','set_access') and not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if p_action in ('save_board','publish','send_review','history') and not sel then raise exception 'Selector access required';end if;
 if p_action='publish' and not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
 if p_action in ('save_fixture','import_roster','save_roster','availability_batch','fixture_lock') and not (adm or sel) then raise exception 'Club Admin or selector access required';end if;
 if p_action in ('selectors','group_links','fixture_defaults') and not adm then raise exception 'Club Admin permission required';end if;
 if p_action not in ('access','context','posts','history','review_posts') then
  rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
  select * into rr from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
  if found then if rr.action<>p_action or rr.payload<>p_data then raise exception 'This request ID was already used for a different change';end if;return rr.result;end if;
 end if;
 -- Check stored fixtures before any selection change, including old browser versions.
 -- Club advisory lock above and ordered row locks serialize unlock/save races.
 if p_action in ('save_board','save_fixture','publish','send_review') then
  if p_action='save_board' then
   ids:=array(select nullif(value->>'id','')::uuid from jsonb_array_elements(coalesce(p_data->'fixtures','[]')));
  elsif p_action='save_fixture' then ids:=array[nullif(p_data->>'id','')::uuid];
  else ids:=array(select jsonb_array_elements_text(coalesce(p_data->'ids','[]'))::uuid);
  end if;
  for m in select f.* from club_selection_private.fixtures f where f.club_id=c and f.id=any(ids) order by f.id for update loop
   if club_selection_private.scoped_selections(c) and (not club_selection_private.selection_edit(c,m.details,me) or (p_action='publish' and club_selection_private.fixture_publisher(c,m.details) is distinct from me)) then raise exception 'This Selection Group requires its editor or publishing Head Selector';end if;
   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);
   if m.published is not null and not coalesce(m.selection_unlocked_until>now(),false) then
    raise exception 'Published team is locked. The Head of Selections must unlock it before changes';
   end if;
  end loop;
 end if;
 -- Existing members are matched automatically when their Selections access/context loads.
 if p_action in ('access','context') and club_selection_private.member(c,me) and club_selection_private.enabled(c) then
  perform club_selection_private.sync_players(c,case when adm or sel then null else me end);
  if p_action='context' and (adm or sel) then perform club_selection_private.sync_republication_alerts(c);end if;
  select * into acc from club_selection_private.access where club_id=c;
 end if;
 if p_action='access' then return jsonb_build_object('enabled',club_selection_private.enabled(c),'mode',coalesce(acc.mode,'bundle'),'status',coalesce(acc.status,'disabled'),'valid_until',acc.valid_until,'timezone',coalesce(acc.timezone,'Australia/Sydney'),'revision',coalesce(acc.revision,0),'selector',sel,'admin',adm,'batting_participant',exists(select 1 from public.players bp where bp.club_id=c and bp.user_id=me and club_batting_private.player_uses_batting(c,bp.id)),'batting_captain',club_selection_private.batting_captain(c,me));end if;
 if p_action='set_access' then
  if not public.has_platform_role(array['owner','commercial_admin']) then raise exception 'Platform commercial permission required';end if;
  if coalesce(acc.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Access changed. Reload before saving';end if;
  if not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Active club required';end if;
  if not exists(select 1 from pg_timezone_names where name=coalesce(p_data->>'timezone','Australia/Sydney')) then raise exception 'Choose a valid time zone';end if;
  insert into club_selection_private.access(club_id,mode,status,valid_until,timezone,updated_by) values(c,p_data->>'mode',p_data->>'status',nullif(p_data->>'valid_until','')::date,coalesce(p_data->>'timezone','Australia/Sydney'),me)
  on conflict(club_id) do update set mode=excluded.mode,status=excluded.status,valid_until=excluded.valid_until,timezone=excluded.timezone,revision=club_selection_private.access.revision+1,updated_by=me,updated_at=now();
  res:=jsonb_build_object('saved',true);
 else
 if not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if p_action='context' then
  return jsonb_build_object('access',to_jsonb(acc),'selector',sel,'admin',adm,'captain',cap,'can_view_board',sel or cap,'roster_revision',acc.roster_revision,'availability_mode','opt_in','can_view_club_availability',adm or sel or cap,'head_selector',exists(select 1 from club_selection_private.selection_groups sg where sg.club_id=c and club_selection_private.selection_group_head(c,sg.id)=me) or (sel and club_selection_private.publication_head(c)=me),'selection_editor',club_selection_private.selection_editor(c,me),'group_permissions_enabled',club_selection_private.scoped_selections(c),
  'availability_dates',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('date',ds.match_date,'bulk_saved_at',ds.bulk_saved_at,'updated_at',ds.updated_at) order by ds.match_date desc) from club_selection_private.availability_date_setups ds where ds.club_id=c),'[]') else '[]'::jsonb end,
  'publication_head_id',club_selection_private.publication_head(c),
  'conversations',club_selection_private.conversation_context(c,me),
  'can_delegate',adm or acc.head_selector_id=me,
  'can_hand_back',adm or acc.head_selector_id=me or acc.publication_delegate_id=me,
  'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'snapshot',club_selection_private.draft_snapshot(f.id)||jsonb_build_object('draft_revision',f.revision),'sent_at',coalesce(f.review_requested_at,f.updated_at),
   'draft_changed',false,
   'captain_name',club_selection_private.match_captain_names(c,f.details)) order by f.review->'details'->'days'->0->>'date',f.review->'details'->>'grade')
   from club_selection_private.fixtures f where f.club_id=c and club_selection_private.review_audience(f.id,me)),'[]'::jsonb),
  'group_links',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(to_jsonb(g)) from club_selection_private.group_links g where club_id=c),'[]') else '[]'::jsonb end,
  'groups',case when (adm or sel) then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'captain_user_ids',club_selection_private.season_captains(c,g.id),'captain_roster_ids',club_selection_private.season_captain_roster_ids(c,g.id),'captain_name',club_selection_private.season_captain_name(c,g.id))) from public.playing_groups g where club_id=c and active),'[]') else '[]'::jsonb end,
  'batting_users',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(p.user_id) from public.players p where club_id=c and active),'[]') else '[]'::jsonb end,
  'roster',coalesce((select jsonb_agg((case when adm or sel then to_jsonb(p) when p.user_id=me then to_jsonb(p)-'account_email'-'auto_link_disabled' else jsonb_build_object('id',p.id,'name',p.name,'grade',p.grade,'active',p.active,'user_id',null,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'keeper',p.keeper) end)||jsonb_build_object('availability',coalesce(to_jsonb(av)-'checked_by',jsonb_build_object('revision',0,'usual_available',false,'blocks','[]'::jsonb,'available_dates','[]'::jsonb)))) from club_selection_private.roster p left join club_selection_private.availability av on av.roster_id=p.id where p.club_id=c and (adm or sel or cap or p.user_id=me)),'[]'::jsonb),
  'members',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'name',coalesce(up.display_name,'Club member'),'email',u.email,'selector',club_selection_private.selection_viewer(c,cm.user_id),'is_admin',cm.permission_role='admin','explicit_selector',exists(select 1 from club_selection_private.selectors sx where sx.club_id=c and sx.user_id=cm.user_id))) from public.club_memberships cm left join public.user_profiles up on up.user_id=cm.user_id left join auth.users u on u.id=cm.user_id where cm.club_id=c),'[]') else '[]'::jsonb end,
  'fixtures',coalesce((select jsonb_agg((case when club_selection_private.selection_view(c,f.details,me) then to_jsonb(f)||jsonb_build_object('can_comment',club_selection_private.review_audience(f.id,me),'comment_count',(select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id),'issues',club_selection_private.issues(f.id),'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp())) else jsonb_build_object('id',f.id,'published',f.published,'publication',f.publication,'published_at',f.published_at,'can_comment',club_selection_private.review_audience(f.id,me),'comment_count',case when club_selection_private.review_audience(f.id,me) then (select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id) else 0 end,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp()))||case when (not club_selection_private.scoped_selections(c) and (adm or cap)) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('details',f.details,'revision',f.revision,'selection_unlocked_until',f.selection_unlocked_until) else '{}'::jsonb end||case when (not club_selection_private.scoped_selections(c) and cap) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('slots',f.slots,'scorecard_sync',f.scorecard_sync) else '{}'::jsonb end end)||jsonb_build_object('can_edit',club_selection_private.selection_edit(c,f.details,me),'can_publish',club_selection_private.fixture_publisher(c,f.details)=me,'can_unlock',case when club_selection_private.scoped_selections(c) then club_selection_private.fixture_publisher(c,f.details)=me else acc.head_selector_id=me or club_selection_private.publication_head(c)=me end,'can_post_match',club_selection_private.match_contributor(f.id,me),'can_post_comment',club_selection_private.selection_edit(c,f.details,me) or club_selection_private.fixture_captain(c,f.details,me),'group_head_id',club_selection_private.fixture_publisher(c,f.details)) order by f.details->'days'->0->>'date',f.details->>'grade') from club_selection_private.fixtures f where f.club_id=c and ((not club_selection_private.scoped_selections(c) and (adm or sel or cap)) or club_selection_private.fixture_view(c,f.details,me) or f.published is not null)),'[]'::jsonb));
 elsif p_action in ('posts','post','history') then
  fid:=(p_data->>'id')::uuid;select * into m from club_selection_private.fixtures where id=fid and club_id=c;
  if not found or not club_selection_private.audience(fid,me) then raise exception 'This match conversation is only for its current team and staff';end if;
  if p_action='history' then
   if not club_selection_private.selection_view(c,m.details,me) then raise exception 'View access to this Selection Group is required';end if;
   return coalesce((select jsonb_agg(to_jsonb(p) order by version desc) from club_selection_private.publications p where fixture_id=fid),'[]');
  end if;
  if p_action='posts' then return coalesce((select jsonb_agg(to_jsonb(p) order by created_at) from club_selection_private.posts p where fixture_id=fid),'[]');end if;
  if club_selection_private.fixture_completed(m.published->'details',acc.timezone,clock_timestamp()) then
   raise exception 'This match conversation is closed. The final playing day has ended.';
  end if;
  if not club_selection_private.match_contributor(fid,me) then raise exception 'View-only selectors can read this conversation but cannot post';end if;
  insert into club_selection_private.posts(fixture_id,author_id,author_name,body) values(fid,me,coalesce((select display_name from public.user_profiles where user_id=me),'Club member'),btrim(p_data->>'body')) returning id into posted;
  changed:=club_selection_private.notify(fid,'post');res:=jsonb_build_object('id',posted,'recipients',changed);
 elsif p_action in ('review_posts','review_post') then
  fid:=(p_data->>'id')::uuid;select * into m from club_selection_private.fixtures where id=fid and club_id=c;
  if not found or not club_selection_private.review_audience(fid,me) then raise exception 'Team comments are private to assigned captains and selectors';end if;
  if p_action='review_posts' then return coalesce((select jsonb_agg(to_jsonb(p) order by created_at,id) from club_selection_private.review_posts p where fixture_id=fid),'[]');end if;
  if not (club_selection_private.selection_edit(c,m.details,me) or club_selection_private.fixture_captain(c,m.details,me)) then raise exception 'View-only selectors can read comments but cannot post';end if;
  if m.revision<>coalesce((p_data->>'review_revision')::int,-1) then raise exception 'The team changed. Refresh before commenting';end if;
  if length(btrim(coalesce(p_data->>'body',''))) not between 1 and 1500 then raise exception 'Write a comment of up to 1500 characters';end if;
   insert into club_selection_private.review_posts(fixture_id,author_id,author_name,body,review_revision)
   values(fid,me,coalesce((select display_name from public.user_profiles where user_id=me),'Club member'),btrim(p_data->>'body'),m.revision) returning id into posted;
  changed:=club_selection_private.notify_review(fid,false);res:=jsonb_build_object('saved',true,'id',posted,'recipients',changed);
 elsif p_action='publication_delegate' then
  if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Selection responsibilities changed. Refresh before saving';end if;
  if p_data->>'operation'='hand_back' then
   if not coalesce(adm or acc.head_selector_id=me or acc.publication_delegate_id=me,false) then raise exception 'Only the Head of Selections, their delegate or Club Admin can hand back';end if;
   update club_selection_private.access set publication_delegate_id=null,publication_delegate_from=null,publication_delegate_until=null,
    revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  elsif p_data->>'operation'='delegate' then
   if not coalesce(adm or acc.head_selector_id=me,false) then raise exception 'Only the Head of Selections or Club Admin can delegate publishing';end if;
   if acc.head_selector_id is null or not club_selection_private.member(c,acc.head_selector_id) then raise exception 'Assign a Head of Selections first';end if;
   uid:=nullif(p_data->>'user_id','')::uuid;
   if uid is null or uid=acc.head_selector_id or not club_selection_private.selection_editor(c,uid) then raise exception 'Choose another assigned selector from this club';end if;
   if coalesce(p_data->>'from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(p_data->>'until','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_data->>'from')::date::text<>p_data->>'from' or (p_data->>'until')::date::text<>p_data->>'until'
    or (p_data->>'until')::date<(p_data->>'from')::date
    or (p_data->>'until')::date<(now() at time zone acc.timezone)::date then raise exception 'Choose a valid delegation period ending today or later';end if;
   update club_selection_private.access set publication_delegate_id=uid,publication_delegate_from=(p_data->>'from')::date,publication_delegate_until=(p_data->>'until')::date,
    revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  else raise exception 'Choose Delegate or Hand back';end if;
  res:=jsonb_build_object('saved',true,'operation',p_data->>'operation');
 elsif p_action='conversation' then
  fid:=nullif(p_data->>'fixture_id','')::uuid;pid:=nullif(p_data->>'roster_id','')::uuid;
  select item into x from jsonb_array_elements(club_selection_private.conversation_context(c,me)) item
   where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  if x is null then raise exception 'This selection conversation is no longer available to you';end if;
  if x->>'can_update'='false' then raise exception 'Edit access is required to update this selection conversation';end if;
  if (x->>'revision')::integer<>coalesce((p_data->>'revision')::integer,-1) then raise exception 'Conversation status changed. Refresh before updating';end if;
  if jsonb_typeof(p_data->'spoken') is distinct from 'boolean' then raise exception 'Choose whether the player has been spoken to';end if;
  if x->>'kind'='left_out' then
   select pc.fixture_id into uid from club_selection_private.player_conversations pc join club_selection_private.fixtures sf on sf.id=pc.fixture_id and sf.club_id=c where pc.roster_id=pid and pc.movement_key=x->>'movement_key' order by pc.revision desc,pc.fixture_id limit 1;
   fid:=coalesce(uid,fid);
  end if;
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
 elsif p_action='fixture_lock' then
  fid:=nullif(p_data->>'id','')::uuid;
  select * into m from club_selection_private.fixtures where club_id=c and id=fid for update;
  if not found then raise exception 'Unknown fixture';end if;
  if m.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture changed. Reload before changing its lock';end if;
  if jsonb_typeof(p_data->'unlock') is distinct from 'boolean' then raise exception 'Choose whether to unlock or lock the fixture';end if;
  if club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,m.details,me) then raise exception 'Edit access to this Selection Group is required';end if;
  if m.published is not null and ((club_selection_private.scoped_selections(c) and club_selection_private.fixture_publisher(c,m.details) is distinct from me) or (not club_selection_private.scoped_selections(c) and me is distinct from acc.head_selector_id and me is distinct from club_selection_private.publication_head(c))) then
   raise exception 'Only the current Head of Selections or Acting Head can unlock a published team';end if;
  if (p_data->>'unlock')::boolean and m.published is null and not club_selection_private.fixture_completed(m.details,acc.timezone) then raise exception 'This fixture is still open';end if;
  update club_selection_private.fixtures
   set selection_unlocked_until=case when (p_data->>'unlock')::boolean then now()+interval '30 minutes' end,
       selection_unlocked_by=case when (p_data->>'unlock')::boolean then me end,
       revision=revision+1,updated_at=now(),updated_by=me
   where club_id=c and id=fid returning * into m;
  res:=jsonb_build_object('saved',true,'id',fid,'revision',m.revision,'selection_unlocked_until',m.selection_unlocked_until);
 elsif p_action='availability' then
  pid:=(p_data->>'id')::uuid;select * into r from club_selection_private.roster where id=pid and club_id=c and active;
  if not found or not (adm or club_selection_private.selection_editor(c,me) or coalesce(r.user_id=me,false)) then raise exception 'Edit only your own availability';end if;
  select * into a from club_selection_private.availability where roster_id=pid;
  if coalesce(a.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Availability changed. Reload before saving';end if;
  if p_data->>'calendar_mode' is distinct from 'opt_in' then raise exception 'Reload the updated app to mark available dates';end if;
  if coalesce((p_data->>'usual_available')::boolean,false) or coalesce(p_data->'blocks','[]'::jsonb)<>'[]'::jsonb then raise exception 'Mark individual available dates; automatic availability and blackouts are no longer used';end if;
  if jsonb_typeof(p_data->'available_dates') is distinct from 'array' or jsonb_array_length(p_data->'available_dates')>1500 then raise exception 'Invalid availability calendar';end if;
  for x in select * from jsonb_array_elements(p_data->'available_dates') loop
   v:=x#>>'{}';
   if jsonb_typeof(x)<>'string' or coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Invalid available date';end if;
  end loop;
  select coalesce(jsonb_agg(value order by value),'[]') into notes from (select distinct value from jsonb_array_elements_text(p_data->'available_dates')) dates;
  if p_data ? 'unavailable_dates' then
   if jsonb_typeof(p_data->'unavailable_dates') is distinct from 'array' or jsonb_array_length(p_data->'unavailable_dates')>1500 then raise exception 'Invalid unavailability calendar';end if;
   for x in select * from jsonb_array_elements(p_data->'unavailable_dates') loop
    v:=x#>>'{}';
    if jsonb_typeof(x)<>'string' or coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Invalid unavailable date';end if;
    if notes ? v then raise exception 'A date cannot be both available and unavailable';end if;
   end loop;
   select coalesce(jsonb_agg(value order by value),'[]') into old from (select distinct value from jsonb_array_elements_text(p_data->'unavailable_dates')) dates;
  else
   -- Older app versions still remember removed availability as unavailable.
   select coalesce(jsonb_agg(d order by d),'[]') into old from (
    select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where not notes ? value
    union select value from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where not notes ? value
   ) dates;
  end if;
  insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(pid,false,'[]',notes,old,me)
  on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
  update club_selection_private.availability_date_setups ds set updated_at=now()
   where ds.club_id=c and ((coalesce(a.available_dates,'[]') ? ds.match_date::text) is distinct from (notes ? ds.match_date::text)
    or (coalesce(a.unavailable_dates,'[]') ? ds.match_date::text) is distinct from (old ? ds.match_date::text));
  -- One private selector alert per affected future fixture, including published lists.
  for fid in select unnest(club_selection_private.availability_affected(c,pid,a.available_dates,notes)) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'alert_recipients',changed);
 elsif p_action='availability_batch' then
  if not (adm or club_selection_private.selection_editor(c,me)) then raise exception 'Selector access required';end if;
  if not coalesce((p_data->>'make_all_available')::boolean,false) then raise exception 'Confirm Make all players available for this date';end if;
  v:=p_data->>'date';
  if coalesce(v,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v::date::text<>v then raise exception 'Choose a valid date';end if;
  if acc.roster_revision<>coalesce((p_data->>'roster_revision')::int,-1) then raise exception 'Playing list changed. Reload before setting this date';end if;
  if jsonb_typeof(p_data->'unavailable_ids') is distinct from 'array' or jsonb_typeof(p_data->'revisions') is distinct from 'object' then raise exception 'Review the playing list before setting this date';end if;
  if jsonb_typeof(coalesce(p_data->'available_ids','[]')) is distinct from 'array' then raise exception 'Review the players being marked available';end if;
  if p_data ? 'reset_unavailable' and jsonb_typeof(p_data->'reset_unavailable') is distinct from 'boolean' then raise exception 'Choose whether to clear saved unavailability';end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_data->'available_ids','[]')) p where p_data->'unavailable_ids' ? p.value) then raise exception 'A player cannot be both available and unavailable';end if;
  for uid in select jsonb_array_elements_text((p_data->'unavailable_ids')||coalesce(p_data->'available_ids','[]'))::uuid loop
   if uid is null or not exists(select 1 from club_selection_private.roster where id=uid and club_id=c and active) then raise exception 'Choose unavailable players from this club playing list';end if;
  end loop;
  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active order by id loop
   select * into a from club_selection_private.availability where roster_id=r.id;
   if coalesce(a.revision,0)<>coalesce((p_data->'revisions'->>r.id::text)::int,-1) then raise exception 'A player updated their calendar. Reload before setting this date';end if;
   select coalesce(jsonb_agg(d order by d),'[]') into old from (
    select value d from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')) where value<>v
    union select v where (p_data->'unavailable_ids') ? r.id::text
     or (coalesce(a.unavailable_dates,'[]') ? v and not coalesce((p_data->>'reset_unavailable')::boolean,false)
         and not coalesce(p_data->'available_ids','[]') ? r.id::text)
   ) dates;
   select coalesce(jsonb_agg(d order by d),'[]') into notes from (
    select distinct value as d from jsonb_array_elements_text(coalesce(a.available_dates,'[]')) where value<>v
    union select v where not old ? v
   ) dates;
   ids:=ids||club_selection_private.availability_affected(c,r.id,a.available_dates,notes);
   insert into club_selection_private.availability(roster_id,usual_available,blocks,available_dates,unavailable_dates,checked_by) values(r.id,false,'[]',notes,old,me)
   on conflict(roster_id) do update set usual_available=false,blocks='[]',available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=me;
   data_limit:=data_limit+1;
  end loop;
  if data_limit=0 then raise exception 'Add players before setting availability';end if;
  insert into club_selection_private.availability_date_setups(club_id,match_date,bulk_saved_at,updated_at) values(c,v::date,now(),now())
  on conflict(club_id,match_date) do update set bulk_saved_at=excluded.bulk_saved_at,updated_at=excluded.updated_at;
  for fid in select distinct unnest(ids) loop changed:=changed+club_selection_private.notify_availability(fid);end loop;
  res:=jsonb_build_object('saved',true,'date',v,'players',data_limit,'saved_at',now(),'alert_recipients',changed);
 elsif p_action in ('import_roster','save_roster','save_board','publish','selectors','group_links','fixture_defaults','send_review','save_fixture') then
  if not (adm or sel) then raise exception 'Selector access required';end if;
  if p_action='fixture_defaults' then
   if not adm then raise exception 'Club Admin permission required';end if;
   if (acc.fixture_defaults->>'revision')::int<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture defaults changed. Reload before saving';end if;
   if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows')>100 then raise exception 'Save up to 100 grade and format defaults';end if;
   notes:='[]';
   for x in select * from jsonb_array_elements(p_data->'rows') loop
    if length(btrim(coalesce(x->>'grade',''))) not between 1 and 120 or coalesce(x->>'format','') not in ('t20','limited_overs','long_form') then raise exception 'Choose a grade and format for each default';end if;
    if x->>'overs' is not null and (x->>'overs' !~ '^[0-9]{1,3}$' or (x->>'overs')::int not between 1 and 999) then raise exception 'Overs must be a whole number between 1 and 999';end if;
    uid:=nullif(x->>'grade_group_id','')::uuid;
    if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
    v:=case when uid is null then btrim(x->>'grade') else (select name from public.playing_groups where id=uid) end;
    if exists(select 1 from jsonb_array_elements(notes) n where lower(n->>'grade')=lower(v) and n->>'format'=x->>'format') then raise exception 'Use one default per grade and format';end if;
    notes:=notes||jsonb_build_array(jsonb_build_object('grade',v,'grade_group_id',uid,'format',x->>'format','overs',nullif(x->>'overs','')::int));
   end loop;
   update club_selection_private.access set fixture_defaults=jsonb_build_object('revision',(acc.fixture_defaults->>'revision')::int+1,'rows',notes),updated_by=me,updated_at=now() where club_id=c;
   perform club_selection_private.sync_default_fixture_overs(c,acc.fixture_defaults->'rows',notes,me);
   res:=jsonb_build_object('saved',true);
  elsif p_action='send_review' then
   ids:=array(select distinct jsonb_array_elements_text(p_data->'ids')::uuid);
   if coalesce(array_length(ids,1),0) not between 1 and 30 then raise exception 'Choose teams to send to captains';end if;
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;
    if not found then raise exception 'Unknown fixture';end if;
    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Reload before sending';end if;
    if not coalesce((m.details->>'cancelled')::boolean,false) then
     notes:=club_selection_private.issues(fid);
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code' in ('over_team','over_slots')) then
      raise exception 'Fit the team into 11 slots before sending to captains' using detail=notes::text;
     end if;
    end if;
    if cardinality(club_selection_private.match_captain_users(c,m.details)||club_selection_private.season_captains(c,club_selection_private.fixture_group_id(c,m.details)))=0 then raise exception 'The match captain needs a linked club account to receive a private check';end if;
    if club_selection_private.review_current(fid) then continue;end if;
    update club_selection_private.fixtures set review=club_selection_private.draft_snapshot(fid)||jsonb_build_object('draft_revision',m.revision),review_requested_at=now() where id=fid;
    changed:=changed+club_selection_private.notify_review(fid,true);
   end loop;
   res:=jsonb_build_object('sent',true,'recipients',changed);
  elsif p_action='group_links' then
   if not adm or acc.mode<>'bundle' then raise exception 'Club Admin and both products are required';end if;
   if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Settings changed. Reload before saving';end if;
   delete from club_selection_private.group_links where club_id=c;
   for x in select * from jsonb_array_elements(p_data->'links') loop
    if not exists(select 1 from public.playing_groups where id=(x->>'group_id')::uuid and club_id=c and active) then raise exception 'Choose an active Playing Group from this club';end if;
    if length(btrim(coalesce(x->>'grade','')))=0 then raise exception 'A grade is required';end if;
    insert into club_selection_private.group_links(club_id,competition,grade,group_id) values(c,coalesce(x->>'competition',''),btrim(x->>'grade'),(x->>'group_id')::uuid);
   end loop;
   update club_selection_private.access set revision=revision+1 where club_id=c;
   res:=jsonb_build_object('saved',true);
  elsif p_action='selectors' then
   if club_selection_private.scoped_selections(c) then raise exception 'Manage selectors separately for each Selection Group in the updated app';end if;
   if not adm then raise exception 'Club Admin permission required';end if;
   if acc.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Settings changed. Reload before saving';end if;
   if p_data ? 'head_selector_id' then
    uid:=nullif(p_data->>'head_selector_id','')::uuid;
    if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose the Head of Selections from current club members';end if;
    update club_selection_private.access set head_selector_id=uid,
     publication_delegate_id=case when head_selector_id is distinct from uid then null else publication_delegate_id end,
     publication_delegate_from=case when head_selector_id is distinct from uid then null else publication_delegate_from end,
     publication_delegate_until=case when head_selector_id is distinct from uid then null else publication_delegate_until end where club_id=c;
   end if;
   delete from club_selection_private.selectors where club_id=c;
   for v in select jsonb_array_elements_text(p_data->'users') loop
    if not club_selection_private.member(c,v::uuid) then raise exception 'Choose current club members';end if;
    insert into club_selection_private.selectors values(c,v::uuid) on conflict do nothing;
   end loop;
   update club_selection_private.access set publication_delegate_id=null,publication_delegate_from=null,publication_delegate_until=null
    where club_id=c and publication_delegate_id is not null and not club_selection_private.selection_editor(c,publication_delegate_id);
   update club_selection_private.access set revision=revision+1 where club_id=c;res:=jsonb_build_object('saved',true);
  elsif p_action in ('import_roster','save_roster') then
   if not (adm or club_selection_private.selection_editor(c,me)) then raise exception 'View-only selectors cannot change the playing list';end if;
   if acc.roster_revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Playing list changed. Reload before saving';end if;
   if jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_array_length(p_data->'rows') not between 1 and 1000 then raise exception 'Choose 1 to 1000 playing-list rows';end if;
   ids:='{}';
   for row in select * from jsonb_array_elements(p_data->'rows') loop
    if p_action='import_roster' then
     pid:=club_selection_private.import_player(c,row);
    else
     pid:=coalesce(nullif(row->>'id','')::uuid,gen_random_uuid());uid:=nullif(row->>'user_id','')::uuid;
     select * into r from club_selection_private.roster where id=pid and club_id=c;
     -- Do not create or rename another entry to the same normalized player name.
     -- Existing legacy duplicates can still be edited/deactivated without a merge.
     if (r.id is null or club_selection_private.account_name_key(row->>'name')<>club_selection_private.account_name_key(r.name))
      and exists(select 1 from club_selection_private.roster other where other.club_id=c
       and other.id is distinct from r.id
       and club_selection_private.account_name_key(other.name)=club_selection_private.account_name_key(row->>'name')) then
      raise exception '% is already on the playing list. Edit the existing entry.',btrim(row->>'name');
     end if;
     if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Link only a verified club member';end if;
     if exists(select 1 from club_selection_private.roster where id=pid and club_id<>c) then raise exception 'Player belongs to another club';end if;
     insert into club_selection_private.roster(id,club_id,external_id,name,grade,batting,bowling,bowling_load,keeper,active,user_id)
     values(pid,c,nullif(btrim(row->>'external_id'),''),btrim(row->>'name'),coalesce(row->>'grade',''),coalesce(row->>'batting','unknown'),coalesce(row->>'bowling','unknown'),coalesce(row->>'bowling_load','unknown'),coalesce((row->>'keeper')::boolean,false),coalesce((row->>'active')::boolean,true),uid)
     on conflict(id) do update set external_id=excluded.external_id,name=excluded.name,grade=excluded.grade,batting=excluded.batting,bowling=excluded.bowling,bowling_load=excluded.bowling_load,keeper=excluded.keeper,active=excluded.active,user_id=excluded.user_id,updated_at=now();
     -- A deliberate unlink is never silently undone by automatic matching.
     update club_selection_private.roster set auto_link_disabled=case
      when r.user_id is not null and uid is null then true
      when uid is not null then false else auto_link_disabled end where id=pid;
    end if;
    if row ? 'account_email' then
     v:=nullif(lower(btrim(row->>'account_email')),'');
     -- Imports with missing email preserve previous account-matching details.
     if p_action='save_roster' or v is not null then
      update club_selection_private.roster set account_email=v where id=pid;
     end if;
    end if;
    if pid=any(ids) then raise exception 'Duplicate player in import or update';end if;ids:=array_append(ids,pid);changed:=changed+1;
   end loop;
   update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;
   res:=jsonb_build_object('saved',changed);
  elsif p_action='save_fixture' then
   if p_data ?| array['slots','published','review','fixtures'] then raise exception 'Fixture setup cannot change team selections';end if;
   fid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
   select * into m from club_selection_private.fixtures where id=fid;
   if found and m.club_id<>c then raise exception 'Fixture belongs to another club';end if;
   if coalesce(m.revision,0)<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture changed. Reload before saving';end if;
   if club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,p_data->'details',me) then raise exception 'Edit access to the target Selection Group is required';end if;
   perform club_selection_private.validate_details(p_data->'details');
   if (p_data->'details'->'match_roles') is distinct from (m.details->'match_roles') then raise exception 'A selector must change the match captain or keeper on the selection board';end if;
   uid:=nullif(p_data->'details'->>'captain_id','')::uuid;
   if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose a captain from this club';end if;
   uid:=nullif(p_data->'details'->>'grade_group_id','')::uuid;
   if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
   for v in select jsonb_array_elements_text(coalesce(p_data->'details'->'staff','[]')) loop
    if not club_selection_private.member(c,v::uuid) then raise exception 'Choose staff from this club';end if;
   end loop;
   -- Preserve existing picks, captain snapshots and publications byte for byte.
   -- A selector must resolve a format change that would invalidate existing picks.
   if m.id is not null and exists(select 1 from jsonb_array_elements(m.slots) slot where
    (jsonb_array_length(p_data->'details'->'days')=1 and nullif(slot->>'d2','') is not null)
    or (jsonb_array_length(p_data->'details'->'days')=2 and not coalesce((p_data->'details'->>'brackets')::boolean,false) and (slot->>'d1') is distinct from (slot->>'d2'))
   ) then raise exception 'A selector must adjust the Day 2 selections before this format change';end if;
   if m.id is null then
    insert into club_selection_private.fixtures(id,club_id,details,slots,updated_by)
    values(fid,c,p_data->'details',(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,11)),me);
   else
    update club_selection_private.fixtures set details=p_data->'details',revision=revision+1,updated_by=me,updated_at=now() where id=fid;
   end if;
   res:=jsonb_build_object('saved',true,'id',fid,'revision',(select revision from club_selection_private.fixtures where id=fid));
  elsif p_action='save_board' then
   if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or jsonb_array_length(p_data->'fixtures') not between 1 and 30 then raise exception 'Save 1 to 30 teams together';end if;
   ids:='{}';
   for row in select * from jsonb_array_elements(p_data->'fixtures') loop
    fid:=coalesce(nullif(row->>'id','')::uuid,gen_random_uuid());
    if fid=any(ids) then raise exception 'Duplicate fixture';end if;ids:=array_append(ids,fid);
    select * into m from club_selection_private.fixtures where id=fid;
    if found and m.club_id<>c then raise exception 'Fixture belongs to another club';end if;
    if coalesce(m.revision,0)<>coalesce((row->>'revision')::int,-1) then raise exception 'A team changed in another session. Reload before saving';end if;
    if not club_selection_private.selection_edit(c,row->'details',me) then raise exception 'Edit access to the target Selection Group is required';end if;
    perform club_selection_private.validate_details(row->'details');
    uid:=nullif(row->'details'->>'captain_id','')::uuid;
    if uid is not null and not club_selection_private.member(c,uid) then raise exception 'Choose a captain from this club';end if;
    uid:=nullif(row->'details'->>'grade_group_id','')::uuid;
    if uid is not null and (not exists(select 1 from public.playing_groups where id=uid and club_id=c and active)) then raise exception 'Choose an active Playing Group from this club';end if;
    for v in select jsonb_array_elements_text(coalesce(row->'details'->'staff','[]')) loop if not club_selection_private.member(c,v::uuid) then raise exception 'Choose staff from this club';end if;end loop;
    if jsonb_typeof(row->'slots') is distinct from 'array' or jsonb_array_length(row->'slots') not between 11 and 100 then raise exception 'Draft teams need 11 to 100 selection slots';end if;
    for s in select * from jsonb_array_elements(row->'slots') loop
     if jsonb_typeof(s) is distinct from 'object' then raise exception 'Invalid selection slot';end if;
     for v in select unnest(array[nullif(s->>'d1',''),nullif(s->>'d2','')]) loop
      if v is not null and not exists(select 1 from club_selection_private.roster where id=v::uuid and club_id=c and active) then raise exception 'Choose an active player from this club playing list';end if;
     end loop;
     if jsonb_array_length(row->'details'->'days')=1 and nullif(s->>'d2','') is not null then raise exception 'One-day fixtures have no Day 2 player';end if;
     if jsonb_array_length(row->'details'->'days')=2 and not coalesce((row->'details'->>'brackets')::boolean,false) and (s->>'d1') is distinct from (s->>'d2') then raise exception 'Enable bracketing for this grade before splitting a slot';end if;
    end loop;
    -- Keep existing drafts reviewable after a withdrawal; every new assignment requires a marked date.
    if not coalesce((row->'details'->>'cancelled')::boolean,false) then
     for x in select jsonb_build_object('day',day,'player',slot->>('d'||idx::text))
      from jsonb_array_elements(row->'details'->'days') with ordinality days(day,idx),jsonb_array_elements(row->'slots') slot
      where nullif(slot->>('d'||idx::text),'') is not null loop
      pid:=(x->>'player')::uuid;
      if club_selection_private.day_status(pid,x->'day')<>'available' and not exists(
       select 1 from jsonb_array_elements(m.details->'days') with ordinality days(day,idx),jsonb_array_elements(m.slots) slot
       where day->>'date'=x->'day'->>'date' and slot->>('d'||idx::text)=pid::text
      ) then raise exception 'Mark availability before selecting % on %',(select name from club_selection_private.roster where id=pid),x->'day'->>'date';end if;
     end loop;
    end if;
    if m.details ? 'match_roles' and not (row->'details' ? 'match_roles') then raise exception 'Reload the updated app before changing match appointments';end if;
    if row->'details' ? 'match_roles' then row:=jsonb_set(row,'{details}',club_selection_private.match_details(c,row->'details',row->'slots'));end if;
    insert into club_selection_private.fixtures(id,club_id,details,slots,updated_by) values(fid,c,row->'details',row->'slots',me)
    on conflict(id) do update set details=excluded.details,slots=excluded.slots,revision=club_selection_private.fixtures.revision+1,updated_by=me,updated_at=now();
   end loop;
   -- Check the final batch, so a confirmed transfer/swap can vacate the old place atomically.
   -- Compare actual dates and match windows, including Day 2 and legacy duplicate-name records.
   for x in
    with picks as (
     select fx.id fixture_id,fx.details,ad.day,ad.n day_number,ps.position,rp.name,club_selection_private.account_name_key(rp.name) name_key
     from club_selection_private.fixtures fx
     cross join lateral jsonb_array_elements(fx.details->'days') with ordinality ad(day,n)
     cross join lateral jsonb_array_elements(fx.slots) with ordinality ps(slot,position)
     join club_selection_private.roster rp on rp.club_id=c and rp.id=nullif(ps.slot->>('d'||ad.n::text),'')::uuid
     where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)
    )
    select jsonb_build_object('name',first_pick.name,'date',first_pick.day->>'date','first_grade',first_pick.details->>'grade','first_time',coalesce(nullif(first_pick.day->>'start',''),'time not set'),'second_grade',second_pick.details->>'grade','second_time',coalesce(nullif(second_pick.day->>'start',''),'time not set'))
    from picks first_pick join picks second_pick on first_pick.name_key=second_pick.name_key and first_pick.day->>'date'=second_pick.day->>'date'
     and (first_pick.fixture_id,first_pick.day_number,first_pick.position)<(second_pick.fixture_id,second_pick.day_number,second_pick.position)
    where (first_pick.fixture_id=any(ids) or second_pick.fixture_id=any(ids)) and club_selection_private.fixture_day_conflict(first_pick.details,first_pick.day,second_pick.details,second_pick.day)
    order by first_pick.day->>'date',first_pick.name,first_pick.fixture_id,first_pick.day_number,first_pick.position
    limit 1
   loop
    raise exception '% is already selected in overlapping games on % (% at % and % at %). Change the player or fixture time.',x->>'name',x->>'date',x->>'first_grade',x->>'first_time',x->>'second_grade',x->>'second_time';
   end loop;
   res:=jsonb_build_object('saved',true,'ids',ids,'revisions',(select jsonb_object_agg(f.id::text,f.revision) from club_selection_private.fixtures f where f.id=any(ids)));
  else
   if not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
   ids:=array(select distinct jsonb_array_elements_text(p_data->'ids')::uuid);
   if coalesce(array_length(ids,1),0) not between 1 and 30 then raise exception 'Choose teams to publish';end if;
   -- Check the final batch, so a confirmed transfer/swap can vacate the old place atomically.
   -- Compare actual dates and match windows, including Day 2 and legacy duplicate-name records.
   for x in
    with picks as (
     select fx.id fixture_id,fx.details,ad.day,ad.n day_number,ps.position,rp.name,club_selection_private.account_name_key(rp.name) name_key
     from club_selection_private.fixtures fx
     cross join lateral jsonb_array_elements(fx.details->'days') with ordinality ad(day,n)
     cross join lateral jsonb_array_elements(fx.slots) with ordinality ps(slot,position)
     join club_selection_private.roster rp on rp.club_id=c and rp.id=nullif(ps.slot->>('d'||ad.n::text),'')::uuid
     where fx.club_id=c and not coalesce((fx.details->>'cancelled')::boolean,false)
    )
    select jsonb_build_object('name',first_pick.name,'date',first_pick.day->>'date','first_grade',first_pick.details->>'grade','first_time',coalesce(nullif(first_pick.day->>'start',''),'time not set'),'second_grade',second_pick.details->>'grade','second_time',coalesce(nullif(second_pick.day->>'start',''),'time not set'))
    from picks first_pick join picks second_pick on first_pick.name_key=second_pick.name_key and first_pick.day->>'date'=second_pick.day->>'date'
     and (first_pick.fixture_id,first_pick.day_number,first_pick.position)<(second_pick.fixture_id,second_pick.day_number,second_pick.position)
    where (first_pick.fixture_id=any(ids) or second_pick.fixture_id=any(ids)) and club_selection_private.fixture_day_conflict(first_pick.details,first_pick.day,second_pick.details,second_pick.day)
    order by first_pick.day->>'date',first_pick.name,first_pick.fixture_id,first_pick.day_number,first_pick.position
    limit 1
   loop
    raise exception '% is already selected in overlapping games on % (% at % and % at %). Change the player or fixture time.',x->>'name',x->>'date',x->>'first_grade',x->>'first_time',x->>'second_grade',x->>'second_time';
   end loop;
   -- Every changed team is checked first. Cross-grade moves publish atomically.
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;
    if not found then raise exception 'Unknown fixture';end if;
    if m.revision<>coalesce((p_data->'revisions'->>fid::text)::int,-1) then raise exception 'Draft changed. Review the latest team before publishing';end if;
    if not coalesce((m.details->>'cancelled')::boolean,false) then
     notes:=club_selection_private.issues(fid);
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='error') then raise exception 'Fix selection or availability issues before publishing' using detail=notes::text;end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='short_team')
      and not coalesce(p_data->'acknowledge_short' ? fid::text,false) then raise exception 'Confirm publishing this team with vacant places';end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='warning' and n->>'code' is distinct from 'short_team') and not coalesce((p_data->>'acknowledge_balance')::boolean,false) then raise exception 'Review and acknowledge the balance warnings before publishing';end if;
     if exists(select 1 from club_selection_private.fixtures other,jsonb_array_elements(other.published->'details'->'days') with ordinality od(day,j),jsonb_array_elements(other.published->'slots') os,jsonb_array_elements(m.details->'days') with ordinality md(day,j),jsonb_array_elements(m.slots) ms
       where other.club_id=c and other.id<>all(ids) and not coalesce((other.published->'details'->>'cancelled')::boolean,false) and nullif(ms->>('d'||md.j::text),'')=os->>('d'||od.j::text)
       and club_selection_private.fixture_day_conflict(m.details,md.day,other.published->'details',od.day)) then raise exception 'A player is still published in an overlapping game. Include both changed teams in this publication';end if;
    end if;
   end loop;
   for fid in select unnest(ids) loop
    select * into m from club_selection_private.fixtures where id=fid and club_id=c;old:=m.published;
    res:=club_selection_private.draft_snapshot(fid);
    if res=old then continue;end if;
    update club_selection_private.fixtures set published=res,publication=publication+1,published_at=now(),selection_unlocked_until=null,selection_unlocked_by=null where id=fid;
    insert into club_selection_private.publications values(fid,m.publication+1,res,now(),me);
    publication_changes:=publication_changes||jsonb_build_array(jsonb_build_object('fixture_id',fid,'old_snapshot',old));
   end loop;
   changed:=changed+club_selection_private.notify_publication_batch(c,publication_changes);
   res:=jsonb_build_object('published',true,'recipients',changed,'groups',club_selection_private.sync_publication_groups(c,ids));
  end if;
 else raise exception 'Unknown Selections action';end if;
 end if;
 if p_action in ('save_board','save_fixture','fixture_defaults','publish','selectors','publication_delegate','fixture_lock') then
  changed:=club_selection_private.sync_republication_alerts(c);
  res:=res||jsonb_build_object('republication_alerts',changed);
 end if;
 insert into club_selection_private.requests values(c,me,rid,p_action,p_data,res,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,p_action,jsonb_build_object('request_id',rid,'result',res));
 return res;
end$function$;
