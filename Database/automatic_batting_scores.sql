-- Completed PlayHQ/PlayCricket results feed the shared batting innings at save
-- time. Reads remain read-only; no extra provider requests or review imports.
-- This private ledger also authorises exactly one source-backed score write in
-- the current transaction. It cannot be written through an application role.
create table club_batting_private.automatic_score_sync (
 match_id uuid primary key references public.player_match_entries(id) on delete cascade,
 snapshot_id uuid not null references public.match_review_scorecards(id),
 score_text text not null,
 participation_status text not null check(participation_status in ('played','did_not_bat')),
 write_xid xid8 not null,
 updated_at timestamptz not null default clock_timestamp()
);
create index automatic_score_sync_snapshot on club_batting_private.automatic_score_sync(snapshot_id);
alter table club_batting_private.automatic_score_sync enable row level security;
revoke all on club_batting_private.automatic_score_sync from public,anon,authenticated,service_role;

create or replace function club_batting_private.guard_match_review_score_innings()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.match_review_score_links where match_id=old.id) then
  if row(new.club_id,new.player_id,new.match_date,new.format_key,new.innings_number) is distinct from row(old.club_id,old.player_id,old.match_date,old.format_key,old.innings_number) then raise exception 'This innings is linked to a confirmed scorecard. Keep the original match details.';end if;
  if row(new.score_text,new.participation_status) is distinct from row(old.score_text,old.participation_status)
   and not club_batting_private.call_can_score(old.club_id,old.player_id)
   and not exists(select 1 from club_batting_private.automatic_score_sync a
    where a.match_id=old.id and a.write_xid=pg_current_xact_id()
     and a.score_text=new.score_text and a.participation_status=new.participation_status)
  then raise exception 'Result permission is required to correct an imported score';end if;
 end if;
 return new;
end $$;

create or replace function club_batting_private.sync_fixture_batting_scores(c uuid,fid uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 f club_selection_private.fixtures%rowtype;src club_selection_private.fixture_result_sources%rowtype;
 snap public.match_review_scorecards%rowtype;d jsonb;card jsonb;team jsonb;inn jsonb;b jsonb;links jsonb;
 pid uuid;mid uuid;source_id uuid;ids uuid[];num integer;played date;scoreday date;newscore text;newstatus text;
 existing public.player_match_entries%rowtype;oldlink public.match_review_score_links%rowtype;
 ledger club_batting_private.automatic_score_sync%rowtype;oldscore text;oldstatus text;
 added integer:=0;changed integer:=0;kept integer:=0;issues jsonb:='[]';result jsonb;err text;
begin
 perform pg_advisory_xact_lock(hashtextextended(c::text,9200));
 if not coalesce((club_selection_private.shared_products(c)->>'batting')::boolean,false) then return '{"skipped":"product"}';end if;
 select * into f from club_selection_private.fixtures where club_id=c and id=fid;
 select * into src from club_selection_private.fixture_result_sources where club_id=c and fixture_id=fid;
 if f.id is null or src.source_match_id is null or src.team_id is null or src.no_play is not null then return '{"skipped":"source"}';end if;
 d:=f.details;
 if not club_batting_private.group_uses_batting(c,club_selection_private.fixture_group_id(c,d))
  or coalesce((d->>'cancelled')::boolean,false)
  or f.published is not null and club_selection_private.fixture_identity(c,d) is distinct from club_selection_private.fixture_identity(c,f.published->'details')
 then return '{"skipped":"fixture"}';end if;
 select * into snap from public.match_review_scorecards where club_id=c and source_match_id=src.source_match_id order by created_at desc,id desc limit 1;
 card:=snap.scorecard;
 if card is null or card->>'provider' not in ('playhq_au','playcricket_au') or card->>'status' is distinct from 'completed'
  or card->>'match_id' is distinct from src.source_match_id::text or card->>'format_key' is distinct from d->>'format'
  or (select jsonb_agg(day->>'date' order by day->>'date') from jsonb_array_elements(d->'days') day) is distinct from card->'dates'
  or exists(select 1 from jsonb_array_elements_text(card->'dates') day where day::date>(now() at time zone coalesce((select timezone from club_selection_private.access where club_id=c),'Australia/Sydney'))::date)
 then return '{"skipped":"unfinished_or_changed_source"}';end if;
 select t into team from jsonb_array_elements(card->'teams') t where t->>'id'=src.team_id::text;
 if team is null then return '{"skipped":"team"}';end if;
 played:=(card->'dates'->>0)::date;
 select coalesce(jsonb_agg(to_jsonb(l)),'[]') into links from club_batting_private.scorecard_player_links(c,card) l;
 for inn in select i from jsonb_array_elements(card->'innings') i where i->>'team_id'=src.team_id::text and i->'complete'='true'::jsonb loop
  num:=(inn->>'number')::int;
  if num not between 1 and 10 then continue;end if;
  for b in select batter from jsonb_array_elements(inn->'batters') batter order by batter->>'player_id' loop
   -- A malformed/unresolved batter never blocks the rest of the confirmed team.
   begin
    if b->'importable' is distinct from 'true'::jsonb or b->>'status' not in ('played','did_not_bat') then continue;end if;
    source_id:=nullif(b->>'player_id','')::uuid;
    if source_id is null or not exists(select 1 from jsonb_array_elements(team->'players') t where t->>'player_id'=source_id::text)
     or (select count(*) from jsonb_array_elements(inn->'batters') v where v->>'player_id'=source_id::text)<>1 then continue;end if;
    select array_agg((l->>'player_id')::uuid) into ids from jsonb_array_elements(links) l where l->>'source_player_id'=source_id::text;
    if cardinality(ids) is distinct from 1 then continue;end if;
    pid:=ids[1];
    if not exists(select 1 from public.players where id=pid and club_id=c and active)
     or not club_batting_private.player_uses_batting(c,pid)
     or exists(select 1 from club_batting_private.roster_players rp join club_selection_private.roster r on r.id=rp.roster_id and r.club_id=c where rp.club_id=c and rp.player_id=pid and not r.active)
     or (select count(*) from jsonb_array_elements(links) l join jsonb_array_elements(inn->'batters') v on v->>'player_id'=l->>'source_player_id' where l->>'player_id'=pid::text)<>1 then continue;end if;
    newstatus:=b->>'status';
    if newstatus='played' and (coalesce(b->>'runs','') !~ '^[0-9]{1,5}$' or jsonb_typeof(b->'not_out') is distinct from 'boolean') then continue;end if;
    newscore:=case when newstatus='did_not_bat' then '' else b->>'runs'||case when b->'not_out'='true'::jsonb then '*' else '' end end;
    perform 1 from public.players where id=pid for update;
    select * into oldlink from public.match_review_score_links where club_id=c and source_match_id=src.source_match_id and source_innings_id=(inn->>'id')::uuid and source_player_id=source_id for update;
    if oldlink.match_id is not null and oldlink.player_id<>pid then raise exception 'The source innings belongs to another player';end if;
    mid:=oldlink.match_id;
    if mid is null then
     select array_agg(m.id) into ids from public.player_match_entries m join club_batting_private.fixture_innings fi on fi.match_id=m.id
      where fi.club_id=c and fi.fixture_id=fid and m.player_id=pid and m.innings_number=num;
     if cardinality(ids)>1 then raise exception 'More than one innings belongs to this fixture';end if;
     mid:=ids[1];
    end if;
    if mid is null then
     -- Older team reviews already carry an explicit fixture, even when their
     -- innings predate fixture_innings. Reuse that evidence across same-day grades.
     select array_agg(distinct m.id) into ids from public.player_match_entries m
      join public.team_review_items ri on ri.match_id=m.id and ri.player_id=m.player_id
      join public.team_review_sessions rs on rs.id=ri.review_id and rs.club_id=c and rs.fixture_id=fid and rs.deleted_at is null
      where m.club_id=c and m.player_id=pid and m.innings_number=num;
     if cardinality(ids)>1 then raise exception 'More than one reviewed innings belongs to this fixture';end if;
     mid:=ids[1];
    end if;
    if mid is null then
     select array_agg(m.id) into ids from public.player_match_entries m where m.club_id=c and m.player_id=pid and m.match_date=played and m.format_key=card->>'format_key' and m.innings_number=num
      and club_batting_private.innings_opposition_key(m.opposition)=club_batting_private.innings_opposition_key(d->>'opposition');
     if cardinality(ids)>1 or cardinality(ids)=1 and (select count(*) from club_selection_private.fixtures fx where fx.club_id=c and fx.details->'days'->0->>'date'=played::text and fx.details->>'format'=card->>'format_key' and club_batting_private.innings_opposition_key(fx.details->>'opposition')=club_batting_private.innings_opposition_key(d->>'opposition'))>1
     then raise exception 'An existing innings needs its fixture identity checked';end if;
     mid:=ids[1];
    end if;
    select * into existing from public.player_match_entries where id=mid for update;
    if existing.id is not null and (existing.club_id<>c or existing.player_id<>pid or existing.match_date<>played or existing.format_key<>card->>'format_key' or existing.innings_number<>num or club_batting_private.innings_opposition_key(existing.opposition)<>club_batting_private.innings_opposition_key(d->>'opposition'))
     or exists(select 1 from club_batting_private.fixture_innings where match_id=mid and (club_id<>c or fixture_id<>fid))
     or exists(select 1 from public.team_review_items ri join public.team_review_sessions rs on rs.id=ri.review_id where ri.match_id=mid and rs.fixture_id is not null and (rs.club_id<>c or rs.fixture_id<>fid) and rs.deleted_at is null)
     or exists(select 1 from public.match_review_score_links where match_id=mid and (source_match_id<>src.source_match_id or source_innings_id<>(inn->>'id')::uuid or source_player_id<>source_id))
    then raise exception 'The saved innings has a different fixture or source';end if;
    select * into ledger from club_batting_private.automatic_score_sync where match_id=mid;
    oldscore:=case when ledger.match_id is not null then ledger.score_text when oldlink.match_id is not null then case when oldlink.stats->>'status'='did_not_bat' then '' else oldlink.stats->>'runs'||case when oldlink.stats->'not_out'='true'::jsonb then '*' else '' end end end;
    oldstatus:=coalesce(ledger.participation_status,oldlink.stats->>'status');
    -- Keep a deliberately edited/manual score, including a manually chosen DNB.
    if existing.id is not null and (
     oldscore is not null and (existing.score_text,existing.participation_status) is distinct from (oldscore,oldstatus)
     or oldscore is null and (btrim(existing.score_text)<>'' or existing.participation_status='did_not_bat') and (existing.score_text,existing.participation_status) is distinct from (newscore,newstatus))
    then kept:=kept+1;continue;end if;
    if newstatus='did_not_bat' and (exists(select 1 from public.player_match_reflections where match_entry_id=mid) or exists(select 1 from public.player_match_coach_feedback where match_entry_id=mid and plan_related)) then raise exception 'Batting observations need checking before changing this innings to DNB';end if;
    scoreday:=coalesce(nullif(oldlink.stats->>'score_date','')::date,played);
    b:=b||jsonb_build_object('score_date',scoreday,'automatic_sync',true,'provider',card->>'provider');
    if existing.id is null then
     insert into public.player_match_entries(club_id,player_id,match_date,format_key,opposition,innings_number,score_text,participation_status)
      values(c,pid,played,card->>'format_key',d->>'opposition',num,newscore,newstatus) returning id into mid;
    end if;
    if ledger.match_id is null or (ledger.snapshot_id,ledger.score_text,ledger.participation_status) is distinct from (snap.id,newscore,newstatus) then
     insert into club_batting_private.automatic_score_sync(match_id,snapshot_id,score_text,participation_status,write_xid)
      values(mid,snap.id,newscore,newstatus,pg_current_xact_id()) on conflict(match_id) do update set snapshot_id=excluded.snapshot_id,score_text=excluded.score_text,participation_status=excluded.participation_status,write_xid=excluded.write_xid,updated_at=clock_timestamp();
    end if;
    if existing.id is not null and (existing.score_text,existing.participation_status) is distinct from (newscore,newstatus) then
     update public.player_match_entries set score_text=newscore,participation_status=newstatus,score_recorded_by=null,updated_at=clock_timestamp() where id=mid;
    end if;
    insert into club_batting_private.fixture_innings(match_id,club_id,fixture_id) values(mid,c,fid) on conflict(match_id) do nothing;
    insert into public.match_review_score_links(club_id,source_match_id,source_innings_id,source_player_id,player_id,match_id,snapshot_id,stats,confirmed_by)
     values(c,src.source_match_id,(inn->>'id')::uuid,source_id,pid,mid,snap.id,b,snap.fetched_by)
     on conflict(club_id,source_match_id,source_innings_id,source_player_id) do update set snapshot_id=excluded.snapshot_id,stats=excluded.stats,updated_at=clock_timestamp()
      where (match_review_score_links.snapshot_id,match_review_score_links.stats) is distinct from (excluded.snapshot_id,excluded.stats);
    if existing.id is null then added:=added+1;
    elsif (existing.score_text,existing.participation_status) is distinct from (newscore,newstatus) then changed:=changed+1;end if;
   exception when raise_exception or unique_violation or check_violation then
    get stacked diagnostics err=message_text;
    issues:=issues||jsonb_build_array(jsonb_build_object('source_player_id',b->>'player_id','innings',num,'reason',err));
   end;
  end loop;
 end loop;
 result:=jsonb_build_object('fixture_id',fid,'snapshot_id',snap.id,'added',added,'updated',changed,'manual_scores_kept',kept,'issues',issues);
 if added+changed>0 or jsonb_array_length(issues)>0 and not exists(select 1 from club_selection_private.audit where club_id=c and action='automatic_batting_scores' and detail->>'snapshot_id'=snap.id::text and detail->'issues'=issues) then
  insert into club_selection_private.audit(club_id,actor_id,action,detail) values(c,snap.fetched_by,'automatic_batting_scores',result);
 end if;
 return result;
end $$;
revoke all on function club_batting_private.sync_fixture_batting_scores(uuid,uuid) from public,anon,authenticated,service_role;

-- Deferral is essential: scorecard storage precedes its fixture/team/identity
-- links. Process the final committed set, including identities confirmed later.
create or replace function club_batting_private.automatic_batting_scores_changed()
returns trigger language plpgsql security definer set search_path='' as $$
declare src record;source_ids uuid[];c uuid:=new.club_id;
begin
 if tg_table_name='match_review_scorecards' then
  for src in select fixture_id from club_selection_private.fixture_result_sources where club_id=c and source_match_id=new.source_match_id loop
   perform club_batting_private.sync_fixture_batting_scores(c,src.fixture_id);
  end loop;
 elsif tg_table_name='fixture_result_sources' then
  perform club_batting_private.sync_fixture_batting_scores(c,new.fixture_id);
 else
  if tg_table_name='roster_players' then
   select array_agg(source_player_id) into source_ids from club_selection_private.scorecard_roster_links where club_id=c and roster_id=new.roster_id;
  else source_ids:=array[new.source_player_id];end if;
  for src in select fs.fixture_id from club_selection_private.fixture_result_sources fs
   join lateral(select scorecard from public.match_review_scorecards s where s.club_id=c and s.source_match_id=fs.source_match_id order by s.created_at desc,s.id desc limit 1) s on true
   where fs.club_id=c and fs.no_play is null and exists(select 1 from jsonb_array_elements(s.scorecard->'teams') t cross join jsonb_array_elements(t->'players') p where t->>'id'=fs.team_id::text and (p->>'player_id')::uuid=any(source_ids))
  loop perform club_batting_private.sync_fixture_batting_scores(c,src.fixture_id);end loop;
 end if;
 return null;
end $$;
revoke all on function club_batting_private.automatic_batting_scores_changed() from public,anon,authenticated,service_role;
create constraint trigger automatic_batting_scorecard after insert on public.match_review_scorecards deferrable initially deferred for each row execute function club_batting_private.automatic_batting_scores_changed();
create constraint trigger automatic_batting_fixture after insert or update on club_selection_private.fixture_result_sources deferrable initially deferred for each row execute function club_batting_private.automatic_batting_scores_changed();
create constraint trigger automatic_batting_roster_identity after insert or update on club_selection_private.scorecard_roster_links deferrable initially deferred for each row execute function club_batting_private.automatic_batting_scores_changed();
create constraint trigger automatic_batting_player_identity after insert or update on public.match_review_player_links deferrable initially deferred for each row execute function club_batting_private.automatic_batting_scores_changed();
create constraint trigger automatic_batting_account_identity after insert or update on club_batting_private.roster_players deferrable initially deferred for each row execute function club_batting_private.automatic_batting_scores_changed();
