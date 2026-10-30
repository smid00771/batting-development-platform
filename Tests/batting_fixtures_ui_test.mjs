import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {webcrypto} from 'node:crypto';
import {createBattingFixtures} from '../batting-fixtures.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
function harness({admin=true}={}){
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.querySelector('#host'),calls=[],routes=[];let scope='a',uncertain=false,deny=false,review;
 const data={admin,groups:[{id:'g',name:'First <Grade>'}],fixtures:[{id:'f',revision:1,details:{grade:'First <Grade>',grade_group_id:'g',format:'limited_overs',opposition:'Visitors',days:[{date:'2026-11-01',start:'12:00',ground:'Oval'}]}}]};
 const supabase={rpc:async(name,args)=>{calls.push(structuredClone({name,args}));if(name==='playhq_sync_api')return {data:{admin,configured:false}};if(name==='playhq_fixture_review')return {data:{changes:[]}};
  if(name==='playhq_onboarding')return {data:{state:'not_requested',club_name:'Example',request:{}}};
  if(name==='club_fixture_calendar_trials')return {data:{can_whole_club:admin,teams:data.groups,trials:[]}};
  if(args.p_action==='save'){if(uncertain){uncertain=false;return {error:{message:'Lost response'}};}if(deny)return {error:{code:'P0001',message:'Fixture changed. Reopen it before saving'}};data.fixtures.push({...args.p_data,details:{...args.p_data.details,grade:'First <Grade>'}});return {data:{saved:true}};}
  return {data:structuredClone(data)};
 }};
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const ui=createBattingFixtures({supabase,clubId:()=>scope,scope:()=>scope,here:()=>true,today:()=> '2026-10-30',uuid:()=>webcrypto.randomUUID(),alert:()=>{},confirm:()=>true,copy:()=>{},route:r=>routes.push(r),teams:()=>{},review:id=>review=id});
 const click=q=>host.querySelector(q).click(),input=(q,v)=>{const n=host.querySelector(q);n.value=v;n.dispatchEvent(new dom.window.Event('input',{bubbles:true}));},submit=()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
 return {dom,host,calls,routes,ui,supabase,data,click,input,submit,setUncertain:()=>uncertain=true,setDeny:v=>deny=v,setScope:v=>scope=v,review:()=>review};
}
test('home stays quiet; season setup and connection reuse existing services only on demand',async()=>{
 const h=harness();await h.ui.mount(h.host);assert.deepEqual(h.calls.map(c=>c.name),['club_batting_fixtures']);assert.equal(h.host.querySelector('grade'),null);
 h.click('[data-fixture-review]');assert.equal(h.review(),'f');h.click('[data-fixture-season]');await settle();assert.ok(h.host.querySelector('[data-phq-connect]'));assert.ok(h.calls.some(c=>c.name==='playhq_sync_api'));
 h.click('[data-phq-connect]');await settle();assert.ok(h.host.querySelector('[data-pc-key]'));assert.equal(h.calls.at(-1).name,'playhq_onboarding');h.dom.window.close();
});
test('manual fixture preserves uncertain request, blocks navigation, then returns to saved fixture',async()=>{
 const h=harness();await h.ui.mount(h.host,{route:{view:'manual'}});h.input('[name=grade_group_id]','g');h.input('[name=opposition]','Test visitors');h.input('[name=date0]','2026-11-03');assert.equal(h.ui.hasChanges(),true);
 h.setUncertain();h.submit();await settle();assert.equal(h.ui.canLeave(),false);assert.equal(h.host.querySelector('[data-fixture-save]').textContent,'Retry save');assert.equal(h.host.querySelector('[name=opposition]').disabled,true);
 h.submit();await settle();const saves=h.calls.filter(c=>c.args.p_action==='save');assert.equal(saves.length,2);assert.deepEqual(saves[0].args,saves[1].args);assert.match(h.host.textContent,/Test visitors/);assert.equal(h.ui.hasChanges(),false);h.dom.window.close();
});
test('known rejection keeps editable details and coaches have no setup controls',async()=>{
 const h=harness();await h.ui.mount(h.host,{route:{view:'manual',fixtureId:'f'}});h.setDeny(true);h.submit();await settle();assert.match(h.host.textContent,/Fixture changed/);assert.equal(h.host.querySelector('[name=opposition]').disabled,false);h.dom.window.close();
 const coach=harness({admin:false});await coach.ui.mount(coach.host,{route:{view:'season'}});assert.equal(coach.host.querySelector('[data-fixture-season]'),null);assert.equal(coach.host.querySelector('[data-fixture-new]'),null);assert.ok(coach.host.querySelector('[data-fixture-review]'));coach.dom.window.close();
});
test('late context response cannot overwrite another club',async()=>{
 const h=harness();let resolve;h.supabase.rpc=()=>new Promise(r=>resolve=r);const mount=h.ui.mount(h.host);h.setScope('b');h.host.textContent='Other club';resolve({data:h.data});await mount;assert.equal(h.host.textContent,'Other club');h.dom.window.close();
});
