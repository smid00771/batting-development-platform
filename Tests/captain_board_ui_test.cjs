const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const extract=(s,n)=>{const start=s.search(new RegExp('(?:async )?function '+n+'\\('));assert.ok(start>=0,n);const rest=s.slice(start),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);};
const names=['seBoardAccess','seFollowupRows','seFollowupPanel','seMovement','seMovementBadge','seBoardSlot','seCopyState','seCopyControls','seTeamCard','seAvailableUnselected','seUnselectedAvailable','seDayStatus','seBoardComments','seBoardMatchConversation','seBindBoardChats','seLoadBoardChat','seBindBoardComments','seLoadBoardComments','seCaptainAvailability','seBoardPublishedTeam','seBindPublishedActions','seReadOnlyTeamCard','seBoard','seConversationControl','seBindConversations','seHasAvailability','seIsCaptain','seSelectionTabs'];
function harness(file){
 const source=fs.readFileSync(file,'utf8'),dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,calls=[];
 const f={id:'first',revision:2,can_comment:true,comment_count:0,details:{grade:file==='app.js'?'2nd Grade':'1st Grade',opposition:'Visitors',days:[{date:'2099-10-17'}]},slots:[{d1:'p'},{d1:null}]};
 const move={fixture_id:'first',roster_id:file==='app.js'?'p':'omitted',name:'Alex <img>',previous_grade:'1st Grade',grade:file==='app.js'?'2nd Grade':'1st Grade',kind:file==='app.js'?'lower_grade':'left_out',availability:'available',competition:'District',date:'2099-10-17',revision:0,movement_key:'move'};
 const s={key:'club:captain',view:'board',date:'2099-10-17',undo:[],data:{captain:true,can_view_board:true,selector:false,access:{timezone:'UTC',head_selector_id:'head'},roster:[{id:'p',name:'Selected'}],fixtures:[f],conversations:[move],reviews:[],members:[]}};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const c=vm.createContext({document,Date,Intl,structuredClone,queueMicrotask,seMountStats:()=>{},currentTab:'teams',selectionState:s,ensureSelections:()=>s,membership:{permission_role:'captain'},session:{user:{id:'cap'}},hasMatchCaptainAccess:()=>true,seCanSetup:d=>d.admin||d.selector,seEsc:esc,seDate:String,seOpt:(o,v)=>o.map(([id,l])=>`<option value="${id}" ${id===v?'selected':''}>${l}</option>`).join(''),seName:id=>s.data.roster.find(p=>p.id===id)?.name||'Choose player',seRoleMarks:()=>'',seBoardRoleMarks:()=>'',seOrderHandle:()=>'',seDraftChanged:()=>false,seScorecardNote:()=>'',seTeamNumbers:f=>f.slots.filter(x=>x.d1).length+'/11',seBoardFixtures:()=>s.data.fixtures,seFixtureLocked:f=>!!f?.locked,seMatchRoles:()=>({d1:{},d2:{}}),seMatchRoleIssues:()=>[],seOverflowText:()=>'',seFixtureLockControls:()=>'',seBoardCounts:()=>'',seTeamChangeNotice:()=>'',seMatchRoleFields:()=>'<select data-test-role><option>Captain</option></select>',SE_FORMATS:[],seBindMatchRoles(){},seBindOrder(){},sePicker(){},seFixtureEditor:f=>calls.push({action:'fixture',id:f.id}),confirmLeaveSelections:()=>true,bindSelectionBackButtons(){},seRole:()=>'',recordSelectionNavigation(){},seRPC:async(action,data)=>{calls.push({action,data});return [];},seMutate:async(action,data)=>{calls.push({action,data});if(action==='conversation'){move.spoken_at=data.spoken?'2026-10-17T00:00:00Z':null;move.spoken_by=data.spoken?'Captain':null;move.revision++;c.seBoard();}return true;},seReadButton:async(b,label,fn)=>fn(),seReload:async()=>{},drawSelections(){},seBoardComments(){return '';}});
 vm.runInContext([...names,...(file==='app.js'?['seBoardAvailability','seSelectionFixtures','seBoardGroupControl','seBindGroupControl']:[]),file==='app.js'?'seFixtureDetailsAction':'seCopyPublishedAction'].map(n=>extract(source,n)).join('\n'),c);return {s,f,move,c,document,calls,dom};
}
for(const file of ['app.js','demo.html']){
 test(file+': captain has one board, read-only drafts and active follow-up',async()=>{
  const h=harness(file);assert.deepEqual(Array.from(h.c.seSelectionTabs(h.s.data),x=>x[1]),['Selection Board']);h.c.seBoard();
  assert.match(h.document.body.textContent,/Draft · not published/);assert.match(h.document.body.textContent,file==='app.js'?/Dropped from 1st Grade/:/Not selected/);
  assert.equal(h.document.querySelector('[data-se-slot],#sePublish,#seUndo,#seNewFixture,[data-se-order],[data-se-copylast]'),null);
  assert.equal(h.document.querySelector('img'),null,'Player names escaped');
  h.document.querySelector('[data-se-edit]').click();assert.equal(h.calls.at(-1).action,'fixture');
  await h.document.querySelector('[data-se-conversation]').onclick();assert.equal(h.calls.at(-1).action,'conversation');assert.match(h.document.body.textContent,/Spoken to/);assert.match(h.document.body.textContent,/Captain/);
 });
 test(file+': follow-up distinguishes unavailable from unknown and keeps coach access',()=>{
  const h=harness(file);h.move.availability='unavailable';h.c.seBoard();if(file==='app.js')assert.equal(h.document.getElementById('seFollowup'),null);else assert.match(h.document.body.textContent,/Unavailable/);assert.equal(h.document.querySelector('[data-se-conversation]'),null);
  h.move.availability='unknown';h.c.seBoard();if(file==='demo.html')assert.match(h.document.body.textContent,/Availability not confirmed/);assert.ok(h.document.querySelector('[data-se-conversation]'));
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


test('live follow-up omits unavailable rows, retains selection decisions and counts only pending conversations',()=>{
 const h=harness('app.js');
 h.s.data.conversations=[h.move,
  {...h.move,roster_id:'unknown',name:'Unset availability',availability:'unknown'},
  {...h.move,roster_id:'down',name:'Moved down',kind:'lower_grade',grade:'2nd Grade'},
  {...h.move,roster_id:'done',name:'Already spoken to',spoken_at:'2026-10-17T00:00:00Z',spoken_by:'Captain'},
  {...h.move,roster_id:'away',name:'Unavailable player',availability:'unavailable'},
  {...h.move,roster_id:'away-done',name:'Unavailable with history',availability:'unavailable',spoken_at:'2026-10-17T00:00:00Z',spoken_by:'Captain'},
  {...h.move,fixture_id:'next-match',roster_id:'other-date',name:'Next week',date:'2099-10-24'}];
 h.f.slots=h.s.data.conversations.slice(0,4).map(m=>({d1:m.roster_id}));h.s.data.roster=h.s.data.conversations.map(m=>({id:m.roster_id,name:m.name}));
 const saved=JSON.stringify(h.s.data);h.c.seBoard();
 assert.equal(h.document.getElementById('seFollowup'),null,'No duplicate dropped-player panel');
 assert.equal(h.document.querySelectorAll('.se-player-cell [data-se-conversation]').length,4);
 assert.equal(h.document.querySelectorAll('[data-se-conversation][aria-pressed=false]').length,3);
 assert.doesNotMatch(h.document.body.textContent,/Unavailable player|Unavailable with history|No selection conversation|Next week/);
 assert.match(h.document.body.textContent,/Moved down|Already spoken to/);
 assert.equal(h.c.seMovement(h.f,'away'),undefined);
 assert.equal(h.c.seMovement(h.f,'down').roster_id,'down');
 assert.equal(JSON.stringify(h.s.data),saved,'Filtering preserves saved availability and spoken-to history');
});

test('live follow-up disappears when nobody needs it and returns if availability changes',()=>{
 const h=harness('app.js');h.move.spoken_at='2026-10-17T00:00:00Z';h.move.spoken_by='Captain';h.move.availability='unavailable';h.c.seBoard();
 assert.equal(h.document.getElementById('seFollowup'),null);
 assert.ok(h.document.querySelector('[data-se-team]'),'The Selection Board remains visible');
 h.move.availability='available';h.c.seBoard();
 assert.equal(h.document.getElementById('seFollowup'),null);assert.ok(h.document.querySelector('.se-player-cell.se-spoken'));
 assert.equal(h.document.querySelector('[data-se-conversation]').getAttribute('aria-pressed'),'true','Saved spoken-to status is retained');
});

test('live coach follow-up dates and navigation exclude unavailable-only entries',()=>{
 const h=harness('app.js');h.s.data.can_view_board=false;h.s.data.captain=false;h.move.availability='unavailable';
 assert.equal(h.c.seSelectionTabs(h.s.data).some(([key])=>key==='board'),false);
 h.c.seBoard();assert.equal(h.document.getElementById('seFollowup'),null);assert.equal(h.document.getElementById('seBoardDate'),null);
 h.s.data.conversations.push({...h.move,availability:'available',date:'2099-10-24'});
 assert.equal(h.c.seSelectionTabs(h.s.data).some(([key])=>key==='board'),true);
 h.c.seBoard();assert.equal(h.s.date,'2099-10-24');
 assert.deepEqual(Array.from(h.document.querySelectorAll('#seBoardDate option'),o=>o.value),['2099-10-24']);
 assert.equal(h.document.querySelector('[data-se-team]'),null,'Follow-up access does not grant draft access');
});

test('live conversation control cannot save after the player becomes unavailable',async()=>{
 const h=harness('app.js');h.c.seBoard();const button=h.document.querySelector('[data-se-conversation]');h.move.availability='unavailable';await button.onclick();
 assert.equal(h.calls.some(call=>call.action==='conversation'),false);
});


test('live grade-drop follow-up excludes available players who were simply not selected',()=>{
 const h=harness('app.js');h.s.data.conversations.push({...h.move,roster_id:'left-out',name:'Available but unselected',kind:'left_out'});
 h.c.seBoard();assert.equal(h.document.querySelectorAll('.se-player-cell [data-se-conversation]').length,1);
 assert.equal(h.document.getElementById('seFollowup'),null);
 assert.doesNotMatch(h.document.body.textContent,/Available but unselected/);
 assert.equal(h.c.seMovement(h.f,'left-out'),undefined);
 h.s.data.conversations.shift();h.c.seBoard();assert.equal(h.document.getElementById('seFollowup'),null);
 h.s.data.can_view_board=false;h.s.data.captain=false;
 assert.equal(h.c.seSelectionTabs(h.s.data).some(([key])=>key==='board'),false,'An omission alone does not create a conversation-only board');
});

test('live Available, not selected remains a separate list for previous and new players',()=>{
 const h=harness('app.js');h.s.data.selector=true;
 h.s.data.roster=[['p','Moved down'],['left-out','Previously selected'],['new','New player'],['unavailable','Unavailable player'],['unset','Unset player'],['inactive','Inactive player']].map(([id,name])=>({id,name,grade:'2nd Grade',active:id!=='inactive',availability:{available_dates:['unavailable','unset'].includes(id)?[]:[h.s.date],unavailable_dates:id==='unavailable'?[h.s.date]:[]}}));
 h.s.data.conversations.push({...h.move,roster_id:'left-out',name:'Previously selected',kind:'left_out'});
 h.c.seAvailableUnselected();
 assert.equal(h.document.querySelector('h2').textContent,'Available, not selected');
 assert.deepEqual(Array.from(h.document.querySelectorAll('.se-unselected-row strong'),n=>n.textContent),['New player','Previously selected']);
 assert.equal(h.document.querySelector('[data-se-conversation],#seFollowup'),null);
 assert.equal(h.s.boardPanel,'unselected');
 h.f.slots[1].d1='new';h.c.seAvailableUnselected();
 assert.deepEqual(Array.from(h.document.querySelectorAll('.se-unselected-row strong'),n=>n.textContent),['Previously selected'],'The list follows the current selections');
});


test('live grade-drop board highlight changes from purple to green through Mark spoken to',async()=>{
 const h=harness('app.js'),paint=()=>{h.document.getElementById('seContent').innerHTML=h.c.seBoardSlot(h.f,h.f.slots[0],0,{d1:{}});h.c.seBindConversations();};
 paint();assert.ok(h.document.querySelector('.se-player-cell.se-dropped'));assert.match(h.document.querySelector('.se-player-cell').textContent,/Mark spoken to/);
 await h.document.querySelector('[data-se-conversation]').onclick();paint();
 assert.ok(h.document.querySelector('.se-player-cell.se-spoken'));assert.equal(h.document.querySelector('.se-player-cell.se-dropped'),null);
 assert.match(h.document.querySelector('.se-player-cell').textContent,/Spoken to/);
 assert.equal(h.document.querySelector('[data-se-conversation]').getAttribute('aria-pressed'),'true');
 assert.equal(h.calls.at(-1).action,'conversation');assert.equal(h.calls.at(-1).data.spoken,true);
 await h.document.querySelector('[data-se-conversation]').onclick();paint();assert.ok(h.document.querySelector('.se-player-cell.se-dropped'));assert.equal(h.calls.at(-1).data.spoken,false);assert.equal(h.calls.at(-1).data.revision,1);
});


test('live selectors see grade-drop controls directly in locked teams while selection stays locked',async()=>{
 const h=harness('app.js');h.s.data.selector=true;h.f.locked=true;h.f.published={details:structuredClone(h.f.details),slots:structuredClone(h.f.slots)};h.c.seBoard();
 assert.equal(h.document.getElementById('seFollowup'),null);assert.equal(h.document.querySelector('.se-followup'),null);
 assert.equal(h.document.getElementById('seUnselected').textContent,'Available, not selected');
 const cell=h.document.querySelector('.se-player-cell.se-dropped'),button=cell.querySelector('[data-se-conversation]');
 assert.equal(cell.closest('details'),null,'Conversation action is immediately visible');
 assert.equal(cell.querySelector('[data-se-slot]').disabled,true);assert.equal(h.document.querySelector('[data-test-role]').disabled,true);
 assert.equal(button.matches(':disabled'),false,'Speaking to a player does not require unlocking the team');
 await button.onclick();assert.ok(h.document.querySelector('.se-player-cell.se-spoken'));assert.equal(h.calls.at(-1).action,'conversation');
});

test('live captain board keeps each bracket partner and their own grade-drop control together',()=>{
 const h=harness('app.js');h.f.details.days.push({date:'2099-10-24'});h.f.slots=[{d1:'p',d2:'partner'}];h.s.data.roster.push({id:'partner',name:'Day two player'});
 h.s.data.conversations.push({...h.move,roster_id:'partner',name:'Day two player',spoken_at:'2026-10-17T00:00:00Z',spoken_by:'Captain'});h.c.seBoard();
 const cells=h.document.querySelectorAll('[data-se-team] .se-player-cell');assert.equal(cells.length,2);
 assert.match(cells[0].textContent,/Day 1/);assert.equal(cells[0].querySelector('[data-se-conversation]').dataset.seConversationPlayer,'p');assert.ok(cells[0].classList.contains('se-dropped'));
 assert.match(cells[1].textContent,/Day 2/);assert.equal(cells[1].querySelector('[data-se-conversation]').dataset.seConversationPlayer,'partner');assert.ok(cells[1].classList.contains('se-spoken'));
 assert.equal(h.document.querySelector('[data-se-slot],#seFollowup'),null,'Captain keeps read-only selection access without a separate dropdown');
});

test('live captain and selector boards label explicit unavailable days in red, separately from unanswered dates',()=>{
 const h=harness('app.js'),p=h.s.data.roster[0];p.availability={available_dates:[],unavailable_dates:['2099-10-17']};
 h.f.details.days.push({date:'2099-10-24'});h.f.slots[0].d2='p';h.s.data.conversations=[];
 h.c.seBoard();let cell=h.document.querySelector('.se-player-cell');
 assert.equal(cell.querySelector('.se-status.unavailable').textContent,'Day 1: Unavailable');
 assert.equal(cell.querySelector('.se-status.unknown').textContent,'Day 2: Availability not confirmed');
 h.s.data.selector=true;h.c.seBoard();cell=h.document.querySelector('.se-player-cell');
 assert.equal(cell.querySelector('.se-status.unavailable').textContent,'Day 1: Unavailable');
 assert.equal(cell.querySelector('.se-status.unknown').textContent,'Day 2: Availability not confirmed');
 p.availability.available_dates=['2099-10-17'];assert.equal(h.c.seDayStatus(p,h.f.details.days[0]),'unavailable','Explicit red takes precedence if stale data overlaps');
});
