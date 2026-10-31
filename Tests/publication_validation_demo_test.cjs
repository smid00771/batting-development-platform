const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));

async function setup(t){
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 h.window.eval(`
  window.publishCalls=[];window.issueScans=0;
  const realIssues=demoSelectionIssues;demoSelectionIssues=f=>{window.issueScans++;return realIssues(f);};
  const realRpc=supabase.rpc;supabase.rpc=async(name,args)=>{if(name==='club_selections_api')window.publishCalls.push(structuredClone(args));return realRpc(name,args);};
  const draftIds=['selection-first','selection-second','third-upcoming','fourth-upcoming','dev-navy-upcoming','dev-sky-upcoming'];
  for(const f of demoSelections.fixtures.filter(f=>draftIds.includes(f.id))){f.published=null;f.publication=0;}
  selectionState.date=demoSelections.fixtures.find(f=>f.id==='selection-first').details.days[0].date;selectionState.boardDateChosen=true;
  const f=demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming');
  for(const p of demoSelections.roster.filter(p=>f.slots.some(s=>s.d1===p.id)))p.keeper=false;
  f.details.match_roles.d1.keeper_id=null;f.details.match_roles.d1.keeper_manual=false;
 `);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();
 return h;
}
const calls=(h,action)=>h.window.publishCalls.filter(x=>x.p_action===action);
async function review(h){await h.click('#sePublish');assert.ok(h.document.querySelector('#seConfirmPublish'));}

test('quiet board checks once on publication review; missing keeper warns without blocking or extra acknowledgement',async t=>{
 const h=await setup(t);
 assert.equal(h.window.issueScans,0);assert.equal(calls(h,'publication_check').length,0);
 await h.window.renderSelections();await h.settle();assert.equal(h.window.issueScans,0);
 await review(h);
 assert.equal(calls(h,'publication_check').length,1);
 assert.match(h.document.querySelector('#seContent').textContent,/Dev Navy: Day 1: Wicketkeeper not named/);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,false);
 assert.equal(h.document.querySelector('#seAcknowledge'),null);
 assert.equal(h.document.querySelector('[data-se-ack-short]'),null);
 await h.click('#seConfirmPublish');
 assert.equal(calls(h,'publish').length,1);
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.match(h.document.querySelector('#seNotice').textContent,/published ✓.*Wicketkeeper not named: Dev Navy/);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').published.details.match_roles.d1.keeper_id"),null);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('one-off server errors, including invalid appointments, are shown before publishing',async t=>{
 const h=await setup(t);
 h.window.eval(`const rpcWithChecks=supabase.rpc;supabase.rpc=async(name,args)=>{const r=await rpcWithChecks(name,args);if(args.p_action==='publication_check')r.data.fixtures[0].issues.push({level:'error',match_role:true,text:'Day 1: named captain is not selected'});return r;};`);
 await review(h);
 assert.match(h.document.querySelector('#seContent').textContent,/named captain is not selected/);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,true);
 assert.equal(calls(h,'publish').length,0);
});

test('server validation rejection after review releases the save lock and allows correction',async t=>{
 const h=await setup(t);await review(h);
 h.window.eval(`const rejectRpc=supabase.rpc;supabase.rpc=async(name,args)=>args.p_action==='publish'?{data:null,error:{code:'P0001',message:'Fix selection or availability issues before publishing',details:JSON.stringify([{level:'error',text:'Example player is unavailable'}])}}:rejectRpc(name,args);`);
 await h.click('#seConfirmPublish');
 assert.equal(h.window.eval('selectionState.pending'),null);assert.equal(h.document.querySelector('#seRetrySave'),null);
 assert.equal(h.window.eval('selectionState.busy'),false);
 assert.match(h.document.querySelector('#seNotice').textContent,/Teams were not published.*Example player is unavailable/);
 assert.equal(h.document.querySelector('#sePublish').disabled,false);
 assert.equal(h.window.sessionStorage.getItem(h.window.eval("'selections-pending-'+selectionState.key")),null);
});

test('lost successful response retains the same request and retry does not publish twice',async t=>{
 const h=await setup(t);await review(h);
 const before=h.window.eval("demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').publication");
 h.window.eval(`const lostRpc=supabase.rpc;let losePublish=true;supabase.rpc=async(name,args)=>{const r=await lostRpc(name,args);if(args.p_action==='publish'&&losePublish){losePublish=false;return {data:null,error:{message:'Connection lost'}};}return r;};`);
 await h.click('#seConfirmPublish');assert.ok(h.document.querySelector('#seRetrySave'));
 const pending=plain(h.window.eval('selectionState.pending'));assert.equal(pending.action,'publish');
 await h.click('#seRetrySave');
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='dev-navy-upcoming').publication"),before+1);
 assert.deepEqual(plain(calls(h,'publish').map(c=>c.p_data.request_id)),[pending.data.request_id,pending.data.request_id]);
});

test('failed or stale publication checks do not open a confirmation or leave an unconfirmed save',async t=>{
 for(const mode of ['failure','stale']){
  const h=await setup(t);
  h.window.checkMode=mode;
  h.window.eval(`const checkRpc=supabase.rpc;supabase.rpc=async(name,args)=>{const r=await checkRpc(name,args);if(args.p_action==='publication_check'){if(window.checkMode==='failure')return {data:null,error:{message:'Review connection failed'}};r.data.fixtures[0].revision++;}return r;};`);
  await h.click('#sePublish');
  assert.equal(h.document.querySelector('#seConfirmPublish'),null);
  assert.equal(h.window.eval('selectionState.pending'),null);
  assert.match(h.document.querySelector('#seNotice').textContent,mode==='failure'?/Review connection failed/:/team changed while checking/);
  assert.equal(calls(h,'publish').length,0);
 }
});

const seniors=['selection-first','selection-second','third-upcoming','fourth-upcoming'];
const devs=['dev-navy-upcoming','dev-sky-upcoming'];
async function omitDev(h){for(const id of devs)await h.click(`[data-se-publish-team="${id}"]`);}

test('publish four grades, leave unfinished Dev drafts untouched, then publish Dev teams later',async t=>{
 const h=await setup(t);
 const untouched=h.window.eval('JSON.stringify(demoSelections.fixtures.filter(f=>!["selection-first","selection-second","third-upcoming","fourth-upcoming"].includes(f.id)))');
 h.window.eval(`window.incompleteRpc=supabase.rpc;supabase.rpc=async(name,args)=>{const r=await window.incompleteRpc(name,args);if(args.p_action==='publication_check')for(const f of r.data.fixtures.filter(f=>f.id.startsWith('dev-')))f.issues.push({level:'error',text:'Team not ready'});return r;};`);
 await review(h);assert.equal(h.document.querySelectorAll('[data-se-publish-team]').length,6);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,true);
 await omitDev(h);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,false);
 assert.match(h.document.querySelector('#seConfirmPublish').textContent,/Publish 4 teams/);
 assert.doesNotMatch(h.document.querySelector('#sePublishChecks').textContent,/Team not ready|Dev Navy/);
 assert.equal(calls(h,'publication_check').length,1,'Checkboxes reuse the checked snapshot without more requests');
 await h.click('#seConfirmPublish');
 const request=plain(calls(h,'publish')[0].p_data);
 assert.deepEqual(request.ids,seniors);assert.deepEqual(Object.keys(request.revisions),seniors);assert.deepEqual(request.acknowledge_short,[]);
 assert.equal(h.window.eval('JSON.stringify(demoSelections.fixtures.filter(f=>!["selection-first","selection-second","third-upcoming","fourth-upcoming"].includes(f.id)))'),untouched);
 assert.equal(h.window.eval('demoSelections.fixtures.filter(f=>["selection-first","selection-second","third-upcoming","fourth-upcoming"].includes(f.id)).every(f=>!!f.published)'),true);
 h.window.eval(`supabase.rpc=window.incompleteRpc;selectionState.view='board';drawSelections();`);await h.settle();await review(h);
 assert.deepEqual([...h.document.querySelectorAll('[data-se-publish-team]')].map(el=>el.dataset.sePublishTeam),devs);
 await h.click('#seConfirmPublish');assert.deepEqual(plain(calls(h,'publish').at(-1).p_data.ids),devs);
 assert.equal(h.window.eval('demoSelections.fixtures.filter(f=>["selection-first","selection-second","third-upcoming","fourth-upcoming"].includes(f.id)).every(f=>f.publication===1)'),true,'Earlier teams are not republished');
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('no teams checked cannot publish, and short-team acknowledgements follow the chosen teams',async t=>{
 const h=await setup(t);
 h.window.eval(`for(const id of ['dev-navy-upcoming','dev-sky-upcoming'])demoSelections.fixtures.find(f=>f.id===id).slots[10].d1=null;`);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();await review(h);
 assert.equal(h.document.querySelectorAll('[data-se-ack-short]').length,2);
 await omitDev(h);assert.equal(h.document.querySelectorAll('[data-se-ack-short]').length,0);
 for(const id of seniors)await h.click(`[data-se-publish-team="${id}"]`);
 assert.equal(h.document.querySelector('#seConfirmPublish').disabled,true);
 await h.click('#seConfirmPublish');assert.equal(calls(h,'publish').length,0);
 await h.click('[data-se-publish-team="dev-navy-upcoming"]');
 await h.click('#seConfirmPublish');assert.equal(calls(h,'publish').length,0);
 await h.click('[data-se-ack-short="dev-navy-upcoming"]');await h.click('#seConfirmPublish');
 const request=plain(calls(h,'publish')[0].p_data);assert.deepEqual(request.ids,['dev-navy-upcoming']);assert.deepEqual(request.acknowledge_short,['dev-navy-upcoming']);
});

test('a lost partial-publication response retries only the same selected teams',async t=>{
 const h=await setup(t);await review(h);await omitDev(h);
 h.window.eval(`const partialRpc=supabase.rpc;let losePartial=true;supabase.rpc=async(name,args)=>{const r=await partialRpc(name,args);if(args.p_action==='publish'&&losePartial){losePartial=false;return {data:null,error:{message:'Connection lost'}};}return r;};`);
 await h.click('#seConfirmPublish');const pending=plain(h.window.eval('selectionState.pending'));
 assert.deepEqual(pending.data.ids,seniors);assert.ok(h.document.querySelector('#seRetrySave'));
 await h.click('#seRetrySave');assert.equal(h.window.eval('selectionState.pending'),null);
 assert.deepEqual(plain(calls(h,'publish').map(c=>c.p_data)),[pending.data,pending.data]);
 assert.equal(h.window.eval('demoSelections.fixtures.filter(f=>f.id.startsWith("dev-")&&f.id.endsWith("upcoming")).every(f=>f.published===null)'),true);
});
