-- Season fixtures follow confirmed team links. No per-match checkbox is needed.
alter table club_selection_private.playhq_connections add column active_season_id uuid;
alter table club_selection_private.playhq_jobs add column last_result jsonb, add column checked_at timestamptz;
alter table club_selection_private.playhq_jobs drop constraint playhq_jobs_kind_check;
alter table club_selection_private.playhq_jobs add constraint playhq_jobs_kind_check check(kind in ('fixtures','results','season'));
-- Two teams from one club may meet in the same provider match.
alter table club_selection_private.playhq_links drop constraint playhq_links_club_id_match_id_key;
alter table club_selection_private.playhq_links add constraint playhq_links_club_match_team_key unique(club_id,match_id,team_id);

create function club_selection_private.playhq_queue_season(c uuid,s uuid) returns void
language plpgsql set search_path='' as $$
declare conn club_selection_private.playhq_connections%rowtype;
begin
 select * into conn from club_selection_private.playhq_connections where club_id=c for update;
 if conn.club_id is null then return;end if;
 update club_selection_private.playhq_connections set active_season_id=s,polling_enabled=(verified_at is not null) where club_id=c;
 insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id) values(c,'season',s,conn.organisation_id)
 on conflict(club_id,kind,source_id,team_id) do update set due_at=now();
 insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id)
 select c,'fixtures',source_grade_id,team_id from club_selection_private.playhq_grade_mappings where club_id=c and season_id=s and source_grade_id is not null
 on conflict(club_id,kind,source_id,team_id) do update set due_at=now();
end $$;
revoke all on function club_selection_private.playhq_queue_season(uuid,uuid) from public,anon,authenticated,service_role;
create function club_selection_private.playhq_fixture_details(src jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('opposition',coalesce(nullif(src->>'opposition',''),'Opponent to be confirmed'),'format',src->>'format',
  'ground',coalesce(src#>>'{days,0,ground}',''),'cancelled',coalesce((src->>'cancelled')::boolean,false),
  'days',coalesce((select jsonb_agg(jsonb_build_object('date',x->>'date','start',coalesce(x->>'time',''),'ground',coalesce(x->>'ground','')) order by ord)
   from jsonb_array_elements(src->'days') with ordinality a(x,ord)),'[]'))
$$;
revoke all on function club_selection_private.playhq_fixture_details(jsonb) from public,anon,authenticated,service_role;

create function club_selection_private.playhq_import_all(c uuid,s uuid,source_grade uuid,team uuid,fixtures_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare conn club_selection_private.playhq_connections%rowtype;g public.playing_groups%rowtype;f club_selection_private.fixtures%rowtype;l club_selection_private.playhq_links%rowtype;
 src jsonb;incoming jsonb;previous jsonb;d jsonb;day jsonb;days jsonb;k text;i int;fid uuid;mid uuid;matches uuid[];same_day int;result_due timestamptz;tz text;
 created int:=0;linked int:=0;updated int:=0;unchanged int:=0;attention int:=0;deferred jsonb:='[]';has_picks boolean;first_link boolean;
begin
 if not club_selection_private.enabled(c) then raise exception 'Club Selections access required';end if;
 if jsonb_typeof(fixtures_data) is distinct from 'array' or jsonb_array_length(fixtures_data)>1000 or octet_length(fixtures_data::text)>2000000 then raise exception 'Invalid season fixtures';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into conn from club_selection_private.playhq_connections where club_id=c for update;
 if conn.active_season_id is distinct from s then raise exception 'The selected season changed. Reload season setup';end if;
 select pg.* into g from club_selection_private.playhq_grade_mappings m join public.playing_groups pg on pg.id=m.grade_id and pg.club_id=c and pg.active
 where m.club_id=c and m.season_id=s and m.team_id=team and m.source_grade_id=source_grade;
 if g.id is null then raise exception 'Save this season team in a Selection Group first';end if;
 select timezone into tz from club_selection_private.access where club_id=c;
 for src in select value from jsonb_array_elements(fixtures_data) loop
  -- Date/format are necessary for a board fixture; venue, opponent and provider status are not.
  begin
   mid:=(src->>'source_match_id')::uuid;
   if mid is null or coalesce(src->>'source_team_id',team::text)<>team::text or coalesce(src->>'source_grade_id',source_grade::text)<>source_grade::text then raise exception 'Wrong source team';end if;
   incoming:=club_selection_private.playhq_fixture_details(src);
   if incoming->>'format' is null then raise exception 'Match format is not available yet';end if;
   perform club_selection_private.validate_details(incoming||jsonb_build_object('grade',g.name));
  exception when others then
   deferred:=deferred||jsonb_build_array(jsonb_build_object('match_id',src->>'source_match_id','opposition',src->>'opposition','reason','Waiting for a supported match date and format'));continue;
  end;
  src:=src||jsonb_build_object('requires_review',false);
  select * into l from club_selection_private.playhq_links where club_id=c and match_id=mid and team_id=team for update;
  first_link:=l.fixture_id is null;fid:=l.fixture_id;
  if first_link then
   -- An exact single grade/date/format match reuses a manual fixture. For double
   -- headers, require a unique opponent too; ambiguity never creates a duplicate.
   select count(*) into same_day from jsonb_array_elements(fixtures_data) x where x#>>'{days,0,date}'=src#>>'{days,0,date}' and x->>'format'=src->>'format';
   select array_agg(x.id order by x.id) into matches from club_selection_private.fixtures x
    where x.club_id=c and club_selection_private.fixture_group_id(c,x.details)=g.id and x.details->>'format'=incoming->>'format'
    and x.details#>>'{days,0,date}'=incoming#>>'{days,0,date}'
    and not exists(select 1 from club_selection_private.playhq_links q where q.fixture_id=x.id)
    and (same_day=1 or regexp_replace(lower(x.details->>'opposition'),'[^a-z0-9]','','g')=regexp_replace(lower(incoming->>'opposition'),'[^a-z0-9]','','g'));
   if cardinality(matches)=1 then fid:=matches[1];linked:=linked+1;
   elsif cardinality(matches)>1 or exists(select 1 from club_selection_private.fixtures x where x.club_id=c and club_selection_private.fixture_group_id(c,x.details)=g.id
    and x.details->>'format'=incoming->>'format' and x.details#>>'{days,0,date}'=incoming#>>'{days,0,date}'
    and not exists(select 1 from club_selection_private.playhq_links q where q.fixture_id=x.id)) then
    deferred:=deferred||jsonb_build_array(jsonb_build_object('match_id',mid,'opposition',src->>'opposition','reason','More than one possible existing fixture. Check fixture details'));continue;
   else
    d:=incoming||jsonb_build_object('grade',g.name,'grade_group_id',g.id,'competition','', 'brackets',false,'overs',null,'overs_source','default','min_quicks',3,'min_batters',5,'staff','[]'::jsonb,'meeting','');
    insert into club_selection_private.fixtures(club_id,details,slots,updated_by) values(c,d,(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,11)),conn.updated_by) returning id into fid;
    created:=created+1;
   end if;
  end if;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c for update;
  if not first_link and club_selection_private.fixture_group_id(c,f.details) is distinct from g.id then raise exception 'The linked fixture belongs to another grade';end if;
  previous:=case when first_link then f.details else club_selection_private.playhq_fixture_details(l.source_fixture) end;
  d:=f.details;
  -- Preserve later manual overrides. An empty source venue never erases a known venue.
  foreach k in array array['opposition','format','ground','cancelled'] loop
   if (d->k is not distinct from previous->k or nullif(d->>k,'') is null) and not (k in ('opposition','ground') and nullif(incoming->>k,'') is null) then d:=jsonb_set(d,array[k],incoming->k);end if;
  end loop;
  days:='[]';
  for i in 0..jsonb_array_length(incoming->'days')-1 loop
   day:=coalesce(d->'days'->i,'{}');
   foreach k in array array['date','start','ground'] loop
    if (day->k is not distinct from previous->'days'->i->k or nullif(day->>k,'') is null) and not (k in ('start','ground') and nullif(incoming->'days'->i->>k,'') is null) then day:=jsonb_set(day,array[k],incoming->'days'->i->k);end if;
   end loop;
   days:=days||jsonb_build_array(day);
  end loop;
  d:=jsonb_set(d,'{days}',days);
  select exists(select 1 from jsonb_array_elements(f.slots) slot where nullif(slot->>'d1','') is not null or nullif(slot->>'d2','') is not null) into has_picks;
  if first_link then insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,season_id,grade_id,team_id,source_fixture) values(fid,c,mid,s,source_grade,team,src);end if;
  if d is distinct from f.details and not club_selection_private.fixture_completed(f.details,tz) then
   if f.published is not null or (has_picks and (d->>'format' is distinct from f.details->>'format' or
      (select jsonb_agg(x->>'date') from jsonb_array_elements(d->'days') x) is distinct from (select jsonb_agg(x->>'date') from jsonb_array_elements(f.details->'days') x)))
     or f.scorecard_sync is not null or exists(select 1 from club_selection_private.fixture_result_sources where fixture_id=fid and source_match_id is not null) then
    update club_selection_private.playhq_links set pending_fixture=src where fixture_id=fid;attention:=attention+1;
   else
    perform club_selection_private.validate_details(d);
    update club_selection_private.fixtures set details=d,revision=revision+1,updated_by=conn.updated_by,updated_at=now() where id=fid;
    update club_selection_private.playhq_links set source_fixture=src,pending_fixture=null where fixture_id=fid;updated:=updated+1;
   end if;
  else
   update club_selection_private.playhq_links set source_fixture=src,pending_fixture=null where fixture_id=fid;unchanged:=unchanged+1;
  end if;
  result_due:=greatest(now(),coalesce(nullif(src#>>'{days,0,start_at}','')::timestamptz,(src#>>'{days,0,date}')::date::timestamp at time zone coalesce(tz,'Australia/Sydney'))+interval '8 hours');
  insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at) values(c,'results',mid,team,result_due)
   on conflict(club_id,kind,source_id,team_id) do nothing;
 end loop;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,conn.updated_by,'playhq_season_fixtures',jsonb_build_object('grade_id',g.id,'team_id',team,'created',created,'linked',linked,'updated',updated,'attention',attention,'deferred',jsonb_array_length(deferred)));
 return jsonb_build_object('saved',true,'created',created,'linked',linked,'updated',updated,'unchanged',unchanged,'attention',attention,'deferred',deferred);
end $$;
revoke all on function club_selection_private.playhq_import_all(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.playhq_sync_api(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();adm boolean;conn club_selection_private.playhq_connections%rowtype;
 preview club_selection_private.playhq_previews%rowtype;row jsonb;choice jsonb;d jsonb;f club_selection_private.fixtures%rowtype;
 sid uuid;fid uuid;gid uuid;group_name text;created jsonb:='[]';result jsonb;src jsonb;
begin
 if me is null or not club_selection_private.member(p_club_id,me) or not club_selection_private.enabled(p_club_id) then raise exception 'Current club access required';end if;
 adm:=exists(select 1 from public.club_memberships where club_id=p_club_id and user_id=me and permission_role='admin');
 if not adm and not club_selection_private.selector(p_club_id,me) then raise exception 'Club Admin or selector access required';end if;
 if octet_length(p_data::text)>100000 then raise exception 'Request too large';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,9200));
 select * into conn from club_selection_private.playhq_connections where club_id=p_club_id for update;
 if p_action='status' then
  return jsonb_build_object('configured',conn.club_id is not null,'active_season_id',conn.active_season_id,
   'fixture_count',(select count(*) from club_selection_private.playhq_links where club_id=p_club_id and season_id=conn.active_season_id),
   'fixture_through',(select max(day->>'date') from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id cross join lateral jsonb_array_elements(f.details->'days') day where l.club_id=p_club_id and l.season_id=conn.active_season_id),
   'last_checked_at',(select max(checked_at) from club_selection_private.playhq_jobs where club_id=p_club_id and kind='fixtures'),
   'fixture_reports',coalesce((select jsonb_agg(jsonb_build_object('grade',g.name,'deferred',j.last_result->'deferred','error',j.last_error)) from club_selection_private.playhq_jobs j
     join club_selection_private.playhq_grade_mappings m on m.club_id=j.club_id and m.source_grade_id=j.source_id and m.team_id=j.team_id and m.season_id=conn.active_season_id
     join public.playing_groups g on g.id=m.grade_id and g.club_id=p_club_id where j.club_id=p_club_id and j.kind='fixtures' and (j.last_error is not null or jsonb_array_length(coalesce(j.last_result->'deferred','[]'))>0)),'[]'),
   'admin',adm,'organisation_id',conn.organisation_id,'association_id',conn.association_id,'verified',conn.verified_at is not null,'polling_enabled',coalesce(conn.polling_enabled,false),'error',conn.last_error,'pending_changes',(select count(*) from club_selection_private.playhq_links where club_id=p_club_id and pending_fixture is not null));
 elsif p_action='configure' then
  if not adm then raise exception 'Club Admin must configure the API connection';end if;
  if length(btrim(coalesce(p_data->>'api_key',''))) not between 16 and 500 then raise exception 'Enter the club API key';end if;
  -- A fresh secret/version prevents an in-flight response using old credentials from committing.
  sid:=vault.create_secret(p_data->>'api_key');
  insert into club_selection_private.playhq_connections(club_id,organisation_id,association_id,secret_id,updated_by)
   values(p_club_id,(p_data->>'organisation_id')::uuid,(p_data->>'association_id')::uuid,sid,me)
   on conflict(club_id) do update set organisation_id=excluded.organisation_id,association_id=excluded.association_id,secret_id=excluded.secret_id,generation=gen_random_uuid(),verified_at=null,polling_enabled=false,last_error=null,updated_by=me,updated_at=now();
  if conn.secret_id is not null then delete from vault.secrets where id=conn.secret_id;end if;
  return jsonb_build_object('saved',true);
 elsif p_action='pause' then
  update club_selection_private.playhq_connections set polling_enabled=false where club_id=p_club_id;
  return jsonb_build_object('saved',true);
 elsif p_action='enable' then
  if conn.verified_at is null then raise exception 'Verify the PlayHQ connection first';end if;
  -- Activation remains a deliberate action after provider access and live coverage checks.
  update club_selection_private.playhq_connections set polling_enabled=true where club_id=p_club_id;
  return jsonb_build_object('saved',true);
 elsif p_action='fixture_status' then
  select to_jsonb(l)-'club_id' into result from club_selection_private.playhq_links l where l.club_id=p_club_id and l.fixture_id=(p_data->>'fixture_id')::uuid;
  return coalesce(result,'{}');
 elsif p_action='import_all' then
  select * into preview from club_selection_private.playhq_previews where id=(p_data->>'preview_id')::uuid and club_id=p_club_id and generation=conn.generation and created_at>now()-interval '30 minutes';
  if preview.id is null then raise exception 'Season download expired. Check fixtures again';end if;
  update club_selection_private.playhq_grade_mappings set source_grade_id=preview.grade_id where club_id=p_club_id and season_id=preview.season_id and team_id=preview.team_id and source_grade_id is distinct from preview.grade_id;
  insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id) values(p_club_id,'fixtures',preview.grade_id,preview.team_id) on conflict do nothing;
  result:=club_selection_private.playhq_import_all(p_club_id,preview.season_id,preview.grade_id,preview.team_id,preview.fixtures);
  update club_selection_private.playhq_jobs set last_result=result,checked_at=now(),last_error=null,due_at=now()+interval '4 hours' where club_id=p_club_id and kind='fixtures' and source_id=preview.grade_id and team_id=preview.team_id;
  return result;
 elsif p_action='import' then
  select * into preview from club_selection_private.playhq_previews where id=(p_data->>'preview_id')::uuid and club_id=p_club_id and generation=conn.generation and created_at>now()-interval '30 minutes';
  if preview.id is null then raise exception 'Preview expired. Load the fixtures again';end if;
  if jsonb_typeof(p_data->'choices') is distinct from 'array' or jsonb_array_length(p_data->'choices') not between 1 and 100 then raise exception 'Choose 1 to 100 fixtures';end if;
  gid:=(p_data->>'group_id')::uuid;
  select name into group_name from public.playing_groups where id=gid and club_id=p_club_id and active;
  if group_name is null then raise exception 'Choose an active club grade';end if;
  for choice in select * from jsonb_array_elements(p_data->'choices') loop
   select value into row from jsonb_array_elements(preview.fixtures) where value->>'source_match_id'=choice->>'match_id';
   if row is null or coalesce((row->>'requires_review')::boolean,true) then raise exception 'Check this fixture before importing';end if;
   select fixture_id into fid from club_selection_private.playhq_links where club_id=p_club_id and match_id=(choice->>'match_id')::uuid and team_id=preview.team_id;
   if fid is not null then created:=created||jsonb_build_array(fid);continue;end if;
   fid:=coalesce(nullif(choice->>'fixture_id','')::uuid,gen_random_uuid());
   select * into f from club_selection_private.fixtures where id=fid;
   if f.id is not null then
    if f.club_id<>p_club_id or f.revision<>coalesce((choice->>'revision')::int,-1) then raise exception 'Fixture changed. Refresh before linking';end if;
    if f.details->>'grade_group_id' is distinct from gid::text or f.details->>'format' is distinct from row->>'format' or f.details->'days'->0->>'date' is distinct from row->'days'->0->>'date' then raise exception 'Existing fixture grade, format or date differs';end if;
    if exists(select 1 from club_selection_private.playhq_links where fixture_id=fid) then raise exception 'Fixture already linked to another match';end if;
   else
    d:=jsonb_build_object('grade',group_name,'grade_group_id',gid,'competition',coalesce(p_data->>'competition',''),'opposition',row->>'opposition','format',row->>'format','ground',coalesce(row->'days'->0->>'ground',''),'days',(select jsonb_agg(jsonb_build_object('date',x->>'date','start',x->>'time','ground',x->>'ground') order by ord) from jsonb_array_elements(row->'days') with ordinality a(x,ord)), 'brackets',false,'overs',null,'overs_source','default','min_quicks',3,'min_batters',5,'staff','[]'::jsonb,'meeting','','cancelled',coalesce((row->>'cancelled')::boolean,false));
    result:=club_selection_private.api(p_club_id,'save_fixture',jsonb_build_object('id',fid,'revision',0,'details',d,'request_id',gen_random_uuid()));
   end if;
   insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,season_id,grade_id,team_id,source_fixture,pending_fixture) values(fid,p_club_id,(row->>'source_match_id')::uuid,preview.season_id,preview.grade_id,preview.team_id,
    case when f.id is null then row else row||jsonb_build_object('opposition',f.details->>'opposition','cancelled',coalesce((f.details->>'cancelled')::boolean,false),
     'days',(select jsonb_agg(x||jsonb_build_object('date',fd->>'date','time',fd->>'start','ground',coalesce(fd->>'ground',f.details->>'ground')) order by ord) from jsonb_array_elements(row->'days') with ordinality a(x,ord) cross join lateral (select f.details->'days'->(ord::int-1) fd) saved_day)) end,
    case when f.id is not null and (f.details->>'opposition' is distinct from row->>'opposition' or coalesce((f.details->>'cancelled')::boolean,false) is distinct from coalesce((row->>'cancelled')::boolean,false)
     or f.details->'days' is distinct from (select jsonb_agg(jsonb_build_object('date',x->>'date','start',x->>'time','ground',x->>'ground') order by ord) from jsonb_array_elements(row->'days') with ordinality a(x,ord))) then row end);
   insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id) values(p_club_id,'fixtures',preview.grade_id,preview.team_id) on conflict do nothing;
   insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at) values(p_club_id,'results',(row->>'source_match_id')::uuid,preview.team_id,greatest(now(),(row#>>'{days,0,start_at}')::timestamptz+interval '8 hours')) on conflict do nothing;
   created:=created||jsonb_build_array(fid);
  end loop;
  return jsonb_build_object('saved',true,'fixture_ids',created);
 end if;
 raise exception 'Unknown PlayHQ action';
end $function$
;
revoke all on function public.playhq_sync_api(uuid,text,jsonb) from public,anon;
grant execute on function public.playhq_sync_api(uuid,text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.playhq_sync_worker(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare c uuid:=(p_data->>'club_id')::uuid;conn club_selection_private.playhq_connections%rowtype;answer jsonb;sid uuid;j club_selection_private.playhq_jobs%rowtype; row jsonb;link club_selection_private.playhq_links%rowtype;next_due timestamptz;last_day date;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'Backend access required';end if;
 if p_action='claim' then
  delete from club_selection_private.playhq_runs where id=(p_data->>'run_id')::uuid and expires_at>now() and token_hash=encode(extensions.digest(p_data->>'token','sha256'),'hex') returning id into sid;
  if sid is null then raise exception 'Invalid scheduled check token';end if;
  select q.* into j from club_selection_private.playhq_jobs q join club_selection_private.playhq_connections x using(club_id)
   where x.polling_enabled and x.verified_at is not null and q.due_at<=now() and coalesce(q.leased_until,'-infinity')<now() and club_selection_private.enabled(q.club_id)
   and (q.kind='season' and q.source_id=x.active_season_id or q.kind='fixtures' and exists(select 1 from club_selection_private.playhq_grade_mappings m where m.club_id=q.club_id and m.season_id=x.active_season_id and m.source_grade_id=q.source_id and m.team_id=q.team_id)
    or q.kind='results' and exists(select 1 from club_selection_private.playhq_links l where l.club_id=q.club_id and l.season_id=x.active_season_id and l.match_id=q.source_id and l.team_id=q.team_id))
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
  if j.kind='season' then
   if j.source_id is distinct from conn.active_season_id or jsonb_typeof(p_data#>'{result,teams}') is distinct from 'array' then raise exception 'Season changed. Reload setup';end if;
   for row in select value from jsonb_array_elements(p_data#>'{result,teams}') loop
    if nullif(row#>>'{grade,id}','') is not null then
     update club_selection_private.playhq_grade_mappings set source_grade_id=(row#>>'{grade,id}')::uuid where club_id=c and season_id=j.source_id and team_id=(row->>'id')::uuid and source_grade_id is distinct from (row#>>'{grade,id}')::uuid;
     insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id)
      select c,'fixtures',source_grade_id,team_id from club_selection_private.playhq_grade_mappings where club_id=c and season_id=j.source_id and team_id=(row->>'id')::uuid
      on conflict(club_id,kind,source_id,team_id) do nothing;
    end if;
   end loop;
  elsif j.kind='fixtures' then
   answer:=club_selection_private.playhq_import_all(c,conn.active_season_id,j.source_id,j.team_id,p_data#>'{result,fixtures}');
   update club_selection_private.playhq_jobs set last_result=answer where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
   if exists(select 1 from jsonb_array_elements(p_data#>'{result,fixtures}') x where (x#>>'{days,0,date}')::date between current_date and current_date+2) then next_due:=now()+interval '4 hours';end if;
  else
   if p_data#>>'{result,source_match_id}' is distinct from j.source_id::text then raise exception 'Wrong match result';end if;
   update club_selection_private.playhq_links set summary=(p_data->'result')-'shared_scorecard',summary_checked_at=now() where club_id=c and match_id=j.source_id and team_id=j.team_id returning * into link;
   perform club_selection_private.playhq_store_scorecard(c,link.fixture_id,p_data#>'{result,shared_scorecard}');
   select max((x->>'date')::date) into last_day from jsonb_array_elements(link.source_fixture->'days') x;
   next_due:=now()+case when last_day>=current_date-3 then interval '4 hours' when last_day>=current_date-14 then interval '1 day' else interval '7 days' end;
  end if;
  update club_selection_private.playhq_jobs set lease_id=null,leased_until=null,attempts=0,last_error=null,due_at=next_due,checked_at=now() where club_id=c and kind=j.kind and source_id=j.source_id and team_id=j.team_id;
  return jsonb_build_object('saved',true);
 elsif p_action='preview' then
  if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or octet_length(p_data::text)>2000000 then raise exception 'Invalid preview';end if;
  insert into club_selection_private.playhq_previews(club_id,generation,season_id,grade_id,team_id,fixtures) values(c,conn.generation,(p_data->>'season_id')::uuid,(p_data->>'grade_id')::uuid,(p_data->>'team_id')::uuid,p_data->'fixtures') returning id into sid;
  delete from club_selection_private.playhq_previews where club_id=c and created_at<now()-interval '1 day';
  return jsonb_build_object('preview_id',sid);
 end if;
 raise exception 'Unknown worker action';
end $function$
;
revoke all on function public.playhq_sync_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.playhq_sync_worker(text,jsonb) to service_role;

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
 if cat.season_id is not null then perform club_selection_private.playhq_queue_season(c,cat.season_id);end if;
 ctx:=club_selection_private.selection_groups_context(c)||jsonb_build_object('can_edit',true,'saved',true);
 insert into club_selection_private.requests values(c,me,rid,'selection_groups',p_data,ctx,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'selection_groups',jsonb_build_object('request_id',rid,'groups',p_data->'groups','grades',p_data->'grades'));
 return ctx;
end $$;
revoke all on function public.club_selection_groups(uuid,text,jsonb) from public,anon;
grant execute on function public.club_selection_groups(uuid,text,jsonb) to authenticated;

-- Remember previously saved seasons without changing club choices or enabling them.
update club_selection_private.playhq_connections cn set active_season_id=(
 select cat.season_id from club_selection_private.playhq_team_catalogues cat where cat.club_id=cn.club_id and cat.generation=cn.generation
 and exists(select 1 from club_selection_private.playhq_grade_mappings m where m.club_id=cn.club_id and m.season_id=cat.season_id)
 order by cat.created_at desc limit 1) where cn.active_season_id is null;
-- The scheduler only claims verified clubs that have enabled their season checks.
select cron.alter_job((select jobid from cron.job where jobname='playhq-sync'),active:=true);
