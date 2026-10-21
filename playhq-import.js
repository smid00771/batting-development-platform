import {createSelectionGroups} from './selection-groups.js?v=0.8.62.241';
// Saved team links drive fixture loading. Source credentials stay server-side.
export function createPlayHQImport(h){
 let active=null;const remembered=new Map();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?d.split('-').reverse().join('/'):d||'';
 const live=s=>active===s&&s.host.isConnected&&h.clubId()===s.club&&h.here?.()!==false;
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('playhq_sync_api',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;}
 async function groupRPC(s,action,data={}){const r=await h.supabase.rpc('club_selection_groups',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;}
 async function review(s,action,data={}){const r=await h.supabase.rpc('playhq_fixture_review',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;}
 const details=d=>`${d.days.map(x=>[date(x.date),x.start,x.ground].filter(Boolean).join(' · ')).join(' / ')} · ${d.opposition} · ${d.format.replaceAll('_',' ')}${d.cancelled?' · Cancelled':''}`;
 async function source(s,action,data={}){const r=await h.supabase.functions.invoke('playhq-sync',{body:{club_id:s.club,action,...data}});if(r.error||r.data?.error){let detail;try{detail=await r.error?.context?.json();}catch{}throw Error(detail?.error||r.data?.error||r.error?.message||'PlayHQ unavailable');}return r.data;}
 async function run(s,work){if(s.busy)return;s.busy=true;s.error='';draw(s);try{await work();}catch(e){s.error=e.message;}finally{s.busy=false;if(live(s))draw(s);}}
 async function teams(s){const data=await source(s,'teams',{season_id:s.season});s.teams=data.teams;s.catalogue=data.catalogue_id;s.groupContext=await groupRPC(s,'context');}
 async function syncFixtures(s,context,{reload=false}={}){
  if(reload)await teams(s);
  const mappings=context.mappings.filter(m=>m.season_id===s.season),failures=[];let created=0,linked=0;s.awaitingGrades=[];
  for(const m of mappings){
   if(!live(s))return;const t=s.teams?.find(t=>t.id===m.team_id),g=context.grades.find(g=>g.id===m.grade_id);if(!g)continue;
   if(!t?.grade?.id){s.awaitingGrades.push(g.name);continue;}
   s.progress='Loading fixtures: '+g.name;draw(s);
   try{const preview=await source(s,'preview',{season_id:s.season,grade_id:t.grade.id,team_id:t.id});const result=await rpc(s,'import_all',{preview_id:preview.preview_id});created+=result.created||0;linked+=result.linked||0;}
   catch(error){failures.push(g.name+': '+error.message);}
  }
  s.progress='';s.status=await rpc(s,'status');s.changes=(await review(s,'list')).changes;
  s.message=created||linked?`${created} fixtures added${linked?`; ${linked} existing fixtures linked`:''}.`:'Season fixtures checked.';
  if(failures.length)s.error='Your groups are saved. Some fixtures could not be loaded: '+failures.join(' · ');
  await h.refresh();
 }
 function draw(s){
  if(!live(s))return;const disabled=s.busy?'disabled':'',saved=!!(s.groupContext?.selection_groups.length&&s.groupContext.grades.every(g=>g.selection_group_id));
  s.host.innerHTML=`<section class="se-card se-drawer"><div class="se-top"><h2>${saved?'Club season':'Set up your club season'}</h2><button class="btn ghost" data-phq-back ${disabled}>Back</button></div>
   ${s.status?.error?`<p role="alert">${esc(s.status.error)}</p>`:''}
   ${s.changes?.length?`<details><summary>${s.changes.length} fixtures need attention</summary>${s.changes.map(x=>`<div class="se-top"><span>${esc(x.grade)} · ${esc(x.opposition)}${x.result_error?`<small>${esc(x.result_error)}</small>`:''}</span><div class="se-actions">${x.pending?`<button class="btn ghost" data-phq-review="${esc(x.fixture_id)}" ${disabled}>Review change</button>`:''}<button class="btn ghost" data-phq-open="${esc(x.fixture_id)}" ${disabled}>Fixture details</button></div></div>`).join('')}</details>`:''}
   ${s.review?`<section><h3>Review fixture change</h3><p><strong>Current:</strong> ${esc(details(s.review.before))}</p><p><strong>PlayHQ:</strong> ${esc(details(s.review.after))}</p>${[...s.review.blockers,...s.review.warnings].map(x=>`<p>${esc(x)}</p>`).join('')}<div class="se-actions"><button class="btn" data-phq-apply ${disabled||!s.review.can_apply?'disabled':''}>Apply fixture change</button><button class="btn ghost" data-phq-open="${esc(s.review.fixture_id)}" ${disabled}>Fixture details</button></div></section>`:''}
   ${saved?`<p class="se-form-note" data-phq-saved><strong>Your season setup is saved${s.status?.fixture_count?' and fixtures are loaded':''}.</strong> ${s.status?.fixture_count||0} fixtures loaded${s.status?.fixture_through?' through '+esc(date(s.status.fixture_through)):''}.${s.status?.polling_enabled?' Automatic checks are on.':''}</p>`:''}
   ${s.groupContext&&s.season?'<div data-phq-setup></div>':''}
   ${s.awaitingGrades?.length?`<p class="se-form-note" data-phq-awaiting>Waiting for PlayHQ grade details: ${s.awaitingGrades.map(esc).join(' · ')}. Their fixtures will load when those details arrive.</p>`:''}
   ${(s.status?.fixture_reports||[]).length?`<details><summary>Fixtures awaiting details</summary>${s.status.fixture_reports.map(r=>`<p>${esc(r.grade)}: ${esc(r.error||(r.deferred||[]).map(d=>[d.opposition,d.reason].filter(Boolean).join(' — ')).join(' · '))}</p>`).join('')}</details>`:''}
   ${s.status?.configured?`<details ${saved?'':'open'}><summary>${saved?'Change season':'Choose season'}</summary><button class="btn ghost" data-phq-seasons ${disabled}>${s.seasons?'Reload seasons':'Load seasons'}</button>${s.seasons?`<label>Season<select data-phq-season ${disabled}><option value="">Choose season</option>${s.seasons.map(x=>`<option value="${esc(x.id)}" ${s.season===x.id?'selected':''}>${esc(x.name)}${x.competition?.name?' · '+esc(x.competition.name):''}</option>`).join('')}</select></label>`:''}</details>`:''}
   <details class="sg-fallback"><summary>Manual setup</summary><button class="btn ghost" data-phq-manual ${disabled}>Enter fixtures manually</button>${h.manualGrades?`<button class="btn ghost" data-phq-manual-grades ${disabled}>Set up a grade manually</button>`:''}</details>
   ${s.status?.admin?`<details ${!s.status.configured?'open':''}><summary>PlayCricket connection</summary>${h.connect?`<button class="btn ghost" data-phq-connect ${disabled}>${s.status.configured?'Manage PlayCricket connection':'Connect PlayCricket'}</button>`:`<form data-phq-config class="se-form-grid"><label>Club organisation ID<input name="organisation_id" required value="${esc(s.status.organisation_id)}" ${disabled}></label><label>Association organisation ID<input name="association_id" required value="${esc(s.status.association_id)}" ${disabled}></label><label>Club API key<input name="api_key" type="password" autocomplete="off" required ${disabled}></label><button class="btn" ${disabled}>Save connection</button></form>`}${s.status.polling_enabled?`<button class="btn ghost" data-phq-pause ${disabled}>Pause automatic checks</button>`:s.status.verified&&saved?`<button class="btn ghost" data-phq-resume ${disabled}>Resume automatic checks</button>`:''}</details>`:s.status&&!s.status.configured?'<p>Ask your Club Admin to connect the club’s PlayHQ API key. Manual fixture entry is available.</p>':''}
   ${s.busy||s.message?`<p role="status">${s.busy?esc(s.progress||'Loading…'):esc(s.message)}</p>`:''}${s.error?`<p role="alert">${esc(s.error)}</p>`:''}</section>`;
  const on=(q,event,fn)=>s.host.querySelector(q)?.addEventListener(event,fn);
  s.host.querySelectorAll('[data-phq-review]').forEach(el=>el.onclick=()=>void run(s,async()=>{s.review=await review(s,'preview',{fixture_id:el.dataset.phqReview});}));
  s.host.querySelectorAll('[data-phq-open]').forEach(el=>el.onclick=()=>{if(canLeave()){active=null;h.openFixture(el.dataset.phqOpen);}});
  on('[data-phq-apply]','click',()=>void run(s,async()=>{const r=await review(s,'apply',{fixture_id:s.review.fixture_id,revision:s.review.revision,token:s.review.token});s.review=null;s.changes=(await review(s,'list')).changes;s.message=r.requires_republish?'Fixture updated. The Head of Selections must review and republish.':'Fixture updated.';await h.refresh();}));
  on('[data-phq-back]','click',()=>{if(canLeave()){active=null;h.back();}});
  on('[data-phq-connect]','click',()=>{if(canLeave()){active=null;h.connect();}});
  on('[data-phq-manual]','click',()=>{if(canLeave()){active=null;h.manual();}});
  on('[data-phq-manual-grades]','click',()=>{if(canLeave()){active=null;h.manualGrades();}});
  on('[data-phq-config]','submit',e=>{e.preventDefault();const form=e.target,data=Object.fromEntries(new FormData(form));form.elements.api_key.value='';void run(s,async()=>{await rpc(s,'configure',data);s.status=await rpc(s,'status');s.seasons=null;s.season='';s.teams=null;s.setup=null;s.groupContext=null;s.awaitingGrades=[];s.dirty=false;remembered.delete(s.club);s.message='Connection saved. Load seasons to check it.';});});
  on('[data-phq-config]','input',()=>s.dirty=true);
  on('[data-phq-seasons]','click',()=>void run(s,async()=>{s.seasons=(await source(s,'seasons')).seasons;s.status=await rpc(s,'status');}));
  on('[data-phq-pause]','click',()=>void run(s,async()=>{await rpc(s,'pause');s.status=await rpc(s,'status');}));
  on('[data-phq-resume]','click',()=>void run(s,async()=>{await rpc(s,'enable');s.status=await rpc(s,'status');}));
  on('[data-phq-season]','change',e=>{if(!canLeave()){e.target.value=s.season||'';return;}s.season=e.target.value;remembered.set(s.club,{season:s.season,seasons:s.seasons});s.awaitingGrades=[];s.teams=null;s.setup=null;s.groupContext=null;s.message='';if(s.season)void run(s,()=>teams(s));});
  const setupHost=s.host.querySelector('[data-phq-setup]');
  if(setupHost&&s.groupContext){
   if(s.setup)s.setup.attach(setupHost);
   else{s.setup=createSelectionGroups({here:()=>live(s),alert:h.alert,confirm:h.confirm,
    manage:async(action,data)=>{const r=await h.supabase.rpc('club_selection_group_manage',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;},
    previewTeam:t=>source(s,'preview',{season_id:s.season,grade_id:t.grade.id,team_id:t.id}),
    managed:async(context,action)=>{s.groupContext=context;if(action==='add_team'){s.busy=true;try{await syncFixtures(s,{...context,mappings:context.mappings.filter(m=>m.grade_id===context.changed_grade_id)});}catch(e){s.error='Your team is saved. Fixtures could not finish loading: '+e.message;}finally{s.busy=false;if(live(s))draw(s);}}else{s.status=await rpc(s,'status');await h.refresh();draw(s);}},
    save:data=>groupRPC(s,'save',data),saved:async context=>{s.groupContext=context;s.dirty=false;s.busy=true;try{await syncFixtures(s,context);}catch(e){s.error='Your groups are saved. Fixture loading could not finish: '+e.message;}finally{s.busy=false;if(live(s))draw(s);}},
    captains:h.captains?()=>{if(canLeave()){active=null;h.captains();}}:null,
    manual:h.manualGrades?()=>{if(canLeave()){active=null;h.manualGrades();}}:null,
    fixtures:context=>void run(s,()=>syncFixtures(s,context,{reload:true}))});s.setup.mount(setupHost,{context:s.groupContext,teams:s.teams||[],season:s.season,catalogue:s.catalogue});}
  }
  if(!s.busy&&s.selectionGroupId&&s.setup?.addTeam(s.selectionGroupId))s.selectionGroupId=null;
  if(s.busy&&setupHost)setupHost.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
 }
 function canLeave(){if(!active||!live(active))return true;if(active.busy){h.alert('Please wait for the PlayHQ request to finish.');return false;}if(active.setup&&!active.setup.canLeave())return false;if(active.dirty&&!h.confirm('Leave these unsaved connection details?'))return false;active.dirty=false;return true;}
 return {canLeave,hasChanges:()=>!!(active&&live(active)&&(active.busy||active.dirty||active.setup?.hasChanges())),mount(host,{groups,existing,selectionGroupId=null}){const s=active={host,selectionGroupId,club:h.clubId(),groups,existing,status:null,busy:false,dirty:false,error:'',message:'',progress:''};void run(s,async()=>{
  s.status=await rpc(s,'status');s.changes=(await review(s,'list')).changes;
  const previous=remembered.get(s.club);s.season=s.status.active_season_id||previous?.season||'';s.seasons=previous?.seasons;
  if(s.season&&s.status.configured){s.groupContext=await groupRPC(s,'context');s.teams=[];draw(s);await teams(s);s.setup=null;s.awaitingGrades=s.groupContext.mappings.filter(m=>m.season_id===s.season&&!s.teams.find(t=>t.id===m.team_id)?.grade?.id).map(m=>s.groupContext.grades.find(g=>g.id===m.grade_id)?.name).filter(Boolean);
   if(s.season===s.status.active_season_id&&!s.status.fixture_count&&!s.status.last_checked_at)await syncFixtures(s,s.groupContext);
  }
 });}};
}
