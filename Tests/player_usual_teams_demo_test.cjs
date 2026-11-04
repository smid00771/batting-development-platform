const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
test('usual-team checkboxes save several teams, retain them in details and filter either team',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'selections'});t.after(h.close);
 h.window.eval("selectionState.view='roster';drawSelections()");await h.settle();
 const row=h.document.querySelector('[data-se-roster-id]'),id=row.dataset.seRosterId;
 const boxes=[...row.querySelectorAll('[name=usual_grade]')];assert.ok(boxes.length>1);
 const first=boxes.find(b=>b.checked)||boxes[0],second=boxes.find(b=>b!==first);if(!first.checked)first.click();if(!second.checked)second.click();
 const teams=[first.value,second.value];await h.click('#seSaveRosterRoles');
 assert.deepEqual(Array.from(h.window.eval(`seUsualGrades(demoSelections.roster.find(p=>p.id==='${id}'))`)),teams);
 await h.choose('#seRosterGrade','grade:'+second.value.toLowerCase());assert.equal(h.document.querySelector(`[data-se-roster-id="${id}"]`).hidden,false);
 await h.click(`[data-se-edit-player="${id}"]`);assert.deepEqual([...h.document.querySelectorAll('[name=usual_grade]:checked')].map(b=>b.value).sort(),teams.sort());
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('availability includes the same player once when either of their usual teams is chosen',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'availability'});t.after(h.close);
 h.window.eval(`window.multiId=demoSelections.roster[0].id;const teams=seGradeChoices().slice(0,2).map(c=>c.grade);demoSelections.roster[0].usual_grades=teams;demoSelections.roster[0].grade=teams[0];`);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();await h.click('#seSetAvailabilityDate');await h.choose('#seBulkSource','usual');
 const teams=[...h.document.querySelectorAll('[name=team]')];teams[1].click();const id=h.window.multiId;
 const matches=()=>[...h.document.querySelectorAll('[name=unavailable]')].filter(b=>b.value===id&&!b.closest('[data-se-bulk-id]').hidden);
 assert.equal(matches().length,1);teams[0].click();assert.equal(matches().length,1);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
