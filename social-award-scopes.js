export const AWARD_SCOPE_KINDS=['team_week','player_week','results','five_wickets','century'];
export const awardScopeKey=value=>!value||value.mode==='all'?'all':value.mode+':'+[...new Set(value.ids||[])].sort().join(',');
export const scopedAwardLabel=(label,scope)=>!scope||scope.mode==='all'?label:[label,scope.label].filter(Boolean).join(' · ');
const all=()=>({mode:'all',ids:[],grade_ids:[],key:'all',label:'All'});

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
 function canLeave(s){const a=state(s);if(a.busy||a.pending||a.draft){h.message(s,a.error||'Apply or cancel the selection group choice first.');return false;}return true;}
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
  const list=d.mode==='groups'?entry?.data?.groups||[]:entry?.data?.grades||[];
  return `<style>.award-scope{position:relative;max-width:100%}.award-scope>summary{cursor:pointer;display:grid;gap:4px;list-style:none;font-size:inherit}.award-scope>summary span{display:block;padding:9px 12px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:44px;box-sizing:border-box}.award-scope-panel{position:absolute;z-index:40;top:100%;left:0;width:min(350px,calc(100vw - 40px));box-sizing:border-box;padding:14px;background:white;color:#132f45;border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 8px 28px #0003}.award-scope-panel label{display:flex;gap:8px;align-items:center;min-height:44px}.award-scope-panel input{width:18px;height:18px}.award-scope-list{max-height:260px;overflow:auto}.award-scope-actions{display:flex;gap:8px;flex-wrap:wrap}.award-scope-panel p{margin:8px 0;font-size:14px}.award-scope-panel select{font:inherit;font-size:16px;max-width:100%;min-height:44px}</style><details class="award-scope" id="awardScope" ${a.open===kind?'open':''}><summary aria-label="Selection groups included: ${escape(value?.label||'Loading')}">Selection groups included<span>${escape(value?.label||'Loading…')} ▾</span></summary><div class="award-scope-panel"><label>Include<select id="awardScopeMode" ${disabled}><option value="all" ${d.mode==='all'?'selected':''}>All selection groups</option><option value="groups" ${d.mode==='groups'?'selected':''}>Select selection groups</option><option value="grades" ${d.mode==='grades'?'selected':''}>Select individual grades</option></select></label>${d.mode==='all'?'':`<div class="award-scope-list">${list.map(x=>`<label><input type="checkbox" data-award-scope-id="${escape(x.id)}" ${d.ids.includes(x.id)?'checked':''} ${disabled}>${escape(x.name)}</label>`).join('')||'<p>No choices have been set up yet.</p>'}</div>`}<div class="award-scope-actions"><button class="btn" id="awardScopeApply" ${locked||a.busy||!entry?.data?'disabled':''}>${a.busy?'Saving…':'Apply'}</button><button class="btn ghost" id="awardScopeCancel" ${a.busy||a.pending?'disabled':''}>Cancel</button>${a.error?'<button class="btn ghost" id="awardScopeReload">Reload saved choice</button>':''}</div>${a.error?`<p role="alert">${escape(a.error)}</p>`:''}</div></details>`;
 }
 function bind(s,host){
  const a=state(s),kind=s.view,entry=a.kinds[kind],el=id=>host.querySelector('#'+id),details=el('awardScope');if(!details)return;
  const fit=()=>{const panel=details.querySelector('.award-scope-panel');if(!panel||!details.open)return;panel.style.left='0';panel.style.right='auto';if(panel.getBoundingClientRect().right>window.innerWidth-12){panel.style.left='auto';panel.style.right='0';}};
  details.querySelector('summary').onclick=e=>{if(!entry?.data||h.locked?.(s)||a.busy||a.pending){e.preventDefault();return;}if(!details.open&&!h.canEdit(s)){e.preventDefault();return;}};
  details.addEventListener('toggle',()=>{a.open=details.open?kind:null;fit();});fit();
  const draft=()=>a.draft||=( {kind,mode:entry.value.mode,ids:[...entry.value.ids]} );
  el('awardScopeMode')?.addEventListener('change',e=>{const d=draft();d.mode=e.target.value;d.ids=[];a.open=kind;h.draw(s);});
  host.querySelectorAll('[data-award-scope-id]').forEach(e=>e.onchange=()=>{const d=draft();d.ids=[...host.querySelectorAll('[data-award-scope-id]:checked')].map(x=>x.dataset.awardScopeId);});
  el('awardScopeApply')?.addEventListener('click',async()=>{const d=a.draft||{...entry.value,kind};if(d.mode!=='all'&&!d.ids.length){a.error='Select at least one selection group or grade.';h.draw(s);return;}await save(s,kind,d);});
  el('awardScopeCancel')?.addEventListener('click',()=>{a.draft=null;a.open=null;a.error='';h.draw(s);});
  el('awardScopeReload')?.addEventListener('click',async()=>{if(a.busy)return;try{await load(s,kind,{reload:true});await h.changed(s,kind);}catch(e){a.error=e.message;}if(h.here(s))h.draw(s);});
 }
 return {state,load,request,adopt,review,identity,resultsRequest,canLeave,save,controls,bind};
}
