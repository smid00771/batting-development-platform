const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function setup(t,{readOnly=false,own=false}={}){
 const dom=new JSDOM('<main id="seContent"></main>');t.after(()=>dom.window.close());
 const document=dom.window.document,calls=[],roster=[
  {id:'senior',name:'Alex Green',grade:'1st Grade',active:true},
  {id:'dev',name:'Alex Green',grade:'Dev Navy',active:true},
  {id:'emile',name:'Émile Taylor',grade:'2nd Grade',active:true,user_id:own?'user':null},
  {id:'inactive',name:'Alex Retired',active:false}
 ].map(p=>({...p,availability:{revision:1,available_dates:['2026-10-31'],unavailable_dates:[]}}));
 const s={view:'availability',availabilityMonth:'2026-10',formDirty:false,data:{access:{timezone:'Australia/Sydney'},can_view_club_availability:!own,roster}};let leave=true;
 const c=vm.createContext({document,Date,session:{user:{id:'user'}},membership:{},ensureSelections:()=>s,seCanSetup:()=>!readOnly&&!own,
  seEsc:x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
  seAvailabilitySavedNotice:()=>'',seAvailabilitySetupDate:()=>'',seAvailabilityDateSetup(){},seBindAvailabilityFixtures(){},recordSelectionNavigation(){},
  confirmLeaveSelections:()=>{if(leave)s.formDirty=false;return leave;},seMutate:async(action,data)=>{calls.push({action,data});return false;}
 });
 const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('function seAvailability(playerId='),tail=source.slice(start),end=tail.slice(1).search(/\n(?:async )?function /);
 vm.runInContext(tail.slice(0,end+1),c);c.seAvailability();
 const input=()=>document.getElementById('seAvailabilityPlayer');
 const search=q=>{input().focus();input().value=q;input().dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 const key=value=>input().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
 return {document,s,calls,search,key,input,leave:value=>leave=value,options:()=>[...document.querySelectorAll('#seAvailabilityMatches [role=option]')]};
}
test('typing finds active players by name and distinguishes duplicate names before opening the correct calendar',t=>{
 const h=setup(t);h.search('alex');assert.equal(h.options().length,2);assert.match(h.options()[0].textContent,/1st Grade/);assert.match(h.options()[1].textContent,/Dev Navy/);
 h.options()[1].click();assert.equal(h.s.availabilityPlayerId,'dev');assert.equal(h.input().value,'Alex Green');assert.equal(h.document.activeElement.tagName,'H2');assert.equal(h.calls.length,0);
 h.search('TAYLOR emile');assert.equal(h.options().length,1);h.key('Enter');assert.equal(h.s.availabilityPlayerId,'emile');assert.equal(h.calls.length,0);
});
test('keyboard selection and no-match searches never submit an availability change',t=>{
 const h=setup(t);h.search('alex');h.key('ArrowDown');h.key('ArrowDown');h.key('Enter');assert.equal(h.s.availabilityPlayerId,'dev');
 h.search('missing');assert.equal(h.options().length,0);assert.match(h.document.getElementById('seAvailabilityMatchCount').textContent,/No matching players/);h.key('Enter');assert.equal(h.calls.length,0);assert.equal(h.s.availabilityPlayerId,'dev');
 h.key('Escape');assert.equal(h.input().value,'Alex Green');assert.equal(h.input().getAttribute('aria-expanded'),'false');
});
test('switching the search result respects unsaved calendar edits, and cancelling keeps the original player',t=>{
 const h=setup(t);h.search('emile');h.key('Enter');h.document.querySelector('[data-se-date="2026-10-31"]').click();assert.equal(h.s.formDirty,true);
 assert.equal(h.document.querySelector('[data-se-date="2026-10-31"]').dataset.seAvailability,'unavailable');
 h.leave(false);h.search('alex');h.options()[0].click();assert.equal(h.s.availabilityPlayerId,'emile');assert.equal(h.s.formDirty,true);assert.equal(h.input().value,'Émile Taylor');assert.equal(h.input().getAttribute('aria-expanded'),'false');assert.equal(h.calls.length,0);
 h.leave(true);h.search('alex');h.options()[0].click();assert.equal(h.s.availabilityPlayerId,'senior');assert.equal(h.s.formDirty,false);
});
test('search preserves read-only calendar access and ordinary players only see their own calendar',t=>{
 const read=setup(t,{readOnly:true});read.search('emile');read.key('Enter');assert.equal(read.document.getElementById('seSaveAvailability'),null);assert.equal(read.document.querySelector('[data-se-date]').disabled,true);
 const own=setup(t,{own:true});assert.equal(own.input(),null);assert.equal(own.s.availabilityPlayerId,'emile');
});
