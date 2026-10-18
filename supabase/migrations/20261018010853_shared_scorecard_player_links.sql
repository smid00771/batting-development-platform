-- Remember unambiguous identities from the selected XI when its scorecard is
-- linked. Names alone, shortened names and a matching draft are insufficient.
-- Existing source mappings, accounts, names, selections and histories are never
-- changed. Ambiguities retain the explicit same-person confirmation workflow.
create function club_selection_private.link_selected_scorecard_players(
 c uuid, sid uuid, fid uuid, tid uuid, actor uuid, apply_links boolean default true
) returns jsonb language plpgsql set search_path='' as $$
<<link_state>>
declare
 card jsonb; team jsonb; f club_selection_private.fixtures%rowtype; d jsonb; picks jsonb;
 person jsonb; rid uuid; pid uuid; source_id uuid; name_key text; candidates uuid[];
 linked jsonb:='[]'; changed integer:=0; added integer;
begin
 if actor is null or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=actor)
  or not club_selection_private.enabled(c) then return '[]'::jsonb;end if;
 if apply_links then perform pg_advisory_xact_lock(hashtextextended(c::text,9200));end if;
 select s.scorecard into card from public.match_review_scorecards s where s.id=sid and s.club_id=c;
 select * into f from club_selection_private.fixtures x where x.id=fid and x.club_id=c;
 if card is null or f.id is null or f.published is null or card->>'status'<>'completed' then return '[]'::jsonb;end if;
 d:=f.published->'details';picks:=f.published->'slots';
 if coalesce((d->>'cancelled')::boolean,false) or d->>'format' is distinct from card->>'format_key'
  or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(d->'days') day) is distinct from card->'dates'
  or not exists(select 1 from club_selection_private.fixture_result_sources s where s.club_id=c and s.fixture_id=fid
   and s.source_match_id=(card->>'match_id')::uuid and s.team_id=tid and s.no_play is null)
 then return '[]'::jsonb;end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=tid::text;
 if team is null or team->>'lineup_available' is distinct from 'true' then return '[]'::jsonb;end if;
 for person in select p from jsonb_array_elements(team->'players') p loop
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
   ((s.source_player_id=source_id and s.roster_id<>rid) or (s.roster_id=rid and s.source_player_id<>source_id))) then continue;end if;
  select case when count(*)=1 then min(rp.player_id::text)::uuid end into pid
   from club_batting_private.roster_players rp where rp.club_id=c and rp.roster_id=rid;
  if exists(select 1 from public.match_review_player_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if exists(select 1 from public.match_review_score_links l where l.club_id=c and
   ((l.source_player_id=source_id and l.player_id is distinct from pid) or (l.player_id=pid and l.source_player_id<>source_id))) then continue;end if;
  if pid is not null and exists(select 1 from club_batting_private.roster_players rp where rp.club_id=c and rp.player_id=pid and rp.roster_id<>rid) then continue;end if;
  if exists(select 1 from club_selection_private.scorecard_roster_links s where s.club_id=c and s.source_player_id=source_id and s.roster_id=rid)
   and (pid is null or exists(select 1 from public.match_review_player_links l where l.club_id=c and l.source_player_id=source_id and l.player_id=pid)) then continue;end if;
  linked:=linked||jsonb_build_array(jsonb_build_object('source_id',source_id,'roster_id',rid,'player_id',pid,'name',person->>'name'));
  if not apply_links then continue;end if;
  insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by)
   values(c,source_id,rid,actor) on conflict(club_id,source_player_id) do nothing;
  get diagnostics added=row_count;changed:=changed+added;
  if pid is not null then
   insert into public.match_review_player_links(club_id,source_player_id,player_id,confirmed_by)
    values(c,source_id,pid,actor) on conflict(club_id,source_player_id) do nothing;
   get diagnostics added=row_count;changed:=changed+added;
  end if;
 end loop;
 if apply_links and changed>0 then
  insert into club_selection_private.audit(club_id,actor_id,action,detail)
   values(c,actor,'scorecard_selected_identities',jsonb_build_object('fixture_id',fid,'snapshot_id',sid,'team_id',tid,'method','unique_full_name_in_published_team','players',linked));
 end if;
 return linked;
end $$;
revoke all on function club_selection_private.link_selected_scorecard_players(uuid,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;

-- The same link action is used after imports in Fixture details and Match Review.
-- Keep its existing permission, revision and association checks unchanged.
do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.match_results_api(uuid,text,jsonb)'::regprocedure);
 marker text:=' insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,me,''shared_result_''||action';
begin
 if position(marker in definition)=0 then raise exception 'Shared results function changed; review before installing identity linking';end if;
 definition:=replace(definition,marker,
  ' if action in (''link'',''identify'') and fid is not null and team is not null then
  perform club_selection_private.link_selected_scorecard_players(c,snapshot.id,fid,team::uuid,me);
 end if;
'||marker);
 execute definition;
end $patch$;
