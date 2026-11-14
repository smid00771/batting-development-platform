const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID:uuid}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const patch=fs.readFileSync('Database/playhq_final_day_results.sql','utf8');
test('long-form automatic results wait until the final playing day',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('Tests/fixtures/playhq_batch_325_baseline.sql','utf8'));
 await db.exec(fs.readFileSync('Database/playhq_due_batch_visibility.sql','utf8'));
 await db.exec(`
  alter table club_selection_private.access add timezone text default 'Australia/Sydney';
  alter table club_selection_private.playhq_links add source_fixture jsonb default '{}',add pending_fixture jsonb;
  create table club_selection_private.fixtures(id uuid primary key,club_id uuid,details jsonb,slots jsonb,revision int default 1);
  create table club_selection_private.fixture_result_sources(fixture_id uuid,club_id uuid,source_match_id uuid,no_play text);
  create table public.match_review_scorecards(id uuid default gen_random_uuid(),club_id uuid,source_match_id uuid,scorecard jsonb,created_at timestamptz default now());
  create function club_selection_private.fixture_no_play(c uuid,fid uuid) returns text language sql stable as $$select details->>'no_play' from club_selection_private.fixtures where id=fid and club_id=c$$;
 `);
 await db.exec(fs.readFileSync('Database/playhq_result_timing.sql','utf8').split('-- Change only scheduling expressions')[0]);
 await db.exec(fs.readFileSync('Database/playhq_t20_earlier_results.sql','utf8'));
 await db.exec(fs.readFileSync('Tests/fixtures/playhq_final_day_baseline.sql','utf8'));
 const records=new Map(),changed=new Set();
 async function add(name,opts={}){
  const c=uuid(),season=uuid(),team=uuid(),source=uuid(),id=uuid();
  const details={format:opts.format||'long_form',overs:50,days:opts.days||[{date:'2020-11-14',start:'12:00'},{date:'2099-11-21',start:'12:00'}],...opts.details};
  await db.query('insert into club_selection_private.access values($1,$2,$3)',[c,opts.inactive?'inactive':'active','Australia/Sydney']);
  await db.query('insert into club_selection_private.playhq_connections values($1,$2,$3,$4,$5)',[c,season,!opts.paused,opts.unverified?null:'2026-01-01T00:00:00Z',uuid()]);
  await db.query('insert into club_selection_private.fixtures values($1,$2,$3,$4,1)',[id,c,details,[{player:uuid()}]]);
  await db.query('insert into club_selection_private.playhq_links(fixture_id,club_id,season_id,match_id,team_id,source_fixture,pending_fixture) values($1,$2,$3,$4,$5,$6,$7)',[id,c,opts.oldSeason?uuid():season,source,team,{source_status:opts.final?'FINAL':'UPCOMING'},opts.pendingFinal?{source_status:'FINAL'}:null]);
  await db.query('insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at,checked_at,leased_until,last_error,attempts) values($1,$2,$3,$4,$5,$6,$7,$8,2)',[c,opts.kind||'results',source,team,opts.later?'2099-12-01T00:00:00Z':'2020-11-14T09:00:00Z',opts.checked?'2020-11-14T09:00:00Z':null,opts.leased?'2099-12-01T00:00:00Z':null,opts.error?'Provider throttle':null]);
  if(opts.completed||opts.inProgress||opts.noPlay){
   await db.query('insert into club_selection_private.fixture_result_sources values($1,$2,$3,$4)',[id,c,source,opts.noPlay?'won_by_forfeit':null]);
   if(opts.completed||opts.inProgress)await db.query('insert into public.match_review_scorecards(club_id,source_match_id,scorecard) values($1,$2,$3)',[c,source,{status:opts.completed?'completed':'in_progress'}]);
  }
  const record={id,c,source,team,season};records.set(name,record);if(opts.change)changed.add(source);return record;
 }
 const normal=await add('normal',{change:true});
 for(const [name,opts] of Object.entries({checked:{checked:true,change:true},partial:{inProgress:true,checked:true,change:true},paused:{paused:true,change:true},unverified:{unverified:true,change:true},inactive:{inactive:true,change:true},error:{error:true,change:true},laterBackoff:{error:true,later:true},leased:{leased:true},oldSeason:{oldSeason:true},completed:{completed:true,checked:true},final:{final:true},pendingFinal:{pendingFinal:true},noPlay:{noPlay:true,details:{no_play:'won_by_forfeit'}},cancelled:{details:{cancelled:true}},limited:{format:'limited_overs'},t20:{format:'t20'},catalogue:{kind:'fixtures'}}))await add(name,opts);
 const due=async(id,last,at)=>(await db.query('select club_selection_private.playhq_results_due($1,$2,$3)::text value',[id,last,at])).rows[0].value;
 assert.equal(await due(normal.id,null,'2026-11-14 09:00+00'),'2026-11-14 09:00:00+00','Reproduces checking after Day 1 while the final day is still ahead');
 const before=(await db.query('select * from club_selection_private.playhq_jobs order by source_id')).rows;
 const fixtureBefore=(await db.query('select * from club_selection_private.fixtures order by id')).rows;
 const connectionsBefore=(await db.query('select * from club_selection_private.playhq_connections order by club_id')).rows;
 const aclBefore=(await db.query("select oid::regprocedure::text signature,proacl::text acl,prosecdef from pg_proc where oid in ('club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz)'::regprocedure,'club_selection_private.schedule_playhq_check()'::regprocedure,'public.playhq_sync_worker(text,jsonb)'::regprocedure) order by signature")).rows;
 await db.exec(patch);
 await t.test('queued checks move to the final finish without touching fixtures, pauses, leases or later backoff',async()=>{
  const after=(await db.query('select * from club_selection_private.playhq_jobs order by source_id')).rows;
  for(let n=0;n<after.length;n++){
   if(changed.has(after[n].source_id)){
    assert.equal(new Date(after[n].due_at).toISOString(),'2099-11-21T09:00:00.000Z');
    assert.deepEqual({...after[n],due_at:before[n].due_at},before[n]);
   }else assert.deepEqual(after[n],before[n]);
  }
  assert.deepEqual((await db.query('select * from club_selection_private.fixtures order by id')).rows,fixtureBefore);
  assert.deepEqual((await db.query('select * from club_selection_private.playhq_connections order by club_id')).rows,connectionsBefore);
 });
 await t.test('weekly and consecutive playing days wait through Day 1 and retry only after the final finish',async()=>{
  const weekly=[{date:'2026-11-14',start:'12:00'},{date:'2026-11-21',start:'12:00'}];
  await db.query('update club_selection_private.fixtures set details=jsonb_set(details,\'{days}\',$2) where id=$1',[normal.id,weekly]);
  for(const at of ['2026-11-14 00:00+00','2026-11-14 09:00+00','2026-11-18 12:00+00','2026-11-21 08:59+00']){
   assert.equal(await due(normal.id,null,at),'2026-11-21 09:00:00+00');
   assert.equal(await due(normal.id,'2026-11-14 09:00+00',at),'2026-11-21 09:00:00+00');
  }
  assert.equal(await due(normal.id,null,'2026-11-21 09:00+00'),'2026-11-21 09:00:00+00');
  assert.equal(await due(normal.id,'2026-11-21 09:00+00','2026-11-21 09:00+00'),'2026-11-21 09:30:00+00');
  assert.equal(await due(normal.id,'2026-11-22 10:00+00','2026-11-22 10:00+00'),'2026-11-22 12:00:00+00');
  assert.equal(await due(normal.id,'2026-12-01 09:00+00','2026-12-01 09:00+00'),'2026-12-02 09:00:00+00');
  await db.query('update club_selection_private.fixtures set details=jsonb_set(details,\'{days}\',$2) where id=$1',[normal.id,[{date:'2026-11-15',start:'12:00',end:'18:30'},{date:'2026-11-14',start:'12:00'}]]);
  assert.equal(await due(normal.id,null,'2026-11-14 09:00+00'),'2026-11-15 07:30:00+00','Uses the final actual date and recorded finish, independent of array order');
 });
 await t.test('summer time, winter time and unknown-start fallback use the final day',async()=>{
  for(const [days,expected] of [[[{date:'2026-10-03',start:'12:00'},{date:'2026-10-04',start:'12:00'}],'2026-10-04 09:00:00+00'],[[{date:'2026-06-01',start:'12:00'},{date:'2026-06-02',start:'12:00'}],'2026-06-02 10:00:00+00'],[[{date:'2026-11-14',start:'12:00'},{date:'2026-11-21'}],'2026-11-21 07:00:00+00']]){
   await db.query('update club_selection_private.fixtures set details=jsonb_set(details,\'{days}\',$2) where id=$1',[normal.id,days]);
   assert.equal(await due(normal.id,null,'2026-01-01 00:00+00'),expected);
  }
 });
 await t.test('early official finals, no-play, completed corrections and single-day formats retain their rules',async()=>{
  assert.equal(await due(records.get('final').id,null,'2026-11-14 09:00+00'),'2026-11-14 09:00:00+00');
  assert.equal(await due(records.get('pendingFinal').id,null,'2026-11-14 09:00+00'),'2026-11-14 09:00:00+00');
  assert.equal(await due(records.get('completed').id,'2026-11-14 09:00+00','2026-11-14 09:00+00'),'2026-11-14 13:00:00+00');
  assert.equal(await due(records.get('noPlay').id,null,'2026-11-14 09:00+00'),'2026-11-15 09:00:00+00');
  for(const name of ['limited','t20'])assert.equal(await due(records.get(name).id,null,'2026-11-14 09:00+00'),'2026-11-14 09:00:00+00');
 });
 await t.test('dispatch and service-role claim reject stale Day 1 jobs but still accept final results',async()=>{
  await db.exec('delete from club_selection_private.playhq_jobs;delete from club_selection_private.playhq_runs;truncate net.requests');
  const pending=await add('stale Day 1',{error:true}),ready=await add('finished final day',{days:[{date:'2020-11-14',start:'12:00'},{date:'2020-11-21',start:'12:00'}]});
  const final=await add('early official final',{final:true});
  const complete=await add('saved completed',{completed:true,checked:true});
  const noPlay=await add('known forfeit',{noPlay:true,details:{no_play:'won_by_forfeit'}});
  await db.exec('select club_selection_private.schedule_playhq_check()');
  const requests=(await db.query('select body from net.requests order by id')).rows;
  assert.equal(requests.length,4,'No worker is dispatched for the unfinished Day 1 result');
  await db.exec("set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}'");
  const claimed=[];
  for(const {body} of requests)claimed.push((await db.query("select public.playhq_sync_worker('claim',$1) value",[body])).rows[0].value.source_id);
  assert.deepEqual(new Set(claimed),new Set([ready.source,final.source,complete.source,noPlay.source]));
  await db.exec('reset role');
  assert.equal((await db.query('select attempts from club_selection_private.playhq_jobs where source_id=$1',[pending.source])).rows[0].attempts,2,'An early job never acquires a provider lease');
  const token='test-final-date-moved';
  const run=(await db.query("insert into club_selection_private.playhq_runs(token_hash) values(encode(extensions.digest($1,'sha256'),'hex')) returning id",[token])).rows[0].id;
  await db.exec("set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}'");
  assert.equal((await db.query("select public.playhq_sync_worker('claim',$1) value",[{run_id:run,token}])).rows[0].value,null,'Claim checks again even for a token already dispatched');
  await db.exec('reset role');
  await db.exec('select club_selection_private.schedule_playhq_check()');
  assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,4,'Repeated dispatch creates no Day 1 requests');
 });
 await t.test('permissions and guarded migration remain intact',async()=>{
  const after=(await db.query("select oid::regprocedure::text signature,proacl::text acl,prosecdef from pg_proc where oid in ('club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz)'::regprocedure,'club_selection_private.schedule_playhq_check()'::regprocedure,'public.playhq_sync_worker(text,jsonb)'::regprocedure) order by signature")).rows;
  assert.deepEqual(after,aclBefore);
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'club_selection_private.playhq_results_due(uuid,timestamptz,timestamptz)','execute') allowed",[role])).rows[0].allowed,false);
  await assert.rejects(db.exec(patch),/Unexpected result timing definition/);
 });
});
