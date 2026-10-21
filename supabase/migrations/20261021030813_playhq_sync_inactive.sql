-- PlayHQ public API integration. No credentials or automatic polling enabled here.
create table club_selection_private.playhq_connections (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 organisation_id uuid not null, association_id uuid not null, secret_id uuid not null,
 generation uuid not null default gen_random_uuid(), verified_at timestamptz,
 polling_enabled boolean not null default false, last_error text,
 updated_by uuid not null, updated_at timestamptz not null default now()
);
create table club_selection_private.playhq_previews (
 id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete cascade,
 generation uuid not null, season_id uuid not null,grade_id uuid not null,team_id uuid not null,
 fixtures jsonb not null,created_at timestamptz not null default now()
);
create table club_selection_private.playhq_links (
 fixture_id uuid primary key references club_selection_private.fixtures(id) on delete cascade,
 club_id uuid not null references public.clubs(id) on delete cascade,match_id uuid not null,
 season_id uuid not null,grade_id uuid not null,team_id uuid not null,
 source_fixture jsonb not null,pending_fixture jsonb,summary jsonb,summary_checked_at timestamptz,
 unique(club_id,match_id)
);
create table club_selection_private.playhq_jobs (
 club_id uuid not null references public.clubs(id) on delete cascade,kind text not null check(kind in ('fixtures','results')),
 source_id uuid not null,team_id uuid not null,due_at timestamptz not null default now(),
 lease_id uuid,leased_until timestamptz,attempts integer not null default 0,last_error text,
 primary key(club_id,kind,source_id,team_id)
);
create table club_selection_private.playhq_runs (
 id uuid primary key default gen_random_uuid(),token_hash text not null,expires_at timestamptz not null default now()+interval '5 minutes'
);
alter table club_selection_private.playhq_runs enable row level security;
revoke all on club_selection_private.playhq_runs from public,anon,authenticated,service_role;
alter table club_selection_private.playhq_connections enable row level security;
alter table club_selection_private.playhq_previews enable row level security;
alter table club_selection_private.playhq_links enable row level security;
alter table club_selection_private.playhq_jobs enable row level security;
revoke all on club_selection_private.playhq_connections,club_selection_private.playhq_previews,club_selection_private.playhq_links,club_selection_private.playhq_jobs from public,anon,authenticated,service_role;

create function public.playhq_sync_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
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
  return jsonb_build_object('configured',conn.club_id is not null,'admin',adm,'organisation_id',conn.organisation_id,'association_id',conn.association_id,'verified',conn.verified_at is not null,'polling_enabled',coalesce(conn.polling_enabled,false),'error',conn.last_error,'pending_changes',(select count(*) from club_selection_private.playhq_links where club_id=p_club_id and pending_fixture is not null));
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
   select fixture_id into fid from club_selection_private.playhq_links where club_id=p_club_id and match_id=(choice->>'match_id')::uuid;
   if fid is not null then created:=created||jsonb_build_array(fid);continue;end if;
   fid:=coalesce(nullif(choice->>'fixture_id','')::uuid,gen_random_uuid());
   select * into f from club_selection_private.fixtures where id=fid;
   if f.id is not null then
    if f.club_id<>p_club_id or f.revision<>coalesce((choice->>'revision')::int,-1) then raise exception 'Fixture changed. Refresh before linking';end if;
    if f.details->>'grade_group_id' is distinct from gid::text or f.details->>'format' is distinct from row->>'format' or f.details->'days'->0->>'date' is distinct from row->'days'->0->>'date' then raise exception 'Existing fixture grade, format or date differs';end if;
    if exists(select 1 from club_selection_private.playhq_links where fixture_id=fid) then raise exception 'Fixture already linked to another match';end if;
   else
    d:=jsonb_build_object('grade',group_name,'grade_group_id',gid,'competition',coalesce(p_data->>'competition',''),'opposition',row->>'opposition','format',row->>'format','ground',coalesce(row->'days'->0->>'ground',''),'days',(select jsonb_agg(jsonb_build_object('date',x->>'date','start',x->>'time','ground',x->>'ground') order by ord) from jsonb_array_elements(row->'days') with ordinality a(x,ord)), 'brackets',false,'overs',null,'overs_source','default','min_quicks',3,'min_batters',5,'staff','[]'::jsonb,'meeting','','cancelled',false);
    result:=club_selection_private.api(p_club_id,'save_fixture',jsonb_build_object('id',fid,'revision',0,'details',d,'request_id',gen_random_uuid()));
   end if;
   insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,season_id,grade_id,team_id,source_fixture) values(fid,p_club_id,(row->>'source_match_id')::uuid,preview.season_id,preview.grade_id,preview.team_id,row);
   insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id) values(p_club_id,'fixtures',preview.grade_id,preview.team_id),(p_club_id,'results',(row->>'source_match_id')::uuid,preview.team_id) on conflict do nothing;
   created:=created||jsonb_build_array(fid);
  end loop;
  return jsonb_build_object('saved',true,'fixture_ids',created);
 end if;
 raise exception 'Unknown PlayHQ action';
end $$;
revoke all on function public.playhq_sync_api(uuid,text,jsonb) from public,anon;
grant execute on function public.playhq_sync_api(uuid,text,jsonb) to authenticated;

-- Only the backend may obtain credentials or stage provider responses.
create function public.playhq_sync_worker(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
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
 select * into conn from club_selection_private.playhq_connections where club_id=c for update;
 if conn.club_id is null then raise exception 'Configure the PlayHQ connection first';end if;
 if p_action='connection' then
  select jsonb_build_object('key',decrypted_secret,'organisation_id',conn.organisation_id,'association_id',conn.association_id,'generation',conn.generation,'timezone',coalesce(a.timezone,'Australia/Sydney')) into answer from vault.decrypted_secrets v left join club_selection_private.access a on a.club_id=c where v.id=conn.secret_id;
  return answer;
 end if;
 if conn.generation::text is distinct from p_data->>'generation' then raise exception 'Connection changed. Retry with the current connection';end if;
 if p_action='verified' then
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
    if (row-'source_updated_at') is distinct from (link.source_fixture-'source_updated_at') then
     update club_selection_private.playhq_links set pending_fixture=row where fixture_id=link.fixture_id;
    else
     update club_selection_private.playhq_links set pending_fixture=null where fixture_id=link.fixture_id;
    end if;
    if (row#>>'{days,0,date}')::date between current_date and current_date+2 then next_due:=least(next_due,now()+interval '4 hours');end if;
   end loop;
  else
   if p_data#>>'{result,source_match_id}' is distinct from j.source_id::text then raise exception 'Wrong match result';end if;
   update club_selection_private.playhq_links set summary=p_data->'result',summary_checked_at=now() where club_id=c and match_id=j.source_id and team_id=j.team_id returning * into link;
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

create function club_selection_private.schedule_playhq_check() returns bigint
language plpgsql security definer set search_path='' as $$
declare token text;run_id uuid;request_id bigint;
begin
 if not pg_try_advisory_xact_lock(19821,19821) then return null;end if;
 delete from club_selection_private.playhq_runs where expires_at<now();
 if not exists(select 1 from club_selection_private.playhq_jobs j join club_selection_private.playhq_connections c using(club_id) where c.polling_enabled and c.verified_at is not null and j.due_at<=now() and coalesce(j.leased_until,'-infinity')<now()) then return null;end if;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into club_selection_private.playhq_runs(token_hash) values(encode(extensions.digest(token,'sha256'),'hex')) returning id into run_id;
 select net.http_post(url:='https://txrmgwoiowlqbuulmztd.supabase.co/functions/v1/playhq-sync',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('action','run','run_id',run_id,'token',token),timeout_milliseconds:=60000) into request_id;
 return request_id;
end $$;
revoke all on function club_selection_private.schedule_playhq_check() from public,anon,authenticated,service_role;
select cron.schedule('playhq-sync','*/5 * * * *','select club_selection_private.schedule_playhq_check()');
select cron.alter_job((select jobid from cron.job where jobname='playhq-sync'),active:=false);

