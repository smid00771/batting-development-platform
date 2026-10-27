-- Shared, group-scoped meeting state. It does not start a paid call or reset chat.
alter table club_selection_private.selection_room_settings
 add column meeting_id uuid,
 add column meeting_started_at timestamptz,
 add column meeting_ended_at timestamptz;

create function club_selection_private.selection_meeting_state(c uuid, g uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',s.meeting_id,'active',s.meeting_id is not null and s.meeting_ended_at is null,
  'started_at',s.meeting_started_at,'can_manage',club_selection_private.selection_group_level(c,g,auth.uid())=2)
 from (select 1) seed left join club_selection_private.selection_room_settings s on s.club_id=c and s.scope_id=g
$$;
revoke all on function club_selection_private.selection_meeting_state(uuid,uuid) from public,anon,authenticated,service_role;

-- A chat refresh must not acquire the call/billing locks, purge messages, or
-- calculate a wallet. One stable snapshot keeps the session and rows consistent.
create function club_selection_private.selection_room_context(c uuid, p_data jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare g uuid:=club_selection_private.selection_room_scope(c,p_data);me uuid:=auth.uid();
 cfg club_selection_private.selection_room_settings%rowtype;latest club_selection_private.selection_video_calls%rowtype;
 cursor_id bigint;oldest bigint;v text;posts jsonb;cutoff timestamptz;session_key text;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false) or not coalesce(club_selection_private.selection_viewer(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';
 end if;
 select * into cfg from club_selection_private.selection_room_settings where club_id=c and scope_id=g;
 select * into latest from club_selection_private.selection_video_calls where club_id=c and scope_id=g order by expires_at desc,created_at desc limit 1;
 cutoff:=case when latest.expires_at>now() then latest.created_at else latest.expires_at end;
 session_key:=case when latest.id is null then 'waiting:'||g when latest.expires_at>now() then 'call:'||latest.id else 'after:'||latest.id end;
 if p_data ? 'after' and p_data ? 'before' then raise exception 'Choose one message cursor';end if;
 v:=coalesce(p_data->>'after',p_data->>'before');
 if v is not null then
  if v !~ '^[0-9]{1,18}$' then raise exception 'Invalid message cursor';end if;cursor_id:=v::bigint;
 end if;
 if p_data ? 'after' then
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]') into posts from
   (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
    where club_id=c and scope_id=g and (cutoff is null or created_at>=cutoff) and id>cursor_id order by id limit 100) m;
 else
  select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('id',m.id::text) order by m.id),'[]'),min(m.id) into posts,oldest from
   (select id,author_id,author_name,body,created_at from club_selection_private.selection_room_messages
    where club_id=c and scope_id=g and (cutoff is null or created_at>=cutoff) and (cursor_id is null or id<cursor_id) order by id desc limit 100) m;
 end if;
 return jsonb_build_object('messages',posts,'chat_session',session_key,'can_post',club_selection_private.selection_group_level(c,g,me)=2,
  'has_older',exists(select 1 from club_selection_private.selection_room_messages where club_id=c and scope_id=g and (cutoff is null or created_at>=cutoff) and id<oldest),
  'backup_url',coalesce(cfg.backup_url,''),'revision',coalesce(cfg.revision,0),
  'can_manage',coalesce(club_selection_private.selection_group_publisher(c,g)=me,false),
  'video_enabled',coalesce((select enabled from club_selection_private.selection_video_policy where club_id=c),false) or coalesce((select managed_enabled from club_selection_private.video_credit_config where singleton),false),
  'call_active',coalesce(latest.expires_at>now(),false),
  'active_call',case when latest.expires_at>now() then jsonb_build_object('mode',latest.call_mode,'expires_at',latest.expires_at) else null end);
end $$;
revoke all on function club_selection_private.selection_room_context(uuid,jsonb) from public,anon,authenticated,service_role;

-- Preserve existing post/session locks, call admission, billing and revocation.
do $patch$
declare definition text;needle text:=$old$ -- Message resets share the admission lock: a post cannot straddle a new call.$old$;
begin
 definition:=pg_get_functiondef('club_selection_private.selection_room_api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Unexpected Selection Room API';end if;
 definition:=replace(definition,needle,$new$
 if p_action='context' then return club_selection_private.selection_room_context(c,p_data);end if;
 if p_action in ('meeting','start_meeting','end_meeting') then
  if p_action<>'meeting' then
   if club_selection_private.selection_group_level(c,room_scope,me)<2 then raise exception using errcode='42501',message='Only selectors who can edit this group can start or end its meeting';end if;
   if p_action='start_meeting' then
    rid:=(p_data->>'request_id')::uuid;if rid is null then raise exception 'Meeting request required';end if;
    insert into club_selection_private.selection_room_settings(club_id,scope_id,meeting_id,meeting_started_at)
     values(c,room_scope,rid,now())
     on conflict(club_id,scope_id) do update set meeting_id=excluded.meeting_id,meeting_started_at=excluded.meeting_started_at,meeting_ended_at=null
      where (selection_room_settings.meeting_id is null or selection_room_settings.meeting_ended_at is not null) and selection_room_settings.meeting_id is distinct from rid;
   else
    rid:=(p_data->>'meeting_id')::uuid;if rid is null then raise exception 'Choose the active meeting';end if;
    update club_selection_private.selection_room_settings set meeting_ended_at=coalesce(meeting_ended_at,now()) where club_id=c and scope_id=room_scope and meeting_id=rid;
    if not found then raise exception 'The meeting changed. Refresh its status before ending it';end if;
   end if;
  end if;
  return club_selection_private.selection_meeting_state(c,room_scope);
 end if;
 -- Message resets share the admission lock: a post cannot straddle a new call.$new$);
 execute definition;
end $patch$;

-- Reassert the existing public entry point permissions; no anonymous access.
revoke all on function public.selection_room_api(uuid,text,jsonb) from public,anon;
grant execute on function public.selection_room_api(uuid,text,jsonb) to authenticated;
