const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function extract(name){const a=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(a>=0,name);const rest=source.slice(a),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
const plain=x=>JSON.parse(JSON.stringify(x)),day='2026-10-24',next='2026-10-31',past='2026-10-10';
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-20T07:00:00Z']));}}
function fixture(id,dates=[day]){return {id,revision:3,details:{grade:id,format:dates.length===2?'long_form':'limited_overs',days:dates.map(date=>({date})),brackets:false,match_roles:Object.fromEntries(dates.map((_,i)=>['d'+(i+1),{captain_id:'p',captain_manual:true,keeper_id:'p',keeper_manual:true}]))},slots:Array.from({length:11},(_,i)=>({d1:i===3?'p':i===4?'q':null,d2:dates.length===2?(i===3?'p':i===4?'q':null):null}))};}
function harness(){
 const fixtures=[fixture('First'),fixture('Second',[day,next])],roster=[{id:'p',name:'Player',active:true,keeper:true,availability:{available_dates:[next],unavailable_dates:[day,past]}},{id:'q',name:'Unanswered',active:true,availability:{available_dates:[],unavailable_dates:[]}}];
 const s={key:'selector:club',view:'board',date:day,busy:false,undo:[],data:{selector:true,fixtures,roster,access:{timezone:'Australia/Sydney'}}},server=structuredClone(fixtures),calls=[],receipts=new Map(),dom=new JSDOM('',{url:'https://clubbatting.com'});let lost=false,c;
 c=vm.createContext({Date:Clock,Intl,structuredClone,crypto:webcrypto,document:dom.window.document,sessionStorage:dom.window.sessionStorage,currentTab:'teams',selectionState:s,ensureSelections:()=>s,selectionsScopeKey:()=>s.key,seBoardFixtures:()=>s.data.fixtures.filter(f=>f.details.days[0].date===s.date),seGuardFixtureEdit:()=>true,seButtonWorking:()=>()=>{},seNotice:text=>s.notice=text,seLock(){},drawSelections(){},refreshClubMessageBadge(){},
  seReload:async()=>{s.data.fixtures=structuredClone(server);return true;},seRPC:async(action,data)=>{
   calls.push({action,data:plain(data)});if(receipts.has(data.request_id))return receipts.get(data.request_id);
   assert.equal(action,'save_board');for(const f of data.fixtures)if(server.find(x=>x.id===f.id).revision!==f.revision)throw Error('A team changed in another session. Reload before saving');
   const revisions={};for(const f of data.fixtures){const old=server.find(x=>x.id===f.id);Object.assign(old,structuredClone(f),{revision:old.revision+1});revisions[f.id]=old.revision;}
   const result={saved:true,revisions};receipts.set(data.request_id,result);if(lost){lost=false;throw Error('Connection interrupted');}return result;
  }});
 vm.runInContext(['seDayStatus','seFixtureCompleted','seFixtureLocked','seMatchGroup','seMatchRoles','sePrepareMatch','seUnavailableDrafts','seClearUnavailableDrafts','seMutate','sePersist'].map(extract).join('\n'),c);
 return {c,s,server,calls,loseResponse(){lost=true;}};
}
test('red dates leave the exact batting-order place blank and retain the other day and unanswered players',()=>{
 const h=harness(),before=plain(h.s.data.fixtures),out=h.c.seUnavailableDrafts(h.s.data.fixtures,h.s.data);
 assert.deepEqual(plain(h.s.data.fixtures),before,'No optimistic mutation of saved selections');
 assert.equal(out.length,2);for(const f of out){assert.equal(f.slots.length,11);assert.equal(f.slots[3].d1,null);assert.equal(f.slots[4].d1,'q');assert.equal(f.details.match_roles.d1.captain_id,null);assert.equal(f.details.match_roles.d1.keeper_id,null);assert.equal(f.revision,3);}
 assert.equal(out[1].slots[3].d2,'p');assert.equal(out[1].details.match_roles.d2.captain_id,'p');assert.equal(out[1].details.brackets,true);
});
test('locked publications, cancelled fixtures and past playing days stay unchanged',()=>{
 const h=harness(),locked=fixture('Locked'),cancelled=fixture('Cancelled'),completed=fixture('Past',[past]),started=fixture('Started',[past,day]);
 locked.published={details:plain(locked.details),slots:plain(locked.slots)};cancelled.details.cancelled=true;completed.selection_unlocked_until='2026-10-21T00:00:00Z';
 const out=h.c.seUnavailableDrafts([locked,cancelled,completed,started],h.s.data);assert.equal(out.length,1);assert.equal(out[0].id,'Started');assert.equal(out[0].slots[3].d1,'p');assert.equal(out[0].slots[3].d2,null);
 locked.selection_unlocked_until='2026-10-21T00:00:00Z';const cleared=h.c.seUnavailableDrafts([locked],h.s.data)[0];assert.equal(cleared.slots[3].d1,null);assert.deepEqual(plain(cleared.published),locked.published,'Head unlock changes only draft');
});
test('selector board saves one atomic, revision-checked change and never reselects after availability returns',async()=>{
 const h=harness();assert.equal(await h.c.seClearUnavailableDrafts(),true);assert.equal(h.calls.length,1);assert.equal(h.calls[0].data.fixtures.length,2);assert.ok(h.calls[0].data.request_id);assert.equal(h.s.data.fixtures[0].slots[3].d1,null);assert.equal(h.s.data.fixtures[0].revision,4);
 assert.equal(await h.c.seClearUnavailableDrafts(),false);assert.equal(h.calls.length,1);
 h.s.data.roster[0].availability={available_dates:[day,next],unavailable_dates:[]};assert.equal(await h.c.seClearUnavailableDrafts(),false);assert.equal(h.s.data.fixtures[0].slots[3].d1,null);
});
test('captains, other screens, other clubs and unsaved edits cannot trigger automatic draft writes',async()=>{
 for(const change of [h=>h.s.data.selector=false,h=>h.s.view='availability',h=>h.s.boardPanel='unselected',h=>h.s.formDirty=true,h=>h.s.ordering=true,h=>h.s.busy=true,h=>h.s.pending={},h=>h.s.clearingUnavailable=true,h=>h.c.currentTab='home',h=>h.c.selectionState={}]){const h=harness();change(h);assert.equal(await h.c.seClearUnavailableDrafts(),false);assert.equal(h.calls.length,0);}
 const h=harness();h.s.date=next;assert.equal(await h.c.seClearUnavailableDrafts(),false,'Only displayed teams are changed');
});
test('an uncertain response keeps the original save request for retry and does not invent another removal',async()=>{
 const h=harness();h.loseResponse();assert.equal(await h.c.seClearUnavailableDrafts(),false);assert.ok(h.s.pending);assert.match(h.s.notice,/Save not confirmed/);assert.equal(h.s.data.fixtures[0].slots[3].d1,'p','UI retains last confirmed data');
 assert.equal(await h.c.seClearUnavailableDrafts(),false);assert.equal(h.calls.length,1);const request=plain(h.s.pending);
 assert.equal(await h.c.seMutate(request.action,request.data),true);assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(h.server[0].revision,4);assert.equal(h.s.data.fixtures[0].slots[3].d1,null);assert.equal(h.s.pending,null);
});
test('a newer saved team is never overwritten by the automatic vacancy change',async()=>{
 const h=harness();h.server[1].revision++;h.server[1].slots[5].d1='new-choice';assert.equal(await h.c.seClearUnavailableDrafts(),false);assert.match(h.s.notice,/team changed/i);assert.equal(h.server[0].slots[3].d1,'p','Whole batch rejected');assert.equal(h.server[1].slots[5].d1,'new-choice');assert.equal(h.s.data.fixtures[0].slots[3].d1,'p');
});
