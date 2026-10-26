const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('Functions/dispatch-outbox/index.ts','utf8').replace(/^import .*;\n/gm,''));
const renderer=fs.readFileSync('Functions/dispatch-outbox/assist-email.mjs','utf8').replace(/^export /gm,'');
const id='11111111-1111-4111-8111-111111111111',thread='22222222-2222-4222-8222-222222222222',club='33333333-3333-4333-8333-333333333333';
function setup({alert={deliver:true,thread_id:thread,club_id:club,side:'team',recipient_email:'member@example.test'},alertError=null,template='mirelion_assist',providerStatus=200}={}){
 const row={id,recipient_email:'forged@example.test',payload:{body:'PRIVATE CONTENT',thread_id:'untrusted'},template_key:template,subject:'PRIVATE SUBJECT',created_at:new Date().toISOString(),sent_at:null,failed_at:null,cancelled_at:null,processing_at:null};
 const sent=[],rpcCalls=[];let handler;
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test-anon',SUPABASE_SERVICE_ROLE_KEY:'test-service',RESEND_API_KEY:'test-provider',APP_PUBLIC_URL:'https://clubbatting.com/',OUTBOX_WEBHOOK_TOKEN:'test-webhook-token-at-least-32-characters'};
 function query(table){
  let changes=null,filters=[],one=false,selected=false;
  const q={select(){selected=true;return q;},update(data){changes=data;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v);},lt(k,v){filters.push(r=>r[k]!=null&&r[k]<v);return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},order(){return q;},limit(){return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},then(resolve,reject){
   try{
    if(table==='platform_settings')return Promise.resolve({data:{email_mode:'live',email_from_name:'Club Batting',email_from_address:'notifications@clubbatting.com',email_live_from:'2020-01-01T00:00:00Z'}}).then(resolve,reject);
    assert.equal(table,'outbound_messages');const matches=filters.every(f=>f(row));
    if(matches&&changes)Object.assign(row,changes);
    const rows=matches?[structuredClone(row)]:[];
    return Promise.resolve({data:one?(rows[0]||null):selected?rows:null}).then(resolve,reject);
   }catch(e){return Promise.reject(e).then(resolve,reject);}
  }};return q;
 }
 const service={from:query,rpc:async(name,args)=>{rpcCalls.push({name,args});return name==='mirelion_assist_email'?{data:alert,error:alertError}:{data:null};}};
 const user={auth:{getUser:async()=>({data:{user:{id:'regular-member'}}})},rpc:async()=>({data:null})};
 vm.runInNewContext('const renderAssistNotification=(()=>{'+renderer+';return renderAssistNotification;})();\n'+source,{URL,Response,Request,AbortSignal,Error,Date,console,setTimeout,crypto:globalThis.crypto,
  Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},createClient:(url,key)=>key===env.SUPABASE_SERVICE_ROLE_KEY?service:user,
  fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent.push({body:JSON.parse(options.body),headers:options.headers,signal:options.signal});return new Response(JSON.stringify(providerStatus===200?{id:'provider-result'}:{message:'Try again'}),{status:providerStatus});}
 });
 return {row,sent,rpcCalls,invoke:async(token='test-service',body={action:'dispatch',template_key:template})=>{const response=await handler(new Request('https://example.supabase.co/functions/v1/dispatch-outbox',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};}};
}
test('Assist sends only the private canonical recipient and conversation link',async()=>{
 const h=setup(),r=await h.invoke();assert.equal(r.status,200);assert.equal(r.body.sent,1);assert.equal(h.sent.length,1);
 const mail=h.sent[0];assert.deepEqual(mail.body.to,['member@example.test']);assert.equal(mail.body.from,'Mirelion Assist <notifications@clubbatting.com>');assert.equal(mail.body.reply_to,'support@mirelionhq.com');assert.ok(mail.signal);
 assert.equal(mail.headers['Idempotency-Key'],'bdp-'+id);assert.match(mail.body.text,new RegExp('assist_thread='+thread));assert.match(mail.body.text,/tab=assist/);assert.doesNotMatch(JSON.stringify(mail.body),/PRIVATE|forged|untrusted/);assert.ok(h.row.sent_at);assert.equal(h.row.processing_at,null);
});
test('club messages alert the support inbox with a Platform Admin link',async()=>{
 const h=setup({alert:{deliver:true,thread_id:thread,side:'club',recipient_email:'support@mirelionhq.com'}});await h.invoke();
 assert.deepEqual(h.sent[0].body.to,['support@mirelionhq.com']);assert.match(h.sent[0].body.text,/platform=1&assist_thread=/);
});
test('already-read or unauthorised messages are cancelled without provider contact',async()=>{
 const h=setup({alert:{}});await h.invoke();assert.equal(h.sent.length,0);assert.ok(h.row.cancelled_at);assert.equal(h.row.processing_at,null);
});
test('unavailable private validation defers instead of using untrusted outbox fields',async()=>{
 const h=setup({alertError:{message:'Unavailable'}}),r=await h.invoke();assert.equal(r.body.deferred,1);assert.equal(h.sent.length,0);assert.equal(h.row.failed_at,null);assert.equal(h.row.processing_at,null);
});
test('provider throttling retains the same idempotency key for the next retry',async()=>{
 const h=setup({providerStatus:429});for(let i=0;i<2;i++){const r=await h.invoke();assert.equal(r.body.deferred,1);assert.equal(h.row.processing_at,null);assert.equal(h.row.failed_at,null);}
 assert.equal(h.sent.length,2);assert.equal(h.sent[0].headers['Idempotency-Key'],h.sent[1].headers['Idempotency-Key']);
});
test('existing generic notifications retain their sender and do not use Assist validation',async()=>{
 const h=setup({template:'existing_generic'}),r=await h.invoke('test-service',{action:'dispatch'});assert.equal(r.body.sent,1);assert.equal(h.sent[0].body.from,'Club Batting <notifications@clubbatting.com>');assert.equal(h.sent[0].body.reply_to,undefined);assert.equal(h.rpcCalls.some(x=>x.name==='mirelion_assist_email'),false);
});
test('unauthenticated and regular club callers cannot dispatch email',async()=>{
 const h=setup();assert.equal((await h.invoke('')).status,401);assert.equal((await h.invoke('member-token')).status,403);assert.equal(h.sent.length,0);
});
test('authenticated status verifies the public app URL without sending email',async()=>{
 const h=setup(),r=await h.invoke('test-webhook-token-at-least-32-characters',{action:'status'});assert.equal(r.status,200);assert.equal(r.body.public_app_url,'https://clubbatting.com/');assert.equal(r.body.auth_mode,'webhook_token');assert.equal(h.sent.length,0);
});
