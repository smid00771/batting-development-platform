-- Opt-in, per-innings social achievements. No work is added to player startup.
alter table club_selection_private.social_award_settings
 add column milestone_alerts boolean not null default false,
 add column milestone_alerts_since timestamptz;

create table club_selection_private.social_milestone_alerts(
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete cascade,
 source_match_id uuid not null,
 performance_key text not null,
 kind text not null check(kind in ('century','five_wickets')),
 snapshot_id uuid references public.match_review_scorecards(id) on delete set null,
 performance jsonb not null,
 message_id uuid references club_batting_private.club_messages(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(club_id,performance_key)
);
create index social_milestone_message on club_selection_private.social_milestone_alerts(message_id);
create index social_milestone_source on club_selection_private.social_milestone_alerts(club_id,source_match_id);
create index social_milestone_snapshot on club_selection_private.social_milestone_alerts(snapshot_id);
alter table club_selection_private.social_milestone_alerts enable row level security;
revoke all on club_selection_private.social_milestone_alerts from public,anon,authenticated;

-- Source-normalised facts only: one innings, one source player, our confirmed team.
-- An achievement is usable during play; this never creates a match result.
create function club_selection_private.social_milestone_candidates(cards jsonb) returns jsonb
language sql immutable set search_path='' as $$
 with matches as (
  select x->>'snapshot_id' snapshot_id,x->>'our_team' our_team,x->'scorecard' card
  from jsonb_array_elements(coalesce(cards,'[]')) x
  where nullif(x->>'our_team','') is not null and x#>>'{scorecard,schema_version}'='2'
   and x#>>'{scorecard,status}' in ('completed','in_progress')
 ), performances as (
  select m.*,'century' kind,i->>'id' innings_id,i->>'number' innings_number,b stat
  from matches m cross join lateral jsonb_array_elements(card->'innings') i
  cross join lateral jsonb_array_elements(coalesce(i->'batters','[]')) b
  where i->>'team_id'=our_team and b->>'status'='played'
   and (b->>'figures_valid'='true' or b->>'importable'='true')
   and jsonb_typeof(b->'not_out')='boolean'
   and case when b->>'runs' ~ '^\d{1,4}$' then (b->>'runs')::integer>=100 else false end
  union all
  select m.*,'five_wickets',i->>'id',i->>'number',b
  from matches m cross join lateral jsonb_array_elements(card->'innings') i
  cross join lateral jsonb_array_elements(coalesce(i->'bowlers','[]')) b
  where i->>'team_id'<>our_team and b->>'team_id'=our_team
   and b->>'runs' ~ '^\d{1,4}$'
   and case when b->>'wickets' ~ '^([0-9]|10)$' then (b->>'wickets')::integer>=5 else false end
 ), items as (
  select jsonb_build_object('key',(card->>'match_id')||':'||kind||':'||innings_id||':'||(stat->>'player_id'),
   'kind',kind,'snapshot_id',snapshot_id,'match_id',card->>'match_id','grade',card->>'grade','dates',card->'dates',
   'player_id',stat->>'player_id','name',stat->>'name','innings_id',innings_id,'innings_number',innings_number,'stat',stat,
   'opposition',(select t->>'name' from jsonb_array_elements(card->'teams') t where t->>'id'<>our_team limit 1)) item
  from performances where nullif(innings_id,'') is not null and nullif(stat->>'player_id','') is not null and nullif(stat->>'name','') is not null
 ) select coalesce(jsonb_agg(item||jsonb_build_object('live_milestone',true,'signature',md5((item-'snapshot_id')::text)) order by item->>'key'),'[]') from items
$$;
revoke all on function club_selection_private.social_milestone_candidates(jsonb) from public,anon,authenticated;

create function club_selection_private.social_milestone_card(c uuid,mid uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_array(jsonb_build_object('snapshot_id',s.id,'scorecard',s.scorecard,'our_team',coalesce(t.team_id::text,f.team_id)))
 from public.match_review_scorecards s
 left join club_selection_private.team_week_sources t on t.club_id=c and t.source_match_id=mid
 left join lateral (select case when count(distinct r.team_id)=1 then min(r.team_id::text) end team_id
  from club_selection_private.fixture_result_sources r where r.club_id=c and r.source_match_id=mid and r.no_play is null) f on true
 where s.club_id=c and s.source_match_id=mid order by s.created_at desc,s.id desc limit 1
$$;
revoke all on function club_selection_private.social_milestone_card(uuid,uuid) from public,anon,authenticated;

create function club_selection_private.collect_social_milestones(c uuid,mid uuid) returns void
language plpgsql set search_path='' as $$
declare cfg club_selection_private.social_award_settings%rowtype;wrapped jsonb;card jsonb;p jsonb;a uuid;msg uuid;
 tz text;today date;first_day date;last_day date;recipients uuid[];heading text;body_text text;
begin
 select * into cfg from club_selection_private.social_award_settings where club_id=c;
 if not coalesce(cfg.milestone_alerts,false) or not club_selection_private.enabled(c) then return;end if;
 wrapped:=club_selection_private.social_milestone_card(c,mid);card:=wrapped#>'{0,scorecard}';
 if card is null or not exists(select 1 from public.match_review_scorecards s where s.id=(wrapped#>>'{0,snapshot_id}')::uuid and s.created_at>=cfg.milestone_alerts_since) then return;end if;
 select coalesce(timezone,'Australia/Sydney') into tz from club_selection_private.access where club_id=c;
 today:=(now() at time zone coalesce(tz,'Australia/Sydney'))::date;
 select min(d::date),max(d::date) into first_day,last_day from jsonb_array_elements_text(card->'dates') d where d ~ '^\d{4}-\d{2}-\d{2}$';
 -- No historical backfill on opt-in, corrections, or reconnecting an old source.
 if first_day is null or last_day is null or first_day>today or last_day<greatest(today-1,(cfg.milestone_alerts_since at time zone coalesce(tz,'Australia/Sydney'))::date) then return;end if;
 select array_agg(m.user_id) into recipients from public.club_memberships m
 where m.club_id=c and club_selection_private.social_allowed_at(c,m.user_id,now())
 and (exists(select 1 from club_selection_private.social_managers sm where sm.club_id=c and sm.user_id=m.user_id)
  or exists(select 1 from club_selection_private.social_posting_delegations d where d.club_id=c and d.delegate_id=m.user_id
   and today between d.starts_on and d.ends_on and club_selection_private.social_permanent_allowed(c,d.delegated_by)));
 if coalesce(cardinality(recipients),0)=0 then
  select array_agg(m.user_id) into recipients from public.club_memberships m where m.club_id=c and m.permission_role='admin' and club_selection_private.social_allowed_at(c,m.user_id,now());
 end if;
 if coalesce(cardinality(recipients),0)=0 then return;end if;
 for p in select * from jsonb_array_elements(club_selection_private.social_milestone_candidates(wrapped)) loop
  a:=null;
  insert into club_selection_private.social_milestone_alerts(club_id,source_match_id,performance_key,kind,snapshot_id,performance)
   values(c,mid,p->>'key',p->>'kind',(p->>'snapshot_id')::uuid,p) on conflict(club_id,performance_key) do nothing returning id into a;
  if a is null then continue;end if;
  heading:=left(case p->>'kind' when 'century' then 'Century: ' else 'Five wickets: ' end||(p->>'name'),80);
  body_text:=left(p->>'name',200)||' · '||left(coalesce(p->>'grade',''),150)||' v '||left(coalesce(p->>'opposition',''),150)||E'\n'||
   case when p->>'kind'='century' then (p#>>'{stat,runs}')||case when p#>>'{stat,not_out}'='true' then '*' else '' end||' runs'
    else (p#>>'{stat,wickets}')||'/'||(p#>>'{stat,runs}') end||E'\nCreate a post from this achievement.\nhttps://mirelionhq.com/app.html?club='||c::text||'&tab=teams&social_milestone='||a::text;
  insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target,auto_email_fallback,system_key)
   values(c,null,gen_random_uuid(),heading,body_text,'teams',true,'social-milestone:'||a::text) returning id into msg;
  update club_selection_private.social_milestone_alerts set message_id=msg where id=a;
  insert into club_batting_private.club_message_recipients(message_id,user_id,staff_copy) select msg,u,false from unnest(recipients) u on conflict do nothing;
 end loop;
end $$;
revoke all on function club_selection_private.collect_social_milestones(uuid,uuid) from public,anon,authenticated;

create function club_selection_private.capture_social_milestones() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform club_selection_private.collect_social_milestones(new.club_id,new.source_match_id);return null;
end $$;
revoke all on function club_selection_private.capture_social_milestones() from public,anon,authenticated;
-- Deferred until source links in the same import transaction have been saved.
create constraint trigger social_milestone_scorecard after insert on public.match_review_scorecards
 deferrable initially deferred for each row execute function club_selection_private.capture_social_milestones();
create constraint trigger social_milestone_team after insert or update on club_selection_private.team_week_sources
 deferrable initially deferred for each row execute function club_selection_private.capture_social_milestones();
create constraint trigger social_milestone_fixture after insert or update on club_selection_private.fixture_result_sources
 deferrable initially deferred for each row execute function club_selection_private.capture_social_milestones();

create function club_selection_private.social_milestone_context(c uuid,data jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare a club_selection_private.social_milestone_alerts%rowtype;p jsonb;day date;grade_id uuid;scope jsonb;
begin
 if auth.uid() is null or not club_selection_private.social_allowed(c) then raise exception 'Socials Manager access required' using errcode='42501';end if;
 select * into a from club_selection_private.social_milestone_alerts where club_id=c and id=(data->>'milestone_id')::uuid;
 if not found then raise exception 'This achievement alert is unavailable';end if;
 select x into p from jsonb_array_elements(club_selection_private.social_milestone_candidates(club_selection_private.social_milestone_card(c,a.source_match_id))) x where x->>'key'=a.performance_key;
 if p is null then raise exception 'These scores changed. The achievement no longer qualifies; review the scorecard.';end if;
 select max(d::date) into day from jsonb_array_elements_text(p->'dates') d;
 select (f.details->>'grade_group_id')::uuid into grade_id from club_selection_private.fixture_result_sources src join club_selection_private.fixtures f on f.id=src.fixture_id
  where src.club_id=c and src.source_match_id=a.source_match_id limit 1;
 scope:=club_selection_private.award_scope(c,case when grade_id is not null then jsonb_build_object('mode','grades','ids',jsonb_build_array(grade_id)) else null end);
 return jsonb_build_object('id',a.id,'kind',a.kind,'candidate',p,'week_end',day+((7-extract(dow from day)::integer)%7),'award_scope',scope);
end $$;
revoke all on function club_selection_private.social_milestone_context(uuid,jsonb) from public,anon,authenticated;

create function club_selection_private.social_milestone_message_allowed(mid uuid,u uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from club_selection_private.social_milestone_alerts a
  join club_selection_private.social_award_settings s on s.club_id=a.club_id and s.milestone_alerts
  where a.message_id=mid and club_selection_private.social_allowed_at(a.club_id,u,now())
  and exists(select 1 from jsonb_array_elements(club_selection_private.social_milestone_candidates(club_selection_private.social_milestone_card(a.club_id,a.source_match_id))) x where x->>'key'=a.performance_key))
$$;
revoke all on function club_selection_private.social_milestone_message_allowed(uuid,uuid) from public,anon,authenticated;

-- Use persisted roles and grants, never user-editable authentication metadata.
create function mirelion_assist_private.club_staff(c uuid,u uuid) returns boolean
language sql stable set search_path='' as $$
 select u is not null and exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id
  where m.club_id=c and m.user_id=u and cl.archived_at is null and (
   m.permission_role in ('admin','head_coach','coach','captain')
   or club_selection_private.selection_viewer(c,u)
   or club_selection_private.captain(c,u)
   or club_selection_private.social_allowed_at(c,u,now())
   or exists(select 1 from public.philosophy_workshops w where w.club_id=c and w.philosophy_lead_user_id=u)))
$$;
revoke all on function mirelion_assist_private.club_staff(uuid,uuid) from public,anon,authenticated;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.social_awards_api(uuid,text,jsonb)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$k text; x jsonb; f jsonb; value jsonb; chosen jsonb$old$;
 new_text:=$new$k text; x jsonb; f jsonb; value jsonb; milestone_context jsonb; chosen jsonb$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected awards variable definition';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$ if action='delete_image' then return club_selection_private.delete_saved_image(c,data);end if;$old$;
 new_text:=$new$ if action='milestone' then return club_selection_private.social_milestone_context(c,data);end if;
 if action='delete_image' then return club_selection_private.delete_saved_image(c,data);end if;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.social_awards_api(uuid,text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$ if action='save_settings' then
  if coalesce(cfg.revision,0) is distinct from (data->>'revision')::integer then raise exception 'Award choices changed. Reload before saving';end if;
  if jsonb_typeof(data->'enabled') is distinct from 'array' or jsonb_array_length(data->'enabled')>5 or exists(select 1 from jsonb_array_elements_text(data->'enabled') e where e not in ('team_week','player_week','results','five_wickets','century')) then raise exception 'Choose awards from the list';end if;
  select coalesce(array_agg(distinct e),'{}'::text[]) into enabled_values from jsonb_array_elements_text(data->'enabled') e;
  insert into club_selection_private.social_award_settings values(c,enabled_values,1) on conflict(club_id) do update set enabled=excluded.enabled,revision=club_selection_private.social_award_settings.revision+1;
  return jsonb_build_object('saved',true,'revision',coalesce(cfg.revision,0)+1,'enabled',enabled_values);
$old$;
 new_text:=$new$ if action='save_settings' then
  if jsonb_typeof(data->'enabled') is distinct from 'array' or jsonb_array_length(data->'enabled')>5 or exists(select 1 from jsonb_array_elements_text(data->'enabled') e where e not in ('team_week','player_week','results','five_wickets','century')) then raise exception 'Choose awards from the list';end if;
  if data ? 'milestone_alerts' and jsonb_typeof(data->'milestone_alerts') is distinct from 'boolean' then raise exception 'Choose whether to send achievement alerts';end if;
  select coalesce(array_agg(distinct e order by e),'{}'::text[]) into enabled_values from jsonb_array_elements_text(data->'enabled') e;
  value:=to_jsonb(coalesce((data->>'milestone_alerts')::boolean,cfg.milestone_alerts,false));
  if value='true'::jsonb then
   select array_agg(distinct e order by e) into enabled_values from unnest(enabled_values||array['century','five_wickets']) e;
  end if;
  if cfg.revision=(data->>'revision')::integer+1 and cfg.enabled=enabled_values and cfg.milestone_alerts=(value#>>'{}')::boolean then
   return jsonb_build_object('saved',true,'revision',cfg.revision,'enabled',cfg.enabled,'milestone_alerts',cfg.milestone_alerts);
  end if;
  if coalesce(cfg.revision,0) is distinct from (data->>'revision')::integer then raise exception 'Award choices changed. Reload before saving';end if;
  insert into club_selection_private.social_award_settings(club_id,enabled,revision,milestone_alerts,milestone_alerts_since)
   values(c,enabled_values,1,(value#>>'{}')::boolean,case when value='true'::jsonb then now() end)
   on conflict(club_id) do update set enabled=excluded.enabled,revision=club_selection_private.social_award_settings.revision+1,
    milestone_alerts=excluded.milestone_alerts,milestone_alerts_since=case when excluded.milestone_alerts and not club_selection_private.social_award_settings.milestone_alerts then now() else club_selection_private.social_award_settings.milestone_alerts_since end;
  if coalesce(cfg.milestone_alerts,false) is distinct from (value#>>'{}')::boolean then
   update club_selection_private.playhq_jobs job set due_at=club_selection_private.playhq_results_due(link.fixture_id,job.checked_at)
    from club_selection_private.playhq_links link where link.club_id=c and job.club_id=c and job.kind='results' and job.source_id=link.match_id and job.team_id=link.team_id
    and coalesce(job.leased_until,'-infinity')<now() and job.last_error is null;
  end if;
  return jsonb_build_object('saved',true,'revision',coalesce(cfg.revision,0)+1,'enabled',enabled_values,'milestone_alerts',value);
$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.social_awards_api(uuid,text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$ if action='settings' then return jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0));end if;$old$;
 new_text:=$new$ if action='settings' then return jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0),'milestone_alerts',coalesce(cfg.milestone_alerts,false));end if;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.social_awards_api(uuid,text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$  'settings',jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0)),$old$;
 new_text:=$new$  'settings',jsonb_build_object('enabled',coalesce(cfg.enabled,array['team_week','player_week']),'revision',coalesce(cfg.revision,0),'milestone_alerts',coalesce(cfg.milestone_alerts,false)),$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.social_awards_api(uuid,text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$  cards:=club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,last_day-6,last_day),data->'award_scope'),coalesce((data->>'include_provisional')::boolean,false));candidates:=club_selection_private.social_award_candidates(cards);$old$;
 new_text:=$new$  cards:=club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,last_day-6,last_day),data->'award_scope'),coalesce((data->>'include_provisional')::boolean,false));candidates:=club_selection_private.social_award_candidates(cards);
  if nullif(data->>'milestone_id','') is not null then
   milestone_context:=club_selection_private.social_milestone_context(c,data);
   if milestone_context->>'kind' is distinct from data->>'kind' or (milestone_context->>'week_end')::date is distinct from last_day
    or not exists(select 1 from jsonb_array_elements(cards) card where card#>>'{scorecard,match_id}'=milestone_context#>>'{candidate,match_id}') then raise exception 'Reopen this achievement alert to create its post';end if;
   candidates:=coalesce((select jsonb_agg(milestone_candidate) from jsonb_array_elements(candidates) milestone_candidate where milestone_candidate->>'key'<>milestone_context#>>'{candidate,key}'),'[]')||jsonb_build_array(milestone_context->'candidate');
  end if;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.social_awards_api(uuid,text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$  candidates:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,edition.week_end-6,edition.week_end),edition.request->'award_scope'),coalesce((edition.request->>'include_provisional')::boolean,false)));$old$;
 new_text:=$new$  cards:=club_selection_private.award_scope_cards(c,club_selection_private.team_week_cards(c,edition.week_end-6,edition.week_end),edition.request->'award_scope');
  candidates:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,cards,coalesce((edition.request->>'include_provisional')::boolean,false)));
  if exists(select 1 from jsonb_array_elements(edition.sources) src where src->>'live_milestone'='true') then
   candidates:=candidates||club_selection_private.social_milestone_candidates(cards);
  end if;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected finish_image definition: club_selection_private.social_awards_api(uuid,text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.social_award_scores_current(uuid,uuid,jsonb)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$  current_rows:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,cards,exists(select 1 from jsonb_array_elements(saved) x where x->>'provisional'='true')));$old$;
 new_text:=$new$  current_rows:=club_selection_private.social_award_candidates(club_selection_private.award_scorecards(c,cards,exists(select 1 from jsonb_array_elements(saved) x where x->>'provisional'='true')));
  if exists(select 1 from jsonb_array_elements(saved) x where x->>'live_milestone'='true') then current_rows:=current_rows||club_selection_private.social_milestone_candidates(cards);end if;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.social_award_scores_current(uuid,uuid,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('club_batting_private.message_recipient_allowed(uuid,uuid)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$and case when exists(select 1 from club_batting_private.club_messages m where m.id=p_message$old$;
 new_text:=$new$and case when exists(select 1 from club_batting_private.club_messages m where m.id=p_message and m.system_key like 'social-milestone:%') then club_selection_private.social_milestone_message_allowed(p_message,p_user) when exists(select 1 from club_batting_private.club_messages m where m.id=p_message$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_batting_private.message_recipient_allowed(uuid,uuid)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$ if p_action='access' then$old$;
 new_text:=$new$ if p_action='access' then
  result:=result||jsonb_build_object('assist_staff',mirelion_assist_private.club_staff(p_club_id,auth.uid()));$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: public.club_selections_api(uuid,text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('mirelion_assist_private.api(text,jsonb)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$if c is null or not public.is_club_member(c) then raise exception 'Your club access has changed. Sign in again.'$old$;
 new_text:=$new$if c is null or not mirelion_assist_private.club_staff(c,u) then raise exception 'Mirelion Assist is for club staff. Ask your Club Admin for help.'$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: mirelion_assist_private.api(text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('mirelion_assist_private.notification_data(uuid,text,bigint)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$t.channel='assist' and c.archived_at is null and cm.user_id is not null$old$;
 new_text:=$new$t.channel='assist' and mirelion_assist_private.club_staff(t.club_id,t.requester_id) and c.archived_at is null and cm.user_id is not null$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: mirelion_assist_private.notification_data(uuid,text,bigint)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('mirelion_assist_private.support_worker(text,jsonb)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$if th.channel='assist' and not exists(select 1 from public.club_memberships cm join public.clubs c on c.id=cm.club_id and c.archived_at is null
   where cm.club_id=th.club_id and cm.user_id=th.requester_id)$old$;
 new_text:=$new$if th.channel='assist' and not mirelion_assist_private.club_staff(th.club_id,th.requester_id)$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: mirelion_assist_private.support_worker(text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$th.channel='assist' and settings.assist_enabled and exists(select 1 from public.club_memberships cm join public.clubs c on c.id=cm.club_id and c.archived_at is null where cm.club_id=th.club_id and cm.user_id=th.requester_id)$old$;
 new_text:=$new$th.channel='assist' and settings.assist_enabled and mirelion_assist_private.club_staff(th.club_id,th.requester_id)$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: mirelion_assist_private.support_worker(text,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;

-- Preserve the existing RPC; fail atomically if its reviewed anchors changed.
do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.playhq_results_due(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure); old_text text;new_text text;
begin
 old_text:=$old$received boolean;cadence interval;$old$;
 new_text:=$new$received boolean;cadence interval;live_due timestamptz;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.playhq_results_due(uuid,timestamp with time zone,timestamp with time zone)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$old$ if previous_finish is null then return coalesce(next_finish,at_time+interval '1 day');end if;$old$;
 new_text:=$new$ if not received and exists(select 1 from club_selection_private.fixtures f join club_selection_private.social_award_settings s on s.club_id=f.club_id and s.milestone_alerts where f.id=fid) then
  select min(greatest(at_time,coalesce(last_checked+interval '10 minutes',at_time),starts)) into live_due
  from (select ((d->>'date')::date+case when d->>'start' ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then (d->>'start')::time else time '10:00' end) at time zone coalesce(tz,'Australia/Sydney')+interval '30 minutes' starts,
   club_selection_private.fixture_day_expected_finish(details,d,tz) finish from jsonb_array_elements(coalesce(details->'days','[]')) d) times
  where finish>at_time;
  if live_due is not null then return least(live_due,coalesce(next_finish,live_due));end if;
 end if;
 if previous_finish is null then return coalesce(next_finish,at_time+interval '1 day');end if;$new$;
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then raise exception 'Unexpected function definition: club_selection_private.playhq_results_due(uuid,timestamp with time zone,timestamp with time zone)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end $patch$;
