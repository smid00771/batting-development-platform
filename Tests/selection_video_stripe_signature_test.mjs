import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createVideoPaymentHandler} from '../Functions/selection-video-payments/handler.mjs';
const Stripe=createRequire(import.meta.url)('stripe');
const stripe=new Stripe('webhook-verification-only'),secret='whsec_synthetic_test_only';
const payload=JSON.stringify({id:'evt_synthetic',type:'checkout.session.completed',created:Math.floor(Date.now()/1000),livemode:true,data:{object:{id:'cs_synthetic'}}});
test('the production Stripe SDK rejects forged, changed and expired webhook signatures',async()=>{
 let writes=0;
 const handler=createVideoPaymentHandler({env:n=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key'})[n],
  verifyEvent:(body,signature,key)=>stripe.webhooks.constructEventAsync(body,signature,key,300,Stripe.createSubtleCryptoProvider()),
  fetcher:async url=>{if(url.endsWith('selection_video_stripe_secret'))return Response.json({secret,livemode:true,account:'acct_synthetic'});writes++;return Response.json({status:'credited'});}});
 const invoke=(body,signature)=>handler(new Request('https://test/payments',{method:'POST',body,headers:{'stripe-signature':signature}}));
 const valid=stripe.webhooks.generateTestHeaderString({payload,secret});
 assert.equal((await invoke(payload,valid)).status,200);assert.equal(writes,1);
 assert.equal((await invoke(payload+' ',valid)).status,400);
 assert.equal((await invoke(payload,stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_wrong'}))).status,400);
 assert.equal((await invoke(payload,stripe.webhooks.generateTestHeaderString({payload,secret,timestamp:1}))).status,400);
 assert.equal(writes,1);
});
