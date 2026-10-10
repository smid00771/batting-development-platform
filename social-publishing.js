/* Club Batting .144 — guided account connection; artwork renderer remains .143. */
export function createSocialPublishing(h){
 const {supabase}=h,esc=h.escape,demo=!!h.demo;
 const css=`<style>.sp-panel{margin:18px 0;padding:18px;border:1px solid #dce2ee;border-radius:12px;background:#f7f9fd}.sp-panel h3{margin:0 0 8px}.sp-panel p{line-height:1.5}.sp-preview{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:20px 0}.sp-preview figure{margin:0;max-width:360px}.sp-preview img{display:block;width:100%;border-radius:8px}.sp-preview figcaption{font-size:13px;margin-top:7px}#socialContent .sp-caption{box-sizing:border-box;width:100%;min-height:160px;font:inherit;padding:12px;line-height:1.5}.sp-target{display:flex;align-items:center;gap:10px;margin:12px 0}.sp-target input{width:20px;height:20px}.sp-count{font-size:13px;color:#52627a}.sp-result{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid #dce2ee;flex-wrap:wrap}.sp-result p{margin:4px 0}.sp-result small{display:block;max-width:600px}.sp-success{color:#11633d}.sp-warning{color:#875000}.sp-history{margin:20px 0}.sp-history summary{font-weight:700;cursor:pointer}.sp-live{white-space:pre-wrap;line-height:1.5}.sp-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.sp-caption-count-over{color:#a12121}@media(max-width:600px){.sp-preview{grid-template-columns:minmax(0,1fr)}.sp-preview figure{max-width:none}.sp-panel{padding:14px}.sp-panel .social-actions .btn{width:100%}}</style>`;
 function state(s){return s.publishing||(s.publishing={context:null,loading:false,error:'',review:null,poll:null});}
 function clubId(s){return s.scope.split(':').slice(1).join(':');}
 function remember(s,r){try{localStorage.setItem('social-post-caption:'+s.scope+':'+r.id,r.caption);}catch{}}
 function recall(s,r){try{return localStorage.getItem('social-post-caption:'+s.scope+':'+r.id)??r.caption;}catch{return r.caption;}}
 function savePost(p,post){if(!p.context||!post)return;const posts=p.context.posts||(p.context.posts=[]),i=posts.findIndex(j=>j.id===post.id);if(i>=0)posts[i]=post;else posts.unshift(post);p.context.posts=posts.slice(0,20);}
 function acceptPost(p,r,post){if(!post)return;const caption=r.caption,selected=r.targets;Object.assign(r,post);if(post.state==='draft'){r.caption=caption;r.targets=selected;}savePost(p,post);}
 async function rpc(s,action,data={}){const r=await supabase.rpc('club_socials_publish_api',{p_club_id:clubId(s),p_action:action,p_data:data});if(r.error)throw Error(r.error.message||'Could not check the post.');return r.data;}
 async function invoke(s,action,extra={}){
  if(demo)throw Error('This is a demonstration. No posts were sent.');
  const r=await supabase.functions.invoke('club-social-publish',{body:{action,club_id:clubId(s),...extra}});
  if(r.error||r.data?.error){let message=r.data?.error;try{message||=(await r.error.context?.clone().json())?.error;}catch{}throw Error(message||r.error?.message||'Could not connect. Check Posting history before retrying.');}return r.data;
 }
 function defaultCaption(s,fixtures){return [s.data.brand.name+' — this week’s teams','',...fixtures.map(f=>{const d=f.published.details;return `${d.grade} v ${d.opposition}\n${d.days.map(day=>h.date(day.date)).join(' & ')}${d.ground?' · '+d.ground:''}`;}),'',s.design.footer||''].join('\n').trim();}
 function connected(p){return p.context?.connection?.status==='connected';}
 function label(t){return t==='facebook'?'Facebook':'Instagram';}
 function targets(p){const c=p.context?.connection,health=p.context?.health;return c?.status==='connected'?['facebook',...(c.instagram_id?['instagram']:[])].filter(t=>!health||health[t]?.state==='ready'):[];}
 function live(s,text){const e=document.getElementById('spLive');if(e)e.textContent=text;h.message(s,text);}
 async function load(s,redraw=true,check=false){
  const p=state(s);if(p.loading)return;p.loading=true;if(redraw&&check&&h.here(s))h.draw(s);
  try{
   const old=p.context;
   p.context=demo?{configured:true,admin:true,connection:{page_id:'demo',page_name:'Harbour Cricket Club',instagram_id:'demo',instagram_name:'harbourcricket',status:'connected',revision:1},posts:[],health:{checked_at:new Date().toISOString(),facebook:{state:'ready',message:'Example connection only.'},instagram:{state:'ready',message:'Example connection only.'}}}:await invoke(s,check?'check_connection':'status');
   if(check||demo)p.checkedAt=Date.now();
   if(p.context.connection?.status==='connected'&&p.context.connection.revision!==p.connectionRevisionAtStart)p.connectStarted=0;
   else if(old?.connection?.revision===p.context.connection?.revision&&old?.connection?.status===p.context.connection?.status&&old?.health)p.context.health=old.health;
   p.error='';
  }catch(e){p.error=e.message;if(check&&p.context)p.context.health={facebook:{state:'unavailable',message:'The check could not finish. Try again.'},instagram:{state:'unavailable',message:'The check could not finish. Try again.'}};}
  finally{p.loading=false;if(redraw&&h.here(s))h.draw(s);}
 }
 function resultRows(post){return (post.destinations||[]).map(d=>{
  const names={queued:'Waiting to post',processing:'Preparing to post…',publishing:'Posting…',published:'Posted',failed:'Not posted',blocked:'Needs attention',uncertain:'Check account — result unconfirmed'};
  let link='';try{const u=new URL(d.permalink);if(u.protocol==='https:'&&!u.username&&!u.password&&(d.platform==='facebook'?['facebook.com','www.facebook.com']:['instagram.com','www.instagram.com']).includes(u.hostname))link=`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">View post ↗</a>`;}catch{}
  return `<div class="sp-result"><div><strong>${label(d.platform)}</strong><p class="${d.state==='published'?'sp-success':d.state==='uncertain'?'sp-warning':''}">${esc(names[d.state]||d.state)}</p>${d.message?`<small>${esc(d.message)}</small>`:''}${d.state==='published'&&!link?'<small>Published successfully. The direct link is not available yet.</small>':''}</div>${link}</div>`;
 }).join('');}
 function history(s){const p=state(s),posts=p.context?.posts||[];return `<details class="sp-history"><summary>Posting history${posts.length?' · '+posts.length:''}</summary>${posts.length?posts.map(j=>`<div class="sp-result"><div><strong>${esc(j.images?.map(i=>i.label).join(', ')||'Team announcement')}</strong><p class="sp-count">${esc(new Date(j.created_at).toLocaleString('en-AU'))} · ${j.state==='draft'?'Draft — not posted':(j.destinations||[]).map(d=>label(d.platform)+': '+({published:'posted',uncertain:'check account',failed:'not posted',blocked:'needs attention'}[d.state]||'in progress')).join(' · ')}</p></div><button class="btn ghost" data-sp-open="${esc(j.id)}">${j.state==='draft'?'Open review':'View result'}</button></div>`).join(''):'<p>No posting requests yet.</p>'}</details>`;}
 function bindHistory(s){document.querySelectorAll('[data-sp-open]').forEach(b=>b.onclick=()=>openPost(s,b.dataset.spOpen));}
 function mount(s){
  const p=state(s),host=document.getElementById('socialContent');if(!host)return;
  const box=document.createElement('section');box.className='sp-panel';box.innerHTML=css+`<div class="sp-heading"><div><h3>Post this week’s teams</h3><p class="se-muted">Review the selected graphics and caption, then publish to your club’s accounts.</p></div><button class="btn secondary" id="spReview">Review selected post →</button></div><p class="sp-count">${p.loading?'Checking connected accounts…':p.error?esc(p.error):connected(p)?esc(p.context.connection.page_name)+(p.context.connection.instagram_name?' · @'+esc(p.context.connection.instagram_name):''):p.context?.configured===false?'Direct posting is being set up for Club Batting. You can still review and download your graphics.':'Connect your club accounts once to enable direct posting.'}</p><button class="btn ghost" id="spAccounts">Social accounts</button>${history(s)}`;
  host.prepend(box);document.getElementById('spReview').onclick=()=>startReview(s);document.getElementById('spAccounts').onclick=()=>{s.view='accounts';h.draw(s);};bindHistory(s);
  if(!p.context&&!p.loading&&!p.error)void load(s);
 }
 async function startReview(s){
  const p=state(s),fixtures=h.selection(s);if(s.busy||s.pending)return;
  if(!fixtures.length){h.message(s,'Choose at least one grade first.');return;}
  const cards=fixtures.flatMap(h.cards);if(cards.length>10){h.message(s,'Choose up to ten images for one post. Different two-day line-ups count as separate images.');return;}
  if(fixtures.some(f=>f.feature_valid===false)){h.message(s,'Choose a featured player who is in the current team, then review again.');return;}
  s.busy=true;h.lock(true);h.message(s,'Preparing the exact images for your review…');
  let r;
  try{
   if(!demo&&(!p.checkedAt||Date.now()-p.checkedAt>60000))await load(s,false,true);
   const checks=fixtures.map(f=>({id:f.id,artwork_key:f.artwork_key}));
   if(!demo)await h.artwork(s,'validate_export',{fixtures:checks});
   if(p.review?.state==='draft'&&JSON.stringify(p.review.fixtures)===JSON.stringify(checks)&&p.review.uploaded){s.view='publish_review';h.message(s,'Ready to review. Nothing has been posted.');return;}
   if(p.review)for(const u of p.review.urls||[])URL.revokeObjectURL(u);
   r={id:crypto.randomUUID(),renderer:'0.8.62.143',fixtures:checks,images:[],blobs:[],urls:[],caption:defaultCaption(s,fixtures),targets:targets(p),state:'draft',destinations:[],uploaded:false};
   for(let i=0;i<cards.length;i++){
    if(!h.here(s))return;const card=cards[i],canvas=document.createElement('canvas'),result=await h.renderImage(s,card,canvas);if(result?.invalid)throw Error('A featured player changed. Refresh and review again.');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));if(!blob)throw Error('An image could not be prepared. Try again.');
    const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
    r.blobs.push(blob);r.urls.push(URL.createObjectURL(blob));r.images.push({path:clubId(s)+'/'+r.id+'/'+i+'.jpg',fixture_id:card.f.id,sha256:sha,bytes:blob.size,label:card.f.published.details.grade+(card.split?' · Day '+(card.day+1):'')});
   }
   if(!demo)await h.artwork(s,'validate_export',{fixtures:checks});
   p.review=r;s.view='publish_review';
   if(!demo){savePost(p,await rpc(s,'draft',{id:r.id,renderer:r.renderer,fixtures:r.fixtures,images:r.images,caption:r.caption}));await upload(s,r);}else r.uploaded=true;
   h.message(s,'Ready to review. Nothing has been posted.');
  }catch(e){h.message(s,e.message);if(r){p.review=r;r.error=e.message;s.view='publish_review';}}
  finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}
 }
 async function upload(s,r){
  for(let i=0;i<r.images.length;i++){
   live(s,`Saving image ${i+1} of ${r.images.length} for this review…`);
   const result=await supabase.storage.from('club-social-posts').upload(r.images[i].path,r.blobs[i],{contentType:'image/jpeg',upsert:false});
   if(result.error&&!['409','Duplicate'].includes(String(result.error.statusCode||result.error.error)))throw Error(result.error.message||'An image could not upload. Retry preparing this review.');
  }
  r.uploaded=true;r.error='';
 }
 async function openPost(s,id){
  if(s.busy||s.pending)return;const p=state(s);s.busy=true;h.lock(true);
  try{
   const post=demo?p.context.posts.find(j=>j.id===id):await rpc(s,'get',{id});if(!post)throw Error('Post unavailable.');
   if(p.review?.id===post.id){acceptPost(p,p.review,post);s.view='publish_review';return;}
   if(p.review)for(const u of p.review.urls||[])URL.revokeObjectURL(u);
   const r={...post,urls:[],blobs:[],uploaded:true};p.review=r;s.view='publish_review';if(r.state==='draft')r.caption=recall(s,r);
   for(const img of r.images){const res=await supabase.storage.from('club-social-posts').download(img.path);if(res.error){r.uploaded=false;r.error='This draft has an incomplete image upload. Return to Team graphics and prepare a new review.';break;}r.urls.push(URL.createObjectURL(res.data));}
   if(r.state==='draft')r.targets=targets(p);
  }catch(e){h.message(s,e.message);}finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}
 }
 function review(s){
  const p=state(s),r=p.review,host=document.getElementById('socialContent');clearTimeout(p.poll);if(!r){s.view='graphics';h.draw(s);return;}
  const draft=r.state==='draft',c=p.context?.connection,available=targets(p);
  if(draft&&!r.targets?.length)r.targets=available;
  host.innerHTML=css+`<div class="sp-heading"><h3>${draft?'Review your club post':'Posting result'}</h3><button class="btn ghost" id="spBack">← Team graphics</button></div><p>${draft?'These are the exact images that will be posted, in the order shown.':'Your approved images and caption are saved with this request.'}</p><div class="sp-preview">${r.images.map((img,i)=>`<figure>${r.urls[i]?`<img src="${esc(r.urls[i])}" alt="${esc(img.label)} team announcement">`:'<p>Image unavailable</p>'}<figcaption>${i+1}. ${esc(img.label)}</figcaption></figure>`).join('')}</div><section class="sp-panel"><label for="spCaption"><strong>Caption</strong></label><textarea class="sp-caption" id="spCaption" ${draft?'':'readonly'}>${esc(r.caption)}</textarea><p id="spCount" class="sp-count"></p>${draft?`<h3>Post to</h3>${c?['facebook','instagram'].map(t=>`<label class="sp-target"><input type="checkbox" data-sp-target="${t}" ${r.targets.includes(t)?'checked':''} ${!available.includes(t)?'disabled':''}><span><strong>${label(t)}</strong> · ${esc(t==='facebook'?c.page_name:c.instagram_name?'@'+c.instagram_name:'No professional account connected')}</span></label>`).join(''):'<p>Your club’s accounts are not connected yet.</p>'}${!connected(p)||!p.context?.configured||p.context?.health&&available.length<(c?.instagram_id?2:1)?'<button class="btn ghost" id="spReviewAccounts">Social accounts</button>':''}${r.error?`<p role="alert">${esc(r.error)}</p>`:''}<p id="spLive" class="sp-live" role="status" aria-live="polite"></p><div class="social-actions"><button class="btn secondary" id="spPost"></button>${!r.uploaded&&r.blobs.length===r.images.length?'<button class="btn ghost" id="spRetryUpload">Retry preparing review</button>':''}</div><p class="sp-count">${demo?'Demo only. No posts will be sent.':'Clicking Post approves and publishes this post. There is no further confirmation.'}</p>`:`<div aria-live="polite">${resultRows(r)}</div><p id="spLive" class="sp-live" role="status"></p><div class="social-actions"><button class="btn ghost" id="spCheck">Refresh result</button>${(r.destinations||[]).some(d=>['failed','blocked'].includes(d.state))?'<button class="btn secondary" id="spRetryPost">Retry unposted destinations</button>':''}</div>`}</section>`;
  document.getElementById('spBack').onclick=()=>{if(s.busy)return;s.view='graphics';h.draw(s);};
  const area=document.getElementById('spCaption'),count=document.getElementById('spCount');
  const update=()=>{r.caption=area.value;count.textContent=`${Array.from(r.caption).length.toLocaleString()} / 2,200 characters`;count.classList.toggle('sp-caption-count-over',Array.from(r.caption).length>2200);if(!draft)return;r.targets=[...host.querySelectorAll('[data-sp-target]:checked:not(:disabled)')].map(e=>e.dataset.spTarget);const button=document.getElementById('spPost');button.textContent=demo?'Demo — preview only':'Post to '+(r.targets.map(label).join(' & ')||'selected accounts');button.disabled=demo||s.busy||!r.uploaded||!r.targets.length||!p.context?.configured||!connected(p)||Array.from(r.caption).length>2200;remember(s,r);};
  area.oninput=update;host.querySelectorAll('[data-sp-target]').forEach(e=>e.onchange=update);update();
  document.getElementById('spReviewAccounts')?.addEventListener('click',()=>{s.view='accounts';h.draw(s);});
  document.getElementById('spPost')?.addEventListener('click',()=>publish(s));
  document.getElementById('spRetryUpload')?.addEventListener('click',async()=>{if(s.busy)return;s.busy=true;h.lock(true);try{savePost(p,await rpc(s,'draft',{id:r.id,renderer:r.renderer,fixtures:r.fixtures,images:r.images,caption:r.caption}));await upload(s,r);}catch(e){r.error=e.message;}finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}});
  document.getElementById('spCheck')?.addEventListener('click',()=>refreshPost(s));
  document.getElementById('spRetryPost')?.addEventListener('click',()=>publish(s,true));
  if(!draft&&(r.destinations||[]).some(d=>['queued','processing','publishing'].includes(d.state)))p.poll=setTimeout(()=>{if(h.here(s)&&s.view==='publish_review')void refreshPost(s);},4000);
 }
 async function refreshPost(s){const p=state(s),r=p.review;if(!r||demo)return;try{acceptPost(p,r,await rpc(s,'get',{id:r.id}));if(h.here(s)&&s.view==='publish_review')review(s);}catch(e){live(s,e.message+' Your saved request remains in Posting history.');}}
 async function publish(s,retry=false){
  const p=state(s),r=p.review;if(s.busy||!r||demo)return;
  s.busy=true;h.lock(true);live(s,retry?'Retrying the unposted destinations…':'Posting request is being saved…');
  try{
   const data=retry?{id:r.id}:{id:r.id,caption:r.caption,targets:r.targets,connection_revision:p.context.connection.revision};
   const result=await invoke(s,retry?'retry':'publish',{data});acceptPost(p,r,result.post);r.error='';
   live(s,'Posting is underway. You can return later to see the result.');
  }catch(e){
   // A lost response may hide a successful approval. Query the same ID; never create another post.
   try{acceptPost(p,r,await rpc(s,'get',{id:r.id}));}catch{}
   r.error=e.message;h.message(s,e.message+' Check this saved request before trying again.');
  }finally{s.busy=false;h.lock(false);if(h.here(s))review(s);}
 }
 function accounts(s){
  const p=state(s),c=p.context?.connection,health=p.context?.health,host=document.getElementById('socialContent');
  const active=!!c&&c.status!=='disconnected',ready=targets(p),isReady=active&&health&&ready.length>0;
  const step=p.connecting?1:isReady?3:active?2:1;
  const row=t=>{const value=health?.[t],name=t==='facebook'?c?.page_name:c?.instagram_name?'@'+c.instagram_name:'Not connected';const labels={ready:'Ready to post',reconnect:'Reconnect needed',available:'Available to connect',not_connected:'Optional',unavailable:'Check again'};return `<div class="sp-result"><div><strong>${label(t)}</strong><p>${esc(name||'Not connected')}</p><small>${esc(value?.message||'Checking the saved connection…')}</small></div><span class="${value?.state==='ready'?'sp-success':'sp-warning'}">${esc(labels[value?.state]||'Checking…')}</span></div>`;};
  host.innerHTML=css+`<style>.sp-steps{display:flex;list-style:none;gap:12px;padding:0;margin:20px 0 26px}.sp-steps li{flex:1;border-top:3px solid #dce2ee;padding-top:10px;color:#58687d;font-size:14px}.sp-steps li[aria-current=step]{border-color:#17245f;color:#17245f;font-weight:700}.sp-steps li.is-done{border-color:#26834f;color:#11633d}.sp-help{margin-top:20px;padding-top:16px;border-top:1px solid #dce2ee}.sp-help summary{cursor:pointer;font-weight:700}.sp-help h4{margin-bottom:6px}.sp-help p{margin-top:6px}</style>
   <section class="sp-panel"><h3>${isReady?'Your club accounts are connected':'Connect your club accounts'}</h3><p>Connect once. Then your socials managers can review and post the weekly teams.</p>
   <ol class="sp-steps" aria-label="Connection progress">${['Sign in','Choose your club','Ready to post'].map((name,i)=>`<li ${i+1===step?'aria-current="step"':''} class="${i+1<step?'is-done':''}">${i+1}. ${name}</li>`).join('')}</ol>
   ${demo?'<p class="sp-count">This is an example connection. The demo cannot connect accounts or send posts.</p>':''}
   ${p.context?.configured===false?'<div class="notice"><strong>Club Batting is getting direct posting ready.</strong><p>There is nothing for your club to install. You can keep downloading your team graphics while this is activated.</p></div>':active?row('facebook')+row('instagram'):'<p>Sign in with the Facebook account you use to manage the club Page. We will find your Pages and any linked Instagram account for you.</p><p class="sp-count">Nothing is posted while you connect. You approve each post separately after reviewing it.</p>'}
   ${p.error?`<p role="alert">${esc(p.error)}</p>`:''}
   <p id="spLive" role="status" aria-live="polite">${p.connecting?'Finish the connection in the Facebook window. This screen will update when you return.':p.loading?'Checking the connection automatically…':health?.checked_at?'Connection checked '+esc(new Date(health.checked_at).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'}))+'.':''}</p>
   <div class="social-actions">${p.context?.admin&&p.context?.configured!==false?`<button class="btn ${isReady?'ghost':'secondary'}" id="spConnect" ${demo||p.loading||p.connecting||s.busy?'disabled':''}>${active?(ready.length===2?'Change connected accounts':'Reconnect / add Instagram'):'Connect Facebook & Instagram'}</button>`:p.context&&!p.context.admin?'<p>A Club Admin connects the accounts. Once connected, you can review and post.</p>':''}<button class="btn ${isReady?'secondary':'ghost'}" id="spAccountBack">${p.review?'Back to review':'Choose team graphics'}</button><button class="btn ghost" id="spReloadAccounts" ${p.loading||p.connecting?'disabled':''}>Check connection</button></div>
   ${p.context?.configured!==false?`<details class="sp-help"><summary>Need a hand connecting?</summary><h4>My club Page is missing</h4><p>Use the Facebook account with permission to create posts for the club. During sign-in, include the club Page and allow the requested access. Then try connecting again.</p><h4>Instagram is missing</h4><p>Facebook can work on its own. To add Instagram, link the club’s professional Instagram account in the Facebook Page’s settings, then reconnect here.</p><h4>Do club admins need to install anything?</h4><p>No. Sign in, choose the club Page and allow access. The Club Batting connection is shared by your authorised socials managers.</p>${!demo&&p.context?.admin&&active?'<button class="btn ghost" id="spDisconnect">Disconnect accounts</button>':''}</details>`:''}
   </section>`;
  document.getElementById('spReloadAccounts').onclick=()=>load(s,true,true);
  document.getElementById('spAccountBack').onclick=()=>{s.view=p.review?'publish_review':'graphics';h.draw(s);};
  document.getElementById('spConnect')?.addEventListener('click',()=>connect(s));
  document.getElementById('spDisconnect')?.addEventListener('click',async()=>{if(!confirm('Disconnect the club accounts? New posts will stop until a Club Admin reconnects them.'))return;try{await rpc(s,'disconnect');await load(s,true,true);}catch(e){live(s,e.message);}});
  if(!p.loading&&!p.error&&(!p.context||p.context.configured!==false&&(!p.checkedAt||Date.now()-p.checkedAt>60000)))void load(s,true,true);
 }
 async function connect(s){
  const p=state(s);if(demo||s.busy||p.connecting)return;
  const popup=window.open('about:blank','club-social-connect','width=650,height=780');
  p.connecting=true;p.connectStarted=Date.now();p.connectionRevisionAtStart=p.context?.connection?.revision;p.error='';if(h.here(s))h.draw(s);
  if(popup){popup.document.title='Connecting your club accounts';popup.document.body.textContent='Opening Facebook sign-in…';}
  try{
   const result=await invoke(s,'connect',{return_url:location.href}),u=new URL(result.url);
   if(u.origin!=='https://www.facebook.com')throw Error('The account sign-in could not be opened.');
   if(!popup){location.assign(u.href);return;}
   popup.location.href=u.href;
   p.popup=popup;const started=Date.now();clearInterval(p.connectionTimer);
   p.connectionTimer=setInterval(()=>{if(popup.closed||Date.now()-started>15*60000){clearInterval(p.connectionTimer);p.connecting=false;if(h.here(s))void load(s,true,true);}},800);
  }catch(e){popup?.close();p.connecting=false;p.connectStarted=0;p.error=e.message;if(h.here(s))h.draw(s);}
 }
 window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.data?.type!=='club-social-connected')return;
  const s=h.current();if(!s||clubId(s)!==e.data.club_id)return;const p=state(s);
  if(p.popup&&e.source!==p.popup)return;
  clearInterval(p.connectionTimer);p.connecting=false;p.checkedAt=0;void load(s,true,true);
 });
 window.addEventListener('focus',()=>{const s=h.current();if(!s||!h.here(s))return;const p=state(s);if(p.connectStarted&&Date.now()-p.connectStarted<15*60000&&!p.loading&&(!p.checkedAt||Date.now()-p.checkedAt>3000))void load(s,true,true);});
 return {mount,review,accounts,load};
}
