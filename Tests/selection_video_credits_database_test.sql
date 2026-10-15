-- All synthetic data and configuration changes are rolled back, including on failure.
do $tests$
declare c uuid:=gen_random_uuid();other uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();selector_id uuid:=gen_random_uuid();
 b jsonb;r jsonb;e jsonb;obj jsonb;order_id uuid:=gen_random_uuid();entry_id uuid:=gen_random_uuid();paid_entry uuid:=gen_random_uuid();
 period_id uuid;call_id uuid;blocked boolean;anchor timestamptz;before_count integer;
begin
 begin
  insert into auth.users(id,email) values(admin_id,'credit-admin-'||admin_id||'@example.invalid'),(selector_id,'credit-selector-'||selector_id||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(admin_id,'Credit test admin'),(selector_id,'Credit test selector');
  insert into public.clubs(id,name,slug,created_by) values(c,'Credit test club','credit-'||c,admin_id),(other,'Other credit test club','credit-'||other,admin_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,admin_id,'player','admin'),(c,selector_id,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone,head_selector_id,active_from)
   values(c,'standalone','active','Australia/Sydney',selector_id,current_date-1),(other,'standalone','active','Australia/Sydney',admin_id,current_date-1);
  update club_selection_private.video_credit_config set managed_enabled=true,payments_ready=true;
  update club_selection_private.video_credit_packs set active=true,payment_link_id='plink_test_'||code,payment_url='https://buy.stripe.com/test_'||code;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('role','authenticated',true);
  b:=public.selection_video_credit_api(c,'balance');assert (b->>'available_seconds')::bigint=86400,'Six hours for four people';assert (b->>'can_top_up')::boolean;
  perform public.selection_video_credit_api(c,'balance');
  blocked:=false;begin perform public.selection_video_credit_api(other,'balance');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Other-club balance is private';
  blocked:=false;begin perform public.selection_video_payment_event('{}');exception when insufficient_privilege then blocked:=true;end;assert blocked,'Clients cannot credit payments';
  blocked:=false;begin perform public.selection_video_stripe_secret();exception when insufficient_privilege then blocked:=true;end;assert blocked,'Clients cannot read signing secrets';
  perform set_config('request.jwt.claim.sub',selector_id::text,true);
  b:=public.selection_video_credit_api(c,'balance');assert not (b->>'can_top_up')::boolean;
  blocked:=false;begin perform public.selection_video_credit_api(c,'checkout',jsonb_build_object('pack_code','video_5h','request_id',order_id));exception when insufficient_privilege then blocked:=true;end;assert blocked,'Selectors cannot buy for the club';
  r:=public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',entry_id));
  assert r->>'entry_id'=entry_id::text;
  assert public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',entry_id))=r,'Join retry reserves once';
  b:=public.selection_video_credit_api(c,'balance');assert (b->>'held_seconds')::bigint=5460;assert (b->>'available_seconds')::bigint=80940;
  perform set_config('role','postgres',true);
  assert (select count(*)=1 from club_selection_private.video_credit_periods where club_id=c),'Repeat reads do not grant twice';
  select credit_period_id,selection_video_entries.call_id into period_id,call_id from club_selection_private.selection_video_entries where id=entry_id;
  update club_selection_private.selection_video_entries set actual_seconds=1200 where id=entry_id;
  b:=club_selection_private.video_credit_balance(c);assert (b->>'available_seconds')::bigint=85200,'Only connected seconds are consumed';
  update club_selection_private.selection_video_entries set actual_seconds=0 where id=entry_id;
  insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes,actual_seconds,credit_period_id,included_reserved_seconds)
   select gen_random_uuid(),call_id,c,selector_id,90,5400,period_id,5400 from generate_series(1,16);
  perform set_config('role','authenticated',true);
  blocked:=false;begin perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then blocked:=true;end;assert blocked,'Exhausted credit blocks new video';
  r:=public.selection_room_api(c,'post',jsonb_build_object('request_id',gen_random_uuid(),'body','Chat still works'));
  assert r#>>'{message,body}'='Chat still works','Chat remains available without credit';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  r:=public.selection_video_credit_api(c,'checkout',jsonb_build_object('pack_code','video_5h','request_id',order_id));
  assert r->>'url'='https://buy.stripe.com/test_video_5h?client_reference_id='||order_id::text;
  assert public.selection_video_credit_api(c,'checkout',jsonb_build_object('pack_code','video_5h','request_id',order_id))=r;
  perform set_config('role','postgres',true);
  obj:=jsonb_build_object('object','checkout.session','id','cs_test_'||replace(order_id::text,'-',''),'payment_intent','pi_test'||replace(order_id::text,'-',''),
   'payment_link','plink_test_video_5h','client_reference_id',order_id,'mode','payment','status','complete','livemode',true,'payment_status','unpaid',
   'currency','aud','amount_total',1500,'amount_subtotal',1500,'total_details',jsonb_build_object('amount_discount',0,'amount_tax',0),'created',extract(epoch from now())::bigint);
  e:=jsonb_build_object('id','evt_pending_'||order_id,'type','checkout.session.completed','created',extract(epoch from now())::bigint,'livemode',true,'object',obj);
  perform set_config('role','service_role',true);
  assert public.selection_video_payment_event(e)->>'status'='awaiting_payment';
  perform set_config('role','postgres',true);
  assert not exists(select 1 from club_selection_private.video_credit_purchases where club_id=c),'Unpaid checkout grants nothing';
  e:=jsonb_set(jsonb_set(jsonb_set(e,'{id}',to_jsonb('evt_paid_'||order_id)),'{type}','"checkout.session.async_payment_succeeded"'),'{object,payment_status}','"paid"');
  perform set_config('role','service_role',true);
  assert public.selection_video_payment_event(e)->>'status'='credited';
  assert public.selection_video_payment_event(e)->>'status'='duplicate';
  assert public.selection_video_payment_event(jsonb_set(e,'{id}',to_jsonb('evt_repeat_'||order_id)))->>'status'='duplicate','Different event IDs cannot double-credit a session';
  perform set_config('role','postgres',true);
  assert (select count(*)=1 from club_selection_private.video_credit_purchases where club_id=c);
  b:=club_selection_private.video_credit_balance(c);assert (b->>'available_seconds')::bigint=72000;
  perform set_config('role','service_role',true);
  assert public.selection_video_payment_event(jsonb_set(jsonb_set(e,'{id}',to_jsonb('evt_bad_amount_'||order_id)),'{object,amount_total}','100'))->>'status'='review';
  assert public.selection_video_payment_event(jsonb_set(jsonb_set(e,'{id}',to_jsonb('evt_bad_order_'||order_id)),'{object,client_reference_id}',to_jsonb(gen_random_uuid())))->>'status'='review';
  perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',selector_id::text,true);
  perform public.selection_room_api(c,'reserve_video',jsonb_build_object('request_id',paid_entry));
  perform set_config('role','postgres',true);
  assert (select included_reserved_seconds=0 from club_selection_private.selection_video_entries where id=paid_entry),'Included credit is used before paid credit';
  update club_selection_private.selection_video_entries set actual_seconds=1200 where id=paid_entry;
  b:=club_selection_private.video_credit_balance(c);assert (b->>'purchased_remaining_seconds')::bigint=70800;
  -- Move the anniversary past a full year; purchases and old holds retain their original identity.
  update club_selection_private.video_credit_accounts set anchor_at=anchor_at-interval '1 year' where club_id=c;
  update club_selection_private.video_credit_periods set starts_at=starts_at-interval '1 year',ends_at=ends_at-interval '1 year' where id=period_id;
  b:=club_selection_private.video_credit_balance(c);assert (b->>'included_remaining_seconds')::bigint=86400;assert (b->>'purchased_remaining_seconds')::bigint=70800,'Paid credit carries forward';
  update club_selection_private.selection_video_entries set actual_seconds=0 where id=entry_id;
  b:=club_selection_private.video_credit_balance(c);assert (b->>'included_remaining_seconds')::bigint=86400,'Old-period refunds do not add to the new annual allowance';
  perform set_config('role','service_role',true);
  r:=public.selection_video_payment_event(jsonb_build_object('id','evt_refund_'||order_id,'type','charge.refunded','livemode',true,'object',jsonb_build_object('object','charge','id','ch_test','payment_intent',obj->>'payment_intent','amount',1500,'amount_refunded',750,'currency','aud')));
  assert r->>'status'='refund_recorded';
  perform set_config('role','postgres',true);
  b:=club_selection_private.video_credit_balance(c);assert (b->>'purchased_remaining_seconds')::bigint=34800,'A partial refund removes the proportional credit';
  update club_selection_private.access set valid_until=current_date-1 where club_id=c;
  b:=club_selection_private.video_credit_balance(c);assert not (b->>'enabled')::boolean;assert (b->>'purchased_remaining_seconds')::bigint=34800,'Expiry preserves paid balance';
  assert not has_table_privilege('authenticated','club_selection_private.video_credit_purchases','SELECT,INSERT,UPDATE,DELETE');
  assert not has_function_privilege('authenticated','club_selection_private.selection_room_api_before_credits(uuid,text,jsonb)','EXECUTE');
  assert not has_function_privilege('anon','public.selection_video_credit_api(uuid,text,jsonb)','EXECUTE');
  raise exception using errcode='P0177',message='Rollback video credit test fixtures';
 exception when sqlstate 'P0177' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Video credits: grants, club isolation, admin checkout, hold settlement, paid confirmation, duplicate events, annual rollover, refunds and access expiry passed; fixtures rolled back' as result;
