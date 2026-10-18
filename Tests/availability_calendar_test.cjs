const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function extract(name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source),tail=source.slice(match.index),end=tail.slice(1).search(/\n(?:async )?function /);return tail.slice(0,end+1);}
const available='2026-10-10',unavailable='2026-10-24',unset='2026-10-31';
function harness({own=false,readOnly=false}={}){
 const dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,calls=[];
 const person={id:'player',user_id:own?'user':'other',name:'Test Player',active:true,availability:{revision:2,available_dates:[available],unavailable_dates:[unavailable,'2026-11-07']}};
 const s={view:'availability',availabilityMonth:'2026-10',formDirty:false,data:{can_view_club_availability:true,access:{timezone:'Australia/Sydney'},roster:[person]}};
 let allowed=true,c;
 c=vm.createContext({document,Date,session:{user:{id:'user'}},membership:{},selectionRoomController:null,
  ensureSelections:()=>s,seCanSetup:()=>!own&&!readOnly,seEsc:String,seAvailabilitySavedNotice:()=>'',seAvailabilitySetupDate:()=>'',seAvailabilityDateSetup(){},recordSelectionNavigation(){},
  confirmLeaveSelections:()=>allowed,seReturnFromAvailability(){},socialLanding(){},drawSelections:()=>{if(s.view==='availability')c.seAvailability();else document.getElementById('seContent').textContent='Another section';},
  seMutate:async(action,data)=>{calls.push({action,data:JSON.parse(JSON.stringify(data))});person.availability={...data,revision:data.revision+1};s.formDirty=false;return true;}});
 vm.runInContext(['seAvailability','seChangeView'].map(extract).join('\n'),c);c.seAvailability('player');
 const button=date=>document.querySelector('[data-se-date="'+date+'"]'),status=date=>button(date).dataset.seAvailability;
 return {c,s,person,document,calls,button,status,allow:value=>allowed=value,save:()=>document.getElementById('seAvailabilityForm').onsubmit({preventDefault(){}})};
}
test('bulk exceptions are red, saved availability green, unanswered dates blank',()=>{
 const h=harness();assert.equal(h.status(available),'available');assert.equal(h.status(unavailable),'unavailable');assert.equal(h.status(unset),'unknown');assert.match(h.button(unavailable).textContent,/×/);assert.match(h.button(unavailable).getAttribute('aria-label'),/unavailable/);assert.equal(h.document.getElementById('seSaveAvailability').disabled,true);
 h.document.getElementById('seMonthNext').click();assert.equal(h.status('2026-11-07'),'unavailable');h.document.getElementById('seMonthPrev').click();assert.equal(h.status(unavailable),'unavailable');
});
test('new dates cycle through all three choices; completing the cycle cancels the edit',()=>{
 const h=harness();for(const status of ['available','unavailable','unknown']){h.button(unset).click();assert.equal(h.status(unset),status);assert.equal(h.document.activeElement.dataset.seDate,unset);}assert.equal(h.s.formDirty,false);assert.equal(h.document.getElementById('seSaveAvailability').disabled,true);
});
test('explicit red dates and cleared dates survive saving and reopening, including other months',async()=>{
 const h=harness();h.button(unset).click();h.button(unset).click();h.button(unavailable).click();assert.equal(h.status(unset),'unavailable');assert.equal(h.status(unavailable),'unknown');await h.save();h.c.seAvailability('player');
 assert.equal(h.status(unset),'unavailable');assert.equal(h.status(unavailable),'unknown');assert.deepEqual(h.calls[0].data.available_dates,[available]);assert.deepEqual(h.calls[0].data.unavailable_dates,[unset,'2026-11-07']);
 h.button(available).click();assert.equal(h.status(available),'unavailable');await h.save();assert.equal(h.status(available),'unavailable');assert.equal(h.s.formDirty,false);
});
test('players can set their own red dates; read-only calendars retain colours without editing',async()=>{
 const own=harness({own:true});own.button(unset).click();own.button(unset).click();await own.save();assert.equal(own.status(unset),'unavailable');
 const h=harness({readOnly:true});assert.equal(h.status(unavailable),'unavailable');assert.equal(h.button(unavailable).disabled,true);assert.equal(h.document.getElementById('seSaveAvailability'),null);h.button(unset).click();assert.equal(h.status(unset),'unknown');assert.equal(h.calls.length,0);
});
test('repeated Availability entry and returning from another section both open home without changing saved calendars',()=>{
 const h=harness(),saved=JSON.stringify(h.person.availability);h.c.seChangeView('availability');assert.equal(h.s.availabilityPlayerId,null);assert.equal(h.document.getElementById('seAvailabilityPlayer').value,'');assert.equal(h.document.getElementById('seCalendar'),null);
 h.c.seAvailability('player');h.c.seChangeView('board');h.c.seChangeView('availability');assert.equal(h.document.getElementById('seCalendar'),null);assert.equal(h.document.getElementById('seAvailabilityPlayer').value,'');assert.equal(JSON.stringify(h.person.availability),saved);
 h.c.seAvailability('player');h.button(unset).click();h.allow(false);h.c.seChangeView('availability');assert.equal(h.s.availabilityPlayerId,'player');assert.equal(h.status(unset),'available');assert.equal(h.s.formDirty,true);
});
