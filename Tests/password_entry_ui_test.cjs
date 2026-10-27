const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
function between(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const account={user:{id:'sample-account',email:'player@example.test'}};
const recovery='https://example.test/app.html?password_setup=1#access_token=example&refresh_token=example&type=recovery';
async function setup(file,{url='https://example.test/app.html',session=null,error=null}={}){
  const {createPasswordFlow,cleanPasswordUrl}=await import('../password-flow.js');
  const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
  const window=new JSDOM('<main id="app"></main>',{url}).window;
  const passwordFlow=createPasswordFlow(url);passwordFlow.initialise(session,error);
  if(passwordFlow.isPasswordEntry)window.history.replaceState({},'',cleanPasswordUrl(url));
  const tasks=[],calls={signIns:0,saves:0,emails:0,loads:0};let authListener;
  const c=vm.createContext({document:window.document,app:window.document.querySelector('#app'),location:window.location,history:window.history,URL,URLSearchParams,session,passwordFlow,cleanPasswordUrl,authActionInFlight:false,club:null,legacyAppSession:false,
    isLegacyOrigin:()=>false,esc:value=>String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),val:id=>window.document.getElementById(id)?.value.trim()||'',clubSignupReturnHtml:()=>'',authEntryLinks:()=>'',saveClubEditsBeforeNavigation:async()=>true,
    matchDraftAuthChanged:()=>{},mirelionAssist:{reset:()=>{}},clubMessageState:null,clubMessageUnread:0,phoneWorkerMessage:async()=>{},setTimeout:fn=>tasks.push(fn),
    loadPlatformContext:async()=>{},resumeAppNavigationOnLoad:async()=>false,loadContext:async()=>{calls.loads++;window.document.querySelector('#app').innerHTML='<h1>Your club</h1>';},renderPlayerJoinRoute:async()=>{window.document.querySelector('#app').innerHTML='<h1>Join your club</h1>';},renderJoinByCode:async()=>{},
    supabase:{auth:{onAuthStateChange:fn=>{authListener=fn;},signInWithPassword:async()=>{calls.signIns++;return {data:{session:account}};},updateUser:async()=>{calls.saves++;authListener('USER_UPDATED',account);return {data:{user:account.user}};},resetPasswordForEmail:async()=>{calls.emails++;return {};}}}
  });
  vm.runInContext(between(source,'async function routeAuth(){','function authEntryLinks(){')+between(source,"function renderLogin(msg=''){",'async function continueWebsiteTrial('),c);
  vm.runInContext(between(source,'  supabase.auth.onAuthStateChange((event,s2)=>{','\n\n  // Preserve Market Discovery'),c);
  return {c,document:window.document,calls,emit:(event,s=account)=>authListener(event,s),flush:async()=>{while(tasks.length)await tasks.shift()();}};
}
const submit=form=>form.onsubmit({preventDefault(){},currentTarget:form});
for(const file of ['app.js','demo.html']){
  test(`${file}: stale setup bookmarks allow ordinary sign-in with the existing password`,async()=>{
    const {c,document,calls}=await setup(file,{url:'https://example.test/app.html?password_setup=1'});
    await c.routeAuth();assert.ok(document.querySelector('#passwordSignIn'));assert.equal(document.querySelector('#passwordResetForm'),null);
    document.querySelector('#email').value='player@example.test';document.querySelector('#password').value='existing-password';
    await submit(document.querySelector('#passwordSignIn'));
    assert.equal(calls.signIns,1);assert.equal(calls.saves,0);assert.equal(calls.emails,0);assert.equal(calls.loads,1);assert.equal(c.location.search,'');
    assert.equal(c.passwordFlow.activeFor(c.session),false);
  });
  test(`${file}: another tab's recovery event cannot open setup in the current app`,async()=>{
    const {c,document,calls,emit,flush}=await setup(file,{session:account});await c.routeAuth();
    emit('PASSWORD_RECOVERY');emit('SIGNED_IN');emit('TOKEN_REFRESHED');await flush();
    assert.equal(document.querySelector('h1').textContent,'Your club');assert.equal(calls.loads,1);assert.equal(calls.saves,0);
    emit('USER_UPDATED');await flush();assert.equal(document.querySelector('#savePasswordForm'),null);
  });
  test(`${file}: first password saves once; delayed recovery/update events do not reopen setup`,async()=>{
    const {c,document,calls,emit,flush}=await setup(file,{session:account,url:recovery});await c.routeAuth();
    assert.ok(document.querySelector('#savePasswordForm'));assert.equal(c.location.search,'');assert.equal(c.location.hash,'');
    document.querySelector('#newPassword').value='new-password';document.querySelector('#confirmPassword').value='new-password';
    await submit(document.querySelector('#savePasswordForm'));emit('PASSWORD_RECOVERY');emit('USER_UPDATED');emit('SIGNED_IN');await flush();
    assert.equal(calls.saves,1);assert.equal(calls.emails,0);assert.equal(document.querySelector('h1').textContent,'Your club');assert.equal(c.passwordFlow.activeFor(account),false);
  });
  test(`${file}: password completion keeps the invitation destination`,async()=>{
    const {c,document}=await setup(file,{session:account,url:recovery.replace('?password_setup','?player_join=invitation&password_setup')});await c.routeAuth();
    document.querySelector('#newPassword').value='new-password';document.querySelector('#confirmPassword').value='new-password';await submit(document.querySelector('#savePasswordForm'));
    assert.equal(document.querySelector('h1').textContent,'Join your club');assert.equal(new URL(c.location.href).searchParams.get('player_join'),'invitation');
  });
  test(`${file}: explicit account changes can be cancelled and never change the bookmark URL`,async()=>{
    const {c,document,calls}=await setup(file,{session:account});await c.openAccountPassword();assert.ok(document.querySelector('#savePasswordForm'));assert.equal(c.location.search,'');
    await document.querySelector('#cancelPassword').onclick();assert.equal(document.querySelector('h1').textContent,'Your club');assert.equal(calls.saves,0);
  });
  test(`${file}: expired links and expired sessions return to sign-in, not a compulsory reset`,async()=>{
    const {c,document,calls,emit,flush}=await setup(file,{url:recovery,error:{message:'Expired'}});await c.routeAuth();
    assert.ok(document.querySelector('#passwordSignIn'));assert.match(document.body.textContent,/existing password/);assert.equal(calls.emails,0);
    c.session=account;await c.openAccountPassword();emit('SIGNED_OUT',null);await flush();
    assert.ok(document.querySelector('#passwordSignIn'));assert.equal(document.querySelector('#passwordResetForm'),null);
  });
  test(`${file}: reset email is sent only on request and preserves the intended club route`,async()=>{
    const {c,document,calls}=await setup(file,{url:'https://example.test/app.html?club=sample-club&tab=teams'});await c.routeAuth();
    document.querySelector('#email').value='player@example.test';document.querySelector('#resetPassword').onclick();assert.match(document.querySelector('h1').textContent,/Reset/);assert.equal(calls.emails,0);
    let target;c.supabase.auth.resetPasswordForEmail=async(email,options)=>{calls.emails++;target=new URL(options.redirectTo);assert.equal(email,'player@example.test');return {};};
    await submit(document.querySelector('#passwordResetForm'));assert.equal(calls.emails,1);assert.equal(target.searchParams.get('password_setup'),'1');assert.equal(target.searchParams.get('club'),'sample-club');assert.equal(target.searchParams.get('tab'),'teams');
    document.querySelector('#backToSignIn').onclick();assert.ok(document.querySelector('#passwordSignIn'));document.querySelector('#firstPassword').onclick();assert.match(document.querySelector('h1').textContent,/first password/);
  });
  test(`${file}: failed saves remain retryable and an existing password need not be changed`,async()=>{
    const {c,document,calls}=await setup(file,{session:account,url:recovery});await c.routeAuth();
    document.querySelector('#newPassword').value='existing-password';document.querySelector('#confirmPassword').value='existing-password';
    c.supabase.auth.updateUser=async()=>({error:{code:'same_password',message:'New password must differ'}});await submit(document.querySelector('#savePasswordForm'));
    assert.match(document.querySelector('#passwordStatus').textContent,/already your current password/);assert.equal(document.querySelector('#savePassword').disabled,false);assert.equal(c.authActionInFlight,false);
    await document.querySelector('#cancelPassword').onclick();assert.equal(document.querySelector('h1').textContent,'Your club');assert.equal(calls.emails,0);
  });
  test(`${file}: an account change prevents submitting the previous account's password form`,async()=>{
    const {c,document,calls}=await setup(file,{session:account,url:recovery});await c.routeAuth();
    document.querySelector('#newPassword').value='new-password';document.querySelector('#confirmPassword').value='new-password';c.session={user:{id:'another-account'}};
    await submit(document.querySelector('#savePasswordForm'));assert.equal(calls.saves,0);assert.match(document.querySelector('#passwordStatus').textContent,/account changed/);
  });
}
