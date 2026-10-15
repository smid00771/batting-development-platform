const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,'../demo.html'),'utf8');
function fn(src,name){let start=src.indexOf('function '+name+'(');assert.ok(start>=0,name);if(src.slice(start-6,start)==='async ')start-=6;const next=src.slice(start+15).search(/\n(?:async )?function /);assert.ok(next>=0,name);return src.slice(start,start+15+next);}
function setup({planning=true}={}){
 const dom=new JSDOM('<main id="page"></main>',{url:'https://example.test'}),document=dom.window.document,state={scope:'club:player',season:'2026',format:'',editId:planning?'prepare:new':'new'},requests=[];
 const recovery={prefix:'test-draft:',forms:new WeakMap(),contexts:new Set(),ttl:14*86400000,maxBytes:400000};
 const markup=()=>`<section id="myReflectionForm"><div><div class="field"><input id="${planning?'prep':'reflection'}Date" value="2026-10-17"></div><select id="${planning?'prep':'reflection'}Format"><option value="limited_overs">Limited Overs</option></select><input id="${planning?'prep':'reflection'}Opposition"></div><textarea id="note"></textarea><button id="saveMyReflection">${planning?'Save preparation':'Save innings'}</button><button id="cancelMyReflection">Cancel</button><span id="myReflectionStatus"></span></section>`;
 const c=vm.createContext({document,Event:dom.window.Event,window:dom.window,localStorage:dom.window.localStorage,queueMicrotask,matchDraftRecovery:recovery,session:{user:{id:'user'}},currentTab:'innings',myInningsSequence:0,myPlayer:{id:'player'},club:{id:'club'},ensureMyInningsState:()=>state,isPlayerUser:()=>true,myInningsCache:{entries:[]},inningsSeason:()=> '2026',todayIso:()=> '2026-10-16',inningsInView:()=>[],preparationEditContext:()=>({planning,record:null}),myInningsStyles:()=>'',FORMATS:[['limited_overs','Limited Overs']],esc:x=>String(x??''),inningsSeasonLabel:x=>x,renderPreparationForm:markup,renderMyReflectionForm:markup,renderWeeklyLoopShell:()=>'',wireQuickChoices(){},captureFeedbackEntryBaseline(){},supabase:{rpc:()=>new Promise(resolve=>requests.push(resolve))},feedbackEntryBaselines:new WeakMap(),refreshPreparationScoringChoices(){},syncPreparationCall(){},inningsCompactDate:x=>x,confirmLeaveFeedbackEntry:()=>true,bindPreparationForm(){document.getElementById('saveMyReflection').onclick=()=>{};},bindMyInningsSave(){document.getElementById('saveMyReflection').onclick=()=>{};},wirePreparationReviews(){},loadPreparationFocus:async()=>{},loadPreparationCall:async()=>{},mountWeeklyLoop:async()=>{},bindCompletePlayerPlanButtons(){},recordAppNavigation(){},clubNavigationRoute(){},revealPendingCoachingUpdate:async()=>{},watchVisibleCoachingNotes(){},matchDraftStart(){},matchDraftPreflight:async()=>{},matchDraftRecoverCommand:async()=>{}});
 const names=['feedbackEntryValues','matchDraftScope','matchDraftKey','matchDraftStorageKeys','matchDraftEntries','matchDraftRead','matchDraftWrite','matchDraftRemove','matchDraftFields','matchDraftSnapshot','matchDraftCapture','matchDraftContext','matchDraftLock','matchDraftShowForm','matchDraftRestoreFields','matchDraftAttachInnings','syncPlayerFixtureSave','wirePlayerFixturePicker','renderMyInnings'];
 for(const name of names)vm.runInContext(fn(source,name),c);
 return {dom,document,c,state,recovery,requests,render:()=>c.renderMyInnings({refresh:false}),save:()=>document.getElementById('saveMyReflection'),cancel:()=>document.getElementById('cancelMyReflection')};
}
for(const planning of [true,false])test(`${planning?'preparation':'innings'} allows Cancel while Save waits for fixture identity`,async()=>{
 const h=setup({planning}),running=h.render();assert.equal(h.save().disabled,true);assert.equal(h.save().textContent,'Loading match…');assert.equal(typeof h.save().onclick,'function');assert.equal(h.cancel().disabled,false);assert.equal(typeof h.cancel().onclick,'function');
 await h.cancel().onclick();assert.equal(h.state.editId,null);assert.equal(h.document.getElementById('myReflectionForm'),null);h.requests.shift()({data:{fixtures:[]}});await running;assert.equal(h.document.getElementById('myReflectionForm'),null);
});
test('typing before fixture response is captured immediately and retained after loading',async()=>{
 const h=setup(),running=h.render(),note=h.document.getElementById('note');note.value='Early preparation';note.dispatchEvent(new h.dom.window.Event('input',{bubbles:true}));
 assert.equal(h.c.matchDraftEntries().length,1);assert.ok(h.c.matchDraftEntries()[0].snapshot.fields.some(f=>f.id==='note'&&f.value==='Early preparation'));
 h.requests.shift()({data:{fixtures:[]}});await running;assert.equal(h.save().disabled,false);assert.equal(note.value,'Early preparation');assert.ok(h.c.matchDraftEntries()[0].snapshot.fields.some(f=>f.id==='playerFixtureChoice'));
});
test('fixture failure keeps a clear Save state and allows retry without losing typed notes',async()=>{
 const h=setup(),running=h.render();h.document.getElementById('note').value='Keep this';h.requests.shift()({error:{message:'Connection interrupted'}});await running;
 assert.equal(h.save().disabled,true);assert.equal(h.save().textContent,'Load matches to save');assert.equal(h.cancel().disabled,false);
 const retry=h.document.querySelector('[data-retry-player-fixtures]').onclick();assert.equal(h.save().textContent,'Loading match…');h.requests.shift()({data:{fixtures:[]}});await retry;assert.equal(h.save().disabled,false);assert.equal(h.document.getElementById('note').value,'Keep this');
});
test('automatic match picker insertion does not create an untouched recovery draft',async()=>{
 const h=setup(),running=h.render();h.requests.shift()({data:{fixtures:[]}});await running;const ctx=h.recovery.forms.get(h.document.getElementById('myReflectionForm'));h.c.matchDraftCapture(ctx);assert.equal(h.c.matchDraftEntries().length,0);
});
test('recovery waits for fixture identity and unlocks Save after restoring safely',async()=>{
 const h=setup(),running=h.render(),form=h.document.getElementById('myReflectionForm'),ctx=h.recovery.forms.get(form);h.document.getElementById('note').value='Recover me';h.c.matchDraftCapture(ctx);const entry=h.c.matchDraftEntries()[0];ctx.adopted=false;h.document.getElementById('note').value='';h.c.matchDraftShowForm(ctx);
 await form.querySelector('[data-draft-restore]').onclick();assert.match(form.querySelector('[data-draft-message]').textContent,/Load your match list/);assert.equal(h.save().disabled,true);
 h.requests.shift()({data:{fixtures:[]}});await running;assert.equal(h.save().disabled,true);assert.equal(form.querySelector('[data-player-fixture]').disabled,true);
 await form.querySelector('[data-draft-restore]').onclick();assert.equal(h.document.getElementById('note').value,'Recover me');assert.equal(h.save().disabled,false);assert.equal(form.querySelector('[data-player-fixture]').disabled,false);
});
test('production and demo share loading and recovery safety',()=>{
 for(const name of ['renderMyInnings','wirePlayerFixturePicker','syncPlayerFixtureSave','matchDraftLock','matchDraftRestoreFields'])assert.equal(fn(source,name),fn(demo,name),name);
});
test('restoring an early draft cannot unlock linked fixture identity fields',async()=>{
 const h=setup(),running=h.render(),form=h.document.getElementById('myReflectionForm'),ctx=h.recovery.forms.get(form);h.document.getElementById('note').value='Saved locally';h.c.matchDraftCapture(ctx);ctx.adopted=false;h.c.matchDraftShowForm(ctx);
 h.requests.shift()({data:{linked_fixture_id:'fixture',fixtures:[{id:'fixture',match_date:'2026-10-17',format_key:'limited_overs',opposition:'Visitors'}]}});await running;await form.querySelector('[data-draft-restore]').onclick();
 assert.equal(h.save().disabled,false);assert.equal(form.querySelector('[data-player-fixture]').disabled,true);for(const id of ['prepDate','prepFormat','prepOpposition'])assert.equal(h.document.getElementById(id).disabled,true,id);assert.equal(h.document.getElementById('prepOpposition').value,'Visitors');
});
