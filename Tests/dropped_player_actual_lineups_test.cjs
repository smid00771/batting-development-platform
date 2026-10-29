const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

test('delivered board compares an unpublished actual lineup, not an older published team or matching name',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window,d=h.document;w.scrollBy=()=>{};
 const expected=w.eval(`(()=>{
  const first=demoSelections.fixtures.find(f=>f.id==='selection-first'),second=demoSelections.fixtures.find(f=>f.id==='selection-second');
  const prior=demoSelections.fixtures.filter(f=>f.id.startsWith('history-')&&f.details.grade==='1st Grade').sort((a,b)=>b.details.days[0].date.localeCompare(a.details.days[0].date))[0];
  const dropped=first.slots[2].d1,returner='demo-returner';
  first.slots[2]={d1:null,d2:null};second.slots[8]={d1:dropped,d2:dropped};second.slots[9]={d1:returner,d2:returner};
  prior.published=null;prior.publication=0;
  const card=Object.values(demoScorecards).find(c=>c.match_id===demoSelections.result_sources[prior.id].match_id);
  card.teams[0].players.push({player_id:'unlinked-identity',name:demoSelections.roster.find(p=>p.id===returner).name});
  return {dropped,returner,date:prior.details.days[0].date,priorId:prior.id};
 })()`);
 let scans=0;const calculate=w.demoDropPrior;w.demoDropPrior=(...args)=>{scans++;return calculate(...args);};
 await w.seReload();w.drawSelections();await h.settle();assert.equal(scans,0);
 await h.click('#seShowDropped');assert.ok(scans>0);const captured=scans;
 assert.equal(d.querySelectorAll('[data-se-conversation]').length,1);
 assert.equal(d.querySelector('[data-se-conversation]').dataset.seConversationPlayer,expected.dropped);
 assert.equal(d.querySelector('[data-se-conversation-player="'+expected.returner+'"]'),null);
 assert.ok(d.querySelector('.se-conversation-status small').textContent.includes(w.seDate(expected.date)));
 const saved=w.eval('demoSelections.drop_reminders')[0];assert.equal(saved.previous_fixture_id,expected.priorId);
 await h.click('#seRefresh');assert.equal(scans,captured);assert.equal(d.querySelectorAll('.se-dropped').length,1);
 await d.querySelector('[data-se-conversation]').onclick();await h.settle();assert.equal(scans,captured);assert.equal(d.querySelector('.se-dropped'),null);
 await h.click('#seShowDropped');assert.equal(d.querySelector('.se-dropped'),null,'Shared completion survives another request');
 assert.deepEqual(h.errors,[]);
});

test('missing latest evidence blocks fallback and unfinished two-day teams cannot be the previous round',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window;
 const counts=w.eval(`(()=>{
  const first=demoSelections.fixtures.find(f=>f.id==='selection-first'),second=demoSelections.fixtures.find(f=>f.id==='selection-second'),id=first.slots[2].d1;
  first.slots[2]={d1:null,d2:null};second.slots[8]={d1:id,d2:id};
  const prior=demoSelections.fixtures.filter(f=>f.id.startsWith('history-')&&f.details.grade==='1st Grade').sort((a,b)=>b.details.days[0].date.localeCompare(a.details.days[0].date))[0];
  prior.published=null;delete demoSelections.result_sources[prior.id];
  const missing=demoConversations(session.user.id).filter(m=>m.fixture_id===second.id&&m.roster_id===id&&m.kind==='lower_grade').length;
  // Remove finished history; leave a two-day game still running after the target starts.
  demoSelections.fixtures=demoSelections.fixtures.filter(f=>!f.id.startsWith('history-')||f.id===prior.id);
  prior.details.days.push({date:demoAddDay(first.details.days[0].date,7)});prior.published={details:structuredClone(prior.details),slots:structuredClone(prior.slots)};
  const ongoing=demoConversations(session.user.id).filter(m=>m.fixture_id===second.id&&m.roster_id===id&&m.kind==='lower_grade').length;
  return {missing,ongoing};
 })()`);
 assert.equal(counts.missing,0);assert.equal(counts.ongoing,0);assert.deepEqual(h.errors,[]);
});
