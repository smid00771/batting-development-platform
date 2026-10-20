-- Add read-only call usage to the existing authorised balance response.
-- No changes to reservations, charges, permissions, or saved team data.
CREATE OR REPLACE FUNCTION club_selection_private.video_credit_balance(c uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a club_selection_private.video_credit_accounts%rowtype;p club_selection_private.video_credit_periods%rowtype;
 cfg club_selection_private.video_credit_config%rowtype;pol club_selection_private.selection_video_policy%rowtype;
 start_at timestamptz;end_at timestamptz;y integer;enabled boolean:=coalesce(club_selection_private.enabled(c),false);
 included_used bigint:=0;purchased_used bigint:=0;purchased_total bigint:=0;held bigint:=0;
 remaining bigint:=0;inc_remaining bigint:=0;pack_list jsonb;history jsonb;latest_call jsonb;
 month_start timestamptz:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,17701));
 -- Display provider-confirmed usage only. Reservations and settlement are unchanged.
 select jsonb_build_object(
  'created_at',v.created_at,'expires_at',v.expires_at,
  'status',case when v.usage_settled_at is not null then 'confirmed' when v.usage_review_required then 'review' else 'pending' end,
  'participant_seconds',case when v.usage_settled_at is not null then coalesce(u.seconds,0) end,
  'people',case when v.usage_settled_at is not null then u.people end,
  'call_seconds',case when v.usage_settled_at is not null and (coalesce(u.seconds,0)=0 or t.seconds is not null) then coalesce(t.seconds,0) end)
 into latest_call
 from (select * from club_selection_private.selection_video_calls where club_id=c order by created_at desc,id desc limit 1) v
 left join lateral (
  select sum(e.actual_seconds) as seconds,count(distinct e.user_id) filter(where e.actual_seconds>0) as people
  from club_selection_private.selection_video_entries e where e.call_id=v.id and e.club_id=c
 )u on true
 left join lateral (
  -- Union overlapping connections; reconnect gaps are not connected call time.
  select sum(upper(span)-lower(span))::bigint as seconds from unnest((
   select range_agg(numrange((r->>'join_time')::numeric,(r->>'join_time')::numeric+(r->>'duration')::numeric,'[)'))
   from jsonb_array_elements(case when v.usage_settled_at is not null then coalesce(v.usage_records,'[]'::jsonb) else '[]'::jsonb end) r
  )) span
 )t on true;

 select * into cfg from club_selection_private.video_credit_config where singleton;
 select * into pol from club_selection_private.selection_video_policy where club_id=c;
 -- Only existing explicitly enabled pilot policies retain legacy limits.
 if coalesce(pol.enabled,false) then
  select coalesce(sum(coalesce(actual_seconds,reserved_minutes::bigint*60)),0),
   coalesce(sum(reserved_minutes::bigint*60) filter(where actual_seconds is null),0)
   into included_used,held from club_selection_private.selection_video_entries where club_id=c and created_at>=month_start;
  remaining:=greatest(0,pol.monthly_minutes::bigint*60-included_used);
  return jsonb_build_object('kind','complimentary','enabled',enabled,'available_seconds',remaining,
   'included_remaining_seconds',remaining,'purchased_remaining_seconds',0,'held_seconds',held,'latest_call',latest_call,
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
  'held_seconds',held,'latest_call',latest_call,'renews_at',end_at,'low',remaining<=14400,'packs',pack_list,'history',history,
  'payments_ready',enabled and cfg.managed_enabled and cfg.payments_ready);
end $function$;
