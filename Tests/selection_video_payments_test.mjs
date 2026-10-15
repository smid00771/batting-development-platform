import test from 'node:test';
import assert from 'node:assert/strict';
import {createVideoPaymentHandler} from '../Functions/selection-video-payments/handler.mjs';
const event={id:'evt_example',type:'checkout.session.completed',livemode:true,created:1770000000,data:{object:{id:'cs_example',payment_status:'paid'}}};
function setup({valid=true,live=true,account,fail=false}={}){
 const calls=[],verified=[];
 const handler=createVideoPaymentHandler({env:n=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret'})[n],
  verifyEvent:async(body,signature,secret)=>{verified.push({body,signature,secret});if(!valid)throw Error('Bad signature');return {...event,livemode:live,...(account?{account}:{}),...JSON.parse(body)};},
  fetcher:async(url,options)=>{calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer server-secret');assert.equal(options.redirect,'error');
   if(url.endsWith('selection_video_stripe_secret'))return Response.json({secret:'whsec_test',account:'acct_Club',livemode:true});
   if(fail)return Response.json({}, {status:503});
   assert.equal(url,'https://test.supabase.co/rest/v1/rpc/selection_video_payment_event');return Response.json({status:'credited'});
  }});
 const invoke=(body='{}',signature='signed-header',method='POST')=>handler(new Request('https://test/payments',{method,headers:signature?{'stripe-signature':signature}:{},...(method==='POST'?{body}:{})}));
 return {invoke,calls,verified};
}
test('missing or invalid signatures cannot change balances',async()=>{
 const s=setup();assert.equal((await s.invoke('{}','')).status,400);assert.equal(s.calls.length,0);
 const bad=setup({valid:false});assert.equal((await bad.invoke()).status,400);assert.equal(bad.calls.length,1);
});
test('raw body is verified before any fulfillment',async()=>{
 const s=setup(),raw='{ "type": "checkout.session.async_payment_succeeded" }';
 assert.equal((await s.invoke(raw)).status,200);assert.equal(s.verified[0].body,raw);assert.equal(s.verified[0].signature,'signed-header');assert.equal(s.verified[0].secret,'whsec_test');
 assert.equal(JSON.parse(s.calls[1].options.body).p_event.type,'checkout.session.async_payment_succeeded');
});
test('sandbox or wrong-account events cannot grant live credit',async()=>{
 for(const params of [{live:false},{account:'acct_Other'}]){const s=setup(params);assert.equal((await s.invoke()).status,400);assert.equal(s.calls.length,1);}
});
test('failed storage asks Stripe to retry, without exposing secrets',async()=>{
 const s=setup({fail:true}),r=await s.invoke();assert.equal(r.status,500);assert.doesNotMatch(await r.text(),/server-secret|whsec_test/);
});
test('unrelated events are ignored and refund events are forwarded',async()=>{
 const s=setup();assert.equal((await s.invoke('{"type":"customer.created"}')).status,200);assert.equal(s.calls.length,1);
 assert.equal((await s.invoke('{"type":"charge.refunded"}')).status,200);assert.equal(s.calls.length,3);
});
test('non-POST requests are rejected without database requests',async()=>{
 const s=setup();assert.equal((await s.invoke(undefined,'','GET')).status,405);assert.equal(s.calls.length,0);
});
