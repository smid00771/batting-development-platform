-- Queue and deliver opted-in club messages before unrelated coaching scans.
-- Keep the existing worker's service-only authority, leases and final checks.
do $patch$
declare definition text:=pg_get_functiondef('club_batting_private.phone_worker(text,jsonb)'::regprocedure);old_text text;new_text text;
begin
 old_text:=$old$ elsif p_action='collect' then$old$;
 new_text:=$new$ elsif p_action='collect_messages' then
  insert into club_batting_private.phone_deliveries(subscription_id,club_id,kind,source_key,source_at)
  select s.id,p.club_id,'message',m.id::text,m.created_at
  from club_batting_private.phone_subscriptions s
  join club_batting_private.phone_preferences p on p.subscription_id=s.id and p.messages
  join public.club_memberships cm on cm.user_id=s.user_id and cm.club_id=p.club_id
  join public.clubs c on c.id=p.club_id and c.archived_at is null
  join club_batting_private.club_message_recipients mr on mr.user_id=s.user_id and mr.opened_at is null and mr.deleted_at is null
  join club_batting_private.club_messages m on m.id=mr.message_id and m.club_id=p.club_id
  where s.disabled_at is null and m.created_at>=greatest(p.messages_since,s.created_at,now()-interval '7 days')
   and (not p_data ? 'club_id' or p.club_id=(p_data->>'club_id')::uuid)
  on conflict do nothing;
  get diagnostics n=row_count;
  return jsonb_build_object('queued',n);
 elsif p_action='collect' then$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected phone worker collector';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$ elsif p_action='claim' then$old$;
 new_text:=$new$ elsif p_action in ('claim','claim_messages') then$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected phone worker claim';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$   and d.attempts<5 order by d.source_at for update skip locked limit 25 loop$old$;
 new_text:=$new$   and d.attempts<5 and (p_action<>'claim_messages' or d.kind='message' and (not p_data ? 'club_id' or d.club_id=(p_data->>'club_id')::uuid))
   order by d.source_at for update skip locked limit 25 loop$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected phone worker claim scope';end if;
 execute replace(definition,old_text,new_text);
end $patch$;
