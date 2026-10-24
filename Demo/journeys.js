// The role chooser selects an actual fictional member; it never grants UI-wide access.
const demoProducts={select:'Mirelion Select only',batting:'Club Batting only',both:'Both products'};
const demoPeople={
 player:{name:'Just a player',user:'user-alex',products:['select','batting','both'],description:'My availability, published teams and my own batting work.',access:'Player access only. No draft Selection Board, other players’ private plans, club settings or Socials.',select:['selected_teams','availability'],batting:['player_home','plan','match_preparation','training','innings','requests','make_your_call']},
 captain:{name:'Captain',user:'user-jordan',products:['select','batting','both'],description:'My team, match appointments and permitted player support.',access:'1st Grade captain and player. Can view the team’s board and comment; cannot edit or publish selections without a selector grant. Batting support is limited to the assigned team.',select:['selections','availability'],batting:['player_home','players','team_review','training_preparation','plan']},
 selector:{name:'Selector',user:'user-selector',products:['select','both'],description:'Build teams within assigned Selection Groups.',access:'Can edit Senior Grade Teams; can view Masters. Cannot publish teams, administer the club or manage Socials.',select:['selections','availability'],batting:[]},
 head:{name:'Head of Selections',user:'user-head',products:['select','both'],description:'Review selections and publish the group I oversee.',access:'Club Head of Selections, with Senior Grade Teams editing and publication. Can view Masters; its own Head Selector retains publication authority. No automatic admin or Socials access.',select:['selections','availability'],batting:[]},
 admin:{name:'Club Admin',user:'user-admin',products:['select','batting','both'],description:'Club setup, people, connections and permissions.',access:'Manages club setup and role assignments. Admin status alone does not grant draft selection or publication rights. No player account is attached to this non-playing member.',select:['selection_admin','selection_groups','connection','season','people','social_awards'],batting:['home','people','groups','howwebat','help']},
 coach:{name:'Coach',user:'user-coach',products:['batting','both'],description:'Player plans, training preparation and match feedback.',access:'Coach with authorised batting access to club players. No selector, publishing or Socials role.',select:[],batting:['players','training_preparation','team_review','feedback']},
 lead:{name:'Philosophy Lead',user:'user-lead',products:['batting','both'],description:'Lead the workshop and agree the club’s batting approach.',access:'Leads the Batting Philosophy Workshop, How We Bat and Player Plan questions. Does not receive club administration or selector permissions.',select:[],batting:['workshop','howwebat','questions']},
 participant:{name:'Workshop participant',user:'user-taylor',products:['batting','both'],description:'Contribute to the workshop while keeping my player access.',access:'Taylor is a player invited to the workshop. Participation adds the workshop to existing player access; only the Philosophy Lead chooses the club approach.',select:['selected_teams','availability'],batting:['contributor','player_home','plan','training']},
 combined:{name:'Captain + Socials + Workshop',user:'user-combined',products:['both'],description:'One person with several separately assigned roles.',access:'Robin is a player, 2nd Grade captain, Socials Manager and workshop participant. Those permissions add together. Robin is not a selector, Philosophy Lead or Club Admin.',select:['selections','socials','social_awards','availability'],batting:['player_home','contributor','players','plan']},
 socials:{name:'Socials Manager',user:'user-social',products:['select','both'],description:'Team graphics, scoped awards and posting preparation.',access:'Assigned Socials Manager. Can create graphics and awards from published teams and scores. Cannot access draft selections or club administration.',select:['socials','social_awards','social_accounts'],batting:[]}
};
const demoExtraStages=[
 {key:'assist',label:'Mirelion Assist',tab:'assist',hint:'Try private support messages and an explicitly fictional reply. Nothing is sent to Mirelion.'},
 {key:'selection_groups',label:'Selection Groups',tab:'teams',hint:'Open saved groups directly. Club Batting sharing is controlled separately for each group in the combined product.'},
 {key:'connection',label:'Connect PlayCricket',tab:'teams',hint:'Try the new-club request and example-key paths. Preparing a request does not mark it as sent.'},
 {key:'season',label:'Season & fixture imports',tab:'teams',hint:'Choose a season, assign imported teams to your groups, match existing grades, then save and appoint captains.'},
 {key:'social_accounts',label:'Social accounts',tab:'teams',hint:'Preview the connection screen. External accounts and posting are not connected in this demo.'}
];
for(const stage of demoExtraStages)demoStages.push(stage);
const demoStageLabels={selections:'Selection Board',selected_teams:'Published teams',selection_admin:'Settings',socials:'Create social posts',social_awards:'Socials Awards',plan:'My Player Plan',contributor:'Workshop contribution',people:'People & sign-up'};
function demoTasks(product=demoProduct,persona=demoPersona){const p=demoPeople[persona];return [...new Set([...(product!=='batting'?p.select:[]),...(product!=='select'?p.batting:[]),'help','assist'])];}
function demoPersonas(product){return Object.entries(demoPeople).filter(([,p])=>p.products.includes(product));}
function demoRoleDescription(product,id){if(id==='player')return product==='select'?'My availability, published teams and match acknowledgements.':product==='batting'?'My plan, training, match preparation and reflections.':demoPeople[id].description;return demoPeople[id].description;}
function demoDefaultTask(product,role){if(role==='participant'&&product==='both')return 'contributor';return demoTasks(product,role)[0];}
let demoStarted=false,demoWorkshopSaved=null;
function demoToolbar(){
 const person=demoPeople[demoPersona],tasks=demoTasks();
 document.getElementById('demoControls').hidden=false;document.getElementById('demoContext').hidden=false;
 document.getElementById('demoProduct').innerHTML=Object.entries(demoProducts).map(([id,label])=>`<option value="${id}" ${id===demoProduct?'selected':''}>${esc(label.replace(' only',''))}</option>`).join('');
 document.getElementById('demoPersona').innerHTML=demoPersonas(demoProduct).map(([id,p])=>`<option value="${id}" ${id===demoPersona?'selected':''}>${esc(p.name)}</option>`).join('');
 document.getElementById('demoStage').innerHTML=tasks.map(key=>`<option value="${key}" ${key===demoCurrentStage?'selected':''}>${esc(demoStageLabels[key]||demoStages.find(s=>s.key===key)?.label||key)}</option>`).join('');
 document.getElementById('demoRole').textContent=(userProfile?.display_name||'')+' · '+person.name;
 document.getElementById('demoHint').textContent=demoScenario==='newclub'?'New-club example · start before connecting a provider':demoProducts[demoProduct];
 document.getElementById('demoPermissions').textContent=person.access;
 document.title='Mirelion demo · '+demoProducts[demoProduct]+' · '+person.name;
}
function demoShowWelcome(product=null,{push=false}={}){
 if(!demoProducts[product])product=null;
 document.getElementById('app').replaceChildren();document.getElementById('demoControls').hidden=true;document.getElementById('demoContext').hidden=true;document.getElementById('demoStatus').hidden=true;
 const host=document.getElementById('demoWelcome');
 host.innerHTML=`<section class="demo-welcome"><p class="demo-eyebrow">Explore Mirelion</p>${product?`<h1>${esc(demoProducts[product])}</h1><p class="demo-intro">Choose who you’d like to be. Each person has their own starting page and permissions.</p><div class="demo-role-grid">${demoPersonas(product).map(([id,p])=>`<button class="demo-role-card" data-demo-role="${id}"><strong>${esc(p.name)}</strong><small>${esc(demoRoleDescription(product,id))}</small><span>Explore this role →</span></button>`).join('')}</div><div class="demo-welcome-actions"><button class="btn secondary" data-demo-products>← Product choices</button>${product!=='batting'?'<button class="btn" data-demo-new>Try a new club’s setup</button>':''}</div>`:`<h1>A club runs on people.<br>See what each person sees.</h1><p class="demo-intro">Explore teams and availability, a shared approach to batting, or both together. Start with a product, then step into a role.</p><div class="demo-products">${[['select','Mirelion Select','Availability, selections, fixtures and social graphics. Help volunteers get the weekly work done.'],['batting','Club Batting','A club batting philosophy, individual plans, training and match reflections.'],['both','Both products','One club, one sign-in. See selections and batting development working together.']].map(([id,name,description])=>`<article class="demo-product-card ${id==='batting'?'batting':''}"><p class="demo-eyebrow">${id==='both'?'Together':'Standalone'}</p><h2>${name}</h2><p>${description}</p><button class="btn" data-demo-product="${id}">Explore ${id==='both'?'both products':name} →</button></article>`).join('')}</div><div class="demo-welcome-actions"><button class="btn secondary" data-demo-new>Try a new club’s setup</button><span class="demo-fineprint">No sign-in or real club details needed.</span></div>`}<p class="demo-fineprint">Fictional club · Real application screens · Changes stay in this tab<br>Connections, AI, calls and posting are simulations. This demo does not send messages or publish anything. <a href="./demo.html" download="Mirelion-demo.html">Download this demo</a>.</p></section>`;
 host.querySelectorAll('[data-demo-product]').forEach(b=>b.onclick=()=>demoShowWelcome(b.dataset.demoProduct,{push:true}));
 host.querySelectorAll('[data-demo-role]').forEach(b=>b.onclick=()=>window.demoReady=demoNavigate(demoDefaultTask(product,b.dataset.demoRole),{product,persona:b.dataset.demoRole,scenario:'ready',push:true}));
 host.querySelector('[data-demo-products]')?.addEventListener('click',()=>demoShowWelcome(null,{push:true}));
 host.querySelector('[data-demo-new]')?.addEventListener('click',()=>window.demoReady=demoNavigate('connection',{product:product||'select',persona:'admin',scenario:'newclub',reset:true,push:true}));
 const url=new URL(location.href);url.search='';if(product)url.searchParams.set('product',product);history[push?'pushState':'replaceState']({demoWelcome:product||true},'',url.pathname+url.search);
 document.title='Mirelion · Explore the demo';window.scrollTo(0,0);
}
async function demoNavigate(key,{reset=false,initial=false,product=demoProduct,persona=demoPersona,scenario=demoScenario,push=false}={}){
 if(demoNavigationBusy)return;demoNavigationBusy=true;
 try{
  if(demoStarted&&!reset&&!await saveClubEditsBeforeNavigation()){demoToolbar();return;}
  if(!demoPeople[persona]?.products.includes(product))persona='player';
  if(persona!=='admin'&&scenario==='newclub')scenario='ready';
  const rebuild=reset||!demoStarted||scenario!==demoScenario;
  if(demoStarted&&demoProduct!=='select'&&workshop)demoWorkshopSaved=demoWorkshopSnapshot();
  demoProduct=product;demoPersona=persona;demoScenario=scenario;
  if(rebuild){demoAssistTransport.reset();mirelionAssist.reset();demoSeedCurrent({empty:scenario==='newclub'});demoWorkshopSaved=demoWorkshopSnapshot();demoStarted=true;}else{fixtureResetGlobals();if(demoWorkshopSaved)demoRestoreWorkshopSnapshot(demoWorkshopSaved);}
  document.querySelectorAll('dialog').forEach(d=>d.remove());document.getElementById('demoWelcome').replaceChildren();document.getElementById('demoStatus').textContent='';document.getElementById('demoStatus').hidden=true;
  platformRole=null;platformAccessError=false;canBootstrapPlatform=false;
  const person=demoPeople[persona],user=person.user;session={user:{id:user,email:user.slice(5)+'@example.test'}};userProfile=fixtureClone(fixtureRows.user_profiles.find(p=>p.user_id===user));membership=fixtureClone(fixtureRows.club_memberships.find(m=>m.user_id===user));allMemberships=[{...membership,clubs:club}];
  demoSelections.access.mode=product==='select'?'standalone':'bundle';selectionState=null;selectionAccess=null;socialState=null;sharedTeamsState=null;
  const tasks=demoTasks(),stage=demoStages.find(s=>s.key===(tasks.includes(key)?key:tasks[0]));demoCurrentStage=stage.key;
  await loadData();if(product==='select'&&demoWorkshopSaved)demoRestoreWorkshopSnapshot(demoWorkshopSaved);
  currentTab=stage.tab;resetPlayersWorkspaceForClub();
  if(stage.key==='feedback'){playersWorkspaceClubId=club.id;playersWorkspaceSelectedId='player-alex';playersWorkspaceSection='development';}
  if(['match_preparation','training','training_preparation','feedback'].includes(stage.key)){demoSeedMatchPreparations();myInningsCache=null;}
  if(stage.tab==='teams'){
   const s=ensureSelections();s.view={selection_admin:'settings',selection_groups:'selection_groups',connection:'settings',season:'settings',selections:'board',availability:'availability',socials:'socials',social_awards:'socials',social_accounts:'socials'}[stage.key]||'published';
   if(s.view==='socials'){const social=socialEnsure();social.view=stage.key==='social_awards'?'awards':stage.key==='social_accounts'?'accounts':'graphics';socialAdoptResultsWeek(social,demoAddDay(demoUpcomingSaturday(),-6));}
  }
  demoToolbar();renderShell();await window.__demoRenderDone;
  if(stage.key==='connection')sePlayCricketConnection();if(stage.key==='season')seImportFixtures();
  demoToolbar();demoDecorate();window.scrollTo({top:0,left:0,behavior:'instant'});
  const url=new URL(location.href);url.search='';url.searchParams.set('product',demoProduct);url.searchParams.set('role',demoPersona);url.searchParams.set('journey',demoCurrentStage);if(scenario==='newclub')url.searchParams.set('scenario','newclub');
  const state={...history.state,demoRoute:{product:demoProduct,persona:demoPersona,key:demoCurrentStage,scenario}};
  history[push?'pushState':'replaceState'](state,'',url.pathname+url.search);
 }catch(error){window.__fixtureError(error.message||String(error));throw error;}
 finally{demoNavigationBusy=false;}
}
const demoBaseDecorate=demoDecorate;
demoDecorate=function(){
 demoBaseDecorate();
 document.querySelectorAll('.graphic-assistant p.se-muted,.graphic-assistant p.sa-note').forEach(p=>{if(p.textContent.includes('allowance'))p.textContent='Demo suggestions: “use gold text”, “make the names larger”, or “shorten 1st Grade to 1st”. No AI credits are used.';});
 const form=document.querySelector('[data-pc-credentials]');
 if(form&&!form.querySelector('[data-demo-credentials]')){
  const bar=document.createElement('p');bar.className='se-form-note';bar.innerHTML='<strong>Simulation:</strong> use fictional credentials here. <button type="button" class="btn secondary" data-demo-credentials>Use example credentials</button>';form.prepend(bar);
  bar.querySelector('button').onclick=()=>{for(const [name,value] of Object.entries({organisation_id:'11111111-1111-4111-8111-111111111111',association_id:'22222222-2222-4222-8222-222222222222',api_key:'DEMO-KEY-NOT-REAL'})){form.elements[name].value=value;form.elements[name].dispatchEvent(new Event('input',{bubbles:true}));}};
 }
 // Request submission remains an explicit, clearly labelled simulation.
 const sent=document.querySelector('[data-pc-sent]');if(sent&&!sent.querySelector('[data-demo-sent]')){const note=document.createElement('p');note.dataset.demoSent='';note.className='se-form-note';note.textContent='Demo: this checkbox simulates confirming that the club sent its request. Nothing is sent from this page.';sent.prepend(note);}
 document.querySelectorAll('.pc-connection a[target="_blank"]').forEach(a=>{a.onclick=e=>{e.preventDefault();window.__fixtureError('Demo only: in a live club, send this request through your association or provider support. Nothing was sent.');};});
};
function demoInitialRoute(){
 const q=new URLSearchParams(location.search),legacy=q.get('stage');
 if(q.has('role')){const product=demoProducts[q.get('product')]?q.get('product'):'select',persona=demoPeople[q.get('role')]?.products.includes(product)?q.get('role'):'player';return {product,persona,key:q.get('journey')||demoDefaultTask(product,persona),scenario:q.get('scenario')==='newclub'?'newclub':'ready'};}
 if(legacy){const s=demoStages.find(s=>s.key===legacy);const persona=['socials','social_awards'].includes(legacy)?'socials':legacy==='selections'?'selector':legacy==='contributor'?'participant':legacy==='workshop'?'lead':s?.role==='admin'?'admin':s?.role==='coach'?'coach':'player';return {product:s?.tab==='teams'?'select':'batting',persona,key:legacy,scenario:'ready'};}
 return null;
}
function startClubDemo(){
 document.getElementById('demoHome').onclick=async e=>{e.preventDefault();if(!demoStarted||await saveClubEditsBeforeNavigation())demoShowWelcome(null,{push:true});};
 document.getElementById('demoProduct').onchange=e=>{const product=e.target.value,persona=demoPeople[demoPersona].products.includes(product)?demoPersona:'player';window.demoReady=demoNavigate(demoDefaultTask(product,persona),{product,persona,scenario:'ready',push:true});};
 document.getElementById('demoPersona').onchange=e=>{window.demoReady=demoNavigate(demoDefaultTask(demoProduct,e.target.value),{persona:e.target.value,push:true});};
 document.getElementById('demoStage').onchange=e=>{window.demoReady=demoNavigate(e.target.value,{push:true});};
 document.getElementById('demoReset').onclick=()=>{if(confirm('Reset all changes to this fictional club?'))window.demoReady=demoNavigate(demoCurrentStage,{reset:true});};
 new MutationObserver(demoDecorate).observe(document.getElementById('app'),{childList:true,subtree:true});
 window.addEventListener('popstate',e=>{
  if(e.state?.demoRoute){
   const r=e.state.demoRoute;
   // In-page history belongs to the shared app. Re-entering the journey would
   // reset the stats panel, selected format and player view on every Back.
   const sameJourney=r.product===demoProduct&&r.persona===demoPersona&&r.key===demoCurrentStage&&r.scenario===demoScenario;
   window.demoReady=sameJourney&&validAppNavigationMarker(e.state.clubBattingNavigation)
    ? handleAppNavigationHistory(e) : demoNavigate(r.key,r);
  }else if(e.state?.demoWelcome)demoShowWelcome(e.state.demoWelcome===true?null:e.state.demoWelcome);
 });
 const route=demoInitialRoute();if(route)return demoNavigate(route.key,{...route,initial:true});demoShowWelcome(new URLSearchParams(location.search).get('product'));return Promise.resolve();
}
window.demoReady=startClubDemo();
