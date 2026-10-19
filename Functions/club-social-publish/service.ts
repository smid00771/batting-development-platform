// Club Batting .224. Credentials stay encrypted on the server; only reviewed posts are sent.
// No third-party runtime dependencies. Browser JWTs and the private runner secret are checked here.
type Env = Record<string,string|undefined>;
type Fetcher = typeof fetch;
export class PublicError extends Error { constructor(message:string,public status=400){super(message);} }
export class GraphError extends Error {
 constructor(public code:number,public ambiguous:boolean,public reconnect=false){
  super(reconnect?'Reconnect the club accounts, then retry the unposted destination.':code===10||code===200?'Meta has not granted permission to publish to this account. Reconnect with the required access.':code===4||code===17||code===32||code===613?'Meta’s posting limit was reached. Try again later.':'Meta could not complete this step. Check the account connection and try again.');
 }
}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const id=(v:unknown)=>typeof v==='string'&&/^[0-9_]+$/.test(v);
const bytes=(v:string)=>new TextEncoder().encode(v);
export async function sha256(v:string|Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(typeof v==='string'?bytes(v):v)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function b64(v:Uint8Array){let s='';for(let i=0;i<v.length;i+=8192)s+=String.fromCharCode(...v.subarray(i,i+8192));return btoa(s);}
function unb64(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function encryptionKey(secret:string){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes('club-batting-social-credentials-v1\0'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(value:unknown,secret:string,context:string){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(secret),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:bytes(context)},key,bytes(JSON.stringify(value)));return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(cipher));}
export async function unseal(value:string,secret:string,context:string){const [version,iv,cipher]=value.split('.');if(version!=='v1')throw new PublicError('Reconnect the club accounts.',409);try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:bytes(context)},await encryptionKey(secret),unb64(cipher))));}catch{throw new PublicError('Reconnect the club accounts.',409);}}
async function proof(token:string,secret:string){const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(token)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function safeLink(platform:string,url:unknown){try{const u=new URL(String(url));if(u.protocol!=='https:'||u.username||u.password)return null;const hosts=platform==='facebook'?['facebook.com','www.facebook.com']:['instagram.com','www.instagram.com'];return hosts.includes(u.hostname)?u.href:null;}catch{return null;}}
export function failureState(finalStarted:boolean,error:unknown){return finalStarted&&(!(error instanceof GraphError)||error.ambiguous)?'uncertain':'failed';}
export function createService(env:Env,fetcher:Fetcher=fetch){
 const url=env.SUPABASE_URL||'',serviceKey=env.SUPABASE_SERVICE_ROLE_KEY||'',anon=env.SUPABASE_ANON_KEY||'';
 const secret=env.META_APP_SECRET||'',appId=env.META_APP_ID||'',version=env.META_GRAPH_VERSION||'v26.0';
 const redirect=env.META_REDIRECT_URI||'https://clubbatting.com/social-connect.html';
 const allowed=(env.SOCIAL_ALLOWED_ORIGINS||'https://clubbatting.com,https://www.clubbatting.com').split(',').map(s=>s.trim());
 const configured=!!(secret&&appId&&/^v\d+\.\d+$/.test(version)&&/^https:\/\//.test(redirect));
 const dbHeaders=(token:string)=>({apikey:token===serviceKey?serviceKey:anon,Authorization:'Bearer '+token,'Content-Type':'application/json'});
 async function rpc(name:string,body:unknown,token=serviceKey){const r=await fetcher(url+'/rest/v1/rpc/'+name,{method:'POST',headers:dbHeaders(token),body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});const v=await r.json().catch(()=>null);if(!r.ok)throw new PublicError(v?.message||'Could not confirm this posting request.',r.status===401?401:409);return v;}
 const worker=(action:string,data:any={})=>rpc('club_socials_publish_worker',{p_action:action,p_data:data});
 const userRpc=(token:string,c:string,action:string,data:any={})=>rpc('club_socials_publish_api',{p_club_id:c,p_action:action,p_data:data},token);
 async function connectionHealth(c:any){
  const health:any={checked_at:new Date().toISOString(),facebook:{state:'not_connected',message:'Connect your club Facebook Page.'},instagram:{state:'not_connected',message:'Instagram is optional. Link a professional Instagram account to your Facebook Page to add it.'}};
  if(!c||c.status==='disconnected')return health;
  if(c.status==='reconnect'){for(const p of ['facebook','instagram'])if(p==='facebook'||c.instagram_id)health[p]={state:'reconnect',message:'Sign in to Facebook again to restore the connection.'};return health;}
  try{
   const {page_token:token}=await unseal(c.credential,secret,'club:'+c.club_id);
   const check=await graph('debug_token',appId+'|'+secret,{input_token:token});
   const d=check.data,now=Math.floor(Date.now()/1000),scopes=new Set(d?.scopes||[]);
   if(!d?.is_valid||String(d.app_id)!==appId||(d.profile_id&&String(d.profile_id)!==c.page_id)||(d.expires_at&&d.expires_at<=now)||(d.data_access_expires_at&&d.data_access_expires_at<=now))throw new PublicError('Sign in to Facebook again to restore the connection.',409);
   const fb=['pages_read_engagement','pages_manage_posts'].every(permission=>{const grant=(d.granular_scopes||[]).find((v:any)=>v.scope===permission);return scopes.has(permission)&&(!grant?.target_ids||grant.target_ids.map(String).includes(c.page_id));});
   const page=await graph(c.page_id,token,{fields:'id,name'+(scopes.has('instagram_basic')?',instagram_business_account{id,username}':'')});
   if(page.id!==c.page_id)throw new PublicError('Choose your club Facebook Page again.',409);
   health.facebook={state:fb?'ready':'reconnect',name:page.name,message:fb?'Publishing permission checked.':'Reconnect and allow Club Batting to publish to this Page.'};
   if(c.instagram_id){
    const ig=page.instagram_business_account,igPermission=['instagram_basic','instagram_content_publish','pages_read_engagement'].every(p=>scopes.has(p));
    health.instagram={state:ig?.id===c.instagram_id&&igPermission?'ready':'reconnect',name:ig?.id===c.instagram_id?ig.username:c.instagram_name,message:!igPermission?'Reconnect and allow Instagram publishing.':ig?.id!==c.instagram_id?'The linked Instagram account changed. Reconnect to confirm the account.':'Linked account and publishing permission checked.'};
   }else if(page.instagram_business_account){health.instagram={state:'available',name:page.instagram_business_account.username,message:'Instagram is linked now. Reconnect to add it to Club Batting.'};}
  }catch(e){
   const reconnect=e instanceof PublicError||(e instanceof GraphError&&(e.reconnect||e.code===10||e.code===200));
   for(const platform of ['facebook','instagram'])if(platform==='facebook'||c.instagram_id)health[platform]={state:reconnect?'reconnect':'unavailable',message:reconnect?(e instanceof PublicError?e.message:'Reconnect and allow Club Batting to use the club accounts.'):'The check could not finish. Try Check connection again.'};
  }
  return health;
 }
 async function graph(path:string,token:string,params:Record<string,any>={},method='GET'){
  if(!/^[a-zA-Z0-9_/-]+$/.test(path))throw new PublicError('Invalid account request.');
  const u=new URL('https://graph.facebook.com/'+version+'/'+path),values=new URLSearchParams();
  for(const [k,v] of Object.entries(params))values.set(k,typeof v==='string'?v:JSON.stringify(v));
  values.set('appsecret_proof',await proof(token,secret));
  if(method==='GET')u.search=values.toString();
  let r:Response;try{r=await fetcher(u,{method,headers:{Authorization:'Bearer '+token,...(method==='GET'?{}:{'Content-Type':'application/x-www-form-urlencoded'})},...(method==='GET'?{}:{body:values.toString()}),signal:AbortSignal.timeout(18000)});}catch{throw new GraphError(0,true);}
  const v=await r.json().catch(()=>null);if(!r.ok||v?.error||!v)throw new GraphError(Number(v?.error?.code)||0,r.status>=500||!v,Number(v?.error?.code)===190);
  return v;
 }
 async function oauth(params:Record<string,string>){const u=new URL('https://graph.facebook.com/'+version+'/oauth/access_token');u.search=new URLSearchParams(params).toString();const r=await fetcher(u,{signal:AbortSignal.timeout(18000)});const v=await r.json().catch(()=>null);if(!r.ok||!v?.access_token)throw new PublicError('Meta sign-in could not finish. Start Connect accounts again.',409);return v;}
 async function authenticate(req:Request){const auth=req.headers.get('authorization')||'';if(!auth.startsWith('Bearer ')||auth.slice(7)===serviceKey)throw new PublicError('Sign in to Club Batting first.',401);const token=auth.slice(7);const r=await fetcher(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:auth},signal:AbortSignal.timeout(12000)});const user=await r.json().catch(()=>null);if(!r.ok||!uuid(user?.id))throw new PublicError('Your session expired. Sign in again.',401);return {token,user};}
 async function asset(path:string){const r=await fetcher(url+'/storage/v1/object/authenticated/club-social-posts/'+path,{headers:dbHeaders(serviceKey),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new PublicError('A prepared image is unavailable. Open the review again.',409);return new Uint8Array(await r.arrayBuffer());}
 async function imageURL(path:string){const r=await fetcher(url+'/storage/v1/object/sign/club-social-posts/'+path,{method:'POST',headers:dbHeaders(serviceKey),body:JSON.stringify({expiresIn:7200}),signal:AbortSignal.timeout(12000)});const v=await r.json().catch(()=>null);if(!r.ok||!v?.signedURL)throw new PublicError('A prepared image could not be loaded.',409);return url+'/storage/v1'+v.signedURL;}
 async function runDestination(j:string,platform:string){
  const claim=await worker('claim',{id:j,platform});if(!claim)return;
  const {post:p,destination:d,connection:c}=claim;let finalStarted=false;const key={id:j,platform,lease:d.lease};let cp={...d.checkpoint};const deadline=Date.now()+42000;
  const save=async()=>worker('checkpoint',{...key,checkpoint:cp});
  const release=async()=>worker('yield',key);
  try{
   if(!configured)throw new PublicError('Social publishing setup is not finished yet.',503);
   const credential=await unseal(c.credential,secret,'club:'+p.club_id),token=credential.page_token;
   if(!token)throw new PublicError('Reconnect the club accounts.',409);
   if(!cp.checked){for(const img of p.images){const data=await asset(img.path);if(data.length!==img.bytes||data[0]!==255||data[1]!==216||data[2]!==255||await sha256(data)!==img.sha256)throw new PublicError('A prepared image changed. Refresh and review the graphics again.',409);}cp.checked=true;await save();}
   if(platform==='facebook'){
    cp.photos||=[];
    while(cp.photos.length<p.images.length){
     if(Date.now()>deadline){await release();return;}
     const image=p.images[cp.photos.length],v=await graph(c.page_id+'/photos',token,{url:await imageURL(image.path),published:'false',alt_text_custom:image.label},'POST');
     if(!id(v.id))throw new GraphError(0,true);cp.photos.push(v.id);await save();
    }
    await worker('before_publish',key);finalStarted=true;
    const v=await graph(c.page_id+'/feed',token,{message:p.caption,attached_media:cp.photos.map((photo:string)=>({media_fbid:photo}))},'POST');
    if(!id(v.id))throw new GraphError(0,true);
    // Persist the receipt immediately, before optional permalink lookup.
    const parts=v.id.split('_'),link=parts.length===2?'https://www.facebook.com/'+parts[0]+'/posts/'+parts[1]:'https://www.facebook.com/'+v.id;
    await worker('complete',{...key,remote_id:v.id,permalink:link});
   }else{
    cp.children||=[];
    while(cp.children.length<p.images.length){
     if(Date.now()>deadline){await release();return;}
     const image=p.images[cp.children.length],params:any={image_url:await imageURL(image.path),alt_text:image.label};
     if(p.images.length>1)params.is_carousel_item='true';else params.caption=p.caption;
     const v=await graph(c.instagram_id+'/media',token,params,'POST');if(!id(v.id))throw new GraphError(0,true);cp.children.push(v.id);await save();
    }
    // Instagram may still be fetching each image. Save progress and let the next run check.
    for(const child of cp.children){const status=await graph(child,token,{fields:'status_code'});if(['ERROR','EXPIRED'].includes(status.status_code))throw new PublicError('Instagram could not prepare an image. Reconnect or retry the unposted destination.',409);if(status.status_code!=='FINISHED'){if(status.status_code==='PUBLISHED')throw new GraphError(0,true);await release();return;}}
    if(!cp.container){
     if(p.images.length===1)cp.container=cp.children[0];else{const v=await graph(c.instagram_id+'/media',token,{media_type:'CAROUSEL',children:cp.children.join(','),caption:p.caption},'POST');if(!id(v.id))throw new GraphError(0,true);cp.container=v.id;}
     await save();
    }
    const state=await graph(cp.container,token,{fields:'status_code'});if(['ERROR','EXPIRED'].includes(state.status_code))throw new PublicError('Instagram could not prepare this post. Retry the unposted destination.',409);if(state.status_code!=='FINISHED'){await release();return;}
    await worker('before_publish',key);finalStarted=true;
    const v=await graph(c.instagram_id+'/media_publish',token,{creation_id:cp.container},'POST');if(!id(v.id))throw new GraphError(0,true);
    // The media ID is the durable success receipt even if the subsequent link lookup fails.
    await worker('complete',{...key,remote_id:v.id,permalink:null});
    try{const media=await graph(v.id,token,{fields:'permalink'}),link=safeLink('instagram',media.permalink);if(link)await worker('link',{...key,remote_id:v.id,permalink:link});}catch{}
   }
  }catch(error){
   const state=failureState(finalStarted,error),message=state==='uncertain'?'Meta did not confirm the result. Check this account before posting again.':error instanceof PublicError||error instanceof GraphError?error.message:'Could not complete this step. Retry the unposted destination.';
   try{await worker('fail',{...key,state,message,reconnect:error instanceof GraphError&&error.reconnect});}catch{/* Lease expiry recovers pre-send work and flags ambiguous final sends. */}
  }
 }
 async function drain(){const queue=await worker('queue');await Promise.allSettled(queue.map((q:any)=>runDestination(q.id,q.platform)));}
 function background(work:Promise<unknown>){const runtime=(globalThis as any).EdgeRuntime;if(runtime?.waitUntil)runtime.waitUntil(work.catch(()=>{}));else void work.catch(()=>{});}
 async function signedMeta(req:Request){
  if(!secret)throw new PublicError('Connection setup is not ready.',503);
  const form=await req.formData(),signed=String(form.get('signed_request')||''),[signature,payload]=signed.split('.');if(!signature||!payload||signed.length>16000)throw new PublicError('Invalid Meta request.',401);
  const decode=(s:string)=>unb64(s.replace(/-/g,'+').replace(/_/g,'/'));
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,decode(signature),bytes(payload)))throw new PublicError('Invalid Meta request.',401);
  const data=JSON.parse(new TextDecoder().decode(decode(payload)));if(data.algorithm?.toUpperCase()!=='HMAC-SHA256'||!id(data.user_id))throw new PublicError('Invalid Meta request.',401);
  await worker('revoke',{meta_user_id:data.user_id});const code=crypto.randomUUID(),receipt=await seal({confirmation_code:code,completed:true},secret,'deletion-receipt');return {url:new URL('social-connect.html?deletion='+encodeURIComponent(receipt),redirect).href,confirmation_code:code};
 }
 async function handle(req:Request):Promise<Response>{
  const origin=req.headers.get('origin')||'',cors={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS',Vary:'Origin'};
  const response=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   if(req.method!=='POST')throw new PublicError('Use POST.',405);
   if(Number(req.headers.get('content-length')||0)>40000)throw new PublicError('Request too large.',413);
   const callback=new URL(req.url).searchParams.get('callback');if(callback==='deauthorize'||callback==='data_deletion')return response(await signedMeta(req));
   const raw=await req.text();if(raw.length>40000)throw new PublicError('Request too large.',413);let body:any;try{body=JSON.parse(raw);}catch{throw new PublicError('Invalid request.');}
   if(body.action==='deletion_status'){
    if(typeof body.receipt!=='string'||body.receipt.length>2000)throw new PublicError('Invalid deletion confirmation.');
    try{return response(await unseal(body.receipt,secret,'deletion-receipt'));}catch{throw new PublicError('This deletion confirmation could not be verified.',404);}
   }
   if(body.action==='tick'){
    await worker('cron',{secret:req.headers.get('x-social-runner')||''});background(drain());return response({accepted:true});
   }
   if(origin&&!allowed.includes(origin))throw new PublicError('Open Club Batting at its normal web address.',403);
   const {user,token}=await authenticate(req);
   if(body.action==='platform_status'){
    if(await rpc('get_my_platform_role',{},token)!=='owner')throw new PublicError('Platform Owner access required.',403);
    let app:any=null,check='not_configured';
    if(configured){try{const value=await graph(appId,appId+'|'+secret,{fields:'id,name'});if(String(value.id)!==appId)throw new PublicError('Meta app details did not match.');app={id:appId,name:value.name};check='verified';}catch(e){check=e instanceof GraphError&&e.ambiguous?'unavailable':'needs_attention';}}
    const project=new URL(url).hostname.split('.')[0];
    return response({configured,app,check,checked_at:new Date().toISOString(),setup:{redirect_uri:redirect,deauthorize_url:url+'/functions/v1/club-social-publish?callback=deauthorize',deletion_url:url+'/functions/v1/club-social-publish?callback=data_deletion',secure_settings_url:'https://supabase.com/dashboard/project/'+project+'/functions/secrets'},review_status:'not_verified'});
   }
   if(body.action==='oauth_complete'){
    if(!configured)throw new PublicError('Social publishing setup is not finished yet.',503);
    if(typeof body.state!=='string'||body.state.length>200||typeof body.code!=='string'||body.code.length>6000)throw new PublicError('Invalid Meta sign-in.');
    const st=await worker('oauth_claim',{state_hash:await sha256(body.state),user_id:user.id});
    const short=await oauth({client_id:appId,client_secret:secret,redirect_uri:redirect,code:body.code});
    const long=await oauth({grant_type:'fb_exchange_token',client_id:appId,client_secret:secret,fb_exchange_token:short.access_token});
    const identity=await graph('me',long.access_token,{fields:'id'});
    const permissions=await graph('me/permissions',long.access_token),granted=new Set((permissions.data||[]).filter((p:any)=>p.status==='granted').map((p:any)=>p.permission));
    if(!['pages_show_list','pages_read_engagement','pages_manage_posts'].every(p=>granted.has(p)))throw new PublicError('Allow access to list the club Page and publish posts, then reconnect.',409);
    const hasIG=granted.has('instagram_basic')&&granted.has('instagram_content_publish');
    const pages:any[]=[];let after='';
    for(let n=0;n<10;n++){
     const list=await graph('me/accounts',long.access_token,{fields:'id,name,access_token,tasks'+(hasIG?',instagram_business_account{id,username}':''),limit:'100',...(after?{after}:{})});
     for(const p of list.data||[])if(id(p.id)&&p.access_token&&(p.tasks||[]).some((v:string)=>['CREATE_CONTENT','MANAGE'].includes(v)))pages.push(p);
     if(!list.paging?.next)break;after=list.paging?.cursors?.after;if(!after)break;
    }
    if(!pages.length)throw new PublicError(granted.has('business_management')?'No Page with publishing access was returned. Reconnect and select the club’s business and Page.':'Reconnect and allow access to the business that owns the club Page.',409);
    await worker('oauth_pages',{id:st.id,user_id:user.id,meta_user_id:identity.id,encrypted_pages:await seal(pages,secret,'oauth:'+st.id)});
    return response({id:st.id,pages:pages.map(p=>({id:p.id,name:p.name,instagram_name:p.instagram_business_account?.username||null})),instagram_permission:hasIG});
   }
   if(body.action==='choose_page'){
    if(!uuid(body.id)||!id(body.page_id))throw new PublicError('Choose the club Page.');
    const st=await worker('oauth_select',{id:body.id,user_id:user.id}),pages=await unseal(st.encrypted_pages,secret,'oauth:'+st.id),page=pages.find((p:any)=>p.id===body.page_id);
    if(!page)throw new PublicError('Choose a Page returned by Meta.');
    const checked=await graph(page.id,page.access_token,{fields:'id,name'});if(checked.id!==page.id)throw new PublicError('Meta could not confirm the Page.');
    const v=await worker('connect',{id:st.id,user_id:user.id,page_id:page.id,page_name:page.name,instagram_id:page.instagram_business_account?.id||null,instagram_name:page.instagram_business_account?.username||null,credential:await seal({page_token:page.access_token},secret,'club:'+st.club_id)});
    return response({connected:true,...v});
   }
   if(!uuid(body.club_id))throw new PublicError('Choose a club.');
   if(body.action==='status')return response({configured,...await userRpc(token,body.club_id,'context')});
   if(body.action==='check_connection'){
    const context=await userRpc(token,body.club_id,'context');
    if(!configured)return response({configured:false,...context,health:null});
    const connection=await rpc('club_socials_connection_check',{p_club_id:body.club_id,p_user_id:user.id});
    const health=await connectionHealth(connection);
    // Account changes during the read-only check invalidate its result.
    const latest=await userRpc(token,body.club_id,'context');
    if(latest.connection?.revision!==context.connection?.revision||latest.connection?.status!==context.connection?.status)throw new PublicError('The club connection changed. Check it again.',409);
    return response({configured:true,...latest,health});
   }
   if(body.action==='connect'){
    await userRpc(token,body.club_id,'connection_access');if(!configured)throw new PublicError('Social publishing setup is not finished yet. Club Batting needs its Meta connection activated.',503);
    let returnURL:URL;try{returnURL=new URL(body.return_url);}catch{throw new PublicError('Open the club app and try connecting again.');}
    if(!allowed.includes(returnURL.origin)||!returnURL.pathname.endsWith('/app.html'))throw new PublicError('Open the club app and try connecting again.');
    if(returnURL.origin!==new URL(redirect).origin)throw new PublicError('To connect accounts, open '+new URL('app.html',redirect).href+' and sign in there.',409);
    const state=b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    await worker('oauth_start',{club_id:body.club_id,user_id:user.id,state_hash:await sha256(state),return_url:returnURL.href});
    const u=new URL('https://www.facebook.com/'+version+'/dialog/oauth');u.search=new URLSearchParams({client_id:appId,redirect_uri:redirect,state,response_type:'code',scope:'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management',auth_type:'rerequest'}).toString();
    return response({url:u.href});
   }
   if(body.action==='publish'||body.action==='retry'){
    if(!configured)throw new PublicError('Social publishing setup is not finished yet.',503);
    const post=await userRpc(token,body.club_id,body.action==='publish'?'approve':'retry',body.data||{});
    background(drain());return response({post});
   }
   throw new PublicError('Unknown publishing action.');
  }catch(error){return response({error:error instanceof PublicError||error instanceof GraphError?error.message:'The publishing service could not complete this request. Check Posting history before retrying.'},error instanceof PublicError?error.status:502);}
 }
 return {handle,runDestination,drain,graph};
}
