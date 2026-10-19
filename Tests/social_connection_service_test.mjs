import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=stripTypeScriptTypes(readFileSync(new URL('../Functions/club-social-publish/service.ts',import.meta.url),'utf8'),{mode:'transform'});
const {createService,sha256,seal,unseal}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const club='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',stateId='33333333-3333-4333-8333-333333333333';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-public-key',SUPABASE_SERVICE_ROLE_KEY:'test-service-key',META_APP_ID:'123456',META_APP_SECRET:'test-app-secret'};
const existingScopes=['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish'];
const scopes=[...existingScopes,'business_management'];
const page={id:'9001',name:'Example Club',access_token:'test-page-token',tasks:['MANAGE','CREATE_CONTENT'],instagram_business_account:{id:'9002',username:'example_club'}};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const request=(action,data={},auth=true)=>new Request('https://test.supabase.co/functions/v1/club-social-publish',{method:'POST',headers:{Origin:'https://clubbatting.com','Content-Type':'application/json',...(auth?{Authorization:'Bearer test-user-token'}:{})},body:JSON.stringify({action,...data})});

function setup(options={}){
 const calls=[];
 const fetcher=async(input,init={})=>{
  const url=new URL(input),body=init.body?JSON.parse(init.body):null;
  calls.push({url,init,body});
  if(url.pathname==='/auth/v1/user')return json({id:user});
  if(url.pathname==='/rest/v1/rpc/club_socials_publish_api'){
   assert.equal(init.headers.Authorization,'Bearer test-user-token');
   if(body.p_action==='connection_access')return options.deny?json({message:'Club access denied.'},403):json({allowed:true});
   if(body.p_action==='context')return json({connection:{revision:1,status:'connected'}});
  }
  if(url.pathname==='/rest/v1/rpc/club_socials_connection_check')return json(options.connection);
  if(url.pathname==='/rest/v1/rpc/club_socials_publish_worker'){
   assert.equal(init.headers.Authorization,'Bearer test-service-key');
   if(body.p_action==='oauth_claim')return json({id:stateId,club_id:club});
   if(body.p_action==='oauth_select')return json({id:stateId,club_id:club,encrypted_pages:options.encryptedPages});
   if(['oauth_start','oauth_pages','connect'].includes(body.p_action))return json({});
  }
  if(url.hostname==='graph.facebook.com'){
   assert.equal(init.method||'GET','GET','connection must never publish');
   if(url.pathname==='/v26.0/oauth/access_token')return json({access_token:url.searchParams.has('code')?'test-short-token':'test-long-token'});
   if(url.pathname==='/v26.0/me')return json({id:'8001'});
   if(url.pathname==='/v26.0/me/permissions')return json({data:(options.permissions??scopes).map(permission=>({permission,status:'granted'}))});
   if(url.pathname==='/v26.0/me/accounts')return json({data:options.pages??[page]});
   if(url.pathname==='/v26.0/debug_token')return json({data:{is_valid:true,app_id:env.META_APP_ID,profile_id:page.id,scopes:existingScopes}});
   if(url.pathname==='/v26.0/'+page.id)return json({id:page.id,name:page.name,instagram_business_account:page.instagram_business_account});
  }
  throw Error('Unexpected request: '+url.pathname);
 };
 return {calls,service:createService(env,fetcher)};
}

test('connect requests business-owned Page discovery and binds the state to the signed-in club user',async()=>{
 const {calls,service}=setup();
 const response=await service.handle(request('connect',{club_id:club,return_url:'https://clubbatting.com/app.html'}));
 assert.equal(response.status,200);
 const result=await response.json(),url=new URL(result.url);
 assert.equal(url.origin,'https://www.facebook.com');
 assert.deepEqual(url.searchParams.get('scope').split(','),scopes);
 assert.equal(url.searchParams.get('redirect_uri'),'https://clubbatting.com/social-connect.html');
 assert.equal(url.searchParams.get('auth_type'),'rerequest');
 assert.equal(url.searchParams.get('response_type'),'code');
 const start=calls.find(c=>c.body?.p_action==='oauth_start').body.p_data;
 assert.equal(start.club_id,club);assert.equal(start.user_id,user);
 assert.equal(start.state_hash,await sha256(url.searchParams.get('state')));
 assert.ok(!JSON.stringify(result).includes('test-app-secret'));
});

test('unauthenticated, unauthorised and foreign-return requests cannot start a connection',async()=>{
 for(const [options,data,auth,status] of [[{}, {},false,401],[{deny:true},{club_id:club,return_url:'https://clubbatting.com/app.html'},true,409],[{},{club_id:club,return_url:'https://other.invalid/app.html'},true,400]]){
  const {calls,service}=setup(options);
  assert.equal((await service.handle(request('connect',data,auth))).status,status);
  assert.ok(!calls.some(c=>c.body?.p_action==='oauth_start'));
  assert.ok(!calls.some(c=>c.url.hostname==='graph.facebook.com'));
 }
});

test('discovery returns only Pages with publishing tasks and keeps credentials encrypted on the server',async()=>{
 const {calls,service}=setup({pages:[page,{...page,id:'9003',tasks:['ANALYZE']},{...page,id:'9004',access_token:null}]});
 const response=await service.handle(request('oauth_complete',{state:'test-state',code:'test-code'}));
 assert.equal(response.status,200);
 const result=await response.json();
 assert.deepEqual(result,{id:stateId,pages:[{id:page.id,name:page.name,instagram_name:'example_club'}],instagram_permission:true});
 const saved=calls.find(c=>c.body?.p_action==='oauth_pages').body.p_data;
 assert.equal(saved.user_id,user);assert.equal(saved.meta_user_id,'8001');
 assert.deepEqual(await unseal(saved.encrypted_pages,env.META_APP_SECRET,'oauth:'+stateId),[page]);
 assert.ok(!saved.encrypted_pages.includes(page.access_token));
 assert.ok(!JSON.stringify(result).includes('token'));
 const graph=calls.find(c=>c.url.pathname==='/v26.0/me/accounts');
 assert.equal(graph.init.headers.Authorization,'Bearer test-long-token');
 assert.match(graph.url.searchParams.get('fields'),/access_token,tasks/);
});

test('empty lists explain missing business consent or the selected business and Page',async()=>{
 for(const [permissions,message] of [[existingScopes,/allow access to the business/],[scopes,/select the club’s business and Page/]]){
  const {calls,service}=setup({permissions,pages:[]});
  const response=await service.handle(request('oauth_complete',{state:'test-state',code:'test-code'}));
  assert.equal(response.status,409);assert.match((await response.json()).error,message);
  assert.ok(!calls.some(c=>['oauth_pages','connect'].includes(c.body?.p_action)));
 }
});

test('directly managed Pages still connect if business access is declined, but missing publishing permission is rejected',async()=>{
 const accepted=setup({permissions:existingScopes});
 assert.equal((await accepted.service.handle(request('oauth_complete',{state:'test-state',code:'test-code'}))).status,200);
 const denied=setup({permissions:scopes.filter(s=>s!=='pages_manage_posts')});
 assert.equal((await denied.service.handle(request('oauth_complete',{state:'test-state',code:'test-code'}))).status,409);
 assert.ok(!denied.calls.some(c=>c.url.pathname==='/v26.0/me/accounts'));
});

test('only a Page returned in this OAuth state can be saved, encrypted for the selected club',async()=>{
 const encryptedPages=await seal([page],env.META_APP_SECRET,'oauth:'+stateId);
 const {calls,service}=setup({encryptedPages});
 const chosen=await service.handle(request('choose_page',{id:stateId,page_id:page.id}));
 assert.equal(chosen.status,200);assert.equal((await chosen.json()).connected,true);
 const saved=calls.find(c=>c.body?.p_action==='connect').body.p_data;
 assert.equal(saved.page_id,page.id);assert.equal(saved.instagram_id,'9002');
 assert.deepEqual(await unseal(saved.credential,env.META_APP_SECRET,'club:'+club),{page_token:page.access_token});
 await assert.rejects(unseal(saved.credential,env.META_APP_SECRET,'club:other-club'));
 const forged=setup({encryptedPages});
 assert.equal((await forged.service.handle(request('choose_page',{id:stateId,page_id:'9999'}))).status,400);
 assert.ok(!forged.calls.some(c=>c.body?.p_action==='connect'));
});

test('existing Page-token health remains ready without business_management on that Page token',async()=>{
 const connection={club_id:club,status:'connected',page_id:page.id,instagram_id:'9002',instagram_name:'example_club',credential:await seal({page_token:page.access_token},env.META_APP_SECRET,'club:'+club)};
 const {service}=setup({connection});
 const response=await service.handle(request('check_connection',{club_id:club}));
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.health.facebook.state,'ready');assert.equal(result.health.instagram.state,'ready');
 assert.ok(!JSON.stringify(result).includes(page.access_token));
});
