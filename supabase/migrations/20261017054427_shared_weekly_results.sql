-- Association metadata only. Scores continue to live in the shared scorecard store.
create table club_selection_private.fixture_result_sources (
 fixture_id uuid primary key references club_selection_private.fixtures(id) on delete cascade,
 club_id uuid not null references public.clubs(id) on delete cascade,
 source_match_id uuid,
 team_id uuid,
 no_play text check(no_play in ('washed_out','bye','cancelled')),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 check((source_match_id is not null and no_play is null) or (source_match_id is null and team_id is null and no_play is not null)),
 unique(club_id,source_match_id,team_id)
);
alter table club_selection_private.fixture_result_sources enable row level security;
revoke all on club_selection_private.fixture_result_sources from public,anon,authenticated;

create function club_selection_private.shared_result_cards(c uuid,first_day date,last_day date) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('snapshot_id',s.id,'scorecard',s.scorecard,'fetched_at',s.created_at,
  'our_team',coalesce(t.team_id::text,l.team_id::text,confirmed.team_id,club_batting_private.scorecard_club_team(c,s.scorecard)),
  'grade_hint',(select coalesce(fx.published->'details',fx.details)->>'grade' from club_selection_private.fixture_result_sources known join club_selection_private.fixtures fx on fx.id=known.fixture_id and fx.club_id=c where known.club_id=c and known.team_id::text=coalesce(t.team_id::text,l.team_id::text,confirmed.team_id,club_batting_private.scorecard_club_team(c,s.scorecard)) order by known.updated_at desc,known.fixture_id limit 1),
  'fixture_id',coalesce(l.fixture_id,official.id)) order by s.scorecard->>'grade',s.source_match_id),'[]')
 from (select distinct on(source_match_id) * from public.match_review_scorecards where club_id=c order by source_match_id,created_at desc,id desc) s
 left join club_selection_private.team_week_sources t on t.club_id=c and t.source_match_id=s.source_match_id
 left join club_selection_private.fixture_result_sources l on l.club_id=c and l.source_match_id=s.source_match_id
 left join lateral (select f.id from club_selection_private.fixtures f where f.club_id=c and f.scorecard_sync->>'match_id'=s.source_match_id::text order by f.id limit 1) official on true
 left join lateral (
  select case when count(distinct i->>'team_id')=1 then min(i->>'team_id') end team_id
  from public.match_review_score_links z join public.match_review_scorecards original on original.id=z.snapshot_id and original.club_id=c
  cross join lateral jsonb_array_elements(original.scorecard->'innings') i
  where z.club_id=c and z.source_match_id=s.source_match_id and i->>'id'=z.source_innings_id::text
 ) confirmed on true
 where exists(select 1 from jsonb_array_elements_text(s.scorecard->'dates') d where d between first_day::text and last_day::text)
$$;
revoke all on function club_selection_private.shared_result_cards(uuid,date,date) from public,anon,authenticated;

create function club_selection_private.match_results_api(c uuid,action text,data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare me uuid:=auth.uid();social boolean;coach boolean;last_day date;first_day date;cards jsonb;card jsonb;choices jsonb;
 f club_selection_private.fixtures%rowtype;src club_selection_private.fixture_result_sources%rowtype;
 snapshot public.match_review_scorecards%rowtype;d jsonb;team text;match_id uuid;sid uuid;fid uuid;grade text;preview jsonb;
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then raise exception 'Current club membership is required';end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>5000 then raise exception 'Invalid results request';end if;
 social:=club_selection_private.social_allowed(c);coach:=club_batting_private.team_review_staff(c);
 if not social and not coach then raise exception 'Club socials or coaching access is required';end if;
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
 if fid is not null then
  select * into f from club_selection_private.fixtures where id=fid and club_id=c;
  if f.id is null then raise exception 'Choose a fixture in this club';end if;
  if not social and not exists(select 1 from jsonb_array_elements(club_batting_private.review_fixture_options(c)) opt where opt->>'id'=fid::text) then raise exception 'Choose one of your team fixtures';end if;
  select * into src from club_selection_private.fixture_result_sources where fixture_id=fid;
  d:=coalesce(f.published->'details',f.details);
 end if;
 if action='no_play' then
  if not social or fid is null then raise exception 'Club socials access and a fixture are required';end if;
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
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'shared_result_'||action,jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',team,'reason',data->>'reason'));
 return jsonb_build_object('saved',true);
end $$;
revoke all on function club_selection_private.match_results_api(uuid,text,jsonb) from public,anon;
grant execute on function club_selection_private.match_results_api(uuid,text,jsonb) to authenticated;
create function public.club_match_results_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select club_selection_private.match_results_api(p_club_id,p_action,p_data)$$;
revoke all on function public.club_match_results_api(uuid,text,jsonb) from public,anon;
grant execute on function public.club_match_results_api(uuid,text,jsonb) to authenticated;
