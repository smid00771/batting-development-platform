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
