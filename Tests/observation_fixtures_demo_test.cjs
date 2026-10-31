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
for(const product of ['both','batting'])test(product+': a written comment saves without any assessment or mode checkbox',async t=>{
 const h=await openDemo({product,role:'coach',journey:'players'},{traceRpc:true});t.after(h.close);await open(h);
 await h.click('#saveStaffMatchFeedback');assert.equal(h.document.querySelector('#saveStaffMatchFeedback').textContent,'Add a comment or answers');assert.equal(h.document.activeElement.id,'staffMatchNote');
 await h.choose('#staffMatchNote','Helpful encouragement from the boundary');
 assert.equal(h.document.querySelector('#staffObservationGeneral').checked,false);
 assert.equal(h.document.querySelector('#saveStaffMatchFeedback').textContent,'Save observation');
 await h.click('#saveStaffMatchFeedback');
 const commands=[...new Map(h.rpcCalls.filter(c=>c.name==='save_individual_fixture_observation').map(c=>[c.args.p_request_id,c])).values()];assert.equal(commands.length,1);assert.equal(commands[0].args.p_values.plan_related,false);assert.equal(commands[0].args.p_values.batting_to_plan,undefined);assert.equal(commands[0].args.p_values.dismissal_classification,undefined);
 assert.equal(h.document.querySelector('#staffDevelopmentForm'),null);assert.match(h.document.querySelector('#developmentOverview').textContent,/Observation saved ✓/);
 await open(h);assert.equal(h.document.querySelector('#staffMatchNote').value,'Helpful encouragement from the boundary');assert.equal(h.document.querySelector('#staffObservationGeneral').checked,true);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('has no plan and general notes do not require a hidden dismissal answer',async t=>{
 for(const mode of ['no_plan','general']){
  const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);await open(h);await h.click('#saveStaffMatchFeedback');
  if(mode==='no_plan')await h.click('input[name="staffBattingToPlan"][value="no_plan"]');
  else{await h.choose('#staffMatchNote','A general match note');await h.click('#staffObservationGeneral');}
  assert.equal(h.document.querySelectorAll('[data-observation-answer-error]').length,0);assert.equal(h.document.querySelector('#saveStaffMatchFeedback').textContent,'Save observation');
  await h.click('#saveStaffMatchFeedback');assert.equal(h.document.querySelector('#staffDevelopmentForm'),null);
  assert.deepEqual(h.errors.map(e=>e.message),[]);
 }
});
test('individual answers and notes save independently and remain unanswered elsewhere',async t=>{
 for(const item of [{selector:'input[name="staffBattingToPlan"][value="mostly"]',field:'batting_to_plan',value:'mostly'},{selector:'input[name="staffDismissalClass"][value="plan_execution"]',field:'dismissal_classification',value:'plan_execution'},{selector:'#staffMatchMainIssue',field:'main_issue',value:'execution'},{selector:'#staffMatchDismissal',field:'innings_note',value:'A useful observation between overs'},{selector:'#staffMatchNextFocus',field:'next_training_focus',value:'Practise calling early'},{selector:'#staffObservationConversation',field:'needs_conversation',value:true}]){
  const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);await open(h);
  if(item.selector.startsWith('input')||item.value===true)await h.click(item.selector);else await h.choose(item.selector,item.value);
  await h.click('#saveStaffMatchFeedback');assert.equal(h.document.querySelector('#staffDevelopmentForm'),null,item.field+' saves on its own');
  await open(h);
  const saved=JSON.parse(h.window.eval('JSON.stringify(fixtureRows.feedback["player-alex"].matches.flatMap(m=>m.coach_feedback||[]).find(n=>n.id===document.getElementById("staffDevelopmentForm").dataset.observationId))'));
  assert.equal(saved[item.field],item.value);if(item.field!=='batting_to_plan')assert.equal(saved.batting_to_plan,null);if(item.field!=='dismissal_classification')assert.equal(saved.dismissal_classification,null);
  assert.deepEqual(h.errors.map(e=>e.message),[]);
 }
});
test('alignment compares only answers that both people supplied',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);
 const compare=(player,coach)=>JSON.parse(h.window.eval('JSON.stringify(developmentAlignment('+JSON.stringify(player)+','+JSON.stringify(coach)+'))'));
 assert.equal(compare({batting_to_plan:'yes',dismissal_classification:'outside_plan'},{batting_to_plan:'yes',dismissal_classification:null}).key,'aligned');
 assert.equal(compare({batting_to_plan:'yes',dismissal_classification:'outside_plan'},{batting_to_plan:null,dismissal_classification:'plan_execution'}).key,'discuss');
 assert.equal(compare({batting_to_plan:'yes'},{batting_to_plan:null,dismissal_classification:'plan_execution'}),null);
});
