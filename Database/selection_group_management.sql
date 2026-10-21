-- Small saved-setup changes, reviewed source disconnects, and import provenance.
alter table club_selection_private.playhq_links add column import_created boolean not null default false,
 add column original_details jsonb, add column last_applied_revision integer,
 add column import_touched boolean not null default false;

create or replace function club_selection_private.playhq_import_all(c uuid,s uuid,source_grade uuid,team uuid,fixtures_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
  result_due:=greatest(now(),coalesce(nullif(src#>>'{days,0,start_at}','')::timestamptz,(src#>>'{days,0,date}')::date::timestamp at time zone coalesce(tz,'Australia/Sydney'))+interval '8 hours');
  insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at) values(c,'results',mid,team,result_due)
   on conflict(club_id,kind,source_id,team_id) do nothing;
 end loop;
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,conn.updated_by,'playhq_season_fixtures',jsonb_build_object('grade_id',g.id,'team_id',team,'created',created,'linked',linked,'updated',updated,'attention',attention,'deferred',jsonb_array_length(deferred)));
 return jsonb_build_object('saved',true,'created',created,'linked',linked,'updated',updated,'unchanged',unchanged,'attention',attention,'deferred',deferred);
end $$;
revoke all on function club_selection_private.playhq_import_all(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function club_selection_private.playhq_import_removable(fid uuid) returns boolean
language sql stable set search_path='' as $$
 select coalesce((select l.import_created and not l.import_touched and f.revision=l.last_applied_revision and f.published is null and f.review is null and f.scorecard_sync is null
  and not club_selection_private.fixture_completed(f.details,a.timezone)
  and not exists(select 1 from jsonb_array_elements(f.slots) s where nullif(s->>'d1','') is not null or nullif(s->>'d2','') is not null)
  and not exists(select 1 from club_selection_private.publications where fixture_id=fid)
  and not exists(select 1 from club_selection_private.posts where fixture_id=fid)
  and not exists(select 1 from club_selection_private.notifications where fixture_id=fid)
  and not exists(select 1 from club_selection_private.review_posts where fixture_id=fid)
  and not exists(select 1 from club_selection_private.group_links where source_fixture=fid)
  and not exists(select 1 from club_batting_private.fixture_preparations where fixture_id=fid)
  and not exists(select 1 from club_batting_private.fixture_corrections where fixture_id=fid)
  and not exists(select 1 from public.team_review_sessions where fixture_id=fid)
  and not exists(select 1 from club_batting_private.fixture_innings where fixture_id=fid)
  and not exists(select 1 from club_batting_private.fixture_review_rosters where fixture_id=fid)
  and not exists(select 1 from club_selection_private.social_exports where fixture_id=fid)
  and not exists(select 1 from club_selection_private.social_features where fixture_id=fid)
  and not exists(select 1 from club_selection_private.player_conversations where fixture_id=fid)
  and not exists(select 1 from club_selection_private.fixture_result_sources where fixture_id=fid)
  and not exists(select 1 from club_selection_private.team_acknowledgements where fixture_id=fid)
  and not exists(select 1 from club_selection_private.calendar_events where fixture_id=fid)
  from club_selection_private.fixtures f join club_selection_private.playhq_links l on l.fixture_id=f.id join club_selection_private.access a on a.club_id=f.club_id where f.id=fid),false)
$$;
revoke all on function club_selection_private.playhq_import_removable(uuid) from public,anon,authenticated,service_role;

create function club_selection_private.playhq_disconnect_preview(c uuid,s uuid,g uuid) returns jsonb
language sql stable set search_path='' as $$
 with linked as materialized (
 select l.fixture_id,l.match_id,l.team_id,f.revision,club_selection_private.playhq_import_removable(f.id) removable
 from club_selection_private.playhq_grade_mappings m join club_selection_private.playhq_links l on l.club_id=m.club_id and l.season_id=m.season_id and l.team_id=m.team_id
 join club_selection_private.fixtures f on f.id=l.fixture_id where m.club_id=c and m.season_id=s and m.grade_id=g
 ), mapping as (select * from club_selection_private.playhq_grade_mappings where club_id=c and season_id=s and grade_id=g)
 select jsonb_build_object('remove_count',(select count(*) from linked where removable),'keep_count',(select count(*) from linked where not removable),
 'team_id',(select team_id from mapping),'grade_id',g,'season_id',s,
 'token',encode(extensions.digest(jsonb_build_object('mapping',(select to_jsonb(m) from mapping m),'fixtures',(select jsonb_agg(to_jsonb(l) order by fixture_id) from linked l))::text,'sha256'),'hex'))
$$;
revoke all on function club_selection_private.playhq_disconnect_preview(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.club_selection_group_manage(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function public.club_selection_group_manage(uuid,text,jsonb) from public,anon;
grant execute on function public.club_selection_group_manage(uuid,text,jsonb) to authenticated;
