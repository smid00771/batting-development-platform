const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {openDemo}=require('./helpers/demo_harness.cjs');
const days=['2099-10-31','2099-11-07'];
const person=(id,available=days,extra={})=>({id,name:id,grade:'2nd Grade',active:true,availability:{available_dates:[...available],unavailable_dates:[]},...extra});
const fixture=(slots,dates=days,extra={})=>({id:'match',details:{grade:'3rd Grade',format:dates.length===2?'long_form':'limited_overs',brackets:dates.length===2,days:dates.map(date=>({date}))},slots,...extra});
function model(file){
 const source=fs.readFileSync(file,'utf8'),context=vm.createContext({});
 for(const name of ['seDayStatus','seUnselectedAvailable']){
  const start=source.indexOf('function '+name+'('),rest=source.slice(start),end=rest.slice(1).search(/\n(?:async )?function /);
  assert.ok(start>=0&&end>=0);vm.runInContext(rest.slice(0,end+1),context);
 }
 return (roster,fixtures,date)=>Array.from(context.seUnselectedAvailable(roster,fixtures,date),p=>p.id);
}
for(const file of ['app.js','demo.html']){
 test(file+': both partners count as selected on either date of a two-day fixture',()=>{
  const list=model(file),roster=['day-one','day-two','spare'].map(id=>person(id)),fixtures=[fixture([{d1:'day-one',d2:'day-two'}])],before=JSON.stringify({roster,fixtures});
  for(const date of days)assert.deepEqual(list(roster,fixtures,date),['spare']);
  assert.equal(JSON.stringify({roster,fixtures}),before,'Reading the list must not change selections or availability');
 });
 test(file+': a half-filled bracket is still selected, including an already-started fixture',()=>{
  const list=model(file),roster=['day-one','day-two','spare'].map(id=>person(id));
  assert.deepEqual(list(roster,[fixture([{d1:null,d2:'day-two'}])],days[0]),['day-one','spare']);
  assert.deepEqual(list(roster,[fixture([{d1:'day-one',d2:null}])],days[1]),['day-two','spare']);
 });
 test(file+': unrelated dates, cancelled games and forfeits do not reserve a player',()=>{
  const list=model(file),roster=['cancelled','forfeit','other-date','selected','spare'].map(id=>person(id));
  const cancelled=fixture([{d1:'cancelled',d2:'cancelled'}]);cancelled.details.cancelled=true;
  const fixtures=[cancelled,fixture([{d1:'forfeit',d2:'forfeit'}],days,{no_play:'won_by_forfeit'}),fixture([{d1:'other-date'}],['2099-11-01']),fixture([{d1:'selected'}],[days[0]])];
  assert.deepEqual(list(roster,fixtures,days[0]),['cancelled','forfeit','other-date','spare']);
 });
 test(file+': availability remains specific to the chosen date, with inactive and unanswered players excluded',()=>{
  const list=model(file),roster=[person('first-only',[days[0]]),person('second-only',[days[1]]),person('inactive',days,{active:false}),person('unset',[]),person('unavailable',days,{availability:{available_dates:days,unavailable_dates:days}})];
  assert.deepEqual(list(roster,[],days[0]),['first-only']);assert.deepEqual(list(roster,[],days[1]),['second-only']);
 });
 test(file+': use current drafts and actual playing days without stale published or second-day assignments',()=>{
  const list=model(file),roster=['current','removed','stale-day-two'].map(id=>person(id));
  const f=fixture([{d1:'current',d2:'stale-day-two'}],[days[0]],{published:{slots:[{d1:'removed'}]}});
  assert.deepEqual(list(roster,[f],days[0]),['removed','stale-day-two']);
 });
}

test('the selector list excludes a Day 2 partner on Day 1 and updates locally when that selection is removed',async t=>{
 const h=await openDemo({product:'select',role:'selector',journey:'selections'},{traceRpc:true});t.after(h.close);
 h.window.eval(`
  const target=demoSelections.fixtures.find(f=>f.id==='selection-first'),dates=target.details.days.map(d=>d.date);
  Object.assign(target,{published:null,publication:0});target.details.brackets=true;
  for(const [id,name] of [['test-first','First Partner'],['test-second','Second Partner'],['test-spare','Unselected Example']]){
   demoSelections.roster.push({...structuredClone(demoSelections.roster[0]),id,name,user_id:null,grade:'2nd Grade',availability:{available_dates:dates,unavailable_dates:[]}});
  }
  target.slots[5]={d1:'test-first',d2:'test-second'};
  selectionState.date=dates[0];selectionState.boardDateChosen=true;
 `);
 await h.window.seReload();h.window.drawSelections();await h.settle();h.rpcCalls.length=0;
 await h.click('#seUnselected');
 const names=()=>Array.from(h.document.querySelectorAll('.se-unselected-row strong'),node=>node.textContent);
 assert.ok(names().includes('Unselected Example'));assert.ok(!names().includes('First Partner'));assert.ok(!names().includes('Second Partner'));
 const date=h.window.ensureSelections().data.fixtures.find(f=>f.id==='selection-first').details.days[1].date;
 await h.choose('#seUnselectedDate',date);
 assert.ok(!names().includes('First Partner'));assert.ok(!names().includes('Second Partner'));
 h.window.ensureSelections().data.fixtures.find(f=>f.id==='selection-first').slots[5].d2=null;
 h.window.seAvailableUnselected();await h.settle();assert.ok(names().includes('Second Partner'));
 assert.deepEqual(h.rpcCalls,[],'Opening the list and changing dates do not request or save data');assert.deepEqual(h.errors,[]);
});
