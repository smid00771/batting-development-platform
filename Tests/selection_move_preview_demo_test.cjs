const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

const sourceId='third-upcoming',targetId='fourth-upcoming';
const plain=value=>JSON.parse(JSON.stringify(value));
const card=(h,id)=>h.document.querySelector(`[data-se-team="${id}"]`);
const order=(h,id)=>[...card(h,id).querySelectorAll('[data-se-order]')].map(button=>button.getAttribute('aria-label'));
const calls=(h,action)=>h.window.moveCalls.filter(args=>args.p_action===action);
const handle=(h,id,index)=>h.document.querySelector(`[data-se-order-fixture="${id}"][data-se-order="${index}"]`);

async function setup(t){
 const h=await openDemo({product:'select',role:'head',journey:'selections'});
 t.after(h.close);
 h.window.scrollBy=()=>{};
 h.window.eval("selectionState.date=selectionState.data.fixtures.find(f=>f.id==='third-upcoming').details.days[0].date;selectionState.boardDateChosen=true;drawSelections();");
 await h.settle();
 h.window.eval(`
  window.moveCalls=[];window.holdMoveSave=true;window.holdMoveContext=false;
  const moveRpc=supabase.rpc;
  supabase.rpc=async(name,args)=>{
   if(name!=='club_selections_api')return moveRpc(name,args);
   window.moveCalls.push(structuredClone(args));
   if(args.p_action==='save_board'){
    if(window.holdMoveSave)await new Promise(resolve=>window.releaseMoveSave=resolve);
    if(window.moveError)return {data:null,error:window.moveError};
    const result=await moveRpc(name,args);
    if(window.loseMoveResponse){window.loseMoveResponse=false;throw Error('Connection lost after sending the move');}
    return result;
   }
   if(args.p_action==='context'&&window.holdMoveContext)await new Promise(resolve=>window.releaseMoveContext=resolve);
   return moveRpc(name,args);
  };
 `);
 return h;
}

function keyboardMove(h){
 handle(h,sourceId,3).dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
}

test('a move appears before save and refresh, while saved state and other team cards retain their identities',async t=>{
 const h=await setup(t),before=order(h,sourceId),otherCard=card(h,targetId);
 const saved=h.window.eval('JSON.stringify(selectionState.data.fixtures)');
 h.window.holdMoveContext=true;
 keyboardMove(h);
 assert.match(order(h,sourceId)[4],new RegExp(before[3].split(', batting position')[0]));
 assert.equal(card(h,targetId),otherCard);
 assert.equal(card(h,sourceId).getAttribute('aria-busy'),'true');
 assert.match(card(h,sourceId).querySelector('.se-team-state').textContent,/Saving…/);
 assert.equal(h.window.eval('JSON.stringify(selectionState.data.fixtures)'),saved);
 assert.equal(calls(h,'save_board').length,1);assert.equal(calls(h,'context').length,0);
 keyboardMove(h);assert.equal(calls(h,'save_board').length,1);
 h.window.releaseMoveSave();await h.settle();
 assert.equal(calls(h,'context').length,1);
 assert.match(order(h,sourceId)[4],new RegExp(before[3].split(', batting position')[0]));
 assert.equal(card(h,sourceId).getAttribute('aria-busy'),'true');
 h.window.releaseMoveContext();await h.settle();
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.equal(card(h,sourceId).hasAttribute('data-se-pending-move'),false);
 assert.equal(h.document.activeElement,handle(h,sourceId,4));
 assert.equal(h.window.eval('selectionState.undo.length'),1);
 assert.equal(calls(h,'publish').length,0);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('touch drop shows both new lineups immediately and Undo restores the confirmed move',async t=>{
 const h=await setup(t),source=card(h,sourceId),target=card(h,targetId),before=order(h,sourceId);
 const list=source.querySelector('[data-se-order-list]');
 let captured=null;
 list.setPointerCapture=id=>captured=id;list.hasPointerCapture=id=>captured===id;list.releasePointerCapture=()=>captured=null;
 h.document.elementFromPoint=()=>target;
 for(const [index,row] of [...target.querySelector('[data-se-order-list]').children].entries()){
  row.getBoundingClientRect=()=>({top:100+index*30,bottom:130+index*30,height:30});
 }
 const pointer=(node,type,x,y)=>{
  const event=new h.window.Event(type,{bubbles:true,cancelable:true});
  Object.assign(event,{clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true,pointerType:'touch'});
  if(type==='pointerdown')node.onpointerdown(event);else node.dispatchEvent(event);
 };
 pointer(handle(h,sourceId,3),'pointerdown',20,205);
 pointer(h.window,'pointermove',450,250);
 pointer(h.window,'pointerup',450,250);
 const moved=before[3].split(', batting position')[0];
 assert.equal(order(h,sourceId).some(label=>label.startsWith(moved+',')),false);
 assert.ok(order(h,targetId).some(label=>label.startsWith(moved+',')));
 assert.equal(h.document.querySelectorAll('[data-se-pending-move]').length,2);
 assert.match(card(h,sourceId).textContent,/10\/11/);
 assert.match(card(h,targetId).textContent,/12 players/);
 assert.equal(calls(h,'save_board').length,1);
 assert.deepEqual(plain(calls(h,'save_board')[0].p_data.fixtures.map(f=>f.id)),[sourceId,targetId]);
 h.window.releaseMoveSave();await h.settle();
 h.window.holdMoveSave=false;await h.click('#seUndo');
 assert.deepEqual(order(h,sourceId),before);
 assert.equal(order(h,targetId).length,11);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('a lost response retains the visible proposal and retries the same saved request exactly once',async t=>{
 const h=await setup(t),before=order(h,sourceId);
 h.window.loseMoveResponse=true;
 keyboardMove(h);h.window.releaseMoveSave();await h.settle();
 const request=calls(h,'save_board')[0].p_data.request_id;
 const revision=h.window.eval("demoSelections.fixtures.find(f=>f.id==='third-upcoming').revision");
 assert.match(order(h,sourceId)[4],new RegExp(before[3].split(', batting position')[0]));
 assert.match(card(h,sourceId).querySelector('.se-team-state').textContent,/Awaiting confirmation/);
 assert.ok(h.document.querySelector('#seRetrySave'));
 const stored=JSON.parse(h.window.eval("fixtureSessionStorage.getItem('selections-pending-'+selectionState.key)"));
 assert.equal(stored.data.request_id,request);
 h.window.eval('drawSelections()');await h.settle();
 assert.match(order(h,sourceId)[4],new RegExp(before[3].split(', batting position')[0]));
 h.window.holdMoveSave=false;await h.click('#seRetrySave');
 assert.deepEqual(plain(calls(h,'save_board').map(c=>c.p_data.request_id)),[request,request]);
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.id==='third-upcoming').revision"),revision);
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.equal(h.window.eval('selectionState.undo.length'),1);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('a concurrent change restores the latest team and a rejected permission change restores the saved lineup',async t=>{
 const h=await setup(t);
 keyboardMove(h);
 h.window.eval("const f=demoSelections.fixtures.find(f=>f.id==='third-upcoming');[f.slots[0],f.slots[1]]=[f.slots[1],f.slots[0]];f.revision++;");
 h.window.releaseMoveSave();await h.settle();
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.match(h.document.querySelector('#seNotice').textContent,/changed in another session/);
 assert.equal(card(h,sourceId).hasAttribute('data-se-pending-move'),false);
 const latest=order(h,sourceId);
 h.window.moveError={code:'42501',message:'Edit access to this Selection Group is required'};
 keyboardMove(h);h.window.releaseMoveSave();await h.settle();
 assert.deepEqual(order(h,sourceId),latest);
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.match(h.document.querySelector('#seNotice').textContent,/Edit access/);
 assert.equal(h.window.eval('selectionState.undo.length'),0);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('a failed move from a previous session cannot redraw or unlock another session',async t=>{
 const h=await setup(t);
 keyboardMove(h);
 h.window.moveError={code:'P0001',message:'A team changed in another session'};
 h.window.eval("window.previousSelectionState=selectionState;selectionState={key:'another-session',busy:true};");
 h.document.querySelector('#seContent').innerHTML='<button id="anotherSave" disabled>Saving another change</button>';
 h.window.releaseMoveSave();await h.settle();
 assert.equal(h.document.querySelector('#anotherSave').disabled,true);
 assert.equal(h.window.eval('selectionState.busy'),true);
 assert.ok(h.window.previousSelectionState.pending);
 assert.equal(calls(h,'context').length,0);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
