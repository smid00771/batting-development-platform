const escapeAssist=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assistCategories={help:'Help with the platform',enquiry:'Product enquiry',idea:'Suggest a change'};
const assistTime=value=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const assistStatus=(t,platform)=>t.status==='resolved'?'Resolved':t.last_side==='club'?(platform?'Needs a reply':'Waiting for Mirelion'):(platform?'Waiting for club':'Mirelion replied');

export function createMirelionAssist({supabase,getContext,onUnread=()=>{},demo=false}){
 const states=new Map();let mounted=null,timer=null,identity=null,epoch=0;
 const scope=c=>c?.userId?(c.platform?'platform':c.clubId)?`${c.userId}:${c.platform?'platform':c.clubId}`:'':'';
 const current=c=>scope(c)===scope(getContext());
 const contextData=c=>c.platform?{platform:true}:{club_id:c.clubId};
 const rpc=async(c,action,data={})=>{
  const r=await supabase.rpc('mirelion_assist',{p_action:action,p_data:{...contextData(c),...data}});
  if(r.error)throw Object.assign(new Error(r.error.message||'Mirelion Assist could not connect.'),{code:r.error.code});
  return r.data;
 };
 const state=c=>{const key=scope(c);if(!states.has(key))states.set(key,{selected:null,filter:'open',search:'',offset:0,threads:[],drafts:new Map(),newDraft:{subject:'',body:'',category:'help',include_guide:false},pending:null,busy:false});return states.get(key);};
 const valid=m=>mounted===m&&m.root?.isConnected&&m.host.contains(m.root)&&current(m.context)&&m.epoch===epoch;
 const status=(m,text)=>{if(valid(m))m.host.querySelector('[data-assist-feedback]').textContent=text;};
 function reset(){epoch++;states.clear();mounted=null;identity=null;clearTimeout(timer);timer=null;onUnread(0,null);}
 async function unread(c=getContext()){
  if(!scope(c))return;
  try{const d=await rpc(c,'summary');if(current(c))onUnread(Number(d?.unread||0),c);}catch{/* Keep any known unread count through a brief connection failure. */}
 }
 function start(){
  const c=getContext();if(identity&&identity!==c?.userId)reset();identity=c?.userId||null;
  clearTimeout(timer);if(!scope(c))return;
  void unread(c);schedule();
 }
 function schedule(){
  clearTimeout(timer);timer=setTimeout(async()=>{
   if(document.visibilityState!=='hidden'){
    const c=getContext();if(identity!==c?.userId){reset();return;}
    if(mounted&&valid(mounted))await refresh(mounted);else await unread(c);
   }
   if(identity)schedule();
  },mounted&&valid(mounted)?8000:30000);
  timer?.unref?.();
 }
 function draft(s){return s.selected?(s.drafts.get(s.selected)||{body:''}):s.newDraft;}
 function saveDraft(s,value){if(s.selected)s.drafts.set(s.selected,value);else s.newDraft=value;}
 function hasChanges(){return [...states.values()].some(s=>!!(s.busy||s.pending||s.newDraft.body||s.newDraft.subject||[...s.drafts.values()].some(d=>d.body)));}
 function canLeave(){const s=states.get(scope(getContext()));if(s?.busy){alert('Wait for this message to finish sending.');return false;}return true;}
 function rowHtml(t,c,selected){return `<button type="button" class="assist-thread${selected===t.id?' is-selected':''}" data-assist-thread="${escapeAssist(t.id)}" aria-pressed="${selected===t.id}"><span class="assist-thread-top"><strong>${escapeAssist(t.subject)}</strong>${t.unread?`<span class="assist-unread" aria-label="${Number(t.unread)} unread messages">${Number(t.unread)}</span>`:''}</span>${c.platform?`<span>${escapeAssist(t.club_name)} · ${escapeAssist(t.requester_name)}</span>`:''}<small>${escapeAssist(assistStatus(t,c.platform))} · ${escapeAssist(assistTime(t.updated_at))}</small><span class="assist-preview">${escapeAssist(t.preview)}</span></button>`;}
 function renderList(m){
  if(!valid(m))return;const {host,s,context:c}=m;
  host.querySelector('[data-assist-list]').innerHTML=s.threads.length?s.threads.map(t=>rowHtml(t,c,s.selected)).join(''):`<p class="help">${s.filter==='resolved'?'No resolved conversations.':c.platform?'No messages are waiting.':'Your conversations with Mirelion will appear here.'}</p>`;
  host.querySelector('[data-assist-more]').hidden=!s.hasMore;
  host.querySelectorAll('[data-assist-thread]').forEach(b=>b.onclick=()=>open(m,b.dataset.assistThread));
 }
 async function loadList(m){
  const {s,context:c}=m;const key=`${s.filter}:${s.search}:${s.offset}`;
  const r=await rpc(c,'list',{status:s.filter,search:s.search,offset:s.offset});
  if(!valid(m)||key!==`${s.filter}:${s.search}:${s.offset}`)return;
  s.threads=r.threads||[];s.hasMore=!!r.has_more;renderList(m);
 }
 function renderCompose(m){
  if(!valid(m))return;const {s,host,context:c}=m;const d=draft(s),isNew=!s.selected;
  const pane=host.querySelector('[data-assist-conversation]');
  if(isNew&&c.platform){pane.innerHTML='<p class="help">Open a club message to read and reply.</p>';return;}
  pane.innerHTML=`<header class="assist-conversation-heading"><h2 data-assist-subject>${isNew?'Message us':'Loading conversation…'}</h2>${isNew?'':'<button type="button" class="btn ghost" data-assist-resolve hidden>Mark resolved</button>'}</header>
   <p class="help" data-assist-thread-meta></p><div data-assist-guide></div>
   ${isNew?'':'<button type="button" class="btn ghost" data-assist-older hidden>Earlier messages</button><div class="assist-messages" data-assist-messages role="log" aria-label="Conversation with Mirelion" aria-live="polite" aria-relevant="additions"></div>'}
   ${demo&&!isNew?'<button type="button" class="btn ghost" data-assist-example>Show example reply</button>':''}
   <form data-assist-compose>
    ${isNew?`<div class="assist-fields"><label>What is this about?<select name="category">${Object.entries(assistCategories).map(([v,l])=>`<option value="${v}" ${d.category===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Subject<input name="subject" maxlength="120" required value="${escapeAssist(d.subject)}" placeholder="A short description"></label></div>`:''}
    <label>${isNew?'Your message':'Reply'}<textarea name="body" maxlength="6000" rows="3" required placeholder="${isNew?'Tell us what your club needs…':'Write your reply…'}">${escapeAssist(d.body)}</textarea></label>
    ${isNew?`<label class="assist-include"><input type="checkbox" name="include_guide" ${d.include_guide?'checked':''}> Include my recent Guide conversation</label>`:''}
    <div class="btnrow"><button class="btn secondary" type="submit" data-assist-send>Send message</button><small class="help">${demo?'Demo only · messages stay in this tab':'Replies stay here · updates automatically'}</small></div>
   </form>`;
  pane.querySelector('form').oninput=()=>{
   const f=pane.querySelector('form');saveDraft(s,{body:f.elements.body.value,...(isNew?{subject:f.elements.subject.value,category:f.elements.category.value,include_guide:f.elements.include_guide.checked}:{})});
  };
  pane.querySelector('form').onsubmit=e=>{e.preventDefault();void send(m);};
  pane.querySelector('[data-assist-resolve]')?.addEventListener('click',()=>void changeStatus(m));
  pane.querySelector('[data-assist-older]')?.addEventListener('click',()=>void loadThread(m,true));
  pane.querySelector('[data-assist-example]')?.addEventListener('click',async()=>{
   if(m.s.busy)return;
   await rpc(m.context,'example_reply',{thread_id:m.s.selected});await refresh(m);status(m,'Fictional reply shown for this demonstration.');
  });
  setBusy(m);
 }
 function setBusy(m){
  if(!valid(m))return;const pending=m.s.pending,locked=m.s.busy||!!pending;
  m.host.querySelectorAll('[data-assist-compose] input,[data-assist-compose] textarea,[data-assist-compose] select').forEach(e=>e.disabled=locked);
  const b=m.host.querySelector('[data-assist-send]');if(b){b.disabled=m.s.busy||!!(pending&&pending.action==='status');b.textContent=m.s.busy?'Sending…':pending?'Retry sending':'Send message';}
  const close=m.host.querySelector('[data-assist-resolve]');if(close){close.disabled=m.s.busy||!!(pending&&pending.action!=='status');if(pending?.action==='status')close.textContent='Retry status change';}
 }
 async function open(m,id){
  if(!valid(m)||m.s.busy)return;
  if(m.s.pending&&m.s.selected!==id){status(m,'Retry the unconfirmed message before opening another conversation.');return;}
  m.s.selected=id;m.detail=null;m.messages=[];m.lastRead=null;m.oldestLoaded=false;m.hasOlder=false;m.threadBusy=false;m.loadVersion=(m.loadVersion||0)+1;
  renderList(m);renderCompose(m);status(m,'');if(id)await loadThread(m);
 }
 function renderMessages(m){
  const box=m.host.querySelector('[data-assist-messages]');if(!box)return;
  const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  const displayed=new Set([...box.querySelectorAll('[data-assist-message]')].map(e=>e.dataset.assistMessage));
  for(const msg of m.messages){
   if(displayed.has(String(msg.id)))continue;
   const el=document.createElement('article');el.dataset.assistMessage=String(msg.id);el.className=`assist-message ${msg.side=== 'team'?'assist-from-team':''}`;
   el.innerHTML=`<header><strong>${msg.side==='team'?'Mirelion':escapeAssist(m.detail.requester_name||'Club member')}</strong><time datetime="${escapeAssist(msg.created_at)}">${escapeAssist(assistTime(msg.created_at))}</time></header><p>${escapeAssist(msg.body)}</p>`;
   const next=[...box.children].find(e=>Number(e.dataset.assistMessage)>Number(msg.id));box.insertBefore(el,next||null);
  }
  if(nearBottom&&!m.loadingOlder)box.scrollTop=box.scrollHeight;
 }
 async function loadThread(m,older=false){
  if(!valid(m)||!m.s.selected||m.threadBusy)return;
  m.threadBusy=true;const id=m.s.selected,version=m.loadVersion;
  try{
   const r=await rpc(m.context,'thread',{thread_id:id,...(older&&m.messages?.length?{before:m.messages[0].id}:{})});
   if(!valid(m)||id!==m.s.selected||version!==m.loadVersion)return;
   m.detail=r.thread;m.loadingOlder=older;
   const byId=new Map((m.messages||[]).map(x=>[x.id,x]));for(const msg of r.messages||[])byId.set(msg.id,msg);
   m.messages=[...byId.values()].sort((a,b)=>a.id-b.id);
   const host=m.host;host.querySelector('[data-assist-subject]').textContent=r.thread.subject;
   host.querySelector('[data-assist-thread-meta]').textContent=[m.context.platform?`${r.thread.club_name} · ${r.thread.requester_name||'Club member'}`:'',assistStatus(r.thread,m.context.platform)].filter(Boolean).join(' · ');
   const close=host.querySelector('[data-assist-resolve]');close.hidden=false;close.textContent=m.s.pending?.action==='status'?'Retry status change':r.thread.status==='resolved'?'Reopen':'Mark resolved';
   const guide=host.querySelector('[data-assist-guide]');if(!guide.childNodes.length&&r.thread.guide_context?.length)guide.innerHTML=`<details><summary>Shared Guide conversation</summary>${r.thread.guide_context.map(x=>`<p><strong>${x.role==='assistant'?'Guide':x.role==='system'?'System':'You'}:</strong> ${escapeAssist(x.content)}</p>`).join('')}</details>`;
   // Keep the earlier-page cursor once the reader has loaded more than the latest page.
   if(older||!m.oldestLoaded)m.hasOlder=!!r.has_older;
   if(older)m.oldestLoaded=true;
   host.querySelector('[data-assist-older]').hidden=!m.hasOlder;
   renderMessages(m);m.loadingOlder=false;setBusy(m);
   const through=m.messages.at(-1)?.id;
   if(through&&through!==m.lastRead&&document.visibilityState!=='hidden'){
    await rpc(m.context,'read',{thread_id:id,through});
    if(valid(m)&&id===m.s.selected){m.lastRead=through;await unread(m.context);await loadList(m);}
   }
  }catch(error){status(m,error.message+' Your draft is kept.');}
  finally{if(id===m.s.selected&&version===m.loadVersion)m.threadBusy=false;}
 }
 async function mutate(m,command){
  if(!valid(m)||m.s.busy)return;const {s}=m;s.pending=command;s.busy=true;setBusy(m);status(m,'');
  try{
   const result=await rpc(m.context,command.action,command.data);
   if(!valid(m))return;
   s.pending=null;
   if(command.action==='create')s.newDraft={body:'',subject:'',category:'help',include_guide:false};
   if(command.action==='send')s.drafts.delete(s.selected);
   s.busy=false;s.filter=result.status==='resolved'?'resolved':'open';s.offset=0;
   m.host.querySelector('[data-assist-filter]').value=s.filter;
   await open(m,result.thread_id);await loadList(m);await unread(m.context);
   if(demo)status(m,'Demo only: nothing was sent to Mirelion.');
  }catch(error){
   if(!valid(m))return;
   // Definitive database errors are safe to correct; ambiguous transport errors reuse the same command.
   if(error.code&&/^(P|22|23|42)/.test(error.code))s.pending=null;
   status(m,error.message+(s.pending?(command.action==='status'?' Use Retry status change to confirm the same change.':' Use Retry sending to confirm the same message.'):' Your draft is kept.'));
   if(!s.pending&&command.action==='status')await loadThread(m);
  }finally{if(valid(m)){s.busy=false;setBusy(m);}}
 }
 async function send(m){
  if(!valid(m)||m.s.busy)return;
  if(m.s.pending)return mutate(m,m.s.pending);
  const d=draft(m.s),body=d.body.trim();if(!body){status(m,'Write a message first.');return;}
  if(!m.s.selected&&!d.subject.trim()){status(m,'Add a short subject.');return;}
  return mutate(m,{action:m.s.selected?'send':'create',data:{request_id:crypto.randomUUID(),body,...(m.s.selected?{thread_id:m.s.selected}:{subject:d.subject.trim(),category:d.category,include_guide:d.include_guide})}});
 }
 async function changeStatus(m){
  if(!m.detail||m.s.busy)return;if(m.s.pending)return mutate(m,m.s.pending);
  return mutate(m,{action:'status',data:{thread_id:m.s.selected,request_id:crypto.randomUUID(),version:m.detail.version,status:m.detail.status==='resolved'?'open':'resolved'}});
 }
 async function refresh(m){
  if(!valid(m)||m.refreshing||m.s.busy)return;m.refreshing=true;
  try{await loadList(m);await loadThread(m);await unread(m.context);}catch(e){status(m,e.message+' Messages will retry automatically.');}finally{m.refreshing=false;}
 }
 async function legacyRequests(m){
  if(!m.context.platform||!valid(m))return;
  try{
   const rows=await rpc(m.context,'legacy');if(!valid(m))return;
   const host=m.host.querySelector('[data-assist-legacy]');host.innerHTML=rows?.length?`<details><summary>Earlier requests · ${rows.length}</summary><p class="help">These requests do not yet have a signed-in club conversation.</p>${rows.map(r=>`<article class="assist-message"><h3>${escapeAssist(r.club_name)}</h3><p>${escapeAssist(r.reason)}</p><p>${escapeAssist(r.contact_email)}</p><details><summary>Guide conversation</summary>${(r.messages||[]).map(x=>`<p>${escapeAssist(x.content)}</p>`).join('')}</details><button class="btn ghost" type="button" data-assist-legacy-close="${escapeAssist(r.id)}">Mark resolved</button></article>`).join('')}</details>`:'';
   host.querySelectorAll('[data-assist-legacy-close]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await rpc(m.context,'legacy_close',{thread_id:b.dataset.assistLegacyClose});await legacyRequests(m);}catch(e){status(m,e.message);b.disabled=false;}});
  }catch(e){status(m,'Earlier requests could not load. '+e.message);}
 }
 async function mount(host,{newMessage=false,includeGuide=false}={}){
  const c=getContext();if(!host||!scope(c))return;
  if(identity&&identity!==c.userId)reset();identity=c.userId;
  const s=state(c);if(newMessage&&!s.pending)s.selected=null;if(includeGuide)s.newDraft.include_guide=true;
  const m={host,s,context:{...c},epoch,detail:null,messages:[],loadVersion:0};mounted=m;
  host.innerHTML=`${assistStyles()}<section class="assist"><header class="assist-heading"><div><h1>Mirelion Assist</h1><p>${c.platform?'Club messages and requests':'Personal support for your club'}</p></div>${c.platform?'':'<button type="button" class="btn secondary" data-assist-new>Message us</button>'}</header>
   ${c.platform?'<p class="help">Read, reply and follow up with clubs here.</p>':'<p class="help">Message the team for help or suggest a change. We aim for a live exchange when time zones overlap; replies stay here.</p><details class="assist-promise"><summary>Changes for your club</summary><p>We build requested improvements when we believe they add to the product. Some requests may work as an option just for your club. We’ll agree what is possible, the scope and timing with you.</p></details>'}
   ${demo?'<p class="help"><strong>Fictional demonstration.</strong> Messages and example replies stay in this tab.</p>':''}
   <div class="assist-layout"><aside class="assist-inbox" aria-label="Assist conversations"><div class="assist-filters"><label class="assist-sr-only" for="assistFilter">Conversation status</label><select id="assistFilter" data-assist-filter><option value="open">Open</option><option value="resolved">Resolved</option></select><label class="assist-sr-only" for="assistSearch">Search conversations</label><input id="assistSearch" data-assist-search type="search" placeholder="${c.platform?'Search clubs or subjects':'Search subjects'}" value="${escapeAssist(s.search)}"></div><div data-assist-list>Loading messages…</div><div class="btnrow"><button class="btn ghost" type="button" data-assist-previous hidden>Previous</button><button class="btn ghost" type="button" data-assist-more hidden>More conversations</button></div></aside><section class="assist-conversation"><div data-assist-conversation></div><p data-assist-feedback class="help" role="status" aria-live="polite"></p></section></div></section>`;
  m.root=host.querySelector('.assist');
  if(c.platform){const legacy=document.createElement('div');legacy.dataset.assistLegacy='';m.root.append(legacy);}
  const filter=host.querySelector('[data-assist-filter]');filter.value=s.filter;
  filter.onchange=()=>{s.filter=filter.value;s.offset=0;void refresh(m);};
  host.querySelector('[data-assist-search]').oninput=e=>{s.search=e.target.value;s.offset=0;clearTimeout(m.searchTimer);m.searchTimer=setTimeout(()=>void refresh(m),250);};
  host.querySelector('[data-assist-more]').onclick=()=>{s.offset+=50;host.querySelector('[data-assist-previous]').hidden=false;void refresh(m);};
  host.querySelector('[data-assist-previous]').onclick=()=>{s.offset=Math.max(0,s.offset-50);host.querySelector('[data-assist-previous]').hidden=!s.offset;void refresh(m);};
  host.querySelector('[data-assist-new]')?.addEventListener('click',()=>void open(m,null));
  renderCompose(m);await refresh(m);await legacyRequests(m);schedule();
 }
 return {mount,start,reset,unread,hasChanges,canLeave,home:()=>{const s=states.get(scope(getContext()));if(s&&!s.pending){s.selected=null;s.filter='open';s.offset=0;}},refresh:()=>mounted?refresh(mounted):unread()};
}

function assistStyles(){return `<style>
 .assist{max-width:1180px;margin:0 auto}.assist-heading,.assist-conversation-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.assist-heading h1,.assist-conversation-heading h2{margin:0}.assist-heading p{margin:3px 0 0;color:var(--muted,#536477)}.assist>.help{margin:10px 0}.assist-promise{margin:8px 0 14px}.assist-promise summary{cursor:pointer;font-size:14px}.assist-promise p{max-width:800px;margin:8px 0;font-size:14px}
 .assist-layout{display:grid;grid-template-columns:minmax(240px,32%) minmax(0,1fr);gap:16px}.assist-inbox,.assist-conversation{min-width:0}.assist-inbox{border-right:1px solid var(--line,#dce4ee);padding-right:16px}.assist-filters,.assist-fields{display:flex;gap:8px;margin-bottom:12px}.assist-filters select{width:105px;flex:0 0 105px}.assist-filters input{min-width:0;flex:1}.assist-fields label{flex:1;min-width:0}.assist label{display:block;font-size:14px;font-weight:600}.assist :is(input:not([type=checkbox]),textarea,select){font-size:16px;min-height:44px;width:100%;box-sizing:border-box}.assist textarea{resize:vertical}.assist .btn{min-height:44px}.assist-include{display:flex!important;gap:8px;align-items:center;min-height:44px;font-weight:400!important}.assist-include input{width:18px;height:18px}
 .assist-thread{display:block;text-align:left;border:1px solid var(--line,#dce4ee);border-radius:10px;background:white;color:inherit;padding:12px;width:100%;margin:0 0 8px;cursor:pointer;overflow-wrap:anywhere}.assist-thread.is-selected{border-color:#234a69;background:#eef5fa}.assist-thread>span,.assist-thread>small{display:block;margin:3px 0}.assist-thread-top{display:flex!important;justify-content:space-between;gap:8px}.assist-thread small,.assist-preview{color:#536477;font-size:12px}.assist-preview{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.assist-unread{border-radius:12px;padding:2px 7px;background:#1c4d69;color:white;font-size:12px;min-width:20px;text-align:center}
 .assist-messages{max-height:48vh;overflow-y:auto;overscroll-behavior:contain;margin:8px 0 14px;scrollbar-gutter:stable}.assist-message{padding:10px 12px;border:1px solid #dde6ed;border-radius:10px;margin:8px 28px 8px 0;background:#fff;overflow-wrap:anywhere}.assist-message.assist-from-team{background:#eef5f8;margin:8px 0 8px 28px;border-color:#c9dce7}.assist-message header{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;font-size:13px}.assist-message time{color:#536477;font-size:11px}.assist-message p{white-space:pre-wrap;margin:7px 0 0}.assist-conversation-heading .btn{flex-shrink:0}.assist-conversation [data-assist-thread-meta]:empty,.assist [data-assist-feedback]:empty{display:none}.assist-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
 @media(max-width:700px){.assist-layout{grid-template-columns:1fr;gap:12px}.assist-inbox{border-right:0;padding-right:0;border-bottom:1px solid #dce4ee;padding-bottom:8px}.assist-inbox [data-assist-list]{max-height:210px;overflow-y:auto}.assist-fields{flex-direction:column}.assist-heading{align-items:flex-start}.assist-heading .btn{flex-shrink:0}.assist-conversation-heading{flex-wrap:wrap}.assist-messages{max-height:45vh}.assist-message{margin-right:16px}.assist-message.assist-from-team{margin-left:16px}}
 </style>`;}
