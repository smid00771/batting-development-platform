const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));

async function setup(t,{locked=false,loseSave=false}={}){
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 if(!locked)h.window.eval(`{const f=demoSelections.fixtures.find(f=>f.id==='selection-first');f.published=null;f.publication=0;}`);
 else h.window.eval(`demoSelections.fixtures.find(f=>f.id==='selection-first').selection_unlocked_until=null;`);
 await h.window.seReload();h.window.drawSelections();await h.settle();
 const s=h.window.ensureSelections(),f=s.data.fixtures.find(f=>f.id==='selection-first'),player=s.data.roster.find(p=>p.id===f.slots[3].d1),before=plain(f),calls=[],db=h.window.__fixtureDb,original=db.rpc;let lost=false;
 db.rpc=async function(name,args){calls.push({name,args:plain(args)});const result=await original.call(this,name,args);if(loseSave&&!lost&&name==='club_selections_api'&&args.p_action==='save_board'){lost=true;return {data:null,error:{message:'Connection interrupted after saving'}};}return result;};
 return {...h,s,player,before,calls,fixture:()=>s.data.fixtures.find(f=>f.id==='selection-first'),writes:()=>calls.filter(c=>c.name==='club_selections_api'&&c.args.p_action==='save_board')};
}
async function markUnavailable(h){
 await h.click('[data-se-view="availability"]');
 const input=h.document.getElementById('seAvailabilityPlayer');input.focus();input.value=h.player.name;input.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 await h.click('#seAvailabilityMatches [role=option]');
 const day=h.before.details.days[0].date;await h.choose('#seMonth',day.slice(0,7));
 let date=h.document.querySelector(`[data-se-date="${day}"]`);if(date.dataset.seAvailability==='unknown'){date.click();date=h.document.querySelector(`[data-se-date="${day}"]`);}assert.equal(date.dataset.seAvailability,'available');
 date.click();await h.click('#seSaveAvailability');await h.click('[data-se-view="board"]');
}

test('saving unavailability and returning to the real board automatically clears the draft place once',async t=>{
 const h=await setup(t);await markUnavailable(h);
 const current=h.fixture();assert.equal(current.slots[3].d1,null);assert.equal(current.slots[3].d2,h.player.id,'The other day remains selected');
 assert.deepEqual(plain(current.slots.slice(0,3)),h.before.slots.slice(0,3));assert.equal(current.slots.length,h.before.slots.length);assert.equal(h.writes().length,1);assert.equal(h.writes()[0].args.p_data.fixtures[0].revision,h.before.revision);
 const count=h.calls.length;h.window.seBoard();await h.settle();assert.equal(h.calls.length,count,'An unchanged redraw performs no requests');assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('a locked published team keeps its publication and shows the withdrawal for authorised review',async t=>{
 const h=await setup(t,{locked:true});await markUnavailable(h);assert.deepEqual(plain(h.fixture().slots),h.before.slots);assert.deepEqual(plain(h.fixture().published),h.before.published);assert.equal(h.writes().length,0);
 assert.match(h.document.querySelector('[data-se-team="selection-first"]').textContent,/Unavailable/);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('an uncertain automatic removal retries the same revision and request without shifting the line-up',async t=>{
 const h=await setup(t,{loseSave:true});await markUnavailable(h);assert.ok(h.s.pending);assert.equal(h.fixture().slots[3].d1,h.player.id,'Only confirmed state is shown');assert.equal(h.writes().length,1);
 await h.click('#seRetrySave');assert.equal(h.s.pending,null);assert.equal(h.fixture().slots[3].d1,null);assert.equal(h.fixture().slots[3].d2,h.player.id);assert.equal(h.writes().length,2);assert.deepEqual(h.writes()[0].args,h.writes()[1].args);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
