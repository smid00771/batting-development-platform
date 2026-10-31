const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const base=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,base,'app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,base,'demo.html'),'utf8');
function part(text,a,b){const i=text.indexOf(a),j=text.indexOf(b,i);assert(i>=0&&j>i);return text.slice(i,j);}
const pieces=[['function staffObservationStatus(','function renderStaffTrainingObservationForm('],['function renderStaffMatchFeedbackForm(','function staffMatchObservationsInView('],['function wireStaffDevelopmentControls(','/* ---------------- FEEDBACK WORKSPACE ---------------- */'],['async function returnToPlayersWorkspaceList(){','async function renderPlayersWorkspacePlayer(){']];
const code=pieces.map(([a,b])=>part(app,a,b)).join('\n');
function element(value=''){return {value,checked:false,disabled:false,textContent:'',dataset:{},style:{},prepend(child){this.firstChild=child;child.isConnected=true;},addEventListener(){},setAttribute(k,v){this[k]=v;},scrollIntoView(options){this.scrolled=true;this.scrollOptions=options;},focus(){this.focused=true;},setSelectionRange(a,b){this.selection=[a,b];},remove(){this.removed=true;}};}
function setup({own=true,answers=true,general=false}={}){
 const elements={},fields={staffMatchDate:'2026-10-10',staffMatchFormat:'limited_overs',staffMatchInningsNumber:'1',staffMatchOpposition:'Visitors',staffMatchScore:'34',staffMatchDismissal:'Saved innings note',staffMatchMainIssue:'execution',staffMatchNextFocus:'Saved training focus',staffMatchNote:'Existing note\nAdded comment',staffObservationReviewOn:'2026-10-20'};
 for(const [k,v]of Object.entries(fields))elements[k]=element(v);
 for(const k of ['saveStaffMatchFeedback','cancelStaffDevelopment','staffDevelopmentStatus','staffObservationGeneral','staffObservationConversation','staffObservationPlanQuestions','staffMatchDismissalAssessment','addNewMatchFeedback','developmentOverview'])elements[k]=element();
 elements.saveStaffMatchFeedback.textContent=own?'Save changes':'Save observation';elements.staffObservationGeneral.checked=general;
 const assessment=answers?element('yes'):null,dismissal=answers?element('plan_execution'):null;
 const form=elements.staffDevelopmentForm={...element(),isConnected:true,dataset:{matchId:'match-1',matchUpdatedAt:'match-version',observationId:own?'own-feedback':'',observationUpdatedAt:own?'feedback-version':'',actionRevision:'3',actionClosed:'false',originalReview:'2026-10-20'},querySelector:sel=>elements[sel.replace('#','')],querySelectorAll:()=>[],remove(){delete elements.staffDevelopmentForm;this.isConnected=false;}};
 const add={...element(),dataset:{addCoachFeedback:'match-1'}};
 const page={querySelectorAll:sel=>sel==='[data-add-coach-feedback]'?[add]:[]};elements.page=page;
 const saved={id:'own-feedback',author_user_id:'coach',updated_at:'2026-10-12',batting_to_plan:'yes',dismissal_classification:'plan_execution',main_issue:'execution',next_training_focus:'Saved training focus',note:'Existing note',innings_note:'Saved innings note'};
 const match={id:'match-1',coach_feedback:[{...saved,id:'other-feedback',author_user_id:'other',note:'Other coach note'},...(own?[saved]:[])],match_date:'2026-10-10',format_key:'limited_overs',edit_context:{can_edit_details:true}};
 const calls=[],data={matches:[match],coaching_actions:[{id:'action-1',match_feedback_id:'own-feedback',revision:3,status:'open',review_on:'2026-10-20'}]};let allowed=true,failure=null,after=0,rendered=0;
 const c=vm.createContext({console,crypto:webcrypto,queueMicrotask:fn=>fn(),requestAnimationFrame:fn=>fn(),session:{user:{id:'coach'}},club:{id:'club'},currentTab:'players',playersWorkspaceSelectedId:'player',playersWorkspaceSection:'development',playersWorkspaceDevelopmentMode:'match',playersWorkspaceDevelopmentMatchId:'match-1',staffObservationEditId:null,playersWorkspacePlayerRenderSequence:0,playersWorkspaceSearch:'Al',playersWorkspaceLocalRaw:null,
 document:{getElementById:id=>elements[id]||null,querySelector:sel=>sel.includes('staffBattingToPlan')?assessment:sel.includes('staffDismissalClass')?dismissal:null,querySelectorAll:sel=>sel==='[data-add-coach-feedback]'?[add]:[],createElement:()=>element()},
 canUseAppNavigationBack:()=>false,recordAppNavigation:()=>{},clubNavigationRoute:()=>({}),confirmLeaveFeedbackEntry:()=>allowed,confirmLeaveWeeklyLoop:()=>true,coachingActionSavePending:false,matchDraftDiscardForm:f=>{calls.push({discard:f});},feedbackEntryBaselines:new WeakMap(),feedbackEntryValues:()=>JSON.stringify(fields),matchDraftAttachObservation(){},matchDraftConfirmed(){calls.push({confirmed:true});},matchDraftAfterAttempt(){},
 val:id=>elements[id]?.value||'',todayIso:()=> '2026-10-12',coachingVideoValues:()=>({video_url:'https://youtu.be/example',video_note:'Saved video note'}),freezeCoachingForm:f=>{elements.saveStaffMatchFeedback.disabled=true;return ()=>elements.saveStaffMatchFeedback.disabled=false;},
 matchDraftRpc:async(f,name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args))});if(failure){const e=failure;failure=null;return {error:e};}return {data:{match_id:'match-1',observation_id:'own-feedback'}};},
 staffMatchObservationStyles:()=>'',formatDateShort:x=>x,formatLabel:x=>x,FORMATS:[['limited_overs','Limited Overs']],matchArrivalField:()=>'',esc:x=>String(x??''),publishedEnabledFormats:()=>[['limited_overs','Limited Overs']],observationPurposeField:()=>'',radioChoiceHtml:(name,choices,value)=>`<input name="${name}" data-selected="${value}">`,DEVELOPMENT_ISSUE_LABELS:{execution:'Execution'},observationConversationField:()=>'',wireCoachingVideoFields:()=>{},coachingVideoFields:()=>'',observationReviewField:()=>'',
 wireQuickChoices(){},captureFeedbackEntryBaseline(){},wireStaffMatchObservationControls(){},wireIndividualFixtureObservation(){},refreshPlayersWorkspaceFeedback:async()=>{},renderPlayersWorkspacePlayer:async()=>{rendered++;},renderPlayersWorkspaceList:()=>{rendered++;},saveWorkspacePlayerPlanSilently:async()=>true});
 vm.runInContext(code,c);
 return {c,e:elements,form,add,match,saved,data,calls,allowed:v=>allowed=v,failure:e=>failure=e,rendered:()=>rendered,after:()=>after,wire:()=>c.wireObservationSave({id:'player'},'match',async()=>{after++;},{rpcName:'save_coach_observation',lockUncertain:true,onSaveState:state=>form.dataset.fixtureSavePending=String(['saving','uncertain'].includes(state))})};
}

test('opening an existing innings preserves this coach’s assessment, note, focus and record ID',()=>{
 const h=setup(),html=h.c.renderStaffMatchFeedbackForm({id:'player'},h.data,'match-1',null);
 assert.match(html,/data-observation-id="own-feedback"/);assert.match(html,/name="staffBattingToPlan" data-selected="yes"/);assert.match(html,/name="staffDismissalClass" data-selected="plan_execution"/);
 assert.match(html,/Existing note/);assert.match(html,/Saved training focus/);assert.match(html,/Save changes/);assert.doesNotMatch(html,/Other coach note/);
});
test('a coach without their own observation never edits someone else’s feedback',()=>{
 const h=setup({own:false}),html=h.c.renderStaffMatchFeedbackForm({id:'player'},h.data,'match-1',null);
 assert.match(html,/data-observation-id=""/);assert.match(html,/Save observation/);assert.doesNotMatch(html,/Other coach note/);
});
test('unavailable edit context never shows a blank replacement observation',()=>{
 const h=setup();h.data.observation_edit_error='Offline';const html=h.c.renderStaffMatchFeedbackForm({id:'player'},h.data,'match-1',null);
 assert.match(html,/saved observation could not be checked/);assert.doesNotMatch(html,/saveStaffMatchFeedback/);
});
test('Add coaching feedback opens the saved observation and focuses the note',async()=>{
 const h=setup();h.c.wireStaffDevelopmentControls({id:'player'},true,h.data);await h.add.onclick();
 assert.equal(h.c.staffObservationEditId,'own-feedback');assert.equal(h.c.playersWorkspaceDevelopmentMatchId,'match-1');assert.equal(h.e.staffMatchNote.focused,true);assert.equal(h.e.staffMatchNote.scrolled,true);
});
test('saving an added comment sends the original assessment, same ID and concurrency versions',async()=>{
 const h=setup();h.wire();await h.e.saveStaffMatchFeedback.onclick();const write=h.calls.find(x=>x.args);
 assert.equal(write.args.p_observation_id,'own-feedback');assert.equal(write.args.p_expected_updated_at,'feedback-version');assert.equal(write.args.p_expected_action_revision,3);
 assert.equal(write.args.p_values.batting_to_plan,'yes');assert.equal(write.args.p_values.dismissal_classification,'plan_execution');assert.equal(write.args.p_values.note,'Existing note\nAdded comment');assert.equal(write.args.p_values.next_training_focus,'Saved training focus');
 assert.equal(h.e.saveStaffMatchFeedback.textContent,'Saved ✓');assert.equal(h.form.dataset.fixtureSavePending,'false');assert.equal(h.after(),1);assert.ok(h.c.feedbackEntryBaselines.has(h.form));
});
test('a comment and main issue save without forcing either assessment answer',async()=>{
 const h=setup({answers:false});h.wire();await h.e.saveStaffMatchFeedback.onclick();
 const write=h.calls.find(x=>x.args);assert.equal(h.after(),1);assert.equal(write.args.p_values.batting_to_plan,undefined);assert.equal(write.args.p_values.dismissal_classification,undefined);assert.equal(write.args.p_values.note,'Existing note\nAdded comment');assert.equal(h.e.saveStaffMatchFeedback.textContent,'Saved ✓');
});
test('a general coaching note saves without requiring plan answers',async()=>{
 const h=setup({answers:false,general:true,own:false});h.wire();await h.e.saveStaffMatchFeedback.onclick();assert.equal(h.after(),1);assert.equal(h.calls.find(x=>x.args).args.p_values.plan_related,false);
});
test('a rejected save retains text and restores the Save button',async()=>{
 const h=setup();h.wire();h.failure({code:'P0001',message:'Observation changed. Reload first.'});await h.e.saveStaffMatchFeedback.onclick();
 assert.equal(h.after(),0);assert.equal(h.e.saveStaffMatchFeedback.disabled,false);assert.equal(h.e.saveStaffMatchFeedback.textContent,'Save changes');assert.equal(h.e.staffMatchNote.value,'Existing note\nAdded comment');assert.match(h.e.staffDevelopmentStatus.textContent,/changed/);
});
test('unconfirmed save retries the same receipt without duplicating the observation',async()=>{
 const h=setup();h.wire();h.failure({message:'Connection interrupted'});await h.e.saveStaffMatchFeedback.onclick();assert.equal(h.after(),0);assert.equal(h.form.dataset.fixtureSavePending,'true');
 await h.e.saveStaffMatchFeedback.onclick();const writes=h.calls.filter(x=>x.args);assert.deepEqual(writes[0].args,writes[1].args);assert.equal(h.after(),1);
});
test('Cancel closes immediately and clears only the confirmed-discarded local draft',()=>{
 const h=setup();assert.equal(h.c.closeStaffDevelopmentForm(),true);assert.equal(h.e.staffDevelopmentForm,undefined);assert.equal(h.c.playersWorkspaceDevelopmentMode,null);assert.equal(h.c.staffObservationEditId,null);assert.equal(h.calls.filter(x=>x.discard).length,1);assert.equal(h.rendered(),0);assert.equal(h.add.focused,true);
 const blocked=setup();blocked.allowed(false);assert.equal(blocked.c.closeStaffDevelopmentForm(),false);assert.ok(blocked.e.staffDevelopmentForm);assert.equal(blocked.calls.length,0);
});
test('returning to Players clears the name search after navigation is permitted',async()=>{
 const h=setup();await h.c.returnToPlayersWorkspaceList();assert.equal(h.c.playersWorkspaceSearch,'');assert.equal(h.c.playersWorkspaceSelectedId,null);
 const blocked=setup();blocked.allowed(false);await blocked.c.returnToPlayersWorkspaceList();assert.equal(blocked.c.playersWorkspaceSearch,'Al');
});
test('production and demo use the same feedback controls, forms and return behaviour',()=>{
 for(const [a,b]of pieces)assert.equal(part(app,a,b),part(demo,a,b));
});

test('provisional player records show account status without an overdue-plan warning',()=>{
 const ctx=vm.createContext({playersWorkspaceGroupFilter:'',isAdmin:()=>false,workspaceFeedbackCount:()=>0,renderPlayerActionAlert:()=>'',workspacePlayerPlansPublished:()=>true,
  playerPlanDeadlineState:()=>({raw:{},firstOverdue:{label:'Limited Overs',due_date:'2026-10-05'},nextIncomplete:null}),sectionProgress:()=>({complete:false}),publishedEnabledFormats:()=>[['limited_overs','Limited Overs']],workspaceReminderState:()=>({history:[],count:0}),
  esc:x=>String(x??''),niceDate:x=>x,memberPhoneStatusIcon:()=>'',renderWorkspaceAssignment:()=>''});
 vm.runInContext(part(app,'function renderWorkspaceRosterRow(','async function refreshPlayersWorkspaceFeedback('),ctx);
 const pending=ctx.renderWorkspaceRosterRow({id:'provisional',display_name:'Example Player',user_id:null,can_edit:true});
 assert.match(pending,/No confirmed sign-up/);assert.doesNotMatch(pending,/border-left:4px|Overdue:|Core still to complete/);
 const registered=ctx.renderWorkspaceRosterRow({id:'registered',display_name:'Example Player',user_id:'login',can_edit:true});
 assert.match(registered,/border-left:4px/);assert.match(registered,/Overdue: Limited Overs/);assert.doesNotMatch(registered,/Awaiting sign-up/);
});

test('after saving, the visible success notice receives focus and scrolls below the navigation',async()=>{
 const h=setup();let afterSave;h.c.wireObservationSave=(player,kind,callback)=>{afterSave=callback;};
 h.c.wireStaffDevelopmentControls({id:'player'},true,h.data);await afterSave();
 const notice=h.e.developmentOverview.firstChild;
 assert.equal(notice.textContent,'Observation saved ✓');assert.equal(notice.scrolled,true);assert.equal(notice.focused,true);
 assert.equal(notice.scrollOptions.block,'start');assert.equal(notice.style.scrollMarginTop,'16px');assert.equal(h.c.playersWorkspaceDevelopmentMode,null);
});
