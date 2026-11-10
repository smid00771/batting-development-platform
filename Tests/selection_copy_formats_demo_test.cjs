const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));

async function setup(t,{brackets=false}={}){
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 h.window.eval(`
  window.copyCalls=[];
  const copyRpc=supabase.rpc;
  supabase.rpc=(name,args)=>{if(name==='club_selections_api')window.copyCalls.push(structuredClone(args));return copyRpc(name,args);};
  const target=demoSelections.fixtures.find(f=>f.id==='selection-first');
  const previous=demoSelections.fixtures.filter(f=>f.id.startsWith('history-')&&f.details.grade_group_id===target.details.grade_group_id).sort((a,b)=>b.details.days[0].date.localeCompare(a.details.days[0].date))[0];
  Object.assign(previous.details,{format:'limited_overs',overs:50,brackets:false,round:'5'});
  previous.slots=target.slots.map(slot=>({d1:slot.d1,d2:null})).reverse();
  previous.published={details:structuredClone(previous.details),slots:structuredClone(previous.slots)};
  window.copySource=structuredClone(previous);
  Object.assign(target,{published:null,publication:0,published_at:null,selection_unlocked_until:null,selection_unlocked_by:null});
  Object.assign(target.details,{format:'long_form',overs:null,brackets:${brackets},round:'6'});
  target.slots=target.slots.map(()=>({d1:null,d2:null}));
  window.copyTarget=structuredClone(target);
  const dates=target.details.days.map(day=>day.date);
  for(const slot of previous.slots){const p=demoSelections.roster.find(p=>p.id===slot.d1);p.availability.available_dates=[...new Set([...p.availability.available_dates,...dates])];p.availability.unavailable_dates=(p.availability.unavailable_dates||[]).filter(date=>!dates.includes(date));}
  ${brackets?"const absent=demoSelections.roster.find(p=>p.id===previous.slots[0].d1);absent.availability.unavailable_dates.push(dates[1]);":''}
  selectionState.date=dates[0];selectionState.boardDateChosen=true;
 `);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();h.window.copyCalls.length=0;
 return h;
}

test('Copy previous team saves the last limited-overs lineup into both days of the next round and Undo restores the draft',async t=>{
 const h=await setup(t),source=plain(h.window.copySource),target=plain(h.window.copyTarget);
 await h.click('[data-se-copylast="selection-first"]');
 const saved=plain(h.window.eval("selectionState.data.fixtures.find(f=>f.id==='selection-first')"));
 assert.deepEqual(saved.slots,source.slots.map(slot=>({d1:slot.d1,d2:slot.d1})));
 assert.equal(saved.details.format,'long_form');assert.equal(saved.details.round,'6');assert.equal(saved.details.overs,null);assert.deepEqual(saved.details.days,target.details.days);assert.equal(saved.published,null);
 assert.deepEqual(plain(h.window.eval('demoSelections.fixtures.find(f=>f.id===window.copySource.id)')),source);
 assert.match(h.document.querySelector('[data-se-copy-status="selection-first"]').textContent,/Copied 1st Grade.*Day 1: 11\/11.*Day 2: 11\/11/);
 assert.deepEqual(plain(h.window.copyCalls.map(call=>call.p_action)),['save_board','context']);
 await h.click('#seUndo');assert.deepEqual(plain(h.window.eval("selectionState.data.fixtures.find(f=>f.id==='selection-first').slots")),target.slots);
 assert.equal(h.window.copyCalls.filter(call=>call.p_action==='publish').length,0);assert.deepEqual(h.errors.map(error=>error.message),[]);
});

test('copying across formats saves a bracketed day-only player and explains the gap beside the button',async t=>{
 const h=await setup(t,{brackets:true});await h.click('[data-se-copylast="selection-first"]');
 const saved=plain(h.window.eval("selectionState.data.fixtures.find(f=>f.id==='selection-first')"));
 assert.deepEqual(saved.slots[0],{d1:h.window.copySource.slots[0].d1,d2:null});assert.equal(saved.slots.filter(slot=>slot.d1).length,11);assert.equal(saved.slots.filter(slot=>slot.d2).length,10);
 assert.match(h.document.querySelector('[data-se-copy-status="selection-first"]').textContent,/Day 1: 11\/11.*Day 2: 10\/11.*1 unavailable/);
 assert.equal(h.window.eval('selectionState.pending'),null);assert.deepEqual(h.errors.map(error=>error.message),[]);
});

test('all players available only on Day 1 receive a visible Day 2 explanation beside the copy button',async t=>{
 const h=await setup(t);
 h.window.eval(`const dayTwo=window.copyTarget.details.days[1].date;for(const p of demoSelections.roster)p.availability.available_dates=p.availability.available_dates.filter(date=>date!==dayTwo);`);
 await h.window.eval('seReload()');h.window.eval('drawSelections()');await h.settle();h.window.copyCalls.length=0;
 await h.click('[data-se-copylast="selection-first"]');
 const status=h.document.querySelector('[data-se-copy-status="selection-first"]');
 assert.equal(status.hidden,false);assert.equal(status.getAttribute('role'),'alert');assert.equal(h.document.activeElement,status);assert.match(status.textContent,/11 availability not confirmed \(Day 2: .+\).*available on both days/);
 assert.equal(h.window.copyCalls.length,0);assert.deepEqual(plain(h.window.eval("selectionState.data.fixtures.find(f=>f.id==='selection-first').slots")),plain(h.window.copyTarget.slots));assert.deepEqual(h.errors.map(error=>error.message),[]);
});

test('a selector can keep a bracketed pair then copy eleven players, see the numbers warning and undo only the copy',async t=>{
 const h=await setup(t,{brackets:true});
 h.window.eval(`
  const target=demoSelections.fixtures.find(f=>f.id==='selection-first'),dates=target.details.days.map(d=>d.date);
  for(const slot of window.copySource.slots){const p=demoSelections.roster.find(p=>p.id===slot.d1);p.availability.available_dates=[...new Set([...p.availability.available_dates,...dates])];p.availability.unavailable_dates=p.availability.unavailable_dates.filter(d=>!dates.includes(d));}
  for(const [id,name] of [['kept-one','Kept Day One'],['kept-two','Kept Day Two']])demoSelections.roster.push({...structuredClone(demoSelections.roster[0]),id,name,user_id:null,availability:{available_dates:dates,unavailable_dates:[]}});
  target.slots[0]={d1:'kept-one',d2:'kept-two'};window.mergeTarget=structuredClone(target);
 `);
 await h.window.seReload();h.window.drawSelections();await h.settle();h.window.copyCalls.length=0;
 await h.click('[data-se-copylast="selection-first"]');
 const saved=plain(h.window.ensureSelections().data.fixtures.find(f=>f.id==='selection-first')),card=h.document.querySelector('[data-se-team="selection-first"]');
 assert.deepEqual(saved.slots[0],{d1:'kept-one',d2:'kept-two'});assert.equal(saved.slots.length,12);
 assert.deepEqual(saved.slots.slice(1),plain(h.window.copySource.slots).map(slot=>({d1:slot.d1,d2:slot.d1})));
 assert.match(card.querySelector('.se-overflow').textContent,/Day 1: 12 players.*Day 2: 12 players/);assert.match(card.textContent,/Kept Day One.*Kept Day Two/);
 assert.equal(saved.published,null);assert.deepEqual({...plain(saved.details),match_roles:null},{...plain(h.window.mergeTarget.details),match_roles:null});
 await h.click('[data-se-copylast="selection-first"]');assert.equal(h.window.copyCalls.filter(x=>x.p_action==='save_board').length,1);
 await h.click('#seUndo');assert.deepEqual(plain(h.window.ensureSelections().data.fixtures.find(f=>f.id==='selection-first').slots),plain(h.window.mergeTarget.slots));assert.deepEqual(h.errors,[]);
});
