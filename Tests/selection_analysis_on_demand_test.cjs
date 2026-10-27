const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
async function setup(t){
 const h=await openDemo('selections');t.after(h.close);h.window.scrollBy=()=>{};
 const calls=[],db=h.window.__fixtureDb,original=db.rpc;
 db.rpc=async function(name,args){calls.push({name,action:args?.p_action,data:args?.p_data});return original.call(this,name,args);};
 return {...h,calls,analysis:()=>calls.filter(c=>c.name==='club_season_stats_api')};
}
test('delivered board offers two More actions, keeps their results through refresh and search, and never opens a meeting',async t=>{
 const h=await setup(t),d=h.document;
 assert.equal(d.getElementById('seMeeting'),null);
 for(const [id,label] of [['seFormIndicators','Show form indicators'],['seCompareReturning','Compare returning players']]){
  const button=d.querySelector('#seMore #'+id);assert.equal(button.tagName,'BUTTON');assert.equal(button.textContent,label);assert.equal(button.disabled,false);
 }
 assert.match(d.querySelector('[data-se-returning]').textContent,/Sam Ellison/);assert.equal(h.analysis().length,0);
 await h.click('#seFormIndicators');assert.equal(h.analysis().length,1);assert.equal(h.analysis()[0].data.on_demand,true);
 const labels=()=>[...d.querySelectorAll('[data-evidence-open]')].map(b=>b.getAttribute('aria-label'));
 const before=labels();assert.ok(before.length>20);assert.equal(d.querySelector('[data-return-compare]'),null);
 await h.click('#seCompareReturning');assert.equal(h.analysis().length,2);assert.ok(d.querySelector('[data-return-compare]'));
 const returning=d.querySelector('[data-return-analysis]').innerHTML,withReturns=labels();
 await h.click('#seRefresh');assert.deepEqual(labels(),withReturns);assert.equal(d.querySelector('[data-return-analysis]').innerHTML,returning);assert.equal(h.analysis().length,2);
 const card=d.querySelector('[data-se-team="selection-first"]');await h.click('[data-se-team="selection-first"] [data-se-slot="0"]');
 const search=d.getElementById('seSearch');search.value='Sam Ellison';search.dispatchEvent(new h.window.Event('input'));await h.settle();
 assert.equal(d.querySelector('[data-se-team="selection-first"]'),card);assert.equal(h.analysis().length,2);assert.equal(d.querySelector('.sr-room'),null);
 assert.equal(h.calls.some(c=>c.name==='selection_room_api'),false);assert.deepEqual(h.errors,[]);
});
test('a saved returning-player selection removes affected analysis; Undo restores only the reminder until requested again',async t=>{
 const h=await setup(t),d=h.document;await h.click('#seFormIndicators');await h.click('#seCompareReturning');
 const untouched=d.querySelector('[data-se-team="selection-second"] [data-evidence-open]');assert.ok(untouched);
 const key=untouched.dataset.evidenceOpen,label=untouched.getAttribute('aria-label');
 await h.click('[data-se-team="selection-first"] [data-se-slot="0"]');
 const input=d.getElementById('seSearch');input.value='Sam Ellison';input.dispatchEvent(new h.window.Event('input'));await h.settle();
 await h.click('[data-se-player="demo-returner"]');assert.equal(d.querySelector('[data-se-returning],[data-return-compare]'),null);
 assert.ok(h.calls.some(c=>c.name==='club_selections_api'&&c.action==='save_board'));assert.equal(h.analysis().length,2);
 const retained=[...d.querySelectorAll('[data-evidence-open]')].find(b=>b.dataset.evidenceOpen===key);assert.equal(retained.getAttribute('aria-label'),label);
 await h.click('#seUndo');assert.match(d.querySelector('[data-se-returning]').textContent,/Sam Ellison/);assert.equal(d.querySelector('[data-return-compare]'),null);assert.equal(h.analysis().length,2);
 await h.click('#seCompareReturning');assert.ok(d.querySelector('[data-return-compare]'));assert.equal(h.analysis().length,3);assert.deepEqual(h.errors,[]);
});
test('switching selection dates clears the old snapshot and remains quiet',async t=>{
 const h=await setup(t),d=h.document;await h.click('#seFormIndicators');assert.ok(d.querySelector('[data-evidence-open]'));
 const picker=d.getElementById('seBoardDate'),old=picker.value,next=[...picker.options].find(o=>o.value!==old)?.value;assert.ok(next);
 await h.choose('#seBoardDate',next);assert.equal(d.querySelector('[data-evidence-open]'),null);assert.equal(h.analysis().length,1);
 await h.choose('#seBoardDate',old);assert.equal(d.querySelector('[data-evidence-open]'),null);assert.equal(h.analysis().length,1);assert.deepEqual(h.errors,[]);
});
