/* One-time Club Batting setup. This screen is only mounted for the Platform Owner. */
export async function renderSocialPlatformSetup({supabase,host,escape:esc}){
 if(!host)return;
 const style='<style>.sp-owner{background:white;border:1px solid #dce2ee;border-radius:14px;padding:22px;margin:20px 0;max-width:100%;box-sizing:border-box}.sp-owner h2{margin-top:0}.sp-owner p{line-height:1.5}.sp-owner details{border-top:1px solid #dce2ee;padding:16px 0}.sp-owner summary{cursor:pointer;font-weight:700}.sp-owner details p{max-width:760px}.sp-owner .sp-copy{display:flex;align-items:center;gap:8px;margin:9px 0;flex-wrap:wrap}.sp-owner .sp-copy input{box-sizing:border-box;min-width:120px;flex:1;padding:10px;border:1px solid #bbc7d7;border-radius:6px;font:inherit}.sp-owner .sp-copy label{flex-basis:100%;font-weight:600;font-size:13px}.sp-owner .sp-owner-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:18px 0}.sp-owner .sp-owner-note{background:#eef3fa;padding:14px;border-radius:9px}.sp-owner .sp-owner-status{font-weight:700}.sp-owner small{color:#52627a}.sp-owner [hidden]{display:none!important}@media(max-width:600px){.sp-owner{padding:16px}.sp-owner .sp-owner-actions .btn{width:100%;box-sizing:border-box;text-align:center}}</style>';
 let data=null,busy=false,error='';
 const copyField=(key,label,value)=>`<div class="sp-copy"><label for="${key}">${label}</label><input id="${key}" readonly value="${esc(value||'')}" aria-label="${label}"><button class="btn ghost" type="button" data-sp-copy="${key}">Copy</button></div>`;
 const draw=()=>{
  if(!host.isConnected)return;
  const verified=data?.check==='verified',setup=data?.setup;
  host.innerHTML=style+`<section class="sp-owner"><div class="section-label">Set up once for all clubs</div><h2>Facebook & Instagram posting</h2><p>Club Batting needs one shared Meta app. Once it is activated, each club simply signs in to Facebook, chooses its Page and allows access.</p>
   <div class="sp-owner-note"><p class="sp-owner-status" role="status">${busy?'Checking Club Batting’s setup…':verified?'App details checked — '+esc(data.app?.name||'Club Batting'):data?.check==='needs_attention'?'The saved Meta app details need attention.':data?.check==='unavailable'?'Meta could not be checked just now.':'One-time Club Batting activation is still needed.'}</p><small>This check verifies the saved app details. Meta approval and the first live post still need to be confirmed.</small></div>
   ${error?`<p role="alert">${esc(error)}</p>`:''}
   <div class="sp-owner-actions"><button class="btn secondary" id="spOwnerCheck" ${busy?'disabled':''}>Check setup automatically</button>${verified?'<a class="btn ghost" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Open Meta app dashboard ↗</a>':'<a class="btn ghost" href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Start in Meta ↗</a>'}</div>
   <details ${!verified?'open':''}><summary>1. Create Club Batting’s Meta app</summary><p>Choose <strong>Start in Meta</strong>, sign in with the account that will own Club Batting’s connection, and create an app called <strong>Club Batting</strong>. It needs Facebook Page publishing and Instagram publishing with Facebook Login.</p><p>This is the setup for Club Batting itself. Other clubs will use the connection you create here.</p><p><small>Meta may ask for business details or identity checks. Complete those in Meta using the actual Club Batting owner’s information.</small></p></details>
   <details ${data?.configured&&!verified?'open':''}><summary>2. Add the app’s two details</summary><p>In Meta’s app settings, find <strong>App ID</strong> and <strong>App Secret</strong>. Use <strong>Open secure settings</strong> below to save those two values with these names. Then return here and choose <strong>Check setup automatically</strong>.</p>
    ${setup?copyField('spOwnerAppId','Name for App ID','META_APP_ID')+copyField('spOwnerSecretName','Name for App Secret','META_APP_SECRET')+`<div class="sp-owner-actions"><a class="btn secondary" href="${esc(setup.secure_settings_url)}" target="_blank" rel="noopener noreferrer">Open secure settings ↗</a></div>`:'<p>Choose Check setup automatically to load the secure settings link.</p>'}
    <small>Enter the secret in secure settings. This screen does not collect or display it.</small>
   </details>
   <details ${verified?'open':''}><summary>3. Finish Meta’s approval and try one club</summary><p>Meta will ask where to return people after sign-in. Copy the return address below into its valid OAuth redirect setting. The other two addresses are for disconnecting and deleting connection data.</p>
    ${setup?copyField('spOwnerReturn','Return address after Facebook sign-in',setup.redirect_uri)+copyField('spOwnerDeauthorize','Deauthorize callback',setup.deauthorize_url)+copyField('spOwnerDeletion','Data deletion callback',setup.deletion_url):'<p>Choose Check setup automatically to load these addresses.</p>'}
    <p>For other clubs to connect, complete Meta’s review for the requested publishing access and any business verification it asks for. Meta makes that approval decision.</p>
    <details><summary>Permissions Meta asks about</summary><p>These are the permissions used to find a club’s accounts and publish approved team posts.</p>${copyField('spOwnerPermissions','Required permissions','pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish')}</details>
    <p>Once Meta allows the intended users, connect one club through <strong>Social graphics → Social accounts</strong>. Review a real team announcement and post it only when you are ready for it to be public. Connecting accounts alone never sends a post.</p>
   </details>
   <p id="spOwnerCopyStatus" role="status" aria-live="polite"></p>
  </section>`;
  host.querySelector('#spOwnerCheck').onclick=check;
  host.querySelectorAll('[data-sp-copy]').forEach(button=>button.onclick=async()=>{const field=host.querySelector('#'+button.dataset.spCopy),status=host.querySelector('#spOwnerCopyStatus');try{await navigator.clipboard.writeText(field.value);status.textContent=field.getAttribute('aria-label')+' copied.';}catch{field.focus();field.select();status.textContent='The value is selected. Use Copy on your device.';}});
 };
 async function check(){
  if(busy)return;busy=true;error='';draw();
  try{const result=await supabase.functions.invoke('club-social-publish',{body:{action:'platform_status'}});if(result.error||result.data?.error)throw Error(result.data?.error||'The setup check could not finish. Try again.');data=result.data;}catch(e){error=e.message;}finally{busy=false;draw();}
 }
 await check();
}
