export const AWARD_SCOPE_KINDS=['team_week','player_week','results','five_wickets','century'];
export const awardScopeKey=value=>!value||value.mode==='all'?'all':value.mode+':'+[...new Set(value.ids||[])].sort().join(',');
export const scopedAwardLabel=(label,scope)=>!scope||scope.mode==='all'?label:[label,scope.label].filter(Boolean).join(' · ');
const all=()=>({mode:'all',ids:[],grade_ids:[],key:'all',label:'All'});
const teamsIn=(data,value)=>new Set((data?.grades||[]).filter(g=>value.mode==='all'||(value.mode==='groups'?value.ids.includes(g.group_id):value.ids.includes(g.id))).map(g=>g.id));
const sameTeams=(a,b)=>a.size===b.size&&[...a].every(id=>b.has(id));
function teamSets(data){
 const groups=(data?.groups||[]).map(g=>({...g,teams:(data.grades||[]).filter(t=>t.group_id===g.id)}));
 const other=(data?.grades||[]).filter(t=>!groups.some(g=>g.id===t.group_id));
 return other.length?[...groups,{id:'',name:'Other teams',teams:other}]:groups;
}
function teamChoice(data,ids,previous){
 const selected=new Set(ids);
 // Keep the identity of an unchanged saved graphic, including explicit team lists.
 if(!previous.needs_review&&sameTeams(selected,teamsIn(data,previous)))return {mode:previous.mode,ids:[...previous.ids]};
 const sets=teamSets(data),whole=sets.filter(g=>g.id&&g.teams.length&&g.teams.every(t=>selected.has(t.id)));
 const covered=new Set(whole.flatMap(g=>g.teams.map(t=>t.id)));
 return selected.size&&sameTeams(selected,covered)?{mode:'groups',ids:whole.map(g=>g.id)}:{mode:'grades',ids:[...selected]};
}

// One club preference per award. Saved images keep their own immutable choice.
export function createSocialAwardScopes(h){
 const state=s=>s.awardScopes||(s.awardScopes={kinds:{},generation:0,busy:false,pending:null,error:'',open:null,draft:null});
 const valid=k=>AWARD_SCOPE_KINDS.includes(k),club=s=>s.scope.split(':').slice(1).join(':');
 async function rpc(s,action,data){const r=await h.supabase.rpc('club_social_awards_api',{p_club_id:club(s),p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{definite:!!r.error.code});return r.data;}
 async function load(s,kind,{reload=false}={}){
  if(!valid(kind))return null;const a=state(s),entry=a.kinds[kind]||={};
  if(entry.loading)return entry.loading;if(entry.data&&!reload)return entry.data;
  entry.loading=rpc(s,'scope_context',{kind}).then(data=>{if(h.here(s)){entry.data=data;entry.value=data.award_scope;if(reload){a.pending=null;a.error='';a.draft=null;a.open=null;a.generation++;}}return data;}).finally(()=>{entry.loading=null;});return entry.loading;
 }
 async function request(s,kind){if(!valid(kind))return {};await load(s,kind);const value=state(s).kinds[kind]?.value;if(!value)throw Error('Reload the selection groups included.');return {award_scope:structuredClone(value)};}
 function adopt(s,kind,value){if(!valid(kind)||!value)return;(state(s).kinds[kind]||={}).value=value;}
 async function review(s,kind,scope){await load(s,kind);adopt(s,kind,scope||all());state(s).generation++;}
 function identity(s){const a=state(s);return s.view+':'+a.generation+(s.view==='award_collection'?':'+[...(s.awards?.selected||[])].sort().join(','):'');}
 async function resultsRequest(s){if(s.view==='award_collection'&&s.awards?.selected?.size)return {award_edition_ids:[...s.awards.selected]};return request(s,s.view);}
 function canLeave(s){const a=state(s);if(a.busy||a.pending||a.draft){h.message(s,a.error||'Apply or cancel the team choice first.');return false;}return true;}
 async function save(s,kind,draft){
  const a=state(s),entry=a.kinds[kind];if(a.busy)return false;
  if(!a.pending&&awardScopeKey(draft)===awardScopeKey(entry.value)){a.draft=null;a.open=null;a.error='';h.draw(s);return true;}
  if(!a.pending)a.pending={kind,award_scope:{mode:draft.mode,ids:draft.mode==='all'?[]:[...draft.ids]},revision:entry.data.revision,request_id:crypto.randomUUID()};
  a.busy=true;a.error='';h.draw(s);
  try{const data=await rpc(s,'save_scope',a.pending);if(!h.here(s))return false;entry.data=data;entry.value=data.award_scope;a.pending=null;a.draft=null;a.open=null;a.generation++;await h.changed(s,kind);return true;}
  catch(e){if(e.definite)a.pending=null;a.error=e.definite?e.message:'Save not confirmed. Retry Apply, or reload the saved choice. '+e.message;h.message(s,a.error);return false;}
  finally{a.busy=false;if(h.here(s))h.draw(s);}
 }
 function controls(s,escape,locked){
  if(!valid(s.view))return '';const a=state(s),entry=a.kinds[s.view],value=entry?.value,kind=s.view,d=a.draft?.kind===kind?a.draft:value||all(),disabled=locked||a.busy||!!a.pending?'disabled':'';
  const selected=teamsIn(entry?.data,d),sets=teamSets(entry?.data),count=value?teamsIn(entry?.data,value).size:0,label=!value?'Loading…':value.mode==='all'?'All teams':value.mode==='groups'?value.label:`${count} ${count===1?'team':'teams'}`;
  return `<style>.award-scope{position:relative;max-width:100%}.award-scope>summary{cursor:pointer;display:grid;gap:4px;list-style:none;font-size:inherit}.award-scope>summary span{display:block;padding:9px 12px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:44px;box-sizing:border-box}.award-scope-panel{position:absolute;z-index:40;top:100%;left:0;width:min(350px,calc(100vw - 40px));box-sizing:border-box;padding:12px;background:white;color:#132f45;border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 8px 28px #0003}.award-scope-panel label{display:flex;gap:8px;align-items:center;min-height:44px;line-height:1.25;margin:0}.award-scope-panel input{width:18px;height:18px;flex:0 0 18px;margin:0}.award-scope-list{max-height:min(320px,45vh);overflow:auto;overscroll-behavior:contain}.award-scope-group{font-weight:600}.award-scope-panel .award-scope-team{padding-left:26px;font-weight:400}.award-scope-count{margin-left:auto;font-size:12px;color:#64748b;white-space:nowrap}.award-scope-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.award-scope-panel p{margin:8px 0;font-size:14px}</style><details class="award-scope" id="awardScope" ${a.open===kind?'open':''}><summary aria-label="Teams included: ${escape(value?.label||'Loading')}">Teams included<span title="${escape(value?.label||'')}">${escape(label)} ▾</span></summary><div class="award-scope-panel"><label class="award-scope-group"><input id="awardScopeAll" type="checkbox" ${disabled}>All teams<span class="award-scope-count" id="awardScopeCount" aria-live="polite"></span></label><div class="award-scope-list" role="group" aria-label="Choose groups or individual teams">${sets.map(g=>`<div><label class="award-scope-group"><input type="checkbox" data-award-scope-group="${escape(g.id)}" aria-label="${escape(g.name)}: all teams" ${disabled||!g.teams.length?'disabled':''}>${escape(g.name)}</label>${g.teams.map(t=>`<label class="award-scope-team"><input type="checkbox" data-award-scope-id="${escape(t.id)}" ${selected.has(t.id)?'checked':''} ${disabled}>${escape(t.name)}</label>`).join('')}</div>`).join('')||'<p>No teams have been set up yet.</p>'}</div><div class="award-scope-actions"><button class="btn" id="awardScopeApply" ${locked||a.busy||!entry?.data?'disabled':''}>${a.busy?'Saving…':'Apply'}</button><button class="btn ghost" id="awardScopeCancel" ${a.busy||a.pending?'disabled':''}>Cancel</button>${a.error?'<button class="btn ghost" id="awardScopeReload">Reload saved choice</button>':''}</div>${a.error?`<p role="alert">${escape(a.error)}</p>`:''}</div></details>`;
 }
 function bind(s,host){
  const a=state(s),kind=s.view,entry=a.kinds[kind],el=id=>host.querySelector('#'+id),details=el('awardScope');if(!details)return;
  const fit=()=>{const panel=details.querySelector('.award-scope-panel');if(!panel||!details.open)return;panel.style.left='0';panel.style.right='auto';if(panel.getBoundingClientRect().right>window.innerWidth-12){panel.style.left='auto';panel.style.right='0';}};
  details.querySelector('summary').onclick=e=>{if(!entry?.data||h.locked?.(s)||a.busy||a.pending){e.preventDefault();return;}if(!details.open&&!h.canEdit(s)){e.preventDefault();return;}};
  details.addEventListener('toggle',()=>{a.open=details.open?kind:null;fit();});fit();
  const boxes=[...host.querySelectorAll('[data-award-scope-id]')],sets=teamSets(entry?.data);
  const selected=()=>new Set(boxes.filter(e=>e.checked).map(e=>e.dataset.awardScopeId));
  const checked=(input,count,total)=>{input.checked=!!total&&count===total;input.indeterminate=count>0&&count<total;input.setAttribute('aria-checked',input.indeterminate?'mixed':String(input.checked));};
  const sync=()=>{const ids=selected();checked(el('awardScopeAll'),ids.size,boxes.length);host.querySelectorAll('[data-award-scope-group]').forEach(e=>{const group=sets.find(g=>g.id===e.dataset.awardScopeGroup);checked(e,group.teams.filter(t=>ids.has(t.id)).length,group.teams.length);});el('awardScopeCount').textContent=`${ids.size} selected`;};
  const choose=()=>{a.draft={kind,...teamChoice(entry.data,[...selected()],entry.value)};a.open=kind;sync();};
  boxes.forEach(e=>e.onchange=choose);
  el('awardScopeAll').onchange=e=>{boxes.forEach(b=>b.checked=e.target.checked);a.draft={kind,mode:e.target.checked?'all':'grades',ids:[]};a.open=kind;sync();};
  host.querySelectorAll('[data-award-scope-group]').forEach(e=>e.onchange=()=>{const ids=new Set(sets.find(g=>g.id===e.dataset.awardScopeGroup).teams.map(t=>t.id));boxes.filter(b=>ids.has(b.dataset.awardScopeId)).forEach(b=>b.checked=e.checked);choose();});
  sync();
  el('awardScopeApply')?.addEventListener('click',async()=>{const d=a.draft||{...entry.value,kind};if(d.mode!=='all'&&!d.ids.length){a.error='Select at least one team.';h.draw(s);return;}await save(s,kind,d);});
  el('awardScopeCancel')?.addEventListener('click',()=>{a.draft=null;a.open=null;a.error='';h.draw(s);});
  el('awardScopeReload')?.addEventListener('click',async()=>{if(a.busy)return;try{await load(s,kind,{reload:true});await h.changed(s,kind);}catch(e){a.error=e.message;}if(h.here(s))h.draw(s);});
 }
 return {state,load,request,adopt,review,identity,resultsRequest,canLeave,save,controls,bind};
}
