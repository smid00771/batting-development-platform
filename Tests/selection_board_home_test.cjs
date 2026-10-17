const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const extract=(source,name)=>{const a=source.search(new RegExp('(?:async )?function '+name+'\\('));assert.ok(a>=0,name);const rest=source.slice(a),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);};
function setup(file,role='captain'){
 const dom=new JSDOM('<main id="page"></main>'),document=dom.window.document,calls=[];
 const f={id:'match',can_chat:true,can_comment:true,details:{grade:'First XI',opposition:'Visitors',days:[{date:'2099-10-17'}]},slots:[]};f.published={details:structuredClone(f.details),slots:[],players:[]};
 const s={key:'user:club',view:'published',publishedWeek:'',restoreDrawer:null,data:{captain:role==='captain',selector:role==='selector',can_view_board:role!=='player',roster:[],fixtures:[f],access:{timezone:'UTC'}}};let c;
 c=vm.createContext({document,Date,Intl,selectionState:s,session:{user:{id:'user'}},membership:{permission_role:role},club:{id:'club'},currentTab:'teams',ensureSelections:()=>s,selectionsScopeKey:()=>s.key,hasMatchCaptainAccess:()=>false,seCanSetup:d=>d.admin||d.selector,seEsc:String,seDate:String,
  loadSelectionsAccess:async()=>{},selectionsEnabled:()=>true,seReload:async()=>true,seStartLiveRefresh(){},seStyles:()=>'',clubBrandingSetupPrompt:()=>'',sePublicationWorkflow:()=>'',seTrackActionButtons(){},selectionRoomController:null,bindClubBrandingLinks(){},seBindPublicationWorkflow(){},bindSelectionBackButtons(){},recordSelectionNavigation:()=>calls.push({view:s.view}),confirmLeaveSelections:()=>true,
  socialOpen(){},seReviews(){},seConversations(){},seFixtures(){},seRoster(){},seSettings(){},seAvailability(){document.getElementById('seContent').textContent='Availability';},sePublished(){document.getElementById('seContent').textContent='Published player teams';},
  seBoard(){document.getElementById('seContent').innerHTML='<section data-se-team="match">Team'+c.seBoardMatchConversation(f)+'</section>';c.seBindBoardChats();},
  seRPC:async(action,data)=>{calls.push({action,data});return [];},seReadButton:async(b,l,run)=>run()
 });
 const names=['seBoardAccess','seHasAvailability','seIsCaptain','seSelectionTabs','drawSelections','renderSelections','seChangeView','seBoardMatchConversation','seBindBoardChats','seLoadBoardChat','sePublishedDates','sePublishedWeekStart','seClubDate','seMatchConversationClosed','seChat','seOpenBoardChat'];
 vm.runInContext(names.map(n=>extract(fs.readFileSync(file,'utf8'),n)).join('\n'),c);return {c,s,f,calls,document,dom};
}
for(const file of ['app.js','demo.html']){
 for(const role of ['captain','selector'])test(file+': '+role+' lands on one board and stays there after refresh or an old Teams route',async()=>{
  const h=setup(file,role);await h.c.renderSelections();assert.equal(h.s.view,'board');assert.equal(h.document.querySelector('[data-se-view="published"]'),null);assert.ok(h.document.querySelector('[data-se-view="board"][aria-pressed="true"]'));assert.ok(h.document.querySelector('[data-se-board-chat]'));
  await h.document.getElementById('seRefresh').onclick();assert.equal(h.s.view,'board');h.c.seChangeView('published');assert.equal(h.s.view,'board');assert.equal(h.document.querySelector('[data-se-view="published"]'),null);
 });
 test(file+': an ordinary player still sees published teams without draft board access',async()=>{
  const h=setup(file,'player');await h.c.renderSelections();assert.equal(h.s.view,'published');assert.equal(h.document.querySelector('[data-se-view="board"]'),null);assert.ok(h.document.querySelector('[data-se-view="published"]'));assert.match(h.document.body.textContent,/Published player teams/);
 });
 test(file+': an old captain conversation link opens the exact thread under its team',async()=>{
  const h=setup(file);await h.c.renderSelections();await h.c.seChat('match');await new Promise(r=>setImmediate(r));assert.equal(h.s.view,'board');assert.equal(h.s.date,'2099-10-17');assert.equal(h.s.boardDateChosen,true);assert.equal(h.s.navigationDrawer,null);assert.equal(h.document.querySelector('#seChatBack'),null);assert.ok(h.document.querySelector('[data-se-team]'));assert.equal(h.document.querySelector('[data-se-board-chat]').open,true);assert.ok(h.document.querySelector('[data-se-board-chat-form]'));assert.ok(h.calls.some(x=>x.action==='posts'&&x.data.id==='match'));
 });
}
