const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
function extract(source,name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(m,name);const rest=source.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
function harness(source,{head=false}={}){
 const dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,requests=[],notices=[],events=[];
 const fixture=id=>({id,published:{details:{grade:id==='one'?'1st Grade':'2nd Grade'}},details:{grade:id==='one'?'1st Grade':'2nd Grade'},slots:[]});
 const s={view:'published',data:{admin:true,head_selector:head,access:{head_selector_id:'head'},fixtures:['one','two'].map(fixture),reviews:['one','two'].map(id=>({id,snapshot:{details:{grade:id==='one'?'1st Grade':'2nd Grade',days:[]},players:[],slots:[],draft_revision:1}}))}};
 const c=vm.createContext({document,FormData:dom.window.FormData,session:{user:{id:head?'head':'admin'}},selectionState:s,currentTab:'teams',ensureSelections:()=>s,recordSelectionDrawer:(kind,values)=>{s.navigationDrawer={kind,...values};},queueMicrotask(){},bindSelectionBackButtons(){},seCanSetup:()=>true,seMountFixtureScores(){},seEsc:String,seDate:String,seFormatLabel:()=>'',seFixtureLocked:()=>true,seFixtureCompleted:()=>false,seToggleFixtureLock:async id=>events.push(['unlock',id]),drawSelections:()=>events.push(['back']),appNavigationBack:callback=>callback(),confirmLeaveSelections:()=>true,seNotice:message=>notices.push(message),seRPC:(action,data)=>new Promise((resolve,reject)=>requests.push({action,data,resolve,reject})),seReload:async()=>{},seMutate:async()=>true});
 vm.runInContext(['seFixtureLockControls','seFixtureEditor','seReviewScreen','sePublishedDates','seClubDate','seMatchConversationClosed','seChat'].map(name=>extract(source,name)).join('\n'),c);
 return {c,s,document,requests,notices,events};
}
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
