const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
const calls=(h,action)=>h.window.reviewCalls.filter(c=>c.p_action===action);

async function setup(t,{locked=false}={}){
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 h.window.testLocked=locked;
 h.window.eval(`
  const ids=['selection-first','selection-second','third-upcoming','fourth-upcoming','dev-navy-upcoming','dev-sky-upcoming'];
  for(const f of demoSelections.fixtures.filter(f=>ids.includes(f.id))){
   f.details=sePrepareMatch(f,{...demoSelections,groups:demoMatchGroups()}).details;
   f.published={details:structuredClone(f.details),slots:structuredClone(f.slots),players:structuredClone(demoSelections.roster)};
   f.publication=1;f.selection_unlocked_until=null;
   if(['third-upcoming','fourth-upcoming'].includes(f.id)){
    [f.slots[2],f.slots[3]]=[f.slots[3],f.slots[2]];
    f.selection_unlocked_until=window.testLocked&&f.id==='third-upcoming'?null:new Date(Date.now()+30*60000).toISOString();
   }
   if(f.id.startsWith('dev-')){f.published=null;f.publication=0;}
  }
  const fixture=demoSelections.fixtures.find(f=>f.id==='third-upcoming');
  selectionState.date=fixture.details.days[0].date;selectionState.boardDateChosen=true;
  window.reviewCalls=[];
  const original=supabase.rpc;
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,reorder(value[k])])):value;
  supabase.rpc=async(name,args)=>{
   if(name==='club_selections_api')window.reviewCalls.push(structuredClone(args));
   const result=await original(name,args);
   return args.p_action==='context'?reorder(result):result;
  };
 `);
 await h.window.eval('seReload()');h.window.eval('drawSelections();recordSelectionNavigation()');await h.settle();
 h.window.reviewCalls.length=0;
 return h;
}

test('upcoming edits have no Lock again; review refreshes once and ignores database JSON key order',async t=>{
 const h=await setup(t);
 for(const id of ['third-upcoming','fourth-upcoming']){
  const card=h.document.querySelector(`[data-se-team="${id}"]`);
  assert.equal(card.querySelector('[data-se-fixture-lock]'),null);
  assert.match(card.textContent,/Review & publish teams to finish/);
 }
 h.window.eval('drawSelections()');await h.settle();assert.equal(calls(h,'context').length,0,'Redraw does not refresh');
 await h.click('#sePublish');
 assert.ok(h.document.querySelector('#sePublishHeading'));
 assert.equal(calls(h,'context').length,1);assert.equal(calls(h,'publication_check').length,1);
 assert.equal(calls(h,'save_board').length,0,'Identical roles are never written just because JSON keys moved');
 assert.deepEqual([...h.document.querySelectorAll('[data-se-publish-team]')].map(b=>b.dataset.sePublishTeam),['third-upcoming','fourth-upcoming','dev-navy-upcoming','dev-sky-upcoming']);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('review sees a newer team from another session without writing the old lineup back',async t=>{
 const h=await setup(t);
 const revision=h.window.eval(`const f=demoSelections.fixtures.find(f=>f.id==='third-upcoming');[f.slots[4],f.slots[5]]=[f.slots[5],f.slots[4]];f.revision++;f.revision;`);
 const slots=h.window.eval("JSON.stringify(demoSelections.fixtures.find(f=>f.id==='third-upcoming').slots)");
 await h.click('#sePublish');
 assert.ok(h.document.querySelector('#seConfirmPublish'));
 assert.equal(h.window.eval("selectionState.data.fixtures.find(f=>f.id==='third-upcoming').revision"),revision);
 assert.equal(h.window.eval("JSON.stringify(selectionState.data.fixtures.find(f=>f.id==='third-upcoming').slots)"),slots);
 assert.equal(calls(h,'save_board').length,0);assert.equal(calls(h,'publish').length,0);
});

test('a previously locked changed team stays visible and can be unlocked in review without reselecting omitted teams',async t=>{
 const h=await setup(t,{locked:true});await h.click('#sePublish');
 const target=h.document.querySelector('[data-se-publish-team="third-upcoming"]');
 assert.equal(target.disabled,true);assert.equal(target.checked,false);
 assert.match(target.closest('.se-publish-team').textContent,/Locked.*unlock before publishing/);
 for(const id of ['fourth-upcoming','dev-navy-upcoming','dev-sky-upcoming'])await h.click(`[data-se-publish-team="${id}"]`);
 await h.click('[data-se-review-unlock="third-upcoming"]');
 assert.ok(h.document.querySelector('#seConfirmPublish'));
 assert.deepEqual([...h.document.querySelectorAll('[data-se-publish-team]:checked')].map(b=>b.dataset.sePublishTeam),['third-upcoming']);
 assert.equal(calls(h,'fixture_lock').length,1);assert.equal(calls(h,'fixture_lock')[0].p_data.unlock,true);
 assert.equal(calls(h,'publish').length,0,'Unlocking never publishes');
 await h.click('#seConfirmPublish');
 assert.deepEqual(plain(calls(h,'publish')[0].p_data.ids),['third-upcoming']);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='third-upcoming').selection_unlocked_until"),null);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='third-upcoming').publication"),2);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='fourth-upcoming').publication"),1);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('all changed teams locked still offers review, and completed locked fixtures stay protected',async t=>{
 const h=await setup(t,{locked:true});
 h.window.eval(`
  const third=demoSelections.fixtures.find(f=>f.id==='third-upcoming');
  demoSelections.fixtures=demoSelections.fixtures.filter(f=>f.id===third.id);
 `);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 assert.ok(h.document.querySelector('#sePublish'));await h.click('#sePublish');
 assert.ok(h.document.querySelector('[data-se-review-unlock="third-upcoming"]'));
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,true);
 h.window.eval(`demoSelections.fixtures[0].details.days.forEach(d=>d.date='2000-01-01');selectionState.date='2000-01-01';`);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 assert.equal(h.document.querySelector('#sePublish'),null);
});

test('balance warnings remain readable but do not add a confirmation checkbox or block publication',async t=>{
 const h=await setup(t);
 h.window.eval(`const original=supabase.rpc;supabase.rpc=async(name,args)=>{const result=await original(name,args);if(args.p_action==='publication_check')result.data.fixtures.forEach(f=>f.issues.push({level:'warning',text:'Day 1: only one quick bowler'}));return result;};`);
 await h.click('#sePublish');
 for(const id of ['dev-navy-upcoming','dev-sky-upcoming'])await h.click(`[data-se-publish-team="${id}"]`);
 assert.equal(h.document.querySelector('#seAcknowledge'),null);
 assert.match(h.document.querySelector('#sePublishChecks').textContent,/role and team-balance warnings/);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,false);
 await h.click('#seConfirmPublish');
 assert.deepEqual(plain(calls(h,'publish')[0].p_data.ids),['third-upcoming','fourth-upcoming']);
 assert.equal(calls(h,'publish')[0].p_data.acknowledge_balance,true);
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('double clicking review shares its in-flight read and date navigation rejects the old result',async t=>{
 const h=await setup(t);
 h.window.eval(`
  const original=supabase.rpc;
  supabase.rpc=async(name,args)=>{const result=await original(name,args);if(args.p_action==='context')return new Promise(resolve=>window.releaseReview=()=>resolve(result));return result;};
 `);
 await h.click('#sePublish');await h.click('#sePublish');
 assert.equal(calls(h,'context').length,1);
 const other=[...h.document.querySelector('#seBoardDate').options].find(o=>o.value!==h.document.querySelector('#seBoardDate').value).value;
 await h.choose('#seBoardDate',other);h.window.releaseReview();await h.settle();
 assert.equal(h.document.querySelector('#sePublishHeading'),null);
 assert.equal(h.document.querySelector('#seBoardDate').value,other);
 assert.equal(calls(h,'publication_check').length,0);assert.equal(calls(h,'save_board').length,0);
 assert.equal(h.window.eval('selectionState.publicationChecking'),false);
});

test('a failed fresh read never falls back to publishing or saving the old teams',async t=>{
 const h=await setup(t);
 h.window.eval(`const original=supabase.rpc;supabase.rpc=async(name,args)=>args.p_action==='context'?{data:null,error:{message:'Teams could not be loaded'}}:original(name,args);`);
 await h.click('#sePublish');
 assert.equal(h.document.querySelector('#sePublishHeading'),null);
 assert.match(h.document.querySelector('#seNotice').textContent,/Teams could not be loaded/);
 assert.equal(calls(h,'save_board').length,0);assert.equal(calls(h,'publish').length,0);
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.equal(h.window.eval('selectionState.publicationChecking'),false);
});

test('unlocking without edits offers explicit Relock, sends no publication, and still expires normally',async t=>{
 const h=await setup(t);
 h.window.eval(`
  const f=demoSelections.fixtures.find(f=>f.id==='third-upcoming');
  f.slots=structuredClone(f.published.slots);demoSelections.fixtures=[f];
 `);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 const published=h.window.eval('JSON.stringify(demoSelections.fixtures[0].published)');
 assert.doesNotMatch(h.document.querySelector('#sePage').textContent,/awaiting republication/);
 assert.equal(h.document.querySelector('[data-se-fixture-lock]').textContent,'Relock (if no changes made)');
 await h.click('#sePublish');
 assert.match(h.document.querySelector('#seContent').textContent,/No unpublished changes/);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,true);
 assert.equal(calls(h,'save_board').length,0);assert.equal(calls(h,'publish').length,0);
 const back=new Promise(resolve=>h.window.addEventListener('popstate',resolve,{once:true}));
 await h.click('#seBackBoard');await back;await h.settle();await h.click('[data-se-fixture-lock]');
 assert.equal(calls(h,'fixture_lock').length,1);assert.equal(calls(h,'fixture_lock')[0].p_data.unlock,false);
 assert.equal(h.window.eval('seFixtureLocked(selectionState.data.fixtures[0])'),true);
 assert.equal(h.window.eval('JSON.stringify(demoSelections.fixtures[0].published)'),published);
 await h.click('[data-se-fixture-lock]');
 assert.equal(calls(h,'fixture_lock')[1].p_data.unlock,true);
 assert.equal(h.document.querySelector('[data-se-fixture-lock]').textContent,'Relock (if no changes made)');
 h.window.eval(`demoSelections.fixtures[0].selection_unlocked_until=new Date(Date.now()-1).toISOString();`);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 assert.equal(h.window.eval('seFixtureLocked(selectionState.data.fixtures[0])'),true);
 assert.equal(h.document.querySelector('#sePublish'),null);
 assert.equal(h.window.eval('JSON.stringify(demoSelections.fixtures[0].published)'),published);
 assert.equal(h.window.eval('demoSelections.fixtures[0].publication'),1);
});

test('Relock cannot hide another selector’s newer unpublished changes or trap the board in retry',async t=>{
 const h=await setup(t);
 h.window.eval(`
  const f=demoSelections.fixtures.find(f=>f.id==='third-upcoming');f.slots=structuredClone(f.published.slots);demoSelections.fixtures=[f];
  const original=supabase.rpc;let change=true;
  supabase.rpc=async(name,args)=>{
   if(args.p_action==='fixture_lock'&&change){change=false;[f.slots[4],f.slots[5]]=[f.slots[5],f.slots[4]];f.revision++;}
   return original(name,args);
  };
 `);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 await h.click('[data-se-fixture-lock]');
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.match(h.document.querySelector('#seNotice').textContent,/changed in another session/);
 assert.equal(h.window.eval('seFixtureLocked(selectionState.data.fixtures[0])'),false);
 assert.equal(h.document.querySelector('[data-se-fixture-lock]'),null);
 assert.ok(h.document.querySelector('#sePublish'));
 assert.equal(h.window.eval('demoSelections.fixtures[0].publication'),1);
 assert.equal(calls(h,'publish').length,0);
});
