const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function extract(name){const match=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(match,'Missing helper: '+name);const tail=source.slice(match.index),end=tail.slice(1).search(/\n(?:async )?function /);return tail.slice(0,end+1);}
const plain=value=>JSON.parse(JSON.stringify(value));
const dates=['2099-10-17','2099-10-24'];
function team(id,count=11,{twoDays=false,brackets=false}={}){
 return {id,revision:3,publication:0,published:null,details:{grade:id,competition:'Test competition',days:dates.slice(0,twoDays?2:1).map(date=>({date})),brackets,cancelled:false,match_roles:{}},slots:Array.from({length:Math.max(11,count)},(_,i)=>({d1:i<count?id+'-'+i:null,d2:twoDays&&i<count?id+'-'+i:null}))};
}
function harness(fixtures=[team('A'),team('B'),team('C')]){
 const roster=[...new Set(fixtures.flatMap(f=>f.slots.flatMap(slot=>[slot.d1,slot.d2])).filter(Boolean))].map(id=>({id,name:id,active:true,availability:{available_dates:[...dates]}}));
 const s={key:'selector:club',view:'board',busy:false,pending:null,undo:[],data:{selector:true,fixtures,roster,access:{timezone:'UTC'}}},calls=[],notices=[],orders=[];let saveResult=true;
 const c=vm.createContext({Date,Intl,structuredClone,ensureSelections:()=>s,selectionState:s,currentTab:'teams',selectionsScopeKey:()=>s.key,seName:id=>s.data.roster.find(p=>p.id===id)?.name||'Vacant',seNotice:text=>notices.push(text),seDate:String,sePickerSaved(){s.active=null;},seBoard(){},seFocusOrder(){},seMoveOrder:async(...args)=>{orders.push(args);return true;},seMutate:async(action,data,options)=>{calls.push({action,data,options});return saveResult;}});
 vm.runInContext(['seDayStatus','seClockMinutes','seMatchDuration','seDayWindow','seOverlap','seDayTime','seUsed','seFixtureCompleted','seFixtureLocked','seOrderName','seTeamNumbers','seBlankSlots','seClearTeam','seTrimSlots','seOverflow','seOverflowText','seTransferProblem','seMovePlan','seMovePlayer','seClearOrder'].map(extract).join('\n'),c);
 return {c,s,calls,notices,orders,saved:value=>saveResult=value};
}
const occupied=(f,day='d1')=>f.slots.map(slot=>slot[day]).filter(Boolean);
function apply(fixtures,plan){return fixtures.map(f=>plan.fixtures.find(next=>next.id===f.id)||f);}
function assertUniqueDates(fixtures){const seen=new Set();for(const f of fixtures)for(const [day,details] of f.details.days.entries())for(const slot of f.slots){const id=slot['d'+(day+1)];if(id){const key=details.date+':'+id;assert.ok(!seen.has(key),'Duplicate selection: '+key);seen.add(key);}}}

test('full-XI transfer inserts without overwriting, pads the source and leaves inputs untouched',()=>{
 const h=harness(),[a,b]=h.s.data.fixtures,before=plain([a,b]);const plan=h.c.seMovePlan(a,b,3,4),nextA=plan.fixtures.find(f=>f.id==='A'),nextB=plan.fixtures.find(f=>f.id==='B');
 assert.deepEqual(plain([a,b]),before);assert.equal(nextA.slots.length,11);assert.equal(nextB.slots.length,12);assert.equal(occupied(nextA).length,10);assert.equal(occupied(nextB).length,12);assert.equal(nextB.slots[plan.slot].d1,'A-3');assert.equal(plan.slot,4);
 const expected=occupied(b);expected.splice(4,0,'A-3');assert.deepEqual(plain(occupied(nextB)),expected);assert.deepEqual(plain(occupied(nextA)),occupied(a).filter(id=>id!=='A-3'));assert.equal(nextA.revision,a.revision);assert.equal(nextB.revision,b.revision);
});

test('inserting into a team with vacancies consumes the nearest wholly empty row',()=>{
 const a=team('A'),b=team('B');b.slots[1]={d1:null,d2:null};b.slots[9]={d1:null,d2:null};const h=harness([a,b]),plan=h.c.seMovePlan(a,b,0,7),next=plan.fixtures.find(f=>f.id==='B');
 assert.equal(next.slots.length,11);assert.equal(next.slots[1].d1,null,'The distant vacancy stays in place');assert.equal(next.slots[plan.slot].d1,'A-0');assert.equal(occupied(next).length,10);assert.deepEqual(plain(occupied(next).filter(id=>id!=='A-0')),occupied(b));
});

test('insertion position follows the player when a vacancy before it is consumed',()=>{
 const a=team('A'),b=team('B');b.slots[2]={d1:null,d2:null};const h=harness([a,b]),plan=h.c.seMovePlan(a,b,0,9),next=plan.fixtures.find(f=>f.id==='B');
 assert.equal(plan.slot,8);assert.equal(next.slots[8].d1,'A-0');assert.equal(next.slots.length,11);assert.deepEqual(plain(occupied(next).filter(id=>id!=='A-0')),occupied(b));
});

test('A to full B to full C and back retains every player exactly once',()=>{
 const h=harness();let fixtures=structuredClone(h.s.data.fixtures);const original=fixtures.flatMap(f=>occupied(f)).sort();
 for(const [fromId,toId,to] of [['A','B',5],['B','C',3],['C','A',0]]){
  const from=fixtures.find(f=>f.id===fromId),target=fixtures.find(f=>f.id===toId),index=from.slots.findIndex(slot=>slot.d1==='A-0');
  fixtures=apply(fixtures,h.c.seMovePlan(from,target,index,to));assertUniqueDates(fixtures);assert.deepEqual(fixtures.flatMap(f=>occupied(f)).sort(),original);
 }
 assert.deepEqual(fixtures.map(f=>occupied(f).length),[11,11,11]);assert.deepEqual(fixtures.map(f=>f.slots.length),[11,11,11]);assert.equal(fixtures[0].slots[0].d1,'A-0');
});

test('bracket partners stay in one row and a one-day vacancy never erases its other partner',()=>{
 const a=team('A',11,{twoDays:true,brackets:true}),b=team('B',11,{twoDays:true,brackets:true});a.slots[0].d2='A-partner';b.slots[5].d1=null;const h=harness([a,b]),plan=h.c.seMovePlan(a,b,0,5),next=plan.fixtures.find(f=>f.id==='B');
 assert.equal(next.slots.length,12,'A partly occupied row is not a spare row');assert.deepEqual(plain(next.slots[plan.slot]),{d1:'A-0',d2:'A-partner'});assert.ok(next.slots.some(slot=>slot.d1===null&&slot.d2==='B-5'));assert.equal(occupied(next,'d2').length,12);assertUniqueDates(plan.fixtures);
});

test('slot trimming removes only fully empty excess rows and pads short lists',()=>{
 const h=harness(),filled=team('A',12).slots,all=filled.slice();all.splice(3,0,{d1:null,d2:null});all.push({d1:null,d2:'partner'});const next=h.c.seTrimSlots(all);
 assert.equal(next.length,13);assert.deepEqual(plain(next.filter(slot=>slot.d1||slot.d2)),plain(all.filter(slot=>slot.d1||slot.d2)));assert.equal(h.c.seTrimSlots([]).length,11);assert.equal(h.c.seTrimSlots([{d1:'only',d2:null}]).length,11);
});

test('overflow is counted per playing day and ignores normal or short XIs',()=>{
 const h=harness(),f=team('A',12,{twoDays:true,brackets:true});f.slots[11].d2=null;
 assert.deepEqual(plain(h.c.seOverflow(f)),[{day:1,count:12,extra:1}]);assert.deepEqual(plain(h.c.seOverflow(team('B',9))),[]);
 f.slots.push({d1:null,d2:'day2-extra'},{d1:null,d2:'day2-second'});assert.deepEqual(plain(h.c.seOverflow(f)),[{day:1,count:12,extra:1},{day:2,count:13,extra:2}]);
});

test('compatibility accepts matching dates and preserves bracket restrictions',()=>{
 const a=team('A',11,{twoDays:true,brackets:true}),b=team('B',11,{twoDays:true,brackets:true});a.slots[0].d2='partner';const h=harness([a,b]);assert.equal(h.c.seTransferProblem(a,b,0,h.s.data),'');
 b.details.brackets=false;assert.ok(h.c.seTransferProblem(a,b,0,h.s.data));b.details.brackets=true;b.details.days[1].date='2099-10-25';assert.ok(h.c.seTransferProblem(a,b,0,h.s.data));
 const one=team('One');h.s.data.fixtures.push(one);assert.ok(h.c.seTransferProblem(a,one,0,h.s.data),'Different day counts require a separate explicit selection');
});

test('compatibility rejects inactive, unavailable, locked and cancelled moves',()=>{
 for(const change of [h=>h.s.data.roster[0].active=false,h=>h.s.data.roster[0].availability.available_dates=[],h=>h.s.data.fixtures[0].published={},h=>h.s.data.fixtures[1].published={},h=>h.s.data.fixtures[0].details.cancelled=true,h=>h.s.data.fixtures[1].details.cancelled=true]){
  const h=harness();change(h);assert.ok(h.c.seTransferProblem(h.s.data.fixtures[0],h.s.data.fixtures[1],0,h.s.data));
 }
});

test('compatibility excludes only moved source cells and retains other-team/date duplicate checks',()=>{
 const h=harness(),[a,b,c]=h.s.data.fixtures;assert.equal(h.c.seTransferProblem(a,b,0,h.s.data),'');
 c.slots[4].d1='A-0';assert.ok(h.c.seTransferProblem(a,b,0,h.s.data));c.slots[4].d1='C-4';a.slots[2].d1='A-0';assert.ok(h.c.seTransferProblem(a,b,0,h.s.data),'Another occurrence in the source is still a conflict');a.slots[2].d1='A-2';
 h.s.data.roster.find(p=>p.id==='C-4').name='A-0';assert.ok(h.c.seTransferProblem(a,b,0,h.s.data),'A separately selected duplicate-name entry is not silently merged');
});

test('same-day T20 selections use match times instead of blocking the whole date',()=>{
 const first=team('Morning'),second=team('Afternoon');
 for(const fixture of [first,second]){fixture.details.format='t20';fixture.details.days[0].start=fixture===first?'10:00':'14:00';}
 second.slots[0].d1='Morning-0';const h=harness([first,second]),player=h.s.data.roster.find(p=>p.id==='Morning-0');
 assert.equal(h.c.seUsed(player,first.details.days[0],[second],{},first.details),false,'10:00 and 14:00 T20s do not overlap');
 second.details.days[0].start='12:00';assert.equal(h.c.seUsed(player,first.details.days[0],[second],{},first.details),true,'Overlapping T20s remain blocked');
 delete second.details.days[0].start;assert.equal(h.c.seUsed(player,first.details.days[0],[second],{},first.details),true,'Missing time remains a safe conflict');
 assert.equal(h.c.seDayTime(first.details.days[0]),dates[0]+' · 10:00');
 assert.match(source,/d\.days\.map\(seDayTime\)/,'Selection Board fixture headings include each start time');
});

test('one unavailable bracket partner prevents moving either partner',()=>{
 const a=team('A',11,{twoDays:true,brackets:true}),b=team('B',11,{twoDays:true,brackets:true});a.slots[0].d2='partner';const h=harness([a,b]);h.s.data.roster.find(p=>p.id==='partner').availability.available_dates=[dates[0]];
 assert.ok(h.c.seTransferProblem(a,b,0,h.s.data));assert.deepEqual(a.slots[0],{d1:'A-0',d2:'partner'});
});

test('moving between explicitly unlocked published teams changes draft copies only',()=>{
 const h=harness(),[a,b]=h.s.data.fixtures;for(const f of [a,b]){f.published={details:structuredClone(f.details),slots:structuredClone(f.slots)};f.selection_unlocked_until='2100-01-01T00:00:00Z';}
 const published=plain([a.published,b.published]);assert.equal(h.c.seTransferProblem(a,b,0,h.s.data),'');const plan=h.c.seMovePlan(a,b,0,3);assert.deepEqual(plain(plan.fixtures.map(f=>f.published)),published);assert.deepEqual(plain([a.published,b.published]),published);
});

test('cross-team move uses one draft save with both revisions, both undo snapshots and destination focus',async()=>{
 const h=harness(),[a,b]=h.s.data.fixtures,before=plain([a,b]);assert.equal(await h.c.seMovePlayer(a.id,0,b.id,4,a.revision,b.revision),true);assert.equal(h.calls.length,1);
 const request=h.calls[0];assert.equal(request.action,'save_board');assert.deepEqual(Array.from(request.data.fixtures,f=>[f.id,f.revision]),[['A',3],['B',3]]);assert.deepEqual(plain(request.options.undo),before);assert.equal(request.options.order.id,'B');assert.equal(request.options.order.slot,4);assert.deepEqual(plain([a,b]),before);
});

test('failed transfer keeps both teams unchanged and never performs a separate clear',async()=>{
 const h=harness(),[a,b]=h.s.data.fixtures,before=plain([a,b]);h.saved(false);assert.equal(await h.c.seMovePlayer(a.id,0,b.id,4,a.revision,b.revision),false);assert.equal(h.calls.length,1);assert.deepEqual(plain([a,b]),before);assert.equal(h.calls[0].data.fixtures.length,2);assert.equal(h.calls[0].options.undo.length,2);
});

test('stale revision on either team and protected UI states prevent any draft save',async()=>{
 for(const variant of ['sourceRevision','targetRevision','busy','pending','nonselector','differentView','differentTab','sourceLock','targetLock','empty']){
  const h=harness(),[a,b]=h.s.data.fixtures;let sourceRevision=a.revision,targetRevision=b.revision;
  if(variant==='sourceRevision')sourceRevision--;if(variant==='targetRevision')targetRevision--;if(variant==='busy')h.s.busy=true;if(variant==='pending')h.s.pending={action:'save_board'};if(variant==='nonselector')h.s.data.selector=false;if(variant==='differentView')h.s.view='roster';if(variant==='differentTab')h.c.currentTab='home';if(variant==='sourceLock')a.published={};if(variant==='targetLock')b.published={};if(variant==='empty')a.slots[0]={d1:null,d2:null};
  await h.c.seMovePlayer(a.id,0,b.id,4,sourceRevision,targetRevision);assert.equal(h.calls.length,0,variant);assert.equal(h.orders.length,0,variant);
 }
});

test('same-team move delegates to existing reorder without a second save',async()=>{
 const h=harness(),a=h.s.data.fixtures[0];await h.c.seMovePlayer(a.id,0,a.id,5,a.revision,a.revision);assert.deepEqual(h.orders,[[a.id,0,5,a.revision]]);assert.equal(h.calls.length,0);
});

test('clearing a bracket row saves both removed names in one reversible change',async()=>{
 const a=team('A',12,{twoDays:true,brackets:true});a.slots[3].d2='partner';const h=harness([a]),before=plain(a);await h.c.seClearOrder(a.id,3,a.revision);assert.equal(h.calls.length,1);const request=h.calls[0];assert.equal(request.action,'save_board');assert.equal(request.data.fixtures.length,1);assert.equal(request.data.fixtures[0].slots.length,11);assert.ok(!request.data.fixtures[0].slots.some(slot=>slot.d1==='A-3'||slot.d2==='partner'));assert.deepEqual(plain(request.options.undo),[before]);assert.deepEqual(plain(a),before);
});

test('clear requires the captured revision and cannot modify locked or busy teams',async()=>{
 for(const variant of ['stale','locked','busy','pending','nonselector']){
  const h=harness(),a=h.s.data.fixtures[0];let revision=a.revision;if(variant==='stale')revision--;if(variant==='locked')a.published={};if(variant==='busy')h.s.busy=true;if(variant==='pending')h.s.pending={};if(variant==='nonselector')h.s.data.selector=false;
  await h.c.seClearOrder(a.id,0,revision);assert.equal(h.calls.length,0,variant);
 }
});

function interactionHarness(fixtures=[team('A'),team('B'),team('C')]){
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<main id="sePage"></main>'),document=dom.window.document,h=harness(fixtures),focused=[];
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
 document.getElementById('sePage').innerHTML=fixtures.map((f,j)=>`<section data-se-team="${f.id}"><div data-se-order-list="${f.id}">${f.slots.map((slot,i)=>`<div class="se-slot"><span class="se-slot-number">${i+1}</span><button type="button" data-se-order="${i}" data-se-order-fixture="${f.id}">${slot.d1||slot.d2||'Vacant'}</button></div>`).join('')}</div></section>`).join('');
 for(const [j,card] of [...document.querySelectorAll('[data-se-team]')].entries()){
  const list=card.querySelector('[data-se-order-list]');let capture=null;list.setPointerCapture=id=>capture=id;list.hasPointerCapture=id=>capture===id;list.releasePointerCapture=()=>capture=null;
  for(const [i,row] of [...list.children].entries())row.getBoundingClientRect=()=>({top:100+i*30,bottom:130+i*30,height:30,left:j*400,right:j*400+300,width:300});
 }
 document.elementFromPoint=(x,y)=>y<0||y>800||x<0?null:document.querySelector('[data-se-team="'+(['A','B','C'][Math.floor(x/400)]||'outside')+'"]');
 Object.assign(h.c,{document,window:dom.window,AbortController:dom.window.AbortController,innerWidth:1200,innerHeight:900,requestAnimationFrame:()=>1,cancelAnimationFrame(){},seVisibleTop:()=>0,seEsc:value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),seBoardFixtures:()=>h.s.data.fixtures,seFocusOrder:(id,index)=>focused.push([id,index])});
 vm.runInContext(['seOrderPosition','seBindOrder'].map(extract).join('\n'),h.c);h.c.seBindOrder();
 const handle=(id,index=0)=>document.querySelector('[data-se-order-fixture="'+id+'"][data-se-order="'+index+'"]');
 const pointer=(type,x,y,{touch=false,id=1}={})=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{clientX:x,clientY:y,pointerId:id,button:0,isPrimary:true,pointerType:touch?'touch':'mouse'});dom.window.dispatchEvent(event);};
 const start=(id='A',index=0,{touch=false}={})=>handle(id,index).onpointerdown({button:0,isPrimary:true,pointerId:1,clientX:20+['A','B','C'].indexOf(id)*400,clientY:115+index*30,pointerType:touch?'touch':'mouse',preventDefault(){}});
 return {...h,dom,document,focused,handle,pointer,start};
}

test('tap dialog disables a no-op, enables a new position and cancels without saving',()=>{
 const h=interactionHarness();h.handle('A').click();const dialog=h.document.getElementById('seOrderDialog'),move=dialog.querySelector('[type=submit]'),position=dialog.querySelector('#seOrderPosition');assert.equal(dialog.open,true);assert.equal(move.disabled,true,'Current position must not present an inert Move action');
 position.value='3';position.dispatchEvent(new h.dom.window.Event('change'));assert.equal(move.disabled,false);dialog.querySelector('[data-se-order-cancel]').click();assert.equal(h.document.getElementById('seOrderDialog'),null);assert.equal(h.s.ordering,false);assert.equal(h.calls.length,0);assert.deepEqual(h.focused,[['A',0]]);
});

test('tap dialog exposes overflow before moving and submits one atomic request',async()=>{
 const h=interactionHarness();h.handle('A').click();const dialog=h.document.getElementById('seOrderDialog'),choice=dialog.querySelector('#seOrderTeam');choice.value='B';choice.dispatchEvent(new h.dom.window.Event('change'));
 assert.match(dialog.querySelector('#seMoveHint').textContent,/12\/11/);assert.equal(dialog.querySelector('#seOrderPosition').options.length,12);assert.equal(dialog.querySelector('[type=submit]').disabled,false);dialog.querySelector('form').onsubmit({preventDefault(){}});await Promise.resolve();
 assert.equal(h.document.getElementById('seOrderDialog'),null);assert.equal(h.calls.length,1);assert.equal(h.calls[0].data.fixtures.length,2);assert.equal(h.calls[0].options.order.id,'B');assert.equal(h.calls[0].options.order.slot,11);
});

test('tap dialog explains incompatible target and retains a usable clear action',async()=>{
 const h=interactionHarness();h.s.data.fixtures[1].details.days[0].date='2099-10-18';h.handle('A').click();const dialog=h.document.getElementById('seOrderDialog'),choice=dialog.querySelector('#seOrderTeam');choice.value='B';choice.dispatchEvent(new h.dom.window.Event('change'));
 assert.equal(dialog.querySelector('[type=submit]').disabled,true);assert.equal(dialog.querySelector('#seOrderPosition').disabled,true);assert.match(dialog.querySelector('#seMoveHint').textContent,/different playing dates/i);assert.equal(dialog.querySelector('[data-se-order-clear]').disabled,false);dialog.querySelector('[data-se-order-clear]').click();await Promise.resolve();assert.equal(h.calls.length,1);assert.deepEqual(Array.from(h.calls[0].data.fixtures,f=>f.id),['A']);assert.equal(occupied(h.calls[0].data.fixtures[0]).length,10);
});

test('Escape closes the tap dialog and stale target changes cannot be submitted',async()=>{
 const h=interactionHarness();h.handle('A').click();let dialog=h.document.getElementById('seOrderDialog');dialog.dispatchEvent(new h.dom.window.Event('cancel',{cancelable:true}));assert.equal(h.document.getElementById('seOrderDialog'),null);assert.equal(h.calls.length,0);
 h.handle('A').click();dialog=h.document.getElementById('seOrderDialog');const choice=dialog.querySelector('#seOrderTeam');choice.value='B';choice.dispatchEvent(new h.dom.window.Event('change'));h.s.data.fixtures[1].revision++;dialog.querySelector('form').onsubmit({preventDefault(){}});await Promise.resolve();assert.equal(h.calls.length,0);assert.ok(h.notices.some(message=>/changed/i.test(message)));assert.equal(h.s.ordering,false);
});

test('cross-team pointer drop previews an insertion and suppresses its following click',async()=>{
 const h=interactionHarness(),before=plain(h.s.data.fixtures);h.start();h.pointer('pointermove',450,250);assert.ok(h.document.querySelector('[data-se-team="B"].se-team-drop'));assert.match(h.document.querySelector('.se-order-ghost').textContent,/B.*12\/11/);assert.equal(h.document.querySelector('.se-order-marker').parentElement.dataset.seOrderList,'B');assert.deepEqual(plain(h.s.data.fixtures),before,'Hover never changes data');
 h.pointer('pointerup',450,250);await Promise.resolve();assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.order.id,'B');assert.equal(h.calls[0].options.order.slot,5);assert.equal(h.document.querySelector('.se-order-ghost,.se-order-marker,.se-team-drop'),null);assert.equal(h.s.ordering,false);h.handle('A').click();assert.equal(h.document.getElementById('seOrderDialog'),null,'Synthetic click after a drag must not open the move dialog');
});

test('outside drop, Escape and touch pointer cancellation leave all players in place',()=>{
 for(const ending of ['outside','escape','pointercancel']){
  const h=interactionHarness(),before=plain(h.s.data.fixtures);h.start('A',0,{touch:true});h.pointer('pointermove',450,250,{touch:true});
  if(ending==='outside')h.pointer('pointerup',1500,250,{touch:true});else if(ending==='escape')h.dom.window.dispatchEvent(new h.dom.window.KeyboardEvent('keydown',{key:'Escape',cancelable:true}));else h.pointer('pointercancel',450,250,{touch:true});
  assert.equal(h.calls.length,0,ending);assert.deepEqual(plain(h.s.data.fixtures),before,ending);assert.equal(h.s.ordering,false,ending);assert.equal(h.document.querySelector('.se-order-ghost,.se-order-marker,.se-team-drop'),null,ending);
 }
});

test('a short touch movement remains a tap and arrow keys retain same-team reorder',()=>{
 const h=interactionHarness();h.start('A',0,{touch:true});h.pointer('pointermove',23,118,{touch:true});h.pointer('pointerup',23,118,{touch:true});assert.equal(h.calls.length,0);h.handle('A').click();assert.ok(h.document.getElementById('seOrderDialog'));h.document.querySelector('[data-se-order-cancel]').click();
 for(const [key,to] of [['ArrowDown',1],['End',10],['Home',0]])h.handle('A').onkeydown({key,preventDefault(){}});assert.deepEqual(h.orders,[['A',0,1,3],['A',0,10,3],['A',0,0,3]]);
});


test('explicit final-position choices honour every batting number with multiple vacancies',()=>{
 const a=team('A'),b=team('B');b.slots[2]={d1:null,d2:null};b.slots[8]={d1:null,d2:null};const h=harness([a,b]);
 for(let position=0;position<11;position++){const plan=h.c.seMovePlan(a,b,0,position,true),next=plan.fixtures.find(f=>f.id==='B');assert.equal(plan.slot,position,'Chosen batting position '+(position+1));assert.equal(next.slots[position].d1,'A-0');}
});

test('tap honours position ten when a vacancy before it is consumed',async()=>{
 const a=team('A'),b=team('B');b.slots[2]={d1:null,d2:null};const h=interactionHarness([a,b]);h.handle('A').click();const dialog=h.document.getElementById('seOrderDialog'),choice=dialog.querySelector('#seOrderTeam');choice.value='B';choice.dispatchEvent(new h.dom.window.Event('change'));const position=dialog.querySelector('#seOrderPosition'),tenth=[...position.options].find(option=>option.textContent==='10');assert.ok(tenth);position.value=tenth.value;position.dispatchEvent(new h.dom.window.Event('change'));dialog.querySelector('form').onsubmit({preventDefault(){}});await Promise.resolve();
 assert.equal(h.calls.length,1);const moved=h.calls[0].data.fixtures.find(f=>f.id==='B');assert.equal(moved.slots[9].d1,'A-0');assert.equal(h.calls[0].options.order.slot,9);assert.equal(moved.slots.length,11);
});


test('focus returns to the empty player picker after clearing the final occupied row',()=>{
 const h=interactionHarness(),handle=h.handle('A',10);const row=handle.closest('.se-slot');handle.remove();const empty=h.document.createElement('button');empty.type='button';empty.dataset.seFixture='A';empty.dataset.seSlot='10';empty.textContent='Choose player';empty.getBoundingClientRect=()=>({top:100,bottom:140});row.append(empty);vm.runInContext(extract('seFocusOrder'),h.c);h.c.seFocusOrder('A',10);assert.equal(h.document.activeElement,empty);
});

test('clear team clears both days and excess rows in one undoable draft save',async()=>{
 const a=team('A',12,{twoDays:true,brackets:true});a.slots[0].d2='partner';a.details.match_roles={d1:{captain_id:'A-0',captain_manual:true}};
 a.published={details:structuredClone(a.details),slots:structuredClone(a.slots)};a.selection_unlocked_until='2100-01-01T00:00:00Z';
 const h=harness([a,team('B')]),before=plain(h.s.data.fixtures),prompts=[];h.c.confirm=message=>{prompts.push(message);return true;};
 assert.equal(await h.c.seClearTeam('A',a.revision),true);assert.equal(prompts.length,1);assert.match(prompts[0],/Both days, including bracketed pairs/);assert.equal(h.calls.length,1);
 const {data,options}=h.calls[0],cleared=data.fixtures[0];assert.equal(data.fixtures.length,1);assert.equal(cleared.slots.length,11);assert.ok(cleared.slots.every(slot=>slot.d1===null&&slot.d2===null));
 assert.deepEqual(plain(cleared.details.match_roles),{});assert.equal(cleared.details.captain_id,null);assert.deepEqual(plain(cleared.published),before[0].published);assert.deepEqual(plain(options.undo),[before[0]]);
 assert.deepEqual(plain(h.s.data.fixtures),before,'The save request does not mutate loaded teams');
 for(const key of ['grade','competition','days','brackets'])assert.deepEqual(plain(cleared.details[key]),plain(before[0].details[key]));
});
test('clear team cancellation, stale revision, empty team and access guards never save',async()=>{
 for(const variant of ['cancel','stale','empty','locked','cancelled','busy','pending','nonselector','away']){
  const h=harness(),a=h.s.data.fixtures[0];let prompted=0,revision=a.revision;h.c.confirm=()=>{prompted++;return variant!=='cancel';};
  if(variant==='stale')revision--;if(variant==='empty')a.slots=h.c.seBlankSlots();if(variant==='locked')a.published={};if(variant==='cancelled')a.details.cancelled=true;
  if(variant==='busy')h.s.busy=true;if(variant==='pending')h.s.pending={};if(variant==='nonselector')h.s.data.selector=false;if(variant==='away')h.s.view='availability';
  assert.equal(await h.c.seClearTeam('A',revision),false,variant);assert.equal(h.calls.length,0,variant);assert.equal(prompted,variant==='cancel'?1:0,variant);
 }
});
test('move feedback distinguishes filling a vacancy from adding a twelfth player',async()=>{
 for(const vacant of [false,true]){
  const h=harness(),[a,b]=h.s.data.fixtures;if(vacant)b.slots[4]={d1:null,d2:null};await h.c.seMovePlayer(a.id,0,b.id,2,a.revision,b.revision);
  const note=h.calls[0].options.order.feedback;assert.match(note,/A: 10\/11/);assert.match(note,vacant?/B: 11\/11/:/B: 12\/11/);assert.equal(note.includes('vacant place filled'),vacant);
 }
});

function savedBoardHarness(fixtures=[team('A'),team('B')]){
 const h=harness(fixtures),{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="sePage"><p id="seNotice"></p><main id="seContent"></main></div>'),document=dom.window.document;
 let stored=structuredClone(h.s.data);const requests=[];
 Object.assign(h.c,{document,crypto:require('node:crypto').webcrypto,URLSearchParams,location:{search:''},club:{id:'club'},selectionAccess:{},seFetchSignupFollowup:async()=>({}),seApplyWeekLaunch(){},seButtonWorking:()=>()=>{},sePersist(){},seLock(){},refreshClubMessageBadge(){},sePrepareMatch:f=>structuredClone(f),seGuardFixtureEdit:()=>true,seEsc:value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),seMatchRoles:()=>({d1:{}}),seMatchRoleIssues:()=>[],seDraftChanged:()=>true,seScorecardNote:()=>'',seFixtureLockControls:()=>'',seMatchRoleFields:()=>'',seBoardSlot:(f,slot,i)=>'<p data-row="'+i+'">'+(slot.d1||'Vacant')+'</p>',seFixtureDetailsAction:()=>'',seBoardPublishedTeam:()=>'',seBoardComments:()=>'',seBoardMatchConversation:()=>'',SE_FORMATS:[],supabase:{rpc:async(name,args)=>{
  if(name==='club_week_api')return {data:{},error:null};
  if(name==='club_socials_api')return {data:{allowed:false},error:null};
  if(args.p_action==='context')return {data:structuredClone(stored),error:null};
  assert.equal(args.p_action,'save_board');const data=args.p_data;requests.push(plain(data));const revisions={};
  for(const next of data.fixtures){const old=stored.fixtures.find(f=>f.id===next.id);assert.equal(next.revision,old.revision);revisions[next.id]=old.revision+1;}
  stored.fixtures=stored.fixtures.map(f=>{const next=data.fixtures.find(n=>n.id===f.id);return next?{...structuredClone(next),revision:revisions[f.id]}:f;});
  return {data:{saved:true,revisions},error:null};
 }}});
 h.c.drawSelections=()=>{document.getElementById('seContent').innerHTML=h.s.data.fixtures.map(f=>h.c.seTeamCard(f)).join('');};
 vm.runInContext(['seRPC','seReload','seMutate','seCounts','seBoardCounts','seTeamChangeNotice','seCopyState','seCopyControls','seTeamCard'].map(extract).join('\n'),h.c);
 return {...h,document,requests,stored:()=>stored};
}
test('full XI move survives save and reload, renders 12/11 with warning, and Undo restores both teams',async()=>{
 const h=savedBoardHarness(),before=plain(h.s.data.fixtures),[a,b]=h.s.data.fixtures;
 assert.equal(await h.c.seMovePlayer(a.id,3,b.id,4,a.revision,b.revision),true);assert.equal(h.requests.length,1);
 assert.deepEqual(h.s.data.fixtures.map(f=>occupied(f).length),[10,12]);assert.equal(h.document.querySelectorAll('[data-se-team="B"] [data-row]').length,12);
 assert.ok(h.document.querySelector('[data-se-team="B"].se-team-overfull'));assert.match(h.document.querySelector('[data-se-team="B"] .se-overflow-count').textContent,/12\/11/);
 assert.match(h.document.querySelector('[data-se-team="B"] .se-team-change').textContent,/A: 10\/11.*B: 12\/11/);assert.equal(h.s.undo.length,1);
 assert.deepEqual(h.s.data.fixtures.flatMap(f=>occupied(f)).sort(),before.flatMap(f=>occupied(f)).sort());
 const undo=h.s.undo.at(-1);await h.c.seMutate('save_board',{fixtures:undo.before.map(f=>({...f,revision:undo.expected[f.id]}))});
 assert.deepEqual(plain(h.s.data.fixtures.map(f=>f.slots)),before.map(f=>f.slots));assert.equal(h.document.querySelector('.se-team-overfull,.se-team-change'),null);
});
test('vacant XI move saves eleven with explicit vacancy feedback and loses no player',async()=>{
 const a=team('A'),b=team('B',10),h=savedBoardHarness([a,b]),before=plain(h.s.data.fixtures);
 await h.c.seMovePlayer('A',2,'B',2,a.revision,b.revision);assert.deepEqual(h.s.data.fixtures.map(f=>occupied(f).length),[10,11]);assert.equal(h.document.querySelector('.se-team-overfull'),null);
 assert.match(h.document.querySelector('.se-team-change').textContent,/vacant place filled.*A: 10\/11.*B: 11\/11/);assert.deepEqual(h.s.data.fixtures.flatMap(f=>occupied(f)).sort(),before.flatMap(f=>occupied(f)).sort());
 const current=h.s.data.fixtures.find(f=>f.id==='B');current.revision++;h.c.drawSelections();assert.equal(h.document.querySelector('.se-team-change'),null,'Old move feedback must not describe a newer team revision');
});
test('clear team saves an empty XI, hides its clear action and restores both days through Undo',async()=>{
 const a=team('A',12,{twoDays:true,brackets:true});a.slots[2].d2='partner';const h=savedBoardHarness([a,team('B')]),before=plain(h.s.data.fixtures);h.c.seMatchRoles=()=>({d1:{},d2:{}});h.c.confirm=()=>true;
 await h.c.seClearTeam('A',a.revision);assert.equal(h.requests.length,1);assert.equal(h.document.querySelector('[data-se-team="A"] [data-se-clear-team]'),null);assert.ok(h.document.querySelector('[data-se-team="B"] [data-se-clear-team]'));
 assert.equal(h.s.data.fixtures[0].slots.length,11);assert.equal(occupied(h.s.data.fixtures[0]).length,0);assert.equal(occupied(h.s.data.fixtures[0],'d2').length,0);assert.deepEqual(plain(h.s.data.fixtures[1]),before[1]);
 const undo=h.s.undo.at(-1);await h.c.seMutate('save_board',{fixtures:undo.before.map(f=>({...f,revision:undo.expected[f.id]}))});assert.deepEqual(plain(h.s.data.fixtures[0].slots),before[0].slots);
});
