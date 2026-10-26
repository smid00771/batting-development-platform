import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sharedScorecard} from '../Functions/playhq-sync/shared-scorecard.mjs';
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

test('an existing check lease returns a useful retry response without exposing arbitrary database errors',async()=>{
 for(const message of ['A check is already running. Try again shortly','Wait 30 seconds before checking again','private SQL diagnostic club-secret-test']){
  globalThis.fetch=async(url,opts)=>{
   if(String(url).endsWith('/playhq_sync_api'))return json({configured:true});
   const b=JSON.parse(opts.body);if(b.p_action==='connection')return json({key:'club-secret-test',generation:'version'});
   assert.equal(b.p_action,'claim_fixture');return json({code:'P0001',message},400);
  };
  const r=await handler(request({action:'check',club_id:club,fixture_id:'fixture',kind:'results'})),body=await r.text();
  assert.equal(r.status,message.startsWith('private')?400:409);assert.ok(!body.includes('club-secret-test'));
  if(message.startsWith('A check'))assert.match(body,/five minutes/);
  if(message.startsWith('Wait'))assert.match(body,/30 seconds/);
 }
});

test('Socials logo access is checked before reading a snapshot, credentials or provider data',async()=>{
 const calls=[];globalThis.fetch=async(url,opts)=>{calls.push(String(url));assert.equal(opts.headers.Authorization,'Bearer user-test');assert.equal(JSON.parse(opts.body).p_action,'settings');return json({message:'Socials access required'},403);};
 const r=await handler(request({action:'logos',club_id:club,snapshot_id:'snapshot'}));
 assert.equal(r.status,400);assert.deepEqual(calls,['https://test.supabase.co/rest/v1/rpc/club_social_awards_api']);
});

test('logos use the authorised stored match and paginated season, never browser source IDs',async()=>{
 const season='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',grade='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',match='cccccccc-cccc-4ccc-8ccc-cccccccccccc',source='dddddddd-dddd-4ddd-8ddd-dddddddddddd',logo='https://res.cloudinary.com/playhq/image/upload/v1/test.png';
 let pages=0;
 globalThis.fetch=async(url,opts)=>{
  const endpoint=String(url);
  if(endpoint.endsWith('/club_social_awards_api'))return json({enabled:['results']});
  if(endpoint.endsWith('/playhq_logo_context')){assert.equal(opts.headers.Authorization,'Bearer service-test');assert.deepEqual(JSON.parse(opts.body),{p_club_id:club,p_snapshot_id:'saved-snapshot'});return json({season_id:season,grade_id:grade,match_id:match,teams:[{id:'saved-team',source_team_id:source}]});}
  if(endpoint.endsWith('/playhq_sync_worker'))return json({key:'club-secret-test',generation:'logo-generation'});
  assert.equal(opts.headers.Authorization,undefined);assert.equal(opts.headers['x-api-key'],'club-secret-test');
  if(endpoint.endsWith('/summary')){assert.ok(endpoint.includes(match));return json({data:{id:match,gradeId:grade,teams:[{id:source,organisation:{id:association}}]}});}
  pages++;assert.ok(endpoint.includes('/seasons/'+season+'/teams'));
  return pages===1?json({data:[],metadata:{hasMore:true,nextCursor:'next'}}):json({data:[{id:'different-season-team',club:{id:association,logo:{sizes:[{url:logo}]}}}],metadata:{hasMore:false}});
 };
 const r=await handler(request({action:'logos',club_id:club,snapshot_id:'saved-snapshot',match_id:'untrusted',season_id:'untrusted'})),body=await r.text();
 assert.equal(r.status,200);assert.equal(pages,2);assert.equal(JSON.parse(body).teams[0].id,'saved-team');assert.equal(JSON.parse(body).teams[0].logo_url,logo);assert.ok(!body.includes('club-secret'));assert.ok(!body.includes('players'));
});

test('unlinked or cross-club snapshots stop before credential access',async()=>{
 let calls=0;globalThis.fetch=async(url)=>{calls++;if(String(url).endsWith('/club_social_awards_api'))return json({});assert.ok(String(url).endsWith('/playhq_logo_context'));return json({message:'Linked scorecard unavailable'},400);};
 const r=await handler(request({action:'logos',club_id:club,snapshot_id:'other-club-snapshot'}));assert.equal(r.status,400);assert.equal(calls,2);
});

test('future imports retain all score identities and figures; failed artwork does not stop scores',async()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/playhq/summary-v2.json',import.meta.url),'utf8'));
 const season='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',context={season_id:season,timezone:'Australia/Melbourne',source_fixture:{source_match_id:raw.data.id,source_grade_id:raw.data.gradeId,source_team_id:raw.data.teams[0].id,format:'t20',days:[{date:'2023-11-25'}]}};
 const before=await sharedScorecard(raw,context);
 for(const fail of [false,true]){
  let saved;
  globalThis.fetch=async(url,opts)=>{
   const endpoint=String(url);
   if(endpoint.endsWith('/playhq_sync_api'))return json({});
   if(endpoint.endsWith('/playhq_sync_worker')){
    const b=JSON.parse(opts.body);
    if(b.p_action==='connection')return json({key:'club-secret-test',generation:'import-logos-'+fail});
    if(b.p_action==='claim_fixture')return json({kind:'results',source_id:raw.data.id,team_id:raw.data.teams[0].id});
    if(b.p_action==='scorecard_context')return json(context);
    if(b.p_action==='finish'){saved=b.p_data.result.shared_scorecard;return json({saved:true});}
    throw Error('Unexpected action '+b.p_action);
   }
   if(endpoint.endsWith('/summary'))return json(raw);
   if(fail)return json({},503);
   return json({data:raw.data.teams.map(t=>({id:t.id,grade:{id:raw.data.gradeId},club:{id:t.organisation.id,logo:{sizes:[{url:'https://assets.playhq.com/ca/test/logo.png'}]}}})),metadata:{hasMore:false}});
  };
  const r=await handler(request({action:'check',club_id:club,fixture_id:'fixture',kind:'results'}));assert.equal(r.status,200);
  assert.equal(saved.match_id,before.match_id);assert.deepEqual(saved.innings,before.innings);assert.deepEqual(saved.teams.map(t=>[t.id,t.players]),before.teams.map(t=>[t.id,t.players]));
  assert.equal(!!saved.teams[0].logo_url,!fail);
 }
});
