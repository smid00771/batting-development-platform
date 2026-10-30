-- Synthetic schema and pre-.310 function baseline; no club data.
create role anon;create role authenticated;create role service_role;
create schema auth;create schema club_selection_private;create schema club_batting_private;
create table club_batting_private.fixture_review_rosters(fixture_id uuid,club_id uuid,player_ids uuid[],revision integer,updated_by uuid,updated_at timestamp with time zone,captain_player_id uuid,keeper_player_id uuid);
create table club_selection_private.access(club_id uuid,mode text,status text,valid_until date,timezone text default 'Australia/Sydney',revision integer,roster_revision integer,updated_at timestamp with time zone,updated_by uuid,active_from date,fixture_defaults jsonb,head_selector_id uuid,publication_delegate_id uuid,publication_delegate_from date,publication_delegate_until date,grade_levels jsonb);
create table club_selection_private.availability(roster_id uuid,usual_available boolean,available_dates jsonb,blocks jsonb,revision integer,checked_at timestamp with time zone,checked_by uuid,unavailable_dates jsonb);
create table club_selection_private.fixture_calendar_trials(id uuid,club_id uuid,title text,days jsonb,audience text,team_ids uuid[],included boolean,revision integer,updated_at timestamp with time zone,updated_by uuid);
create table club_selection_private.fixtures(id uuid default gen_random_uuid(),club_id uuid,details jsonb,slots jsonb,revision integer default 1,published jsonb,publication integer,published_at timestamp with time zone,updated_at timestamp with time zone default now(),updated_by uuid,review jsonb,review_requested_at timestamp with time zone,selection_unlocked_until timestamp with time zone,selection_unlocked_by uuid,scorecard_sync jsonb);
create table club_selection_private.playhq_access_requests(club_id uuid,association text,club_url text,contact_name text,contact_email text,contact_role text,requested_at timestamp with time zone,requested_by uuid,revision integer,updated_at timestamp with time zone,updated_by uuid);
create table club_selection_private.playhq_connections(club_id uuid,organisation_id uuid,association_id uuid,secret_id uuid,generation uuid,verified_at timestamp with time zone,polling_enabled boolean,last_error text,updated_by uuid,updated_at timestamp with time zone,active_season_id uuid);
create table club_selection_private.playhq_grade_mappings(club_id uuid,season_id uuid,team_id uuid,source_grade_id uuid,grade_id uuid);
create table club_selection_private.playhq_jobs(club_id uuid,kind text,source_id uuid,team_id uuid,due_at timestamp with time zone,lease_id uuid,leased_until timestamp with time zone,attempts integer,last_error text,last_manual_check timestamp with time zone,last_result jsonb,checked_at timestamp with time zone);
create table club_selection_private.playhq_links(fixture_id uuid,club_id uuid,match_id uuid,season_id uuid,grade_id uuid,team_id uuid,source_fixture jsonb,pending_fixture jsonb,summary jsonb,summary_checked_at timestamp with time zone,result_error text,last_change_token text,import_created boolean,original_details jsonb,last_applied_revision integer,import_touched boolean);
create table club_selection_private.playhq_previews(id uuid,club_id uuid,generation uuid,season_id uuid,grade_id uuid,team_id uuid,fixtures jsonb,created_at timestamp with time zone);
create table club_selection_private.playhq_team_catalogues(id uuid,club_id uuid,season_id uuid,generation uuid,teams jsonb,created_at timestamp with time zone);
create table club_selection_private.requests(club_id uuid,user_id uuid,request_id uuid,action text,payload jsonb,result jsonb,created_at timestamp with time zone);
create table club_selection_private.roster(id uuid,club_id uuid,external_id text,name text,grade text,batting text,bowling text,bowling_load text,keeper boolean,active boolean,user_id uuid,updated_at timestamp with time zone,account_email text,auto_link_disabled boolean,fielding text,spin_style text);
create table public.playing_groups(id uuid,club_id uuid,name text,sort_order integer,active boolean,created_by uuid,created_at timestamp with time zone,updated_at timestamp with time zone,batting_enabled boolean);
alter table club_selection_private.access add primary key(club_id);
alter table club_selection_private.fixtures add primary key(id);
alter table club_selection_private.requests add primary key(club_id,user_id,request_id);
alter table club_selection_private.playhq_jobs add primary key(club_id,kind,source_id,team_id);
alter table club_selection_private.playhq_links add primary key(fixture_id);
create table club_selection_private.audit(club_id uuid,actor_id uuid,action text,detail jsonb);
create table public.test_clubs(id uuid primary key,batting boolean,selects boolean,archived boolean default false);
create table public.club_memberships(club_id uuid,user_id uuid,permission_role text);
create table public.team_review_sessions(club_id uuid,fixture_id uuid);
create table club_batting_private.fixture_innings(club_id uuid,fixture_id uuid);
create table club_batting_private.fixture_preparations(club_id uuid,fixture_id uuid);
create table club_selection_private.fixture_result_sources(fixture_id uuid,source_match_id uuid);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function public.is_club_admin(c uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role='admin')$$;
create function club_selection_private.member(c uuid,u uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships join public.test_clubs cl on cl.id=club_id where club_id=c and user_id=u and not cl.archived)$$;
create function club_selection_private.enabled(c uuid) returns boolean language sql stable as $$select coalesce((select selects and not archived from public.test_clubs where id=c),false)$$;
create function club_selection_private.shared_products(c uuid) returns jsonb language sql stable as $$select jsonb_build_object('batting',batting and not archived) from public.test_clubs where id=c$$;
create function club_batting_private.team_review_staff(c uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role in ('admin','coach'))$$;
create function club_batting_private.review_fixture_options(c uuid) returns jsonb language sql stable as $$select coalesce(current_setting('test.options',true),'[]')::jsonb$$;
create function club_selection_private.fixture_group_id(c uuid,d jsonb) returns uuid language sql stable as $$select (d->>'grade_group_id')::uuid$$;
create function club_selection_private.fixture_identity(c uuid,d jsonb) returns jsonb language sql stable as $$select jsonb_build_array(d->'grade_group_id',d->'format',d#>'{days,0,date}',d->'opposition')$$;
create function club_batting_private.fixture_correction_authorised(c uuid,f uuid) returns boolean language sql stable as $$select false$$;
create function club_selection_private.fixture_completed(d jsonb,tz text) returns boolean language sql stable as $$select (d#>>'{days,0,date}')::date<current_date$$;
create function club_selection_private.playhq_results_due(f uuid) returns timestamptz language sql stable as $$select now()$$;
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
 if not adm and not club_selection_private.selection_viewer(p_club_id,me) then raise exception 'Club Admin or selector access required';end if;
 if octet_length(p_data::text)>100000 then raise exception 'Request too large';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,9200));
 select * into conn from club_selection_private.playhq_connections where club_id=p_club_id for update;
 if p_action='status' then
  return jsonb_build_object('configured',conn.club_id is not null,'active_season_id',conn.active_season_id,
   'fixture_count',(select count(*) from club_selection_private.playhq_links where club_id=p_club_id and season_id=conn.active_season_id),
   'fixture_through',(select max(day->>'date') from club_selection_private.playhq_links l join club_selection_private.fixtures fx on fx.id=l.fixture_id cross join lateral jsonb_array_elements(fx.details->'days') day where l.club_id=p_club_id and l.season_id=conn.active_season_id),
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
  if not adm then raise exception 'Club Admin manages automatic fixture checks';end if;
  update club_selection_private.playhq_connections set polling_enabled=false where club_id=p_club_id;
  return jsonb_build_object('saved',true);
 elsif p_action='enable' then
  if not adm then raise exception 'Club Admin manages automatic fixture checks';end if;
  if conn.verified_at is null then raise exception 'Verify the PlayHQ connection first';end if;
  -- Activation remains a deliberate action after provider access and live coverage checks.
  update club_selection_private.playhq_connections set polling_enabled=true where club_id=p_club_id;
  return jsonb_build_object('saved',true);
 elsif p_action='fixture_status' then
  if not adm and not exists(select 1 from club_selection_private.fixtures fx where fx.club_id=p_club_id and fx.id=(p_data->>'fixture_id')::uuid and club_selection_private.fixture_view(p_club_id,fx.details,me)) then raise exception 'View access to this Selection Group is required';end if;
  select to_jsonb(l)-'club_id' into result from club_selection_private.playhq_links l where l.club_id=p_club_id and l.fixture_id=(p_data->>'fixture_id')::uuid;
  return coalesce(result,'{}');
 elsif p_action='import_all' then
  select * into preview from club_selection_private.playhq_previews where id=(p_data->>'preview_id')::uuid and club_id=p_club_id and generation=conn.generation and created_at>now()-interval '30 minutes';
  if preview.id is null then raise exception 'Season download expired. Check fixtures again';end if;
  if not adm and not exists(select 1 from club_selection_private.playhq_grade_mappings gm join club_selection_private.selection_group_grades sg on sg.club_id=gm.club_id and sg.grade_id=gm.grade_id where gm.club_id=p_club_id and gm.season_id=preview.season_id and gm.team_id=preview.team_id and club_selection_private.selection_group_level(p_club_id,sg.selection_group_id,me)=2) then raise exception 'Edit access to this Selection Group is required';end if;
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
  if club_selection_private.scoped_selections(p_club_id) and not club_selection_private.selection_edit(p_club_id,jsonb_build_object('grade_group_id',gid,'grade',group_name),me) then raise exception 'Edit access to this Selection Group is required';end if;
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
   insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at) values(p_club_id,'results',(row->>'source_match_id')::uuid,preview.team_id,club_selection_private.playhq_results_due(fid)) on conflict do nothing;
   created:=created||jsonb_build_array(fid);
  end loop;
  return jsonb_build_object('saved',true,'fixture_ids',created);
 end if;
 raise exception 'Unknown PlayHQ action';
end $function$
;
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
  select jsonb_build_object('season_id',l.season_id,'source_fixture',l.source_fixture,'grade',f.details->>'grade','competition',f.details->>'competition','timezone',a.timezone,'canonical_match',(
   select jsonb_build_object('provider','playcricket_au','match_id',src.source_match_id,'team_id',src.team_id)
   from club_selection_private.fixture_result_sources src where src.fixture_id=f.id and src.club_id=c and src.no_play is null and src.team_id is not null
   and exists(select 1 from public.match_review_scorecards sc where sc.club_id=c and sc.source_match_id=src.source_match_id and sc.scorecard->>'provider'='playcricket_au')
  )) into answer
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
   next_due:=club_selection_private.playhq_results_due(link.fixture_id,now());
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
CREATE OR REPLACE FUNCTION club_selection_private.playhq_import_all(c uuid, s uuid, source_grade uuid, team uuid, fixtures_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare conn club_selection_private.playhq_connections%rowtype;g public.playing_groups%rowtype;f club_selection_private.fixtures%rowtype;l club_selection_private.playhq_links%rowtype;
 src jsonb;incoming jsonb;previous jsonb;d jsonb;day jsonb;days jsonb;k text;i int;fid uuid;mid uuid;matches uuid[];same_day int;result_due timestamptz;tz text;
 created int:=0;linked int:=0;updated int:=0;unchanged int:=0;attention int:=0;deferred jsonb:='[]';has_picks boolean;first_link boolean;created_in_import boolean;
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
  first_link:=l.fixture_id is null;fid:=l.fixture_id;created_in_import:=false;
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
    created:=created+1;created_in_import:=true;
   end if;
  end if;
  select * into f from club_selection_private.fixtures where id=fid and club_id=c for update;
  -- Once a person changes this fixture, a later automatic update must never
  -- make it eligible for deletion or restoration by disconnecting the import.
  if not first_link and f.revision is distinct from l.last_applied_revision then
   update club_selection_private.playhq_links set import_touched=true where fixture_id=fid;
  end if;
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
  if first_link then insert into club_selection_private.playhq_links(fixture_id,club_id,match_id,season_id,grade_id,team_id,source_fixture,import_created,original_details,last_applied_revision) values(fid,c,mid,s,source_grade,team,src,created_in_import,f.details,f.revision);end if;
  if d is distinct from f.details and not club_selection_private.fixture_completed(f.details,tz) then
   if f.published is not null or (has_picks and (d->>'format' is distinct from f.details->>'format' or
      (select jsonb_agg(x->>'date') from jsonb_array_elements(d->'days') x) is distinct from (select jsonb_agg(x->>'date') from jsonb_array_elements(f.details->'days') x)))
     or f.scorecard_sync is not null or exists(select 1 from club_selection_private.fixture_result_sources where fixture_id=fid and source_match_id is not null) then
    update club_selection_private.playhq_links set pending_fixture=src where fixture_id=fid;attention:=attention+1;
   else
    perform club_selection_private.validate_details(d);
    update club_selection_private.fixtures set details=d,revision=revision+1,updated_by=conn.updated_by,updated_at=now() where id=fid;
    update club_selection_private.playhq_links set source_fixture=src,pending_fixture=null,last_applied_revision=f.revision+1 where fixture_id=fid;updated:=updated+1;
   end if;
  else
   update club_selection_private.playhq_links set source_fixture=src,pending_fixture=null where fixture_id=fid;unchanged:=unchanged+1;
  end if;
  result_due:=club_selection_private.playhq_results_due(fid);
  insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at) values(c,'results',mid,team,result_due)
   on conflict(club_id,kind,source_id,team_id) do nothing;
 end loop;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,conn.updated_by,'playhq_season_fixtures',jsonb_build_object('grade_id',g.id,'team_id',team,'created',created,'linked',linked,'updated',updated,'attention',attention,'deferred',jsonb_array_length(deferred)));
 return jsonb_build_object('saved',true,'created',created,'linked',linked,'updated',updated,'unchanged',unchanged,'attention',attention,'deferred',deferred);
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.fixture_calendar_trials_api(c uuid, action text, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();adm boolean;teams jsonb;trials jsonb;ids uuid[];r club_selection_private.fixture_calendar_trials%rowtype;
 receipt club_selection_private.requests%rowtype;rid uuid;fid uuid;result jsonb;trial_title text;
begin
 if me is null or not club_selection_private.member(c,me) or not club_selection_private.enabled(c) then raise exception 'Active club Selections access required';end if;
 if not exists(select 1 from auth.users where id=me and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())) then raise exception 'A verified active account is required';end if;
 adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role='admin');
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.name),'[]') into teams
 from public.playing_groups g where g.club_id=c and g.active and (adm or club_selection_private.selection_edit(c,jsonb_build_object('grade_group_id',g.id,'grade',g.name),me));
 if not adm and jsonb_array_length(teams)=0 then raise exception 'Fixture editing access required';end if;
 if action='context' then
  select coalesce(jsonb_agg(to_jsonb(t)-'club_id'-'updated_by' order by t.days->0->>'date',t.title),'[]') into trials
  from club_selection_private.fixture_calendar_trials t where t.club_id=c and club_selection_private.calendar_trial_edit(c,t.audience,t.team_ids,me)
   and exists(select 1 from jsonb_array_elements(t.days) day where day->>'date'>=(now() at time zone (select timezone from club_selection_private.access where club_id=c))::date::text);
  return jsonb_build_object('can_whole_club',adm,'teams',teams,'trials',trials);
 end if;
 if action<>'save' or jsonb_typeof(data) is distinct from 'object' or length(data::text)>20000 then raise exception 'Invalid trial request';end if;
 fid:=nullif(data->>'id','')::uuid;rid:=nullif(data->>'request_id','')::uuid;
 trial_title:=btrim(coalesce(data->>'title',''));
 if fid is null or rid is null or length(trial_title) not between 1 and 120 or coalesce(data->>'audience','') not in ('club','teams')
  or jsonb_typeof(data->'included') is distinct from 'boolean' or jsonb_typeof(data->'team_ids') is distinct from 'array'
 then raise exception 'Check the trial name, dates and audience';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(data->'team_ids');
 if exists(select 1 from unnest(ids) x(id) where id is null or not exists(select 1 from public.playing_groups g where g.id=x.id and g.club_id=c and g.active)) then raise exception 'Choose active teams from this club';end if;
 if (data->>'audience'='club' and cardinality(ids)<>0) or (data->>'audience'='teams' and cardinality(ids) not between 1 and 100)
  or not club_selection_private.calendar_trial_edit(c,data->>'audience',ids,me) then raise exception 'You cannot manage trials for this audience';end if;
 perform club_selection_private.validate_details(jsonb_build_object('grade','Club trial','opposition',trial_title,'days',data->'days','staff','[]'::jsonb));
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into receipt from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then
  if receipt.action<>'calendar_trial_save' or receipt.payload<>data then raise exception 'This request was used for different changes';end if;
  return receipt.result;
 end if;
 select * into r from club_selection_private.fixture_calendar_trials where id=fid for update;
 if found and (r.club_id<>c or not club_selection_private.calendar_trial_edit(c,r.audience,r.team_ids,me)) then raise exception 'Trial editing access required';end if;
 if coalesce(r.revision,0)<>coalesce((data->>'revision')::integer,-1) then raise exception 'This trial changed. Close and reopen it before saving';end if;
 if r.id is null then
  insert into club_selection_private.fixture_calendar_trials(id,club_id,title,days,audience,team_ids,included,updated_by)
  values(fid,c,trial_title,data->'days',data->>'audience',ids,(data->>'included')::boolean,me) returning * into r;
 else
  update club_selection_private.fixture_calendar_trials set title=trial_title,days=data->'days',audience=data->>'audience',team_ids=ids,
   included=(data->>'included')::boolean,revision=revision+1,updated_at=now(),updated_by=me where id=fid returning * into r;
 end if;
 result:=jsonb_build_object('saved',true,'id',fid,'revision',r.revision);
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,me,rid,'calendar_trial_save',data,result);
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.recover_completed_scorecard_team(c uuid, sid uuid, fid uuid, tid uuid, actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare f club_selection_private.fixtures%rowtype;card jsonb;team jsonb;d jsonb;people jsonb;actual_slots jsonb;meta jsonb;timezone text;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
  or not club_selection_private.enabled(c) then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into f from club_selection_private.fixtures x where x.id=fid and x.club_id=c for update;
 select s.scorecard into card from public.match_review_scorecards s where s.id=sid and s.club_id=c;
 if f.id is null or f.published is not null or card->>'status' is distinct from 'completed'
  or card->>'provider' not in ('playhq_au','playcricket_au') then return false;end if;
 d:=f.details;
 select a.timezone into timezone from club_selection_private.access a where a.club_id=c;
 if coalesce((d->>'cancelled')::boolean,false) or coalesce((d->>'brackets')::boolean,false)
  or d->>'format' is distinct from card->>'format_key'
  or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(d->'days') day) is distinct from card->'dates'
  or exists(select 1 from jsonb_array_elements_text(card->'dates') day where day::date>(now() at time zone coalesce(timezone,'Australia/Sydney'))::date)
  or (f.scorecard_sync->>'match_id' is not null and f.scorecard_sync->>'match_id'<>card->>'match_id')
  or not exists(select 1 from club_selection_private.fixture_result_sources src where src.club_id=c and src.fixture_id=fid
   and src.source_match_id=(card->>'match_id')::uuid and src.team_id=tid and src.no_play is null)
  or exists(select 1 from public.match_review_scorecards newer join public.match_review_scorecards original on original.id=sid
   where newer.club_id=c and newer.source_match_id=original.source_match_id and (newer.created_at,newer.id)>(original.created_at,original.id))
 then return false;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text;
 if team->>'lineup_available' is distinct from 'true' or jsonb_array_length(team->'players') not between 1 and 30 then return false;end if;
 -- Use only confirmed, club-scoped identities. Never create or rename a person here.
 select jsonb_agg(jsonb_build_object('source_id',p->>'player_id','roster_id',r.id,'name',p->>'name','days',card->'dates')
  order by coalesce((select min(n) from jsonb_array_elements(f.slots) with ordinality old(slot,n)
   where slot->>'d1'=r.id::text or slot->>'d2'=r.id::text),1000),ord) into people
 from jsonb_array_elements(team->'players') with ordinality source(p,ord)
 left join club_selection_private.scorecard_roster_links l on l.club_id=c and l.source_player_id=(p->>'player_id')::uuid
 left join club_selection_private.roster r on r.club_id=c and r.id=l.roster_id and r.active;
 if exists(select 1 from jsonb_array_elements(people) p where p->>'roster_id' is null or p->>'source_id' is null)
  or (select count(distinct p->>'roster_id') from jsonb_array_elements(people) p)<>jsonb_array_length(people)
  or (select count(distinct p->>'source_id') from jsonb_array_elements(people) p)<>jsonb_array_length(people) then return false;end if;
 -- A conflict in another team needs the existing team review, not an automatic transfer.
 if exists(select 1 from club_selection_private.fixtures other
  cross join lateral jsonb_array_elements(jsonb_build_array(jsonb_build_object('details',other.details,'slots',other.slots))
    ||case when other.published is null then '[]'::jsonb else jsonb_build_array(other.published) end) state
  cross join lateral jsonb_array_elements(state->'slots') slot
  cross join lateral jsonb_array_elements(people) p
  where other.club_id=c and other.id<>fid and not coalesce((state#>>'{details,cancelled}')::boolean,false)
   and ((slot->>'d1'=p->>'roster_id' and card->'dates' ? (state#>>'{details,days,0,date}'))
    or (slot->>'d2'=p->>'roster_id' and card->'dates' ? (state#>>'{details,days,1,date}')))) then return false;end if;
 select jsonb_agg(jsonb_build_object('d1',people->i->'roster_id','d2',case when jsonb_array_length(card->'dates')>1 then people->i->'roster_id' else 'null'::jsonb end) order by i)
 into actual_slots from generate_series(0,greatest(10,jsonb_array_length(people)-1)) i;
 meta:=coalesce(f.scorecard_sync,'{}')||jsonb_build_object('match_id',card->>'match_id','team_id',tid,'snapshot_id',sid,
  'url',card->>'url','pending','[]'::jsonb,'players',people,'source','completed_scorecard');
 if f.slots=actual_slots and f.scorecard_sync is not distinct from meta then return false;end if;
 update club_selection_private.fixtures set slots=actual_slots,details=club_selection_private.scorecard_team_details(c,d,actual_slots),
  scorecard_sync=meta,revision=revision+1,updated_at=now(),updated_by=actor where id=fid and club_id=c;
 update club_batting_private.fixture_review_rosters m set
  player_ids=coalesce((select array_agg(distinct rp.player_id) from club_batting_private.roster_players rp
   where rp.club_id=c and exists(select 1 from jsonb_array_elements(people) p where p->>'roster_id'=rp.roster_id::text)),'{}'),
  captain_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(people) p where rp.club_id=c and rp.player_id=m.captain_player_id and p->>'roster_id'=rp.roster_id::text) then m.captain_player_id end,
  keeper_player_id=case when exists(select 1 from club_batting_private.roster_players rp,jsonb_array_elements(people) p where rp.club_id=c and rp.player_id=m.keeper_player_id and p->>'roster_id'=rp.roster_id::text) then m.keeper_player_id end,
  revision=revision+1,updated_at=now(),updated_by=actor where m.club_id=c and m.fixture_id=fid;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,actor,'completed_scorecard_team',
  jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'before_slots',f.slots,'slots',actual_slots));
 return true;
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.link_selected_scorecard_players(c uuid, sid uuid, fid uuid, tid uuid, actor uuid, apply_links boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
<<link_state>>
declare
 card jsonb; team jsonb; f club_selection_private.fixtures%rowtype; d jsonb; picks jsonb;
 person jsonb; rid uuid; pid uuid; source_id uuid; name_key text; candidates uuid[];
 linked jsonb:='[]'; changed integer:=0; added integer; club_timezone text;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
  or not club_selection_private.enabled(c) then return '[]'::jsonb;end if;
 if apply_links then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 select s.scorecard into card from public.match_review_scorecards s where s.id=sid and s.club_id=c;
 select * into f from club_selection_private.fixtures x where x.id=fid and x.club_id=c;
 if card is null or f.id is null or card->>'status'<>'completed' then return '[]'::jsonb;end if;
 if exists(select 1 from public.match_review_scorecards newer join public.match_review_scorecards original on original.id=sid
  where newer.club_id=c and newer.source_match_id=original.source_match_id and (newer.created_at,newer.id)>(original.created_at,original.id)) then return '[]'::jsonb;end if;
 d:=coalesce(f.published->'details',f.details);picks:=coalesce(f.published->'slots',f.slots);
 select a.timezone into club_timezone from club_selection_private.access a where a.club_id=c;
 if exists(select 1 from jsonb_array_elements_text(card->'dates') day where day::date>(now() at time zone coalesce(club_timezone,'Australia/Sydney'))::date)
  or coalesce((d->>'cancelled')::boolean,false) or d->>'format' is distinct from card->>'format_key'
  or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(d->'days') day) is distinct from card->'dates'
  or not exists(select 1 from club_selection_private.fixture_result_sources s where s.club_id=c and s.fixture_id=fid
   and s.source_match_id=(card->>'match_id')::uuid and s.team_id=tid and s.no_play is null)
 then return '[]'::jsonb;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text;
 if team is null or jsonb_typeof(team->'players') is distinct from 'array' then return '[]'::jsonb;end if;
 for person in select p from jsonb_array_elements(team->'players') p where p->>'player_id' is not null and nullif(btrim(p->>'name'),'') is not null loop
  source_id:=(person->>'player_id')::uuid;
  name_key:=club_selection_private.account_name_key(person->>'name');
  -- At least a complete given name and surname, unique on both lists.
  if name_key !~ '^[[:alpha:]][[:alpha:]''’-]+[[:space:]]+[[:alpha:]][[:alpha:]''’ -]+$'
   or (select count(*) from jsonb_array_elements(team->'players') p where club_selection_private.account_name_key(p->>'name')=name_key)<>1
   or (select count(*) from jsonb_array_elements(team->'players') p where p->>'player_id'=source_id::text)<>1 then continue;end if;
  select array_agg(r.id) into candidates from club_selection_private.roster r
   where r.club_id=c and r.active and club_selection_private.account_name_key(r.name)=name_key;
  if cardinality(candidates) is distinct from 1 then continue;end if;
  rid:=candidates[1];
  if not exists(select 1 from jsonb_array_elements(picks) slot where slot->>'d1'=rid::text or slot->>'d2'=rid::text) then continue;end if;
  -- A future or duplicate identity must never claim an existing source mapping.
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and
   ((s.source_player_id=source_id and s.roster_id<>rid) or (card->>'provider' is distinct from 'playhq_au' and s.roster_id=rid and s.source_player_id<>source_id))) then continue;end if;
  select case when count(*)=1 then min(rp.player_id::text)::uuid end into pid
   from club_batting_private.roster_players rp where rp.club_id=c and rp.roster_id=rid;
  if exists(select 1 from public.match_review_player_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (card->>'provider' is distinct from 'playhq_au' and l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid is not null and exists(select 1 from club_batting_private.roster_players rp where rp.club_id=c and rp.player_id=pid and rp.roster_id<>rid) then continue;end if;
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and s.source_player_id=source_id and s.roster_id=rid)
   and (card->>'provider'='playhq_au' or pid is null or exists(select 1 from public.match_review_player_links l where l.club_id=c and l.source_player_id=source_id and l.player_id=pid)) then continue;end if;
  linked:=linked||jsonb_build_array(jsonb_build_object('source_id',source_id,'roster_id',rid,'player_id',pid,'name',person->>'name'));
  if not apply_links then continue;end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by)
   values(c,source_id,rid,actor) on conflict(club_id,source_player_id) do nothing;
  get diagnostics added=row_count;changed:=changed+added;
  if pid is not null and card->>'provider' is distinct from 'playhq_au' and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,d)) then
   insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by)
    values(c,source_id,pid,actor) on conflict(club_id,source_player_id) do nothing;
   get diagnostics added=row_count;changed:=changed+added;
  end if;
 end loop;
 if apply_links and changed>0 then
  insert into club_selection_private.audit(club_id,actor_id,action,detail)
   values(c,actor,'scorecard_selected_identities',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'method',case when f.published is null then 'unique_full_name_in_selected_team' else 'unique_full_name_in_published_team' end,'players',linked));
 end if;
 if apply_links then perform club_selection_private.recover_completed_scorecard_team(c,sid,fid,tid,actor);end if;
 return linked;
end $function$
;
CREATE OR REPLACE FUNCTION club_batting_private.completed_review_snapshot(c uuid, fixture uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare f club_selection_private.fixtures%rowtype;card jsonb;team jsonb;sid uuid;people jsonb;selected_ids uuid[];source_ids uuid[];tz text;
begin
 select * into f from club_selection_private.fixtures where club_id=c and id=fixture;
 if f.id is null or f.published is not null or f.scorecard_sync->>'source' is distinct from 'completed_scorecard'
  or not club_selection_private.enabled(c)
  or not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.details))
  or coalesce((f.details->>'cancelled')::boolean,false) or coalesce((f.details->>'brackets')::boolean,false) then return null;end if;
 select s.id,s.scorecard into sid,card from club_selection_private.fixture_result_sources src
 join public.match_review_scorecards s on s.club_id=src.club_id and s.source_match_id=src.source_match_id
 where src.club_id=c and src.fixture_id=fixture and src.no_play is null
  and src.source_match_id::text=f.scorecard_sync->>'match_id' and src.team_id::text=f.scorecard_sync->>'team_id'
 order by s.created_at desc,s.id desc limit 1;
 select timezone into tz from club_selection_private.access where club_id=c;
 if sid is null or sid::text is distinct from f.scorecard_sync->>'snapshot_id'
  or card->>'status' is distinct from 'completed' or coalesce(card->>'provider','') not in ('playhq_au','playcricket_au')
  or card->>'match_id' is distinct from f.scorecard_sync->>'match_id'
  or card->>'format_key' is distinct from f.details->>'format'
  or (select jsonb_agg(d->>'date' order by d->>'date') from jsonb_array_elements(f.details->'days') d) is distinct from card->'dates'
  or exists(select 1 from jsonb_array_elements_text(card->'dates') d where d::date>(now() at time zone coalesce(tz,'Australia/Sydney'))::date) then return null;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=f.scorecard_sync->>'team_id';
 if team is null or team->>'lineup_available' is distinct from 'true' or jsonb_array_length(team->'players') not between 1 and 30 then return null;end if;
 select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'source_id',p->>'player_id') order by ord) into people
 from jsonb_array_elements(team->'players') with ordinality x(p,ord)
 left join club_selection_private.scorecard_roster_links l on l.club_id=c and l.source_player_id=(p->>'player_id')::uuid
 left join club_selection_private.roster r on r.club_id=c and r.id=l.roster_id and r.active;
 if exists(select 1 from jsonb_array_elements(people) p where p->>'id' is null or p->>'source_id' is null)
  or (select count(distinct p->>'id') from jsonb_array_elements(people) p)<>jsonb_array_length(people)
  or (select count(distinct p->>'source_id') from jsonb_array_elements(people) p)<>jsonb_array_length(people) then return null;end if;
 select array_agg((p->>'id')::uuid order by p->>'id') into source_ids from jsonb_array_elements(people) p;
 select array_agg((s->>'d1')::uuid order by s->>'d1') into selected_ids from jsonb_array_elements(f.slots) s where s->>'d1' is not null;
 if selected_ids is distinct from source_ids then return null;end if;
 if jsonb_array_length(card->'dates')>1 then
  select array_agg((s->>'d2')::uuid order by s->>'d2') into selected_ids from jsonb_array_elements(f.slots) s where s->>'d2' is not null;
  if selected_ids is distinct from source_ids then return null;end if;
 end if;
 return jsonb_build_object('details',f.details,'slots',f.slots,'players',people,'snapshot_id',sid,'source','completed_scorecard');
end $function$
;
CREATE OR REPLACE FUNCTION public.playhq_onboarding(p_club_id uuid, p_action text DEFAULT 'context'::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.uid();r club_selection_private.playhq_access_requests%rowtype;
 conn club_selection_private.playhq_connections%rowtype;details jsonb;rid uuid;receipt club_selection_private.requests%rowtype;
begin
 if me is null or not club_selection_private.member(p_club_id,me) or not public.is_club_admin(p_club_id) then
  raise exception using errcode='42501',message='Club Admin manages the PlayCricket connection';
 end if;
 if not exists(select 1 from club_selection_private.access where club_id=p_club_id) then raise exception 'Club Selections access is required';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>5000 then raise exception 'Invalid access request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_club_id::text,9200));
 select * into r from club_selection_private.playhq_access_requests where club_id=p_club_id;
 select * into conn from club_selection_private.playhq_connections where club_id=p_club_id;
 if p_action='context' then
  return jsonb_build_object('club_name',(select name from public.clubs where id=p_club_id),
   'revision',coalesce(r.revision,0),'requested_at',r.requested_at,
   'request',jsonb_build_object('association',coalesce(r.association,''),'club_url',coalesce(r.club_url,''),
    'contact_name',coalesce(r.contact_name,(select display_name from public.user_profiles where user_id=me),''),
    'contact_email',coalesce(r.contact_email,(select email from auth.users where id=me),''),'contact_role',coalesce(r.contact_role,'')),
   'configured',conn.club_id is not null,'verified',conn.verified_at is not null,
   'connection_version',conn.generation,'organisation_id',conn.organisation_id,'association_id',conn.association_id,
   'polling_enabled',coalesce(conn.polling_enabled,false),'error',conn.last_error,
   'state',case when conn.verified_at is not null then 'connected' when conn.club_id is not null then 'needs_check' when r.requested_at is not null then 'awaiting_key' else 'not_requested' end);
 elsif p_action='configure' then
  rid:=nullif(p_data->>'request_id','')::uuid;if rid is null then raise exception 'Connection request ID required';end if;
  details:=jsonb_build_object('organisation_id',p_data->>'organisation_id','association_id',p_data->>'association_id','authorised',p_data->'authorised');
  select * into receipt from club_selection_private.requests where club_id=p_club_id and user_id=me and request_id=rid;
  if found then
   if receipt.action<>'playhq_connect' or receipt.payload<>details then raise exception 'Connection request ID already used';end if;
   if receipt.result->>'connection_version' is distinct from conn.generation::text then raise exception 'Another connection was saved. Reload before continuing';end if;
   return public.playhq_onboarding(p_club_id);
  end if;
  if p_data->>'connection_version' is distinct from conn.generation::text then raise exception 'The connection changed. Reload before replacing its credentials';end if;
  if p_data->'authorised' is distinct from 'true'::jsonb then raise exception 'Confirm these credentials were issued for your club';end if;
  perform public.playhq_sync_api(p_club_id,'configure',jsonb_build_object(
   'organisation_id',p_data->>'organisation_id','association_id',p_data->>'association_id','api_key',p_data->>'api_key'));
  select * into conn from club_selection_private.playhq_connections where club_id=p_club_id;
  insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result,created_at)
   values(p_club_id,me,rid,'playhq_connect',details,jsonb_build_object('connection_version',conn.generation),now());
 elsif p_action in ('save_request','mark_requested','clear_requested') then
  -- Repeating the confirmation after an uncertain response does not change its date.
  if p_action='mark_requested' and r.requested_at is not null then return public.playhq_onboarding(p_club_id);end if;
  if coalesce((p_data->>'revision')::integer,-1)<>coalesce(r.revision,0) then raise exception 'The request changed. Reload before saving';end if;
  if p_action='save_request' then
   if r.requested_at is not null then raise exception 'Clear the sent status before changing this request';end if;
   details:=p_data->'request';
   if jsonb_typeof(details) is distinct from 'object' then raise exception 'Enter the club contact details';end if;
   if exists(select 1 from jsonb_object_keys(details) k where k not in ('association','club_url','contact_name','contact_email','contact_role')) then raise exception 'Unexpected request field';end if;
   if length(btrim(coalesce(details->>'association',''))) not between 1 and 160
    or length(btrim(coalesce(details->>'contact_name',''))) not between 1 and 100
    or length(btrim(coalesce(details->>'contact_role',''))) not between 1 and 100
    or length(btrim(coalesce(details->>'contact_email',''))) not between 3 and 254
    or btrim(details->>'contact_email')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter your association, name, role and email';end if;
   if length(coalesce(details->>'club_url',''))>500 or (coalesce(details->>'club_url','')<>'' and (details->>'club_url')!~'^https://(www\.)?(playhq\.com|play\.cricket\.com\.au)/[^[:space:]]*$') then raise exception 'Use the club’s public PlayHQ or PlayCricket link';end if;
   insert into club_selection_private.playhq_access_requests(club_id,association,club_url,contact_name,contact_email,contact_role,updated_by)
    values(p_club_id,btrim(details->>'association'),coalesce(details->>'club_url',''),btrim(details->>'contact_name'),btrim(details->>'contact_email'),btrim(details->>'contact_role'),me)
    on conflict(club_id) do update set association=excluded.association,club_url=excluded.club_url,contact_name=excluded.contact_name,
     contact_email=excluded.contact_email,contact_role=excluded.contact_role,revision=playhq_access_requests.revision+1,updated_at=now(),updated_by=me;
  elsif p_action='mark_requested' then
   if r.club_id is null then raise exception 'Prepare the request first';end if;
   if p_data->'authorised' is distinct from 'true'::jsonb then raise exception 'Confirm you sent this request on behalf of the club';end if;
   update club_selection_private.playhq_access_requests set requested_at=now(),requested_by=me,revision=revision+1,updated_at=now(),updated_by=me where club_id=p_club_id;
  else
   update club_selection_private.playhq_access_requests set requested_at=null,requested_by=null,revision=revision+1,updated_at=now(),updated_by=me where club_id=p_club_id;
  end if;
 else raise exception 'Unknown access request action';end if;
 return public.playhq_onboarding(p_club_id);
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.playhq_fixture_review(c uuid, action text, data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare f club_selection_private.fixtures%rowtype;l club_selection_private.playhq_links%rowtype;
 d jsonb;token text;blocks jsonb:='[]';warnings jsonb:='[]';result jsonb;tz text;
begin
 -- Reuse current membership and selector/admin authorisation, without key access.
 perform public.playhq_sync_api(c,'status');
 if jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>2000 then raise exception 'Invalid fixture review request';end if;
 if action='list' then
  return jsonb_build_object('changes',coalesce((select jsonb_agg(jsonb_build_object('fixture_id',l.fixture_id,'grade',f.details->>'grade','opposition',f.details->>'opposition','days',f.details->'days','result_error',l.result_error,'pending',l.pending_fixture is not null) order by f.details->'days'->0->>'date') from club_selection_private.playhq_links l join club_selection_private.fixtures f on f.id=l.fixture_id and f.club_id=c where l.club_id=c and (public.is_club_admin(c) or club_selection_private.fixture_view(c,f.details,auth.uid())) and (l.pending_fixture is not null or l.result_error is not null)),'[]'));
 end if;
 if action not in ('preview','apply') then raise exception 'Unknown fixture review action';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into f from club_selection_private.fixtures where club_id=c and id=(data->>'fixture_id')::uuid for update;
 select * into l from club_selection_private.playhq_links where club_id=c and fixture_id=f.id for update;
 if l.fixture_id is null then raise exception 'Choose a linked club fixture';end if;
 if not (public.is_club_admin(c) or club_selection_private.fixture_view(c,f.details,auth.uid())) then raise exception 'View access to this Selection Group is required';end if;
 if action='apply' and club_selection_private.scoped_selections(c) and not club_selection_private.selection_edit(c,f.details,auth.uid()) then raise exception 'Edit access to this Selection Group is required';end if;
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
 update club_selection_private.playhq_jobs set due_at=club_selection_private.playhq_results_due(l.fixture_id) where club_id=c and kind='results' and source_id=l.match_id and team_id=l.team_id;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,auth.uid(),'playhq_fixture_change',jsonb_build_object('fixture_id',f.id,'before',f.details,'after',d));
 return result||jsonb_build_object('requires_republish',f.published is not null);
end $function$
;
CREATE OR REPLACE FUNCTION public.club_selection_groups(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid:=p_club_id;me uuid:=auth.uid();ctx jsonb;row jsonb;src jsonb;gid uuid;sg uuid;nm text;old_name text;rid uuid;receipt club_selection_private.requests%rowtype;cat club_selection_private.playhq_team_catalogues%rowtype;
begin
 if me is null or not club_selection_private.member(c,me) then raise exception 'Club membership required';end if;
 if not(public.is_club_admin(c) or club_selection_private.selection_viewer(c,me) or club_selection_private.captain(c,me)) then raise exception 'Club setup or Selection Board access required';end if;
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
 if jsonb_typeof(p_data->'groups') is distinct from 'array' or jsonb_array_length(p_data->'groups') not between 1 and 100 or jsonb_typeof(p_data->'grades') is distinct from 'array' or jsonb_array_length(p_data->'grades') not between 0 and 500 then raise exception 'Create a Selection Group and assign your grades';end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.club_selection_group_manage(p_club_id uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare c uuid:=p_club_id;me uuid:=auth.uid();rid uuid;rr club_selection_private.requests%rowtype;ctx jsonb;payload jsonb;result jsonb;preview jsonb;row jsonb;old_map club_selection_private.playhq_grade_mappings%rowtype;cat club_selection_private.playhq_team_catalogues%rowtype;
 sg uuid:=nullif(p_data->>'selection_group_id','')::uuid;gid uuid:=nullif(p_data->>'grade_id','')::uuid;season uuid:=nullif(p_data->>'season_id','')::uuid;nm text:=btrim(p_data->>'name');team uuid;removed int:=0;restored int:=0;kept int:=0;l record;
begin
 if me is null or not club_selection_private.member(c,me) or not public.is_club_admin(c) then raise exception 'Club Admin manages Selection Groups';end if;
 if not club_selection_private.enabled(c) then raise exception 'Club Selections access required';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000 then raise exception 'Invalid group change';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 ctx:=club_selection_private.selection_groups_context(c);
 if p_action='disconnect_preview' then
  if not exists(select 1 from club_selection_private.playhq_grade_mappings where club_id=c and season_id=season and grade_id=gid) then raise exception 'No imported team is linked to this grade';end if;
  return club_selection_private.playhq_disconnect_preview(c,season,gid);
 end if;
 rid:=nullif(p_data->>'request_id','')::uuid;if rid is null then raise exception 'Request ID required';end if;
 select * into rr from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then if rr.action<>'selection_group_manage:'||p_action or rr.payload<>p_data then raise exception 'Request ID already used';end if;return rr.result;end if;
 if ctx->'revision' is distinct from p_data->'revision' then raise exception 'Selection Groups changed. Reload before saving';end if;
 if p_action in ('add_group','rename_group') then
  if nm is null or length(nm) not between 1 and 100 then raise exception 'Enter a group name of up to 100 characters';end if;
  if exists(select 1 from club_selection_private.selection_groups where club_id=c and lower(btrim(name))=lower(nm) and id is distinct from sg) then raise exception 'That group name already exists';end if;
  if p_action='add_group' then
   sg:=coalesce(sg,gen_random_uuid());insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,nm);
  else
   update club_selection_private.selection_groups set name=nm where club_id=c and id=sg;if not found then raise exception 'Selection Group unavailable';end if;
  end if;
 elsif p_action='set_batting' then
  if not coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) then raise exception 'This club does not use Club Batting';end if;
  if jsonb_typeof(p_data->'batting_enabled') is distinct from 'boolean' then raise exception 'Choose whether this group uses Club Batting';end if;
  update club_selection_private.selection_groups set batting_enabled=(p_data->>'batting_enabled')::boolean where club_id=c and id=sg;
  if not found then raise exception 'Selection Group unavailable';end if;
 elsif p_action='move_team' then
  if not exists(select 1 from club_selection_private.selection_groups where club_id=c and id=sg) then raise exception 'Choose a Selection Group';end if;
  if not exists(select 1 from public.playing_groups where club_id=c and id=gid and active) then raise exception 'Club grade unavailable';end if;
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,gid,sg) on conflict(grade_id) do update set selection_group_id=excluded.selection_group_id where club_selection_private.selection_group_grades.club_id=c;
 elsif p_action='add_team' then
  select t.* into cat from club_selection_private.playhq_team_catalogues t join club_selection_private.playhq_connections cn on cn.club_id=t.club_id and cn.generation=t.generation
   where t.id=(p_data->>'catalogue_id')::uuid and t.club_id=c and t.season_id=season;
  if not found then raise exception 'Season download changed. Reload before adding the team';end if;
  team:=(p_data->>'team_id')::uuid;
  if not exists(select 1 from jsonb_array_elements(cat.teams) t where t->>'id'=team::text) then raise exception 'Choose a team from this club season';end if;
  if exists(select 1 from club_selection_private.playhq_grade_mappings where club_id=c and season_id=season and (team_id=team or grade_id=gid)) then raise exception 'Team already linked. Disconnect its current imported team before changing the source';end if;
  if not exists(select 1 from club_selection_private.selection_groups where club_id=c and id=sg) then raise exception 'Choose a Selection Group';end if;
  gid:=coalesce(gid,gen_random_uuid());
  payload:=jsonb_build_object('request_id',md5(rid::text||':setup')::uuid,'revision',ctx->'revision','expected_grades',ctx->'expected_grades','catalogue_id',cat.id,'groups',ctx->'selection_groups',
   'grades',(select jsonb_agg(x) from (select value as x from jsonb_array_elements(ctx->'grades') where value->>'id'<>gid::text union all select jsonb_build_object('id',gid,'name',nm,'selection_group_id',sg,'team_id',team)) rows));
  result:=public.club_selection_groups(c,'save',payload);
 elsif p_action='disconnect' then
  select * into old_map from club_selection_private.playhq_grade_mappings where club_id=c and season_id=season and grade_id=gid for update;
  if old_map.team_id is null then raise exception 'No imported team is linked to this grade';end if;
  preview:=club_selection_private.playhq_disconnect_preview(c,season,gid);
  if preview->>'token' is distinct from p_data->>'token' then raise exception 'Fixtures changed. Review the disconnect again';end if;
  for l in select p.*,f.details,f.revision,f.published,f.scorecard_sync,a.timezone from club_selection_private.playhq_links p join club_selection_private.fixtures f on f.id=p.fixture_id join club_selection_private.access a on a.club_id=f.club_id
   where p.club_id=c and p.season_id=season and p.team_id=old_map.team_id order by p.fixture_id for update of p,f loop
   delete from club_selection_private.playhq_jobs where club_id=c and kind='results' and source_id=l.match_id and team_id=l.team_id;
   if club_selection_private.playhq_import_removable(l.fixture_id) then
    delete from club_selection_private.fixtures where id=l.fixture_id;removed:=removed+1;
   else
    if not l.import_created and not l.import_touched and l.original_details is not null and l.last_applied_revision=l.revision and l.published is null and l.scorecard_sync is null
      and not club_selection_private.fixture_completed(l.details,l.timezone) and not exists(select 1 from club_selection_private.fixture_result_sources where fixture_id=l.fixture_id) and l.details is distinct from l.original_details then
     perform club_selection_private.validate_details(l.original_details);
     update club_selection_private.fixtures set details=l.original_details,revision=revision+1,updated_by=me,updated_at=now() where id=l.fixture_id;restored:=restored+1;
    end if;
    delete from club_selection_private.playhq_links where fixture_id=l.fixture_id;kept:=kept+1;
   end if;
  end loop;
  delete from club_selection_private.playhq_jobs where club_id=c and kind='fixtures' and team_id=old_map.team_id and source_id=old_map.source_grade_id;
  delete from club_selection_private.playhq_grade_mappings where club_id=c and season_id=season and grade_id=gid;
 else raise exception 'Unknown group change';end if;
 if p_action<>'add_team' then
  insert into club_selection_private.team_settings(club_id,timezone,revision,updated_by) values(c,club_selection_private.captain_timezone(c),1,me)
   on conflict(club_id) do update set revision=club_selection_private.team_settings.revision+1,updated_by=me,updated_at=now();
  result:=club_selection_private.selection_groups_context(c)||jsonb_build_object('can_edit',true,'saved',true);
 end if;
 result:=result||jsonb_build_object('removed',removed,'retained',kept,'restored',restored,'changed_grade_id',gid);
 insert into club_selection_private.requests values(c,me,rid,'selection_group_manage:'||p_action,p_data,result,now());
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'selection_group_manage:'||p_action,p_data-'token');
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION club_selection_private.playhq_fixture_details(src jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('opposition',coalesce(nullif(src->>'opposition',''),'Opponent to be confirmed'),'format',src->>'format',
  'ground',coalesce(src#>>'{days,0,ground}',''),'cancelled',coalesce((src->>'cancelled')::boolean,false),
  'days',coalesce((select jsonb_agg(jsonb_build_object('date',x->>'date','start',coalesce(x->>'time',''),'ground',coalesce(x->>'ground','')) order by ord)
   from jsonb_array_elements(src->'days') with ordinality a(x,ord)),'[]'))
$function$
;
CREATE OR REPLACE FUNCTION club_selection_private.validate_details(d jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare day jsonb;seen text[]:='{}';v text;
begin
 if jsonb_typeof(d)<>'object' or length(btrim(coalesce(d->>'grade','')))=0 or length(btrim(coalesce(d->>'opposition','')))=0 then raise exception 'Enter a grade and opposition';end if;
 if length(d::text)>5000 or jsonb_typeof(d->'days') is distinct from 'array' or jsonb_array_length(d->'days') not between 1 and 2 then raise exception 'Choose one or two actual fixture dates';end if;
 for day in select * from jsonb_array_elements(d->'days') loop
 v:=day->>'date';
 if coalesce(v,'') !~ '^\d{4}-\d{2}-\d{2}$' or v::date::text<>v or v=any(seen) then raise exception 'Fixture dates must be valid and distinct';end if;
 if array_length(seen,1)>0 and v<=seen[1] then raise exception 'Day 2 must follow Day 1';end if;
 seen:=array_append(seen,v);
 if coalesce(day->>'start','')<>'' and (day->>'start') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Enter a valid start time';end if;
 -- Older clients may retain an explicit end; new fixtures need only a start.
 if coalesce(day->>'end','')<>'' and (coalesce(day->>'start','')='' or (day->>'end') !~ '^([01]\d|2[0-3]):[0-5]\d$' or (day->>'start')>=(day->>'end')) then raise exception 'Finish must follow the start on the same date';end if;
 end loop;
 if d->>'format' is not null and d->>'format' not in ('t20','limited_overs','long_form') then raise exception 'Choose T20, Limited overs or Long-form';end if;
 if d->>'overs' is not null and (d->>'overs' !~ '^[0-9]{1,3}$' or (d->>'overs')::int not between 1 and 999) then raise exception 'Overs must be a whole number between 1 and 999';end if;
 if coalesce((d->>'min_quicks')::int,3) not between 0 and 11 or coalesce((d->>'min_batters')::int,5) not between 0 and 11 then raise exception 'Balance targets must be between 0 and 11';end if;
 if jsonb_typeof(coalesce(d->'staff','[]'))<>'array' then raise exception 'Choose staff from club members';end if;
end$function$

;
CREATE OR REPLACE FUNCTION club_batting_private.guard_match_roster_fixture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform pg_advisory_xact_lock(hashtextextended(old.club_id::text,9200));
 if (old.club_id<>new.club_id or club_selection_private.fixture_identity(old.club_id,old.details) is distinct from club_selection_private.fixture_identity(new.club_id,new.details))
 and exists(select 1 from club_batting_private.fixture_review_rosters where fixture_id=old.id)
 and not(old.club_id=new.club_id and club_batting_private.fixture_correction_authorised(old.club_id,old.id)) then
  raise exception 'This fixture has a saved match player list. A Club Admin must use Correct match details.';
 end if;
 return new;
end $function$

;
CREATE OR REPLACE FUNCTION club_selection_private.guard_shared_fixture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare identity jsonb;changed boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.club_id::text,9200));
 identity:=club_selection_private.fixture_identity(new.club_id,new.details);changed:=tg_op='INSERT';
 if tg_op='UPDATE' then
  changed:=club_selection_private.fixture_identity(old.club_id,old.details) is distinct from identity;
  if (changed or old.club_id<>new.club_id) and (exists(select 1 from public.team_review_sessions where club_id=old.club_id and fixture_id=old.id)
   or exists(select 1 from club_batting_private.fixture_innings where club_id=old.club_id and fixture_id=old.id)
   or exists(select 1 from club_batting_private.fixture_preparations where club_id=old.club_id and fixture_id=old.id))
   and not(old.club_id=new.club_id and club_batting_private.fixture_correction_authorised(old.club_id,old.id)) then
   raise exception 'This fixture has linked match records. A Club Admin must use Correct match details to preview and apply a correction.';
  end if;
 end if;
 if changed and exists(select 1 from club_selection_private.fixtures f where f.club_id=new.club_id and f.id<>new.id
  and club_selection_private.fixture_identity(f.club_id,f.details)=identity
  and (identity->>'group_id' is not null or lower(btrim(f.details->>'grade'))=lower(btrim(new.details->>'grade')))) then
  raise exception 'This fixture already exists. Open the existing fixture to keep the shared match details.';
 end if;
 return new;
end $function$
;
create trigger shared_identity before insert or update on club_selection_private.fixtures for each row execute function club_selection_private.guard_shared_fixture();
create trigger roster_identity before update on club_selection_private.fixtures for each row execute function club_batting_private.guard_match_roster_fixture();

create table public.players(id uuid,club_id uuid,user_id uuid,active boolean);
create table public.player_playing_groups(club_id uuid,player_id uuid,playing_group_id uuid);
create table club_batting_private.roster_players(club_id uuid,roster_id uuid,player_id uuid);
create function club_batting_private.group_uses_batting(c uuid,g uuid) returns boolean language sql as $$select exists(select 1 from public.playing_groups where id=g and club_id=c and batting_enabled and active)$$;
create table club_batting_private.selection_plan_dates(club_id uuid,player_id uuid,active boolean,season_key text);
create function club_batting_private.selection_plan_season(c uuid) returns text language sql as $$select 'test'::text$$;
CREATE OR REPLACE FUNCTION club_batting_private.player_uses_batting(c uuid, pid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.players p where p.club_id=c and p.id=pid and p.active and (
  not exists(select 1 from club_selection_private.access a where a.club_id=c)
  or exists(select 1 from club_batting_private.selection_plan_dates pd where pd.club_id=c and pd.player_id=pid and pd.active and pd.season_key=club_batting_private.selection_plan_season(c)) or exists(select 1 from public.player_playing_groups x join public.playing_groups g on g.id=x.playing_group_id and g.club_id=c and g.active and g.batting_enabled where x.club_id=c and x.player_id=p.id)
  or exists(select 1 from club_selection_private.roster r left join club_batting_private.roster_players rp on rp.club_id=c and rp.roster_id=r.id
   join (select fx.details,coalesce(fx.published,club_batting_private.completed_review_snapshot(c,fx.id)) published from club_selection_private.fixtures fx where fx.club_id=c) f on f.published is not null
   where r.club_id=c and r.active and (rp.player_id=p.id or (rp.player_id is null and r.user_id=p.user_id))
   and not coalesce((f.details->>'cancelled')::boolean,false) and not coalesce((f.published->'details'->>'cancelled')::boolean,false)
   and club_selection_private.fixture_identity(c,f.details)=club_selection_private.fixture_identity(c,f.published->'details')
   and club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,f.published->'details'))
   and exists(select 1 from jsonb_array_elements(f.published->'slots') s where s->>'d1'=r.id::text or s->>'d2'=r.id::text))
 ))
$function$
;
CREATE OR REPLACE FUNCTION public.create_playing_group(p_club_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
  next_order integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_club_admin(p_club_id) then raise exception 'Club Admin access required'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Enter a Playing Group name'; end if;

  select id into new_id
  from public.playing_groups
  where club_id=p_club_id
    and lower(trim(name))=lower(trim(p_name))
  limit 1;

  if new_id is not null then
    update public.playing_groups
    set active=true,updated_at=now()
    where id=new_id;
    return new_id;
  end if;

  select coalesce(max(sort_order),0)+10
  into next_order
  from public.playing_groups
  where club_id=p_club_id;

  insert into public.playing_groups(
    club_id,name,sort_order,active,created_by,batting_enabled
  )
  values(
    p_club_id,trim(p_name),next_order,true,auth.uid(),not exists(select 1 from club_selection_private.access where club_id=p_club_id)
  )
  returning id into new_id;

  return new_id;
end;
$function$
;

create function club_selection_private.selection_viewer(c uuid,u uuid) returns boolean language sql as $$select true$$;
create function club_selection_private.fixture_view(c uuid,d jsonb,u uuid) returns boolean language sql as $$select true$$;
create function club_selection_private.scoped_selections(c uuid) returns boolean language sql as $$select true$$;
create function club_selection_private.selection_edit(c uuid,d jsonb,u uuid) returns boolean language sql as $$select true$$;
create function club_selection_private.assert_selection_open(d jsonb,tz text,t timestamptz) returns void language sql as $$select$$;
create function club_selection_private.playhq_results_due(f uuid,t timestamptz) returns timestamptz language sql as $$select now()$$;
create table club_selection_private.selection_groups(id uuid primary key,club_id uuid,name text,batting_enabled boolean default false);
create table club_selection_private.team_settings(club_id uuid primary key,timezone text,revision integer,updated_by uuid,updated_at timestamptz);
create function club_selection_private.captain_timezone(c uuid) returns text language sql as $$select 'Australia/Sydney'$$;
create function club_selection_private.selection_groups_context(c uuid) returns jsonb language sql as $$select jsonb_build_object('revision',coalesce((select revision from club_selection_private.team_settings where club_id=c),0))$$;
alter table public.playing_groups alter column id set default gen_random_uuid();
