-- Keep existing calls video-capable; new calls default to audio-only.
-- The admission lock fixes the mode when the first selector starts a room.
alter table club_selection_private.selection_video_calls add column call_mode text not null default 'video' check(call_mode in ('audio','video'));
alter table club_selection_private.selection_video_calls alter column call_mode set default 'audio';

CREATE OR REPLACE FUNCTION club_selection_private.selection_room_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();balance jsonb;result jsonb;rid uuid;
 entry club_selection_private.selection_video_entries%rowtype;call_row club_selection_private.selection_video_calls%rowtype;
 available bigint;cost integer;duration integer;planned integer;period uuid;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false) or not coalesce(club_selection_private.selector(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid Selection Room request';end if;
 if p_action='reserve_video' and p_data ? 'use_video' and jsonb_typeof(p_data->'use_video')<>'boolean' then raise exception 'Choose audio or video before starting the call';end if;
 if p_action in ('access','context') then
  result:=club_selection_private.selection_room_api_before_credits(c,p_action,p_data);
  balance:=club_selection_private.video_credit_balance(c);
  select * into call_row from club_selection_private.selection_video_calls where club_id=c and expires_at>now() order by expires_at desc limit 1;
  return result||jsonb_build_object('video_enabled',(balance->>'enabled')::boolean,'video_credit',balance-'period_id',
   'active_call',case when call_row.id is not null then jsonb_build_object('mode',call_row.call_mode,'expires_at',call_row.expires_at) else null end);
 elsif p_action<>'reserve_video' or exists(select 1 from club_selection_private.selection_video_policy where club_id=c and enabled) then
  return club_selection_private.selection_room_api_before_credits(c,p_action,p_data);
 end if;
 -- Match the usage worker lock so settlement and admission cannot race.
 perform pg_advisory_xact_lock(16700,16700);
 balance:=club_selection_private.video_credit_balance(c);
 if not (balance->>'enabled')::boolean then raise exception 'Video is not enabled for this club';end if;
 rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Video request required';end if;
 select * into entry from club_selection_private.selection_video_entries where id=rid;
 if found then
  if entry.club_id<>c or entry.user_id<>me then raise exception 'Video request belongs to another session';end if;
  select * into call_row from club_selection_private.selection_video_calls where id=entry.call_id;
  if call_row.expires_at<=now() then raise exception 'This call has ended. Join a new call';end if;
 else
  available:=(balance->>'available_seconds')::bigint;period:=(balance->>'period_id')::uuid;
  if available<120 or period is null then raise exception 'Video time is used or held for recent calls. Club Admin can add time. Selection chat stays available';end if;
  select * into call_row from club_selection_private.selection_video_calls where club_id=c and expires_at>now()+interval '5 seconds' order by expires_at desc limit 1;
  if not found then
   -- Fit a four-person call into the remaining credit. The one-minute margin is returned after verification.
   planned:=least(4,available/120);duration:=least(5400,((available/(planned*60))-1)*60);
   insert into club_selection_private.selection_video_calls(club_id,expires_at,call_mode)
    values(c,least(now()+make_interval(secs=>duration),(balance->>'renews_at')::timestamptz),case when p_data->>'use_video'='true' then 'video' else 'audio' end) returning * into call_row;
  end if;
  cost:=least(91,ceil(extract(epoch from (call_row.expires_at-now()))/60)::integer+1);
  if cost*60>available then raise exception 'Remaining video time is reserved for this call. Club Admin can add time. Selection chat stays available';end if;
  insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes,credit_period_id,included_reserved_seconds)
   values(rid,call_row.id,c,me,cost,period,least(cost::bigint*60,greatest(0,(balance->>'included_remaining_seconds')::bigint-(balance->>'debt_seconds')::bigint))) returning * into entry;
 end if;
 return jsonb_build_object('room_name','cb-'||replace(call_row.id::text,'-',''),'expires_at',call_row.expires_at,'call_mode',call_row.call_mode,
  'entry_id',entry.id,'user_name',left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100));
end $function$;

CREATE OR REPLACE FUNCTION club_selection_private.selection_room_api_before_credits(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();cfg club_selection_private.selection_room_settings%rowtype;
 msg club_selection_private.selection_room_messages%rowtype;call_row club_selection_private.selection_video_calls%rowtype;
 entry club_selection_private.selection_video_entries%rowtype;policy club_selection_private.selection_video_policy%rowtype;
 rid uuid;body_text text;v text;posts jsonb;can_manage boolean;cursor_id bigint;oldest bigint;
 month_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 cost integer;club_used bigint;total_used bigint;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false)
  or not coalesce(club_selection_private.selector(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid Selection Room request';end if;
 can_manage:=coalesce(club_selection_private.publication_head(c)=me,false)
  or exists(select 1 from club_selection_private.access where club_id=c and head_selector_id=me);
 select * into cfg from club_selection_private.selection_room_settings where club_id=c;
 select * into policy from club_selection_private.selection_video_policy where club_id=c;
 if p_action='access' then
  return jsonb_build_object('allowed',true,'video_enabled',coalesce(policy.enabled,false));
 elsif p_action='context' then
  if p_data ? 'after' and p_data ? 'before' then raise exception 'Choose one message cursor';end if;
  v:=coalesce(p_data->>'after',p_data->>'before');
  if v is not null then
   if v !~ '^[0-9]{1,18}$' then raise exception 'Invalid message cursor';end if;cursor_id:=v::bigint;
  end if;
  if p_data ? 'after' then
   select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]') into posts from
    (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
     where club_id=c and id>cursor_id order by id limit 100) m;
  else
   select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]'),min(m.id) into posts,oldest from
    (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
     where club_id=c and (cursor_id is null or id<cursor_id) order by id desc limit 100) m;
  end if;
  return jsonb_build_object('messages',posts,'has_older',exists(select 1 from club_selection_private.selection_room_messages where club_id=c and id<oldest),
   'backup_url',coalesce(cfg.backup_url,''),'revision',coalesce(cfg.revision,0),'can_manage',can_manage,
   'video_enabled',coalesce(policy.enabled,false),'call_active',exists(select 1 from club_selection_private.selection_video_calls where club_id=c and expires_at>now()));
 elsif p_action='post' then
  body_text:=btrim(p_data->>'body');rid:=(p_data->>'request_id')::uuid;
  if rid is null or body_text is null or length(body_text) not between 1 and 1500 then raise exception 'Write a message of up to 1,500 characters';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  select * into msg from club_selection_private.selection_room_messages where club_id=c and author_id=me and request_id=rid;
  if found then
   if msg.body<>body_text then raise exception 'This message request was already used';end if;
  else
   insert into club_selection_private.selection_room_messages(club_id,author_id,author_name,body,request_id)
    values(c,me,left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100),body_text,rid) returning * into msg;
  end if;
  return jsonb_build_object('message',jsonb_build_object('id',msg.id::text,'author_id',msg.author_id,'author_name',msg.author_name,'body',msg.body,'created_at',msg.created_at));
 elsif p_action='save_backup' then
  if not can_manage then raise exception using errcode='42501',message='The Head of Selections can change the backup call';end if;
  v:=btrim(coalesce(p_data->>'url',''));
  if length(v)>2048 or (v<>'' and (v !~* '^https://(teams[.]microsoft[.]com|teams[.]live[.]com|teams[.]cloud[.]microsoft|meet[.]google[.]com|([a-z0-9-]+[.])*zoom[.]us|([a-z0-9-]+[.])*zoom[.]com)/.+'
   or v ~ '[[:space:]]' or position(chr(92) in v)>0)) then raise exception 'Paste a Teams, Google Meet or Zoom meeting link';end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  select * into cfg from club_selection_private.selection_room_settings where club_id=c;
  if coalesce(cfg.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'The backup call changed. Refresh it before saving';end if;
  insert into club_selection_private.selection_room_settings(club_id,backup_url,updated_by) values(c,v,me)
   on conflict(club_id) do update set backup_url=excluded.backup_url,revision=club_selection_private.selection_room_settings.revision+1,updated_by=me,updated_at=now()
   returning * into cfg;
  return jsonb_build_object('backup_url',cfg.backup_url,'revision',cfg.revision,'saved',true);
 elsif p_action='reserve_video' then
  -- Reserve an upper bound before issuing a token. Retries reuse the same entry.
  -- Confirmed usage replaces expired reservations. Active holds retain the spending cap.
  if not coalesce(policy.enabled,false) then raise exception 'Video is not enabled for this club yet';end if;
  rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Video request required';end if;
  perform pg_advisory_xact_lock(16700,16700);
  select * into entry from club_selection_private.selection_video_entries where id=rid;
  if found then
   if entry.club_id<>c or entry.user_id<>me then raise exception 'Video request belongs to another session';end if;
   select * into call_row from club_selection_private.selection_video_calls where id=entry.call_id;
   if call_row.expires_at<=now() then raise exception 'This call has ended. Join a new call';end if;
  else
   select * into call_row from club_selection_private.selection_video_calls where club_id=c and expires_at>now()+interval '1 minute' order by expires_at desc limit 1;
   if not found then
    insert into club_selection_private.selection_video_calls(club_id,expires_at,call_mode)
     values(c,least(now()+interval '90 minutes',month_start+interval '1 month'),case when p_data->>'use_video'='true' then 'video' else 'audio' end) returning * into call_row;
   end if;
   cost:=least(91,ceil(extract(epoch from (call_row.expires_at-now()))/60)::integer+1);
   select coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)) filter(where club_id=c),0),coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)),0) into club_used,total_used
    from club_selection_private.selection_video_entries where created_at>=month_start and credit_period_id is null;
   if club_used+cost::bigint*60>policy.monthly_minutes::bigint*60 or total_used+cost::bigint*60>9000::bigint*60 then raise exception 'This month’s video allowance is used. Use the backup call';end if;
   insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes)
    values(rid,call_row.id,c,me,cost) returning * into entry;
  end if;
  return jsonb_build_object('room_name','cb-'||replace(call_row.id::text,'-',''),'expires_at',call_row.expires_at,'call_mode',call_row.call_mode,
   'entry_id',entry.id,'user_name',left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100));
 end if;
 raise exception 'Unknown Selection Room action';
end $function$;
