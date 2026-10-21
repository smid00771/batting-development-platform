import {createSelectionGroupManager} from './selection-group-manager.js?v=0.8.62.239';
// Build groups from imported teams, then align existing grades before saving.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
const sourceName=t=>t.grade?.name||t.name||'';
const sourceLabel=t=>[t.grade?.name,t.name!==t.grade?.name?t.name:null].filter(Boolean).join(' · ');
export function selectionGroupDraft(context,teams=[],season=''){
 const rows=context.grades.map(g=>({...g,original_name:g.name,existing:true,team_id:null,keep_manual:false})),claimed=new Set();
 for(const t of teams){
  const saved=context.mappings.find(m=>m.season_id===season&&m.team_id===t.id);
  const candidates=rows.filter(g=>!g.team_id&&!context.mappings.some(m=>m.season_id===season&&m.grade_id===g.id)&&key(g.name)===key(sourceName(t)));
  const same=teams.filter(x=>key(sourceName(x))===key(sourceName(t)));
  const row=saved?rows.find(g=>g.id===saved.grade_id):same.length===1&&candidates.length===1?candidates[0]:null;
  if(row){row.team_id=t.id;row.source_name=sourceLabel(t);row.link_saved=!!saved;claimed.add(t.id);}
 }
 const imports=teams.map(t=>{const row=rows.find(g=>g.team_id===t.id),shared=teams.filter(x=>key(sourceName(x))===key(sourceName(t))).length>1;
  return {id:t.id,team:t,selection_group_id:row?.selection_group_id||'',target_id:row?.id||'new',locked:!!row?.link_saved,name:shared&&t.name?t.name:sourceName(t),new_id:null};});
 return {groups:context.selection_groups.map(g=>({...g})),rows,imports,available:teams.filter(t=>!claimed.has(t.id)),season};
}
export function createSelectionGroups(h){
 let s=null,manager=null;
 const live=()=>s&&s.host.isConnected&&h.here?.()!==false;
 const selected=()=>s.draft.imports.filter(i=>i.selection_group_id);
 const linked=row=>selected().find(i=>i.target_id===row.id);
 const options=(value,blank)=>`<option value="">${blank}</option>`+s.draft.groups.map(g=>`<option value="${esc(g.id)}" ${g.id===value?'selected':''}>${esc(g.name)}</option>`).join('');
 const groupName=id=>s.draft.groups.find(g=>g.id===id)?.name||'';
 const source=i=>`<strong>${esc(sourceName(i.team)||'Team')}</strong>${i.team.grade?.name&&i.team.name&&i.team.name!==i.team.grade.name?`<small>${esc(i.team.name)}</small>`:''}`;
 function changed(){s.dirty=true;s.saved=false;s.error='';h.changed?.();}
 function checkGroups(){
  const d=s.draft;
  if(!d.groups.length||d.groups.some(g=>!g.name.trim())){s.error='Name each Selection Group.';return false;}
  if(new Set(d.groups.map(g=>key(g.name))).size!==d.groups.length){s.error='Use a different name for each Selection Group.';return false;}
  if(d.imports.some(i=>i.locked&&!i.selection_group_id)){s.error='Choose a Selection Group for each previously linked team.';return false;}
  return true;
 }
 function payload(){
  if(!checkGroups())return null;const d=s.draft,grades=[];
  for(const row of d.rows){
   const i=linked(row),group=i?.selection_group_id||row.selection_group_id;
   if(!i&&!row.keep_manual){s.error='Match each existing grade to an imported team, or choose Keep without an imported team.';return null;}
   if(!group){s.error='Choose a Selection Group for each grade kept without an imported team.';return null;}
   grades.push({id:row.id,name:row.name.trim(),selection_group_id:group,...(i?{team_id:i.id}:{})});
  }
  for(const i of selected().filter(i=>!d.rows.some(g=>g.id===i.target_id))){i.new_id||=crypto.randomUUID();grades.push({id:i.new_id,name:i.name.trim(),selection_group_id:i.selection_group_id,team_id:i.id});}
  if(grades.some(g=>!g.name||g.name.length>100)){s.error='Enter a preferred name of up to 100 characters for each grade.';return null;}
  if(new Set(grades.map(g=>key(g.name))).size!==grades.length){s.error='Give each club grade a distinct preferred name, or match it to its imported team.';return null;}
  return {request_id:crypto.randomUUID(),revision:s.context.revision,expected_grades:s.context.expected_grades,catalogue_id:s.catalogue,groups:d.groups.map(g=>({id:g.id,name:g.name.trim()})),grades};
 }
 async function save(){
  if(s.busy)return;if(!s.pending){s.pending=payload();if(!s.pending){draw();return;}}
  s.busy=true;s.error='';draw();const current=s;
  try{const result=await h.save(s.pending);if(s!==current)return;s.context=result;s.pending=null;s.dirty=false;s.saved=true;s.draft=selectionGroupDraft(result,s.teams,s.season);await h.saved?.(result);}
  catch(error){if(s!==current)return;s.error=error.message||'Could not save Selection Groups.';if(/^(P[0-9A-Z]{4}|[0-9]{5}|PT\d{3})$/.test(error.code||''))s.pending=null;}
  finally{if(s===current){s.busy=false;draw();}}
 }
 function draw(){
  if(!live())return;const d=s.draft,locked=s.busy||!!s.pending,disabled=locked?'disabled':'';
  if(h.manage&&(s.saved||!s.season)){if(manager){manager.attach(s.host);return;}manager=createSelectionGroupManager({...h,saved:async(context,action)=>{s.context=context;s.draft=selectionGroupDraft(context,s.teams,s.season);await h.managed?.(context,action);}});manager.mount(s.host,{context:s.context,teams:s.teams,season:s.season,catalogue:s.catalogue});return;}
  if(s.saved){s.host.innerHTML=`<h3>Selection Groups saved</h3><div class="sg-summary">${s.context.selection_groups.map(g=>`<p><strong>${esc(g.name)}</strong><br>${s.context.grades.filter(x=>x.selection_group_id===g.id).map(x=>esc(x.name)).join(' · ')}</p>`).join('')}</div><div class="se-actions">${s.context.can_edit&&h.captains?'<button class="btn" data-sg-captains>Select Season Captains</button>':''}<button class="btn ghost" data-sg-edit>Edit Selection Groups</button>${s.season&&h.fixtures?'<button class="btn ghost" data-sg-fixtures>Check fixtures now</button>':''}</div>`;
   s.host.querySelector('[data-sg-captains]')?.addEventListener('click',()=>h.captains());s.host.querySelector('[data-sg-fixtures]')?.addEventListener('click',()=>h.fixtures(s.context));s.host.querySelector('[data-sg-edit]').onclick=()=>{s.saved=false;s.stage='groups';draw();};return;}
  if(!s.context.can_edit){s.host.innerHTML=`<h3>Selection Groups</h3><p>Club Admin confirms the season grades and Selection Groups.</p>${s.context.mappings.some(m=>m.season_id===s.season)?'<button class="btn" data-sg-fixtures>Check fixtures now</button>':''}`;s.host.querySelector('[data-sg-fixtures]')?.addEventListener('click',()=>h.fixtures(s.context));return;}
  const alerts=()=>`${s.error?`<p role="alert">${esc(s.error)}</p>`:''}${s.pending?'<p role="alert">The save could not be confirmed. Retry the same save.</p>':''}`;
  if(s.stage==='groups'){
   const imports=d.imports.filter(i=>!s.search||key(sourceLabel(i.team)).includes(key(s.search)));
   s.host.innerHTML=`<form data-sg-form><h3>1. Create Selection Groups</h3><p class="se-form-note">Create groups for teams that players can move between, then place your imported teams into them.</p><details class="sg-group-names"><summary>${d.groups.length?esc(d.groups.map(g=>g.name).join(' · '))+' — edit names':'Selection Group names'}</summary><div class="sg-names">${d.groups.map(g=>`<label>Group name<input data-sg-group-name="${esc(g.id)}" value="${esc(g.name)}" maxlength="100" required ${disabled}></label>`).join('')}</div></details><div class="sg-add-group"><label>New group name<input data-sg-new-name maxlength="100" value="${esc(s.newGroupName)}" ${disabled}></label><button type="button" class="btn ghost" data-sg-new ${disabled}>Add group</button></div>${d.imports.length?`<h4>Imported season teams</h4><label>Find a team<input type="search" data-sg-search value="${esc(s.search)}" ${disabled}></label><div data-sg-sources>${imports.map(i=>`<div class="sg-source" data-sg-source="${esc(i.id)}"><div>${source(i)}</div><label>Selection Group<select data-sg-import-group="${esc(i.id)}" ${i.locked?'required':''} ${disabled}>${options(i.selection_group_id,i.locked?'Choose Selection Group':'Not adding this team')}</select></label></div>`).join('')||'<p>No matching teams.</p>'}</div>`:`<p class="se-form-note">${s.season?'No club teams were returned for this season.':'Load a season to add imported teams.'}</p>`}${d.rows.length?`<p class="se-form-note">Match your ${d.rows.length} existing club grade${d.rows.length===1?'':'s'} on the next screen.</p>`:''}${alerts()}<div class="se-actions"><button class="btn" ${disabled}>${!d.rows.length&&!selected().length?'Save groups':'Next: match existing grades'}</button>${h.manual?'<details class="sg-fallback"><summary>Missing a grade?</summary><button type="button" class="btn ghost" data-sg-manual '+disabled+'>Set up a grade manually</button></details>':''}</div></form>`;
   const add=()=>{const input=s.host.querySelector('[data-sg-new-name]'),name=input.value.trim();if(!name){input.focus();return;}if(d.groups.some(g=>key(g.name)===key(name))){s.error='That group name already exists.';draw();return;}d.groups.push({id:crypto.randomUUID(),name});s.newGroupName='';changed();draw();};
   s.host.querySelector('[data-sg-new]').onclick=add;s.host.querySelector('[data-sg-new-name]').oninput=e=>{s.newGroupName=e.target.value;changed();};s.host.querySelector('[data-sg-new-name]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add();}};
   s.host.querySelectorAll('[data-sg-group-name]').forEach(el=>{el.oninput=()=>{d.groups.find(g=>g.id===el.dataset.sgGroupName).name=el.value;changed();};el.onchange=()=>draw();});
   s.host.querySelectorAll('[data-sg-import-group]').forEach(el=>el.onchange=()=>{const i=d.imports.find(i=>i.id===el.dataset.sgImportGroup);i.selection_group_id=el.value;const row=d.rows.find(g=>g.id===i.target_id);if(row&&el.value){row.selection_group_id=el.value;row.keep_manual=false;}changed();draw();});
   s.host.querySelector('[data-sg-search]')?.addEventListener('input',e=>{s.search=e.target.value;const pos=e.target.selectionStart;draw();const input=s.host.querySelector('[data-sg-search]');input.focus();input.setSelectionRange(pos,pos);});
   s.host.querySelector('[data-sg-manual]')?.addEventListener('click',()=>{if(canLeave())h.manual();});
   s.host.querySelector('[data-sg-form]').onsubmit=e=>{e.preventDefault();if(!checkGroups()){draw();return;}if(!d.rows.length&&!selected().length){void save();return;}for(const row of d.rows){const i=linked(row);if(i){row.selection_group_id=i.selection_group_id;row.keep_manual=false;}else if(!selected().length)row.keep_manual=true;}s.stage='match';changed();draw();};return;
  }
  const nameInput=(value,attribute)=>`<label>Preferred club name<input ${attribute} value="${esc(value)}" maxlength="100" required ${disabled}></label>`;
  const newTeams=selected().filter(i=>!d.rows.some(g=>g.id===i.target_id));
  s.host.innerHTML=`<form data-sg-form><h3>2. Match existing grades & names</h3><p class="se-form-note">Match each existing grade to its imported team. Your records and preferred names stay with it. Saving also loads season fixtures.</p>${d.rows.map(row=>{
   const i=linked(row),value=i?.id||(row.keep_manual?'manual':'');
   return `<div class="sg-match" data-sg-existing="${esc(row.id)}"><div><strong>${esc(row.original_name)}</strong>${i?`<small>${esc(groupName(i.selection_group_id))}</small><small>${esc(sourceLabel(i.team))}</small>`:''}</div><label>Imported team<select data-sg-align="${esc(row.id)}" required ${disabled||i?.locked?'disabled':''}><option value="">Choose imported team…</option>${d.groups.map(group=>{const choices=selected().filter(x=>x.selection_group_id===group.id&&(x.target_id===row.id||!d.rows.some(g=>g.id===x.target_id)));return choices.length?`<optgroup label="${esc(group.name)}">${choices.map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(sourceLabel(x.team)||'Team')}</option>`).join('')}</optgroup>`:'';}).join('')}<option value="manual" ${value==='manual'?'selected':''}>Keep without an imported team</option></select></label>${nameInput(row.name,`data-sg-existing-name="${esc(row.id)}"`)}${row.keep_manual&&!i?`<label>Selection Group<select data-sg-grade="${esc(row.id)}" required ${disabled}>${options(row.selection_group_id,'Choose Selection Group')}</select></label>`:''}</div>`;
  }).join('')}${newTeams.length?`<h4>New club grades</h4><p class="se-form-note">These imported teams will be added when you save. Match them above if they already exist in your club.</p>${d.groups.map(group=>{const imports=newTeams.filter(i=>i.selection_group_id===group.id);return imports.length?`<section data-sg-match-group="${esc(group.id)}"><h4>${esc(group.name)}</h4>${imports.map(i=>`<div class="sg-source" data-sg-new-team="${esc(i.id)}"><div>${source(i)}</div>${nameInput(i.name,`data-sg-name="${esc(i.id)}"`)}</div>`).join('')}</section>`:'';}).join('')}`:''}${alerts()}<div class="se-actions"><button type="button" class="btn ghost" data-sg-back ${disabled}>Back to groups</button><button class="btn" ${s.busy?'disabled':''}>${s.busy?'Saving…':s.pending?'Retry save':'Save setup'}</button></div></form>`;
  s.host.querySelectorAll('[data-sg-align]').forEach(el=>el.onchange=()=>{const row=d.rows.find(g=>g.id===el.dataset.sgAlign);for(const old of d.imports.filter(i=>i.target_id===row.id))old.target_id='new';row.keep_manual=el.value==='manual';const i=selected().find(x=>x.id===el.value);if(i){i.target_id=row.id;row.selection_group_id=i.selection_group_id;}changed();draw();});
  s.host.querySelectorAll('[data-sg-grade]').forEach(el=>el.onchange=()=>{d.rows.find(g=>g.id===el.dataset.sgGrade).selection_group_id=el.value;changed();});
  s.host.querySelectorAll('[data-sg-name]').forEach(el=>el.oninput=()=>{d.imports.find(i=>i.id===el.dataset.sgName).name=el.value;changed();});
  s.host.querySelectorAll('[data-sg-existing-name]').forEach(el=>el.oninput=()=>{d.rows.find(g=>g.id===el.dataset.sgExistingName).name=el.value;changed();});
  s.host.querySelector('[data-sg-back]').onclick=()=>{s.stage='groups';s.error='';draw();};
  s.host.querySelector('[data-sg-form]').onsubmit=e=>{e.preventDefault();void save();};
 }
 function canLeave(){if(manager)return manager.canLeave();if(!live())return true;if(s.busy||s.pending){h.alert('Please confirm the Selection Group save before leaving.');return false;}if(s.dirty&&!h.confirm('Leave these unsaved Selection Group choices?'))return false;s.dirty=false;return true;}
 return {canLeave,attach(host){if(s){s.host=host;draw();}},hasChanges:()=>manager?manager.hasChanges():!!(live()&&(s.dirty||s.busy||s.pending)),mount(host,{context,teams=[],season='',catalogue=null}){manager=null;s={host,context,teams,season,catalogue,draft:selectionGroupDraft(context,teams,season),busy:false,dirty:false,pending:null,saved:!!(context.selection_groups.length&&context.grades.every(g=>g.selection_group_id)),stage:'groups',search:'',newGroupName:'',error:''};draw();}};
}
