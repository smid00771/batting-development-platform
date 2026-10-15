const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const code=stripTypeScriptTypes(fs.readFileSync(new URL('../Functions/club-social-prepare/index.ts','file://'+__filename),'utf8'));
const c=vm.createContext({Deno:{serve(){},env:{get:()=>''}},Response,Request,Headers,AbortSignal,console,btoa,atob,fetch(){throw Error('Network disabled in tests');}});vm.runInContext(code,c);
test('provider access check does not generate an image and reports a real access failure',async()=>{
 let calls=[];c.fetch=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({error:{message:'Incorrect API key: secret-value'}}),{status:401});};
 const status=await c.providerStatus('test-key','image-model');assert.equal(status.available,false);assert.match(status.error,/credentials.*401/);assert.doesNotMatch(status.error,/secret-value/);assert.equal(calls.length,1);assert.match(calls[0].url,/\/models\/image-model$/);assert.equal(calls[0].options.method,undefined);assert.equal(calls[0].options.body,undefined);
 c.fetch=async()=>new Response('{}');assert.equal((await c.providerStatus('test','image-model')).available,true);
});
test('provider error categories distinguish verification, model access and billing',()=>{
 assert.match(c.providerError(403,{error:{message:'Your organization must be verified'}}),/verification/);assert.match(c.providerError(404,{}),/model/);assert.match(c.providerError(429,{error:{code:'insufficient_quota'}}),/billing/);assert.match(c.providerError(429,{}),/busy/);
});
test('background revisions preserve the previous version and give the requested heading move priority',()=>{
 const prompt=c.prompt('master','Move Results lower',true);assert.match(prompt,/Apply only the requested changes/);assert.match(prompt,/preserve every other part/);assert.match(prompt,/Move Results lower/);assert.doesNotMatch(prompt,/upper 23 percent|Remove variable player/);
 const initial=c.prompt('master','Remove the sponsors',false);assert.match(initial,/specific design changes take priority/);assert.match(initial,/Remove the sponsors/);assert.match(c.prompt('photo','Clean the hair edges',true),/exact face/);
});
test('saved background edits reach the provider as a small edit, while Results templates remove stale outcomes',async()=>{
 const id='00000000-0000-4000-8000-000000000001',club='00000000-0000-4000-8000-000000000002',png=new Uint8Array(25);png.set([137,80,78,71,13,10,26,10]);const requests=[],finished=[];
 c.fetch=async(url,options={})=>{
  if(url.endsWith('/rpc/club_socials_prepare_worker')){const body=JSON.parse(options.body);if(body.p_action==='claim')return new Response(JSON.stringify({claimed:true,id,club_id:club,kind:'master',brief:'Results is too high',source_bucket:'club-social-prep',source_path:club+'/source/'+id+'.png'}));finished.push(body);return new Response('{"accepted":true}');}
  if(url==='https://api.openai.com/v1/images/edits'){requests.push(JSON.parse(options.body));return new Response(JSON.stringify({data:[{b64_json:Buffer.from(png).toString('base64')}]}));}
  if(options.method==='POST')return new Response('{}');
  return new Response(png);
 };
 await c.prepare('https://db.test','test-service','test-key','test-model',id,'edit','results');
 assert.equal(requests.length,1);assert.match(requests[0].prompt,/Apply only the requested changes/);assert.match(requests[0].prompt,/Move only that heading/);assert.match(requests[0].prompt,/1–2%/);assert.doesNotMatch(requests[0].prompt,/Remove variable player|Remove all old WIN/);assert.equal(finished[0].p_data.path,club+'/result/'+id+'.png');
 await c.prepare('https://db.test','test-service','test-key','test-model',id,'template','results');
 assert.match(requests[1].prompt,/Remove all old WIN, DEF, LOSS/);assert.match(requests[1].prompt,/verified PlayCricket results/);assert.match(requests[1].prompt,/Move only that heading/);
});
