const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('app.js','utf8');
const fn=name=>source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n\\}'))[0];
const thread='11111111-1111-4111-8111-111111111111',clubId='22222222-2222-4222-8222-222222222222';
function setup(query,{signedIn=true,platform=false,savedPlatform=false}={}){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://mirelionhq.com/app.html'+query});
 const result=[],club={id:clubId,name:'Fictional club'};
 const context=vm.createContext({URL,URLSearchParams,location:dom.window.location,history:dom.window.history,document:dom.window.document,localStorage:dom.window.localStorage,
  app:dom.window.document.getElementById('app'),session:signedIn?{user:{id:'user'}}:null,platformRole:platform?'owner':null,passwordRecoveryRequired:false,legacyAppSession:false,
  allMemberships:[],membership:null,club:null,userProfile:null,currentTab:'dashboard',joinedAvailabilityClub:null,appNavigationRequest:0,pendingAssistLaunch:null,
  renderLogin:()=>result.push({login:true}),loadPlatformContext:async()=>{},resumeAppNavigationOnLoad:async()=>false,
  supabase:{from:table=>({select:()=>({eq:()=>table==='club_memberships'?Promise.resolve({data:[{club_id:clubId,clubs:club,involvement:'playing'}]}):{maybeSingle:async()=>({data:{display_name:'Fictional member'}})}})})},
  capturePhoneLaunch(){},applyPhoneLaunch:async()=>{},loadSelectionsAccess:async()=>{},hasPlayingChoice:()=>true,loadData:async()=>{},productTrialWaiting:()=>false,selectionsStandalone:()=>false,canUseClubHome:()=>true,isPlayerUser:()=>true,canOpenClubTab:()=>true,
  esc:x=>String(x),signOutClubBatting(){},renderNoClub:()=>result.push({noClub:true}),
  renderShell:()=>result.push({tab:context.currentTab,club:context.club.id,threadId:context.pendingAssistLaunch?.threadId}),
  renderPlatformConsole:()=>result.push({platform:context.platformView,threadId:context.pendingAssistLaunch?.threadId})
 });
 if(savedPlatform)dom.window.localStorage.setItem('bdp-context','platform');
 vm.runInContext(fs.readFileSync('domain-routing.js','utf8').replace(/^export /gm,'')+'\n'+fs.readFileSync('assist-routing.js','utf8').replace(/^export /gm,'')+'\n'+['routeAuth','loadContext','clearClubLaunchRoute'].map(fn).join('\n'),context);
 return {context,result,dom,close:()=>dom.window.close()};
}
test('public contact link retains Assist through sign-in and overrides a saved platform view',async t=>{
 const h=setup('?tab=assist',{signedIn:false,platform:true,savedPlatform:true});t.after(h.close);
 await h.context.routeAuth();assert.deepEqual(h.result,[{login:true}]);
 h.context.session={user:{id:'user'}};await h.context.routeAuth();
 assert.deepEqual(h.result.at(-1),{tab:'assist',club:clubId,threadId:null});
});
test('reply email opens its exact private conversation after sign-in',async t=>{
 const h=setup(`?club=${clubId}&tab=assist&assist_thread=${thread}`,{signedIn:false});t.after(h.close);
 await h.context.routeAuth();h.context.session={user:{id:'user'}};await h.context.routeAuth();
 assert.deepEqual(h.result.at(-1),{tab:'assist',club:clubId,threadId:thread});
 assert.equal(h.dom.window.location.search,'');
});
test('an email for another club cannot open a conversation under the current club',async t=>{
 const h=setup(`?club=99999999-9999-4999-8999-999999999999&tab=assist&assist_thread=${thread}`);t.after(h.close);
 await h.context.routeAuth();assert.equal(h.result.length,0);assert.match(h.dom.window.document.body.textContent,/different account/);
});
test('the support inbox alert opens Platform Admin Assist',async t=>{
 const h=setup(`?platform=1&assist_thread=${thread}`,{platform:true});t.after(h.close);
 await h.context.routeAuth();assert.deepEqual(h.result.at(-1),{platform:'guide_requests',threadId:thread});
});
