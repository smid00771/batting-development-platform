import {graphicLabel} from './social-graphic-design.js?v=0.8.62.248';

// Shared club preference; the actual label is stored separately for each awards week.
export function createSocialAwardLabels(h){
 const state=s=>s.awardLabels||(s.awardLabels={weeks:{},loads:{},draft:null,pending:null,busy:false,error:''});
 const club=s=>s.scope.split(':').slice(1).join(':');
 async function rpc(s,action,data){const r=await h.supabase.rpc('club_social_award_label_api',{p_club_id:club(s),p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;}
 function adopt(s,end,data){const a=state(s);a.weeks[end]=data;for(const w of [s.week,s.playerWeek,s.awards])if(w?.end===end){w.title=data.label||'';w.awardLabel=data;w.saved=null;w.savedImage=null;}}
 async function load(s,end,{reload=false}={}){
  const a=state(s);if(a.loads[end])return a.loads[end];
  const request=rpc(s,'context',{week_end:end}).then(data=>{if(!h.here(s))return data;if(reload){a.pending=null;a.draft=null;a.error='';}a.weeks[end]=data;return data;}).finally(()=>{delete a.loads[end];});
  a.loads[end]=request;return request;
 }
 async function save(s,end,label,mode){
  const a=state(s),value=graphicLabel(label),current=a.weeks[end]||await load(s,end);if(a.busy)throw Error('Wait for the award label to finish saving.');
  if(!a.pending)a.pending={week_end:end,label:value,mode:mode||current.mode,revision:current.revision,request_id:crypto.randomUUID()};
  else if(a.pending.week_end!==end||a.pending.label!==value||a.pending.mode!==(mode||current.mode))throw Error('Retry the original award label change first.');
  a.busy=true;
  try{const result=await rpc(s,'save',a.pending);if(!h.here(s))return result;a.pending=null;a.draft=null;a.error='';adopt(s,end,result);return result;}
  catch(e){a.error='Save not confirmed. Retry Apply changes, or reload the saved label. '+e.message;throw Error(a.error);}
  finally{a.busy=false;}
 }
 function ready(s,end){const a=state(s),d=a.weeks[end];return !!d?.label&&!d.needs_label&&!a.draft&&!a.pending&&!a.busy;}
 function canLeave(s){const a=state(s);if(a.draft||a.pending||a.busy){h.message(s,a.error||'Apply changes or Undo changes to the shared award label first.');return false;}return true;}
 function controls(s,end,escape,locked){
  const a=state(s),saved=a.weeks[end];if(!saved)return '';
  const d=a.draft?.week_end===end?a.draft:saved,disabled=locked||a.busy||!!a.pending?'disabled':'';
  return `<label>Award labels<select id="awardLabelMode" ${disabled}><option value="week" ${d.mode==='week'?'selected':''}>Week ending</option><option value="week_number" ${d.mode==='week_number'?'selected':''}>Week number</option><option value="round" ${d.mode==='round'?'selected':''}>Round number</option></select></label><label>Label on all awards<input id="awardWeekLabel" maxlength="60" value="${escape(d.label||'')}" placeholder="e.g. Week 2" ${disabled}></label>${a.draft||a.pending?`<button class="btn" id="awardLabelApply" ${locked||a.busy?'disabled':''}>Apply changes</button><button class="btn ghost" id="awardLabelUndo" ${disabled}>Undo changes</button>`:''}${a.error?'<button class="btn ghost" id="awardLabelReload">Reload saved label</button>':''}${a.error||saved.needs_label?`<small role="status">${escape(a.error||saved.reason)}</small>`:a.draft?'<small role="status">Proposed changes · all awards this week</small>':''}`;
 }
 function bind(s,end,host){
  const a=state(s),saved=a.weeks[end];if(!saved)return;const el=id=>host.querySelector('#'+id);
  const change=(mode,label)=>{if(a.busy||a.pending)return;if(!a.draft&&!h.canEdit(s)){h.draw(s);return;}a.draft={week_end:end,mode,label};for(const w of [s.week,s.playerWeek,s.awards])if(w?.end===end)w.title=label||'';h.draw(s);};
  el('awardLabelMode')?.addEventListener('change',e=>change(e.target.value,e.target.value==='round'?saved.suggested_round||'':e.target.value==='week_number'?saved.suggested_week||'':'WEEK ENDING '+end.split('-').reverse().join('/')));
  el('awardWeekLabel')?.addEventListener('change',e=>{try{change(a.draft?.mode||saved.mode,graphicLabel(e.target.value));}catch(error){h.message(s,error.message);}});
  el('awardLabelApply')?.addEventListener('click',async()=>{const d=a.pending||a.draft;if(!d)return;try{if(!d.label&&d.mode!=='week')throw Error('Enter one label for all awards this week.');await save(s,end,d.label,d.mode);}catch(error){h.message(s,error.message);}if(h.here(s))h.draw(s);});
  el('awardLabelUndo')?.addEventListener('click',()=>{if(a.pending||a.busy)return;a.draft=null;adopt(s,end,saved);h.draw(s);});
  el('awardLabelReload')?.addEventListener('click',async()=>{try{adopt(s,end,await load(s,end,{reload:true}));h.draw(s);}catch(error){h.message(s,error.message);}});
 }
 return {load,save,ready,canLeave,controls,bind,state};
}
