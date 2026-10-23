// In-memory equivalents of current service contracts. Never use customer data here.
let demoProduct='select',demoPersona='player',demoScenario='ready';
let demoGroups,demoPermissions,demoConnection,demoWeek,demoAwardScopes,demoAwardLabels,demoTeamWeek,demoPlayerWeek;
const demoOK=data=>({data:structuredClone(data),error:null});
const demoFail=message=>({data:null,error:{code:'P0001',message}});
const demoIsSocial=()=>isAdmin()||demoSocial.managers.includes(session?.user.id);
const demoAddDay=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
function demoUpcomingSaturday(){const today=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'}),day=new Date(today+'T12:00:00Z').getUTCDay();return demoAddDay(today,(6-day+7)%7||7);}
function demoGroupFor(f){return demoGroups.grades.find(g=>g.id===f.details?.grade_group_id||g.name===f.details?.grade)?.selection_group_id||null;}
function demoGrant(group,user=session?.user.id){const g=demoPermissions.groups.find(g=>g.id===group);return g?.head_id===user?2:g?.members.find(m=>m.user_id===user)?.access==='edit'?2:g?.members.find(m=>m.user_id===user)?.access==='view'||demoPermissions.club_head_id===user?1:0;}
function demoGroupHead(group){return demoPermissions.groups.find(g=>g.id===group)?.head_id;}
function demoGroupContext(){return {...structuredClone(demoGroups),can_edit:isAdmin(),batting_available:demoProduct!=='select',expected_grades:JSON.stringify(fixtureGroups.map(g=>[g.id,g.name])),grades:fixtureGroups.map(g=>({...g,selection_group_id:demoGroups.grades.find(x=>x.id===g.id)?.selection_group_id||null}))};}
function demoSeedCurrent({empty=false}={}){
 demoClubBatting=null;demoSelections=null;selectionState=null;selectionAccess=null;socialState=null;demoSeedClub();seedDemoSelections();
 const addMember=(id,name,role='player',involvement='coach_captain')=>{fixtureRows.user_profiles.push({user_id:id,display_name:name});fixtureRows.club_memberships.push({club_id:club.id,user_id:id,permission_role:role,involvement});};
 addMember('user-selector','Morgan Lane');addMember('user-head','Jamie Wells');addMember('user-lead','Jules Bennett');addMember('user-social','Avery Shaw');addMember('user-combined','Robin Hart','captain','both');addMember('user-masters-head','Drew Kelly');
 workshop.philosophy_lead_user_id='user-lead';
 const lead=fixtureClone(fixtureRows.philosophy_contributors.find(p=>p.user_id==='user-admin'));
 fixtureRows.philosophy_contributors=fixtureRows.philosophy_contributors.filter(p=>!['user-admin','user-jordan'].includes(p.user_id));
 for(const [uid,name] of [['user-lead','Jules Bennett'],['user-taylor','Taylor Brooks'],['user-combined','Robin Hart']]){
  fixtureRows.philosophy_contributors.push({...lead,id:'contributor-'+uid,user_id:uid,display_name:name});
  const response=fixtureRows.philosophy_contributions.find(p=>p.user_id==='user-admin');if(response)fixtureRows.philosophy_contributions.push({...fixtureClone(response),id:'response-'+uid,user_id:uid});
 }
 const combinedPlayer={...fixtureClone(fixtureRows.players[1]),id:'player-combined',user_id:'user-combined',display_name:'Robin Hart'};fixtureRows.players.push(combinedPlayer);
 fixtureRows.feedback['player-combined']=demoEmptyFeedback();fixtureRows.player_plan_workflows.push({...fixtureClone(fixtureRows.player_plan_workflows[1]),id:'workflow-player-combined',player_id:'player-combined'});
 fixtureRows.club_access_grants=fixtureRows.club_access_grants.filter(g=>g.user_id==='user-coach');
 fixtureRows.club_access_grants.push({club_id:club.id,user_id:'user-jordan',scope:'playing_group',playing_group_id:'group-first',can_view:true,can_edit:true},{club_id:club.id,user_id:'user-combined',scope:'playing_group',playing_group_id:'group-second',can_view:true,can_edit:true});
 fixtureGroups[1].name='Fifth Grade';fixtureGroups.push({id:'group-masters',club_id:club.id,name:'Masters',active:true,sort_order:2});
 const first=demoUpcomingSaturday(),second=demoAddDay(first,7);
 for(const p of demoSelections.roster){p.availability.available_dates=p.availability.available_dates.map(d=>d==='2026-10-10'?first:second);p.availability.checked_at=fixtureNow();}
 Object.assign(demoSelections.roster[1],{name:'Jordan Ellis'});Object.assign(demoSelections.roster[2],{name:'Taylor Brooks'});Object.assign(demoSelections.roster[14],{name:'Robin Hart',user_id:'user-combined'});
 for(const [i,f] of demoSelections.fixtures.entries()){
  f.details.days=[{date:first,start:'12:00'},{date:second,start:'12:00'}];Object.assign(f.details,{grade_group_id:i?'group-second':'group-first',round:'3',season:String(new Date().getFullYear()),staff:[]});
  if(i)for(const key of ['d1','d2'])f.details.match_roles[key].captain_id=demoSelections.roster[14].id;
  // A published XI is available to players; staff can compare the next draft.
  f.publication=1;f.published={details:fixtureClone(f.details),slots:fixtureClone(f.slots),players:demoSelections.roster.filter(p=>f.slots.some(s=>s.d1===p.id||s.d2===p.id)).map(p=>({id:p.id,name:p.name,batting:p.batting,bowling:p.bowling,bowling_load:p.bowling_load,keeper:p.keeper}))};
  f.published_at=fixtureNow();f.selection_unlocked_until=new Date(Date.now()+86400000*30).toISOString();
 }
 demoSelections.selectors=['user-selector','user-head','user-masters-head'];demoSelections.access.head_selector_id='user-head';
 const mastersNames=['Drew Kelly','Lee Adams','Pat Foster','Cameron Ward','Les Turner','Andy Cross','Chris Cole','Ben Dunn','Glen Hill','Mark Ross','Paul Woods'];
 const mastersPlayers=mastersNames.map((name,i)=>({id:'masters-player-'+i,name,grade:'Masters',external_id:'EXAMPLE-M-'+i,active:true,user_id:null,batting:i<6?'top':'lower',bowling:i>6?'pace':'none',bowling_load:'frontline',keeper:i===5,availability:{revision:1,usual_available:false,blocks:[],available_dates:[demoAddDay(first,1)],unavailable_dates:[]}}));demoSelections.roster.push(...mastersPlayers);
 demoSelections.fixtures.push({id:'masters-upcoming',club_id:club.id,revision:1,publication:0,published:null,details:{grade:'Masters',grade_group_id:'group-masters',round:'2',format:'limited_overs',overs:40,competition:'Example Masters',opposition:'Valley Masters',ground:'Masters Oval',days:[{date:demoAddDay(first,1),start:'10:00'}],meeting:'Meet at 9:15 am.',min_quicks:3,min_batters:5,staff:[],match_roles:{d1:{captain_id:mastersPlayers[0].id,captain_manual:true,keeper_id:mastersPlayers[5].id,keeper_manual:true}}},slots:mastersPlayers.map(p=>({d1:p.id,d2:null}))});
 demoSeasonSetup().appointments={'group-first':'user-jordan','group-second':'user-combined'};
 demoGroups={revision:1,selection_groups:[{id:'sg-senior',name:'Senior cricket',batting_enabled:true},{id:'sg-masters',name:'Masters cricket',batting_enabled:false}],grades:fixtureGroups.map(g=>({...g,selection_group_id:g.id==='group-masters'?'sg-masters':'sg-senior'})),mappings:[],season:'demo-season',catalogue:'demo-catalogue',teams:demoSourceTeams()};
 demoPermissions={revision:1,club_head_id:'user-head',groups:[{id:'sg-senior',name:'Senior cricket',head_id:'user-head',members:[{user_id:'user-head',access:'edit'},{user_id:'user-selector',access:'edit'}]},{id:'sg-masters',name:'Masters cricket',head_id:'user-masters-head',members:[{user_id:'user-masters-head',access:'edit'},{user_id:'user-selector',access:'view'}]}],invites:[]};
 demoSocial.managers=['user-social','user-combined'];demoSocial.settings={...demoSocial.settings,grade_labels:[],title:'TEAM SELECTIONS'};
 demoConnection={club_name:club.name,revision:0,request:{association:'Example District Cricket Association',club_url:'',contact_name:'Sam Taylor',contact_role:'Club Admin',contact_email:'sam@example.test'},state:empty?'not_requested':'connected',configured:!empty,verified:!empty,connection_version:empty?0:1,polling_enabled:!empty,organisation_id:empty?'':'11111111-1111-4111-8111-111111111111',association_id:empty?'':'22222222-2222-4222-8222-222222222222'};
 demoWeek={settings:{revision:1,reminders_enabled:false,acknowledgement_enabled:true,deadline_weekday:4,deadline_time:'18:00:00'},plans:[],calendar_active:false,acknowledgements:[]};
 demoAwardScopes={};demoAwardLabels={};demoTeamWeek=createTeamWeekDemo(()=>club.name,end=>demoSharedResults.awards(end));demoPlayerWeek=createPlayerWeekDemo(()=>club.name,end=>demoSharedResults.awards(end));
 if(empty){fixtureGroups.splice(0);demoSelections.fixtures=[];demoSelections.roster=[];demoSelections.group_links=[];demoSelections.selectors=[];demoSelections.access.head_selector_id=null;demoGroups.selection_groups=[];demoGroups.grades=[];demoGroups.season='';demoGroups.teams=[];demoPermissions.groups=[];demoPermissions.club_head_id=null;demoSeasonSetup().appointments={};fixtureRows.club_memberships=fixtureRows.club_memberships.filter(m=>m.user_id==='user-admin');fixtureRows.user_profiles=fixtureRows.user_profiles.filter(m=>m.user_id==='user-admin');fixtureRows.players=[];fixtureRows.club_access_grants=[];}
 demoSelections.access.mode=demoProduct==='select'?'standalone':'bundle';
 if(!empty){
  // Seed a useful previous week before a Socials Manager opens awards or stats.
  const upcoming=demoSelections.fixtures;demoSelections.fixtures=upcoming.filter(f=>f.details.grade!=='Masters');
  demoSeasonStats({p_club_id:club.id,p_action:'context',p_data:{}});demoSelections.fixtures=upcoming;
  demoSelections.result_sources||={};
  for(const card of Object.values(demoScorecards)){
   const original=upcoming.find(f=>f.details.grade===card.grade);if(!original)continue;
   const days=[{date:card.dates[0],start:'12:00'}],round=1+Math.round((Date.parse(card.dates[0])-Date.parse(demoAddDay(first,-21)))/(7*86400000));
   const f={...fixtureClone(original),id:'history-'+card.match_id,details:{...fixtureClone(original.details),round:String(round),days,brackets:false},slots:original.slots.map(s=>({d1:s.d1,d2:null}))};
   f.published={details:fixtureClone(f.details),slots:fixtureClone(f.slots),players:fixtureClone(original.published.players)};f.selection_unlocked_until=null;demoSelections.fixtures.push(f);demoSelections.result_sources[f.id]={match_id:card.match_id,team_id:card.teams[0].id};card.teams[0].name=club.name;card.result=club.name+' won';
   if(round===3){card.innings[0].batters[0].runs=112;card.innings[1].bowlers[0].wickets=5;}
  }
  for(const f of upcoming.filter(f=>f.id==='selection-first'||f.id==='selection-second')){f.details.round='4';f.published.details.round='4';}
  const abandoned={id:'masters-abandoned',club_id:club.id,revision:1,publication:0,published:null,details:{grade:'Masters',grade_group_id:'group-masters',format:'limited_overs',round:'1',competition:'Example District',opposition:'Hill Example CC',ground:'Masters Oval',days:[{date:demoAddDay(first,-7),start:'12:00'}],cancelled:true,staff:[],match_roles:{d1:{captain_id:null,keeper_id:null}}},slots:Array.from({length:11},()=>({d1:null,d2:null}))};
  demoSelections.fixtures.push(abandoned);demoSelections.result_sources||={};demoSelections.result_sources[abandoned.id]={no_play:'abandoned'};
 }
}
function demoSourceTeams(){return [{id:'source-first',name:'Harbour First XI',grade:{id:'source-grade-first',name:'First XI'},competition:{name:'Example District'}},{id:'source-fifth',name:'Harbour Fifth Grade',grade:{id:'source-grade-fifth',name:'Fifth Grade'},competition:{name:'Example District'}}];}
function demoWeekContext(){return {...fixtureClone(demoWeek),can_manage:isAdmin(),acknowledgements:demoSelections.fixtures.flatMap(f=>!f.published?[]:[...new Set(f.published.slots.flatMap(s=>[s.d1,s.d2]).filter(Boolean))].map(id=>({fixture_id:f.id,roster_id:id,publication:f.publication,linked:!!demoSelections.roster.find(p=>p.id===id)?.user_id,seen_at:demoWeek.acknowledgements.find(a=>a.fixture_id===f.id&&a.roster_id===id)?.seen_at||null})))};}
function demoScope(kind){return demoAwardScopes[kind]||={revision:0,award_scope:{mode:'all',ids:[],grade_ids:demoGroups.grades.map(g=>g.id),key:'all',label:'All'}};}
function demoScopeContext(kind){return {...fixtureClone(demoScope(kind)),groups:demoGroups.selection_groups.map(g=>({id:g.id,name:g.name})),grades:demoGroupContext().grades.map(g=>({id:g.id,name:g.name,group_id:g.selection_group_id}))};}
const demoPreviousCurrentRpc=supabase.rpc;
supabase.rpc=async function(name,args={}){
 const a=args.p_action,d=args.p_data||{},uid=session?.user.id;
 try{
  if(name==='selection_video_credit_api')return a==='balance'?demoOK({kind:'complimentary',available_seconds:86400,held_seconds:0,can_manage:isAdmin(),can_top_up:false,renews_at:demoAddDay(demoUpcomingSaturday(),30),history:[]}):demoFail('Purchases are unavailable in the demo.');
  if(name==='club_week_api'){
   if(a==='context')return demoOK(demoWeekContext());
   if(a==='settings'){if(!isAdmin())return demoFail('Club Admin access required');Object.assign(demoWeek.settings,d,{revision:demoWeek.settings.revision+1});return demoOK({saved:true});}
   if(a==='acknowledge'){const p=demoSelections.roster.find(p=>p.user_id===uid),f=demoSelections.fixtures.find(f=>f.id===d.fixture_id);if(!p||!f?.published?.slots.some(s=>s.d1===p.id||s.d2===p.id))return demoFail('Only acknowledge your own published team');demoWeek.acknowledgements.push({fixture_id:f.id,roster_id:p.id,seen_at:fixtureNow()});return demoOK({saved:true});}
   if(a==='calendar_create'||a==='calendar_revoke')return demoFail('Calendar subscriptions need a live club. This demo does not create a subscription.');
   if(a==='plan_save'){if(!demoSelections.selectors.includes(uid))return demoFail('Selector access required');const plan={...d,id:demoId('withdrawal'),created_by:uid,can_publish:d.fixtures.every(f=>demoGroupHead(demoGroupFor(f))===uid)};demoWeek.plans.push(plan);return demoOK(plan);}
   if(a==='plan_dismiss'){const p=demoWeek.plans.find(p=>p.id===d.id);if(!p||p.created_by!==uid&&!p.can_publish)return demoFail('Publishing authority required');demoWeek.plans=demoWeek.plans.filter(p=>p.id!==d.id);return demoOK({saved:true});}
   return demoFail('Try availability, acknowledgements or a replacement proposal in this demo.');
  }
  if(name==='playhq_onboarding'){
   if(!isAdmin())return demoFail('Club Admin access required');
   if(a==='context')return demoOK(demoConnection);
   if(a==='save_request'){if(d.revision!==demoConnection.revision)return demoFail('Reload the request before saving');demoConnection.request=fixtureClone(d.request);demoConnection.revision++;}
   else if(a==='mark_requested'){if(!d.authorised||d.revision!==demoConnection.revision)return demoFail('Confirm the request was sent');demoConnection.requested_at=fixtureNow();demoConnection.state='awaiting_key';demoConnection.revision++;}
   else if(a==='clear_requested'){delete demoConnection.requested_at;demoConnection.state='not_requested';demoConnection.revision++;}
   else if(a==='configure'){if(d.api_key!=='DEMO-KEY-NOT-REAL')return demoFail('Use the example credentials button. Do not enter a real API key in the demo.');Object.assign(demoConnection,{organisation_id:d.organisation_id,association_id:d.association_id,configured:true,verified:false,state:'needs_check',polling_enabled:false,connection_version:demoConnection.connection_version+1});}
   else return demoFail('Unknown connection action');
   return demoOK(demoConnection);
  }
  if(name==='selection_group_management_context')return demoOK({...demoGroupContext(),teams:demoConnection.verified?demoSourceTeams():[],catalogue:demoConnection.verified?'demo-catalogue':null,season:demoGroups.season});
  if(name==='club_selection_groups'||name==='club_selection_group_manage'){
   if(a==='context')return demoOK(demoGroupContext());if(!isAdmin())return demoFail('Club Admin access required');
   if(a==='save'){
    demoGroups.selection_groups=fixtureClone(d.groups).map(g=>({...g,batting_enabled:false}));demoGroups.grades=fixtureClone(d.grades);fixtureGroups.splice(0,fixtureGroups.length,...d.grades.map((g,i)=>({...g,club_id:club.id,active:true,sort_order:i})));
    demoGroups.mappings=d.grades.filter(g=>g.team_id).map(g=>({grade_id:g.id,team_id:g.team_id,season_id:'demo-season'}));demoGroups.season='demo-season';demoConnection.polling_enabled=demoConnection.verified;demoGroups.teams=demoSourceTeams();
    demoPermissions.groups=demoGroups.selection_groups.map(g=>demoPermissions.groups.find(p=>p.id===g.id)||{id:g.id,name:g.name,head_id:null,members:[]});
   }else if(a==='add_group'){if(!d.name?.trim())return demoFail('Enter a group name');const g={id:demoId('sg'),name:d.name.trim(),batting_enabled:false};demoGroups.selection_groups.push(g);demoPermissions.groups.push({...g,head_id:null,members:[]});}
   else if(a==='rename_group'){const g=demoGroups.selection_groups.find(g=>g.id===d.selection_group_id);if(g)g.name=d.name;}
   else if(a==='set_batting'){const g=demoGroups.selection_groups.find(g=>g.id===d.selection_group_id);if(g)g.batting_enabled=d.batting_enabled;}
   else if(a==='move_team'){const g=demoGroups.grades.find(g=>g.id===d.grade_id);if(g)g.selection_group_id=d.selection_group_id;}
   else if(a==='add_team'){
    const source=demoSourceTeams().find(t=>t.id===d.team_id);if(!source||!demoGroups.selection_groups.some(g=>g.id===d.selection_group_id))return demoFail('Choose a team and Selection Group');
    let grade=fixtureGroups.find(g=>g.id===d.grade_id);if(!grade){grade={id:demoId('grade'),club_id:club.id,name:d.name,active:true,sort_order:fixtureGroups.length};fixtureGroups.push(grade);}else grade.name=d.name;
    demoGroups.grades=demoGroups.grades.filter(g=>g.id!==grade.id);demoGroups.grades.push({...grade,selection_group_id:d.selection_group_id});demoGroups.mappings.push({grade_id:grade.id,team_id:source.id,season_id:d.season_id});demoGroups.season=d.season_id;demoGroups.changed_grade_id=grade.id;demoConnection.polling_enabled=demoConnection.verified;
   }
   else if(a==='disconnect_preview')return demoOK({remove_count:0,keep_count:demoSelections.fixtures.filter(f=>f.details.grade_group_id===d.grade_id).length,token:'demo-disconnect'});
   else if(a==='disconnect'){demoGroups.mappings=demoGroups.mappings.filter(m=>m.grade_id!==d.grade_id);}
   else return demoFail('This setup action is not available in the example yet.');
   demoGroups.revision++;return demoOK(demoGroupContext());
  }
  if(name==='selection_group_permissions'){
   if(!isAdmin())return demoFail('Club Admin access required');
   if(a==='save_group'){if(d.revision!==demoPermissions.revision)return demoFail('Reload permissions before saving');if(!d.head_id)return demoFail('Nominate a replacement Head Selector');const g=demoPermissions.groups.find(g=>g.id===d.group_id);Object.assign(g,{head_id:d.head_id,members:fixtureClone(d.members)});demoPermissions.revision++;demoSelections.selectors=[...new Set(demoPermissions.groups.flatMap(g=>[g.head_id,...g.members.filter(m=>m.access!=='none').map(m=>m.user_id)]).filter(Boolean))];}
   else if(a==='club_head'){demoPermissions.club_head_id=d.user_id;demoSelections.access.head_selector_id=d.user_id;demoPermissions.revision++;}
   else if(a==='invite')return demoFail('Invitations are not sent from the public demo. Use a live club to invite someone.');
   else if(a!=='context')return demoFail('Unknown permissions action');
   return demoOK({...demoPermissions,members:fixtureRows.user_profiles.map(p=>({user_id:p.user_id,name:p.display_name}))});
  }
  if(name==='playhq_fixture_review'&&a==='list')return demoOK({changes:[]});
  if(name==='playhq_sync_api'){
   if(!isAdmin()&&!demoSelections.selectors.includes(uid))return demoFail('Club setup permission required');
   if(a==='status')return demoOK({...demoConnection,admin:isAdmin(),active_season_id:demoGroups.season||null,fixture_count:demoSelections.fixtures.length,fixture_through:demoSelections.fixtures.flatMap(f=>f.details.days.map(d=>d.date)).sort().at(-1),fixture_reports:[],last_checked_at:demoConnection.polling_enabled?fixtureNow():null});
   if(a==='pause'||a==='enable'){demoConnection.polling_enabled=a==='enable'&&demoConnection.verified;return demoOK({saved:true});}
   if(a==='settings'||a==='polling'){demoConnection.polling_enabled=!!d.polling_enabled;return demoOK({saved:true});}
   if(a==='import_all'){
    const m=demoGroups.mappings.find(m=>'preview-'+m.team_id===d.preview_id),g=fixtureGroups.find(g=>g.id===m?.grade_id);if(!g)return demoFail('Save the team mapping first');
    if(demoSelections.fixtures.some(f=>f.details.grade_group_id===g.id))return demoOK({created:0,linked:1});
    const day=demoUpcomingSaturday();demoSelections.fixtures.push({id:demoId('fixture'),club_id:club.id,revision:1,publication:0,published:null,details:{grade:g.name,grade_group_id:g.id,format:'limited_overs',round:'1',overs:50,competition:'Example District',season:String(new Date().getFullYear()),opposition:'Bay Example CC',ground:'Harbour Oval',meeting:'',days:[{date:day,start:'12:00'}],brackets:false,min_quicks:3,min_batters:5,staff:[],match_roles:{d1:{captain_id:null,keeper_id:null}}},slots:Array.from({length:11},()=>({d1:null,d2:null}))});return demoOK({created:1,linked:0});
   }
   return demoFail('Unknown fixture action');
  }
  if(name==='club_social_award_label_api'){
   if(!demoIsSocial())return demoFail('Socials Manager access required');
   const weeks=Math.round((Date.parse(d.week_end)-Date.parse(demoAddDay(demoUpcomingSaturday(),-6)))/(7*86400000)),suggested='Week '+(2+weeks);
   const label=demoAwardLabels[d.week_end]||={week_end:d.week_end,mode:'week_number',label:suggested,suggested_week:suggested,suggested_round:null,revision:0,needs_label:false};
   if(a==='save'){if(d.revision!==label.revision)return demoFail('Reload the shared label');Object.assign(label,{label:d.label,mode:d.mode,revision:label.revision+1});}return demoOK(label);
  }
  if(name==='club_social_awards_api'&&['scope_context','save_scope'].includes(a)){
   if(!demoIsSocial())return demoFail('Socials Manager access required');
   if(a==='save_scope'){const s=demoScope(d.kind);if(s.revision!==d.revision)return demoFail('Reload the selection group choice');const groups=demoGroupContext(),scope=d.award_scope,list=scope.mode==='groups'?groups.selection_groups:groups.grades;const ids=scope.mode==='all'?[]:scope.ids.filter(id=>list.some(g=>g.id===id));if(scope.mode!=='all'&&!ids.length)return demoFail('Choose at least one group or grade');s.award_scope={mode:scope.mode,ids,grade_ids:groups.grades.filter(g=>scope.mode==='all'||scope.mode==='groups'&&ids.includes(g.selection_group_id)||scope.mode==='grades'&&ids.includes(g.id)).map(g=>g.id),key:scope.mode==='all'?'all':scope.mode+':'+ids.slice().sort().join(','),label:scope.mode==='all'?'All':list.filter(g=>ids.includes(g.id)).map(g=>g.name).join(', ')};s.revision++;}
   return demoOK(demoScopeContext(d.kind));
  }
  if(name==='team_of_week_api'||name==='player_of_week_api'){
   if(!demoIsSocial())return demoFail('Socials Manager access required');const result=await (name==='team_of_week_api'?demoTeamWeek:demoPlayerWeek).rpc(name,args);if(a==='context'&&result.data)demoFilterAwardContext(result.data,d.award_scope||demoScope(name==='team_of_week_api'?'team_week':'player_week').award_scope);return result;
  }
  if(name==='club_selections_api'){
   if(a==='access'){const result=await demoPreviousCurrentRpc(name,args);if(result.data)Object.assign(result.data,{mode:demoProduct==='select'?'standalone':'bundle',enabled:demoProduct!=='batting',batting_participant:demoProduct!=='select'});return result;}
   if(['save_board','publish','send_review','fixture_lock'].includes(a)){
    const ids=a==='save_board'?(d.fixtures||[]).map(f=>f.id):d.ids||[d.id],fixtures=demoSelections.fixtures.filter(f=>ids.includes(f.id));
    if(fixtures.some(f=>a==='publish'||a==='fixture_lock'?demoGroupHead(demoGroupFor(f))!==uid:demoGrant(demoGroupFor(f))<2))return demoFail('Your permissions do not allow this change in that Selection Group.');
   }
   if(a==='context'){
    const result=await demoPreviousCurrentRpc(name,args);if(result.error)return result;const c=result.data;
    const editor=demoPermissions.groups.some(g=>demoGrant(g.id)>=2),selector=demoPermissions.groups.some(g=>demoGrant(g.id)>0);
    Object.assign(c,{group_permissions_enabled:true,selection_editor:editor,selector,selection_setup:demoGroupContext(),selection_group_access:demoPermissions.groups.map(g=>({id:g.id,level:demoGrant(g.id),head_id:g.head_id,can_view:demoGrant(g.id)>0||demoSelections.fixtures.some(f=>demoGroupFor(f)===g.id&&demoCaptainUsers(f.details).includes(uid))})),access:{...c.access,mode:demoProduct==='select'?'standalone':'bundle'}});
    c.fixtures=demoSelections.fixtures.filter(f=>isAdmin()||demoGrant(demoGroupFor(f))>0||demoCaptainUsers(f.details).includes(uid)||f.published).map(f=>{
     const group=demoGroupFor(f),view=demoGrant(group)>0||demoCaptainUsers(f.details).includes(uid),head=demoGroupHead(group),base=view?fixtureClone(f):{id:f.id,publication:f.publication,published:fixtureClone(f.published),...(f.published?{details:fixtureClone(f.published.details),slots:fixtureClone(f.published.slots)}:isAdmin()?{details:fixtureClone(f.details),revision:f.revision}:{})};
     return {...base,selection_group_id:group,draft_visible:view,can_edit:demoGrant(group)>=2,can_publish:head===uid,can_unlock:head===uid,group_head_id:head,can_comment:view,can_post_comment:demoGrant(group)>=2||demoCaptainUsers(f.details).includes(uid),issues:view?demoSelectionIssues(f):[]};
    });c.can_view_board=selector||c.captain;return demoOK(c);
   }
  }
  const result=await demoPreviousCurrentRpc(name,args);
  if(name==='club_social_awards_api'&&a==='context'&&result.data)demoFilterAwardContext(result.data,d.award_scope||demoScope(d.kind).award_scope);
  if(name==='club_match_results_api'&&a==='context'&&result.data&&d.award_scope)demoFilterAwardContext(result.data,d.award_scope);
  return result;
 }catch(error){return demoFail(error.message);}
};
const demoPreviousCurrentInvoke=supabase.functions.invoke;
supabase.functions.invoke=async function(name,args={}){
 const body=args.body||{};
 if(name==='club-social-style'&&['graphic_refine','award_refine'].includes(body.purpose)){
  if(!demoIsSocial())return demoFail('Socials Manager access required');
  const brief=(body.brief||'').toLowerCase(),changes={};let explanation='Demo preview: try “use gold text”, “make the names larger” or “shorten Fifth Grade to Fifth”.',label=null;
  if(/gold|yellow/.test(brief)){changes.text_colour='#f6ca62';explanation='Demo preview: changed the text to gold.';}
  if(/larger|bigger/.test(brief)){if(body.kind==='team_week')changes.font_scale=115;else if(body.kind==='team_selections')changes.font='bold';else changes.name_size=Math.min(120,(body.current?.name_size||76)+12);explanation='Demo preview: increased the name emphasis.';}
  const short=/shorten (.+?) to (.+?)[.!]?$/.exec(body.brief||''),grades=body.preview_grades||[],grade=short&&grades.find(g=>g.toLowerCase()===short[1].toLowerCase());
  const grade_labels=grade?[{grade,label:short[2]}]:[];if(grade)explanation='Demo preview: changed the display label to '+short[2]+'.';
  const week=/\bweek\s+(\d+)\b/i.exec(body.brief||'');if(week&&body.kind!=='team_selections'){label='Week '+week[1];explanation='Demo preview: proposed '+label+' for all awards this week.';}
  if(body.kind==='team_selections'&&changes.text_colour){delete changes.text_colour;changes.accent='#f6ca62';}
  return demoOK({changes,grade_labels,explanation,artwork_brief:null,graphic_label:label});
 }
 if(name==='playhq-sync'){
  if(!isAdmin())return demoFail('Club Admin access required');if(!demoConnection.configured)return demoFail('Connect the example credentials first');
  if(body.action==='seasons'){Object.assign(demoConnection,{verified:true,state:'connected'});return demoOK({seasons:[{id:'demo-season',name:new Date().getFullYear()+'/'+String(new Date().getFullYear()+1).slice(-2)+' · Example cricket season'}]});}
  if(body.action==='teams')return demoOK({teams:demoSourceTeams(),catalogue_id:'demo-catalogue'});
  if(body.action==='preview')return demoOK({preview_id:'preview-'+body.team_id,fixtures:[{grade:demoSourceTeams().find(t=>t.id===body.team_id)?.grade.name,days:[{date:demoUpcomingSaturday(),start:'12:00'}],opposition:'Bay Example CC',ground:'Harbour Oval',format:'limited_overs'}]});
 }
 return demoPreviousCurrentInvoke(name,args);
};
const demoPreviousCurrentStorage=supabase.storage.from;
supabase.storage.from=function(bucket){if(bucket==='club-team-week')return demoTeamWeek.storage.from(bucket);if(bucket==='club-player-week')return demoPlayerWeek.storage.from(bucket);return demoPreviousCurrentStorage(bucket);};
function demoFilterAwardContext(context,scope){
 context.award_scope=fixtureClone(scope);if(!scope||scope.mode==='all')return;
 const names=new Set(demoGroupContext().grades.filter(g=>(scope.grade_ids||[]).includes(g.id)).map(g=>g.name));
 if(context.candidates)context.candidates=context.candidates.filter(c=>names.has(c.grade));
 if(context.fixtures)context.fixtures=context.fixtures.filter(f=>names.has(f.grade));
 if(context.cards)context.cards=context.cards.filter(c=>names.has(c.scorecard.grade));
}
