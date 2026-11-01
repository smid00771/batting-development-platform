set check_function_bodies=off;
create role anon;create role authenticated;create role service_role;
create schema club_selection_private;create schema extensions;create schema net;
create table club_selection_private.access(club_id uuid primary key,status text);
create table club_selection_private.playhq_connections(club_id uuid primary key,active_season_id uuid,polling_enabled boolean,verified_at timestamptz,generation uuid);
create table club_selection_private.playhq_jobs(club_id uuid,kind text,source_id uuid,team_id uuid,due_at timestamptz,lease_id uuid,leased_until timestamptz,attempts integer default 0,last_error text,checked_at timestamptz,primary key(club_id,kind,source_id,team_id));
create table club_selection_private.playhq_links(fixture_id uuid,club_id uuid,season_id uuid,match_id uuid,team_id uuid,summary_checked_at timestamptz);
create table club_selection_private.playhq_grade_mappings(club_id uuid,season_id uuid,source_grade_id uuid,team_id uuid);
create table club_selection_private.playhq_runs(id uuid primary key default gen_random_uuid(),token_hash text,expires_at timestamptz default now()+interval '5 minutes');
create table net.requests(id bigint generated always as identity,body jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$declare result bigint;begin insert into net.requests(body) values(body) returning id into result;return result;end$$;
-- PGlite hashing stand-in; production retains the unchanged pgcrypto SHA-256.
create function extensions.digest(value text,algorithm text) returns bytea language sql as $$select decode(md5(value),'hex')$$;
create function club_selection_private.fixtures_enabled(c uuid) returns boolean language sql stable as $$select coalesce((select status='active' from club_selection_private.access where club_id=c),false)$$;
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
   where x.polling_enabled and x.verified_at is not null and q.due_at<=now() and coalesce(q.leased_until,'-infinity')<now() and club_selection_private.fixtures_enabled(q.club_id)
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
end $function$;

create function club_selection_private.match_results_api(c uuid,action text,data jsonb) returns jsonb language plpgsql as $$
declare fid uuid:=(data->>'fixture_id')::uuid;begin
return (select jsonb_build_object('checked_at',l.summary_checked_at) from club_selection_private.playhq_links l where l.club_id=c and l.fixture_id=fid);
end$$;
revoke all on function public.playhq_sync_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.playhq_sync_worker(text,jsonb) to service_role;
