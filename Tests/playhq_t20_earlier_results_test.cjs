const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID:uuid}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const timing=fs.readFileSync('Database/playhq_result_timing.sql','utf8');
const patch=fs.readFileSync('Database/playhq_t20_earlier_results.sql','utf8');
test('T20 result checks start earlier without altering completion, other formats or protected jobs',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
  create role anon;create role authenticated;create role service_role;
  create schema club_selection_private;
  create table club_selection_private.access(club_id uuid primary key,status text,timezone text);
  create table club_selection_private.fixtures(id uuid primary key,club_id uuid,details jsonb,slots jsonb,revision int default 1);
  create table club_selection_private.playhq_connections(club_id uuid primary key,active_season_id uuid,polling_enabled boolean,verified_at timestamptz);
  create table club_selection_private.playhq_links(fixture_id uuid,club_id uuid,season_id uuid,match_id uuid,team_id uuid);
  create table club_selection_private.playhq_grade_mappings(club_id uuid,season_id uuid,source_grade_id uuid,team_id uuid);
  create table club_selection_private.playhq_jobs(club_id uuid,kind text,source_id uuid,team_id uuid,due_at timestamptz,checked_at timestamptz,leased_until timestamptz,last_error text,attempts int default 0);
  create table club_selection_private.fixture_result_sources(fixture_id uuid,club_id uuid,source_match_id uuid,no_play text);
  create table public.match_review_scorecards(id uuid default gen_random_uuid(),club_id uuid,source_match_id uuid,scorecard jsonb,created_at timestamptz default now());
  create function club_selection_private.fixtures_enabled(c uuid) returns boolean language sql stable as $$select coalesce((select status='active' from club_selection_private.access where club_id=c),false)$$;
 `);
 await db.exec(timing.split('-- Change only scheduling expressions')[0]);
 const active=fs.readFileSync('Database/playhq_due_batch_visibility.sql','utf8').match(/create or replace function club_selection_private\.playhq_job_active[\s\S]*?revoke all[\s\S]*?;/);
 assert.ok(active);await db.exec(active[0]);
 async function finish(details,day,tz='Australia/Sydney'){
  return (await db.query('select club_selection_private.fixture_day_expected_finish($1,$2,$3)::text value',[details,day,tz])).rows[0].value;
 }
 assert.equal(await finish({format:'t20'},{date:'2026-11-04',start:'17:00'}),'2026-11-04 09:30:00+00','Reproduces the old 8:30 pm first check');
 const fixtures=new Map(),changed=new Set();
 async function add(name,opts={}){
  const c=uuid(),season=uuid(),team=uuid(),source=uuid(),id=uuid();
  const details={format:opts.format||'t20',overs:50,days:[{date:opts.date||'2099-11-04',start:'17:00',...opts.day}],...opts.details};
  await db.query('insert into club_selection_private.access values($1,$2,$3)',[c,opts.inactive?'inactive':'active','Australia/Sydney']);
  await db.query('insert into club_selection_private.playhq_connections values($1,$2,$3,$4)',[c,season,!opts.paused,opts.unverified?null:'2026-01-01T00:00:00Z']);
  await db.query('insert into club_selection_private.fixtures values($1,$2,$3,$4,1)',[id,c,details,[{player:uuid()}]]);
  await db.query('insert into club_selection_private.playhq_links values($1,$2,$3,$4,$5)',[id,c,opts.oldSeason?uuid():season,source,team]);
  const due=opts.earlier?'2099-11-04T08:00:00Z':await finish(details,details.days[0]);
  await db.query('insert into club_selection_private.playhq_jobs values($1,$2,$3,$4,$5,$6,$7,$8,0)',[c,opts.kind||'results',source,team,due,opts.checked?'2026-01-01T00:00:00Z':null,opts.leased?'2099-12-01T00:00:00Z':null,opts.error?'Provider backoff':null]);
  if(opts.completed||opts.noPlay){
   await db.query('insert into club_selection_private.fixture_result_sources values($1,$2,$3,$4)',[id,c,source,opts.noPlay?'abandoned':null]);
   if(opts.completed)await db.query('insert into public.match_review_scorecards(club_id,source_match_id,scorecard) values($1,$2,$3)',[c,source,{status:'completed'}]);
  }
  fixtures.set(name,{id,c,source});if(opts.change)changed.add(source);return id;
 }
 const fid=await add('normal',{change:true});await add('previous check',{change:true,checked:true});
 for(const [name,opts] of Object.entries({paused:{paused:true},unverified:{unverified:true},inactive:{inactive:true},oldSeason:{oldSeason:true},leased:{leased:true},error:{error:true},completed:{completed:true,checked:true},noPlay:{noPlay:true},past:{date:'2020-11-04'},earlier:{earlier:true},cancelled:{details:{cancelled:true}},explicitEnd:{day:{end:'21:00'}},unknownStart:{day:{start:''}},limitedOvers:{format:'limited_overs'},longForm:{format:'long_form'},catalogue:{kind:'fixtures'}}))await add(name,opts);
 const before=(await db.query('select * from club_selection_private.playhq_jobs order by source_id')).rows;
 const beforeFixtures=(await db.query('select * from club_selection_private.fixtures order by id')).rows;
 const beforeConnections=(await db.query('select * from club_selection_private.playhq_connections order by club_id')).rows;
 await db.exec(patch);
 await t.test('only eligible future result jobs move one hour earlier',async()=>{
  const after=(await db.query('select * from club_selection_private.playhq_jobs order by source_id')).rows;
  for(let n=0;n<after.length;n++){
   if(changed.has(after[n].source_id)){
    assert.equal(new Date(before[n].due_at)-new Date(after[n].due_at),3600000);
    assert.deepEqual({...after[n],due_at:before[n].due_at},before[n]);
   }else assert.deepEqual(after[n],before[n]);
  }
  assert.deepEqual((await db.query('select * from club_selection_private.fixtures order by id')).rows,beforeFixtures);
  assert.deepEqual((await db.query('select * from club_selection_private.playhq_connections order by club_id')).rows,beforeConnections);
 });
 await t.test('start times, daylight saving, recorded finishes and other formats',async()=>{
  const cases=[
   [{format:'t20'},{date:'2026-11-04',start:'17:00'},'2026-11-04 08:30:00+00'],
   [{format:'t20'},{date:'2026-06-01',start:'17:00'},'2026-06-01 09:30:00+00'],
   [{format:'t20'},{date:'2026-11-04',start:'10:00'},'2026-11-04 01:30:00+00'],
   [{format:'t20'},{date:'2026-11-04',start:'14:00'},'2026-11-04 05:30:00+00'],
   [{format:'t20'},{date:'2026-11-04',start:'17:00',end:'21:00'},'2026-11-04 10:00:00+00'],
   [{format:'t20'},{date:'2026-11-04',start:'17:00',end:'16:00'},'2026-11-04 08:30:00+00'],
   [{format:'t20'},{date:'2026-11-04'},'2026-11-04 07:00:00+00'],
   [{format:'limited_overs',overs:50},{date:'2026-11-04',start:'10:00'},'2026-11-04 06:25:00+00'],
   [{format:'long_form'},{date:'2026-11-04',start:'10:00'},'2026-11-04 07:00:00+00']
  ];
  for(const [details,day,expected] of cases)assert.equal(await finish(details,day),expected);
 });
 await t.test('first check and half-hour retries until a completed scorecard is saved',async()=>{
  await db.query('update club_selection_private.fixtures set details=$2 where id=$1',[fid,{format:'t20',days:[{date:'2026-11-04',start:'17:00'}]}]);
  const due=async(last,at)=>(await db.query('select club_selection_private.playhq_results_due($1,$2,$3)::text value',[fid,last,at])).rows[0].value;
  assert.equal(await due(null,'2026-11-04 18:00+11'),'2026-11-04 08:30:00+00');
  assert.equal(await due(null,'2026-11-04 19:30+11'),'2026-11-04 08:30:00+00');
  assert.equal(await due('2026-11-04 19:30+11','2026-11-04 19:30+11'),'2026-11-04 09:00:00+00');
  assert.equal(await due('2026-11-04 20:00+11','2026-11-04 20:00+11'),'2026-11-04 09:30:00+00');
  const {c,source}=fixtures.get('normal');
  await db.query('insert into club_selection_private.fixture_result_sources values($1,$2,$3,null)',[fid,c,source]);
  await db.query('insert into public.match_review_scorecards(club_id,source_match_id,scorecard) values($1,$2,$3)',[c,source,{status:'in_progress'}]);
  assert.equal(await due('2026-11-04 20:00+11','2026-11-04 20:00+11'),'2026-11-04 09:30:00+00');
  await db.query('update public.match_review_scorecards set scorecard=$2 where source_match_id=$1',[source,{status:'completed'}]);
  assert.equal(await due('2026-11-04 20:00+11','2026-11-04 20:00+11'),'2026-11-04 13:00:00+00');
 });
 await t.test('helper remains private and migration refuses an unexpected definition',async()=>{
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'club_selection_private.fixture_day_expected_finish(jsonb,jsonb,text)','execute') allowed",[role])).rows[0].allowed,false);
  await assert.rejects(db.exec(patch),/Unexpected T20 result timing definition/);
 });
});
