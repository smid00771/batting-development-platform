-- Current production function bodies, with no club data, for migration regression tests.
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
 if p_action in ('save_board','publish','send_review','history') and not sel and not (adm and p_action in ('publish','history')) then raise exception 'Selector access required';end if;
 if p_action='publish' and not adm and not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
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
   if club_selection_private.scoped_selections(c) and not (adm and p_action='publish') and (not club_selection_private.selection_edit(c,m.details,me) or (p_action='publish' and club_selection_private.fixture_publisher(c,m.details) is distinct from me)) then raise exception 'This Selection Group requires its editor or publishing Head Selector';end if;
   perform club_selection_private.assert_selection_open(m.details,acc.timezone,m.selection_unlocked_until);
   if m.published is not null and not coalesce(m.selection_unlocked_until>now(),false) then
    raise exception 'Published team is locked. The Head of Selections must unlock it before changes';
   end if;
  end loop;
 end if;
 -- Access and context reads must not acquire the player-sync advisory lock.
 -- Explicit signup, imports and account-link operations retain their sync paths.
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
  return jsonb_build_object('access',to_jsonb(acc),'selector',sel,'admin',adm,'captain',cap,'can_view_board',adm or sel or cap,'roster_revision',acc.roster_revision,'availability_mode','opt_in','can_view_club_availability',adm or sel or cap,'head_selector',exists(select 1 from club_selection_private.selection_groups sg where sg.club_id=c and club_selection_private.selection_group_head(c,sg.id)=me) or (sel and club_selection_private.publication_head(c)=me),'selection_editor',club_selection_private.selection_editor(c,me),'group_permissions_enabled',club_selection_private.scoped_selections(c),
  'availability_dates',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('date',ds.match_date,'bulk_saved_at',ds.bulk_saved_at,'updated_at',ds.updated_at) order by ds.match_date desc) from club_selection_private.availability_date_setups ds where ds.club_id=c),'[]') else '[]'::jsonb end,
  'publication_head_id',club_selection_private.publication_head(c),
  'conversations',club_selection_private.saved_drop_context(c,me),
  'can_delegate',adm or acc.head_selector_id=me,
  'can_hand_back',adm or acc.head_selector_id=me or acc.publication_delegate_id=me,
  'reviews',case when p_data->>'review_snapshots'='false' and (sel or cap) then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'snapshot',club_selection_private.draft_snapshot(f.id)||jsonb_build_object('draft_revision',f.revision),'sent_at',coalesce(f.review_requested_at,f.updated_at),
   'draft_changed',false,
   'captain_name',club_selection_private.match_captain_names(c,f.details)) order by f.review->'details'->'days'->0->>'date',f.review->'details'->>'grade')
   from club_selection_private.fixtures f where f.club_id=c and club_selection_private.review_audience(f.id,me)),'[]'::jsonb) end,
  'group_links',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(to_jsonb(g)) from club_selection_private.group_links g where club_id=c),'[]') else '[]'::jsonb end,
  'groups',case when (adm or sel) then coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'captain_user_ids',club_selection_private.season_captains(c,g.id),'captain_roster_ids',club_selection_private.season_captain_roster_ids(c,g.id),'captain_name',club_selection_private.season_captain_name(c,g.id))) from public.playing_groups g where club_id=c and active),'[]') else '[]'::jsonb end,
  'batting_users',case when (adm or sel) and acc.mode='bundle' then coalesce((select jsonb_agg(p.user_id) from public.players p where club_id=c and active),'[]') else '[]'::jsonb end,
  'roster',coalesce((select jsonb_agg((case when adm or sel then to_jsonb(p) when p.user_id=me then to_jsonb(p)-'account_email'-'auto_link_disabled' else jsonb_build_object('id',p.id,'name',p.name,'grade',p.grade,'active',p.active,'user_id',null,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'spin_style',p.spin_style,'keeper',p.keeper,'fielding',p.fielding) end)||jsonb_build_object('availability',coalesce(to_jsonb(av)-'checked_by',jsonb_build_object('revision',0,'usual_available',false,'blocks','[]'::jsonb,'available_dates','[]'::jsonb)))) from club_selection_private.roster p left join club_selection_private.availability av on av.roster_id=p.id where p.club_id=c and (adm or sel or cap or p.user_id=me)),'[]'::jsonb),
  'members',case when adm or sel then coalesce((select jsonb_agg(jsonb_build_object('user_id',cm.user_id,'name',coalesce(up.display_name,'Club member'),'email',u.email,'selector',club_selection_private.selection_viewer(c,cm.user_id),'is_admin',cm.permission_role='admin','explicit_selector',exists(select 1 from club_selection_private.selectors sx where sx.club_id=c and sx.user_id=cm.user_id))) from public.club_memberships cm left join public.user_profiles up on up.user_id=cm.user_id left join auth.users u on u.id=cm.user_id where cm.club_id=c),'[]') else '[]'::jsonb end,
  'fixtures',coalesce((select jsonb_agg((case when adm or club_selection_private.selection_view(c,f.details,me) then to_jsonb(f)||jsonb_build_object('can_comment',club_selection_private.review_audience(f.id,me),'comment_count',(select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id),'issues','[]'::jsonb,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp())) else jsonb_build_object('id',f.id,'published',f.published,'publication',f.publication,'published_at',f.published_at,'can_comment',club_selection_private.review_audience(f.id,me),'comment_count',case when club_selection_private.review_audience(f.id,me) then (select count(*) from club_selection_private.review_posts rp where rp.fixture_id=f.id) else 0 end,'can_chat',club_selection_private.audience(f.id,me),'chat_closed',club_selection_private.fixture_completed(f.published->'details',acc.timezone,clock_timestamp()))||case when (not club_selection_private.scoped_selections(c) and (adm or cap)) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('details',f.details,'revision',f.revision,'selection_unlocked_until',f.selection_unlocked_until) else '{}'::jsonb end||case when (not club_selection_private.scoped_selections(c) and cap) or club_selection_private.fixture_captain(c,f.details,me) then jsonb_build_object('slots',f.slots,'scorecard_sync',f.scorecard_sync) else '{}'::jsonb end end)||jsonb_build_object('can_edit',club_selection_private.selection_edit(c,f.details,me),'can_publish',adm or club_selection_private.fixture_publisher(c,f.details)=me,'can_unlock',adm or case when club_selection_private.scoped_selections(c) then club_selection_private.fixture_publisher(c,f.details)=me else acc.head_selector_id=me or club_selection_private.publication_head(c)=me end,'can_post_match',club_selection_private.match_contributor(f.id,me),'can_post_comment',club_selection_private.selection_edit(c,f.details,me) or club_selection_private.fixture_captain(c,f.details,me),'group_head_id',club_selection_private.fixture_publisher(c,f.details)) order by f.details->'days'->0->>'date',f.details->>'grade') from club_selection_private.fixtures f where f.club_id=c and (adm or (not club_selection_private.scoped_selections(c) and (sel or cap)) or club_selection_private.fixture_view(c,f.details,me) or f.published is not null)),'[]'::jsonb));
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
 elsif p_action='show_dropped' then
  if jsonb_typeof(p_data->'ids') is distinct from 'array' then raise exception 'Choose teams to check';end if;
  res:=club_selection_private.capture_drop_reminders(c,me,array(select jsonb_array_elements_text(p_data->'ids')::uuid));
 elsif p_action='conversation' then
  fid:=nullif(p_data->>'fixture_id','')::uuid;pid:=nullif(p_data->>'roster_id','')::uuid;
  select item into x from jsonb_array_elements(club_selection_private.saved_drop_context(c,me,true)) item
   where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  if x is null then
   select item into x from jsonb_array_elements(club_selection_private.conversation_context(c,me)) item
    where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  end if;
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
   if jsonb_typeof(x->'competition') is distinct from 'string' or length(btrim(coalesce(x->>'competition',''))) not between 0 and 120 or length(btrim(coalesce(x->>'grade',''))) not between 1 and 120
    or coalesce(x->>'level','')!~'^[1-9][0-9]?$' then raise exception 'Use a grade and level from 1 to 99; competition may be blank';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_data->'rows') levels(value) group by lower(btrim(levels.value->>'competition')),lower(btrim(levels.value->>'grade')) having count(*)>1) then raise exception 'Use one level per grade and competition';end if;
  update club_selection_private.access set grade_levels=p_data->'rows',revision=revision+1,updated_by=me,updated_at=now() where club_id=c;
  res:=jsonb_build_object('saved',true);
 elsif p_action='fixture_lock' then
  fid:=nullif(p_data->>'id','')::uuid;
  select * into m from club_selection_private.fixtures where club_id=c and id=fid for update;
  if not found then raise exception 'Unknown fixture';end if;
  if m.revision<>coalesce((p_data->>'revision')::int,-1) then raise exception 'Fixture changed. Reload before changing its lock';end if;
  if jsonb_typeof(p_data->'unlock') is distinct from 'boolean' then raise exception 'Choose whether to unlock or lock the fixture';end if;
  if not adm and club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,m.details,me) then raise exception 'Edit access to this Selection Group is required';end if;
  if not adm and m.published is not null and ((club_selection_private.scoped_selections(c) and club_selection_private.fixture_publisher(c,m.details) is distinct from me) or (not club_selection_private.scoped_selections(c) and me is distinct from acc.head_selector_id and me is distinct from club_selection_private.publication_head(c))) then
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
  -- Omitted scope retains old clients' whole-club workflow. A supplied scope is exact.
  if p_data ? 'scope_ids' then
   if jsonb_typeof(p_data->'scope_ids') is distinct from 'array' then raise exception 'Choose players for this date';end if;
   ids:=array(select jsonb_array_elements_text(p_data->'scope_ids')::uuid);
   if cardinality(ids) not between 1 and 2000 or cardinality(ids)<>(select count(distinct id) from unnest(ids) id)
    or cardinality(ids)<>(select count(*) from club_selection_private.roster where club_id=c and active and id=any(ids)) then
    raise exception 'Choose active players from this club playing list';end if;
   if exists(select 1 from jsonb_array_elements_text((p_data->'unavailable_ids')||coalesce(p_data->'available_ids','[]')) p where not p_data->'scope_ids' ? p.value) then
    raise exception 'Availability choices must belong to the selected players';end if;
  end if;
  ids:='{}';data_limit:=0;
  for r in select * from club_selection_private.roster where club_id=c and active
   and (not p_data ? 'scope_ids' or p_data->'scope_ids' ? id::text) order by id loop
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
      raise exception 'Fit the team into % slots before sending to captains',club_selection_private.normal_player_limit(c,m.details) using detail=notes::text;
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

    if p_action='save_roster' then
     if row ? 'spin_style' and (jsonb_typeof(row->'spin_style') is distinct from 'string'
      or row->>'spin_style' not in ('unknown','off_spin','left_arm_orthodox','leg_spin','left_arm_wrist')) then
      raise exception 'Choose a valid spin type';
     end if;
     update club_selection_private.roster set spin_style=case
      when bowling<>'spin' then 'unknown'
      when row ? 'spin_style' then row->>'spin_style'
      else spin_style end
      where id=pid and club_id=c;
    end if;

    if p_action='save_roster' and row ? 'fielding' then
     if jsonb_typeof(row->'fielding') is distinct from 'string'
      or row->>'fielding' not in ('unknown','needs_work','reliable','strong') then
      raise exception 'Choose a valid fielding rating';
     end if;
     update club_selection_private.roster set fielding=row->>'fielding',updated_at=now()
      where id=pid and club_id=c;
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
   if not adm and not club_selection_private.scoped_selections(c) and club_selection_private.publication_head(c) is distinct from me then raise exception 'Only the current Head of Selections or Acting Head can publish to players';end if;
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
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='twelve_team')
      and (jsonb_typeof(p_data->'acknowledge_twelve') is distinct from 'array'
       or not coalesce(p_data->'acknowledge_twelve' ? fid::text,false)) then
      raise exception 'Confirm publishing this team with 12 players';
     end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='short_team')
      and not coalesce(p_data->'acknowledge_short' ? fid::text,false) then raise exception 'Confirm publishing this team with vacant places';end if;
     if exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='warning' and n->>'code' is distinct from 'short_team' and n->>'code' is distinct from 'missing_keeper' and n->>'code' is distinct from 'twelve_team') and not coalesce((p_data->>'acknowledge_balance')::boolean,false) then raise exception 'Review and acknowledge the balance warnings before publishing';end if;
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
end$function$
;

CREATE OR REPLACE FUNCTION club_selection_private.import_player(c uuid, item jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r club_selection_private.roster%rowtype; key text; email text; name_key text; matches integer;
begin
 key:=nullif(btrim(item->>'external_id'),'');email:=nullif(lower(btrim(item->>'account_email')),'');
 name_key:=club_selection_private.account_name_key(item->>'name');
 if key is null or length(key)>120 then raise exception 'Every imported row needs a stable registration ID';end if;
 if name_key='' then raise exception 'Every imported row needs a name';end if;
 select * into r from club_selection_private.roster where club_id=c and external_id=key;
 if r.id is null then
  select count(*) into matches from club_selection_private.roster where club_id=c
   and club_selection_private.account_name_key(name)=name_key;
  if matches>1 then raise exception '% has more than one possible match. Check the playing list before importing.',btrim(item->>'name');end if;
  if matches=1 then
   select * into r from club_selection_private.roster where club_id=c and club_selection_private.account_name_key(name)=name_key;
   if r.external_id is not null or (email is not null and r.account_email is not null and email<>r.account_email) then
    raise exception '% has different registration details. Check the existing player before importing.',btrim(item->>'name');end if;
  elsif email is not null and exists(select 1 from club_selection_private.roster where club_id=c and account_email=email and external_id is null and user_id is not null) then
   raise exception '% shares an email with another playing-list entry. Check the name before importing.',btrim(item->>'name');
  end if;
 end if;
 if (r.id is null or club_selection_private.account_name_key(r.name)<>name_key)
  and exists(select 1 from club_selection_private.roster where club_id=c and id is distinct from r.id and club_selection_private.account_name_key(name)=name_key) then
  raise exception '% is already on the playing list. Check the existing player.',btrim(item->>'name');end if;
 if r.id is null then
  insert into club_selection_private.roster(club_id,external_id,name,grade,account_email)
  values(c,key,btrim(item->>'name'),coalesce(item->>'grade',''),email) returning id into r.id;
 else
  update club_selection_private.roster set external_id=key,name=btrim(item->>'name'),
   grade=coalesce(item->>'grade',grade),account_email=coalesce(email,account_email),updated_at=now() where id=r.id;
 end if;
 return r.id;
end$function$
;

CREATE OR REPLACE FUNCTION club_batting_private.consolidate_scorecard_roster(c uuid, old_id uuid, new_id uuid, source_name text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
<<merge_state>>
declare original club_selection_private.roster%rowtype;canonical club_selection_private.roster%rowtype;
 a club_selection_private.availability%rowtype;b club_selection_private.availability%rowtype;
 f club_selection_private.fixtures%rowtype;published jsonb;sync jsonb;slots jsonb;details jsonb;unavailable jsonb;available jsonb;
begin
 select * into original from club_selection_private.roster where id=old_id and club_id=c for update;
 select * into canonical from club_selection_private.roster where id=new_id and club_id=c for update;
 if original.id is null or canonical.id is null or old_id=new_id
  or original.user_id is not null or nullif(btrim(original.account_email),'') is not null or canonical.user_id is not null
  or exists(select 1 from club_batting_private.roster_players rp join public.players p on p.id=rp.player_id where rp.roster_id=old_id and (rp.claimed_user_id is not null or p.user_id is not null))
  or exists(select 1 from club_batting_private.roster_players where roster_id=new_id)
  then raise exception 'These records have account or player history links that need Club Admin review';end if;
 -- A confirmed identity is not permission to remove a selection from either team.
 if exists(
  select 1 from club_selection_private.fixtures x cross join club_selection_private.fixtures y
  where x.club_id=c and y.club_id=c and not coalesce((x.details->>'cancelled')::boolean,false) and not coalesce((y.details->>'cancelled')::boolean,false)
   and exists(select 1 from jsonb_array_elements(x.details->'days') with ordinality xd(d,n)
    join jsonb_array_elements(y.details->'days') with ordinality yd(d,n) on xd.d->>'date'=yd.d->>'date'
    where exists(select 1 from jsonb_array_elements(x.slots||coalesce(x.published->'slots','[]')) s where s->>('d'||xd.n)=old_id::text)
     and exists(select 1 from jsonb_array_elements(y.slots||coalesce(y.published->'slots','[]')) s where s->>('d'||yd.n)=new_id::text))
 ) then raise exception 'Both name entries are selected on the same date. Resolve that selection before confirming the player';end if;
 select * into a from club_selection_private.availability where roster_id=old_id for update;
 select * into b from club_selection_private.availability where roster_id=new_id for update;
 -- Preserve explicit unavailability from either record; a name confirmation cannot
 -- overturn it or invent availability from a scorecard appearance.
 select coalesce(jsonb_agg(value order by value),'[]') into unavailable from
  (select distinct value from jsonb_array_elements_text(coalesce(a.unavailable_dates,'[]')||coalesce(b.unavailable_dates,'[]'))) d;
 select coalesce(jsonb_agg(value order by value),'[]') into available from
  (select distinct value from jsonb_array_elements_text(coalesce(a.available_dates,'[]')||coalesce(b.available_dates,'[]')) where not unavailable ? value) d;
 if a.roster_id is not null or b.roster_id is not null then
  insert into club_selection_private.availability(roster_id,usual_available,available_dates,unavailable_dates,blocks,checked_by)
   values(new_id,false,available,unavailable,coalesce(a.blocks,'[]')||coalesce(b.blocks,'[]'),auth.uid())
   on conflict(roster_id) do update set usual_available=false,available_dates=excluded.available_dates,unavailable_dates=excluded.unavailable_dates,
    blocks=excluded.blocks,revision=club_selection_private.availability.revision+1,checked_at=now(),checked_by=auth.uid();
 end if;
 update club_selection_private.roster set name=source_name,active=true,
  grade=case when grade='' then original.grade else grade end,
  batting=case when batting='unknown' then original.batting else batting end,
  bowling=case when bowling='unknown' then original.bowling else bowling end,
  bowling_load=case when bowling_load='unknown' then original.bowling_load else bowling_load end,

  spin_style=case when bowling='spin' or (bowling='unknown' and original.bowling='spin') then
   case when spin_style='unknown' and original.bowling='spin' then original.spin_style else spin_style end
   else 'unknown' end,
  keeper=keeper or original.keeper,updated_at=now() where id=new_id;
 update club_batting_private.roster_players set roster_id=new_id where roster_id=old_id and club_id=c;
 -- Retain the saved follow-up, appointments and artwork references as well.
 -- A conflicting unique record aborts the entire confirmation, never discards it.
 update club_selection_private.player_conversations set roster_id=new_id where roster_id=old_id;
 update club_selection_private.season_appointments set captain_roster_id=new_id where captain_roster_id=old_id and club_id=c;
 update club_selection_private.social_assets set roster_id=new_id where roster_id=old_id and club_id=c;
 update club_selection_private.social_features set roster_id=new_id where roster_id=old_id and club_id=c;
 update club_selection_private.social_preparations set roster_id=new_id where roster_id=old_id and club_id=c;
 for f in select * from club_selection_private.fixtures fx where fx.club_id=c and
  exists(select 1 from jsonb_array_elements(fx.slots||coalesce(fx.published->'slots','[]')) s where s->>'d1' in(old_id::text,new_id::text) or s->>'d2' in(old_id::text,new_id::text)) for update loop
  slots:=club_selection_private.scorecard_identity_slots(f.slots,old_id,new_id);
  details:=club_selection_private.scorecard_identity_roles(f.details,old_id,new_id);
  if details->>'captain_id'=old_id::text then details:=jsonb_set(details,'{captain_id}',to_jsonb(new_id));end if;
  published:=f.published;
  if published is not null then
   published:=published||jsonb_build_object('slots',club_selection_private.scorecard_identity_slots(published->'slots',old_id,new_id),
    'details',club_selection_private.scorecard_identity_roles(published->'details',old_id,new_id),
    'players',(select coalesce(jsonb_agg(case when x->>'id' in(old_id::text,new_id::text) then x||jsonb_build_object('id',new_id,'name',source_name,'batting',r.batting,'bowling',r.bowling,'bowling_load',r.bowling_load,'spin_style',r.spin_style,'keeper',r.keeper) else x end order by n),'[]') from jsonb_array_elements(published->'players') with ordinality a(x,n) cross join club_selection_private.roster r where r.id=new_id));
   if published#>>'{details,captain_id}'=old_id::text then published:=jsonb_set(published,'{details,captain_id}',to_jsonb(new_id));end if;
   if published->'scorecard_sync' is not null then published:=jsonb_set(published,'{scorecard_sync,players}',
    (select coalesce(jsonb_agg(case when x->>'roster_id' in(old_id::text,new_id::text) then x||jsonb_build_object('roster_id',new_id,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(published#>'{scorecard_sync,players}') with ordinality a(x,n)));end if;
  end if;
  sync:=f.scorecard_sync;
  if sync is not null then sync:=sync||jsonb_build_object('players',
   (select coalesce(jsonb_agg(case when x->>'roster_id' in(old_id::text,new_id::text) then x||jsonb_build_object('roster_id',new_id,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(sync->'players') with ordinality a(x,n)));end if;
  if slots is distinct from f.slots or details is distinct from f.details or published is distinct from f.published or sync is distinct from f.scorecard_sync then
   if published is distinct from f.published and published is not null then
    insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) values(f.id,f.publication+1,published,auth.uid());
   end if;
   update club_selection_private.fixtures set slots=merge_state.slots,details=merge_state.details,published=merge_state.published,
    scorecard_sync=sync,revision=revision+1,publication=publication+case when merge_state.published is distinct from f.published and merge_state.published is not null then 1 else 0 end,
    updated_at=now(),updated_by=auth.uid() where id=f.id;
  end if;
 end loop;
 update club_selection_private.roster set active=false,auto_link_disabled=true,updated_at=now() where id=old_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_roster_consolidated',
  jsonb_build_object('retired_roster_id',old_id,'active_roster_id',new_id,'previous_name',original.name,'name',source_name,'old_availability',to_jsonb(a),'registration_availability',to_jsonb(b)));
end $function$
;

CREATE OR REPLACE FUNCTION club_batting_private.confirm_scorecard_player(c uuid, request_id uuid, v jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sid uuid:=(v->>'snapshot_id')::uuid;source_id uuid:=(v->>'source_player_id')::uuid;
 pid uuid:=nullif(v->>'player_id','')::uuid;rid uuid:=nullif(v->>'roster_id','')::uuid;fid uuid:=nullif(v->>'fixture_id','')::uuid;
 card jsonb;source_name text;old_name text;source_names integer;linked_pid uuid;linked_rid uuid;other_id uuid;
 r club_selection_private.roster%rowtype;old_r club_selection_private.roster%rowtype;p public.players%rowtype;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;
 snapshot jsonb;v_slots jsonb;v_details jsonb;sync jsonb;result jsonb;repair boolean:=false;needs_team_review boolean:=false;retired_id uuid;
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid())
  or not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Current club membership is required';end if;
 if not (club_batting_private.team_review_staff(c) or club_selection_private.selector(c,auth.uid())
  or club_selection_private.social_allowed_at(c,auth.uid(),now()) or public.is_club_admin(c)) then raise exception 'Coaching, selection or socials access is required';end if;
 if request_id is null or source_id is null or length(v::text)>5000 then raise exception 'A valid player confirmation is required';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into receipt from club_selection_private.requests q where q.club_id=c and q.user_id=auth.uid() and q.request_id=confirm_scorecard_player.request_id;
 if found then
  if receipt.action<>'scorecard_player_identity' or receipt.payload<>v then raise exception 'Request ID already used';end if;
  return receipt.result;
 end if;
 select scorecard into card from public.match_review_scorecards where id=sid and club_id=c;
 if card is null then raise exception 'Scorecard unavailable in this club';end if;
 select count(distinct name),min(name) into source_names,source_name from (
  select x->>'name' name from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') x
   where t->>'id'=v->>'team_id' and x->>'player_id'=source_id::text
  union all select x->>'name' from jsonb_array_elements(card->'innings') i cross join lateral jsonb_array_elements(i->'batters') x
   where i->>'team_id'=v->>'team_id' and x->>'player_id'=source_id::text
 ) names;
 if source_names<>1 or length(btrim(source_name)) not between 1 and 120 then raise exception 'Refresh the scorecard to check this player name';end if;
 if pid is not null then
  select * into p from public.players where id=pid and club_id=c and active for update;
  if p.id is null or not(public.can_edit_player(pid) and public.can_read_coaching_action_player(pid)) then raise exception 'Coaching edit access is required for this player';end if;
  old_name:=p.display_name;
  select roster_id into other_id from club_batting_private.roster_players where club_id=c and player_id=pid;
  if other_id is null and p.user_id is not null then select id into other_id from club_selection_private.roster where club_id=c and user_id=p.user_id and active;end if;
  if rid is not null and rid is distinct from other_id then raise exception 'The player link changed. Reload before confirming';end if;
  rid:=other_id;
 end if;
 if rid is not null then
  select * into r from club_selection_private.roster where id=rid and club_id=c and (active or coalesce((v->>'prefer_registration')::boolean,false) and exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id=source_id)) for update;
  if r.id is null then raise exception 'Choose an active club player';end if;
  old_name:=coalesce(old_name,r.name);
  if pid is null then
   select player_id into pid from club_batting_private.roster_players where club_id=c and roster_id=rid;
   if pid is null and club_batting_private.verified_roster_user(c,r.user_id) then select id into pid from public.players where club_id=c and user_id=r.user_id and active;end if;
   if pid is not null then select * into p from public.players where id=pid and club_id=c and active for update;
    if p.id is null then raise exception 'The linked player is unavailable';end if;
   end if;
  end if;
 end if;
 if pid is null and rid is null then raise exception 'Choose an existing club player';end if;
 if v->>'expected_name' is distinct from old_name then raise exception 'The player name changed. Check the updated name before confirming';end if;
 if card->>'provider'='playhq_au' then
  if fid is null or rid is null then raise exception 'Choose this scorecard’s fixture and club player';end if;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null or card->>'status' is distinct from 'completed' or not exists(select 1 from club_selection_private.fixture_result_sources src where src.club_id=c and src.fixture_id=fid and src.source_match_id=(card->>'match_id')::uuid and src.team_id=(v->>'team_id')::uuid and src.no_play is null)
   or (f.published is not null and club_selection_private.fixture_identity(c,f.details) is distinct from club_selection_private.fixture_identity(c,f.published->'details'))
   or coalesce(f.published->'details',f.details)->>'format' is distinct from card->>'format_key'
   or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(coalesce(f.published->'details',f.details)->'days') day) is distinct from card->'dates'
   then raise exception 'Confirm this player against the fixture for this completed scorecard';end if;
  -- A selection-only team can share existing grade players without enabling coaching.
  if exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.source_player_id=source_id and l.roster_id<>rid)
   or exists(select 1 from club_selection_private.scorecard_roster_links l where l.club_id=c and l.roster_id=rid and l.source_player_id<>source_id and exists(select 1 from jsonb_array_elements(card->'teams') t cross join lateral jsonb_array_elements(t->'players') person where person->>'player_id'=l.source_player_id::text))
   then raise exception 'This match already has a different player link. Ask Club Admin to review it';end if;
  -- The explicit identity confirmation adopts the trusted source spelling.
  -- Keep account identities and all score/coaching IDs; opted-out teams do not write Batting.
  update club_selection_private.roster set name=source_name,updated_at=now() where id=rid and club_id=c and name is distinct from source_name;
  if pid is not null and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.details)) then
   update public.players set display_name=source_name where id=pid and club_id=c and display_name is distinct from source_name;
  end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,source_id,rid,auth.uid()) on conflict(club_id,source_player_id) do nothing;
  result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',source_name);
  insert into club_selection_private.requests values(c,auth.uid(),request_id,'scorecard_player_identity',v,result,now());
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_match_player_identity',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'source_player_id',source_id,'roster_id',rid,'player_id',pid,'previous_name',old_name,'name',source_name));
  perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,(v->>'team_id')::uuid,auth.uid());
  return result;
 end if;
 select player_id into linked_pid from public.match_review_player_links where club_id=c and source_player_id=source_id;
 if linked_pid is not null and linked_pid is distinct from pid then raise exception 'This PlayCricket identity already has a different player history. Ask Club Admin to review the links';end if;
 if pid is not null and exists(select 1 from public.match_review_player_links where club_id=c and player_id=pid and source_player_id<>source_id) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
 if rid is not null and exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and roster_id=rid and source_player_id<>source_id) then raise exception 'This club player already has a different PlayCricket identity. Ask Club Admin to review the links';end if;
 select roster_id into linked_rid from club_selection_private.scorecard_roster_links where club_id=c and source_player_id=source_id;
 if linked_rid is null then select id into linked_rid from club_selection_private.roster where club_id=c and lower(external_id)=source_id::text;end if;
 if linked_rid is not null and linked_rid is distinct from rid then
  select * into old_r from club_selection_private.roster where id=linked_rid and club_id=c for update;
  if coalesce((v->>'prefer_registration')::boolean,false) and r.id is not null
   and r.user_id is null and nullif(btrim(r.account_email),'') is null and p.user_id is null
   and old_r.user_id is null and not exists(select 1 from club_batting_private.roster_players where roster_id=old_r.id)
   and not exists(select 1 from club_batting_private.roster_players where roster_id=r.id and claimed_user_id is not null)
   and not exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and roster_id=old_r.id and source_player_id<>source_id) then
   perform club_batting_private.consolidate_scorecard_roster(c,r.id,old_r.id,source_name);
   retired_id:=r.id;rid:=old_r.id;r:=old_r;old_r:=null;
  else
  -- Explicit same-person confirmation may connect an existing playing-list row too.
  -- Its origin/UUID does not establish a separate identity; accounts and batting
  -- histories do. Preserve those boundaries, including pending invitations.
  if old_r.id is null or old_r.user_id is not null or nullif(btrim(old_r.account_email),'') is not null
   or exists(select 1 from club_batting_private.roster_players where roster_id=old_r.id)
   or exists(select 1 from club_selection_private.scorecard_roster_links where club_id=c and roster_id=old_r.id and source_player_id<>source_id)
   then raise exception 'This PlayCricket identity is linked to another club record. Ask Club Admin to review the links';end if;
  if rid is null and pid is not null then
   -- The chosen batting record has no Teams identity yet. Attach the unlinked
   -- playing-list record to that existing player, without creating another batting record.
   rid:=old_r.id;r:=old_r;old_r:=null;
   if club_batting_private.verified_roster_user(c,p.user_id) then
    update club_selection_private.roster set user_id=p.user_id where id=rid;r.user_id:=p.user_id;
   end if;
  end if;
  end if;
 end if;
 if pid is not null and rid is not null and not exists(select 1 from club_batting_private.roster_players where roster_id=rid) then
  if exists(select 1 from club_batting_private.roster_players where player_id=pid) then raise exception 'The player already has another Teams identity. Reload before confirming';end if;
  insert into club_batting_private.roster_players(roster_id,club_id,player_id,claimed_user_id,claimed_at)
   values(rid,c,pid,case when p.user_id=r.user_id and club_batting_private.verified_roster_user(c,p.user_id) then p.user_id end,case when p.user_id=r.user_id and club_batting_private.verified_roster_user(c,p.user_id) then now() end);
 end if;
 if pid is not null then
  update public.players set display_name=source_name where id=pid and club_id=c;
  insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by)
   values(c,source_id,pid,auth.uid()) on conflict(club_id,source_player_id) do update set confirmed_by=excluded.confirmed_by,updated_at=now();
 end if;
 if rid is not null then
  update club_selection_private.roster set name=source_name,active=true,updated_at=now() where id=rid and club_id=c;
  update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by)
   values(c,source_id,rid,auth.uid()) on conflict(club_id,source_player_id) do update set roster_id=excluded.roster_id,confirmed_by=excluded.confirmed_by,updated_at=now();
 end if;
 if fid is not null and rid is not null then
  select * into f from club_selection_private.fixtures where id=fid and club_id=c for update;
  if f.id is null or (select jsonb_agg(d->>'date' order by d->>'date') from jsonb_array_elements(f.details->'days') d) is distinct from card->'dates'
   or (f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>card->>'match_id') then raise exception 'The fixture changed. Reload before confirming this player';end if;
  if old_r.id is not null then
   needs_team_review:=exists(select 1 from club_selection_private.fixtures other where other.club_id=c and other.id<>fid and not coalesce((other.details->>'cancelled')::boolean,false)
    and exists(select 1 from jsonb_array_elements(other.details->'days') d where card->'dates' ? (d->>'date'))
    and exists(select 1 from jsonb_array_elements(other.slots||coalesce(other.published->'slots','[]')) s where s->>'d1'=rid::text or s->>'d2'=rid::text))
    or exists(select 1 from jsonb_array_elements(f.slots||coalesce(f.published->'slots','[]')) s where s->>'d1'=rid::text or s->>'d2'=rid::text);
  end if;
  repair:=not needs_team_review and exists(select 1 from jsonb_array_elements(f.slots||coalesce(f.published->'slots','[]')) s
   where s->>'d1'=coalesce(old_r.id,rid)::text or s->>'d2'=coalesce(old_r.id,rid)::text);
  if repair and retired_id is null then
   v_slots:=club_selection_private.scorecard_identity_slots(f.slots,old_r.id,rid);v_details:=club_selection_private.scorecard_identity_roles(f.details,old_r.id,rid);
   snapshot:=f.published;
   if snapshot is not null then
    snapshot:=snapshot||jsonb_build_object('slots',club_selection_private.scorecard_identity_slots(snapshot->'slots',old_r.id,rid),
     'details',club_selection_private.scorecard_identity_roles(snapshot->'details',old_r.id,rid),
     'players',(select coalesce(jsonb_agg(case when x->>'id'=coalesce(old_r.id,rid)::text then x||jsonb_build_object('id',rid,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(snapshot->'players') with ordinality a(x,n)));
    if snapshot->'scorecard_sync' is not null then
     snapshot:=jsonb_set(snapshot,'{scorecard_sync,players}',(select coalesce(jsonb_agg(case when x->>'source_id'=source_id::text then x||jsonb_build_object('roster_id',rid,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(snapshot#>'{scorecard_sync,players}') with ordinality a(x,n)));
    end if;
    insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) values(fid,f.publication+1,snapshot,auth.uid());
   end if;
   sync:=f.scorecard_sync;
   if sync is not null then sync:=sync||jsonb_build_object('players',(select coalesce(jsonb_agg(case when x->>'source_id'=source_id::text then x||jsonb_build_object('roster_id',rid,'name',source_name) else x end order by n),'[]') from jsonb_array_elements(sync->'players') with ordinality a(x,n)));end if;
   update club_selection_private.fixtures set slots=v_slots,details=v_details,published=snapshot,scorecard_sync=sync,
    revision=revision+1,publication=publication+case when snapshot is null then 0 else 1 end,updated_at=now(),updated_by=auth.uid() where id=fid;
   if pid is not null then update club_batting_private.fixture_review_rosters set player_ids=array(select distinct unnest(player_ids||array[pid])),revision=revision+1,updated_at=now(),updated_by=auth.uid() where club_id=c and fixture_id=fid;end if;
  end if;
 end if;
 if old_r.id is not null and not exists(select 1 from club_selection_private.fixtures fx cross join lateral jsonb_array_elements(fx.slots||coalesce(fx.published->'slots','[]')) s where fx.club_id=c and (s->>'d1'=old_r.id::text or s->>'d2'=old_r.id::text)) then
  update club_selection_private.roster set active=false,updated_at=now() where id=old_r.id;
 end if;
 result:=jsonb_build_object('confirmed',true,'source_player_id',source_id,'player_id',pid,'roster_id',rid,'name',source_name,'fixture_repaired',repair or retired_id is not null,'needs_team_review',needs_team_review,'retired_roster_id',retired_id);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'scorecard_player_identity',result||jsonb_build_object('previous_name',old_name,'previous_roster_id',old_r.id,'snapshot_id',sid));
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,auth.uid(),request_id,'scorecard_player_identity',v,result);
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION club_selection_private.link_selected_scorecard_players(c uuid, sid uuid, fid uuid, tid uuid, actor uuid, apply_links boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
<<link_state>>
declare
 card jsonb; team jsonb; f club_selection_private.fixtures%rowtype; d jsonb; picks jsonb;
 person jsonb; rid uuid; pid uuid; source_id uuid; name_key text; candidates uuid[];
 linked jsonb:='[]'; changed integer:=0; added integer; club_timezone text;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
  or not club_selection_private.fixtures_enabled(c) then return '[]'::jsonb;end if;
 if apply_links then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 select s.scorecard into card from public.match_review_scorecards s where s.id=sid and s.club_id=c;
 select * into f from club_selection_private.fixtures x where x.id=fid and x.club_id=c;
 if card is null or f.id is null or card->>'status'<>'completed' then return '[]'::jsonb;end if;
 if exists(select 1 from public.match_review_scorecards newer join public.match_review_scorecards original on original.id=sid
  where newer.club_id=c and newer.source_match_id=original.source_match_id and (newer.created_at,newer.id)>(original.created_at,original.id)) then return '[]'::jsonb;end if;
 d:=coalesce(f.published->'details',f.details);picks:=coalesce(f.published->'slots',f.slots);
 select a.timezone into club_timezone from club_selection_private.access a where a.club_id=c;
 if exists(select 1 from jsonb_array_elements_text(card->'dates') day where day::date>(now() at time zone coalesce(club_timezone,'Australia/Sydney'))::date)
  or coalesce((d->>'cancelled')::boolean,false) or d->>'format' is distinct from card->>'format_key'
  or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(d->'days') day) is distinct from card->'dates'
  or not exists(select 1 from club_selection_private.fixture_result_sources s where s.club_id=c and s.fixture_id=fid
   and s.source_match_id=(card->>'match_id')::uuid and s.team_id=tid and s.no_play is null)
 then return '[]'::jsonb;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text;
 if team is null or jsonb_typeof(team->'players') is distinct from 'array' then return '[]'::jsonb;end if;
 for person in select p from jsonb_array_elements(team->'players') p where p->>'player_id' is not null and nullif(btrim(p->>'name'),'') is not null loop
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
   ((s.source_player_id=source_id and s.roster_id<>rid) or (card->>'provider' is distinct from 'playhq_au' and s.roster_id=rid and s.source_player_id<>source_id))) then continue;end if;
  select case when count(*)=1 then min(rp.player_id::text)::uuid end into pid
   from club_batting_private.roster_players rp where rp.club_id=c and rp.roster_id=rid;
  if exists(select 1 from public.match_review_player_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid is not null and exists(select 1 from club_batting_private.roster_players rp where rp.club_id=c and rp.player_id=pid and rp.roster_id<>rid) then continue;end if;
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and s.source_player_id=source_id and s.roster_id=rid)
   and (card->>'provider'='playhq_au' or pid is null or exists(select 1 from public.match_review_player_links l where l.club_id=c and l.source_player_id=source_id and l.player_id=pid)) then continue;end if;
  linked:=linked||jsonb_build_array(jsonb_build_object('source_id',source_id,'roster_id',rid,'player_id',pid,'name',person->>'name'));
  if not apply_links then continue;end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by)
   values(c,source_id,rid,actor) on conflict(club_id,source_player_id) do nothing;
  get diagnostics added=row_count;changed:=changed+added;
  if pid is not null and card->>'provider' is distinct from 'playhq_au' and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,d)) then
   insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by)
    values(c,source_id,pid,actor) on conflict(club_id,source_player_id) do nothing;
   get diagnostics added=row_count;changed:=changed+added;
  end if;
 end loop;
 if apply_links and changed>0 then
  insert into club_selection_private.audit(club_id,actor_id,action,detail)
   values(c,actor,'scorecard_selected_identities',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'method',case when f.published is null then 'unique_full_name_in_selected_team' else 'unique_full_name_in_published_team' end,'players',linked));
 end if;
 if apply_links then perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,tid,actor);end if;
 return linked;
end $function$
;

CREATE OR REPLACE FUNCTION club_selection_private.scorecard_team_api(c uuid, action text, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare card jsonb;sid uuid:=(data->>'snapshot_id')::uuid;fid uuid;tid text;plan jsonb;result jsonb;item jsonb;r jsonb;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;rid uuid;v_details jsonb;v_published jsonb;meta jsonb;
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid()) or not exists(select 1 from public.clubs where id=c and archived_at is null) then raise exception 'Current club membership is required';end if;
 if not (club_batting_private.team_review_staff(c) or club_selection_private.selection_viewer(c,auth.uid()) or club_selection_private.social_allowed_at(c,auth.uid(),now()) or public.is_club_admin(c)) then raise exception 'Coaching, selection or socials access is required';end if;
 if length(data::text)>100000 then raise exception 'Team request is too large';end if;
 if not club_selection_private.enabled(c) then return jsonb_build_object('enabled',false);end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 if action='apply' then
  rid:=(data->>'request_id')::uuid;if rid is null then raise exception 'Request ID required';end if;
  select * into receipt from club_selection_private.requests where club_id=c and user_id=auth.uid() and request_id=rid;
  if found then if receipt.action<>'playcricket_team' or receipt.payload<>data then raise exception 'Request ID already used';end if;return receipt.result;end if;
 end if;
 select scorecard into card from public.match_review_scorecards where id=sid and club_id=c;
 if card is null then raise exception 'Scorecard unavailable in this club';end if;
 if not (club_batting_private.team_review_staff(c) or club_selection_private.social_allowed_at(c,auth.uid(),now()) or public.is_club_admin(c) or club_selection_private.selection_scorecard_view(c,card,auth.uid())) then raise exception 'View access to this scorecard’s Selection Group is required';end if;
 if action='context' then
  return jsonb_build_object('enabled',true,'card',card,'our_team',club_batting_private.scorecard_club_team(c,card),
   'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',fx.id,'grade',fx.details->>'grade','opposition',fx.details->>'opposition','days',fx.details->'days','brackets',fx.details->'brackets','slots',fx.slots,'sync',fx.scorecard_sync) order by fx.details->>'grade',fx.id)
    from club_selection_private.fixtures fx where fx.club_id=c and (not club_selection_private.scoped_selections(c) or club_selection_private.fixture_view(c,fx.details,auth.uid()) or club_selection_private.result_editor(fx.id,auth.uid())) and not coalesce((fx.details->>'cancelled')::boolean,false)
    and (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(fx.details->'days') day)=card->'dates'),'[]'),
   'roster',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'external_id',r.external_id,'active',r.active,'identity_unlinked',r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id),'imported_stub',r.id=md5('playcricket-roster:'||c::text||lower(r.external_id))::uuid and r.user_id is null and not exists(select 1 from club_batting_private.roster_players rp where rp.roster_id=r.id)) order by r.name,r.id) from club_selection_private.roster r where r.club_id=c),'[]'),
   'links',coalesce((select jsonb_agg(jsonb_build_object('source_id',links.source_player_id,'roster_id',links.roster_id)) from (
    select l.source_player_id,l.roster_id from club_selection_private.scorecard_roster_links l where l.club_id=c
    union all select l.source_player_id,rp.roster_id from public.match_review_player_links l join club_batting_private.roster_players rp on rp.club_id=c and rp.player_id=l.player_id
    where l.club_id=c and not exists(select 1 from club_selection_private.scorecard_roster_links saved where saved.club_id=c and saved.source_player_id=l.source_player_id)
   ) links),'[]'));
 end if;
 if action not in ('preview','apply') then raise exception 'Unknown team action';end if;
 fid:=(data->>'fixture_id')::uuid;tid:=data->>'team_id';
 plan:=club_selection_private.scorecard_team_plan(c,sid,tid,fid,data->'mapping');
 if club_selection_private.scoped_selections(c) and exists(select 1 from jsonb_array_elements(plan->'fixtures') x where not club_selection_private.result_editor((x->>'id')::uuid,auth.uid())) then raise exception 'Edit access to each affected Selection Group is required';end if;
 if action='preview' then return plan||jsonb_build_object('expected',md5(plan::text));end if;
 if data->>'expected' is distinct from md5(plan::text) then raise exception 'A team or player match changed. Review the updated changes before confirming';end if;
 for r in select * from jsonb_array_elements(plan->'new_players') loop
  insert into club_selection_private.roster(id,club_id,external_id,name) values((r->>'id')::uuid,c,r->>'external_id',r->>'name');
 end loop;
 if jsonb_array_length(plan->'new_players')>0 then update club_selection_private.access set roster_revision=roster_revision+1 where club_id=c;end if;
 for item in select * from jsonb_array_elements(plan->'fixtures') loop
  select * into f from club_selection_private.fixtures where id=(item->>'id')::uuid and club_id=c for update;
  meta:=(item->'sync')||jsonb_build_object('updated_at',now(),'updated_by',auth.uid());
  v_details:=club_selection_private.scorecard_team_details(c,item->'details',item->'slots');
  v_published:=f.published;
  if v_published is not null then
   v_published:=v_published||jsonb_build_object('details',club_selection_private.scorecard_team_details(c,item->'published_details',item->'published_slots'),'slots',item->'published_slots','scorecard_sync',meta,
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'spin_style',p.spin_style,'keeper',p.keeper) order by p.id) from club_selection_private.roster p where p.club_id=c and exists(select 1 from jsonb_array_elements(item->'published_slots') s where s->>'d1'=p.id::text or s->>'d2'=p.id::text)),'[]'));
   insert into club_selection_private.publications(fixture_id,version,snapshot,created_by) values(f.id,f.publication+1,v_published,auth.uid());
  end if;
  update club_selection_private.fixtures set details=v_details,slots=item->'slots',scorecard_sync=meta,published=v_published,
   publication=publication+case when v_published is null then 0 else 1 end,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=f.id;
  -- Existing manual review lists must not retain the displaced selection.
  update club_batting_private.fixture_review_rosters m set player_ids=coalesce((select array_agg(distinct rp.player_id) from club_batting_private.roster_players rp where rp.club_id=c and exists(select 1 from jsonb_array_elements(item->'slots') s where s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)),'{}'),
   captain_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(item->'slots') s where rp.club_id=c and rp.player_id=m.captain_player_id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)) then m.captain_player_id end,
   keeper_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(item->'slots') s where rp.club_id=c and rp.player_id=m.keeper_player_id and (s->>'d1'=rp.roster_id::text or s->>'d2'=rp.roster_id::text)) then m.keeper_player_id end,
   revision=revision+1,updated_at=now(),updated_by=auth.uid() where m.fixture_id=f.id and m.club_id=c;
 end loop;
 for r in select * from jsonb_array_elements(plan->'mapping') loop
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values(c,(r->>'source_id')::uuid,(r->>'roster_id')::uuid,auth.uid())
   on conflict(club_id,source_player_id) do update set roster_id=excluded.roster_id,confirmed_by=excluded.confirmed_by,updated_at=now();
 end loop;
 result:=jsonb_build_object('saved',true,'fixture_id',fid,'affected',plan->'fixtures');
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'playcricket_team',plan);
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,auth.uid(),rid,'playcricket_team',data,result);
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.club_selections_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if p_action in ('player_link_context','confirm_player_link','decline_player_link') then return club_selection_private.player_link_api(p_club_id,p_action,p_data);end if;
 if p_action='availability_candidates' then return club_selection_private.availability_candidates(p_club_id);end if;
 if p_action='publication_check' then return club_selection_private.publication_check(p_club_id,p_data);end if;
 if p_action='set_access' then raise exception 'Use the Selections subscription controls';end if;
 if p_action in ('subscription_context','preview_subscription','set_selection_pricing','save_subscription') then return club_selection_private.billing_api(p_club_id,p_action,p_data);end if;
 result:=club_selection_private.api(p_club_id,p_action,p_data);
 if p_action='access' then
  result:=result||jsonb_build_object('assist_staff',mirelion_assist_private.club_staff(p_club_id,auth.uid()));
  result:=result||jsonb_build_object('predictions_enabled',coalesce((select s.enabled from public.club_call_settings s where s.club_id=p_club_id),false));
 end if;
 if p_action='context' and (coalesce((result->>'admin')::boolean,false) or coalesce((result->>'can_view_board')::boolean,false)) then
  result:=result||jsonb_build_object('selection_group_access',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'level',club_selection_private.selection_group_level(p_club_id,g.id,auth.uid()),'head_id',club_selection_private.selection_group_publisher(p_club_id,g.id),'can_view',coalesce((result->>'admin')::boolean,false) or club_selection_private.selection_group_level(p_club_id,g.id,auth.uid())>0 or exists(select 1 from club_selection_private.fixtures fx where fx.club_id=p_club_id and club_selection_private.fixture_selection_group(p_club_id,fx.details)=g.id and club_selection_private.fixture_captain(p_club_id,fx.details,auth.uid())))) from club_selection_private.selection_groups g where g.club_id=p_club_id),'[]'),'selection_setup',public.club_selection_groups(p_club_id,'context'),'fixtures',coalesce((select jsonb_agg(f||case when f->'details' is null and f->'published' is not null then jsonb_build_object('details',f#>'{published,details}','slots',f#>'{published,slots}','draft_visible',false) else jsonb_build_object('draft_visible',true) end||jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')),'normal_player_limit',club_selection_private.normal_player_limit(p_club_id,coalesce(f->'details',f#>'{published,details}')),
  'result_complete',coalesce((select latest.scorecard->>'status'='completed'
   from club_selection_private.fixture_result_sources src
   join lateral (select sc.scorecard from public.match_review_scorecards sc
    where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id
    order by sc.created_at desc,sc.id desc limit 1) latest on true
   where src.club_id=p_club_id and src.fixture_id=(f->>'id')::uuid and src.no_play is null),false))) from jsonb_array_elements(result->'fixtures') f),'[]'));
 end if;
 if p_action='context' and coalesce((result->>'can_view_board')::boolean,false) then
  result:=result||jsonb_build_object('returning_context',club_selection_private.selection_returning_context(p_club_id,result->'fixtures'));
 end if;
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION club_selection_private.availability_fixtures(c uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid(); player uuid; usual_team uuid; season uuid; tz text; today text; answer jsonb;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 if not club_selection_private.enabled(c) then raise exception 'Selections access is not active for this club';end if;
 if not exists(select 1 from auth.users u where u.id=me and u.email_confirmed_at is not null
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
 then raise exception 'A verified active account is required';end if;
 select r.id,club_selection_private.fixture_group_id(c,jsonb_build_object('grade',r.grade)) into player,usual_team from club_selection_private.roster r where r.club_id=c and r.user_id=me and r.active;
 if player is null then raise exception 'Link your playing-list entry before finding fixtures';end if;
 select a.timezone into tz from club_selection_private.access a where a.club_id=c;
 tz:=coalesce(tz,'Australia/Sydney');today:=(now() at time zone tz)::date::text;
 select cn.active_season_id into season from club_selection_private.playhq_connections cn where cn.club_id=c;
 -- Imported fixtures require the explicitly selected PlayHQ season. Manual
 -- fixtures are a separate, deliberate opt-in (for example, a trial game).
 -- Trial eligibility uses the saved usual grade, including before any selections.
 -- The team picker affects match highlights only; eligible trials are always shown.
 with imported as materialized (
  select l.fixture_id,g.id::text team_id,g.name,'playhq'::text source,
   coalesce(l.pending_fixture,l.source_fixture) src,f.published
  from club_selection_private.playhq_links l
  join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c
  join club_selection_private.playhq_grade_mappings m on m.club_id=c and m.season_id=season and m.team_id=l.team_id
  join public.playing_groups g on g.id=m.grade_id and g.club_id=c and g.active
  where l.club_id=c and l.season_id=season
 ), manual as (
  select f.id fixture_id,coalesce(g.id::text,'manual:'||md5(jsonb_build_array(f.details->>'competition',f.details->>'grade')::text)) team_id,
   coalesce(g.name,f.details->>'grade') name,'manual'::text source,
   jsonb_build_object('opposition',f.details->>'opposition','cancelled',f.details->'cancelled','days',
    (select jsonb_agg(jsonb_build_object('date',day->>'date','time',day->>'start','ground',coalesce(day->>'ground',f.details->>'ground','')) order by ord)
     from jsonb_array_elements(f.details->'days') with ordinality x(day,ord))) src,f.published
  from club_selection_private.fixtures f
  left join public.playing_groups g on g.club_id=c and g.active and g.id::text=f.details->>'grade_group_id'
  where f.club_id=c and f.details->'include_in_fixture_calendar'='true'::jsonb
   and not exists(select 1 from club_selection_private.playhq_links l where l.fixture_id=f.id)
 ), candidates as materialized (
  select * from imported union all select * from manual
 ), upcoming as materialized (
  select i.*,days.value days from candidates i cross join lateral (
   select jsonb_agg(jsonb_build_object('date',d->>'date','start',coalesce(d->>'time',''),
    'ground',coalesce(d->>'ground',d->>'venue',''),'day',ord) order by ord) value
   from jsonb_array_elements(case when jsonb_typeof(i.src->'days')='array' then i.src->'days' else '[]'::jsonb end) with ordinality x(d,ord)
   where d->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and d->>'date'>=today
  ) days where days.value is not null and coalesce(i.src->>'cancelled','false')<>'true'
   and upper(coalesce(i.src->>'source_status','')) not in ('CANCELLED','CANCELED','ABANDONED','BYE')
 ), trials as materialized (
  select t.*,days.value future_days from club_selection_private.fixture_calendar_trials t cross join lateral (
   select jsonb_agg(jsonb_build_object('date',d->>'date','start',coalesce(d->>'start',''),'ground',coalesce(d->>'ground',''),'day',ord) order by ord) value
   from jsonb_array_elements(t.days) with ordinality x(d,ord) where d->>'date'>=today
  ) days where t.club_id=c and t.included and days.value is not null
   and (t.audience='club' or usual_team=any(t.team_ids))
 ), team_choices as (
  select team_id,name from upcoming union
  select g.id::text,g.name from trials t join public.playing_groups g on g.id=any(t.team_ids) and g.club_id=c and g.active
 ), teams as (
  select distinct u.team_id,u.name,u.team_id=usual_team::text usual,exists(select 1 from candidates history
   where history.team_id=u.team_id and history.published is not null
    and exists(select 1 from jsonb_array_elements(coalesce(history.published->'slots','[]'::jsonb)) slot
     where slot->>'d1'=player::text or slot->>'d2'=player::text)) suggested
  from team_choices u
 )
 select jsonb_build_object('club_id',c,'player_id',player,'season_id',season,'usual_team_id',usual_team,'timezone',tz,'from_date',today,
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',team_id,'name',name,'usual',coalesce(usual,false),'suggested',suggested or coalesce(usual,false)) order by name,team_id) from teams),'[]'::jsonb),
  'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',fixture_id,'team_id',team_id,'source',source,
   'opposition',coalesce(src->>'opposition','Opponent to be confirmed'),'days',days) order by days->0->>'date',name,fixture_id) from upcoming),'[]'::jsonb)
   ||coalesce((select jsonb_agg(jsonb_build_object('id',id,'source','trial','title',title,'audience',audience,'team_ids',team_ids,'days',future_days) order by future_days->0->>'date',title) from trials),'[]'::jsonb)) into answer;
 return answer;
end $function$
;
