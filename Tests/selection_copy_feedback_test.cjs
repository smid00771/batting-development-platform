const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function extract(name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source),rest=source.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
function harness({hold=false,refreshHold=false}={}){
 const dom=new JSDOM('<section id="sePage"><p id="seNotice"></p><main id="seContent"></main></section>',{url:'https://example.test/'}),document=dom.window.document;
 const fixture=(id,date)=>({id,revision:1,details:{grade:'Firsts',grade_group_id:'grade-a',competition:'Association',format:'limited_overs',days:[{date,start:'10:00'}]},slots:Array.from({length:11},()=>({d1:null,d2:null}))});
 const previous=fixture('previous','2099-10-24'),target=fixture('target','2099-10-31');previous.slots[0].d1='a';previous.slots[1].d1='b';target.details.competition='';
 const s={key:'user:club',view:'board',busy:false,pending:null,undo:[],data:{selector:true,fixtures:[previous,target],roster:['a','b','current'].map(id=>({id,name:id,active:true,availability:{available_dates:['2099-10-31']}}))}},requests=[],results=new Map();let stored=structuredClone(s.data),releaseRefresh,c;
 const render=()=>{document.getElementById('seContent').innerHTML=s.data.fixtures.filter(f=>f.id==='target').map(f=>c.seCopyControls(f)).join('');document.querySelector('[data-se-copylast]').onclick=()=>c.seCopyLast('target');if(s.pending)document.querySelectorAll('#seContent button').forEach(b=>b.disabled=true);if(s.pending?.copyLast&&!s.busy)c.seUpdateCopyStatus('target');};
 c=vm.createContext({document,structuredClone,crypto:webcrypto,sessionStorage:dom.window.sessionStorage,currentTab:'teams',selectionEvidence:{pause(){}},ensureSelections:()=>s,selectionState:s,selectionsScopeKey:()=>s.key,seEsc:String,seDate:String,seFixtureLocked:f=>!!f.published||!!f.locked,seGuardFixtureEdit:()=>true,sePrepareMatch:f=>structuredClone(f),drawSelections:render,refreshClubMessageBadge(){},seReload:async()=>{if(refreshHold)await new Promise(r=>releaseRefresh=r);s.data=structuredClone(stored);return true;},seRPC:(action,data)=>new Promise((resolve,reject)=>{
  const finish=(error,commit=false)=>{
   if(error&&!commit){reject(error);return;}
   let result=results.get(data.request_id);
   if(!result){const revisions={};for(const next of data.fixtures){const current=stored.fixtures.find(f=>f.id===next.id);if(current.revision!==next.revision){reject(Object.assign(Error('A team changed in another session'),{code:'P0001'}));return;}revisions[next.id]=next.revision+1;Object.assign(current,structuredClone(next),{revision:revisions[next.id]});}result={saved:true,revisions};results.set(data.request_id,result);}
   error?reject(error):resolve(result);
  };
  requests.push({action,data:plain(data),finish});if(!hold)finish();
 })});
 vm.runInContext(['seClockMinutes','seMatchDuration','seDayWindow','seOverlap','seDayStatus','seNotice','seLock','seButtonWorking','sePersist','seMutate','seTeamPlayerLimit','seCopyState','seCopyControls','seUpdateCopyStatus','seCopyMessage','seCopyLast'].map(extract).join('\n'),c);render();
 return {c,s,target,previous,requests,document,render,button:()=>document.querySelector('[data-se-copylast]'),message:()=>document.querySelector('[data-se-copy-status]').textContent,sync:()=>stored=structuredClone(s.data),releaseRefresh:()=>{refreshHold=false;releaseRefresh();},stored:()=>stored};
}
test('blank competition labels copy by grade identity, with immediate progress until the saved team reloads',async()=>{
 const h=harness({hold:true,refreshHold:true}),before=plain(h.s.data);assert.equal(h.document.querySelector('[data-se-copy-status]').hidden,true);
 const pending=h.c.seCopyLast('target');assert.equal(h.button().textContent,'Copying…');assert.equal(h.button().disabled,true);assert.equal(h.button().getAttribute('aria-busy'),'true');assert.match(h.message(),/Copying previous team/);assert.deepEqual(plain(h.s.data),before,'No optimistic erasure or player replacement');
 await h.c.seCopyLast('target');assert.equal(h.requests.length,1,'Double clicks cannot send another copy');h.requests[0].finish();await new Promise(setImmediate);assert.equal(h.button().textContent,'Copying…');h.releaseRefresh();await pending;
 assert.equal(h.button().textContent,'Copy previous team');assert.equal(h.button().disabled,false);assert.equal(h.button().getAttribute('aria-busy'),'false');assert.match(h.message(),/Copied Firsts.*2099-10-24.*2 of 11 players/);assert.equal(h.s.pending,null);assert.deepEqual(plain(h.s.undo[0].before),[before.fixtures[1]]);
 assert.equal(h.s.data.fixtures[1].slots[0].d1,'a');assert.deepEqual(plain(h.stored().fixtures[0]),before.fixtures[0],'Source team stays intact');
});
test('lost save response offers inline Retry copy, reusing the request and preserving Undo',async()=>{
 const h=harness({hold:true}),first=h.c.seCopyLast('target');h.requests[0].finish(Error('Connection interrupted'),true);await first;
 const requestId=h.s.pending.data.request_id;assert.equal(h.button().textContent,'Retry copy');assert.equal(h.button().disabled,false);assert.match(h.message(),/Copy not confirmed/);assert.equal(h.s.data.fixtures[1].slots[0].d1,null);
 h.s.data.roster[0].availability.available_dates=[]; // A retry must not silently recalculate the saved proposal.
 const retry=h.c.seCopyLast('target');assert.equal(h.requests[1].data.request_id,requestId);assert.deepEqual(h.requests[1].data,h.requests[0].data);h.requests[1].finish();await retry;
 assert.equal(h.s.data.fixtures[1].revision,2);assert.equal(h.s.pending,null);assert.equal(h.s.undo.length,1);assert.match(h.message(),/2 of 11 players/);
});
test('concurrent edits are not overwritten and the error appears beside Copy previous team',async()=>{
 const h=harness({hold:true}),pending=h.c.seCopyLast('target');h.stored().fixtures[1].revision=2;h.stored().fixtures[1].slots[4].d1='current';h.requests[0].finish();await pending;
 assert.equal(h.s.pending,null);assert.match(h.message(),/Team was not changed.*another session/);assert.equal(h.s.data.fixtures[1].slots[4].d1,'current');assert.equal(h.button().disabled,false);
});
test('zero eligible players leaves an existing draft intact and explains why',async()=>{
 const h=harness();h.target.slots[3].d1='current';h.s.data.roster[0].availability.available_dates=[];h.s.data.roster[1].availability.unavailable_dates=['2099-10-31'];h.sync();const before=plain(h.s.data);await h.c.seCopyLast('target');
 assert.equal(h.requests.length,0);assert.deepEqual(plain(h.s.data),before);assert.match(h.message(),/No players copied: 1 availability not confirmed.*; 1 unavailable.*Current team unchanged/);assert.equal(h.button().disabled,false);
});
test('a missing second-day confirmation names the date visibly without changing availability or the draft',async()=>{
 const h=harness();Object.assign(h.target.details,{format:'long_form',brackets:false});h.target.details.days.push({date:'2099-11-07',start:'10:00'});h.sync();const before=plain(h.s.data);
 await h.c.seCopyLast('target');const message=h.document.querySelector('[data-se-copy-status]');
 assert.equal(h.requests.length,0);assert.deepEqual(plain(h.s.data),before);assert.equal(message.hidden,false);assert.equal(message.getAttribute('role'),'alert');assert.equal(h.document.activeElement,message);
 assert.match(message.textContent,/2 availability not confirmed \(Day 2: 2099-11-07\).*available on both days/);
 for(const player of h.s.data.roster)player.availability.available_dates.push('2099-11-07');h.sync();await h.c.seCopyLast('target');
 assert.equal(h.requests.length,1);assert.deepEqual(plain(h.s.data.fixtures[1].slots.slice(0,2)),[{d1:'a',d2:'a'},{d1:'b',d2:'b'}]);assert.equal(h.document.querySelector('[data-se-copy-status]').getAttribute('role'),'status');
});
test('partial copies keep gaps and count the unavailable players in the local confirmation',async()=>{
 const h=harness();h.s.data.roster[1].availability.available_dates=[];h.sync();await h.c.seCopyLast('target');assert.equal(h.s.data.fixtures[1].slots[0].d1,'a');assert.equal(h.s.data.fixtures[1].slots[1].d1,null);assert.match(h.message(),/1 of 11 players.*1 availability not confirmed/);
});
test('two-day copies check each date and preserve bracket partners independently',async()=>{
 const h=harness();for(const f of [h.target,h.previous]){f.details.format='long_form';f.details.brackets=true;f.details.days.push({date:f.id==='target'?'2099-11-07':'2099-10-30',start:'10:00'});}
 h.previous.slots[0]={d1:'a',d2:'b'};h.previous.slots[1]={d1:'b',d2:'a'};
 h.s.data.roster[0].availability={available_dates:['2099-10-31'],unavailable_dates:['2099-11-07']};h.s.data.roster[1].availability={available_dates:['2099-11-07'],unavailable_dates:['2099-10-31']};h.sync();await h.c.seCopyLast('target');
 const copied=h.s.data.fixtures[1];assert.deepEqual(plain(copied.slots[0]),{d1:'a',d2:'b'});assert.deepEqual(plain(copied.slots[1]),{d1:null,d2:null});assert.match(h.message(),/Day 1: 1\/11.*Day 2: 1\/11/);
});
test('different grade identities or unlinked competitions cannot borrow a team, even with matching display names',async()=>{
 for(const change of [h=>h.previous.details.grade_group_id='other-grade',h=>{delete h.previous.details.grade_group_id;delete h.target.details.grade_group_id;}]){
  const h=harness();change(h);h.sync();await h.c.seCopyLast('target');assert.equal(h.requests.length,0);assert.match(h.message(),/no earlier team/);
 }
});

test('the latest round takes precedence over an older matching format when copying into long form',async()=>{
 const h=harness();h.target.details.format='long_form';h.target.details.brackets=false;h.target.details.round='6';h.target.details.days.push({date:'2099-11-07',start:'10:00'});
 h.previous.details.round='5';
 const older=structuredClone(h.previous);older.id='older';older.details.format='long_form';older.details.days=[{date:'2099-10-10',start:'10:00'},{date:'2099-10-17',start:'10:00'}];older.slots[0]={d1:'current',d2:'current'};older.slots[1]={d1:null,d2:null};h.s.data.fixtures.push(older);
 for(const p of h.s.data.roster)p.availability.available_dates.push('2099-11-07');
 const before=plain(h.target.details),source=plain(h.previous);h.sync();await h.c.seCopyLast('target');
 const copied=h.s.data.fixtures[1];assert.deepEqual(plain(copied.details),before);assert.deepEqual(plain(copied.slots.slice(0,2)),[{d1:'a',d2:'a'},{d1:'b',d2:'b'}]);assert.deepEqual(plain(h.s.data.fixtures[0]),source);assert.match(h.message(),/2099-10-24.*Day 1: 2\/11.*Day 2: 2\/11/);
});

test('one-day to long-form copying checks both dates and uses the target bracketing rule',async()=>{
 for(const brackets of [false,true]){
  const h=harness();Object.assign(h.target.details,{format:'long_form',brackets});h.target.details.days.push({date:'2099-11-07',start:'10:00'});
  h.s.data.roster[0].availability={available_dates:['2099-10-31'],unavailable_dates:['2099-11-07']};h.s.data.roster[1].availability.available_dates.push('2099-11-07');h.sync();await h.c.seCopyLast('target');
  assert.deepEqual(plain(h.s.data.fixtures[1].slots.slice(0,2)),[{d1:brackets?'a':null,d2:null},{d1:'b',d2:'b'}]);assert.match(h.message(),/1 unavailable/);
 }
});

test('long-form to one-day copying takes the first-day lineup and clears second-day slots',async()=>{
 for(const format of ['limited_overs','t20']){
  const h=harness();h.target.details.format=format;h.previous.details.format='long_form';h.previous.details.brackets=true;h.previous.details.days.push({date:'2099-10-25',start:'10:00'});h.previous.slots[0]={d1:'a',d2:'current'};h.previous.slots[1]={d1:'b',d2:'a'};h.sync();await h.c.seCopyLast('target');
  assert.equal(h.requests.length,1);assert.deepEqual(plain(h.s.data.fixtures[1].slots.slice(0,2)),[{d1:'a',d2:null},{d1:'b',d2:null}]);assert.ok(h.s.data.fixtures[1].slots.every(slot=>slot.d2===null));assert.equal(h.s.data.fixtures[1].details.format,format);
 }
});

test('fixtures without grade IDs can cross formats within the same named competition and team',async()=>{
 const h=harness();delete h.previous.details.grade_group_id;delete h.target.details.grade_group_id;h.target.details.competition=h.previous.details.competition;h.previous.details.format='t20';h.sync();await h.c.seCopyLast('target');
 assert.equal(h.requests.length,1);assert.equal(h.s.data.fixtures[1].slots[0].d1,'a');
});
