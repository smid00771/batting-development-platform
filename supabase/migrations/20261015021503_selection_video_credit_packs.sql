-- Six four-person hours = 86,400 participant-seconds. Purchased seconds never expire.
-- Existing City pilot usage stays on its original complimentary monthly policy.
create table club_selection_private.video_credit_config (
 singleton boolean primary key default true check(singleton),
 managed_enabled boolean not null default false,
 payments_ready boolean not null default false,
 stripe_account text not null default 'acct_1UOW6zAu7A65vqTZ',
 stripe_livemode boolean not null default true,
 webhook_secret_id uuid
);
insert into club_selection_private.video_credit_config(singleton) values(true);
create table club_selection_private.video_credit_packs (
 code text primary key, label text not null, seconds bigint not null check(seconds>0),
 amount_cents integer not null check(amount_cents>0), currency text not null check(currency='aud'),
 stripe_price_id text, payment_link_id text unique, payment_url text,
 active boolean not null default false,
 check(payment_url is null or payment_url ~ '^https://buy[.]stripe[.]com/[A-Za-z0-9_]+$')
);
insert into club_selection_private.video_credit_packs(code,label,seconds,amount_cents,currency) values
 ('video_5h','5 hours',72000,1500,'aud'),('video_24h','24 hours',345600,6000,'aud');
create table club_selection_private.video_credit_accounts (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 anchor_at timestamptz not null, created_at timestamptz not null default now()
);
create table club_selection_private.video_credit_periods (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,
 starts_at timestamptz not null,ends_at timestamptz not null,
 included_seconds bigint not null default 86400 check(included_seconds between 0 and 86400),
 unique(club_id,starts_at),check(ends_at>starts_at)
);
create table club_selection_private.video_credit_orders (
 id uuid primary key,club_id uuid not null references public.clubs(id) on delete cascade,
 requested_by uuid not null references auth.users(id),pack_code text not null references club_selection_private.video_credit_packs(code),
 seconds bigint not null,amount_cents integer not null,currency text not null,
 payment_link_id text not null,payment_url text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours'
);
create index video_credit_orders_club on club_selection_private.video_credit_orders(club_id,created_at desc);
create index video_credit_orders_user on club_selection_private.video_credit_orders(requested_by);
create index video_credit_orders_pack on club_selection_private.video_credit_orders(pack_code);
create table club_selection_private.video_credit_purchases (
 checkout_session text primary key,payment_intent text unique not null,
 order_id uuid not null references club_selection_private.video_credit_orders(id),
 club_id uuid not null references public.clubs(id) on delete cascade,
 seconds bigint not null,amount_cents integer not null,currency text not null,
 paid_at timestamptz not null,created_at timestamptz not null default now()
);
create index video_credit_purchases_club on club_selection_private.video_credit_purchases(club_id);
create index video_credit_purchases_order on club_selection_private.video_credit_purchases(order_id);
-- Kept separately so a refund arriving before the checkout event is not lost.
create table club_selection_private.video_credit_refunds (
 payment_intent text primary key,amount_refunded integer not null check(amount_refunded>=0),
 amount_cents integer not null check(amount_cents>0),currency text not null,updated_at timestamptz not null default now(),
 check(amount_refunded<=amount_cents)
);
create table club_selection_private.video_credit_payment_events (
 event_id text primary key,event_type text not null,object_id text,
 status text not null,reason text,created_at timestamptz not null default now()
);
alter table club_selection_private.selection_video_entries
 add column credit_period_id uuid references club_selection_private.video_credit_periods(id),
 add column included_reserved_seconds bigint not null default 0 check(included_reserved_seconds>=0),
 add constraint video_included_within_hold check(included_reserved_seconds<=reserved_minutes::bigint*60);
create index selection_video_entries_credit_period on club_selection_private.selection_video_entries(credit_period_id)
 where credit_period_id is not null;

do $$declare t text;begin
 foreach t in array array['video_credit_config','video_credit_packs','video_credit_accounts','video_credit_periods','video_credit_orders','video_credit_purchases','video_credit_refunds','video_credit_payment_events'] loop
  execute format('alter table club_selection_private.%I enable row level security',t);
  execute format('revoke all on club_selection_private.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- Internal helper: invoked only by the authenticated APIs or service-only payment handler.
create function club_selection_private.video_credit_balance(c uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a club_selection_private.video_credit_accounts%rowtype;p club_selection_private.video_credit_periods%rowtype;
 cfg club_selection_private.video_credit_config%rowtype;pol club_selection_private.selection_video_policy%rowtype;
 start_at timestamptz;end_at timestamptz;y integer;enabled boolean:=coalesce(club_selection_private.enabled(c),false);
 included_used bigint:=0;purchased_used bigint:=0;purchased_total bigint:=0;held bigint:=0;
 remaining bigint:=0;inc_remaining bigint:=0;pack_list jsonb;history jsonb;
 month_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,17701));
 select * into cfg from club_selection_private.video_credit_config where singleton;
 select * into pol from club_selection_private.selection_video_policy where club_id=c;
 -- Only existing explicitly enabled pilot policies retain legacy limits.
 if coalesce(pol.enabled,false) then
  select coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)),0),
   coalesce(sum(reserved_minutes::bigint*60) filter(where actual_seconds is null),0)
   into included_used,held from club_selection_private.selection_video_entries where club_id=c and created_at>=month_start;
  remaining:=greatest(0,pol.monthly_minutes::bigint*60-included_used);
  return jsonb_build_object('kind','complimentary','enabled',enabled,'available_seconds',remaining,
   'included_remaining_seconds',remaining,'purchased_remaining_seconds',0,'held_seconds',held,
   'renews_at',month_start+interval '1 month','low',remaining<=14400,'packs','[]'::jsonb,'history','[]'::jsonb,'payments_ready',false);
 end if;
 select * into a from club_selection_private.video_credit_accounts where club_id=c;
 if not found and enabled then
  insert into club_selection_private.video_credit_accounts(club_id,anchor_at)
   select c,least(now(),coalesce(s.active_from,ac.active_from,(now() at time zone ac.timezone)::date)::timestamp at time zone ac.timezone)
    from club_selection_private.access ac left join club_selection_private.subscriptions s on s.club_id=ac.club_id where ac.club_id=c
   on conflict(club_id) do nothing;
  select * into a from club_selection_private.video_credit_accounts where club_id=c;
 end if;
 if a.club_id is not null then
  y:=greatest(0,extract(year from age(now(),a.anchor_at))::integer);
  start_at:=a.anchor_at+make_interval(years=>y);end_at:=a.anchor_at+make_interval(years=>y+1);
  if enabled then
   insert into club_selection_private.video_credit_periods(club_id,starts_at,ends_at) values(c,start_at,end_at)
    on conflict(club_id,starts_at) do nothing;
  end if;
  select * into p from club_selection_private.video_credit_periods where club_id=c and starts_at=start_at;
 end if;
 if p.id is not null then
  select coalesce(sum(least(coalesce(actual_seconds,reserved_minutes::bigint*60),included_reserved_seconds)),0)
   into included_used from club_selection_private.selection_video_entries where credit_period_id=p.id;
  inc_remaining:=greatest(0,p.included_seconds-included_used);
 end if;
 select coalesce(sum(v.seconds-ceil(v.seconds::numeric*coalesce(r.amount_refunded,0)/v.amount_cents)::bigint),0)
  into purchased_total from club_selection_private.video_credit_purchases v
  left join club_selection_private.video_credit_refunds r on r.payment_intent=v.payment_intent where v.club_id=c;
 select coalesce(sum(greatest(0,coalesce(actual_seconds,reserved_minutes::bigint*60)-included_reserved_seconds)),0),
  coalesce(sum(reserved_minutes::bigint*60) filter(where actual_seconds is null),0)
  into purchased_used,held from club_selection_private.selection_video_entries where club_id=c and credit_period_id is not null;
 -- Refunded, already-used paid credit is debt; a renewal must not conceal it.
 remaining:=greatest(0,inc_remaining+purchased_total-purchased_used);
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'label',label,'seconds',seconds,'amount_cents',amount_cents,'currency',currency) order by amount_cents),'[]')
  into pack_list from club_selection_private.video_credit_packs where active and payment_link_id is not null and payment_url is not null;
 select coalesce(jsonb_agg(to_jsonb(h) order by h.paid_at desc),'[]') into history from
  (select v.paid_at,v.seconds,v.amount_cents,v.currency,coalesce(r.amount_refunded,0) as refunded_cents
   from club_selection_private.video_credit_purchases v left join club_selection_private.video_credit_refunds r on r.payment_intent=v.payment_intent
   where v.club_id=c order by v.paid_at desc limit 10) h;
 return jsonb_build_object('kind','annual','enabled',enabled and cfg.managed_enabled,'period_id',p.id,
  'available_seconds',remaining,'included_remaining_seconds',inc_remaining,
  'purchased_remaining_seconds',greatest(0,purchased_total-purchased_used),'debt_seconds',greatest(0,purchased_used-purchased_total),
  'held_seconds',held,'renews_at',end_at,'low',remaining<=14400,'packs',pack_list,'history',history,
  'payments_ready',enabled and cfg.managed_enabled and cfg.payments_ready);
end $$;
revoke all on function club_selection_private.video_credit_balance(uuid) from public,anon,authenticated;

create function club_selection_private.video_credit_api(c uuid,action text,d jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();admin boolean;balance jsonb;o club_selection_private.video_credit_orders%rowtype;
 pack club_selection_private.video_credit_packs%rowtype;rid uuid;
begin
 admin:=coalesce(public.is_club_admin(c),false) or exists(select 1 from public.clubs where id=c and lead_admin_user_id=me);
 if me is null or not coalesce(club_selection_private.member(c,me),false)
  or not (admin or coalesce(club_selection_private.selector(c,me),false)) then
  raise exception using errcode='42501',message='Club Admin or selector access required';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>2000 then raise exception 'Invalid video credit request';end if;
 balance:=club_selection_private.video_credit_balance(c);
 if action='balance' then
  return (balance-'period_id')||jsonb_build_object('can_top_up',admin and (balance->>'payments_ready')::boolean,
   'can_manage',admin);
 elsif action='checkout' then
  if not admin then raise exception using errcode='42501',message='Club Admin can buy extra video time';end if;
  if not coalesce((balance->>'payments_ready')::boolean,false) then raise exception 'Video top-ups are not available for this club';end if;
  rid:=(d->>'request_id')::uuid;if rid is null then raise exception 'Checkout request required';end if;
  select * into pack from club_selection_private.video_credit_packs where code=d->>'pack_code' and active;
  if not found or pack.payment_link_id is null or pack.payment_url is null then raise exception 'Choose an available video pack';end if;
  select * into o from club_selection_private.video_credit_orders where id=rid;
  if found then
   if o.club_id<>c or o.requested_by<>me or o.pack_code<>pack.code then raise exception 'Checkout request belongs to another purchase';end if;
   if o.expires_at<=now() then raise exception 'Checkout expired. Start a new purchase';end if;
  else
   insert into club_selection_private.video_credit_orders(id,club_id,requested_by,pack_code,seconds,amount_cents,currency,payment_link_id,payment_url)
    values(rid,c,me,pack.code,pack.seconds,pack.amount_cents,pack.currency,pack.payment_link_id,pack.payment_url) returning * into o;
  end if;
  return jsonb_build_object('url',o.payment_url||'?client_reference_id='||o.id::text,'order_id',o.id);
 end if;
 raise exception 'Unknown video credit action';
end $$;
create function public.selection_video_credit_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.video_credit_api(p_club_id,p_action,p_data)$$;
revoke all on function public.selection_video_credit_api(uuid,text,jsonb),club_selection_private.video_credit_api(uuid,text,jsonb) from public,anon;
grant execute on function public.selection_video_credit_api(uuid,text,jsonb),club_selection_private.video_credit_api(uuid,text,jsonb) to authenticated;

-- Service-only access to exactly this webhook secret; no Vault access is granted to clients.
create function club_selection_private.video_stripe_secret() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('secret',s.decrypted_secret,'account',c.stripe_account,'livemode',c.stripe_livemode)
 from club_selection_private.video_credit_config c left join vault.decrypted_secrets s on s.id=c.webhook_secret_id where c.singleton
$$;
create function public.selection_video_stripe_secret() returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.video_stripe_secret()$$;
revoke all on function public.selection_video_stripe_secret(),club_selection_private.video_stripe_secret() from public,anon,authenticated;
grant execute on function public.selection_video_stripe_secret(),club_selection_private.video_stripe_secret() to service_role;

create function club_selection_private.video_payment_event(e jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare obj jsonb:=e->'object';o club_selection_private.video_credit_orders%rowtype;existing club_selection_private.video_credit_purchases%rowtype;
 event_kind text:=e->>'type';state text:='ignored';reason text;ref uuid;intent text;amount integer;refunded integer;
 cfg club_selection_private.video_credit_config%rowtype;
begin
 if e is null or octet_length(e::text)>256000 or e->>'id' is null or jsonb_typeof(obj)<>'object' then raise exception 'Invalid payment event';end if;
 select * into cfg from club_selection_private.video_credit_config where singleton;
 if (e->>'livemode')::boolean is distinct from cfg.stripe_livemode then raise exception 'Wrong payment mode';end if;
 -- Serialize duplicates, including events with different IDs for the same payment.
 perform pg_advisory_xact_lock(hashtextextended(coalesce(obj->>'payment_intent',obj->>'id'),17702));
 if exists(select 1 from club_selection_private.video_credit_payment_events where event_id=e->>'id') then return jsonb_build_object('status','duplicate');end if;
 if event_kind in ('checkout.session.completed','checkout.session.async_payment_succeeded') then
  if not exists(select 1 from club_selection_private.video_credit_packs where payment_link_id=obj->>'payment_link') then state:='ignored';
  elsif obj->>'payment_status' is distinct from 'paid' then state:='awaiting_payment';
  else
   begin ref:=(obj->>'client_reference_id')::uuid;exception when invalid_text_representation then ref:=null;end;
   select * into o from club_selection_private.video_credit_orders where id=ref;
   intent:=obj->>'payment_intent';
   if o.id is null then reason:='unknown_order';
   elsif obj->>'object' is distinct from 'checkout.session' or obj->>'mode' is distinct from 'payment'
    or obj->>'status' is distinct from 'complete' or (obj->>'livemode')::boolean is distinct from cfg.stripe_livemode
    or obj->>'payment_link' is distinct from o.payment_link_id or obj->>'currency' is distinct from o.currency
    or (obj->>'amount_total')::bigint is distinct from o.amount_cents::bigint
    or (obj->>'amount_subtotal')::bigint is distinct from o.amount_cents::bigint
    or coalesce((obj#>>'{total_details,amount_discount}')::bigint,0)<>0
    or coalesce((obj#>>'{total_details,amount_tax}')::bigint,0)<>0
    or intent !~ '^pi_[A-Za-z0-9]+$' or intent is null or obj->>'id' !~ '^cs_[A-Za-z0-9_]+$'
    or obj->>'created' is null or to_timestamp((obj->>'created')::bigint)<o.created_at-interval '1 minute'
    or to_timestamp((obj->>'created')::bigint)>o.expires_at then reason:='order_mismatch';
   end if;
   if reason is null then
    perform pg_advisory_xact_lock(hashtextextended(o.club_id::text,17701));
    select * into existing from club_selection_private.video_credit_purchases where checkout_session=obj->>'id' or payment_intent=intent;
    if found then
     if existing.order_id<>o.id or existing.checkout_session<>obj->>'id' then reason:='payment_already_allocated';else state:='duplicate';end if;
    else
     insert into club_selection_private.video_credit_purchases(checkout_session,payment_intent,order_id,club_id,seconds,amount_cents,currency,paid_at)
      values(obj->>'id',intent,o.id,o.club_id,o.seconds,o.amount_cents,o.currency,to_timestamp((e->>'created')::bigint));
     state:='credited';
    end if;
   end if;
   if reason is not null then state:='review';end if;
  end if;
 elsif event_kind='charge.refunded' and obj->>'object'='charge' then
  intent:=obj->>'payment_intent';amount:=(obj->>'amount')::integer;refunded:=(obj->>'amount_refunded')::integer;
  if intent ~ '^pi_[A-Za-z0-9]+$' and amount>0 and refunded between 0 and amount and obj->>'currency'='aud' then
   select * into existing from club_selection_private.video_credit_purchases where payment_intent=intent;
   if found then perform pg_advisory_xact_lock(hashtextextended(existing.club_id::text,17701));end if;
   insert into club_selection_private.video_credit_refunds(payment_intent,amount_refunded,amount_cents,currency) values(intent,refunded,amount,obj->>'currency')
    on conflict(payment_intent) do update set amount_refunded=greatest(club_selection_private.video_credit_refunds.amount_refunded,excluded.amount_refunded),updated_at=now()
    where club_selection_private.video_credit_refunds.amount_cents=excluded.amount_cents and club_selection_private.video_credit_refunds.currency=excluded.currency;
   state:='refund_recorded';
  else state:='review';reason:='invalid_refund';end if;
 end if;
 insert into club_selection_private.video_credit_payment_events(event_id,event_type,object_id,status,reason)
  values(e->>'id',event_kind,obj->>'id',state,reason);
 return jsonb_build_object('status',state);
end $$;
create function public.selection_video_payment_event(p_event jsonb) returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.video_payment_event(p_event)$$;
revoke all on function public.selection_video_payment_event(jsonb),club_selection_private.video_payment_event(jsonb) from public,anon,authenticated;
grant execute on function public.selection_video_payment_event(jsonb),club_selection_private.video_payment_event(jsonb) to service_role;

-- Preserve the pilot and discussion API. New clubs reserve from their own wallet.
alter function club_selection_private.selection_room_api(uuid,text,jsonb) rename to selection_room_api_before_credits;
revoke all on function club_selection_private.selection_room_api_before_credits(uuid,text,jsonb) from public,anon,authenticated;
create function club_selection_private.selection_room_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=p_club_id;me uuid:=auth.uid();balance jsonb;result jsonb;rid uuid;
 entry club_selection_private.selection_video_entries%rowtype;call_row club_selection_private.selection_video_calls%rowtype;
 available bigint;cost integer;duration integer;planned integer;period uuid;
begin
 if me is null or not coalesce(club_selection_private.enabled(c),false) or not coalesce(club_selection_private.selector(c,me),false) then
  raise exception using errcode='42501',message='Selection Room is private to this club’s assigned selectors';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 then raise exception 'Invalid Selection Room request';end if;
 if p_action in ('access','context') then
  result:=club_selection_private.selection_room_api_before_credits(c,p_action,p_data);
  balance:=club_selection_private.video_credit_balance(c);
  return result||jsonb_build_object('video_enabled',(balance->>'enabled')::boolean,'video_credit',balance-'period_id');
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
   insert into club_selection_private.selection_video_calls(club_id,expires_at)
    values(c,least(now()+make_interval(secs=>duration),(balance->>'renews_at')::timestamptz)) returning * into call_row;
  end if;
  cost:=least(91,ceil(extract(epoch from (call_row.expires_at-now()))/60)::integer+1);
  if cost*60>available then raise exception 'Remaining video time is reserved for this call. Club Admin can add time. Selection chat stays available';end if;
  insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes,credit_period_id,included_reserved_seconds)
   values(rid,call_row.id,c,me,cost,period,least(cost::bigint*60,greatest(0,(balance->>'included_remaining_seconds')::bigint-(balance->>'debt_seconds')::bigint))) returning * into entry;
 end if;
 return jsonb_build_object('room_name','cb-'||replace(call_row.id::text,'-',''),'expires_at',call_row.expires_at,
  'entry_id',entry.id,'user_name',left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100));
end $$;
revoke all on function club_selection_private.selection_room_api(uuid,text,jsonb) from public,anon;
grant execute on function club_selection_private.selection_room_api(uuid,text,jsonb) to authenticated;

-- The verified usage worker now settles every enabled club.
create or replace function club_selection_private.selection_video_usage_worker(p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r uuid;call_uuid uuid;row_call club_selection_private.selection_video_calls%rowtype;
 calls jsonb;normalised jsonb;item jsonb;entry_uuid uuid;seconds bigint;entry_count integer;
begin
 if current_user<>'service_role' then raise exception using errcode='42501',message='Server usage worker only';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>250000 then raise exception 'Invalid usage work';end if;
 r:=(p_data->>'run_id')::uuid;
 if p_action='claim' then
  update club_selection_private.selection_video_usage_runs set claimed_at=now()
   where id=r and claimed_at is null and expires_at>now()
   and token_hash=encode(extensions.digest(p_data->>'token','sha256'),'hex');
  if not found then raise exception using errcode='42501',message='Invalid or expired worker capability';end if;
  with pending as (
   select c.id from club_selection_private.selection_video_calls c
    where (p_data->>'club_id' is null or c.club_id=(p_data->>'club_id')::uuid) and c.usage_settled_at is null and not c.usage_review_required
     and c.expires_at<now()-interval '2 minutes'
     and (c.usage_checked_at is null or c.usage_checked_at<now()-interval '3 minutes')
     and (c.usage_lease_until is null or c.usage_lease_until<now())
    order by c.expires_at for update skip locked limit 10
  ), leased as (
   update club_selection_private.selection_video_calls c set usage_run_id=r,usage_lease_until=now()+interval '5 minutes'
    from pending p where p.id=c.id returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'club_id',c.club_id,'created_at',c.created_at,'expires_at',c.expires_at,
   'entries',(select jsonb_agg(jsonb_build_object('id',e.id,'created_at',e.created_at,'reserved_minutes',e.reserved_minutes) order by e.id)
    from club_selection_private.selection_video_entries e where e.call_id=c.id))),'[]') into calls from leased c;
  return calls;
 end if;
 if p_action not in ('observe','defer') then raise exception 'Invalid usage action';end if;
 if not exists(select 1 from club_selection_private.selection_video_usage_runs where id=r and claimed_at is not null and expires_at>now()) then
  raise exception using errcode='42501',message='Worker run expired';
 end if;
 call_uuid:=(p_data->>'call_id')::uuid;
 -- Same lock as admission: returning credit and issuing new tokens are atomic.
 perform pg_advisory_xact_lock(16700,16700);
 select * into row_call from club_selection_private.selection_video_calls
  where id=call_uuid and usage_run_id=r and usage_lease_until>now() for update;
 if not found then raise exception 'Usage lease expired';end if;
 if row_call.usage_settled_at is not null or row_call.expires_at>=now()-interval '2 minutes' then raise exception 'Call not ready to settle';end if;
 if p_action='defer' then
  update club_selection_private.selection_video_calls set usage_checked_at=now(),usage_lease_until=null,usage_run_id=null,
   usage_error=left(coalesce(p_data->>'code','verification_failed'),100),
   usage_review_required=(p_data->>'code'='history_unavailable') where id=call_uuid;
  return jsonb_build_object('deferred',true);
 end if;
 if jsonb_typeof(p_data->'usage') is distinct from 'array' or jsonb_typeof(p_data->'records') is distinct from 'array' then raise exception 'Usage records required';end if;
 select count(*) into entry_count from club_selection_private.selection_video_entries where call_id=call_uuid;
 if entry_count=0 or jsonb_array_length(p_data->'usage')<>entry_count then raise exception 'Incomplete entry totals';end if;
 if (select count(distinct v->>'entry_id') from jsonb_array_elements(p_data->'usage')v)<>entry_count then raise exception 'Duplicate entry totals';end if;
 for item in select value from jsonb_array_elements(p_data->'usage') loop
  entry_uuid:=(item->>'entry_id')::uuid;
  if (item->>'seconds') !~ '^[0-9]{1,12}$' or item->>'seconds' is null then raise exception 'Invalid duration';end if;
  seconds:=(item->>'seconds')::bigint;
  if not exists(select 1 from club_selection_private.selection_video_entries e
   where e.id=entry_uuid and e.call_id=call_uuid and e.club_id=row_call.club_id and seconds<=e.reserved_minutes::bigint*60) then
   raise exception 'Usage does not match reservation';
  end if;
 end loop;
 select jsonb_agg(jsonb_build_object('entry_id',(v->>'entry_id')::uuid,'seconds',(v->>'seconds')::bigint) order by v->>'entry_id')
  into normalised from jsonb_array_elements(p_data->'usage')v;
 -- Two complete, identical provider reads, at least three minutes apart, avoid
 -- turning a transient empty/partial analytics response into a credit refund.
 if row_call.usage_snapshot is distinct from normalised or row_call.usage_records is distinct from p_data->'records' then
  update club_selection_private.selection_video_calls set usage_snapshot=normalised,usage_records=p_data->'records',
   usage_observed_at=now(),usage_checked_at=now(),usage_error=null,usage_lease_until=null,usage_run_id=null where id=call_uuid;
  return jsonb_build_object('settled',false);
 end if;
 if row_call.usage_observed_at>now()-interval '3 minutes' then raise exception 'Usage confirmation too soon';end if;
 update club_selection_private.selection_video_entries e set actual_seconds=(v->>'seconds')::bigint
  from jsonb_array_elements(normalised)v where e.id=(v->>'entry_id')::uuid and e.call_id=call_uuid;
 update club_selection_private.selection_video_calls set usage_settled_at=now(),usage_checked_at=now(),usage_error=null,
  usage_lease_until=null,usage_run_id=null where id=call_uuid;
 return jsonb_build_object('settled',true);
end $$;

create or replace function club_selection_private.schedule_video_usage_check() returns bigint
language plpgsql security invoker set search_path='' as $$
declare run_id uuid;token text;request_id bigint;pending integer;
begin
 if not pg_try_advisory_xact_lock(17600,17600) then return null;end if;
 delete from club_selection_private.selection_video_usage_runs where expires_at<now()-interval '1 day';
 select count(*) into pending from (select id from club_selection_private.selection_video_calls
  where usage_settled_at is null and not usage_review_required and expires_at<now()-interval '2 minutes'
   and (usage_checked_at is null or usage_checked_at<now()-interval '3 minutes')
   and (usage_lease_until is null or usage_lease_until<now()) limit 50) q;
 for i in 1..ceil(pending/10.0)::integer loop
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into club_selection_private.selection_video_usage_runs(token_hash)
   values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run_id;
  select net.http_post(url:='https://txrmgwoiowlqbuulmztd.supabase.co/functions/v1/selection-video-usage',
   headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('run_id',run_id,'token',token),timeout_milliseconds:=120000) into request_id;
 end loop;
 return request_id;
end $$;
select cron.alter_job((select jobid from cron.job where jobname='selection-video-actual-usage'),schedule:='* * * * *');

-- Commercial usage cannot consume the complimentary pilot cap.
create or replace function club_selection_private.selection_room_api_before_credits(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
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
    insert into club_selection_private.selection_video_calls(club_id,expires_at)
     values(c,least(now()+interval '90 minutes',month_start+interval '1 month')) returning * into call_row;
   end if;
   cost:=least(91,ceil(extract(epoch from (call_row.expires_at-now()))/60)::integer+1);
   select coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)) filter(where club_id=c),0),coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)),0) into club_used,total_used
    from club_selection_private.selection_video_entries where created_at>=month_start and credit_period_id is null;
   if club_used+cost::bigint*60>policy.monthly_minutes::bigint*60 or total_used+cost::bigint*60>9000::bigint*60 then raise exception 'This month’s video allowance is used. Use the backup call';end if;
   insert into club_selection_private.selection_video_entries(id,call_id,club_id,user_id,reserved_minutes)
    values(rid,call_row.id,c,me,cost) returning * into entry;
  end if;
  return jsonb_build_object('room_name','cb-'||replace(call_row.id::text,'-',''),'expires_at',call_row.expires_at,
   'entry_id',entry.id,'user_name',left(coalesce((select nullif(display_name,'') from public.user_profiles where user_id=me),'Selector'),100));
 end if;
 raise exception 'Unknown Selection Room action';
end $$;
