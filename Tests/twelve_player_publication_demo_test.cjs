const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
async function setup(t,count=12){
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 h.window.testCount=count;
 h.window.eval(`
  const f=demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming');
  f.published=null;f.publication=0;
  for(let i=11;i<window.testCount;i++){
   const p=structuredClone(demoSelections.roster.find(p=>p.id===f.slots[0].d1));
   p.id='twelve-test-'+i;p.name='Test Extra '+i;p.user_id=null;p.keeper=false;
   demoSelections.roster.push(p);f.slots.push({d1:p.id,d2:f.details.days.length>1?p.id:null});
  }
  window.publishRequests=[];const originalRpc=supabase.rpc;
  supabase.rpc=async(name,args)=>{if(args.p_action==='publish')window.publishRequests.push(structuredClone(args.p_data));return originalRpc(name,args);};
  selectionState.date=f.details.days[0].date;selectionState.boardDateChosen=true;
 `);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 await h.window.eval(`seWithSavedRoles(selectionState.data.fixtures.filter(f=>f.id==='dev-navy-upcoming'),sePublishReview)`);await h.settle();
 return h;
}
test('twelve requires explicit acknowledgement and preserves all twelve in the published team',async t=>{
 const h=await setup(t);
 assert.ok(h.document.querySelector('[data-se-ack-twelve="dev-navy-upcoming"]'));
 assert.match(h.document.querySelector('#sePublishChecks').textContent,/one not batting and one not bowling/);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,false);
 await h.click('#seConfirmPublish');assert.equal(h.window.publishRequests.length,0);
 assert.match(h.document.querySelector('#sePublishStatus').textContent,/Confirm each 12-player team/);
 await h.click('[data-se-ack-twelve]');
 if(h.document.querySelector('#seAcknowledge'))await h.click('#seAcknowledge');
 await h.click('#seConfirmPublish');
 assert.deepEqual(plain(h.window.publishRequests[0].acknowledge_twelve),['dev-navy-upcoming']);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').published.slots.filter(s=>s.d1).length"),12);
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('unchecked teams lose their acknowledgement and thirteen remains blocked',async t=>{
 const h=await setup(t);await h.click('[data-se-publish-team="dev-navy-upcoming"]');
 assert.equal(h.document.querySelector('[data-se-ack-twelve]'),null);assert.equal(h.document.querySelector('#seConfirmPublish').disabled,true);
 await h.click('[data-se-publish-team="dev-navy-upcoming"]');assert.equal(h.document.querySelector('[data-se-ack-twelve]').checked,false);
 const tooMany=await setup(t,13);assert.equal(tooMany.document.querySelector('#seConfirmPublish').disabled,true);
 assert.equal(tooMany.document.querySelector('[data-se-ack-twelve]'),null);
});
test('lost-response retry retains the twelve-player acknowledgement and publishes only once',async t=>{
 const h=await setup(t);
 h.window.eval(`const saveRpc=supabase.rpc;let lose=true;supabase.rpc=async(n,a)=>{const r=await saveRpc(n,a);if(a.p_action==='publish'&&lose){lose=false;return {data:null,error:{message:'Connection lost'}};}return r;};`);
 await h.click('[data-se-ack-twelve]');if(h.document.querySelector('#seAcknowledge'))await h.click('#seAcknowledge');await h.click('#seConfirmPublish');
 assert.ok(h.document.querySelector('#seRetrySave'));const pending=plain(h.window.eval('selectionState.pending.data'));
 assert.deepEqual(pending.acknowledge_twelve,['dev-navy-upcoming']);await h.click('#seRetrySave');
 assert.deepEqual(plain(h.window.publishRequests),[pending,pending]);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').publication"),1);
});
test('a bracketed pair across two days remains eleven per day and needs no twelve-player acknowledgement',async t=>{
 const h=await setup(t,11);
 h.window.eval(`
  const bracketFixture=demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming');
  bracketFixture.details.brackets=true;
  bracketFixture.details.days.push({...bracketFixture.details.days[0]});
  bracketFixture.slots.forEach(s=>s.d2=s.d1);
  const bracketPlayer=structuredClone(demoSelections.roster.find(p=>p.id===bracketFixture.slots[0].d1));
  bracketPlayer.id='bracket-test';bracketPlayer.name='Bracketed Player';bracketPlayer.user_id=null;
  demoSelections.roster.push(bracketPlayer);bracketFixture.slots[0].d2=bracketPlayer.id;
 `);
 await h.window.eval('seReload()');
 await h.window.eval(`seWithSavedRoles(selectionState.data.fixtures.filter(f=>f.id==='dev-navy-upcoming'),sePublishReview)`);await h.settle();
 assert.equal(h.window.eval("new Set(demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').slots.flatMap(s=>[s.d1,s.d2])).size"),12);
 assert.deepEqual(plain(h.window.eval("[0,1].map(day=>seCounts(demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming'),demoSelections.roster,day).players)")),[11,11]);
 assert.equal(h.document.querySelector('[data-se-ack-twelve]'),null);
 assert.equal(h.window.eval("demoSelectionIssues(demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming')).some(i=>i.code==='twelve_team')"),false);
});
test('another selector publishing while the picker is open reloads the locked team and reveals the rejection',async t=>{
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);h.window.scrollBy=()=>{};
 h.window.eval(`const target=demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming');selectionState.date=target.details.days[0].date;selectionState.boardDateChosen=true;`);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 await h.click('[data-se-add-option="dev-navy-upcoming"]');
 const player=h.document.querySelector('[data-se-player]');assert.ok(player);
 h.window.eval(`const rpcBeforeLock=supabase.rpc;supabase.rpc=async(n,a)=>{if(a.p_action==='save_board'){demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').selection_unlocked_until=null;return {data:null,error:{code:'P0001',message:'Published team is locked. The Head of Selections must unlock it before changes'}};}return rpcBeforeLock(n,a);};`);
 await h.click('[data-se-player="'+player.dataset.sePlayer+'"]');
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.equal(h.window.eval('selectionState.active'),null);
 assert.equal(h.document.querySelector('#sePicker'),null);
 assert.equal(h.document.activeElement.id,'seNotice');
 assert.match(h.document.querySelector('#seNotice').textContent,/Team was not changed.*Published team is locked/);
 assert.equal(h.window.eval("seFixtureLocked(selectionState.data.fixtures.find(f=>f.id==='dev-navy-upcoming'))"),true);
 assert.equal(h.window.eval("selectionState.data.fixtures.find(f=>f.id==='dev-navy-upcoming').slots.filter(s=>s.d1).length"),11);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
