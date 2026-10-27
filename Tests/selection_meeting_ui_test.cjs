const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{openDemo}=require('./helpers/demo_harness.cjs');
const source=fs.readFileSync('app.js','utf8'),start=source.indexOf('function seMeetingScope(){'),end=source.indexOf('\nfunction seEsc(',start);
function harness(){
 const dom=new JSDOM('<button id="seMeeting"></button>'),s={key:'user:club',view:'board',selectionGroup:'one',data:{selector:true,group_permissions_enabled:true,selection_group_access:[{id:'one',level:2},{id:'two',level:1}]}};
 const calls=[],notices=[],states=new Map();let paused=0,clock=1000;
 const c=vm.createContext({document:dom.window.document,selectionState:s,currentTab:'teams',club:{id:'club'},selectionsScopeKey:()=>s.key,selectionsEnabled:()=>true,Date:{now:()=>clock},crypto:{randomUUID:()=>String(clock++)},selectionEvidence:{pause:()=>paused++},seStartLiveRefresh:()=>{},seNotice:x=>notices.push(x),setInterval:()=>assert.fail('No meeting status polling'),supabase:{rpc:async(name,args)=>{calls.push({name,...args});const key=args.p_data.selection_group_id;let state=states.get(key)||{active:false,id:null,can_manage:key==='one'};if(args.p_action==='start_meeting')state={active:true,id:args.p_data.request_id,can_manage:true};if(args.p_action==='end_meeting')state={...state,active:false};states.set(key,state);return {data:state};}}});
 vm.runInContext(source.slice(start,end),c);return {c,s,calls,notices,states,button:dom.window.document.getElementById('seMeeting'),close:()=>dom.window.close(),get paused(){return paused;}};
}
test('meeting starts without a call or board reload; ends without restarting analysis',async t=>{
 const h=harness();t.after(h.close);h.c.seMountMeeting();assert.equal(h.button.textContent,'Start selection meeting');assert.equal(h.calls.length,0,'Mounting the board makes no extra request');
 await h.c.seMeetingToggle();assert.equal(h.button.textContent,'End selection meeting');assert.equal(h.c.seMeetingActive(),true);assert.equal(h.paused,1);
 await h.c.seMeetingToggle();assert.equal(h.button.textContent,'Start selection meeting');assert.equal(h.c.seMeetingActive(),false);assert.match(h.notices.at(-1),/analysis stays paused/);
 assert.deepEqual(h.calls.map(c=>c.p_action),['start_meeting','end_meeting']);assert.equal(h.calls.every(c=>c.name==='selection_room_api'),true);
});
test('shared status arrives with the board and never transfers edit rights between groups',async t=>{
 const h=harness();t.after(h.close);h.c.seMountMeeting();
 h.c.seAdoptMeetings(h.s,{selection_meetings:[{scope_id:'one',id:'remote-meeting',active:true,can_manage:true}]});h.c.seMountMeeting();assert.equal(h.button.textContent,'End selection meeting');
 h.s.selectionGroup='two';h.c.seMountMeeting();assert.equal(h.button.disabled,true);await h.c.seMeetingToggle();assert.equal(h.calls.length,0);
 h.s.selectionGroup='unknown';assert.equal(h.c.seMeetingScope(),null);h.c.seMeetingButton();assert.equal(h.button.hidden,true);
 h.c.currentTab='playerhome';h.c.seMountMeeting();assert.equal(h.calls.length,0);
});
test('slow or uncertain meeting requests preserve the board and cannot double-start',async t=>{
 const h=harness();t.after(h.close);await h.c.seMeetingRefresh();let finish;h.c.supabase.rpc=()=>new Promise(resolve=>finish=resolve);
 const first=h.c.seMeetingToggle();await h.c.seMeetingToggle();assert.equal(h.button.disabled,true);
 h.c.seAdoptMeetings(h.s,{selection_meetings:[]});assert.equal(h.s.meetings['user:club:one'].changing,true,'A simultaneous board save must preserve the pending meeting change');
 finish({error:{message:'Connection lost after commit'}});await first;assert.equal(h.button.textContent,'Retry meeting status');assert.match(h.notices.at(-1),/not confirmed/);
 const actions=[];h.c.supabase.rpc=async(_,args)=>(actions.push(args.p_action),{data:{id:'saved',active:true,can_manage:true}});
 await h.c.seMeetingToggle();assert.deepEqual(actions,['meeting']);assert.equal(h.button.textContent,'End selection meeting');
 h.s.pending={action:'save_board'};await h.c.seMeetingToggle();assert.equal(actions.length,1,'An unconfirmed team save takes priority');
});
test('responses from the previous club do not alter the current club',async t=>{
 const h=harness();t.after(h.close);let finish;h.c.supabase.rpc=()=>new Promise(resolve=>finish=resolve);const read=h.c.seMeetingRefresh();
 h.c.selectionState={key:'different:club',view:'board',data:{selector:false}};h.c.seMeetingButton();finish({data:{id:'old',active:true,can_manage:true}});await read;assert.equal(h.c.seMeetingActive(),false);assert.equal(h.button.hidden,true);
});
test('delivered demo starts and ends a meeting while keeping the board and room separate',async t=>{
 const h=await openDemo('selections');t.after(h.close);const board=h.document.getElementById('seContent');
 assert.equal(h.document.getElementById('seMeeting').textContent,'Start selection meeting');
 await h.click('#seMeeting');assert.equal(h.document.getElementById('seMeeting').textContent,'End selection meeting');assert.equal(h.document.getElementById('seContent'),board);assert.equal(h.document.querySelector('.sr-room'),null);
 await h.click('#seRefresh');assert.equal(h.document.getElementById('seMeeting').textContent,'End selection meeting','Refresh restores the shared meeting state without opening the room');
 await h.click('[data-se-view="roster"]');await h.click('[data-se-view="board"]');assert.equal(h.document.getElementById('seMeeting').textContent,'End selection meeting');
 await h.click('#seMeeting');assert.match(h.document.getElementById('seNotice').textContent,/analysis stays paused/);assert.equal(h.requests.length,0);assert.deepEqual(h.errors,[]);
});
