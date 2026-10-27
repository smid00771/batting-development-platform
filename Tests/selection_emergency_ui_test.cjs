const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fn(source,name){const a=source.indexOf('function '+name+'(');assert.ok(a>=0);const start=source.slice(a-6,a)==='async '?a-6:a,next=/\n(?:async )?function /.exec(source.slice(a+9));return source.slice(start,next?a+9+next.index:source.length);}
for(const file of ['app.js','demo.html']){
 const source=fs.readFileSync(file,'utf8');
 test(`${file}: access errors retain the navigation retry entry without enabling selections`,()=>{
  const c=vm.createContext({session:{user:{id:'u'}},club:{id:'c'},membership:{},selectionAccess:{key:'u:c',enabled:false,error:'Request timed out'}});vm.runInContext(['selectionsScopeKey','selectionsEnabled','selectionsEntryVisible'].map(n=>fn(source,n)).join('\n'),c);
  assert.equal(c.selectionsEnabled(),false);assert.equal(c.selectionsEntryVisible(),true);
  c.selectionAccess={key:'u:c',enabled:false,error:''};assert.equal(c.selectionsEntryVisible(),false);
  c.selectionAccess={key:'other:c',enabled:true,error:'Timed out'};assert.equal(c.selectionsEntryVisible(),false);
  c.selectionAccess={key:'u:c',enabled:true,error:''};assert.equal(c.selectionsEntryVisible(),true);
 });
 test(`${file}: automatic board analysis and polling remain stopped`,()=>{
  const s={statsOpen:true};let paused=0,cleared=0;const c=vm.createContext({ensureSelections:()=>s,selectionEvidence:{pause:()=>paused++},seNotice:()=>{},selectionRefreshTimer:7,clearInterval:id=>{assert.equal(id,7);cleared++;},setInterval:()=>assert.fail('Background timer must not start')});
  vm.runInContext(['seToggleStats','seMountStats','seStartLiveRefresh'].map(n=>fn(source,n)).join('\n'),c);
  c.seToggleStats();c.seMountStats();c.seStartLiveRefresh();assert.equal(s.statsOpen,false);assert.equal(paused,0);assert.equal(cleared,1);assert.equal(c.selectionRefreshTimer,null);
  assert.match(source,/id="seSeasonStats" disabled/);assert.doesNotMatch(source,/id="seCalculateEvidence"/);assert.doesNotMatch(fn(source,'seBoard'),/seClearUnavailableDrafts\(|seMountStats\(|clubWeek\.mount\(/);
 });
 test(`${file}: reloading edited teams only requests authoritative board context`,async()=>{
  const previous={week:{plans:[]},signup_followup:{can_view:true,players:[]},socials:true,social_handover_count:2},s={key:'u:c',view:'board',data:previous,undo:[]};let contexts=0;
  const c=vm.createContext({Promise,URLSearchParams,location:{search:''},ensureSelections:()=>s,selectionState:s,selectionsScopeKey:()=>s.key,selectionAccess:{},seApplyWeekLaunch:()=>{},seRPC:async action=>{assert.equal(action,'context');contexts++;return {selector:true,admin:true,access:{mode:'standalone'},fixtures:[{id:'current'}],roster:[]};},seFetchSignupFollowup:()=>assert.fail('No signup scan while editing'),supabase:{rpc:()=>assert.fail('No unrelated RPC while editing')}});
  vm.runInContext(fn(source,'seReload'),c);assert.equal(await c.seReload(),true);assert.equal(contexts,1);assert.equal(s.data.fixtures[0].id,'current');assert.equal(s.data.socials,true);assert.equal(s.data.week,previous.week);
 });
}
for(const file of ['app.js','demo.html']){
 const source=fs.readFileSync(file,'utf8');
 test(`${file}: Add player option opens a twelfth place directly and cancellation leaves the saved XI intact`,()=>{
  const f={id:'f',can_edit:true,details:{days:[{date:'2099-10-17'}]},slots:Array.from({length:11},(_,i)=>({d1:'player-'+i,d2:null}))},s={view:'board',data:{selector:true,fixtures:[f]}};let draws=0,focus=0;
  const c=vm.createContext({ensureSelections:()=>s,currentTab:'teams',seFixtureLocked:()=>false,seBoard:()=>draws++,seFocusPicker:()=>focus++});vm.runInContext(['seDiscardPlayerOption','seAddPlayerOption'].map(n=>fn(source,n)).join('\n'),c);
  assert.equal(c.seAddPlayerOption('f'),true);assert.equal(f.slots.length,12);assert.equal(s.active.slot,11);assert.equal(draws,1);assert.equal(focus,1);assert.equal(s.both,false);
  c.seDiscardPlayerOption();assert.equal(f.slots.length,11);assert.equal(f.slots[10].d1,'player-10');
  f.slots[3]={d1:null,d2:null};c.seAddPlayerOption('f');assert.equal(s.active.slot,3);assert.equal(f.slots.length,11);
  s.pending={};assert.equal(c.seAddPlayerOption('f'),false);s.pending=null;f.can_edit=false;assert.equal(c.seAddPlayerOption('f'),false);
 });
}
