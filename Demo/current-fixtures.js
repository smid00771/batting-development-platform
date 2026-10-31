// In-memory equivalents of current service contracts. Never use customer data here.
let demoProduct='select',demoPersona='player',demoScenario='ready';
let demoGroups,demoPermissions,demoConnection,demoWeek,demoAwardScopes,demoAwardLabels,demoTeamWeek,demoPlayerWeek;
let demoFixtureCalendarLinks=[],demoCalendarTrials=[],demoCalendarTrialReceipts={},demoPlanReminderSettings=null;
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
 demoArrivalRows={};demoArrivalReceipts={};
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
 fixtureGroups[0].name='1st Grade';fixtureGroups[1].name='2nd Grade';
 const extraGrades=[['third','3rd Grade'],['fourth','4th Grade'],['dev-navy','Dev Navy'],['dev-sky','Dev Sky']];
 for(const [key,name] of [...extraGrades,['masters','Masters']])fixtureGroups.push({id:'group-'+key,club_id:club.id,name,active:true,sort_order:fixtureGroups.length});
 const first=demoUpcomingSaturday(),second=demoAddDay(first,7);
 for(const [i,p] of demoSelections.roster.entries()){p.grade=i<13?'1st Grade':'2nd Grade';p.availability.available_dates=p.availability.available_dates.map(d=>d==='2026-10-10'?first:second);p.availability.checked_at=fixtureNow();}
 Object.assign(demoSelections.roster[1],{name:'Jordan Ellis'});Object.assign(demoSelections.roster[2],{name:'Taylor Brooks'});Object.assign(demoSelections.roster[14],{name:'Robin Hart',user_id:'user-combined'});
 for(const [i,f] of demoSelections.fixtures.entries()){
  f.details.days=[{date:first,start:'12:00'},{date:second,start:'12:00'}];Object.assign(f.details,{grade:i?'2nd Grade':'1st Grade',grade_group_id:i?'group-second':'group-first',round:'3',season:String(new Date().getFullYear()),staff:[]});
  if(i)for(const key of ['d1','d2'])f.details.match_roles[key].captain_id=demoSelections.roster[14].id;
  // A published XI is available to players; staff can compare the next draft.
  f.publication=1;f.published={details:fixtureClone(f.details),slots:fixtureClone(f.slots),players:demoSelections.roster.filter(p=>f.slots.some(s=>s.d1===p.id||s.d2===p.id)).map(p=>({id:p.id,name:p.name,batting:p.batting,bowling:p.bowling,bowling_load:p.bowling_load,keeper:p.keeper}))};
  f.published_at=fixtureNow();f.selection_unlocked_until=new Date(Date.now()+86400000*30).toISOString();
 }
 // Four more fictional sides keep the Dev teams in the same Selection Group as the senior grades.
 const given=['Aiden','Blake','Charlie','Darcy','Evan','Finley','Harper','Jesse','Kai','Logan','Noah'],family=['Archer','Bates','Cowan','Dawson','Evans','Field','Grant','Hughes','Irwin','Jones','Kent'];
 for(const [index,[key,grade]] of extraGrades.entries()){
  const players=given.map((name,i)=>({id:key+'-player-'+i,name:name+' '+family[(i+index*2)%family.length],grade,external_id:'EXAMPLE-'+key+'-'+i,active:true,user_id:null,batting:i<6?'top':'lower',bowling:i>=6?'pace':'none',bowling_load:'frontline',keeper:i===5,availability:{revision:1,usual_available:true,blocks:[],available_dates:[first,second],unavailable_dates:[]}}));
  demoSelections.roster.push(...players);
  const f=fixtureClone(demoSelections.fixtures[0]),days=index<2?[{date:first,start:'12:00'},{date:second,start:'12:00'}]:[{date:first,start:'10:00'}];
  Object.assign(f,{id:key+'-upcoming',revision:1,publication:1});
  Object.assign(f.details,{grade,grade_group_id:'group-'+key,round:'4',format:index<2?'two_day':'limited_overs',overs:index<2?null:40,days,brackets:false,opposition:'River Example CC',match_roles:{d1:{captain_id:players[0].id,captain_manual:true,keeper_id:players[5].id,keeper_manual:true},...(index<2?{d2:{captain_id:players[0].id,captain_manual:true,keeper_id:players[5].id,keeper_manual:true}}:{})}});
  f.slots=players.map(p=>({d1:p.id,d2:index<2?p.id:null}));f.published={details:fixtureClone(f.details),slots:fixtureClone(f.slots),players:fixtureClone(players)};demoSelections.fixtures.push(f);
 }
 demoSelections.selectors=['user-selector','user-head','user-masters-head'];demoSelections.access.head_selector_id='user-head';
 const mastersNames=['Drew Kelly','Lee Adams','Pat Foster','Cameron Ward','Les Turner','Andy Cross','Chris Cole','Ben Dunn','Glen Hill','Mark Ross','Paul Woods'];
 const mastersPlayers=mastersNames.map((name,i)=>({id:'masters-player-'+i,name,grade:'Masters',external_id:'EXAMPLE-M-'+i,active:true,user_id:null,batting:i<6?'top':'lower',bowling:i>6?'pace':'none',bowling_load:'frontline',keeper:i===5,availability:{revision:1,usual_available:false,blocks:[],available_dates:[demoAddDay(first,1)],unavailable_dates:[]}}));demoSelections.roster.push(...mastersPlayers);
 demoSelections.fixtures.push({id:'masters-upcoming',club_id:club.id,revision:1,publication:0,published:null,details:{grade:'Masters',grade_group_id:'group-masters',round:'2',format:'limited_overs',overs:40,competition:'Example Masters',opposition:'Valley Masters',ground:'Masters Oval',days:[{date:demoAddDay(first,1),start:'10:00'}],meeting:'Meet at 9:15 am.',min_quicks:3,min_batters:5,staff:[],match_roles:{d1:{captain_id:mastersPlayers[0].id,captain_manual:true,keeper_id:mastersPlayers[5].id,keeper_manual:true}}},slots:mastersPlayers.map(p=>({d1:p.id,d2:null}))});
 // Fictional Sunday age-group and cup teams demonstrate posts across selection groups and dates.
 for(const [key,grade,start] of [['u21','Under 21s','09:00'],['cup','Harbour Cup','12:00']]){
  fixtureGroups.push({id:'group-'+key,club_id:club.id,name:grade,active:true,sort_order:fixtureGroups.length});
  const players=given.map((name,i)=>({...fixtureClone(mastersPlayers[i]),id:key+'-player-'+i,name:name+' '+family[(i+3)%family.length],grade,external_id:'EXAMPLE-'+key+'-'+i,availability:{revision:1,usual_available:true,blocks:[],available_dates:[demoAddDay(first,1)],unavailable_dates:[]}}));
  demoSelections.roster.push(...players);
  const f=fixtureClone(demoSelections.fixtures.find(f=>f.id==='masters-upcoming'));
  Object.assign(f,{id:key+'-upcoming',publication:1,published_at:fixtureNow()});Object.assign(f.details,{grade,grade_group_id:'group-'+key,competition:'Example Sunday Cup',opposition:'Valley Example CC',days:[{date:demoAddDay(first,1),start}],match_roles:{d1:{captain_id:players[0].id,captain_manual:true,keeper_id:players[5].id,keeper_manual:true}}});
  f.slots=players.map(p=>({d1:p.id,d2:null}));f.published={details:fixtureClone(f.details),slots:fixtureClone(f.slots),players:fixtureClone(players)};demoSelections.fixtures.push(f);
 }
 demoSeasonSetup().appointments={'group-first':'user-jordan','group-second':'user-combined'};
 demoGroups={revision:1,selection_groups:[{id:'sg-senior',name:'Senior Grade Teams',batting_enabled:true},{id:'sg-masters',name:'Masters',batting_enabled:false},{id:'sg-cups',name:'Sunday teams',batting_enabled:false}],grades:fixtureGroups.map(g=>({...g,selection_group_id:g.id==='group-masters'?'sg-masters':['group-u21','group-cup'].includes(g.id)?'sg-cups':'sg-senior'})),mappings:[],season:'demo-season',catalogue:'demo-catalogue',teams:demoSourceTeams()};
 demoPermissions={revision:1,club_head_id:'user-head',groups:[{id:'sg-senior',name:'Senior Grade Teams',head_id:'user-head',members:[{user_id:'user-head',access:'edit'},{user_id:'user-selector',access:'edit'}]},{id:'sg-masters',name:'Masters',head_id:'user-masters-head',members:[{user_id:'user-masters-head',access:'edit'},{user_id:'user-selector',access:'view'}]},{id:'sg-cups',name:'Sunday teams',head_id:'user-head',members:[{user_id:'user-head',access:'edit'}]}],invites:[]};
 demoSocial.managers=['user-social','user-combined'];demoSocial.settings={...demoSocial.settings,grade_labels:[],title:'TEAM SELECTIONS'};
 demoConnection={club_name:club.name,revision:0,request:{association:'Example District Cricket Association',club_url:'',contact_name:'Sam Taylor',contact_role:'Club Admin',contact_email:'sam@example.test'},state:empty?'not_requested':'connected',configured:!empty,verified:!empty,connection_version:empty?0:1,polling_enabled:!empty,organisation_id:empty?'':'11111111-1111-4111-8111-111111111111',association_id:empty?'':'22222222-2222-4222-8222-222222222222'};
 demoWeek={settings:{revision:1,reminders_enabled:false,acknowledgement_enabled:true,deadline_weekday:4,deadline_time:'18:00:00'},plans:[],calendar_active:false,acknowledgements:[]};
 demoAwardScopes={};demoAwardLabels={};demoTeamWeek=createTeamWeekDemo(()=>club.name,end=>demoSharedResults.awards(end));demoPlayerWeek=createPlayerWeekDemo(()=>club.name,end=>demoSharedResults.awards(end));
 if(empty){fixtureGroups.splice(0);demoSelections.fixtures=[];demoSelections.roster=[];demoSelections.group_links=[];demoSelections.selectors=[];demoSelections.access.head_selector_id=null;demoGroups.selection_groups=[];demoGroups.grades=[];demoGroups.season='';demoGroups.teams=[];demoPermissions.groups=[];demoPermissions.club_head_id=null;demoSeasonSetup().appointments={};fixtureRows.club_memberships=fixtureRows.club_memberships.filter(m=>m.user_id==='user-admin');fixtureRows.user_profiles=fixtureRows.user_profiles.filter(m=>m.user_id==='user-admin');fixtureRows.players=[];fixtureRows.club_access_grants=[];}
 demoSelections.access.mode=demoProduct==='select'?'standalone':'bundle';
 if(!empty){
  // Seed a useful previous week before a Socials Manager opens awards or stats.
  const upcoming=[...demoSelections.fixtures];
  demoSeasonStats({p_club_id:club.id,p_action:'context',p_data:{on_demand:true}});demoSelections.fixtures=upcoming;
  demoSelections.result_sources||={};
  for(const card of Object.values(demoScorecards)){
   const original=upcoming.find(f=>f.details.grade===card.grade);if(!original)continue;
   const days=[{date:card.dates[0],start:'12:00'}],round=1+Math.round((Date.parse(card.dates[0])-Date.parse(demoAddDay(first,-21)))/(7*86400000));
   const f={...fixtureClone(original),id:'history-'+card.match_id,details:{...fixtureClone(original.details),round:String(round),days,brackets:false},slots:original.slots.map(s=>({d1:s.d1,d2:null}))};
   f.published={details:fixtureClone(f.details),slots:fixtureClone(f.slots),players:fixtureClone(original.published?.players||demoSelections.roster.filter(p=>f.slots.some(slot=>slot.d1===p.id)))};f.selection_unlocked_until=null;demoSelections.fixtures.push(f);demoSelections.result_sources[f.id]={match_id:card.match_id,team_id:card.teams[0].id};card.teams[0].name=club.name;
   const batting=card.innings[0],bowling=card.innings[1];
   if(round===3){batting.batters[0].runs=112;batting.batters[0].balls=124;}
   bowling.bowlers.forEach((p,i)=>{p.wickets=(round===3?[5,2,1,1,1]:[3,2,2,2,1])[i]||0;});
   batting.runs=batting.batters.reduce((total,p)=>total+(p.runs||0),12);batting.wickets=8;batting.overs=original.details.format==='limited_overs'?'40.0':'48.0';batting.bowling_available=true;
   bowling.wickets=10;bowling.overs=original.details.format==='limited_overs'?'38.2':'46.2';bowling.runs=Math.max(100,batting.runs-28-round);
   const totalConceded=bowling.runs-8;let remaining=totalConceded;
   bowling.bowlers.forEach((p,i)=>{p.runs=i===bowling.bowlers.length-1?remaining:Math.floor(totalConceded/bowling.bowlers.length);remaining-=p.runs;});
   card.result=club.name+' won by '+(batting.runs-bowling.runs)+' runs';
  }
  for(const f of upcoming.filter(f=>f.id==='selection-first'||f.id==='selection-second')){f.details.round='4';f.published.details.round='4';}
  // Fictional return from two missed games, visible without opening stats.
  const prior=demoSelections.fixtures.filter(f=>f.id.startsWith('history-')&&f.details.grade==='1st Grade').sort((a,b)=>a.details.days[0].date.localeCompare(b.details.days[0].date));
  if(prior.length>=3){
   const player={...fixtureClone(demoSelections.roster[0]),id:'demo-returner',name:'Sam Ellison',user_id:null,external_id:'EXAMPLE-RETURNER',availability:{revision:1,available_dates:[first,second],unavailable_dates:prior.slice(1).map(f=>f.details.days[0].date)}};
   demoSelections.roster.push(player);const previous=prior[0],old=previous.slots[0].d1;
   previous.slots[0]={d1:player.id,d2:null};previous.published.slots=fixtureClone(previous.slots);previous.published.players=previous.published.players.filter(p=>p.id!==old).concat(fixtureClone(player));
   const card=Object.values(demoScorecards).find(card=>card.match_id===demoSelections.result_sources[previous.id]?.match_id);
   if(card)for(const row of [card.teams[0].players[0],card.innings[0].batters[0]])Object.assign(row,{player_id:'demo-'+player.id,name:player.name});
  }
  // These fictional cards are generated from these exact roster IDs.
  demoSelections.scorecard_links=demoSelections.roster.map(p=>({source_id:'demo-'+p.id,roster_id:p.id}));
  const abandoned={id:'masters-abandoned',club_id:club.id,revision:1,publication:0,published:null,details:{grade:'Masters',grade_group_id:'group-masters',format:'limited_overs',round:'1',competition:'Example District',opposition:'Hill Example CC',ground:'Masters Oval',days:[{date:demoAddDay(first,-7),start:'12:00'}],cancelled:true,staff:[],match_roles:{d1:{captain_id:null,keeper_id:null}}},slots:Array.from({length:11},()=>({d1:null,d2:null}))};
  demoSelections.fixtures.push(abandoned);demoSelections.result_sources||={};demoSelections.result_sources[abandoned.id]={no_play:'abandoned'};
 }
}
const demoSeedBeforeFixtureCalendar=demoSeedCurrent;
demoSeedCurrent=function(options){demoSeedBeforeFixtureCalendar(options);demoCalendarTrials=[];demoCalendarTrialReceipts={};for(const g of fixtureGroups)g.batting_enabled=demoProduct==='batting'||!['group-masters','group-u21','group-cup'].includes(g.id);demoPlanReminderSettings={revision:1,team_ids:fixtureGroups.filter(g=>!['group-masters','group-u21','group-cup'].includes(g.id)).map(g=>g.id),receipts:{}};demoFixtureCalendarLinks=demoSelections.fixtures.map(f=>({fixture_id:f.id,season_id:demoGroups.season,team_id:f.details.grade_group_id||fixtureGroups.find(g=>g.name===f.details.grade)?.id||f.details.grade,details:fixtureClone(f.details)}));demoSyncDownloadedBattingScores();};

// Simulate the server's completed-result delivery using the demo's explicit IDs.
// It never creates a coaching judgement, reflection, review or external request.
function demoSyncDownloadedBattingScores(){
 if(demoProduct==='select')return;
 for(const f of demoSelections.fixtures){
  const source=demoSelections.result_sources?.[f.id],group=fixtureGroups.find(g=>g.id===f.details.grade_group_id);
  if(!source?.match_id||source.no_play||f.details.cancelled||group?.batting_enabled===false)continue;
  const card=Object.values(demoScorecards).filter(c=>c.match_id===source.match_id).at(-1);
  if(card?.status!=='completed'||card.format_key!==f.details.format||JSON.stringify(card.dates)!==JSON.stringify(f.details.days.map(d=>d.date)))continue;
  for(const inn of card.innings.filter(i=>i.team_id===source.team_id&&i.complete))for(const b of inn.batters||[]){
   const link=demoSelections.scorecard_links?.find(l=>l.source_id===b.player_id),roster=demoSelections.roster.find(r=>r.id===link?.roster_id&&r.active);
   const player=roster&&fixtureRows.players.find(p=>p.active!==false&&(p.id===roster.review_player_id||p.user_id&&p.user_id===roster.user_id));
   if(!player||!b.importable||!['played','did_not_bat'].includes(b.status))continue;
   const feedback=fixtureRows.feedback[player.id]??=demoEmptyFeedback(),score=b.status==='did_not_bat'?'':String(b.runs)+(b.not_out?'*':'');
   let m=feedback.matches.find(m=>m.fixture_id===f.id&&(m.innings_number||1)===inn.number);
   if(!m){const matches=feedback.matches.filter(m=>m.match_date===card.dates[0]&&m.format_key===card.format_key&&(m.innings_number||1)===inn.number&&demoInningsOpponent(m.opposition)===demoInningsOpponent(f.details.opposition));if(matches.length>1||matches.some(m=>m.fixture_id&&m.fixture_id!==f.id))continue;m=matches[0];}
   if(m&&((m.automatic_score!==undefined&&m.score_text!==m.automatic_score)||m.automatic_score===undefined&&m.score_text&&m.score_text!==score))continue;
   if(b.status==='did_not_bat'&&(m?.player_reflection||m?.coach_feedback.some(n=>n.plan_related)))continue;
   if(!m){m={id:crypto.randomUUID(),match_date:card.dates[0],format_key:card.format_key,opposition:f.details.opposition,innings_number:inn.number,created_by:null,created_at:fixtureNow(),coach_feedback:[],player_reflection:null,player_note:'',player_video:null};feedback.matches.unshift(m);}
   const changed=m.score_text!==score||m.participation_status!==b.status;
   Object.assign(m,{fixture_id:f.id,score_text:score,automatic_score:score,participation_status:b.status,score_recorded_by:null,scorecard:{...b,automatic_sync:true,provider:card.provider,score_date:card.dates[0],url:card.url},edit_context:{can_edit_details:false,can_edit_score:false}});
   if(changed)m.updated_at=fixtureNow();
  }
 }
}
function demoAvailabilityFixtures(){
 const player=demoSelections.roster.find(p=>p.user_id===session.user.id&&p.active);
 if(!player||demoProduct==='batting')throw Error('A linked player with Selections access is required');
 const usualTeams=fixtureGroups.filter(g=>g.active!==false&&g.name.toLowerCase()===String(player.grade||'').toLowerCase()),usualTeam=usualTeams.length===1?usualTeams[0].id:null;
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'}),season=demoGroups.season,candidates=[];
 for(const f of demoSelections.fixtures){
  const link=demoFixtureCalendarLinks.find(l=>l.fixture_id===f.id);
  if(link&&link.season_id!==season||!link&&f.details.include_in_fixture_calendar!==true)continue;
  const d=link?.details||f.details,team=link?.team_id||d.grade_group_id||'manual:'+d.grade;
  candidates.push({f,d,team,source:link?'playhq':'manual'});
 }
 const fixtures=candidates.filter(({d})=>!d.cancelled).map(({f,d,team,source})=>({id:f.id,team_id:team,source,opposition:d.opposition,days:d.days.map((day,i)=>({date:day.date,start:day.start||'',ground:day.ground||d.ground||'',day:i+1})).filter(day=>day.date>=today)})).filter(f=>f.days.length);
 const trials=demoCalendarTrials.filter(t=>t.included&&(t.audience==='club'||t.team_ids.includes(usualTeam))).map(t=>({id:t.id,source:'trial',title:t.title,audience:t.audience,team_ids:t.team_ids,days:t.days.map((d,i)=>({...d,day:i+1})).filter(d=>d.date>=today)})).filter(t=>t.days.length);
 const teams=[...new Set([...fixtures.map(f=>f.team_id),...trials.flatMap(t=>t.team_ids)])].map(id=>({id,name:fixtureGroups.find(g=>g.id===id)?.name||candidates.find(c=>c.team===id)?.d.grade||'Team',usual:id===usualTeam,suggested:id===usualTeam||candidates.some(c=>c.team===id&&c.f.published?.slots.some(slot=>slot.d1===player.id||slot.d2===player.id))})).sort((a,b)=>a.name.localeCompare(b.name));
 fixtures.push(...trials);
 return {club_id:club.id,player_id:player.id,season_id:season,usual_team_id:usualTeam,timezone:'Australia/Sydney',from_date:today,teams,fixtures};
}
const demoManualPlayerRequirements=demoPlayerRequirements;
demoPlayerRequirements=function(playerId){
 if(demoProduct!=='both')return demoManualPlayerRequirements(playerId);
 const p=fixtureRows.players.find(p=>p.id===playerId),r=p&&demoSelections.roster.find(r=>r.user_id===p.user_id&&r.active);if(!r)return [];
 const formats=new Map();
 for(const f of demoSelections.fixtures){const d=f.published?.details,link=demoFixtureCalendarLinks.find(l=>l.fixture_id===f.id);
  if(!d||d.cancelled||f.details.cancelled||!demoPlanReminderSettings.team_ids.includes(d.grade_group_id)||link&&link.season_id!==demoGroups.season)continue;
  const format=['two_day','long_form'].includes(d.format)?'long_form':d.format;if(!['t20','limited_overs','long_form'].includes(format))continue;
  for(const [i,day] of d.days.entries())if(f.published.slots.some(slot=>slot['d'+(i+1)]===r.id)){
   const due=demoAddDay(day.date,-7),prior=formats.get(format);if(!prior||due<prior.due_date)formats.set(format,{format_key:format,required:true,due_date:due,sources:['First selected fixture · one week before']});
  }
 }return [...formats.values()];
};
function demoSourceTeams(){return [{id:'source-first',name:'Harbour 1st Grade',grade:{id:'source-grade-first',name:'1st Grade'},competition:{name:'Example District'}},{id:'source-fifth',name:'Harbour 2nd Grade',grade:{id:'source-grade-fifth',name:'2nd Grade'},competition:{name:'Example District'}}];}
function demoWeekContext(){return {...fixtureClone(demoWeek),can_manage:isAdmin(),acknowledgements:demoSelections.fixtures.flatMap(f=>!f.published?[]:[...new Set(f.published.slots.flatMap(s=>[s.d1,s.d2]).filter(Boolean))].map(id=>({fixture_id:f.id,roster_id:id,publication:f.publication,linked:!!demoSelections.roster.find(p=>p.id===id)?.user_id,seen_at:demoWeek.acknowledgements.find(a=>a.fixture_id===f.id&&a.roster_id===id)?.seen_at||null})))};}
function demoScope(kind){return demoAwardScopes[kind]||={revision:0,award_scope:{mode:'all',ids:[],grade_ids:demoGroups.grades.map(g=>g.id),key:'all',label:'All'}};}
function demoScopeContext(kind){return {...fixtureClone(demoScope(kind)),groups:demoGroups.selection_groups.map(g=>({id:g.id,name:g.name})),grades:demoGroupContext().grades.map(g=>({id:g.id,name:g.name,group_id:g.selection_group_id}))};}
const demoPreviousCurrentRpc=supabase.rpc;
supabase.rpc=async function(name,args={}){
 const a=args.p_action,d=args.p_data||{},uid=session?.user.id;
 try{
  if(name==='club_batting_fixtures'){
   if(args.p_club_id!==club.id||demoProduct!=='batting'||!canUseTeamReview())return demoFail('Current Club Batting fixture access required');
   if(a==='context')return demoOK({admin:isAdmin(),groups:fixtureGroups.filter(g=>g.active!==false),fixtures:demoSelections.fixtures.map(f=>({id:f.id,revision:f.revision,details:{...f.details,format:f.details.format==='two_day'?'long_form':f.details.format},imported:!!demoGroups.mappings.find(m=>m.grade_id===f.details.grade_group_id)}))});
   if(a!=='save'||!isAdmin())return demoFail('Club Admin manages fixtures');
   const key=uid+':fixture:'+d.request_id,receipt=demoCalendarTrialReceipts[key];if(receipt){if(receipt.payload!==JSON.stringify(d))return demoFail('Request ID already used');return demoOK(receipt.result);}
   const f=demoSelections.fixtures.find(f=>f.id===d.id),g=fixtureGroups.find(g=>g.id===d.details.grade_group_id);if(!g||!d.details.opposition?.trim()||!d.details.days?.[0]?.date)return demoFail('Choose a team, date and opposition');
   if((f?.revision||0)!==d.revision)return demoFail('Fixture changed. Reopen it before saving');
   if(f?.published)return demoFail('This fixture has a published team. Use Correct match details in Match Review');
   if(f){f.details={...f.details,...fixtureClone(d.details),grade:g.name};f.revision++;}else demoSelections.fixtures.push({id:d.id,club_id:club.id,revision:1,publication:0,published:null,details:{...fixtureClone(d.details),grade:g.name},slots:Array.from({length:11},()=>({d1:null,d2:null}))});
   const result={saved:true,id:d.id,revision:d.revision+1};demoCalendarTrialReceipts[key]={payload:JSON.stringify(d),result};return demoOK(result);
  }
  if(name==='club_fixture_calendar_trials'){
   if(args.p_club_id!==club.id||demoProduct==='batting'&&!isAdmin())return demoFail('Fixture editing access required');
   const teams=demoGroups.grades.filter(g=>isAdmin()||demoGrant(g.selection_group_id,uid)===2).map(g=>({id:g.id,name:g.name})),allowed=t=>isAdmin()||t.audience==='teams'&&t.team_ids.length>0&&t.team_ids.every(id=>teams.some(g=>g.id===id));
   if(!isAdmin()&&!teams.length)return demoFail('Fixture editing access required');
   if(a==='context')return demoOK({can_whole_club:isAdmin(),teams,trials:demoCalendarTrials.filter(t=>allowed(t)&&t.days.some(day=>day.date>=demoCallDay()))});
   if(a!=='save'||!d.id||!d.request_id||typeof d.included!=='boolean'||!['club','teams'].includes(d.audience)||!Array.isArray(d.team_ids)||!allowed(d))return demoFail('You cannot manage trials for this audience');
   const title=String(d.title||'').trim(),days=d.days;
   if(!title||title.length>120||!Array.isArray(days)||days.length<1||days.length>2||days.some(day=>!/^\d{4}-\d{2}-\d{2}$/.test(day.date))||days.length===2&&days[1].date<=days[0].date||d.audience==='club'&&d.team_ids.length)return demoFail('Check the trial name, dates and audience');
   const key=uid+':'+d.request_id,receipt=demoCalendarTrialReceipts[key];if(receipt){if(receipt.payload!==JSON.stringify(d))return demoFail('This request was used for different changes');return demoOK(receipt.result);}
   const prior=demoCalendarTrials.find(t=>t.id===d.id);if(prior&&!allowed(prior))return demoFail('Trial editing access required');if((prior?.revision||0)!==d.revision)return demoFail('This trial changed. Close and reopen it before saving');
   const next={id:d.id,title,days:fixtureClone(days),audience:d.audience,team_ids:[...new Set(d.team_ids)],included:d.included,revision:d.revision+1};if(prior)Object.assign(prior,next);else demoCalendarTrials.push(next);
   const result={saved:true,id:next.id,revision:next.revision};demoCalendarTrialReceipts[key]={payload:JSON.stringify(d),result};return demoOK(result);
  }
  if(name==='club_plan_reminder_settings'){
   if(args.p_club_id!==club.id||demoProduct!=='both'||!isAdmin())return demoFail('Linked Club Admin access required');
   const a=args.p_action,d=args.p_data||{},cfg=demoPlanReminderSettings;
   if(a==='context')return demoOK({revision:cfg.revision,team_ids:cfg.team_ids,teams:fixtureGroups.filter(g=>g.active).map(g=>({id:g.id,name:g.name}))});
   if(a!=='save'||!Array.isArray(d.team_ids)||d.team_ids.some(id=>!fixtureGroups.some(g=>g.id===id&&g.active)))return demoFail('Choose teams from this club');
   const receipt=cfg.receipts[d.request_id];if(receipt)return receipt.payload===JSON.stringify(d)?demoOK(receipt.result):demoFail('This request was used for different changes');
   if(d.revision!==cfg.revision)return demoFail('Plan reminder teams changed. Close and reopen before saving');
   cfg.team_ids=[...new Set(d.team_ids)];cfg.revision++;const result={saved:true,revision:cfg.revision};cfg.receipts[d.request_id]={payload:JSON.stringify(d),result};return demoOK(result);
  }
  if(name==='club_availability_fixtures'){if(args.p_club_id!==club.id)return demoFail('Club membership required');return demoOK(demoAvailabilityFixtures());}
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
    demoGroups.selection_groups=fixtureClone(d.groups).map(g=>({...g,batting_enabled:demoProduct==='batting'}));demoGroups.grades=fixtureClone(d.grades);fixtureGroups.splice(0,fixtureGroups.length,...d.grades.map((g,i)=>({...g,club_id:club.id,active:true,sort_order:i})));
    demoGroups.mappings=d.grades.filter(g=>g.team_id).map(g=>({grade_id:g.id,team_id:g.team_id,season_id:'demo-season'}));demoGroups.season='demo-season';demoConnection.polling_enabled=demoConnection.verified;demoGroups.teams=demoSourceTeams();
    demoPermissions.groups=demoGroups.selection_groups.map(g=>demoPermissions.groups.find(p=>p.id===g.id)||{id:g.id,name:g.name,head_id:null,members:[]});
   }else if(a==='add_group'){if(!d.name?.trim())return demoFail('Enter a group name');const g={id:demoId('sg'),name:d.name.trim(),batting_enabled:demoProduct==='batting'};demoGroups.selection_groups.push(g);demoPermissions.groups.push({...g,head_id:null,members:[]});}
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
  if(name==='club_social_awards_api'&&a==='delete_image'){
   if(!demoIsSocial())return demoFail('Socials Manager access required');
   const deletions=demoSocial.imageDeletions||={};let item=deletions[d.id];
   if(!item){
    const context=await demoPreviousCurrentRpc(name,{...args,p_action:'context',p_data:{week_end:d.week_end||socialEnsure().awards?.end}});
    const end=d.week_end||socialEnsure().awards?.end;
    const source=[...(context.data?.editions||[]),...demoTeamWeek.collection(end),...demoPlayerWeek.collection(end)].find(e=>e.id===d.id);
    if(!source)return demoFail('Saved image not found in this club');
    item=deletions[d.id]={id:source.id,bucket:source.bucket,path:source.image_path,deleted:false};
   }
   if(d.finish){const download=await supabase.storage.from(item.bucket).download(item.path);if(!download.error)return demoFail('The stored file has not been deleted yet. Retry deleting the image');item.deleted=true;}
   return demoOK(item);
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
   if(['player_link_context','confirm_player_link','decline_player_link'].includes(a)){
    if(!['player','both'].includes(membership?.involvement))return demoFail('A verified player account in this club is required');
    const own=demoSelections.roster.find(r=>r.user_id===uid&&r.active);
    if(own)return demoOK({status:'linked',roster_id:own.id,name:own.name,grade:own.grade});
    const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase(),matches=demoSelections.roster.filter(r=>norm(r.name)===norm(userProfile?.display_name));
    const declined=demoSelections.linkDeclined||={},p=matches.length===1?matches[0]:null;
    const candidate=p&&p.active&&!p.user_id&&!p.account_email&&!p.auto_link_disabled&&!declined[uid+':'+p.id]?p:null;
    if(a==='player_link_context')return demoOK(candidate?{status:'confirm_name',candidate:{id:p.id,name:p.name,grade:p.grade}}:{status:'club_help'});
    if(!candidate||d.roster_id!==p.id)return demoFail('This player entry changed. Return Home to check it again');
    if(a==='decline_player_link'){(demoSelections.linkDeclined||={})[uid+':'+p.id]=true;return demoOK({status:'club_help'});}
    p.user_id=uid;return demoOK({status:'linked',roster_id:p.id,name:p.name,grade:p.grade});
   }
   if(a==='access'){const result=await demoPreviousCurrentRpc(name,args);if(result.data)Object.assign(result.data,{mode:demoProduct==='select'?'standalone':'bundle',enabled:demoProduct!=='batting',batting_participant:demoProduct!=='select',assist_staff:!['player','participant'].includes(demoPersona)});return result;}
   if(['save_board','publish','send_review','fixture_lock'].includes(a)){
    const ids=a==='save_board'?(d.fixtures||[]).map(f=>f.id):d.ids||[d.id],fixtures=demoSelections.fixtures.filter(f=>ids.includes(f.id));
    if(fixtures.some(f=>a==='publish'||a==='fixture_lock'?demoGroupHead(demoGroupFor(f))!==uid:demoGrant(demoGroupFor(f))<2))return demoFail('Your permissions do not allow this change in that Selection Group.');
   }
   if(a==='publication_check'){
    if(!Array.isArray(d.ids)||!d.ids.length||d.ids.length>30||new Set(d.ids).size!==d.ids.length||d.ids.some(id=>{const f=demoSelections.fixtures.find(f=>f.id===id);return !f||demoGrant(demoGroupFor(f))<1;}))return demoFail('View access to each Selection Group is required');
    return demoOK({fixtures:d.ids.map(id=>{const f=demoSelections.fixtures.find(f=>f.id===id);return {id,revision:f.revision,issues:demoSelectionIssues(f)};})});
   }
   if(a==='context'){
    const result=await demoPreviousCurrentRpc(name,args);if(result.error)return result;const c=result.data;
    const editor=demoPermissions.groups.some(g=>demoGrant(g.id)>=2),selector=demoPermissions.groups.some(g=>demoGrant(g.id)>0);
    Object.assign(c,{group_permissions_enabled:true,selection_editor:editor,selector,selection_setup:demoGroupContext(),selection_group_access:demoPermissions.groups.map(g=>({id:g.id,level:demoGrant(g.id),head_id:g.head_id,can_view:demoGrant(g.id)>0||demoSelections.fixtures.some(f=>demoGroupFor(f)===g.id&&demoCaptainUsers(f.details).includes(uid))})),access:{...c.access,mode:demoProduct==='select'?'standalone':'bundle'}});
    c.fixtures=demoSelections.fixtures.filter(f=>isAdmin()||demoGrant(demoGroupFor(f))>0||demoCaptainUsers(f.details).includes(uid)||f.published).map(f=>{
     const group=demoGroupFor(f),view=demoGrant(group)>0||demoCaptainUsers(f.details).includes(uid),head=demoGroupHead(group),base=view?fixtureClone(f):{id:f.id,publication:f.publication,published:fixtureClone(f.published),...(f.published?{details:fixtureClone(f.published.details),slots:fixtureClone(f.published.slots)}:isAdmin()?{details:fixtureClone(f.details),revision:f.revision}:{})};
     const source=demoSelections.result_sources?.[f.id],completed=!!source?.match_id&&!source.no_play&&Object.values(demoScorecards).some(card=>card.match_id===source.match_id&&card.status==='completed');
     return {...base,result_complete:completed,selection_group_id:group,draft_visible:view,can_edit:demoGrant(group)>=2,can_publish:head===uid,can_unlock:head===uid,group_head_id:head,can_comment:view,can_post_comment:demoGrant(group)>=2||demoCaptainUsers(f.details).includes(uid),issues:[]};
    });c.can_view_board=selector||c.captain;
    if(c.can_view_board)c.returning_context={season:fixtureClone(demoSelections.stats_season),no_play:c.fixtures.filter(f=>demoSelections.result_sources?.[f.id]?.no_play).map(f=>f.id)};
    return demoOK(c);
   }
  }
  const result=await demoPreviousCurrentRpc(name,args);
  if(name==='club_social_awards_api'&&a==='context'&&result.data){result.data.editions.push(...demoTeamWeek.collection(d.week_end),...demoPlayerWeek.collection(d.week_end));result.data.editions=result.data.editions.filter(e=>!demoSocial.imageDeletions?.[e.id]?.deleted).map(e=>({...e,deletion_pending:!!demoSocial.imageDeletions?.[e.id]}));demoFilterAwardContext(result.data,d.award_scope||demoScope(d.kind).award_scope);}
  if(name==='club_match_results_api'&&a==='fixture'&&result.data)result.data.playhq={...(result.data.playhq||{}),linked:demoFixtureCalendarLinks.some(l=>l.fixture_id===d.fixture_id)};
  if(name==='club_match_results_api'&&a==='context'&&result.data&&d.award_scope)demoFilterAwardContext(result.data,d.award_scope);
  return result;
 }catch(error){return demoFail(error.message);}
};
const demoPreviousCurrentInvoke=supabase.functions.invoke;
supabase.functions.invoke=async function(name,args={}){
 const body=args.body||{};
 if(name==='club-social-style'&&['graphic_refine','award_refine'].includes(body.purpose)){
  if(!demoIsSocial())return demoFail('Socials Manager access required');
  const brief=(body.brief||'').toLowerCase(),changes={};let explanation='Demo preview: try “use gold text”, “make the names larger” or “shorten 1st Grade to 1st”.',label=null;
  if(body.kind==='results'&&/\bwon\b/.test(brief)&&/\blost\b/.test(brief)){changes.result_labels='won_lost';changes.font=body.current?.font||'sporting';explanation='Demo preview: use WON and LOST consistently across all result rows.';}
  if(body.example_setup){Object.assign(changes,{font:'sporting',result_labels:'won_lost',title_font:'condensed',player_font:'sans',badge_font:'script',badge_style:'glow',show_margin:true});explanation='Demo example style applied. Live clubs use their own uploaded example.';}
  if(body.kind==='results'&&/margin|below.*won|how much/.test(brief))Object.assign(changes,{show_margin:true,margin_font:'condensed'});
  if(body.reference_review)return demoOK({changes:{},badges:[],grade_labels:[],graphic_label:null,artwork_brief:null,explanation:'Demo comparison complete. Live clubs compare the rendered proposal with their own example.'});
  if(/gold|yellow/.test(brief)){changes.text_colour='#f6ca62';explanation='Demo preview: changed the text to gold.';}
  if(/larger|bigger/.test(brief)){if(body.kind==='team_week')changes.font_scale=115;else if(body.kind==='team_selections')changes.font='bold';else changes.name_size=Math.min(120,(body.current?.name_size||76)+12);explanation='Demo preview: increased the name emphasis.';}
  const short=/shorten (.+?) to (.+?)[.!]?$/.exec(body.brief||''),grades=body.preview_grades||[],grade=short&&grades.find(g=>g.toLowerCase()===short[1].toLowerCase());
  const grade_labels=grade?[{grade,label:short[2]}]:[];if(grade)explanation='Demo preview: changed the display label to '+short[2]+'.';
  const week=/\bweek\s+(\d+)\b/i.exec(body.brief||'');if(week&&body.kind!=='team_selections'){label='Week '+week[1];explanation='Demo preview: proposed '+label+' for all awards this week.';}
  if(body.kind==='team_selections'&&changes.text_colour){delete changes.text_colour;changes.accent='#f6ca62';}
  const player_displays=[];
  if(body.kind==='team_week'&&body.preview_players?.length&&/bowling|batting/.test(brief)){
   const context=await supabase.rpc('team_of_week_api',{p_action:'context',p_data:{week_end:body.week_end,include_provisional:body.include_provisional,award_scope:body.award_scope}});
   const selected=new Set(body.preview_players.map(p=>p.key)),matches=(context.data?.candidates||[]).filter(p=>selected.has(p.key)&&brief.includes(p.name.toLowerCase()));
   if(matches.length===1){const p=matches[0],display=/also|both|batting and bowling|bowling and batting/.test(brief)?'both':/bowling/.test(brief)?'bowling':'batting';
    if((display==='bowling'||p.batting.length)&&(display==='batting'||p.bowling.length)){player_displays.push({key:p.key,display});explanation='Demo preview: show '+(display==='both'?'batting and bowling':display)+' figures for '+p.name+'.';}
    else explanation='Those figures are not recorded for '+p.name+'.';
   }else explanation='Which selected player should show those figures?';
  }
  return demoOK({changes,grade_labels,player_displays,explanation,artwork_brief:null,graphic_label:label});
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

// Mirelion Assist uses the production UI with a tab-local, fictional transport.
const demoAssistTransport=createMirelionAssistDemo(()=>({userId:session?.user?.id,clubName:club?.name,name:userProfile?.display_name}));
const demoBeforeAssistRpc=window.__fixtureDb.rpc;
window.__fixtureDb.rpc=function(name,args){return name==='mirelion_assist'?demoAssistTransport.rpc(name,args):demoBeforeAssistRpc.call(this,name,args);};

// The same shared fixture/player arrival contract, using fictional data only.
let demoArrivalRows={},demoArrivalReceipts={};
const demoBeforeArrivalsRpc=window.__fixtureRpc;
window.__fixtureRpc=async(name,args={})=>{
 if(name!=='match_arrivals_api')return demoBeforeArrivalsRpc(name,args);
 try{
  demoTeamStaff(args.p_club_id);const editable=new Set(demoTeamEditable().map(p=>p.id)),p=args.p_data||{},action=args.p_action;
  const permitted=id=>editable.has(id),stamp=()=>new Date().toISOString(),receipt=session.user.id+':'+p.request_id;
  if(action==='roll'){
   const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear()-(now.getUTCMonth()<6?1:0),6,1)).toISOString().slice(0,10),end=(Number(start.slice(0,4))+1)+'-06-30',people=new Map();
   for(const r of Object.values(demoArrivalRows)){const f=demoSelections.fixtures.find(f=>f.id===r.fixture_id),date=f?.details.days[0].date;if(!r.late||!permitted(r.player_id)||!date||date<start||date>end||f.details.cancelled)continue;
    const person=people.get(r.player_id)||{player_id:r.player_id,display_name:fixtureRows.players.find(p=>p.id===r.player_id)?.display_name||'Player',count:0,outstanding:0,matches:[]};person.count++;if(!r.discussed_at)person.outstanding++;person.matches.push({...r,match_date:date,grade:f.details.grade,opposition:f.details.opposition});people.set(r.player_id,person);
   }
   return demoOK({players:[...people.values()].sort((a,b)=>Number(b.count>=2&&b.outstanding>0)-Number(a.count>=2&&a.outstanding>0)||b.count-a.count),season_from:start,season_to:end,repeat_threshold:2});
  }
  if(!(action==='discuss'?[p.player_id]:p.player_ids||[]).every(permitted))return demoFail('Coaching edit access is required');
  if(p.request_id&&demoArrivalReceipts[receipt])return demoOK(demoArrivalReceipts[receipt]);
  if(action==='discuss'){
   for(const m of p.matches){const r=demoArrivalRows[m.fixture_id+':'+p.player_id];if(!r?.late)return demoFail('An arrival changed. Reload the late-arrivals list.');if(!r.discussed_at&&r.revision!==m.revision)return demoFail('An arrival changed. Reload the late-arrivals list.');}
   for(const m of p.matches){const r=demoArrivalRows[m.fixture_id+':'+p.player_id];if(!r.discussed_at){r.discussed_at=stamp();r.revision++;}}
   const result={discussed:true,player_id:p.player_id};demoArrivalReceipts[receipt]=result;return demoOK(result);
  }
  let f=demoSelections.fixtures.find(f=>p.fixture_id?f.id===p.fixture_id:f.details.grade_group_id===p.group_id&&f.details.days[0].date===p.identity?.match_date&&f.details.format===p.identity?.format_key&&f.details.opposition.trim().toLowerCase()===p.identity?.opposition.trim().toLowerCase());
  if(!f&&p.fixture_id)return demoFail('Fixture unavailable in this club');
  if(!f&&action==='save'){const group=fixtureGroups.find(g=>g.id===p.group_id);if(!group)return demoFail('Choose the match and grade first');f={id:crypto.randomUUID(),club_id:club.id,details:{grade:group.name,grade_group_id:group.id,days:[{date:p.identity.match_date}],format:p.identity.format_key,opposition:p.identity.opposition},slots:[],published:null,publication:0,revision:1};demoSelections.fixtures.push(f);}
  if(action==='get')return demoOK({fixture_id:f?.id||null,players:p.player_ids.map(id=>demoArrivalRows[f?.id+':'+id]||{player_id:id,late:false,revision:0,discussed_at:null})});
  const id=p.player_ids[0],key=f.id+':'+id,old=demoArrivalRows[key]||{fixture_id:f.id,player_id:id,late:false,revision:0,discussed_at:null};
  if(old.late!==p.late){if(old.revision!==p.revision)return demoFail('The arrival record changed. Reload before changing it.');demoArrivalRows[key]={...old,late:p.late,revision:old.revision+1,discussed_at:null};}
  const result=demoArrivalRows[key]||old;demoArrivalReceipts[receipt]=structuredClone(result);return demoOK(result);
 }catch(e){return demoFail(e.message);}
};
