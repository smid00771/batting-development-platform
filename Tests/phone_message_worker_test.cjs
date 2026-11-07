const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('Functions/phone-notifications/index.ts','utf8')).replace(/^import .*;\n/gm,'');
const token='a'.repeat(64);
function harness({failCoaching=false,valid=true,status=201,endpoint='https://fcm.googleapis.com/fake',claimError=false}={}){
 const calls=[],logs=[];let handler,finished=false;
 const job={id:'message-id',lease:'lease',endpoint,keys:{p256dh:'key',auth:'auth'},payload:{body:'New club message'}};
 const db={rpc:async(name,args)=>{
  const action=args.p_action;calls.push({action,data:args.p_data});
  if(action==='config')return {data:{worker_token:token,public_key:'public',private_key:'private'}};
  if(action==='collect_messages')return {data:{queued:finished?0:1}};
  if(action==='claim_messages')return claimError?{error:{code:'test'}}:{data:finished?[]:[job]};
  if(action==='check')return {data:{valid}};
  if(action==='finish'){finished=['sent','404','410','cancelled'].includes(args.p_data.code);return {data:{updated:true}};}
  if(action==='email_pending'||action==='claim')return {data:[]};
  if(action==='collect')return failCoaching?{error:{code:'57014'}}:{data:{pending:0}};
  throw Error('Unexpected action '+action);
 }};
 vm.runInNewContext(source,{Request,Response,URL,Uint8Array,AbortSignal,console:{error:(...args)=>logs.push(args.join(' '))},createClient:()=>db,
  webpush:{generateRequestDetails:(subscription,payload)=>({endpoint:subscription.endpoint,headers:{},body:Buffer.from(payload)})},
  fetch:async url=>{calls.push({action:'push',url});return new Response(null,{status});},
  Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://project.example':key==='SUPABASE_SERVICE_ROLE_KEY'?'test-service':undefined},serve:fn=>handler=fn}});
 return {calls,logs,dispatch:(body={action:'dispatch'},auth=token)=>handler(new Request('https://worker.example',{method:'POST',headers:{'content-type':'application/json','x-club-batting-worker':auth},body:JSON.stringify(body)}))};
}
test('club messages finish before coaching collection, even when that collection times out',async()=>{
 const h=harness({failCoaching:true});let response=await h.dispatch(),body=await response.json();
 assert.equal(response.status,503,'The unrelated failure stays visible to monitoring');assert.equal(body.stage,'coaching_followup');assert.equal(body.sent,1);
 const actions=h.calls.map(x=>x.action);assert.deepEqual(actions.slice(0,6),['config','collect_messages','claim_messages','check','push','finish']);assert.ok(actions.indexOf('finish')<actions.indexOf('collect'));
 response=await h.dispatch();assert.equal((await response.json()).sent,0);assert.equal(h.calls.filter(x=>x.action==='push').length,1,'A retry cannot resend a finished message');assert.deepEqual(h.logs,['Notification worker stage failed: coaching_followup','Notification worker stage failed: coaching_followup']);
});
test('a healthy dispatch still runs the existing email and coaching stages',async()=>{
 const h=harness(),response=await h.dispatch();assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,processed:1,sent:1,deferred:0,cancelled:0});assert.ok(h.calls.some(x=>x.action==='email_pending'));assert.ok(h.calls.some(x=>x.action==='collect'));assert.ok(h.calls.some(x=>x.action==='claim'));
});
test('final permission checks and unsafe endpoints cancel without sending a push',async()=>{
 for(const options of [{valid:false},{endpoint:'https://untrusted.example/push'}]){const h=harness(options);await h.dispatch();assert.equal(h.calls.filter(x=>x.action==='push').length,0);assert.equal(h.calls.find(x=>x.action==='finish').data.code,'cancelled');}
});
test('expired endpoints and transient errors retain the existing finish/retry result',async()=>{
 for(const status of [410,503]){const h=harness({status});await h.dispatch();assert.equal(h.calls.find(x=>x.action==='finish').data.code,String(status));}
});
test('authentication and read-only health checks never collect or deliver messages',async()=>{
 const h=harness();assert.equal((await h.dispatch({},'invalid')).status,401);assert.equal(h.calls.length,0);
 const result=await h.dispatch({action:'health'});assert.equal(result.status,200);assert.deepEqual(h.calls.map(x=>x.action),['config']);
});
test('a claim failure does not pretend that any notification was sent',async()=>{
 const h=harness({claimError:true}),response=await h.dispatch();assert.equal(response.status,503);assert.equal((await response.json()).sent,0);assert.equal(h.calls.filter(x=>x.action==='push').length,0);
});
