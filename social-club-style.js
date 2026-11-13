import {graphicGrade,gradeLabels,gradeLabelFamily,withGradeLabels} from './social-graphic-design.js?v=0.8.62.362';

export const CLUB_AWARDS={team_week:'Team of the Week',player_week:'Player of the Week',results:'Results',century:'Century',five_wickets:'5 Wickets'};
export const CLUB_STYLE_FIELDS=['text_colour','title_font','week_font','grade_font','player_font','score_font'];
const normal=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();

// A confirmed club choice outranks old copies in individual templates.
export function clubGraphicLayout(layout={},preferences={}){
 const preferred=gradeLabels(preferences.grade_labels||[]),names=new Set(preferred.map(x=>normal(x.grade))),families=new Set(preferred.map(x=>gradeLabelFamily(x.grade)).filter(Boolean));
 const old=(layout.grade_labels||[]).filter(x=>!names.has(normal(x.grade))&&!families.has(gradeLabelFamily(x.grade)));
 const next=withGradeLabels({...layout,grade_labels:old},preferred);
 for(const key of CLUB_STYLE_FIELDS)if(preferences.style?.[key]!=null)next[key]=preferences.style[key];
 return next;
}

export function preferredTeamRows(context){
 const saved=context.preferences?.grade_labels||[],designs=Object.values(context.designs||{}),names=context.teams?.length?context.teams:[];
 const rows=names.map(team=>{
  const source=team.name,confirmed=graphicGrade(source,{grade_labels:saved});
  const exact=saved.find(x=>normal(x.grade)===normal(source)),familyLabels=new Set(saved.filter(x=>gradeLabelFamily(source)&&gradeLabelFamily(source)===gradeLabelFamily(x.grade)).map(x=>x.label));
  const matching=!!exact||familyLabels.size===1;
  const candidates=[...new Set(designs.flatMap(d=>{
   const aliases=(d.layout?.grade_labels||[]).filter(x=>normal(x.grade)===normal(source)||gradeLabelFamily(source)&&gradeLabelFamily(x.grade)===gradeLabelFamily(source));
   return aliases.map(x=>x.label);
  }))];
  return {id:team.id,grade:source,label:matching?confirmed:candidates.length===1?candidates[0]:candidates.length>1?'':graphicGrade(source,{},true),suggestions:candidates,confirmed:matching,conflict:!matching&&candidates.length>1};
 });
 return rows;
}

export function changedGradeLabels(before={},after={}){
 const old=new Map((before.grade_labels||[]).map(x=>[normal(x.grade),x.label]));
 return gradeLabels(after.grade_labels||[]).filter(x=>old.get(normal(x.grade))!==x.label);
}

export function createClubGraphicSetup(h){
 const state=s=>s.graphicSetup||(s.graphicSetup={context:null,loading:null,draft:null,pending:null,busy:false,message:'',history:null});
 const club=s=>s.scope.split(':').slice(1).join(':');
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('club_graphic_setup_api',{p_club_id:club(s),p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{definite:!!r.error.code});return r.data;}
 function adopt(s,context){state(s).context=context;s.data.graphic_preferences=context.preferences;}
 async function load(s,{reload=false}={}){const a=state(s);if(a.loading)return a.loading;if(a.context&&!reload)return a.context;
  a.loading=rpc(s,'context').then(data=>{if(h.here(s))adopt(s,data);return data;}).finally(()=>a.loading=null);return a.loading;
 }
 function preferences(s){return s.data?.graphic_preferences||state(s).context?.preferences||{revision:0,grade_labels:[],style:{}};}
 function canLeave(s){const a=state(s);if(a.busy||a.pending||a.draft){h.message(s,'Save or undo the club style changes first.');return false;}return true;}
 async function saveDesign(s,kind,payload,before){
  const a=state(s),pref=preferences(s),labels=changedGradeLabels(before,payload.layout),key='design:'+kind;
  if(a.busy)throw Error('Wait for the club design to finish saving.');
  for(const [key,value] of Object.entries(pref.style||{}))if(payload.layout[key]!==value)throw Object.assign(Error('Change shared '+key.replaceAll('_',' ')+' in Club award setup, or choose each template’s own style there.'),{definite:true});
  if(a.pending&&a.pending.key!==key)throw Error('Retry the pending club style change first.');
  a.pending||={key,action:'save_design',data:{...payload,kind,shared_revision:pref.revision||0,label_changes:labels,request_id:crypto.randomUUID()}};
  a.busy=true;
  try{const result=await rpc(s,a.pending.action,a.pending.data);if(h.here(s)){s.data.graphic_preferences=result.preferences;a.context=null;a.pending=null;}return result;}
  catch(e){if(e.definite)a.pending=null;throw e;}finally{a.busy=false;}
 }
 function render(s){const a=state(s),host=document.getElementById('socialContent');if(!host)return;
  if(!a.context){host.innerHTML='<p role="status">Loading club award setup…</p>';void load(s).then(()=>{if(h.here(s)&&s.view==='club_award_setup')render(s);}).catch(e=>{host.innerHTML=`<p role="alert">${h.escape(e.message)}</p><button class="btn" id="cgRetry">Try again</button>`;document.getElementById('cgRetry').onclick=()=>render(s);});return;}
  const rows=a.draft?.rows||preferredTeamRows(a.context),style=a.draft?.style||a.context.preferences.style||{},disabled=a.busy||!!a.pending,esc=h.escape;
  host.innerHTML=`<style>.cg-fields{display:grid;grid-template-columns:minmax(150px,1fr) minmax(110px,180px);gap:8px 16px;align-items:center;max-width:720px}.cg-fields input{width:100%;min-height:44px;box-sizing:border-box;font:inherit}.cg-team{min-width:0;overflow-wrap:anywhere}.cg-team small{display:block;color:#745515}.cg-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.cg-designs{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.cg-designs article{border:1px solid #dce2ee;border-radius:8px;padding:12px}.cg-designs h4{margin:0 0 8px}.cg-style{display:flex;gap:12px;flex-wrap:wrap}.cg-style label{display:grid;gap:5px}.cg-style input,.cg-style select{min-height:44px}.cg-history{padding:12px;background:#f4f7fb}.cg-history button{margin:6px}</style><h3>Club award setup</h3><p>Set up your preferred names and designs once. Reuse them for every awards week.</p><h4>Team names on graphics</h4><div class="cg-fields"><strong>Team / grade</strong><strong>Preferred label</strong>${rows.map((r,i)=>`<div class="cg-team"><label for="cgLabel${i}">${esc(r.grade)}</label>${r.conflict?`<small>Saved designs disagree: ${r.suggestions.map(esc).join(' / ')}. Choose the club’s wording.</small>`:''}</div><input id="cgLabel${i}" data-cg-label="${i}" maxlength="40" aria-label="Preferred label for ${esc(r.grade)}" value="${esc(r.label)}" ${disabled?'disabled':''}>`).join('')}</div><details><summary>Shared text style</summary><p>Optional. A shared choice applies to every award; leave it unset to keep each template’s own style.</p><div class="cg-style"><label>Text colour<select id="cgColourMode" ${disabled?'disabled':''}><option value="own" ${!style.text_colour?'selected':''}>Each template’s colour</option><option value="shared" ${style.text_colour?'selected':''}>One colour for all awards</option></select></label>${style.text_colour?`<label>Shared colour<input id="cgColour" type="color" value="${esc(style.text_colour)}" ${disabled?'disabled':''}></label>`:''}${[['title_font','Heading'],['week_font','Week / round'],['player_font','Player names'],['score_font','Figures'],['grade_font','Team labels']].map(([key,label])=>`<label>${label} font<select data-cg-font="${key}" id="${key==='title_font'?'cgFont':'cgFont-'+key}" ${disabled?'disabled':''}><option value="">Each template’s font</option>${[['sporting','Sporting'],['condensed','Condensed'],['sans','Sans'],['script','Brush'],['modern','Arial'],['classic','Georgia']].map(([v,n])=>`<option value="${v}" ${style[key]===v?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}</div></details><div class="cg-actions"><button class="btn" id="cgSave" ${a.busy?'disabled':''}>${a.busy?'Saving…':a.pending?'Retry save':'Save club preferences'}</button><button class="btn ghost" id="cgUndo" ${disabled||!a.draft?'disabled':''}>Undo changes</button><button class="btn ghost" id="cgPreferencesHistory" ${disabled?'disabled':''}>Previous preferences</button></div><p role="status">${esc(a.message)}</p>${a.message&&!a.pending?'<button class="btn ghost" id="cgReload">Reload saved preferences</button>':''}<h4>Saved award designs</h4><div class="cg-designs">${Object.entries(CLUB_AWARDS).map(([kind,title])=>{const d=a.context.designs[kind];return `<article><h4>${title}</h4><p>${d?.revision?'Saved template · reused each week':'Ready to set up'}</p><button class="btn" data-cg-open="${kind}" ${disabled?'disabled':''}>${d?.revision?'Edit & compare with example':'Set up from example'}</button> <button class="btn ghost" data-cg-history="${kind}" ${disabled?'disabled':''}>Previous designs</button></article>`;}).join('')}</div><div id="cgHistory"></div>`;
  function draft(){document.getElementById('cgUndo').disabled=false;return a.draft||=( {rows:structuredClone(rows),style:structuredClone(style)} );}
  host.querySelectorAll('[data-cg-label]').forEach(el=>el.oninput=()=>{draft().rows[+el.dataset.cgLabel].label=el.value;});
  document.getElementById('cgColourMode').onchange=e=>{if(e.target.value==='shared')draft().style.text_colour='#FFFFFF';else delete draft().style.text_colour;render(s);};
  document.getElementById('cgColour')?.addEventListener('input',e=>draft().style.text_colour=e.target.value);
  host.querySelectorAll('[data-cg-font]').forEach(el=>el.onchange=e=>{const key=el.dataset.cgFont;if(e.target.value)draft().style[key]=e.target.value;else delete draft().style[key];});
  document.getElementById('cgReload')?.addEventListener('click',async()=>{if(a.draft&&!confirm('Discard these unsaved preference changes and reload?'))return;try{a.draft=null;await load(s,{reload:true});a.message='Saved preferences loaded.';render(s);}catch(e){a.message=e.message;render(s);}});
  document.getElementById('cgUndo')?.addEventListener('click',()=>{a.draft=null;a.message='';render(s);});
  document.getElementById('cgSave').onclick=async()=>{if(a.busy)return;try{
   const d=a.draft||{rows,style};const labels=a.pending?[]:gradeLabels(d.rows.map(r=>({grade:r.grade,label:r.label})));
   a.pending||={key:'preferences',action:'save_preferences',data:{revision:a.context.preferences.revision,grade_labels:labels,style:d.style,request_id:crypto.randomUUID()}};
   a.busy=true;render(s);const result=await rpc(s,a.pending.action,a.pending.data);if(!h.here(s))return;a.pending=null;a.draft=null;adopt(s,result);h.invalidate(s);a.message='Saved for every award. Existing downloaded images stay as they are.';
  }catch(e){a.message=e.message;if(e.definite)a.pending=null;}finally{a.busy=false;if(h.here(s))render(s);}};
  host.querySelectorAll('[data-cg-open]').forEach(el=>el.onclick=()=>{if(canLeave(s))h.open(s,el.dataset.cgOpen);});
  host.querySelectorAll('[data-cg-history]').forEach(el=>el.onclick=()=>showHistory(s,el.dataset.cgHistory));
  document.getElementById('cgPreferencesHistory').onclick=()=>showHistory(s,'preferences');
 }
 async function showHistory(s,kind){if(!canLeave(s))return;const a=state(s),host=document.getElementById('cgHistory');host.innerHTML='<p>Loading previous designs…</p>';try{const result=await rpc(s,'history',{kind});if(!h.here(s)||!host.isConnected)return;
  host.innerHTML=`<section class="cg-history"><h4>Previous ${kind==='preferences'?'club preferences':h.escape(CLUB_AWARDS[kind])+' designs'}</h4>${result.versions.length?result.versions.map(v=>`<div>${h.escape(new Date(v.saved_at).toLocaleString())} · Version ${v.revision}<button class="btn secondary" data-cg-restore="${v.id}">Restore this version</button></div>`).join(''):'No earlier saved versions yet.'}</section>`;
  host.querySelectorAll('[data-cg-restore]').forEach(el=>el.onclick=async()=>{if(a.busy)return;if(!confirm('Restore this saved '+(kind==='preferences'?'set of club preferences':'design')+'? Your current version will remain in history.'))return;a.busy=true;el.disabled=true;try{
   const revision=kind==='preferences'?a.context.preferences.revision:a.context.designs[kind]?.revision||0;
   a.pending={key:'restore',action:'restore',data:{kind,version_id:el.dataset.cgRestore,revision,shared_revision:a.context.preferences.revision,request_id:crypto.randomUUID()}};
   const data=await rpc(s,'restore',a.pending.data);if(h.here(s)){adopt(s,data);a.pending=null;h.invalidate(s);a.message='Previous version restored.';}
  }catch(e){a.message=e.message;if(e.definite)a.pending=null;}finally{a.busy=false;if(h.here(s))render(s);}});
 }catch(e){host.textContent=e.message;}}
 return {load,render,preferences,canLeave,saveDesign,state,layout:(s,value)=>clubGraphicLayout(value,preferences(s))};
}
