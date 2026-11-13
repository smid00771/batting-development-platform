const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
async function setup(t,{rule='representative',split=false}={}){
 const h=await openDemo({product:'select',role:'head',journey:'selections'},{traceRpc:true});t.after(h.close);h.window.scrollBy=()=>{};
 h.window.eval(`{
  const f=demoSelections.fixtures.find(f=>f.id==='selection-first'),dates=f.details.days.map(d=>d.date);
  f.published=null;f.publication=0;f.published_at=null;f.selection_unlocked_until=null;f.can_edit=true;
  Object.assign(f.details,{format:'long_form',brackets:true,bracket_basis:${JSON.stringify(rule)},bracket_source:'fixture'});
  for(const p of demoSelections.roster){p.availability.available_dates=[...new Set([...p.availability.available_dates,...dates])];p.availability.unavailable_dates=(p.availability.unavailable_dates||[]).filter(d=>!dates.includes(d));}
  const ids=f.slots.map(s=>s.d1);window.repId=ids[2];window.coverId='example-cover';
  demoSelections.roster.push({...structuredClone(demoSelections.roster[0]),id:window.coverId,name:'Example Cover',user_id:null,availability:{available_dates:dates,unavailable_dates:[]}});
  f.slots=f.slots.map(s=>({d1:s.d1,d2:s.d1}));if(${split})f.slots[2].d2=window.coverId;
  selectionState.date=dates[0];selectionState.boardDateChosen=true;
 }`);
 await h.window.seReload();h.window.drawSelections();await h.settle();h.rpcCalls.length=0;
 h.fixture=()=>h.window.ensureSelections().data.fixtures.find(f=>f.id==='selection-first');return h;
}
test('rep-only player picker records the specific absence, closes after confirmation, and supports Undo',async t=>{
 const h=await setup(t);
 await h.click('[data-se-fixture="selection-first"][data-se-slot="2"]');
 assert.equal(h.document.querySelector('#seRepPlayer'),null,'Normal selection adds no field');
 const both=h.document.querySelector('#seBothDays');both.checked=false;both.dispatchEvent(new h.window.Event('change'));
 await h.choose('#sePickDay','1');
 await h.click('[data-se-player="example-cover"]');
 assert.equal(h.fixture().slots[2].d2,h.window.coverId);
 assert.ok(h.document.querySelector('#seRepPlayer'),'After an exceptional split the required choice is immediately visible');
 assert.ok(h.window.demoSelectionIssues(h.fixture()).some(x=>x.code==='rep_bracket_required'));
 await h.choose('#seRepPlayer',h.window.repId);
 const slot=plain(h.fixture().slots[2]);assert.equal(slot.rep_player_id,h.window.repId);assert.equal(slot.rep_absent_date,h.fixture().details.days[1].date);
 assert.equal(h.document.querySelector('#seRepPlayer'),null,'Saved picker closes normally');
 assert.ok(!h.window.demoSelectionIssues(h.fixture()).some(x=>x.code==='rep_bracket_required'));
 assert.match(h.document.querySelector('[data-se-team="selection-first"]').textContent,/rep bracket.*rep cover/s);
 assert.equal(new Set(h.rpcCalls.filter(x=>x.args?.p_action==='save_board').map(x=>x.args.p_data.request_id)).size,2,'Only explicit selections write');
 await h.click('#seUndo');assert.equal(h.fixture().slots[2].rep_player_id,undefined,'Undo removes only the declaration');
 assert.equal(h.fixture().slots[2].d2,h.window.coverId);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('ordinary brackets have no rep field or publication requirement',async t=>{
 const h=await setup(t,{rule:'general',split:true});await h.click('[data-se-fixture="selection-first"][data-se-slot="2"]');
 assert.equal(h.document.querySelector('#seRepPlayer'),null);assert.ok(!h.window.demoSelectionIssues(h.fixture()).some(x=>x.code==='rep_bracket_required'));
});
test('rep choice follows reordering and is cleared when the rep player is replaced',async t=>{
 const h=await setup(t,{split:true});await h.click('[data-se-fixture="selection-first"][data-se-slot="2"]');await h.choose('#seRepPlayer',h.window.repId);
 await h.window.seMoveOrder('selection-first',2,4,h.fixture().revision);await h.settle();assert.equal(h.fixture().slots[4].rep_player_id,h.window.repId);
 await h.click('[data-se-fixture="selection-first"][data-se-slot="4"][data-se-day="0"]');await h.click('#seClearSlot');
 assert.equal(h.fixture().slots[4].d1,null);assert.equal(h.fixture().slots[4].rep_player_id,undefined);assert.equal(h.fixture().slots[4].d2,h.window.coverId);
});
test('fixture date edits expire rep declarations without dropping either player',async t=>{
 const h=await setup(t,{split:true});await h.click('[data-se-fixture="selection-first"][data-se-slot="2"]');await h.choose('#seRepPlayer',h.window.repId);
 const before=plain(h.fixture());h.window.seFixtureEditor(h.fixture());const form=h.document.querySelector('#seFixtureForm');
 const later=new Date(form.elements.date1.value+'T12:00:00Z');later.setUTCDate(later.getUTCDate()+7);const date=later.toISOString().slice(0,10);
 h.window.eval(`for(const p of demoSelections.roster)p.availability.available_dates.push(${JSON.stringify(date)});`);
 form.elements.date1.value=date;await form.onsubmit({preventDefault(){}});await h.settle();
 assert.deepEqual(plain(h.fixture().slots[2]),{d1:before.slots[2].d1,d2:before.slots[2].d2});
});
test('grade defaults save in the existing settings form and populate a new fixture',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'selections'});t.after(h.close);h.window.scrollBy=()=>{};
 h.window.eval("ensureSelections().view='settings';drawSelections();");await h.settle();
 const details=h.document.querySelector('#seFixtureDefaults');assert.ok(details);details.open=true;await h.click('#seAddDefault');
 const row=h.document.querySelector('#seDefaultRows').lastElementChild,key=row.dataset.key,form=h.document.querySelector('#seDefaultsForm');
 const gradeControl=form.elements[key];assert.ok(gradeControl,'Existing grade picker reused');
 await h.choose('[name="'+key+'"]','group:group-first');await h.choose('[name="'+key+'_format"]','long_form');await h.choose('[name="'+key+'_bracket_rule"]','representative');
 await form.onsubmit({preventDefault(){}});await h.settle();
 const rows=h.window.ensureSelections().data.access.fixture_defaults.rows;assert.equal(rows.at(-1).bracket_rule,'representative');
 h.window.seFixtureEditor();const editor=h.document.querySelector('#seFixtureForm');
 await h.choose('[name="grade"]','group:group-first');await h.choose('[name="format"]','long_form');
 assert.equal(editor.elements.brackets.checked,true);assert.equal(editor.elements.bracket_basis.value,'representative');
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
