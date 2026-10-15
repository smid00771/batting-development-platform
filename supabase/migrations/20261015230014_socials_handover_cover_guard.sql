-- Keep current or future temporary cover and its scheduled posts from losing their authorising manager.
create or replace function club_selection_private.social_manager_change(c uuid, action text, data jsonb) returns jsonb
language plpgsql set search_path='' as $function$
declare me uuid:=auth.uid();uid uuid;adm boolean;mid uuid;person text;pending_count int;others int;
 h club_selection_private.social_manager_handovers%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,14300));
 if not club_selection_private.social_permanent_allowed(c,me) then
  raise exception using errcode='P0192',message='Permanent Socials Manager or Club Admin access required';
 end if;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 uid:=nullif(data->>'user_id','')::uuid;
 if uid is null or not club_selection_private.member(c,uid) then raise exception using errcode='P0192',message='Choose a current club member';end if;
 select coalesce(display_name,'Socials Manager') into person from public.user_profiles where user_id=uid;
 select * into h from club_selection_private.social_manager_handovers where club_id=c and user_id=uid;
 if action='manager_handover' then
  if data->>'operation'='request' then
   if uid<>me or not exists(select 1 from club_selection_private.social_managers where club_id=c and user_id=me) then
    raise exception using errcode='P0192',message='Only an appointed manager can request their own handover';
   end if;
   if h.requested_at is null or h.resolved_at is not null then
    insert into club_selection_private.social_manager_handovers(club_id,user_id) values(c,uid)
     on conflict(club_id,user_id) do update set requested_at=now(),resolved_at=null,resolved_by=null,resolution=null;
    insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
     values(c,null,gen_random_uuid(),'Socials handover needs attention',coalesce(person,'A Socials Manager')||' has asked to hand over socials. They remain appointed until a replacement is assigned or Club Admin takes responsibility. Open Teams → Social Graphics → Who handles socials to complete the handover.','teams',true,'socials-handover:'||gen_random_uuid()::text) returning id into mid;
    insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy)
     select mid,m.user_id,false from public.club_memberships m where m.club_id=c and m.user_id<>me and club_selection_private.social_permanent_allowed(c,m.user_id);
   end if;
   return jsonb_build_object('saved',true,'message','Handover requested. Club Admin has been notified. You remain a Socials Manager until the handover is completed.');
  elsif data->>'operation'='cancel' then
   if uid<>me then raise exception using errcode='P0192',message='Only the requesting manager can cancel this request';end if;
   update club_selection_private.social_manager_handovers set resolved_at=now(),resolved_by=me,resolution='cancelled' where club_id=c and user_id=uid and resolved_at is null;
   return jsonb_build_object('saved',true,'message','Handover request cancelled. You remain a Socials Manager.');
  else raise exception using errcode='P0192',message='Choose Request handover or Cancel request';end if;
 end if;
 if jsonb_typeof(data->'enabled') is distinct from 'boolean' then raise exception using errcode='P0192',message='Choose whether access is enabled';end if;
 if exists(select 1 from public.club_memberships where club_id=c and user_id=uid and permission_role='admin') then
  raise exception using errcode='P0192',message='Club Admin retains socials access through their admin role';
 end if;
 if (data->>'enabled')::boolean then
  insert into club_selection_private.social_managers(club_id,user_id) values(c,uid) on conflict do nothing;
  if found then
   insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
    values(c,null,gen_random_uuid(),'You are a Socials Manager','Open Teams → Social Graphics. Use Social accounts to connect the club Facebook Page and Instagram account, and review posts before publishing. Who handles socials lets you appoint other managers and arrange a handover.','teams',true,'socials-manager:'||gen_random_uuid()::text) returning id into mid;
   insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy) values(mid,uid,false);
  end if;
 else
  if not exists(select 1 from club_selection_private.social_managers where club_id=c and user_id=uid) then return jsonb_build_object('saved',true);end if;
  select count(*) into others from club_selection_private.social_managers z join public.club_memberships m on m.club_id=z.club_id and m.user_id=z.user_id
   where z.club_id=c and z.user_id<>uid and m.permission_role<>'admin';
  if others=0 and not (adm and coalesce((data->>'take_responsibility')::boolean,false) and h.requested_at is not null and h.resolved_at is null) then
   raise exception using errcode='P0192',message='The last Socials Manager must request a handover. Add a replacement, or ask Club Admin to explicitly take responsibility.';
  end if;
  if exists(select 1 from club_selection_private.social_posting_delegations d join club_selection_private.access a on a.club_id=d.club_id
   where d.club_id=c and d.delegated_by=uid and d.delegate_id is not null and d.ends_on>=(now() at time zone a.timezone)::date) then
   raise exception using errcode='P0192',message='Hand back temporary cover before removing this manager. Review any cover posts in Who handles socials first.';
  end if;
  select count(*) into pending_count from jsonb_array_elements(club_selection_private.social_cover_posts(c,uid)) p where (p->>'blocks_hand_back')::boolean;
  if pending_count>0 then raise exception using errcode='P0192',message='Review the scheduled posts before removing this manager. Another manager must take responsibility, or the schedules must be cancelled.';end if;
  delete from club_selection_private.social_managers where club_id=c and user_id=uid;
  update club_selection_private.social_manager_handovers set resolved_at=now(),resolved_by=me,
   resolution=case when others=0 then 'admin_takeover' else 'replacement_assigned' end where club_id=c and user_id=uid and resolved_at is null;
  delete from club_selection_private.social_connect_states where club_id=c and not club_selection_private.social_preparer_allowed(c,user_id);
 end if;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'socials:manager_change',data-'request_id');
 return jsonb_build_object('saved',true,'access_removed',not club_selection_private.social_allowed(c),
  'message',case when (data->>'enabled')::boolean then 'Socials Manager added.' when others=0 then 'Handover completed. Club Admin now handles socials.' else 'Socials Manager removed. Your other club roles are unchanged.' end);
end $function$;
revoke all on function club_selection_private.social_manager_change(uuid,text,jsonb) from public,anon,authenticated;
