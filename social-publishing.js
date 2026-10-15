/* Teams .151 — focused posting alerts, corrections and hand-back; renderer remains .143. */
export function createSocialPublishing(h){
 const {supabase}=h,esc=h.escape,demo=!!h.demo;
 const css=`<style>.sp-panel{margin:18px 0;padding:18px;border:1px solid #dce2ee;border-radius:12px;background:#f7f9fd}.sp-panel h3{margin:0 0 8px}.sp-panel p{line-height:1.5}.sp-preview{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:20px 0}.sp-preview figure{margin:0;max-width:360px}.sp-preview img{display:block;width:100%;border-radius:8px}.sp-preview figcaption{font-size:13px;margin-top:7px}#socialContent .sp-caption{box-sizing:border-box;width:100%;min-height:160px;font:inherit;padding:12px;line-height:1.5}.sp-target{display:flex;align-items:center;gap:10px;margin:12px 0}.sp-target input{width:20px;height:20px}.sp-count{font-size:13px;color:#52627a}.sp-result{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid #dce2ee;flex-wrap:wrap}.sp-result p{margin:4px 0}.sp-result small{display:block;max-width:600px}.sp-success{color:#11633d}.sp-warning{color:#875000}.sp-history{margin:20px 0}.sp-history summary{font-weight:700;cursor:pointer}.sp-live{white-space:pre-wrap;line-height:1.5}.sp-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.sp-caption-count-over{color:#a12121}@media(max-width:600px){.sp-preview{grid-template-columns:minmax(0,1fr)}.sp-preview figure{max-width:none}.sp-panel{padding:14px}.sp-panel .social-actions .btn{width:100%}}
 .sp-postbar{box-sizing:border-box;min-width:0;max-width:100%;margin:8px 0 16px;padding:12px 14px;border:1px solid #dce2ee;border-radius:9px;background:#fff}
 .sp-postbar-main{display:flex;align-items:center;flex-wrap:wrap;gap:10px 16px;min-width:0}
 .sp-postbar-copy{flex:1 1 230px;min-width:0}
 .sp-postbar h3{margin:0;font-size:16px;line-height:1.35}
 .sp-postbar-copy p{margin:3px 0 0;font-size:13px;line-height:1.4;color:#52627a;overflow-wrap:anywhere}
 .sp-postbar-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0;max-width:100%}
 .sp-postbar-actions .btn{box-sizing:border-box;width:auto;min-width:0;max-width:100%;margin:0;min-height:38px;padding:8px 12px;font-size:13px;line-height:1.3;white-space:normal;overflow-wrap:anywhere}
 .sp-postbar-meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 16px;margin-top:8px;min-width:0}
 .sp-postbar-meta>p{flex:1 1 260px;min-width:0;margin:0;font-size:12px;line-height:1.4;overflow-wrap:anywhere}
 .sp-postbar .sp-history{min-width:0;max-width:100%;margin:0;font-size:12px}
 .sp-postbar .sp-history summary{font-weight:600}
 .sp-postbar .sp-history[open]{flex-basis:100%;padding-top:7px;border-top:1px solid #dce2ee}
 .sp-postbar .sp-result>div{min-width:0;overflow-wrap:anywhere}
 @media(max-width:600px){.sp-postbar{padding:10px 12px}.sp-postbar-copy{flex-basis:100%}.sp-postbar-actions{width:100%}.sp-postbar-actions .btn{flex:0 1 auto}.sp-postbar-meta>p{flex-basis:100%}}
</style>`;
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
 function defaultCaption(s){return ['🏏 THIS WEEK’S TEAMS 🏏','','Here are our team lists for the round.','Best of luck to everyone taking the field!',s.design.footer?'\n'+s.design.footer:''].filter((line,i)=>line||i===1).join('\n');}
 function connected(p){return p.context?.connection?.status==='connected';}
 function label(t){return t==='facebook'?'Facebook':'Instagram';}
 function targets(p){const c=p.context?.connection,health=p.context?.health;return c?.status==='connected'?['facebook',...(c.instagram_id?['instagram']:[])].filter(t=>!health||health[t]?.state==='ready'):[];}
 function live(s,text){const e=document.getElementById('spLive');if(e)e.textContent=text;h.message(s,text);}
 async function load(s,redraw=true,check=false){
  const p=state(s);if(p.loading)return;p.loading=true;if(redraw&&check&&h.here(s))h.draw(s);
  try{
   const old=p.context;
   p.context=demo?{configured:true,admin:true,can_connect:true,can_delegate:true,can_hand_back:!!p.demoDelegation?.delegate_id,delegation:p.demoDelegation||{revision:0},delegation_members:s.data.members||[],timezone:'Australia/Sydney',connection:{page_id:'demo',page_name:'Harbour Cricket Club',instagram_id:'demo',instagram_name:'harbourcricket',status:'connected',revision:1},posts:[],health:{checked_at:new Date().toISOString(),facebook:{state:'ready',message:'Example connection only.'},instagram:{state:'ready',message:'Example connection only.'}}}:await invoke(s,check?'check_connection':'status');
   if(check||demo)p.checkedAt=Date.now();
   if(p.context.connection?.status==='connected'&&p.context.connection.revision!==p.connectionRevisionAtStart)p.connectStarted=0;
   else if(old?.connection?.revision===p.context.connection?.revision&&old?.connection?.status===p.context.connection?.status&&old?.health)p.context.health=old.health;
   p.error='';p.loadedAt=Date.now();
  }catch(e){p.error=e.message;if(check&&p.context)p.context.health={facebook:{state:'unavailable',message:'The check could not finish. Try again.'},instagram:{state:'unavailable',message:'The check could not finish. Try again.'}};}
  finally{p.loading=false;if(redraw&&h.here(s))h.draw(s);}
 }
 function zone(s){return state(s).context?.timezone||s.data.timezone||'Australia/Sydney';}
 function localTime(value,tz){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)),get=k=>parts.find(p=>p.type===k).value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;}
 function scheduleTime(value,tz){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value||''))throw Error('Choose a date and time for the post.');
  const base=Date.parse(value+'Z');if(!Number.isFinite(base)||new Date(base).toISOString().slice(0,16)!==value)throw Error('Choose a valid posting date and time.');
  const matches=[];for(let offset=-14*60;offset<=14*60;offset+=15){const t=base+offset*60000;if(localTime(t,tz)===value)matches.push(t);}
  if(matches.length!==1)throw Error('That local time is skipped or repeated by a clock change. Choose another time.');
  if(matches[0]<Date.now()+60000)throw Error('Choose a posting time at least one minute ahead.');
  return new Date(matches[0]).toISOString();
 }
 function scheduled(r){return r.state==='approved'&&!!r.scheduled_for&&new Date(r.scheduled_for)>new Date()&&(r.destinations||[]).every(d=>d.state==='queued');}
 function scheduleLabel(s,value){return new Intl.DateTimeFormat('en-AU',{timeZone:zone(s),dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' · '+zone(s).replaceAll('_',' ');}
 function coverPanel(s){
  const p=state(s),d=p.context?.delegation||{},today=localTime(Date.now(),zone(s)).slice(0,10),active=d.delegate_id&&d.starts_on<=today&&d.ends_on>=today,future=d.delegate_id&&d.starts_on>today;
  if(!p.context?.can_delegate&&!p.context?.can_hand_back)return '';
  const pending=p.coverPending;
  return `<section class="sp-panel"><h3>Socials responsibility</h3><p>Club Admin keeps access. Socials managers can connect accounts, review, schedule and publish posts.</p>${d.delegate_id?`<p><strong>${esc(d.name||'Club member')}</strong> · ${active?'Covering now':future?'Upcoming cover':'Cover ended'}<br><span class="sp-count">${esc(d.starts_on)} to ${esc(d.ends_on)} · ${esc(zone(s).replaceAll('_',' '))}</span></p>`:''}<div class="social-actions">${p.context.can_delegate?'<button class="btn ghost" id="spArrangeCover">Arrange temporary cover</button>':''}${p.context.can_hand_back&&d.delegate_id?'<button class="btn ghost" id="spHandBack">Hand back responsibility</button>':''}${p.context.admin?'<button class="btn ghost" id="spManageSocials">Choose who handles socials</button>':''}</div>
   ${p.coverEditing?`<form id="spCoverForm"><div class="se-form-grid"><label>Replacement<select name="user_id" required ${pending?'disabled':''}><option value="">Choose a club member</option>${(p.context.delegation_members||[]).map(m=>`<option value="${esc(m.user_id)}" ${m.user_id===(p.coverChoice?.user_id||d.delegate_id)?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><label>From<input name="from" type="date" required min="${today}" value="${esc(p.coverChoice?.from||today)}" ${pending?'disabled':''}></label><label>Until<input name="until" type="date" required min="${today}" value="${esc(p.coverChoice?.until||today)}" ${pending?'disabled':''}></label></div><p class="sp-count">Both dates are included. They can hand back early; their temporary access ends automatically. Existing Admin and permanent Socials Manager access is retained.</p><button class="btn secondary" ${pending?'disabled':''}>Save cover period</button></form>`:''}
${pending?'<p>Save not confirmed. Retry uses the same request.</p><button class="btn ghost" id="spRetryCover">Retry responsibility change</button>':''}<p id="spCoverStatus" role="status" aria-live="polite">${esc(p.coverMessage||'')}</p></section>`;
 }
 async function changeCover(s,data){
  const p=state(s);if(s.busy)return;let returned=false;const request=p.coverPending||{...data,revision:p.context.delegation?.revision||0,request_id:crypto.randomUUID()};p.coverPending=request;s.busy=true;p.coverMessage='Saving…';h.draw(s);
  try{
   if(demo){const m=(p.context.delegation_members||[]).find(m=>m.user_id===request.user_id);p.demoDelegation={revision:request.revision+1,delegate_id:request.operation==='delegate'?request.user_id:null,name:m?.name,starts_on:request.from,ends_on:request.until};p.context.delegation=p.demoDelegation;p.context.can_hand_back=!!p.demoDelegation.delegate_id;}
   else {await rpc(s,'delegate',request);p.coverPending=null;if(request.operation==='hand_back'&&!p.context.can_delegate){returned=true;}else{try{p.context={...p.context,...await rpc(s,'context')};}catch{p.coverMessage='Responsibility saved. Refresh to load the current status.';p.coverEditing=false;return;}}}
   p.coverPending=null;p.coverEditing=false;p.coverChoice=null;if(request.operation==='hand_back')s.view='accounts';p.coverMessage=demo?'Demo responsibility changed. No notification was sent.':request.operation==='hand_back'?'Responsibility handed back.':'Temporary cover saved. The replacement has a Teams notification.';
  }catch(e){if(request.operation==='hand_back'&&/access required/.test(e.message)){p.coverPending=null;returned=true;p.coverMessage='Your temporary Socials Manager access has ended.';}else{if(/^(Socials responsibility changed|Only |Choose |Another manager|Review [0-9]+ scheduled)/.test(e.message))p.coverPending=null;p.coverMessage=e.message;}}
  finally{s.busy=false;if(h.here(s)){if(returned)h.returnToTeams?.();else h.draw(s);}}
 }
 async function changeSchedule(s,action,value){
  const p=state(s),r=p.review;if(s.busy||!r||demo)return;
  try{const request=p.schedulePending||{action,data:{id:r.id,revision:r.schedule_revision,request_id:crypto.randomUUID(),...(action==='reschedule'?{scheduled_for:scheduleTime(value,zone(s))}:{})}};p.schedulePending=request;s.busy=true;h.lock(true);live(s,'Saving schedule change…');
   const result=await rpc(s,request.action,request.data);p.schedulePending=null;acceptPost(p,r,result);r.error='';r.delivery='now';r.localSchedule='';live(s,request.action==='cancel_schedule'?'Schedule cancelled. The post is back in draft.':request.action==='cancel_unposted'?'Unposted destinations cancelled.':'Schedule responsibility saved.');try{await refreshContext(s);}catch{h.message(s,'Change saved. Refresh to load the latest handover list.');}
  }catch(e){r.error=e.message;if(/^(This schedule changed|This post is already due|Posting has started|Posting is in progress|Choose |A fixture)/.test(e.message)){p.schedulePending=null;try{acceptPost(p,r,await rpc(s,'get',{id:r.id}));}catch{}}}
  finally{s.busy=false;h.lock(false);if(h.here(s))review(s);}
 }
 function resultRows(post){return (post.destinations||[]).map(d=>{
  const names={queued:'Waiting to post',processing:'Preparing to post…',publishing:'Posting…',published:'Posted',failed:'Not posted',blocked:'Needs attention',uncertain:'Check account — result unconfirmed'};
  let link='';try{const u=new URL(d.permalink);if(u.protocol==='https:'&&!u.username&&!u.password&&(d.platform==='facebook'?['facebook.com','www.facebook.com']:['instagram.com','www.instagram.com']).includes(u.hostname))link=`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">View post ↗</a>`;}catch{}
  return `<div class="sp-result"><div><strong>${label(d.platform)}</strong><p class="${d.state==='published'?'sp-success':d.state==='uncertain'?'sp-warning':''}">${esc(d.state==='queued'&&scheduled(post)?'Scheduled':names[d.state]||d.state)}</p>${d.message?`<small>${esc(d.message)}</small>`:''}${d.state==='published'&&!link?'<small>Published successfully. The direct link is not available yet.</small>':''}</div>${link}</div>`;
 }).join('');}
 function history(s){const p=state(s),posts=p.context?.posts||[];return `<details class="sp-history"><summary>Posting history${posts.length?' · '+posts.length:''}</summary>${posts.length?posts.map(j=>`<div class="sp-result"><div><strong>${esc(j.images?.map(i=>i.label).join(', ')||'Team announcement')}</strong><p class="sp-count">${esc(new Date(j.created_at).toLocaleString('en-AU'))} · ${j.state==='draft'?'Draft — not posted':scheduled(j)?'Scheduled: '+esc(scheduleLabel(s,j.scheduled_for)):(j.destinations||[]).map(d=>label(d.platform)+': '+({published:'posted',uncertain:'check account',failed:'not posted',blocked:'needs attention'}[d.state]||'in progress')).join(' · ')}</p></div><button class="btn ghost" data-sp-open="${esc(j.id)}">${j.state==='draft'?'Open review':'View result'}</button></div>`).join(''):'<p>No posting requests yet.</p>'}</details>`;}
 function bindHistory(s){document.querySelectorAll('[data-sp-open]').forEach(b=>b.onclick=()=>openPost(s,b.dataset.spOpen));}
 function attentionButton(s){const n=state(s).context?.attention?.length||0;return n?`<button class="btn ghost" id="spAttention">Needs attention · ${n}</button>`:'';}
 function safePostLink(value,platform){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&(platform==='facebook'?['facebook.com','www.facebook.com']:['instagram.com','www.instagram.com']).includes(u.hostname))return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">View announcement ↗</a>`;}catch{}return '';}
 async function refreshContext(s){const p=state(s);if(!demo){p.context={...p.context,...await rpc(s,'context')};p.loadedAt=Date.now();}return p.context;}
 function openAttention(s,id=null){if(s.busy||s.pending)return;const p=state(s);p.attentionId=id;p.attentionError='';s.view='social_attention';h.draw(s);}
 function attention(s){
  const p=state(s),host=document.getElementById('socialContent'),items=p.context?.attention||[],task=items.find(a=>a.id===p.attentionId);
  const heading=`<div class="sp-heading"><h3>${task?esc(task.title):'Needs attention'}</h3><button class="btn ghost" id="spAttentionBack">${task?'← All tasks':'← Team graphics'}</button></div>`;
  const detail=task?`<p>${esc(task.body)}</p>${safePostLink(task.permalink,task.platform)}<div class="social-actions">${task.kind==='connection'?'<button class="btn secondary" id="spAttentionAccounts">Social accounts</button>':`<button class="btn ${task.kind==='correction'?'ghost':'secondary'}" data-sp-open="${esc(task.post_id)}">Review saved post</button>`}${task.kind==='correction'?'<button class="btn secondary" id="spPrepareCorrection">Prepare updated teams</button><button class="btn ghost" id="spHandled">Mark correction handled</button>':''}</div>${task.kind==='correction'?`<p class="sp-count">Mark handled after the old ${esc(label(task.platform))} announcement has been corrected, removed or clearly superseded. Completed fixtures cannot be reposted.</p>`:''}`:items.length?items.map(a=>`<div class="sp-result"><div><strong>${a.platform?esc(label(a.platform))+' · ':''}${esc(a.title)}</strong>${a.labels?`<p class="sp-count">${esc(a.labels)}</p>`:''}</div><button class="btn ghost" data-sp-task="${esc(a.id)}">Review</button></div>`).join(''):'<p>Nothing needs attention.</p>';
  host.innerHTML=css+heading+detail+`${p.attentionError?`<p role="alert">${esc(p.attentionError)}</p>`:''}${p.attentionPending?'<p class="sp-count">Save not confirmed.</p><button class="btn ghost" id="spRetryAttention">Retry save</button>':''}<p id="spLive" role="status" aria-live="polite"></p><button class="btn ghost" id="spRefreshAttention">Refresh</button>`;
  document.getElementById('spAttentionBack').onclick=()=>{if(s.busy||p.attentionPending)return;if(task)p.attentionId=null;else s.view='graphics';h.draw(s);};
  document.querySelectorAll('[data-sp-task]').forEach(b=>b.onclick=()=>openAttention(s,b.dataset.spTask));
  document.querySelectorAll('[data-sp-open]').forEach(b=>b.onclick=()=>{p.returnView='social_attention';void openPost(s,b.dataset.spOpen);});
  document.getElementById('spAttentionAccounts')?.addEventListener('click',()=>{s.view='accounts';h.draw(s);});
  document.getElementById('spPrepareCorrection')?.addEventListener('click',()=>prepareCorrection(s,task));
  document.getElementById('spHandled')?.addEventListener('click',()=>{if(p.attentionPending)return void handleAttention(s);if(confirm('Have you corrected, removed or clearly superseded the old '+label(task.platform)+' announcement?'))void handleAttention(s,task);});
  document.getElementById('spRetryAttention')?.addEventListener('click',()=>handleAttention(s));
  document.getElementById('spRefreshAttention').onclick=async()=>{if(s.busy||p.attentionPending)return;s.busy=true;h.lock(true);try{await refreshContext(s);p.attentionError='';}catch(e){p.attentionError=e.message;}finally{s.busy=false;h.lock(false);if(h.here(s))attention(s);}};
 }
 async function handleAttention(s,task){
  const p=state(s);if(s.busy||demo)return;const request=p.attentionPending||{id:task.id,revision:task.revision,confirmed:true,request_id:crypto.randomUUID()};p.attentionPending=request;s.busy=true;h.lock(true);
  try{await rpc(s,'attention_handled',request);p.attentionPending=null;p.context.attention=(p.context.attention||[]).filter(a=>a.id!==request.id);if(p.review)p.review.attention=(p.review.attention||[]).filter(a=>a.id!==request.id);p.attentionId=null;p.attentionError='';h.message(s,'Correction marked handled.');}
  catch(e){p.attentionError=e.message;if(/^(This task changed|Task unavailable|Confirm |Socials Manager)/.test(e.message)){p.attentionPending=null;try{await refreshContext(s);}catch{}}}
  finally{s.busy=false;h.lock(false);if(h.here(s))attention(s);}
 }
 async function prepareCorrection(s,task){
  if(s.busy||s.pending)return;const p=state(s);s.busy=true;h.lock(true);
  try{
   const post=demo?p.context.posts.find(j=>j.id===task.post_id):await rpc(s,'get',{id:task.post_id});
   if(!post)throw Error('Post unavailable.');
   if(h.refresh&&await h.refresh(s)===false)return;
   const ids=new Set(post.fixtures.map(f=>f.id)),fixtures=s.data.fixtures.filter(f=>ids.has(f.id)&&!completedFixtures(s,[f]));
   if(!fixtures.length)throw Error('These fixtures are completed. Check and correct or remove the original announcement in the social account.');
   const firstDate=fixtures.map(f=>f.published.details.days[0].date).sort()[0];
   s.date=firstDate;s.selected=new Set(fixtures.filter(f=>f.published.details.days[0].date===firstDate).map(f=>f.id));
   p.nextCaption='🏏 UPDATED TEAMS 🏏\n\nPlease use these updated team lists for the round.'+(s.design.footer?'\n\n'+s.design.footer:'');
   s.view='graphics';p.returnView=null;h.message(s,'Current teams selected. Check the graphics, then Review & post. The correction task stays open until the old announcement is handled.');
  }catch(e){p.attentionError=e.message;}
  finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}
 }
 async function openHandover(s){
  const p=state(s);if(s.busy||s.pending||p.coverPending)return;s.busy=true;h.lock(true);
  try{await refreshContext(s);s.view='publish_handover';p.returnView=null;}
  catch(e){p.coverMessage=e.message;}
  finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}
 }
 function handover(s){
  const p=state(s),jobs=p.context?.handover_posts||[],blocking=jobs.some(j=>j.blocks_hand_back),host=document.getElementById('socialContent');
  host.innerHTML=css+`<div class="sp-heading"><h3>Hand back socials</h3><button class="btn ghost" id="spHandoverBack">← Social accounts</button></div>${jobs.length?`<p>${blocking?'Review these scheduled posts before handing back. Another manager can take responsibility after checking them, or you can cancel them.':'These posts need attention. Club Admin and the Socials Manager will retain their alerts after hand-back.'}</p>${jobs.map(j=>`<div class="sp-result"><div><strong>${esc(j.images?.map(i=>i.label).join(', ')||'Team announcement')}</strong><p class="sp-count">${esc(scheduleLabel(s,j.scheduled_for))} · ${j.blocks_hand_back?'Review before hand-back':'Needs attention'}</p></div><button class="btn ghost" data-sp-open="${esc(j.id)}">Review</button></div>`).join('')}`:'<p>No scheduled posts need transferring.</p>'}<div class="social-actions"><button class="btn secondary" id="spConfirmHandBack" ${blocking||!p.context?.can_hand_back||s.busy?'disabled':''}>Hand back responsibility</button><button class="btn ghost" id="spRefreshHandover">Refresh</button></div><p id="spCoverStatus" role="status" aria-live="polite">${esc(p.coverMessage||'')}</p>${p.coverPending?'<button class="btn ghost" id="spRetryCover">Retry hand-back</button>':''}`;
  document.getElementById('spHandoverBack').onclick=()=>{if(s.busy||p.coverPending)return;s.view='accounts';h.draw(s);};
  document.querySelectorAll('[data-sp-open]').forEach(b=>b.onclick=()=>{p.returnView='publish_handover';void openPost(s,b.dataset.spOpen);});
  document.getElementById('spConfirmHandBack').onclick=()=>changeCover(s,{operation:'hand_back'});
  document.getElementById('spRefreshHandover').onclick=()=>openHandover(s);
  document.getElementById('spRetryCover')?.addEventListener('click',()=>changeCover(s));
 }

 function mount(s){
  const p=state(s),host=document.getElementById('socialContent');if(!host)return;
  const status=p.loading?'Checking accounts…':p.error?esc(p.error):connected(p)?esc(p.context.connection.page_name)+(p.context.connection.instagram_name?' · @'+esc(p.context.connection.instagram_name):''):p.context?.configured===false?'Direct posting setup pending. You can still prepare your post.':'Connect your club accounts to post directly.';
  const available=s.data.fixtures.filter(f=>f.published.details.days[0].date===s.date&&!completedFixtures(s,[f]));
  const box=document.createElement('section');box.className='sp-postbar';box.setAttribute('aria-label','Team posting');box.innerHTML=css+`<div class="sp-postbar-main"><div class="sp-postbar-copy"><h3>${available.length?'Team post':'Posting history'}</h3><p>${available.length?'One blurb with all selected team lists.':'Completed team announcements are read-only.'}</p></div><div class="sp-postbar-actions">${available.length?'<button class="btn secondary" id="spReview">Review &amp; post</button>':''}<button class="btn ghost" id="spAccounts">Social accounts</button>${attentionButton(s)}</div></div><div class="sp-postbar-meta"><p class="sp-count" role="status">${status}</p>${history(s)}</div>`;
  host.prepend(box);document.getElementById('spReview')?.addEventListener('click',()=>startReview(s));document.getElementById('spAccounts').onclick=()=>{s.view='accounts';h.draw(s);};document.getElementById('spAttention')?.addEventListener('click',()=>openAttention(s));bindHistory(s);
  if((!p.context||p.loadedAt&&Date.now()-p.loadedAt>60000)&&!p.loading&&!p.error)void load(s);
 }
 function completedFixtures(s,fixtures){
  const today=new Date().toLocaleDateString('en-CA',{timeZone:s.data.timezone||'Australia/Sydney'});
  return fixtures.some(f=>f.completed===true||((f.published?.details?.days||[]).map(d=>d.date).filter(Boolean).sort().at(-1)||'9999-12-31')<today);
 }
 function completedWarning(s){const message='This fixture is completed. Its team announcement cannot be posted or reposted.';h.message(s,message);window.alert(message);}
 function reviewCompleted(s,r){const ids=r.fixtures.filter(f=>f.source_type!=='award').map(f=>f.id);return completedFixtures(s,s.data.fixtures.filter(f=>ids.includes(f.id)))||(s.data.fixture_calendar||[]).some(f=>ids.includes(f.id)&&f.completed);}
 function awardsHistory(s,host){
  if(!host)return;const p=state(s);host.innerHTML=css+history(s);host.querySelectorAll('[data-sp-open]').forEach(b=>b.onclick=()=>{p.returnView='awards';void openPost(s,b.dataset.spOpen);});
  if((!p.context||p.loadedAt&&Date.now()-p.loadedAt>60000)&&!p.loading&&!p.error)void load(s);
 }
 async function startAwards(s,editions,caption=''){
  const p=state(s);if(s.busy||s.pending||!editions.length)return;
  if(editions.length>10){h.message(s,'Choose up to ten graphics for one post.');return;}
  s.busy=true;h.lock(true);h.message(s,'Preparing your combined award post…');let r;
  try{
   if(!demo&&(!p.checkedAt||Date.now()-p.checkedAt>60000))await load(s,false,true);
   const checks=editions.map(e=>({id:e.id,source_type:'award',kind:e.kind,artwork_key:e.image_sha}));
   if(p.review?.state==='draft'&&p.review.renderer==='social-awards.178'&&JSON.stringify(p.review.fixtures)===JSON.stringify(checks)&&p.review.uploaded){p.review.caption=caption;p.returnView='awards';s.view='publish_review';return;}
   if(p.review)for(const u of p.review.urls||[])URL.revokeObjectURL(u);
   r={id:crypto.randomUUID(),renderer:'social-awards.178',fixtures:checks,images:[],blobs:[],urls:[],caption,targets:targets(p),state:'draft',destinations:[],uploaded:false};
   for(let i=0;i<editions.length;i++){
    const e=editions[i],source=await supabase.storage.from(e.bucket).download(e.image_path);if(source.error||!source.data)throw Error('A saved award image could not load.');
    const u=URL.createObjectURL(source.data);let image;try{image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('A saved award image could not load.'));img.src=u;});}finally{URL.revokeObjectURL(u);}
    if(!h.here(s))return;const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d'),scale=Math.min(canvas.width/image.naturalWidth,canvas.height/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
    ctx.fillStyle=s.design.primary||'#073554';ctx.fillRect(0,0,1080,1350);ctx.drawImage(image,(1080-width)/2,(1350-height)/2,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));if(!blob||blob.size>8388608)throw Error('The posting image is too large. Use a smaller background.');
    const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');r.blobs.push(blob);r.urls.push(URL.createObjectURL(blob));r.images.push({path:clubId(s)+'/'+r.id+'/'+i+'.jpg',fixture_id:e.id,sha256:sha,bytes:blob.size,label:e.label});
   }
   p.review=r;p.returnView='awards';s.view='publish_review';
   if(!demo){savePost(p,await rpc(s,'draft',{id:r.id,renderer:r.renderer,fixtures:r.fixtures,images:r.images,caption:r.caption}));await upload(s,r);}else r.uploaded=true;
   h.message(s,'Ready to review. Nothing has been posted.');
  }catch(e){h.message(s,e.message);if(r){p.review=r;p.returnView='awards';r.error=e.message;s.view='publish_review';}}
  finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}
 }
 async function startReview(s){
  const p=state(s),fixtures=h.selection(s);if(s.busy||s.pending)return;
  if(!fixtures.length){h.message(s,(s.data.fixture_calendar||[]).some(f=>f.date===s.date&&!f.published)?'Publish the teams for this date in Selection board first.':'Choose at least one grade first.');return;}
  if(completedFixtures(s,fixtures)){completedWarning(s);return;}
  const cards=fixtures.flatMap(h.cards);if(cards.some(card=>s.photoPositions?.[card.key])){h.message(s,'Confirm the photo position before preparing your post.');return;}if(cards.length>10){h.message(s,'Choose up to ten images for one post. Different two-day line-ups count as separate images.');return;}
  if(fixtures.some(f=>f.feature_valid===false)){h.message(s,'Choose a featured player who is in the current team, then review again.');return;}
  s.busy=true;h.lock(true);h.message(s,'Preparing the exact images for your review…');
  let r;
  try{
   if(!demo&&(!p.checkedAt||Date.now()-p.checkedAt>60000))await load(s,false,true);
   const checks=fixtures.map(f=>({id:f.id,artwork_key:f.artwork_key}));
   if(!demo)await h.artwork(s,'validate_export',{fixtures:checks});
   if(p.review?.state==='draft'&&JSON.stringify(p.review.fixtures)===JSON.stringify(checks)&&p.review.uploaded){s.view='publish_review';h.message(s,'Ready to review. Nothing has been posted.');return;}
   const caption=p.review?.state==='draft'&&p.review.selectionDate===s.date?p.review.caption:p.nextCaption||defaultCaption(s);
   if(p.review)for(const u of p.review.urls||[])URL.revokeObjectURL(u);
   r={id:crypto.randomUUID(),renderer:'0.8.62.143',fixtures:checks,images:[],blobs:[],urls:[],caption,selectionDate:s.date,targets:targets(p),state:'draft',destinations:[],uploaded:false};
   for(let i=0;i<cards.length;i++){
    if(!h.here(s))return;const card=cards[i],canvas=document.createElement('canvas'),result=await h.renderImage(s,card,canvas);if(result?.invalid)throw Error('A featured player changed. Refresh and review again.');
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.95));if(!blob)throw Error('An image could not be prepared. Try again.');
    const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');
    r.blobs.push(blob);r.urls.push(URL.createObjectURL(blob));r.images.push({path:clubId(s)+'/'+r.id+'/'+i+'.jpg',fixture_id:card.f.id,sha256:sha,bytes:blob.size,label:card.f.published.details.grade+(card.split?' · Day '+(card.day+1):'')});
   }
   if(!demo)await h.artwork(s,'validate_export',{fixtures:checks});
   p.review=r;p.nextCaption=null;p.returnView=null;s.view='publish_review';
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
   const r={...post,urls:[],blobs:[],uploaded:true};if(r.renderer==='social-awards.178'&&!['social_attention','publish_handover'].includes(p.returnView))p.returnView='awards';p.review=r;s.view='publish_review';if(r.state==='draft')r.caption=recall(s,r);
   for(const img of r.images){const res=await supabase.storage.from('club-social-posts').download(img.path);if(res.error){r.uploaded=false;r.error='This draft has an incomplete image upload. Return to '+(r.renderer==='social-awards.178'?'Socials Awards':'Team graphics')+' and prepare a new review.';break;}r.urls.push(URL.createObjectURL(res.data));}
   if(r.state==='draft')r.targets=targets(p);
  }catch(e){h.message(s,e.message);}finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}
 }
 function review(s){
  const p=state(s),r=p.review,host=document.getElementById('socialContent');clearTimeout(p.poll);if(!r){s.view='graphics';h.draw(s);return;}
  const awards=r.renderer==='social-awards.178',draft=r.state==='draft',c=p.context?.connection,available=targets(p),isScheduled=scheduled(r),tz=zone(s);if(!r.localSchedule)r.localSchedule=localTime(r.scheduled_for||Date.now()+3600000,tz);
  if(draft&&!r.targets?.length)r.targets=available;
  host.innerHTML=css+`<div class="sp-heading"><h3>${draft?(awards?'Your awards post':'Your team post'):isScheduled?'Scheduled post':'Posting result'}</h3><button class="btn ghost" id="spBack">${p.returnView==='publish_handover'?'← Hand-back':p.returnView==='social_attention'?'← Needs attention':p.returnView==='awards'?'← Socials Awards':'← Team graphics'}</button></div><p>${draft?(awards?'One blurb, with all selected award graphics together in one post on each chosen account.':'One blurb, with all selected team lists together in one post on each chosen account.'):isScheduled?'Scheduled for '+esc(scheduleLabel(s,r.scheduled_for))+'. Your reviewed images and blurb are saved.':'Your approved images and blurb are saved with this request.'}</p><section class="sp-panel"><label for="spCaption"><strong>Blurb</strong></label><p class="sp-count" id="spBlurbHelp">A short intro for the whole post. Add your round, a message and any hashtags.</p><textarea class="sp-caption" id="spCaption" aria-describedby="spBlurbHelp spCount" placeholder="Add a message for this round…" ${draft?'':'readonly'}>${esc(r.caption)}</textarea><p id="spCount" class="sp-count"></p><button class="btn ghost" id="spCopyBlurb">Copy blurb</button><p id="spCopyStatus" class="sp-count" role="status"></p></section><h3>${awards?'Award graphics':'Team lists'} · ${r.images.length} ${r.images.length===1?'image':'images'}</h3><p class="sp-count">These images will be attached to the same post, in the order shown.</p><div class="sp-preview">${r.images.map((img,i)=>`<figure>${r.urls[i]?`<img src="${esc(r.urls[i])}" alt="${esc(img.label)}">`:'<p>Image unavailable</p>'}<figcaption>${i+1}. ${esc(img.label)}</figcaption></figure>`).join('')}</div><section class="sp-panel">${draft?`<h3>Post to</h3>${c?['facebook','instagram'].map(t=>`<label class="sp-target"><input type="checkbox" data-sp-target="${t}" ${r.targets.includes(t)?'checked':''} ${!available.includes(t)?'disabled':''}><span><strong>${label(t)}</strong> · ${esc(t==='facebook'?c.page_name:c.instagram_name?'@'+c.instagram_name:'No professional account connected')}</span></label>`).join(''):'<p>Your club’s accounts are not connected yet.</p>'}${!connected(p)||!p.context?.configured||p.context?.health&&available.length<(c?.instagram_id?2:1)?'<button class="btn ghost" id="spReviewAccounts">Social accounts</button>':''}<div class="se-form-grid"><label>When to post<select id="spDelivery"><option value="now" ${r.delivery!=='later'?'selected':''}>Post now</option><option value="later" ${r.delivery==='later'?'selected':''}>Schedule post</option></select></label><label id="spScheduleField" ${r.delivery==='later'?'':'hidden'}>Posting time · ${esc(tz.replaceAll('_',' '))}<input type="datetime-local" id="spScheduleTime" value="${esc(r.localSchedule)}"></label></div><p class="sp-count" id="spScheduleHelp">${awards?'Scheduled posts use the club’s time zone and these saved graphics.':'Scheduled posts use the club’s time zone. If the published teams or artwork change before sending, the post is held for review in Posting history.'}</p>${r.error?`<p role="alert">${esc(r.error)}</p>`:''}<p id="spLive" class="sp-live" role="status" aria-live="polite"></p><div class="social-actions"><button class="btn secondary" id="spPost"></button>${!r.uploaded&&r.blobs.length===r.images.length?'<button class="btn ghost" id="spRetryUpload">Retry preparing review</button>':''}</div><p class="sp-count">${demo?'Demo only. No posts will be sent.':'Post now publishes the reviewed post. Schedule post approves it for your chosen time. There is no further confirmation.'}</p>`:`<div aria-live="polite">${resultRows(r)}</div>${isScheduled?`<label>Posting time · ${esc(tz.replaceAll('_',' '))}<input id="spNewScheduleTime" type="datetime-local" value="${esc(r.localSchedule)}"></label><div class="social-actions"><button class="btn ghost" id="spReschedule">Change posting time</button><button class="btn ghost" id="spCancelSchedule">Cancel schedule</button>${r.approved_by&&r.approved_by!==s.scope.split(':')[0]?'<button class="btn ghost" id="spTakeSchedule">Take responsibility</button>':''}</div><p class="sp-count">Cancel returns this post to draft so you can change the blurb or prepare new graphics.</p>`:''}${r.error?`<p role="alert">${esc(r.error)}</p>`:''}${p.schedulePending?'<button class="btn ghost" id="spRetrySchedule">Retry schedule change</button>':''}<p id="spLive" class="sp-live" role="status"></p><div class="social-actions"><button class="btn ghost" id="spCheck">Refresh result</button>${p.context?.attention_supported&&!isScheduled&&(r.destinations||[]).some(d=>['queued','failed','blocked'].includes(d.state))&&!(r.destinations||[]).some(d=>['processing','publishing','uncertain'].includes(d.state))?'<button class="btn ghost" id="spCancelUnposted">Cancel remaining posts</button>':''}${(r.destinations||[]).some(d=>['failed','blocked'].includes(d.state))?'<button class="btn secondary" id="spRetryPost">Retry unposted destinations</button>':''}</div>`}</section>`;
  document.getElementById('spBack').onclick=()=>{if(s.busy||p.schedulePending)return;s.view=p.returnView||'graphics';h.draw(s);};
  const area=document.getElementById('spCaption'),count=document.getElementById('spCount');
  document.getElementById('spCopyBlurb').onclick=async()=>{try{await navigator.clipboard.writeText(area.value);document.getElementById('spCopyStatus').textContent='Blurb copied.';}catch{document.getElementById('spCopyStatus').textContent='Select the blurb above and copy it.';}};
  const update=()=>{r.caption=area.value;count.textContent=`${Array.from(r.caption).length.toLocaleString()} / 2,200 characters`;count.classList.toggle('sp-caption-count-over',Array.from(r.caption).length>2200);if(!draft)return;r.targets=[...host.querySelectorAll('[data-sp-target]:checked:not(:disabled)')].map(e=>e.dataset.spTarget);const button=document.getElementById('spPost');button.textContent=demo?'Demo — preview only':r.delivery==='later'?'Schedule post':'Post to '+(r.targets.map(label).join(' & ')||'selected accounts');button.disabled=demo||s.busy||!r.uploaded||!r.targets.length||!p.context?.configured||!connected(p)||Array.from(r.caption).length>2200;remember(s,r);};
  document.getElementById('spDelivery')?.addEventListener('change',e=>{r.delivery=e.target.value;document.getElementById('spScheduleField').hidden=r.delivery!=='later';update();});document.getElementById('spScheduleTime')?.addEventListener('input',e=>{r.localSchedule=e.target.value;});
  area.oninput=update;host.querySelectorAll('[data-sp-target]').forEach(e=>e.onchange=update);update();
  document.getElementById('spReviewAccounts')?.addEventListener('click',()=>{s.view='accounts';h.draw(s);});
  document.getElementById('spPost')?.addEventListener('click',()=>publish(s));
  document.getElementById('spRetryUpload')?.addEventListener('click',async()=>{if(s.busy)return;s.busy=true;h.lock(true);try{savePost(p,await rpc(s,'draft',{id:r.id,renderer:r.renderer,fixtures:r.fixtures,images:r.images,caption:r.caption}));await upload(s,r);}catch(e){r.error=e.message;}finally{s.busy=false;h.lock(false);if(h.here(s))h.draw(s);}});
  document.getElementById('spCheck')?.addEventListener('click',()=>refreshPost(s));
  document.getElementById('spRetryPost')?.addEventListener('click',()=>publish(s,true));
  document.getElementById('spReschedule')?.addEventListener('click',()=>changeSchedule(s,'reschedule',document.getElementById('spNewScheduleTime').value));
  document.getElementById('spCancelSchedule')?.addEventListener('click',()=>changeSchedule(s,'cancel_schedule'));
  document.getElementById('spTakeSchedule')?.addEventListener('click',()=>changeSchedule(s,'reschedule',localTime(r.scheduled_for,zone(s))));
  document.getElementById('spRetrySchedule')?.addEventListener('click',()=>changeSchedule(s));
  document.getElementById('spCancelUnposted')?.addEventListener('click',()=>changeSchedule(s,'cancel_unposted'));
  if(!draft&&!isScheduled&&(r.destinations||[]).some(d=>['queued','processing','publishing'].includes(d.state)))p.poll=setTimeout(()=>{if(h.here(s)&&s.view==='publish_review')void refreshPost(s);},4000);
 }
 async function refreshPost(s){const p=state(s),r=p.review;if(!r||demo)return;try{acceptPost(p,r,await rpc(s,'get',{id:r.id}));if(h.here(s)&&s.view==='publish_review')review(s);}catch(e){live(s,e.message+' Your saved request remains in Posting history.');}}
 async function publish(s,retry=false){
  const p=state(s),r=p.review;if(s.busy||!r||demo)return;if(reviewCompleted(s,r)){completedWarning(s);return;}
  s.busy=true;h.lock(true);live(s,retry?'Retrying the unposted destinations…':'Posting request is being saved…');
  try{
   const data=retry?{id:r.id}:{id:r.id,caption:r.caption,targets:r.targets,connection_revision:p.context.connection.revision,...(r.delivery==='later'?{scheduled_for:scheduleTime(r.localSchedule,zone(s))}:{})};
   const result=await invoke(s,retry?'retry':'publish',{data});acceptPost(p,r,result.post);r.error='';
   live(s,scheduled(r)?'Scheduled for '+scheduleLabel(s,r.scheduled_for)+'.':'Posting is underway. You can return later to see the result.');
  }catch(e){
   // A lost response may hide a successful approval. Query the same ID; never create another post.
   try{acceptPost(p,r,await rpc(s,'get',{id:r.id}));}catch{}
   if(e.message.includes('fixture is completed'))window.alert(e.message);r.error=e.message;h.message(s,e.message+' Check this saved request before trying again.');
  }finally{s.busy=false;h.lock(false);if(h.here(s))review(s);}
 }
 function accounts(s){
  const p=state(s),c=p.context?.connection,health=p.context?.health,host=document.getElementById('socialContent');
  const active=!!c&&c.status!=='disconnected',ready=targets(p),isReady=active&&health&&ready.length>0;
  const step=p.connecting?1:isReady?3:active?2:1;
  const row=t=>{const value=health?.[t],name=t==='facebook'?c?.page_name:c?.instagram_name?'@'+c.instagram_name:'Not connected';const labels={ready:'Ready to post',reconnect:'Reconnect needed',available:'Available to connect',not_connected:'Optional',unavailable:'Check again'};return `<div class="sp-result"><div><strong>${label(t)}</strong><p>${esc(name||'Not connected')}</p><small>${esc(value?.message||'Checking the saved connection…')}</small></div><span class="${value?.state==='ready'?'sp-success':'sp-warning'}">${esc(labels[value?.state]||'Checking…')}</span></div>`;};
  host.innerHTML=css+`<style>.sp-steps{display:flex;list-style:none;gap:12px;padding:0;margin:20px 0 26px}.sp-steps li{flex:1;border-top:3px solid #dce2ee;padding-top:10px;color:#58687d;font-size:14px}.sp-steps li[aria-current=step]{border-color:#17245f;color:#17245f;font-weight:700}.sp-steps li.is-done{border-color:#26834f;color:#11633d}.sp-help{margin-top:20px;padding-top:16px;border-top:1px solid #dce2ee}.sp-help summary{cursor:pointer;font-weight:700}.sp-help h4{margin-bottom:6px}.sp-help p{margin-top:6px}</style>
   ${coverPanel(s)}<section class="sp-panel"><h3>${isReady?'Your club accounts are connected':'Connect your club accounts'}</h3><p>Connect once. Then your socials managers can review and post team selections and awards.</p>
   <ol class="sp-steps" aria-label="Connection progress">${['Sign in','Choose your club','Ready to post'].map((name,i)=>`<li ${i+1===step?'aria-current="step"':''} class="${i+1<step?'is-done':''}">${i+1}. ${name}</li>`).join('')}</ol>
   ${demo?'<p class="sp-count">This is an example connection. The demo cannot connect accounts or send posts.</p>':''}
   ${p.context?.configured===false?'<div class="notice"><strong>Teams is getting direct posting ready.</strong><p>There is nothing for your club to install. You can keep downloading your graphics while this is activated.</p></div>':active?row('facebook')+row('instagram'):'<p>Sign in with the Facebook account you use to manage the club Page. We will find your Pages and any linked Instagram account for you.</p><p class="sp-count">Nothing is posted while you connect. You approve each post separately after reviewing it.</p>'}
   ${p.error?`<p role="alert">${esc(p.error)}</p>`:''}
   <p id="spLive" role="status" aria-live="polite">${p.connecting?'Finish the connection in the Facebook window. This screen will update when you return.':p.loading?'Checking the connection automatically…':health?.checked_at?'Connection checked '+esc(new Date(health.checked_at).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'}))+'.':''}</p>
   <div class="social-actions">${(p.context?.can_connect??p.context?.admin)&&p.context?.configured!==false?`<button class="btn ${isReady?'ghost':'secondary'}" id="spConnect" ${demo||p.loading||p.connecting||s.busy?'disabled':''}>${active?(ready.length===2?'Change connected accounts':'Reconnect / add Instagram'):'Connect Facebook & Instagram'}</button>`:p.context&&!p.context.admin?'<p>A Socials Manager or Club Admin can connect the accounts, review the team post and publish or schedule it.</p>':''}<button class="btn ${isReady?'secondary':'ghost'}" id="spAccountBack">${p.review?'Back to review':'Choose team graphics'}</button><button class="btn ghost" id="spReloadAccounts" ${p.loading||p.connecting?'disabled':''}>Check connection</button></div>
   ${p.context?.configured!==false?`<details class="sp-help"><summary>Need a hand connecting?</summary><h4>My club Page is missing</h4><p>Use the Facebook account with permission to create posts for the club. During sign-in, include the club Page and allow the requested access. Then try connecting again.</p><h4>Instagram is missing</h4><p>Facebook can work on its own. To add Instagram, link the club’s professional Instagram account in the Facebook Page’s settings, then reconnect here.</p><h4>Does the club need to install anything?</h4><p>No. Sign in, choose the club Page and allow access. The Teams connection is shared by Club Admin and your authorised socials managers.</p>${!demo&&p.context?.admin&&active?'<button class="btn ghost" id="spDisconnect">Disconnect accounts</button>':''}</details>`:''}
   </section>`;
  document.getElementById('spReloadAccounts').onclick=()=>load(s,true,true);
  document.getElementById('spAccountBack').onclick=()=>{s.view=p.review?'publish_review':p.returnView||'graphics';h.draw(s);};
  document.getElementById('spConnect')?.addEventListener('click',()=>connect(s));
  document.getElementById('spDisconnect')?.addEventListener('click',async()=>{if(!confirm('Disconnect the club accounts? New posts will stop until a Socials Manager or Club Admin reconnects them.'))return;try{await rpc(s,'disconnect');await load(s,true,true);}catch(e){live(s,e.message);}});
  document.getElementById('spArrangeCover')?.addEventListener('click',()=>{p.coverEditing=!p.coverEditing;h.draw(s);});
  document.getElementById('spHandBack')?.addEventListener('click',()=>p.context?.attention_supported?openHandover(s):changeCover(s,{operation:'hand_back'}));
  document.getElementById('spRetryCover')?.addEventListener('click',()=>changeCover(s));
  document.getElementById('spManageSocials')?.addEventListener('click',()=>{if(!s.busy){s.view='managers';h.draw(s);}});
  document.getElementById('spCoverForm')?.addEventListener('input',e=>{p.coverChoice=Object.fromEntries(new FormData(e.currentTarget));});
  document.getElementById('spCoverForm')?.addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(!data.user_id||!data.from||data.until<data.from){p.coverMessage='Choose a replacement and a valid date range.';document.getElementById('spCoverStatus').textContent=p.coverMessage;return;}void changeCover(s,{operation:'delegate',...data});});
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
 return {mount,review,accounts,load,attention,handover,startAwards,awardsHistory};
}
