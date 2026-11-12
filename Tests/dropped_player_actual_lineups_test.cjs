const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

test('limited overs to long form highlights both bracket partners using only their selected-day availability',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window,d=h.document;w.scrollBy=()=>{};
 const expected=w.eval(`(()=>{
  const first=demoSelections.fixtures.find(f=>f.id==='selection-first'),second=demoSelections.fixtures.find(f=>f.id==='selection-second');
  const ids=first.slots.slice(2,4).map(s=>s.d1);
  first.details.brackets=true;delete first.details.bracket_basis;
  first.slots[2]={d1:null,d2:null};first.slots[3]={d1:null,d2:null};second.slots[8]={d1:ids[0],d2:ids[1]};
  const prior=demoSelections.fixtures.filter(f=>f.id.startsWith('history-')&&f.details.grade==='1st Grade').sort((a,b)=>b.details.days[0].date.localeCompare(a.details.days[0].date))[0];
  prior.details.format='limited_overs';if(prior.published)prior.published.details.format='limited_overs';
  Object.values(demoScorecards).find(c=>c.match_id===demoSelections.result_sources[prior.id].match_id).format_key='limited_overs';
  ids.forEach((id,i)=>demoSelections.roster.find(p=>p.id===id).availability.unavailable_dates=[second.details.days[1-i].date]);
  return {ids,date:prior.details.days.at(-1).date};
 })()`);
 let scans=0;const calculate=w.demoConversations;w.demoConversations=(...args)=>{scans++;return calculate(...args);};
 await w.seReload();w.drawSelections();await h.settle();assert.equal(scans,0);
 await h.click('#seShowDropped');assert.equal(scans,1);
 for(const id of expected.ids){
  const control=d.querySelector('[data-se-conversation-player="'+id+'"]');assert.ok(control,'Each bracket partner has their own reminder');
  assert.match(control.closest('.se-player-cell').textContent,/Dropped from 1st Grade/);
  assert.ok(control.closest('.se-player-cell').textContent.includes(w.seDate(expected.date)));
 }
 assert.equal(d.querySelectorAll('[data-se-conversation]').length,2);
 await d.querySelector('[data-se-conversation-player="'+expected.ids[1]+'"]').onclick();await h.settle();
 await w.renderSelections();await h.settle();assert.equal(scans,1,'Refresh and marking reuse saved reminders');
 assert.equal(d.querySelector('[data-se-conversation-player="'+expected.ids[1]+'"]'),null);
 assert.ok(d.querySelector('[data-se-conversation-player="'+expected.ids[0]+'"]'));assert.deepEqual(h.errors,[]);
});

test('representative-only bracketing excludes availability-forced moves and rechecks saved reminders without history scans',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window,d=h.document;w.scrollBy=()=>{};
 const ids=w.eval(`(()=>{
  const higher=demoSelections.fixtures.find(f=>f.id==='selection-first'),lower=demoSelections.fixtures.find(f=>f.id==='selection-second');
  const ids=higher.slots.slice(2,5).map(s=>s.d1);
  ids.forEach((id,i)=>{higher.slots[i+2]={d1:null,d2:null};demoSelections.roster.find(p=>p.id===id).availability.unavailable_dates=i<2?[higher.details.days[1-i].date]:[];});
  lower.slots[8]={d1:ids[0],d2:ids[1]};lower.slots[9]={d1:ids[2],d2:ids[2]};higher.details.brackets=true;delete higher.details.bracket_basis;
  return ids;
 })()`);
 await w.seReload();w.drawSelections();await h.settle();await h.click('#seShowDropped');
 assert.equal(d.querySelectorAll('[data-se-conversation]').length,3,'General bracketing leaves each player eligible for the higher grade');
 const scan=w.demoConversations;w.demoConversations=()=>{throw Error('A saved read must not recalculate history');};
 w.eval("demoSelections.fixtures.find(f=>f.id==='selection-first').details.bracket_basis='representative'");
 await w.renderSelections();await h.settle();
 for(const id of Array.from(ids).slice(0,2))assert.equal(d.querySelector('[data-se-conversation-player="'+id+'"]'),null,'Unavailable for a required higher-grade day is not a drop');
 assert.ok(d.querySelector('[data-se-conversation-player="'+ids[2]+'"]'),'The fully available lower-grade player still has a drop reminder');
 w.demoConversations=scan;await h.click('#seShowDropped');assert.equal(d.querySelectorAll('[data-se-conversation]').length,1);assert.deepEqual(h.errors,[]);
});

test('availability eligibility uses the higher grade dates and does not infer a reason from missing or ambiguous fixtures',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window;
 const result=w.eval(`(()=>{
  const higher=demoSelections.fixtures.find(f=>f.id==='selection-first'),lower=demoSelections.fixtures.find(f=>f.id==='selection-second'),person=demoSelections.roster.find(p=>p.id===higher.slots[2].d1),previous=structuredClone(higher.details);
  higher.details.brackets=false;higher.details.days=[{date:lower.details.days[1].date},{date:demoAddDay(lower.details.days[1].date,1)}];
  person.availability.unavailable_dates=[lower.details.days[0].date];
  const differentDates=demoDropPreviousGradeAvailable(person,previous,lower.details);
  person.availability.unavailable_dates=[higher.details.days[1].date];const blocked=demoDropPreviousGradeAvailable(person,previous,lower.details);
  demoSelections.fixtures.push({...structuredClone(higher),id:'ambiguous-higher'});const ambiguous=demoDropPreviousGradeAvailable(person,previous,lower.details);
  demoSelections.fixtures=demoSelections.fixtures.filter(f=>![higher.id,'ambiguous-higher'].includes(f.id));const missing=demoDropPreviousGradeAvailable(person,previous,lower.details);
  return {differentDates,blocked,ambiguous,missing};
 })()`);
 assert.equal(result.differentDates,true);assert.equal(result.blocked,false);assert.equal(result.ambiguous,true);assert.equal(result.missing,true);assert.deepEqual(h.errors,[]);
});

test('grade drops connect limited overs and long form in both directions while T20 remains separate',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window;
 const results=w.eval(`(()=>{
  const first=demoSelections.fixtures.find(f=>f.id==='selection-first'),second=demoSelections.fixtures.find(f=>f.id==='selection-second'),id=first.slots[2].d1;
  const prior=demoSelections.fixtures.filter(f=>f.id.startsWith('history-')&&f.details.grade==='1st Grade').sort((a,b)=>b.details.days[0].date.localeCompare(a.details.days[0].date))[0];
  demoSelections.fixtures=[prior,second];second.slots=[{d1:id,d2:id}];
  const source=Object.values(demoScorecards).find(c=>c.match_id===demoSelections.result_sources[prior.id].match_id);
  return [['limited_overs','long_form'],['long_form','limited_overs'],['t20','long_form'],['limited_overs','t20'],['long_form','t20'],['t20','limited_overs'],['t20','t20']].map(([from,to])=>{
   prior.details.format=from;if(prior.published)prior.published.details.format=from;source.format_key=from;second.details.format=to;
   return {from,to,count:demoConversations(session.user.id).filter(m=>m.fixture_id===second.id&&m.roster_id===id&&m.kind==='lower_grade').length};
  });
 })()`);
 assert.deepEqual(Array.from(results,r=>r.count),[1,1,0,0,0,0,1]);assert.deepEqual(h.errors,[]);
});

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
 await h.window.renderSelections();await h.settle();assert.equal(scans,captured);assert.equal(d.querySelectorAll('.se-dropped').length,1);
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

test('explicit equal Dev levels find a fourth-grade drop even with a blank imported competition',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window;
 const result=w.eval(`(()=>{
  const fourth=demoSelections.fixtures.find(f=>f.details.grade==='4th Grade'&&!f.id.startsWith('history-'));
  const sky=demoSelections.fixtures.find(f=>f.details.grade==='Dev Sky'&&!f.id.startsWith('history-')),id=fourth.slots[0].d1;
  const previous={...structuredClone(fourth),id:'explicit-prior-fourth',details:{...structuredClone(fourth.details),format:sky.details.format,days:[{date:demoAddDay(sky.details.days[0].date,-7)}]}};
  previous.published={details:structuredClone(previous.details),slots:[{d1:id,d2:null}]};demoSelections.fixtures.push(previous);
  sky.slots[0]={d1:id,d2:null};sky.details.competition='';
  demoSelections.access.grade_levels=['','Example District'].flatMap(competition=>['Dev Navy','Dev Sky'].map(grade=>({competition,grade,level:5})));
  const moves=()=>demoConversations(session.user.id).filter(m=>m.fixture_id===sky.id&&m.roster_id===id&&m.kind==='lower_grade');
  const dropped=moves().map(m=>m.previous_grade);
  Object.assign(previous.details,{grade:'Dev Navy',grade_group_id:'group-dev-navy'});previous.published.details=structuredClone(previous.details);
  return {dropped,equal:moves().length};
 })()`);
 assert.deepEqual(Array.from(result.dropped),['4th Grade']);assert.equal(result.equal,0);assert.deepEqual(h.errors,[]);
});
