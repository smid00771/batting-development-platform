const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function fn(source,name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(m,name);const rest=source.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
const day='2026-10-17',next='2026-10-24';
const player=(id,available=[],unavailable=[])=>({id,name:id,active:true,availability:{revision:2,available_dates:available,unavailable_dates:unavailable}});
function setup(file,existing=true){
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8'),dom=new JSDOM('<main id="seContent"></main>'),s={view:'availability',date:day,data:{roster_revision:4,access:{timezone:'Australia/Sydney'},availability_dates:existing?[{date:day,bulk_saved_at:'2026-10-15T22:05:00Z',updated_at:'2026-10-15T22:06:00Z'}]:[],roster:existing?[player('Alice',[],[day]),player('Bob',[day]),player('Casey',[day])]:[player('Alice'),player('Bob'),player('Casey')]}};
 const calls=[];let leave=true;
 const c=vm.createContext({document:dom.window.document,Date,Intl,FormData:dom.window.FormData,console,session:{user:{id:'admin'}},ensureSelections:()=>s,seCanSetup:()=>true,seEsc:x=>String(x??''),seClubDate:()=>day,confirmLeaveSelections:()=>leave,seNotice:()=>{},drawSelections:()=>c.seAvailability(),seMutate:async(action,data)=>{calls.push({action,data});return false;}});
 vm.runInContext(['seAvailabilityDateLabel','seAvailabilitySetupDate','seAvailabilitySavedNotice','seAvailabilityDateSetup','seAvailability'].map(n=>fn(source,n)).join('\n'),c);
 const change=(el,event='input')=>el.dispatchEvent(new dom.window.Event(event,{bubbles:true}));
 return {s,c,calls,doc:dom.window.document,change,leave:v=>leave=v,box:id=>dom.window.document.querySelector('[name="unavailable"][value="'+id+'"]'),submit:()=>dom.window.document.getElementById('seAvailabilityDateForm').onsubmit({preventDefault(){}})};
}
for(const file of ['app.js','demo.html']){
 test(file+': reopening bulk availability retains saved exceptions and starts with reset off',()=>{
  const h=setup(file);h.c.seAvailabilityDateSetup();assert.equal(h.box('Alice').checked,true);assert.equal(h.box('Bob').checked,false);assert.equal(h.doc.getElementById('seResetUnavailable').checked,false);assert.equal(h.doc.getElementById('seSaveDate').disabled,true);
  h.c.seAvailability();h.c.seAvailabilityDateSetup();assert.equal(h.box('Alice').checked,true);
 });
 test(file+': adding one more unavailable player sends both exceptions',async()=>{
  const h=setup(file);h.c.seAvailabilityDateSetup();h.box('Bob').checked=true;h.change(h.box('Bob'));await h.submit();const req=h.calls[0];assert.equal(req.action,'availability_batch');assert.deepEqual(Array.from(req.data.unavailable_ids),['Alice','Bob']);assert.equal(req.data.reset_unavailable,false);assert.deepEqual(Array.from(req.data.available_ids),[]);
 });
 test(file+': unticking one saved exception explicitly restores only that player',async()=>{
  const h=setup(file);h.c.seAvailabilityDateSetup();h.box('Alice').checked=false;h.change(h.box('Alice'));await h.submit();assert.deepEqual(Array.from(h.calls[0].data.available_ids),['Alice']);assert.equal(h.calls[0].data.reset_unavailable,false);
 });
 test(file+': reset is explicit, can be undone, and permits a new exception',async()=>{
  const h=setup(file);h.c.seAvailabilityDateSetup();h.box('Bob').checked=true;h.change(h.box('Bob'));const reset=h.doc.getElementById('seResetUnavailable');reset.checked=true;h.change(reset,'change');assert.equal(h.box('Alice').checked,false);assert.equal(h.box('Bob').checked,false);
  reset.checked=false;h.change(reset,'change');assert.equal(h.box('Alice').checked,true);assert.equal(h.box('Bob').checked,true);
  reset.checked=true;h.change(reset,'change');h.box('Casey').checked=true;h.change(h.box('Casey'));await h.submit();assert.equal(h.calls[0].data.reset_unavailable,true);assert.deepEqual(Array.from(h.calls[0].data.unavailable_ids),['Casey']);
 });
 test(file+': changing playing day loads its own exceptions and respects unsaved work',()=>{
  const h=setup(file);h.s.data.roster[1].availability.unavailable_dates=[next];h.c.seAvailabilityDateSetup();const date=h.doc.getElementById('seBulkDate');h.box('Casey').checked=true;h.change(h.box('Casey'));h.leave(false);date.value=next;h.change(date,'change');assert.equal(date.value,day);assert.equal(h.box('Casey').checked,true);
  h.leave(true);date.value=next;h.change(date,'change');assert.equal(h.box('Alice').checked,false);assert.equal(h.box('Bob').checked,true);assert.equal(h.box('Casey').checked,false);assert.equal(h.doc.getElementById('seResetUnavailable').checked,false);
 });
 test(file+': saved date, counts and Sydney timestamp remain visible on the Availability page',()=>{
  const h=setup(file);h.c.seAvailability();assert.match(h.doc.body.textContent,/Availability set for 17\/10\/2026/);assert.match(h.doc.body.textContent,/2 available · 1 unavailable/);assert.match(h.doc.body.textContent,/16\/10\/2026.*9:06/);
  h.s.bulkAvailabilityDate=day;h.c.seAvailability();assert.match(h.doc.body.textContent,/1 unavailable/);
 });
 test(file+': first setup and newly added players can be saved without clearing existing exceptions',async()=>{
  const h=setup(file,false);h.c.seAvailabilityDateSetup();assert.equal(h.doc.getElementById('seSaveDate').disabled,false);await h.submit();assert.equal(h.calls[0].data.make_all_available,true);assert.equal(h.calls[0].data.reset_unavailable,false);
  const prior=setup(file);prior.s.data.roster.push(player('New player'));prior.c.seAvailabilityDateSetup();assert.equal(prior.doc.getElementById('seSaveDate').disabled,false);assert.equal(prior.box('Alice').checked,true);assert.match(prior.doc.body.textContent,/1 not yet set/);
 });
 test(file+': searching hides rows without losing their saved choices',async()=>{
  const h=setup(file);h.c.seAvailabilityDateSetup();const search=h.doc.getElementById('seBulkSearch');search.value='Bob';h.change(search);h.box('Bob').checked=true;h.change(h.box('Bob'));await h.submit();assert.deepEqual(Array.from(h.calls[0].data.unavailable_ids),['Alice','Bob']);
 });
}
for(const file of ['app.js','demo.html'])test(file+': a rejected concurrent save reloads current choices and clears the retry queue',async()=>{
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8'),s={pending:null,busy:false,data:{}},crypto=require('node:crypto');let reloads=0,draws=0;
 const c=vm.createContext({crypto,ensureSelections:()=>s,selectionState:s,selectionEvidence:{pause(){}},seGuardFixtureEdit:()=>true,sePersist(){},seNotice(){},seLock(){},seRPC:async()=>{throw Error('A player updated their calendar. Reload before setting this date');},seReload:async()=>{reloads++;return true;},drawSelections:()=>draws++});
 vm.runInContext(['seButtonWorking','seMutate'].map(name=>fn(source,name)).join('\n'),c);assert.equal(await c.seMutate('availability_batch',{date:day}),false);assert.equal(s.pending,null);assert.equal(s.busy,false);assert.equal(reloads,1);assert.equal(draws,1);assert.match(s.notice,/Review the saved choices/);
});
