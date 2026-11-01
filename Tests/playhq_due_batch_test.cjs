const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID:uuid}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
test('due work is bounded, eligible, deduplicated and individually leased',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('Tests/fixtures/playhq_batch_325_baseline.sql','utf8'));
 await db.exec(fs.readFileSync('Database/playhq_due_batch_visibility.sql','utf8'));
 const club=uuid(),season=uuid(),team=uuid();
 await db.query("insert into club_selection_private.access values($1,'active')",[club]);
 await db.query("insert into club_selection_private.playhq_connections values($1,$2,true,now(),$3)",[club,season,uuid()]);
 async function job(kind,due="now()-interval '1 minute'",extra={}){
  const source=uuid(),fixture=uuid(),sid=extra.season||season;
  await db.query("insert into club_selection_private.playhq_jobs(club_id,kind,source_id,team_id,due_at,leased_until,last_error) values($1,$2,$3,$4,"+due+",$5,$6)",[club,kind,source,team,extra.lease||null,extra.error||null]);
  if(kind==='results')await db.query("insert into club_selection_private.playhq_links(fixture_id,club_id,season_id,match_id,team_id) values($1,$2,$3,$4,$5)",[fixture,club,sid,source,team]);
  if(kind==='fixtures')await db.query("insert into club_selection_private.playhq_grade_mappings values($1,$2,$3,$4)",[club,sid,source,team]);
  return source;
 }
 const fixture=await job('fixtures',"now()-interval '1 day'"),due=[];
 for(let n=0;n<6;n++)due.push(await job('results'));
 await job('results',"now()+interval '1 day'");await job('results',undefined,{season:uuid()});
 await job('results',undefined,{lease:new Date(Date.now()+300000).toISOString()});
 await job('results',"now()+interval '1 hour'",{error:'Provider backoff'});
 for(let n=0;n<5;n++)await job('fixtures');
 await db.exec('select club_selection_private.schedule_playhq_check()');
 const first=(await db.query('select body from net.requests order by id')).rows;
 assert.equal(first.length,8,'One tick sends at most eight due jobs');
 await db.exec('select club_selection_private.schedule_playhq_check()');
 assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,8,'Waiting tokens prevent duplicate dispatch');
 const claimed=[];
 await db.exec("set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}'");
 for(const {body} of first){
  const j=(await db.query("select public.playhq_sync_worker('claim',$1::jsonb) j",[JSON.stringify(body)])).rows[0].j;
  claimed.push(j);
 }
 assert.equal(new Set(claimed.map(j=>j.source_id)).size,8,'Each worker claims a different lease');
 assert.deepEqual(new Set(claimed.slice(0,6).map(j=>j.source_id)),new Set(due),'All due results precede catalogue work');
 assert.ok(claimed.every(j=>j.lease_id&&j.attempts===1));
 await assert.rejects(db.query("select public.playhq_sync_worker('claim',$1::jsonb)",[JSON.stringify(first[0].body)]),/Invalid scheduled check token/);
 await db.exec('reset role;select club_selection_private.schedule_playhq_check()');
 assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,12,'Only the remaining four eligible jobs dispatch');
 await db.exec("delete from club_selection_private.playhq_runs;update club_selection_private.playhq_connections set polling_enabled=false");
 await db.exec('select club_selection_private.schedule_playhq_check()');
 assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,12,'Paused connections create no requests');
 await db.exec("update club_selection_private.playhq_connections set polling_enabled=true;update club_selection_private.access set status='inactive'");
 await db.exec('select club_selection_private.schedule_playhq_check()');
 assert.equal((await db.query('select count(*)::int n from net.requests')).rows[0].n,12,'Inactive entitlement creates no requests');
 await db.exec("set role authenticated;set request.jwt.claims='{\"role\":\"authenticated\"}'");
 await assert.rejects(db.query("select public.playhq_sync_worker('claim','{}')"),/permission denied/);
 await assert.rejects(db.query("select club_selection_private.schedule_playhq_check()"),/permission denied/);
 await db.exec('reset role');
 for(const role of ['anon','authenticated','service_role']){
  assert.equal((await db.query("select has_function_privilege($1,'club_selection_private.playhq_job_active(uuid,text,uuid,uuid,uuid)','execute') allowed",[role])).rows[0].allowed,false);
 }
});
