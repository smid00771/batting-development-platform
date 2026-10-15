const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
function between(s,a,b){const start=s.indexOf(a),end=s.indexOf(b,start+a.length);assert.ok(start>=0&&end>start);return s.slice(start,end);}
function setup(source,{session=null,url='https://example.test/app.html?player_join=invite%26token&code=old#old'}={}){
 const window=new JSDOM('<main id="app"></main>',{url}).window;
 let forgotten=0,remembered=0,loaded=0;
 const context=vm.createContext({document:window.document,app:window.document.querySelector('#app'),location:window.location,history:window.history,localStorage:window.localStorage,URL,URLSearchParams,session,authActionInFlight:false,
  platformRole:'owner',platformAccessError:false,canBootstrapPlatform:false,club:{id:'old'},membership:{},allMemberships:[{}],userProfile:{},joinedAvailabilityClub:null,currentTab:null,
  esc:value=>String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),sharedSignupIntro:()=>'',clubSignupReturnHtml:()=>'',authEntryLinks:()=>'',rememberClubSignupEntry:()=>remembered++,forgetClubSignupEntry:()=>forgotten++,loadPlatformContext:async()=>{},loadContext:async()=>loaded++,
  val:id=>window.document.getElementById(id)?.value.trim()||'',
  supabase:{rpc:async()=>({data:{open:true,club_name:'Sample Club',products:{selections:true}}}),auth:{signOut:async()=>({})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{display_name:'Sample Player'}})})})})}
 });
 vm.runInContext(between(source,'async function renderPlayerJoinRoute(token){','async function renderPlayerQRCode(')+between(source,"function renderLogin(msg=''){",'function renderPasswordReset('),context);
 return {context,document:window.document,stats:()=>({forgotten,remembered,loaded})};
}
const signedIn={user:{id:'user-a',email:'person@example.test'}};
for(const file of ['app.js','demo.html']){
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
 test(`${file}: fresh login signup uses product chooser and preserves legacy return`,()=>{
  const {context:c,document}=setup(source,{url:'https://example.test/app.html'});c.renderLogin();
  const link=[...document.querySelectorAll('a')].find(a=>a.textContent==='Try it free with your club');assert.ok(new URL(link.href).searchParams.has('trial_product'));
  c.history.replaceState({},'','?trial=1&signin=1');c.renderLogin();assert.ok(document.querySelector('#backToTrialEntry'));assert.equal(new URL(document.querySelector('#backToTrialEntry').href).searchParams.get('trial'),'1');
 });
 test(`${file}: returned and thrown lookup failures retain invite and recover through Try again`,async()=>{
  for(const failure of ['returned','thrown']){
   const {context:c,document,stats}=setup(source);let calls=0;
   c.supabase.rpc=async(name,args)=>{assert.equal(args.p_token,'invite&token');calls++;if(calls===1){if(failure==='thrown')throw Error('Network lost');return {error:{message:'Temporary failure'}};}return {data:{open:true,club_name:'Sample Club'}};};
   await c.renderPlayerJoinRoute('invite&token');assert.match(document.querySelector('h1').textContent,/couldn’t check/);assert.equal(stats().forgotten,0);
   const signIn=new URL(document.querySelector('a').href);assert.equal(signIn.searchParams.get('player_join'),'invite&token');assert.equal(signIn.searchParams.get('signin'),'1');
   const button=document.querySelector('#retryPlayerJoin');await button.onclick({currentTarget:button});assert.ok(document.querySelector('#playerJoinEmail'));assert.equal(calls,2);
  }
 });
 test(`${file}: genuinely invalid or closed invite remains distinct`,async()=>{
  const {context:c,document,stats}=setup(source);c.supabase.rpc=async()=>({data:null});await c.renderPlayerJoinRoute('invite&token');assert.match(document.querySelector('h1').textContent,/no longer valid/);assert.equal(stats().forgotten,1);assert.ok(document.querySelector('a[href*="signin"]'));assert.equal(document.querySelector('#retryPlayerJoin'),null);
  c.supabase.rpc=async()=>({data:{open:false,club_name:'Sample Club'}});await c.renderPlayerJoinRoute('invite&token');assert.match(document.querySelector('h1').textContent,/currently closed/);assert.equal(document.querySelector('#completePlayerJoin'),null);
 });
 test(`${file}: switching account signs out locally, keeps invite and shows empty email entry`,async()=>{
  const {context:c,document,stats}=setup(source,{session:signedIn});let scope;
  c.supabase.auth.signOut=async options=>{scope=options.scope;assert.equal(c.authActionInFlight,true);return {};};
  await c.renderPlayerJoinRoute('invite&token');assert.ok(document.body.textContent.includes('person@example.test'));
  await document.querySelector('#playerJoinSwitchAccount').onclick();
  assert.equal(scope,'local');assert.equal(c.session,null);assert.equal(c.club,null);assert.equal(c.membership,null);assert.equal(c.allMemberships.length,0);assert.equal(c.authActionInFlight,false);
  assert.equal(new URL(c.location.href).searchParams.get('player_join'),'invite&token');assert.equal(new URL(c.location.href).searchParams.get('code'),null);assert.equal(c.location.hash,'');assert.equal(stats().forgotten,0);
  const email=document.querySelector('#playerJoinEmail');assert.equal(email.value,'');assert.equal(document.activeElement,email);assert.equal(document.querySelector('#playerJoinName'),null);
 });
 test(`${file}: failed account switch keeps current identity and allows retry, blocks join while pending`,async()=>{
  const {context:c,document}=setup(source,{session:signedIn});let rejectSwitch,joins=0;
  c.supabase.auth.signOut=()=>new Promise(resolve=>rejectSwitch=resolve);const rpc=c.supabase.rpc;c.supabase.rpc=async(name,args)=>{if(name==='join_club_as_player')joins++;return rpc(name,args);};
  await c.renderPlayerJoinRoute('invite&token');const switchButton=document.querySelector('#playerJoinSwitchAccount'),join=document.querySelector('#completePlayerJoin');
  const pending=switchButton.onclick();assert.equal(join.disabled,true);await join.onclick();assert.equal(joins,0);rejectSwitch({error:{message:'Connection lost'}});await pending;
  assert.equal(c.session.user.id,'user-a');assert.equal(join.disabled,false);assert.equal(switchButton.disabled,false);assert.equal(c.authActionInFlight,false);assert.match(document.querySelector('#completePlayerJoinStatus').textContent,/Connection lost/);
 });
 test(`${file}: joining recovers after failure and rejects an unexpected account change`,async()=>{
  const {context:c,document,stats}=setup(source,{session:signedIn});let joinCalls=0;const rpc=c.supabase.rpc;
  c.supabase.rpc=async(name,args)=>name==='join_club_as_player'?(joinCalls++,{error:{message:'Try again later'}}):rpc(name,args);
  await c.renderPlayerJoinRoute('invite&token');const button=document.querySelector('#completePlayerJoin');await button.onclick();assert.equal(button.disabled,false);assert.equal(c.authActionInFlight,false);assert.match(document.querySelector('#completePlayerJoinStatus').textContent,/Try again later/);
  c.session={user:{id:'user-b'}};await button.onclick();assert.equal(joinCalls,1);assert.equal(stats().loaded,0);assert.match(document.querySelector('#completePlayerJoinStatus').textContent,/account changed/);
  c.session=signedIn;c.supabase.rpc=async(name,args)=>{assert.equal(name,'join_club_as_player');assert.equal(args.p_token,'invite&token');assert.equal(args.p_display_name,'Sample Player');return {data:'new-club'};};
  await button.onclick();assert.equal(stats().loaded,1);assert.equal(stats().forgotten,1);assert.equal(c.currentTab,'teams');assert.equal(c.joinedAvailabilityClub,'new-club');assert.equal(c.localStorage.getItem('bdp-club-id'),'new-club');assert.equal(c.location.search,'');assert.equal(c.authActionInFlight,false);
 });
}
