import {createSelectionGroups} from './selection-groups.js?v=0.8.62.236';
// Compact, user-authorised import UI. Provider credentials are never returned by the API.
export function createPlayHQImport(h){
 let active=null;const remembered=new Map();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const live=s=>active===s&&s.host.isConnected&&h.clubId()===s.club&&h.here?.()!==false;
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('playhq_sync_api',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;}
 async function groupRPC(s,action,data={}){const r=await h.supabase.rpc('club_selection_groups',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;}
 async function review(s,action,data={}){const r=await h.supabase.rpc('playhq_fixture_review',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;}
 const details=d=>`${d.days.map(x=>[x.date,x.start,x.ground].filter(Boolean).join(' · ')).join(' / ')} · ${d.opposition} · ${d.format.replaceAll('_',' ')}${d.cancelled?' · Cancelled':''}`;
 async function source(s,action,data={}){const r=await h.supabase.functions.invoke('playhq-sync',{body:{club_id:s.club,action,...data}});if(r.error||r.data?.error){let detail;try{detail=await r.error?.context?.json();}catch{}throw Error(detail?.error||r.data?.error||r.error?.message||'PlayHQ unavailable');}return r.data;}
 async function run(s,work){if(s.busy)return;s.busy=true;s.error='';draw(s);try{await work();}catch(e){s.error=e.message;}finally{s.busy=false;if(live(s))draw(s);}}
 function draw(s){
  if(!live(s))return;const disabled=s.busy?'disabled':'';
  s.host.innerHTML=`<section class="se-card se-drawer"><div class="se-top"><h2>Set up your club season</h2><button class="btn ghost" data-phq-back ${disabled}>Back</button></div><details class="sg-fallback"><summary>Manual setup</summary><button class="btn ghost" data-phq-manual ${disabled}>Enter fixtures manually</button>${h.manualGrades?`<button class="btn ghost" data-phq-manual-grades ${disabled}>Set up a grade manually</button>`:''}</details>

   ${s.status?.error?`<p role="alert">${esc(s.status.error)}</p>`:''}
   ${s.changes?.length?`<details open><summary>${s.changes.length} fixtures need attention</summary>${s.changes.map(x=>`<div class="se-top"><span>${esc(x.grade)} · ${esc(x.opposition)}${x.result_error?`<small>${esc(x.result_error)}</small>`:''}</span><div class="se-actions">${x.pending?`<button class="btn ghost" data-phq-review="${esc(x.fixture_id)}" ${disabled}>Review change</button>`:''}<button class="btn ghost" data-phq-open="${esc(x.fixture_id)}" ${disabled}>Fixture details</button></div></div>`).join('')}</details>`:''}
   ${s.review?`<section><h3>Review fixture change</h3><p><strong>Current:</strong> ${esc(details(s.review.before))}</p><p><strong>PlayHQ:</strong> ${esc(details(s.review.after))}</p>${[...s.review.blockers,...s.review.warnings].map(x=>`<p>${esc(x)}</p>`).join('')}<div class="se-actions"><button class="btn" data-phq-apply ${disabled||!s.review.can_apply?'disabled':''}>Apply fixture change</button><button class="btn ghost" data-phq-open="${esc(s.review.fixture_id)}" ${disabled}>Fixture details</button></div></section>`:''}
   ${s.status?.admin?`<details ${!s.status.configured?'open':''}><summary>PlayHQ connection</summary><form data-phq-config class="se-form-grid"><label>Club organisation ID<input name="organisation_id" required value="${esc(s.status.organisation_id)}" ${disabled}></label><label>Association organisation ID<input name="association_id" required value="${esc(s.status.association_id)}" ${disabled}></label><label>Club API key<input name="api_key" type="password" autocomplete="off" required ${disabled}></label><button class="btn" ${disabled}>Save connection</button></form></details>`:s.status&&!s.status.configured?'<p>Ask your Club Admin to connect the club’s PlayHQ API key. Manual fixture entry is available.</p>':''}
   ${s.status?.configured?`<div class="se-actions"><button class="btn ghost" data-phq-seasons ${disabled}>${s.seasons?'Reload seasons':'Load seasons'}</button>${s.status.polling_enabled?`<button class="btn ghost" data-phq-pause ${disabled}>Pause automatic checks</button>`:''}</div>`:''}
   ${s.seasons?`<label>Season<select data-phq-season ${disabled}><option value="">Choose season</option>${s.seasons.map(x=>`<option value="${esc(x.id)}" ${s.season===x.id?'selected':''}>${esc(x.name)}${x.competition?.name?' · '+esc(x.competition.name):''}</option>`).join('')}</select></label>`:''}
   ${s.teams&&!s.previews?'<div data-phq-setup></div>':''}
   ${s.previews?`<div>${s.previews.map((p,index)=>`<h3>${esc(p.label)}</h3>${p.fixtures.map(f=>`<div class="se-top"><label class="se-check"><input type="checkbox" data-phq-match="${esc(f.source_match_id)}" ${s.matches[f.source_match_id]?'checked':''} ${disabled||f.requires_review?'disabled':''}>${esc(f.days.map(d=>d.date).join(' / '))} · ${esc(f.opposition||'Opponent to be confirmed')}${f.cancelled?' · Cancelled':''}${f.requires_review?' · needs checking':''}</label><select aria-label="Match existing fixture" data-phq-existing="${esc(f.source_match_id)}" ${disabled}><option value="">Create fixture</option>${s.existing.filter(e=>e.details?.grade_group_id===p.group&&e.details?.format===f.format&&e.details?.days?.[0]?.date===f.days[0]?.date).map(e=>`<option value="${esc(e.id)}" ${s.links[f.source_match_id]===e.id?'selected':''}>Link existing: ${esc(e.details.opposition)}</option>`).join('')}</select></div>`).join('')}${p.byes?.length?'<p class="se-muted">Byes: '+p.byes.map(b=>esc(b.round)).join(', ')+'</p>':''}`).join('')}</div><button class="btn" data-phq-import ${disabled}>Import selected fixtures</button>`:''}
   ${s.busy||s.message?`<p role="status">${s.busy?'Loading…':esc(s.message)}</p>`:''}${s.error?`<p role="alert">${esc(s.error)}</p>`:''}</section>`;
  const on=(q,event,fn)=>s.host.querySelector(q)?.addEventListener(event,fn);
  s.host.querySelectorAll('[data-phq-review]').forEach(el=>el.onclick=()=>void run(s,async()=>{s.review=await review(s,'preview',{fixture_id:el.dataset.phqReview});}));
  s.host.querySelectorAll('[data-phq-open]').forEach(el=>el.onclick=()=>{if(canLeave()){active=null;h.openFixture(el.dataset.phqOpen);}});
  on('[data-phq-apply]','click',()=>void run(s,async()=>{const r=await review(s,'apply',{fixture_id:s.review.fixture_id,revision:s.review.revision,token:s.review.token});s.review=null;s.changes=(await review(s,'list')).changes;s.message=r.requires_republish?'Fixture updated. The Head of Selections must review and republish.':'Fixture updated.';await h.refresh();}));
  on('[data-phq-back]','click',()=>{if(canLeave()){active=null;h.back();}});
  on('[data-phq-manual]','click',()=>{if(canLeave()){active=null;h.manual();}});
  on('[data-phq-manual-grades]','click',()=>{if(canLeave()){active=null;h.manualGrades();}});
  on('[data-phq-config]','submit',e=>{e.preventDefault();const form=e.target,data=Object.fromEntries(new FormData(form));form.elements.api_key.value='';void run(s,async()=>{await rpc(s,'configure',data);s.status=await rpc(s,'status');s.seasons=null;s.season='';s.teams=null;s.setup=null;s.previews=null;s.dirty=false;remembered.delete(s.club);s.message='Connection saved. Load seasons to check it.';});});
  on('[data-phq-config]','input',()=>s.dirty=true);
  on('[data-phq-seasons]','click',()=>void run(s,async()=>{s.seasons=(await source(s,'seasons')).seasons;s.status=await rpc(s,'status');}));
  on('[data-phq-pause]','click',()=>void run(s,async()=>{await rpc(s,'pause');s.status=await rpc(s,'status');}));
  on('[data-phq-season]','change',e=>{if(!canLeave()){e.target.value=s.season||'';return;}s.season=e.target.value;remembered.set(s.club,{season:s.season,seasons:s.seasons});s.previews=null;s.teams=null;s.setup=null;s.message='';if(s.season)void run(s,async()=>{const data=await source(s,'teams',{season_id:s.season});s.teams=data.teams;s.catalogue=data.catalogue_id;s.groupContext=await groupRPC(s,'context');});});
  const setupHost=s.host.querySelector('[data-phq-setup]');
  if(setupHost&&s.groupContext){
   if(s.setup)s.setup.attach(setupHost);
   else {s.setup=createSelectionGroups({here:()=>live(s),alert:h.alert,confirm:h.confirm,
    save:data=>groupRPC(s,'save',data),saved:async context=>{s.groupContext=context;s.dirty=false;await h.refresh();},
    captains:h.captains?()=>{if(canLeave()){active=null;h.captains();}}:null,
    manual:h.manualGrades?()=>{if(canLeave()){active=null;h.manualGrades();}}:null,
    fixtures:context=>void run(s,async()=>{
     const mappings=context.mappings.filter(m=>m.season_id===s.season&&s.teams.some(t=>t.id===m.team_id));
     if(!mappings.length)throw Error('Add or match at least one season grade to preview its fixtures.');
     const previews=[];
     for(const m of mappings){if(!live(s))return;const t=s.teams.find(t=>t.id===m.team_id),g=context.grades.find(g=>g.id===m.grade_id);if(!g)continue;const p=await source(s,'preview',{season_id:s.season,grade_id:t.grade.id,team_id:t.id});previews.push({...p,group:g.id,label:g.name});}
     s.previews=previews;s.matches={};s.links={};s.dirty=true;
     for(const p of previews)for(const f of p.fixtures){s.matches[f.source_match_id]=!f.requires_review;const candidates=s.existing.filter(e=>e.details?.grade_group_id===p.group&&e.details?.format===f.format&&e.details?.days?.[0]?.date===f.days[0]?.date);if(candidates.length===1)s.links[f.source_match_id]=candidates[0].id;}
    })});s.setup.mount(setupHost,{context:s.groupContext,teams:s.teams,season:s.season,catalogue:s.catalogue});}
  }
  if(s.busy&&setupHost)setupHost.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  s.host.querySelectorAll('[data-phq-match]').forEach(el=>el.onchange=()=>s.matches[el.dataset.phqMatch]=el.checked);
  s.host.querySelectorAll('[data-phq-existing]').forEach(el=>el.onchange=()=>s.links[el.dataset.phqExisting]=el.value);
  on('[data-phq-import]','click',()=>void run(s,async()=>{
   let count=0;for(const p of s.previews){const choices=p.fixtures.filter(f=>s.matches[f.source_match_id]).map(f=>{const existing=s.existing.find(e=>e.id===s.links[f.source_match_id]);return {match_id:f.source_match_id,fixture_id:existing?.id,revision:existing?.revision};});
    for(let i=0;i<choices.length;i+=100){const r=await rpc(s,'import',{preview_id:p.preview_id,group_id:p.group,choices:choices.slice(i,i+100)});count+=r.fixture_ids.length;}}
   if(!count)throw Error('Choose at least one fixture.');s.dirty=false;s.message=`${count} fixtures imported.`;s.previews=null;await h.refresh();
  }));
 }
 function canLeave(){if(!active||!live(active))return true;if(active.busy){h.alert('Please wait for the PlayHQ request to finish.');return false;}if(active.setup&&!active.setup.canLeave())return false;if(active.dirty&&!h.confirm('Leave this fixture import?'))return false;active.dirty=false;return true;}
 return {canLeave,hasChanges:()=>!!(active&&live(active)&&(active.busy||active.dirty||active.setup?.hasChanges())),mount(host,{groups,existing}){const s=active={host,club:h.clubId(),groups,existing,status:null,busy:false,dirty:false,error:'',message:'',chosen:{},mapping:{}};void run(s,async()=>{s.status=await rpc(s,'status');s.changes=(await review(s,'list')).changes;const previous=remembered.get(s.club);if(previous?.season&&s.status.configured){Object.assign(s,previous);const result=await source(s,'teams',{season_id:s.season});s.teams=result.teams;s.catalogue=result.catalogue_id;s.groupContext=await groupRPC(s,'context');}});}};
}
