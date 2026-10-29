const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

async function setup(t){
 const h=await openDemo('selections');t.after(h.close);h.window.scrollBy=()=>{};
 h.window.eval(`{
  const first=demoSelections.fixtures.find(f=>f.id==='selection-first'),second=demoSelections.fixtures.find(f=>f.id==='selection-second');
  const ids=first.slots.slice(2,4).map(s=>s.d1);
  for(let i=0;i<ids.length;i++){first.slots[i+2]={d1:null,d2:null};second.slots[i+8]={d1:ids[i],d2:ids[i]};}
 }`);
 let scans=0;const calculate=h.window.demoConversations;h.window.demoConversations=(...args)=>{scans++;return calculate(...args);};
 const calls=[],rpc=h.window.__fixtureDb.rpc;h.window.__fixtureDb.rpc=async function(name,args){calls.push({name,...args});return rpc.call(this,name,args);};
 await h.window.seReload();h.window.drawSelections();await h.settle();
 return {...h,calls,scans:()=>scans};
}

test('requested reminders persist through refresh, redraw and saved edits without rescanning history',async t=>{
 const h=await setup(t),w=h.window,d=h.document;
 assert.equal(d.querySelectorAll('.se-dropped').length,0);assert.equal(h.scans(),0);
 assert.equal(d.querySelector('#seMore #seShowDropped').textContent,'Show dropped players');
 await h.click('#seShowDropped');assert.equal(h.scans(),1);
 const players=()=>[...d.querySelectorAll('[data-se-conversation]')].map(b=>b.dataset.seConversationPlayer);
 const before=players();assert.equal(before.length,2);assert.equal(d.querySelectorAll('.se-dropped').length,2);
 assert.ok(h.calls.some(c=>c.p_action==='show_dropped'&&c.p_data.ids.includes('selection-second')));
 await h.click('#seRefresh');assert.deepEqual(players(),before);assert.equal(h.scans(),1);
 w.seBoard();await h.settle();assert.deepEqual(players(),before);assert.equal(h.scans(),1);
 const first=w.eval('demoSelections.fixtures.find(f=>f.id==="selection-first")');
 await w.seMutate('save_board',{fixtures:[w.structuredClone(first)]});await h.settle();
 assert.deepEqual(players(),before);assert.equal(h.scans(),1,'Saving teams must not rerun the grade comparison');
 assert.equal(h.calls.some(c=>c.name==='club_season_stats_api'),false);assert.deepEqual(h.errors,[]);
});

test('marking spoken removes only that highlight and stored completion survives another explicit check',async t=>{
 const h=await setup(t),d=h.document;await h.click('#seShowDropped');
 const buttons=[...d.querySelectorAll('[data-se-conversation]')],done=buttons[0].dataset.seConversationPlayer,remaining=buttons[1].dataset.seConversationPlayer;
 await buttons[0].onclick();await h.settle();
 assert.equal(d.querySelectorAll('[data-se-conversation]').length,1);
 assert.equal(d.querySelector('[data-se-conversation]').dataset.seConversationPlayer,remaining);
 assert.equal(d.querySelector('.se-spoken'),null);assert.equal(h.scans(),1,'Marking a captured reminder uses its saved record');
 await h.click('#seRefresh');assert.equal(d.querySelector('[data-se-conversation-player="'+done+'"]'),null);
 await h.click('#seShowDropped');assert.equal(h.scans(),2);assert.equal(d.querySelectorAll('.se-dropped').length,1);
 await d.querySelector('[data-se-conversation]').onclick();await h.settle();assert.equal(d.querySelector('.se-dropped,[data-se-conversation]'),null);
 await h.click('#seShowDropped');assert.match(d.getElementById('seNotice').textContent,/No dropped players/);assert.deepEqual(h.errors,[]);
});

test('saved reminders respect changed availability and teams without creating new comparisons',async t=>{
 const h=await setup(t),w=h.window,d=h.document;await h.click('#seShowDropped');
 const id=d.querySelector('[data-se-conversation]').dataset.seConversationPlayer;
 w.eval(`demoSelections.roster.find(p=>p.id===${JSON.stringify(id)}).availability.unavailable_dates=[demoSelections.fixtures.find(f=>f.id==='selection-second').details.days[0].date]`);
 await h.click('#seRefresh');assert.equal(d.querySelector('[data-se-conversation-player="'+id+'"]'),null);assert.equal(h.scans(),1);
 w.eval("demoSelections.fixtures.find(f=>f.id==='selection-second').details.grade='1st Grade'");
 await h.click('#seRefresh');assert.equal(d.querySelector('.se-dropped'),null);assert.equal(h.scans(),1);assert.deepEqual(h.errors,[]);
});

test('failed capture keeps existing reminders and offers the existing safe retry',async t=>{
 const h=await setup(t),w=h.window,d=h.document;await h.click('#seShowDropped');
 const before=d.querySelectorAll('.se-dropped').length,rpc=w.__fixtureDb.rpc;let fail=true;
 w.__fixtureDb.rpc=async function(name,args){if(fail&&args?.p_action==='show_dropped')throw Error('Connection interrupted');return rpc.call(this,name,args);};
 await h.click('#seShowDropped');assert.equal(d.querySelectorAll('.se-dropped').length,before);assert.ok(d.getElementById('seRetrySave'));assert.equal(h.scans(),1);
 fail=false;await h.click('#seRetrySave');assert.equal(d.getElementById('seRetrySave'),null);assert.equal(d.querySelectorAll('.se-dropped').length,before);assert.deepEqual(h.errors,[]);
});
