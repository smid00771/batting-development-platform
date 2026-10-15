const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {JSDOM}=require('jsdom'),source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function fn(name,text=source){const m=new RegExp('(?:async )?function '+name+'\\(').exec(text);assert.ok(m,name);const rest=text.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return end<0?rest.split('\n')[0]:rest.slice(0,end+1);}
function harness(){
 const dom=new JSDOM('<main id="page"><div id="seContent"></div></main>',{url:'https://example.test'}),entries=[],s={view:'socials',date:'2026-10-17',data:{fixtures:[]}},social={scope:'u:c',view:'results',date:'2026-10-17',awards:{end:'2026-10-18',focus:'player-a',context:{}},teamWorkflow:{step:'photos',fixture:'second',day:1}},session={user:{id:'u'}};let index=-1,allowed=true;
 const history={state:null,pushState(state){entries.splice(++index);entries.push(structuredClone(state));this.state=state;},replaceState(state){if(index<0)index=0;entries[index]=structuredClone(state);this.state=state;},async back(){if(index>0){index--;this.state=entries[index];await c.handleAppNavigationHistory({state:this.state});}},go(delta){index+=delta;this.state=entries[index];}};
 const weekly={state:s=>s.week||(s.week={context:{}})},playerWeekly={state:s=>s.playerWeek||(s.playerWeek={context:{}})};
 const c=vm.createContext({console,queueMicrotask,document:dom.window.document,window:{scrollX:0,scrollY:0,scrollTo:p=>{c.window.scrollY=p.top;}},history,session,club:{id:'c'},currentTab:'teams',socialState:social,appNavigationCurrent:null,appNavigationRestoring:false,appNavigationRequest:0,appNavigationBounce:null,localStorage:dom.window.localStorage,crypto:webcrypto,FORMATS:[],publishedHowWeBatFormat:'',howWeBatBuilderFormat:'',previewFormat:'',playerPlanStructureSection:'',guideSelectedCapabilityKey:'',workshopPreview:null,
  ensureSelections:()=>s,socialEnsure:()=>social,socialGuideState:s=>s.guide,socialTeamWorkflow:{state:s=>s.teamWorkflow||(s.teamWorkflow={step:'artwork',fixture:'',day:0})},socialAwards:{state:s=>s.awards||(s.awards={context:{}})},socialWeek:weekly,socialPlayerWeek:playerWeekly,
  saveClubEditsBeforeNavigation:async()=>allowed,canOpenClubTab:()=>true,renderTab:async()=>{c.recordAppNavigation(c.clubNavigationRoute());},alert:x=>{throw Error(x);},socialGuideSwitch:(g,step,person)=>Object.assign(g,{step,person}),seDelegationEditor:x=>x});
 const names=['clubNavigationRoute','selectionNavigationRoute','socialNavigationRoute','restoreSocialNavigation','recordSelectionNavigation','recordSelectionDrawer','restoreSelectionDrawer','appNavigationBack','canUseAppNavigationBack','bindAppBackButtons','bindSelectionBackButtons','platformNavigationRoute','appNavigationKey','validAppNavigationMarker','replaceRestoredNavigation','recordAppNavigation','restoreClubNavigationState','handleAppNavigationHistory'];
 vm.runInContext(names.map(name=>fn(name)).join('\n'),c);return{c,s,social,entries,history,allowed:x=>allowed=x,index:()=>index,visit:()=>c.recordSelectionNavigation()};
}
test('Back and Forward restore the Results week and selected award after image preparation',async()=>{
 const h=harness();h.visit();h.c.window.scrollY=425;const apply=()=>{};
 h.social.view='guide';h.social.guide={step:1,person:'',file:{name:'example.png'},brief:'Move Results lower',awardReturn:{view:'results',apply}};h.visit();
 assert.equal(h.entries.length,2);await h.history.back();assert.equal(h.social.view,'results');assert.equal(h.social.awards.end,'2026-10-18');assert.equal(h.social.awards.focus,'player-a');assert.equal(h.c.window.scrollY,425);
 const forward=h.entries[1];await h.c.handleAppNavigationHistory({state:forward});assert.equal(h.social.view,'guide');assert.equal(h.social.guide.file.name,'example.png');assert.equal(h.social.guide.awardReturn.apply,apply);
 assert.equal(JSON.stringify(h.entries).includes('example.png'),false,'Image contents and callbacks stay out of browser history');
});
test('grade, playing day, step and fixture date are distinct navigation stops',async()=>{
 const h=harness();h.social.view='graphics';h.visit();h.social.teamWorkflow.fixture='third';h.social.teamWorkflow.day=0;h.visit();h.social.teamWorkflow.step='review';h.visit();h.social.date='2026-10-24';h.visit();
 assert.equal(h.entries.length,4);await h.history.back();assert.equal(h.social.date,'2026-10-17');assert.equal(h.social.teamWorkflow.step,'review');await h.history.back();assert.equal(h.social.teamWorkflow.fixture,'third');assert.equal(h.social.teamWorkflow.step,'photos');await h.history.back();assert.equal(h.social.teamWorkflow.fixture,'second');assert.equal(h.social.teamWorkflow.day,1);
});
test('refreshes and processing updates do not add Back steps; unsaved-work guard can block navigation',async()=>{
 const h=harness();h.visit();h.visit();h.visit();assert.equal(h.entries.length,1);h.social.view='graphics';h.visit();h.allowed(false);await h.history.back();assert.equal(h.index(),1);assert.equal(h.social.view,'graphics');assert.equal(h.entries.length,2);
});
test('selection drawers retain their origin and cannot restore another club account',async()=>{
 const h=harness();h.s.view='board';h.visit();h.c.recordSelectionDrawer('delegation',{emergency:true});assert.equal(h.entries.length,2);await h.history.back();assert.equal(h.s.view,'board');assert.equal(h.s.date,'2026-10-17');assert.equal(h.s.navigationDrawer,null);
 assert.equal(h.c.validAppNavigationMarker({...h.entries[0].clubBattingNavigation,userId:'other'}),false);
});
test('the in-app Back uses the same history and falls back safely on an initial screen',async()=>{
 const h=harness();let fallback=0;h.visit();h.c.appNavigationBack(()=>fallback++);assert.equal(fallback,1);h.social.view='accounts';h.visit();h.c.appNavigationBack(()=>fallback++);await new Promise(r=>setImmediate(r));assert.equal(fallback,1);assert.equal(h.social.view,'results');
});

test('main app Back controls follow the recorded view rather than a hard-coded destination',async()=>{
 const h=harness();h.visit();h.social.view='accounts';h.visit();const b=h.c.document.createElement('button');b.id='clubBrandingBack';b.textContent='Back';h.c.document.body.append(b);let fallback=0;b.onclick=()=>fallback++;h.c.bindAppBackButtons();b.click();await new Promise(r=>setImmediate(r));assert.equal(h.social.view,'results');assert.equal(fallback,0);
});

test('selection Back binds when earlier optional buttons are absent or already bound',async()=>{
 const h=harness();h.visit();h.social.view='accounts';h.visit();const button=h.c.document.createElement('button');button.id='seImportCancel';h.c.document.body.append(button);let fallback=0;button.onclick=()=>fallback++;
 h.c.bindSelectionBackButtons();assert.equal(button.dataset.navigationBack,'1','Absent delegation controls do not stop later bindings');button.click();await new Promise(r=>setImmediate(r));assert.equal(h.social.view,'results');assert.equal(fallback,0);
 const handler=button.onclick,second=h.c.document.createElement('button');second.id='sePlayerCancel';second.onclick=()=>fallback++;h.c.document.body.append(second);h.c.bindSelectionBackButtons();assert.equal(button.onclick,handler,'Existing bindings remain unchanged');assert.equal(second.dataset.navigationBack,'1','An existing binding does not stop a later button');second.click();assert.equal(fallback,1,'First-screen fallback remains available');
});

test('saved match reviews Back uses the actual button and returns to the previous view',async()=>{
 const h=harness();h.visit();h.social.view='accounts';h.visit();const button=h.c.document.createElement('button');button.id='backTeamReview';button.textContent='Back to entry';h.c.document.body.append(button);let fallback=0;button.onclick=()=>fallback++;
 h.c.bindAppBackButtons();assert.equal(button.getAttribute('aria-label'),'Back to previous view');button.click();await new Promise(r=>setImmediate(r));assert.equal(h.social.view,'results');assert.equal(fallback,0);
});

for(const file of ['app.js','demo.html'])test(file+': directly rendered saved reviews Back retains history and a safe initial fallback',async()=>{
 const text=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
 const screen=withHistory=>{const h=harness();if(withHistory)h.visit();let locked=false,fallback=0;const state={view:'history',historyFilters:{group_id:'',match_date:'',format_key:'',player_query:''},groups:[],history:[],message:'',deletePreview:null};
  Object.assign(h.c,{currentTab:'team_review',ensureTeamReviewState:()=>state,serializeTeamReviewState:()=>({view:state.view}),teamReviewControlsLocked:()=>locked,teamReviewStyles:()=>'',esc:String,loadTeamReviewHistory:()=>{},clearTeamReviewEntry:()=>{},loadSavedTeamReview:()=>{},previewTeamReviewDelete:()=>{},deleteSavedTeamReview:()=>{},bindMatchReviewHistory:()=>{},renderTeamReviewContent:()=>fallback++});
  vm.runInContext(fn('renderTeamReviewHistoryContent',text),h.c);h.c.recordAppNavigation(h.c.clubNavigationRoute());h.c.renderTeamReviewHistoryContent();return{h,state,locked:value=>locked=value,fallback:()=>fallback};};
 const active=screen(true);assert.equal(active.h.c.document.getElementById('backTeamReview').dataset.appBackBound,undefined,'No renderTab binding pass ran');active.locked(true);active.h.c.document.getElementById('backTeamReview').click();assert.equal(active.h.index(),1,'A pending operation blocks navigation');active.locked(false);active.h.c.renderTeamReviewHistoryContent();active.h.c.document.getElementById('backTeamReview').click();await new Promise(r=>setImmediate(r));assert.equal(active.h.c.currentTab,'teams');assert.equal(active.h.social.view,'results');assert.equal(active.fallback(),0);
 const initial=screen(false);initial.h.c.document.getElementById('backTeamReview').click();assert.equal(initial.state.view,'entry');assert.equal(initial.fallback(),1,'Opening history directly still offers Back to entry');
});
