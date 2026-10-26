-- Private, provenance-preserving season exports. Source records are reference
-- candidates, never live player identity links or inputs to current form ratings.
-- Import audited club exports separately; no source/player data belongs here.
begin;
create table if not exists club_selection_private.history_reference (
 club_id uuid not null references public.clubs(id) on delete cascade,
 source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
 source_row integer not null check (source_row>1),
 source_name text not null,
 name_key text not null,
 source_club text not null,
 competition text not null,
 grade_id uuid not null,
 grade text not null,
 season text not null,
 season_end date not null,
 runs integer not null check (runs>=0),
 innings integer not null check (innings>=0),
 not_outs integer not null check (not_outs>=0 and not_outs<=innings),
 wickets integer not null check (wickets>=0),
 conceded integer not null check (conceded>=0),
 balls integer not null check (balls>=0),
 primary key(club_id,source_hash,source_row)
);
create index if not exists history_reference_name on club_selection_private.history_reference(club_id,name_key);
alter table club_selection_private.history_reference enable row level security;
revoke all on club_selection_private.history_reference from public,anon,authenticated;

create or replace function club_selection_private.history_reference_api(c uuid,data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare me uuid:=auth.uid(); details jsonb; result jsonb; ids uuid[];
begin
 if me is null or not exists(select 1 from public.club_memberships m join public.clubs cl on cl.id=m.club_id and cl.archived_at is null where m.club_id=c and m.user_id=me) then
  raise exception 'Current club membership is required';
 end if;
 if not club_selection_private.enabled(c) or not club_selection_private.selection_viewer(c,me) then
  raise exception 'Current selection access is required';
 end if;
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>1500
  or jsonb_typeof(data->'roster_ids') is distinct from 'array' then raise exception 'Invalid history request';end if;
 if jsonb_array_length(data->'roster_ids') not between 1 and 2 then raise exception 'Choose up to two players';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text(data->'roster_ids');
 select f.details into details from club_selection_private.fixtures f where f.club_id=c and f.id=(data->>'fixture_id')::uuid;
 if details is null or not club_selection_private.selection_view(c,details,me) then raise exception 'View access to this Selection Group is required';end if;
 if exists(select 1 from unnest(ids) requested(roster_id) where not exists(select 1 from club_selection_private.roster r where r.id=requested.roster_id and r.club_id=c)) then raise exception 'Choose club players';end if;
 -- Names only locate explicitly labelled archive candidates. No roster or
 -- source identity is changed, and no candidate is counted as confirmed form.
 select coalesce(jsonb_agg(jsonb_build_object('roster_id',r.id,'records',coalesce((
  select jsonb_agg(jsonb_build_object('source_name',a.source_name,'source_club',a.source_club,
   'competition',a.competition,'grade',a.grade,'grade_id',a.grade_id,'season',a.season,'season_end',a.season_end,
   'runs',a.runs,'innings',a.innings,'not_outs',a.not_outs,'wickets',a.wickets,'conceded',a.conceded,'balls',a.balls)
   order by a.grade,a.season desc)
  from club_selection_private.history_reference a
  where a.club_id=c and a.name_key=lower(regexp_replace(btrim(r.name),'\s+',' ','g'))
   and a.season_end<(details->'days'->0->>'date')::date
   and club_selection_private.selection_view(c,jsonb_build_object('grade_group_id',a.grade_id,'grade',a.grade,'competition',a.competition),me)
 ),'[]'::jsonb))),'[]'::jsonb) into result from club_selection_private.roster r where r.club_id=c and r.id=any(ids);
 return jsonb_build_object('players',result,'identity_status','unconfirmed_name_and_club');
end $function$;
revoke all on function club_selection_private.history_reference_api(uuid,jsonb) from public,anon,authenticated;
grant execute on function club_selection_private.history_reference_api(uuid,jsonb) to authenticated;
create or replace function public.club_selection_history_api(p_club_id uuid,p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $function$
 select club_selection_private.history_reference_api(p_club_id,p_data)
$function$;
revoke all on function public.club_selection_history_api(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.club_selection_history_api(uuid,jsonb) to authenticated;
commit;
