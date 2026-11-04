const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID:uuid}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
test('club names, usual teams, safe merges and remembered imported identities',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(read('Tests/fixtures/fielding_test_schema.sql'));
 await db.exec(`
  drop function club_selection_private.import_player(uuid,jsonb);
  alter table club_selection_private.roster alter column id set default gen_random_uuid();
  alter table club_selection_private.roster add column fielding text default 'unknown',add column spin_style text default 'unknown';
  alter table club_selection_private.fixtures add column scorecard_sync jsonb;
  create table public.players(id uuid primary key,club_id uuid,user_id uuid,display_name text,active boolean default true);
  create table club_batting_private.roster_players(roster_id uuid primary key references club_selection_private.roster(id),club_id uuid,player_id uuid unique references public.players(id),claimed_user_id uuid,claimed_at timestamptz);
  create table public.player_playing_groups(club_id uuid,player_id uuid references public.players(id),playing_group_id uuid,unique(club_id,player_id,playing_group_id));
  create table public.player_match_entries(id uuid primary key,player_id uuid references public.players(id),score integer);
  create table public.match_review_player_links(club_id uuid,source_player_id uuid,player_id uuid references public.players(id),confirmed_by uuid,updated_at timestamptz default now(),primary key(club_id,source_player_id));
  create table public.match_review_score_links(club_id uuid,source_player_id uuid,player_id uuid references public.players(id));
  create table public.match_review_scorecards(id uuid primary key,club_id uuid,source_match_id uuid,scorecard jsonb,created_at timestamptz default now());
  create table club_selection_private.scorecard_roster_links(club_id uuid,source_player_id uuid,roster_id uuid references club_selection_private.roster(id),confirmed_by uuid,updated_at timestamptz default now(),primary key(club_id,source_player_id));
  create table club_selection_private.fixture_result_sources(club_id uuid,fixture_id uuid,source_match_id uuid,team_id uuid,no_play text);
  create table club_batting_private.selection_plan_dates(club_id uuid,player_id uuid references public.players(id),due_date date);
  create table club_batting_private.fixture_review_rosters(club_id uuid,fixture_id uuid,player_ids uuid[],captain_player_id uuid,keeper_player_id uuid,revision integer default 1,updated_at timestamptz,updated_by uuid);
  create table club_selection_private.player_conversations(roster_id uuid);
  create table club_selection_private.season_appointments(club_id uuid,captain_roster_id uuid);
  create table club_selection_private.social_assets(club_id uuid,roster_id uuid);
  create table club_selection_private.social_features(club_id uuid,roster_id uuid);
  create table club_selection_private.social_preparations(club_id uuid,roster_id uuid);
  create table club_selection_private.dropped_player_reminders(club_id uuid,roster_id uuid);
  create table club_selection_private.player_link_choices(club_id uuid,roster_id uuid);
  create function public.is_club_admin(c uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role='admin')$$;
  create function club_batting_private.team_review_staff(c uuid) returns boolean language sql as $$select public.is_club_admin(c)$$;
  create function club_selection_private.social_allowed_at(uuid,uuid,timestamptz) returns boolean language sql as $$select false$$;
  create function club_batting_private.verified_roster_user(uuid,uuid) returns boolean language sql as $$select false$$;
  create function club_batting_private.group_uses_batting(uuid,uuid) returns boolean language sql as $$select true$$;
  create function club_selection_private.fixture_identity(uuid,d jsonb) returns jsonb language sql as $$select d$$;
  create function club_selection_private.fixtures_enabled(c uuid) returns boolean language sql as $$select club_selection_private.enabled(c)$$;
  create function club_selection_private.recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid) returns boolean language sql as $$select false$$;
  create function club_selection_private.scorecard_identity_slots(slots jsonb,old_id uuid,new_id uuid) returns jsonb language sql as $$select replace(slots::text,old_id::text,new_id::text)::jsonb$$;
  create function club_selection_private.scorecard_identity_roles(details jsonb,old_id uuid,new_id uuid) returns jsonb language sql as $$select replace(details::text,old_id::text,new_id::text)::jsonb$$;
  create function public.can_edit_player(uuid) returns boolean language sql as $$select true$$;
  create function public.can_read_coaching_action_player(uuid) returns boolean language sql as $$select true$$;
 `);
 await db.exec(read('Tests/fixtures/identity_preferences_before_341.sql'));
 await db.exec(read('Database/player_identity_preferences.sql'));
 // The existing public wrapper and actual authenticated role exercise the save boundary.
 await db.exec('grant usage on schema auth to authenticated; grant execute on function public.club_selections_api(uuid,text,jsonb) to authenticated; revoke all on function club_selection_private.api(uuid,text,jsonb),club_batting_private.consolidate_scorecard_roster(uuid,uuid,uuid,text) from public,anon,authenticated');
 const c=uuid(),admin=uuid(),other=uuid(),short=uuid(),canonical=uuid(),shortPlayer=uuid(),player=uuid();
 await db.query('insert into public.clubs(id,name) values($1,$2)',[c,'Synthetic identity club']);
 await db.query('insert into auth.users(id) values($1),($2)',[admin,other]);
 await db.query("insert into public.club_memberships(club_id,user_id,permission_role) values($1,$2,'admin'),($1,$3,'player')",[c,admin,other]);
 await db.query("insert into club_selection_private.access(club_id,status,head_selector_id) values($1,'active',$2)",[c,admin]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 async function person(rid,pid,name,grade,account=null){
  await db.query('insert into club_selection_private.roster(id,club_id,name,grade,user_id) values($1,$2,$3,$4,$5)',[rid,c,name,grade,account]);
  if(pid){await db.query('insert into public.players(id,club_id,display_name,user_id) values($1,$2,$3,$4)',[pid,c,name,account]);await db.query('insert into club_batting_private.roster_players(roster_id,club_id,player_id) values($1,$2,$3)',[rid,c,pid]);}
 }
 await person(short,shortPlayer,'Arun Vijay','Dev Sky');await person(canonical,player,'Arun Vijay Raman','Dev Sky');
 await db.query('insert into public.player_match_entries values($1,$2,47)',[uuid(),player]);
 await db.query("insert into club_batting_private.selection_plan_dates values($1,$2,'2026-11-10')",[c,shortPlayer]);
 const selectedFixture=uuid(),details={grade:'Dev Sky',days:[{date:'2026-10-03'}],captain_id:short,match_roles:{d1:{captain_id:short}}},slots=[{d1:short,d2:null}],published={details,slots,players:[{id:short,name:'Arun Vijay'}]};
 await db.query('insert into club_selection_private.fixtures(id,club_id,details,slots,published,publication) values($1,$2,$3,$4,$5,1)',[selectedFixture,c,details,slots,published]);
 await db.query('insert into club_selection_private.publications(fixture_id,version,snapshot) values($1,1,$2)',[selectedFixture,published]);
 await db.query('insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates) values($1,$2,$3),($4,$5,$6)',[short,['2026-11-07'],['2026-11-14'],canonical,['2026-11-14','2026-11-21'],[]]);
 await db.query('insert into club_batting_private.fixture_review_rosters(club_id,fixture_id,player_ids,captain_player_id,keeper_player_id) values($1,$2,$3,$4,$4)',[c,selectedFixture,[shortPlayer],shortPlayer]);
 await db.query('select club_batting_private.consolidate_scorecard_roster($1,$2,$3,$4)',[c,short,canonical,'Arun Vijay']);
 const repaired=(await db.query('select * from club_selection_private.fixtures where id=$1',[selectedFixture])).rows[0];
 assert.equal(repaired.slots[0].d1,canonical);assert.equal(repaired.details.captain_id,canonical);assert.equal(repaired.published.players[0].id,canonical);assert.equal(repaired.publication,2);
 assert.equal((await db.query('select snapshot from club_selection_private.publications where fixture_id=$1 and version=1',[selectedFixture])).rows[0].snapshot.slots[0].d1,short,'Previous publication remains available');
 const available=(await db.query('select * from club_selection_private.availability where roster_id=$1',[canonical])).rows[0];assert.deepEqual(available.available_dates,['2026-11-07','2026-11-21']);assert.deepEqual(available.unavailable_dates,['2026-11-14']);
 const review=(await db.query('select * from club_batting_private.fixture_review_rosters where fixture_id=$1',[selectedFixture])).rows[0];assert.deepEqual(review.player_ids,[player]);assert.equal(review.captain_player_id,player);assert.equal(review.keeper_player_id,player);

 assert.equal((await db.query('select score from public.player_match_entries where player_id=$1',[player])).rows[0].score,47);
 assert.equal((await db.query('select active from public.players where id=$1',[shortPlayer])).rows[0].active,false);
 assert.equal((await db.query('select player_id from club_batting_private.selection_plan_dates where club_id=$1',[c])).rows[0].player_id,player);
 assert.equal((await db.query('select name from club_selection_private.roster where id=$1',[canonical])).rows[0].name,'Arun Vijay');
 const penny=uuid(),duplicate=uuid(),pennyPlayer=uuid();
 await person(penny,pennyPlayer,'Nina D’Arcy','Dev Navy',other);await person(duplicate,null,"Nina D'Arcy",'Women 2');
 await db.query('select club_batting_private.consolidate_scorecard_roster($1,$2,$3,$4)',[c,duplicate,penny,'Nina D’Arcy']);
 let row=(await db.query('select * from club_selection_private.roster where id=$1',[penny])).rows[0];
 assert.equal(row.user_id,other);assert.deepEqual(row.usual_grades,['Dev Navy','Women 2']);
 // A second established history must abort without retiring either record.
 const established=uuid(),establishedPlayer=uuid();await person(established,establishedPlayer,'Other Arun','Dev Navy');
 await db.query('insert into public.player_match_entries values($1,$2,12)',[uuid(),establishedPlayer]);
 await assert.rejects(db.query('select club_batting_private.consolidate_scorecard_roster($1,$2,$3,$4)',[c,established,canonical,'Arun Vijay']),/Both records have saved player history/);
 assert.equal((await db.query('select active from club_selection_private.roster where id=$1',[established])).rows[0].active,true);
 async function save(values,revision,who=admin,request=uuid()){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');
  try{return (await db.query("select public.club_selections_api($1,'save_roster',$2) result",[c,{revision,request_id:request,rows:values}])).rows[0].result;}finally{await db.exec('reset role');}
 }
 const base={id:canonical,name:'Arun V',grade:'Dev Sky',usual_grades:['Dev Sky','Women 2']},request=uuid();
 await save([base],0,admin,request);await save([base],0,admin,request);
 row=(await db.query('select * from club_selection_private.roster where id=$1',[canonical])).rows[0];assert.equal(row.preferred_name,true);assert.deepEqual(row.usual_grades,base.usual_grades);
 assert.equal((await db.query('select display_name from public.players where id=$1',[player])).rows[0].display_name,'Arun V');
 await assert.rejects(save([base],0),/Playing list changed/);await assert.rejects(save([base],1,other),/selector access required/);
 await save([{id:canonical,name:'Arun V',grade:'Dev Sky',batting:'top'}],1);assert.deepEqual((await db.query('select usual_grades from club_selection_private.roster where id=$1',[canonical])).rows[0].usual_grades,base.usual_grades);
 await assert.rejects(save([{id:uuid(),name:"Nina D'Arcy"}],2),/already on the playing list/);
 await assert.rejects(save([{...base,usual_grades:[null]}],2),/valid usual teams/);
 await db.query('select club_selection_private.import_player($1,$2)',[c,{external_id:uuid(),name:'Arun V',grade:'Dev Sky'}]);
 const registration=(await db.query('select external_id from club_selection_private.roster where id=$1',[canonical])).rows[0].external_id;
 await db.query('select club_selection_private.import_player($1,$2)',[c,{external_id:registration,name:'Arun Vijay Raman',grade:'Dev Sky'}]);
 assert.equal((await db.query('select name from club_selection_private.roster where id=$1',[canonical])).rows[0].name,'Arun V');
 async function imported(source,name,offset=0){
  const sid=uuid(),fid=uuid(),tid=uuid(),mid=uuid(),date='2026-10-'+String(10+offset);
  const details={grade:'Dev Sky',format:'t20',days:[{date}]},card={provider:'playhq_au',match_id:mid,status:'completed',dates:[date],format_key:'t20',teams:[{id:tid,lineup_available:true,players:[{player_id:source,name}]}],innings:[]};
  await db.query('insert into club_selection_private.fixtures(id,club_id,details,slots) values($1,$2,$3,$4)',[fid,c,details,[]]);
  await db.query('insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard) values($1,$2,$3,$4)',[sid,c,mid,card]);
  await db.query('insert into club_selection_private.fixture_result_sources values($1,$2,$3,$4,null)',[c,fid,mid,tid]);
  await db.query('select club_selection_private.link_selected_scorecard_players($1,$2,$3,$4,$5)',[c,sid,fid,tid,admin]);
  return {sid,fid,tid,mid,source};
 }
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 const first=await imported(uuid(),'Arun Vijay Raman');
 assert.equal((await db.query('select count(*)::int n from club_selection_private.scorecard_identity_reviews where club_id=$1',[c])).rows[0].n,1,'Unmatched results wait for confirmation');
 const command={snapshot_id:first.sid,fixture_id:first.fid,team_id:first.tid,source_player_id:first.source,roster_id:canonical,expected_name:'Arun V'},confirmation=uuid();
 let confirmed=(await db.query('select club_batting_private.confirm_scorecard_player($1,$2,$3) result',[c,confirmation,command])).rows[0].result;
 assert.equal(confirmed.name,'Arun V');assert.equal(confirmed.roster_id,canonical);
 assert.deepEqual((await db.query('select club_batting_private.confirm_scorecard_player($1,$2,$3) result',[c,confirmation,command])).rows[0].result,confirmed);
 const second=await imported(uuid(),'Arun Vijay Raman',1);
 assert.equal((await db.query('select roster_id from club_selection_private.scorecard_roster_links where source_player_id=$1',[second.source])).rows[0].roster_id,canonical,'A new appearance reuses the explicit remembered identity');
 assert.equal((await db.query('select count(*)::int n from club_selection_private.scorecard_identity_reviews where club_id=$1',[c])).rows[0].n,0,'Confirmed people are not prompted again');
 assert.equal((await db.query('select name from club_selection_private.roster where id=$1',[canonical])).rows[0].name,'Arun V');
 assert.equal((await db.query('select count(*)::int n from club_selection_private.roster where club_id=$1',[c])).rows[0].n,5,'Imports never create duplicate people');
 // Ambiguous exact aliases and newly introduced duplicate names must ask again.
 await db.query('insert into club_selection_private.player_source_names(club_id,provider,name_key,roster_id,source_name) values($1,$2,$3,$4,$5)',[c,'playhq_au','arun vijay raman',established,'Arun Vijay Raman']);
 const ambiguous=await imported(uuid(),'Arun Vijay Raman',2);
 assert.equal((await db.query('select count(*)::int n from club_selection_private.scorecard_roster_links where source_player_id=$1',[ambiguous.source])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from club_selection_private.scorecard_identity_reviews where source_player_id=$1',[ambiguous.source])).rows[0].n,1);
 // Ordinary source names remain the default until a club deliberately renames.
 const ordinary=uuid();await person(ordinary,null,'Rob Stone','Dev Sky');const regular=await imported(uuid(),'Robert James Stone',3);
 const regularCommand={snapshot_id:regular.sid,fixture_id:regular.fid,team_id:regular.tid,source_player_id:regular.source,roster_id:ordinary,expected_name:'Rob Stone'};
 await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(db.query('select club_batting_private.confirm_scorecard_player($1,$2,$3)',[c,uuid(),regularCommand]),/Current club membership/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 await db.query('select club_batting_private.confirm_scorecard_player($1,$2,$3)',[c,uuid(),regularCommand]);assert.equal((await db.query('select name from club_selection_private.roster where id=$1',[ordinary])).rows[0].name,'Robert James Stone');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from club_selection_private.player_source_names'),/permission denied/);await db.exec('reset role');
});
