const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choices=(rows,value)=>rows.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('');
const definiteError=e=>/^(P[0-9A-Z]{4}|[0-9]{5}|PT\d{3})$/.test(e?.code||'');
export function createSelectionGroupPermissions(h){
 let s;
 const live=()=>s&&s.host.isConnected&&h.here?.()!==false;
 const name=id=>s.context.members.find(m=>m.user_id===id)?.name||'Club member';
 function ensureHead(){if(!s.head)return;const row=s.members.find(m=>m.user_id===s.head);if(row)row.access='edit';else s.members.push({user_id:s.head,access:'edit'});}
 function selectGroup(id){const g=s.context.groups.find(g=>g.id===id)||s.context.groups[0];s.group=g?.id||'';s.head=g?.head_id||'';s.members=structuredClone(g?.members||[]);s.clubHead=s.context.club_head_id||'';s.draft='';s.link='';s.invite=false;s.message='';ensureHead();}
 function beginEdit(kind){
  if(s.busy||s.pending)return false;
  if(s.draft&&s.draft!==kind){h.alert('Save or discard the current changes first.');draw();return false;}
  s.draft=kind;s.message='';return true;
 }
 async function save(action,data){
  if(s.busy)return;
  s.pending||={action,data:structuredClone({...data,revision:s.context.revision,request_id:crypto.randomUUID()})};
  const state=s;s.busy=true;s.error='';draw();
  try{
   const pending=s.pending,result=await h.rpc(pending.action,pending.data);if(s!==state)return;
   s.context=result;s.pending=null;selectGroup(s.group);
   if(pending.action==='invite'){const url=new URL(h.inviteURL());url.searchParams.set('selection_invite',pending.data.token);s.link=url.href;}
   s.message='Saved.';
   try{await h.saved?.();}catch{if(s===state)s.error='Permissions saved. Reload this page to refresh selections.';}
  }catch(e){if(s!==state)return;s.error=e.message||'Save could not be confirmed.';if(definiteError(e))s.pending=null;}
  finally{if(s===state){s.busy=false;draw();}}
 }
 function draw(){
  if(!live())return;const c=s.context,locked=s.busy||!!s.pending,disabled=locked?'disabled':'',members=c.members.map(m=>[m.user_id,m.name]),g=c.groups.find(g=>g.id===s.group),invitations=c.invites.filter(i=>i.selection_group_id===s.group);
  s.host.innerHTML=`<div class="gp-toolbar"><h2>Selection permissions</h2>${g?`<label class="gp-group"><span class="sr-only">Selection Group</span><select data-gp-group ${disabled}>${choices(c.groups.map(g=>[g.id,g.name]),s.group)}</select></label>`:''}</div>
   <details class="gp-club" ${s.draft==='club'?'open':''}><summary>Club Head of Selections · ${esc(c.club_head_id?name(c.club_head_id):'Not assigned')}</summary><form data-gp-club class="gp-toolbar"><label class="gp-member"><span>Club Head</span><select name="head" required ${disabled}>${choices([['','Choose a member'],...members],s.clubHead)}</select></label><button class="btn" ${disabled||s.draft!=='club'||!s.clubHead?'disabled':''}>Save club Head</button></form></details>
   ${g?`<form data-gp-form><label class="gp-member"><span>Head Selector</span><select data-gp-head required ${disabled} title="Edits and publishes this group’s teams">${choices([['','Choose a Head Selector'],...members],s.head)}</select></label>
   <div>${s.members.map(m=>`<label class="gp-member"><span>${esc(name(m.user_id))}${m.user_id===s.head?' · Head Selector':''}</span><select data-gp-member="${esc(m.user_id)}" ${disabled||m.user_id===s.head?'disabled':''}>${choices([['none','No access'],['view','Can view'],['edit',m.user_id===s.head?'Can edit & publish':'Can edit']],m.access)}</select></label>`).join('')}</div>
   <div class="gp-toolbar gp-actions"><label class="gp-add"><span class="sr-only">Add a selector</span><select data-gp-add ${disabled}><option value="">Add a selector…</option>${choices(members.filter(([id])=>!s.members.some(m=>m.user_id===id)),'')}</select></label><button class="btn" ${disabled||s.draft!=='group'||!s.head?'disabled':''}>${s.busy&&s.pending?.action==='save_group'?'Saving…':s.draft==='group'?'Save permissions':'Saved'}</button><button class="btn ghost" type="button" data-gp-invite ${disabled}>Invite someone</button></div></form>`:'<p>Create a Selection Group to assign its selectors.</p>'}
   ${s.invite?`<form data-gp-invitation><div class="gp-toolbar"><h3>Invite to ${esc(g.name)}</h3><button class="btn ghost" type="button" data-gp-cancel-invite ${disabled}>Cancel</button></div><div class="gp-toolbar"><label>Name<input name="name" required maxlength="100" value="${esc(s.invite.name)}" ${disabled}></label><label>Email<input name="email" type="email" required maxlength="254" value="${esc(s.invite.email)}" ${disabled}></label></div><div class="gp-toolbar"><label class="gp-member"><span>Access</span><select name="access" ${disabled||s.invite.as_head?'disabled':''}>${choices([['view','Can view'],['edit','Can edit']],s.invite.access)}</select></label><label class="se-check"><input name="as_head" type="checkbox" ${s.invite.as_head?'checked':''} ${disabled}>Head Selector</label><button class="btn" ${disabled}>Create invitation link</button></div>${s.invite.as_head?'<p class="se-form-note">The current Head keeps publishing rights until this person accepts.</p>':''}</form>`:''}
   ${s.link?`<div class="gp-toolbar"><label class="gp-link"><span class="sr-only">Invitation link</span><input readonly data-gp-link value="${esc(s.link)}"></label><button class="btn ghost" data-gp-copy>Copy invitation link</button></div>`:''}
   ${invitations.length?`<details class="gp-invitations"><summary>Pending invitations (${invitations.length})</summary>${invitations.map(i=>`<div class="gp-toolbar"><span>${esc(i.invited_name)} · ${esc(i.invited_email)}<small>${i.as_head?'Head Selector':i.access==='edit'?'Can edit':'Can view'}</small></span><button class="btn ghost" data-gp-revoke="${esc(i.id)}" ${disabled}>Withdraw invitation</button></div>`).join('')}</details>`:''}
   <span role="status" class="sr-only">${s.busy?'Saving permissions…':esc(s.message)}</span>${s.error?`<p role="alert">${esc(s.error)}</p>`:''}${s.pending&&!s.busy?'<div class="gp-toolbar"><span role="alert">Save not confirmed. Retry the same change.</span><button class="btn" data-gp-retry>Retry save</button></div>':s.error&&!s.busy?'<button class="btn ghost" data-gp-reload>Reload permissions</button>':''}`;
  const on=(selector,event,fn)=>s.host.querySelector(selector)?.addEventListener(event,fn);
  on('[data-gp-club] select','change',e=>{const value=e.target.value;if(beginEdit('club')){s.clubHead=value;draw();}});
  on('[data-gp-club]','submit',e=>{e.preventDefault();if(s.draft==='club'&&s.clubHead)void save('club_head',{user_id:s.clubHead});});
  on('[data-gp-group]','change',e=>{if(!canLeave()){e.target.value=s.group;return;}selectGroup(e.target.value);s.error='';draw();});
  on('[data-gp-head]','change',e=>{const value=e.target.value;if(beginEdit('group')){s.head=value;ensureHead();draw();}});
  s.host.querySelectorAll('[data-gp-member]').forEach(el=>el.onchange=()=>{if(el.dataset.gpMember===s.head)return;const value=el.value;if(beginEdit('group')){s.members.find(m=>m.user_id===el.dataset.gpMember).access=value;draw();}});
  on('[data-gp-add]','change',e=>{const value=e.target.value;if(value&&beginEdit('group')){s.members.push({user_id:value,access:'view'});draw();}});
  on('[data-gp-form]','submit',e=>{e.preventDefault();if(s.draft==='group'&&s.head)void save('save_group',{group_id:s.group,head_id:s.head,members:s.members});});
  on('[data-gp-invite]','click',()=>{if(s.draft){h.alert('Save or discard the current changes before creating an invitation.');return;}s.invite={name:'',email:'',access:'view',as_head:false};draw();});
  const updateInvite=e=>{const el=e.target;if(!s.invite||!el.name||!beginEdit('invite'))return;s.invite[el.name]=el.type==='checkbox'?el.checked:el.value;if(el.name==='as_head'){if(el.checked)s.invite.access='edit';draw();}};
  on('[data-gp-invitation]','input',updateInvite);on('[data-gp-invitation]','change',updateInvite);
  on('[data-gp-cancel-invite]','click',()=>{if(canLeave()){s.invite=false;s.draft='';s.error='';draw();}});
  on('[data-gp-invitation]','submit',e=>{e.preventDefault();if(!s.invite||s.draft!=='invite'||!e.target.checkValidity())return;const bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');void save('invite',{group_id:s.group,...s.invite,token});});
  on('[data-gp-copy]','click',async e=>{try{await h.copy(s.link);e.target.textContent='Copied';}catch{s.error='Select and copy the invitation link.';draw();s.host.querySelector('[data-gp-link]')?.select();}});
  s.host.querySelectorAll('[data-gp-revoke]').forEach(el=>el.onclick=()=>{if(canLeave()){selectGroup(s.group);void save('revoke_invite',{invite_id:el.dataset.gpRevoke});}});
  on('[data-gp-retry]','click',()=>void save(s.pending.action,s.pending.data));on('[data-gp-reload]','click',()=>{if(canLeave())void mount(s.host);});
 }
 function canLeave(){if(!live())return true;if(s.busy||s.pending){h.alert('Please confirm the permissions save before leaving.');return false;}return !s.draft||h.confirm('Leave these unsaved permission changes?');}
 async function mount(host){const state=s={host,busy:false,pending:null,draft:'',group:'',invite:false,link:'',message:'',error:''};host.innerHTML='<span role="status" class="sr-only">Loading selection permissions…</span>';try{const context=await h.rpc('context',{});if(s!==state||!live())return;s.context=context;selectGroup(h.group?.());draw();}catch(e){if(s===state&&live()){host.innerHTML=`<p role="alert">${esc(e.message)}</p><button class="btn" data-gp-load>Retry permissions</button>`;host.querySelector('button').onclick=()=>void mount(host);}}}
 return {mount,canLeave,hasChanges:()=>!!(live()&&(s.draft||s.busy||s.pending))};
}
