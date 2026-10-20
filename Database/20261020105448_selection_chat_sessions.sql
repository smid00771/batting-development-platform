-- Selection comments are temporary. Discard completed-call comments, with no archive.
-- Leave call admission, provider tokens and all credit accounting unchanged.
create index selection_room_messages_expiry on club_selection_private.selection_room_messages(club_id,created_at);

create function club_selection_private.selection_chat_window(p_club_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare latest club_selection_private.selection_video_calls%rowtype;
begin
 select * into latest from club_selection_private.selection_video_calls
  where club_id=p_club_id order by expires_at desc,created_at desc limit 1;
 return jsonb_build_object(
  'key',case when latest.id is null then 'waiting' when latest.expires_at>now() then 'call:'||latest.id else 'after:'||latest.id end,
  'starts_at',case when latest.expires_at>now() then latest.created_at else latest.expires_at end);
end $$;
revoke all on function club_selection_private.selection_chat_window(uuid) from public,anon,authenticated;

create function club_selection_private.purge_selection_chat_messages(p_club_id uuid default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(16700,16700);
 delete from club_selection_private.selection_room_messages m using (
  select distinct on (club_id) club_id,case when expires_at>now() then created_at else expires_at end as cutoff
  from club_selection_private.selection_video_calls where p_club_id is null or club_id=p_club_id
  order by club_id,expires_at desc,created_at desc
 ) latest where m.club_id=latest.club_id and m.created_at<latest.cutoff;
end $$;
revoke all on function club_selection_private.purge_selection_chat_messages(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION club_selection_private.selection_room_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();balance jsonb;result jsonb;rid uuid;chat jsonb;
 entry club_selection_private.selection_video_entries%rowtype;call_row club_selection_private.selection_video_calls%rowtype;
 available bigint;cost integer;duration integer;planned integer;period uuid;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false) or not coalesce(club_selection_private.selector(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid Selection Room request';end if;
 if p_action='reserve_video' and p_data ? 'use_video' and jsonb_typeof(p_data->'use_video')<>'boolean' then raise exception 'Choose audio or video before starting the call';end if;
 -- Message resets share the admission lock: a post cannot straddle a new call.
 if p_action in ('context','post') then
  perform pg_advisory_xact_lock_shared(16700,16700);
  perform pg_advisory_xact_lock(hashtextextended(c::text,16701));
  chat:=club_selection_private.selection_chat_window(c);
  if p_action='post' and p_data ? 'chat_session' and (p_data->>'chat_session') is distinct from (chat->>'key') then
   raise exception using errcode='P0230',message='That selection chat has ended. Write a new message';
  end if;
  perform club_selection_private.purge_selection_chat_messages(c);
  if p_action='post' then
   return club_selection_private.selection_room_api_before_credits(c,p_action,p_data)||jsonb_build_object('chat_session',chat->>'key');
  end if;
 end if;
 if p_action in ('access','context') then
  result:=club_selection_private.selection_room_api_before_credits(c,p_action,p_data);
  balance:=club_selection_private.video_credit_balance(c);
  select * into call_row from club_selection_private.selection_video_calls where club_id=c and expires_at>now() order by expires_at desc limit 1;
  return result||jsonb_build_object('video_enabled',(balance->>'enabled')::boolean,'video_credit',balance-'period_id','chat_session',chat->>'key',
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

-- Clear expired comments even when nobody reopens Selection Room.
select cron.schedule('selection-chat-cleanup','* * * * *','select club_selection_private.purge_selection_chat_messages()');
select club_selection_private.purge_selection_chat_messages();
