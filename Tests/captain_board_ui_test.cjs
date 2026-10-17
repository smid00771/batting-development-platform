const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const extract=(s,n)=>{const start=s.search(new RegExp('(?:async )?function '+n+'\\('));assert.ok(start>=0,n);const rest=s.slice(start),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);};
const names=['seBoardAccess','seFollowupRows','seFollowupPanel','seBoardComments','seBoardMatchConversation','seBindBoardChats','seLoadBoardChat','seBindBoardComments','seLoadBoardComments','seReadOnlyTeamCard','seBoard','seConversationControl','seBindConversations','seHasAvailability','seIsCaptain','seSelectionTabs'];
function harness(file){
 const source=fs.readFileSync(file,'utf8'),dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,calls=[];
 const f={id:'first',revision:2,can_comment:true,comment_count:0,details:{grade:'1st Grade',opposition:'Visitors',days:[{date:'2099-10-17'}]},slots:[{d1:'p'},{d1:null}]};
 const move={fixture_id:'first',roster_id:'omitted',name:'Alex <img>',previous_grade:'1st Grade',grade:'1st Grade',kind:'left_out',availability:'available',competition:'District',date:'2099-10-17',revision:0,movement_key:'move'};
 const s={key:'club:captain',view:'board',date:'2099-10-17',undo:[],data:{captain:true,can_view_board:true,selector:false,access:{timezone:'UTC',head_selector_id:'head'},roster:[{id:'p',name:'Selected'}],fixtures:[f],conversations:[move],reviews:[],members:[]}};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=vm.createContext({document,Date,Intl,structuredClone,currentTab:'teams',selectionState:s,ensureSelections:()=>s,membership:{permission_role:'captain'},session:{user:{id:'cap'}},hasMatchCaptainAccess:()=>true,seCanSetup:d=>d.admin||d.selector,seEsc:esc,seDate:String,seOpt:(o,v)=>o.map(([id,l])=>`<option value="${id}" ${id===v?'selected':''}>${l}</option>`).join(''),seName:id=>s.data.roster.find(p=>p.id===id)?.name||'Choose player',seRoleMarks:()=>'',seBoardRoleMarks:()=>'',seDraftChanged:()=>false,seScorecardNote:()=>'',seTeamNumbers:f=>f.slots.filter(x=>x.d1).length+'/11',seBoardFixtures:()=>s.data.fixtures,seFixtureLocked:()=>false,seFixtureEditor:f=>calls.push({action:'fixture',id:f.id}),confirmLeaveSelections:()=>true,recordSelectionNavigation(){},seRPC:async(action,data)=>{calls.push({action,data});return [];},seMutate:async(action,data)=>{calls.push({action,data});if(action==='conversation'){move.spoken_at='2026-10-17T00:00:00Z';move.spoken_by='Captain';move.revision++;c.seBoard();}return true;},seReadButton:async(b,label,fn)=>fn(),seReload:async()=>{},drawSelections(){},seBoardComments(){return '';}});
 vm.runInContext(names.map(n=>extract(source,n)).join('\n'),c);return {s,f,move,c,document,calls,dom};
}
for(const file of ['app.js','demo.html']){
 test(file+': captain has one board, read-only drafts and active follow-up',async()=>{
  const h=harness(file);assert.deepEqual(Array.from(h.c.seSelectionTabs(h.s.data),x=>x[1]),['Selection Board','Teams']);h.c.seBoard();
  assert.match(h.document.body.textContent,/Draft · not published/);assert.match(h.document.body.textContent,/Not selected/);
  assert.equal(h.document.querySelector('[data-se-slot],#sePublish,#seUndo,#seNewFixture,[data-se-order],[data-se-copylast]'),null);
  assert.equal(h.document.querySelector('img'),null,'Player names escaped');
  h.document.querySelector('[data-se-edit]').click();assert.equal(h.calls.at(-1).action,'fixture');
  await h.document.querySelector('[data-se-conversation]').onclick();assert.equal(h.calls.at(-1).action,'conversation');assert.match(h.document.body.textContent,/Spoken to/);assert.match(h.document.body.textContent,/Captain/);
 });
 test(file+': follow-up distinguishes unavailable from unknown and keeps coach access',()=>{
  const h=harness(file);h.move.availability='unavailable';h.c.seBoard();assert.match(h.document.body.textContent,/Unavailable/);assert.equal(h.document.querySelector('[data-se-conversation]'),null);
  h.move.availability='unknown';h.c.seBoard();assert.match(h.document.body.textContent,/Availability not confirmed/);assert.ok(h.document.querySelector('[data-se-conversation]'));
  h.s.data.captain=false;h.s.data.can_view_board=false;h.c.seBoard();assert.equal(h.document.querySelector('[data-se-team]'),null);assert.ok(h.document.querySelector('[data-se-conversation]'),'Coach follow-up preserved without new draft access');
 });
 test(file+': comments are on the board, save once with team revision and show progress',async()=>{
  const h=harness(file);h.c.seBoard();const panel=h.document.querySelector('[data-se-comments]');await h.c.seLoadBoardComments(panel);const form=panel.querySelector('form');form.elements.body.value='Check availability';form.oninput();assert.equal(h.s.formDirty,true);
  let done;h.c.seMutate=(action,data)=>{h.calls.push({action,data});return new Promise(r=>done=r);};const task=form.onsubmit({preventDefault(){}});assert.equal(form.querySelector('[type=submit]').textContent,'Saving…');assert.equal(form.querySelector('[type=submit]').disabled,true);assert.equal(h.calls.at(-1).data.review_revision,2);done(true);await task;
  assert.equal(h.calls.filter(x=>x.action==='review_post').length,1);assert.equal(h.s.boardCommentDrafts.first,undefined);
 });
 test(file+': failed comment retains typed text and can retry; pending save disables controls',async()=>{
  const h=harness(file);h.c.seBoard();const panel=h.document.querySelector('[data-se-comments]');h.c.seMutate=async()=>false;await h.c.seLoadBoardComments(panel);const form=panel.querySelector('form');form.elements.body.value='Keep this note';await form.onsubmit({preventDefault(){}});assert.equal(h.s.boardCommentDrafts.first,'Keep this note');assert.equal(form.querySelector('button').disabled,false);
  h.s.pending={action:'review_post'};h.c.seBoard();await h.c.seLoadBoardComments(h.document.querySelector('[data-se-comments]'));assert.equal(h.document.querySelector('[data-se-comment-form] textarea').disabled,true);
 });
 test(file+': private comments stay hidden for unrelated captain and late loads cannot replace another view',async()=>{
  const h=harness(file);h.f.can_comment=false;h.c.seBoard();assert.equal(h.document.querySelector('[data-se-comments]'),null);h.f.can_comment=true;h.c.seBoard();let resolve;h.c.seRPC=()=>new Promise(r=>resolve=r);const task=h.c.seLoadBoardComments(h.document.querySelector('[data-se-comments]'));h.document.getElementById('seContent').innerHTML='<p>Another view</p>';resolve([{author_name:'Old',body:'Old comment'}]);await task;assert.equal(h.document.body.textContent,'Another view');
 });
}
