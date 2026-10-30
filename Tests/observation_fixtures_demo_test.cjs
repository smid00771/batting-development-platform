const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
async function open(h){
 await h.window.eval("(async()=>{currentTab='players';playersWorkspaceSelectedId='player-alex';playersWorkspaceSection='development';playersWorkspaceDevelopmentMode='match';playersWorkspaceDevelopmentMatchId=null;staffObservationEditId=null;await renderPlayersWorkspacePlayer();})()");await h.settle();
 // Select a real demo fixture explicitly; runner and club can have different dates.
 const date=h.window.eval("demoSelections.fixtures.find(f=>f.id==='selection-first').details.days[0].date");
 await h.choose('#staffObservationDate',date);
}
for(const product of ['both','batting'])test(product+': observation uses the saved fixture and reopens the same authored contribution',async t=>{
 const h=await openDemo({product,role:'coach',journey:'players'},{traceRpc:true});t.after(h.close);await open(h);
 const picker=h.document.querySelector('#staffObservationFixture');assert.ok(picker);const fixtureId=picker.value;assert.ok(fixtureId);assert.ok(![...picker.options].some(o=>o.value==='__new__'));
 const before=h.window.eval('demoSelections.fixtures.length');await h.click('#staffObservationGeneral');await h.choose('#staffMatchNote','First shared fixture note');
 // Simulate a committed save whose response was lost. Retrying must use its receipt.
 h.window.eval("window.originalObservationRpc=supabase.rpc;window.observationWrites=[];supabase.rpc=async(name,args)=>{if(name==='save_individual_fixture_observation'){observationWrites.push(structuredClone(args));const out=await originalObservationRpc(name,args);if(observationWrites.length===1&&!out.error)return {error:{message:'Response lost'}};return out;}return originalObservationRpc(name,args);};");
 await h.click('#saveStaffMatchFeedback');assert.equal(h.document.querySelector('#saveStaffMatchFeedback').textContent,'Retry save');assert.equal(h.document.querySelector('#staffObservationDate').disabled,true);
 await h.click('#saveStaffMatchFeedback');assert.equal(h.document.querySelector('#staffDevelopmentForm'),null);
 assert.equal(h.window.eval('demoSelections.fixtures.length'),before,'Saving an observation never creates a fixture');
 const commands=JSON.parse(h.window.eval('JSON.stringify(observationWrites)'));assert.equal(commands.length,2);assert.deepEqual(commands[0],commands[1]);assert.equal(commands[0].p_fixture_id,fixtureId);assert.equal(commands[0].p_values.fixture_id,fixtureId);
 await open(h);assert.equal(h.document.querySelector('#staffMatchNote').value,'First shared fixture note');assert.ok(h.document.querySelector('#staffDevelopmentForm').dataset.observationId);
 const observationId=h.document.querySelector('#staffDevelopmentForm').dataset.observationId;await h.choose('#staffMatchNote','Corrected shared fixture note');await h.click('#saveStaffMatchFeedback');
 const last=JSON.parse(h.window.eval('JSON.stringify(observationWrites.at(-1))'));assert.equal(last.p_observation_id,observationId,'Further work edits the original contribution');assert.equal(h.window.eval('demoSelections.fixtures.length'),before);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('a reopened pending observation confirms the original request before editing',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);await open(h);
 const fixtureId=h.document.querySelector('#staffObservationFixture').value;
 await h.click('#staffObservationGeneral');await h.choose('#staffMatchNote','Kept across reopening');
 h.window.eval("window.originalObservationRpc=supabase.rpc;window.observationWrites=[];supabase.rpc=async(name,args)=>{if(name==='save_individual_fixture_observation'){observationWrites.push(structuredClone(args));const out=await originalObservationRpc(name,args);if(observationWrites.length===1&&!out.error)return {error:{message:'Response lost'}};return out;}return originalObservationRpc(name,args);};");
 await h.click('#saveStaffMatchFeedback');
 await h.window.eval('matchDraftOpen(matchDraftEntries().find(e=>e.command))');await h.settle();
 assert.equal(h.document.querySelector('#staffObservationFixture').value,fixtureId);
 assert.equal(h.document.querySelector('[data-draft-restore]').textContent,'Check previous save');
 assert.equal(h.document.querySelector('#saveStaffMatchFeedback').disabled,true);
 await h.click('[data-draft-restore]');
 assert.equal(h.document.querySelector('#staffMatchNote').value,'Kept across reopening');
 assert.equal(h.document.querySelector('[data-draft-restore]'),null);
 assert.equal(h.document.querySelector('#saveStaffMatchFeedback').disabled,false);
 assert.equal(h.window.eval('matchDraftEntries().filter(e=>e.command).length'),0);
 const commands=JSON.parse(h.window.eval('JSON.stringify(observationWrites)'));assert.equal(commands.length,2);assert.deepEqual(commands[0],commands[1]);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
