const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const code=stripTypeScriptTypes(fs.readFileSync(new URL('../Functions/club-social-prepare/index.ts','file://'+__filename),'utf8'));
const c=vm.createContext({Deno:{serve(){},env:{get:()=>''}},Response,Request,Headers,AbortSignal,console,fetch(){throw Error('Network disabled in tests');}});vm.runInContext(code,c);
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
