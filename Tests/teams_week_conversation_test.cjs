const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
function fn(source,name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(m,name);const rest=source.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
const names=['sePublishedDates','sePublishedWeekStart','seClubDate','sePublishedWeeks','sePublishedWeekLabel','seMatchConversationClosed','seUpdateConversationState','seDate','sePublished','seChat','seChangeView'];
function fixture(id,days){return {id,can_chat:true,publication:1,published:{details:{grade:id,competition:'Test',opposition:'Opponents',format:'limited_overs',days:days.map(date=>({date,start:'12:00'})),ground:'Ground'},slots:[],players:[]}};}
function setup(file,fixtures=[]){
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8'),dom=new JSDOM('<main id="seContent"></main>'),s={view:'published',data:{fixtures,roster:[],access:{timezone:'Australia/Sydney'}}};
 let clock='2026-10-16T01:00:00Z',navigation=0,posts=0;class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return +new Date(clock);}}
 const c=vm.createContext({document:dom.window.document,Date:Clock,Intl,console,FormData:dom.window.FormData,selectionState:s,session:{user:{id:'user'}},club:{name:'Test club'},currentTab:'teams',ensureSelections:()=>s,
  seIsCaptain:()=>false,seCanSetup:()=>false,seEsc:x=>String(x??''),seFormatLabel:()=> 'Limited overs',sePublicationStamp:()=> 'Published',seSnapshotName:()=>'',seSnapshotSplit:()=>false,
  confirmLeaveSelections:()=>true,socialLanding(){},drawSelections(){s.navigationDrawer=null;c.sePublished();},recordSelectionNavigation(){navigation++;},recordSelectionDrawer(kind,values){s.navigationDrawer={kind,...values};},
  appNavigationBack:f=>f(),seNotice(){},seRPC:async()=>[{author_name:'Player',body:'Saved message',created_at:'2026-10-10T01:00Z'}],seMutate:async()=>{posts++;return false;}});
 vm.runInContext(names.map(name=>fn(source,name)).join('\n'),c);
 return {c,s,document:dom.window.document,window:dom.window,setClock:value=>clock=value,navigation:()=>navigation,posts:()=>posts};
}
for(const file of ['app.js','demo.html']){
 test(file+': mixed grades keep two-day selections and conversations across both weeks while one-day fixtures change',async()=>{
  const first=fixture('1st Grade',['2026-10-10','2026-10-17']),second=fixture('2nd Grade',['2026-10-10','2026-10-17']);
  const h=setup(file,[first,second,fixture('3rd Grade week 1',['2026-10-10']),fixture('3rd Grade week 2',['2026-10-17'])]);
  h.setClock('2026-10-10T13:00:00Z');h.c.sePublished();
  assert.deepEqual([...h.document.querySelectorAll('[data-se-chat]')].map(x=>[x.dataset.seChat,x.textContent]),[['1st Grade','Match conversation'],['2nd Grade','Match conversation'],['3rd Grade week 1','View conversation']]);
  await h.c.seChat(first.id);assert.equal(h.document.getElementById('sePostForm').dataset.fixtureId,first.id);assert.match(h.document.body.textContent,/Opponents/);assert.match(h.document.getElementById('seMatchConversationStatus').textContent,/17 Oct/);
  h.document.getElementById('seChatBack').click();h.setClock('2026-10-11T13:00:00Z');h.c.seUpdateConversationState();
  assert.deepEqual([...h.document.querySelectorAll('[data-se-chat]')].map(x=>x.dataset.seChat),['1st Grade','2nd Grade','3rd Grade week 2']);
  await h.c.seChat(first.id);assert.equal(h.document.getElementById('sePostForm').dataset.fixtureId,first.id);
  h.setClock('2026-10-17T13:00:00Z');h.c.seUpdateConversationState();assert.equal(h.document.querySelector('#sePostForm button').disabled,true);
  assert.equal(h.s.data.fixtures[0],first,'Both weeks use the same published selection');
 });
 test(file+': current week is default; earlier weeks and both weeks of a two-day fixture remain available',()=>{
  const h=setup(file,[fixture('Past',['2026-10-10']),fixture('Current',['2026-10-17']),fixture('Two day',['2026-10-10','2026-10-17']),fixture('Future',['2026-10-24'])]);h.c.sePublished();
  const week=h.document.getElementById('sePublishedWeek');assert.equal(week.value,'2026-10-12');assert.match(week.selectedOptions[0].textContent,/This week/);
  assert.deepEqual([...h.document.querySelectorAll('h2')].map(x=>x.textContent),['Two day','Current']);
  week.value='2026-10-05';week.dispatchEvent(new h.window.Event('change'));assert.equal(h.s.publishedWeek,'2026-10-05');assert.equal(h.navigation(),1);
  assert.deepEqual([...h.document.querySelectorAll('h2')].map(x=>x.textContent),['Past','Two day']);
  assert.equal(h.document.querySelector('[data-se-chat="Past"]').textContent,'View conversation');assert.equal(h.document.querySelector('[data-se-chat="Two day"]').textContent,'Match conversation');
 });
 test(file+': a week without teams stays current and does not silently show old teams',()=>{
  const h=setup(file,[fixture('Past',['2026-10-10'])]);h.c.sePublished();assert.equal(h.document.querySelectorAll('h2').length,0);assert.match(h.document.body.textContent,/No teams published for this week/);assert.equal(h.document.getElementById('sePublishedWeek').options.length,2);
 });
 test(file+': closure uses the final published day and club midnight, including DST',()=>{
  const h=setup(file),f=fixture('Two days',['2026-10-17','2026-10-10']);f.details={days:[{date:'2027-01-01'}]};
  assert.equal(h.c.seMatchConversationClosed(f,h.s.data,new Date('2026-10-17T12:59:59Z')),false);
  assert.equal(h.c.seMatchConversationClosed(f,h.s.data,new Date('2026-10-17T13:00:00Z')),true);
  h.s.data.access.timezone='America/New_York';const us=fixture('DST',['2026-11-01']);
  assert.equal(h.c.seMatchConversationClosed(us,h.s.data,new Date('2026-11-02T04:59:59Z')),false);
  assert.equal(h.c.seMatchConversationClosed(us,h.s.data,new Date('2026-11-02T05:00:00Z')),true);
 });
 test(file+': old messages remain readable and closed conversations have no send form',async()=>{
  const h=setup(file,[fixture('Past',['2026-10-10'])]);await h.c.seChat('Past');assert.match(h.document.body.textContent,/Saved message/);assert.match(h.document.getElementById('seMatchConversationStatus').textContent,/closed/);assert.equal(h.document.getElementById('sePostForm'),null);
 });
 test(file+': an open tab becomes read-only at midnight and cannot submit its draft',async()=>{
  const f=fixture('Today',['2026-10-16']),h=setup(file,[f]);await h.c.seChat(f.id);const form=h.document.getElementById('sePostForm');form.elements.body.value='Unsent draft';
  h.setClock('2026-10-16T13:00:00Z');h.c.seUpdateConversationState();assert.equal(form.elements.body.readOnly,true);assert.equal(form.elements.body.value,'Unsent draft');assert.equal(form.querySelector('button').disabled,true);
  await form.onsubmit({preventDefault(){}});assert.equal(h.posts(),0);
 });
 test(file+': conversation Back retains the selected week; Teams tab returns to the current week',async()=>{
  const h=setup(file,[fixture('Past',['2026-10-10'])]);h.s.publishedWeek='2026-10-05';h.c.sePublished();await h.c.seChat('Past');h.document.getElementById('seChatBack').click();assert.equal(h.document.getElementById('sePublishedWeek').value,'2026-10-05');
  h.c.seChangeView('published');assert.equal(h.document.getElementById('sePublishedWeek').value,'2026-10-12');
 });
 test(file+': current week rolls over in club time while an explicit historical choice stays selected',()=>{
  const h=setup(file,[fixture('Past',['2026-10-10']),fixture('Next',['2026-10-24'])]);h.c.sePublished();h.setClock('2026-10-18T13:00:00Z');h.c.seUpdateConversationState();assert.equal(h.document.getElementById('sePublishedWeek').value,'2026-10-19');
  h.s.publishedWeek='2026-10-05';h.c.sePublished();h.setClock('2026-10-25T13:00:00Z');h.c.seUpdateConversationState();assert.equal(h.document.getElementById('sePublishedWeek').value,'2026-10-05');
 });
}
test('week grouping crosses a year boundary correctly',()=>{const h=setup('app.js');assert.equal(h.c.sePublishedWeekStart('2027-01-01'),'2026-12-28');});
