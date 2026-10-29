-- Capture grade-drop reminders only on an explicit request. Normal board reads
-- join the small saved set and shared spoken-to records, never selection history.
create table club_selection_private.dropped_player_reminders (
 club_id uuid not null references public.clubs(id) on delete cascade,
 fixture_id uuid not null references club_selection_private.fixtures(id) on delete cascade,
 roster_id uuid not null references club_selection_private.roster(id) on delete cascade,
 previous_fixture_id uuid not null references club_selection_private.fixtures(id) on delete cascade,
 movement_key text not null,
 previous_grade text not null,
 fixture_identity jsonb not null,
 captured_at timestamptz not null default now(),
 primary key(fixture_id,roster_id)
);
create index dropped_player_reminders_club_idx on club_selection_private.dropped_player_reminders(club_id);
create index dropped_player_reminders_roster_idx on club_selection_private.dropped_player_reminders(roster_id);
create index dropped_player_reminders_previous_idx on club_selection_private.dropped_player_reminders(previous_fixture_id);
alter table club_selection_private.dropped_player_reminders enable row level security;
revoke all on club_selection_private.dropped_player_reminders from public,anon,authenticated;

create function club_selection_private.drop_fixture_identity(d jsonb)
returns jsonb language sql immutable set search_path='' as $f$
 select jsonb_build_array(d->>'grade',d->>'competition',d->>'format',d->>'season',d->'days'->0->>'date')
$f$;

create function club_selection_private.saved_drop_context(c uuid,u uuid,include_spoken boolean default false)
returns jsonb language sql stable set search_path='' as $f$
 select coalesce(jsonb_agg(jsonb_build_object(
  'fixture_id',m.fixture_id,'roster_id',m.roster_id,'name',r.name,'previous_grade',m.previous_grade,
  'grade',f.details->>'grade','competition',f.details->>'competition','format',f.details->>'format',
  'date',f.details->'days'->0->>'date','movement_key',m.movement_key,'kind','lower_grade','availability','available',
  'spoken_at',s.spoken_at,'spoken_by',case when s.spoken_at is not null then coalesce(up.display_name,'Club staff') end,
  'can_update',club_selection_private.selection_edit(c,f.details,u)
   or u=any(club_selection_private.match_captain_users(c,p.published->'details'))
   or exists(select 1 from public.club_memberships cm where cm.club_id=c and cm.user_id=u and cm.permission_role in ('coach','head_coach')),
  'revision',coalesce(s.revision,0)) order by f.details->'days'->0->>'date' desc,f.details->>'grade',r.name),'[]'::jsonb)
 from club_selection_private.dropped_player_reminders m
 join club_selection_private.fixtures f on f.id=m.fixture_id and f.club_id=c
 join club_selection_private.fixtures p on p.id=m.previous_fixture_id and p.club_id=c
 join club_selection_private.roster r on r.id=m.roster_id and r.club_id=c and r.active
 left join club_selection_private.availability a on a.roster_id=r.id
 left join club_selection_private.player_conversations s on s.fixture_id=m.fixture_id and s.roster_id=m.roster_id and s.movement_key=m.movement_key
 left join public.user_profiles up on up.user_id=s.spoken_by
 where m.club_id=c and u=auth.uid() and club_selection_private.member(c,u) and club_selection_private.enabled(c)
  and (include_spoken or s.spoken_at is null)
  and not coalesce((f.details->>'cancelled')::boolean,false)
  and m.fixture_identity=club_selection_private.drop_fixture_identity(f.details)
  and p.published->'details'->>'grade'=m.previous_grade
  and not coalesce((p.published->'details'->>'cancelled')::boolean,false)
  and exists(select 1 from jsonb_array_elements(f.slots) slot where slot->>'d1'=r.id::text or slot->>'d2'=r.id::text)
  and not exists(select 1 from jsonb_array_elements(f.details->'days') with ordinality day(value,n),jsonb_array_elements(f.slots) slot
   where slot->>('d'||day.n)=r.id::text and coalesce(a.unavailable_dates,'[]'::jsonb) ? (day.value->>'date'))
  and (club_selection_private.selection_view(c,f.details,u)
   or u=any(club_selection_private.match_captain_users(c,p.published->'details'))
   or exists(select 1 from public.club_memberships cm where cm.club_id=c and cm.user_id=u and cm.permission_role in ('coach','head_coach')))
$f$;

create function club_selection_private.capture_drop_reminders(c uuid,u uuid,ids uuid[])
returns jsonb language plpgsql set search_path='' as $f$
declare highlights jsonb;
begin
 if u is distinct from auth.uid() or not club_selection_private.member(c,u) or not club_selection_private.enabled(c)
  or not club_selection_private.selection_viewer(c,u) then raise exception 'Selector access required';end if;
 if cardinality(ids) is null or cardinality(ids) not between 1 and 100 or exists(
  select 1 from unnest(ids) requested(id) left join club_selection_private.fixtures f on f.id=requested.id and f.club_id=c
  where f.id is null or not club_selection_private.selection_view(c,f.details,u)) then
  raise exception 'Choose teams from a Selection Group you can view';
 end if;
 -- The caller's existing club advisory lock serializes this capture with saves.
 delete from club_selection_private.dropped_player_reminders where club_id=c and fixture_id=any(ids);
 insert into club_selection_private.dropped_player_reminders(club_id,fixture_id,roster_id,previous_fixture_id,movement_key,previous_grade,fixture_identity)
 select c,m.fixture_id,m.roster_id,m.previous_fixture_id,m.movement_key,m.previous_grade,club_selection_private.drop_fixture_identity(f.details)
 from club_selection_private.lower_grade_moves(c) m
 join club_selection_private.fixtures f on f.id=m.fixture_id and f.club_id=c
 join club_selection_private.roster r on r.id=m.roster_id and r.club_id=c and r.active
 left join club_selection_private.player_conversations s on s.fixture_id=m.fixture_id and s.roster_id=m.roster_id and s.movement_key=m.movement_key
 where m.fixture_id=any(ids) and s.spoken_at is null;
 highlights:=coalesce((select jsonb_agg(x) from jsonb_array_elements(club_selection_private.saved_drop_context(c,u)) x where (x->>'fixture_id')::uuid=any(ids)),'[]'::jsonb);
 return jsonb_build_object('saved',true,'count',jsonb_array_length(highlights));
end $f$;

revoke all on function club_selection_private.drop_fixture_identity(jsonb),club_selection_private.saved_drop_context(uuid,uuid,boolean),club_selection_private.capture_drop_reminders(uuid,uuid,uuid[]) from public,anon,authenticated;

do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 old_context text:=$old$'conversations','[]'::jsonb,$old$;
 old_action text:=$old$ elsif p_action='conversation' then
  fid:=nullif(p_data->>'fixture_id','')::uuid;pid:=nullif(p_data->>'roster_id','')::uuid;
  select item into x from jsonb_array_elements(club_selection_private.conversation_context(c,me)) item
   where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';$old$;
begin
 if (length(definition)-length(replace(definition,old_context,'')))/length(old_context)<>1
  or (length(definition)-length(replace(definition,old_action,'')))/length(old_action)<>1 then raise exception 'Unexpected Selection Board API';end if;
 definition:=replace(definition,old_context,$new$'conversations',club_selection_private.saved_drop_context(c,me),$new$);
 definition:=replace(definition,old_action,$new$ elsif p_action='show_dropped' then
  if jsonb_typeof(p_data->'ids') is distinct from 'array' then raise exception 'Choose teams to check';end if;
  res:=club_selection_private.capture_drop_reminders(c,me,array(select jsonb_array_elements_text(p_data->'ids')::uuid));
 elsif p_action='conversation' then
  fid:=nullif(p_data->>'fixture_id','')::uuid;pid:=nullif(p_data->>'roster_id','')::uuid;
  select item into x from jsonb_array_elements(club_selection_private.saved_drop_context(c,me,true)) item
   where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  if x is null then
   select item into x from jsonb_array_elements(club_selection_private.conversation_context(c,me)) item
    where item->>'fixture_id'=fid::text and item->>'roster_id'=pid::text and item->>'movement_key'=p_data->>'movement_key';
  end if;$new$);
 execute definition;
end $patch$;
