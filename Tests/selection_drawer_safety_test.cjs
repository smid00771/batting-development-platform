const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {openDemo}=require('./helpers/demo_harness.cjs');
function extract(source,name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(m,name);const rest=source.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
function harness(source,{head=false}={}){
 const dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,requests=[],notices=[],events=[];
 const fixture=id=>({id,published:{details:{grade:id==='one'?'1st Grade':'2nd Grade'}},details:{grade:id==='one'?'1st Grade':'2nd Grade'},slots:[]});
 const s={view:'published',data:{admin:true,head_selector:head,access:{head_selector_id:'head'},fixtures:['one','two'].map(fixture),reviews:['one','two'].map(id=>({id,snapshot:{details:{grade:id==='one'?'1st Grade':'2nd Grade',days:[]},players:[],slots:[],draft_revision:1}}))}};
 const c=vm.createContext({document,FormData:dom.window.FormData,session:{user:{id:head?'head':'admin'}},selectionState:s,currentTab:'teams',ensureSelections:()=>s,recordSelectionDrawer:(kind,values)=>{s.navigationDrawer={kind,...values};},queueMicrotask(){},bindSelectionBackButtons(){},seCanSetup:()=>true,seBoardAccess:()=>false,seMountFixtureScores(){},seEsc:String,seDate:String,seFormatLabel:()=>'',seFixtureLocked:()=>true,seFixtureCompleted:()=>false,seToggleFixtureLock:async id=>events.push(['unlock',id]),drawSelections:()=>events.push(['back']),appNavigationBack:callback=>callback(),confirmLeaveSelections:()=>true,seNotice:message=>notices.push(message),seRPC:(action,data)=>new Promise((resolve,reject)=>requests.push({action,data,resolve,reject})),seReload:async()=>{},seMutate:async()=>true});
 vm.runInContext(['seFixtureLockControls','seRenderFixtureLockControls','seFixtureResultLoaded','seFixtureEditor','seReviewScreen','sePublishedDates','seClubDate','seMatchConversationClosed','seChat'].map(name=>extract(source,name)).join('\n'),c);
 return {c,s,document,requests,notices,events};
}
test('the delivered demo hides completed-board unlocks and keeps emergency corrections usable by its Head',async t=>{
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 await h.choose('#seBoardGroup','sg-senior');const date=h.document.querySelector('#seBoardDate').options[0].value;await h.choose('#seBoardDate',date);
 assert.ok(h.document.querySelector('[data-se-team]'));assert.equal(h.document.querySelector('[data-se-fixture-lock]'),null);
 await h.click('[data-se-edit]');assert.ok(h.document.querySelector('[aria-label="Player scorecard"]'));assert.equal(h.document.querySelector('#seFixturePrimaryLock button'),null);
 const emergency=h.document.querySelector('#seFixtureEmergencyLock details');assert.ok(emergency);assert.equal(emergency.open,false);
 await h.click('#seFixtureEmergencyLock summary');assert.equal(emergency.open,true);await h.click('#seFixtureEmergencyLock [data-se-fixture-lock]');assert.ok(h.document.getElementById('seFixtureForm'));
 await h.click('[data-se-view="board"]');await h.choose('#seBoardDate',date);assert.ok([...h.document.querySelectorAll('[data-se-fixture-lock]')].some(b=>b.textContent==='Lock again'));
 assert.deepEqual(h.errors.map(e=>e.message),[]);assert.deepEqual(h.requests,[],'All demo operations stay simulated');
});
for(const file of ['app.js','demo.html']){
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
 test(file+': non-Head Admin can leave a locked published fixture without gaining unlock rights',()=>{
  const h=harness(source);assert.doesNotThrow(()=>h.c.seFixtureEditor(h.s.data.fixtures[0]));
  assert.match(h.document.querySelector('h2').textContent,/Fixture details/);assert.ok(h.document.getElementById('fixtureResults'));assert.match(h.document.body.textContent,/Published · locked/);
  assert.equal(h.document.querySelector('[data-se-fixture-lock]'),null);h.document.getElementById('seLockedBack').click();assert.deepEqual(h.events,[['back']]);
 });
 test(file+': Head retains the explicit locked-fixture unlock action',async()=>{
  const h=harness(source,{head:true});h.c.seFixtureEditor(h.s.data.fixtures[0]);h.document.querySelector('[data-se-fixture-lock]').click();await Promise.resolve();assert.deepEqual(h.events,[['unlock','one']]);
 });
 test(file+': downloaded completed result moves unlock below scores into a closed emergency option',async()=>{
  const h=harness(source,{head:true}),f=h.s.data.fixtures[0];f.result_complete=true;
  assert.equal(h.c.seFixtureLockControls(f),'','The completed board has no unlock panel');h.c.seFixtureEditor(f);
  const primary=h.document.getElementById('seFixturePrimaryLock'),footer=h.document.getElementById('seFixtureEmergencyLock'),disclosure=footer.querySelector('details');
  assert.equal(primary.textContent,'');assert.equal(disclosure.open,false);assert.equal(disclosure.querySelector('summary').textContent,'Emergency correction');assert.equal(footer.previousElementSibling.id,'fixtureResults');assert.deepEqual(h.events,[]);
  disclosure.open=true;footer.querySelector('[data-se-fixture-lock]').click();await Promise.resolve();assert.deepEqual(h.events,[['unlock','one']]);
 });
 test(file+': upcoming and unfinished games retain normal controls and active correction windows retain Lock again',()=>{
  const h=harness(source,{head:true}),f=h.s.data.fixtures[0];for(const complete of [undefined,false]){f.result_complete=complete;h.c.seFixtureEditor(f);assert.ok(h.document.querySelector('#seFixturePrimaryLock [data-se-fixture-lock]'));assert.equal(h.document.getElementById('seFixtureEmergencyLock').textContent,'');}
  f.result_complete=true;h.c.seFixtureLocked=()=>false;const doc=new JSDOM(h.c.seFixtureLockControls(f)).window.document;assert.equal(doc.querySelector('button').textContent,'Lock again');assert.equal(doc.querySelector('details'),null);
 });
 test(file+': completion does not give non-Heads or view-only group members unlock access',()=>{
  const h=harness(source),f=h.s.data.fixtures[0];f.result_complete=true;h.c.seFixtureEditor(f);assert.equal(h.document.querySelector('[data-se-fixture-lock]'),null);
  Object.assign(h.s.data,{group_permissions_enabled:true,head_selector:true});Object.assign(f,{can_edit:false,can_unlock:true});h.c.seFixtureEditor(f);assert.equal(h.document.querySelector('[data-se-fixture-lock]'),null);
 });
 test(file+': a newly loaded final scorecard updates the drawer immediately and stale loads cannot affect another drawer',()=>{
  const h=harness(source,{head:true}),f=h.s.data.fixtures[0];h.s.key='club';h.c.seFixtureEditor(f);const drawer={scope:h.s.key,drawer:h.s.navigationDrawer,fixtureId:f.id};
  h.c.seFixtureResultLoaded(drawer,{fixture_id:f.id,snapshot_id:'final',scorecard:{status:'completed'}});assert.equal(f.result_complete,true);assert.equal(h.document.querySelector('#seFixturePrimaryLock button'),null);assert.ok(h.document.querySelector('#seFixtureEmergencyLock details:not([open])'));
  h.c.seFixtureResultLoaded(drawer,{fixture_id:f.id,snapshot_id:'playing',scorecard:{status:'in_progress'}});assert.equal(f.result_complete,false);assert.ok(h.document.querySelector('#seFixturePrimaryLock button'));
  h.c.seFixtureResultLoaded(drawer,{fixture_id:'unlinked',snapshot_id:'final',scorecard:{status:'completed'}});assert.equal(f.result_complete,false);
  h.c.seFixtureResultLoaded({...drawer,scope:'another-club'},{fixture_id:f.id,snapshot_id:'final',scorecard:{status:'completed'}});assert.equal(f.result_complete,false);
  h.c.seFixtureEditor(h.s.data.fixtures[1]);h.c.seFixtureResultLoaded(drawer,{fixture_id:f.id,snapshot_id:'final',scorecard:{status:'completed'}});assert.equal(f.result_complete,false);assert.equal(h.document.querySelector('[data-se-fixture-lock]').dataset.seFixtureLock,'two');
 });
 test(file+': old Captain Checks link opens the matching team comments on the board',async()=>{const h=harness(source);await h.c.seReviewScreen('one');assert.equal(h.s.view,'board');assert.equal(h.s.boardCommentOpen,'one');assert.deepEqual(h.events,[['back']]);});
 for(const [name,view] of [['seChat','published']]){
  test(file+': '+name+' does not replace a page opened while comments load',async()=>{
   const h=harness(source);h.s.view=view;const pending=h.c[name]('one');h.s.view='availability';h.s.navigationDrawer=null;h.document.getElementById('seContent').innerHTML='<h2>Your availability</h2>';h.requests[0].resolve([]);await pending;assert.equal(h.document.querySelector('h2').textContent,'Your availability');
  });
  test(file+': '+name+' keeps the newest match when requests finish out of order',async()=>{
   const h=harness(source);h.s.view=view;const first=h.c[name]('one'),second=h.c[name]('two');h.requests[1].resolve([]);await second;assert.match(h.document.querySelector('h2').textContent,/2nd Grade/);h.requests[0].resolve([]);await first;assert.match(h.document.querySelector('h2').textContent,/2nd Grade/);
  });
  test(file+': '+name+' does not leak a stale error into another club or view',async()=>{
   const h=harness(source);h.s.view=view;const pending=h.c[name]('one');h.c.selectionState={data:{}};h.requests[0].reject(Error('Old request failed'));await pending;assert.deepEqual(h.notices,[]);
  });
 }
}
