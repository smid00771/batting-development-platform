-- Synthetic clubs only. The enclosing exception rolls every change back, including queued messages.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();player_user uuid:=gen_random_uuid();outsider_id uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();u uuid;
 ps uuid[]:=array(select gen_random_uuid() from generate_series(1,24));fs uuid[]:=array(select gen_random_uuid() from generate_series(1,3));
 match_day date:=current_date+2;d jsonb;draft_slots jsonb;req jsonb;res jsonb;again jsonb;plan_id uuid;token text;token2 text;feed jsonb;mid uuid;eid uuid;sub uuid:=gen_random_uuid();delivery uuid;
 rejected boolean;n integer;rev integer;deadline timestamptz;before_rows jsonb;proposal jsonb;bad jsonb;
begin
 begin
  foreach u in array array[head_id,selector_id,player_user,outsider_id,admin_id] loop
   insert into auth.users(id,email) values(u,'club-week-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic club-week user');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Club-week test','club-week-'||c,head_id),(other_c,'Other test','club-week-'||other_c,outsider_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values
   (c,head_id,'player','none','player'),(c,selector_id,'player','none','player'),(c,player_user,'player','none','player'),(c,admin_id,'admin','admin',null),(other_c,outsider_id,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id) values(c,'standalone','active','UTC',head_id),(other_c,'standalone','active','UTC',outsider_id);
  insert into club_selection_private.selectors(club_id,user_id) values(c,selector_id);
  for i in 1..24 loop
   insert into club_selection_private.roster(id,club_id,name,user_id,batting,bowling,bowling_load,keeper,active)
    values(ps[i],c,'Synthetic player '||i,case when i=1 then player_user end,'top','pace','frontline',i=11,true);
   insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates)
    values(ps[i],case when i=1 then '[]'::jsonb else jsonb_build_array(match_day::text,(match_day+7)::text) end,'[]');
  end loop;
  for i in 1..2 loop
   d:=jsonb_build_object('grade','Grade '||i,'competition','Test','format','long_form','opposition','Test opponent','ground','Test ground','meeting','Meet at 11','days',jsonb_build_array(jsonb_build_object('date',match_day::text,'start','12:00'),jsonb_build_object('date',(match_day+7)::text,'start','12:00')),'brackets',true,'min_quicks',0,'min_batters',0,'captain_id',head_id);
   select jsonb_agg(jsonb_build_object('d1',ps[(i-1)*11+j],'d2',ps[(i-1)*11+j]) order by j) into draft_slots from generate_series(1,11) j;
   insert into club_selection_private.fixtures(id,club_id,details,slots) values(fs[i],c,d,draft_slots);
  end loop;
  assert not has_function_privilege('anon','public.club_week_api(uuid,text,jsonb)','execute'),'Anonymous RPC execution revoked';
  assert not has_function_privilege('authenticated','public.selection_calendar_feed(text)','execute'),'Calendar lookup is service-only';
  assert not has_table_privilege('authenticated','club_selection_private.calendar_subscriptions','select'),'Members cannot list calendar token hashes';
  perform set_config('request.jwt.claim.sub','',true);rejected:=false;
  begin perform public.club_week_api(c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'Anonymous rejected';
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);rejected:=false;
  begin perform public.club_week_api(c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club rejected';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  assert public.club_week_api(c,'context')->'settings'->>'reminders_enabled'='false','Reminders off by default';
  assert public.club_week_api(c,'context')->'settings'->>'acknowledgement_enabled'='false','Acknowledgements off by default';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'revision',0,'reminders_enabled',true,'deadline_weekday',extract(isodow from current_date)::integer,'deadline_time',to_char(now()+interval '1 hour','HH24:MI'),'acknowledgement_enabled',true);
  res:=public.club_week_api(c,'settings',req);assert public.club_week_api(c,'settings',req)=res,'Settings retry idempotent';
  rejected:=false;begin perform public.club_week_api(c,'settings',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'Settings changed%';end;assert rejected,'Stale settings rejected';
  update club_selection_private.week_settings set reminders_enabled=false where club_id=c;
  assert club_selection_private.run_availability_reminders(now())=0,'Disabled clubs collect no reminders';
  update club_selection_private.week_settings set reminders_enabled=true where club_id=c;
  perform set_config('request.jwt.claim.sub',player_user::text,true);rejected:=false;
  begin perform public.club_week_api(c,'settings',req||jsonb_build_object('revision',1,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Player cannot change settings';
  -- One two-date reminder, never one per grade, repeated collection does not send twice.
  n:=club_selection_private.run_availability_reminders(now());assert n>=1,'Reminder collected';
  assert (select count(*)=1 from club_selection_private.availability_reminders where club_id=c),'Club/player/deadline deduplicated';
  perform club_selection_private.run_availability_reminders(now());assert (select count(*)=1 from club_selection_private.availability_reminders where club_id=c),'Cron replay safe';
  select message_id,r.deadline into mid,deadline from club_selection_private.availability_reminders r where club_id=c;
  assert club_batting_private.message_recipient_allowed(mid,player_user),'Reminder is visible to its player';
  assert not club_batting_private.message_recipient_allowed(mid,head_id),'Reminder is not visible to another person';
  eid:=club_batting_private.queue_message_email(mid,player_user,'fallback');
  assert (select payload->>'link_path' like '%team_view=availability%' from public.outbound_messages where id=eid),'Email opens the availability task directly';
  insert into club_batting_private.phone_subscriptions(id,user_id,endpoint,p256dh,auth_key) values(sub,player_user,'https://example.invalid/test','test','test');
  insert into club_batting_private.phone_deliveries(subscription_id,club_id,kind,source_key,source_at) values(sub,c,'message',mid::text,now()) returning id into delivery;
  insert into club_batting_private.phone_preferences(subscription_id,club_id,messages,coaching,messages_since,coaching_since) values(sub,c,true,false,now(),now());
  perform set_config('request.jwt.claim.role','service_role',true);
  res:=club_batting_private.phone_worker('claim');assert exists(select 1 from jsonb_array_elements(res) e where e->>'id'=delivery::text and e->'payload'->>'url' like '%team_view=availability%'),'Phone alert opens availability directly';
  update club_selection_private.availability set unavailable_dates=jsonb_build_array(match_day::text) where roster_id=ps[1];
  assert club_batting_private.message_recipient_allowed(mid,player_user),'A second unanswered playing date still needs a reply';
  update club_selection_private.availability set available_dates=jsonb_build_array((match_day+7)::text) where roster_id=ps[1];
  assert not club_batting_private.message_recipient_allowed(mid,player_user),'Answering both dates cancels reminder';
  assert (select opened_at is null and deleted_at is not null from club_batting_private.club_message_recipients where message_id=mid and user_id=player_user),'Do not fake reading a message';
  assert (select status='cancelled' from public.outbound_messages where id=eid),'Queued email cancelled';
  assert (select status='cancelled' from club_batting_private.phone_deliveries where id=delivery),'Queued phone alert cancelled';
  assert not club_batting_private.phone_delivery_valid(delivery),'Delivery revalidation rejects an answered reminder';
  perform club_selection_private.run_availability_reminders(deadline+interval '10 minutes');assert (select count(*)=1 from club_selection_private.availability_reminders where club_id=c),'Explicit unavailability never chased';
  -- Published snapshots alone populate personal calendars; two dates have different, stable event identities.
  update club_selection_private.availability set available_dates=jsonb_build_array(match_day::text,(match_day+7)::text),unavailable_dates='[]' where roster_id=ps[1];
  res:=public.club_week_api(c,'calendar_create');token:=res->>'token';assert length(token)=64;
  assert jsonb_array_length(public.selection_calendar_feed(token)->'events')=0,'Drafts excluded from calendar';
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1,published_at=now() where id=any(fs[1:2]);
  feed:=public.selection_calendar_feed(token);assert jsonb_array_length(feed->'events')=2,'Both days of own match only';
  assert feed->'events'->0->>'uid'<>feed->'events'->1->>'uid','Day identities distinct';
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixture_id',fs[1],'publication',1);
  res:=public.club_week_api(c,'acknowledge',req);assert public.club_week_api(c,'acknowledge',req)=res;
  assert (select count(*)=1 from club_selection_private.team_acknowledgements where fixture_id=fs[1]),'Ack idempotent';
  rejected:=false;begin perform public.club_week_api(c,'acknowledge',req||jsonb_build_object('fixture_id',fs[2],'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Cannot acknowledge another team';
  update club_selection_private.fixtures set published=jsonb_set(published,'{details,ground}','"Changed ground"'),publication=2,published_at=now() where id=fs[1];
  assert public.selection_calendar_feed(token)->'events'->0->>'uid'=feed->'events'->0->>'uid','Ground update preserves UID';
  assert public.selection_calendar_feed(token)->'events'->0->'event'->>'ground'='Changed ground';
  perform club_selection_private.notify_publication_batch(c,jsonb_build_array(jsonb_build_object('fixture_id',fs[1],'old_snapshot',club_selection_private.draft_snapshot(fs[1]))));
  assert exists(select 1 from club_batting_private.club_messages where club_id=c and body like '%Ground changed: Changed ground%'),'Arrangement change is explicit in publication alert';
  assert public.club_week_api(c,'context')->'acknowledgements'->0->>'seen_at' is null,'Republishing requires a fresh acknowledgement';
  rejected:=false;begin perform public.club_week_api(c,'acknowledge',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Stale acknowledgement rejected';
  token2:=public.club_week_api(c,'calendar_create')->>'token';assert public.selection_calendar_feed(token) is null,'Replaced token revoked';
  assert jsonb_array_length(public.selection_calendar_feed(token2)->'events')=2;
  update club_selection_private.fixtures set published=jsonb_set(published,'{details,cancelled}','true'),publication=3,published_at=now() where id=fs[1];
  assert public.selection_calendar_feed(token2)->'events'->0->'event'->>'status'='CANCELLED','Cancellation retained with same UID';
  perform public.club_week_api(c,'calendar_revoke');assert public.selection_calendar_feed(token2) is null,'Revoked token fails closed';
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=4 where id=fs[1];
  -- A locked two-team Day 1 chain preserves both Day 2 partners and publication snapshots.
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  select jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'details',f.details,'slots',jsonb_set(f.slots,'{0,d1}',to_jsonb(case when f.id=fs[1] then ps[12] else ps[23] end::text))) order by f.id) into proposal from club_selection_private.fixtures f where f.id=any(fs[1:2]);
  req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',proposal,'withdrawn',jsonb_build_array(jsonb_build_object('roster_id',ps[1],'dates',jsonb_build_array(match_day::text))));
  select jsonb_agg(to_jsonb(f) order by f.id) into before_rows from club_selection_private.fixtures f where f.id=any(fs[1:2]);
  res:=public.club_week_api(c,'plan_save',req);plan_id:=(res->>'id')::uuid;
  assert public.club_week_api(c,'plan_save',req)=res,'Proposal retry creates one plan';
  assert (select jsonb_agg(to_jsonb(f) order by f.id)=before_rows from club_selection_private.fixtures f where f.id=any(fs[1:2])),'Proposing never unlocks or changes teams';
  assert (select count(*)=1 from club_selection_private.withdrawal_plans where club_id=c),'Exactly one proposal';
  rejected:=false;begin perform public.club_week_api(c,'plan_apply',jsonb_build_object('id',plan_id,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'Only the current Head%';end;assert rejected,'Selector cannot apply';
  perform set_config('request.jwt.claim.sub',player_user::text,true);assert public.club_week_api(c,'context')->'plans'='[]','Player cannot read proposals';
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  -- Concurrency and newly unavailable candidates both roll back the entire apply.
  update club_selection_private.fixtures set revision=revision+1 where id=fs[2];rejected:=false;
  begin perform public.club_week_api(c,'plan_apply',jsonb_build_object('id',plan_id,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'A team changed%';end;assert rejected,'Stale proposal rejected';
  update club_selection_private.fixtures set revision=revision-1 where id=fs[2];
  update club_selection_private.availability set available_dates=jsonb_build_array((match_day+7)::text),unavailable_dates=jsonb_build_array(match_day::text) where roster_id=ps[23];rejected:=false;
  begin perform public.club_week_api(c,'plan_apply',jsonb_build_object('id',plan_id,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'Mark availability%';end;assert rejected,'New unavailability checked at apply';
  assert (select jsonb_agg(to_jsonb(f) order by f.id)=before_rows from club_selection_private.fixtures f where f.id=any(fs[1:2])),'Failed apply rolls back all locks and changes';
  assert (select available_dates ? match_day::text from club_selection_private.availability where roster_id=ps[1]),'Failed apply rolls back withdrawal availability too';
  update club_selection_private.availability set available_dates=jsonb_build_array(match_day::text,(match_day+7)::text),unavailable_dates='[]' where roster_id=ps[23];
  -- During delegation, the current Acting Head alone applies the proposal.
  update club_selection_private.access set publication_delegate_id=selector_id,publication_delegate_from=current_date,publication_delegate_until=current_date+1 where club_id=c;
  rejected:=false;begin perform public.club_week_api(c,'plan_apply',jsonb_build_object('id',plan_id,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'Only the current Head%';end;assert rejected,'Original Head does not override active delegation';
  perform set_config('request.jwt.claim.sub',selector_id::text,true);req:=jsonb_build_object('id',plan_id,'request_id',gen_random_uuid());res:=public.club_week_api(c,'plan_apply',req);assert public.club_week_api(c,'plan_apply',req)=res,'Apply retry safe';
  assert (select slots->0->>'d1'=ps[12]::text and slots->0->>'d2'=ps[1]::text and published->'slots'->0->>'d1'=ps[1]::text from club_selection_private.fixtures where id=fs[1]),'Draft changed on Day 1 only; published team untouched';
  assert (select slots->0->>'d1'=ps[23]::text and slots->0->>'d2'=ps[12]::text from club_selection_private.fixtures where id=fs[2]),'Downstream vacancy filled without changing bracket partner';
  assert (select unavailable_dates ? match_day::text and available_dates ? (match_day+7)::text from club_selection_private.availability where roster_id=ps[1]),'Only withdrawn day becomes unavailable';
  assert (select state='applied' and applied_by=selector_id from club_selection_private.withdrawal_plans where id=plan_id);
  raise exception 'club_week_tests_rollback' using errcode='P2221';
 exception when sqlstate 'P2221' then null;
 end;
end $tests$;
