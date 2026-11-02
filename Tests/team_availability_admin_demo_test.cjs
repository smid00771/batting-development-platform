const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
async function availability(t){
 const h=await openDemo({product:'select',role:'admin',journey:'availability'});t.after(h.close);
 h.window.eval(`
  window.batchCalls=[];window.historyCalls=0;const beforeRpc=supabase.rpc;
  supabase.rpc=async(n,a)=>{if(a.p_action==='availability_batch')window.batchCalls.push(structuredClone(a.p_data));if(a.p_action==='availability_candidates')window.historyCalls++;return beforeRpc(n,a);};
  window.testDay=demoUpcomingSaturday();selectionState.date=window.testDay;
 `);
 await h.click('#seSetAvailabilityDate');return h;
}
const shown=h=>[...h.document.querySelectorAll('[name="unavailable"]')].filter(b=>!b.closest('[data-se-bulk-id]').hidden);
test('whole-club quick workflow stays the default and preserves saved exceptions',async t=>{
 const h=await availability(t);assert.equal(h.document.querySelector('#seBulkMode').value,'group');assert.equal(h.document.querySelector('#seBulkSource').value,'all');
 const p=shown(h)[0];p.click();await h.click('#seSaveDate');assert.equal(h.window.batchCalls.length,1);assert.equal(h.window.batchCalls[0].scope_ids,undefined);assert.equal(h.window.batchCalls[0].make_all_available,true);assert.equal(h.window.historyCalls,0);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('one or several usual teams form the exact saved scope; search never shrinks that scope',async t=>{
 const h=await availability(t);await h.choose('#seBulkSource','usual');assert.equal(shown(h).length,0);assert.equal(h.document.querySelector('#seSaveDate').disabled,true);
 const teamBoxes=[...h.document.querySelectorAll('[name="team"]')];teamBoxes[0].click();teamBoxes[1].click();
 const ids=shown(h).map(p=>p.value);assert.ok(ids.length);const before=plain(h.window.eval('demoSelections.roster.map(p=>({id:p.id,availability:p.availability}))'));
 const search=h.document.querySelector('#seBulkSearch');search.value=shown(h)[0].closest('label').textContent.split(' ')[0];search.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 shown(h)[0].click();await h.click('#seSaveDate');assert.deepEqual([...h.window.batchCalls[0].scope_ids].sort(),ids.sort());
 const after=plain(h.window.eval('demoSelections.roster.map(p=>({id:p.id,availability:p.availability}))'));
 assert.deepEqual(after.filter(p=>!ids.includes(p.id)),before.filter(p=>!ids.includes(p.id)));assert.equal(h.window.historyCalls,0);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('individual Select all shown, deselection and retry change only the chosen players',async t=>{
 const h=await availability(t);await h.choose('#seBulkSource','usual');h.document.querySelector('[name="team"]').click();await h.choose('#seBulkMode','individual');
 await h.click('#seBulkSelectAll');const visible=shown(h);assert.ok(visible.length>1);visible[0].click();const ids=shown(h).filter(b=>b.checked).map(b=>b.value);
 const before=plain(h.window.eval('demoSelections.roster.map(p=>({id:p.id,availability:p.availability}))'));
 h.window.eval(`const saveRpc=supabase.rpc;let lose=true;supabase.rpc=async(n,a)=>{const r=await saveRpc(n,a);if(a.p_action==='availability_batch'&&lose){lose=false;return {data:null,error:{message:'Connection interrupted'}};}return r;};`);
 await h.click('#seSaveDate');assert.ok(h.document.querySelector('#seRetrySave'));await h.click('#seRetrySave');
 assert.deepEqual(plain(h.window.batchCalls[0]),plain(h.window.batchCalls[1]));assert.deepEqual([...h.window.batchCalls[0].available_ids].sort(),ids.sort());assert.deepEqual([...h.window.batchCalls[0].scope_ids].sort(),ids.sort());
 const after=plain(h.window.eval('demoSelections.roster.map(p=>({id:p.id,availability:p.availability}))'));
 assert.deepEqual(after.filter(p=>!ids.includes(p.id)),before.filter(p=>!ids.includes(p.id)));for(const p of after.filter(p=>ids.includes(p.id)))assert.ok(p.availability.available_dates.includes(h.window.testDay));
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('past-team lookup is explicit and excludes unpublished drafts',async t=>{
 const h=await availability(t);assert.equal(h.window.historyCalls,0);
 h.window.eval(`
  const first=demoSelections.fixtures.find(f=>f.published);window.pastGrade=first.details.grade_group_id;
  const past=structuredClone(first);past.id='history339';past.details.days=[{date:'2020-01-04'}];past.published={details:structuredClone(past.details),slots:[{d1:demoSelections.roster[0].id,d2:null}]};past.slots=[{d1:demoSelections.roster[1].id,d2:null}];
  const draft=structuredClone(past);draft.id='draft339';draft.published=null;
  demoSelections.fixtures=[past,draft];demoSelections.result_sources={};
 `);
 await h.choose('#seBulkSource','played');assert.equal(h.window.historyCalls,1);
 const result=await h.window.eval("seRPC('availability_candidates')");assert.deepEqual(result.teams.flatMap(t=>Array.from(t.player_ids)),[h.window.eval('demoSelections.roster[0].id')]);
 await h.choose('#seBulkSource','usual');await h.choose('#seBulkSource','played');assert.equal(h.window.historyCalls,2,'Second call was the explicit test read; changing back reuses the result');assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('Club Admin sees drafts and publishes without acquiring selector editing',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'selections'});t.after(h.close);
 h.window.eval(`const f=demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming');f.published=null;f.publication=0;selectionState.date=f.details.days[0].date;selectionState.boardDateChosen=true;`);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 const context=plain(h.window.eval('selectionState.data'));assert.equal(context.selection_editor,false);assert.ok(context.fixtures.every(f=>f.can_publish&&f.can_edit===false));assert.ok(context.selection_group_access.every(g=>g.can_view));
 assert.equal(h.document.querySelector('[data-se-copylast]'),null);assert.equal(h.document.querySelector('[data-se-clear-team]'),null);
 assert.ok([...h.document.querySelectorAll('[data-se-slot]')].every(b=>b.disabled));
 const bad=await h.window.eval("seRPC('save_board',{request_id:crypto.randomUUID(),fixtures:[]}).then(()=>null,e=>e.message)");assert.match(bad,/Selector access/);
 await h.window.eval("seWithSavedRoles(selectionState.data.fixtures.filter(f=>f.id==='dev-navy-upcoming'),sePublishReview)");await h.settle();assert.equal(h.document.querySelector('#seConfirmPublish').disabled,false);
 if(h.document.querySelector('#seAcknowledge'))await h.click('#seAcknowledge');await h.click('#seConfirmPublish');
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').publication"),1);assert.equal(h.window.eval('selectionState.pending'),null);
 h.window.eval("selectionState.view='board';drawSelections()");await h.settle();
 assert.ok(h.document.querySelector('[data-se-fixture-lock="dev-navy-upcoming"]'));
 await h.click('[data-se-fixture-lock="dev-navy-upcoming"]');
 assert.ok(h.window.eval("demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').selection_unlocked_until"));
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
