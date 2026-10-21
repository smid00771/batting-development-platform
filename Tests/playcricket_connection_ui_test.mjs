import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createPlayCricketConnection,PLAYCRICKET_SUPPORT} from '../playcricket-connection.js';
import {createPlayHQImport} from '../playhq-import.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setTimeout(r,0));};
function fixture(){
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.getElementById('host'),calls=[],copies=[];
 let club='club-a',reject=false,uncertain=false,back=0,context={club_name:'Example <img src=x onerror=bad()> Club',revision:0,request:{association:'',club_url:'',contact_name:'Admin',contact_role:'',contact_email:'admin@example.invalid'},state:'not_requested',configured:false,verified:false,connection_version:null};
 const supabase={rpc:async(name,args)=>{calls.push(structuredClone({name,...args}));const a=args.p_action,d=args.p_data;
  if(a==='save_request'){context.request=structuredClone(d.request);context.revision++;}
  if(a==='mark_requested'){context.requested_at='2026-10-21T12:00:00Z';context.state='awaiting_key';context.revision++;}
  if(a==='clear_requested'){context.requested_at=null;context.state='not_requested';context.revision++;}
  if(a==='configure'){if(uncertain){uncertain=false;return {error:{message:'Network interrupted'}};}context.configured=true;context.state='needs_check';context.connection_version='2026-10-21T12:10:00Z';context.organisation_id=d.organisation_id;context.association_id=d.association_id;}
  return {data:structuredClone(context)};
 },functions:{invoke:async(_,{body})=>{calls.push(body);if(reject)return {error:{message:'Unavailable'}};context.verified=true;context.state='connected';return {data:{seasons:[]}};}}};
 const ui=createPlayCricketConnection({supabase,clubId:()=>club,here:()=>true,copy:async text=>copies.push(text),back:()=>back++,season:()=>{},alert:()=>{},confirm:()=>true});
 const click=q=>host.querySelector(q).click(),input=(q,v)=>{let el=host.querySelector(q);el.value=v;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));},submit=q=>host.querySelector(q).dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
 return {dom,host,calls,copies,ui,context,supabase,click,input,submit,setReject:v=>reject=v,setUncertain:v=>uncertain=v,setClub:v=>club=v,back:()=>back};
}
async function enterKey(f){await f.ui.mount(f.host);f.click('[data-pc-key]');f.input('[name=organisation_id]','11111111-1111-4111-8111-111111111111');f.input('[name=association_id]','22222222-2222-4222-8222-222222222222');f.input('[name=api_key]','synthetic-test-key-not-real');f.host.querySelector('[name=authorised]').checked=true;}
test('preparing, copying and opening a request never mark it sent; explicit confirmation persists per club',async()=>{
 const f=fixture();await f.ui.mount(f.host);assert.equal(f.host.querySelector('img'),null);f.click('[data-pc-request]');f.input('[data-pc-field=association]','Example Association');f.input('[data-pc-field=contact_role]','Secretary');f.submit('[data-pc-request-form]');await settle();
 assert.equal(f.calls.at(-1).p_action,'save_request');assert.equal(f.calls.at(-1).p_club_id,'club-a');f.click('[data-pc-copy]');await settle();assert.equal(f.copies.length,1);assert.match(f.copies[0],/own organisation-scoped public API key/);
 assert.equal(f.host.querySelector('a.btn').href,PLAYCRICKET_SUPPORT);assert.equal(f.calls.filter(x=>x.p_action==='mark_requested').length,0);f.submit('[data-pc-sent]');await settle();assert.equal(f.calls.filter(x=>x.p_action==='mark_requested').length,0);
 f.host.querySelector('[name=authorised]').checked=true;f.submit('[data-pc-sent]');await settle();assert.match(f.host.textContent,/Request sent · waiting/);assert.deepEqual(f.calls.find(x=>x.p_action==='mark_requested').p_data,{revision:1,authorised:true});
 await f.ui.mount(f.host);assert.match(f.host.textContent,/Sent 21 Oct 2026/);assert.ok(f.host.querySelector('[data-pc-key]'));f.click('[data-pc-clear]');await settle();assert.match(f.host.textContent,/Access not requested/);assert.ok(f.host.querySelector('[data-pc-request-text]'));
});
test('keys never appear in HTML, and a failed check stays unverified with a retry',async()=>{
 const f=fixture();await enterKey(f);assert.ok(f.ui.hasChanges());assert.equal(f.host.innerHTML.includes('synthetic-test-key'),false);f.setReject(true);f.submit('[data-pc-credentials]');await settle();assert.match(f.host.textContent,/Credentials saved · check connection/);assert.match(f.host.textContent,/could not be checked/);assert.equal(f.ui.hasChanges(),false);assert.equal(f.calls.find(x=>x.p_action==='configure').p_data.authorised,true);
 f.setReject(false);f.click('[data-pc-check]');await settle();assert.match(f.host.textContent,/Connected/);assert.ok(f.host.querySelector('[data-pc-season]'));assert.equal(f.host.innerHTML.includes('synthetic-test-key'),false);
});
test('uncertain credential saves block leaving and retry the same request safely',async()=>{
 const f=fixture();await enterKey(f);f.setUncertain(true);f.submit('[data-pc-credentials]');await settle();assert.equal(f.ui.canLeave(),false);assert.equal(f.ui.hasChanges(),true);assert.ok(f.host.querySelector('[data-pc-retry]'));f.click('[data-pc-retry]');await settle();
 const attempts=f.calls.filter(x=>x.p_action==='configure');assert.equal(attempts.length,2);assert.deepEqual(attempts[0].p_data,attempts[1].p_data);assert.equal(f.ui.hasChanges(),false);assert.equal(f.ui.canLeave(),true);
});
test('late connection responses cannot render another club’s contact data',async()=>{
 const f=fixture();let resolve;f.supabase.rpc=()=>new Promise(r=>resolve=r);const mounted=f.ui.mount(f.host);f.setClub('club-b');f.host.innerHTML='Other club';resolve({data:f.context});await mounted;assert.equal(f.host.textContent,'Other club');assert.equal(f.ui.hasChanges(),false);
});
test('season importer routes Club Admin to Settings workflow and preserves manual setup',async()=>{
 const f=fixture();let connected=0,manual=0;f.supabase.rpc=async(name)=>({data:name==='playhq_fixture_review'?{changes:[]}:{admin:true,configured:false}});
 const ui=createPlayHQImport({supabase:f.supabase,clubId:()=> 'club-a',here:()=>true,connect:()=>connected++,manual:()=>manual++,back:()=>{},alert:()=>{},confirm:()=>true});ui.mount(f.host,{groups:[],existing:[]});await settle();assert.equal(f.host.querySelector('[data-phq-config]'),null);assert.ok(f.host.querySelector('[data-phq-manual]'));f.click('[data-phq-connect]');assert.equal(connected,1);assert.equal(ui.hasChanges(),false);
});
