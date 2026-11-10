const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
test('a recorded forfeit uses a compact result card and excludes selection and publication',async t=>{
 const h=await openDemo('selections');t.after(h.close);h.window.scrollBy=()=>{};
 h.window.eval(`demoSelections.result_sources||={};demoSelections.result_sources['selection-first']={no_play:'won_by_forfeit'};`);
 await h.window.seReload();h.window.seBoard();await h.settle();
 const f=h.window.ensureSelections().data.fixtures.find(f=>f.id==='selection-first'),before=JSON.stringify(f.slots),card=h.document.querySelector('[data-se-team="selection-first"]');
 assert.equal(f.no_play,'won_by_forfeit');assert.match(card.textContent,/Won by forfeit/);assert.match(card.textContent,/No team selection required/);
 assert.equal(card.querySelector('[data-se-slot]'),null);assert.equal(card.querySelector('[data-se-copylast]'),null);assert.equal(card.querySelector('.se-issues'),null);
 assert.equal(h.window.seShortTeams([f]).length,0);
 h.window.sePublishReview([f]);assert.equal(h.document.querySelector('[data-se-publish-team]'),null);
 h.window.seBoard();await h.click('[data-se-team="selection-first"] [data-se-edit]');
 assert.match(h.document.querySelector('#seContent').textContent,/Won by forfeit/);assert.equal(h.document.querySelector('#seFixtureForm'),null);
 assert.equal(h.document.querySelector('.se-fixture-meeting'),null);assert.doesNotMatch(h.document.querySelector('#seContent').textContent,/Open for changes|Review & publish teams to finish/);
 assert.equal(JSON.stringify(f.slots),before,'Recorded choices are preserved');assert.deepEqual(h.errors,[]);
});
test('a forfeit does not reserve its players or flag short teams',async t=>{
 const h=await openDemo('selections');t.after(h.close);
 const f=h.window.ensureSelections().data.fixtures.find(f=>f.id==='selection-first'),player=f.slots.find(s=>s.d1)?.d1;
 assert.ok(player);const day=f.details.days[0],person=h.window.ensureSelections().data.roster.find(p=>p.id===player);
 assert.equal(h.window.seUsed(person,day,[f],{},f.details),true);
 f.no_play='won_by_forfeit';assert.equal(h.window.seUsed(person,day,[f],{},f.details),false);assert.equal(h.window.seShortTeams([f]).length,0);
});
