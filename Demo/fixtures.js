// Fictional, memory-only data adapters. Application UI is built from current source.
// No production credentials, accounts or customer data belong in this file.

let fixtureRows={};

let fixtureCurrent;

const fixtureClone=value=>value===undefined?null:structuredClone(value);

const fixtureNow=()=>new Date().toISOString();

const fixtureDay=(offset=0)=>{const date=new Date();date.setDate(date.getDate()+offset);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};

const fixtureGroups=[{id:'group-first',club_id:'example-club',archived_at:null,name:'1st Grade',active:true,sort_order:0},{id:'group-second',club_id:'example-club',archived_at:null,name:'2nd Grade',active:true,sort_order:1}];

function fixtureReadRows(table){
 const derived={philosophy_profiles:[publishedProfile],philosophy_dimension_catalogue:dimensions,club_philosophy_dimensions:[...publishedSelectedDims.values()],club_format_weights:[...publishedWeights.entries()].map(([key,weight])=>{const ix=key.indexOf(':');return {club_id:club.id,dimension_key:key.slice(0,ix),format_key:key.slice(ix+1),weight};}),philosophy_workshops:workshop?[workshop]:[],philosophy_versions:philosophyVersions,how_we_bat_drafts:howWeBatDraft?[howWeBatDraft]:[],how_we_bat_versions:howWeBatVersions,player_plan_structure_drafts:playerPlanStructureDraft?[playerPlanStructureDraft]:[],player_plan_structure_versions:playerPlanStructureVersions,playing_groups:fixtureGroups,clubs:[club]};
 return table in derived?derived[table]:fixtureRows[table];
}

window.__fixtureFrom=table=>{
 const state={filters:[],single:false,mutation:null};
 const query={select(){return this;},eq(key,value){state.filters.push(row=>row[key]===value);return this;},in(key,values){state.filters.push(row=>values.includes(row[key]));return this;},order(){return this;},limit(){return this;},range(){return this;},is(){return this;},neq(){return this;},maybeSingle(){state.single=true;return this;},single(){state.single=true;return this;},upsert(data){state.mutation={action:'upsert',data};return this;},update(data){state.mutation={action:'update',data};return this;},insert(data){state.mutation={action:'insert',data};return this;},delete(){state.mutation={action:'delete'};return this;},then(resolve,reject){
  let result;
  if(state.mutation){
   if(table==='player_plan_workflows'&&state.mutation.action==='upsert'){
    const value=fixtureClone(state.mutation.data);const index=fixtureRows.player_plan_workflows.findIndex(row=>row.player_id===value.player_id);
    if(index>=0)fixtureRows.player_plan_workflows[index]={...fixtureRows.player_plan_workflows[index],...value};else fixtureRows.player_plan_workflows.push(value);
    if(myPlayer?.id===value.player_id)workflow=value;
    window.__fixtureLog('Saved player answers locally',{player_id:value.player_id});result={data:fixtureClone(value),error:null};
   }else result=window.__fixtureUnsupported(table+' '+state.mutation.action,state.mutation.data);
  }else{
   let rows=fixtureReadRows(table);
   if(rows===undefined)result=window.__fixtureUnsupported('Read table '+table);
   else {rows=rows.filter(row=>state.filters.every(filter=>filter(row)));result={data:fixtureClone(state.single?rows[0]||null:rows),error:null};}
  }
  return Promise.resolve(result).then(resolve,reject);
 }};return query;
};

function fixtureWorkspacePlayers(){return fixtureRows.players.map(player=>({...fixtureClone(player),can_edit:membership.permission_role!=='player',groups:[fixtureGroups[player.id==='player-alex'?0:1]],workflow:fixtureClone(fixtureRows.player_plan_workflows.find(row=>row.player_id===player.id)||{}),requirements:[{format_key:'limited_overs',required:true,due_date:fixtureDay(14)}]}));}

function fixtureFeedbackPlayers(){return fixtureWorkspacePlayers().map(player=>({...player,...fixtureClone(fixtureRows.feedback[player.id])}));}

window.__fixtureRpc=async(name,args={})=>{
 window.__fixtureLog(name,args);
 let data;
 switch(name){
  case 'get_public_sales_prospect':data={club_name:'Harbour Example Cricket Club',locality:'Example district',status:'new'};break;
  case 'get_player_coaching_actions':data={actions:(fixtureRows.feedback[args.p_player_id]?.coaching_actions||[]).map(action=>({...action,can_review:membership.permission_role!=='player'||myPlayer?.id===action.player_id}))};break;
  case 'get_club_entitlement':data={active:true,status:'trial'};break;
  case 'get_club_trial':data=null;break;
  case 'save_club_branding':data={branding_updated_at:fixtureNow(),logo_data_url:args.p_logo_data_url,website_url:args.p_website_url,primary_colour:args.p_primary_colour,accent_colour:args.p_accent_colour};Object.assign(club,data);break;
  case 'get_players_workspace':data={role:membership.permission_role,players:fixtureWorkspacePlayers(),groups:fixtureGroups};break;
  case 'get_feedback_workspace':data={role:membership.permission_role,players:fixtureFeedbackPlayers()};break;
  case 'get_development_feedback_for_player':data=fixtureFeedbackPlayers().find(player=>player.id===args.p_player_id)||{};break;
  case 'get_player_plan_reminder_overview':data={reminders:[],cooldown_hours:48,email_mode:'preview'};break;
  case 'get_my_player_plan_rollout':data={groups:[fixtureGroups[0]],requirements:[{format_key:'limited_overs',required:true,due_date:fixtureDay(14),sources:['1st Grade']}]};break;
  case 'refresh_club_guide_interventions':data=[];break;
  case 'get_philosophy_workshop_status':data={contributors:fixtureRows.philosophy_contributors,mismatch_count:0,synthesis_response_count:3};break;
  case 'get_club_guide_snapshot':data={};break;
  case 'mark_development_discussion':{
   const player=fixtureRows.feedback[args.p_player_id];if(!player)return window.__fixtureUnsupported('Unknown fixture player',args);
   player.discussions=player.discussions.filter(row=>row.signal_key!==args.p_signal_key);
   player.discussions.push({id:'local-discussion-'+Date.now(),signal_key:args.p_signal_key,source_at:args.p_source_at,outcome:args.p_outcome,note:args.p_note,discussed_at:fixtureNow(),created_at:fixtureNow()});
   data=null;break;
  }
  case 'save_coaching_conversation':{
   const player=fixtureRows.feedback[args.p_player_id];
   if(!player||membership.permission_role==='player')return {data:null,error:{message:'This example requires a coaching role.'}};
   const previous=player.discussions.find(row=>row.signal_key===args.p_signal_key&&row.source_at===args.p_source_at);
   if(previous){data={action_id:previous.action_id||null,already_saved:true};break;}
   const needsAction=['adjust_training','review_plan'].includes(args.p_outcome);
   if(needsAction&&(!args.p_task?.trim()||!args.p_review_on))return {data:null,error:{message:'Add the agreed action and review date.'}};
   const actionId=needsAction?'example-action-'+globalThis.crypto.randomUUID():null;
   player.discussions=player.discussions.filter(row=>row.signal_key!==args.p_signal_key);
   player.discussions.push({id:'example-discussion-'+Date.now(),signal_key:args.p_signal_key,source_at:args.p_source_at,outcome:args.p_outcome,note:args.p_task||'',discussed_at:fixtureNow(),created_at:fixtureNow(),action_id:actionId});
   if(needsAction){
    const action={id:actionId,club_id:club.id,player_id:args.p_player_id,signal_key:args.p_signal_key,source_at:args.p_source_at,outcome:args.p_outcome,format_key:args.p_format_key,task:args.p_task,review_on:args.p_review_on,status:'open',recorded_by:session.user.id,recorded_by_name:userProfile.display_name,created_at:fixtureNow(),updated_at:fixtureNow(),revision:1,can_review:true,reviews:[{id:'example-agreement-'+Date.now(),action_id:actionId,request_id:globalThis.crypto.randomUUID(),outcome:'continue',note:'Agreed action recorded',next_review_on:args.p_review_on,reviewed_by:session.user.id,reviewed_by_name:userProfile.display_name,reviewed_at:fixtureNow(),revision:1}]};
    player.coaching_actions.push(action);
   }
   window.__fixtureLog('Shared conversation saved in this example only',{player_id:args.p_player_id,action_id:actionId});
   data={action_id:actionId,already_saved:false};break;
  }
  case 'review_coaching_action':{
   const action=Object.values(fixtureRows.feedback).flatMap(player=>player.coaching_actions||[]).find(row=>row.id===args.p_action_id);
   if(!action)return {data:null,error:{message:'Example action unavailable.'}};
   if(membership.permission_role==='player'&&myPlayer?.id!==action.player_id)return {data:null,error:{message:'This example is not your action.'}};
   if(action.reviews.some(review=>review.request_id===args.p_request_id)){data={action_id:action.id,already_saved:true,revision:action.revision};break;}
   if(action.status!=='open'||action.revision!==args.p_expected_revision)return {data:null,error:{message:'The action changed. Reopen it before reviewing.'}};
   if(!args.p_note?.trim()||!['continue','completed','stopped'].includes(args.p_outcome)||(args.p_outcome==='continue'&&!args.p_review_on))return {data:null,error:{message:'Add a progress note and next review date if continuing.'}};
   action.status=args.p_outcome==='continue'?'open':args.p_outcome;action.review_on=args.p_review_on||action.review_on;action.revision++;action.updated_at=fixtureNow();
   action.reviews.unshift({id:'example-review-'+Date.now(),action_id:action.id,request_id:args.p_request_id,outcome:args.p_outcome,note:args.p_note,next_review_on:args.p_review_on,reviewed_by:session.user.id,reviewed_by_name:userProfile.display_name,reviewed_at:fixtureNow(),revision:action.revision});
   window.__fixtureLog('Action review saved in this example only',{action_id:action.id,status:action.status,revision:action.revision});
   data={action_id:action.id,already_saved:false,revision:action.revision};break;
  }
  case 'save_my_match_reflection':{
   if(!myPlayer||!args.p_batting_to_plan||!args.p_dismissal_classification)return {data:null,error:{message:'Choose both reflection answers.'}};
   const feedback=fixtureRows.feedback[myPlayer.id];
   let match=feedback.matches.find(row=>row.id===args.p_match_id);
   if(!match){match={id:'example-match-'+Date.now(),created_at:fixtureNow(),coach_feedback:[]};feedback.matches.unshift(match);}
   Object.assign(match,{match_date:args.p_match_date||fixtureDay(),opposition:args.p_opposition,format_key:args.p_format_key,score_text:args.p_score_text,dismissal_summary:args.p_dismissal_summary,player_reflection:{batting_to_plan:args.p_batting_to_plan,dismissal_classification:args.p_dismissal_classification,main_issue:args.p_main_issue,next_training_focus:args.p_next_training_focus,note:args.p_note,updated_at:fixtureNow()}});
   window.__fixtureLog('Player reflection saved in this example only',{match_id:match.id});data=match.id;break;
  }
  case 'save_how_we_bat_draft':howWeBatDraft={club_id:club.id,identity_statement:args.p_identity_statement,closing_strapline:args.p_closing_strapline,formats:args.p_formats,status:args.p_status};data=null;break;
  case 'save_player_plan_structure_draft':playerPlanStructureDraft={club_id:club.id,structure:fixtureClone(args.p_structure),status:args.p_status};data=null;break;
  case 'save_staff_player_plan':{
   const index=fixtureRows.player_plan_workflows.findIndex(row=>row.player_id===args.p_player_id);
   if(index<0)return window.__fixtureUnsupported('Unknown fixture player',args);
   data={...fixtureRows.player_plan_workflows[index],raw_answers:fixtureClone(args.p_raw_answers),curated_draft:fixtureClone(args.p_curated_draft),section_status:fixtureClone(args.p_section_status)};
   fixtureRows.player_plan_workflows[index]=data;break;
  }
  default:return window.__fixtureUnsupported('RPC '+name,args);
 }
 return {data:fixtureClone(data),error:null};
};

window.__fixtureDb.functions.invoke=async(name,args)=>name==='club-batting-guide'&&args?.body?.action==='history'?{data:{messages:[]},error:null}:window.__fixtureUnsupported('Edge Function '+name,args);

function fixtureResetGlobals(){
 for(const timer of [playerPlanAutosaveTimer,playersWorkspaceAutosaveTimer])if(timer)clearTimeout(timer);
 coachingActionSavePending=false;conversationPageSequence++;playerHomeRenderSequence++;playerPlanRenderSequence++;howWeTrainRenderSequence++;workshopRenderSequence++;planStructureRenderSequence++;
 playerPlanAutosaveTimer=null;localRaw=null;builderSection='core';howWeBatBuilderDirty=false;howWeBatBuilderSaving=false;howWeBatBuilderFormat='limited_overs';publishedHowWeBatFormat='limited_overs';playerPlanStructureWorking=null;playerPlanStructureDirty=false;playerPlanStructureManualEdit=false;playerPlanStructureSection='core';
 playersWorkspaceUserId=null;playersWorkspaceAssignments=null;playersWorkspaceShowAll=false;playersWorkspaceClubId=null;playersWorkspaceSelectedId=null;playersWorkspaceSection='summary';playersWorkspaceLocalRaw=null;playersWorkspaceAutosaveTimer=null;playersWorkspaceSearch='';playersWorkspaceGroupFilter='';playersWorkspaceDevelopmentMode=null;playersWorkspaceDevelopmentMatchId=null;playersWorkspaceDiscussionKey=null;playersWorkspaceData=null;playersWorkspaceFeedbackData=null;
 feedbackWorkspaceClubId=null;feedbackWorkspaceData=null;feedbackWorkspaceSection='discussion';feedbackWorkspacePlayerFilter='all';feedbackWorkspaceSelectedPlayerId=null;feedbackWorkspaceEntryMode=null;feedbackWorkspaceMatchId=null;feedbackWorkspaceDiscussionKey=null;
 howWeTrainReflectionEditId=null;howWeTrainSelectedFormats=new Set(['limited_overs']);myDevelopmentFeedback=null;clubBrandingDraftClubId=null;clubBrandingDraft=null;
}

const demoStages=[
  {key:'selection_admin',label:"Club setup — admin only",tab:'teams',role:'admin',hint:"Manage fixtures, players and roles. This example admin has no selection role. Choose Selection Board to explore the selector’s workspace."},
  {key:'selections',label:"Selection Board",tab:'teams',role:'coach',hint:"Try Find matching pair in 2nd Grade’s highlighted place: Luca plays Day 1; Tom plays Day 2."},
  {key:'socials',label:"Social Graphics",tab:'teams',role:'coach',hint:"Create team and award posts as the example Head of Selections and Socials Manager."},
  {key:'social_awards',label:"Socials Awards",tab:'teams',role:'coach',hint:"Choose the awards this club uses or try requesting another award. Requests stay in this demo."},
  {key:'availability',label:"Player availability",tab:'teams',role:'player',hint:"Mark each date you can play. Unmarked dates are unavailable; confirm both days of a two-day match."},
  {key:'selected_teams',label:"Published teams",tab:'teams',role:'player',hint:"Publish the example teams from Selection Board, then view them as Alex."},
  {key:'messages',label:"Message players and staff",tab:'messages',role:'coach',hint:"Message permitted players as Casey. Coaching staff are included unless you untick them. View Alex’s example in Player inbox."},
  {key:'staff_messages',label:"Staff inbox",tab:'messages',role:'admin',hint:"Sam is a non-playing Admin. Send Sam an example message, then read it here."},
  {key:'player_messages',label:"Player inbox",tab:'messages',role:'player',hint:"Open Casey’s message and its How We Train link."},
  {key:'phone_app',label:"Phone app instructions",tab:'phone_app',role:'player',hint:"Read the iPhone or Android steps. This demo installs nothing and requests no notification permission."},
  {key:'home',label:"Club Home — ready",tab:'dashboard',role:'admin',hint:"The club has finished setup. Open any saved step to see the example."},
  {key:'preparation',label:"Club Home — setup in progress",tab:'dashboard',role:'admin',preparing:true,hint:"People can sign up during setup. Assign roles in People & Sign-up, then choose workshop contributors."},
  {key:'people',label:"People & Sign-up",tab:'permissions',role:'admin',preparing:true,hint:"Manage people, coaching titles and access."},
  {key:'waiting',label:"Player Home — before setup finishes",tab:'playerhome',role:'player',preparing:true,hint:"Alex is registered. Player Plans open when the club publishes; assigned setup and workshop roles are available now."},
  {key:'workshop',label:"Batting Philosophy Workshop",tab:'workshop',role:'admin',preparing:true,hint:"Read the three contributors’ responses and compare How We Bat options."},
  {key:'contributor',label:"Workshop contributor",tab:'workshop',role:'player',userId:'user-jordan',preparing:true,hint:"Jordan has submitted. Compare the options and join the conversation. The Philosophy Lead chooses the club approach."},
  {key:'involvement',label:"Playing or non-playing sign-up",tab:'dashboard',role:'admin',hint:"Choose whether a new member plays. Club Admin assigns coaching duties and access later."},
  {key:'groups',label:"Playing Groups",tab:'groups',role:'admin',hint:"Assign players to one or more groups, then save."},
  {key:'unassigned',label:"Unassigned players",tab:'players',role:'admin',hint:"Taylor has no group or priority. Add groups and save to apply their plan dates."},
  {key:'priorities',label:"Player Plan — Core complete",tab:'myplan',role:'player',userId:'user-jordan',hint:"Jordan has completed Core. Limited Overs is due next; every format remains available."},
  {key:'howwebat',label:"How We Bat",tab:'howwebat',role:'admin',hint:"Read the club’s published approach. Switch formats to see each version."},
  {key:'questions',label:"Player Plan questions",tab:'plan',role:'admin',hint:"Review the confirmed questions based on How We Bat."},
  {key:'players',label:"Players and plan dates",tab:'players',role:'admin',hint:"Alex has a complete plan, Jordan has completed Core, and Taylor is unassigned. Open a player to review or edit."},
  {key:'team_review',label:"Match review — selected team",tab:'team_review',role:'coach',hint:"Open Alex to add and save an observation. This match uses its published Teams selection."},
  {key:'team_review_manual',label:"Match review — without Teams",tab:'team_review',role:'coach',hint:"Choose Set match team in Club Batting. Add players, captain and keeper; save, then add observations."},
  {key:'individual_match_first',label:"Observation — new fixture",tab:'players',role:'coach',hint:"Open Alex’s Match Observation and choose New match. Save the details; selectors can add the team to this fixture later."},
  {key:'plan',label:"Player Plan",tab:'myplan',role:'player',hint:"Read Alex’s plan. Choose Edit Player Plan to change answers, then Done editing."},
  {key:'player_home',label:"Player Home",tab:'playerhome',role:'player',hint:"Open Alex’s Player Plan, training, match preparation or innings."},
  {key:'focus',label:"Current training focus",tab:'howwetrain',role:'player',hint:"Casey has suggested a change. It replaces Alex’s current focus only if Alex accepts."},
  {key:'training_preparation',label:"Prepare for training",tab:'training_preparation',role:'coach',hint:"Choose a Playing Group to see shared training focuses, match-up cues and open Coach Conversations."},
  {key:'match_preparation',label:"Prepare for a match",tab:'innings',role:'player',hint:"Prepare Alex’s match and save. Mark a match-up for training to share it with permitted coaches. Record the innings afterwards."},
  {key:'innings',label:"Season record",tab:'innings',role:'player',hint:"Read scores, notes and feedback; filter by season or format, or add an innings."},
  {key:'training',label:"How We Train",tab:'howwetrain',role:'player',hint:"Open Alex’s training focus, next-match cues or check-in. Closing a tile keeps your entries."},
  {key:'feedback',label:"Feedback and Coach Conversations",tab:'players',role:'coach',hint:"As Casey, compare Alex’s reflections with coaching feedback or add a training observation."},
  {key:'requests',label:"Request a conversation",tab:'conversations',role:'player',hint:"Request a conversation as Alex. A YouTube link is optional."},
  {key:'recipient',label:"Receive a conversation request",tab:'conversations',role:'player',userId:'user-taylor',hint:"Taylor can read and update this conversation only. Try I can help or I’m unavailable."},
  {key:'help',label:"Help & tutorials",tab:'guide',role:'admin',hint:"Browse the tutorials. The live club also has the Guide for questions."}
];

let demoCurrentStage='selections';

let demoNavigationBusy=false;

let demoPublishedSnapshot=null;

const demoLabels={wicket_preservation:'Value your wicket',leaving_defending:'Leaving and defending',strike_rotation:'Get off strike',boundary_access:'Boundary options',running:'Running between wickets',scoring_areas:'Trusted scoring areas',tempo:'Tempo',matchups:'Matchups',spin_method:'Playing spin',pace_method:'Playing pace',risk_management:'Decision making',reset_routines:'Reset routines',dot_ball_management:'Managing dot balls',powerplay:'Powerplay',death_overs:'Late innings',innovation:'Innovation',patience:'Patience',partnerships:'Partnerships'};

function demoSeedClub(){
  demoPublishedSnapshot=null;demoClubMessageRecords=[];clubMessageState=null;clubMessageUnread=0;
  demoSocial=demoSocialInitialState();socialState=null;
  fixtureResetGlobals();fixtureLocalStorage.clear();fixtureSessionStorage.clear();
  club={id:'example-club',archived_at:null,name:'Harbour Example Cricket Club',primary_colour:'#203578',accent_colour:'#177c78',branding_updated_at:fixtureNow(),lead_admin_user_id:'user-admin',player_signup_open:true,player_join_token:'demo-only',join_code:'DEMO-ONLY'};
  session={user:{id:'user-admin',email:'sam@example.test'}};userProfile={user_id:'user-admin',display_name:'Sam Taylor'};
  membership={club_id:club.id,user_id:'user-admin',permission_role:'admin',involvement:'coach_captain'};
  platformRole=null;platformAccessError=false;canBootstrapPlatform=false;
  const formats={t20:true,limited_overs:true,long_form:true};
  dimensions=Object.keys(DEFAULT_WEIGHTS).map((key,index)=>({dimension_key:key,label:demoLabels[key],description:'How this contributes to the club’s batting approach.',sort_order:index}));
  const priorities=Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).flatMap(([key,values])=>Object.entries(values).map(([format,value])=>[key+':'+format,value])));
  const voices=[
    {user_id:'user-admin',display_name:'Sam Taylor',identity_values:['play_strengths','commit','partnerships'],identity_note:'Choose the shots you own. Practise them, recognise the right ball and commit. Build partnerships through reliable singles.',dimension_notes:{scoring_areas:'Every batter should know their best shots and the balls that invite them.',strike_rotation:'A single to long-on is a valuable scoring option.'}},
    {user_id:'user-coach',display_name:'Casey Reid',identity_values:['strong_decisions','commit','composure'],identity_note:'Reward preparation and commitment. Discuss the decision and the execution separately, including after a dismissal.',dimension_notes:{risk_management:'The whole innings and the dismissal ball deserve separate reflection.',reset_routines:'Use a breath and a clear cue after a mistake.'}},
    {user_id:'user-jordan',display_name:'Jordan Ellis',identity_values:['partnerships','play_strengths','adapt'],identity_note:'Help players enjoy making runs. Back their scoring options and adapt to what the bowler and field offer.',dimension_notes:{partnerships:'Talk with your partner and help them get back to their plan.',leaving_defending:'Leaving well is a positive decision when the ball is outside your scoring area.'}}
  ].map((voice,index)=>({id:'response-'+index,club_id:club.id,...voice,formats_enabled:{...formats},selected_dimensions:dimensions.map(d=>d.dimension_key),format_weights:{...priorities,...(index===1?{'risk_management:limited_overs':4,'boundary_access:limited_overs':4}:index===2?{'partnerships:t20':4}: {})},submitted_at:fixtureNow(),updated_at:fixtureNow()}));
  const agreed=buildScenarioDraft(voices);
  clubProfile={club_id:club.id,identity_values:agreed.identity_values,identity_note:'Know your shots. Practise them. Commit when the right ball is there. Learn from the decision and the execution without judgement.',formats_enabled:formats};
  publishedProfile=fixtureClone(clubProfile);
  selectedDims=new Map(dimensions.map(dim=>[dim.dimension_key,{club_id:club.id,dimension_key:dim.dimension_key,enabled:true,club_note:agreed.dimension_notes?.[dim.dimension_key]||''}]));
  weights=new Map(Object.entries(agreed.format_weights));publishedSelectedDims=new Map(selectedDims);publishedWeights=new Map(weights);
  workshop={club_id:club.id,mode:'collaborative',philosophy_lead_user_id:'user-admin',final_draft_ready:true,final_draft_started_at:fixtureNow(),status:'published'};
  const contributors=voices.map(v=>({club_id:club.id,user_id:v.user_id,status:'submitted',required:true,submitted_at:v.submitted_at}));
  myContributor=contributors[0];myContribution=voices[0];
  howWeBatVersions=[];playerPlanStructureVersions=[];
  howWeBatDraft=generatedHowWeBatDraft();howWeBatDraft.status='ready';
  playerPlanStructureDraft={club_id:club.id,status:'ready',structure:generatedPlayerPlanStructure(false)};
  philosophyVersions=[{club_id:club.id,version_number:1,published_at:fixtureNow()}];
  howWeBatVersions=[{club_id:club.id,philosophy_version:1,snapshot:fixtureClone(howWeBatDraft)}];
  playerPlanStructureVersions=[{club_id:club.id,philosophy_version:1,snapshot:fixtureClone(playerPlanStructureDraft.structure)}];
  const players=[{id:'player-alex',club_id:club.id,user_id:'user-alex',display_name:'Alex Morgan',active:true},{id:'player-jordan',club_id:club.id,user_id:'user-jordan',display_name:'Jordan Ellis',active:true}];
  const answersFor=index=>{
    const raw={core:{},formats:{}};
    const coreChoices=index?{core_strengths:['Sweep','Use feet to spin','Clip / flick'],core_danger:['Predetermining the shot'],core_reset:['Re-check the field','Talk to my partner']}:{core_strengths:['Straight drive','Pull','Clip / flick'],core_danger:['Forcing after dot balls'],core_reset:['Slow breath + cue word','Re-state my scoring plan']};
    const coreNotes=index?{core_strengths:'Use my feet to spin when the length allows it; keep a single available.',core_danger:'I sometimes decide on the sweep before reading the ball.',core_reset:'Look at the field, breathe, then decide from the next delivery.'}:{core_strengths:'Drive the half-volley straight. Pull a short ball I can control. Clip off the pads or push to long-on for one.',core_danger:'Three dots can tempt me to force a shot at a ball outside my scoring area.',core_reset:'Breathe, relax my grip and say: see the ball, trust my shot.'};
    for(const section of ['core',...FORMATS.map(([key])=>key)]){
      const target=section==='core'?raw.core:(raw.formats[section]={});
      for(const q of playerPlanQuestionsFor(section)){
        const options=q.options||[];
        const preferred=section==='core'?coreChoices[q.id]||[]:options.filter(option=>/single|gap|trusted|strength|right ball|partnership|commit|half|short ball|control|good dot/i.test(option)).slice(0,2);
        target[q.id]={choices:preferred.length?preferred:options.slice(index?1:0,index?3:2),comment:section==='core'?coreNotes[q.id]||'':section==='t20'?'Look for my boundary ball early, and use the single when it is not there.':section==='long_form'?'Leave outside my scoring area. Make the bowler come to my shots; keep the single in play.':'Read the ball, use my reliable single and fully commit when my scoring ball arrives.'};
      }
    }
    return raw;
  };
  fixtureRows={
    players,user_profiles:[{user_id:'user-admin',display_name:'Sam Taylor'},{user_id:'user-coach',display_name:'Casey Reid'},{user_id:'user-alex',display_name:'Alex Morgan'},{user_id:'user-jordan',display_name:'Jordan Ellis'}],
    club_memberships:[membership,{club_id:club.id,user_id:'user-coach',permission_role:'coach',involvement:'coach_captain'},{club_id:club.id,user_id:'user-alex',permission_role:'player',involvement:'player'},{club_id:club.id,user_id:'user-jordan',permission_role:'captain',involvement:'both'}],
    philosophy_contributors:contributors,philosophy_contributions:voices,philosophy_contributor_invites:[],philosophy_late_response_actions:[],club_access_grants:[{club_id:club.id,user_id:'user-jordan',scope:'playing_group',playing_group_id:'group-first',can_view:true,can_edit:true}],club_admin_handovers:[],
    philosophy_final_draft_snapshots:[{club_id:club.id,responses:voices,response_count:3,source_invited_count:3,created_at:fixtureNow()}],
    player_playing_groups:players.map((p,index)=>({player_id:p.id,playing_group_id:fixtureGroups[index].id,club_id:club.id})),
    player_plan_requirements:fixtureGroups.map((g,index)=>({id:'requirement-'+index,club_id:club.id,format_key:'limited_overs',playing_group_id:g.id,due_date:fixtureDay(14),target_type:'playing_group',active:true})),
    club_batting_guide_capabilities:GUIDE_TOPIC_ORDER.map(capability_key=>({capability_key,active:true,audience:CLUB_BATTING_HELP[capability_key]?.audience||['admin','head_coach','coach','captain','player'],tutorial:[]})),club_batting_guide_progress:[],
    player_plan_workflows:players.map((p,index)=>({id:'workflow-'+p.id,player_id:p.id,club_id:club.id,raw_answers:answersFor(index),curated_draft:{},section_status:{},updated_at:fixtureNow()})),feedback:{}
  };
  const match=(id,days,score,opposition,summary,alignment,classification,note,coachNote)=>({id,match_date:fixtureDay(days),created_at:fixtureDay(days)+'T16:00:00Z',format_key:'limited_overs',opposition,score_text:score,dismissal_summary:summary,
    player_reflection:{batting_to_plan:alignment,dismissal_classification:classification,main_issue:classification==='plan_execution'?'execution':'decision',note,next_training_focus:classification==='plan_execution'?'Practise my pull against mixed lengths, keeping its direction controlled.':'Read the ball before choosing my shot; keep the single in play.',updated_at:fixtureDay(days)+'T17:00:00Z'},
    coach_feedback:[{author_name:'Casey Reid',batting_to_plan:alignment,dismissal_classification:classification,main_issue:classification==='plan_execution'?'execution':'decision',note:coachNote,next_training_focus:classification==='plan_execution'?'Keep backing the pull on the right length. Practise contact and direction.':'Rehearse the reset and the next-ball decision.',created_at:fixtureDay(days)+'T18:00:00Z'}]});
  fixtureRows.feedback['player-alex']={matches:[
    match('alex-pull',-2,'58','Lakes Example CC','Caught pulling a short ball', 'yes','plan_execution','I stayed with my scoring options and ran well. It was the right length for my pull, but I caught it high on the bat.','Good preparation and full commitment to your shot. Keep trusting it. Let’s practise the contact and direction.'),
    match('alex-dots',-9,'31','Valley Example CC','Drove at a wide ball after three dots','mostly','outside_plan','Most of the innings followed my plan. For the dismissal I tried to force a shot because I had stopped scoring.','Your singles and shot choices worked for most of the innings. Discuss that one choice separately; rehearse your reset after dots.')
  ],training_observations:[{id:'alex-training',observed_on:fixtureDay(-4),format_keys:['limited_overs','t20'],training_to_plan:'yes',observation_type:'right_shots_right_balls',author_name:'Casey Reid',note:'Alex practised the pull against mixed lengths, left the ball outside the scoring area and used a single when the boundary was unavailable.',next_training_focus:'Repeat the decision under a small target and keep committing to the right ball.',created_at:fixtureDay(-4)+'T18:00:00Z'}],external_training_evidence:[],discussions:[],coaching_actions:[]};
  fixtureRows.feedback['player-jordan']={matches:[
    match('jordan-sweep',-3,'24','Ridge Example CC','Swept before reading the length','mostly','outside_plan','I chose the sweep before the ball arrived.','Your sweep is a strength. Let the length decide when you use it.'),
    match('jordan-sweep-2',-10,'42','Bay Example CC','Swept a ball too full for the shot','yes','outside_plan','I followed my plan until that ball; then I tried to manufacture the sweep.','Keep the scoring option. Practise recognising its length, with a single as the alternative.')
  ],training_observations:[],external_training_evidence:[],discussions:[],coaching_actions:[]};
  fixtureRows.feedback['player-alex'].coaching_actions=[{id:'alex-action',club_id:club.id,player_id:'player-alex',signal_key:'example-pull-execution',source_at:fixtureNow(),outcome:'adjust_training',format_key:'limited_overs',task:'Practise the pull against 24 mixed-length balls. Commit on the right length; leave, defend or take a single when it is not there. Discuss decision and contact separately.',review_on:fixtureDay(7),status:'open',recorded_by:'user-coach',recorded_by_name:'Casey Reid',created_at:fixtureNow(),updated_at:fixtureNow(),revision:1,can_review:true,reviews:[{id:'alex-agreement',request_id:'alex-original-agreement',outcome:'continue',note:'Agreed with Alex: retain the shot and practise executing it.',reviewed_by_name:'Casey Reid',reviewed_at:fixtureNow(),revision:1}]}];
  myPlayer=null;workflow=null;philosophyScenarioSelectedIds=new Set();philosophyScenarioStateKey='';guideSelectedCapabilityKey='whole_process';
}

const demoId=prefix=>prefix+'-'+crypto.randomUUID();

let demoPreparationSnapshot=null,demoIsPreparing=false,demoArchives=[],demoMessages=[],demoReceipts=new Map(),demoSeen=new Map();

const demoEmptyFeedback=()=>({matches:[],training_observations:[],external_training_evidence:[],discussions:[],coaching_actions:[]});

const demoBaseSeed=demoSeedClub;

demoSeedClub=function(){
  fixtureGroups.splice(0,fixtureGroups.length,{id:'group-first',club_id:'example-club',name:'1st Grade',active:true,sort_order:0},{id:'group-second',club_id:'example-club',name:'2nd Grade',active:true,sort_order:1});
  demoBaseSeed();fixtureRows.match_preparations=[];fixtureRows.match_preparation_receipts={};fixtureRows.match_preparation_seeded=false;demoPreparationSnapshot=null;demoIsPreparing=false;demoArchives=[];demoMessages=[];demoReceipts.clear();demoSeen.clear();
  Object.assign(workshop,{round_number:1,how_we_bat_selected_at:fixtureNow(),updated_at:fixtureNow()});
  howWeBatDraft.updated_at=fixtureNow();
  fixtureRows.club_batting_guide_capabilities=Object.values(CLUB_BATTING_HELP).map(t=>({...fixtureClone(t),active:true}));
  fixtureRows.players.push({id:'player-taylor',club_id:club.id,user_id:'user-taylor',display_name:'Taylor Brooks',active:true});
  fixtureRows.user_profiles.push({user_id:'user-taylor',display_name:'Taylor Brooks'});
  fixtureRows.club_memberships.push({club_id:club.id,user_id:'user-taylor',permission_role:'player',involvement:'player'});
  fixtureRows.player_plan_workflows.push({id:'workflow-player-taylor',player_id:'player-taylor',club_id:club.id,raw_answers:{core:{},formats:{}},curated_draft:{},section_status:{},updated_at:fixtureNow()});
  fixtureRows.feedback['player-taylor']=demoEmptyFeedback();
  // Jordan has completed Core; the assigned Limited Overs section still needs work.
  const jordan=fixtureRows.player_plan_workflows.find(w=>w.player_id==='player-jordan');jordan.raw_answers.formats={};
  fixtureRows.club_access_grants=['user-coach','user-jordan'].map(user_id=>({club_id:club.id,user_id,scope:'whole_club',can_view:true,can_edit:true}));
  for(const [playerId,feedback] of Object.entries(fixtureRows.feedback)){
    feedback.coaching_actions=[];
    for(const match of feedback.matches){
      match.updated_at=match.created_at;match.created_by=match.player_reflection?fixtureRows.players.find(p=>p.id===playerId)?.user_id:'user-coach';
      match.player_note=match.player_reflection?match.dismissal_summary:'';match.player_video=null;
      for(const note of match.coach_feedback){
        Object.assign(note,{id:match.id+'-coach',author_user_id:'user-coach',updated_at:note.created_at,plan_related:true,needs_conversation:true});
        feedback.coaching_actions.push(demoAction(playerId,'match',note,fixtureDay(7),match));
      }
    }
    for(const note of feedback.training_observations){
      Object.assign(note,{observer_user_id:'user-coach',observer_name:'Casey Reid',updated_at:note.created_at,plan_related:true,needs_conversation:true});
      feedback.coaching_actions.push(demoAction(playerId,'training',note,fixtureDay()));
    }
  }
  const alex=fixtureRows.feedback['player-alex'];
  alex.matches.push({id:'alex-quick',match_date:fixtureDay(-1),format_key:'t20',opposition:'Bay Example CC',score_text:'42*',player_note:'Kept finding singles and finished strongly.',dismissal_summary:'Kept finding singles and finished strongly.',created_by:'user-alex',created_at:fixtureNow(),updated_at:fixtureNow(),player_reflection:null,player_video:null,coach_feedback:[]});
  const previousYear=Number(fixtureDay().slice(0,4))-1;
  alex.matches.push({id:'alex-last-season',match_date:`${previousYear}-07-01`,format_key:'limited_overs',opposition:'Wests Example CC',score_text:'26',player_note:'A useful partnership after two early wickets.',dismissal_summary:'A useful partnership after two early wickets.',created_by:'user-alex',created_at:fixtureNow(),updated_at:fixtureNow(),player_reflection:null,player_video:null,coach_feedback:[]});
  const past=fixtureRows.feedback['player-alex'].coaching_actions.find(a=>a.match_feedback_id==='alex-dots-coach');
  Object.assign(past,{status:'completed',review_on:null,reviews:[{id:'past-review',outcome:'completed',note:'Discussed at training; Alex has practised the reset.',reviewed_by_name:'Sam Taylor',reviewed_at:fixtureNow(),revision:2}],revision:2});
  fixtureRows.feedback['player-alex'].coaching_actions.push({...demoAction('player-alex','request',{id:'example-request',author_user_id:'user-alex',author_name:'Alex Morgan',needs_conversation:true},null),
    id:'alex-request-taylor',task:'Can we talk about how you set up for the short ball?',outcome:'conversation',is_player_request:true,preferred_user_id:'user-taylor',request_state:'pending',video:null,
    reviews:[{id:'request-created',outcome:'continue',note:'Player requested a conversation.',reviewed_by:'user-alex',reviewed_by_name:'Alex Morgan',reviewed_at:fixtureNow(),revision:1}]});
  coachingStaffState=null;
  fixtureRows.coaching_staff={revision:1,roles:[{id:'demo-batting-duty',title:'Batting Coach',user_ids:['user-admin']},{id:'demo-head-duty',title:'Head Coach',user_ids:['user-coach']},{id:'demo-bowling-duty',title:'Bowling Coach',user_ids:['user-jordan']}]};
  demoSeedWeeklyLoop();
  demoMessages.push({id:'example-comment',round:1,author_user_id:'user-jordan',author_name:'Jordan Ellis',created_at:fixtureNow(),body:'I prefer the version using all three responses. It keeps our scoring strengths and makes the reset after dots clearer.'});
};

function demoAction(playerId,kind,note,reviewOn,match=null){
  return {id:demoId('action'),club_id:club.id,player_id:playerId,signal_key:`coach_note:${kind}:${note.id}`,source_at:note.updated_at||note.created_at,
    match_feedback_id:kind==='match'?note.id:null,training_observation_id:kind==='training'?note.id:null,
    outcome:note.next_training_focus?'adjust_training':'conversation',format_key:kind==='match'?match?.format_key:note.format_keys?.[0]||null,
    task:note.next_training_focus||'',review_on:reviewOn||null,status:'open',follow_up_requested:!!(note.needs_conversation||note.next_training_focus||reviewOn),
    recorded_by:note.author_user_id||note.observer_user_id,recorded_by_name:note.author_name||note.observer_name,created_at:fixtureNow(),updated_at:fixtureNow(),revision:1,can_review:true,reviews:[]};
}

const demoOriginalRead=fixtureReadRows;

fixtureReadRows=function(table){return demoOriginalRead(table)||[];};

function demoWorkflowAccess(row,write=false){
  const player=fixtureRows.players.find(p=>p.id===row?.player_id&&p.club_id===club.id&&p.active!==false),userId=session?.user?.id;
  if(!player||!userId||club.archived_at||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===userId)||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===player.user_id))return false;
  return player.user_id===userId||(write?demoPlayerAccess(player.id).edit:demoPlayerAccess(player.id).view);
}

window.__fixtureFrom=table=>{
  const state={filters:[],single:false,mutation:null,orders:[],limit:null};
  const query={select(){return this;},eq(k,v){state.filters.push(r=>r[k]===v);return this;},neq(k,v){state.filters.push(r=>r[k]!==v);return this;},in(k,vs){state.filters.push(r=>vs.includes(r[k]));return this;},is(k,v){state.filters.push(r=>r[k]===v);return this;},order(k,o={}){state.orders.push([k,o.ascending!==false]);return this;},limit(n){state.limit=n;return this;},range(){return this;},maybeSingle(){state.single=true;return this;},single(){state.single=true;return this;},upsert(data){state.mutation=['upsert',data];return this;},insert(data){state.mutation=['insert',data];return this;},update(data){state.mutation=['update',data];return this;},delete(){state.mutation=['delete'];return this;},then(resolve,reject){
    const fail=(code,message)=>Promise.resolve({data:null,error:{code,message}}).then(resolve,reject);
    let rows=fixtureReadRows(table).filter(r=>r&&state.filters.every(fn=>fn(r))&&(table!=='player_plan_workflows'||demoWorkflowAccess(r,!!state.mutation)));
    if(state.mutation){
      const [action,data]=state.mutation;
      if(!['philosophy_contributions','player_plan_workflows','philosophy_workshops','philosophy_contributors'].includes(table))return Promise.resolve(window.__fixtureUnsupported(table+' '+action)).then(resolve,reject);
      const target=table==='philosophy_workshops'?[workshop]:(fixtureRows[table]??=[]);
      if(table==='player_plan_workflows'){
        if(action==='update'&&rows.some(row=>!demoWorkflowAccess({...row,...data},true)))return fail('42501','You cannot update this Player Plan.');
        if(['insert','upsert'].includes(action)){
          const values=Array.isArray(data)?data:[data];
          if(values.some(value=>!demoWorkflowAccess(value,true)))return fail('42501','You cannot update this Player Plan.');
          if(action==='insert'&&(values.some(value=>target.some(row=>row.player_id===value.player_id))||new Set(values.map(value=>value.player_id)).size!==values.length))return fail('23505','A Player Plan already exists for this player.');
        }
      }
      if(action==='update')rows.forEach(r=>Object.assign(r,fixtureClone(data)));
      else if(action==='delete')fixtureRows[table]=target.filter(r=>!rows.includes(r));
      else {
        rows=(Array.isArray(data)?data:[data]).map(value=>{
          const found=action==='upsert'?target.find(r=>value.player_id?r.player_id===value.player_id:value.user_id?r.club_id===value.club_id&&r.user_id===value.user_id:r.club_id===value.club_id):null;
          if(found){Object.assign(found,fixtureClone(value));return found;}
          const record={id:demoId('record'),...fixtureClone(value)};target.push(record);return record;
        });
      }
    }
    for(const [key,asc] of state.orders.slice().reverse())rows.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''))*(asc?1:-1));
    if(state.limit!==null)rows=rows.slice(0,state.limit);
    return Promise.resolve({data:fixtureClone(state.single?rows[0]||null:rows),error:null}).then(resolve,reject);
  }};return query;
};

function demoPlayerGroups(playerId){return fixtureGroups.filter(g=>g.active&&fixtureRows.player_playing_groups.some(m=>m.player_id===playerId&&m.playing_group_id===g.id));}

function demoPlayerRequirements(playerId){
  const groups=demoPlayerGroups(playerId),byFormat=new Map();
  for(const r of fixtureRows.player_plan_requirements.filter(r=>r.active&&groups.some(g=>g.id===r.playing_group_id))){
    const prior=byFormat.get(r.format_key),label=groups.find(g=>g.id===r.playing_group_id)?.name;
    if(!prior)byFormat.set(r.format_key,{format_key:r.format_key,required:true,due_date:r.due_date,sources:[label]});
    else {if(r.due_date<prior.due_date)prior.due_date=r.due_date;prior.sources.push(label);}
  }
  return [...byFormat.values()];
}

function demoPlayerAccess(playerId){if(demoTemporaryCaptainPlayer(playerId))return {view:true,edit:true};if(membership?.permission_role==='admin')return {view:true,edit:true};const groups=demoPlayerGroups(playerId);const grants=fixtureRows.club_access_grants.filter(g=>g.user_id===session.user.id&&(g.scope==='whole_club'||groups.some(group=>group.id===g.playing_group_id)));return {view:grants.some(g=>g.can_view||g.can_edit)||myPlayer?.id===playerId,edit:grants.some(g=>g.can_edit)};}

fixtureWorkspacePlayers=function(){return fixtureRows.players.filter(p=>p.active!==false&&demoPlayerAccess(p.id).view).map(player=>({...fixtureClone(player),can_edit:demoPlayerAccess(player.id).edit,groups:fixtureClone(demoPlayerGroups(player.id)),workflow:fixtureClone(fixtureRows.player_plan_workflows.find(w=>w.player_id===player.id)||{}),requirements:demoPlayerRequirements(player.id)}));};

const demoInningsOpponent=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();

function demoSharedCandidates(playerId,values){return (fixtureRows.feedback[playerId]?.matches||[]).filter(m=>m.match_date===values.match_date&&m.format_key===values.format_key&&(m.innings_number||1)===(values.innings_number||1));}

function demoSharedMatch(playerId,values,matchId=null,{allowNew=true}={}){
 const all=fixtureRows.feedback[playerId]?.matches||[];
 if(matchId){const found=all.find(m=>m.id===matchId);if(!found)throw Error('That innings is not attached to this player.');return found;}
 const candidates=demoSharedCandidates(playerId,values),exact=candidates.filter(m=>demoInningsOpponent(m.opposition)===demoInningsOpponent(values.opposition));
 if(exact.length>1)throw Error('More than one innings matches. Choose the existing innings.');
 if(exact.length)return exact[0];
 if(candidates.length&&allowNew)throw Error('A possible innings already exists. Choose the existing innings or check the match details.');
 return null;
}

function demoPreparationResolution(preparation,proposedInningsNumber=null){
 const all=fixtureRows.match_preparations||[],matches=fixtureRows.feedback[preparation.player_id]?.matches||[];
 if(preparation.match_id){const match=matches.find(m=>m.id===preparation.match_id);return {resolved_match_id:match?.id||null,resolved_participation_status:match?.participation_status|| (match?'played':null),resolution_ambiguous:false,resolution_candidate_ids:match?[match.id]:[]};}
 const inningsNumber=proposedInningsNumber??preparation.innings_number??1;
 const same=row=>row.match_date===preparation.match_date&&row.format_key===preparation.format_key&&(row.innings_number||1)===inningsNumber;
 const candidates=matches.filter(m=>same(m)&&!all.some(p=>p.id!==preparation.id&&p.match_id===m.id));
 const peers=all.filter(p=>p.club_id===preparation.club_id&&p.player_id===preparation.player_id&&!p.match_id&&(p.id===preparation.id||same(p)));
 const match=candidates.length===1&&peers.length===1?candidates[0]:null;
 return {resolved_match_id:match?.id||null,resolved_participation_status:match?.participation_status||(match?'played':null),resolution_ambiguous:matches.some(same)&&!match,resolution_candidate_ids:candidates.map(m=>m.id).sort()};
}

function demoInningsOfficialResult(playerId,match){
 if(!match)return null;
 const entry=fixtureRows.make_your_call?.entries.find(e=>{const preparation=fixtureRows.match_preparations.find(p=>p.id===e.preparation_id);return e.player_id===playerId&&preparation&&demoPreparationResolution(preparation).resolved_match_id===match.id;});
 return entry&&entry.result?.status!=='pending'?entry.result:null;
}

function demoCanEditInningsScore(playerId,match){
 if(!match||match.participation_status==='did_not_bat'||demoInningsOfficialResult(playerId,match))return false;
 return !String(match.score_text||'').trim()||(match.score_recorded_by??match.created_by)===session.user.id;
}

function demoSharedMatchProjection(playerId,match){
 const f=fixtureRows.feedback[playerId]||demoEmptyFeedback(),own=match?.coach_feedback.filter(n=>n.author_user_id===session.user.id).at(-1),action=f.coaching_actions.find(a=>a.match_feedback_id===own?.id);
 return {match_id:match?.id||null,match_updated_at:match?.updated_at||null,participation_status:match?.participation_status||(match?'played':null),own_feedback_id:own?.id||null,own_feedback_updated_at:own?.updated_at||null,own_action_revision:action?.revision||null,batting_to_plan:own?.batting_to_plan||null,dismissal_classification:own?.dismissal_classification||null,feedback:own?{id:own.id,batting_to_plan:own.batting_to_plan,dismissal_classification:own.dismissal_classification,updated_at:own.updated_at,action_revision:action?.revision||null}:null,other_observer_count:match?.coach_feedback.filter(n=>n.author_user_id!==session.user.id).length||0};
}

function demoObservationContext(playerId){
 const f=fixtureRows.feedback[playerId]||demoEmptyFeedback();
 return {matches:f.matches.map(m=>({id:m.id,updated_at:m.updated_at,can_edit_details:demoPlayerAccess(playerId).edit})),feedback:f.matches.flatMap(m=>m.coach_feedback.map(n=>({...n,match_id:m.id,match_updated_at:m.updated_at,can_edit:n.author_user_id===session.user.id}))),training_observations:f.training_observations.map(n=>({...n,can_edit:n.observer_user_id===session.user.id}))};
}

function demoAlerts(){
 const actions=Object.values(fixtureRows.feedback).flatMap(f=>f.coaching_actions||[]).filter(a=>demoPlayerAccess(a.player_id).view);
 return {actions:actions.filter(a=>a.status==='open'&&(a.follow_up_requested||a.review_on)).map(a=>({...a,player_name:fixtureRows.players.find(p=>p.id===a.player_id)?.display_name,can_edit:demoPlayerAccess(a.player_id).edit})),conversation_flags:[],observation_states:actions.filter(a=>a.match_feedback_id||a.training_observation_id).map(a=>({player_id:a.player_id,match_feedback_id:a.match_feedback_id,training_observation_id:a.training_observation_id,id:a.match_feedback_id||a.training_observation_id,kind:a.match_feedback_id?'match':'training',followup_status:a.status}))};
}

function demoConversationAccess(a){return demoPlayerAccess(a.player_id).view||(a.is_player_request&&a.preferred_user_id===session.user.id);}

function demoConversationView(a){
 const copy=fixtureClone(a),f=fixtureRows.feedback[a.player_id];
 const match=f?.matches.find(m=>m.coach_feedback.some(n=>n.id===a.match_feedback_id)),note=match?.coach_feedback.find(n=>n.id===a.match_feedback_id);
 if(myPlayer?.id===a.player_id&&note?.plan_related!==false&&match&&!match.player_reflection)copy.video=null;
 return {...copy,player_name:fixtureRows.players.find(p=>p.id===a.player_id)?.display_name,
  preferred_name:fixtureRows.user_profiles.find(p=>p.user_id===a.preferred_user_id)?.display_name,preferred_available:true,
  is_own_request:!!a.is_player_request&&myPlayer?.id===a.player_id,is_preferred_person:!!a.is_player_request&&a.preferred_user_id===session.user.id,
  can_review:demoPlayerAccess(a.player_id).edit||myPlayer?.id===a.player_id||(a.is_player_request&&a.preferred_user_id===session.user.id)};
}

function demoInbox(){return Object.values(fixtureRows.feedback).flatMap(f=>f.coaching_actions||[]).filter(a=>demoConversationAccess(a)&&(myPlayer?.id===a.player_id||(a.is_player_request&&(a.preferred_user_id===session.user.id||demoPlayerAccess(a.player_id).edit)))).map(demoConversationView);}

function demoUpdates(){
 const f=fixtureRows.feedback[myPlayer?.id]||demoEmptyFeedback(),updates=[];
 const add=(kind,n,m=null)=>{
   const a=f.coaching_actions.find(a=>kind==='match'?a.match_feedback_id===n.id:a.training_observation_id===n.id);
   const key=kind+':'+n.id,changed=n.updated_at||n.created_at;
   if(a?.status!=='open'||demoSeen.get(session.user.id+':'+key)===changed)return;
   updates.push({source_key:key,source_id:n.id,source_kind:kind,match_id:m?.id,changed_at:changed,author_name:n.author_name||n.observer_name,can_open:kind!=='match'||n.plan_related===false||!!m.player_reflection});
 };
 f.matches.forEach(m=>m.coach_feedback.forEach(n=>add('match',n,m)));f.training_observations.forEach(n=>add('training',n));
 for(const a of demoInbox().filter(a=>a.is_player_request&&a.status==='open')){
   const last=a.reviews?.[0],key='conversation:'+a.id;
   if((last?.reviewed_by||a.recorded_by)===session.user.id||demoSeen.get(session.user.id+':'+key)===a.updated_at)continue;
   updates.push({source_key:key,source_kind:'conversation',source_id:a.id,changed_at:a.updated_at,author_name:last?.reviewed_by_name||a.recorded_by_name,can_open:true});
 }
 return {updates};
}

const demoBaseRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 const ok=data=>({data:fixtureClone(data),error:null}),fail=message=>({data:null,error:{message}});
 const userId=session?.user?.id;
 switch(name){
 case 'get_player_innings_details':return ok({matches:(fixtureRows.feedback[args.p_player_id]?.matches||[]).map(m=>({id:m.id,player_note:m.player_note||'',player_video:m.player_video||null}))});
 case 'get_my_innings':{
   if(!myPlayer)return fail('An active player registration is required');
   const feedback=fixtureRows.feedback[myPlayer.id]||demoEmptyFeedback();
   return ok({matches:feedback.matches.map(m=>({...m,innings_number:m.innings_number||1,participation_status:m.participation_status||'played',score_recorded_by:m.score_recorded_by??(String(m.score_text||'').trim()?m.created_by:null),can_edit_score:demoCanEditInningsScore(myPlayer.id,m),can_edit_details:m.created_by===userId,player_note:m.player_note||'',dismissal_summary:m.player_note||'',player_video:m.player_video||null,
     coach_feedback:m.coach_feedback.map(f=>{
       const a=feedback.coaching_actions.find(a=>a.match_feedback_id===f.id);
       if(f.plan_related!==false&&!m.player_reflection)return {id:f.id,author_name:f.author_name,plan_related:true,reflection_required:true,followup_status:a?.status};
       return {...f,action_id:a?.id,video:a?demoConversationView(a).video:null,followup_status:a?.status};
     })}))});
 }
 case 'save_my_innings':{
   if(!myPlayer)return fail('An active player registration is required');
   if(demoReceipts.has(args.p_request_id))return ok(demoReceipts.get(args.p_request_id));
   const feedback=fixtureRows.feedback[myPlayer.id],v=args.p_values;
   let m;try{m=demoSharedMatch(myPlayer.id,v,args.p_match_id);}catch(error){return fail(error.message);}
   if(args.p_match_id&&m&&(m.updated_at!==args.p_expected_updated_at||(m.player_reflection?.updated_at||null)!==args.p_expected_reflection_at))return fail('This innings has changed. Reload before editing');
   if(m?.participation_status==='did_not_bat'&&v.reflection)return fail('Did not bat does not need an innings reflection.');
   if(m&&Object.hasOwn(v,'score_text')&&v.score_text!==m.score_text&&!demoCanEditInningsScore(myPlayer.id,m))return fail('The recorded score is controlled by its author or the official club result.');
   const previousScore=m?.score_text||'';
   if(!m){m={id:demoId('innings'),created_by:userId,created_at:fixtureNow(),coach_feedback:[],player_reflection:null};feedback.matches.unshift(m);}
   const existingIdentity=m.match_date?{match_date:m.match_date,format_key:m.format_key,opposition:m.opposition,innings_number:m.innings_number||1}:null;
   Object.assign(m,{match_date:v.match_date,format_key:v.format_key,opposition:v.opposition,innings_number:v.innings_number||1,participation_status:m.participation_status||'played',score_text:v.score_text??m.score_text??'',player_note:v.player_note||'',player_video:v.video_url?{url:normaliseCoachingYouTubeUrl(v.video_url),note:v.video_note}:null,updated_at:fixtureNow()});
   if(existingIdentity&&m.created_by!==userId)Object.assign(m,existingIdentity);
   if(m.score_text!==previousScore)m.score_recorded_by=String(m.score_text||'').trim()?userId:null;
   if(m.created_by===userId)m.dismissal_summary=v.player_note;
   if(v.reflection&&JSON.stringify(v.reflection)!==JSON.stringify(m.player_reflection?Object.fromEntries(Object.entries(m.player_reflection).filter(([k])=>k!=='updated_at')):null))m.player_reflection={...v.reflection,updated_at:fixtureNow()};
   const result={match_id:m.id};demoReceipts.set(args.p_request_id,result);return ok(result);
 }
 case 'save_my_match_reflection':{
   if(!myPlayer||!args.p_batting_to_plan||!args.p_dismissal_classification)return fail('Choose both reflection answers.');
   const v={match_date:args.p_match_date||fixtureDay(),format_key:args.p_format_key,opposition:args.p_opposition,innings_number:args.p_innings_number||1};let match;
   try{match=demoSharedMatch(myPlayer.id,v,args.p_match_id);}catch(error){return fail(error.message);}
   if(match?.participation_status==='did_not_bat')return fail('Did not bat does not need an innings reflection.');
   if(match&&args.p_score_text!=null&&args.p_score_text!==match.score_text&&!demoCanEditInningsScore(myPlayer.id,match))return fail('The recorded score is controlled by its author or the official club result.');
   const previousScore=match?.score_text||'';
   if(!match){match={id:demoId('innings'),created_by:userId,created_at:fixtureNow(),coach_feedback:[],player_reflection:null,...v};fixtureRows.feedback[myPlayer.id].matches.unshift(match);}
   Object.assign(match,{score_text:args.p_score_text??match.score_text??'',participation_status:'played',updated_at:fixtureNow(),player_reflection:{batting_to_plan:args.p_batting_to_plan,dismissal_classification:args.p_dismissal_classification,main_issue:args.p_main_issue||null,next_training_focus:args.p_next_training_focus||'',note:args.p_note||'',updated_at:fixtureNow()}});if(match.score_text!==previousScore)match.score_recorded_by=String(match.score_text||'').trim()?userId:null;return ok(match.id);
 }
 case 'get_player_coaching_actions':return ok({actions:(fixtureRows.feedback[args.p_player_id]?.coaching_actions||[]).filter(a=>demoPlayerAccess(a.player_id).view).map(demoConversationView)});
 case 'coaching_staff_api':{
   const member=fixtureRows.club_memberships.find(m=>m.club_id===args.p_club_id&&m.user_id===userId);if(!member)throw Error('Current club membership required');
   const setup=fixtureRows.coaching_staff;
   if(args.p_action==='save'){
    if(member.permission_role!=='admin')throw Error('Club Admin access is required');const v=args.p_values;
    if(setup.last_request_id!==v.request_id){if(v.expected_revision!==setup.revision)throw Error('Coaching staff changed since you opened it. Load the latest setup before saving');setup.roles=fixtureClone(v.roles);setup.roles.forEach(r=>r.title=r.title.trim());setup.revision++;setup.last_request_id=v.request_id;}
   }
   return ok({ok:true,can_manage:member.permission_role==='admin',revision:setup.revision,roles:fixtureClone(setup.roles),people:fixtureRows.club_memberships.map(m=>({...m,display_name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name||'Club member'}))});
 }
 case 'get_conversation_people':return ok({people:fixtureRows.club_memberships.filter(m=>m.club_id===club.id&&m.user_id!==userId).map(m=>({user_id:m.user_id,display_name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name||'Club member',permission_role:m.permission_role,coaching_titles:coachingTitlesFor(fixtureRows.coaching_staff,m.user_id)}))});
 case 'get_my_coach_conversations':return ok({actions:demoInbox()});
 case 'request_my_coach_conversation':{
   if(!myPlayer)return fail('This example needs a player account.');
   if(demoReceipts.has(args.p_request_id))return ok(demoReceipts.get(args.p_request_id));
   const a={...demoAction(myPlayer.id,'request',{id:args.p_request_id,author_user_id:userId,author_name:userProfile.display_name,needs_conversation:true},null),
     task:args.p_message,outcome:'conversation',is_player_request:true,preferred_user_id:args.p_preferred_user_id,request_state:args.p_preferred_user_id?'pending':'team',
     video:args.p_video_url?{url:normaliseCoachingYouTubeUrl(args.p_video_url),note:args.p_video_note}:null,
     reviews:[{id:demoId('review'),outcome:'continue',note:'Player requested a conversation.',reviewed_by:userId,reviewed_by_name:userProfile.display_name,reviewed_at:fixtureNow(),revision:1}]};
   fixtureRows.feedback[myPlayer.id].coaching_actions.push(a);const result={action_id:a.id};demoReceipts.set(args.p_request_id,result);return ok(result);
 }
 case 'respond_to_coach_request':{
   if(demoReceipts.has(args.p_request_id))return ok(demoReceipts.get(args.p_request_id));
   const a=Object.values(fixtureRows.feedback).flatMap(f=>f.coaching_actions).find(a=>a.id===args.p_action_id);
   if(!a||a.preferred_user_id!==userId)return fail('Only the preferred person can respond.');
   if(a.status!=='open'||a.revision!==args.p_expected_revision)return fail('Reload the latest conversation.');
   Object.assign(a,{request_state:args.p_response==='unavailable'?'team':'accepted',preferred_user_id:args.p_response==='unavailable'?null:userId,revision:a.revision+1,updated_at:fixtureNow()});
   a.reviews.unshift({id:demoId('review'),outcome:'continue',note:userProfile.display_name+(args.p_response==='unavailable'?' is unavailable. The request remains open for the authorised coaching team.':' has picked up this conversation.'),reviewed_by:userId,reviewed_by_name:userProfile.display_name,reviewed_at:fixtureNow(),revision:a.revision});
   const result={action_id:a.id};demoReceipts.set(args.p_request_id,result);return ok(result);
 }
 case 'get_my_player_plan_rollout':return ok({groups:demoPlayerGroups(myPlayer?.id),requirements:demoPlayerRequirements(myPlayer?.id)});
 case 'get_coach_observation_context':return ok(demoObservationContext(args.p_player_id));
 case 'get_coaching_action_alerts':return ok(demoAlerts());
 case 'get_my_coaching_updates':return ok(demoUpdates());
 case 'mark_my_coaching_update_seen':demoSeen.set(userId+':'+args.p_source_key,args.p_changed_at);return ok(true);
 case 'set_guide_progress':{
   let row=fixtureRows.club_batting_guide_progress.find(r=>r.user_id===userId&&r.capability_key===args.p_capability_key);
   if(!row){row={club_id:club.id,user_id:userId,capability_key:args.p_capability_key};fixtureRows.club_batting_guide_progress.push(row);}row[args.p_action==='completed'?'completed_at':'last_seen_at']=fixtureNow();if(args.p_action==='completed')row.state='completed';return ok(row);
 }
 case 'get_workshop_review_context':{
   const responses=fixtureRows.philosophy_contributions.filter(r=>r.submitted_at),canReview=isPhilosophyLead()||!!responses.find(r=>r.user_id===userId);
   return ok({round_number:workshop.round_number,can_review:canReview,responses:canReview?responses:[],response_count:responses.length,invited_count:fixtureRows.philosophy_contributors.length,outstanding_count:fixtureRows.philosophy_contributors.length-responses.length,outstanding_names:[],lead_user_id:workshop.philosophy_lead_user_id,workshop_state:workshop,draft_meta:howWeBatDraft?{updated_at:howWeBatDraft.updated_at}:null});
 }
 case 'get_workshop_change_options':{
   const completed=fixtureRows.player_plan_workflows.some(w=>['core',...FORMATS.map(f=>f[0])].some(section=>sectionProgress(section,w.raw_answers||{core:{},formats:{}}).complete));
   return ok({round_number:workshop.round_number,can_reopen:isPhilosophyLead()&&!!workshop.how_we_bat_selected_at&&!completed,completed_plan_exists:completed,previous_response:demoArchives.findLast(a=>a.user_id===userId)||null});
 }
 case 'get_workshop_conversation':{const messages=demoMessages.filter(m=>m.round===args.p_round_number);return ok({messages,total_count:messages.length});}
 case 'post_workshop_conversation':
   if(!demoMessages.some(m=>m.id===args.p_message_id))demoMessages.push({id:args.p_message_id,round:args.p_round_number,author_user_id:userId,author_name:userProfile.display_name,created_at:fixtureNow(),body:args.p_body});return ok(true);
 case 'choose_workshop_how_we_bat':{
   if(!isPhilosophyLead())return fail('Only the Philosophy Lead chooses How We Bat.');
   Object.assign(workshop,{final_draft_ready:true,final_draft_started_at:fixtureNow(),how_we_bat_selected_at:fixtureNow(),status:'review'});
   howWeBatDraft={club_id:club.id,...fixtureClone(args.p_how_we_bat),status:'draft',updated_at:fixtureNow()};playerPlanStructureDraft=null;
   fixtureRows.philosophy_final_draft_snapshots=[{club_id:club.id,responses:fixtureClone(fixtureRows.philosophy_contributions.filter(r=>args.p_response_user_ids.includes(r.user_id))),response_count:args.p_response_user_ids.length,source_invited_count:fixtureRows.philosophy_contributors.length,created_at:fixtureNow()}];return ok(true);
 }
 case 'reopen_workshop_how_we_bat':{
   const options=await window.__fixtureRpc('get_workshop_change_options');if(!options.data.can_reopen)return fail('This round cannot be reopened once a Player Plan section has been completed.');
   Object.assign(workshop,{final_draft_ready:false,final_draft_started_at:null,how_we_bat_selected_at:null,status:'review'});howWeBatDraft=null;playerPlanStructureDraft=null;return ok(true);
 }
 case 'start_new_philosophy_round':{
   for(const r of fixtureRows.philosophy_contributions)demoArchives.push({...fixtureClone(r),archive_id:demoId('archive'),round_number:workshop.round_number});
   workshop={...workshop,round_number:workshop.round_number+1,status:'collecting',final_draft_ready:false,how_we_bat_selected_at:null,final_draft_started_at:null};
   fixtureRows.philosophy_contributions=[];fixtureRows.philosophy_contributors=fixtureRows.philosophy_contributors.map(c=>({...c,status:'invited',submitted_at:null}));
   fixtureRows.philosophy_final_draft_snapshots=[];howWeBatDraft=null;playerPlanStructureDraft=null;return ok(true);
 }
 case 'invite_existing_philosophy_contributor':{
   if(!fixtureRows.philosophy_contributors.some(r=>r.user_id===args.p_user_id))fixtureRows.philosophy_contributors.push({club_id:club.id,user_id:args.p_user_id,status:'invited',required:true});return ok(true);
 }
 case 'start_my_philosophy_response':{
   const contributor=fixtureRows.philosophy_contributors.find(r=>r.user_id===userId);if(contributor)contributor.status='in_progress';
   if(!fixtureRows.philosophy_contributions.some(r=>r.user_id===userId))fixtureRows.philosophy_contributions.push({id:demoId('response'),club_id:club.id,user_id:userId,display_name:userProfile.display_name,identity_values:[],identity_note:'',formats_enabled:{t20:true,limited_overs:true,long_form:true},selected_dimensions:[],dimension_notes:{},format_weights:{},updated_at:fixtureNow(),submitted_at:null});return ok(true);
 }
 case 'reuse_my_workshop_response':{
   const prior=demoArchives.find(a=>a.archive_id===args.p_archive_id&&a.user_id===userId);if(!prior)return fail('No saved response for this contributor.');
   fixtureRows.philosophy_contributions=fixtureRows.philosophy_contributions.filter(r=>r.user_id!==userId);fixtureRows.philosophy_contributions.push({...fixtureClone(prior),id:demoId('response'),submitted_at:null,updated_at:fixtureNow()});
   const c=fixtureRows.philosophy_contributors.find(c=>c.user_id===userId);if(c)c.status='in_progress';return ok(true);
 }
 case 'submit_my_philosophy_response':{
   const c=fixtureRows.philosophy_contributors.find(c=>c.user_id===userId),r=fixtureRows.philosophy_contributions.find(r=>r.user_id===userId);if(c&&r){c.status='submitted';c.submitted_at=r.submitted_at=fixtureNow();}return ok(true);
 }
 case 'save_how_we_bat_draft':howWeBatDraft={...howWeBatDraft,club_id:club.id,identity_statement:args.p_identity_statement,closing_strapline:args.p_closing_strapline,formats:fixtureClone(args.p_formats),status:args.p_status,updated_at:fixtureNow()};return ok(true);
 case 'publish_philosophy':{
   const version=(philosophyVersions.at(-1)?.version_number||0)+1;philosophyVersions.push({club_id:club.id,version_number:version,published_at:fixtureNow()});howWeBatVersions.push({club_id:club.id,philosophy_version:version,snapshot:fixtureClone(howWeBatDraft)});playerPlanStructureVersions.push({club_id:club.id,philosophy_version:version,snapshot:fixtureClone(playerPlanStructureDraft.structure)});workshop.status='published';return ok(version);
 }
 case 'setup_my_club_identity':{
   const m=fixtureRows.club_memberships.find(m=>m.user_id===userId);Object.assign(m,{involvement:args.p_involvement});fixtureRows.user_profiles.find(p=>p.user_id===userId).display_name=args.p_display_name;
   let player=fixtureRows.players.find(p=>p.user_id===userId);const playing=['player','both'].includes(args.p_involvement);
   if(!player&&playing){player={id:demoId('player'),club_id:club.id,user_id:userId};fixtureRows.players.push(player);fixtureRows.feedback[player.id]=demoEmptyFeedback();}if(player)Object.assign(player,{active:playing,display_name:args.p_display_name});return ok(true);
 }
 case 'save_club_person_access':{
   const m=fixtureRows.club_memberships.find(m=>m.user_id===args.p_user_id);m.permission_role=args.p_role==='none'?'player':args.p_role;
   fixtureRows.club_access_grants=fixtureRows.club_access_grants.filter(g=>g.user_id!==m.user_id);
   if(args.p_access!=='pending')for(const group of args.p_access.startsWith('groups')?args.p_group_ids:[null])fixtureRows.club_access_grants.push({club_id:club.id,user_id:m.user_id,scope:group?'playing_group':'whole_club',playing_group_id:group,can_view:true,can_edit:args.p_access.endsWith('edit')});return ok(true);
 }
 case 'create_playing_group':fixtureGroups.push({id:demoId('group'),club_id:club.id,name:args.p_name,active:true,sort_order:fixtureGroups.length});return ok(true);
 case 'rename_playing_group':fixtureGroups.find(g=>g.id===args.p_group_id).name=args.p_name;return ok(true);
 case 'set_playing_group_active':fixtureGroups.find(g=>g.id===args.p_group_id).active=args.p_active;if(!args.p_active)fixtureRows.player_plan_requirements.filter(r=>r.playing_group_id===args.p_group_id).forEach(r=>r.active=false);return ok(true);
 case 'move_playing_group':{const i=fixtureGroups.findIndex(g=>g.id===args.p_group_id),j=i+(args.p_direction==='up'?-1:1);if(j>=0&&j<fixtureGroups.length)[fixtureGroups[i],fixtureGroups[j]]=[fixtureGroups[j],fixtureGroups[i]];fixtureGroups.forEach((g,i)=>g.sort_order=i);return ok(true);}
 case 'assign_players_to_playing_group':for(const player_id of args.p_player_ids)if(!fixtureRows.player_playing_groups.some(m=>m.player_id===player_id&&m.playing_group_id===args.p_group_id))fixtureRows.player_playing_groups.push({club_id:club.id,player_id,playing_group_id:args.p_group_id});return ok(args.p_player_ids.length);
 case 'remove_player_from_playing_group':fixtureRows.player_playing_groups=fixtureRows.player_playing_groups.filter(m=>!(m.player_id===args.p_player_id&&m.playing_group_id===args.p_group_id));return ok(true);
 case 'set_group_plan_due_date':for(const gid of args.p_playing_group_ids){const prior=fixtureRows.player_plan_requirements.find(r=>r.playing_group_id===gid&&r.format_key===args.p_format_key);if(prior)Object.assign(prior,{active:true,due_date:args.p_due_date});else fixtureRows.player_plan_requirements.push({id:demoId('requirement'),club_id:club.id,playing_group_id:gid,target_type:'playing_group',format_key:args.p_format_key,due_date:args.p_due_date,active:true});}return ok(true);
 case 'deactivate_plan_requirement':fixtureRows.player_plan_requirements.find(r=>r.id===args.p_requirement_id).active=false;return ok(true);
 case 'save_coach_observation':{
   if(demoReceipts.has(args.p_request_id))return ok(demoReceipts.get(args.p_request_id));
   const f=fixtureRows.feedback[args.p_player_id],v=fixtureClone(args.p_values),kind=args.p_kind;let note,match;
   if(!f||!demoPlayerAccess(args.p_player_id).edit)return fail('Edit access to this player is required.');
   if(kind==='match'){
     try{match=demoSharedMatch(args.p_player_id,v,v.match_id);}catch(error){return fail(error.message);}
     if(match?.participation_status==='did_not_bat'&&v.plan_related!==false)return fail('This innings is recorded as Did not bat. Only a general note can be added.');
     if(!match){match={id:demoId('match'),created_by:userId,created_at:fixtureNow(),coach_feedback:[],player_reflection:null};f.matches.unshift(match);}
     const identity=match.match_date?{match_date:match.match_date,format_key:match.format_key,opposition:match.opposition,innings_number:match.innings_number||1}:null;
     const protectSharedDetails=!!identity&&(match.created_by!==userId||!v.match_id);
     const previousScore=match.score_text||'';
     Object.assign(match,{match_date:v.match_date,format_key:v.format_key,opposition:v.opposition,innings_number:v.innings_number||1,participation_status:match.participation_status||'played',score_text:protectSharedDetails?match.score_text||'':v.score_text??match.score_text??'',dismissal_summary:protectSharedDetails?match.dismissal_summary||'':v.dismissal_summary??match.dismissal_summary??'',updated_at:fixtureNow()});if(identity)Object.assign(match,identity);if(match.score_text!==previousScore)match.score_recorded_by=String(match.score_text||'').trim()?userId:null;
     note=match.coach_feedback.find(n=>args.p_observation_id?n.id===args.p_observation_id:n.author_user_id===userId);
     if(v.batting_to_plan==='no_plan')Object.assign(v,{plan_related:false,completion_requested:true,dismissal_classification:null});
   }else note=f.training_observations.find(n=>n.id===args.p_observation_id);
   if(note&&(note.author_user_id||note.observer_user_id)!==userId)return fail('Only the author can edit this observation.');
   if(!note){note={id:demoId(kind),created_at:fixtureNow(),author_user_id:userId,author_name:userProfile.display_name,observer_user_id:userId,observer_name:userProfile.display_name};(kind==='match'?match.coach_feedback:f.training_observations).push(note);}
   Object.assign(note,v,{updated_at:fixtureNow(),...(kind==='match'?{innings_note:String(v.dismissal_summary??'').trim()}:{})});
   let action=f.coaching_actions.find(a=>kind==='match'?a.match_feedback_id===note.id:a.training_observation_id===note.id);
   if(!action){action=demoAction(args.p_player_id,kind,note,args.p_review_on,match);f.coaching_actions.push(action);}
   else {action.revision++;action.updated_at=fixtureNow();if(action.status==='open')Object.assign(action,{review_on:args.p_review_on||null,task:v.next_training_focus||'',follow_up_requested:!!(v.next_training_focus||v.needs_conversation||args.p_review_on)});}
   if('video_url' in v)action.video=v.video_url?{url:normaliseCoachingYouTubeUrl(v.video_url),note:v.video_note||''}:null;
   const data={observation_id:note.id,match_id:match?.id,action_id:action.id};demoReceipts.set(args.p_request_id,data);return ok(data);
 }
 case 'review_coaching_action':{
   const action=Object.values(fixtureRows.feedback).flatMap(f=>f.coaching_actions).find(a=>a.id===args.p_action_id);if(!action)return fail('Example conversation not found.');
   if(!demoConversationAccess(action)||!demoConversationView(action).can_review)return fail('No access to update this conversation.');
   const cleanNote=String(args.p_note||'').trim();
   if(!['continue','completed','stopped'].includes(args.p_outcome))return fail('Choose a valid review outcome.');
   if(cleanNote.length>1000||(args.p_outcome==='continue'&&!cleanNote))return fail('Add a short note before saving.');
   if(args.p_outcome!=='continue'&&args.p_review_on)return fail('Only an open conversation can have a new review date.');
   const prior=action.reviews.find(r=>r.request_id===args.p_request_id);
   if(prior){
     if(prior.reviewed_by!==userId||prior.outcome!==args.p_outcome||prior.note!==cleanNote||(prior.next_review_on||null)!==(args.p_review_on||null))return fail('This request was already used for another review.');
     return ok({action_id:action.id,already_saved:true,revision:action.revision});
   }
   if(action.revision!==args.p_expected_revision)return fail('Reopen the conversation to see its latest version.');
   if(action.status!=='open')return fail('This conversation is already closed.');
   if(args.p_outcome==='continue'&&args.p_review_on&&args.p_review_on!==action.review_on&&args.p_review_on<todayIso())return fail('Choose a review date from today onwards.');
   if(action.is_player_request&&action.preferred_user_id===userId&&args.p_outcome==='continue')action.request_state='accepted';
   Object.assign(action,{status:args.p_outcome==='continue'?'open':args.p_outcome,review_on:args.p_outcome==='continue'?args.p_review_on||null:action.review_on,updated_at:fixtureNow(),revision:action.revision+1});
   action.reviews.unshift({id:demoId('review'),request_id:args.p_request_id,outcome:args.p_outcome,note:cleanNote,next_review_on:args.p_review_on||null,reviewed_by:userId,reviewed_by_name:userProfile.display_name,reviewed_at:fixtureNow(),revision:action.revision});return ok({action_id:action.id,already_saved:false,revision:action.revision});
 }
 case 'save_coaching_conversation':{
   const f=fixtureRows.feedback[args.p_player_id];let a=f.coaching_actions.find(a=>a.signal_key===args.p_signal_key);
   if(!a){a={...demoAction(args.p_player_id,'conversation',{id:demoId('note'),author_user_id:userId,author_name:userProfile.display_name,needs_conversation:true},args.p_review_on),signal_key:args.p_signal_key,source_at:args.p_source_at};f.coaching_actions.push(a);}
   Object.assign(a,{task:args.p_task||'',review_on:args.p_review_on||null,outcome:args.p_outcome,status:args.p_outcome==='no_action'?'completed':'open',revision:a.revision+1});
   a.reviews.unshift({id:demoId('discussion'),outcome:args.p_outcome,note:args.p_task||'Discussed',reviewed_by_name:userProfile.display_name,reviewed_at:fixtureNow(),revision:a.revision});
   f.discussions.push({id:demoId('discussion'),signal_key:args.p_signal_key,source_at:args.p_source_at,outcome:args.p_outcome,note:args.p_task||'',action_id:a.id,discussed_at:fixtureNow()});return ok({action_id:a.id});
 }
 default:return demoBaseRpc(name,args);
 }
};

loadContext=async()=>{membership=fixtureClone(fixtureRows.club_memberships.find(m=>m.user_id===session.user.id));userProfile=fixtureClone(fixtureRows.user_profiles.find(p=>p.user_id===session.user.id));await loadData();currentTab='dashboard';renderShell();await window.__demoRenderDone;};

const demoFocusThemes=new Set(['decision','execution','strike_rotation','scoring','pressure','preparation','other']);

function demoFocusStore(playerId){return fixtureRows.weekly_loop?.[playerId]||{revision:0,rows:[],history:[],receipts:{}};}

function demoFocusOwner(playerId){return fixtureRows.players.some(p=>p.id===playerId&&p.active!==false&&p.user_id===session.user.id);}

function demoFocusSourceVisible(playerId,kind,id){
  if(kind!=='conversation'||!demoFocusOwner(playerId))return true;
  const f=fixtureRows.feedback[playerId],a=f?.coaching_actions.find(a=>a.id===id);
  if(!a)return false;
  const match=f.matches.find(m=>m.coach_feedback.some(n=>n.id===a.match_feedback_id));
  const note=match?.coach_feedback.find(n=>n.id===a.match_feedback_id);
  return !note||note.plan_related===false||!!match.player_reflection;
}

function demoFocusVisible(playerId,row){
  return demoFocusSourceVisible(playerId,row.source_kind,row.source_id)&&
    (row.context_kind!=='conversation'||demoFocusSourceVisible(playerId,'conversation',row.context_id));
}

function demoFocusCandidates(playerId){
  const rows=[],raw=fixtureRows.player_plan_workflows.find(w=>w.player_id===playerId)?.raw_answers||{};
  for(const [section,answers] of [['core',raw.core||{}],...Object.entries(raw.formats||{})]){
    for(const [key,answer] of Object.entries(answers)){
      const question=playerPlanQuestionsFor(section).find(q=>q.id===key);
      const focus=String(answer?.comment||answer?.choices?.join('; ')||'').trim();if(!focus)continue;
      rows.push({source_kind:'plan',source_id:null,source_key:section+':'+key,focus_text:focus.slice(0,240),label:question?.label||question?.title||question?.question||key,format_key:section==='core'?null:section,theme_key:'other',source_snapshot:{section,question_id:key,label:'Player Plan · '+(section==='core'?'Core':formatLabel(section))+' · '+(question?.label||question?.title||question?.question||key),question:question?.label||question?.title||question?.question||key,answer:fixtureClone(answer)}});
    }
  }
  const feedback=fixtureRows.feedback[playerId]||demoEmptyFeedback();
  for(const m of feedback.matches){const r=m.player_reflection;if(r?.next_training_focus?.trim())rows.push({source_kind:'reflection',source_id:m.id,source_key:null,focus_text:r.next_training_focus.slice(0,240),label:`My innings: ${m.opposition||m.match_date}`,format_key:m.format_key,theme_key:'other',source_snapshot:{match_id:m.id,match_date:m.match_date,opposition:m.opposition,reflection:fixtureClone(r)}});}
  for(const a of feedback.coaching_actions){if(a.status==='open'&&a.task?.trim()&&demoFocusSourceVisible(playerId,'conversation',a.id))rows.push({source_kind:'conversation',source_id:a.id,source_key:null,focus_text:a.task.slice(0,240),label:'Coach Conversation',format_key:a.format_key,theme_key:'other',source_snapshot:{action_id:a.id,task:a.task,revision:a.revision}});}
  return rows;
}

function demoFocusView(playerId){
  if(!demoPlayerAccess(playerId).view)throw Error('You do not have access to this player’s current focus.');
  const s=demoFocusStore(playerId),owner=demoFocusOwner(playerId),editable=demoPlayerAccess(playerId).edit;
  const visible=s.rows.filter(r=>demoFocusVisible(playerId,r));
  return {player_id:playerId,revision:s.revision,is_owner:owner,can_propose:editable&&!owner,can_review:owner||editable,
    active:visible.filter(r=>r.status==='active'),proposals:visible.filter(r=>r.status==='proposed'),
    history:s.history.filter(r=>(r.context_kind!=='conversation'||demoFocusSourceVisible(playerId,'conversation',r.context_id))&&(!r.new_focus_id||visible.some(f=>f.id===r.new_focus_id))),
    candidates:demoFocusCandidates(playerId)};
}

function demoSeedWeeklyLoop(){
  fixtureRows.weekly_loop=Object.fromEntries(fixtureRows.players.map(p=>[p.id,{revision:0,rows:[],history:[],receipts:{}}]));
  for(const [playerId,text] of [['player-alex','Read the ball, trust my scoring options and reset after dots.'],['player-jordan','Read the ball before choosing the sweep; keep a single available.']]){
    const candidate=demoFocusCandidates(playerId).find(c=>c.source_key==='core:core_reset');
    const player=fixtureRows.players.find(p=>p.id===playerId),at=fixtureNow();
    const row={id:'focus-'+playerId,...candidate,focus_text:text,theme_key:'decision',status:'active',replace_focus_id:null,context_kind:null,context_id:null,chosen_by:player.user_id,chosen_by_name:player.display_name,accepted_by:player.user_id,accepted_by_name:player.display_name,created_at:at,updated_at:at};
    fixtureRows.weekly_loop[playerId]={revision:1,rows:[row],history:[],receipts:{}};
  }
  const s=fixtureRows.weekly_loop['player-alex'];
  const a=fixtureRows.feedback['player-alex'].coaching_actions.find(a=>a.match_feedback_id==='alex-pull-coach');
  s.rows.push({id:'focus-alex-suggestion',source_kind:'conversation',source_id:a.id,source_key:null,source_snapshot:{action_id:a.id,task:a.task,revision:a.revision},focus_text:'Keep backing the pull on the right length. Practise contact and direction.',theme_key:'execution',status:'proposed',replace_focus_id:s.rows[0].id,context_kind:'conversation',context_id:a.id,chosen_by:'user-coach',chosen_by_name:'Casey Reid',accepted_by:null,accepted_by_name:null,created_at:fixtureNow(),updated_at:fixtureNow()});
  s.history.push({id:'focus-alex-first-review',decision:'keep',note:'The shot was in my plan and I committed. Keep practising contact and direction.',context_kind:'innings',context_id:'alex-pull',focus_id:s.rows[0].id,focus_text:s.rows[0].focus_text,new_focus_id:null,action_id:null,recorded_by:'user-alex',recorded_by_name:'Alex Morgan',actor_name:'Alex Morgan',created_at:fixtureNow()});
  s.revision=2;
}

function demoFocusContext(playerId,values){
  const feedback=fixtureRows.feedback[playerId]||demoEmptyFeedback();
  if(values.context_kind==='innings'){
    const m=feedback.matches.find(m=>m.id===values.context_id);
    if(!m?.player_reflection)throw Error('Save the player’s independent innings reflection before reviewing the current focus.');
    return m;
  }
  if(values.context_kind==='conversation'){
    const a=feedback.coaching_actions.find(a=>a.id===values.context_id);
    if(!a||!demoFocusSourceVisible(playerId,'conversation',a.id))throw Error('That conversation is not available for a focus review.');
    return a;
  }
  throw Error('Open an innings or Coach Conversation to review your focus.');
}

function demoSaveFocus(args){
  const playerId=args.p_player_id,view=demoFocusView(playerId),userId=session.user.id,owner=view.is_owner;
  if(!view.can_review)throw Error('Your access is read-only.');
  const original=demoFocusStore(playerId),values=args.p_values||{},fingerprint=JSON.stringify({userId,playerId,revision:args.p_expected_revision,values});
  const receipt=original.receipts[args.p_request_id];
  if(receipt){if(receipt.fingerprint!==fingerprint)throw Error('This save request was already used for different changes.');return {...receipt.result,already_saved:true};}
  if(!args.p_request_id)throw Error('A save request is required.');
  if(args.p_expected_revision!==original.revision)throw Error('The current focus has changed. Reload before saving.');
  const next=fixtureClone(original),now=fixtureNow(),actions=fixtureRows.feedback[playerId].coaching_actions;
  const find=id=>next.rows.find(r=>r.id===id&&demoFocusVisible(playerId,r));
  let focusId=null,actionId=null,newAction=null;
  const create=(replacementId=null)=>{
    const c=demoFocusCandidates(playerId).find(c=>c.source_kind===values.source_kind&&(values.source_kind==='plan'?c.source_key===values.source_key:c.source_id===values.source_id));
    if(!c)throw Error('Choose an available plan answer, reflection or coaching conversation.');
    const text=String(values.focus_text||'').trim();
    if(!text||text.length>240)throw Error('Keep your current focus between 1 and 240 characters.');
    if(!demoFocusThemes.has(values.theme_key))throw Error('Choose a focus theme.');
    const replace=replacementId?find(replacementId):null;
    if(replacementId&&replace?.status!=='active')throw Error('That focus has changed. Reload and choose again.');
    if(owner&&!replace&&next.rows.filter(r=>r.status==='active').length>=2)throw Error('Keep at most two current focuses. Choose one to replace first.');
    const row={id:demoId('focus'),...fixtureClone(c),focus_text:text,theme_key:values.theme_key,status:owner?'active':'proposed',replace_focus_id:replacementId,context_kind:values.context_kind||null,context_id:values.context_id||null,chosen_by:userId,chosen_by_name:userProfile.display_name,accepted_by:owner?userId:null,accepted_by_name:owner?userProfile.display_name:null,created_at:now,updated_at:now};
    if(owner&&replace)Object.assign(replace,{status:'replaced',updated_at:now});next.rows.push(row);focusId=row.id;return row;
  };
  if(['choose','propose'].includes(values.op)){
    if(values.context_kind)demoFocusContext(playerId,values);
    create(values.replace_focus_id||null);
  }else if(['accept','decline','retire'].includes(values.op)){
    if(!owner)throw Error('Only the player can accept, decline or retire their current focus.');
    const row=find(values.focus_id);if(!row)throw Error('That focus is not available.');focusId=row.id;
    if(values.op==='accept'){
      if(row.status!=='proposed')throw Error('That suggestion has already changed.');
      const replace=row.replace_focus_id?find(row.replace_focus_id):null;
      if(row.replace_focus_id&&replace?.status!=='active')throw Error('The focus being replaced has changed. Reload and reconsider this suggestion.');
      if(!replace&&next.rows.filter(r=>r.status==='active').length>=2)throw Error('Keep at most two current focuses. Retire one before accepting.');
      if(replace)Object.assign(replace,{status:'replaced',updated_at:now});Object.assign(row,{status:'active',accepted_by:userId,accepted_by_name:userProfile.display_name,updated_at:now});
    }else{
      if(row.status!==(values.op==='decline'?'proposed':'active'))throw Error('That focus has already changed.');
      Object.assign(row,{status:values.op==='decline'?'declined':'retired',updated_at:now});
    }
  }else if(values.op==='review'){
    const context=demoFocusContext(playerId,values),focus=values.focus_id?find(values.focus_id):null;
    if(values.focus_id&&focus?.status!=='active')throw Error('That focus has changed. Reload before reviewing.');
    if(!['keep','adjust','discuss'].includes(values.decision))throw Error('Choose keep working, adjust the focus or discuss it.');
    if(values.decision==='adjust')create(values.replace_focus_id||values.focus_id||null);
    if(values.decision==='discuss'){
      const open=values.context_kind==='conversation'&&context.status==='open'?context:actions.find(a=>a.status==='open'&&(values.context_kind==='innings'?(context.coach_feedback.some(n=>n.id===a.match_feedback_id)||a.signal_key==='weekly_focus:innings:'+context.id):a.signal_key==='weekly_focus:conversation:'+context.id));
      if(open)actionId=open.id;
      else{
        newAction={...demoAction(playerId,'request',{id:demoId('focus-review'),author_user_id:userId,author_name:userProfile.display_name,needs_conversation:true},null),is_player_request:true,preferred_user_id:null,request_state:'team',outcome:'conversation',signal_key:'weekly_focus:'+values.context_kind+':'+context.id,task:values.note?.trim()||'Please discuss my current batting focus.',video:null,reviews:[]};
        actionId=newAction.id;
      }
    }
    next.history.unshift({id:demoId('focus-review'),decision:values.decision,note:values.note||'',context_kind:values.context_kind,context_id:values.context_id,focus_id:focus?.id||null,focus_text:focus?.focus_text||null,new_focus_id:focusId,new_focus_text:next.rows.find(r=>r.id===focusId)?.focus_text||null,action_id:actionId,recorded_by:userId,recorded_by_name:userProfile.display_name,actor_name:userProfile.display_name,created_at:now});
    focusId=focusId||focus?.id||null;
  }else throw Error('Choose a valid focus action.');
  next.revision++;
  const result={player_id:playerId,revision:next.revision,focus_id:focusId,action_id:actionId,already_saved:false};
  next.receipts[args.p_request_id]={fingerprint,result};fixtureRows.weekly_loop[playerId]=next;
  if(newAction)actions.push(newAction);
  return result;
}

const demoPreLoopRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
  const ok=data=>({data:fixtureClone(data),error:null});
  try{
    if(name==='get_player_current_focus')return ok(demoFocusView(args.p_player_id));
    if(name==='save_player_focus')return ok(demoSaveFocus(args));
    if(name==='get_training_preparation'){
      if(args.p_club_id!==club.id||club.archived_at||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===session?.user?.id&&(['admin','head_coach','coach','captain'].includes(m.permission_role)||demoTemporaryBattingCaptain())))throw Error('Training preparation is available to authorised club staff.');
      return ok({groups:fixtureGroups.filter(g=>g.active).map(g=>({id:g.id,name:g.name})),players:fixtureWorkspacePlayers().filter(p=>fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===p.user_id)).map(p=>({player_id:p.id,display_name:p.display_name,group_ids:p.groups.map(g=>g.id),groups:p.groups.map(g=>({id:g.id,name:g.name})),focuses:demoFocusView(p.id).active,match_training_focus:demoPlayerMatchTrainingFocus(p.id).preparations,can_write:p.can_edit,conversations:(fixtureRows.feedback[p.id]?.coaching_actions||[]).filter(a=>a.status==='open'&&a.follow_up_requested&&demoFocusSourceVisible(p.id,'conversation',a.id)).map(a=>({id:a.id,task:a.task,source_kind:a.match_feedback_id?'match':a.training_observation_id?'training':'conversation',review_on:a.review_on,status:a.status,player_id:p.id}))}))});
    }
    return demoPreLoopRpc(name,args);
  }catch(error){return {data:null,error:{message:error.message}};}
};

const demoMatchPreparationUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const demoMatchPreparationTags=new Set(['quick_pickup','strong_arm','accurate_throw','safe_hands','quick_across_ground']);

function demoMatchPreparationOwner(clubId){
  const userId=session?.user?.id;
  const member=fixtureRows.club_memberships.find(m=>m.club_id===clubId&&m.user_id===userId);
  const player=fixtureRows.players.find(p=>p.club_id===clubId&&p.user_id===userId&&p.active!==false);
  if(clubId!==club.id||club.archived_at||!member||!player)throw Error('An active player registration in this club is required.');
  return player;
}

function demoPlayerMatchTrainingFocus(playerId){
  const player=fixtureRows.players.find(p=>p.id===playerId&&p.club_id===club.id&&p.active!==false),userId=session?.user?.id;
  const member=id=>fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===id);
  if(!userId||club.archived_at||!player||!member(userId)||!member(player.user_id)||!demoPlayerAccess(playerId).view)throw Error('You do not have access to this player’s match training focus.');
  const preparations=(fixtureRows.match_preparations||[]).filter(p=>p.player_id===playerId&&p.club_id===club.id&&p.status==='planned').map(p=>({
    id:p.id,status:p.status,match_date:p.match_date,format_key:p.format_key,opposition:p.opposition,
    preparation:{matchups:(p.preparation?.matchups||[]).filter(m=>m.training_focus===true&&String(m.bowler||'').trim()&&['expect','options','avoid'].some(key=>String(m[key]||'').trim())).map(m=>({
      id:m.id,bowler:m.bowler,expect:m.expect,options:m.options,avoid:m.avoid,training_focus:true,extra_shots:(m.extra_shots||[]).filter(shot=>String(m.options||'').split(/[\r\n]+/).some(line=>line.trim().replace(/\s+/g,' ').toLocaleLowerCase()===shot.trim().replace(/\s+/g,' ').toLocaleLowerCase()))
    }))}
  })).filter(p=>p.preparation.matchups.length);
  return {player_id:playerId,preparations};
}

function demoMatchPreparationText(value,max,label){
  if(value!==undefined&&value!==null&&typeof value!=='string')throw Error(label+' must be text.');
  const text=String(value??'').trim();if(text.length>max)throw Error(label+' is too long.');return text;
}

function demoMatchPreparationData(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Check the preparation details.');
  const rows=(key,max)=>{const list=value[key]??[];if(!Array.isArray(list)||list.length>max)throw Error('Use at most '+max+' '+key+'.');return list;};
  const ids=new Set(),id=row=>{if(!row||!demoMatchPreparationUuid.test(row.id)||ids.has(row.id))throw Error('Each preparation item needs its own valid ID.');ids.add(row.id);return row.id;};
  const matchups=rows('matchups',8).map(row=>{
    const result={id:id(row),bowler:demoMatchPreparationText(row.bowler,100,'Bowler'),expect:demoMatchPreparationText(row.expect,200,'What to expect'),options:demoMatchPreparationText(row.options,240,'Scoring options'),avoid:demoMatchPreparationText(row.avoid,200,'Watch out for')};
    if(Object.prototype.hasOwnProperty.call(row,'training_focus')){
      if(typeof row.training_focus!=='boolean')throw Error('Choose whether this match-up is a training focus.');
      result.training_focus=row.training_focus;
    }
    if(Object.prototype.hasOwnProperty.call(row,'extra_shots')){
      const extra=row.extra_shots;
      if(!Array.isArray(extra)||extra.length>8||extra.some(shot=>typeof shot!=='string'||!shot.trim()||shot.length>80||/[\r\n]/.test(shot)))throw Error('Use up to eight short, single-line scoring shot names.');
      const normalized=extra.map(shot=>shot.trim().replace(/\s+/g,' ').toLocaleLowerCase());
      if(new Set(normalized).size!==normalized.length)throw Error('Each additional scoring shot must be different.');
      result.extra_shots=[...extra];
    }
    if(Object.prototype.hasOwnProperty.call(row,'extra_shot_notes')){
      const notes=row.extra_shot_notes;if(!Array.isArray(notes)||notes.length>8)throw Error('Use up to eight optional shot reasons.');
      const seen=new Set();result.extra_shot_notes=notes.map(note=>{
        if(!note||typeof note.shot!=='string'||typeof note.reason!=='string')throw Error('Check each scoring shot reason.');
        const key=scoringShotKey(note.shot);if(!key||seen.has(key)||!(result.extra_shots||[]).some(shot=>scoringShotKey(shot)===key))throw Error('Each reason must match one additional scoring shot.');
        seen.add(key);return {shot:note.shot.trim(),reason:demoMatchPreparationText(note.reason,300,'Shot reason')};
      });
    }
    if(result.training_focus===true&&!result.expect&&!result.options&&!result.avoid)throw Error('Add what to expect, a scoring option or what to avoid before making this a training focus.');
    return result;
  });
  if(matchups.some(row=>!row.bowler))throw Error('Add a name or description for each bowler.');
  const fielders=rows('fielders',8).map(row=>{
    const result={id:id(row),name:demoMatchPreparationText(row.name,100,'Fielder'),tags:row.tags??[],note:demoMatchPreparationText(row.note,200,'Fielder note')};
    if(!result.name||!Array.isArray(result.tags)||result.tags.some(tag=>!demoMatchPreparationTags.has(tag)))throw Error('Check the fielder and selected tags.');
    result.tags=[...new Set(result.tags)];return result;
  });
  return {matchups,fielders,focus_note:demoMatchPreparationText(value.focus_note,240,'Current focus')};
}

function demoMatchPreparationReview(value,preparation){
  if(!value||typeof value!=='object'||!Array.isArray(value.matchups)||value.matchups.length>8)throw Error('Check the match-up reflection.');
  const ids=new Set();return {matchups:value.matchups.map(row=>{
    if(!preparation.matchups.some(m=>m.id===row.id)||ids.has(row.id)||![null,'used','adapted','away','not_faced'].includes(row.decision??null))throw Error('Check the match-up reflection.');
    ids.add(row.id);return {id:row.id,decision:row.decision??null,note:row.decision==='not_faced'?'':demoMatchPreparationText(row.note,300,'Match-up note')};
  })};
}

function demoMatchPreparationContest(value,previous,locked){
  const contest=value??previous??{bowler:'',result:null};
  if(!contest||typeof contest!=='object'||Array.isArray(contest))throw Error('Check the personal contest.');
  const bowler=demoMatchPreparationText(contest.bowler,100,'Personal contest bowler'),result=contest.result??null;
  if(![null,'yes','no','not_faced'].includes(result)||(!bowler&&result))throw Error('Check the personal contest result.');
  if(locked&&bowler!==previous?.bowler)throw Error('Original match preparation stays unchanged after an innings is recorded.');
  return {bowler,result};
}

function demoSeedMatchPreparations(){
  if(fixtureRows.match_preparation_seeded)return;
  fixtureRows.match_preparation_seeded=true;
  fixtureRows.match_preparations??=[];
  const now=fixtureNow(),base={player_id:'player-alex',club_id:club.id,revision:1,created_at:now,updated_at:now};
  fixtureRows.match_preparations.push({...base,id:'9ad7c44e-01fd-4e65-8d55-28c39d705ea1',match_id:null,status:'planned',match_date:fixtureDay(3),format_key:'limited_overs',opposition:'Riverside Example CC',locked_at:null,
    preparation:{focus_note:'Read the ball, trust my scoring options.',matchups:[
      {id:'9ad7c44e-01fd-4e65-8d55-28c39d705eb1',bowler:'Robin — opening bowler',expect:'Right-arm seam; moves it away.',options:'Straight drive when full; controlled pull when short.',avoid:'Reaching for a drive outside off.',training_focus:true},
      {id:'9ad7c44e-01fd-4e65-8d55-28c39d705eb2',bowler:'Jamie — left-arm spin',expect:'Floats it up; changes pace.',options:'Use the single to long-on; use my feet to the right length.',avoid:'Deciding on the big shot before reading the ball.',training_focus:false}],
      fielders:[{id:'9ad7c44e-01fd-4e65-8d55-28c39d705ec1',name:'Drew at cover',tags:['quick_pickup','strong_arm'],note:'Be clear on the single.'}]},review:{matchups:[]},personal_contest:{bowler:'Robin',result:null}});
  fixtureRows.match_preparations.push({...base,id:'9ad7c44e-01fd-4e65-8d55-28c39d705ea2',match_id:'alex-quick',status:'played',match_date:fixtureDay(-1),format_key:'t20',opposition:'Bay Example CC',locked_at:now,
    preparation:{focus_note:'Keep a single available when my boundary ball is not there.',matchups:[{id:'9ad7c44e-01fd-4e65-8d55-28c39d705eb3',bowler:'Morgan — off-spin',expect:'Flat and straight with cover back.',options:'Push to long-on for one; punish the short ball.',avoid:'Forcing a lofted shot after dot balls.',training_focus:true}],fielders:[]},
    review:{matchups:[{id:'9ad7c44e-01fd-4e65-8d55-28c39d705eb3',decision:'adapted',note:'They brought long-on up, so I used the gap at cover.'}]},personal_contest:{bowler:'Morgan',result:'no'}});
}

function demoPreparationConversation(record){
  const action=(fixtureRows.feedback[record.player_id]?.coaching_actions||[]).find(a=>a.id===record.coaching_action_id);
  return {...record,coaching_action_id:action?.id||null,coaching_action_status:action?.status||null};
}

function demoFlaggedPreparationShots(record,version=1){
  if(!record.preparation.matchups.some(m=>(m.extra_shots||[]).filter(shot=>preparationShotSelected(m.options,shot)).length>=(version===2?1:2)))return [];
  const {snapshot,formats}=preparationScoringCatalogue();
  const raw=fixtureRows.player_plan_workflows.find(w=>w.player_id===record.player_id)?.raw_answers||{},known=new Set(),dimensions=new Set(['scoring_areas','strike_rotation','boundary_access']);
  for(const section of ['core',...formats]){
    const questions=section==='core'?snapshot.core:snapshot.formats[section],answers=section==='core'?raw.core:raw.formats?.[section];
    for(const question of questions){
      if(!question||question.active===false||question.response_type==='text'||(section==='core'?question.id!=='core_strengths':!dimensions.has(question.source_dimension)))continue;
      for(const choice of Array.isArray(answers?.[question.id]?.choices)?answers[question.id].choices:[])if(typeof choice==='string'&&choice.trim()&&!/[\r\n]/.test(choice))known.add(scoringShotKey(choice));
    }
  }
  return record.preparation.matchups.map(m=>({bowler:m.bowler,training_focus:m.training_focus===true,shots:(m.extra_shots||[]).filter(shot=>preparationShotSelected(m.options,shot)&&!known.has(scoringShotKey(shot))).map(shot=>({shot,reason:(m.extra_shot_notes||[]).find(note=>scoringShotKey(note.shot)===scoringShotKey(shot))?.reason||''}))})).filter(m=>m.shots.length>=(version===2?1:2));
}

function demoPreparationReviewSummary(record,matchups){
  const names=new Set(matchups.flatMap(m=>m.shots.map(s=>scoringShotKey(s.shot)))),untrained=new Set(matchups.filter(m=>!m.training_focus).flatMap(m=>m.shots.map(s=>scoringShotKey(s.shot))));
  return {kind:'outside_plan_shots',shot_count:names.size,no_training_count:untrained.size,match_date:record.match_date,format_key:record.format_key,opposition:record.opposition,matchups};
}

function demoPreparationReviewSignature(review){
  if(!review)return null;
  return JSON.stringify([review.match_date,review.format_key,scoringShotKey(review.opposition),review.matchups.map(m=>[scoringShotKey(m.bowler),m.training_focus,m.shots.map(s=>[scoringShotKey(s.shot),scoringShotKey(s.reason)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

function demoPreparationCoachingAction(record,userId,version=1,previousRecord=null){
  const existing=(fixtureRows.feedback[record.player_id]?.coaching_actions||[]).find(a=>a.id===record.coaching_action_id);
  if(existing&&version!==2)return {action:existing,created:false,updated:false,reopened:false};
  const flagged=demoFlaggedPreparationShots(record,version);if(!flagged.length&&!existing)return {action:null,created:false,updated:false,reopened:false};
  const player=fixtureRows.players.find(p=>p.id===record.player_id),review=demoPreparationReviewSummary(record,flagged),signature=demoPreparationReviewSignature(review);
  if(existing){const prior=existing.preparation_review||(previousRecord?demoPreparationReviewSummary(previousRecord,demoFlaggedPreparationShots(previousRecord,2)):null);if(demoPreparationReviewSignature(prior)===signature){existing.preparation_review=review;return {action:existing,created:false,updated:false,reopened:false};}}
  const now=new Date(Math.max(Date.now(),(Date.parse(existing?.updated_at)||0)+1)).toISOString(),reopened=!!existing&&flagged.length>0&&existing.status!=='open';
  const task=!flagged.length?'No outside-plan shots remain in the latest saved preparation. Review this conversation before marking it Actioned or Discussed.':`Preparation snapshot: ${record.match_date} · ${record.opposition||'Opposition not recorded'} · ${formatLabel(record.format_key)}. Selected shots outside my saved Player Plan: discuss trusted options or practice.`;
  const note=flagged.length?flagged.map(m=>`${m.bowler}${version===2?' · '+(m.training_focus?'Selected for training':'Not selected for training'):''}: ${m.shots.map(s=>s.shot+(version===2&&s.reason?' — '+s.reason:'')).join('; ')}.`).join(' '):'The latest preparation has no selected outside-plan shots. This does not close the conversation automatically.';
  const history={id:demoId('review'),outcome:'continue',note,...(version===2?{preparation_review:fixtureClone(review)}:{}),reviewed_by:userId,reviewed_by_name:player?.display_name,reviewed_at:now,revision:(existing?.revision||0)+1};
  if(existing){Object.assign(existing,{status:flagged.length?'open':existing.status,follow_up_requested:flagged.length?true:existing.follow_up_requested,format_key:record.format_key,task,preparation_review:review,revision:existing.revision+1,updated_at:now,...(reopened?{review_on:null}:{})});existing.reviews.unshift(history);return {action:existing,created:false,updated:true,reopened};}
  const action={...demoAction(record.player_id,'request',{id:record.id,author_user_id:userId,author_name:player?.display_name,needs_conversation:true},null),
    signal_key:'preparation_shots:'+record.id,source_at:now,format_key:record.format_key,outcome:'conversation',task,
    is_player_request:true,preferred_user_id:null,request_state:'team',video:null,reviews:[history],...(version===2?{preparation_review:review}:{})};
  fixtureRows.feedback[record.player_id].coaching_actions.push(action);record.coaching_action_id=action.id;
  return {action,created:true,updated:false,reopened:false};
}

const demoPreMatchPreparationRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
  if(!['get_my_match_preparations','save_my_match_preparation','get_player_match_training_focus'].includes(name))return demoPreMatchPreparationRpc(name,args);
  const ok=data=>({data:fixtureClone(data),error:null});
  try{
    if(name==='get_player_match_training_focus')return ok(demoPlayerMatchTrainingFocus(args.p_player_id));
    const player=demoMatchPreparationOwner(args.p_club_id),userId=session.user.id;
    const all=fixtureRows.match_preparations??=[];
    if(name==='get_my_match_preparations')return ok({player_id:player.id,preparations:all.filter(p=>p.player_id===player.id&&p.club_id===club.id).map(p=>({...demoPreparationConversation(p),innings_number:p.innings_number||1,...demoPreparationResolution(p)}))});
    if(!demoMatchPreparationUuid.test(args.p_request_id))throw Error('A valid save request is required.');
    const v=args.p_values;
    if(!v||!['prepare','played','did_not_bat','cancelled','link'].includes(v.action))throw Error('Choose a valid preparation action.');
    const key=userId+':'+args.p_request_id,receipts=fixtureRows.match_preparation_receipts??={};
    const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
    const fingerprint=JSON.stringify(canonical(args));
    if(receipts[key]){
      if(receipts[key].fingerprint!==fingerprint)throw Error('This save request was already used for different changes.');
      return ok({...receipts[key].result,already_saved:true});
    }
    const existing=args.p_preparation_id?all.find(p=>p.id===args.p_preparation_id&&p.player_id===player.id&&p.club_id===club.id):null;
    if(args.p_preparation_id&&!existing)throw Error('That preparation is not attached to your account.');
    if(existing&&existing.revision!==args.p_expected_revision)throw Error('This preparation has changed. Reload before editing.');
    if(!existing&&args.p_expected_revision!==null&&args.p_expected_revision!==undefined)throw Error('New preparation must not have a revision.');
    if(v.action==='link'){
      if(!existing)throw Error('Save the preparation before linking an innings.');
      if(Object.keys(v).some(key=>!['action','match_id'].includes(key)))throw Error('Linking an innings does not change preparation or reflection.');
      if(existing.match_id&&existing.match_id!==v.match_id)throw Error('This preparation is already linked to an innings.');
      const match=fixtureRows.feedback[player.id]?.matches.find(m=>m.id===v.match_id);
      if(!match)throw Error('That innings is not attached to your account.');
      if(all.some(p=>p.id!==existing.id&&p.match_id===match.id))throw Error('That innings already has preparation attached.');
      if(match.match_date!==existing.match_date||match.format_key!==existing.format_key||(match.innings_number||1)!==(existing.innings_number||1))throw Error('Choose a recorded innings with the same date, format and innings number.');
      const official=fixtureRows.make_your_call?.entries.find(e=>e.preparation_id===existing.id)?.result;
      if(official?.status==='played'&&(match.participation_status||'played')!=='played')throw Error('The official club result records a played innings.');
      if(official?.status==='played'&&match.score_text!==String(official.runs)+(official.not_out?'*':''))throw Error('The official club result controls this innings score.');
      if(official?.status==='did_not_bat'&&(match.participation_status!=='did_not_bat'||String(match.score_text||'').trim()))throw Error('The official club result records DNB.');
      if(official?.status==='cancelled')throw Error('The official club result records a cancelled match.');
      existing.match_id=match.id;existing.locked_at??=fixtureNow();existing.revision++;existing.updated_at=fixtureNow();
      const result={preparation_id:existing.id,match_id:match.id,revision:existing.revision,status:existing.status,already_saved:false};
      receipts[key]={fingerprint,result};return ok(result);
    }
    const nextInningsNumber=v.innings_number??existing?.innings_number??1;
    if(!Number.isInteger(nextInningsNumber)||nextInningsNumber<1||nextInningsNumber>10)throw Error('Choose an innings number from 1 to 10.');
    if(existing&&nextInningsNumber!==(existing.innings_number||1)&&(existing.match_id||existing.call_entry))throw Error('The published or linked innings number is locked.');
    const existingResolution=existing?demoPreparationResolution(existing,nextInningsNumber):null;
    if((existing?.locked_at||existingResolution?.resolved_match_id||existingResolution?.resolution_ambiguous)&&v.action!=='played')throw Error('Original match preparation stays unchanged after an innings is recorded.');
    if(!existing&&v.action==='played')throw Error('Save the preparation before recording this innings.');
    if('auto_coaching_review' in v&&(typeof v.auto_coaching_review!=='boolean'||v.action!=='prepare'))throw Error('Automatic coaching review is available only when saving upcoming preparation.');
    if('coaching_review_version' in v&&(v.coaching_review_version!==2||v.auto_coaching_review!==true||v.action!=='prepare'))throw Error('Choose a valid coaching review version.');
    const next=existing?fixtureClone(existing):{id:crypto.randomUUID(),player_id:player.id,club_id:club.id,match_id:null,revision:0,created_at:fixtureNow(),locked_at:null,review:{matchups:[]},personal_contest:{bowler:'',result:null}};
    if(v.action!=='played'){
      if(['review','innings','match_id','expected_updated_at','expected_reflection_at'].some(k=>k in v))throw Error('Record an innings before adding a match-up review.');
      const date=v.match_date??next.match_date,format=v.format_key??next.format_key;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!['t20','limited_overs','long_form'].includes(format))throw Error('Choose a date and format.');
      const contest=demoMatchPreparationContest(v.personal_contest,next.personal_contest,false);
      if(contest.result!==null)throw Error('Add the personal contest result after the innings.');
      Object.assign(next,{match_date:date,format_key:format,innings_number:v.innings_number??next.innings_number??1,opposition:demoMatchPreparationText(v.opposition??next.opposition,160,'Opposition'),preparation:demoMatchPreparationData(v.preparation??next.preparation),status:v.action==='prepare'?'planned':v.action,review:{matchups:[]},personal_contest:contest});
    }else {
      if(['match_date','format_key','opposition','preparation'].some(k=>k in v))throw Error('Original match preparation stays unchanged after an innings is recorded.');
      next.innings_number=nextInningsNumber;
      if(v.innings&&!existing.match_id&&(v.innings.match_date!==existing.match_date||v.innings.format_key!==existing.format_key))throw Error('Use this preparation’s match date and format.');
      if(v.innings&&Object.hasOwn(v.innings,'innings_number')&&v.innings.innings_number!==nextInningsNumber)throw Error('Use this preparation’s innings number.');
      next.review=v.review===undefined?next.review:demoMatchPreparationReview(v.review,next.preparation);
      next.personal_contest=demoMatchPreparationContest(v.personal_contest,next.personal_contest,true);
      if(!v.match_id&&!next.match_id&&existingResolution?.resolution_ambiguous)throw Error('More than one preparation or innings matches. Choose the existing innings.');
      const matchId=v.match_id??next.match_id??existingResolution?.resolved_match_id;
      if(next.match_id&&matchId!==next.match_id)throw Error('This preparation is already linked to an innings.');
      if(matchId&&all.some(p=>p.id!==next.id&&p.match_id===matchId))throw Error('That innings already has preparation attached.');
      if(matchId&&!fixtureRows.feedback[player.id]?.matches.some(m=>m.id===matchId))throw Error('That innings is not attached to your account.');
      const chosenMatch=matchId?fixtureRows.feedback[player.id].matches.find(m=>m.id===matchId):null;
      if(chosenMatch&&!existing.match_id&&(chosenMatch.match_date!==existing.match_date||chosenMatch.format_key!==existing.format_key||(chosenMatch.innings_number||1)!==nextInningsNumber))throw Error('Choose an innings with the same date, format and innings number.');
      if(!v.innings&&!existing?.match_id)throw Error('Add the innings details before recording this match.');
      if(matchId)next.match_id=matchId;
      if(v.innings){
        const feedbackSnapshot=fixtureClone(fixtureRows.feedback[player.id]),receiptSnapshot=new Map(demoReceipts);
        try{
          const official=fixtureRows.make_your_call?.entries.find(e=>e.preparation_id===next.id)?.result,match=fixtureRows.feedback[player.id].matches.find(m=>m.id===matchId);
          const actualValues=match?{...v.innings,match_date:match.match_date,format_key:match.format_key,opposition:match.opposition,innings_number:match.innings_number||1}:{...v.innings,innings_number:nextInningsNumber};
          if(official&&(actualValues.match_date!==next.match_date||actualValues.format_key!==next.format_key||(actualValues.innings_number||1)!==(next.innings_number||1)))throw Error('Use the published match date, format and innings number for this entered innings.');
          if(match&&official?.status==='played')match.score_text=String(official.runs)+(official.not_out?'*':'');
          const autoResolved=match&&!v.match_id&&!existing?.match_id;
          const result=await demoPreMatchPreparationRpc('save_my_innings',{p_club_id:club.id,p_match_id:matchId||null,p_expected_updated_at:autoResolved?match.updated_at:v.expected_updated_at??null,p_expected_reflection_at:autoResolved?match.player_reflection?.updated_at||null:v.expected_reflection_at??null,p_request_id:crypto.randomUUID(),p_values:actualValues});
          if(result.error)throw Error(result.error.message);next.match_id=result.data.match_id;
        }catch(error){fixtureRows.feedback[player.id]=feedbackSnapshot;demoReceipts=receiptSnapshot;throw error;}
      }
      next.status='played';next.locked_at??=fixtureNow();
    }
    if(v.action==='prepare'){
      for(const matchup of next.preparation.matchups){
        const supplied=(v.preparation?.matchups||[]).find(m=>m.id===matchup.id);
        if(supplied&&!Object.prototype.hasOwnProperty.call(supplied,'extra_shot_notes')){
          const previous=existing?.preparation?.matchups?.find(m=>m.id===matchup.id);
          if(previous?.extra_shot_notes)matchup.extra_shot_notes=fixtureClone(previous.extra_shot_notes.filter(note=>(matchup.extra_shots||[]).some(shot=>scoringShotKey(shot)===scoringShotKey(note.shot))));
        }
      }
      const missing=demoFlaggedPreparationShots(next,2).flatMap(m=>m.shots).find(shot=>!preparationReasonHasText(shot.reason));
      if(missing){const error=Error('Add a reason for choosing "'+missing.shot+'" outside your saved Player Plan before saving preparation.');error.code='P0001';error.details=JSON.stringify({code:'required_outside_shot_reason',shot:missing.shot});throw error;}
    }
    const coaching=v.auto_coaching_review===true?demoPreparationCoachingAction(next,userId,v.coaching_review_version===2?2:1,existing):{action:(fixtureRows.feedback[player.id]?.coaching_actions||[]).find(a=>a.id===next.coaching_action_id)||null,created:false};
    next.revision++;next.updated_at=fixtureNow();
    const index=all.findIndex(p=>p.id===next.id);if(index<0)all.push(next);else all[index]=next;
    const result={preparation_id:next.id,match_id:next.match_id,revision:next.revision,status:next.status,already_saved:false,coaching_action_id:coaching.action?.id||null,coaching_action_status:coaching.action?.status||null,coaching_action_created:coaching.created,coaching_action_updated:!!coaching.updated,coaching_action_reopened:!!coaching.reopened};
    receipts[key]={fingerprint,result};return ok(result);
  }catch(error){return {data:null,error:{message:error.message,...(error.code?{code:error.code}:{}),...(error.details?{details:error.details}:{})}};}
};

function demoCallNow(){return fixtureRows.call_clock||fixtureNow();}

function demoCallDay(offset=0){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:fixtureRows.make_your_call?.settings?.timezone||'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(demoCallNow()));
  const part=name=>parts.find(p=>p.type===name).value,date=new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);
}

const DEMO_CALL_AWARD_KEYS=['weekly_points','weekly_accuracy','engagement','believer','nasty'];

const DEMO_CALL_ALL_AWARD_KEYS=[...DEMO_CALL_AWARD_KEYS,'season_points','season_accuracy','season_beats','grinch'];

function demoAwardEnabled(key,s=fixtureRows.make_your_call.settings){return key==='grinch'?s.grinch_enabled===true:DEMO_CALL_ALL_AWARD_KEYS.includes(key)&&s.award_enabled?.[key]!==false;}

function demoCallDateAdd(date,days){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

function demoCallWeek(date=demoCallDay()){
 const schedules=fixtureRows.make_your_call?.schedules||[{effective:'0001-01-01',day:1}],active=[...schedules].reverse().find(s=>s.effective<=date)||schedules[0],next=schedules.find(s=>s.effective>date&&s.extended_week&&date>=s.previous_end);
 if(next)return next.extended_week;
 const d=new Date(date+'T12:00:00Z');return demoCallDateAdd(date,-((d.getUTCDay()-active.day+7)%7));
}

function demoCallWeekEnd(week){const next=fixtureRows.make_your_call?.schedules?.find(s=>s.extended_week===week);return next?.effective||demoCallDateAdd(week,7);}

function demoCallMonth(date=demoCallDay()){const anchor=fixtureRows.make_your_call?.settings.award_cycle_start||demoCallWeek();const days=Math.floor((Date.parse(date+'T12:00:00Z')-Date.parse(anchor+'T12:00:00Z'))/86400000);return demoCallDateAdd(anchor,Math.floor(days/28)*28);}

function demoCallMonthEnd(month){return demoCallDateAdd(month,28);}

function demoCallAwardSelection(date){const legacy=(fixtureRows.make_your_call.award_periods||[]).find(p=>p.cadence==='monthly'&&p.period_end!==demoCallMonthEnd(p.period_start)&&date>=p.period_start&&date<p.period_end);return legacy?.period_start||demoCallMonth(date);}

function demoCallAwardPeriod(key,date,cadence=null){
 const state=fixtureRows.make_your_call,today=demoCallDay(),period=(state.award_periods||[]).filter(p=>p.key===key&&date>=p.period_start&&date<p.period_end&&(!cadence||p.cadence===cadence)).sort((a,b)=>Number(b.period_end<=today)-Number(a.period_end<=today)||(a.period_end<=today&&b.period_end<=today?a.period_end.localeCompare(b.period_end):0)||b.period_start.localeCompare(a.period_start))[0];
 if(period)return fixtureClone(period);const c=cadence||state.settings.award_cadence?.[key]||'weekly',start=c==='monthly'?demoCallMonth(date):demoCallWeek(date);
 return {key,cadence:c,period_start:start,period_end:c==='monthly'?demoCallMonthEnd(start):demoCallWeekEnd(start),reward_text:state.settings.rewards[key]||'',claim_text:state.settings.rewards[key+'_claim']||''};
}

function demoCallAwardSettings(week){const state=fixtureRows.make_your_call,closed=demoCallWeekEnd(week)<=demoCallDay(),rewards=fixtureClone(closed&&state.rounds[week]?state.rounds[week]:state.settings.rewards),cadence={};for(const key of DEMO_CALL_AWARD_KEYS){const p=demoCallAwardPeriod(key,week);rewards[key]=p.reward_text;cadence[key]=p.cadence;rewards[key+'_claim']=p.claim_text;}return {rewards,cadence};}

function demoCallPeriodIncludes(award,week){if(week<award.period_start||week>=award.period_end)return false;return !(fixtureRows.make_your_call.award_periods||[]).some(old=>old.key===award.key&&old.cadence!==award.cadence&&week>=old.period_start&&week<old.period_end&&old.period_end<=demoCallDay()&&(old.period_end<award.period_end||old.period_end===award.period_end&&old.period_start>award.period_start));}

function demoCallEngagementWeeks(playerId,start,end,award=null){const store=demoEngagementStore(playerId);if(award?.cadence==='monthly'&&(!fixtureRows.make_your_call.settings.award_cycle_start||start<fixtureRows.make_your_call.settings.award_cycle_start))return [];return [...new Set(store.credits.filter(c=>c.week_start>=start&&c.week_start<end&&(!award||demoCallPeriodIncludes(award,c.week_start))).map(c=>c.week_start))].filter(week=>new Set(store.credits.filter(c=>c.week_start===week).map(c=>c.category)).size>=2);}

function demoCallEngagementAward(playerId,week=demoCallWeek(),month=demoCallMonth()){
 let award=demoCallAwardPeriod('engagement',demoCallDay());if(award.cadence==='monthly')award=demoCallAwardPeriod('engagement',month,'monthly');const weeks=demoCallEngagementWeeks(playerId,award.period_start,award.period_end,award);return {...award,qualifying_weeks:weeks.length,required_weeks:award.cadence==='monthly'?2:1,earned:weeks.length>=(award.cadence==='monthly'?2:1)};
}

function demoCallSeason(date=demoCallDay()){return Number(date.slice(0,4))-(Number(date.slice(5,7))<(fixtureRows.make_your_call?.settings.season_start_month||7)?1:0);}

function demoCallMember(){
  if(club?.archived_at||!session?.user?.id||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===session.user.id))throw Error('Club membership is required.');
  return fixtureRows.club_memberships.find(m=>m.club_id===club.id&&m.user_id===session.user.id);
}

function demoEngagementStore(playerId){
  fixtureRows.engagement??={};return fixtureRows.engagement[playerId]??={shared:false,sharing_revision:0,credits:[],checkins:[],receipts:{}};
}

function demoEngagementCredit(playerId,category,sourceId,week=demoCallWeek(),createdAt=null){
  const store=demoEngagementStore(playerId);
  if(!store.credits.some(c=>c.category===category&&c.source_id===sourceId))store.credits.push({category,source_id:sourceId,week_start:week,created_at:createdAt||(week===demoCallWeek()?demoCallNow():week+'T12:00:00Z')});
}

function demoEngagementCandidates(playerId){
  const focuses=demoFocusStore(playerId).rows.filter(f=>f.status==='active').map(f=>({kind:'focus',id:f.id,key:null,text:f.focus_text}));
  const answers=demoFocusCandidates(playerId).filter(c=>c.source_kind==='plan').map(c=>({kind:'plan',id:null,key:c.source_key,text:c.focus_text}));
  return [...focuses,...answers];
}

function demoEngagementBundle(playerId){
  const store=demoEngagementStore(playerId),week=demoCallWeek(),categories=[...new Set(store.credits.filter(c=>c.week_start===week).map(c=>c.category))];
  const history=[...new Set(store.credits.map(c=>c.week_start))].sort().reverse().map(week_start=>{const count=new Set(store.credits.filter(c=>c.week_start===week_start).map(c=>c.category)).size;return {week_start,count,earned:count>=2};});
  return {player_id:playerId,configured:!!fixtureRows.make_your_call?.settings.enabled,week_start:week,timezone:'Australia/Sydney',season:demoCallSeason(),automatic_inclusion:true,shared:true,sharing_revision:store.sharing_revision,categories,count:categories.length,earned:categories.length>=2,season_awards:history.filter(w=>w.earned&&demoCallSeason(w.week_start)===demoCallSeason()).length,reward_text:demoCallAwardSettings(week).rewards.engagement||'',claim_text:demoCallAwardSettings(week).rewards.engagement_claim||'',award:demoCallEngagementAward(playerId,week),history,training_checkin:store.checkins.find(c=>c.week_start===week)||null,candidates:demoEngagementCandidates(playerId)};
}

function demoEngagementBoard(week=demoCallWeek()){
  return {week_start:week,awards:fixtureRows.players.filter(p=>p.active!==false).flatMap(p=>{
    const bundle=demoEngagementBundle(p.id),award=bundle.history.find(w=>w.week_start===week&&w.earned);return award?[{player_id:p.id,name:p.display_name,week_start:week,season_awards:bundle.season_awards}]:[];
  }),reward_text:demoCallAwardSettings(week).rewards.engagement||'',claim_text:demoCallAwardSettings(week).rewards.engagement_claim||''};
}

const demoPreEngagementRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
  const ok=data=>({data:fixtureClone(data),error:null});
  try{
    if(['get_my_engagement','save_my_training_checkin','set_my_engagement_sharing'].includes(name)){
      const player=demoMatchPreparationOwner(args.p_club_id),store=demoEngagementStore(player.id);
      if(name==='get_my_engagement')return ok(demoEngagementBundle(player.id));
      if(!demoMatchPreparationUuid.test(args.p_request_id))throw Error('A valid save request is required.');
      const fingerprint=JSON.stringify({name,args}),receipt=store.receipts[args.p_request_id];
      if(receipt){if(receipt.fingerprint!==fingerprint)throw Error('This request was already used for different changes.');return ok(receipt.result);}
      if(name==='set_my_engagement_sharing'){
        throw Error('Engagement counts automatically for all players. Refresh the app to remove the old sharing switch.');
      }else{
        const values=args.p_values||{},week=demoCallWeek(),prior=store.checkins.find(c=>c.week_start===week);
        if(args.p_expected_revision!==(prior?.revision||0))throw Error('This training check-in has changed. Reload and try again.');
        const candidate=demoEngagementCandidates(player.id).find(c=>c.kind===values.source_kind&&(c.kind==='focus'?c.id===values.source_id:c.key===values.source_key));
        if(!candidate)throw Error('Choose one of your current focuses or saved plan answers.');
        if(!['worked','changed','couldnt'].includes(values.status)||!['keep','adjust','discuss'].includes(values.next_step))throw Error('Choose a training check-in and next step.');
        const note=String(values.note||'').trim();if(note.length>300)throw Error('Keep the note to 300 characters.');
        const record={id:prior?.id||demoId('training-checkin'),week_start:week,revision:(prior?.revision||0)+1,source_kind:candidate.kind,source_id:candidate.id,source_key:candidate.key,source_text:candidate.text,status:values.status,next_step:values.next_step,note,created_at:prior?.created_at||demoCallNow(),updated_at:demoCallNow()};
        if(prior)Object.assign(prior,record);else store.checkins.push(record);
        demoEngagementCredit(player.id,'training',record.id);
      }
      const result=demoEngagementBundle(player.id);store.receipts[args.p_request_id]={fingerprint,result};return ok(result);
    }
    const result=await demoPreEngagementRpc(name,args);
    if(!result.error&&name==='save_my_match_preparation'&&args.p_values?.action==='prepare'&&!result.data?.already_saved){
      const prep=fixtureRows.match_preparations.find(p=>p.id===result.data.preparation_id);
      if(prep&&prep.match_date>demoCallDay()&&prep.match_date<=demoCallDay(14)){const raw=fixtureRows.player_plan_workflows.find(w=>w.player_id===prep.player_id)?.raw_answers||{},groups=preparationScoringChoices(preparationPlanCandidatesForRaw(raw),prep.format_key),known=[...groups.core,...groups.format,...groups.other].map(row=>row.label);if(prep.preparation.matchups.some(m=>m.bowler?.trim()&&(known.some(shot=>preparationShotSelected(m.options,shot))||(m.extra_shot_notes||[]).some(note=>preparationShotSelected(m.options,note.shot)&&preparationReasonHasText(note.reason)))))demoEngagementCredit(prep.player_id,'prepare',prep.id);}
    }
    if(!result.error&&name==='save_player_focus'&&args.p_values?.op==='review'&&args.p_values.context_kind==='innings'&&myPlayer?.id===args.p_player_id&&!result.data?.already_saved){const match=fixtureRows.feedback[args.p_player_id]?.matches.find(m=>m.id===args.p_values.context_id);if(match?.player_reflection&&match.match_date>=demoCallDay(-14)&&match.match_date<=demoCallDay())demoEngagementCredit(args.p_player_id,'review',args.p_values.context_id);}
    return result;
  }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
};

function demoCallMidnight(date){
  const zone=fixtureRows.make_your_call?.settings.timezone||'Australia/Sydney';let guess=Date.parse(date+'T00:00:00Z');
  for(let i=0;i<3;i++){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
    const p=k=>parts.find(v=>v.type===k).value,local=Date.parse(`${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}Z`);
    guess+=Date.parse(date+'T00:00:00Z')-local;
  }
  return new Date(guess).toISOString();
}

function demoCallMedian(numbers){const sorted=[...numbers].sort((a,b)=>a-b),n=sorted.length;return n?Math.ceil(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2):null;}

function demoCallFormatWeight(format){return {t20:1.5,limited_overs:1.2,long_form:1.0}[format]??1.0;}

function demoCallCanRecord(entry){
  const member=demoCallMember();return member.permission_role==='admin'||(fixtureRows.make_your_call.grants.includes(member.user_id)&&['captain','coach','head_coach'].includes(member.permission_role)&&demoPlayerAccess(entry.player_id).edit);
}

function demoCallNasty(votes,closed,result){
  // A low vote is notable only against at least three OTHER estimates.
  // The same recognition rule as the server; this never deducts points.
  const candidates=votes.flatMap(v=>{const others=votes.filter(o=>o.user_id!==v.user_id);if(others.length<3)return [];const rest=demoCallMedian(others.map(o=>o.runs)),gap=rest-v.runs;return gap>=Math.max(15,Math.ceil(rest/2))?[{user_id:v.user_id,name:v.name,runs:v.runs,rest_call:rest,gap}]:[];});
  return {nasty_candidates:candidates,nasty_calls:closed&&result.status==='played'?candidates.filter(v=>result.runs>=v.rest_call):[]};
}

function demoCallEntryView(entry){
  const state=fixtureRows.make_your_call,player=fixtureRows.players.find(p=>p.id===entry.player_id),votes=entry.votes.map(v=>({...v,name:fixtureRows.user_profiles.find(p=>p.user_id===v.user_id)?.display_name||'Club member'}));
  const clubCall=votes.length>=3?demoCallMedian(votes.map(v=>v.runs)):null,closed=new Date(demoCallNow())>=new Date(entry.cutoff_at),eligible=closed&&entry.result.status==='played'&&clubCall!==null,rawSurplus=eligible?Math.max(entry.result.runs-clubCall,0):0,formatWeight=demoCallFormatWeight(entry.format_key),nasty=demoCallNasty(votes,closed,entry.result);
  return {id:entry.id,player_id:entry.player_id,name:player?.display_name||'Club player',preparation_id:player?.user_id===session.user.id?entry.preparation_id:null,predicted_runs:entry.predicted_runs,match_date:entry.match_date,format_key:entry.format_key,opposition:entry.opposition,timezone:entry.timezone||'Australia/Sydney',cutoff_at:entry.cutoff_at,voting_open:state.settings.enabled&&!closed,own:player?.user_id===session.user.id,my_vote:votes.find(v=>v.user_id===session.user.id)||null,votes,vote_count:votes.length,club_call:clubCall,result:fixtureClone(entry.result),can_record_result:demoCallCanRecord(entry),points:Math.round(rawSurplus*formatWeight),raw_surplus:rawSurplus,format_weight:formatWeight,beat_club:eligible&&entry.result.runs>clubCall,wildest_calls:eligible?votes.map(v=>({...v,error:Math.abs(v.runs-entry.result.runs)})):[],...nasty,believers:eligible?votes.flatMap(v=>{const rest=demoCallMedian(votes.filter(o=>o.user_id!==v.user_id).map(o=>o.runs));return v.runs>rest&&entry.result.runs>=v.runs?[{...v,rest_call:rest,gap:v.runs-rest}]:[];}):[],revision:entry.revision};
}

function demoCallRound(week,{seed=false}={}){
 const state=fixtureRows.make_your_call;state.rounds[week]??=fixtureClone(state.settings.rewards);state.round_cadence??={};state.round_cadence[week]??=fixtureClone(state.settings.award_cadence||{});state.award_periods??=[];
 if(!seed&&demoCallWeekEnd(week)<=demoCallDay())return state.rounds[week];
 for(const key of DEMO_CALL_AWARD_KEYS.filter(k=>demoAwardEnabled(k))){const cadence=state.settings.award_cadence[key]||'weekly',start=cadence==='monthly'?demoCallMonth(week):week,end=cadence==='monthly'?demoCallMonthEnd(start):demoCallWeekEnd(week);if(!state.award_periods.some(p=>p.key===key&&p.cadence===cadence&&p.period_start===start))state.award_periods.push({key,cadence,period_start:start,period_end:end,reward_text:state.settings.rewards[key]||'',claim_text:state.settings.rewards[key+'_claim']||''});if(cadence==='monthly'&&end<demoCallWeekEnd(week)&&!state.award_periods.some(p=>p.key===key&&p.cadence===cadence&&p.period_start===end))state.award_periods.push({key,cadence,period_start:end,period_end:demoCallMonthEnd(end),reward_text:state.settings.rewards[key]||'',claim_text:state.settings.rewards[key+'_claim']||''});}
 return state.rounds[week];
}

function demoCallGrinch(entries,season,enabled){if(!enabled)return [];const totals=new Map();for(const e of entries){if(demoResultSeason(e)!==season||new Date(demoCallNow())<new Date(e.cutoff_at)||e.result.status!=='played'||e.votes.length<4)continue;const qualified=new Set(demoCallNasty(e.votes,true,e.result).nasty_calls.map(v=>v.user_id));for(const v of e.votes){const t=totals.get(v.user_id)||{user_id:v.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===v.user_id)?.display_name||'Club member',low_calls:0,comparable_calls:0,weekSet:new Set()};t.comparable_calls++;if(qualified.has(v.user_id)){t.low_calls++;t.weekSet.add(demoResultWeek(e));}totals.set(v.user_id,t);}}return [...totals.values()].filter(t=>t.low_calls>=3&&t.weekSet.size>=2&&t.low_calls*2>=t.comparable_calls).map(({weekSet,...t})=>({...t,weeks:weekSet.size})).sort((a,b)=>b.low_calls-a.low_calls||a.name.localeCompare(b.name));}

function demoCallAccuracy(entries,{week=null,season=null,month=null}={}){
  const totals=new Map(),now=new Date(demoCallNow());
  for(const entry of entries){
    if((week!==null&&demoResultWeek(entry)!==week)||(month!==null&&(demoResultDate(entry)<month||demoResultDate(entry)>=demoCallMonthEnd(month)))||(season!==null&&demoResultSeason(entry)!==season)||now<new Date(entry.cutoff_at)||entry.result?.status!=='played'||!Number.isInteger(entry.result.runs)||entry.result.runs<0)continue;
    const owner=fixtureRows.players.find(p=>p.id===entry.player_id)?.user_id;
    for(const vote of entry.votes||[]){
      if(vote.user_id===owner)continue;
      const row=totals.get(vote.user_id)||{user_id:vote.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===vote.user_id)?.display_name||'Club member',total_error:0,predictions:0,weekSet:new Set()};
      row.total_error+=Math.abs(vote.runs-entry.result.runs);row.predictions++;row.weekSet.add(demoResultWeek(entry));totals.set(vote.user_id,row);
    }
  }
  const rows=[...totals.values()].map(({weekSet,...row})=>({...row,weeks:weekSet.size,average_error:Math.round(row.total_error/row.predictions*100)/100,eligible:month!==null?row.predictions>=6&&weekSet.size>=2:week!==null?row.predictions>=3:row.predictions>=10&&weekSet.size>=3,is_leader:false}));
  const qualified=rows.filter(row=>row.eligible).sort((a,b)=>a.total_error*b.predictions-b.total_error*a.predictions),leader=qualified[0];
  for(const row of rows)row.is_leader=!!leader&&row.eligible&&row.total_error*leader.predictions===leader.total_error*row.predictions;
  return rows.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.total_error*b.predictions-b.total_error*a.predictions||a.name.localeCompare(b.name)||a.user_id.localeCompare(b.user_id));
}

function demoCallPeriodAwards(week,month){
 const state=fixtureRows.make_your_call,config=demoCallAwardSettings(week);
 return DEMO_CALL_AWARD_KEYS.filter(key=>demoAwardEnabled(key)).map(key=>{
  const cadence=config.cadence[key]||'weekly',period=demoCallAwardPeriod(key,cadence==='monthly'?month:week,cadence),{period_start,period_end}=period,entries=state.entries.filter(e=>(cadence!=='monthly'||(state.settings.award_cycle_start&&period_start>=state.settings.award_cycle_start))&&demoCallPeriodIncludes(period,cadence==='monthly'?demoResultDate(e):demoResultWeek(e))),views=entries.map(demoCallEntryView),award={...period,winners:[],accuracy_rows:[]};
  if(key==='weekly_accuracy'){award.accuracy_rows=demoCallAccuracy(entries,cadence==='monthly'?{month}:{week});award.winners=award.accuracy_rows.filter(r=>r.eligible&&r.is_leader).map(r=>({name:r.name,detail:r.average_error.toFixed(2)+' runs away on average · '+r.predictions+' predictions'}));}
  else if(key==='engagement'){award.winners=fixtureRows.players.filter(p=>p.active!==false).flatMap(p=>{const weeks=demoCallEngagementWeeks(p.id,period_start,period_end,award);return weeks.length>=(cadence==='monthly'?2:1)?[{name:p.display_name,detail:weeks.length+' qualifying '+(weeks.length===1?'week':'weeks')}]:[];});}
  else{
   const eligible=views.filter(c=>c.result.status==='played'&&c.club_call!==null&&!c.voting_open);
   if(key==='weekly_points'){const best=Math.max(0,...eligible.map(c=>c.points));award.winners=eligible.filter(c=>best>0&&c.points===best).map(c=>({name:c.name,format_key:c.format_key,raw_surplus:c.raw_surplus,format_weight:c.format_weight,detail:best+' points · '+c.raw_surplus+' runs above club prediction × '+c.format_weight.toFixed(1)+' · '+c.opposition}));}
   else{const field=key==='wildest'?'wildest_calls':key==='nasty'?'nasty_calls':'believers',metric=key==='wildest'?'error':'gap',rows=eligible.flatMap(c=>c[field].map(v=>({...v,player_name:c.name}))),best=Math.max(0,...rows.map(r=>r[metric]));award.winners=rows.filter(r=>best>0&&r[metric]===best).map(r=>({name:r.name,detail:key==='wildest'?r.runs+' for '+r.player_name+' · '+r.error+' away':key==='nasty'?r.runs+' for '+r.player_name+' · '+r.gap+' below the others; the batter proved them wrong':r.runs+' for '+r.player_name+' · '+r.gap+' above the others'}));}
  }
  return award;
 });
}

function demoCallBoard(args){
  demoCallMember();demoSeedMakeYourCall();const state=fixtureRows.make_your_call,selectionDate=args.p_week_start||demoCallDay(),week=demoCallWeek(selectionDate),month=demoCallAwardSelection(args.p_month_start||selectionDate),season=args.p_season??demoCallSeason(),admin=membership.permission_role==='admin';
  const views=state.entries.map(demoCallEntryView),seasonRows=fixtureRows.players.flatMap(p=>{
    const entries=state.entries.filter(e=>e.player_id===p.id&&demoResultSeason(e)===season),rows=views.filter(e=>entries.some(o=>o.id===e.id));if(!entries.length)return [];
    return [{player_id:p.id,name:p.display_name,points:rows.reduce((sum,r)=>sum+r.points,0),beat_count:rows.filter(r=>r.beat_club).length,innings:rows.filter(r=>r.result.status==='played'&&r.club_call!==null&&!r.voting_open).length,entries:entries.length}];
  });
  return {settings:fixtureClone(state.settings),can_manage:admin,server_now:demoCallNow(),selection_date:selectionDate,week_start:week,week_end:demoCallWeekEnd(week),month_start:month,period_awards:demoCallPeriodAwards(week,month),season,weeks:[...new Set([demoCallWeek(),...state.entries.map(e=>e.week_start),...state.messages.map(m=>m.week_start)])].sort().reverse(),rewards:demoCallAwardSettings(week).rewards,calls:views.filter(v=>state.entries.find(e=>e.id===v.id).week_start===week),season_rows:seasonRows,accuracy_week_rows:demoCallAccuracy(state.entries,{week}),accuracy_season_rows:demoCallAccuracy(state.entries,{season}),grinch_rows:demoCallGrinch(state.entries,season,state.settings.grinch_enabled),messages:state.messages.filter(m=>state.settings.conversation_enabled===true&&m.week_start===week&&!m.deleted).map(m=>({id:m.id,user_id:m.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name||'Club member',body:m.body,created_at:m.created_at,can_delete:admin||m.user_id===session.user.id,reported:state.reports.some(r=>r.message_id===m.id&&r.reporter_id===session.user.id)})),members:allowed?fixtureRows.club_memberships.map(m=>({user_id:m.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name,permission_role:m.permission_role,can_record_results:m.permission_role==='admin'||state.grants.includes(m.user_id)})):[],reports:admin&&state.settings.conversation_enabled===true?state.reports.map(r=>({...r,reporter_name:fixtureRows.user_profiles.find(p=>p.user_id===r.reporter_id)?.display_name||'Club member'})):[],engagement:demoEngagementBoard(week)};
}

function demoSeedMakeYourCall(){
  const state=fixtureRows.make_your_call;if(state.seeded)return;state.seeded=true;demoSeedMatchPreparations();
  const make=(playerId,date,format,prediction,runs,votes,status='played')=>{
    const preparationId=crypto.randomUUID(),entryId=crypto.randomUUID(),matchId=status==='played'?demoId('call-match'):null,player=fixtureRows.players.find(p=>p.id===playerId);
    const record={id:preparationId,player_id:playerId,club_id:club.id,revision:1,match_id:matchId,status:status==='pending'?'planned':status,match_date:date,format_key:format,opposition:'Lakes Example CC',preparation:{matchups:[],fielders:[],focus_note:''},review:{matchups:[]},personal_contest:{bowler:'',result:null},predicted_runs:prediction,call_entry:{id:entryId,predicted_runs:prediction,cutoff_at:demoCallMidnight(date)},created_at:demoCallNow(),updated_at:demoCallNow(),locked_at:status==='played'?demoCallNow():null};
    fixtureRows.match_preparations.push(record);
    if(matchId)fixtureRows.feedback[playerId].matches.unshift({id:matchId,match_date:date,format_key:format,opposition:record.opposition,score_text:String(runs),player_note:'Fictional innings for the club prediction example.',dismissal_summary:'Fictional innings for the club prediction example.',player_video:null,player_reflection:null,coach_feedback:[],created_by:player.user_id,created_at:demoCallNow(),updated_at:demoCallNow()});
    const entry={id:entryId,player_id:playerId,preparation_id:preparationId,predicted_runs:prediction,match_date:date,format_key:format,opposition:record.opposition,cutoff_at:record.call_entry.cutoff_at,week_start:demoCallWeek(date),season:demoCallSeason(date),votes:votes.map(([user_id,runs])=>({user_id,runs,revision:1})),result:{status,runs:status==='played'?runs:null,not_out:false,revision:status==='pending'?0:1,recorded_by:status==='pending'?null:'Sam Taylor',updated_at:status==='pending'?null:demoCallNow()},revision:1};
    state.entries.push(entry);demoCallRound(entry.week_start,{seed:true});return entry;
  };
  make('player-alex',demoCallDay(),'limited_overs',30,65,[['user-admin',40],['user-coach',60],['user-jordan',40],['user-taylor',150]]);
  make('player-jordan',demoCallDay(),'limited_overs',25,43,[['user-admin',25],['user-coach',30],['user-alex',35],['user-taylor',1]]);
  make('player-taylor',demoCallDay(),'t20',20,null,[['user-admin',20],['user-coach',25],['user-alex',30]],'pending');
  make('player-jordan',demoCallDay(3),'t20',35,null,[['user-admin',40],['user-coach',45],['user-taylor',50]],'pending');
  make('player-alex',demoCallDay(-7),'limited_overs',30,61,[['user-admin',40],['user-coach',40],['user-jordan',40]]);
  make('player-jordan',demoCallDay(-7),'limited_overs',20,32,[['user-admin',25],['user-coach',25],['user-alex',25]]);
  state.messages.push({id:demoId('call-message'),week_start:demoCallWeek(),user_id:'user-taylor',body:'Predictions are in. Keeping my numbers to myself until the awards reveal.',created_at:demoCallNow(),deleted:false},{id:demoId('call-message'),week_start:demoCallWeek(),user_id:'user-coach',body:'Looking forward to the club announcement. Get your predictions in before the deadline.',created_at:demoCallNow(),deleted:false});
}

const demoBeforeCallSeed=demoSeedClub;

demoSeedClub=function(){
  demoBeforeCallSeed();fixtureRows.engagement={};fixtureRows.make_your_call={seeded:false,settings:{award_enabled:{},conversation_enabled:false,award_cycle_start:null,season_awards_visibility:'live',enabled:true,timezone:'Australia/Sydney',season_start_month:7,week_start_day:1,week_start_effective:null,award_cadence:Object.fromEntries(DEMO_CALL_AWARD_KEYS.map(k=>[k,'weekly'])),grinch_enabled:false,grinch_name:'The Grinch',rewards:{weekly_points:'Club sponsor meal voucher',weekly_accuracy:'Club sponsor meal voucher',season_points:'Season presentation award',season_accuracy:'Season presentation award',season_beats:'Most times beating the club award',believer:'Friday night bragging rights',wildest:'A friendly club challenge',nasty:'',grinch:'',engagement:'Dinner voucher at the example club sponsor',engagement_claim:'Must be at the pub on Friday to claim.'},revision:1},entries:[],messages:[],reports:[],grants:['user-coach'],rounds:{},round_cadence:{},schedules:[{effective:'0001-01-01',day:1}],award_periods:[],receipts:{}};
  fixtureRows.make_your_call.settings.award_cycle_start=demoCallWeek(demoCallDay(-28));
  demoEngagementCredit('player-alex','prepare','example-preparation');
  demoEngagementCredit('player-jordan','prepare','example-jordan-preparation');demoEngagementCredit('player-jordan','review','example-jordan-review');demoEngagementStore('player-jordan').shared=true;demoSeedMakeYourCall();
};

demoStages.splice(demoStages.findIndex(s=>s.key==='help'),0,
  {key:'make_your_call',label:"Player predictions",tab:'make_your_call',role:'player',hint:"Predict a teammate’s score. Other predictions stay hidden until release."},
  {key:'make_your_call_staff',label:"Results and awards",tab:'make_your_call',role:'admin',hint:"Record results as Sam, then review a completed award period. Open Results history for a past announcement."});

const demoPreCallRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
  const ok=data=>({data:fixtureClone(data),error:null});
  try{
    if(['get_make_your_call','get_make_your_call_periods'].includes(name)){if(args.p_club_id!==club.id)throw Error('Club membership is required.');return ok(demoCallBoard(args));}
    if(name==='get_my_match_preparations'){
      const result=await demoPreCallRpc(name,args);if(!result.error)result.data.preparations=result.data.preparations.map(p=>({...p,predicted_runs:p.predicted_runs??null,call_entry:p.call_entry?{...p.call_entry,result:fixtureClone(fixtureRows.make_your_call.entries.find(e=>e.id===p.call_entry.id)?.result||null)}:null}));return result;
    }
    if(name==='save_my_match_preparation'){
      const player=demoMatchPreparationOwner(args.p_club_id),values=args.p_values||{},existing=fixtureRows.match_preparations.find(p=>p.id===args.p_preparation_id),state=fixtureRows.make_your_call;
      const receipt=fixtureRows.match_preparation_receipts?.[session.user.id+':'+args.p_request_id];
      if(receipt)return demoPreCallRpc(name,args);
      const prediction=Object.hasOwn(values,'predicted_runs')?values.predicted_runs:existing?.predicted_runs??null;
      if(Object.hasOwn(values,'predicted_runs')&&(values.action!=='prepare'||prediction!==null&&(!Number.isInteger(prediction)||prediction<0||prediction>999)))throw Error('Choose a prediction from 0 to 999 runs.');
      if(Object.hasOwn(values,'enter_make_your_call')&&(values.action!=='prepare'||typeof values.enter_make_your_call!=='boolean'))throw Error('Choose whether to enter Make your prediction.');
      if(existing?.call_entry&&['predicted_runs','match_date','format_key','opposition'].some(k=>Object.hasOwn(values,k)&&values[k]!==existing[k]))throw Error('The published prediction and match details are locked. You can still edit your preparation.');
      const official=existing?.call_entry?state.entries.find(e=>e.id===existing.call_entry.id)?.result:null;if(values.action==='played'&&values.innings&&official?.status==='played'&&values.innings.score_text!==String(official.runs)+(official.not_out?'*':''))throw Error('Use the official club score for this entered innings.');
      const publish=values.enter_make_your_call===true&&!existing?.call_entry;
      if(publish){
        if(!state.settings.enabled||!state.settings.timezone)throw Error('Your club has not enabled Make your prediction.');
        if(prediction===null)throw Error('Add your predicted score before entering Make your prediction.');
        if(new Date(demoCallMidnight(values.match_date||existing?.match_date))<=new Date(demoCallNow()))throw Error('Entries close at midnight before the nominated match date.');
        if(state.entries.some(e=>e.player_id===player.id&&e.match_date===(values.match_date||existing?.match_date)&&e.format_key===(values.format_key||existing?.format_key)))throw Error('You already have a public entry for this date and format.');
      }
      const result=await demoPreCallRpc(name,args);if(result.error)return result;
      const prep=fixtureRows.match_preparations.find(p=>p.id===result.data.preparation_id);if(values.action==='prepare')prep.predicted_runs=prediction;
      if(publish){
        const id=crypto.randomUUID(),cutoff=demoCallMidnight(prep.match_date);prep.call_entry={id,predicted_runs:prediction,cutoff_at:cutoff};
        state.entries.push({id,player_id:player.id,preparation_id:prep.id,predicted_runs:prediction,match_date:prep.match_date,format_key:prep.format_key,opposition:prep.opposition,cutoff_at:cutoff,week_start:demoCallWeek(prep.match_date),season:demoCallSeason(prep.match_date),votes:[],result:{status:'pending',runs:null,not_out:false,revision:0,recorded_by:null,updated_at:null},revision:1});demoCallRound(demoCallWeek(prep.match_date));
      }
      Object.assign(result.data,{predicted_runs:prep.predicted_runs??null,call_entry_id:prep.call_entry?.id||null,call_entry:prep.call_entry?{...prep.call_entry,result:fixtureClone(state.entries.find(e=>e.id===prep.call_entry.id)?.result||null)}:null});
      const saved=fixtureRows.match_preparation_receipts?.[session.user.id+':'+args.p_request_id];if(saved)Object.assign(saved.result,result.data);return result;
    }
    if(name==='save_my_innings'&&args.p_match_id){const linked=fixtureRows.match_preparations.find(p=>p.match_id===args.p_match_id&&p.call_entry),official=linked?fixtureRows.make_your_call.entries.find(e=>e.id===linked.call_entry.id)?.result:null;if(official?.status==='played'&&Object.hasOwn(args.p_values||{},'score_text')&&args.p_values.score_text!==String(official.runs)+(official.not_out?'*':''))throw Error('The official club result controls this innings score.');}
    if(!['save_make_your_call_settings','save_make_your_call_vote','save_make_your_call_result','save_make_your_call_message'].includes(name))return demoPreCallRpc(name,args);
    const member=demoCallMember();if(args.p_club_id!==club.id)throw Error('Club membership is required.');
    const state=fixtureRows.make_your_call,v=args.p_values||{},admin=member.permission_role==='admin';
    if(!demoMatchPreparationUuid.test(args.p_request_id))throw Error('A valid save request is required.');
    if(name==='save_make_your_call_settings'&&!admin)throw Error('Only Club Admin can change competition settings.');
    const entry=v.entry_id?state.entries.find(e=>e.id===v.entry_id):null;
    if(['save_make_your_call_vote','save_make_your_call_result'].includes(name)&&!entry)throw Error('That public entry is not available.');
    if(name==='save_make_your_call_result'&&!demoCallCanRecord(entry))throw Error('You do not have permission to record this player’s competition result.');
    const key=session.user.id+':'+args.p_request_id,fingerprint=JSON.stringify({name,args}),receipt=state.receipts[key];
    if(receipt){if(receipt.fingerprint!==fingerprint)throw Error('This request was already used for different changes.');return ok({...receipt.result,already_saved:true});}
    let extra={};
    if(name==='save_make_your_call_settings'){
      if(v.action==='grants'){
        if(v.expected_revision!==state.settings.revision)throw Error('Competition settings have changed. Reload and try again.');
        if(!Array.isArray(v.grants)||new Set(v.grants.map(g=>g.user_id)).size!==v.grants.length)throw Error('Choose each current captain or coach once.');
        for(const grant of v.grants)if(!fixtureRows.club_memberships.some(m=>m.user_id===grant.user_id&&['captain','coach','head_coach'].includes(m.permission_role))||typeof grant.allowed!=='boolean')throw Error('Choose a current captain or coach.');
        const grants=new Set(state.grants);for(const grant of v.grants){if(grant.allowed)grants.add(grant.user_id);else grants.delete(grant.user_id);}state.grants=[...grants];state.settings.revision++;extra={revision:state.settings.revision};
      }else if(v.action==='grant'){
        const target=fixtureRows.club_memberships.find(m=>m.user_id===v.user_id&&['captain','coach','head_coach','admin'].includes(m.permission_role));if(!target||typeof v.allowed!=='boolean')throw Error('Choose a current captain or coach.');
        state.grants=state.grants.filter(id=>id!==v.user_id);if(v.allowed)state.grants.push(v.user_id);
      }else{
        if(v.expected_revision!==state.settings.revision)throw Error('Competition settings have changed. Reload and try again.');
        try{new Intl.DateTimeFormat('en',{timeZone:v.timezone}).format();}catch{throw Error('Choose a valid time zone.');}
        if(typeof v.enabled!=='boolean'||!Number.isInteger(v.season_start_month)||v.season_start_month<1||v.season_start_month>12)throw Error('Check the competition settings.');
        const keys=[...DEMO_CALL_ALL_AWARD_KEYS,'wildest','wildest_claim',...DEMO_CALL_ALL_AWARD_KEYS.map(key=>key+'_claim')];if(Object.entries(v.rewards||{}).some(([k,value])=>!keys.includes(k)||typeof value!=='string'||value.length>300))throw Error('Check the reward descriptions.');
        if('grinch_enabled' in v&&typeof v.grinch_enabled!=='boolean')throw Error('Choose whether the season Grinch award is enabled.');
        if('grinch_name' in v&&(typeof v.grinch_name!=='string'||!v.grinch_name.trim()||v.grinch_name.trim().length>60))throw Error('Use an award name of 1 to 60 characters.');
        if('season_awards_visibility' in v&&!['live','on_release'].includes(v.season_awards_visibility))throw Error('Choose Live season standings or Hold until released.');
        if('award_enabled' in v&&(!v.award_enabled||Array.isArray(v.award_enabled)||typeof v.award_enabled!=='object'||Object.entries(v.award_enabled).some(([k,value])=>!DEMO_CALL_ALL_AWARD_KEYS.includes(k)||k==='grinch'||typeof value!=='boolean')))throw Error('Choose whether each award is included.');
        if('conversation_enabled' in v&&typeof v.conversation_enabled!=='boolean')throw Error('Choose whether Club Conversation is included.');
        const choices={...state.settings.award_enabled,...(v.award_enabled||{})};
        const rewards=fixtureClone({...state.settings.rewards,...(v.rewards||{})});for(const key of ['nasty','grinch','weekly_accuracy','season_accuracy',...DEMO_CALL_ALL_AWARD_KEYS.map(key=>key+'_claim')])if(!(key in rewards)&&key in state.settings.rewards)rewards[key]=state.settings.rewards[key];
        const cadence={...state.settings.award_cadence,...(v.award_cadence||{})};if(Object.entries(cadence).some(([k,value])=>![...DEMO_CALL_AWARD_KEYS,'wildest'].includes(k)||!['weekly','monthly'].includes(value)))throw Error('Choose Weekly or Every 4 weeks for each award.');
        let anchor=Object.hasOwn(v,'award_cycle_start')?v.award_cycle_start:state.settings.award_cycle_start;if(anchor!==null&&anchor!==undefined){if(typeof anchor!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(anchor)||Number.isNaN(Date.parse(anchor+'T12:00:00Z')))throw Error('Choose a valid first award week.');anchor=demoCallWeek(anchor);}if(DEMO_CALL_AWARD_KEYS.some(key=>choices[key]!==false&&cadence[key]==='monthly')&&!anchor)throw Error('Choose the first award week for Every 4 weeks awards.');
        const day=v.week_start_day??state.settings.week_start_day;if(!Number.isInteger(day)||day<0||day>6)throw Error('Choose a week-start day.');
        const oldAnchor=state.settings.award_cycle_start,hasFourWeeks=DEMO_CALL_AWARD_KEYS.some(key=>choices[key]!==false&&cadence[key]==='monthly'),today=demoCallDay();
        if(day!==state.settings.week_start_day&&(hasFourWeeks||state.award_periods.some(p=>p.cadence==='monthly'&&demoCallDateAdd(p.period_start,28)===p.period_end)))throw Error('Keep the week-start day while four-week awards are active.');
        if(hasFourWeeks){
          if(state.settings.week_start_effective>today)throw Error('Wait until the scheduled week-start change has taken effect before setting four-week awards.');
          if(demoCallWeek(anchor)!==anchor||demoCallWeekEnd(anchor)!==demoCallDateAdd(anchor,7))throw Error('Choose the start of a normal seven-day club week for your first four-week award period.');
        }
        if(anchor!==oldAnchor&&anchor){const protectedEnd=state.award_periods.filter(p=>p.cadence==='monthly'&&(!oldAnchor||p.period_start<oldAnchor)).map(p=>p.period_end).sort().at(-1);if(protectedEnd&&anchor<protectedEnd)throw Error('Choose a first award week after the existing award period ends on '+protectedEnd+'.');}
        if(anchor!==oldAnchor&&oldAnchor&&(state.entries.some(e=>e.match_date>=oldAnchor)||Object.values(fixtureRows.engagement||{}).some(p=>p.credits.some(c=>c.week_start>=oldAnchor))||state.award_periods.some(p=>p.cadence==='monthly'&&p.period_start>=oldAnchor)||Object.entries(fixtureRows.award_releases||{}).some(([k,r])=>k.startsWith('monthly:')&&r.source.award_period_basis==='four_weeks')))throw Error('The first award week is already in use and cannot be moved.');
        const cycleStart=anchor?demoCallDateAdd(anchor,28*Math.max(0,Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(anchor+'T12:00:00Z'))/2419200000))):null,cycleEnd=cycleStart?demoCallDateAdd(cycleStart,28):null;
        for(const key of DEMO_CALL_AWARD_KEYS)if(choices[key]!==false&&cadence[key]!==state.settings.award_cadence[key]){
          if(cadence[key]==='monthly'&&state.award_periods.some(p=>p.key===key&&p.cadence==='weekly'&&p.period_start<cycleEnd&&p.period_end>cycleStart&&(p.period_end<=today||fixtureRows.award_releases?.['weekly:'+p.period_start]?.source.awards.some(a=>a.key===key))))throw Error('This four-week block already contains weekly awards. Change this award to every four weeks from '+cycleEnd+'.');
          if(cadence[key]==='weekly'&&state.settings.award_cadence[key]==='monthly'&&cycleStart&&today>=cycleStart&&today<cycleEnd&&(state.entries.some(e=>e.match_date>=cycleStart&&e.match_date<cycleEnd)||Object.values(fixtureRows.engagement||{}).some(p=>p.credits.some(c=>c.week_start>=cycleStart&&c.week_start<cycleEnd))||fixtureRows.award_releases?.['monthly:'+cycleStart]))throw Error('This four-week award period is already in use. Change this award to weekly after '+cycleEnd+'.');
        }
        const announced=Object.values(fixtureRows.award_releases||{}).filter(release=>release.source.awards.some(award=>['weekly','monthly'].includes(award.cadence)&&award.period_end>demoCallDay()));
        if(announced.some(release=>release.source.awards.some(award=>['weekly','monthly'].includes(award.cadence)&&award.period_end>demoCallDay()&&cadence[award.key]!==state.settings.award_cadence[award.key])))throw Error('This award has already been announced for a period that is still open. Change its schedule after that period ends');
        if(day!==state.settings.week_start_day&&announced.some(release=>release.source.awards.some(award=>award.cadence==='weekly'&&award.period_end>demoCallDay())))throw Error('A weekly award period has already been announced. Change the week-start day after that period ends');
        let effective=state.settings.week_start_effective;
        if(day!==state.settings.week_start_day){
          const weeks=[...new Set([...Object.keys(state.rounds),...state.entries.map(e=>e.week_start),...state.messages.map(m=>m.week_start)])];
          if(!weeks.length){state.schedules=[{effective:'0001-01-01',day}];effective=null;}
          else{const latest=weeks.sort().at(-1),end=demoCallWeekEnd(latest);effective=demoCallDateAdd(end,(day-new Date(end+'T12:00:00Z').getUTCDay()+7)%7);state.schedules.push({effective,day,previous_end:end,extended_week:latest});}
        }
        state.settings={award_enabled:choices,conversation_enabled:v.conversation_enabled??state.settings.conversation_enabled??false,award_cycle_start:anchor||null,season_awards_visibility:v.season_awards_visibility||state.settings.season_awards_visibility||'live',enabled:v.enabled,timezone:v.timezone,season_start_month:v.season_start_month,week_start_day:day,week_start_effective:effective,award_cadence:cadence,grinch_enabled:v.grinch_enabled??state.settings.grinch_enabled??false,grinch_name:v.grinch_name?.trim()||state.settings.grinch_name||'The Grinch',rewards,revision:state.settings.revision+1};extra={revision:state.settings.revision};
        state.award_periods=state.award_periods.filter(p=>p.period_end<=demoCallDay());for(const week of Object.keys(state.rounds))if(demoCallWeekEnd(week)>demoCallDay()){state.rounds[week]=fixtureClone(rewards);state.round_cadence[week]=fixtureClone(cadence);demoCallRound(week);}
      }
    }else if(name==='save_make_your_call_vote'){
      if(!state.settings.enabled)throw Error('Make your prediction is disabled.');
      if(fixtureRows.players.find(p=>p.id===entry.player_id)?.user_id===session.user.id)throw Error('You cannot vote on your own prediction.');
      if(new Date(demoCallNow())>=new Date(entry.cutoff_at))throw Error('Voting has closed for this entry.');
      const prior=entry.votes.find(vote=>vote.user_id===session.user.id);
      if(v.expected_revision!==(prior?.revision||0))throw Error('Your estimate has changed. Reload before saving.');
      if(!Number.isInteger(v.runs)||v.runs<0||v.runs>999)throw Error('Choose a score from 0 to 999.');
      const vote={user_id:session.user.id,runs:v.runs,revision:(prior?.revision||0)+1};if(prior)Object.assign(prior,vote);else entry.votes.push(vote);extra={revision:vote.revision};
    }else if(name==='save_make_your_call_result'){
      if(new Date(demoCallNow())<new Date(entry.cutoff_at))throw Error('Record the result after the entry deadline.');
      if(v.expected_revision!==entry.result.revision)throw Error('This competition result has changed. Reload before saving.');
      if(!['played','did_not_bat','cancelled'].includes(v.status)||v.status==='played'&&(!Number.isInteger(v.runs)||v.runs<0||v.runs>9999))throw Error('Check the innings result.');
      if(entry.result.revision>0&&!String(v.reason||'').trim())throw Error('Add a reason for correcting this result.');
      if(String(v.reason||'').length>300)throw Error('Keep the correction reason to 300 characters.');if(v.score_date&&(v.score_date<entry.match_date||v.score_date>demoCallDay()))throw Error('Result date must be between the match start and today.');
      state.result_history??=[];state.result_history.push({entry_id:entry.id,previous:fixtureClone(entry.result),reason:v.reason||'',user_id:session.user.id});
      const prep=fixtureRows.match_preparations.find(p=>p.id===entry.preparation_id),resolution=prep?demoPreparationResolution(prep):null;if(resolution?.resolution_ambiguous)throw Error('Link the preparation to the correct innings before recording the official result.');entry.result={score_date:v.score_date||entry.result?.score_date||entry.match_date,status:v.status,runs:v.status==='played'?v.runs:null,not_out:v.status==='played'&&v.not_out===true,revision:entry.result.revision+1,recorded_by:userProfile.display_name,updated_at:demoCallNow()};const match=fixtureRows.feedback[entry.player_id]?.matches.find(m=>m.id===resolution?.resolved_match_id);if(match&&['played','did_not_bat'].includes(entry.result.status)){match.participation_status=entry.result.status;match.score_text=entry.result.status==='played'?String(entry.result.runs)+(entry.result.not_out?'*':''):'';match.score_recorded_by=session.user.id;match.updated_at=demoCallNow();}extra={revision:entry.result.revision,result:fixtureClone(entry.result)};
    }else{
      if(v.action==='post'){
        if(!state.settings.enabled)throw Error('Make your prediction is disabled.');if(state.settings.conversation_enabled!==true)throw Error('Club Conversation is not enabled for this club.');const body=String(v.body||'').trim();if(!body||body.length>500)throw Error('Write a message of 1 to 500 characters.');
        const week=demoCallWeek(v.week_start||demoCallDay());if(!Object.hasOwn(state.rounds,week)&&(week<demoCallWeek()||week>demoCallDateAdd(demoCallWeek(),28)))throw Error('Start a club conversation in this award week or the next four weeks; existing rounds remain available');demoCallRound(week);state.messages.push({id:demoId('call-message'),week_start:week,user_id:session.user.id,body,created_at:demoCallNow(),deleted:false});
      }else{
        const message=state.messages.find(m=>m.id===v.message_id&&!m.deleted);if(!message)throw Error('That message is no longer available.');
        if(v.action==='delete'){if(!admin&&message.user_id!==session.user.id)throw Error('You cannot remove this message.');message.deleted=true;}
        else if(v.action==='report'){const reason=String(v.reason||'').trim();if(!reason||reason.length>300)throw Error('Add a short reason for reporting the message.');if(!state.reports.some(r=>r.message_id===message.id&&r.reporter_id===session.user.id))state.reports.push({id:demoId('call-report'),message_id:message.id,reporter_id:session.user.id,reason,created_at:demoCallNow()});}
        else throw Error('Choose a message action.');
      }
    }
    const result={ok:true,...extra,already_saved:false};state.receipts[key]={fingerprint,result};return ok(result);
  }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
};

const demoBeforeTeamSeed=demoSeedClub;

demoSeedClub=function(){
 demoBeforeTeamSeed();fixtureRows.team_review_receipts={};fixtureRows.team_review_seeded=false;
};

function demoSeedTeamReview(){
 if(fixtureRows.team_review_seeded)return;fixtureRows.team_review_seeded=true;
 const at=fixtureNow(),day=fixtureDay();
 fixtureRows.feedback['player-alex'].matches.unshift({id:'shared-alex-innings',match_date:day,format_key:'limited_overs',opposition:'Harbour Visitors',innings_number:1,participation_status:'played',score_text:'19',player_note:'I backed the pull, then chased width before settling.',dismissal_summary:'',created_by:'user-alex',created_at:at,updated_at:at,player_reflection:null,player_video:null,coach_feedback:[]});
}

;

const demoBeforeTeamRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(!['get_team_match_review','save_team_match_review'].includes(name))return demoBeforeTeamRpc(name,args);
 const ok=data=>({data:fixtureClone(data),error:null}),fail=message=>({data:null,error:{code:'P0001',message}});
 try{
  const staff=fixtureRows.club_memberships.find(m=>m.club_id===args.p_club_id&&m.user_id===session.user.id);
  if(args.p_club_id!==club.id||!staff||!(['admin','head_coach','coach','captain'].includes(staff.permission_role)||demoTemporaryBattingCaptain()))throw Error('Staff access is required for Match review.');
  const groups=fixtureGroups.filter(g=>g.active),editable=fixtureWorkspacePlayers().filter(p=>p.can_edit);
  if(!editable.length)throw Error('Coaching edit access is required.');
  if(name==='get_team_match_review'){
   const identity={match_date:args.p_match_date,format_key:args.p_format_key,opposition:args.p_opposition,innings_number:args.p_innings_number||1};
   const players=editable.filter(p=>!args.p_group_id||(args.p_group_id==='__unassigned__'?p.groups.length===0:p.groups.some(g=>g.id===args.p_group_id))).map(p=>{
    const candidates=demoSharedCandidates(p.id,identity);let match=null;try{match=demoSharedMatch(p.id,identity,null,{allowNew:false});}catch{}
    return {player_id:p.id,name:p.display_name,display_name:p.display_name,groups:p.groups.map(g=>({id:g.id,name:g.name})),group_ids:p.groups.map(g=>g.id),can_edit:true,...demoSharedMatchProjection(p.id,match),candidates:match?[]:candidates.map(m=>{const projected=demoSharedMatchProjection(p.id,m);return {id:m.id,match_date:m.match_date,opposition:m.opposition,format_key:m.format_key,innings_number:m.innings_number||1,score_text:m.score_text||'',match_updated_at:projected.match_updated_at,own_feedback_updated_at:projected.own_feedback_updated_at,own_action_revision:projected.own_action_revision,batting_to_plan:projected.batting_to_plan,dismissal_classification:projected.dismissal_classification};})};
   });
   return ok({players,groups:groups.map(g=>({id:g.id,name:g.name}))});
  }
  const v=args.p_values||{},key=session.user.id+':'+args.p_request_id,receipts=fixtureRows.team_review_receipts??={},fingerprint=JSON.stringify(args);
  if(!demoMatchPreparationUuid.test(args.p_request_id))throw Error('A valid save request is required.');
  if(receipts[key]){if(receipts[key].fingerprint!==fingerprint)throw Error('This request was already used for different changes.');return ok({...receipts[key].result,already_saved:true});}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v.match_date||'')||!['t20','limited_overs','long_form'].includes(v.format_key)||!String(v.opposition||'').trim()||String(v.opposition||'').length>160||!Number.isInteger(v.innings_number||1)||(v.innings_number||1)<1||(v.innings_number||1)>10)throw Error('Check the date, format and innings number.');
  if(!Array.isArray(v.rows)||!v.rows.length||v.rows.length>200||new Set(v.rows.map(r=>r.player_id)).size!==v.rows.length)throw Error('Choose one changed row per player.');
  const snapshot=fixtureClone(fixtureRows.feedback),receiptSnapshot=new Map(demoReceipts),saved=[];
  try{
   for(const row of v.rows){
    if(!editable.some(p=>p.id===row.player_id))throw Error('Edit access to every selected player is required.');
    if(!['yes','mostly','no','no_plan','did_not_bat'].includes(row.batting_to_plan)||row.dismissal_classification&&!['plan_execution','outside_plan','not_applicable'].includes(row.dismissal_classification))throw Error('Choose a valid innings and dismissal assessment.');
    const f=fixtureRows.feedback[row.player_id];let match=demoSharedMatch(row.player_id,v,row.match_id);
    if(match&&(match.match_date!==v.match_date||match.format_key!==v.format_key||(match.innings_number||1)!==(v.innings_number||1)))throw Error('The selected innings is for a different date, format or innings number.');
    if(match&&row.match_id&&Object.hasOwn(row,'expected_match_updated_at')&&match.updated_at!==row.expected_match_updated_at)throw Error('The innings changed. Reload before saving.');
    const own=match?.coach_feedback.filter(n=>n.author_user_id===session.user.id).at(-1),action=f.coaching_actions.find(a=>a.match_feedback_id===own?.id);
    if((own?.updated_at||null)!==(row.expected_feedback_updated_at??null)||(action?.revision||null)!==(row.expected_action_revision??null))throw Error('Your review has changed. Reload the team before saving.');
    if(row.batting_to_plan==='did_not_bat'){
     if(match&&(match.player_reflection||match.coach_feedback.length||String(match.score_text||'').trim()))throw Error('This innings already has batting reflection or observations. It cannot be changed to Did not bat here.');
     if(!match){match={id:demoId('innings'),match_date:v.match_date,format_key:v.format_key,opposition:v.opposition||'',innings_number:v.innings_number||1,created_by:session.user.id,created_at:fixtureNow(),player_reflection:null,player_video:null,player_note:'',coach_feedback:[]};f.matches.unshift(match);}
     Object.assign(match,{participation_status:'did_not_bat',score_text:'',updated_at:fixtureNow()});saved.push({player_id:row.player_id,match_id:match.id,feedback_id:null,feedback_updated_at:null,action_revision:null});continue;
    }
    if(match?.participation_status==='did_not_bat')match.participation_status='played';
    const values={...(own?fixtureClone(own):{}),match_date:match?.match_date||v.match_date,format_key:match?.format_key||v.format_key,opposition:match?.opposition??v.opposition,innings_number:match?.innings_number||v.innings_number||1,match_id:match?.id||null,dismissal_summary:own?.innings_note||'',batting_to_plan:row.batting_to_plan,dismissal_classification:row.dismissal_classification||null,plan_related:row.batting_to_plan!=='no_plan',completion_requested:row.batting_to_plan==='no_plan',needs_conversation:own?.needs_conversation||false};
    // Quick review updates the answers only. Existing comments, links and agreed
    // follow-up details remain owned by the individual observation.
    const result=await demoBeforeTeamRpc('save_coach_observation',{p_club_id:club.id,p_player_id:row.player_id,p_kind:'match',p_observation_id:own?.id||null,p_request_id:crypto.randomUUID(),p_review_on:action?.review_on||null,p_values:values});
    if(result.error)throw Error(result.error.message);
    match=f.matches.find(m=>m.id===result.data.match_id);const note=match.coach_feedback.find(n=>n.id===result.data.observation_id),nextAction=f.coaching_actions.find(a=>a.id===result.data.action_id);
    saved.push({player_id:row.player_id,match_id:match.id,feedback_id:note.id,feedback_updated_at:note.updated_at,action_revision:nextAction?.revision||null});
   }
  }catch(error){fixtureRows.feedback=snapshot;demoReceipts=receiptSnapshot;throw error;}
  const result={saved,already_saved:false};receipts[key]={fingerprint,result};return ok(result);
 }catch(error){return fail(error.message);}
};

const demoBeforeTeamWorkflowSeed=demoSeedClub;

demoSeedClub=function(){demoBeforeTeamWorkflowSeed();resetTeamReviewState();fixtureRows.team_review_sessions=[];fixtureRows.team_workflow_receipts={};fixtureRows.team_delete_previews={};};

function demoTeamStaff(clubId){
 const staff=fixtureRows.club_memberships.find(m=>m.club_id===clubId&&m.user_id===session.user.id);
 if(clubId!==club.id||!staff||!(['admin','head_coach','coach','captain'].includes(staff.permission_role)||demoTemporaryBattingCaptain()))throw Error('Staff access is required for Match review.');return staff;
}

function demoTeamEditable(){return fixtureWorkspacePlayers().filter(p=>p.can_edit);}

function demoTeamMetadata(review){
 const staff=demoTeamStaff(club.id),accessible=new Set(demoTeamEditable().map(p=>p.id)),rows=review.rows.filter(r=>accessible.has(r.player_id)),names=rows.map(r=>fixtureRows.players.find(p=>p.id===r.player_id)?.display_name||'Club player');
 return {id:review.id,review_id:review.id,fixture_id:review.fixture_id||null,source_match_id:review.source_match_id||null,source_team_id:review.source_team_id||null,author_user_id:review.author_user_id,author_name:fixtureRows.user_profiles.find(p=>p.user_id===review.author_user_id)?.display_name||'Club member',match_date:review.match_date,format_key:review.format_key,opposition:review.opposition,innings_number:review.innings_number,group_id:review.group_id,group_scope:review.group_scope,group_name:fixtureGroups.find(g=>g.id===review.group_id)?.name||(review.group_scope==='unassigned'?'Currently unassigned':review.group_scope==='legacy'?'Grade not recorded':'All permitted players'),revision:review.revision,created_at:review.created_at,updated_at:review.updated_at,player_count:rows.length,row_count:rows.length,player_names:names,players:rows.map((r,i)=>({player_id:r.player_id,name:names[i]})),can_edit:review.author_user_id===session.user.id&&rows.length===review.rows.length,can_delete:staff.permission_role==='admin'};
}

function demoTeamReviewById(id){const review=fixtureRows.team_review_sessions.find(r=>r.id===id&&!r.deleted);if(!review)throw Error('This saved match review is not available.');const meta=demoTeamMetadata(review);if(!meta.player_count)throw Error('No permitted players in this match review.');return review;}

function demoTeamReviewFingerprint(review){return JSON.stringify({review,cleanup:review.rows.map(r=>demoTeamCleanupRow(review,r)),shared:review.rows.map(r=>({row:r,match:fixtureRows.feedback[r.player_id]?.matches.find(m=>m.id===r.match_id),actions:fixtureRows.feedback[r.player_id]?.coaching_actions.filter(a=>a.match_feedback_id===r.feedback_id)}))});}

function demoTeamCleanupRow(review,row){
 const data=fixtureRows.feedback[row.player_id],match=data?.matches.find(m=>m.id===row.match_id),note=match?.coach_feedback.find(n=>n.id===row.feedback_id),action=data?.coaching_actions.find(a=>a.match_feedback_id===row.feedback_id),sameReviewLinks=fixtureRows.team_review_sessions.filter(r=>!r.deleted&&r.id!==review.id).flatMap(r=>r.rows),otherFeedbackLink=sameReviewLinks.some(r=>r.feedback_id&&r.feedback_id===row.feedback_id);
 const focus=demoFocusStore(row.player_id),hasFocusDependency=(focus.rows||[]).some(f=>[row.feedback_id,action?.id].filter(Boolean).some(id=>f.source_id===id||f.context_id===id)),hasReviewDependency=(action?.reviews||[]).length>0,hasPreparationDependency=fixtureRows.match_preparations.some(p=>p.coaching_action_id===action?.id&&action?.id),hasEngagementDependency=demoEngagementStore(row.player_id).credits.some(c=>[row.feedback_id,action?.id].filter(Boolean).includes(c.source_id));
 const unchangedNote=!!note&&JSON.stringify(note)===JSON.stringify(row.saved_feedback),unchangedAction=JSON.stringify(action||null)===JSON.stringify(row.saved_action||null);
 const remove_feedback=!!(note&&row.feedback_created&&note.author_user_id===review.author_user_id&&unchangedNote&&unchangedAction&&!otherFeedbackLink&&!hasFocusDependency&&!hasReviewDependency&&!hasPreparationDependency&&!hasEngagementDependency&&!String(note.note||'').trim()&&!String(note.innings_note||'').trim()&&!String(note.next_training_focus||'').trim()&&!note.main_issue&&!note.needs_conversation&&(!action||(action.status==='open'&&!action.follow_up_requested&&!action.review_on&&!action.video)));
 const parentFields=m=>m?JSON.stringify({...m,coach_feedback:[]}):null,hasOtherNotes=!!match?.coach_feedback.some(n=>!(remove_feedback&&n.id===row.feedback_id)),hasPreparation=!!match&&fixtureRows.match_preparations.some(p=>p.player_id===row.player_id&&(p.match_id===match.id||(p.match_date===match.match_date&&p.format_key===match.format_key&&(p.innings_number||1)===(match.innings_number||1)&&demoInningsOpponent(p.opposition)===demoInningsOpponent(match.opposition)))),hasOfficial=!!demoInningsOfficialResult(row.player_id,match),parentFocus=(focus.rows||[]).some(f=>f.source_id===row.match_id||f.context_id===row.match_id),parentEngagement=demoEngagementStore(row.player_id).credits.some(c=>c.source_id===row.match_id);
 const remove_innings=!!(match&&row.match_created&&match.created_by===review.author_user_id&&parentFields(match)===parentFields(row.saved_match)&&!hasOtherNotes&&!match.player_reflection&&!match.player_video&&!String(match.player_note||'').trim()&&!String(match.dismissal_summary||'').trim()&&!String(match.score_text||'').trim()&&!match.score_recorded_by&&!hasPreparation&&!hasOfficial&&!parentFocus&&!parentEngagement&&!sameReviewLinks.some(r=>r.match_id===match.id));
 let preserved_reason=match&&!remove_innings?'The shared innings is retained because it predates this review, has other work, or changed since this review was saved.':'';if(note&&!remove_feedback)preserved_reason='The observation is retained because it predates this review, includes notes or follow-up work, is linked elsewhere, or changed after this review was saved.';
 return {player_id:row.player_id,name:fixtureRows.players.find(p=>p.id===row.player_id)?.display_name||'Club player',match_id:match?.id||null,feedback_id:note?.id||null,action_id:action?.id||null,remove_feedback,remove_innings,preserved_reason};
}

function demoTeamApplyCleanup(review,row){const result=demoTeamCleanupRow(review,row),f=fixtureRows.feedback[row.player_id],match=f.matches.find(m=>m.id===row.match_id);if(result.remove_feedback){match.coach_feedback=match.coach_feedback.filter(n=>n.id!==row.feedback_id);f.coaching_actions=f.coaching_actions.filter(a=>a.match_feedback_id!==row.feedback_id);}if(result.remove_innings)f.matches=f.matches.filter(m=>m.id!==row.match_id);review.rows=review.rows.filter(r=>r.player_id!==row.player_id);return result;}

function demoTeamDeletePreview(review){const rows=review.rows.map(r=>demoTeamCleanupRow(review,r));return {review:demoTeamMetadata(review),revision:review.revision,rows,remove_feedback_count:rows.filter(r=>r.remove_feedback).length,remove_innings_count:rows.filter(r=>r.remove_innings).length,preserved_innings_count:rows.filter(r=>r.match_id&&!r.remove_innings).length};}

const demoBeforeTeamWorkflowRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(!['get_team_review_roster','get_saved_team_reviews','get_team_review_session','save_team_match_review','preview_team_review_delete','delete_team_review'].includes(name))return demoBeforeTeamWorkflowRpc(name,args);
 const ok=data=>({data:fixtureClone(data),error:null});
 try{
  const staff=demoTeamStaff(args.p_club_id),editable=demoTeamEditable(),groups=fixtureGroups.filter(g=>g.active).map(g=>({id:g.id,name:g.name}));
  if(name==='get_team_review_roster')return ok({groups,players:editable.map(p=>({player_id:p.id,name:p.display_name,display_name:p.display_name,groups:p.groups.map(g=>({id:g.id,name:g.name})),group_ids:p.groups.map(g=>g.id),can_edit:true})),can_delete:staff.permission_role==='admin'});
  if(name==='get_saved_team_reviews'){
   const f=args.p_filters||{},reviews=fixtureRows.team_review_sessions.filter(r=>!r.deleted&&(!f.group_id||r.group_id===f.group_id)&&(!f.group_scope||r.group_scope===f.group_scope)&&(!f.date_from||r.match_date>=f.date_from)&&(!f.date_to||r.match_date<=f.date_to)&&(!f.format_key||r.format_key===f.format_key)).map(demoTeamMetadata).filter(r=>r.player_count&&(!f.player_query||r.player_names.some(n=>n.toLocaleLowerCase().includes(String(f.player_query).toLocaleLowerCase())))).sort((a,b)=>b.match_date.localeCompare(a.match_date)||b.updated_at.localeCompare(a.updated_at));return ok({reviews,groups,can_delete:staff.permission_role==='admin'});
  }
  if(name==='preview_team_review_delete'||name==='delete_team_review'){
   if(staff.permission_role!=='admin')throw Error('Only Club Admin can delete a saved match review.');
   const receiptKey=session.user.id+':'+args.p_request_id,fingerprint=JSON.stringify({name,args}),priorReceipt=fixtureRows.team_workflow_receipts[receiptKey];
   if(name==='delete_team_review'&&priorReceipt){if(priorReceipt.fingerprint!==fingerprint)throw Error('This request was already used for different changes.');return ok({...priorReceipt.result,already_saved:true});}
   const review=demoTeamReviewById(args.p_review_id),preview=demoTeamDeletePreview(review);
   if(name==='preview_team_review_delete'){const token=crypto.randomUUID();fixtureRows.team_delete_previews[token]={review_id:review.id,fingerprint:demoTeamReviewFingerprint(review)};return ok({...preview,preview_token:token});}
   if(!demoMatchPreparationUuid.test(args.p_request_id))throw Error('A valid delete request is required.');
   const checked=fixtureRows.team_delete_previews[args.p_preview_token];if(args.p_expected_revision!==review.revision||!checked||checked.review_id!==review.id||checked.fingerprint!==demoTeamReviewFingerprint(review))throw Error('The review or shared innings changed. Open a fresh deletion preview.');
   for(const row of [...review.rows])demoTeamApplyCleanup(review,row);review.deleted=true;review.revision++;review.updated_at=fixtureNow();const result={ok:true,deleted:true,review_id:review.id,revision:review.revision,remove_feedback_count:preview.remove_feedback_count,remove_innings_count:preview.remove_innings_count,preserved_innings_count:preview.preserved_innings_count,already_saved:false};fixtureRows.team_workflow_receipts[receiptKey]={fingerprint,result};return ok(result);
  }
  if(name==='get_team_review_session'){
   const review=demoTeamReviewById(args.p_review_id),meta=demoTeamMetadata(review),result=await demoBeforeTeamWorkflowRpc('get_team_match_review',{p_club_id:club.id,p_match_date:review.match_date,p_format_key:review.format_key,p_opposition:review.opposition,p_innings_number:review.innings_number,p_group_id:null});if(result.error)throw Error(result.error.message);
   result.data.players=result.data.players.filter(p=>review.rows.some(r=>r.player_id===p.player_id)||(review.author_user_id===session.user.id&&(review.group_scope==='all'||review.group_scope==='legacy'||review.group_scope==='unassigned'&&!p.group_ids.length||review.group_scope==='group'&&(review.fixture_id||p.group_ids.includes(review.group_id)))));
   for(const p of result.data.players){const linked=review.rows.find(r=>r.player_id===p.player_id);p.included_in_review=!!linked;if(linked){const match=fixtureRows.feedback[p.player_id]?.matches.find(m=>m.id===linked.match_id),original=match?.coach_feedback.find(n=>n.id===linked.feedback_id),note=myPlayer?.id===p.player_id&&original?.author_user_id!==session.user.id&&original?.plan_related!==false&&!match?.player_reflection?null:original,action=note?fixtureRows.feedback[p.player_id]?.coaching_actions.find(a=>a.match_feedback_id===note.id):null;Object.assign(p,{match_id:match?.id||null,match_updated_at:match?.updated_at||null,participation_status:match?.participation_status||'played',own_feedback_id:note?.id||null,own_feedback_updated_at:note?.updated_at||null,own_action_revision:action?.revision||null,batting_to_plan:match?.participation_status==='did_not_bat'?'did_not_bat':note?.batting_to_plan||'',dismissal_classification:note?.dismissal_classification||null,feedback:note?{id:note.id,batting_to_plan:note.batting_to_plan,dismissal_classification:note.dismissal_classification,updated_at:note.updated_at,action_revision:action?.revision||null}:null});}}
   return ok({review:meta,groups,players:result.data.players});
  }
  if(name==='save_team_match_review'){
   const v=args.p_values||{},receiptKey=session.user.id+':'+args.p_request_id,priorReceipt=fixtureRows.team_workflow_receipts[receiptKey],fingerprint=JSON.stringify({name,args});if(priorReceipt){if(priorReceipt.fingerprint!==fingerprint)throw Error('This request was already used for different changes.');return ok({...priorReceipt.result,already_saved:true});}
   const scope=v.group_scope||(v.group_id?'group':'legacy'),groupId=v.group_id||null,removals=v.remove_player_ids||[],changes=v.rows||[];
   if(!['group','all','unassigned','legacy'].includes(scope)||(scope==='group'&&!fixtureGroups.some(g=>g.id===groupId&&g.active))||(scope!=='group'&&groupId))throw Error('Choose a valid grade selection.');
   if(!Array.isArray(removals)||!Array.isArray(changes)||!changes.length&&!removals.length&&!v.scorecard_import||new Set([...removals,...changes.map(r=>r.player_id)]).size!==removals.length+changes.length)throw Error('Each player may be changed or removed only once.');
   let review=v.review_id?demoTeamReviewById(v.review_id):null;
   if(review){if(review.author_user_id!==session.user.id)throw Error('Only the review author can edit these assessments.');if(v.expected_revision!==review.revision)throw Error('This match review has changed. Reload before saving.');if(['match_date','format_key','innings_number'].some(k=>(v[k]??1)!==review[k])||demoInningsOpponent(v.opposition)!==demoInningsOpponent(review.opposition)||scope!==review.group_scope||groupId!==review.group_id)throw Error('The saved match identity is fixed. Start a new match review for another match or grade.');}
   else{review=fixtureRows.team_review_sessions.find(r=>!r.deleted&&r.author_user_id===session.user.id&&r.match_date===v.match_date&&r.format_key===v.format_key&&r.innings_number===(v.innings_number||1)&&r.group_scope===scope&&r.group_id===groupId&&demoInningsOpponent(r.opposition)===demoInningsOpponent(v.opposition))||null;if(review&&(Object.hasOwn(v,'review_id')||Object.hasOwn(v,'group_scope')))throw Error('A saved review already exists for this grade and match. Open Saved match reviews to edit it.');if(removals.length)throw Error('Open a saved review before removing players.');}
   for(const id of [...removals,...changes.map(r=>r.player_id)])if(!editable.some(p=>p.id===id))throw Error('Edit access to every selected player is required.');
   if(removals.some(id=>!review?.rows.some(r=>r.player_id===id)))throw Error('That player is not included in this review.');
   if(review&&new Set([...review.rows.filter(r=>!removals.includes(r.player_id)).map(r=>r.player_id),...changes.map(r=>r.player_id)]).size===0)throw Error('A saved review must keep at least one player. Ask Club Admin to delete the review.');
   for(const row of changes)if(!review?.rows.some(r=>r.player_id===row.player_id)){const p=editable.find(p=>p.id===row.player_id);if(scope==='group'&&!v.fixture_id&&!review?.fixture_id&&!p.groups.some(g=>g.id===groupId)||scope==='unassigned'&&p.groups.length)throw Error('Choose players from the selected grade.');}
   const before=fixtureClone(fixtureRows.feedback),result=changes.length?await demoBeforeTeamWorkflowRpc(name,args):{data:{saved:[],already_saved:false},error:null};if(result.error)return result;
   if(!review){review={id:crypto.randomUUID(),author_user_id:session.user.id,match_date:v.match_date,format_key:v.format_key,opposition:String(v.opposition||'').trim(),innings_number:v.innings_number||1,group_id:groupId,group_scope:scope,revision:0,created_at:fixtureNow(),updated_at:fixtureNow(),rows:[],deleted:false};fixtureRows.team_review_sessions.push(review);}
   const removed=removals.map(id=>demoTeamApplyCleanup(review,review.rows.find(r=>r.player_id===id)));
   for(const saved of result.data.saved){const existing=review.rows.find(r=>r.player_id===saved.player_id),priorMatch=before[saved.player_id]?.matches.find(m=>m.id===saved.match_id),priorFeedback=priorMatch?.coach_feedback.find(n=>n.id===saved.feedback_id),match=fixtureRows.feedback[saved.player_id]?.matches.find(m=>m.id===saved.match_id),feedback=match?.coach_feedback.find(n=>n.id===saved.feedback_id),action=fixtureRows.feedback[saved.player_id]?.coaching_actions.find(a=>a.match_feedback_id===saved.feedback_id);if(feedback)feedback.source_kind='team_review';const value={...saved,match_created:existing?.match_created??!priorMatch,feedback_created:existing?.feedback_created??(!!saved.feedback_id&&!priorFeedback),saved_feedback:feedback?fixtureClone(feedback):null,saved_action:action?fixtureClone(action):null,saved_match:match?fixtureClone(match):null};if(existing)Object.assign(existing,value);else review.rows.push(value);}
   const imported_scores=await demoApplyMatchScores(review,v,result.data.saved);review.revision++;review.updated_at=fixtureNow();const response={...result.data,imported_scores,review_id:review.id,revision:review.revision,review:demoTeamMetadata(review),removed};fixtureRows.team_workflow_receipts[receiptKey]={fingerprint,result:response};return ok(response);
  }
  throw Error('That match review action is unavailable.');
 }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
};

const demoBeforeAwardReleaseSeed=demoSeedClub;

demoSeedClub=function(){demoBeforeAwardReleaseSeed();fixtureRows.award_releases={};fixtureRows.award_release_previews={};fixtureRows.award_release_receipts={};fixtureRows.award_history_seeded=false;};

const demoRawCallBoard=demoCallBoard;

function demoCanReleaseAwards(){return ['admin','head_coach','coach','captain'].includes(demoCallMember().permission_role);}

function demoAwardReleaseDefaults(){
 const today=demoCallDay(),currentWeek=demoCallWeek(today),week=demoCallWeek(demoCallDateAdd(currentWeek,-1)),anchor=fixtureRows.make_your_call.settings.award_cycle_start,current=demoCallMonth(today),previous=demoCallDateAdd(current,-28),hasCompleted=!!anchor&&previous>=anchor,start=hasCompleted?previous:anchor||currentWeek;
 const period=(start,end)=>({period_start:start,period_end:end,period_last_date:demoCallDateAdd(end,-1),available_from:end});
 return {club_today:today,timezone:fixtureRows.make_your_call.settings.timezone,weekly:period(week,demoCallWeekEnd(week)),monthly:{...period(start,demoCallMonthEnd(start)),configured:!!anchor,has_completed_period:hasCompleted}};
}

function demoAwardIdentity(args={}){
 const kind=args.p_period_kind;if(!['weekly','monthly','season'].includes(kind))throw Error('Choose weekly, monthly or season awards.');
 const date=args.p_period_date||(kind==='season'?demoCallDay():demoAwardReleaseDefaults()[kind].period_start);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Choose a valid award date.');
 const season=args.p_season??demoCallSeason(date);if(!Number.isInteger(season)||season<1900||season>2200)throw Error('Choose a valid season.');
 const month=String(fixtureRows.make_your_call.settings.season_start_month||7).padStart(2,'0');
 const start=kind==='season'?`${season}-${month}-01`:kind==='monthly'?demoCallMonth(date):demoCallWeek(date),end=kind==='season'?`${season+1}-${month}-01`:kind==='monthly'?demoCallMonthEnd(start):demoCallWeekEnd(start);
 return {period_kind:kind,period_start:start,period_end:end,season,key:kind+':'+start};
}

const DEMO_CALL_REVEAL_FIELDS=['id','predicted_runs','votes','vote_count','club_call','result','points','raw_surplus','format_weight','beat_club','wildest_calls','nasty_candidates','nasty_calls','believers'];

function demoAwardPeriodEntries(identity){return identity.period_kind==='season'?[]:fixtureRows.make_your_call.entries.filter(e=>e.result?.status!=='pending'&&demoResultDate(e)>=identity.period_start&&demoResultDate(e)<identity.period_end&&(identity.period_kind!=='monthly'||(fixtureRows.make_your_call.settings.award_cycle_start&&identity.period_start>=fixtureRows.make_your_call.settings.award_cycle_start)));}

function demoAwardOpenVotingCount(identity){return demoAwardPeriodEntries(identity).filter(e=>new Date(demoCallNow())<new Date(e.cutoff_at)).length;}

function demoCallRevealSnapshot(entry){const view=demoCallEntryView(entry);return Object.fromEntries(DEMO_CALL_REVEAL_FIELDS.map(key=>[key,fixtureClone(view[key])]));}

function demoCallPublishedSnapshot(entryId){
 const matches=Object.entries(fixtureRows.award_releases||{}).filter(([key,saved])=>!key.startsWith('season:')&&saved.source.call_details?.some(c=>c.id===entryId)).map(([key,saved])=>({key,saved}));
 matches.sort((a,b)=>String(b.saved.released_at).localeCompare(String(a.saved.released_at))||(b.saved.order||0)-(a.saved.order||0));
 const latest=matches[0];return latest?{details:latest.saved.source.call_details.find(c=>c.id===entryId),revealed_at:latest.saved.released_at,reveal_period_kind:latest.key.split(':')[0],reveal_period_start:latest.key.slice(latest.key.indexOf(':')+1)}:null;
}

function demoAwardSource(identity){
 const data=demoRawCallBoard({p_week_start:identity.period_start,p_month_start:identity.period_start,p_season:identity.season}),season=identity.period_kind==='season';
 const awards=season?['season_points','season_accuracy','season_beats','grinch'].filter(key=>demoAwardEnabled(key)).map(key=>{
  let winners=[];
  if(key==='season_accuracy')winners=data.accuracy_season_rows.filter(r=>r.eligible&&r.is_leader).map(r=>({name:r.name,detail:r.average_error.toFixed(2)+' runs away on average · '+r.predictions+' predictions'}));
  else{const rows=key==='grinch'?data.grinch_rows:data.season_rows,metric=key==='grinch'?'low_calls':key==='season_beats'?'beat_count':'points',best=Math.max(0,...rows.map(r=>Number(r[metric])||0));winners=rows.filter(r=>best>0&&r[metric]===best).map(r=>({name:r.name,detail:best+(key==='grinch'?' low predictions proved wrong':key==='season_beats'?' club predictions beaten':' points')}));}
  return {key,label:key==='grinch'?data.settings.grinch_name:null,cadence:'season',period_start:identity.period_start,period_end:identity.period_end,reward_text:data.settings.rewards[key]||'',claim_text:data.settings.rewards[key+'_claim']||'',winners};
 }):data.period_awards.filter(a=>a.cadence===identity.period_kind),engagement=awards.find(a=>a.key==='engagement');
 const eligible=engagement?fixtureRows.players.filter(p=>p.active!==false&&demoCallEngagementWeeks(p.id,engagement.period_start,engagement.period_end,engagement).length>=(engagement.cadence==='monthly'?2:1)):[];
 return {entry_count:demoAwardPeriodEntries(identity).filter(e=>new Date(demoCallNow())>=new Date(e.cutoff_at)).length,award_period_basis:'four_weeks',call_detail_period_basis:'score_date',call_details:demoAwardPeriodEntries(identity).filter(e=>new Date(demoCallNow())>=new Date(e.cutoff_at)).sort((a,b)=>a.id.localeCompare(b.id)).map(demoCallRevealSnapshot),awards:fixtureClone(awards),season_rows:season?fixtureClone(data.season_rows):[],accuracy_season_rows:season?fixtureClone(data.accuracy_season_rows):[],grinch_rows:season?fixtureClone(data.grinch_rows):[],rewards:fixtureClone(season?data.settings.rewards:data.rewards),engagement_eligible_ids:eligible.map(p=>p.id),engagement_shared:eligible.map(p=>({id:p.id,name:p.display_name}))};
}

function demoAwardReleaseStatus(identity,source=null){
 const saved=fixtureRows.award_releases?.[identity.key];return {period_kind:identity.period_kind,period_start:identity.period_start,period_end:identity.period_end,revision:saved?.revision||0,released:!!saved,released_at:saved?.released_at||null,source_changed:!!saved&&!!source&&saved.fingerprint!==JSON.stringify(source)};
}

function demoAwardPublicSource(saved){
 const s=fixtureClone(saved.source),memberIds=new Set(fixtureRows.club_memberships.map(m=>m.user_id)),activeIds=new Set(fixtureRows.players.filter(p=>p.active!==false&&memberIds.has(p.user_id)).map(p=>p.id));
 for(const award of s.awards)if(award.key==='engagement'){const names=new Set(s.engagement_shared.filter(p=>activeIds.has(p.id)).map(p=>p.name));award.winners=award.winners.filter(w=>names.has(w.name));}
 delete s.engagement_eligible_ids;delete s.engagement_shared;delete s.call_details;delete s.call_detail_period_basis;delete s.award_period_basis;return s;
}

demoCallBoard=function(args={}){
 const data=demoRawCallBoard(args),staff=demoCanReleaseAwards(),seasonLive=fixtureRows.make_your_call.settings.season_awards_visibility!=='on_release',identities={weekly:demoAwardIdentity({p_period_kind:'weekly',p_period_date:data.week_start}),monthly:demoAwardIdentity({p_period_kind:'monthly',p_period_date:data.month_start}),season:demoAwardIdentity({p_period_kind:'season',p_season:data.season})};
 data.release_defaults=demoAwardReleaseDefaults();data.can_release_awards=staff;data.season_awards_live=seasonLive;data.award_releases={};
 for(const [kind,id]of Object.entries(identities)){const status=demoAwardReleaseStatus(id,staff?demoAwardSource(id):null);data.award_releases[kind]={...status,...(kind==='season'?{live:seasonLive}:{} )};}
 data.period_awards=data.period_awards.map(a=>{
  const id=identities[a.cadence],saved=fixtureRows.award_releases?.[id.key],status=data.award_releases[a.cadence];
  if(staff)return {...a,released:status.released,preview:true,release_revision:status.revision};
  const published=saved?demoAwardPublicSource(saved).awards.find(p=>p.key===a.key):null;
  return {...(published||a),winners:published?.winners||[],accuracy_rows:published?.accuracy_rows||[],released:!!published,preview:false,release_revision:status.revision};
 });
 if(!staff){
  const saved=fixtureRows.award_releases?.[identities.season.key];if(!seasonLive){const source=saved?demoAwardPublicSource(saved):null;data.season_rows=source?.season_rows||[];data.accuracy_season_rows=source?.accuracy_season_rows||[];data.grinch_rows=source?.grinch_rows||[];if(source)data.settings.rewards={...data.settings.rewards,...Object.fromEntries(Object.entries(source.rewards).filter(([key])=>key.startsWith('season_')||key==='grinch'||key==='grinch_claim'))};}
  data.accuracy_week_rows=data.period_awards.find(a=>a.key==='weekly_accuracy'&&a.cadence==='weekly')?.accuracy_rows||[];
  data.engagement={...data.engagement,awards:[]};
 }
 data.calls=data.calls.map(c=>{
  const published=demoCallPublishedSnapshot(c.id),clone={...c};for(const key of DEMO_CALL_REVEAL_FIELDS)if(key!=='id')delete clone[key];
  clone.details_released=!!published;clone.predicted_runs=null;clone.club_call=null;clone.result=null;clone.votes=[];clone.vote_count=null;
  if(c.can_record_result)clone.official_result=fixtureClone(c.result);
  if(published){Object.assign(clone,fixtureClone(published.details),{details_released:true,revealed_at:published.revealed_at,reveal_period_kind:published.reveal_period_kind,reveal_period_start:published.reveal_period_start,voting_open:false});}
  return clone;
 });
 return data;
};

const demoRawEngagementBundle=demoEngagementBundle;

demoEngagementBundle=function(playerId){
 const data=demoRawEngagementBundle(playerId),a=data.award,identity=demoAwardIdentity({p_period_kind:a.cadence,p_period_date:a.period_start}),saved=fixtureRows.award_releases?.[identity.key],published=saved?.source.awards.find(award=>award.key==='engagement');
 data.award_enabled=demoAwardEnabled('engagement');data.progress_complete=data.earned;data.earned=!!published&&saved.source.engagement_eligible_ids.includes(playerId);data.history=(data.history||[]).map(week=>({...week,progress_complete:week.earned,earned:false}));data.season_awards=Object.entries(fixtureRows.award_releases||{}).filter(([key,release])=>!key.startsWith('season:')&&release.source.engagement_eligible_ids.includes(playerId)&&release.source.awards.some(award=>award.key==='engagement'&&demoCallSeason(award.period_start)===data.season)).length;data.award={...a,earned:data.earned,released:!!published,release_revision:saved?.revision||0,released_at:saved?.released_at||null};if(published){data.award.reward_text=published.reward_text;data.award.claim_text=published.claim_text;}return data;
};

const demoBeforeAwardReleaseRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(!['preview_make_your_call_awards','release_make_your_call_awards'].includes(name))return demoBeforeAwardReleaseRpc(name,args);
 const ok=data=>({data:fixtureClone(data),error:null});
 try{
  if(args.p_club_id!==club.id||!demoCanReleaseAwards())throw Error('Only Club Admin, Head Coach, Coach or Captain can release awards.');
  const identity=demoAwardIdentity(args),source=demoAwardSource(identity),fingerprint=JSON.stringify(source),status=demoAwardReleaseStatus(identity,source),actor=session.user.id;
  if(name==='preview_make_your_call_awards'){
   const token=crypto.randomUUID();fixtureRows.award_release_previews[token]={identity,actor,fingerprint,revision:status.revision};const publicSource=fixtureClone(source);delete publicSource.engagement_eligible_ids;delete publicSource.engagement_shared;delete publicSource.call_details;delete publicSource.call_detail_period_basis;delete publicSource.award_period_basis;
   const open_voting_count=demoAwardOpenVotingCount(identity),period_completed=identity.period_kind==='season'||identity.period_end<=demoCallDay()&&(identity.period_kind!=='monthly'||!!fixtureRows.make_your_call.settings.award_cycle_start&&identity.period_start>=fixtureRows.make_your_call.settings.award_cycle_start),release_block_reason=!period_completed?'This award period is still in progress. Release from '+identity.period_end+' in '+fixtureRows.make_your_call.settings.timezone+'.':open_voting_count?'Voting is still open for one or more predictions in this period. Release after voting closes.':null;return ok({...status,...publicSource,preview_token:token,can_release_awards:true,period_completed,release_available_from:identity.period_end,club_today:demoCallDay(),timezone:fixtureRows.make_your_call.settings.timezone,can_release_now:period_completed&&open_voting_count===0,open_voting_count,release_block_reason});
  }
  if(!demoMatchPreparationUuid.test(args.p_request_id))throw Error('A valid save request is required.');
  const receiptKey=actor+':'+args.p_request_id,receiptFingerprint=JSON.stringify(args),receipt=fixtureRows.award_release_receipts[receiptKey];
  if(receipt){if(receipt.fingerprint!==receiptFingerprint)throw Error('This request was already used for different changes.');return ok({...receipt.result,already_saved:true});}
  if(identity.period_kind==='monthly'&&(!fixtureRows.make_your_call.settings.award_cycle_start||identity.period_start<fixtureRows.make_your_call.settings.award_cycle_start))throw Error('Choose a four-week period from the first award week onwards.');
  if(identity.period_kind!=='season'&&identity.period_end>demoCallDay())throw Error('This award period is still in progress. Release from '+identity.period_end+' in '+fixtureRows.make_your_call.settings.timezone+'.');
  if(demoAwardOpenVotingCount(identity)>0)throw Error('Voting is still open for one or more predictions in this period. Release after voting closes.');
  const preview=fixtureRows.award_release_previews[args.p_preview_token];
  if(!preview||preview.actor!==actor||preview.identity.key!==identity.key||preview.fingerprint!==fingerprint||preview.revision!==status.revision||args.p_expected_revision!==status.revision)throw Error('Award results have changed. Preview again before releasing.');
  for(const award of source.awards)if(['weekly','monthly'].includes(award.cadence)&&!fixtureRows.make_your_call.award_periods.some(p=>p.key===award.key&&p.cadence===award.cadence&&p.period_start===award.period_start))fixtureRows.make_your_call.award_periods.push(fixtureClone(award));
  const released_at=demoCallNow(),revision=status.revision+1;fixtureRows.award_releases[identity.key]={source:fixtureClone(source),fingerprint,revision,released_at,released_by:actor,season:identity.season,order:Object.values(fixtureRows.award_releases).reduce((n,s)=>Math.max(n,s.order||0),0)+1};
  const result={ok:true,already_saved:false,period_kind:identity.period_kind,period_start:identity.period_start,period_end:identity.period_end,revision,released:true,released_at};fixtureRows.award_release_receipts[receiptKey]={fingerprint:receiptFingerprint,result};return ok(result);
 }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
};

function demoSeedPublishedHistory(){
 if(fixtureRows.award_history_seeded)return;fixtureRows.award_history_seeded=true;
 const identity=demoAwardIdentity({p_period_kind:'weekly',p_period_date:demoCallDateAdd(demoCallWeek(),-1)});
 if(fixtureRows.award_releases[identity.key])return;
 demoEngagementCredit('player-jordan','prepare','history-example-preparation',identity.period_start);
 demoEngagementCredit('player-jordan','review','history-example-reflection',identity.period_start);
 const source=demoAwardSource(identity);
 fixtureRows.award_releases[identity.key]={source:fixtureClone(source),fingerprint:JSON.stringify(source),revision:1,released_at:demoCallMidnight(identity.period_end),released_by:'user-admin',season:identity.season,order:0};
}

function demoHistoryIdentity(key,saved){
 const split=key.indexOf(':'),kind=key.slice(0,split),start=key.slice(split+1),award=saved.source.awards?.[0],end=award?.period_end||(kind==='weekly'?demoCallWeekEnd(start):kind==='monthly'?demoCallMonthEnd(start):`${Number(start.slice(0,4))+1}${start.slice(4)}`);
 return {period_kind:kind,period_start:start,period_end:end,period_basis:kind==='monthly'?(saved.source.award_period_basis||'legacy_calendar'):kind,season:saved.season??demoCallSeason(start),revision:saved.revision,released_at:saved.released_at};
}

function demoHistoryCalls(saved){
 return (saved.source.call_details||[]).flatMap(details=>{const entry=fixtureRows.make_your_call.entries.find(e=>e.id===details.id);if(!entry)return [];const player=fixtureRows.players.find(p=>p.id===entry.player_id);return [{id:entry.id,player_id:entry.player_id,name:player?.display_name||'Club player',match_date:entry.match_date,format_key:entry.format_key,opposition:entry.opposition,predicted_runs:details.predicted_runs,club_call:details.club_call,vote_count:details.vote_count,result:fixtureClone(details.result),points:details.points,...(details.raw_surplus!=null&&details.format_weight!=null?{raw_surplus:details.raw_surplus,format_weight:details.format_weight}:{}),beat_club:details.beat_club,eligible:details.result?.status==='played'&&details.club_call!==null,details_released:true}];});
}

const demoBeforePredictionHistoryRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(!['get_club_prediction_results','get_club_prediction_result'].includes(name))return demoBeforePredictionHistoryRpc(name,args);
 const ok=data=>({data:fixtureClone(data),error:null});
 try{
  if(args.p_club_id!==club.id)throw Error('Club membership is required.');demoCallMember();demoSeedPublishedHistory();
  const releases=Object.entries(fixtureRows.award_releases).map(([key,saved])=>({key,saved,identity:demoHistoryIdentity(key,saved)}));
  if(name==='get_club_prediction_results'){
   const season=args.p_season??null;if(season!==null&&(!Number.isInteger(season)||season<1900||season>2200))throw Error('Choose a valid season.');
   const seasons=[...new Set(releases.map(r=>r.identity.season))].sort((a,b)=>b-a);
   return ok({season,seasons,timezone:fixtureRows.make_your_call.settings.timezone,releases:releases.filter(r=>season===null||r.identity.season===season).sort((a,b)=>String(b.saved.released_at).localeCompare(String(a.saved.released_at))||b.identity.period_start.localeCompare(a.identity.period_start)).map(r=>({...r.identity,award_count:r.saved.source.awards.length,call_count:demoHistoryCalls(r.saved).length}))});
  }
  if(!['weekly','monthly','season'].includes(args.p_period_kind)||typeof args.p_period_start!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(args.p_period_start))throw Error('Choose a published award period.');
  const key=args.p_period_kind+':'+args.p_period_start,saved=fixtureRows.award_releases[key];if(!saved)throw Error('These awards have not been released.');
  const source=demoAwardPublicSource(saved);
  return ok({...demoHistoryIdentity(key,saved),awards:source.awards||[],season_rows:source.season_rows||[],accuracy_season_rows:source.accuracy_season_rows||[],grinch_rows:source.grinch_rows||[],rewards:source.rewards||{},calls:demoHistoryCalls(saved)});
 }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
};

function demoPrizeVisibilityV64(data){
 const permitted=demoCanReleaseAwards();
 const hide=value=>Array.isArray(value)?value.map(hide):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['rewards','reward_text','claim_text'].includes(key)).map(([key,v])=>[key,hide(v)])):value;
 return {...(permitted?data:hide(data)),can_view_prizes:permitted};
}

const demoBeforePrizeVisibilityV64=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 const result=await demoBeforePrizeVisibilityV64(name,args);
 if(!result.error&&['get_make_your_call','get_make_your_call_periods','get_my_engagement','save_my_training_checkin','get_club_prediction_result'].includes(name))return {...result,data:demoPrizeVisibilityV64(result.data)};
 return result;
};

function demoResultDate(e){return e.result?.score_date||e.match_date;}

function demoResultWeek(e){return e.result?.score_date?demoCallWeek(e.result.score_date):e.week_start;}

function demoResultSeason(e){return e.result?.score_date?demoCallSeason(e.result.score_date):e.season;}

const demoScorecardTeams=createScorecardTeamDemo(()=>demoSelections,id=>demoScorecards[id],()=>fixtureRows.players);

const demoBeforeScorecardSeed=demoSeedClub;

demoSeedClub=function(){demoBeforeScorecardSeed();demoScorecards={};demoScorePlayerLinks=[];if(demoSelections)demoSelections.result_sources={};};

function demoScorecardPreview(id){const card=demoScorecards[id];if(!card)throw Error('Load the fictional scorecard again.');return {snapshot_id:id,scorecard:fixtureClone(card),player_links:fixtureClone(demoScorePlayerLinks)};}

const demoPreviousEdge=window.__fixtureDb.functions.invoke;

window.__fixtureDb.functions.invoke=async(name,args)=>{
 if(name!=='playcricket-scorecard')return demoPreviousEdge(name,args);
 try{demoTeamStaff(args.body.club_id);const players=demoTeamEditable(),s=ensureTeamReviewState(),matchId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',teamId='11111111-2222-4333-8444-555555555555';
  const card={schema_version:2,provider:'playcricket_au',match_id:matchId,url:'https://play.cricket.com.au/match/'+matchId,status:'completed',dates:[s.match_date],format_key:s.format_key,format_label:formatLabel(s.format_key),grade:'Fictional scorecard',teams:[{id:teamId,name:'Harbour Example CC'},{id:'99999999-2222-4333-8444-555555555555',name:s.opposition||'Visitors Example CC'}],warnings:['Demo only: these scores and names are fictional. No external scorecard was loaded.'],innings:[1,2].map(n=>({id:`66666666-2222-4333-8444-55555555555${n}`,team_id:teamId,number:n,complete:true,batters:players.map((p,k)=>({player_id:`77777777-2222-4333-8444-${String(k+1).padStart(12,'0')}`,name:p.display_name,status:'played',runs:n===1?[42,0,28,16][k%4]:[8,19,4,22][k%4],not_out:k%3===0,balls:k%3===0?52:30,fours:2,sixes:0,dismissal:k%3===0?'Not Out':'Caught',dismissal_text:k%3===0?'Not out':'Caught at point',importable:true}))}))};
  const selected=demoSelections.fixtures.find(f=>f.id===s.fixtureId);
  if(selected){card.dates=selected.details.days.map(d=>d.date).sort();card.grade=selected.details.grade;const ids=[...new Set(selected.slots.flatMap(slot=>[slot.d1,slot.d2]).filter(Boolean))],other=demoSelections.fixtures.find(f=>f.id!==selected.id&&f.details.days.some(d=>card.dates.includes(d.date))),replacement=other?.slots.flatMap(slot=>[slot.d1,slot.d2]).find(id=>id&&!ids.includes(id));if(replacement&&ids.length)ids[ids.length-1]=replacement;card.teams[0].lineup_available=true;card.teams[0].players=ids.map(id=>({player_id:'demo-'+id,name:demoSelections.roster.find(p=>p.id===id)?.name||'Demo player'}));}
  const snapshot=crypto.randomUUID();demoScorecards[snapshot]=card;return {data:{snapshot_id:snapshot,scorecard:fixtureClone(card)},error:null};
 }catch(e){return {data:null,error:{message:e.message}};}
};

async function demoApplyMatchScores(review,values,saved){
 const i=values.scorecard_import;if(!i)return [];
 const preview=demoScorecardPreview(i.snapshot_id),card=preview.scorecard,inn=card.innings.find(x=>x.id===i.innings_id&&x.team_id===i.team_id&&x.number===values.innings_number);
 if(!inn||!card.dates.includes(values.match_date)||card.format_key!==values.format_key)throw Error('Check the scorecard team, date, format and innings.');
 const imported=[];
 for(const row of i.rows){
  const batter=inn.batters.find(b=>b.player_id===row.source_player_id),p=demoTeamEditable().find(x=>x.id===row.player_id);
  if(!p||!batter?.importable||!demoCallCanRecord({player_id:row.player_id}))throw Error('Result permission and player edit access are required.');
  const changed=values.rows.find(r=>r.player_id===row.player_id);let m=demoSharedMatch(row.player_id,values,saved.find(r=>r.player_id===row.player_id)?.match_id||row.match_id);
  if(!changed&&(m?.updated_at||null)!==(row.expected_match_updated_at||null))throw Error('The innings changed. Reload before saving.');
  if(changed&&(changed.batting_to_plan==='did_not_bat')!==(batter.status==='did_not_bat'))throw Error('DNB and the imported score disagree.');
  const score=batter.status==='did_not_bat'?'':String(batter.runs)+(batter.not_out?'*':'');if(m?.score_text&&m.score_text!==score&&!String(i.reason||'').trim())throw Error('Give a short reason for correcting an existing score.');
  if(!m){m={id:crypto.randomUUID(),match_date:values.match_date,format_key:values.format_key,opposition:values.opposition,innings_number:values.innings_number,created_by:session.user.id,created_at:fixtureNow(),coach_feedback:[],player_reflection:null,player_note:'',player_video:null};fixtureRows.feedback[row.player_id].matches.unshift(m);}
  const entry=fixtureRows.make_your_call.entries.find(e=>e.player_id===row.player_id&&e.match_date===values.match_date&&e.format_key===values.format_key&&(fixtureRows.match_preparations.find(p=>p.id===e.preparation_id)?.innings_number||1)===values.innings_number);
  if(entry){if((entry.result?.revision||0)!==(row.expected_result_revision||0))throw Error('The official result changed.');if(new Date(entry.cutoff_at)>new Date(demoCallNow()))throw Error('Record the result after the match date begins.');entry.result={score_date:row.score_date||i.score_date||values.match_date,status:batter.status,runs:batter.runs,not_out:batter.not_out,revision:(entry.result?.revision||0)+1};}
  Object.assign(m,{score_text:score,score_recorded_by:session.user.id,participation_status:batter.status,updated_at:fixtureNow(),scorecard:{...batter,score_date:row.score_date||i.score_date||values.match_date,url:card.url,confirmed_by:'Demo scorer',confirmed_at:fixtureNow()}});
  if(!review.rows.some(r=>r.player_id===row.player_id))review.rows.push({player_id:row.player_id,match_id:m.id,feedback_id:null,match_created:false,feedback_created:false});
  demoScorePlayerLinks=demoScorePlayerLinks.filter(l=>l.source_player_id!==row.source_player_id);demoScorePlayerLinks.push({source_player_id:row.source_player_id,player_id:row.player_id});
  imported.push({player_id:row.player_id,match_id:m.id,official_result_updated:!!entry});
 }
 review.scorecard_id=i.snapshot_id;review.source_team_id=i.team_id;review.source_match_id=card.match_id;return imported;
}

const demoBeforeScorecardRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name==='confirm_scorecard_player'){try{demoTeamStaff(args.p_club_id);const data=await demoScorecardTeams('confirm_identity',{...args.p_values,request_id:args.p_request_id});if(data.player_id){demoScorePlayerLinks=demoScorePlayerLinks.filter(l=>l.source_player_id!==data.source_player_id);demoScorePlayerLinks.push({source_player_id:data.source_player_id,player_id:data.player_id});}return {data,error:null};}catch(error){return {data:null,error:{code:'P0001',message:error.message}};}}
 if(name==='playcricket_team_api'){try{demoTeamStaff(args.p_club_id);return {data:await demoScorecardTeams(args.p_action,args.p_data),error:null};}catch(error){return {data:null,error:{code:'P0001',message:error.message}};}}
 if(name==='get_match_review_scorecard'){try{demoTeamStaff(args.p_club_id);return {data:demoScorecardPreview(args.p_snapshot_id),error:null};}catch(e){return {data:null,error:{message:e.message}};}}
 const backup=name==='save_team_match_review'?fixtureClone(fixtureRows):null,links=fixtureClone(demoScorePlayerLinks),out=await demoBeforeScorecardRpc(name,args);
 if(out.error){if(backup){Object.assign(fixtureRows,backup);demoScorePlayerLinks=links;}return out;}
 if(['get_team_review_roster','get_team_match_review','get_team_review_session'].includes(name))for(const p of out.data.players||[]){const m=fixtureRows.feedback[p.player_id]?.matches.find(m=>m.id===p.match_id),entry=fixtureRows.make_your_call.entries.find(e=>e.player_id===p.player_id&&e.match_date===(out.data.review?.match_date||args.p_match_date)&&e.format_key===(out.data.review?.format_key||args.p_format_key)&&(fixtureRows.match_preparations.find(v=>v.id===e.preparation_id)?.innings_number||1)===(out.data.review?.innings_number||args.p_innings_number||1));Object.assign(p,{can_record_score:demoCallCanRecord({player_id:p.player_id}),score_text:m?.score_text||'',scorecard:m?.scorecard||null,official_result_revision:entry?.result?.revision||0});}
 if(name==='get_team_review_session'){const r=fixtureRows.team_review_sessions.find(r=>r.id===args.p_review_id);Object.assign(out.data.review,{source_team_id:r.source_team_id,source_match_id:r.source_match_id});out.data.scorecard_preview=r.scorecard_id?demoScorecardPreview(r.scorecard_id):null;out.data.sibling_reviews=fixtureRows.team_review_sessions.filter(x=>!x.deleted&&x.author_user_id===r.author_user_id&&x.group_id===r.group_id&&x.format_key===r.format_key&&(r.source_match_id?x.source_match_id===r.source_match_id:x.match_date===r.match_date&&demoInningsOpponent(x.opposition)===demoInningsOpponent(r.opposition))).map(demoTeamMetadata);}
 return out;
};

let demoClubMessageRecords=[];

const demoPhoneReady=userId=>['user-alex','user-coach'].includes(userId);

const previousPhoneFixtureRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name==='get_club_member_phone_status'){window.__fixtureLog(name,args);return membership.permission_role==='admin'&&args.p_club_id===club.id?{data:fixtureRows.club_memberships.filter(m=>m.club_id===club.id).map(m=>({user_id:m.user_id,phone_ready:demoPhoneReady(m.user_id)})),error:null}:{data:null,error:{message:'Club Admin access required'}};}
 if(name==='get_player_plan_reminder_overview')return {data:{cooldown_hours:48,email_mode:'preview',reminders:demoClubMessageRecords.filter(m=>m.kind==='plan_reminder').flatMap(m=>(m.player_ids||[]).map(id=>({id:m.id,player_id:id,format_key:'',created_at:m.created_at,in_app_at:m.created_at})))},error:null};
 if(name!=='club_messages_api'&&name!=='phone_app_api')return previousPhoneFixtureRpc(name,args);
 window.__fixtureLog(name,args);
 if(name==='phone_app_api')return {data:{configured:false,preferences:{messages:true,coaching:true}},error:null};
 const staff=['admin','head_coach','coach','captain'].includes(membership.permission_role)||demoTemporaryBattingCaptain(),uid=session.user.id,action=args.p_action;
 if(!demoClubMessageRecords.length)demoClubMessageRecords=[{id:'demo-message-welcome',sender_id:'user-coach',sender:'Casey Reid',title:'Ready for Thursday?',body:'Have a look at the training ideas from your plan before our next session. Bring one thing you want to work on.',target:'howwetrain',created_at:fixtureNow(),user_ids:['user-alex','user-jordan'],opened:{},email_requested:false}];
 const staffMembers=[...new Map(fixtureRows.club_memberships.map(m=>[m.user_id,m])).values()].filter(m=>m.club_id===club.id&&m.user_id!==uid&&(['admin','head_coach','coach','captain'].includes(m.permission_role)||['coach_captain','both'].includes(m.involvement))).map(m=>({user_id:m.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name||'Club staff',phone_ready:demoPhoneReady(m.user_id),role:m.permission_role,default_included:['admin','head_coach','coach','captain'].includes(m.permission_role)}));
 if(action==='context')return {data:{can_send:staff,can_remind:membership.permission_role==='admin',email_mode:'preview',players:staff?fixtureWorkspacePlayers().filter(p=>p.can_edit).map(p=>({id:p.id,user_id:fixtureRows.players.find(x=>x.id===p.id)?.user_id,name:p.display_name,groups:p.groups||[],phone_ready:demoPhoneReady(fixtureRows.players.find(x=>x.id===p.id)?.user_id),overdue_plan_sections:playerPlanDeadlineState(p).overdue,next_reminder_at:null})):[],staff:staff?staffMembers:[]},error:null};
 if(action==='delete'){
  const d=args.p_data||{},box=d.box||'inbox',ids=d.ids;
  if(!['inbox','sent'].includes(box)||!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!demoClubMessageRecords.some(r=>r.id===id&&(box==='sent'?r.sender_id===uid:r.user_ids.includes(uid)))))return {data:null,error:{message:'Choose messages from your own list'}};
  for(const id of new Set(ids)){const r=demoClubMessageRecords.find(r=>r.id===id);if(box==='sent')r.sender_deleted_at??=fixtureNow();else{r.deleted??={};r.deleted[uid]??=fixtureNow();}}
  return {data:{deleted:true,ids:[...new Set(ids)],box},error:null};
 }
 if(action==='badge')return {data:{unread:demoClubMessageRecords.filter(r=>r.user_ids.includes(uid)&&!r.deleted?.[uid]&&!r.opened[uid]).length},error:null};
 if(action==='list')return {data:{can_send:staff,inbox:demoClubMessageRecords.filter(r=>r.user_ids.includes(uid)&&!r.deleted?.[uid]).map(r=>({...r,opened_at:r.opened[uid]||null})),unread:demoClubMessageRecords.filter(r=>r.user_ids.includes(uid)&&!r.deleted?.[uid]&&!r.opened[uid]).length,sent:staff?demoClubMessageRecords.filter(r=>r.sender_id===uid&&!r.sender_deleted_at).map(r=>({...r,recipients:r.user_ids.length,opened:Object.keys(r.opened).length,email_total:r.email_queued||0,email_sent:0,push_sent:0,email_failed:0})):[]},error:null};
 if(action==='open'){const r=demoClubMessageRecords.find(r=>r.id===args.p_data?.id&&r.user_ids.includes(uid)&&!r.deleted?.[uid]);if(!r)return {data:null,error:{message:'Message unavailable'}};r.opened[uid]=fixtureNow();return {data:{opened:true},error:null};}
 if(action==='send'){
  if(!staff)return {data:null,error:{message:'Staff access required'}};
  const d=args.p_data,previous=demoClubMessageRecords.find(r=>r.request_id===d.request_id&&r.sender_id===uid);if(previous)return {data:{id:previous.id,recipients:previous.user_ids.length,already_sent:true},error:null};
  if(d.kind==='plan_reminder'&&membership.permission_role!=='admin')return {data:null,error:{message:'Club Admin access required'}};
  const ids=[...new Set([...fixtureRows.players.filter(p=>d.player_ids.includes(p.id)).map(p=>p.user_id),...(d.staff_user_ids||[])])];
  const email_queued=ids.filter(id=>d.email||(d.email_user_ids||[]).includes(id)||!demoPhoneReady(id)).length;
  const r={...d,email_queued,id:'demo-message-'+crypto.randomUUID(),sender_id:uid,sender:userProfile.display_name,user_ids:ids,created_at:fixtureNow(),opened:{},email_requested:d.email};demoClubMessageRecords.unshift(r);
  return {data:{id:r.id,recipients:ids.length,already_sent:false,email_queued},error:null};
 }
 return {data:null,error:{message:'Unsupported example action'}};
};

let demoSelections=null;

function demoSelectionAccountEmail(profile){return profile.email||profile.user_id.replace('user-','')+'@example.test';}

function demoMatchSelectionAccounts(target=null){
 const state=demoSelections;if(state.access.status==='disabled')return;
 const key=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' '),matches=[];
 for(const player of state.roster){
  if(!player.active||player.user_id||player.auto_link_disabled||!player.account_email||state.roster.some(other=>other.id!==player.id&&other.account_email===player.account_email))continue;
  const accounts=fixtureRows.club_memberships.filter(m=>m.club_id===club.id&&['player','both'].includes(m.involvement)).map(m=>fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)).filter(p=>p&&p.email_verified!==false&&!p.deleted_at&&!(p.banned_until&&new Date(p.banned_until)>new Date())&&key(demoSelectionAccountEmail(p))===player.account_email&&key(p.display_name)===key(player.name)&&!state.roster.some(r=>r.user_id===p.user_id));
  if(accounts.length===1&&(!target||accounts[0].user_id===target))matches.push([player,accounts[0].user_id]);
 }
 for(const [player,uid] of matches)player.user_id=uid;
 if(matches.length)state.roster_revision++;
}

function demoDuplicateSelection(fixtures,ids){
 const picks=[],key=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
 for(const f of fixtures){if(f.details.cancelled)continue;f.details.days.forEach((day,j)=>f.slots.forEach((slot,position)=>{const player=demoSelections.roster.find(p=>p.id===slot['d'+(j+1)]);if(player)picks.push({fixture:f,day,position,player,nameKey:key(player.name)});}));}
 for(let i=0;i<picks.length;i++)for(let j=i+1;j<picks.length;j++){const first=picks[i],second=picks[j];if(first.nameKey!==second.nameKey||!ids.includes(first.fixture.id)&&!ids.includes(second.fixture.id)||!seOverlap(first.day,second.day,first.fixture.details,second.fixture.details))continue;
  return `${first.player.name} is already selected in overlapping games on ${first.day.date} (${first.fixture.details.grade} at ${first.day.start||'time not set'} and ${second.fixture.details.grade} at ${second.day.start||'time not set'}). Change the player or fixture time.`;
 }
 return '';
}

function seedDemoSelections(){
 const names=['Alex Morgan','Jordan Lee','Taylor Quinn','Riley Cooper','Sam Patel','Chris Bell','Jamie Ford','Blake Hall','Drew Mason','Noah Reed','Will Scott','Evan Brooks','Charlie Gray','Luca Hayes','Mitch Lane','Oliver King','Max Taylor','Isaac Wood','Leo James','Ben Parker','Jack Smith','Finn West','Oscar Hill','Harry Cole','Tom Green','Nathan Ross','Eli Ward','Kane Adams'];
 const roster=names.map((name,i)=>({id:'selection-player-'+i,name,grade:i<13?'1st Grade':'2nd Grade',external_id:'EXAMPLE-'+(100+i),active:true,user_id:i===0?'user-alex':i===1?'user-jordan':i===2?'user-taylor':null,batting:i%13<6?'top':'lower',bowling:i%13>=7?'pace':i%13===6?'spin':'none',bowling_load:'frontline',spin_style:i%13===6?(i<13?'off_spin':'leg_spin'):'unknown',keeper:i%13===5,availability:{revision:1,usual_available:false,blocks:[],available_dates:['2026-10-10','2026-10-17'].filter(date=>!(i===13&&date==='2026-10-17')&&!(i===24&&date==='2026-10-10')),checked_at:'2026-10-06T08:00:00Z'}}));
 roster[6].batting='middle';
 for(const role of ['batting','bowling','bowling_load','spin_style','keeper'])roster[24][role]=roster[13][role];
 const days=[{date:'2026-10-10',start:'12:00'},{date:'2026-10-17',start:'12:00'}];
 const f=(id,grade,n)=>({id,club_id:club.id,revision:1,publication:0,published:null,details:{grade,format:'long_form',overs:null,captain_id:null,match_roles:Object.fromEntries(['d1','d2'].map(day=>[day,{captain_id:roster[n+1].id,captain_manual:true,keeper_id:roster[n+5].id,keeper_manual:false}])),competition:'Example District',opposition:'Harbour Visitors',ground:'Example Oval',meeting:'Meet at 11:15 am.',days:structuredClone(days),brackets:n===13,min_quicks:3,min_batters:5,staff:['user-coach']},slots:Array.from({length:11},(_,i)=>({d1:roster[n+i].id,d2:roster[n===13&&i===0?24:n+i].id}))});
 demoSelections={access:{mode:'bundle',status:'pilot',timezone:'Australia/Sydney',revision:1,head_selector_id:'user-coach',fixture_defaults:{revision:0,rows:[]}},roster_revision:1,roster,fixtures:[f('selection-first','1st Grade',0),f('selection-second','2nd Grade',13)],group_links:[],selectors:['user-coach'],review_posts:{},posts:{},history:{},receipts:{},billing:{pricing:{annual_price_cents:null,currency:'AUD',trial_days:21,revision:1},subscription:null,history:[]}};
}

function demoMatchGroups(){return fixtureGroups.map(g=>({...g,captain_user_ids:g.captain_user_ids||fixtureRows.club_access_grants.filter(a=>a.club_id===club.id&&a.scope==='playing_group'&&a.playing_group_id===g.id&&(a.can_view||a.can_edit)&&fixtureRows.club_memberships.some(m=>m.user_id===a.user_id&&m.club_id===club.id&&m.permission_role==='captain')).map(a=>a.user_id)}));}

function demoCaptainUsers(d){return d.match_roles?[...new Set(Object.values(d.match_roles).map(r=>demoSelections.roster.find(p=>p.id===r.captain_id&&p.active)?.user_id).filter(id=>id&&fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===id)))]:d.captain_id?[d.captain_id]:[];}

function demoConversations(uid){
 const state=demoSelections,member=fixtureRows.club_memberships.find(m=>m.club_id===club.id&&m.user_id===uid),selector=state.selectors.includes(uid)||state.access.head_selector_id===uid,out=[];
 if(!member)return out;
 const key=x=>String(x||'').trim().toLowerCase(),week=x=>{const d=new Date(x+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
 for(const f of state.fixtures){
  if(f.details.cancelled)continue;const d=f.details,start=d.days[0].date,level=seGradeLevel(d.competition,d.grade,state);if(!level)continue;
  const eligible=state.fixtures.filter(p=>p.published&&!p.published.details.cancelled&&key(p.published.details.competition)===key(d.competition)&&(p.published.details.format||'')===(d.format||'')&&(p.published.details.season||'')===(d.season||'')&&week(p.published.details.days[0].date)<week(start)&&new Date(start)-new Date(p.published.details.days[0].date)<=120*86400000),previousWeek=eligible.map(p=>week(p.published.details.days[0].date)).sort().at(-1);
  for(const id of new Set(f.slots.flatMap(s=>[s.d1,s.d2]).filter(Boolean))){
   const prior=eligible.filter(p=>week(p.published.details.days[0].date)===previousWeek&&p.published.slots.some(s=>s.d1===id||s.d2===id)).sort((a,b)=>(seGradeLevel(b.published.details.competition,b.published.details.grade,state)??Infinity)-(seGradeLevel(a.published.details.competition,a.published.details.grade,state)??Infinity))[0];
   if(!prior)continue;const old=prior.published.details,oldLevel=seGradeLevel(old.competition,old.grade,state);if(!oldLevel||level<=oldLevel||!(selector||['coach','head_coach'].includes(member.permission_role)||demoCaptainUsers(old).includes(uid)))continue;
   const movement_key=JSON.stringify([prior.id,old.grade,d.grade,d.competition,d.format,start]),saved=state.conversation_status?.[f.id+':'+id+':'+movement_key];
   out.push({fixture_id:f.id,roster_id:id,name:state.roster.find(p=>p.id===id)?.name||'Player',previous_grade:old.grade,grade:d.grade,competition:d.competition,format:d.format,date:start,movement_key,spoken_at:saved?.spoken_at||null,spoken_by:saved?.spoken_by||null,revision:saved?.revision||0});
  }
 }
 const rounds=new Map();for(const f of state.fixtures){if(f.details.cancelled||f.no_play)continue;const d=f.details,k=JSON.stringify([week(d.days[0].date),key(d.competition),d.season||'',d.format||'']);if(!rounds.has(k))rounds.set(k,[]);rounds.get(k).push(f);}
 for(const fixtures of rounds.values()){
  const sample=fixtures[0].details,currentWeek=week(sample.days[0].date),same=d=>key(d.competition)===key(sample.competition)&&(d.format||'')===(sample.format||'')&&(d.season||'')===(sample.season||'');
  const end=p=>p.published.details.days.map(day=>day.date).sort().at(-1);
  const eligible=state.fixtures.filter(p=>p.published&&!p.published.details.cancelled&&!p.no_play&&same(p.published.details)&&end(p)<currentWeek&&new Date(currentWeek)-new Date(end(p))<=120*86400000),previousWeek=eligible.map(p=>week(end(p))).sort().at(-1);
  const people=new Set();for(const p of eligible.filter(p=>week(end(p))===previousWeek))for(const slot of p.published.slots)for(const id of [slot.d1,slot.d2])if(id)people.add(id);
  for(const id of people){const person=state.roster.find(p=>p.id===id);if(!person?.active)continue;
   if(state.fixtures.some(f=>!f.details.cancelled&&same(f.details)&&f.details.days.some((day,i)=>week(day.date)===currentWeek&&f.slots.some(slot=>slot['d'+(i+1)]===id))))continue;
   const prior=eligible.filter(p=>week(end(p))===previousWeek&&p.published.slots.some(slot=>slot.d1===id||slot.d2===id)).sort((a,b)=>end(b).localeCompare(end(a))||(seGradeLevel(b.published.details.competition,b.published.details.grade,state)||0)-(seGradeLevel(a.published.details.competition,a.published.details.grade,state)||0))[0];
   const previous=prior.published.details;if(!(selector||['coach','head_coach'].includes(member.permission_role)||demoCaptainUsers(previous).includes(uid)))continue;
   const f=[...fixtures].sort((a,b)=>Number(b.details.grade===previous.grade)-Number(a.details.grade===previous.grade)||a.details.days[0].date.localeCompare(b.details.days[0].date)||a.id.localeCompare(b.id))[0],d=f.details;
   const movement_key=JSON.stringify(['left_out',prior.id,currentWeek,key(d.competition),d.season||null,d.format]),saved=Object.entries(state.conversation_status||{}).find(([k])=>k.endsWith(':'+id+':'+movement_key))?.[1];
   const availability=d.days.every(day=>seDayStatus(person,day)==='available')?'available':d.days.some(day=>person.availability?.unavailable_dates?.includes(day.date))?'unavailable':'unknown';
   out.push({fixture_id:f.id,roster_id:id,name:person.name,previous_grade:previous.grade,grade:d.grade,competition:d.competition,format:d.format,date:d.days[0].date,movement_key,kind:'left_out',availability,spoken_at:saved?.spoken_at||null,spoken_by:saved?.spoken_by||null,revision:saved?.revision||0});
  }
 }
return out;
}

function demoSelectionIssues(f){if(f.details.cancelled)return [];const out=[];f.details.days.forEach((d,i)=>{const c=seCounts(f,demoSelections.roster,i);if(c.players>11)out.push({level:'error',code:'over_team',text:`Day ${i+1}: ${c.players} players selected; move or clear ${c.players-11} before sending or publishing`});else if(c.players<11)out.push({level:c.players>0?'warning':'error',code:'short_team',text:`Day ${i+1}: ${c.players} of 11 places filled`});if(c.quicks<f.details.min_quicks)out.push({level:'warning',text:`Day ${i+1}: only ${c.quicks} frontline quicks`});if(!c.keepers&&!f.details.match_roles?.['d'+(i+1)]?.keeper_id)out.push({level:'warning',text:`Day ${i+1}: no wicketkeeper`});f.slots.forEach(sl=>{const p=demoSelections.roster.find(p=>p.id===sl['d'+(i+1)]);if(p&&seDayStatus(p,d)!=='available')out.push({level:'error',text:p.name+': '+seDayStatus(p,d)+' on '+d.date});if(p&&demoSelections.fixtures.some(other=>other.id!==f.id&&!other.details.cancelled&&other.details.days.some((day,j)=>seOverlap(d,day,f.details,other.details)&&other.slots.some(slot=>slot['d'+(j+1)]===p.id))))out.push({level:'error',text:p.name+' is also selected in an overlapping game on '+d.date});});});if(f.slots.length>11&&!out.some(issue=>issue.code==='over_team'))out.push({level:'error',code:'over_slots',text:'Draft has more than 11 places; move or clear the extra places before sending or publishing'});return out.concat(seMatchRoleIssues(f,f.details.match_roles||{}).map(i=>({...i,match_role:true})));}

function demoPublicationHead(now=new Date()){
 const a=demoSelections.access,today=now.toLocaleDateString('en-CA',{timeZone:a.timezone||'Australia/Sydney'}),member=id=>fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===id);
 return a.publication_delegate_id&&demoSelections.selectors.includes(a.publication_delegate_id)&&member(a.publication_delegate_id)&&today>=a.publication_delegate_from&&today<=a.publication_delegate_until?a.publication_delegate_id:member(a.head_selector_id)?a.head_selector_id:null;
}

function demoSyncRepublicationAlerts(){
 const head=demoPublicationHead(),pending=head?demoSelections.fixtures.filter(f=>f.published&&seDraftChanged(f)&&!seFixtureLocked(f)):[];
 demoClubMessageRecords=demoClubMessageRecords.filter(m=>!m.republication_fixture||pending.some(f=>f.id===m.republication_fixture&&f.publication===m.republication_version&&m.user_ids.includes(head)));
 let count=0;for(const f of pending){if(demoClubMessageRecords.some(m=>m.republication_fixture===f.id))continue;
  demoClubMessageRecords.unshift({id:'demo-republication-'+crypto.randomUUID(),sender_id:null,sender:'Club Batting',title:'Team changes need republication',body:f.details.grade+' has saved changes. Players still see the previous team. Review and republish from the Selection Board.',target:'teams',created_at:fixtureNow(),user_ids:[head],opened:{},email_requested:false,republication_fixture:f.id,republication_version:f.publication});count++;
 }return count;
}

const previousSelectionFixtureRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name==='get_selection_signup_followup'){
  if(!demoSelections)seedDemoSelections();if(args.p_club_id!==club.id)return {data:null,error:{message:'Club membership required'}};
  const uid=session.user.id,allowed=demoSelections.access.status!=='disabled'&&(['admin','captain'].includes(membership.permission_role)||demoSelections.access.head_selector_id===uid),people=allowed?demoSelections.roster.filter(p=>p.active&&(!p.user_id||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===p.user_id))).map(p=>({id:p.id,name:p.name,grade:p.grade,status:p.auto_link_disabled?'link':'signup'})).sort((a,b)=>a.name.localeCompare(b.name)):[];
  return {data:{can_view:allowed,players:people,...(allowed?{player_join_token:club.player_join_token,signup_open:club.player_signup_open!==false}:{})},error:null};
 }
 if(name==='get_my_platform_role')return {data:platformRole,error:null};
 if(name==='can_bootstrap_platform_owner')return {data:false,error:null};
 if(name==='platform_expire_pending_club_invitations')return {data:null,error:null};
 if(name==='club_messages_api'&&demoSelections)demoSyncRepublicationAlerts();
 if(name!=='club_selections_api')return previousSelectionFixtureRpc(name,args);
 if(!demoSelections)seedDemoSelections();const state=demoSelections,action=args.p_action,d=args.p_data||{},uid=session.user.id,selector=state.selectors.includes(uid)||state.access.head_selector_id===uid,admin=membership.permission_role==='admin',manager=admin||selector;
 const snapshot=f=>({details:structuredClone(f.details),slots:structuredClone(f.details.cancelled?[]:f.slots),players:state.roster.filter(p=>f.slots.some(s=>s.d1===p.id||s.d2===p.id)).map(p=>({id:p.id,name:p.name,batting:p.batting,bowling:p.bowling,bowling_load:p.bowling_load,spin_style:p.spin_style||'unknown',keeper:p.keeper}))});
 const current=f=>f.review?.draft_revision===f.revision&&JSON.stringify({...f.review,draft_revision:undefined})===JSON.stringify(snapshot(f));
 const reviewAudience=f=>!!f&&(selector||demoSeasonGroups(uid).some(g=>g.id===demoSharedFixtureGroup(f)?.id)||demoTemporaryCaptainDays(uid).length>0&&demoCaptainUsers(f.details).includes(uid));
 const captain=membership.permission_role==='captain'||demoSeasonGroups(uid).length>0||demoTemporaryCaptainDays(uid).length>0;
 const audience=f=>selector||demoSeasonGroups(uid).some(g=>g.id===demoSharedFixtureGroup(f)?.id)||f.published?.details.captain_id===uid||f.published?.slots.some(s=>state.roster.some(p=>p.user_id===uid&&(p.id===s.d1||p.id===s.d2)));
 const ok=data=>({data:structuredClone(data),error:null}),bad=message=>({data:null,error:{message,code:'P0001'}});
 if(['subscription_context','preview_subscription'].includes(action)&&!seCanReadSubscriptions())return bad('Platform subscription access required');
 if(['set_selection_pricing','save_subscription'].includes(action)&&!seCanManageSubscriptions())return bad('Platform commercial permission required');
 if(action==='subscription_context')return ok({can_manage:seCanManageSubscriptions(),pricing:state.billing.pricing,subscription:state.billing.subscription,access:state.access,inherited_trial_days:60,default_trial_days:state.billing.pricing.trial_days||21,calendars:[{code:'demo',label:'Example club year · 1 July to 30 June'}],history:state.billing.history});
 if(action==='preview_subscription'){try{return ok(demoSelectionsQuote(d));}catch(e){return bad(e.message);}}
 if(['access','context'].includes(action))demoMatchSelectionAccounts(manager?null:uid);
 if(action==='access')return ok({...state.access,enabled:state.access.status!=='disabled',selector,admin});
 if(action==='context')demoSyncRepublicationAlerts();
 if(action==='context')return ok({...state,receipts:undefined,posts:undefined,review_posts:undefined,history:undefined,selector,admin,captain,can_view_board:selector||captain,can_view_club_availability:manager||captain,availability_mode:'opt_in',head_selector:demoPublicationHead()===uid,publication_head_id:demoPublicationHead(),conversations:demoConversations(uid),conversation_status:undefined,can_delegate:admin||state.access.head_selector_id===uid,can_hand_back:admin||state.access.head_selector_id===uid||state.access.publication_delegate_id===uid,reviews:state.fixtures.filter(reviewAudience).map(f=>({id:f.id,snapshot:{...snapshot(f),draft_revision:f.revision},sent_at:f.review_requested_at||fixtureNow(),draft_changed:false,captain_name:f.details.match_roles?[...new Set(Object.values(f.details.match_roles).map(r=>state.roster.find(p=>p.id===r.captain_id)?.name).filter(Boolean))].join(' / '):fixtureRows.user_profiles.find(p=>p.user_id===f.details.captain_id)?.display_name||'Captain'})),members:manager?fixtureRows.club_memberships.map(m=>({user_id:m.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name||'Example member',email:demoSelectionAccountEmail(fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)||{user_id:m.user_id}),is_admin:m.permission_role==='admin',explicit_selector:state.selectors.includes(m.user_id),selector:state.selectors.includes(m.user_id)||state.access.head_selector_id===m.user_id})):[],roster:state.roster.filter(p=>manager||captain||p.user_id===uid).map(p=>manager?p:p.user_id===uid?{...p,account_email:undefined,auto_link_disabled:undefined}:{id:p.id,name:p.name,grade:p.grade,active:p.active,user_id:null,batting:p.batting,bowling:p.bowling,bowling_load:p.bowling_load,spin_style:p.spin_style||'unknown',keeper:p.keeper,availability:p.availability}),groups:manager?demoMatchGroups():[],batting_users:['user-alex','user-jordan','user-taylor'],fixtures:state.fixtures.filter(f=>manager||captain||f.published).map(f=>selector?{...f,can_comment:reviewAudience(f),comment_count:(state.review_posts[f.id]||[]).length,issues:demoSelectionIssues(f),can_chat:!!f.published&&audience(f)}:{id:f.id,published:f.published,publication:f.publication,can_comment:reviewAudience(f),comment_count:reviewAudience(f)?(state.review_posts[f.id]||[]).length:0,can_chat:audience(f),...(admin||captain?{details:f.details,revision:f.revision,selection_unlocked_until:f.selection_unlocked_until}:{}),...(captain?{slots:f.slots,scorecard_sync:f.scorecard_sync}:{})})});
 if(action==='review_posts')return reviewAudience(state.fixtures.find(f=>f.id===d.id))?ok(state.review_posts[d.id]||[]):bad('Team comments are private');
 if(action==='posts')return audience(state.fixtures.find(f=>f.id===d.id))?ok(state.posts[d.id]||[]):bad('Current selected team only');
 if(action==='history')return ok(state.history[d.id]||[]);
 if(['save_board','publish','send_review','history'].includes(action)&&!selector)return bad('Selector access required');
 if(['save_fixture','save_roster','import_roster','availability_batch','fixture_lock'].includes(action)&&!manager)return bad('Club Admin or selector access required');
 if(['selectors','fixture_defaults','group_links'].includes(action)&&!admin)return bad('Club Admin permission required');
 if(state.receipts[d.request_id])return ok(state.receipts[d.request_id]);
 if(['save_board','save_fixture','publish','send_review'].includes(action)){const ids=action==='save_board'?(d.fixtures||[]).map(f=>f.id):action==='save_fixture'?[d.id]:d.ids||[];if(state.fixtures.some(f=>ids.includes(f.id)&&seFixtureLocked(f)))return bad('Completed fixture is locked. Use Unlock in Selection board before making corrections.');}
 let result={saved:true};
 if(action==='set_selection_pricing'){
  if(d.revision!==state.billing.pricing.revision)return bad('Pricing changed. Reload before saving');
  Object.assign(state.billing.pricing,d,{revision:d.revision+1});
 }else if(action==='save_subscription'){
  const previous=state.billing.subscription;
  if(d.revision!==(previous?.revision||0)||d.access_revision!==state.access.revision)return bad('Subscription or access changed. Reload before saving');
  const free=d.special_rate_never_ends&&d.adjustment_percent===100;
  if(d.status==='active'&&!free&&!d.continuation_agreed)return bad('Record the club agreement before starting or renewing paid access');
  if(d.status==='trial'&&previous?.trial_started&&(previous.status!=='trial'||previous.trial_started!==d.active_from))return bad('This product trial has already started');
  let q;try{q=demoSelectionsQuote(d);}catch(e){return bad(e.message);}
  const ends=d.status==='trial'?q.active_until:free?null:d.active_until||q.active_until;
  state.billing.subscription={...d,club_id:club.id,active_until:ends,currency:previous?.currency||state.billing.pricing.currency,annual_price_cents:d.annual_price_cents??state.billing.pricing.annual_price_cents,revision:(previous?.revision||0)+1,trial_started:d.status==='trial'?d.active_from:previous?.trial_started,trial_ends:d.status==='trial'?ends:previous?.trial_ends,quote:q};
  state.billing.history.unshift({created_at:fixtureNow(),snapshot:structuredClone(state.billing.subscription)});
  Object.assign(state.access,{mode:d.mode,status:d.status==='trial'?'pilot':d.status,valid_until:ends,timezone:d.timezone,revision:state.access.revision+1});result={saved:true,quote:q,active_until:ends,ongoing_complimentary:free};
 }else if(action==='publication_delegate'){
  const a=state.access,today=new Date().toLocaleDateString('en-CA',{timeZone:a.timezone||'Australia/Sydney'}),clear=()=>Object.assign(a,{publication_delegate_id:null,publication_delegate_from:null,publication_delegate_until:null});
  if(d.revision!==a.revision)return bad('Selection responsibilities changed. Refresh before saving');
  if(d.operation==='hand_back'){if(!admin&&a.head_selector_id!==uid&&a.publication_delegate_id!==uid)return bad('Only the Head of Selections, their delegate or Club Admin can hand back');clear();}
  else if(d.operation==='delegate'){
   if(!admin&&a.head_selector_id!==uid)return bad('Only the Head of Selections or Club Admin can delegate publishing');
   if(!a.head_selector_id)return bad('Assign a Head of Selections first');
   if(d.user_id===a.head_selector_id||!state.selectors.includes(d.user_id)||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===d.user_id))return bad('Choose another assigned selector from this club');
   const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
   if(!valid(d.from)||!valid(d.until)||d.until<d.from||d.until<today)return bad('Choose a valid delegation period ending today or later');
   Object.assign(a,{publication_delegate_id:d.user_id,publication_delegate_from:d.from,publication_delegate_until:d.until});
  }else return bad('Choose Delegate or Hand back');
  a.revision++;result={saved:true,operation:d.operation};
 }else if(action==='fixture_lock'){
  const f=state.fixtures.find(f=>f.id===d.id);if(!f)return bad('Unknown fixture');if(f.revision!==d.revision)return bad('Fixture changed. Reload before changing its lock');if(typeof d.unlock!=='boolean')return bad('Choose whether to unlock or lock the fixture');if(f.published&&state.access.head_selector_id!==uid&&demoPublicationHead()!==uid)return bad('Only the current Head of Selections or Acting Head can unlock a published team');if(d.unlock&&!f.published&&!seFixtureCompleted(f))return bad('This fixture is still open');f.selection_unlocked_until=d.unlock?new Date(Date.now()+30*60000).toISOString():null;f.selection_unlocked_by=d.unlock?uid:null;f.revision++;result={saved:true,id:f.id,revision:f.revision,selection_unlocked_until:f.selection_unlocked_until};
 }else if(action==='conversation'){
  const m=demoConversations(uid).find(m=>m.fixture_id===d.fixture_id&&m.roster_id===d.roster_id&&m.movement_key===d.movement_key);
  if(!m)return bad('This selection conversation is no longer available to you');if(m.revision!==d.revision)return bad('Conversation status changed. Refresh before updating');
  const marker=m.kind==='left_out'?Object.keys(state.conversation_status||{}).find(k=>k.endsWith(':'+m.roster_id+':'+m.movement_key)):null;
  (state.conversation_status??={})[marker||m.fixture_id+':'+m.roster_id+':'+m.movement_key]={spoken_at:d.spoken?fixtureNow():null,spoken_by:d.spoken?userProfile.display_name:null,revision:m.revision+1};result={saved:true,spoken:d.spoken};
 }else if(action==='grade_levels'){
  if(!admin)return bad('Club Admin permission required');if(d.revision!==state.access.revision)return bad('Settings changed. Refresh before saving');state.access.grade_levels=structuredClone(d.rows);state.access.revision++;
 }else if(action==='availability_batch'){
  if(!manager)return bad('Club Admin or selector access required');if(!d.make_all_available)return bad('Confirm Make all players available for this date');
  const ps=state.roster.filter(p=>p.active);if(d.roster_revision!==state.roster_revision||ps.some(p=>(p.availability?.revision||0)!==d.revisions[p.id]))return bad('A calendar changed. Reload before setting this date');
  for(const p of ps){const dates=new Set(p.availability?.available_dates||[]),unavailable=new Set(p.availability?.unavailable_dates||[]),blocked=d.unavailable_ids.includes(p.id)||unavailable.has(d.date)&&!d.reset_unavailable&&!(d.available_ids||[]).includes(p.id);if(blocked){dates.delete(d.date);unavailable.add(d.date);}else{dates.add(d.date);unavailable.delete(d.date);}p.availability={...p.availability,usual_available:false,blocks:[],available_dates:[...dates].sort(),unavailable_dates:[...unavailable].sort(),revision:(p.availability?.revision||0)+1,checked_at:fixtureNow()};}
  state.availability_dates=(state.availability_dates||[]).filter(x=>x.date!==d.date).concat({date:d.date,bulk_saved_at:fixtureNow(),updated_at:fixtureNow()});result={saved:true,date:d.date,saved_at:fixtureNow()};
 }else if(action==='fixture_defaults'){
  if(!admin)return bad('Club Admin permission required');if(d.revision!==state.access.fixture_defaults.revision)return bad('Defaults changed');state.access.fixture_defaults={revision:d.revision+1,rows:structuredClone(d.rows)};
 }else if(action==='send_review'){
  if(!selector)return bad('Selector access required');
  const fs=state.fixtures.filter(f=>d.ids.includes(f.id));
  for(const f of fs){if(f.revision!==d.revisions[f.id])return bad('Draft changed');if(demoSelectionIssues(f).some(issue=>['over_team','over_slots'].includes(issue.code)))return bad('Move or clear extra players or places before sending to captains');if(!demoCaptainUsers(f.details).length&&!seMatchGroup(f,{...state,groups:demoMatchGroups()})?.captain_user_ids?.length)return bad('The match captain needs a linked club account to receive a private check');}
  const reviews=fs.filter(f=>!current(f)).map(f=>({fixture:f,snapshot:{...snapshot(f),draft_revision:f.revision}}));
  for(const row of reviews){row.fixture.review=row.snapshot;row.fixture.review_requested_at=fixtureNow();}
  result={sent:true,recipients:0};
 }else if(action==='review_post'){
  const f=state.fixtures.find(f=>f.id===d.id);if(!reviewAudience(f))return bad('Team comments are private');if(d.review_revision!==f.revision)return bad('The team changed. Refresh before commenting');if(!String(d.body||'').trim()||d.body.length>1500)return bad('Write a comment of up to 1500 characters');
  (state.review_posts[d.id]??=[]).push({id:crypto.randomUUID(),author_name:userProfile.display_name,body:d.body.trim(),review_revision:f.revision,created_at:fixtureNow()});
 }else if(action==='save_fixture'){
  if(['slots','published','review','fixtures'].some(key=>key in d))return bad('Fixture setup cannot change team selections');
  const old=state.fixtures.find(f=>f.id===d.id);if(JSON.stringify(d.details.match_roles)!==JSON.stringify(old?.details.match_roles))return bad('A selector must change the match captain or keeper on the selection board');if((old?.revision||0)!==d.revision)return bad('Fixture changed. Reload before saving');
  if(old&&old.slots.some(slot=>d.details.days.length===1&&slot.d2||d.details.days.length===2&&!d.details.brackets&&slot.d1!==slot.d2))return bad('A selector must adjust the Day 2 selections before this format change');
  if(old){old.details=structuredClone(d.details);old.revision++;}else state.fixtures.push({id:d.id,club_id:club.id,details:structuredClone(d.details),slots:seBlankSlots(),revision:1,publication:0,published:null});
  result={saved:true,id:d.id,revision:(old?.revision||1)};
 }else if(action==='save_board'){
  if(!selector)return bad('Selector access required');
  if(!Array.isArray(d.fixtures)||!d.fixtures.length||new Set(d.fixtures.map(f=>f.id)).size!==d.fixtures.length)return bad('Choose distinct fixtures to save');
  if(d.fixtures.some(f=>!Array.isArray(f.slots)||f.slots.length<11||f.slots.length>100))return bad('A draft must have between 11 and 100 places');
  for(const f of d.fixtures){const old=state.fixtures.find(x=>x.id===f.id);if((old?.revision||0)!==f.revision)return bad('A team changed in another session. Reload before saving');if(!f.details.cancelled&&f.details.days.some((day,j)=>f.slots.some(slot=>{const pid=slot['d'+(j+1)];return pid&&seDayStatus(state.roster.find(p=>p.id===pid),day)!=='available'&&!old?.details.days.some((od,k)=>od.date===day.date&&old.slots.some(os=>os['d'+(k+1)]===pid));})))return bad('Mark availability before selecting this player');}
  if(d.fixtures.some(f=>f.details.days.length===2&&!f.details.brackets&&f.slots.some(s=>s.d1!==s.d2)))return bad('Enable bracketing for this grade before splitting a slot');
  const next=state.fixtures.filter(f=>!d.fixtures.some(changed=>changed.id===f.id)).concat(d.fixtures),conflict=demoDuplicateSelection(next,d.fixtures.map(f=>f.id));if(conflict)return bad(conflict);
  const rows=d.fixtures.map(f=>{const old=state.fixtures.find(x=>x.id===f.id);return {...(old||{publication:0,published:null}),...sePrepareMatch(f,{...state,groups:demoMatchGroups()}),revision:f.revision+1};});
  const replacements=new Map(rows.map(f=>[f.id,f]));state.fixtures=state.fixtures.map(f=>replacements.get(f.id)||f).concat(rows.filter(f=>!state.fixtures.some(old=>old.id===f.id)));
  result.revisions=Object.fromEntries(d.fixtures.map(f=>[f.id,f.revision+1]));
 }else if(action==='publish'){
  if(demoPublicationHead()!==uid)return bad('Only the current Head of Selections or Acting Head can publish to players');
  const conflict=demoDuplicateSelection(state.fixtures,d.ids);if(conflict)return bad(conflict);
  const fs=state.fixtures.filter(f=>d.ids.includes(f.id));if(fs.some(f=>f.revision!==d.revisions[f.id]))return bad('Draft changed');if(fs.some(f=>demoSelectionIssues(f).some(i=>i.level==='error')))return bad('Fix selection or availability issues before publishing');
  if(seShortTeams(fs).some(x=>!(d.acknowledge_short||[]).includes(x.fixture.id)))return bad('Confirm publishing this team with vacant places');
  for(const f of fs){if(JSON.stringify(f.published)===JSON.stringify(snapshot(f)))continue;f.published=snapshot(f);f.publication++;f.selection_unlocked_until=null;f.selection_unlocked_by=null;(state.history[f.id]??=[]).push(structuredClone(f.published));}
  if(state.access.mode==='bundle')for(const link of state.group_links){const latest=state.fixtures.filter(f=>f.published&&f.published.details.grade===link.grade&&f.published.details.competition===link.competition).sort((a,b)=>b.published.details.days[0].date.localeCompare(a.published.details.days[0].date))[0];if(!latest)continue;for(const r of state.roster.filter(r=>latest.published.slots.some(s=>s.d1===r.id||s.d2===r.id))){const p=fixtureRows.players.find(p=>p.user_id===r.user_id);if(p&&!fixtureRows.player_playing_groups.some(g=>g.player_id===p.id&&g.playing_group_id===link.group_id))fixtureRows.player_playing_groups.push({club_id:club.id,player_id:p.id,playing_group_id:link.group_id});}}
  result={published:true,recipients:0,groups:{unlinked_players:[]}};
 }else if(action==='availability'){const p=state.roster.find(p=>p.id===d.id);if(!p||!manager&&p.user_id!==uid)return bad('Edit only your own availability');if(d.calendar_mode!=='opt_in')return bad('Reload the updated app to mark available dates');if(p.availability.revision!==d.revision)return bad('Availability changed. Reload before saving');const previous=p.availability,unavailable=[...new Set([...(previous.unavailable_dates||[]),...(previous.available_dates||[]).filter(date=>!d.available_dates.includes(date))])].filter(date=>!d.available_dates.includes(date));p.availability={...structuredClone(d),usual_available:false,blocks:[],unavailable_dates:unavailable,revision:d.revision+1,checked_at:fixtureNow()};for(const setup of state.availability_dates||[])if((previous.available_dates||[]).includes(setup.date)!==d.available_dates.includes(setup.date))setup.updated_at=fixtureNow();
 }else if(action==='save_roster'||action==='import_roster'){if(d.revision!==state.roster_revision)return bad('Playing list changed');try{seValidateRosterNames(d.rows,state.roster,action==='import_roster');if(action==='save_roster'&&d.rows.some(r=>Object.hasOwn(r,'fielding')&&!FIELDING_RATINGS.some(([key])=>key===r.fielding)))throw Error('Choose a valid fielding rating');if(action==='save_roster'&&d.rows.some(r=>Object.hasOwn(r,'spin_style')&&!SPIN_STYLES.some(([key])=>key===r.spin_style)))throw Error('Choose a valid spin type');}catch(error){return bad(error.message);}for(const r of d.rows){const old=action==='import_roster'?seImportMatch(r,state.roster):state.roster.find(p=>p.id===r.id);if(old){const blocked=action==='save_roster'?(old.user_id&&!r.user_id?true:r.user_id?false:old.auto_link_disabled):old.auto_link_disabled;const email=old.account_email;Object.assign(old,action==='import_roster'?{external_id:r.external_id,name:r.name,grade:r.grade??old.grade}:r);if(action==='save_roster'&&old.bowling!=='spin')old.spin_style='unknown';old.auto_link_disabled=!!blocked;old.account_email=Object.hasOwn(r,'account_email')&&(action==='save_roster'||r.account_email)?String(r.account_email||'').trim().toLowerCase()||null:email||null;}else state.roster.push({id:crypto.randomUUID(),batting:'unknown',bowling:'unknown',bowling_load:'unknown',spin_style:'unknown',fielding:'unknown',keeper:false,active:true,user_id:null,auto_link_disabled:false,availability:{revision:0,usual_available:false,blocks:[],available_dates:[]},...r,account_email:String(r.account_email||'').trim().toLowerCase()||null});}state.roster_revision++;
 }else if(action==='post'){(state.posts[d.id]??=[]).push({id:crypto.randomUUID(),author_name:userProfile.display_name,body:d.body,created_at:fixtureNow()});
 }else if(action==='group_links'){state.group_links=d.links;state.access.revision++;
 }else if(action==='selectors'){if(!admin)return bad('Club Admin permission required');state.selectors=structuredClone(d.users);if(state.access.head_selector_id!==(d.head_selector_id||null)||!state.selectors.includes(state.access.publication_delegate_id))Object.assign(state.access,{publication_delegate_id:null,publication_delegate_from:null,publication_delegate_until:null});state.access.head_selector_id=d.head_selector_id||null;state.access.revision++;
 }else return bad('That action is available in your live club.');
 if(['save_board','save_fixture','fixture_defaults','publish','selectors','publication_delegate','fixture_lock'].includes(action))result.republication_alerts=demoSyncRepublicationAlerts();
 state.receipts[d.request_id]=result;return ok(result);
};

// Fictional quote for exploring the form.
function demoSelectionsQuote(d){
 const p=demoSelections.billing.pricing,s=demoSelections.billing.subscription,starts=new Date(d.active_from+'T12:00:00Z');
 if(!Number.isFinite(+starts))throw Error('Choose an access start date');
 const date=x=>x.toISOString().slice(0,10),plus=(x,n)=>new Date(+x+n*86400000),year=starts.getUTCFullYear()-(starts.getUTCMonth()<6?1:0),start=new Date(`${year}-07-01T12:00:00Z`),end=new Date(`${year+1}-06-30T12:00:00Z`),currency=s?.currency||p.currency,price=d.annual_price_cents??p.annual_price_cents;
 const terms={currency,annual_price_cents:price,billing_year_start:date(start),billing_year_end:date(end),active_until:date(end),next_renewal:date(plus(end,1))};
 if(d.status==='trial'){const days=s?.status==='trial'&&s.trial_started===d.active_from?Math.round((new Date(s.trial_ends+'T12:00:00Z')-starts)/86400000)+1:p.trial_days||21;return {...terms,trial:true,trial_days:days,active_until:date(plus(starts,days-1)),amount_due_cents:0};}
 if(d.special_rate_never_ends&&d.adjustment_percent===100)return {...terms,ongoing_complimentary:true,active_until:null,next_renewal:null,amount_due_cents:0};
 if(d.status==='disabled')return {...terms,amount_due_cents:0};
 if(price==null)throw Error('Set the Selections annual price or use a free trial / ongoing complimentary access');
 if(d.adjustment_percent>0&&!d.special_rate_never_ends&&!d.adjustment_end)throw Error('Choose when the special rate ends, or Never');
 const offerEnd=d.special_rate_never_ends||!d.adjustment_end?end:new Date(d.adjustment_end+'T12:00:00Z');
 if(offerEnd<starts)throw Error('Special rate end must be on or after access start');
 const remaining=Math.round((end-starts)/86400000)+1,bundled=remaining<30,billingStart=bundled?plus(end,1):start,billingEnd=bundled?new Date(`${year+2}-06-30T12:00:00Z`):end;
 const effectiveEnd=d.special_rate_never_ends||!d.adjustment_end?billingEnd:new Date(Math.min(+billingEnd,+offerEnd)),effectiveStart=new Date(Math.max(+starts,+billingStart)),days=Math.max(0,Math.round((effectiveEnd-effectiveStart)/86400000)+1),yearDays=Math.round((billingEnd-billingStart)/86400000)+1,waived=starts>billingStart&&days<30,base=waived?0:Math.round(price*days/yearDays);
 return {...terms,billing_year_start:date(billingStart),billing_year_end:date(billingEnd),base_prorated_cents:base,amount_due_cents:Math.round(base*(1-d.adjustment_percent/100)),bundled_next_full_year:bundled,active_until:date(billingEnd),next_renewal:date(plus(billingEnd,1))};
}

let demoClubBatting=null;

function seedDemoClubBatting(){demoClubBatting={subscription:null,trial:null,revision:1,receipts:{},settings:{annual_price_cents:79500,currency:'AUD',default_trial_days:60}};}

const demoClubProductRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name!=='platform_club_batting_api'&&name!=='platform_set_club_access_terms'&&name!=='platform_product_pricing_api'){const result=await demoClubProductRpc(name,args);if(name==='club_selections_api'&&args.p_action==='subscription_context'&&result.data){if(!demoClubBatting)seedDemoClubBatting();result.data.batting_annual_price_cents=demoClubBatting.settings.annual_price_cents;}return result;}
 if(!demoClubBatting)seedDemoClubBatting();if(!demoSelections)seedDemoSelections();
 const state=demoClubBatting,s=state.subscription,canManage=['owner','commercial_admin'].includes(platformRole),today=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'}),ok=data=>({data:structuredClone(data),error:null}),bad=message=>({data:null,error:{message,code:'P0001'}});
 if(!['owner','commercial_admin','support_admin'].includes(platformRole))return bad('Platform subscription access required');
 const token=String(state.revision)+'-'+String(demoSelections.access.revision);
 if(name==='platform_product_pricing_api'){
  const p=demoSelections.billing.pricing,pricingToken=String(state.revision)+'-'+String(p.revision);
  if(args.p_action==='context')return ok({can_manage:canManage,batting_annual_price_cents:state.settings.annual_price_cents,selection_annual_price_cents:p.annual_price_cents,bundle_annual_price_cents:p.bundle_annual_price_cents??null,currency:'AUD',selection_trial_days:p.trial_days,trial_days:state.settings.default_trial_days,state_token:pricingToken});
  if(!canManage)return bad('Platform commercial permission required');const d=args.p_data||{};
  if(state.receipts[d.request_id])return ok(state.receipts[d.request_id]);
  if(d.state_token!==pricingToken)return bad('Prices changed. Reload before saving');
  if(d.bundle_annual_price_cents!=null&&d.bundle_annual_price_cents<d.batting_annual_price_cents)return bad('Both products price must cover the Club Batting price');
  state.settings.annual_price_cents=d.batting_annual_price_cents;state.revision++;p.annual_price_cents=d.selection_annual_price_cents;p.bundle_annual_price_cents=d.bundle_annual_price_cents;p.trial_days=d.selection_trial_days??p.trial_days;state.settings.default_trial_days=d.batting_trial_days??state.settings.default_trial_days;p.revision++;
  state.receipts[d.request_id]={saved:true};return ok(state.receipts[d.request_id]);
 }
 if(name==='platform_set_club_access_terms'){
  if(!canManage)return bad('Platform commercial permission required');if(!s)return bad('No existing subscription');
  Object.assign(s,{adjustment_percent:args.p_adjustment_percent,special_rate_never_ends:args.p_never_ends,adjustment_end:args.p_adjustment_end,active_until:args.p_adjustment_percent===100&&args.p_never_ends?'infinity':args.p_active_until,expiry_action:args.p_expiry_action});state.revision++;return ok({saved:true});
 }
 if(args.p_action==='context')return ok({...state.settings,subscription:s,trial:state.trial,can_manage:canManage,can_activate:!s,trial_available:!s&&!state.trial,has_access:!!s,status:!s?'legacy':s.special_rate_never_ends&&s.adjustment_percent===100?'complimentary':state.trial?.status==='active'?'trial':'active',state_token:token,starts_on:today,calendar:'demo',timezone:'Australia/Sydney',calendars:[{code:'demo',label:'Example club year'}]});
 const d=args.p_data||{};
 if(!canManage)return bad('Platform commercial permission required');
 if(args.p_action==='update_terms'){
  if(state.receipts[d.request_id])return ok(state.receipts[d.request_id]);
  if(d.state_token!==token)return bad('Club subscription changed. Reload before saving');
  if(!s)return bad('Existing subscription required');
  if(d.kind==='paid'&&!d.continuation_agreed)return bad('Confirm the club agreement');
  const free=d.kind==='complimentary';Object.assign(s,{adjustment_percent:free?100:d.adjustment_percent,special_rate_never_ends:free||d.never_ends,adjustment_end:free?null:d.adjustment_end,active_until:free?'infinity':d.active_until,expiry_action:d.expiry_action});
  if(state.trial&&d.kind!=='trial')state.trial.status='converted';state.revision++;
  state.receipts[d.request_id]={saved:true,kind:d.kind};return ok(state.receipts[d.request_id]);
 }
 if(args.p_action!=='activate')return bad('Unknown action');
 if(state.receipts[d.request_id])return ok(state.receipts[d.request_id]);
 if(d.state_token!==token)return bad('Club subscription changed. Reload before saving');
 if(s)return bad('This club already has Club Batting terms');
 const end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+state.settings.default_trial_days-1);const ends=end.toISOString().slice(0,10),free=d.kind==='complimentary';
 state.subscription={id:'demo-batting-subscription',club_id:club.id,status:'active',active_from:today,active_until:free?'infinity':ends,adjustment_percent:100,special_rate_never_ends:free,adjustment_end:free?null:ends,expiry_action:free?'renewal_approval':'end_subscription',currency:'AUD',annual_price_cents:79500};
 if(!free)state.trial={id:'demo-batting-trial',club_id:club.id,status:'active',starts_on:today,ends_on:ends};
 state.revision++;if(demoSelections.access.mode==='standalone'){demoSelections.access.mode='bundle';demoSelections.access.revision++;}
 state.receipts[d.request_id]={saved:true,kind:d.kind,active_until:free?null:ends,ongoing_complimentary:free};return ok(state.receipts[d.request_id]);
};

const demoProductInvoke=window.__fixtureDb.functions.invoke;

window.__fixtureDb.functions.invoke=async(name,args)=>args?.body?.action==='status'&&['discover-clubs','dispatch-outbox','club-batting-guide'].includes(name)?{data:{configured:false},error:null}:demoProductInvoke(name,args);

function demoTemporaryCaptainDays(uid=session?.user?.id){
 const state=demoSelections;if(!state||club?.archived_at||!['pilot','active'].includes(state.access.status)||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===uid))return [];
 const zone=state.access.timezone||'Australia/Sydney',now=new Date(),today=now.toLocaleDateString('en-CA',{timeZone:zone});
 if(state.access.active_from&&today<state.access.active_from||state.access.valid_until&&today>state.access.valid_until)return [];
 const midnight=date=>{let guess=Date.parse(date+'T00:00:00Z');for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)),p=k=>parts.find(v=>v.type===k).value;guess+=Date.parse(date+'T00:00:00Z')-Date.parse(`${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}Z`);}return new Date(guess).toISOString();};
 return state.fixtures.flatMap(f=>f.details.cancelled?[]:f.details.days.flatMap((day,i)=>{
  const key='d'+(i+1),captain=state.roster.find(r=>r.active&&r.user_id===uid&&(f.details.match_roles?r.id===f.details.match_roles[key]?.captain_id:uid===f.details.captain_id));
  if(!captain||!f.slots.some(s=>s[key]===captain.id))return [];
  const date=new Date(day.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+((8-date.getUTCDay())%7||7));const expires_at=midnight(date.toISOString().slice(0,10));
  return Date.parse(expires_at)>now.getTime()?[{fixture_id:f.id,day_key:key,match_date:day.date,expires_at,grade:f.details.grade,group_id:f.details.grade_group_id||null}]:[];
 }));
}

function demoTemporaryBattingCaptain(){return demoSelections?.access.mode==='bundle'&&demoTemporaryCaptainDays().length>0;}

function demoTemporaryCaptainPlayer(playerId){
 const p=fixtureRows.players.find(p=>p.id===playerId&&p.active!==false&&p.club_id===club.id);if(!p||!demoTemporaryBattingCaptain())return false;
 const r=demoSelections.roster.find(r=>r.active&&r.user_id===p.user_id);return !!r&&demoTemporaryCaptainDays().some(d=>demoSelections.fixtures.find(f=>f.id===d.fixture_id).slots.some(s=>s[d.day_key]===r.id));
}

const previousTemporaryCaptainRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name==='get_my_match_captain_access'){
  if(!demoSelections)seedDemoSelections();
  if(args.p_club_id!==club?.id||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===session?.user?.id))return {data:null,error:{message:'Club membership required'}};
  return {data:{batting:demoTemporaryBattingCaptain(),timezone:demoSelections.access.timezone,appointments:demoTemporaryCaptainDays()},error:null};
 }
 const result=await previousTemporaryCaptainRpc(name,args);
 if(!result?.error&&['get_players_workspace','get_feedback_workspace'].includes(name)&&demoTemporaryBattingCaptain())result.data.role=['admin','head_coach','coach','captain'].includes(membership.permission_role)?membership.permission_role:'captain';
 return result;
};

let demoTrialSchedules=null;

const demoTrialPreviousRpc=window.__fixtureRpc;

function demoTrialProducts(){
 if(!demoSelections)seedDemoSelections();if(!demoClubBatting)seedDemoClubBatting();
 const s=demoClubBatting.subscription,a=demoSelections.access,t=demoSelections.billing.subscription;
 const products={batting:{active:a.mode!=='standalone',trial_available:a.mode==='standalone'&&!s,complimentary:!!(s?.special_rate_never_ends&&s.adjustment_percent===100),on_trial:demoClubBatting.trial?.status==='active',trial_ends:demoClubBatting.trial?.ends_on,access_ends:s?.active_until},selections:{active:['active','pilot'].includes(a.status),trial_available:!t&&a.status==='disabled',complimentary:!!(t?.special_rate_never_ends&&t.adjustment_percent===100),on_trial:t?.status==='trial',trial_ends:t?.trial_ends,access_ends:a.valid_until}};
 if(demoTrialSchedules)for(const k of ['batting','selections']){const p=demoTrialSchedules[k],scheduled=p.starts_on>trialLocalDate(p.timezone);products[k]={...p,scheduled,active:!scheduled,on_trial:!scheduled,complimentary:false,trial_available:false,can_reschedule:scheduled};}
 return {club_id:club.id,trial_days:{batting:demoClubBatting.settings.default_trial_days,selections:demoSelections.billing.pricing.trial_days},products};
}

window.__fixtureRpc=async(name,args={})=>{
 if(name!=='club_product_trials')return demoTrialPreviousRpc(name,args);
 if(!isAdmin()||args.p_data?.club_id!==club?.id)return {data:null,error:{message:'Open Products & trials as the example Club Admin.'}};
 if(args.p_action==='reschedule'){
  const d=args.p_data,p=demoTrialSchedules?.[d.product];
  if(!p||p.starts_on<=trialLocalDate(p.timezone)||d.expected_revision!==p.schedule_revision)return {data:null,error:{message:'Refresh the example trial dates.',code:'STALE'}};
  const days=Math.round((Date.parse(p.trial_ends)-Date.parse(p.starts_on))/86400000)+1;p.starts_on=d.starts_on||trialLocalDate(p.timezone);p.trial_ends=trialEndDate(p.starts_on,days);p.schedule_revision++;
 }else if(args.p_action!=='context')return {data:null,error:{message:'Use the real website to register your club.'}};
 return {data:demoTrialProducts(),error:null};
};

const demoProductsRenderer=renderMyClubProducts;

renderMyClubProducts=async()=>{
 await demoProductsRenderer();
 // Real signup never carries a fictional club ID.
 document.querySelectorAll('.pt-product a').forEach(link=>{const product=new URL(link.href,location.href).searchParams.get('trial_product');link.href='https://mirelionhq.com/enquire.html?product='+encodeURIComponent(product);});
 const heading=document.querySelector('#page h1');if(!heading||!isAdmin())return;
 const button=document.createElement('button');button.type='button';button.className='btn ghost';button.id='demoScheduledTrial';button.textContent=demoTrialSchedules?'Reset trial example':'Preview a scheduled trial';heading.after(button);
 button.onclick=async()=>{
  if(demoTrialSchedules)demoTrialSchedules=null;
  else{const starts=trialEndDate(trialLocalDate('Australia/Sydney'),31),p={starts_on:starts,trial_ends:trialEndDate(starts,60),timezone:'Australia/Sydney',schedule_revision:1};demoTrialSchedules={batting:{...p},selections:{...p,trial_ends:trialEndDate(starts,demoSelections.billing.pricing.trial_days)}};}
  await loadScheduledTrialContext();currentTab='products';renderShell();
 };
};

function demoSharedFixtureGroup(f){return fixtureGroups.find(g=>g.id===f.details.grade_group_id)||fixtureGroups.find(g=>g.name.toLowerCase()===f.details.grade.toLowerCase());}

function demoSharedFixtureKey(f){const d=f.details;return JSON.stringify([demoSharedFixtureGroup(f)?.id||d.grade,d.days[0].date,d.format||(d.days.length===2?'long_form':'limited_overs'),demoInningsOpponent(d.opposition)]);}

const demoBeforeSharedFixtureRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(!['get_team_review_roster','get_team_review_session','save_team_match_review','club_selections_api'].includes(name))return demoBeforeSharedFixtureRpc(name,args);
 if(!demoSelections)seedDemoSelections();
 const bad=message=>({data:null,error:{code:'P0001',message}}),v=args.p_values||{};
 if(name==='club_selections_api'&&['save_fixture','save_board'].includes(args.p_action)){
  const candidates=args.p_action==='save_fixture'?[args.p_data]:args.p_data.fixtures||[];
  for(const f of candidates){const prior=demoSelections.fixtures.find(x=>x.id===f.id);
   if(prior&&fixtureRows.team_review_sessions.some(r=>r.fixture_id===f.id)&&demoSharedFixtureKey(prior)!==demoSharedFixtureKey(f))return bad('This fixture is linked to Match Review. Keep its original grade, start date, format and opposition.');
   if(demoSelections.fixtures.some(x=>x.id!==f.id&&demoSharedFixtureKey(x)===demoSharedFixtureKey(f)))return bad('This fixture already exists. Open the existing fixture.');
  }
 }
 let shared=null;
 if(name==='save_team_match_review'&&v.group_id){
  const prior=fixtureRows.team_review_sessions.find(r=>r.id===v.review_id),fid=v.fixture_id||prior?.fixture_id;
  const d={grade_group_id:v.group_id,grade:fixtureGroups.find(g=>g.id===v.group_id)?.name||'',days:[{date:v.match_date}],format:v.format_key,opposition:v.opposition};
  shared=fid?demoSelections.fixtures.find(f=>f.id===fid):demoSelections.fixtures.find(f=>demoSharedFixtureKey(f)===demoSharedFixtureKey({details:d}));
  if(fid&&(!shared||demoSharedFixtureKey(shared)!==demoSharedFixtureKey({details:d})))return bad('The saved fixture supplies the grade, date, format and opposition. Reload the fixture before saving.');
 }
 const out=await demoBeforeSharedFixtureRpc(name,args);if(out.error||!out.data)return out;
 if(name==='get_team_review_roster')out.data.fixtures=demoSelections.fixtures.filter(f=>!f.details.cancelled&&demoSharedFixtureGroup(f)&&out.data.players.some(p=>(p.group_ids||[]).includes(demoSharedFixtureGroup(f).id))).map(f=>({id:f.id,group_id:demoSharedFixtureGroup(f).id,grade:demoSharedFixtureGroup(f).name,match_date:f.details.days[0].date,opposition:f.details.opposition,format_key:f.details.format||(f.details.days.length===2?'long_form':'limited_overs'),days:f.details.days.map(d=>d.date)}));
 if(name==='save_team_match_review'&&v.group_id&&!out.data.deleted){
  const r=fixtureRows.team_review_sessions.find(r=>r.id===out.data.review_id);
  if(!shared&&r?.fixture_id)shared=demoSelections.fixtures.find(f=>f.id===r.fixture_id);
  if(!shared){shared={id:crypto.randomUUID(),club_id:club.id,revision:1,publication:0,published:null,details:{grade:fixtureGroups.find(g=>g.id===v.group_id).name,grade_group_id:v.group_id,days:[{date:v.match_date,start:''}],opposition:v.opposition,format:v.format_key,competition:'',ground:'',meeting:'',overs:null,staff:[],brackets:false,min_quicks:3,min_batters:5},slots:Array.from({length:11},()=>({d1:null,d2:null}))};demoSelections.fixtures.push(shared);}
  r.fixture_id=shared.id;out.data.review.fixture_id=shared.id;
 }
 if(name==='get_team_review_session')out.data.review.fixture_id=fixtureRows.team_review_sessions.find(r=>r.id===args.p_review_id)?.fixture_id||null;
 return out;
};

const demoBeforeFixtureObservationRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name!=='save_fixture_match_observation')return demoBeforeFixtureObservationRpc(name,args);
 const bad=message=>({data:null,error:{code:'P0001',message}});
 try{
  demoTeamStaff(args.p_club_id);if(!demoTeamEditable().some(p=>p.id===args.p_player_id))return bad('Coaching edit access is required for this player');
  if(!demoSelections)seedDemoSelections();const v=args.p_values,g=fixtureGroups.find(g=>g.id===args.p_group_id);if(!g)return bad('Choose the fixture Playing Group');
  const d={grade:g.name,grade_group_id:g.id,days:[{date:v.match_date,start:''}],opposition:v.opposition,format:v.format_key};
  let fixture=args.p_fixture_id?demoSelections.fixtures.find(f=>f.id===args.p_fixture_id):demoSelections.fixtures.find(f=>demoSharedFixtureKey(f)===demoSharedFixtureKey({details:d}));
  if(args.p_fixture_id&&(!fixture||demoSharedFixtureKey(fixture)!==demoSharedFixtureKey({details:d})))return bad('The saved fixture supplies the match date, format and opposition. Reload before saving.');
  const raw={...args};delete raw.p_club_id;delete raw.p_group_id;delete raw.p_fixture_id;
  const result=await demoBeforeFixtureObservationRpc('save_coach_observation',raw);if(result.error)return result;
  if(!fixture){fixture={id:crypto.randomUUID(),club_id:club.id,revision:1,publication:0,published:null,details:{...d,competition:'',ground:'',meeting:'',staff:[],brackets:false,min_quicks:3,min_batters:5},slots:Array.from({length:11},()=>({d1:null,d2:null}))};demoSelections.fixtures.push(fixture);}
  const m=fixtureRows.feedback[args.p_player_id].matches.find(m=>m.id===result.data.match_id);m.fixture_id=fixture.id;
  return {data:{...result.data,fixture_id:fixture.id,fixture:{id:fixture.id,group_id:g.id,grade:g.name,match_date:fixture.details.days[0].date,opposition:fixture.details.opposition,format_key:fixture.details.format}},error:null};
 }catch(error){return bad(error.message);}
};

function demoReviewTeamsEnabled(){return ['pilot','active'].includes(demoSelections.access.status);}

function demoPublishedReviewSelection(f){
 if(!f.published&&(!demoReviewTeamsEnabled()||demoSelections.match_review_rosters?.[f.id])){
  const roster=demoSelections.match_review_rosters?.[f.id],editable=new Set(demoTeamEditable().map(p=>p.id));
  return {status:'manual',revision:roster?.revision||0,fixture_revision:f.revision,roles:demoManualRoles(f),expires_at:demoCaptainExpiry(f.details),players:(roster?.ids||[]).map(id=>fixtureRows.players.find(p=>p.id===id&&p.active!==false)).filter(Boolean).map(p=>({player_id:p.id,name:p.display_name,can_edit:editable.has(p.id)}))};
 }
 if(!f.published)return {status:'unpublished',publication:0,fixture_revision:f.revision,revision:0,players:[]};
 if(f.published.details.cancelled)return {status:'cancelled',publication:f.publication,players:[]};
 if(demoSharedFixtureKey(f)!==demoSharedFixtureKey({details:f.published.details}))return {status:'changed_fixture',publication:f.publication,players:[]};
 const picked=new Map(),editable=new Set(demoTeamEditable().map(p=>p.id));
 f.published.slots.forEach((slot,index)=>f.published.details.days.forEach((_,day)=>{const id=slot['d'+(day+1)];if(!id)return;const selected=picked.get(id)||{roster_id:id,slot:index+1,days:[]};if(!selected.days.includes(day+1))selected.days.push(day+1);picked.set(id,selected);}));
 const players=[...picked.values()].map(p=>{const r=demoSelections.roster.find(r=>r.id===p.roster_id),matches=fixtureRows.players.filter(x=>x.club_id===club.id&&x.active!==false&&(r?.review_player_id===x.id||(x.user_id&&x.user_id===r?.user_id))),linked=matches.length===1?matches[0]:null;return {...p,player_id:linked?.id||null,account_pending:!!linked&&!linked.user_id,name:f.published.players.find(x=>x.id===p.roster_id)?.name||r?.name||'Selected player',can_edit:!!linked&&editable.has(linked.id)};});
 return {status:'published',publication:f.publication,players};
}

function demoPublishedReviewFixtures(){
 return demoSelections.fixtures.filter(f=>!f.details.cancelled&&demoSharedFixtureGroup(f)).map(f=>({id:f.id,group_id:demoSharedFixtureGroup(f).id,grade:demoSharedFixtureGroup(f).name,match_date:f.details.days[0].date,opposition:f.details.opposition,format_key:f.details.format||(f.details.days.length===2?'long_form':'limited_overs'),days:f.details.days.map(d=>d.date),selection:demoPublishedReviewSelection(f)}));
}

const demoBeforeSelectedTeamRpc=window.__fixtureRpc;

const demoSelectedTeamReceipts=new Map();

const demoMatchRosterReceipts=new Map();

window.__fixtureRpc=async(name,args={})=>{
 if(name==='save_match_review_players'){
  try{
   demoTeamStaff(args.p_club_id);if(!demoSelections)seedDemoSelections();
   const key=session.user.id+':'+args.p_request_id,prior=demoMatchRosterReceipts.get(key),payload=JSON.stringify(args);
   if(prior){if(prior.payload!==payload)throw Error('This save request was already used');return {data:{...structuredClone(prior.result),already_saved:true},error:null};}
   const v=args.p_values,g=fixtureGroups.find(g=>g.id===args.p_group_id&&g.active);if(!g)throw Error('Choose a grade for the match');
   const d={grade:g.name,grade_group_id:g.id,days:[{date:v.match_date,start:''}],opposition:v.opposition,format:v.format_key};
   let f=args.p_fixture_id?demoSelections.fixtures.find(f=>f.id===args.p_fixture_id):demoSelections.fixtures.find(f=>demoSharedFixtureKey(f)===demoSharedFixtureKey({details:d}));
   if(args.p_fixture_id&&(!f||demoSharedFixtureKey(f)!==demoSharedFixtureKey({details:d})))throw Error('Reload the saved fixture before saving.');
   if(f?.published)throw Error('This match already has a team published by Teams.');
   if(f?.details.cancelled)throw Error('This match is cancelled');if(f&&v.expected_fixture_revision!==undefined&&f.revision!==v.expected_fixture_revision)throw Error('The fixture changed. Reload before saving');
   const saved=demoSelections.match_review_rosters?.[f?.id];if((saved?.revision||0)!==args.p_expected_revision)throw Error('The match player list changed. Reload before editing.');
   const ids=v.player_ids,editable=new Set(demoTeamEditable().map(p=>p.id));
   if(!Array.isArray(ids)||ids.length>30||new Set(ids).size!==ids.length||ids.some(id=>!fixtureRows.players.some(p=>p.id===id&&p.club_id===club.id&&p.active!==false)))throw Error('Choose active players from this club');
   if([...ids,...saved?.ids||[]].some(id=>ids.includes(id)!==(saved?.ids||[]).includes(id)&&!editable.has(id)))throw Error('Coaching edit access is required');
   if(!f){f={id:crypto.randomUUID(),club_id:club.id,revision:1,publication:0,published:null,details:{...d,competition:'',ground:'',meeting:'',staff:[],brackets:false,min_quicks:3,min_batters:5},slots:Array.from({length:11},()=>({d1:null,d2:null}))};demoSelections.fixtures.push(f);}
   const season=demoSharedGroup(g).captain_player_ids.filter(id=>ids.includes(id)).sort()[0],cap=season||v.captain_player_id||null,keeper=v.keeper_player_id||null;if(cap&&!ids.includes(cap)||keeper&&!ids.includes(keeper))throw Error('Choose captain and keeper from the selected players');
   if(v.final_playing_date&&v.final_playing_date!==f.details.days.at(-1).date){if(v.final_playing_date<v.match_date)throw Error('Final day is before the match');f.details.days=v.final_playing_date===v.match_date?[f.details.days[0]]:[f.details.days[0],{date:v.final_playing_date,start:''}];f.revision++;}
   const revision=(saved?.revision||0)+1;(demoSelections.match_review_rosters??={})[f.id]={ids:[...ids],revision,captain_player_id:cap,keeper_player_id:keeper};
   const result={fixture_id:f.id,revision,player_ids:[...ids],roles:demoManualRoles(f),already_saved:false};demoMatchRosterReceipts.set(key,{payload,result});return {data:result,error:null};
  }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
 }
 if(name==='get_individual_match_fixtures'){
  try{demoTeamStaff(args.p_club_id);if(!demoTeamEditable().some(p=>p.id===args.p_player_id))throw Error('Coaching edit access is required for this player');if(!demoSelections)seedDemoSelections();const match=fixtureRows.feedback[args.p_player_id]?.matches.find(m=>m.id===args.p_match_id);if(args.p_match_id&&!match)throw Error('This player innings is unavailable');return {data:{groups:fixtureGroups.filter(g=>g.active).map(g=>({id:g.id,name:g.name})),linked_fixture_id:match?.fixture_id||null,fixtures:demoPublishedReviewFixtures().map(({selection,days,...f})=>f)},error:null};}catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
 }
 if(name==='save_individual_fixture_observation')return demoBeforeSelectedTeamRpc('save_fixture_match_observation',args);
 const reads=['get_team_review_roster','get_team_match_review','get_team_review_session'];
 if(!reads.includes(name)&&!['save_team_match_review','save_fixture_match_observation'].includes(name))return demoBeforeSelectedTeamRpc(name,args);
 if(!demoSelections)seedDemoSelections();
 const v=args.p_values||{},requestKey=name+':'+session.user.id+':'+args.p_request_id;
 if(!reads.includes(name)&&!demoSelectedTeamReceipts.has(requestKey)){
  const prior=fixtureRows.team_review_sessions.find(r=>r.id===v.review_id),fid=args.p_fixture_id||v.fixture_id||prior?.fixture_id,group=args.p_group_id||v.group_id;
  if(fid||group){
   const f=fid?demoSelections.fixtures.find(f=>f.id===fid):demoSelections.fixtures.find(f=>demoSharedFixtureGroup(f)?.id===group&&f.details.days[0].date===v.match_date&&f.details.format===v.format_key&&demoInningsOpponent(f.details.opposition)===demoInningsOpponent(v.opposition));
   const selection=f?demoPublishedReviewSelection(f):null,ids=name==='save_fixture_match_observation'?[args.p_player_id]:[...(v.rows||[]),...(v.scorecard_import?.rows||[])].map(p=>p.player_id);
   if(ids.length&&!['published','manual'].includes(selection?.status))return {data:null,error:{code:'P0001',message:'Team not finalised. Publish the team in Teams before adding a team review. Individual observations remain available from Players.'}};
   if(ids.some(id=>!selection.players.some(p=>p.player_id===id)))return {data:null,error:{code:'P0001',message:'The published team has changed, or this player is not selected. Reload the team from Teams before saving.'}};
  }
 }
 const result=await demoBeforeSelectedTeamRpc(name,args);if(result.error||!result.data)return result;
 if(reads.includes(name)){result.data.fixtures=demoPublishedReviewFixtures();result.data.teams_enabled=demoReviewTeamsEnabled();}
 else demoSelectedTeamReceipts.set(requestKey,true);
 return result;
};

const demoBeforePlayerFixtureRpc=window.__fixtureRpc,demoPlayerFixtureReceipts=new Map();

function demoPlayerFixtureChoices(player){
 if(!demoSelections)seedDemoSelections();
 const matches=fixtureRows.feedback[player.id]?.matches||[],preps=(fixtureRows.match_preparations||[]).filter(p=>p.player_id===player.id);
 return demoSelections.fixtures.filter(f=>matches.some(m=>m.fixture_id===f.id)||preps.some(p=>p.fixture_id===f.id)||!f.details.cancelled&&demoPublishedReviewSelection(f).players.some(p=>p.player_id===player.id)).map(f=>({id:f.id,grade:f.details.grade,match_date:f.details.days[0].date,format_key:f.details.format||(f.details.days.length===2?'long_form':'limited_overs'),opposition:f.details.opposition,cancelled:!!f.details.cancelled}));
}

function demoPlayerFixtureIdentity(f,record){return record&&record.match_date===f.match_date&&record.format_key===f.format_key&&demoInningsOpponent(record.opposition)===demoInningsOpponent(f.opposition);}

window.__fixtureRpc=async(name,args={})=>{
 if(!['get_my_match_fixtures','save_my_fixture_preparation','save_my_fixture_innings'].includes(name))return demoBeforePlayerFixtureRpc(name,args);
 try{
  const player=demoMatchPreparationOwner(args.p_club_id),matches=fixtureRows.feedback[player.id]?.matches||[],preparations=fixtureRows.match_preparations||[];
  const prep=args.p_preparation_id?preparations.find(p=>p.id===args.p_preparation_id&&p.player_id===player.id):null,match=args.p_match_id?matches.find(m=>m.id===args.p_match_id):null;
  if(args.p_preparation_id&&!prep)throw Error('That preparation is not attached to your account');if(args.p_match_id&&!match)throw Error('That innings is not attached to your account');
  const linked=prep?.fixture_id||match?.fixture_id||null,choices=demoPlayerFixtureChoices(player);
  if(name==='get_my_match_fixtures')return {data:{player_id:player.id,linked_fixture_id:linked,fixtures:choices},error:null};
  const key=session.user.id+':'+args.p_request_id,payload=JSON.stringify(args),receipt=demoPlayerFixtureReceipts.get(key);
  if(receipt){if(receipt.payload!==payload)throw Error('This save request was already used');return {data:{...fixtureClone(receipt.result),already_saved:true},error:null};}
  if(linked&&args.p_fixture_id&&linked!==args.p_fixture_id)throw Error('This entry already belongs to another fixture');
  const fid=linked||args.p_fixture_id||null,f=choices.find(f=>f.id===fid),v=args.p_values||{};
  if(fid&&!f)throw Error('You are not in this match player list. Ask your captain or coach to update it');
  const values=name==='save_my_fixture_innings'?v:v.action==='played'?v.innings: v.action==='link'?matches.find(m=>m.id===v.match_id):v;
  if(f&&values&&!demoPlayerFixtureIdentity(f,{...prep,...match,...values}))throw Error('Keep the saved fixture date, format and opposition');
  const {p_fixture_id,...original}=args;
  // The real RPC is transactional. Retain the isolated demo snapshot for rollback.
  const before=fixtureClone({preparations:fixtureRows.match_preparations,feedback:fixtureRows.feedback});
  const result=await demoBeforePlayerFixtureRpc(name==='save_my_fixture_preparation'?'save_my_match_preparation':'save_my_innings',original);
  if(result.error)return result;
  const savedPrep=result.data.preparation_id?fixtureRows.match_preparations.find(p=>p.id===result.data.preparation_id):null,savedMatch=result.data.match_id?fixtureRows.feedback[player.id].matches.find(m=>m.id===result.data.match_id):null;
  if(f&&[savedPrep,savedMatch].filter(Boolean).some(r=>!demoPlayerFixtureIdentity(f,r)||r.fixture_id&&r.fixture_id!==fid)){
   fixtureRows.match_preparations=before.preparations;fixtureRows.feedback=before.feedback;throw Error('This entry belongs to a different fixture');
  }
  if(fid){if(savedPrep)savedPrep.fixture_id=fid;if(savedMatch)savedMatch.fixture_id=fid;}
  result.data.fixture_id=fid;demoPlayerFixtureReceipts.set(key,{payload,result:fixtureClone(result.data)});return result;
 }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
};

const demoBeforeFixtureCorrectionRpc=window.__fixtureRpc;

const demoFixtureCorrectionReceipts=new Map();

function demoFixtureCorrectionState(fid){
 const fixture=demoSelections.fixtures.find(f=>f.id===fid);if(!fixture)throw Error('Fixture unavailable in this club');
 const reviews=(fixtureRows.team_review_sessions||[]).filter(r=>r.fixture_id===fid),ids=new Set(reviews.flatMap(r=>(r.rows||[]).map(i=>i.match_id)));
 const matches=Object.values(fixtureRows.feedback||{}).flatMap(f=>f.matches||[]).filter(m=>m.fixture_id===fid||ids.has(m.id));matches.forEach(m=>ids.add(m.id));
 const preparations=(fixtureRows.match_preparations||[]).filter(p=>p.fixture_id===fid||ids.has(p.match_id));
 return {fixture,matches,preparations,reviews};
}

function demoFixtureCorrectionPreview(fid,v){
 const state=demoFixtureCorrectionState(fid),f=state.fixture,g=fixtureGroups.find(g=>g.id===v.group_id);if(!g)throw Error('Choose an active grade from this club');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v.match_date)||!['t20','limited_overs','long_form'].includes(v.format_key)||!v.opposition?.trim())throw Error('Choose a valid date, format and opposition');
 const d=fixtureClone(f.details);d.grade=g.name;d.grade_group_id=g.id;d.format=v.format_key;d.opposition=v.opposition.trim();d.days[0].date=v.match_date;
 if(d.days.length===2){if(!v.second_match_date||v.second_match_date<=v.match_date)throw Error('Day 2 must follow Day 1');d.days[1].date=v.second_match_date;}
 const blockers=[];if(JSON.stringify(d)===JSON.stringify(f.details))blockers.push('No match details have changed.');
 if(demoSelections.fixtures.some(other=>other.id!==fid&&demoSharedFixtureKey(other)===demoSharedFixtureKey({details:d})))blockers.push('Another fixture already uses these details.');
 if((fixtureRows.make_your_call?.entries||[]).some(e=>state.preparations.some(p=>p.id===e.preparation_id)))blockers.push('Published predictions, their official results and award history lock this match identity.');
 if(state.matches.some(m=>m.score_import))blockers.push('Confirmed scorecard imports lock the linked innings identity.');
 const describe=details=>({grade:details.grade,match_date:details.days[0].date,second_match_date:details.days[1]?.date||null,format_key:details.format||'limited_overs',opposition:details.opposition});
 return {fixture_id:fid,revision:f.revision,token:JSON.stringify([state,d]),details:d,before:describe(f.details),after:describe(d),counts:{innings:state.matches.length,preparations:state.preparations.length,reviews:state.reviews.length},can_apply:!blockers.length,blockers,warnings:[...(f.published?['The existing published team remains as originally shared. The Head of Selections must review and republish the corrected fixture.']:[]),'Notes, reflections and preparation tactics remain on the same records.']};
}

window.__fixtureRpc=async(name,args={})=>{
 if(!['get_fixture_correction_context','preview_fixture_correction','apply_fixture_correction'].includes(name))return demoBeforeFixtureCorrectionRpc(name,args);
 const ok=data=>({data:fixtureClone(data),error:null}),bad=message=>({data:null,error:{code:'P0001',message}});
 try{
  if(!isAdmin()||args.p_club_id!==club.id)throw Error('Current Club Admin access is required');if(!demoSelections)seedDemoSelections();
  if(name==='get_fixture_correction_context'){const f=demoFixtureCorrectionState(args.p_fixture_id).fixture;return ok({fixture_id:f.id,revision:f.revision,details:{...f.details,grade_group_id:demoSharedFixtureGroup(f)?.id},groups:fixtureGroups.map(g=>({id:g.id,name:g.name}))});}
  if(name==='preview_fixture_correction')return ok(demoFixtureCorrectionPreview(args.p_fixture_id,args.p_values));
  const receiptKey=session.user.id+':'+args.p_request_id,prior=demoFixtureCorrectionReceipts.get(receiptKey),payload=JSON.stringify(args);
  if(prior){if(prior.payload!==payload)throw Error('This correction request was already used');return ok({...prior.result,already_saved:true});}
  if(!args.p_request_id||args.p_reason.trim().length<10)throw Error('Explain the correction in 10 to 800 characters');
  const p=demoFixtureCorrectionPreview(args.p_fixture_id,args.p_values);if(p.revision!==args.p_expected_revision||p.token!==args.p_preview_token)throw Error('The fixture or linked records changed. Review a fresh correction preview.');if(!p.can_apply)throw Error(p.blockers[0]);
  const state=demoFixtureCorrectionState(args.p_fixture_id),stamp=fixtureNow();state.fixture.details=p.details;state.fixture.revision++;state.fixture.updated_at=stamp;
  for(const m of state.matches)Object.assign(m,{match_date:p.after.match_date,format_key:p.after.format_key,opposition:p.after.opposition,updated_at:stamp});
  for(const prep of state.preparations)Object.assign(prep,{match_date:p.after.match_date,format_key:p.after.format_key,opposition:p.after.opposition,revision:(prep.revision||0)+1,updated_at:stamp});
  for(const r of state.reviews)Object.assign(r,{group_id:args.p_values.group_id,group_name:p.after.grade,match_date:p.after.match_date,format_key:p.after.format_key,opposition:p.after.opposition,revision:r.revision+1,updated_at:stamp});
  const result={fixture_id:args.p_fixture_id,correction_id:crypto.randomUUID(),revision:state.fixture.revision,already_saved:false,before:p.before,after:p.after,counts:p.counts,requires_republish:!!state.fixture.published};demoFixtureCorrectionReceipts.set(receiptKey,{payload,result});return ok(result);
 }catch(error){return bad(error.message);}
};

function demoSeasonSetup(){if(!demoSelections)seedDemoSelections();return demoSelections.team_setup??={revision:0,standin_days:1,timezone:demoSelections.access.timezone||'Australia/Sydney',appointments:{},receipts:{}};}

function demoSeasonGroups(uid=session?.user?.id){const s=demoSeasonSetup();return fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===uid)?fixtureGroups.filter(g=>g.active&&s.appointments[g.id]===uid):[];}

function demoSharedGroup(g){const uid=demoSeasonSetup().appointments[g.id];return {...g,captain_user_ids:uid?[uid]:[],captain_player_ids:fixtureRows.players.filter(p=>p.active!==false&&p.club_id===club.id&&p.user_id===uid).map(p=>p.id),captain_name:fixtureRows.user_profiles.find(p=>p.user_id===uid)?.display_name||null};}

demoMatchGroups=()=>fixtureGroups.filter(g=>g.active).map(demoSharedGroup);

function demoCaptainExpiry(details){const s=demoSeasonSetup(),zone=s.timezone,date=new Date(details.days.map(d=>d.date).sort().at(-1)+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+s.standin_days+1);const target=date.toISOString().slice(0,10);let guess=Date.parse(target+'T00:00:00Z');for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess)),p=k=>parts.find(v=>v.type===k).value;guess+=Date.parse(target+'T00:00:00Z')-Date.parse(`${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}Z`);}return new Date(guess).toISOString();}

function demoManualRoles(f){const r=demoSelections.match_review_rosters?.[f.id],g=demoSharedFixtureGroup(f),season=demoSharedGroup(g||{}).captain_player_ids.filter(id=>r?.ids.includes(id)).sort()[0];return {captain_player_id:season||r?.captain_player_id||null,keeper_player_id:r?.keeper_player_id||null};}

demoTemporaryCaptainDays=function(uid=session?.user?.id){
 const state=demoSelections;if(!state||club?.archived_at||!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===uid))return [];
 return state.fixtures.flatMap(f=>{if(f.details.cancelled)return [];const expires_at=demoCaptainExpiry(f.details),group=demoSharedFixtureGroup(f);if(Date.parse(expires_at)<=Date.now())return [];
 const shared={fixture_id:f.id,expires_at,grade:f.details.grade,group_id:group?.id||null},manual=state.match_review_rosters?.[f.id];
 if(!f.published&&manual){const cap=fixtureRows.players.find(p=>p.id===demoManualRoles(f).captain_player_id&&p.active!==false&&p.user_id===uid);return state.access.mode!=='standalone'&&cap&&manual.ids.includes(cap.id)?[{...shared,day_key:'manual',match_date:f.details.days[0].date}]:[];}
 if(!demoReviewTeamsEnabled())return [];
 const details=f.published?.details||f.details,slots=f.published?.slots||f.slots;return details.days.flatMap((day,i)=>{const key='d'+(i+1),cap=state.roster.find(r=>r.active&&r.user_id===uid&&(details.match_roles?r.id===details.match_roles[key]?.captain_id:uid===details.captain_id));return cap&&slots.some(s=>s[key]===cap.id)?[{...shared,day_key:key,match_date:day.date}]:[];});
 });
};

demoTemporaryBattingCaptain=()=>demoSelections?.access.mode!=='standalone'&&(demoSeasonGroups().length>0||demoTemporaryCaptainDays().length>0);

demoTemporaryCaptainPlayer=function(pid){
 const p=fixtureRows.players.find(p=>p.id===pid&&p.active!==false&&p.club_id===club.id);if(!p||demoSelections?.access.mode==='standalone')return false;
 const groups=demoSeasonGroups().map(g=>g.id);
 if(demoPlayerGroups(pid).some(g=>groups.includes(g.id)))return true;
 const inFixture=f=>{const manual=demoSelections.match_review_rosters?.[f.id];if(!f.published&&manual)return manual.ids.includes(pid);const r=demoSelections.roster.find(r=>r.active&&r.user_id===p.user_id);return !!r&&(f.published?.slots||f.slots).some(s=>s.d1===r.id||s.d2===r.id);};
 return demoSelections.fixtures.some(f=>!f.details.cancelled&&groups.includes(demoSharedFixtureGroup(f)?.id)&&inFixture(f))||demoTemporaryCaptainDays().some(a=>inFixture(demoSelections.fixtures.find(f=>f.id===a.fixture_id)));
};

const beforeSeasonSetupRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name==='club_team_setup'){
  try{
   if(args.p_club_id!==club.id||membership.permission_role!=='admin')throw Error('Club Admin permission required');const s=demoSeasonSetup(),d=args.p_data||{},action=args.p_action,key=session.user.id+':'+d.request_id,payload=JSON.stringify(args);
   if(action!=='get'){
    const prior=s.receipts[key];if(prior){if(prior.payload!==payload)throw Error('This request ID was already used');return {data:structuredClone(prior.data),error:null};}
    if(d.revision!==s.revision)throw Error('Shared team setup changed. Reload before saving');
    if(action==='settings'){if(!Number.isInteger(d.standin_days)||d.standin_days<1||d.standin_days>7)throw Error('Choose 1 to 7 days');new Intl.DateTimeFormat('en-AU',{timeZone:d.timezone});Object.assign(s,{standin_days:d.standin_days,timezone:d.timezone});}
    else if(action==='save_group'){
     if(!d.name?.trim())throw Error('Enter a grade name');if(d.captain_user_id&&!fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===d.captain_user_id))throw Error('Choose a registered club member');
     if(fixtureGroups.some(g=>g.id!==d.group_id&&g.name.trim().toLowerCase()===d.name.trim().toLowerCase()))throw Error('That grade already exists');
     let g=fixtureGroups.find(g=>g.id===d.group_id);if(d.group_id&&!g)throw Error('Grade unavailable');if(!g){g={id:crypto.randomUUID(),club_id:club.id,sort_order:100};fixtureGroups.push(g);}Object.assign(g,{name:d.name.trim(),active:d.active!==false});s.appointments[g.id]=d.captain_user_id||null;
    }else throw Error('Unknown action');s.revision++;
   }
   const data={revision:s.revision,standin_days:s.standin_days,timezone:s.timezone,groups:fixtureGroups.map(g=>({...g,captain_user_id:s.appointments[g.id]||null})),members:fixtureRows.club_memberships.filter(m=>m.club_id===club.id).map(m=>({user_id:m.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name||'Club member',email:''}))};
   if(action!=='get')s.receipts[key]={payload,data:structuredClone(data)};return {data,error:null};
  }catch(e){return {data:null,error:{code:'P0001',message:e.message}};}
 }
 if(name==='get_my_match_captain_access')return {data:{batting:demoTemporaryBattingCaptain(),season_groups:demoSeasonGroups().map(g=>({id:g.id,name:g.name})),appointments:demoTemporaryCaptainDays(),timezone:demoSeasonSetup().timezone},error:null};
 const result=await beforeSeasonSetupRpc(name,args);
 if(!result.error&&result.data&&['get_team_review_roster','get_team_match_review','get_team_review_session'].includes(name))result.data.groups=fixtureGroups.filter(g=>g.active).map(demoSharedGroup);
 return result;
};

function demoEnsurePendingPlayers(){
 if(!demoSelections)return;
 const ids=new Set(demoSelections.fixtures.filter(f=>f.published&&!f.published.details.cancelled).flatMap(f=>f.published.slots.flatMap(s=>[s.d1,...(f.published.details.days.length>1?[s.d2]:[])]).filter(Boolean)));
 for(const rid of ids){const r=demoSelections.roster.find(r=>r.id===rid&&r.active!==false);if(!r)continue;
  let p=fixtureRows.players.find(p=>p.id===r.review_player_id)||(r.user_id?fixtureRows.players.find(p=>p.user_id===r.user_id):null);
  if(!p){p={id:'review-'+r.id,club_id:club.id,user_id:r.user_id||null,display_name:r.name,active:true};fixtureRows.players.push(p);fixtureRows.feedback[p.id]=demoEmptyFeedback();}
  r.review_player_id=p.id;
  if(r.user_id&&!p.user_id)p.user_id=r.user_id;
 }
}

const demoBeforePendingPlayersRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(['get_team_review_roster','get_team_match_review','get_team_review_session'].includes(name))demoEnsurePendingPlayers();
 return demoBeforePendingPlayersRpc(name,args);
};

function demoSeasonIdentity132(gid){const s=demoSeasonSetup(),rid=s.roster_appointments?.[gid],r=demoSelections.roster.find(r=>r.id===rid);return {rid:r?.id||null,uid:rid?r?.user_id||null:s.appointments[gid]||null,roster:r};}

demoSeasonGroups=function(uid=session?.user?.id){return fixtureRows.club_memberships.some(m=>m.club_id===club.id&&m.user_id===uid)?fixtureGroups.filter(g=>g.active&&demoSeasonIdentity132(g.id).uid===uid):[];};

demoSharedGroup=function(g){const {rid,uid,roster}=demoSeasonIdentity132(g.id);return {...g,captain_user_ids:uid?[uid]:[],captain_roster_ids:rid?[rid]:demoSelections.roster.filter(r=>r.active&&uid&&r.user_id===uid).map(r=>r.id),captain_player_ids:fixtureRows.players.filter(p=>p.active!==false&&p.club_id===club.id&&(uid&&p.user_id===uid||roster?.review_player_id===p.id)).map(p=>p.id),captain_name:roster?.name||fixtureRows.user_profiles.find(p=>p.user_id===uid)?.display_name||null};};

const beforeCaptainSignup132=window.__fixtureRpc;

window.__fixtureRpc=async(name,args={})=>{
 if(name!=='club_team_setup')return beforeCaptainSignup132(name,args);
 const s=demoSeasonSetup(),d=args.p_data||{},key=session.user.id+':'+d.request_id;
 if(args.p_action==='save_group'&&d.new_captain_name&&demoSelections.roster.some(r=>r.name.trim().toLowerCase()===d.new_captain_name.trim().toLowerCase())&&!s.receipts[key])return {data:null,error:{code:'P0001',message:'That player is already on the playing list. Choose their existing name.'}};
 const result=await beforeCaptainSignup132(name,args);if(result.error||!result.data)return result;
 if(args.p_action==='save_group'&&!s.signup_receipts?.[key]){
  const g=fixtureGroups.find(g=>g.id===d.group_id)||fixtureGroups.find(g=>g.name===d.name.trim());let rid=d.captain_roster_id||null;
  if(d.new_captain_name){rid=crypto.randomUUID();const r={id:rid,name:d.new_captain_name.trim(),grade:g.name,active:true,user_id:null,batting:'unknown',bowling:'unknown',keeper:false,account_email:d.new_captain_email||null};
   if(demoSelections.access.mode!=='standalone'){r.review_player_id=crypto.randomUUID();fixtureRows.players.push({id:r.review_player_id,club_id:club.id,user_id:null,display_name:r.name,active:true,grade:g.name});}demoSelections.roster.push(r);
  }
  s.roster_appointments??={};s.roster_appointments[g.id]=rid;s.signup_receipts??={};s.signup_receipts[key]=true;
 }
 result.data.groups=fixtureGroups.map(g=>{const i=demoSeasonIdentity132(g.id);return {...g,captain_user_id:i.rid?null:i.uid,captain_roster_id:i.rid,captain_name:demoSharedGroup(g).captain_name,captain_pending:!!i.rid&&!i.uid};});
 result.data.roster=demoSelections.roster.filter(r=>r.active).map(r=>({...r,signup_needed:!r.user_id}));return result;
};

function demoSocialInitialState(){return {settings:{},features:{},revision:0,managers:['user-coach'],assets:[],exports:{},files:new Map(),receipts:new Map()};}

let demoSocial=demoSocialInitialState();

function demoSocialKey(f){return JSON.stringify([f.publication,f.published,demoSocial.settings,demoSocial.assets,demoSocial.features[f.id],club.logo_data_url,club.primary_colour,club.accent_colour]);}

const demoSocialPreviousRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args)=>{
 if(name!=='club_socials_api')return demoSocialPreviousRpc(name,args);
 if(!demoSelections)seedDemoSelections();const action=args.p_action,p=args.p_data||{},admin=membership.permission_role==='admin',allowed=admin||demoSocial.managers.includes(session.user.id);
 const ok=data=>({data,error:null}),bad=message=>({data:null,error:{message}});
 if(action==='access')return ok({allowed,admin,handover_count:allowed?(demoSocial.handovers||[]).length:0});if(p.request_id&&demoSocial.receipts.has(p.request_id))return ok(demoSocial.receipts.get(p.request_id));if(!allowed)return bad('Club Admin or socials manager access required');
 if(action==='context')return ok({admin,can_manage_managers:allowed,manager_handovers:demoSocial.handovers||[],manager_posts:{},timezone:demoSelections.access.timezone||'Australia/Sydney',fixture_calendar:demoSelections.fixtures.map(f=>{const details=f.published?.details||f.details;return {id:f.id,date:details.days[0].date,grade:details.grade,opposition:details.opposition,published:!!f.published,completed:seFixtureCompleted({details})};}),style_suggestions_available:true,revision:demoSocial.revision,grade_defaults:structuredClone(demoSelections.access.fixture_defaults?.rows||[]),design:structuredClone(demoSocial.settings),brand:{name:club.name,logo:club.logo_data_url,primary:club.primary_colour,accent:club.accent_colour},assets:structuredClone(demoSocial.assets),players:demoSelections.roster.map(p=>({id:p.id,name:p.name,active:p.active})),members:allowed?fixtureRows.club_memberships.map(m=>({user_id:m.user_id,name:fixtureRows.user_profiles.find(p=>p.user_id===m.user_id)?.display_name||'Example member',admin:m.permission_role==='admin',manager:demoSocial.managers.includes(m.user_id)})):[],fixtures:demoSelections.fixtures.filter(f=>f.published).map(f=>({id:f.id,published:structuredClone(f.published),publication:f.publication,published_at:fixtureNow(),season_portrait_id:f.published.details.match_roles?.d1?.captain_id,artwork_key:demoSocialKey(f),features:structuredClone(demoSocial.features[f.id]||[]),feature_valid:(demoSocial.features[f.id]||[]).every(a=>a.mode!=='player'||f.published.slots.some(z=>z['d'+a.day]===a.roster_id)),last_export:demoSocial.exports[f.id]||null}))});
 let result={saved:true};
 if(action==='settings'){if(p.revision!==demoSocial.revision)return bad('Artwork settings changed. Refresh before saving');demoSocial.settings=structuredClone(p.design);demoSocial.revision++;}
 else if(action==='feature'){if(['photo_x','photo_y'].some(k=>p[k]!==undefined&&(!Number.isInteger(p[k])||Math.abs(p[k])>30)))return bad('Move the photo by up to 30% in either direction');const f=demoSelections.fixtures.find(f=>f.id===p.fixture_id&&f.published);if(!f||f.publication!==p.publication)return bad('Published team changed');demoSocial.features[f.id]||=[];for(const day of p.days){const old=demoSocial.features[f.id].find(a=>a.day===day);if((old?.revision||0)!==p.revisions['d'+day])return bad('Featured photo changed');if(p.mode==='player'&&!f.published.slots.some(z=>z['d'+day]===p.roster_id))return bad('Choose a selected player');demoSocial.features[f.id]=demoSocial.features[f.id].filter(a=>a.day!==day);demoSocial.features[f.id].push({day,mode:p.mode,roster_id:p.roster_id,asset_id:p.asset_id,photo_x:p.photo_x||0,photo_y:p.photo_y||0,revision:(old?.revision||0)+1});}}
 else if(action==='add_asset'){if(!demoSocial.files.has(p.path))return bad('Upload an image first');const asset={id:crypto.randomUUID(),kind:p.kind,roster_id:p.roster_id||null,path:p.path,label:p.label||'',revision:1,updated_at:new Date().toISOString()};demoSocial.assets.push(asset);result.id=asset.id;if(p.feature){const data={...p.feature,mode:'player',roster_id:p.roster_id,asset_id:asset.id,request_id:crypto.randomUUID()},r=await window.__fixtureRpc('club_socials_api',{...args,p_action:'feature',p_data:data});if(r.error)return r;}}
 else if(action==='remove_gallery_asset'){const a=demoSocial.assets.find(a=>a.id===p.asset_id);if(!a||a.revision!==p.revision)return bad('Image changed');demoSocial.assets=demoSocial.assets.filter(x=>x!==a);result.old_path=a.path;for(const features of Object.values(demoSocial.features))for(const f of features)if(f.asset_id===a.id)f.asset_id=null;}
 else if(action==='manager_handover'){demoSocial.handovers||=[];if(p.user_id!==session.user.id)return bad('Request your own handover');if(p.operation==='request'&&!demoSocial.handovers.some(h=>h.user_id===p.user_id))demoSocial.handovers.push({user_id:p.user_id,name:fixtureRows.user_profiles.find(u=>u.user_id===p.user_id)?.display_name||'Example manager',requested_at:new Date().toISOString()});if(p.operation==='cancel')demoSocial.handovers=demoSocial.handovers.filter(h=>h.user_id!==p.user_id);result.message=p.operation==='cancel'?'Handover request cancelled.':'Handover requested. You remain a Socials Manager until it is completed.';}
 else if(action==='manager'){if(!p.enabled&&demoSocial.managers.length===1&&!(admin&&p.take_responsibility&&(demoSocial.handovers||[]).some(h=>h.user_id===p.user_id)))return {data:null,error:{code:'P0192',message:'The last Socials Manager must request a handover.'}};demoSocial.managers=demoSocial.managers.filter(u=>u!==p.user_id);if(p.enabled)demoSocial.managers.push(p.user_id);else demoSocial.handovers=(demoSocial.handovers||[]).filter(h=>h.user_id!==p.user_id);result.access_removed=!admin&&!demoSocial.managers.includes(session.user.id);}
 else if(['save_asset','remove_asset'].includes(action)){const old=demoSocial.assets.find(a=>a.kind===p.kind&&(a.roster_id||null)===(p.roster_id||null));if((old?.revision||0)!==p.revision||(old?.id||null)!==(p.asset_id||null))return bad('This image changed. Refresh before replacing it');result.old_path=old?.path;demoSocial.assets=demoSocial.assets.filter(a=>a!==old);if(action==='save_asset'){if(!demoSocial.files.has(p.path))return bad('Upload an image first');const asset={id:old?.id||crypto.randomUUID(),kind:p.kind,roster_id:p.roster_id||null,path:p.path,revision:(old?.revision||0)+1};demoSocial.assets.push(asset);result.id=asset.id;}}
 else if(['validate_export','record_export'].includes(action)){for(const x of p.fixtures||[]){const f=demoSelections.fixtures.find(f=>f.id===x.id&&f.published);if(!f||demoSocialKey(f)!==x.artwork_key)return bad('A published team or its artwork changed. Refresh the graphics before downloading');}if(action==='validate_export')return ok({current:true});for(const x of p.fixtures)demoSocial.exports[x.id]={artwork_key:x.artwork_key,at:fixtureNow()};}
 else return bad('Unknown social artwork action');
 if(p.request_id)demoSocial.receipts.set(p.request_id,structuredClone(result));return ok(result);
};

window.__fixtureDb.storage={from:bucket=>({
 upload:async(path,blob)=>{if(!['club-socials','club-social-awards'].includes(bucket))return {error:{message:'Unknown demo bucket'}};demoSocial.files.set(path,blob);return {data:{path},error:null};},
 download:async path=>demoSocial.files.has(path)?{data:demoSocial.files.get(path),error:null}:{data:null,error:{message:'Demo image missing'}},
 remove:async paths=>{for(const path of paths)demoSocial.files.delete(path);return {data:[],error:null};}
})};

window.__socialStyleDemo=async body=>({data:{design:{layout:'portrait',theme:body.brief.toLowerCase().includes('clean')?'solid':'gradient',font:'bold',frame:'cutout',marker:'arrows',primary:'#073554',accent:'#128FD2'},explanation:'Demo style preview. In your club, the style suggestion reads the uploaded examples and your design brief.'},error:null});

let demoPrep={jobs:[],mode:'setup',total_limit:40,monthly_limit:40,revision:1,receipts:new Map()};

const demoPrepPreviousRpc=window.__fixtureRpc;

window.__fixtureRpc=async(name,args)=>{
 if(!['club_socials_prepare_api','club_socials_prepare_admin'].includes(name)){const r=await demoPrepPreviousRpc(name,args);if(name==='club_socials_api'&&args.p_action==='context'&&r.data){r.data.style_suggestions_available=demoPrep.mode!=='paused';r.data.artwork_ai_paused=demoPrep.mode==='paused';}return r;}
 const ok=data=>({data,error:null}),bad=message=>({data:null,error:{message}}),p=args.p_data||{},action=args.p_action;
 if(name==='club_socials_prepare_admin'){
  if(!['owner','commercial_admin'].includes(platformRole))return bad('Platform commercial access required');
  if(action==='context')return ok({usage:[{club_id:club.id,attempts_7_days:demoPrep.jobs.length,credits_used:demoPrep.jobs.filter(j=>j.credit_used).length}],clubs:[{id:club.id,name:club.name,mode:demoPrep.mode,total_limit:demoPrep.total_limit,monthly_limit:demoPrep.monthly_limit,revision:demoPrep.revision}]});
  if(action==='settings'){if(p.revision!==demoPrep.revision)return bad('AI allowance changed. Refresh before saving');Object.assign(demoPrep,{mode:p.mode,total_limit:p.total_limit,monthly_limit:p.monthly_limit,revision:demoPrep.revision+1});return ok({saved:true});}
 }
 if(membership.permission_role!=='admin'&&!demoSocial.managers.includes(session.user.id))return bad('Club Admin or socials manager access required');
 if(action==='context')return ok({demo:true,jobs:structuredClone(demoPrep.jobs),mode:demoPrep.mode,total_limit:demoPrep.total_limit,total_used:demoPrep.jobs.filter(j=>j.credit_used||['pending','processing'].includes(j.state)).length,limit_30_days:demoPrep.monthly_limit,prepared_30_days:demoPrep.jobs.filter(j=>j.credit_used).length});
 if(demoPrep.receipts.has(p.request_id))return ok(demoPrep.receipts.get(p.request_id));
 let result={saved:true};
 if(action==='start'){
  if(demoPrep.mode==='paused')return bad('AI preparation is paused for this club');
  if(demoPrep.jobs.some(j=>['pending','processing'].includes(j.state)))return bad('An image is already being prepared');
  const used=demoPrep.jobs.filter(j=>j.credit_used).length;if(used>=demoPrep.monthly_limit||demoPrep.total_limit!=null&&used>=demoPrep.total_limit)return bad('The club has used its AI allowance');
  const source=p.source_path||demoSocial.assets.find(a=>a.id===p.source_asset_id)?.path||demoPrep.jobs.find(j=>j.id===p.source_job_id)?.result_path;if(!demoSocial.files.has(source))return bad('Upload a source image');
  const j={id:crypto.randomUUID(),...structuredClone(p),source_path:source,state:'processing',created_at:new Date().toISOString(),started_at:new Date().toISOString(),credit_used:false};demoPrep.jobs.unshift(j);result={id:j.id,state:j.state};
 }
 else if(action==='complete_setup'){if(demoPrep.jobs.some(j=>['pending','processing'].includes(j.state)))return bad('Wait for the current preparation');if(demoPrep.mode==='setup'){demoPrep.mode='paused';demoPrep.revision++;}}
 else{
  const j=demoPrep.jobs.find(j=>j.id===p.id);if(!j)return bad('Preparation not found');
  if(action==='discard'){if(j.state==='approved')return bad('Already saved');j.state='discarded';}
  else if(action==='approve'){
   if(j.state==='approved')return ok({saved:true,id:j.asset_id});if(j.state!=='ready')return bad('Wait for the image preview');
   if(j.kind!=='photo'&&p.design_revision!==demoSocial.revision)return bad('Artwork settings changed. Refresh before saving');
   const kind=j.kind==='master'?'background':j.kind==='banner'?'sponsors':j.kind,r=await demoPrepPreviousRpc('club_socials_api',{p_club_id:club.id,p_action:kind==='photo'?'add_asset':'save_asset',p_data:{request_id:crypto.randomUUID(),kind,roster_id:j.roster_id,path:p.path,asset_id:p.asset_id,revision:p.asset_revision}});if(r.error)return r;result=r.data;
   if(kind!=='photo'){demoSocial.settings={...p.design,...(j.kind==='master'?{header_layout:'integrated',theme:'solid'}:j.kind==='banner'?{header_layout:'banner'}:{theme:'solid'})};demoSocial.revision++;}
   j.state='approved';j.asset_id=result.id;
  }else return bad('Unknown preparation action');
 }
 demoPrep.receipts.set(p.request_id,structuredClone(result));return ok(result);
};

const demoPrepStorage=window.__fixtureDb.storage.from;

window.__fixtureDb.storage.from=bucket=>bucket==='club-social-prep'?{upload:async(path,blob)=>{demoSocial.files.set(path,blob);return {data:{path},error:null};},download:async path=>demoSocial.files.has(path)?{data:demoSocial.files.get(path),error:null}:{data:null,error:{message:'Demo image missing'}},remove:async()=>({data:[],error:null})}:demoPrepStorage(bucket);

window.__socialPrepareDemo=async body=>{
 if(body.action==='status')return {data:{available:true,model:'isolated-demo'},error:null};
 const r=await window.__fixtureRpc('club_socials_prepare_api',{p_club_id:body.club_id,p_action:'start',p_data:body.data});if(r.error)return {...r,status:400};
 const j=demoPrep.jobs.find(j=>j.id===r.data.id);setTimeout(()=>{if(j.state!=='processing')return;j.state='ready';j.credit_used=true;j.result_path=club.id+'/result/'+j.id+'.png';demoSocial.files.set(j.result_path,window.demoPreparedImage||demoSocial.files.get(j.source_path));},window.demoPrepDelay??150);
 return r;
};

function demoDecorate(){
  // The current board supplies Day 1/Day 2 labels. Keep its slot grid intact.
  // Administrative actions are visible but not offered as working demo operations.
  for(const id of ['out','joinAnother','accountPassword','remindOverduePlayers','guideAsk','copyPlayerWhatsApp','copyPlayerLink','copyStaffJoinLink','togglePlayerSignup','regeneratePlayerLink','openLeadHandover','sendLeadHandover','sendPhilosophyInvite','invitePhilosophyByEmail']){
    const node=document.getElementById(id);if(node){node.disabled=true;node.title='Available in your live club. These are fictional demo accounts.';}
  }

  document.querySelectorAll('[data-invite-whatsapp]').forEach(link=>{link.setAttribute('aria-disabled','true');link.title='Share invitations from your live club.';link.onclick=e=>e.preventDefault();});
  const refresh=document.getElementById('refreshPublication');if(refresh)refresh.onclick=()=>demoNavigate('waiting');
  const chat=document.querySelector('.guide-chat-card');
  if(chat){
    // The renderer still owns these controls while awaiting its data. Never
    // replace/remove them from a MutationObserver: it must be able to finish
    // binding handlers. Insert the demo explanation alongside the live card.
    if(!document.getElementById('demoGuideNote')){
      chat.insertAdjacentHTML('beforebegin',`<section id="demoGuideNote" class="card demo-guide-explainer"><h2>Ask the Guide</h2><p>Guide chat is available in your signed-in club. Explore the tutorials below.</p><div class="btnrow"><a class="btn secondary" href="https://mirelionhq.com/app.html?tab=guide">Sign in to your club</a><button type="button" class="btn ghost" id="demoAssistLink">Message us · Mirelion Assist</button></div></section>`);
    }
    const assistLink=document.getElementById('demoAssistLink');if(assistLink)assistLink.onclick=()=>document.getElementById('guideHumanHandoff')?.click();
    chat.hidden=true;
  }
  const question=document.getElementById('guideQuestion');if(question)question.disabled=true;
}

renderPlayerQRCode=async()=>{
  const fallback=document.getElementById('qrFallback');
  if(fallback)fallback.textContent='Your live club’s sign-up QR code appears here. This demo uses fictional accounts.';
};

function demoWorkshopSnapshot(){return fixtureClone({workshop,howWeBatDraft,playerPlanStructureDraft,philosophyVersions,howWeBatVersions,playerPlanStructureVersions,workflows:fixtureRows.player_plan_workflows,feedback:fixtureRows.feedback,requirements:fixtureRows.player_plan_requirements,contributors:fixtureRows.philosophy_contributors,responses:fixtureRows.philosophy_contributions,snapshots:fixtureRows.philosophy_final_draft_snapshots,archives:demoArchives,messages:demoMessages,weekly_loop:fixtureRows.weekly_loop,match_preparations:fixtureRows.match_preparations,match_preparation_receipts:fixtureRows.match_preparation_receipts,match_preparation_seeded:fixtureRows.match_preparation_seeded});}

function demoRestoreWorkshopSnapshot(saved){
  ({workshop,howWeBatDraft,playerPlanStructureDraft,philosophyVersions,howWeBatVersions,playerPlanStructureVersions}=fixtureClone(saved));
  for(const [key,value] of Object.entries({player_plan_workflows:saved.workflows,feedback:saved.feedback,player_plan_requirements:saved.requirements,philosophy_contributors:saved.contributors,philosophy_contributions:saved.responses,philosophy_final_draft_snapshots:saved.snapshots,weekly_loop:saved.weekly_loop,match_preparations:saved.match_preparations,match_preparation_receipts:saved.match_preparation_receipts,match_preparation_seeded:saved.match_preparation_seeded}))fixtureRows[key]=fixtureClone(value);
  demoArchives=fixtureClone(saved.archives);demoMessages=fixtureClone(saved.messages);
}

function demoSetPreparation(preparing){
  if(preparing&&!demoIsPreparing){
    demoPublishedSnapshot=demoWorkshopSnapshot();
    if(demoPreparationSnapshot)demoRestoreWorkshopSnapshot(demoPreparationSnapshot);
    else {
      workshop={...workshop,status:'review',final_draft_ready:false,final_draft_started_at:null,how_we_bat_selected_at:null};
      howWeBatDraft=null;playerPlanStructureDraft=null;philosophyVersions=[];howWeBatVersions=[];playerPlanStructureVersions=[];
      fixtureRows.player_plan_workflows=[];fixtureRows.player_plan_requirements=[];
      fixtureRows.weekly_loop={};fixtureRows.match_preparations=[];fixtureRows.match_preparation_receipts={};fixtureRows.match_preparation_seeded=false;
      fixtureRows.feedback=Object.fromEntries(fixtureRows.players.map(player=>[player.id,demoEmptyFeedback()]));
    }
  }else if(!preparing&&demoIsPreparing){
    demoPreparationSnapshot=demoWorkshopSnapshot();demoRestoreWorkshopSnapshot(demoPublishedSnapshot);
  }
  demoIsPreparing=preparing;clubHomeExpandedStage=null;clubHomeNextPreparationKey=null;
}

const demoOriginalRenderTab=renderTab;

renderTab=function(){
  window.__demoRenderDone=Promise.resolve(demoOriginalRenderTab()).then(()=>demoDecorate());
  return window.__demoRenderDone;
};

function demoPrepareMatchTutorial(stage){
 if(!demoSelections)seedDemoSelections();
 if(stage.key==='team_review_manual')demoSelections.access.status='disabled';
 else if(stage.tab==='teams'||['team_review','individual_match_first'].includes(stage.key))demoSelections.access.status='pilot';
 if(!['team_review','team_review_manual'].includes(stage.key))return null;
 const id=stage.key==='team_review'?'tutorial-published-match':'tutorial-manual-match';
 let match=demoSelections.fixtures.find(f=>f.id===id);if(match)return match;
 const template=demoSelections.fixtures.find(f=>f.id==='selection-first')||demoSelections.fixtures[0];
 const details={...fixtureClone(template.details),grade:'1st Grade',grade_group_id:'group-first',days:[{date:'2026-10-08',start:'10:00'}],format:'limited_overs',overs:50,opposition:stage.key==='team_review'?'Bay Visitors':'Valley Visitors',brackets:false,match_roles:{d1:fixtureClone(template.details.match_roles.d1)}};
 const slots=stage.key==='team_review'?fixtureClone(template.slots).map(slot=>({...slot,d2:null})):Array.from({length:11},()=>({d1:null,d2:null}));
 match={id,club_id:club.id,revision:1,publication:stage.key==='team_review'?1:0,published:null,details,slots};
 if(stage.key==='team_review'){
  const selected=demoSelections.roster.filter(p=>slots.some(slot=>slot.d1===p.id));
  for(const player of selected)player.availability.available_dates=[...new Set([...(player.availability.available_dates||[]),'2026-10-08'])];
  match.published={details:fixtureClone(details),slots:fixtureClone(slots),players:selected.map(p=>({id:p.id,name:p.name,batting:p.batting,bowling:p.bowling,bowling_load:p.bowling_load,spin_style:p.spin_style||'unknown',keeper:p.keeper}))};
 }else match.details.match_roles={d1:{captain_id:null,captain_manual:false,keeper_id:null,keeper_manual:false}};
 demoSelections.fixtures.push(match);return match;
}

const demoSharedResults=createSharedResultsDemo(()=>demoSelections,()=>demoScorecards,()=>demoScorePlayerLinks);

const demoResultsRPC=window.__fixtureDb.rpc;

window.__fixtureDb.rpc=async function(name,args){if(name==='club_match_results_api'){try{return {data:await demoSharedResults.rpc(args.p_action,args.p_data),error:null};}catch(e){return {data:null,error:{message:e.message}};}}return demoResultsRPC.call(this,name,args);};

const demoSelectionRooms=new Map();

const beforeRoomDemoRpc=supabase.rpc;

supabase.rpc=async function(name,args){
 if(name!=='selection_room_api')return beforeRoomDemoRpc(name,args);
 if(!selectionsEnabled()||!selectionState?.data?.selector)return {error:{code:'42501',message:'Assigned selectors only'}};
 const key=args.p_club_id,d=args.p_data||{},action=args.p_action;
 if(!demoSelectionRooms.has(key))demoSelectionRooms.set(key,{messages:[],backup_url:'',revision:0,requests:new Map()});
 const r=demoSelectionRooms.get(key),can_manage=!!selectionState.data.head_selector;
 if(action==='context')return {data:{messages:r.messages.filter(m=>d.after?BigInt(m.id)>BigInt(d.after):d.before?BigInt(m.id)<BigInt(d.before):true).slice(d.after?0:-100,d.after?100:undefined),has_older:false,backup_url:r.backup_url,revision:r.revision,can_manage}};
 if(action==='post'){
  const request=session.user.id+':'+d.request_id;
  if(!r.requests.has(request)){const member=selectionState.data.members.find(m=>m.user_id===session.user.id);const m={id:String(r.messages.length+1),author_id:session.user.id,author_name:member?.name||'Demo selector',body:d.body,created_at:new Date().toISOString()};r.requests.set(request,m);r.messages.push(m);}
  return {data:{message:structuredClone(r.requests.get(request))}};
 }
 if(action==='save_backup'&&can_manage){if(r.revision!==d.revision)return {error:{message:'The backup call changed. Reopen it before saving.'}};r.backup_url=selectionCallLink(d.url);r.revision++;return {data:{backup_url:r.backup_url,revision:r.revision}};}
 return {error:{message:'This action is unavailable in the demo.'}};
};

const beforeRoomDemoVideo=supabase.functions.invoke;

supabase.functions.invoke=async function(name,args){return name==='selection-video'?{data:{available:false,reason:'demo'}}:beforeRoomDemoVideo(name,args);};

const demoBeforeUnifiedReviewRpc=supabase.rpc;

supabase.rpc=async function(name,args){
 if(name!=='get_shared_team_review')return demoBeforeUnifiedReviewRpc(name,args);
 try{
  demoTeamStaff(args.p_club_id);const target=demoTeamReviewById(args.p_review_id),normal=demoInningsOpponent;
  const related=fixtureRows.team_review_sessions.filter(r=>!r.deleted&&(target.fixture_id?r.fixture_id===target.fixture_id:!r.fixture_id&&r.group_id===target.group_id&&r.group_scope===target.group_scope&&r.match_date===target.match_date&&r.format_key===target.format_key&&normal(r.opposition)===normal(target.opposition))&&demoTeamMetadata(r).player_count);
  const innings=related.filter(r=>Number(r.innings_number)===Number(target.innings_number)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)),mine=innings.find(r=>r.author_user_id===session.user.id);
  const out=await demoBeforeUnifiedReviewRpc(mine?'get_team_review_session':'get_team_match_review',mine?{p_club_id:club.id,p_review_id:mine.id}:{p_club_id:club.id,p_match_date:target.match_date,p_format_key:target.format_key,p_opposition:target.opposition,p_innings_number:target.innings_number,p_group_id:null});
  if(out.error)return out;const data=out.data;if(!mine)data.review={...demoTeamMetadata(target),fixture_id:target.fixture_id};
  for(const p of data.players||[]){
   const links=innings.flatMap(r=>r.rows.filter(x=>x.player_id===p.player_id)),ids=[...new Set(links.map(x=>x.match_id))],mid=p.match_id||(ids.length===1?ids[0]:null),m=fixtureRows.feedback[p.player_id]?.matches.find(m=>m.id===mid);
   p.shared_included_in_review=!!links.length;p.included_in_review=!!mine&&!!p.included_in_review;
   if(m)Object.assign(p,{match_id:m.id,match_updated_at:m.updated_at,score_text:m.score_text,scorecard:m.scorecard||p.scorecard,participation_status:m.participation_status});
   p.shared_observations=(m?.coach_feedback||[]).filter(f=>f.author_user_id!==session.user.id&&(myPlayer?.id!==p.player_id||f.plan_related===false||m.player_reflection)).map(f=>({author_user_id:f.author_user_id,author_name:fixtureRows.user_profiles.find(u=>u.user_id===f.author_user_id)?.display_name||'Coach',batting_to_plan:f.batting_to_plan,dismissal_classification:f.dismissal_classification,updated_at:f.updated_at}));
  }
  const source=related.find(r=>r.scorecard_id),card=source?demoScorecardPreview(source.scorecard_id):null;
  if(card){data.scorecard_preview={...card,our_team_id:source.source_team_id};data.review.source_team_id||=source.source_team_id;}
  const perInnings=new Map();for(const r of related){const n=Number(r.innings_number),prior=perInnings.get(n);if(!prior||r.author_user_id===session.user.id)perInnings.set(n,r);}
  return {data:{...data,own_review_id:mine?.id||null,shared_review_id:innings[0].id,contributors:innings.map(demoTeamMetadata),sibling_reviews:[...perInnings.values()].map(demoTeamMetadata)},error:null};
 }catch(error){return {data:null,error:{code:'P0001',message:error.message}};}
};

const demoSeasonStats=createSeasonStatsDemo(()=>demoSelections,()=>demoScorecards,()=>demoScorePlayerLinks,()=>({...membership,user_id:session?.user.id}),()=>club.id,()=>new Date().toLocaleDateString('en-CA',{timeZone:demoSelections?.access.timezone||'Australia/Sydney'}));

const demoBeforeSeasonStatsRpc=window.__fixtureDb.rpc;

window.__fixtureDb.rpc=async function(name,args){if(name==='club_selection_history_api')return {data:{players:(args.p_data?.roster_ids||[]).map(id=>({roster_id:id,records:[]})),identity_status:'unconfirmed_name_and_club'},error:null};if(name==='club_season_stats_api'){try{return {data:demoSeasonStats(args),error:null};}catch(error){return {data:null,error:{message:error.message}};}}return demoBeforeSeasonStatsRpc.call(this,name,args);};

const demoSocialAwards=createSocialAwardsDemo(()=>demoSelections,()=>demoSharedResults,()=>demoSocial,()=>membership,()=>session?.user.id);

const demoBeforeAwardsRpc=window.__fixtureDb.rpc;

window.__fixtureDb.rpc=function(name,args){return name==='club_social_awards_api'?demoSocialAwards.rpc(name,args):demoBeforeAwardsRpc.call(this,name,args);};
