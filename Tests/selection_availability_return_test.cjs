const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function extract(name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match);const tail=source.slice(match.index),end=tail.slice(1).search(/\n(?:async )?function /);return tail.slice(0,end+1);}
const plain=x=>JSON.parse(JSON.stringify(x)),esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function harness({direct=false,fail=false}={}){
 const dom=new JSDOM('<main id="seContent"></main>',{url:'https://clubbatting.com'}),scroll=[];dom.window.scrollTo=x=>scroll.push(x);Object.defineProperty(dom.window,'scrollY',{value:670});
 const active={id:'second',slot:10,day:0},player={id:'player',name:'Registered Player',active:true,user_id:null,availability:{revision:2,available_dates:['2026-10-17']}};
 const f={id:'second',revision:7,details:{days:[{date:'2026-10-24'}]},slots:Array.from({length:11},()=>({d1:null,d2:null}))};
 const s={key:'user:club',view:direct?'availability':'board',date:'2026-10-24',active:{...active},search:'Registered',role:'',pairs:false,both:false,formDirty:false,undo:[],data:{selector:true,roster:[player],fixtures:[f],access:{timezone:'Australia/Sydney'}}},calls=[];let failures=fail?1:0,c;
 const draw=()=>{if(s.view==='availability')c.seAvailability();else dom.window.document.getElementById('seContent').innerHTML='<button id="slot">Player slot</button>';};
 c=vm.createContext({Date,Intl,URL,document:dom.window.document,window:dom.window,sessionStorage:dom.window.sessionStorage,crypto:webcrypto,structuredClone,session:{user:{id:'user'}},membership:{},currentTab:'teams',selectionState:s,
  ensureSelections:()=>s,selectionsScopeKey:()=>s.key,seCanSetup:()=>true,seBoardAccess:()=>true,seFixtureLocked:f=>!!f.locked,confirmLeaveSelections:()=>!s.busy&&!s.pending,
  seAvailabilitySavedNotice:()=>'',seAvailabilitySetupDate:()=>'',seEsc:esc,seAvailabilityDateSetup(){},drawSelections:draw,seSlotButton:()=>dom.window.document.getElementById('slot'),
  seGuardFixtureEdit:()=>true,seButtonWorking:()=>()=>{},seLock(){},seNotice:text=>s.notice=text,refreshClubMessageBadge(){},
  seRPC:async(action,data)=>{calls.push({action,data:structuredClone(data)});if(failures-->0)throw Error('Connection interrupted');if(action==='availability'){player.availability={revision:3,available_dates:[...data.available_dates]};return {saved:true};}return {saved:true};},seReload:async()=>true});
 vm.runInContext(['sePickerOpenAvailability','seReturnFromAvailability','seAvailability','seMutate','sePersist','seDayStatus','seClockMinutes','seMatchDuration','seDayWindow','seOverlap','seCopyState','seCopyControls','seUpdateCopyStatus','seCopyMessage','seCopyLast'].map(extract).join('\n'),c);
 if(direct)c.seAvailability('player');else c.sePickerOpenAvailability('player');
 const save=async()=>{dom.window.document.querySelector('[data-se-date="2026-10-24"]').click();await dom.window.document.getElementById('seAvailabilityForm').onsubmit({preventDefault(){}});};
 return {c,s,f,player,calls,scroll,dom,active,save};
}
test('availability save returns to the exact board date, slot, search and scroll position',async()=>{
 const h=harness();assert.equal(h.s.view,'availability');assert.equal(h.s.active,null);assert.equal(h.s.availabilityMonth,'2026-10');await h.save();
 assert.equal(h.s.view,'board');assert.equal(h.s.date,'2026-10-24');assert.deepEqual(plain(h.s.active),h.active);assert.equal(h.s.search,'Registered');assert.equal(h.scroll.at(-1).top,670);assert.equal(h.dom.window.document.activeElement.id,'slot');assert.equal(h.s.availabilityReturn,null);
 assert.ok(h.player.availability.available_dates.includes('2026-10-24'));assert.equal(h.f.slots[10].d1,null,'Returning never selects the player automatically');
});
test('uncertain availability save stays on the calendar and retries with its saved return location',async()=>{
 const h=harness({fail:true});await h.save();assert.equal(h.s.view,'availability');assert.ok(h.s.pending);assert.equal(h.scroll.length,0);const command=plain(h.s.pending);
 h.s.availabilityReturn=null;await h.c.seMutate(h.s.pending.action,h.s.pending.data);assert.deepEqual(plain(h.calls[0]),plain(h.calls[1]));assert.deepEqual(plain(command.availabilityReturn.active),h.active);assert.equal(h.s.view,'board');assert.deepEqual(plain(h.s.active),h.active);
});
test('direct availability editing stays in Availability after saving',async()=>{
 const h=harness({direct:true});await h.save();assert.equal(h.s.view,'availability');assert.equal(h.dom.window.document.getElementById('seAvailabilityBack'),null);assert.equal(h.scroll.length,0);
});
test('checking an already saved calendar has a working return button without another write',()=>{
 const h=harness();h.dom.window.document.getElementById('seAvailabilityBack').click();assert.equal(h.s.view,'board');assert.equal(h.calls.length,0);assert.deepEqual(plain(h.s.active),h.active);
});
test('a locked or removed fixture returns to the board without reopening an invalid picker',async()=>{
 for(const change of [h=>h.f.locked=true,h=>h.s.data.fixtures=[]]){const h=harness();change(h);await h.save();assert.equal(h.s.view,'board');assert.equal(h.s.active,null);}
});
test('saved return context cannot navigate another account or club',()=>{
 const h=harness(),back=h.s.availabilityReturn;h.s.key='other:club';assert.equal(h.c.seReturnFromAvailability(back),false);assert.equal(h.s.view,'availability');
});
test('copy previous team includes the active canonical entry only when confirmed for the new date',async()=>{
 const h=harness({direct:true});h.c.confirm=()=>true;h.c.seDate=String;
 h.f.details={...h.f.details,grade:'Second',competition:'Test',format:'limited_overs'};const previous=structuredClone(h.f);previous.id='previous';previous.details.days=[{date:'2026-10-17'}];previous.slots[10].d1='player';previous.published={details:previous.details,slots:previous.slots};h.s.data.fixtures.push(previous);
 h.c.seMutate=async(action,data)=>{h.calls.push({action,data:plain(data)});return true;};h.player.availability.available_dates.push('2026-10-24');await h.c.seCopyLast('second');assert.equal(h.calls.at(-1).data.fixtures[0].slots[10].d1,'player');
 const count=h.calls.length;h.player.active=false;await h.c.seCopyLast('second');assert.equal(h.calls.length,count);assert.match(h.s.notice,/No players copied/);
 h.player.active=true;h.player.availability.available_dates=[];await h.c.seCopyLast('second');assert.equal(h.calls.length,count);assert.match(h.s.notice,/availability not confirmed/);
});
