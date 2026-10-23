const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const extract=(source,name)=>{const start=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(start>=0,name);const tail=source.slice(start),end=tail.slice(1).search(/\n(?:async )?function /);return tail.slice(0,end+1);};
const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function harness(file,{seasonCaptain=false}={}){
 const dom=new JSDOM('<main></main>'),document=dom.window.document,calls=[],notices=[];
 const f={id:'fixture',revision:4,details:{grade:'Fifth Grade',grade_group_id:'grade',days:[{date:'2099-10-17'},{date:'2099-10-24'}],brackets:true,match_roles:{d1:{captain_id:'captain',captain_manual:true,keeper_id:'keeper',keeper_manual:false},d2:{captain_id:'captain',captain_manual:true,keeper_id:'keeper',keeper_manual:true}}},slots:[{d1:'captain',d2:'captain'},{d1:'keeper',d2:'keeper'},{d1:'first-day',d2:'second-day'},{d1:'other',d2:'other'}]};
 const state={data:{fixtures:[f],groups:[{id:'grade',name:'Fifth Grade',captain_roster_ids:seasonCaptain?['captain']:[]}],roster:['captain','keeper','first-day','second-day','other'].map(id=>({id,name:id==='captain'?'Robin Hart':id==='keeper'?'Leo James':id,active:true,keeper:id==='keeper'}))}};
 const c=vm.createContext({document,structuredClone,CSS:{escape},ensureSelections:()=>state,seEsc:escape,seOpt:(options,value)=>options.map(([id,label])=>`<option value="${escape(id)}" ${id===value?'selected':''}>${escape(label)}</option>`).join(''),seNotice:note=>notices.push(note),seMutate:async(action,data,options)=>{calls.push(plain({action,data,options}));state.data.fixtures=data.fixtures;render();return true;}});
 const source=fs.readFileSync(file,'utf8');vm.runInContext(['seMatchGroup','seMatchRoles','sePrepareMatch','seMatchRoleFields','seBindMatchRoles'].map(name=>extract(source,name)).join('\n'),c);
 function render(){const current=state.data.fixtures[0];document.querySelector('main').innerHTML=c.seMatchRoleFields(current,c.seMatchRoles(current,state.data));c.seBindMatchRoles();}
 const controls=kind=>[...document.querySelectorAll(`[data-se-match-role="${kind}"]`)];
 const choose=async(kind,day,value)=>{const control=controls(kind).find(el=>el.dataset.seRoleDay===day);assert.ok(control);control.value=value;await control.onchange();};
 render();return {c,dom,document,state,calls,notices,render,controls,choose,fixture:()=>state.data.fixtures[0]};
}
for(const file of ['app.js','demo.html']){
 test(file+': bracketed players do not duplicate a shared season captain or keeper',t=>{
  const h=harness(file,{seasonCaptain:true});t.after(()=>h.dom.window.close());
  assert.equal(h.document.querySelector('[data-se-role-group="captain"]').textContent,'CaptainRobin Hart · season captain');
  assert.equal(h.controls('keeper').length,1);assert.equal(h.controls('keeper')[0].value,'keeper');
  assert.equal(h.controls('keeper')[0].dataset.seRoleAll,'1');
  assert.deepEqual([...h.controls('keeper')[0].options].map(o=>o.value),['','captain','keeper','other','__se_separate_days__']);
 });
 test(file+': captain and keeper collapse independently, including a missing appointment',t=>{
  const h=harness(file);t.after(()=>h.dom.window.close());
  h.fixture().details.match_roles.d2.keeper_id='other';h.render();
  assert.equal(h.controls('captain').length,1);assert.equal(h.controls('keeper').length,2);
  h.fixture().details.match_roles.d2.keeper_id='keeper';h.fixture().details.match_roles.d2.captain_id='other';h.render();
  assert.equal(h.controls('captain').length,2);assert.equal(h.controls('keeper').length,1);
  h.fixture().details.match_roles.d2.captain_id=null;h.render();
  assert.equal(h.controls('captain').length,2);assert.equal(h.controls('captain')[1].value,'');
 });
 test(file+': shared changes save both appointments and retain the previous fixture for Undo',async t=>{
  const h=harness(file);t.after(()=>h.dom.window.close());const before=plain(h.fixture());
  await h.choose('keeper','d1','other');
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'save_board');
  assert.deepEqual(h.calls[0].options.undo,[before]);
  assert.deepEqual(['d1','d2'].map(day=>h.fixture().details.match_roles[day].keeper_id),['other','other']);
  assert.deepEqual(plain(h.fixture().slots),before.slots);assert.equal(h.controls('keeper').length,1);
 });
 test(file+': separate-day editing changes only that day and recombines when the names match',async t=>{
  const h=harness(file);t.after(()=>h.dom.window.close());
  h.fixture().details.match_roles.d2.keeper_manual=false;h.render();
  await h.choose('keeper','d1','__se_separate_days__');assert.equal(h.calls.length,0);
  assert.equal(h.controls('keeper').length,2);assert.equal(h.controls('captain').length,1);
  assert.ok([...h.controls('keeper')[0].options].some(o=>o.value==='first-day'));
  assert.ok(![...h.controls('keeper')[1].options].some(o=>o.value==='first-day'));
  await h.choose('keeper','d1','other');
  assert.deepEqual(['d1','d2'].map(day=>h.fixture().details.match_roles[day].keeper_id),['other','keeper']);
  assert.equal(h.fixture().details.match_roles.d2.keeper_manual,false);
  await h.choose('keeper','d2','other');
  assert.equal(h.controls('keeper').length,1);assert.equal(h.controls('keeper')[0].dataset.seRoleAll,'1');
 });
 test(file+': cancelling separate choices changes no appointments and does not save',async t=>{
  const h=harness(file);t.after(()=>h.dom.window.close());const before=plain(h.fixture());
  await h.choose('captain','d1','__se_separate_days__');assert.equal(h.controls('captain').length,2);
  h.document.querySelector('[data-se-role-collapse]').click();
  assert.equal(h.controls('captain').length,1);assert.deepEqual(plain(h.fixture()),before);assert.equal(h.calls.length,0);
 });
 test(file+': a shared choice cannot appoint a player selected on only one day',async t=>{
  const h=harness(file);t.after(()=>h.dom.window.close());const select=h.controls('keeper')[0];
  select.add(new h.dom.window.Option('First day only','first-day'));await h.choose('keeper','d1','first-day');
  assert.equal(h.calls.length,0);assert.match(h.notices[0],/each applicable day/);
 });
 test(file+': single-day and cancelled fixtures retain their existing appointment behaviour',t=>{
  const h=harness(file);t.after(()=>h.dom.window.close());h.fixture().details.days.length=1;h.render();
  assert.equal(h.controls('captain').length,1);assert.equal(h.controls('keeper').length,1);
  assert.equal(h.controls('keeper')[0].dataset.seRoleAll,'0');assert.ok(![...h.controls('keeper')[0].options].some(o=>o.value==='__se_separate_days__'));
  h.fixture().details.cancelled=true;h.render();assert.equal(h.controls('keeper').length,0);
 });
}
test('delivered Head of Selections demo saves a shared keeper, then a day-specific keeper, with one season captain',async t=>{
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 const query='[data-se-team="selection-second"]',keepers=()=>[...h.document.querySelectorAll(query+' [data-se-match-role="keeper"]')];
 assert.equal(keepers().length,1);assert.match(h.document.querySelector(query+' [data-se-role-group="captain"]').textContent,/Robin Hart/);
 const options=[...keepers()[0].options],original=keepers()[0].value,next=options.find(o=>o.value&&o.value!==original&&o.value!=='__se_separate_days__').value;
 const choose=async(day,value)=>{const control=keepers().find(n=>n.dataset.seRoleDay===day);control.value=value;await control.onchange();await h.settle();};
 await choose('d1',next);
 const saved=()=>plain(h.window.eval('demoSelections.fixtures.find(f=>f.id==="selection-second").details.match_roles'));
 assert.equal(saved().d1.keeper_id,next);assert.equal(saved().d2.keeper_id,next);
 await choose('d1','__se_separate_days__');await choose('d1',original);
 assert.equal(saved().d1.keeper_id,original);assert.equal(saved().d2.keeper_id,next);assert.equal(keepers().length,2);
 assert.equal(h.document.querySelectorAll(query+' [data-se-role-group="captain"] strong').length,1);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
