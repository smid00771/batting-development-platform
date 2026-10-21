-- Historical labels resolve to the same grade after an explicitly confirmed rename.
-- Published snapshots stay unchanged. Ambiguous labels never choose a grade.
create table club_selection_private.selection_grade_aliases (
 club_id uuid not null references public.clubs(id) on delete cascade,
 grade_id uuid not null references public.playing_groups(id) on delete cascade,
 name text not null check(length(btrim(name))>0),
 primary key(club_id,grade_id,name)
);
create index selection_grade_aliases_name on club_selection_private.selection_grade_aliases(club_id,lower(btrim(name)));
alter table club_selection_private.selection_grade_aliases enable row level security;
revoke all on club_selection_private.selection_grade_aliases from public,anon,authenticated;

create or replace function club_selection_private.fixture_group_id(c uuid,d jsonb) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce(
  (select id from public.playing_groups where club_id=c and active and id=nullif(d->>'grade_group_id','')::uuid),
  (select (array_agg(distinct g.id))[1] from club_selection_private.group_links l join public.playing_groups g on g.id=l.group_id and g.club_id=c and g.active where l.club_id=c and l.grade=d->>'grade' and l.competition=coalesce(d->>'competition','') having count(distinct g.id)=1),
  (select (array_agg(distinct id))[1] from (
    select id from public.playing_groups where club_id=c and active and lower(btrim(name))=lower(btrim(d->>'grade'))
    union all
    select g.id from club_selection_private.selection_grade_aliases a join public.playing_groups g on g.id=a.grade_id and g.club_id=c and g.active
     where a.club_id=c and lower(btrim(a.name))=lower(btrim(d->>'grade'))
   ) names having count(distinct id)=1))
$$;
revoke all on function club_selection_private.fixture_group_id(uuid,jsonb) from public,anon,authenticated;

create or replace function public.club_selection_groups(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid:=p_club_id;me uuid:=auth.uid();ctx jsonb;row jsonb;src jsonb;gid uuid;sg uuid;nm text;old_name text;rid uuid;receipt club_selection_private.requests%rowtype;cat club_selection_private.playhq_team_catalogues%rowtype;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 if not(public.is_club_admin(c) or club_selection_private.selector(c,me) or club_selection_private.captain(c,me)) then raise exception 'Club setup or Selection Board access required';end if;
 if p_action='context' then return club_selection_private.selection_groups_context(c)||jsonb_build_object('can_edit',public.is_club_admin(c));end if;
 if p_action<>'save' then raise exception 'Unknown Selection Group action';end if;
 if not public.is_club_admin(c) then raise exception 'Club Admin manages grades and Selection Groups';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>250000 then raise exception 'Invalid setup request';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 rid:=nullif(p_data->>'request_id','')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into receipt from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if receipt.action<>'selection_groups' or receipt.payload<>p_data then raise exception 'This request ID was already used';end if;return receipt.result;end if;
 perform 1 from public.playing_groups where club_id=c and active order by id for update;
 ctx:=club_selection_private.selection_groups_context(c);
 if ctx->'revision' is distinct from p_data->'revision' or ctx->'expected_grades' is distinct from p_data->'expected_grades' then raise exception 'Club setup changed. Reload before confirming the grades';end if;
 if jsonb_typeof(p_data->'groups') is distinct from 'array' or jsonb_array_length(p_data->'groups') not between 1 and 100 or jsonb_typeof(p_data->'grades') is distinct from 'array' or jsonb_array_length(p_data->'grades') not between 1 and 500 then raise exception 'Create a Selection Group and assign your grades';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'groups') x group by x->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_data->'groups') x group by lower(btrim(x->>'name')) having count(*)>1) then raise exception 'Use a different name for each Selection Group';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'grades') x group by x->>'id' having count(*)>1) then raise exception 'A grade can only belong to one Selection Group';end if;
 if exists(select 1 from public.playing_groups g where g.club_id=c and g.active and not exists(select 1 from jsonb_array_elements(p_data->'grades') x where x->>'id'=g.id::text)) then raise exception 'Confirm a Selection Group for every existing grade';end if;
 if nullif(p_data->>'catalogue_id','') is not null then
  select t.* into cat from club_selection_private.playhq_team_catalogues t join club_selection_private.playhq_connections cn on cn.club_id=t.club_id and cn.generation=t.generation where t.id=(p_data->>'catalogue_id')::uuid and t.club_id=c;
  if not found then raise exception 'The season download changed. Reload it before saving';end if;
 end if;
 for row in select value from jsonb_array_elements(p_data->'groups') loop
  sg:=(row->>'id')::uuid;nm:=btrim(row->>'name');
  if sg is null or nm is null or length(nm) not between 1 and 100 then raise exception 'Name each Selection Group';end if;
  if exists(select 1 from club_selection_private.selection_groups where id=sg and club_id<>c) then raise exception 'Selection Group belongs to another club';end if;
  insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,nm) on conflict(id) do update set name=excluded.name where club_selection_private.selection_groups.club_id=c;
 end loop;
 for row in select value from jsonb_array_elements(p_data->'grades') loop
  gid:=(row->>'id')::uuid;sg:=(row->>'selection_group_id')::uuid;
  if gid is null or sg is null or not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=sg::text) then raise exception 'Choose a Selection Group for each grade';end if;
  src:=null;
  if nullif(row->>'team_id','') is not null then
   select value into src from jsonb_array_elements(cat.teams) where value->>'id'=row->>'team_id';
   if src is null then raise exception 'Choose a team from this club season';end if;
  end if;
  if not exists(select 1 from public.playing_groups where id=gid and club_id=c and active) then
   if exists(select 1 from public.playing_groups where id=gid) then raise exception 'Grade unavailable in this club';end if;
   if src is null then raise exception 'New grades must come from the season download. Use manual setup for other grades';end if;
   nm:=btrim(coalesce(nullif(row->>'name',''),src#>>'{grade,name}',src->>'name'));
   if nm is null or length(nm) not between 1 and 100 then raise exception 'Enter a grade name of up to 100 characters';end if;
   if exists(select 1 from public.playing_groups where club_id=c and lower(btrim(name))=lower(nm)) then raise exception 'That grade already exists. Match it to the existing grade or use a distinct name';end if;
   if exists(select 1 from club_selection_private.selection_grade_aliases where club_id=c and lower(btrim(name))=lower(nm) and grade_id<>gid) then raise exception 'That name is used by another grade history. Choose a distinct name';end if;
   insert into public.playing_groups(id,club_id,name,created_by,sort_order) values(gid,c,nm,me,coalesce((select max(sort_order)+1 from public.playing_groups where club_id=c),0));
  elsif row ? 'name' then
   nm:=btrim(row->>'name');
   if nm is null or length(nm) not between 1 and 100 then raise exception 'Enter a grade name of up to 100 characters';end if;
   select name into old_name from public.playing_groups where id=gid and club_id=c for update;
   if old_name is distinct from nm then
    if exists(select 1 from public.playing_groups where club_id=c and id<>gid and lower(btrim(name))=lower(nm))
     or exists(select 1 from club_selection_private.selection_grade_aliases where club_id=c and grade_id<>gid and lower(btrim(name))=lower(nm))
     then raise exception 'That name is used by another grade. Choose a distinct name';end if;
    insert into club_selection_private.selection_grade_aliases(club_id,grade_id,name) values(c,gid,old_name) on conflict do nothing;
    update public.playing_groups set name=nm,updated_at=now() where id=gid and club_id=c;
   end if;
  end if;
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,gid,sg) on conflict(grade_id) do update set selection_group_id=excluded.selection_group_id where club_selection_private.selection_group_grades.club_id=c;
  if src is not null then
   if exists(select 1 from club_selection_private.playhq_grade_mappings where club_id=c and season_id=cat.season_id and team_id=(src->>'id')::uuid and grade_id<>gid) then raise exception 'This season team is already linked to a different club grade';end if;
   if exists(select 1 from club_selection_private.playhq_grade_mappings where club_id=c and season_id=cat.season_id and grade_id=gid and team_id<>(src->>'id')::uuid) then raise exception 'Two season teams need separate club grades';end if;
   insert into club_selection_private.playhq_grade_mappings(club_id,season_id,team_id,source_grade_id,grade_id) values(c,cat.season_id,(src->>'id')::uuid,(src#>>'{grade,id}')::uuid,gid) on conflict(club_id,season_id,team_id) do update set source_grade_id=coalesce(excluded.source_grade_id,club_selection_private.playhq_grade_mappings.source_grade_id);
  end if;
 end loop;
 delete from club_selection_private.selection_groups g where g.club_id=c and not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g.id::text) and not exists(select 1 from club_selection_private.selection_group_grades m where m.selection_group_id=g.id);
 insert into club_selection_private.team_settings(club_id,timezone,revision,updated_by) values(c,club_selection_private.captain_timezone(c),1,me)
 on conflict(club_id) do update set revision=club_selection_private.team_settings.revision+1,updated_by=me,updated_at=now();
 ctx:=club_selection_private.selection_groups_context(c)||jsonb_build_object('can_edit',true,'saved',true);
 insert into club_selection_private.requests values(c,me,rid,'selection_groups',p_data,ctx,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'selection_groups',jsonb_build_object('request_id',rid,'groups',p_data->'groups','grades',p_data->'grades'));
 return ctx;
end $$;
revoke all on function public.club_selection_groups(uuid,text,jsonb) from public,anon;
grant execute on function public.club_selection_groups(uuid,text,jsonb) to authenticated;
