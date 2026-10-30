const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
test('Fixtures appears only for Club Batting staff, opens manual matches, and section entry resets its nested view',async t=>{
 const h=await openDemo({product:'batting',role:'admin',journey:'products'},{traceRpc:true});t.after(h.close);
 assert.ok(h.document.querySelector('[data-tab="batting_fixtures"]'));assert.ok(!h.rpcCalls.some(c=>c.name==='club_batting_fixtures'));
 await h.click('[data-tab="batting_fixtures"]');assert.ok(h.document.querySelector('[data-fixture-season]'));assert.ok(h.document.querySelector('[data-fixture-review]'));
 await h.click('[data-fixture-new]');assert.ok(h.document.querySelector('[data-fixture-form]'));
 await h.click('[data-tab="batting_fixtures"]');assert.equal(h.document.querySelector('[data-fixture-form]'),null);
 await h.click('[data-fixture-season]');assert.ok(h.document.querySelector('[data-phq-connect]'));assert.equal(h.window.eval('selectionsEnabled()'),false);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('linked clubs and ordinary players have no duplicate fixture entry or fixture requests',async t=>{
 for(const stage of [{product:'both',role:'admin',journey:'products'},{product:'select',role:'admin',journey:'products'},{product:'batting',role:'player',journey:'player_home'}]){
  const h=await openDemo(stage,{traceRpc:true});try{assert.equal(h.document.querySelector('[data-tab="batting_fixtures"]'),null);assert.equal(h.window.eval("canOpenClubTab('batting_fixtures')"),false);assert.ok(!h.rpcCalls.some(c=>c.name==='club_batting_fixtures'));}finally{h.close();}
 }
});
