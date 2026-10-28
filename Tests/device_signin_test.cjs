const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createClient,isAuthRetryableFetchError,AuthRetryableFetchError}=require('@supabase/supabase-js');
const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const restoreSource=section('async function restoreDeviceSignIn(){','async function boot(){');
function restore(auth){const c={supabase:{auth},isAuthRetryableFetchError};vm.runInNewContext(restoreSource,c);return c.restoreDeviceSignIn();}
let liveOptions;
vm.runInNewContext(source.match(/^const supabase=createClient\([^\n]+$/m)[0],{SUPABASE_URL:'https://device-signin.example.test',SUPABASE_ANON_KEY:'fictional-public-key',createClient:(url,key,options)=>{liveOptions=JSON.parse(JSON.stringify(options));}});
function storage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};}
function fixture(t){
 const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'player@example.test',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const requests=[],active=new Set(),refreshes=new Map(),tokens=new Map(),clients=[];let serial=0;
 function issue(id){const exp=Math.floor(Date.now()/1000)+3600,access=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp,iat:exp-3600,session_id:id},'fictional-signature'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.'),refresh='fictional-refresh-'+(++serial);active.add(id);tokens.set(access,id);refreshes.set(refresh,id);return {access_token:access,refresh_token:refresh,token_type:'bearer',expires_in:3600,expires_at:exp,user};}
 const fetch=async(input,options={})=>{
  const url=new URL(input),body=options.body?JSON.parse(options.body):{},headers=new Headers(options.headers);requests.push({path:url.pathname,grant:url.searchParams.get('grant_type'),scope:url.searchParams.get('scope')});
  if(url.pathname.endsWith('/token')){
   const id=url.searchParams.get('grant_type')==='password'?'device-'+(++serial):refreshes.get(body.refresh_token);
   if(!id||url.searchParams.get('grant_type')==='refresh_token'&&!active.has(id))return Response.json({code:'refresh_token_not_found',msg:'Session revoked'},{status:400});
   return Response.json(issue(id));
  }
  if(url.pathname.endsWith('/logout')){const id=tokens.get(headers.get('authorization')?.replace(/^Bearer /,''));if(url.searchParams.get('scope')==='local')active.delete(id);else active.clear();return new Response(null,{status:204});}
  throw Error('Unexpected auth request: '+url.pathname);
 };
 const client=s=>{const c=createClient('https://device-signin.example.test','fictional-public-key',{...liveOptions,global:{fetch},auth:{...liveOptions.auth,storage:s}});clients.push(c);return c;};
 t.after(async()=>{for(const c of clients)await c.auth.stopAutoRefresh();});
 const signIn=async c=>{const r=await c.auth.signInWithPassword({email:user.email,password:'fictional-test-password'});assert.equal(r.error,null);return r.data.session;};
 const expire=s=>{const key=[...s.data.keys()].find(k=>k.endsWith('-auth-token'));assert.ok(key);const v=JSON.parse(s.data.get(key));v.expires_at=Math.floor(Date.now()/1000)-60;s.setItem(key,JSON.stringify(v));};
 return {requests,client,signIn,expire,user,active};
}
test('a new app instance restores this device without another password request',async t=>{
 const f=fixture(t),saved=storage(),first=f.client(saved);await f.signIn(first);await first.auth.stopAutoRefresh();
 assert.equal(liveOptions.auth.persistSession,true);assert.equal(liveOptions.auth.autoRefreshToken,true);assert.equal(liveOptions.auth.storageKey,undefined,'Retain the SDK’s existing storage key');
 const reopened=f.client(saved),result=await restore(reopened.auth);assert.equal(result.session.user.id,f.user.id);
 assert.equal(f.requests.filter(r=>r.grant==='password').length,1);assert.equal(f.requests.filter(r=>r.grant==='refresh_token').length,0);
 assert.equal([...saved.data.values()].some(v=>v.includes('fictional-test-password')),false,'The password itself is never persisted');
});
test('returning after access-token expiry refreshes the saved session without a password',async t=>{
 const f=fixture(t),saved=storage(),first=f.client(saved);await f.signIn(first);await first.auth.stopAutoRefresh();f.expire(saved);
 const reopened=f.client(saved),result=await restore(reopened.auth);assert.equal(result.session.user.id,f.user.id);assert.ok(result.session.expires_at*1000>Date.now());
 assert.equal(f.requests.filter(r=>r.grant==='password').length,1);assert.equal(f.requests.filter(r=>r.grant==='refresh_token').length,1);
 f.expire(saved);assert.equal((await reopened.auth.getSession()).data.session.user.id,f.user.id);assert.equal(f.requests.filter(r=>r.grant==='password').length,1);
});
test('ordinary app sign-out clears this device while another device can still refresh',async t=>{
 const f=fixture(t),firstStorage=storage(),otherStorage=storage(),first=f.client(firstStorage),other=f.client(otherStorage);const firstSession=await f.signIn(first);await f.signIn(other);
 const messages=[],c={phoneIsDemo:()=>false,phoneRegistration:null,navigator:{},supabase:first,session:firstSession,club:{id:'fictional-club'},phoneWorkerMessage:async x=>messages.push(x),mirelionAssist:{reset:()=>{}},clubMessageState:{},clubMessageUnread:1};
 vm.runInNewContext(section('async function signOutClubBatting(){','async function openPhoneApp('),c);assert.equal((await c.signOutClubBatting()).error,null);
 assert.equal(f.requests.find(r=>r.path.endsWith('/logout')).scope,'local');assert.equal((await first.auth.getSession()).data.session,null);
 f.expire(otherStorage);assert.equal((await restore(other.auth)).session.user.id,f.user.id);assert.equal(f.requests.filter(r=>r.grant==='password').length,2);assert.deepEqual(messages,['CB_SIGN_OUT']);
});
test('a genuinely revoked saved session returns to sign-in rather than bypassing revocation',async t=>{
 const f=fixture(t),saved=storage(),first=f.client(saved);await f.signIn(first);await first.auth.stopAutoRefresh();f.active.clear();f.expire(saved);
 assert.equal((await restore(f.client(saved).auth)).session,null);assert.equal([...saved.data.keys()].some(k=>k.endsWith('-auth-token')),false);
});
test('connection errors during restoration propagate to startup retry, without sign-out',async()=>{
 const failure=new AuthRetryableFetchError('Connection unavailable',0);
 for(const mode of ['read','initialise']){
  const auth={initialize:async()=>({error:mode==='initialise'?failure:null}),getSession:async()=>({data:{session:null},error:mode==='read'?failure:null}),signOut:()=>assert.fail('Do not remove a saved session after a connection failure')};
  await assert.rejects(restore(auth),error=>error===failure);
 }
 let routes=0,subscriptions=0;const c={legacyAppRedirect:()=>null,location:{href:'https://example.test/app.html'},initialisePhoneApp:()=>{},document:{},restoreDeviceSignIn:async()=>{throw failure;},routeAuth:()=>routes++,supabase:{auth:{onAuthStateChange:()=>subscriptions++}}};
 vm.runInNewContext(section('async function boot(){','function redirectUrl(){'),c);await assert.rejects(c.boot(),error=>error===failure);assert.equal(routes,0);assert.equal(subscriptions,0);
});
test('invalid password links remain available to the existing recovery explanation',async()=>{
 const error={code:'otp_expired',message:'Expired link'},result=await restore({initialize:async()=>({error}),getSession:async()=>({data:{session:null},error:null})});
 assert.equal(result.session,null);assert.equal(result.authLinkError,error);
});
test('the live SDK version matches the exact SDK used by session integration tests',()=>{
 const version=require('@supabase/supabase-js/package.json').version;assert.ok(source.includes('@supabase/supabase-js@'+version+'/+esm'));
 assert.equal(require('../package.json').devDependencies['@supabase/supabase-js'],version);
});
