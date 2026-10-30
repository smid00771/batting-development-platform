-- Shared fixtures are available with either product. This never grants Select access.
begin;
create or replace function club_selection_private.fixtures_enabled(c uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select club_selection_private.enabled(c)
 or coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false)
$$;
revoke all on function club_selection_private.fixtures_enabled(uuid) from public,anon,authenticated;

create or replace function club_batting_private.ensure_fixture_access(c uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not club_selection_private.member(c,auth.uid()) or not public.is_club_admin(c)
  or not club_selection_private.fixtures_enabled(c) then raise exception 'Current Club Admin fixture access required';end if;
 -- Storage/timezone only: a disabled row cannot activate selections, subscriptions or trials.
 insert into club_selection_private.access(club_id,mode,status,updated_by,timezone,fixture_defaults)
 values(c,'bundle','disabled',auth.uid(),club_selection_private.captain_timezone(c),jsonb_build_object('revision',0,'rows','[]'::jsonb,'batting_fixtures_only',true)) on conflict(club_id) do nothing;
end$$;
revoke all on function club_batting_private.ensure_fixture_access(uuid) from public,anon,authenticated;

create or replace function club_batting_private.fixture_storage_only(c uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from club_selection_private.access where club_id=c and status='disabled' and mode='bundle'
  and fixture_defaults->'batting_fixtures_only'='true'::jsonb)
$$;
revoke all on function club_batting_private.fixture_storage_only(uuid) from public,anon,authenticated;

-- A storage row must not turn an ungrouped existing Batting player into a Select-only player.
do $patch$
declare source text;changed text;
begin
 source:=pg_get_functiondef('club_batting_private.player_uses_batting(uuid,uuid)'::regprocedure);
 changed:=replace(source,'not exists(select 1 from club_selection_private.access a where a.club_id=c)',
  '(not exists(select 1 from club_selection_private.access a where a.club_id=c) or club_batting_private.fixture_storage_only(c))');
 if source=changed then raise exception 'Expected standalone player scope missing';end if;execute changed;
 source:=pg_get_functiondef('public.create_playing_group(uuid,text)'::regprocedure);
 changed:=replace(source,'not exists(select 1 from club_selection_private.access where club_id=p_club_id)',
  '(not club_selection_private.enabled(p_club_id) and coalesce((club_selection_private.shared_products(p_club_id)->>''batting'')::boolean,false))');
 if source=changed then raise exception 'Expected manual team participation missing';end if;execute changed;
end $patch$;

create or replace function public.club_batting_fixtures(p_club_id uuid,p_action text default 'context',p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare c uuid:=p_club_id;me uuid:=auth.uid();adm boolean;options jsonb;result jsonb;d jsonb;input jsonb;gid uuid;fid uuid;rid uuid;
 f club_selection_private.fixtures%rowtype;receipt club_selection_private.requests%rowtype;grade_name text;
begin
 if me is null or not club_selection_private.member(c,me) or not club_batting_private.team_review_staff(c)
  or not club_selection_private.fixtures_enabled(c) then raise exception 'Current club coaching access required';end if;
 if club_selection_private.enabled(c) then raise exception 'Manage linked club fixtures in Teams & availability';end if;
 adm:=public.is_club_admin(c);
 if adm then perform club_batting_private.ensure_fixture_access(c);end if;
 if p_action='context' then
  -- Use the existing coaching scope, without exposing selection slots or staff notes.
  if not adm then options:=club_batting_private.review_fixture_options(c);end if;
  return jsonb_build_object('admin',adm,
   'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.sort_order,g.name)
    from public.playing_groups g where g.club_id=c and g.active and g.batting_enabled
     and (adm or exists(select 1 from jsonb_array_elements(options) o where o->>'group_id'=g.id::text))),'[]'),
   'fixtures',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'details',jsonb_build_object(
    'grade_group_id',club_selection_private.fixture_group_id(c,f.details),'grade',f.details->>'grade','opposition',f.details->>'opposition',
    'days',f.details->'days','format',f.details->>'format','ground',f.details->>'ground','overs',f.details->'overs',
    'cancelled',coalesce(f.details->'cancelled','false'),'include_in_fixture_calendar',coalesce(f.details->'include_in_fixture_calendar','false')),
    'imported',exists(select 1 from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=f.id))
    order by f.details->'days'->0->>'date',f.details->>'grade',f.id)
    from club_selection_private.fixtures f where f.club_id=c
     and exists(select 1 from public.playing_groups g where g.club_id=c and g.id=club_selection_private.fixture_group_id(c,f.details) and g.active and g.batting_enabled)
     and (adm or exists(select 1 from jsonb_array_elements(options) o where o->>'id'=f.id::text))),'[]'));
 end if;
 if p_action<>'save' or not adm then raise exception 'Club Admin manages fixtures';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>7000
  or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','revision','request_id','details')) then raise exception 'Invalid fixture request';end if;
 rid:=nullif(p_data->>'request_id','')::uuid;fid:=nullif(p_data->>'id','')::uuid;
 if rid is null or fid is null then raise exception 'Fixture and request IDs required';end if;
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 select * into receipt from club_selection_private.requests where club_id=c and user_id=me and request_id=rid;
 if found then
  if receipt.action<>'batting_fixture_save' or receipt.payload<>p_data then raise exception 'Request ID already used';end if;
  return receipt.result;
 end if;
 select * into f from club_selection_private.fixtures where id=fid for update;
 if f.id is not null and f.club_id<>c then raise exception 'Fixture unavailable in this club';end if;
 if coalesce(f.revision,0) is distinct from (p_data->>'revision')::integer then raise exception 'Fixture changed. Reopen it before saving';end if;
 if f.published is not null then raise exception 'This fixture has a published team. Use Correct match details in Match Review';end if;
 input:=p_data->'details';
 if jsonb_typeof(input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(input) k
  where k not in ('grade_group_id','opposition','days','format','ground','overs','cancelled','include_in_fixture_calendar')) then raise exception 'Invalid fixture details';end if;
 gid:=nullif(input->>'grade_group_id','')::uuid;
 select name into grade_name from public.playing_groups where club_id=c and id=gid and active and batting_enabled;
 if grade_name is null then raise exception 'Choose an active Club Batting team';end if;
 if f.id is not null and gid is distinct from club_selection_private.fixture_group_id(c,f.details)
  and exists(select 1 from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=f.id)
 then raise exception 'Keep the team linked to this PlayCricket fixture. Manage team links in season setup';end if;
 if coalesce(input->>'format','') not in ('limited_overs','long_form','t20')
  or jsonb_typeof(input->'cancelled') is distinct from 'boolean'
  or jsonb_typeof(input->'include_in_fixture_calendar') is distinct from 'boolean' then raise exception 'Choose a format and fixture options';end if;
 d:=coalesce(f.details,'{}')||input||jsonb_build_object('grade',grade_name);
 if input->'overs' is distinct from f.details->'overs' then d:=d||jsonb_build_object('overs_source',case when nullif(input->>'overs','') is null then 'default' else 'fixture' end);end if;
 perform club_selection_private.validate_details(d);
 if d->>'format'<>'long_form' and jsonb_array_length(d->'days')<>1 then raise exception 'Only long-form fixtures have a second day';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(f.slots,'[]')) s where s->>'d2' is not null)
  and (d->>'format'<>'long_form' or jsonb_array_length(d->'days')<>2) then raise exception 'Keep the recorded second day. Use Correct match details in Match Review';end if;
 if f.id is null then
  insert into club_selection_private.fixtures(id,club_id,details,slots,updated_by) values(fid,c,d,
   (select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,11)),me) returning * into f;
 else
  -- Existing fixture identity/roster/history triggers remain authoritative.
  update club_selection_private.fixtures set details=d,revision=revision+1,updated_at=now(),updated_by=me where id=fid returning * into f;
 end if;
 result:=jsonb_build_object('saved',true,'id',fid,'revision',f.revision);
 insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,'batting_fixture_save',jsonb_build_object('fixture_id',fid,'details',d));
 insert into club_selection_private.requests(club_id,user_id,request_id,action,payload,result) values(c,me,rid,'batting_fixture_save',p_data,result);
 return result;
end$$;
revoke all on function public.club_batting_fixtures(uuid,text,jsonb) from public,anon;
grant execute on function public.club_batting_fixtures(uuid,text,jsonb) to authenticated;

-- Change only fixture-specific entitlement gates. Keep selection APIs and their grants intact.
do $patch$
declare sig text;source text;changed text;
begin
 foreach sig in array array[
  'public.playhq_sync_api(uuid,text,jsonb)',
  'public.playhq_sync_worker(text,jsonb)',
  'public.club_selection_group_manage(uuid,text,jsonb)',
  'club_selection_private.playhq_import_all(uuid,uuid,uuid,uuid,jsonb)',
  'club_selection_private.fixture_calendar_trials_api(uuid,text,jsonb)',
  'club_selection_private.recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid)',
  'club_selection_private.link_selected_scorecard_players(uuid,uuid,uuid,uuid,uuid,boolean)',
  'club_batting_private.completed_review_snapshot(uuid,uuid)'
 ] loop
  source:=pg_get_functiondef(sig::regprocedure);
  changed:=replace(source,'club_selection_private.enabled(','club_selection_private.fixtures_enabled(');
  if source=changed then raise exception 'Expected fixture entitlement gate missing: %',sig;end if;
  execute changed;
 end loop;
 source:=pg_get_functiondef('public.playhq_sync_api(uuid,text,jsonb)'::regprocedure);
 changed:=replace(source,'if not adm and not club_selection_private.selection_viewer(p_club_id,me)',
  'if not adm and (not club_selection_private.enabled(p_club_id) or not club_selection_private.selection_viewer(p_club_id,me))');
 if source=changed then raise exception 'Expected sync authorisation missing';end if;
 changed:=replace(changed,'elsif p_action=''import'' then',
  'elsif p_action=''import'' then
   if not club_selection_private.enabled(p_club_id) then raise exception ''Use season fixture import for Club Batting'';end if;');
 execute changed;
 source:=pg_get_functiondef('public.playhq_onboarding(uuid,text,jsonb)'::regprocedure);
 changed:=replace(source,'if not exists(select 1 from club_selection_private.access where club_id=p_club_id) then raise exception ''Club Selections access is required'';end if;',
  'perform club_batting_private.ensure_fixture_access(p_club_id);');
 if source=changed then raise exception 'Expected onboarding access gate missing';end if;
 execute changed;
 source:=pg_get_functiondef('club_selection_private.fixture_calendar_trials_api(uuid,text,jsonb)'::regprocedure);
 changed:=replace(source,'adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role=''admin'');',
  'adm:=exists(select 1 from public.club_memberships where club_id=c and user_id=me and permission_role=''admin'');
   if not club_selection_private.enabled(c) and not adm then raise exception ''Club Admin manages fixtures'';end if;
   if adm then perform club_batting_private.ensure_fixture_access(c);end if;');
 if source=changed then raise exception 'Expected trial authorisation missing';end if;
 execute changed;
end $patch$;

-- New imported groups in a Batting-only club already belong to Club Batting.
-- Preserve an existing group's explicit opt-out and every linked club setting.
do $patch$
declare sig text;source text;changed text;
begin
 foreach sig in array array['public.club_selection_groups(uuid,text,jsonb)','public.club_selection_group_manage(uuid,text,jsonb)'] loop
  source:=pg_get_functiondef(sig::regprocedure);
  changed:=replace(source,'insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,nm)',
   'insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,nm,not club_selection_private.enabled(c) and coalesce((club_selection_private.shared_products(c)->>''batting'')::boolean,false))');
  if source=changed then raise exception 'Expected group creation missing: %',sig;end if;
  execute changed;
 end loop;
end $patch$;

-- Source corrections reuse the same shared fixture guards without requiring a selection board.
do $patch$
declare source text;changed text;
begin
 source:=pg_get_functiondef('club_selection_private.playhq_fixture_review(uuid,text,jsonb)'::regprocedure);
 changed:=replace(source,'if action=''apply'' and club_selection_private.scoped_selections(c)',
  'if action=''apply'' and club_selection_private.enabled(c) and club_selection_private.scoped_selections(c)');
 changed:=replace(changed,'begin perform club_selection_private.assert_selection_open(f.details,tz,f.selection_unlocked_until);exception when others then blocks:=blocks||jsonb_build_array(sqlerrm);end;',
  'if club_selection_private.enabled(c) then
   begin perform club_selection_private.assert_selection_open(f.details,tz,f.selection_unlocked_until);exception when others then blocks:=blocks||jsonb_build_array(sqlerrm);end;
   elsif f.published is not null then blocks:=blocks||jsonb_build_array(''This fixture has a published team. Use Correct match details in Match Review.'');end if;');
 changed:=replace(changed,'if f.details->''days'' is distinct from d->''days'' then',
  'if club_selection_private.enabled(c) and f.details->''days'' is distinct from d->''days'' then');
 changed:=replace(changed,'result:=club_selection_private.api(c,''save_fixture'',jsonb_build_object(''id'',f.id,''revision'',f.revision,''details'',d,''request_id'',gen_random_uuid()));',
  'if club_selection_private.enabled(c) then
   result:=club_selection_private.api(c,''save_fixture'',jsonb_build_object(''id'',f.id,''revision'',f.revision,''details'',d,''request_id'',gen_random_uuid()));
   else result:=public.club_batting_fixtures(c,''save'',jsonb_build_object(''id'',f.id,''revision'',f.revision,''request_id'',gen_random_uuid(),
    ''details'',jsonb_build_object(''grade_group_id'',club_selection_private.fixture_group_id(c,d),''opposition'',d->''opposition'',''format'',d->''format'',
     ''days'',d->''days'',''ground'',d->''ground'',''overs'',d->''overs'',''cancelled'',coalesce(d->''cancelled'',''false''),
     ''include_in_fixture_calendar'',coalesce(d->''include_in_fixture_calendar'',''false''))));end if;');
 if source=changed or position('result:=public.club_batting_fixtures' in changed)=0 then raise exception 'Expected fixture correction path missing';end if;
 execute changed;
end $patch$;
commit;
