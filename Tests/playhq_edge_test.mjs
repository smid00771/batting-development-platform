import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'service-test'})[name]},serve:fn=>handler=fn};
await import('../Functions/playhq-sync/index.ts');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const request=body=>new Request('https://test.supabase.co/functions/v1/playhq-sync',{method:'POST',headers:{authorization:'Bearer user-test','content-type':'application/json'},body:JSON.stringify(body)});
const club='2a11b05e-101c-4196-a4ef-8c446635cd8f',association='0f318d4d-b0f1-4251-81e2-f909a2b1b295';
test('authorisation precedes credential access and provider request',async()=>{
 const calls=[];globalThis.fetch=async(url,opts)=>{calls.push(url);assert.equal(opts.headers.Authorization,'Bearer user-test');return json({message:'Club Admin or selector access required'},403);};
 const result=await handler(request({action:'seasons',club_id:club}));assert.equal(result.status,400);assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/playhq_sync_api'));
});
test('seasons use association ID and public headers; key never returned',async()=>{
 const calls=[];globalThis.fetch=async(url,opts)=>{
  calls.push(String(url));
  if(String(url).endsWith('/playhq_sync_api'))return json({configured:true});
  if(String(url).endsWith('/playhq_sync_worker')){const b=JSON.parse(opts.body);assert.equal(opts.headers.Authorization,'Bearer service-test');return json(b.p_action==='connection'?{key:'club-secret-test',association_id:association,organisation_id:club,generation:'version'}:{verified:true});}
  assert.equal(String(url),`https://api.playhq.com/v1/organisations/${association}/seasons`);assert.equal(opts.headers.Authorization,undefined);assert.equal(opts.headers['x-api-key'],'club-secret-test');return json({data:[],metadata:{hasMore:false,nextCursor:null}});
 };
 const response=await handler(request({action:'seasons',club_id:club}));const body=await response.text();assert.equal(response.status,200);assert.deepEqual(JSON.parse(body),{seasons:[]});assert.ok(!body.includes('secret'));assert.equal(calls.length,4);
});
test('scheduled request without token cannot claim work',async()=>{
 globalThis.fetch=async()=>{throw Error('Must not call backend');};
 assert.equal((await handler(request({action:'run'}))).status,403);
});
test('season discovery enriches grade names and stores only this club’s source teams on the server',async()=>{
 const season='11111111-1111-4111-8111-111111111111',grade='22222222-2222-4222-8222-222222222222',team='33333333-3333-4333-8333-333333333333';let stored;
 globalThis.fetch=async(url,opts)=>{
  const endpoint=String(url);
  if(endpoint.endsWith('/playhq_sync_api'))return json({configured:true});
  if(endpoint.endsWith('/playhq_sync_worker'))return json({key:'club-secret-test',association_id:association,organisation_id:club,generation:'version'});
  if(endpoint.endsWith('/playhq_store_teams')){stored=JSON.parse(opts.body);assert.equal(opts.headers.Authorization,'Bearer service-test');return json({catalogue_id:'catalogue',teams:stored.p_teams});}
  return json({data:endpoint.endsWith('/teams')?[{id:team,club:{id:club},grade:{id:grade}},{id:'other',club:{id:association},grade:{id:grade}}]:[{id:grade,name:'Club competition grade'}],metadata:{hasMore:false,nextCursor:null}});
 };
 const response=await handler(request({action:'teams',club_id:club,season_id:season})),body=await response.json();assert.equal(response.status,200);assert.equal(stored.p_teams.length,1);assert.equal(stored.p_teams[0].grade.name,'Club competition grade');assert.equal(stored.p_season_id,season);assert.equal(body.catalogue_id,'catalogue');assert.ok(!JSON.stringify(body).includes('club-secret'));
});
test('provider denial is recorded once without a retry or leaking diagnostics',async()=>{
 let upstream=0,errors=0;globalThis.fetch=async(url,opts)=>{
  if(String(url).endsWith('/playhq_sync_api'))return json({configured:true});
  if(String(url).endsWith('/playhq_sync_worker')){const b=JSON.parse(opts.body);if(b.p_action==='error'){errors++;assert.equal(b.p_data.status,403);return json({saved:true});}return json({key:'club-secret-test',association_id:association,generation:'version'});}
  upstream++;return new Response('sensitive upstream diagnostics',{status:403});
 };
 const response=await handler(request({action:'seasons',club_id:club}));assert.equal(response.status,403);assert.ok(!(await response.text()).includes('diagnostics'));assert.equal(upstream,1);assert.equal(errors,1);
});

test('scheduled season refresh uses its lease and stores club teams before completing',async()=>{
 const season='11111111-1111-4111-8111-111111111111',grade='22222222-2222-4222-8222-222222222222';let saved=false,finished=false;
 globalThis.fetch=async(url,opts)=>{
  const endpoint=String(url);
  if(endpoint.endsWith('/playhq_sync_worker')){const b=JSON.parse(opts.body);assert.equal(opts.headers.Authorization,'Bearer service-test');
   if(b.p_action==='claim')return json({club_id:club,kind:'season',source_id:season,team_id:club,lease_id:'lease'});
   if(b.p_action==='connection')return json({key:'club-secret-test',association_id:association,organisation_id:club,generation:'version'});
   if(b.p_action==='finish'){assert.ok(saved);assert.equal(b.p_data.job.lease_id,'lease');assert.equal(b.p_data.result.teams.length,1);finished=true;return json({saved:true});}
   throw Error('Unexpected worker action');
  }
  if(endpoint.endsWith('/playhq_store_teams')){saved=true;const b=JSON.parse(opts.body);assert.equal(b.p_club_id,club);return json({teams:b.p_teams});}
  return json({data:endpoint.endsWith('/teams')?[{id:grade,club:{id:club},grade:{id:grade}},{id:club,club:{id:association}}]:[{id:grade,name:'First XI'}],metadata:{hasMore:false,nextCursor:null}});
 };
 const response=await handler(request({action:'run',run_id:'run',token:'a'.repeat(64)}));assert.equal(response.status,200);assert.ok(finished);assert.deepEqual(await response.json(),{checked:1});
});
