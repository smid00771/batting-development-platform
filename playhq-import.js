// Compact, user-authorised import UI. Provider credentials are never returned by the API.
export function createPlayHQImport(h){
 let active=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const live=s=>active===s&&s.host.isConnected&&h.clubId()===s.club&&h.here?.()!==false;
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('playhq_sync_api',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;}
 async function source(s,action,data={}){const r=await h.supabase.functions.invoke('playhq-sync',{body:{club_id:s.club,action,...data}});if(r.error||r.data?.error){let detail;try{detail=await r.error?.context?.json();}catch{}throw Error(detail?.error||r.data?.error||r.error?.message||'PlayHQ unavailable');}return r.data;}
 async function run(s,work){if(s.busy)return;s.busy=true;s.error='';draw(s);try{await work();}catch(e){s.error=e.message;}finally{s.busy=false;if(live(s))draw(s);}}
 function draw(s){
  if(!live(s))return;const disabled=s.busy?'disabled':'';
  s.host.innerHTML=`<section class="se-card se-drawer"><div class="se-top"><h2>Import club season fixtures</h2><button class="btn ghost" data-phq-back ${disabled}>Back</button></div><div class="se-actions"><button class="btn ghost" data-phq-manual ${disabled}>Enter fixtures manually</button></div>
   ${s.status?.configured?`<p class="se-muted">${s.status.verified?'Connection verified':'Connection needs checking'} · Automatic checks ${s.status.polling_enabled?'on':'off'}</p>`:''}
   ${s.status?.admin?`<details ${!s.status.configured?'open':''}><summary>PlayHQ connection</summary><form data-phq-config class="se-form-grid"><label>Club organisation ID<input name="organisation_id" required value="${esc(s.status.organisation_id)}" ${disabled}></label><label>Association organisation ID<input name="association_id" required value="${esc(s.status.association_id)}" ${disabled}></label><label>Club API key<input name="api_key" type="password" autocomplete="off" required ${disabled}></label><button class="btn" ${disabled}>Save connection</button></form></details>`:s.status&&!s.status.configured?'<p>Ask your Club Admin to connect the club’s PlayHQ API key. Manual fixture entry is available.</p>':''}
   ${s.status?.configured?`<div class="se-actions"><button class="btn ghost" data-phq-seasons ${disabled}>${s.seasons?'Reload seasons':'Load seasons'}</button>${s.status.polling_enabled?`<button class="btn ghost" data-phq-pause ${disabled}>Pause automatic checks</button>`:''}</div>`:''}
   ${s.seasons?`<label>Season<select data-phq-season ${disabled}><option value="">Choose season</option>${s.seasons.map(x=>`<option value="${esc(x.id)}" ${s.season===x.id?'selected':''}>${esc(x.name)}${x.competition?.name?' · '+esc(x.competition.name):''}</option>`).join('')}</select></label>`:''}
   ${s.teams?`<div>${s.teams.length?s.teams.map(t=>`<div class="se-form-grid"><label class="se-check"><input type="checkbox" data-phq-team="${esc(t.id)}" ${s.chosen[t.id]?'checked':''} ${disabled}>${esc(t.grade?.name||t.name||'Team')}</label><label>Club grade<select data-phq-group="${esc(t.id)}" ${disabled}><option value="">Choose grade</option>${s.groups.map(g=>`<option value="${esc(g.id)}" ${s.chosen[t.id]?.group===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label></div>`).join(''):'<p>No club teams returned for this season.</p>'}</div><button class="btn" data-phq-preview ${disabled}>Preview selected grades</button>`:''}
   ${s.previews?`<div>${s.previews.map((p,index)=>`<h3>${esc(p.label)}</h3>${p.fixtures.map(f=>`<div class="se-top"><label class="se-check"><input type="checkbox" data-phq-match="${esc(f.source_match_id)}" ${s.matches[f.source_match_id]?'checked':''} ${disabled||f.requires_review?'disabled':''}>${esc(f.days.map(d=>d.date).join(' / '))} · ${esc(f.opposition||'Opponent to be confirmed')}${f.requires_review?' · needs checking':''}</label><select aria-label="Match existing fixture" data-phq-existing="${esc(f.source_match_id)}" ${disabled}><option value="">Create fixture</option>${s.existing.filter(e=>e.details?.grade_group_id===p.group&&e.details?.format===f.format&&e.details?.days?.[0]?.date===f.days[0]?.date).map(e=>`<option value="${esc(e.id)}" ${s.links[f.source_match_id]===e.id?'selected':''}>Link existing: ${esc(e.details.opposition)}</option>`).join('')}</select></div>`).join('')}${p.byes?.length?'<p class="se-muted">Byes: '+p.byes.map(b=>esc(b.round)).join(', ')+'</p>':''}`).join('')}</div><button class="btn" data-phq-import ${disabled}>Import selected fixtures</button>`:''}
   <p role="status">${s.busy?'Working…':esc(s.message||'')}</p><p role="alert">${esc(s.error||'')}</p></section>`;
  const on=(q,event,fn)=>s.host.querySelector(q)?.addEventListener(event,fn);
  on('[data-phq-back]','click',()=>{if(canLeave()){active=null;h.back();}});
  on('[data-phq-manual]','click',()=>{if(canLeave()){active=null;h.manual();}});
  on('[data-phq-config]','submit',e=>{e.preventDefault();const form=e.target,data=Object.fromEntries(new FormData(form));form.elements.api_key.value='';void run(s,async()=>{await rpc(s,'configure',data);s.status=await rpc(s,'status');s.seasons=null;s.teams=null;s.previews=null;s.dirty=false;s.message='Connection saved. Load seasons to check it.';});});
  on('[data-phq-config]','input',()=>s.dirty=true);
  on('[data-phq-seasons]','click',()=>void run(s,async()=>{s.seasons=(await source(s,'seasons')).seasons;s.status=await rpc(s,'status');}));
  on('[data-phq-pause]','click',()=>void run(s,async()=>{await rpc(s,'pause');s.status=await rpc(s,'status');}));
  on('[data-phq-season]','change',e=>{s.season=e.target.value;s.chosen={};s.previews=null;s.teams=null;if(s.season)void run(s,async()=>{s.teams=(await source(s,'teams',{season_id:s.season})).teams;});});
  s.host.querySelectorAll('[data-phq-team]').forEach(el=>el.onchange=()=>{const id=el.dataset.phqTeam;if(el.checked)s.chosen[id]={group:s.host.querySelector(`[data-phq-group="${id}"]`).value};else delete s.chosen[id];s.previews=null;s.dirty=true;draw(s);});
  s.host.querySelectorAll('[data-phq-group]').forEach(el=>el.onchange=()=>{const id=el.dataset.phqGroup;if(s.chosen[id])s.chosen[id].group=el.value;s.previews=null;s.dirty=true;draw(s);});
  on('[data-phq-preview]','click',()=>void run(s,async()=>{
   const picked=s.teams.filter(t=>s.chosen[t.id]);if(!picked.length||picked.some(t=>!s.chosen[t.id].group))throw Error('Choose grades and match each to a club grade.');
   const previews=[];for(const t of picked){if(!live(s))return;const p=await source(s,'preview',{season_id:s.season,grade_id:t.grade.id,team_id:t.id});previews.push({...p,group:s.chosen[t.id].group,label:t.grade.name});}
   s.previews=previews;s.matches={};s.links={};for(const p of previews)for(const f of p.fixtures){s.matches[f.source_match_id]=!f.requires_review;const candidates=s.existing.filter(e=>e.details?.grade_group_id===p.group&&e.details?.format===f.format&&e.details?.days?.[0]?.date===f.days[0]?.date);if(candidates.length===1)s.links[f.source_match_id]=candidates[0].id;}
  }));
  s.host.querySelectorAll('[data-phq-match]').forEach(el=>el.onchange=()=>s.matches[el.dataset.phqMatch]=el.checked);
  s.host.querySelectorAll('[data-phq-existing]').forEach(el=>el.onchange=()=>s.links[el.dataset.phqExisting]=el.value);
  on('[data-phq-import]','click',()=>void run(s,async()=>{
   let count=0;for(const p of s.previews){const choices=p.fixtures.filter(f=>s.matches[f.source_match_id]).map(f=>{const existing=s.existing.find(e=>e.id===s.links[f.source_match_id]);return {match_id:f.source_match_id,fixture_id:existing?.id,revision:existing?.revision};});
    for(let i=0;i<choices.length;i+=100){const r=await rpc(s,'import',{preview_id:p.preview_id,group_id:p.group,choices:choices.slice(i,i+100)});count+=r.fixture_ids.length;}}
   if(!count)throw Error('Choose at least one fixture.');s.dirty=false;s.message=`${count} fixtures imported.`;s.previews=null;await h.refresh();
  }));
 }
 function canLeave(){if(!active||!live(active))return true;if(active.busy){h.alert('Please wait for the PlayHQ request to finish.');return false;}if(active.dirty&&!h.confirm('Leave this fixture import?'))return false;active.dirty=false;return true;}
 return {canLeave,mount(host,{groups,existing}){const s=active={host,club:h.clubId(),groups,existing,status:null,busy:false,dirty:false,error:'',message:'',chosen:{}};void run(s,async()=>{s.status=await rpc(s,'status');});}};
}
