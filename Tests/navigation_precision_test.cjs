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
 const names=['clubNavigationRoute','selectionNavigationRoute','socialNavigationRoute','restoreSocialNavigation','recordSelectionNavigation','recordSelectionDrawer','restoreSelectionDrawer','appNavigationBack','canUseAppNavigationBack','bindAppBackButtons','bindSelectionBackButtons','platformNavigationRoute','teamReviewNavigationIdentity','appNavigationKey','validAppNavigationMarker','replaceRestoredNavigation','recordAppNavigation','restoreClubNavigationState','handleAppNavigationHistory'];
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


test('browser Back restores the selected Teams week',async()=>{
 const h=harness();h.s.view='published';h.s.publishedWeek='2026-10-05';h.visit();h.s.publishedWeek='';h.visit();await h.history.back();assert.equal(h.s.publishedWeek,'2026-10-05');
});

function reviewHarness(){
 const h=harness(),c=h.c,requests=[];let permitted=true,serverRevision=4,saveError=null;
 Object.assign(c,{teamReviewState:null,teamReviewCache:null,teamReviewSequence:0,FORMATS:[['limited_overs','Limited overs']],
  canUseTeamReview:()=>true,esc:v=>String(v??''),formatDateShort:String,formatLabel:String,
  TEAM_REVIEW_CHOICES:[['yes','Yes'],['mostly','Mostly'],['no','Not really'],['no_plan','Has no plan'],['did_not_bat','DNB']],
  TEAM_REVIEW_DISMISSALS:[['plan_execution','Within plan'],['outside_plan','Outside plan']],
  teamReviewStyles:()=>'',teamReviewRosterHelp:()=>'',teamReviewHistoryNotice:()=>'',teamReviewRosterEditor:()=>'',
  teamReviewSignupIcon:()=>'',teamReviewPlayerMeta:()=>'',matchReviewOtherObservations:()=>'',matchReviewScoreCell:()=>'<td>34</td>',
  teamReviewFixturePicker:()=>'',fixtureCorrectionAction:()=>'',renderMatchReviewImporter:()=>'',
  bindTeamReviewRosterEditor:()=>{},wireFixtureCorrectionActions:()=>{},bindMatchReviewImporter:()=>{},matchDraftAttachTeam:()=>{},
  matchReviewImportCount:()=>c.ensureTeamReviewState().importer?.dirty?1:0,
  matchReviewImportState:()=>c.ensureTeamReviewState().importer||(c.ensureTeamReviewState().importer={dirty:false}),
  matchReviewImportCommand:()=>c.ensureTeamReviewState().importer?.dirty?{rows:[{player_id:'p1'}]}:null,
  matchReviewRestoreScorecard:()=>{},teamReviewSelection:()=>null,teamReviewCanChoosePlayers:()=>true,
  teamReviewMatchChanged:()=>{},teamReviewChooseFixture:()=>{},switchMatchReviewInnings:()=>{},teamReviewAdoptRevision:()=>{},clearTeamReviewEntry:()=>{},
  openClubBattingGuideTopic:()=>{},matchReviewTableRows:()=>'',teamReviewTableRows:rows=>rows.map(p=>c.teamReviewRowHtml(p)).join(''),
  teamReviewRequestId:()=>webcrypto.randomUUID(),matchDraftConfirmed:()=>{},wireQuickChoices:()=>{},wireObservationSave:()=>{},
  coachingActionSavePending:false,feedbackEntryBaselines:new WeakMap(),fixtureCorrectionState:null,
  confirmLeaveEngagement:()=>true,confirmLeaveWeeklyLoop:()=>true,confirm:()=>permitted,alert:()=>{},matchDraftDiscardForm:()=>{},
  renderStaffMatchFeedbackForm:()=>'<form id="staffDevelopmentForm"><input id="staffMatchDate"><select id="staffMatchFormat"><option value="limited_overs">Limited overs</option></select><input id="staffMatchOpposition"><input id="staffMatchInningsNumber"><textarea id="staffMatchNote"></textarea><button type="button" id="cancelStaffDevelopment">Cancel</button></form>'});
 const names=['ensureTeamReviewState','serializeTeamReviewState','restoreTeamReviewState','teamReviewIdentity',
  'teamReviewHasUnsavedChanges','teamReviewSavePending','teamReviewControlsLocked','confirmLeaveTeamReview',
  'feedbackEntryValues','captureFeedbackEntryBaseline','confirmLeaveFeedbackEntry',
  'teamReviewBase','teamReviewComparable','teamReviewRevision','teamReviewPlayer','teamReviewUpdate','teamReviewReconcile',
  'teamReviewSelectCandidate','teamReviewRowHtml','teamReviewSavedGroupName','teamReviewGradeOptions',
  'renderTeamReviewContent','renderTeamReview','renderTeamReviewEntry','saveTeamReview','loadSavedTeamReview',
  'openTeamReviewPlayer','closeTeamReviewObservation','renderTeamReviewObservation','openClubSectionHome'];
 vm.runInContext(names.map(n=>fn(n)).join('\n'),c);
 const s=c.ensureTeamReviewState(),player={player_id:'p1',display_name:'Player One',can_edit:true,included_in_review:true,
  match_id:'innings-1',match_updated_at:'match-version',batting_to_plan:'yes',dismissal_classification:'plan_execution',
  feedback:{id:'own-feedback',updated_at:'feedback-version',batting_to_plan:'yes',dismissal_classification:'plan_execution'},candidates:[]};
 Object.assign(s,{fixtureId:'fixture-1',fixtureMode:'saved',match_date:'2026-10-10',format_key:'limited_overs',opposition:'Visitors',innings_number:1,
  group:'first',sessionId:'own-review',sharedReviewId:'anchor',sessionRevision:4,sessionGroupId:'first',sessionGroupScope:'group',
  reviewCanEdit:true,editReview:false,groups:[{id:'first',name:'First XI'}],saved:['p1']});s.loaded=c.teamReviewIdentity(s);
 c.teamReviewRows=()=>[player];c.teamReviewCache={players:[player],groups:s.groups};
 const response=()=>({shared_review_id:'anchor',own_review_id:s.sessionId,review:{id:s.sessionId,fixture_id:s.fixtureId,
  match_date:s.match_date,format_key:s.format_key,opposition:s.opposition,innings_number:s.innings_number,group_scope:'group',group_id:'first',
  can_edit:true,can_delete:false,revision:serverRevision},groups:s.groups,players:[player]});
 c.supabase={rpc:async(name,args)=>{requests.push({name,args});assert.equal(name,'get_shared_team_review');return{data:response()};}};
 c.loadDevelopmentFeedback=async()=>({matches:[{id:player.match_id,...s.loaded,coach_feedback:[{id:'own-feedback',author_user_id:'u'}]}]});
 c.matchDraftRpc=async(_,name,args)=>{requests.push({name,args:structuredClone(args)});if(saveError)return{error:saveError};serverRevision++;
  for(const row of args.p_values.rows){Object.assign(player.feedback,{batting_to_plan:row.batting_to_plan,dismissal_classification:row.dismissal_classification,updated_at:'feedback-'+serverRevision});}
  const review={...response().review,id:s.sessionId||'created-review'};
  return{data:{review_id:review.id,revision:serverRevision,review,saved:args.p_values.rows.map(row=>({player_id:row.player_id})),removed:[],imported_scores:(args.p_values.scorecard_import?.rows||[]).map(row=>({player_id:row.player_id}))}};
 };
 c.saveClubEditsBeforeNavigation=async()=>permitted&&c.confirmLeaveFeedbackEntry();
 c.renderTab=async()=>{if(c.currentTab==='team_review')await c.renderTeamReview();else c.recordAppNavigation(c.clubNavigationRoute());};
 return{...h,state:s,player,requests,permit:v=>permitted=v,saveFailure:e=>saveError=e,
  open:async()=>{h.s.view='board';h.visit();c.currentTab='team_review';await c.renderTab();},
  settle:async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));}};
}

test('Match Review observation is a real Back/Forward step, without intermediate loading screens',async()=>{
 const h=reviewHarness();await h.open();assert.equal(h.entries.length,2);
 h.c.document.querySelector('[data-team-detail]').click();await h.settle();
 assert.equal(h.entries.length,3);assert.equal(h.state.observation.player.id,'p1');assert.ok(h.c.document.getElementById('staffDevelopmentForm'));
 const observation=h.entries[2];assert.equal(observation.clubBattingNavigation.route.teamReview.observation_player_id,'p1');
 await h.history.back();assert.equal(h.c.currentTab,'team_review');assert.equal(h.state.observation,null);
 assert.equal(h.state.fixtureId,'fixture-1');assert.equal(h.state.innings_number,1);assert.ok(h.c.document.querySelector('[data-team-detail]'));
 await h.c.handleAppNavigationHistory({state:observation});assert.equal(h.state.observation.player.id,'p1');assert.equal(h.entries.length,3);
 assert.equal(JSON.stringify(h.entries).includes('feedback-version'),false,'Observation contents are never stored in browser history');
});

test('the observation Back button uses history and pending saves or unsaved answers can block it',async()=>{
 const h=reviewHarness();await h.open();await h.c.openTeamReviewPlayer('p1');
 h.state.observation.pending=true;h.c.closeTeamReviewObservation();await h.settle();assert.equal(h.index(),2);
 h.state.observation.pending=false;h.c.document.getElementById('staffMatchNote').value='Unfinished note';h.permit(false);
 h.c.document.getElementById('backToFixture').click();await h.settle();assert.equal(h.index(),2);assert.ok(h.state.observation);
 h.permit(true);h.c.document.getElementById('backToFixture').click();await h.settle();assert.equal(h.index(),1);assert.equal(h.state.observation,null);assert.equal(h.c.currentTab,'team_review');
});

test('clicking Match Review opens its home table and Back still returns to the previous observation',async()=>{
 const h=reviewHarness();await h.open();await h.c.openTeamReviewPlayer('p1');
 h.permit(false);await h.c.openClubSectionHome('team_review');assert.ok(h.state.observation);assert.equal(h.entries.length,3);
 h.permit(true);await h.c.openClubSectionHome('team_review');assert.equal(h.state.observation,null);assert.equal(h.state.view,'entry');assert.equal(h.state.fixtureId,'fixture-1');
 assert.ok(h.c.document.querySelector('[data-team-detail]'));await h.history.back();assert.equal(h.state.observation.player.id,'p1');
 await h.c.openClubSectionHome('teams');assert.equal(h.s.view,'published');
 await h.c.openClubSectionHome('team_review');assert.equal(h.state.observation,null);assert.equal(h.state.fixtureId,'fixture-1');
});

test('a saved or score-imported review stays editable through repeated saves, with the same review ID',async()=>{
 const h=reviewHarness();await h.open();
 const choice=value=>h.c.document.querySelector('[data-team-choice="'+value+'"]');
 for(const value of ['mostly','no','yes']){
  assert.equal(choice(value).disabled,false);choice(value).click();assert.equal(choice(value).getAttribute('aria-pressed'),'true');
  assert.equal(h.c.document.getElementById('saveTeamReview').disabled,false);await h.c.saveTeamReview();
  assert.equal(h.state.sessionId,'own-review');assert.equal(h.state.editReview,true);assert.equal(h.c.document.querySelector('[data-team-dismissal]').disabled,false);
  assert.equal(choice('mostly').disabled,false);assert.equal(h.c.document.getElementById('saveTeamReview').textContent,'Saved');
 }
 h.state.importer={dirty:true,selected:{p1:true}};h.c.renderTeamReviewContent();await h.c.saveTeamReview();
 assert.equal(choice('mostly').disabled,false);assert.equal(h.state.importer.dirty,false);assert.equal(h.entries.length,2,'Saving stays on the same navigation step');
 const writes=h.requests.filter(r=>r.name==='save_team_match_review');assert.equal(writes.length,4);
 assert.deepEqual(writes.map(r=>r.args.p_values.review_id),['own-review','own-review','own-review','own-review']);
 assert.deepEqual(writes.map(r=>r.args.p_values.expected_revision),[4,5,6,7]);assert.equal(writes[3].args.p_values.rows.length,0,'Score-only saves do not manufacture coaching answers');
});

test('permission loss, saving and uncertain requests still disable review controls',async()=>{
 for(const state of [{reviewCanEdit:false},{saving:true},{pending:{request_id:'unconfirmed'}},{loading:true}]){
  const h=reviewHarness();await h.open();Object.assign(h.state,state);h.c.renderTeamReviewContent();
  assert.equal(h.c.document.querySelector('[data-team-choice]').disabled,true);assert.equal(h.c.document.querySelector('[data-team-dismissal]').disabled,true);
  const before=h.requests.length;h.c.teamReviewUpdate('p1',{batting_to_plan:'mostly'});assert.equal(Object.keys(h.state.drafts).length,0);assert.equal(h.requests.length,before);
 }
 const h=reviewHarness();await h.open();h.player.can_edit=false;h.c.renderTeamReviewContent();assert.equal(h.c.document.querySelector('[data-team-choice]').disabled,true);
});

test('the first score-only save keeps coaching responses open and later saves reuse that review',async()=>{
 const h=reviewHarness();await h.open();Object.assign(h.state,{sessionId:null,sharedReviewId:null,sessionRevision:null,importer:{dirty:true,selected:{p1:true}}});
 h.c.renderTeamReviewContent();await h.c.saveTeamReview();assert.equal(h.state.sessionId,'created-review');
 assert.equal(h.c.document.querySelector('[data-team-choice="mostly"]').disabled,false);h.c.teamReviewUpdate('p1',{batting_to_plan:'mostly'});await h.c.saveTeamReview();
 const writes=h.requests.filter(r=>r.name==='save_team_match_review');assert.equal(writes[0].args.p_values.review_id,null);assert.equal(writes[0].args.p_values.rows.length,0);assert.equal(writes[1].args.p_values.review_id,'created-review');assert.equal(h.entries.length,2);
});

test('clicking a section cancels an in-flight observation without reopening it later',async()=>{
 const h=reviewHarness();await h.open();let resolve;
 h.c.loadDevelopmentFeedback=()=>new Promise(r=>resolve=r);const opening=h.c.openTeamReviewPlayer('p1');assert.equal(h.state.loading,true);
 h.c.appNavigationRestoring=true;await h.c.openClubSectionHome('team_review');
 resolve({matches:[]});await opening;assert.equal(h.state.observation,null);assert.equal(h.state.loading,false);assert.equal(h.c.appNavigationRestoring,false);
 assert.ok(h.c.document.querySelector('[data-team-detail]'));assert.equal(h.entries.length,2);
});

test('a lost save response retains the receipt and choices, then retry confirms the same save',async()=>{
 const h=reviewHarness();await h.open();h.c.teamReviewUpdate('p1',{batting_to_plan:'mostly'});h.saveFailure({message:'Network error'});await h.c.saveTeamReview();
 const request=h.state.pending.request_id;assert.equal(h.c.document.querySelector('[data-team-choice]').disabled,true);assert.equal(h.c.document.getElementById('saveTeamReview').textContent,'Retry save');
 h.saveFailure(null);await h.c.saveTeamReview();const writes=h.requests.filter(r=>r.name==='save_team_match_review');
 assert.equal(writes[1].args.p_request_id,request);assert.equal(h.state.pending,null);assert.equal(h.player.feedback.batting_to_plan,'mostly');assert.equal(h.c.document.querySelector('[data-team-choice]').disabled,false);
});

test('history changes retain unsaved choices with their own fixture, never another match',async()=>{
 const h=reviewHarness();await h.open();const first=h.c.serializeTeamReviewState();h.c.teamReviewUpdate('p1',{batting_to_plan:'mostly'});
 const second={...first,fixture_id:'fixture-2',session_id:'second-review',shared_review_id:'second-anchor',opposition:'Other visitors'};
 h.c.restoreTeamReviewState(second);assert.equal(h.state.fixtureId,'fixture-2');assert.equal(Object.keys(h.state.drafts).length,0);
 h.c.restoreTeamReviewState(first);assert.equal(h.state.fixtureId,'fixture-1');assert.equal(h.state.drafts.p1.batting_to_plan,'mostly');
 h.state.observation={player:{id:'p1'}};h.c.restoreTeamReviewState(first);assert.equal(h.state.observation,null,'Unsaved quick choices do not trap navigation inside a player');assert.equal(h.state.drafts.p1.batting_to_plan,'mostly');
});

test('section buttons clear nested views only after navigation is allowed',async()=>{
 const h=reviewHarness();await h.open();const messages={mode:'sent',openId:'message',draft:{body:'Retained unsent draft'}},innings={openId:'innings',editId:'innings'};
 Object.assign(h.c,{ensureClubMessages:()=>messages,ensureMyInningsState:()=>innings,resetPlayersWorkspaceForClub:()=>{},clearPlayersWorkspaceSearch:()=>h.c.playersWorkspaceSearch='',
  playersWorkspaceSelectedId:'player',playersWorkspaceSection:'development',playersWorkspaceMatchFormat:'',playersWorkspaceMatchOpenId:'innings',playersWorkspaceSearch:'Name',playersWorkspaceGroupFilter:'first',playersWorkspaceShowAll:false,
  playersWorkspaceDevelopmentMode:'match',playersWorkspaceDevelopmentMatchId:'innings',staffObservationEditId:'feedback',saveWorkspacePlayerPlanSilently:async()=>true});
 await h.c.openClubSectionHome('messages');assert.equal(messages.mode,'inbox');assert.equal(messages.openId,null);assert.equal(messages.draft.body,'Retained unsent draft');
 await h.c.openClubSectionHome('innings');assert.equal(innings.openId,null);assert.equal(innings.editId,null);
 await h.c.openClubSectionHome('players');assert.equal(h.c.playersWorkspaceSelectedId,null);assert.equal(h.c.playersWorkspaceSection,'summary');assert.equal(h.c.playersWorkspaceDevelopmentMode,null);assert.equal(h.c.staffObservationEditId,null);
 h.s.view='board';h.s.statsOpen=true;h.s.followupOpen=true;h.s.boardChatOpen='fixture-1';h.s.boardCommentOpen='fixture-1';h.s.navigationDrawer={kind:'fixture',id:'fixture-1'};h.s.restoreDrawer=h.s.navigationDrawer;h.permit(false);
 await h.c.openClubSectionHome('teams');assert.equal(h.s.view,'board');assert.ok(h.s.navigationDrawer);
 h.permit(true);await h.c.openClubSectionHome('teams');assert.equal(h.s.view,'published');assert.equal(h.s.navigationDrawer,null);assert.equal(h.s.restoreDrawer,null);assert.equal(h.s.statsOpen,false);assert.equal(h.s.followupOpen,false);assert.equal(h.s.boardChatOpen,null);assert.equal(h.s.boardCommentOpen,null);
});

test('nested Players, Innings and Messages screens have distinct navigation identities',()=>{
 const h=harness(),key=h.c.appNavigationKey;
 for(const [before,after] of [
  [{tab:'players',playerId:'p',playerSection:'development'},{tab:'players',playerId:'p',playerSection:'development',developmentMode:'match',developmentMatchId:'m',observationEditId:'f'}],
  [{tab:'innings',innings:{}},{tab:'innings',innings:{openId:'m'}}],
  [{tab:'messages',messages:{mode:'inbox'}},{tab:'messages',messages:{mode:'inbox',openId:'m'}}],
  [{tab:'messages',messages:{mode:'inbox'}},{tab:'messages',messages:{mode:'compose'}}]
 ])assert.notEqual(key(before),key(after));
});

test('production and demo share review editing and navigation behaviour',()=>{
 const demo=fs.readFileSync(new URL('../demo.html','file://'+__filename),'utf8').replaceAll('fixtureLocalStorage.','localStorage.');
 for(const name of ['openClubSectionHome','clubNavigationRoute','teamReviewNavigationIdentity','appNavigationKey','restoreClubNavigationState',
  'serializeTeamReviewState','restoreTeamReviewState','teamReviewUpdate','teamReviewRowHtml','renderTeamReviewContent','renderTeamReview','renderTeamReviewEntry',
  'openTeamReviewPlayer','closeTeamReviewObservation','renderTeamReviewObservation','saveTeamReview','loadSavedTeamReview','drawClubMessages'])assert.equal(fn(name).replace('s.teamChange=null;s.availabilityReturn=null;','').replace("compareDate:saved.statsFilters?.compareDate||'',",''),fn(name,demo),name); // The parked demo has no .207 move notice or .209 comparison date.
});


test('browser Back restores stats filters and comparison without retaining private score data',async()=>{
 const h=harness();h.s.view='board';h.s.statsOpen=true;h.s.statsFilters={mode:'batting',format:'long_form',grade:'',compare:true,compareDate:'2026-10-17',firstTeam:'first',secondTeam:'second',secret:'Never stored'};h.visit();
 h.s.statsOpen=false;h.s.statsFilters={mode:'bowling'};h.visit();await h.history.back();
 assert.equal(h.s.statsOpen,true);assert.equal(h.s.statsFilters.compare,true);assert.equal(h.s.statsFilters.compareDate,'2026-10-17');assert.equal(h.s.statsFilters.firstTeam,'first');assert.equal(h.s.statsFilters.secondTeam,'second');assert.equal(h.s.statsFilters.secret,undefined);
 assert.doesNotMatch(JSON.stringify(h.entries),/Never stored/);
});

test('Back restores the expanded board panel while section entry starts at home',async()=>{
 const h=harness();h.s.view='board';h.visit();h.s.followupOpen=true;h.visit();h.s.boardChatOpen='fixture';h.visit();h.s.boardCommentOpen='fixture';h.visit();
 h.s.view='availability';h.s.followupOpen=false;h.s.boardChatOpen=null;h.s.boardCommentOpen=null;h.visit();
 await h.history.back();assert.equal(h.s.view,'board');assert.equal(h.s.followupOpen,true);assert.equal(h.s.boardChatOpen,'fixture');assert.equal(h.s.boardCommentOpen,'fixture');
 await h.history.back();assert.equal(h.s.boardCommentOpen,null);assert.equal(h.s.boardChatOpen,'fixture');
 await h.history.back();assert.equal(h.s.boardChatOpen,null);assert.equal(h.s.followupOpen,true);
 await h.history.back();assert.equal(h.s.followupOpen,false);
});
test('Club Home, Training and Player Plan section buttons clear the nested screen',async()=>{
 const h=reviewHarness();await h.open();Object.assign(h.c,{clubHomeStageClubId:'c',clubHomeExpandedStage:'workshop',clubHomeRestoredStage:false,howWeTrainReflectionEditId:'match',playerPlanEditScope:'edit',builderSection:'limited_overs'});
 await h.c.openClubSectionHome('dashboard');assert.equal(h.c.clubHomeExpandedStage,null);assert.equal(h.c.clubHomeRestoredStage,true);
 await h.c.openClubSectionHome('howwetrain');assert.equal(h.c.howWeTrainReflectionEditId,null);
 await h.c.openClubSectionHome('myplan');assert.equal(h.c.builderSection,'core');assert.equal(h.c.playerPlanEditScope,'');
});

test('captain section buttons added after sign-in use the same home navigation',async()=>{
 const dom=new JSDOM('<div class="shell"><nav class="nav"></nav></div>'),opened=[];
 const c=vm.createContext({document:dom.window.document,club:{id:'club'},session:{user:{id:'captain'}},selectionsStandalone:()=>false,canUsePlayersWorkspace:()=>true,canUseTeamReview:()=>true,openClubSectionHome:tab=>opened.push(tab)});
 const start=source.indexOf('function syncMatchCaptainNavigation()'),end=source.indexOf('\ndocument.addEventListener',start);
 vm.runInContext(source.slice(start,end),c);c.syncMatchCaptainNavigation();
 for(const tab of ['players','team_review']){const b=dom.window.document.querySelector('[data-tab="'+tab+'"]');b.click();b.click();}
 assert.deepEqual(opened,['players','players','team_review','team_review']);
});

test('plain Player Home tiles open the section home; specific match actions retain their destination',async()=>{
 const opened=[],h=harness();Object.assign(h.c,{openClubSectionHome:tab=>opened.push(tab),myPlayer:{id:'p'},playerPlanEditScope:'',builderSection:'core'});
 vm.runInContext(fn('openPlayerHomeAction'),h.c);await h.c.openPlayerHomeAction({tab:'howwetrain'});await h.c.openPlayerHomeAction({tab:'myplan'});
 assert.deepEqual(opened,['howwetrain','myplan']);
 await h.c.openPlayerHomeAction({tab:'myplan',section:'long_form',edit:true});assert.equal(h.c.builderSection,'long_form');assert.equal(h.c.playerPlanEditScope,'c:p');assert.equal(h.c.currentTab,'myplan');
});
