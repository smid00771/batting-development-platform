const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function extract(name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source),rest=source.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
function setup(){
 const dom=new JSDOM('<section id="sePage"><p id="seNotice"></p><form><input name="x"><button type="submit">Save availability</button></form><button id="read">View comments</button></section>'),document=dom.window.document,s={key:'u:c',busy:false,pending:null,undo:[],view:'availability',notice:''},requests=[],notices=[];
 const c=vm.createContext({document,queueMicrotask,setTimeout,crypto:{randomUUID},ensureSelections:()=>s,selectionState:s,currentTab:'teams',selectionsScopeKey:()=>s.key,seGuardFixtureEdit:()=>true,sePersist:()=>{},seNotice:x=>notices.push(x),seRPC:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),seReload:async()=>true,drawSelections:()=>{},seRevealPublication:()=>{},refreshClubMessageBadge:()=>{}});
 vm.runInContext(['seButtonWorking','seTrackActionButtons','seReadButton','seMutate','seLock'].map(extract).join('\n'),c);c.seTrackActionButtons(document.getElementById('sePage'),s);
 return {dom,document,s,c,requests,notices};
}
(async()=>{
 for(const fail of [false,true]){
  const h=setup(),button=h.document.querySelector('[type=submit]'),form=h.document.querySelector('form');let promise;
  form.onsubmit=e=>{e.preventDefault();promise=h.c.seMutate('availability',{id:'player'});};button.click();
  assert.equal(button.textContent,'Saving…');assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');assert.equal(h.requests.length,1);
  button.click();assert.equal(h.requests.length,1,'Second click cannot duplicate mutation');
  if(fail)h.requests[0].reject(Error('Connection lost'));else h.requests[0].resolve({saved:true});await promise;
  assert.equal(button.textContent,'Save availability');assert.equal(button.disabled,false);assert.equal(button.hasAttribute('aria-busy'),false);
  if(fail){assert.ok(h.s.pending);assert.match(h.s.notice,/Save not confirmed/);}else{assert.equal(h.s.pending,null);assert.equal(h.s.notice,'Saved ✓');}
 }
 {
  const h=setup(),form=h.document.querySelector('form'),button=form.querySelector('button');let seen;
  form.onsubmit=e=>{e.preventDefault();seen=h.s.actionButton;};form.dispatchEvent(new h.dom.window.SubmitEvent('submit',{bubbles:true,cancelable:true}));assert.equal(seen,button);await Promise.resolve();assert.equal(h.s.actionButton,button,'Capture survives microtask checkpoints between native event listeners');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(h.s.actionButton,null,'Capture expires after originating event task');
 }
 {
  const h=setup(),button=h.document.getElementById('read');let reject,calls=0;const run=()=>{calls++;return new Promise((_,r)=>reject=r);};const first=h.c.seReadButton(button,'Loading…',run);await h.c.seReadButton(button,'Loading…',run);assert.equal(calls,1);assert.equal(button.textContent,'Loading…');reject(Error('Cannot load'));await first;assert.equal(button.textContent,'View comments');assert.equal(button.disabled,false);assert.deepEqual(h.notices,['Cannot load']);
 }
 {
  const h=setup(),button=h.document.getElementById('read');let reject;const first=h.c.seReadButton(button,'Loading…',()=>new Promise((_,r)=>reject=r));button.outerHTML='<button id="read">New view action</button>';reject(Error('Old failure'));await first;assert.equal(h.document.getElementById('read').textContent,'New view action');assert.equal(h.document.getElementById('read').disabled,false);assert.deepEqual(h.notices,[]);
 }
 for(const finishReadFirst of [true,false]){
  const h=setup(),button=h.document.getElementById('read');let resolve;const pending=h.c.seReadButton(button,'Loading…',()=>new Promise(r=>resolve=r));h.c.seLock(true);
  if(finishReadFirst){resolve();await pending;assert.equal(button.disabled,true,'Read completion preserves an active mutation lock');assert.equal(button.dataset.seWasDisabled,'0','Unlock restores the completed read button');h.c.seLock(false);}
  else{h.c.seLock(false);assert.equal(button.disabled,true,'An outstanding read stays disabled after mutation unlock');resolve();await pending;}
  assert.equal(button.disabled,false);assert.equal(button.dataset.seWasDisabled,undefined);
 }
 console.log('Selection mutation/loading buttons: working feedback, double-click protection, success/failure, keyboard submit and detached-screen safeguards passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
