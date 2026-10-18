const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const extract=(source,name)=>{const a=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(a>=0,name);const rest=source.slice(a),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);};
function setup(file,role='captain'){
 const dom=new JSDOM('<main id="page"></main>'),document=dom.window.document,calls=[];dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const f={id:'match',can_chat:true,can_comment:true,details:{grade:'First XI',opposition:'Visitors',days:[{date:'2099-10-17'}]},slots:[]};f.published={details:structuredClone(f.details),slots:[],players:[]};
 const s={key:'user:club',view:'published',publishedWeek:'',restoreDrawer:null,data:{captain:role==='captain',selector:role==='selector',can_view_board:role!=='player',roster:[],conversations:role==='player'?[]:[{date:'2099-10-17',name:'Test player',previous_grade:'Second XI',kind:'left_out',availability:'unavailable'}],fixtures:[f],access:{timezone:'UTC'}}};let c;
 c=vm.createContext({document,Date,Intl,selectionState:s,session:{user:{id:'user'}},membership:{permission_role:role},club:{id:'club'},currentTab:'teams',ensureSelections:()=>s,selectionsScopeKey:()=>s.key,hasMatchCaptainAccess:()=>false,seCanSetup:d=>d.admin||d.selector,seEsc:String,seDate:String,
  loadSelectionsAccess:async()=>{},selectionsEnabled:()=>true,seReload:async()=>true,seStartLiveRefresh(){},seStyles:()=>'',clubBrandingSetupPrompt:()=>'',sePublicationWorkflow:()=>'',seTrackActionButtons(){},selectionRoomController:null,bindClubBrandingLinks(){},seBindPublicationWorkflow(){},bindSelectionBackButtons(){},recordSelectionNavigation:()=>calls.push({view:s.view}),confirmLeaveSelections:()=>true,
  socialOpen(){},seReviews(){},seConversations(){},seFixtures(){},seRoster(){},seSettings(){},seAvailability(){document.getElementById('seContent').textContent='Availability';},sePublished(){document.getElementById('seContent').textContent='Published player teams';},
  seBoard(){document.getElementById('seContent').innerHTML=c.seFollowupPanel()+'<section data-se-team="match">Team'+c.seBoardMatchConversation(f)+'</section>';c.seBindBoardChats();c.seBindBoardComments();},
  seasonStatsPanel:{mount:(host,options)=>{calls.push({stats:options});host.textContent='Season stats opened';}},seGradeLevel:()=>1,
  seRPC:async(action,data)=>{calls.push({action,data});return [];},seReadButton:async(b,l,run)=>run()
 });
 const names=['seFollowupPanel','seFollowupRows','seBindBoardComments','seStatsAllowed','seToggleStats','seMountStats','seBoardAccess','seHasAvailability','seIsCaptain','seSelectionTabs','drawSelections','renderSelections','seChangeView','seBoardMatchConversation','seBindBoardChats','seLoadBoardChat','sePublishedDates','sePublishedWeekStart','seClubDate','seMatchConversationClosed','seChat','seOpenBoardChat'];
 vm.runInContext(names.map(n=>extract(fs.readFileSync(file,'utf8'),n)).join('\n'),c);return {c,s,f,calls,document,dom};
}
for(const file of ['app.js','demo.html']){
 for(const role of ['captain','selector'])test(file+': '+role+' lands on one board and stays there after refresh or an old Teams route',async()=>{
  const h=setup(file,role);await h.c.renderSelections();assert.equal(h.s.view,'board');assert.equal(h.document.querySelector('[data-se-view="published"]'),null);assert.ok(h.document.querySelector('[data-se-view="board"][aria-pressed="true"]'));assert.ok(h.document.querySelector('[data-se-board-chat]'));
  await h.document.getElementById('seRefresh').onclick();assert.equal(h.s.view,'board');h.c.seChangeView('published');assert.equal(h.s.view,'board');assert.equal(h.document.querySelector('[data-se-view="published"]'),null);
 });
 test(file+': an ordinary player still sees published teams without draft board access',async()=>{
  const h=setup(file,'player');await h.c.renderSelections();assert.equal(h.s.view,'published');assert.equal(h.document.querySelector('[data-se-view="board"]'),null);assert.ok(h.document.querySelector('[data-se-view="published"]'));assert.match(h.document.body.textContent,/Published player teams/);assert.equal(h.document.getElementById('seSeasonStats'),null);
 });
 test(file+': Selection Room is available only on the selector board',()=>{
  const h=setup(file,'selector');
  h.s.data.admin=true;h.s.data.socials=true;
  for(const view of ['board','settings','roster','availability','socials']){
   h.s.view=view;h.c.drawSelections();
   assert.equal(!!h.document.getElementById('seOpenRoom'),view==='board',view);
  }
  h.s.view='board';h.s.data.selector=false;h.s.data.captain=true;h.c.drawSelections();
  assert.equal(h.document.getElementById('seOpenRoom'),null,'Captain access alone does not grant a selector room');
 });
 test(file+': declining to leave an active room keeps the Selection Board',()=>{
  const h=setup(file,'selector');h.s.view='board';h.s.data.admin=true;
  let closes=0;h.c.selectionRoomController={close:()=>{closes++;return false;},sync(){}};
  h.c.seChangeView('settings');assert.equal(h.s.view,'board');assert.equal(closes,1);
  h.c.selectionRoomController.close=()=>{closes++;return true;};
  h.c.seChangeView('settings');assert.equal(h.s.view,'settings');assert.equal(closes,2);
 });
 test(file+': an old captain conversation link opens the exact thread under its team',async()=>{
  const h=setup(file);await h.c.renderSelections();await h.c.seChat('match');await new Promise(r=>setImmediate(r));assert.equal(h.s.view,'board');assert.equal(h.s.date,'2099-10-17');assert.equal(h.s.boardDateChosen,true);assert.equal(h.s.navigationDrawer,null);assert.equal(h.document.querySelector('#seChatBack'),null);assert.ok(h.document.querySelector('[data-se-team]'));assert.equal(h.document.querySelector('[data-se-board-chat]').open,true);assert.ok(h.document.querySelector('[data-se-board-chat-form]'));assert.ok(h.calls.some(x=>x.action==='posts'&&x.data.id==='match'));
 });
}

for(const file of ['app.js','demo.html'])test(file+': stats opens inline, closes and clears when changing section',async()=>{
 const h=setup(file);await h.c.renderSelections();h.s.date='2099-10-17';const button=h.document.getElementById('seSeasonStats');assert.ok(button);assert.equal(button.getAttribute('aria-expanded'),'false');button.click();assert.equal(h.s.statsOpen,true);assert.equal(h.document.getElementById('seSeasonStats').getAttribute('aria-expanded'),'true');assert.match(h.document.getElementById('seStatsHost').textContent,/Season stats opened/);assert.equal(h.calls.find(c=>c.stats).stats.scope,'user:club');
 h.document.getElementById('seSeasonStats').click();assert.equal(h.s.statsOpen,false);assert.equal(h.document.getElementById('seStatsHost').textContent,'');h.document.getElementById('seSeasonStats').click();h.c.seChangeView('availability');assert.equal(h.s.statsOpen,false);
});

test('live comparison receives previous selected teams as well as the upcoming board date',async()=>{
 const h=setup('app.js');await h.c.renderSelections();h.s.date='2099-10-24';h.s.statsOpen=true;
 h.f.details.days=[{date:'2099-10-17'}];h.f.slots=[{d1:'selected-player'}];
 h.s.data.fixtures.push({...h.f,id:'upcoming',details:{...h.f.details,days:[{date:'2099-10-24'}]},slots:[{d1:null,d2:null}]});
 h.c.seMountStats();const options=h.calls.find(call=>call.stats).stats;
 assert.equal(options.boardDate,'2099-10-24');assert.deepEqual(Array.from(options.teams,t=>t.id),['match','upcoming']);
 assert.equal(options.teams[0].slots[0].d1,'selected-player');
 assert.deepEqual(JSON.parse(JSON.stringify(options.teams[0].published.slots)),h.f.published.slots);
});

for(const role of ['selector','captain'])test('live Season stats is visible to '+role+' without Club Admin access',async()=>{
 const h=setup('app.js',role);h.s.data.admin=false;await h.c.renderSelections();
 const button=h.document.getElementById('seSeasonStats');assert.ok(button);button.click();
 assert.equal(h.s.statsOpen,true);assert.ok(h.calls.some(call=>call.stats));assert.equal(h.s.data.admin,false);
});

for(const file of ['app.js','demo.html'])test(file+': returning to Selection Board closes follow-up, comments and chat without changing saved work',async()=>{
 const h=setup(file);h.s.date='2099-10-17';await h.c.renderSelections();
 h.document.querySelector('#seFollowup summary').click();await new Promise(r=>setTimeout(r,10));
 assert.equal(h.s.followupOpen,true);h.s.boardCommentOpen='match';h.s.boardChatOpen='match';
 const saved=JSON.stringify(h.s.data),draft={match:'Unsent message'};h.s.boardChatDrafts=draft;
 h.c.seChangeView('availability');h.document.querySelector('[data-se-view="board"]').click();
 assert.equal(h.s.followupOpen,false);assert.equal(h.document.getElementById('seFollowup').open,false);assert.equal(h.s.boardChatOpen,null);assert.equal(h.s.boardCommentOpen,null);
 assert.equal(JSON.stringify(h.s.data),saved);assert.equal(h.s.boardChatDrafts,draft);
 h.document.querySelector('#seFollowup summary').click();await new Promise(r=>setTimeout(r,10));assert.equal(h.s.followupOpen,true);
 h.document.querySelector('[data-se-view="board"]').click();assert.equal(h.document.getElementById('seFollowup').open,false,'Repeated section click is also Home');
 h.s.followupOpen=true;h.c.confirmLeaveSelections=()=>false;h.document.querySelector('[data-se-view="board"]').click();assert.equal(h.s.followupOpen,true,'Unconfirmed edits can still block leaving');
});
