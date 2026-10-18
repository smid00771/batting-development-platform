const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function source(file){return fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');}
function fn(src,name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(src);assert.ok(m,name);const rest=src.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
for(const file of ['app.js','demo.html']){
 test(file+': captain, player, selector and socials navigation combine without losing prior roles',()=>{
  const membership={permission_role:'captain',involvement:'both'},c=vm.createContext({membership,session:{user:{id:'me'}},hasMatchCaptainAccess:()=>false,seCanSetup:d=>d.admin||d.selector});
  vm.runInContext(['seBoardAccess','seHasAvailability','seIsCaptain','seSelectionTabs'].map(n=>fn(source(file),n)).join('\n'),c);
  const d={captain:true,roster:[],reviews:[],conversations:[],can_view_club_availability:true};
  const labels=()=>Array.from(c.seSelectionTabs(d),x=>x[1]);
  assert.deepEqual(labels(),['Selection Board']);
  d.socials=true;assert.deepEqual(labels(),['Selection Board','Social Graphics']);
  d.selector=true;assert.deepEqual(labels(),['Playing List','Availability','Selection Board','Social Graphics']);
  d.selector=false;d.captain=false;membership.permission_role='none';assert.deepEqual(labels(),['Availability','Teams','Social Graphics']);
  d.socials=false;assert.deepEqual(labels(),['Availability','Teams']);
 });
 test(file+': Workshop participation adds to captain and player access',()=>{
  const c=vm.createContext({membership:{permission_role:'captain',involvement:'both'},session:{user:{id:'me'}},club:{id:'club'},myContributor:null,workshop:{status:'open'},workshopPreview:null,howWeBatVersions:[{}],productTrialWaiting:()=>false,selectionsStandalone:()=>false,hasMatchCaptainAccess:()=>false,isPhilosophyLead:()=>false,clubSetupUnavailableReason:()=>'',canUseTeamReview:()=>true});
  vm.runInContext(['isAdmin','isPlayerUser','canUsePlayersWorkspace','canContributePhilosophy','canUseClubHome','canOpenClubTab'].map(n=>fn(source(file),n)).join('\n'),c);
  for(const tab of ['dashboard','players','team_review','myplan','innings','teams'])assert.equal(c.canOpenClubTab(tab),true,tab);
  assert.equal(c.canOpenClubTab('workshop'),false);c.myContributor={status:'invited'};
  for(const tab of ['workshop','identity','dimensions','formats','players','myplan','teams'])assert.equal(c.canOpenClubTab(tab),true,tab);
  assert.equal(c.canOpenClubTab('permissions'),false);assert.equal(c.canOpenClubTab('plan'),false,'Contributor does not gain Philosophy Lead publishing controls');
 });
 function managers(data){
  const dom=new JSDOM('<main id="socialContent"></main>',{url:'https://clubbatting.com/app.html'}),calls=[],s={data:{brand:{name:'Example club'},timezone:'Australia/Sydney',members:[{user_id:'admin',name:'Admin',admin:true},{user_id:'me',name:'Bryce',manager:true},{user_id:'other',name:'Other manager',manager:false}],...data},scope:'me:club'};
  const c=vm.createContext({document:dom.window.document,session:{user:{id:'me'}},Intl,Date,URL,location:dom.window.location,seEsc:x=>String(x??''),socialSave:async(s,action,data)=>calls.push({action,data}),socialPublishing:{responsibility(){},managerPost(s,id){calls.push({post:id});}}});
  vm.runInContext(fn(source(file),'socialManagers'),c);c.socialManagers(s);return {doc:dom.window.document,calls,s,c};
 }
 test(file+': permanent manager can add managers, while the last-manager checkbox cannot silently remove them',()=>{
  const h=managers({admin:false,can_manage_managers:true});assert.equal(h.doc.querySelector('[data-social-manager="me"]').disabled,true);assert.ok(h.doc.getElementById('socialRequestHandover'));
  const add=h.doc.querySelector('[data-social-manager="other"]');add.checked=true;add.onchange();assert.equal(h.calls[0].action,'manager');assert.equal(h.calls[0].data.enabled,true);
  h.doc.getElementById('socialRequestHandover').click();assert.equal(h.calls[1].action,'manager_handover');assert.equal(h.calls[1].data.operation,'request');
 });
 test(file+': pending handover stays visible and scheduled posts prevent completion',()=>{
  const h=managers({admin:true,can_manage_managers:true,manager_handovers:[{user_id:'me',name:'Bryce',requested_at:'2026-10-15T23:00:00Z'}],manager_posts:{me:[{id:'scheduled',blocks_hand_back:true,images:[{label:'1st Grade'}]}]}});
  assert.match(h.doc.body.textContent,/remains a Socials Manager/);assert.match(h.doc.body.textContent,/16 Oct 2026/);assert.equal(h.doc.querySelector('[data-social-complete-handover]').disabled,true);
  h.doc.querySelector('[data-social-handover-post]').click();assert.equal(h.calls[0].post,'scheduled');
  h.s.data.manager_posts={};h.c.socialManagers(h.s);const button=h.doc.querySelector('[data-social-complete-handover]');assert.equal(button.textContent,'Take responsibility as Club Admin');button.click();assert.equal(h.calls[1].data.take_responsibility,true);
 });
 test(file+': temporary cover cannot appoint permanent managers',()=>{
  const h=managers({admin:false,can_manage_managers:false});assert.equal(h.doc.querySelector('[data-social-manager]'),null);assert.match(h.doc.body.textContent,/covering socials temporarily/);
 });
 test(file+': Social accounts is the second section',()=>{
  const match=source(file).match(/\[\['managers','Who handles socials'\],\['accounts','Social accounts'\],\['awards','Socials Awards'\],\['graphics','Create posts'\]/);assert.ok(match);
 });
}
test('Social accounts handles pending activation, a usable connection, manager disconnect and failed checks',async()=>{
 const dom=new JSDOM('<main id="socialContent"></main>',{url:'https://clubbatting.com/'});global.window=dom.window;global.document=window.document;global.location=window.location;global.localStorage=window.localStorage;
 const {createSocialPublishing}=await import('../social-publishing.js');let writes=0;
 const s={scope:'me:club',view:'accounts',data:{timezone:'Australia/Sydney'},publishing:{context:{admin:false,can_connect:true,can_disconnect:true,configured:false},checkedAt:Date.now()}};
 const p=createSocialPublishing({escape:x=>String(x??''),supabase:{rpc:async()=>{writes++;return {data:{}};}},here:()=>true,draw(){},current:()=>s,message(){}});p.accounts(s);
 assert.match(document.body.textContent,/awaiting Club Batting activation/);assert.equal(document.getElementById('spConnect'),null);assert.ok(document.getElementById('spManualGraphics'));assert.doesNotMatch(document.body.textContent,/Your club is ready/);
 assert.equal(document.getElementById('spOpenPlatformSetup'),null,'Club manager cannot see platform-owner controls');
 s.publishing.context={...s.publishing.context,configured:true,connection:{status:'connected',page_name:'Club Page',instagram_name:'club',instagram_id:'ig'},health:{checked_at:'2026-10-15T23:00:00Z',facebook:{state:'ready'},instagram:{state:'ready'}}};p.accounts(s);
 assert.ok(document.getElementById('spDisconnect'),'Permanent manager can disconnect');assert.ok(document.getElementById('spConnect'));assert.match(document.body.textContent,/Club Page/);assert.match(document.body.textContent,/16 Oct 2026/);assert.equal(writes,0,'Opening accounts never changes accounts or posts');
 s.publishing.context=null;s.publishing.error='Connection unavailable';p.accounts(s);assert.match(document.body.textContent,/could not load/);assert.equal(document.getElementById('spConnect'),null);assert.equal(writes,0);
});
for(const file of ['app.js','demo.html'])test(file+': self-removal returns to remaining roles without retrying a forbidden socials read',async()=>{
 const s={scope:'me:club'},selections={view:'socials',data:{}},calls=[],c=vm.createContext({crypto:require('node:crypto'),socialHere:()=>selections.view==='socials',socialRPC:async()=>({saved:true,access_removed:true,message:'Other roles retained.'}),socialRefresh:async()=>{throw Error('Must not refresh revoked socials');},socialMessage(){},socialLock(){},seReload:async()=>calls.push('reload'),ensureSelections:()=>selections,drawSelections:()=>calls.push('teams'),socialDraw:()=>calls.push('socials')});
 vm.runInContext(fn(source(file),'socialSave'),c);assert.equal(await c.socialSave(s,'manager',{enabled:false}),true);assert.equal(s.pending,null);assert.equal(s.busy,false);assert.equal(selections.view,'published');assert.deepEqual(calls,['reload','teams']);
});
test('Demo uses the same publishing permission and account UI as the live module',()=>{
 const live=source('social-publishing.js').split('export function createSocialPublishing')[1].trim(),demo=source('demo.html').split('function createSocialPublishing')[1];assert.ok(demo.startsWith(live));
});
test('Platform owner can open actual Meta setup controls from Social accounts',async()=>{
 const dom=new JSDOM('<main id="socialContent"></main>',{url:'https://clubbatting.com/'});global.window=dom.window;global.document=window.document;global.location=window.location;
 const {createSocialPublishing}=await import('../social-publishing.js');let opened=0;
 const s={scope:'owner:club',data:{timezone:'Australia/Sydney'},publishing:{context:{configured:false,admin:true}}};
 const p=createSocialPublishing({escape:String,supabase:{},here:()=>true,current:()=>s,canSetupPlatform:()=>true,renderPlatformSetup:host=>{opened++;host.innerHTML='<button>Check setup automatically</button>';}});
 p.accounts(s);assert.equal(opened,0);document.getElementById('spOpenPlatformSetup').click();assert.equal(opened,1);assert.match(document.getElementById('spPlatformSetup').textContent,/Check setup automatically/);assert.equal(document.getElementById('spPlatformSetup').hidden,false);
});
