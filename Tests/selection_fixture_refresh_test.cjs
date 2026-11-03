const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

async function board(t){
 const h=await openDemo('selections');t.after(h.close);
 h.window.scrollBy=()=>{};
 const s=h.window.ensureSelections();
 const calls=[],db=h.window.__fixtureDb,original=db.rpc;
 db.rpc=async function(name,args){calls.push({name,args});return original.call(this,name,args);};
 const reads=()=>calls.filter(r=>r.name==='club_selections_api'&&r.args.p_action==='context').length;
 const stale=()=>{s.lastLoadedAt=Date.now()-660000;s.fixtureRefreshAttemptAt=0;};
 const imported=()=>h.window.eval(`{
  const f=structuredClone(demoSelections.fixtures.find(f=>f.id==='selection-first'));
  f.id='new-fixture-340';f.details.grade='Newly imported Dev League';f.published=null;f.publication=0;
  f.slots=f.slots.map(()=>({d1:null,d2:null}));demoSelections.fixtures.push(f);
 }`);
 return {...h,s,calls,reads,stale,imported};
}

test('date and group changes stay local even with an old fixture list',async t=>{
 const h=await board(t);h.stale();h.imported();const before=h.reads();
 const dates=[...h.document.querySelector('#seBoardDate').options].map(o=>o.value),originalDate=h.s.date;
 for(const date of dates.slice(0,3))await h.choose('#seBoardDate',date);
 await h.choose('#seBoardDate',originalDate);
 const group=h.s.selectionGroup,other=[...h.document.querySelector('#seBoardGroup').options].find(o=>o.value!==group);
 if(other){await h.choose('#seBoardGroup',other.value);await h.choose('#seBoardGroup',group);}
 assert.equal(h.reads(),before,'Changing a date or group must never request a fresh context');
 assert.equal(h.document.querySelector('[data-se-team="new-fixture-340"]'),null);
 assert.deepEqual(h.errors,[]);
});

test('reopening a stale board loads imported fixtures once and keeps fresh navigation quiet',async t=>{
 const h=await board(t);h.stale();h.imported();const before=h.reads();
 await h.click('[data-se-view="availability"]');await h.click('[data-se-view="board"]');
 assert.equal(h.reads(),before+1);assert.ok(h.document.querySelector('[data-se-team="new-fixture-340"]'));
 await h.click('[data-se-view="board"]');await h.click('[data-se-view="availability"]');await h.click('[data-se-view="board"]');
 assert.equal(h.reads(),before+1,'The same ten-minute-old-data gate applies to repeated entry');
 assert.equal(h.document.querySelector('#sePublishedGraphics'),null);
 assert.equal(h.calls.filter(r=>r.name==='club_season_stats_api').length,0);
 assert.deepEqual(h.errors,[]);
});

test('returning after ten minutes away refreshes once; brief switches and fresh data do not',async t=>{
 const h=await board(t);h.stale();h.imported();const before=h.reads();
 h.window.dispatchEvent(new h.window.Event('focus'));await h.settle();assert.equal(h.reads(),before);
 h.s.fixtureAwaySince=Date.now()-540000;h.window.dispatchEvent(new h.window.Event('focus'));await h.settle();assert.equal(h.reads(),before);
 h.s.fixtureAwaySince=Date.now()-660000;h.window.dispatchEvent(new h.window.Event('focus'));await h.settle();
 assert.equal(h.reads(),before+1);assert.ok(h.document.querySelector('[data-se-team="new-fixture-340"]'));
 h.s.fixtureAwaySince=Date.now()-660000;h.window.dispatchEvent(new h.window.Event('focus'));await h.settle();
 assert.equal(h.reads(),before+1,'A newer confirmed context is reused');assert.deepEqual(h.errors,[]);
});

test('editing, pickers, saves and publication defer refresh until the board is safe',async t=>{
 const h=await board(t);h.stale();const before=h.reads();
 for(const key of ['active','busy','pending','formDirty','ordering','publicationChecking','boardPanel','navigationDrawer','restoreDrawer','boardChatOpen','boardCommentOpen']){
  h.s[key]=true;h.window.seRequestFixtureRefresh();await h.settle();assert.equal(h.reads(),before,key);h.s[key]=null;
 }
 h.document.querySelector('#seBoardDate').click();h.document.querySelector('#seBoardGroup').click();await h.settle();
 assert.equal(h.reads(),before,'Date and group controls must not resume a deferred request');
 h.document.body.click();await h.settle();assert.equal(h.reads(),before+1,'One deferred request resumes after editing closes');
 assert.deepEqual(h.errors,[]);
});

test('a late response never replaces work started during the request',async t=>{
 const h=await board(t);h.stale();h.imported();const previous=h.s.data,db=h.window.__fixtureDb,original=db.rpc;
 let release;const waiting=new Promise(r=>release=r);
 db.rpc=async function(name,args){if(name==='club_selections_api'&&args.p_action==='context')await waiting;return original.call(this,name,args);};
 h.window.seRequestFixtureRefresh();await h.settle();assert.equal(h.s.fixtureRefreshRunning,true);
 h.s.active={id:'selection-first',slot:0,day:0};h.s.formDirty=true;release();await h.settle();
 assert.equal(h.s.data,previous);assert.equal(h.document.querySelector('[data-se-team="new-fixture-340"]'),null);
 assert.equal(h.s.formDirty,true);assert.equal(h.s.active.slot,0);assert.equal(h.s.fixtureRefreshRequested,true);
 h.s.active=null;h.s.formDirty=false;h.s.fixtureRefreshAttemptAt=0;h.document.body.click();await h.settle();
 assert.ok(h.document.querySelector('[data-se-team="new-fixture-340"]'));assert.deepEqual(h.errors,[]);
});

test('a confirmed newer read wins over an older automatic response',async t=>{
 const h=await board(t);h.stale();const db=h.window.__fixtureDb,original=db.rpc;let release,first=true;
 const waiting=new Promise(r=>release=r);
 db.rpc=async function(name,args){const result=await original.call(this,name,args);if(first&&name==='club_selections_api'&&args.p_action==='context'){first=false;await waiting;}return result;};
 h.window.seRequestFixtureRefresh();await h.settle();h.imported();
 await h.window.seReload();const newest=h.s.data;release();await h.settle();
 assert.equal(h.s.data,newest);assert.ok(h.s.data.fixtures.some(f=>f.id==='new-fixture-340'));assert.deepEqual(h.errors,[]);
});

test('returning while hidden or after changing account cannot apply a pending response',async t=>{
 const h=await board(t);h.stale();const before=h.reads();
 Object.defineProperty(h.document,'visibilityState',{configurable:true,value:'hidden'});
 h.window.seRequestFixtureRefresh();await h.settle();assert.equal(h.reads(),before);
 Object.defineProperty(h.document,'visibilityState',{configurable:true,value:'visible'});
 const previous=h.s.data,db=h.window.__fixtureDb,original=db.rpc;let release;const waiting=new Promise(r=>release=r);
 db.rpc=async function(name,args){if(name==='club_selections_api'&&args.p_action==='context')await waiting;return original.call(this,name,args);};
 h.window.seRequestFixtureRefresh();await h.settle();h.window.eval('selectionState=null');release();await h.settle();
 assert.equal(h.s.data,previous);assert.equal(h.window.eval('selectionState'),null);assert.deepEqual(h.errors,[]);
});

test('failed refresh preserves the board and retries only on a later eligible action',async t=>{
 const h=await board(t);h.stale();const previous=h.s.data,db=h.window.__fixtureDb,original=db.rpc;let fail=true;
 db.rpc=async function(name,args){if(fail&&name==='club_selections_api'&&args.p_action==='context')throw Error('Offline');return original.call(this,name,args);};
 h.window.seRequestFixtureRefresh();await h.settle();assert.equal(h.s.data,previous);assert.equal(h.s.pending,null);
 const attempted=h.s.fixtureRefreshAttemptAt;h.document.body.click();await h.settle();assert.equal(h.s.fixtureRefreshAttemptAt,attempted);
 fail=false;h.s.fixtureRefreshAttemptAt-=16000;h.window.seRequestFixtureRefresh();await h.settle();
 assert.notEqual(h.s.data,previous);assert.deepEqual(h.errors,[]);
});
