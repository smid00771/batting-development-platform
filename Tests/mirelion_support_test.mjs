import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {prepareSupportReply,directHandoff} from '../Functions/mirelion-support/assistant.mjs';
import {articleById} from '../Functions/mirelion-support/knowledge.mjs';
import {verifyEmailWebhook,incomingSupportEmail,supportEmailPayload} from '../Functions/mirelion-support/email.mjs';
import {createSupportHandler} from '../Functions/mirelion-support/worker.mjs';

const job=body=>({subject:'Help',category:'help',messages:[{side:'club',body}],auto_replies:0});
const model=(plan,inspect=()=>{})=>async(url,options)=>{inspect(url,JSON.parse(options.body));return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}]});};
const keys={key:'fictional-model-key',model:'configured-model'};
test('routine support uses reviewed words; the model has no action tools or reply field',async()=>{
 const result=await prepareSupportReply(job('How do I get the form flags?'),{...keys,fetcher:model({action:'answer',reason:'routine',topics:['selection_analysis']},(url,body)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(body.store,false);assert.equal(body.tools,undefined);
  assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.properties.body,undefined);
  assert.match(body.instructions,/untrusted customer data/);
 })});
 assert.equal(result.kind,'reply');assert.ok(result.body.startsWith(articleById.get('selection_analysis').answer));
 assert.match(result.body,/no meeting to start or end/);
});
test('requests for people, faults, disputes, account changes and suggestions go directly to people',async()=>{
 for(const body of ['A real person please','Can I speak to someone?','It still does not work','The selection board is frozen','I was charged twice','Delete my account','Privacy complaint','We have an urgent issue']){
  let calls=0;const result=await prepareSupportReply(job(body),{...keys,fetcher:()=>{calls++;throw Error('Must not call');}});
  assert.equal(result.kind,'handoff',body);assert.equal(calls,0,body);
 }
 assert.equal(directHandoff({...job('Add a feature'),category:'idea'}),'change_request');
});
test('unknown topics, an uncertain answer, repeated instructions and exhausted turns hand over',async()=>{
 for(const plan of [{action:'answer',reason:'routine',topics:['invented']},{action:'answer',reason:'uncertain',topics:['phone_install']},{action:'answer',reason:'routine',topics:[]},{action:'handoff',reason:'account',topics:[]}]){
  assert.equal((await prepareSupportReply(job('Help'),{...keys,fetcher:model(plan)})).kind,'handoff');
 }
 assert.equal((await prepareSupportReply({...job('How to install?'),previous_topics:['phone_install']},{...keys,fetcher:model({action:'answer',reason:'routine',topics:['phone_install']})})).kind,'handoff');
 assert.equal((await prepareSupportReply({...job('Help'),auto_replies:3},{})).reason,'limit');
});
test('missing configuration, refusal, timeout and invalid model output retain human support',async()=>{
 assert.equal((await prepareSupportReply(job('Help'),{})).kind,'handoff');
 for(const fetcher of [async()=>Response.json({}, {status:429}),async()=>Response.json({output:[]}),async()=>{throw Error('Timeout');},async()=>Response.json({status:'incomplete',output:[]})]){
  assert.equal((await prepareSupportReply(job('Help'),{...keys,fetcher})).kind,'handoff');
 }
});

const provider='10000000-0000-4000-8000-000000000001';
const email=()=>({id:provider,from:'Fictional Member <member@example.invalid>',to:['support@mirelionhq.com'],subject:'Help',text:'How do I set availability?',message_id:'<a@example.invalid>',headers:{},authentication:{dmarc:'pass'},attachments:[]});
const emailOptions={providerId:provider,allowedRecipients:['support@mirelionhq.com']};
test('incoming email is scoped to allowed recipients, signed-provider identity and plain text',()=>{
 const result=incomingSupportEmail(email(),emailOptions);assert.equal(result.sender_email,'member@example.invalid');assert.equal(result.authenticated,true);assert.equal(result.attachments,false);
 assert.equal(incomingSupportEmail({...email(),to:['enquiries@mirelionhq.com']},emailOptions),null);
 assert.equal(incomingSupportEmail(email(),{...emailOptions,allowedRecipients:[]}),null);
 assert.throws(()=>incomingSupportEmail({...email(),id:'wrong'},emailOptions));
 for(const change of [{from:'notifications@clubbatting.com'},{from:'support@mirelionhq.com'},{headers:{'auto-submitted':'auto-replied'}},{headers:{'list-id':'newsletter'}},{headers:{precedence:'bulk'}}])assert.equal(incomingSupportEmail({...email(),...change},emailOptions),null);
 assert.equal(incomingSupportEmail({...email(),text:null,html:'<img src="https://bad.invalid">'},emailOptions).attachments,true);
 assert.equal(incomingSupportEmail({...email(),authentication:null},emailOptions).authenticated,false);
 assert.equal(incomingSupportEmail({...email(),reply_to:['attacker@example.invalid']},emailOptions).sender_email,'member@example.invalid');
});
test('Svix official test vector and replay/tampering checks verify raw bytes',async()=>{
 const secret='whsec_plJ3nmyCDGBKInavdOK15jsl',raw='{"event_type":"ping","data":{"success":true}}';
 const headers=new Headers({'svix-id':'msg_loFOjxBNrRLzqYUf','svix-timestamp':'1731705121','svix-signature':'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='});
 assert.equal((await verifyEmailWebhook(raw,headers,secret,1731705121000)).event_type,'ping');
 await assert.rejects(()=>verifyEmailWebhook(raw+' ',headers,secret,1731705121000));
 await assert.rejects(()=>verifyEmailWebhook(raw,headers,secret,1731706000000));
 await assert.rejects(()=>verifyEmailWebhook(raw,headers,'',1731705121000));
});
test('email replies address the stored sender, remain threaded and suppress automatic loops',()=>{
 const payload=supportEmailPayload({recipient:'member@example.invalid',subject:'Help',body:'Reviewed instructions',automated:true,in_reply_to:'<a@example.invalid>'},'Mirelion <support@example.invalid>');
 assert.deepEqual(payload.to,['member@example.invalid']);assert.equal(payload.reply_to,'support@mirelionhq.com');
 assert.equal(payload.headers['Auto-Submitted'],'auto-replied');assert.equal(payload.headers['In-Reply-To'],'<a@example.invalid>');assert.match(payload.text,/automated reply/);
 assert.throws(()=>supportEmailPayload({recipient:'x\r\nBcc:bad@example.invalid',in_reply_to:'<a@example.invalid>'},'a@example.invalid'));
});
test('worker rejects ordinary user tokens and malformed or unsigned email webhooks before accessing data',async()=>{
 let calls=0;const env=k=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'private-test-key'}[k]||'');
 const handler=createSupportHandler({env,fetcher:async()=>{calls++;throw Error();}});
 for(const headers of [{},{authorization:'Bearer ordinary-user'}])assert.equal((await handler(new Request('https://example.invalid',{method:'POST',headers,body:'{"action":"run"}'}))).status,401);
 assert.equal(calls,0);
});
test('worker records a leased reply once and exposes no private conversation in its result',async()=>{
 const calls=[],env=k=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'private-test-key',OPENAI_API_KEY:'fake',OPENAI_GUIDE_MODEL:'configured-model'}[k]||'');let claimed=false;
 const handler=createSupportHandler({env,fetcher:async(url,options)=>{
  if(url.includes('api.openai.com'))return model({action:'answer',reason:'routine',topics:['availability']})(url,options);
  const input=JSON.parse(options.body);calls.push(input);
  if(input.p_action==='claim')return Response.json(claimed?null:(claimed=true,{...job('Set availability'),thread_id:'thread',message_id:4,lease:'lease'}));
  if(input.p_action==='finish')return Response.json({message_id:5});return Response.json(null);
 }});
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer private-test-key'},body:'{"action":"run"}'}));
 assert.deepEqual(await response.json(),{replies:1,sent:0});assert.equal(calls.filter(c=>c.p_action==='finish').length,1);
 assert.equal(calls.find(c=>c.p_action==='finish').p_data.lease,'lease');
});
test('a signed email is fetched from the fixed provider endpoint then stored without following message links',async()=>{
 const secret='whsec_'+Buffer.from('fictional-webhook-secret').toString('base64'),stamp=String(Math.floor(Date.now()/1000)),id='msg_test';
 const raw=JSON.stringify({type:'email.received',data:{email_id:provider}}),signature=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${id}.${stamp}.${raw}`).digest('base64');
 const calls=[],env=k=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'private-test-key',SUPPORT_INBOUND_WEBHOOK_SECRET:secret,RESEND_API_KEY:'fake',SUPPORT_INBOUND_ADDRESSES:'support@mirelionhq.com'}[k]||'');
 const handler=createSupportHandler({env,fetcher:async(url,options)=>{
  calls.push(url);if(url.includes('api.resend.com'))return Response.json(email());
  const input=JSON.parse(options.body);return Response.json(input.p_action==='status'?{email_enabled:true}:{received:true});
 }});
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'svix-id':id,'svix-timestamp':stamp,'svix-signature':'v1,'+signature},body:raw}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true});assert.equal(calls.length,3);
 assert.equal(calls[1],`https://api.resend.com/emails/receiving/${provider}?html_format=cid`);
});
