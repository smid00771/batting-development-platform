const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
test('Mirelion Assist is available to staff in all three products and keeps messaging fictional',async()=>{
 for(const product of ['select','batting','both']){
  const h=await openDemo({product,role:'admin',journey:'assist'});
  try{
   assert.ok(h.document.querySelector('[data-tab="assist"]'));assert.equal(h.document.querySelector('#page h1').textContent,'Mirelion Assist');
   const form=h.document.querySelector('[data-assist-compose]');form.elements.subject.value='Can our club change this?';form.elements.body.value='A fictional request';form.oninput();
   await h.click('[data-assist-send]');assert.match(h.document.querySelector('[data-assist-messages]').textContent,/A fictional request/);
   await h.click('[data-assist-example]');assert.match(h.document.querySelector('[data-assist-messages]').textContent,/fictional example reply/);
   assert.equal(h.requests.length,0);assert.deepEqual(h.errors.map(e=>e.message),[]);assert.equal(h.window.__fixtureLogs.filter(x=>['error','unsupported'].includes(x.kind)).length,0);
   await h.click('[data-tab="guide"]');await h.click('#demoAssistLink');assert.equal(h.document.querySelector('#page h1').textContent,'Mirelion Assist');
  }finally{h.close();}
 }
});

test('players cannot open Assist from navigation, Help, old URLs or passive checks',async()=>{
 for(const product of ['select','batting','both']){
  const h=await openDemo({product,role:'player',journey:'assist'},{traceRpc:true});
  try{
   assert.equal(h.document.querySelector('[data-tab="assist"]'),null);assert.equal(h.window.eval("canOpenClubTab('assist')"),false);
   await h.click('[data-tab="guide"]');assert.equal(h.document.querySelector('#guideHumanHandoff,#demoAssistLink'),null);
   await h.window.eval("mirelionAssist.start()");await h.window.eval("mirelionAssist.mount(document.getElementById('page'))");
   assert.equal(h.rpcCalls.filter(x=>x.name==='mirelion_assist').length,0);assert.equal(h.document.querySelector('[data-assist-compose]'),null);
  }finally{h.close();}
 }
});
