alter table club_selection_private.playhq_jobs add column last_manual_check timestamptz;

-- Reviewed source changes and shared result storage. Scheduling stays inactive.
alter table club_selection_private.playhq_links add column result_error text, add column last_change_token text;

create function club_selection_private.playhq_store_scorecard(c uuid,fid uuid,card jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare f club_selection_private.fixtures%rowtype;l club_selection_private.playhq_links%rowtype;
 conn club_selection_private.playhq_connections%rowtype;prior public.match_review_scorecards%rowtype;
 src club_selection_private.fixture_result_sources%rowtype;sid uuid;mid uuid;tid uuid;d jsonb;problem text;
begin
 select * into l from club_selection_private.playhq_links where fixture_id=fid and club_id=c for update;
 select * into f from club_selection_private.fixtures where id=fid and club_id=c;
 select * into conn from club_selection_private.playhq_connections where club_id=c;
 if l.fixture_id is null or card is null or card='null'::jsonb then return null;end if;
 if card->>'provider' is distinct from 'playhq_au' or card->>'upstream_match_id' is distinct from l.match_id::text or card->>'upstream_grade_id' is distinct from l.grade_id::text or card->>'upstream_team_id' is distinct from l.team_id::text or coalesce(card->>'status','') not in ('completed','in_progress') or jsonb_typeof(card->'innings') is distinct from 'array' or octet_length(card::text)>750000 then raise exception 'Invalid PlayHQ shared scorecard';end if;
 mid:=(card->>'match_id')::uuid;tid:=(card->>'our_team_id')::uuid;d:=coalesce(f.published->'details',f.details);
 if mid=l.match_id then raise exception 'PlayHQ source namespace required';end if;
 if not exists(select 1 from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text and t->>'source_team_id'=l.team_id::text) then raise exception 'Wrong shared scorecard team';end if;
 select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
 if src.no_play is not null or coalesce((d->>'cancelled')::boolean,false) then problem:='Check the no-play status before using these scores.';
 elsif src.source_match_id is not null and src.source_match_id<>mid or f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>mid::text then problem:='This fixture already has another scorecard. Its existing scores were kept.';
 elsif (select jsonb_agg(x->>'date' order by ord) from jsonb_array_elements(d->'days') with ordinality a(x,ord)) is distinct from card->'dates' or d->>'format' is distinct from card->>'format_key' then problem:='Review the changed fixture dates or format before using these scores.';
 elsif exists(select 1 from public.match_review_scorecards where club_id=c and source_match_id=l.match_id and scorecard->>'provider'='playcricket_au') then problem:='A PlayCricket scorecard may already cover this game. Link and review it first.';
 end if;
 if problem is not null then update club_selection_private.playhq_links set result_error=problem where fixture_id=fid;return null;end if;
 select * into prior from public.match_review_scorecards where club_id=c and source_match_id=mid order by created_at desc,id desc limit 1;
 if prior.id is not null and prior.scorecard=card then sid:=prior.id;
 else
  insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,conn.updated_by,card) returning id into sid;
 end if;
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(fid,c,mid,tid,conn.updated_by)
 on conflict(fixture_id) do update set source_match_id=excluded.source_match_id,team_id=excluded.team_id,updated_by=excluded.updated_by,updated_at=now();
 update club_selection_private.playhq_links set result_error=null where fixture_id=fid;
 return sid;
end $$;
revoke all on function club_selection_private.playhq_store_scorecard(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function club_selection_private.playhq_fixture_review(c uuid,action text,data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare f club_selection_private.fixtures%rowtype;l club_selection_private.playhq_links%rowtype;
 d jsonb;token text;blocks jsonb:='[]';warnings jsonb:='[]';result jsonb;tz text;
begin
 -- Reuse current membership and selector/admin authorisation, without key access.
 perform public.playhq_sync_api(c,'status');
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>2000 then raise exception 'Invalid fixture review request';end if;
 if action='list' then
  return jsonb_build_object('changes',coalesce((select jsonb_agg(jsonb_build_object('fixture_id',l.fixture_id,'grade',f.details->>'grade','opposition',f.details->>'opposition','days',f.details->'days','result_error',l.result_error,'pending',l.pending_fixture is not null) order by f.details->'days'->0->>'date') from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c where l.club_id=c and (l.pending_fixture is not null or l.result_error is not null)),'[]'));
 end if;
 if action not in ('preview','apply') then raise exception 'Unknown fixture review action';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into f from club_selection_private.fixtures where club_id=c and id=(data->>'fixture_id')::uuid for update;
 select * into l from club_selection_private.playhq_links where club_id=c and fixture_id=f.id for update;
 if l.fixture_id is null then raise exception 'Choose a linked club fixture';end if;
 if action='apply' and data->>'token'=l.last_change_token then return jsonb_build_object('saved',true,'already_saved',true);end if;
 if l.pending_fixture is null then raise exception 'No fixture change is waiting';end if;
 token:=md5(l.pending_fixture::text||f.details::text||f.revision::text);
 d:=f.details||jsonb_build_object('opposition',l.pending_fixture->>'opposition','format',l.pending_fixture->>'format','ground',coalesce(l.pending_fixture#>>'{days,0,ground}',''),'cancelled',coalesce((l.pending_fixture->>'cancelled')::boolean,false),
  'days',(select jsonb_agg(jsonb_build_object('date',x->>'date','start',x->>'time','ground',x->>'ground') order by ord) from jsonb_array_elements(l.pending_fixture->'days') with ordinality a(x,ord)));
 if coalesce((l.pending_fixture->>'requires_review')::boolean,true) then blocks:=blocks||jsonb_build_array('PlayHQ returned an unsupported format or status. Check the fixture manually.');end if;
 if f.published is not null and not coalesce(f.selection_unlocked_until>now(),false) then blocks:=blocks||jsonb_build_array('The Head of Selections must unlock this published team first.');end if;
 select timezone into tz from club_selection_private.access where club_id=c;
 begin perform club_selection_private.assert_selection_open(f.details,tz,f.selection_unlocked_until);exception when others then blocks:=blocks||jsonb_build_array(sqlerrm);end;
 begin perform club_selection_private.validate_details(d);exception when others then blocks:=blocks||jsonb_build_array(sqlerrm);end;
 if f.published is not null then warnings:=warnings||jsonb_build_array('The Head of Selections must review and republish the changed arrangements.');end if;
 if f.details->'days' is distinct from d->'days' then warnings:=warnings||jsonb_build_array('Check availability against the updated playing dates before publishing.');end if;
 if action='preview' then return jsonb_build_object('fixture_id',f.id,'revision',f.revision,'token',token,'before',f.details,'after',d,'can_apply',jsonb_array_length(blocks)=0,'blockers',blocks,'warnings',warnings);end if;
 if token is distinct from data->>'token' or f.revision is distinct from (data->>'revision')::integer then raise exception 'Fixture or source changed. Review a fresh preview';end if;
 if jsonb_array_length(blocks)>0 then raise exception '%',blocks->>0;end if;
 -- Existing save guards protect linked match records, duplicate dates and bracketing.
 result:=club_selection_private.api(c,'save_fixture',jsonb_build_object('id',f.id,'revision',f.revision,'details',d,'request_id',gen_random_uuid()));
 update club_selection_private.playhq_links set source_fixture=pending_fixture,pending_fixture=null,last_change_token=token where fixture_id=f.id;
 update club_selection_private.playhq_jobs set due_at=greatest(now(),(l.pending_fixture#>>'{days,0,start_at}')::timestamptz+interval '8 hours') where club_id=c and kind='results' and source_id=l.match_id and team_id=l.team_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'playhq_fixture_change',jsonb_build_object('fixture_id',f.id,'before',f.details,'after',d));
 return result||jsonb_build_object('requires_republish',f.published is not null);
end $$;
revoke all on function club_selection_private.playhq_fixture_review(uuid,text,jsonb) from public,anon;
grant execute on function club_selection_private.playhq_fixture_review(uuid,text,jsonb) to authenticated;
create function public.playhq_fixture_review(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.playhq_fixture_review(p_club_id,p_action,p_data)$$;
revoke all on function public.playhq_fixture_review(uuid,text,jsonb) from public,anon;
grant execute on function public.playhq_fixture_review(uuid,text,jsonb) to authenticated;

create or replace function public.playhq_sync_worker(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare c uuid:=(p_data->>'club_id')::uuid;conn club_selection_private.playhq_connections%rowtype;answer jsonb;sid uuid;j club_selection_private.playhq_jobs%rowtype; row jsonb;link club_selection_private.playhq_links%rowtype;next_due timestamptz;last_day date;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'Backend access required';end if;
 if p_action='claim' then
  delete from club_selection_private.playhq_runs where id=(p_data->>'run_id')::uuid and expires_at>now() and token_hash=encode(extensions.digest(p_data->>'token','sha256'),'hex') returning id into sid;
  if sid is null then raise exception 'Invalid scheduled check token';end if;
  select q.* into j from club_selection_private.playhq_jobs q join club_selection_private.playhq_connections x using(club_id)
   where x.polling_enabled and x.verified_at is not null and q.due_at<=now() and coalesce(q.leased_until,'-infinity')<now()
   order by q.due_at for update of q skip locked limit 1;
  if j.club_id is null then return null;end if;
  update club_selection_private.playhq_jobs set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1 where club_id=j.club_id and kind=j.kind and source_id=j.source_id and team_id=j.team_id returning * into j;
  return to_jsonb(j);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into conn from club_selection_private.playhq_connections where club_id=c for update;
 if conn.club_id is null then raise exception 'Configure the PlayHQ connection first';end if;
 if p_action='connection' then
  select jsonb_build_object('key',decrypted_secret,'organisation_id',conn.organisation_id,'association_id',conn.association_id,'generation',conn.generation,'timezone',coalesce(a.timezone,'Australia/Sydney')) into answer from vault.decrypted_secrets v left join club_selection_private.access a on a.club_id=c where v.id=conn.secret_id;
  return answer;
 end if;
 if conn.generation::text is distinct from p_data->>'generation' then raise exception 'Connection changed. Retry with the current connection';end if;
 if p_action='scorecard_context' then
  select jsonb_build_object('source_fixture',l.source_fixture,'grade',f.details->>'grade','competition',f.details->>'competition','timezone',a.timezone) into answer
  from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c join club_selection_private.access a on a.club_id=c
  where l.club_id=c and l.match_id=(p_data->>'match_id')::uuid and l.team_id=(p_data->>'team_id')::uuid;
  if answer is null then raise exception 'Linked fixture unavailable';end if;return answer;
 elsif p_action='claim_fixture' then
  select * into link from club_selection_private.playhq_links where club_id=c and fixture_id=(p_data->>'fixture_id')::uuid;
  if link.fixture_id is null or p_data->>'kind' not in ('fixtures','results') then raise exception 'Choose a linked fixture';end if;
  if conn.verified_at is null then raise exception 'Load seasons to verify the connection first';end if;
  select * into j from club_selection_private.playhq_jobs where club_id=c and kind=p_data->>'kind' and source_id=case when p_data->>'kind'='fixtures' then link.grade_id else link.match_id end and team_id=link.team_id for update;
  if j.club_id is null or coalesce(j.leased_until,'-infinity')>now() then raise exception 'A check is already running. Try again shortly';end if;
  if j.last_manual_check>now()-interval '30 seconds' then raise exception 'Wait 30 seconds before checking this match again';end if;
  update club_selection_private.playhq_jobs set last_manual_check=now(),lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=attempts+1 where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id returning * into j;
  return to_jsonb(j);
 elsif p_action='verified' then
  update club_selection_private.playhq_connections set verified_at=now(),last_error=null where club_id=c;
  return jsonb_build_object('verified',true);
 elsif p_action='error' then
  update club_selection_private.playhq_connections set last_error=left(p_data->>'error',200),polling_enabled=case when p_data->>'status' in ('401','403') then false else polling_enabled end,verified_at=case when p_data->>'status' in ('401','403') then null else verified_at end where club_id=c;
  return jsonb_build_object('saved',true);
 elsif p_action in ('finish','job_error') then
  select * into j from club_selection_private.playhq_jobs where club_id=c and kind=p_data#>>'{job,kind}' and source_id=(p_data#>>'{job,source_id}')::uuid and team_id=(p_data#>>'{job,team_id}')::uuid and lease_id=(p_data#>>'{job,lease_id}')::uuid and leased_until>now() for update;
  if j.club_id is null then raise exception 'Check lease expired';end if;
  if p_action='job_error' then
   if p_data->>'status' in ('401','403') then update club_selection_private.playhq_connections set polling_enabled=false,verified_at=null,last_error=left(p_data->>'error',200) where club_id=c;end if;
   update club_selection_private.playhq_jobs set leased_until=null,lease_id=null,last_error=left(p_data->>'error',200),due_at=now()+least(interval '24 hours',interval '15 minutes'*power(2,least(attempts,6))) where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
   if j.kind='results' then update club_selection_private.playhq_links set result_error=left(p_data->>'error',200) where club_id=c and match_id=j.source_id and team_id=j.team_id;end if;
   return jsonb_build_object('saved',true);
  end if;
  if octet_length(p_data::text)>5000000 then raise exception 'Provider response too large';end if;
  next_due:=now()+interval '24 hours';
  if j.kind='fixtures' then
   if jsonb_typeof(p_data#>'{result,fixtures}') is distinct from 'array' then raise exception 'Incomplete fixture check';end if;
   for row in select * from jsonb_array_elements(p_data#>'{result,fixtures}') loop
    select * into link from club_selection_private.playhq_links where club_id=c and grade_id=j.source_id and team_id=j.team_id and match_id=(row->>'source_match_id')::uuid for update;
    if link.fixture_id is null then continue;end if;
    -- Never change selected dates/publications behind an existing selection lock.
    -- Source changes are retained for the authorised fixture correction flow.
    if jsonb_build_array(row->'days',row->'format',row->'opposition',coalesce(row->'cancelled','false'::jsonb),row->'requires_review') is distinct from jsonb_build_array(link.source_fixture->'days',link.source_fixture->'format',link.source_fixture->'opposition',coalesce(link.source_fixture->'cancelled','false'::jsonb),link.source_fixture->'requires_review') then
     update club_selection_private.playhq_links set pending_fixture=row where fixture_id=link.fixture_id;
    else
     update club_selection_private.playhq_links set pending_fixture=null,source_fixture=row where fixture_id=link.fixture_id;
    end if;
    if (row#>>'{days,0,date}')::date between current_date and current_date+2 then next_due:=least(next_due,now()+interval '4 hours');end if;
   end loop;
  else
   if p_data#>>'{result,source_match_id}' is distinct from j.source_id::text then raise exception 'Wrong match result';end if;
   update club_selection_private.playhq_links set summary=(p_data->'result')-'shared_scorecard',summary_checked_at=now() where club_id=c and match_id=j.source_id and team_id=j.team_id returning * into link;
   perform club_selection_private.playhq_store_scorecard(c,link.fixture_id,p_data#>'{result,shared_scorecard}');
   select max((x->>'date')::date) into last_day from jsonb_array_elements(link.source_fixture->'days') x;
   next_due:=now()+case when last_day>=current_date-3 then interval '4 hours' when last_day>=current_date-14 then interval '1 day' else interval '7 days' end;
  end if;
  update club_selection_private.playhq_jobs set lease_id=null,leased_until=null,attempts=0,last_error=null,due_at=next_due where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
  return jsonb_build_object('saved',true);
 elsif p_action='preview' then
  if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or octet_length(p_data::text)>2000000 then raise exception 'Invalid preview';end if;
  insert into club_selection_private.playhq_previews(club_id,generation,season_id,grade_id,team_id,fixtures) values(c,conn.generation,(p_data->>'season_id')::uuid,(p_data->>'grade_id')::uuid,(p_data->>'team_id')::uuid,p_data->'fixtures') returning id into sid;
  delete from club_selection_private.playhq_previews where club_id=c and created_at<now()-interval '1 day';
  return jsonb_build_object('preview_id',sid);
 end if;
 raise exception 'Unknown worker action';
end $$;
revoke all on function public.playhq_sync_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.playhq_sync_worker(text,jsonb) to service_role;


CREATE OR REPLACE FUNCTION club_selection_private.match_results_api(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare me uuid:=auth.uid();social boolean;coach boolean;selecting boolean;last_day date;first_day date;cards jsonb;card jsonb;choices jsonb;
 f club_selection_private.fixtures%rowtype;src club_selection_private.fixture_result_sources%rowtype;
 snapshot public.match_review_scorecards%rowtype;d jsonb;team text;match_id uuid;sid uuid;fid uuid;grade text;preview jsonb;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then raise exception 'Current club membership is required';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>5000 then raise exception 'Invalid results request';end if;
 social:=club_selection_private.social_allowed(c);coach:=club_batting_private.team_review_staff(c);selecting:=club_selection_private.enabled(c) and club_selection_private.selector(c,me);
 if not social and not coach and not selecting then raise exception 'Selection, coaching or socials access is required';end if;
 if action in ('fixture','fixture_access') then
  fid:=nullif(data->>'fixture_id','')::uuid;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null then raise exception 'Choose a fixture in this club';end if;
  if not social and not selecting and not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
  if action='fixture_access' then return jsonb_build_object('allowed',true);end if;
  d:=coalesce(f.published->'details',f.details);
  first_day:=(d->'days'->0->>'date')::date;
  select max((day->>'date')::date) into last_day from jsonb_array_elements(d->'days') day;
  select * into src from club_selection_private.fixture_result_sources where fixture_id=fid and club_id=c;
  match_id:=coalesce(src.source_match_id,nullif(f.scorecard_sync->>'match_id','')::uuid);
  cards:=club_selection_private.shared_result_cards(c,first_day,last_day);
  return jsonb_build_object('playhq',(select jsonb_build_object('linked',true,'can_check',selecting or public.is_club_admin(c),'pending_change',l.pending_fixture is not null,'error',l.result_error,'checked_at',l.summary_checked_at) from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=fid),'week_end',last_day,'fixtures',jsonb_build_array(jsonb_build_object('id',f.id,'grade',d->>'grade','opposition',d->>'opposition','format',d->>'format','days',d->'days','cancelled',coalesce((d->>'cancelled')::boolean,false),'match_id',match_id,'no_play',src.no_play)),
   'cards',coalesce((select jsonb_agg(x) from jsonb_array_elements(cards) x where x#>>'{scorecard,dates,0}'=first_day::text and x#>>'{scorecard,format_key}'=d->>'format' and (nullif(x->>'fixture_id','') is null or x->>'fixture_id'=fid::text or x#>>'{scorecard,match_id}'=match_id::text)),'[]'));
 end if;
 if action='context' then
  if not social then raise exception 'Club socials access is required';end if;
  last_day:=(data->>'week_end')::date;if last_day is null then raise exception 'Choose a week';end if;first_day:=last_day-6;
  cards:=club_selection_private.shared_result_cards(c,first_day,last_day);
  return jsonb_build_object('week_end',last_day,'cards',cards,'fixtures',coalesce((
   select jsonb_agg(jsonb_build_object('id',f.id,'grade',d->>'grade','opposition',d->>'opposition','format',d->>'format','days',d->'days',
    'cancelled',coalesce((d->>'cancelled')::boolean,false),'match_id',coalesce(l.source_match_id::text,f.scorecard_sync->>'match_id'),'no_play',l.no_play) order by d->'days'->0->>'date',d->>'grade',f.id)
   from club_selection_private.fixtures f cross join lateral(select coalesce(f.published->'details',f.details) d) v
   left join club_selection_private.fixture_result_sources l on l.club_id=c and l.fixture_id=f.id
   where f.club_id=c and exists(select 1 from jsonb_array_elements(d->'days') day where day->>'date' between first_day::text and last_day::text)
  ),'[]'));
 elsif action='review' then
  if not coach then raise exception 'Current club coaching access is required';end if;
  first_day:=(data->>'match_date')::date;if first_day is null then raise exception 'Choose a match date';end if;
  fid:=nullif(data->>'fixture_id','')::uuid;
  if fid is not null then
   if not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
   select * into f from club_selection_private.fixtures where id=fid and club_id=c;
   select * into src from club_selection_private.fixture_result_sources where fixture_id=fid and club_id=c;
   match_id:=coalesce(src.source_match_id,nullif(f.scorecard_sync->>'match_id','')::uuid);grade:=f.details->>'grade';
  elsif nullif(data->>'group_id','') is not null then
   select g.name into grade from public.playing_groups g where g.club_id=c and g.id=(data->>'group_id')::uuid and g.active;
  end if;
  match_id:=coalesce(match_id,nullif(data->>'existing_match_id','')::uuid);
  cards:=club_selection_private.shared_result_cards(c,first_day,first_day);
  select coalesce(jsonb_agg(x),'[]') into choices from jsonb_array_elements(cards) x
   where x#>>'{scorecard,dates,0}'=first_day::text and (nullif(data->>'format_key','') is null or x#>>'{scorecard,format_key}'=data->>'format_key');
  sid:=nullif(data->>'snapshot_id','')::uuid;
  if sid is not null then
   select x into card from jsonb_array_elements(choices) x where x->>'snapshot_id'=sid::text;
   if card is null then raise exception 'Choose a scorecard for this match date and format';end if;
  elsif match_id is not null then
   select x into card from jsonb_array_elements(choices) x where x#>>'{scorecard,match_id}'=match_id::text;
  else
   select case when count(*)=1 then jsonb_agg(x)->0 end into card from jsonb_array_elements(choices) x
    where grade is not null and regexp_replace(lower(coalesce(x->>'grade_hint',x#>>'{scorecard,grade}')),'[^a-z0-9]','','g')=regexp_replace(lower(grade),'[^a-z0-9]','','g');
  end if;
  if card is not null then
   preview:=club_batting_private.get_match_review_scorecard(c,(card->>'snapshot_id')::uuid)||jsonb_build_object('our_team_id',card->'our_team');
  end if;
  return jsonb_build_object('preview',preview,'choices',coalesce((select jsonb_agg(jsonb_build_object('snapshot_id',x->'snapshot_id','grade',x#>'{scorecard,grade}','teams',x#>'{scorecard,teams}','match_id',x#>'{scorecard,match_id}')) from jsonb_array_elements(choices) x),'[]'));
 end if;
 if action not in ('link','identify','no_play') then raise exception 'Unknown results action';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,19900));
 fid:=nullif(data->>'fixture_id','')::uuid;
 if selecting and not social and not coach and fid is null then raise exception 'Choose a club fixture';end if;
 if fid is not null then
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null then raise exception 'Choose a fixture in this club';end if;
  if not social and not selecting and not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
  select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
  d:=coalesce(f.published->'details',f.details);
 end if;
 if action='no_play' then
  if fid is null then raise exception 'Choose a club fixture';end if;
  if src.source_match_id is not null or f.scorecard_sync->>'match_id' is not null then raise exception 'A scorecard is already linked. Check the PlayCricket result';end if;
  if coalesce(data->>'reason','')='' then delete from club_selection_private.fixture_result_sources where fixture_id=fid and no_play is not null;
  else
   if data->>'reason' not in ('washed_out','bye','cancelled') then raise exception 'Choose why the match did not take place';end if;
   insert into club_selection_private.fixture_result_sources(fixture_id,club_id,no_play,updated_by) values(fid,c,data->>'reason',me)
    on conflict(fixture_id) do update set no_play=excluded.no_play,updated_by=me,updated_at=now();
  end if;
 else
  sid:=(data->>'snapshot_id')::uuid;
  select * into snapshot from public.match_review_scorecards where id=sid and club_id=c;
  if snapshot.id is null then raise exception 'Choose a scorecard imported for this club';end if;
  -- Use the latest version even if another volunteer refreshed during this request.
  select * into snapshot from public.match_review_scorecards where club_id=c and source_match_id=snapshot.source_match_id order by created_at desc,id desc limit 1;
  card:=snapshot.scorecard;team:=coalesce(nullif(data->>'team_id',''),(select t.team_id::text from club_selection_private.team_week_sources t where t.club_id=c and t.source_match_id=snapshot.source_match_id),club_batting_private.scorecard_club_team(c,card));
  if team is not null and not exists(select 1 from jsonb_array_elements(card->'teams') x where x->>'id'=team) then raise exception 'Choose our team from this scorecard';end if;
  if action='identify' and team is null then raise exception 'Choose our team';end if;
  if action='link' then
   if fid is null then raise exception 'Choose a club fixture';end if;
   if d->'days'->0->>'date' is distinct from card->'dates'->>0 or d->>'format' is distinct from card->>'format_key' then raise exception 'This scorecard has a different match date or format';end if;
   if src.source_match_id is not null and src.source_match_id<>snapshot.source_match_id and src.source_match_id is distinct from nullif(data->>'expected_match_id','')::uuid then raise exception 'The match link changed. Refresh results before replacing it';end if;
   if f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>snapshot.source_match_id::text then raise exception 'This team is confirmed against a different PlayCricket match';end if;
   insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(fid,c,snapshot.source_match_id,team::uuid,me)
    on conflict(fixture_id) do update set source_match_id=excluded.source_match_id,team_id=excluded.team_id,no_play=null,updated_by=me,updated_at=now();
  end if;
  if team is not null then
   insert into club_selection_private.team_week_sources(club_id,source_match_id,team_id,updated_by) values(c,snapshot.source_match_id,team::uuid,me)
    on conflict(club_id,source_match_id) do update set team_id=excluded.team_id,updated_by=me;
   update club_selection_private.fixture_result_sources set team_id=team::uuid,updated_by=me,updated_at=now() where club_id=c and source_match_id=snapshot.source_match_id;
  end if;
 end if;
 if action in ('link','identify') and fid is not null and team is not null then
  perform club_selection_private.link_selected_scorecard_players(c,snapshot.id,fid,team::uuid,me);
 end if;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'shared_result_'||action,jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',team,'reason',data->>'reason'));
 return jsonb_build_object('saved',true);
end $function$
;
