const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID:uuid}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(p,'utf8');
test('scorecard teams distinguish two games on one day from overlapping games',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(read('Tests/fixtures/fielding_test_schema.sql'));
 // Only unrelated permissions/metadata integrations are stand-ins; plan, API,
 // recovery and overlap bodies below are the exact deployed functions.
 await db.exec(`
  create role service_role;
  alter table club_selection_private.fixtures add column scorecard_sync jsonb;
  alter table club_selection_private.roster add column spin_style text default 'unknown',add column preferred_name boolean default false;
  create table public.match_review_scorecards(id uuid primary key,club_id uuid,source_match_id uuid,scorecard jsonb,created_at timestamptz default now());
  create table club_selection_private.scorecard_roster_links(club_id uuid,source_player_id uuid,roster_id uuid,confirmed_by uuid,updated_at timestamptz default now(),primary key(club_id,source_player_id));
  create table club_selection_private.fixture_result_sources(club_id uuid,fixture_id uuid,source_match_id uuid,team_id uuid,no_play text);
  create table club_batting_private.roster_players(club_id uuid,roster_id uuid,player_id uuid);
  create table club_batting_private.fixture_review_rosters(club_id uuid,fixture_id uuid,player_ids uuid[],captain_player_id uuid,keeper_player_id uuid,revision integer default 1,updated_at timestamptz,updated_by uuid);
  create function public.is_club_admin(c uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role='admin')$$;
  create function club_batting_private.team_review_staff(c uuid) returns boolean language sql as $$select public.is_club_admin(c)$$;
  create function club_selection_private.social_allowed_at(uuid,uuid,timestamptz) returns boolean language sql as $$select false$$;
  create function club_selection_private.selection_scorecard_view(uuid,jsonb,uuid) returns boolean language sql as $$select false$$;
  create function club_selection_private.result_editor(f uuid,u uuid) returns boolean language sql as $$select exists(select 1 from club_selection_private.fixtures x join public.club_memberships m on m.club_id=x.club_id where x.id=f and m.user_id=u and m.permission_role='admin')$$;
  create function club_selection_private.fixtures_enabled(c uuid) returns boolean language sql as $$select club_selection_private.enabled(c)$$;
  create function club_selection_private.fixture_identity(uuid,d jsonb) returns jsonb language sql as $$select jsonb_build_object('format_key',d->>'format')$$;
  create function club_selection_private.scorecard_team_details(uuid,d jsonb,jsonb) returns jsonb language sql as $$select d$$;
  create function club_selection_private.remember_source_name(uuid,uuid,uuid,uuid,uuid,uuid) returns void language plpgsql as $$begin return;end$$;
 `);
 await db.exec(read('Tests/fixtures/same_day_scorecard_before_fix.sql'));
 await db.exec(`grant usage on schema auth,club_selection_private to authenticated;
  revoke all on function public.playcricket_team_api(uuid,text,jsonb),club_selection_private.scorecard_team_api(uuid,text,jsonb) from public,anon,authenticated;
  grant execute on function public.playcricket_team_api(uuid,text,jsonb),club_selection_private.scorecard_team_api(uuid,text,jsonb) to authenticated;
  revoke all on function club_selection_private.fixture_day_conflict(jsonb,jsonb,jsonb,jsonb),club_selection_private.scorecard_team_plan(uuid,uuid,text,uuid,jsonb),club_selection_private.recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;`);
 async function pair(start='14:00',opts={}){
  const c=uuid(),admin=uuid(),member=uuid(),players=[uuid(),uuid()],dates=opts.twoDays?['2026-10-25','2026-10-26']:['2026-10-25'];
  await db.query('insert into public.clubs(id,name) values($1,$2)',[c,'Synthetic double header']);
  await db.query("insert into public.club_memberships(club_id,user_id,permission_role) values($1,$2,'admin'),($1,$3,'player')",[c,admin,member]);
  await db.query("insert into club_selection_private.access(club_id,status,head_selector_id) values($1,'active',$2)",[c,admin]);
  for(let i=0;i<players.length;i++)await db.query('insert into club_selection_private.roster(id,club_id,name) values($1,$2,$3)',[players[i],c,'Example '+i]);
  const result={c,admin,member,players,dates,fixtures:[]};
  for(let n=0;n<2;n++){
   const id=uuid(),sid=uuid(),mid=uuid(),tid=uuid(),sources=players.map(()=>uuid());
   const details={grade:'Same Cup',format:opts.twoDays?'long_form':'t20',overs:20,days:dates.map(date=>({date,start:n?start:'10:00'})),brackets:!!opts.twoDays};
   const slots=players.map(p=>({d1:p,d2:opts.twoDays?p:null}));
   const published=opts.unpublished&&n===0?null:{details,slots};
   await db.query('insert into club_selection_private.fixtures(id,club_id,details,slots,published,publication) values($1,$2,$3,$4,$5,$6)',[id,c,details,slots,published,published?1:0]);
   const card={provider:'playhq_au',status:'completed',match_id:mid,dates,format_key:details.format,teams:[{id:tid,lineup_available:true,players:players.map((p,i)=>({player_id:sources[i],name:'Example '+i}))}],innings:[]};
   await db.query('insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard) values($1,$2,$3,$4)',[sid,c,mid,card]);
   await db.query('insert into club_selection_private.fixture_result_sources values($1,$2,$3,$4,null)',[c,id,mid,tid]);
   for(let i=0;i<players.length;i++)await db.query('insert into club_selection_private.scorecard_roster_links(club_id,source_player_id,roster_id,confirmed_by) values($1,$2,$3,$4)',[c,sources[i],players[i],admin]);
   result.fixtures.push({id,sid,mid,tid,details,slots,req:{snapshot_id:sid,fixture_id:id,team_id:tid,mapping:players.map((p,i)=>({source_id:sources[i],roster_id:p,days:dates}))}});
  }return result;
 }
 async function api(s,n,action,data={},who=s.admin,club=s.c){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');
  try{return (await db.query('select public.playcricket_team_api($1,$2,$3) result',[club,action,{...s.fixtures[n].req,...data}])).rows[0].result;}finally{await db.exec('reset role');}
 }
 const fixture=async id=>(await db.query('select * from club_selection_private.fixtures where id=$1',[id])).rows[0];
 async function apply(s,n){const p=await api(s,n,'preview');const command={expected:p.expected,request_id:uuid()};const result=await api(s,n,'apply',command);assert.deepEqual(await api(s,n,'apply',command),result);return result;}
 async function recover(s){const f=s.fixtures[0];return (await db.query('select club_selection_private.recover_completed_scorecard_team($1,$2,$3,$4,$5) result',[s.c,f.sid,f.id,f.tid,s.admin])).rows[0].result;}
 await t.test('reproduces the destructive afternoon import, then restores the morning without changing the afternoon',async()=>{
  const s=await pair();const oldPlan=await api(s,1,'preview');assert.equal(oldPlan.fixtures.length,2);
  await apply(s,1);assert.ok((await fixture(s.fixtures[0].id)).slots.every(p=>!p.d1));
  await assert.rejects(api(s,0,'preview'),/also confirmed from PlayCricket/);
  await db.exec(read('Database/same_day_scorecard_teams.sql'));
  const afternoon=await fixture(s.fixtures[1].id),plan=await api(s,0,'preview');
  assert.equal(plan.fixtures.length,1);assert.equal(plan.fixtures[0].added.length,2);
  await apply(s,0);assert.deepEqual(await fixture(s.fixtures[1].id),afternoon);
  const morning=await fixture(s.fixtures[0].id);assert.equal(morning.slots.filter(p=>p.d1).length,2);assert.deepEqual(morning.scorecard_sync.pending,[]);
  assert.equal((await api(s,0,'preview')).changed,false);assert.equal((await api(s,1,'preview')).changed,false);
 });
 await t.test('an initial non-overlapping import never displaces an unconfirmed team',async()=>{
  const s=await pair(),before=await fixture(s.fixtures[0].id);assert.equal((await api(s,1,'preview')).fixtures.length,1);
  await apply(s,1);assert.deepEqual(await fixture(s.fixtures[0].id),before);
 });
 await t.test('genuine and unknown-time clashes keep transfers and confirmed-scorecard rejection',async()=>{
  for(const start of ['12:00','']){
   const s=await pair(start);assert.equal((await api(s,1,'preview')).fixtures.length,2);
   await apply(s,1);assert.ok((await fixture(s.fixtures[0].id)).slots.every(p=>!p.d1));
   await assert.rejects(api(s,0,'preview'),/also confirmed from PlayCricket/);
  }
 });
 await t.test('draft and published fixture times are checked independently',async()=>{
  for(const publishedClash of [true,false]){
   const s=await pair(publishedClash?'14:00':'11:00'),other=s.fixtures[1];
   await db.query("update club_selection_private.fixtures set published=jsonb_set(published,'{details,days,0,start}',to_jsonb($2::text)) where id=$1",[other.id,publishedClash?'11:00':'14:00']);
   const plan=await api(s,0,'preview'),change=plan.fixtures.find(f=>f.id===other.id);assert.ok(change);
   assert.equal(change.slots.some(p=>p.d1),publishedClash);assert.equal(change.published_slots.some(p=>p.d1),!publishedClash);
  }
 });
 await t.test('bracketed players only displace the day they actually played',async()=>{
  const s=await pair('10:00',{twoDays:true});
  const mapping=s.fixtures[0].req.mapping.map(p=>({...p,days:[s.dates[1]]}));
  const plan=await api(s,0,'preview',{mapping}),other=plan.fixtures.find(f=>f.id===s.fixtures[1].id);
  assert.ok(other.slots.every(p=>p.d1&&!p.d2));assert.ok(other.published_slots.every(p=>p.d1&&!p.d2));
 });
 await t.test('automatic draft recovery permits a double header and still refuses real or published clashes',async()=>{
  const s=await pair('14:00',{unpublished:true}),other=await fixture(s.fixtures[1].id);
  await db.query("update club_selection_private.fixtures set slots='[]' where id=$1",[s.fixtures[0].id]);
  assert.equal(await recover(s),true);assert.deepEqual(await fixture(s.fixtures[1].id),other);assert.equal(await recover(s),false);
  for(const start of ['12:00','']){const clash=await pair(start,{unpublished:true});assert.equal(await recover(clash),false);}
  const pub=await pair('14:00',{unpublished:true});
  await db.query("update club_selection_private.fixtures set published=jsonb_set(published,'{details,days,0,start}','\"11:00\"') where id=$1",[pub.fixtures[1].id]);assert.equal(await recover(pub),false);
 });
 await t.test('actual-role access, stale previews, private helpers and guarded migration stay protected',async()=>{
  const s=await pair();await assert.rejects(api(s,0,'preview',{},s.member),/Coaching, selection or socials access/);
  await assert.rejects(api(s,0,'preview',{},s.admin,uuid()),/Current club membership/);
  const p=await api(s,0,'preview');await db.query('update club_selection_private.fixtures set revision=revision+1 where id=$1',[s.fixtures[0].id]);
  await assert.rejects(api(s,0,'apply',{expected:p.expected,request_id:uuid()}),/A team or player match changed/);
  for(const name of ['scorecard_team_plan(uuid,uuid,text,uuid,jsonb)','recover_completed_scorecard_team(uuid,uuid,uuid,uuid,uuid)'])for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') allowed',[role,'club_selection_private.'+name])).rows[0].allowed,false);
  await assert.rejects(db.exec(read('Database/same_day_scorecard_teams.sql')),/Unexpected scorecard team plan definition/);
 });
});
