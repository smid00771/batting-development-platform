const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
function extract(source,name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match,name);const rest=source.slice(match.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(id,date,{slots=[{d1:'a',d2:'b'}],brackets=true,cancelled=false}={}){return {id,revision:7,details:{competition:'Comp',grade:'5th Grade',format:'long',opposition:'Visitors',ground:'Park',meeting:'Meet at 11',overs:null,overs_source:'fixture',days:[{date,start:'12:00'},{date:'2099-11-07',start:'12:00'}],brackets,cancelled,staff:[]},slots};}
function harness(source){
 const dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,requests=[],prompts=[],notices=[];
 const target=fixture('target','2099-10-31'),s={data:{selector:true,access:{timezone:'Australia/Sydney',fixture_defaults:{rows:[]}},members:[],fixtures:[target],roster:[{id:'a',name:'Alex',active:true},{id:'b',name:'Blair',active:true},{id:'c',name:'Casey',active:false}]}};
 let confirmed=true,saved=true;const unavailable=new Set();
 const c=vm.createContext({document,FormData:dom.window.FormData,structuredClone,ensureSelections:()=>s,recordSelectionDrawer(){},queueMicrotask(){},bindSelectionBackButtons(){},seCanSetup:()=>true,seFixtureLocked:()=>false,seEsc:String,seGradeFields:()=>'<select name="grade"><option value="5th Grade">5th Grade</option></select>',SE_FORMATS:[['long','Long']],seOpt:(opts,value)=>opts.map(([v,label])=>`<option value="${v}" ${v===value?'selected':''}>${label}</option>`).join(''),fixtureCorrectionDecorateEditor(){},seReadGrade:()=>({grade:'5th Grade',grade_group_id:null}),seBindGrade(){},confirmLeaveSelections:()=>true,drawSelections(){},seName:id=>s.data.roster.find(p=>p.id===id)?.name||'Unknown',seDate:String,seNotice:message=>notices.push(message),confirm:message=>{prompts.push(message);return confirmed;},seDayStatus:(p,day)=>unavailable.has(p.id+':'+day.date)?'unknown':'available',seMutate:async(action,data,options)=>{requests.push({action,data,options});return saved;}});
 vm.runInContext(['seFixtureEditor','seCopyLast'].map(name=>extract(source,name)).join('\n'),c);
 return {c,s,target,document,requests,prompts,notices,unavailable,confirm:value=>confirmed=value,saved:value=>saved=value,submit:()=>document.getElementById('seFixtureForm').onsubmit({preventDefault(){}})};
}
for(const file of ['app.js','demo.html']){
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
 test(file+': cancelling bracket removal retains both players and does not save',async()=>{
  const h=harness(source);h.c.seFixtureEditor(h.target);h.document.querySelector('[name=brackets]').checked=false;h.confirm(false);await h.submit();
  assert.equal(h.requests.length,0);assert.match(h.prompts[0],/Blair → Alex/);assert.deepEqual(h.target.slots,[{d1:'a',d2:'b'}]);
 });
 test(file+': confirmed bracket removal retains the original fixture in Undo',async()=>{
  const h=harness(source);h.c.seFixtureEditor(h.target);h.document.querySelector('[name=brackets]').checked=false;await h.submit();
  assert.deepEqual(plain(h.requests[0].data.fixtures[0].slots),[{d1:'a',d2:'a'}]);assert.deepEqual(plain(h.requests[0].options.undo),[h.target]);assert.notEqual(h.requests[0].options.undo[0],h.target);assert.equal(h.requests[0].data.fixtures[0].revision,7);
 });
 test(file+': unchanged player pairing does not add an unnecessary warning',async()=>{
  const h=harness(source);h.target.slots=[{d1:'a',d2:'a'}];h.c.seFixtureEditor(h.target);h.document.querySelector('[name=brackets]').checked=false;await h.submit();assert.equal(h.prompts.length,0);assert.equal(h.requests.length,1);
 });
 test(file+': one-day conversion still warns and now retains Undo',async()=>{
  const h=harness(source);h.c.seFixtureEditor(h.target);h.document.querySelector('[name=date1]').value='';await h.submit();assert.match(h.prompts[0],/removes Day 2/);assert.deepEqual(plain(h.requests[0].data.fixtures[0].slots),[{d1:'a',d2:null}]);assert.deepEqual(plain(h.requests[0].options.undo),[h.target]);
 });
 test(file+': copy skips cancelled and empty fixtures and retains eleven positions',async()=>{
  const h=harness(source),played=fixture('played','2099-10-10');played.published={details:structuredClone(played.details),slots:structuredClone(played.slots)};
  const cancelled=fixture('cancelled','2099-10-17',{cancelled:true});cancelled.published={details:structuredClone(cancelled.details),slots:[]};const empty=fixture('empty','2099-10-24',{slots:[]});h.s.data.fixtures.push(played,cancelled,empty);
  await h.c.seCopyLast('target');const copy=h.requests[0].data.fixtures[0];assert.equal(copy.slots.length,11);assert.deepEqual(plain(copy.slots[0]),{d1:'a',d2:'b'});assert.ok(copy.slots.slice(1).every(x=>x.d1===null&&x.d2===null));assert.match(h.prompts[0],/5th Grade · 2099-10-10/);assert.match(h.notices.at(-1),/Copied 5th Grade · 2099-10-10/);assert.deepEqual(plain(h.requests[0].options.undo),[h.target]);
 });
 test(file+': copy uses a coherent published snapshot and preserves availability checks',async()=>{
  const h=harness(source),played=fixture('played','2099-10-10',{slots:[{d1:'c',d2:'c'}]});played.published={details:structuredClone(played.details),slots:[{d1:'a',d2:'b'}]};played.details.grade='Different draft grade';h.s.data.fixtures.push(played);h.unavailable.add('b:2099-11-07');await h.c.seCopyLast('target');assert.deepEqual(plain(h.requests[0].data.fixtures[0].slots[0]),{d1:'a',d2:null});
 });
 test(file+': copy cannot retain a one-day-only player in an unbracketed two-day team',async()=>{
  const h=harness(source);h.target.details.brackets=false;h.s.data.fixtures.push(fixture('played','2099-10-10'));h.unavailable.add('a:2099-11-07');await h.c.seCopyLast('target');assert.deepEqual(plain(h.requests[0].data.fixtures[0].slots[0]),{d1:null,d2:null});
 });
 test(file+': no usable source, rejected confirmation and failed save never claim success',async()=>{
  const h=harness(source);await h.c.seCopyLast('target');assert.equal(h.requests.length,0);assert.match(h.notices.at(-1),/no earlier team/);h.s.data.fixtures.push(fixture('played','2099-10-10'));h.confirm(false);await h.c.seCopyLast('target');assert.equal(h.requests.length,0);h.confirm(true);h.saved(false);await h.c.seCopyLast('target');assert.equal(h.requests.length,1);assert.ok(h.notices.every(x=>!x.startsWith('Copied')));
 });
}
