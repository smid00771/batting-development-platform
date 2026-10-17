const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const names=['seBoardMatchConversation','seBindBoardChats','seLoadBoardChat','seBoardComments','seReadOnlyTeamCard','seBoard','sePublishedDates','seClubDate','seMatchConversationClosed','seUpdateConversationState','seMutate'];
function extract(source,name){const a=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(a>=0,name);const rest=source.slice(a),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
function harness(file){
 const dom=new JSDOM('<main id="sePage"><div id="seContent"></div></main>'),document=dom.window.document,calls=[],posts=[],receipts=new Set();
 const fixture={id:'first',can_chat:true,can_comment:true,revision:4,details:{grade:'First XI',opposition:'Visitors',days:[{date:'2026-10-17'}]},slots:[{d1:'player'}]};fixture.published={details:structuredClone(fixture.details)};
 const s={key:'user:club',view:'board',date:'2026-10-17',undo:[],data:{captain:true,selector:false,can_view_board:true,roster:[{id:'player',name:'Selected player'}],fixtures:[fixture],access:{timezone:'Australia/Sydney',head_selector_id:'head'}}};
 let clock='2026-10-17T01:00:00Z';class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}}
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=vm.createContext({document,Date:Clock,Intl,crypto:require('node:crypto').webcrypto,currentTab:'teams',selectionState:s,ensureSelections:()=>s,selectionsScopeKey:()=>s.key,
  seEsc:esc,seName:()=> 'Selected player',seDate:String,seOpt:()=>'',seBoardRoleMarks:()=>'',seDraftChanged:()=>false,seScorecardNote:()=>'',seTeamNumbers:()=> '1/11',
  seBoardAccess:d=>d.can_view_board,seBoardFixtures:()=>s.data.fixtures,seFixtureLocked:()=>true,seFollowupPanel:()=>'',seBindConversations(){},seBindBoardComments(){},seFixtureEditor(){},recordSelectionNavigation(){},
  seButtonWorking:()=>()=>{},seGuardFixtureEdit:()=>true,sePersist(){},seNotice:text=>s.notice=text,seLock(){},seReload:async()=>true,
  seReadButton:async(button,label,run)=>{button.textContent=label;button.disabled=true;return run();},confirmLeaveSelections:()=>true,drawSelections:()=>c.seBoard(),
  seRPC:async(action,data)=>{calls.push({action,data});if(action==='posts')return posts;if(action==='post'){if(!receipts.has(data.request_id)){receipts.add(data.request_id);posts.push({author_name:'Captain',body:data.body,created_at:'2026-10-17T01:00:00Z'});}return {saved:true};}throw Error('Unexpected '+action);}
 });vm.runInContext(names.map(n=>extract(fs.readFileSync(file,'utf8'),n)).join('\n'),c);
 const open=async()=>{s.boardChatOpen='first';c.seBoard();await settle();return document.querySelector('[data-se-board-chat]');};
 return {c,s,fixture,document,dom,calls,posts,open,setClock:x=>clock=x};
}
const settle=()=>new Promise(r=>setImmediate(r));
for(const file of ['app.js','demo.html']){
 test(file+': conversation appears only for an authorised published team and keeps the captain board read-only',async()=>{
  const h=harness(file);h.fixture.published=null;h.c.seBoard();assert.equal(h.document.querySelector('[data-se-board-chat]'),null);
  h.fixture.published={details:h.fixture.details};h.fixture.can_chat=false;h.c.seBoard();assert.equal(h.document.querySelector('[data-se-board-chat]'),null);
  h.fixture.can_chat=true;h.c.seBoard();assert.ok(h.document.querySelector('[data-se-board-chat]'));assert.equal(h.calls.length,0,'Collapsed conversation loads no messages');
  assert.equal(h.document.querySelector('[data-se-slot],#sePublish,[data-se-copylast]'),null);assert.match(h.document.body.textContent,/Selection comments · private/);
  const panel=await h.open();assert.ok(panel.open);assert.equal(h.calls[0].action,'posts');assert.equal(h.calls[0].data.id,'first');assert.ok(h.document.querySelector('[data-se-team]'),'Team stays on screen');
 });
 test(file+': existing match messages are escaped and the audience is clear',async()=>{
  const h=harness(file);h.posts.push({author_name:'<img src=x>',body:'Meet at <b>12</b>',created_at:'2026-10-17T00:00:00Z'});const panel=await h.open();
  assert.match(panel.textContent,/Visible to selected players, captains and match staff/);assert.match(panel.textContent,/Meet at <b>12<\/b>/);assert.equal(panel.querySelector('img,b'),null);
 });
 test(file+': sending stays on the board, shows progress and preserves a private draft',async()=>{
  const h=harness(file);h.s.boardCommentDrafts={first:'Private note'};await h.open();const rpc=h.c.seRPC;let release;h.c.seRPC=(action,data)=>action==='post'?new Promise(r=>release=async()=>r(await rpc(action,data))):rpc(action,data);
  const form=h.document.querySelector('[data-se-board-chat-form]');form.elements.body.value='Meet at noon';form.oninput();assert.equal(h.s.formDirty,true);
  const task=form.onsubmit({preventDefault(){}});assert.equal(form.querySelector('button').textContent,'Sending…');assert.equal(form.querySelector('button').disabled,true);await form.onsubmit({preventDefault(){}});
  await release();await task;await settle();assert.equal(h.posts.length,1);assert.equal(h.s.view,'board');assert.equal(h.s.boardChatDrafts.first,undefined);assert.equal(h.s.boardCommentDrafts.first,'Private note');assert.equal(h.s.formDirty,true);assert.match(h.document.querySelector('[data-se-board-chat]').textContent,/Meet at noon/);assert.match(h.s.notice,/Message sent/);
 });
 test(file+': uncertain send keeps the draft and retries the same request without a duplicate',async()=>{
  const h=harness(file);await h.open();const rpc=h.c.seRPC;let fail=true;h.c.seRPC=async(action,data)=>{const result=await rpc(action,data);if(action==='post'&&fail){fail=false;throw Error('Response lost');}return result;};
  const form=h.document.querySelector('form');form.elements.body.value='Keep this message';form.oninput();await form.onsubmit({preventDefault(){}});await settle();
  assert.equal(h.s.boardChatDrafts.first,'Keep this message');assert.ok(h.s.pending);assert.equal(h.document.querySelector('[data-se-board-chat-form] textarea').disabled,true);assert.equal(h.posts.length,1);
  await h.c.seMutate(h.s.pending.action,h.s.pending.data);await settle();const sends=h.calls.filter(x=>x.action==='post');assert.equal(sends.length,2);assert.equal(sends[0].data.request_id,sends[1].data.request_id);assert.equal(h.posts.length,1);assert.equal(h.s.boardChatDrafts.first,undefined);assert.equal(h.s.formDirty,false);
 });
 test(file+': refresh keeps unsent messages and only reloads the existing match thread',async()=>{
  const h=harness(file);await h.open();const form=h.document.querySelector('form');form.elements.body.value='Still typing';form.oninput();const button=h.document.querySelector('[data-se-board-chat-refresh]');await button.onclick({currentTarget:button});
  assert.equal(h.document.querySelector('form textarea').value,'Still typing');assert.equal(h.calls.filter(x=>x.action==='posts').length,2);assert.equal(h.calls.filter(x=>x.action==='post').length,0);assert.equal(h.s.formDirty,true);
 });
 test(file+': closure at club midnight disables sending and keeps past messages readable',async()=>{
  const h=harness(file);h.posts.push({author_name:'Captain',body:'Saved message',created_at:'2026-10-17T01:00:00Z'});await h.open();const form=h.document.querySelector('form');form.elements.body.value='Unsent';form.oninput();
  h.setClock('2026-10-17T13:00:00Z');h.c.seUpdateConversationState();assert.equal(form.elements.body.readOnly,true);assert.equal(form.querySelector('[type=submit]').disabled,true);await form.onsubmit({preventDefault(){}});assert.equal(h.calls.filter(x=>x.action==='post').length,0);
  await h.open();assert.equal(h.document.querySelector('form'),null);assert.match(h.document.querySelector('[data-se-board-chat]').textContent,/closed/);assert.match(h.document.body.textContent,/Saved message/);
 });
 test(file+': stale message loads cannot replace another view or expose a previous club thread',async()=>{
  const h=harness(file);h.c.seBoard();let resolve;h.c.seRPC=()=>new Promise(r=>resolve=r);const task=h.c.seLoadBoardChat(h.document.querySelector('[data-se-board-chat]'));h.c.selectionState={data:{}};h.document.getElementById('seContent').innerHTML='<p>Other club</p>';resolve([{author_name:'Private',body:'Previous club message'}]);await task;assert.equal(h.document.body.textContent,'Other club');
 });
 test(file+': failed message load offers a working retry',async()=>{
  const h=harness(file),rpc=h.c.seRPC;h.c.seRPC=async()=>{throw Error('Could not connect');};await h.open();assert.match(h.document.body.textContent,/Could not connect/);h.c.seRPC=rpc;await h.document.querySelector('[data-se-board-chat] button').onclick();assert.ok(h.document.querySelector('[data-se-board-chat-form]'));assert.doesNotMatch(h.document.body.textContent,/Could not connect/);
 });
}
