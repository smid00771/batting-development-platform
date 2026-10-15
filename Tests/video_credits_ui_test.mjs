import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountVideoCredits,videoTime} from '../video-credits.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const base={kind:'annual',enabled:true,available_seconds:86400,included_remaining_seconds:86400,purchased_remaining_seconds:0,held_seconds:0,renews_at:'2027-10-07T00:00:00Z',low:false,can_manage:true,can_top_up:true,payments_ready:true,packs:[{code:'video_5h',label:'5 hours',amount_cents:1500,currency:'aud'}]};
function setup(balance=base,checkout){
 const dom=new JSDOM('<main id="credits"></main>',{url:'https://clubbatting.com/app.html?payment=success'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,MutationObserver:dom.window.MutationObserver});
 const host=document.getElementById('credits'),requests=[];
 const mounted=mountVideoCredits(host,{openWindow:()=>null,rpc:async(action,data)=>{
  requests.push({action,data:structuredClone(data)});
  return action==='balance'?structuredClone(balance):checkout?checkout(data):{url:'https://buy.stripe.com/test?client_reference_id='+data.request_id};
 }});
 return {host,requests,mounted,close(){mounted.destroy();dom.window.close();}};
}
test('four-person display and blocked popups preserve server-confirmed credit',async()=>{
 assert.equal(videoTime(86400),'6 hr');assert.equal(videoTime(72000),'5 hr');assert.equal(videoTime(345600),'24 hr');
 const s=setup();try{
  await tick();assert.match(s.host.textContent,/6 hr available/);assert.equal(s.requests.length,1);
  s.host.querySelector('[data-vc="toggle"]').click();assert.match(s.host.textContent,/Buy 5 hours — A\$15/);
  s.host.querySelector('[data-vc-pack]').click();await tick();
  assert.equal(s.requests[1].data.pack_code,'video_5h');assert.match(s.requests[1].data.request_id,/^[a-f0-9-]{36}$/);
  assert.match(s.host.querySelector('a').href,/^https:\/\/buy.stripe.com\//);assert.match(s.host.textContent,/6 hr available/);
  assert.match(s.host.textContent,/after confirmation/);
 }finally{s.close();}
});
test('selectors and the complimentary pilot cannot buy; low and held credit are visible',async()=>{
 for(const balance of [{...base,can_manage:false,can_top_up:false,low:true,available_seconds:0,held_seconds:5460},{...base,kind:'complimentary',can_top_up:false,payments_ready:false}]){
  const s=setup(balance);try{await tick();assert.equal(s.host.querySelector('[data-vc="toggle"]'),null);
   if(balance.low){assert.match(s.host.textContent,/No video time/);assert.match(s.host.textContent,/held for active or recent calls/);assert.match(s.host.textContent,/Selection chat stays available/);}
   else assert.match(s.host.textContent,/complimentary/);
  }finally{s.close();}
 }
});
test('checkout retries reuse the order and untrusted checkout URLs are rejected',async()=>{
 let attempts=0;const s=setup(base,()=>{if(++attempts===1)throw Error('Connection interrupted');return {url:'https://evil.test/?client_reference_id=anything'};});
 try{await tick();s.host.querySelector('[data-vc="toggle"]').click();s.host.querySelector('[data-vc-pack]').click();await tick();
  s.host.querySelector('[data-vc-pack]').click();await tick();assert.deepEqual(s.requests[1].data,s.requests[2].data);
  assert.equal(s.host.querySelector('a'),null);assert.match(s.host.textContent,/Checkout could not be verified/);
 }finally{s.close();}
});
