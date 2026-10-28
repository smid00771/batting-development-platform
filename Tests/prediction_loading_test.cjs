const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {openDemo}=require('./helpers/demo_harness.cjs');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const section=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function board(t){
 const {createDeferredController}=await import('../deferred-feature.js');
 const dom=new JSDOM('<main id="page"></main>');t.after(()=>dom.window.close());
 let allowed=true,downloads=0,created=0;const pending=deferred(),mounts=[];
 const c={document:dom.window.document,createDeferredController,club:{id:'club'},session:{user:{id:'user'}},currentTab:'playerhome',myPlayer:{id:'player'},myInningsCache:null,supabase:{},canOpenClubTab:()=>allowed,downloadPredictions:()=>{downloads++;return pending.promise;}};
 c.requestedFeatureScope=()=>JSON.stringify([c.session.user.id,c.club.id,c.currentTab]);
 for(const name of ['clubNavigationRoute','definiteInningsSaveFailure','ensureMyInningsState','esc','formatDateShort','formatLabel','isPlayerUser','mountEngagement','openMyInnings','preparationUuid','recordAppNavigation','renderEngagementShell','renderMyInnings','renderTab','saveClubEditsBeforeNavigation','todayIso','val'])c[name]=()=>{};
 vm.createContext(c);vm.runInContext(section('// BEGIN DEFERRED PREDICTIONS','// END DEFERRED PREDICTIONS').replace(/import\('\.\/prediction-workspace\.js\?v=[^']+'\)/,'downloadPredictions()'),c);
 const module={createPredictionWorkspace(h){created++;const state={...h.initialNavigation.board};let results={...h.initialNavigation.results},dirty=false;
  return {mount:options=>{mounts.push({state:{...state},results:{...results},options,club:h.club.id});},ensureMakeYourCallState:()=>state,serializeCallResultsState:()=>results,restoreCallResultsState:value=>results=value,makeYourCallHasUnsavedChanges:()=>dirty,makeYourCallSavePending:()=>false,confirmLeaveMakeYourCall:()=>!dirty,setDirty:value=>dirty=value};}};
 return {c,pending,module,mounts,dom,allow:value=>allowed=value,counts:()=>({downloads,created})};
}
test('prediction navigation and unsaved-work guards stay free of downloads until opening',async t=>{
 const h=await board(t);assert.equal(h.c.confirmLeaveMakeYourCall(),true);assert.equal(h.c.makeYourCallHasUnsavedChanges(),false);assert.equal(h.c.makeYourCallSavePending(),false);
 h.c.ensureMakeYourCallState().week='2026-10-12';h.c.restoreCallResultsState({view:'history',kind:'weekly',openKind:'weekly',openStart:'2026-10-12'});
 assert.equal(h.c.serializeCallResultsState().view,'history');assert.equal(h.counts().downloads,0);
 h.c.currentTab='make_your_call';const opening=h.c.renderMakeYourCall();await tick();assert.equal(h.counts().downloads,1);h.pending.resolve(h.module);await opening;
 assert.equal(h.mounts[0].state.week,'2026-10-12');assert.equal(h.mounts[0].results.openStart,'2026-10-12');
});
test('prediction route placeholders do not carry another club’s history into first open',async t=>{
 const h=await board(t);h.c.ensureMakeYourCallState().week='2026-10-12';h.c.restoreCallResultsState({view:'history'});h.c.club={id:'other'};
 assert.equal(h.c.ensureMakeYourCallState().week,null);assert.equal(h.c.serializeCallResultsState().view,'board');assert.equal(h.counts().downloads,0);
});
test('denied access and late prediction downloads never open a different screen or account',async t=>{
 const blocked=await board(t);blocked.allow(false);await blocked.c.renderMakeYourCall();assert.equal(blocked.counts().downloads,0);
 for(const change of [h=>h.allow(false),h=>h.c.club={id:'other'},h=>h.c.session={user:{id:'other'}},h=>h.c.currentTab='teams',h=>h.dom.window.document.getElementById('page').remove()]){
  const h=await board(t);h.c.currentTab='make_your_call';const opening=h.c.renderMakeYourCall();await tick();change(h);h.pending.resolve(h.module);await opening;assert.equal(h.mounts.length,0);
 }
});
test('repeated prediction opens share the download; failed downloads offer a working retry',async t=>{
 const h=await board(t);h.c.currentTab='make_your_call';const one=h.c.renderMakeYourCall(),two=h.c.renderMakeYourCall();await tick();assert.equal(h.counts().downloads,1);h.pending.resolve(h.module);await Promise.all([one,two]);assert.equal(h.counts().created,1);assert.equal(h.mounts.length,1);
 const failed=await board(t);failed.c.currentTab='make_your_call';const opening=failed.c.renderMakeYourCall();failed.pending.reject(Error('offline'));await opening;
 assert.match(failed.dom.window.document.getElementById('page').textContent,/could not load/);failed.c.downloadPredictions=async()=>failed.module;failed.dom.window.document.querySelector('button').click();await tick();assert.equal(failed.mounts.length,1);
});
function preparation(t){
 const dom=new JSDOM('<form id="myReflectionForm"><input id="prepDate" value="2099-01-01"><input id="prepFormat"><input id="prepOpposition"><input id="prepInningsNumber"><input id="prepStatus" value="planned"><div id="prepCallPanel"><input id="prepPredictedRuns" disabled><p id="prepCallAvailability"></p><p id="prepCallDeadline"></p></div></form>');t.after(()=>dom.window.close());
 let downloads=0,rpcs=0,enabled=true;const pending=deferred(),c={document:dom.window.document,session:{user:{id:'user'}},club:{id:'club'},myPlayer:{id:'player'},Date,Intl,Math,Number,String,Error,downloadPreparation:()=>{downloads++;return pending.promise;},supabase:{rpc:async()=>{rpcs++;return {data:{settings:{enabled,timezone:'Australia/Sydney'},server_now:'2026-10-29T00:00:00Z'}};}}};
 c.val=id=>c.document.getElementById(id)?.value||'';c.flushPreparationLoadedData=form=>{const render=form.preparationCallRender;form.preparationCallRender=null;render?.();};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'prediction-preparation.js'),'utf8').replace('export function','function'),c);
 vm.runInContext(section('// BEGIN DEFERRED PREPARATION PREDICTIONS','// END DEFERRED PREPARATION PREDICTIONS').replace(/import\('\.\/prediction-preparation\.js\?v=[^']+'\)/,'downloadPreparation()'),c);
 return {c,dom,pending,module:{createPredictionPreparation:c.createPredictionPreparation},enable:value=>enabled=value,counts:()=>({downloads,rpcs})};
}
test('private preparation and published identity guards do not download prediction code',t=>{
 const h=preparation(t),form=h.c.document.getElementById('myReflectionForm');h.c.syncPreparationCall({call_entry:{id:'published'}});
 for(const id of ['prepDate','prepFormat','prepOpposition','prepInningsNumber','prepPredictedRuns'])assert.equal(h.c.document.getElementById(id).disabled,true);
 assert.equal(Object.keys(h.c.preparationPredictionValues(form)).length,0);assert.deepEqual(h.counts(),{downloads:0,rpcs:0});
});
test('preparation loads only its small integration, honours disabled clubs and keeps existing predictions',async t=>{
 const h=preparation(t);h.enable(false);const opening=h.c.loadPreparationCall(null,()=>true);h.pending.resolve(h.module);await opening;
 const form=h.c.document.getElementById('myReflectionForm');assert.match(h.c.document.getElementById('prepCallAvailability').textContent,/not enabled/);assert.equal(h.c.document.getElementById('prepPredictedRuns').disabled,true);assert.equal(Object.keys(h.c.preparationPredictionValues(form)).length,0);assert.deepEqual(h.counts(),{downloads:1,rpcs:1});
 form.preparationPublishedCall=true;h.c.document.getElementById('prepPredictedRuns').value='50';assert.equal(Object.keys(h.c.preparationPredictionValues(form)).length,0);
});
test('late preparation downloads do not fetch data for a replaced form or account',async t=>{
 for(const change of [h=>h.c.session={user:{id:'other'}},h=>h.c.club={id:'other'},h=>h.c.myPlayer={id:'other'},h=>h.c.document.getElementById('myReflectionForm').remove()]){
  const h=preparation(t),opening=h.c.loadPreparationCall(null,()=>true);change(h);h.pending.resolve(h.module);await opening;assert.equal(h.counts().rpcs,0);
 }
});
test('preparation download errors leave private work available and retry can enable predictions',async t=>{
 const h=preparation(t),opening=h.c.loadPreparationCall(null,()=>true);h.pending.reject(Error('offline'));await opening;
 assert.equal(Object.keys(h.c.preparationPredictionValues(h.c.document.getElementById('myReflectionForm'))).length,0);h.c.downloadPreparation=async()=>h.module;h.c.document.querySelector('#prepCallAvailability button').click();await tick();assert.equal(h.c.document.getElementById('prepPredictedRuns').disabled,false);assert.equal(h.counts().rpcs,1);
});
const predictionRpc=name=>/make_your_call|club_prediction|get_my_engagement/.test(name);
const clean=h=>assert.deepEqual(h.errors.map(e=>e.message),[]);
test('ordinary player and selector startup makes no prediction or awards requests',async t=>{
 for(const view of [{product:'both',role:'player',journey:'player_home'},{product:'select',role:'selector',journey:'selections'},{product:'both',role:'admin',journey:'home'}]){
  const h=await openDemo(view,{traceRpc:true});t.after(h.close);assert.deepEqual(h.rpcCalls.filter(x=>predictionRpc(x.name)),[]);clean(h);
 }
});
test('opening predictions retains voting, history navigation and unsaved-change protection',async t=>{
 const h=await openDemo({product:'both',role:'player',journey:'player_home'},{traceRpc:true});t.after(h.close);
 await h.click('[data-tab="make_your_call"]');assert.ok(h.document.getElementById('callResultsHistory'));assert.ok(h.rpcCalls.some(x=>x.name==='get_make_your_call_periods'));
 const toggle=h.document.querySelector('[data-call-toggle]');assert.ok(toggle);await h.click('#'+toggle.id);
 const input=h.document.querySelector('[id^="callVote-"]');input.value='37';input.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 h.window.confirm=()=>false;await h.click('[data-tab="playerhome"]');assert.equal(h.document.querySelector('[id^="callVote-"]').value,'37');
 await h.click('[id^="callSave-"]');assert.ok(h.rpcCalls.some(x=>x.name==='save_make_your_call_vote'));assert.match(h.document.getElementById('callPageStatus').textContent,/Saved/);
 await h.click('#callResultsHistory');assert.ok(h.document.getElementById('predictionResultsHeading'));assert.ok(h.rpcCalls.some(x=>x.name==='get_club_prediction_results'));
 const back=new Promise(resolve=>h.window.addEventListener('popstate',resolve,{once:true}));await h.click('#predictionResultsBack');await back;await h.settle();assert.ok(h.document.getElementById('callResultsHistory'));clean(h);
});
test('unchecking predictions still saves and leaves the normal home free of prediction requests',async t=>{
 const h=await openDemo({product:'both',role:'admin',journey:'home'},{traceRpc:true});t.after(h.close);
 await h.click('[data-tab="make_your_call"]');await h.click('#callEditSettings');const enabled=h.document.getElementById('callEnabled');assert.equal(enabled.checked,true);enabled.checked=false;enabled.dispatchEvent(new h.window.Event('change',{bubbles:true}));
 await h.click('#callSettingsForm button[type="submit"]');assert.match(h.document.getElementById('page').textContent,/not enabled yet/);assert.ok(h.rpcCalls.some(x=>x.name==='save_make_your_call_settings'&&x.args.p_values.enabled===false));
 h.rpcCalls.length=0;await h.click('[data-tab="dashboard"]');assert.deepEqual(h.rpcCalls.filter(x=>predictionRpc(x.name)),[]);clean(h);
});
