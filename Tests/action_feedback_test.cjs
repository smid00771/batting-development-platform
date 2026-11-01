const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {openDemo}=require('./helpers/demo_harness.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const moduleReady=import('../action-feedback.js');

test('the first tap responds immediately; repeated taps share the pending action and it works again afterwards',async t=>{
 const {createActionFeedback}=await moduleReady,dom=new JSDOM('<button id="open">Open conversation</button>');t.after(()=>dom.window.close());
 const document=dom.window.document,feedback=createActionFeedback({document}),button=document.querySelector('button');let task=deferred(),calls=0;
 button.onclick=async()=>{calls++;await task.promise;};
 button.click();assert.equal(document.querySelector('#appActionProgress').hidden,false);assert.equal(button.getAttribute('aria-busy'),'true');
 for(let i=0;i<5;i++)button.click();assert.equal(calls,1);
 task.resolve();await tick();assert.equal(document.querySelector('#appActionProgress').hidden,true);assert.equal(button.hasAttribute('aria-busy'),false);
 task=deferred();button.click();assert.equal(calls,2);assert.equal(document.querySelector('#appActionProgress').hidden,false);task.resolve();await tick();
 let changed=false;button.onclick=()=>{changed=true;return false;};button.click();assert.ok(changed);assert.equal(document.querySelector('#appActionProgress').hidden,true);
});

test('new navigation replaces obsolete progress; finishing an old load cannot hide the current one',async t=>{
 const {createActionFeedback}=await moduleReady,dom=new JSDOM('');t.after(()=>dom.window.close());const document=dom.window.document,f=createActionFeedback({document});
 const first=deferred(),next=deferred();let calls=0;
 const a=f.navigate('a',()=>{calls++;return first.promise;});assert.equal(f.navigate('a',()=>{calls++;}),a);assert.equal(calls,1);
 const b=f.navigate('b',()=>next.promise);first.resolve();await a;assert.equal(document.querySelector('#appActionProgress').hidden,false);
 next.resolve();await b;assert.equal(document.querySelector('#appActionProgress').hidden,true);
 await assert.rejects(f.navigate('broken',async()=>{throw Error('Offline');}),/Offline/);assert.equal(document.querySelector('#appActionProgress').hidden,true);
});

test('changing a filter again keeps the latest choice and clears its loading state independently',async t=>{
 const {createActionFeedback}=await moduleReady,dom=new JSDOM('<select><option>a</option><option>b</option></select>');t.after(()=>dom.window.close());
 const document=dom.window.document,f=createActionFeedback({document}),select=document.querySelector('select'),first=deferred(),second=deferred(),values=[];
 select.onchange=async()=>{values.push(select.value);await (values.length===1?first:second).promise;};
 select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));select.value='b';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.deepEqual(values,['a','b']);second.resolve();await tick();assert.equal(select.hasAttribute('aria-busy'),false);assert.equal(document.querySelector('#appActionProgress').hidden,true);
 first.resolve();await tick();assert.equal(select.value,'b');assert.equal(document.querySelector('#appActionProgress').hidden,true);
});

test('read requests deduplicate only within an account, time out, abort, and permit a fresh retry',async()=>{
 const {createCoachingReader}=await moduleReady;let identity='a',calls=0,signal;
 const first=deferred(),read=createCoachingReader({scope:()=>identity,timeoutMs:30,rpc:()=>{calls++;return {abortSignal:s=>{signal=s;return first.promise;}};}});
 const a=read('notes',{id:1});assert.equal(read('notes',{id:1}),a);await assert.rejects(a,/taking too long/);assert.equal(calls,1);assert.ok(signal.aborted);
 const b=read('notes',{id:1});identity='b';const c=read('notes',{id:1});assert.notEqual(b,c);first.resolve({data:{matches:[]}});await Promise.all([b,c]);assert.equal(calls,3);
});

test('player conversation entry shows feedback during a slow read and excludes staff-only downloads',async t=>{
 const h=await openDemo({product:'batting',role:'player'},{traceRpc:true});t.after(h.close);
 const waiting=deferred(),original=h.window.__fixtureRpc,requested=[];let calls=0;
 h.window.__fixtureRpc=async(name,args)=>{requested.push(name);if(name==='get_my_coach_conversations'){calls++;await waiting.promise;}return original(name,args);};
 const before=h.rpcCalls.length,button=h.document.querySelector('#accountCoaching');assert.ok(button);button.click();await tick();
 assert.equal(h.document.querySelector('#appActionProgress').hidden,false);assert.match(h.document.querySelector('#page').textContent,/Loading Coach Conversations/);
 for(let i=0;i<5;i++)button.click();await tick();assert.equal(calls,1);
 waiting.resolve();await h.settle();await tick();
 assert.ok(h.document.querySelector('#sharedCoachingActions'));assert.equal(h.document.querySelector('#appActionProgress').hidden,true);
 const downloads=requested;assert.equal(downloads.filter(x=>x==='get_development_feedback_for_player').length,1);
 for(const name of ['get_player_coaching_actions','get_coach_observation_context','get_player_innings_details','get_player_focus','get_feedback_workspace'])assert.ok(!downloads.includes(name),name);
 assert.deepEqual(h.errors,[]);assert.deepEqual(h.requests,[]);
});

test('a late conversation response cannot replace a newer player screen',async t=>{
 const h=await openDemo({product:'batting',role:'player'});t.after(h.close);const waiting=deferred(),original=h.window.__fixtureRpc;
 h.window.__fixtureRpc=async(name,args)=>{if(name==='get_my_coach_conversations')await waiting.promise;return original(name,args);};
 const opening=h.window.eval('openCoachConversations()');await tick();await h.window.eval("openClubSectionHome('myplan')");
 const page=h.document.querySelector('#page').innerHTML;waiting.resolve();await opening;await h.settle();assert.equal(h.document.querySelector('#page').innerHTML,page);assert.equal(h.document.querySelector('#appActionProgress').hidden,true);
});
