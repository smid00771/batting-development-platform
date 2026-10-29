const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

test('every player product has Home, immediate next actions and a visible return Home control',async()=>{
 for(const product of ['select','batting','both']){
  const h=await openDemo({product,role:'player',journey:'player_home'},{traceRpc:true});
  try{
   await h.window.eval(`window.homeRequests=[];const originalHomeRpc=supabase.rpc;supabase.rpc=function(name,args){window.homeRequests.push({name,args});return originalHomeRpc.call(this,name,args);};renderPlayerHome()`);await h.settle();
   const calls=h.window.homeRequests;
   assert.equal(h.document.querySelector('#playerHomeTitle').textContent,'Home');
   assert.ok(h.document.querySelector('#playerHomeShortcut'));
   assert.equal(!!h.document.querySelector('#playerHomePlan'),product!=='select');
   assert.equal(!!h.document.querySelector('#playerHomeAvailability'),product!=='batting');
   assert.ok(calls.some(r=>r.name==='club_selections_api'&&r.args.p_action==='player_link_context'));
   assert.equal(calls.filter(r=>r.name==='club_selections_api'&&r.args.p_action==='context').length,0,'Home does not fetch Selection Board');
   assert.equal(calls.filter(r=>/social|season_stats|prediction|evidence/.test(r.name)).length,0,'Optional engines stay quiet');
   if(product!=='batting'){await h.click('#playerHomeAvailability');assert.equal(h.window.eval('ensureSelections().view'),'availability');await h.click('#playerHomeShortcut');assert.ok(h.document.querySelector('#playerHomeTitle'));}
   assert.deepEqual(h.errors.map(e=>e.message),[]);
  }finally{h.close();}
 }
});

test('unfinished Player Plan comes before Availability; complete plan points straight to Availability',async()=>{
 const h=await openDemo({product:'both',role:'player',journey:'player_home'});
 try{
  await h.window.eval(`localRaw=null;workflow.raw_answers={core:{},formats:{}};renderPlayerHome()`);await h.settle();
  assert.ok(h.document.querySelector('#playerHomePlanStep.is-next'));
  assert.equal(h.document.querySelector('#playerHomeAvailabilityStep.is-next'),null);
  await h.click('#playerHomePlan');assert.equal(h.window.eval('currentTab'),'myplan');
  await h.window.demoNavigate('player_home',{reset:true});await h.settle();
  assert.match(h.document.querySelector('#playerHomePlanStatus').textContent,/Done/);
  assert.ok(h.document.querySelector('#playerHomeAvailabilityStep.is-next'));
  await h.click('#playerHomePlan');assert.ok(h.document.querySelector('#planNextAvailability'));
  await h.click('#planNextAvailability');assert.equal(h.window.eval('ensureSelections().view'),'availability');
 }finally{h.close();}
});

test('name-only prompt confirms one entry, decline persists and another account cannot be claimed',async()=>{
 const h=await openDemo({product:'both',role:'player',journey:'player_home'});
 try{
  await h.window.eval(`const own=demoSelections.roster.find(r=>r.user_id===session.user.id);own.user_id=null;own.account_email=null;renderPlayerHome()`);await h.settle();
  assert.match(h.document.querySelector('#playerHomeIdentity').textContent,/Is this you/);
  await h.click('#declinePlayerName');assert.match(h.document.querySelector('#playerHomeIdentity').textContent,/Club Admin/);
  await h.click('#playerHomeShortcut');assert.equal(h.document.querySelector('#confirmPlayerName'),null);
  await h.window.eval(`demoSelections.linkDeclined={};renderPlayerHome()`);await h.settle();
  await h.click('#confirmPlayerName');assert.equal(h.window.eval('demoSelections.roster.filter(r=>r.user_id===session.user.id).length'),1);
  assert.equal(h.document.querySelector('#confirmPlayerName'),null);
  await h.window.eval(`demoSelections.roster.find(r=>r.user_id===session.user.id).user_id='another-account';renderPlayerHome()`);await h.settle();
  assert.equal(h.document.querySelector('#confirmPlayerName'),null);
 }finally{h.close();}
});

test('unpublished Player Plans do not block Home, Availability or Messages',async()=>{
 const h=await openDemo({product:'both',role:'player',journey:'player_home'});
 try{
  await h.window.eval(`howWeBatVersions=[];renderPlayerHome()`);await h.settle();
  assert.match(h.document.querySelector('#playerHomePlanCopy').textContent,/preparing/);
  assert.ok(h.document.querySelector('#playerHomeAvailability'));
  assert.ok(h.document.querySelector('#playerHomeMessages'));
 }finally{h.close();}
});
