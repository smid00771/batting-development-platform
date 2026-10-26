const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
function extract(source,name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match,name);const rest=source.slice(match.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(id,date,{slots=[{d1:'a',d2:'b'}],brackets=true,cancelled=false}={}){const end=new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);return {id,revision:7,details:{competition:'Comp',grade:'5th Grade',format:'long_form',opposition:'Visitors',ground:'Park',meeting:'Meet at 11',overs:null,overs_source:'fixture',days:[{date,start:'12:00'},{date:end.toISOString().slice(0,10),start:'12:00'}],brackets,cancelled,staff:[]},slots};}
function harness(source){
 const dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,requests=[],prompts=[],notices=[];
 const target=fixture('target','2099-10-31'),s={data:{selector:true,access:{timezone:'Australia/Sydney',fixture_defaults:{rows:[]}},members:[],fixtures:[target],roster:[{id:'a',name:'Alex',active:true},{id:'b',name:'Blair',active:true},{id:'c',name:'Casey',active:false}]}};
 let confirmed=true,saved=true;const unavailable=new Set();
 const c=vm.createContext({document,FormData:dom.window.FormData,structuredClone,ensureSelections:()=>s,recordSelectionDrawer(){},queueMicrotask(){},bindSelectionBackButtons(){},seCanSetup:()=>true,seFixtureLocked:()=>false,seEsc:String,seGradeFields:()=>'<select name="grade"><option value="5th Grade">5th Grade</option></select>',SE_FORMATS:[['t20','T20'],['limited_overs','Limited Overs'],['long_form','Long-form']],seOpt:(opts,value)=>opts.map(([v,label])=>`<option value="${v}" ${v===value?'selected':''}>${label}</option>`).join(''),fixtureResults:{canLeave:()=>true},fixtureCorrectionDecorateEditor(){},seMountFixtureScores(){},seReadGrade:()=>({grade:'5th Grade',grade_group_id:null}),seBindGrade(){},confirmLeaveSelections:()=>true,drawSelections(){},seName:id=>s.data.roster.find(p=>p.id===id)?.name||'Unknown',seDate:String,seNotice:message=>notices.push(message),confirm:message=>{prompts.push(message);return confirmed;},seDayStatus:(p,day)=>unavailable.has(p.id+':'+day.date)?'unknown':'available',seMutate:async(action,data,options)=>{requests.push({action,data,options});return saved;}});
 vm.runInContext(['seClockMinutes','seMatchDuration','seDayWindow','seOverlap','seFixtureEditor','seCopyState','seCopyControls','seUpdateCopyStatus','seCopyMessage','seCopyLast'].map(name=>extract(source,name)).join('\n'),c);
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
  await h.c.seCopyLast('target');const copy=h.requests[0].data.fixtures[0];assert.equal(copy.slots.length,11);assert.deepEqual(plain(copy.slots[0]),{d1:'a',d2:'b'});assert.ok(copy.slots.slice(1).every(x=>x.d1===null&&x.d2===null));assert.equal(h.prompts.length,0,'Copy works directly without a confirmation dialog');assert.match(h.notices.at(-1),/Copied 5th Grade · 2099-10-10/);assert.deepEqual(plain(h.requests[0].options.undo),[h.target]);
 });
 test(file+': copy permits the same player in separate morning and afternoon T20s',async()=>{
  const h=harness(source),oneDay=(match,start,grade='5th Grade')=>{match.details={...match.details,grade,format:'t20',days:[{date:'2099-10-31',start}]};match.slots=match.slots.map(slot=>({d1:slot.d1,d2:null}));return match;};
  oneDay(h.target,'14:00');const previous=oneDay(fixture('previous','2099-10-10',{slots:[{d1:'a',d2:null}]}),'10:00');previous.details.days[0].date='2099-10-10';const morning=oneDay(fixture('morning','2099-10-31',{slots:[{d1:'a',d2:null}]}),'10:00','Cup morning');h.s.data.fixtures.push(previous,morning);
  await h.c.seCopyLast('target');assert.equal(h.requests[0].data.fixtures[0].slots[0].d1,'a');
 });
 test(file+': copy uses a coherent published snapshot and preserves availability checks',async()=>{
  const h=harness(source),played=fixture('played','2099-10-10',{slots:[{d1:'c',d2:'c'}]});played.published={details:structuredClone(played.details),slots:[{d1:'a',d2:'b'}]};played.details.grade='Different draft grade';h.s.data.fixtures.push(played);h.unavailable.add('b:2099-11-07');await h.c.seCopyLast('target');assert.deepEqual(plain(h.requests[0].data.fixtures[0].slots[0]),{d1:'a',d2:null});
 });
 test(file+': copy selects the morning line-up itself before its result or publication exists',async()=>{
  const h=harness(source),oneDay=(id,start,player='a')=>{const f=fixture(id,'2099-10-31',{slots:[{d1:player,d2:null}]});f.details={...f.details,format:'t20',brackets:false,days:[{date:'2099-10-31',start}]};return f;};
  Object.assign(h.target,oneDay('target','14:00','b'));const morning=oneDay('morning','10:00');h.s.data.fixtures.push(morning);
  await h.c.seCopyLast('target');assert.equal(h.requests.length,1);assert.equal(h.requests[0].data.fixtures[0].slots[0].d1,'a');assert.match(h.notices.at(-1),/10:00/);assert.deepEqual(plain(h.requests[0].options.undo),[h.target]);assert.equal(morning.slots[0].d1,'a');
 });
 test(file+': copy orders same-date games by time and rejects later, overlapping, unknown-time and other-team sources',async()=>{
  const h=harness(source),oneDay=(id,start,player='a')=>{const f=fixture(id,'2099-10-31',{slots:[{d1:player,d2:null}]});f.details={...f.details,grade_group_id:'grade',format:'t20',brackets:false,days:[{date:'2099-10-31',start}]};return f;};
  Object.assign(h.target,oneDay('target','18:00','b'));
  const morning=oneDay('morning','10:00','b'),afternoon=oneDay('afternoon','14:00'),overlap=oneDay('overlap','16:00','c'),later=oneDay('later','22:00','c'),unknown=oneDay('unknown','','c'),other=oneDay('other','14:15','c');other.details.grade_group_id='different-grade';
  h.s.data.fixtures.push(morning,other,afternoon,overlap,later,unknown);await h.c.seCopyLast('target');assert.equal(h.requests[0].data.fixtures[0].slots[0].d1,'a');assert.match(h.notices.at(-1),/14:00/);
  for(const start of ['14:00','16:00','22:00','']){const blocked=harness(source);Object.assign(blocked.target,oneDay('target','14:00','b'));blocked.s.data.fixtures.push(oneDay('source',start));await blocked.c.seCopyLast('target');assert.equal(blocked.requests.length,0,start);}
 });
 test(file+': copy cannot retain a one-day-only player in an unbracketed two-day team',async()=>{
  const h=harness(source);h.target.details.brackets=false;h.s.data.fixtures.push(fixture('played','2099-10-10'));h.unavailable.add('a:2099-11-07');await h.c.seCopyLast('target');assert.equal(h.requests.length,0);assert.match(h.notices.at(-1),/No players copied/);
 });
 test(file+': an old copy button cannot overwrite a published or locked team',async()=>{
  const h=harness(source);h.s.data.fixtures.push(fixture('played','2099-10-10'));h.target.published={details:structuredClone(h.target.details),slots:structuredClone(h.target.slots)};await h.c.seCopyLast('target');assert.equal(h.requests.length,0);assert.equal(h.prompts.length,0);assert.match(h.notices.at(-1),/unpublished/);
  h.target.published=null;h.c.seFixtureLocked=()=>true;await h.c.seCopyLast('target');assert.equal(h.requests.length,0);assert.equal(h.prompts.length,0);
 });
 test(file+': no usable source, rejected confirmation and failed save never claim success',async()=>{
  const h=harness(source);await h.c.seCopyLast('target');assert.equal(h.requests.length,0);assert.match(h.notices.at(-1),/no earlier team/);h.s.data.fixtures.push(fixture('played','2099-10-10'));h.saved(false);await h.c.seCopyLast('target');assert.equal(h.requests.length,1);assert.ok(h.notices.every(x=>!x.startsWith('Copied')));
 });
}

for(const format of ['t20','limited_overs'])test('app: '+format+' hides and excludes bracketing while preserving the existing Day 2 confirmation',async()=>{
 const h=harness(fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8'));h.target.details.format=format;h.c.seFixtureEditor(h.target);
 const control=h.document.querySelector('[name=brackets]');assert.equal(h.document.getElementById('seBrackets').hidden,true);assert.equal(control.disabled,true);
 await h.submit();assert.equal(h.requests[0].data.fixtures[0].details.brackets,false);assert.match(h.prompts[0],/Turning off bracketing/);assert.deepEqual(plain(h.requests[0].options.undo),[h.target]);
});
test('app: bracketing remains a club choice for long-form and follows format changes',()=>{
 const h=harness(fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8'));h.c.seFixtureEditor(h.target);const form=h.document.getElementById('seFixtureForm'),label=h.document.getElementById('seBrackets'),control=form.elements.brackets;
 assert.equal(label.hidden,false);assert.equal(control.disabled,false);assert.equal(control.checked,true);
 form.elements.format.value='t20';form.elements.format.onchange();assert.equal(label.hidden,true);assert.equal(control.disabled,true);
 form.elements.format.value='long_form';form.elements.format.onchange();assert.equal(label.hidden,false);assert.equal(control.disabled,false);assert.equal(control.checked,true);
 form.elements.format.value='';form.elements.format.onchange();assert.equal(label.hidden,true);
});

for(const brackets of [true,false])test('app: copying Dev League skips players selected elsewhere and preserves other teams',async()=>{
 const h=harness(fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8'));h.target.details.brackets=brackets;
 const previous=fixture('previous','2099-10-10'),firsts=fixture('firsts','2099-11-07',{slots:[{d1:brackets?'b':'a',d2:null}]}),thirds=fixture('thirds','2099-10-31',{slots:[{d1:'a',d2:null}]});
 firsts.published={details:structuredClone(firsts.details),slots:structuredClone(firsts.slots)};h.s.data.fixtures.push(previous,firsts,thirds);const before=structuredClone(h.s.data.fixtures);
 await h.c.seCopyLast('target');assert.equal(h.requests.length,0);assert.match(h.notices.at(-1),/No players copied/);assert.deepEqual(h.s.data.fixtures,before,'Copy does not move anyone out of another grade');assert.equal(h.requests.length,0,'An empty copy never overwrites the current draft');
});
test('app: copy keeps unaffected dates, skips duplicate identities and ignores cancelled teams',async()=>{
 const h=harness(fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8'));
 h.s.data.roster.push({id:'alias',name:'  ALEX  ',active:false});
 const previous=fixture('previous','2099-10-10',{slots:[{d1:'a',d2:'b'},{d1:'b',d2:'b'}]}),other=fixture('other','2099-10-31',{slots:[{d1:'alias',d2:null}]}),cancelled=fixture('cancelled','2099-10-31',{cancelled:true,slots:[{d1:'b',d2:'b'}]});h.s.data.fixtures.push(previous,other,cancelled);
 await h.c.seCopyLast('target');const slots=plain(h.requests[0].data.fixtures[0].slots);assert.deepEqual(slots[0],{d1:null,d2:'b'});assert.deepEqual(slots[1],{d1:'b',d2:null},'Same-day duplicates in the source also leave a blank');
});
