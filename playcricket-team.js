/* The scorecard is trusted by the server; the importer reviews identities and the change. */
const normal=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function scorecardPlayerMatches(players,roster,links=[]){
 const matches={},used=new Set();
 for(const p of players){
  const saved=links.filter(l=>l.source_id===p.player_id),registered=roster.filter(r=>String(r.external_id||'').toLowerCase()===p.player_id.toLowerCase());
  const candidates=saved.length?roster.filter(r=>r.id===saved[0].roster_id):registered.length?registered:roster.filter(r=>normal(r.name)===normal(p.name));
  const r=candidates.length===1?candidates[0]:null;
  if(r&&!used.has(r.id)&&players.filter(x=>normal(x.name)===normal(p.name)).length===1){matches[p.player_id]=r.id;used.add(r.id);}else matches[p.player_id]='';
 }
 return matches;
}
export function scorecardFixture(context,teamId,hint=''){
 const fixtures=context.fixtures||[],linked=fixtures.filter(f=>f.sync?.match_id===context.card.match_id&&f.sync?.team_id===teamId);
 if(linked.length===1)return linked[0].id;
 if(hint&&fixtures.some(f=>f.id===hint))return hint;
 const exact=fixtures.filter(f=>normal(f.grade)===normal(context.card.grade));return exact.length===1?exact[0].id:'';
}
export function createScorecardTeams(h){
 const entries=new Map(),esc=h.escape;
 const option=(value,label,selected)=>`<option value="${esc(value)}" ${selected?'selected':''}>${esc(label)}</option>`;
 async function rpc(s,action,data={}){const result=await h.supabase.rpc('playcricket_team_api',{p_club_id:s.clubId,p_action:action,p_data:{snapshot_id:s.snapshotId,...data}});if(result.error)throw result.error;if(!result.data)throw Error('Could not check the team.');return result.data;}
 function live(s){return s.host?.isConnected&&s.here()&&s.scope===h.scope();}
 function setMatches(s){
  const team=s.context.card.teams.find(t=>t.id===s.teamId),fixture=s.context.fixtures.find(f=>f.id===s.fixtureId);
  s.matches=scorecardPlayerMatches(team?.players||[],s.context.roster,s.context.links);s.days={};s.plan=null;s.open=false;
  for(const p of team?.players||[]){const id=s.matches[p.player_id];s.days[p.player_id]=fixture?.brackets?fixture.days.filter((_,i)=>fixture.slots.some(slot=>slot['d'+(i+1)]===id)).map(d=>d.date):(fixture?.days||[]).map(d=>d.date);}
 }
 function payload(s){return {fixture_id:s.fixtureId,team_id:s.teamId,mapping:(s.context.card.teams.find(t=>t.id===s.teamId)?.players||[]).map(p=>({source_id:p.player_id,roster_id:s.matches[p.player_id],days:s.days[p.player_id]||[]}))};}
 function ready(s){const p=payload(s);return p.fixture_id&&p.team_id&&p.mapping.length&&p.mapping.every(m=>m.roster_id&&m.days.length);}
 async function preview(s){
  if(s.busy||s.pending||!ready(s))return;s.busy=true;s.message='Checking team changes…';draw(s);
  try{s.plan=await rpc(s,'preview',payload(s));s.message='';}catch(error){s.plan=null;s.message=error.message||'Could not check team changes.';}finally{s.busy=false;draw(s);}
 }
 async function load(s){
  if(s.busy)return;s.busy=true;s.message='Checking the selected team…';draw(s);
  try{s.context=await rpc(s,'context');if(!s.context.enabled){s.message='';return;}
   s.teamId=s.context.card.teams.some(t=>t.id===s.teamId)?s.teamId:s.context.our_team||'';
   s.fixtureId=scorecardFixture(s.context,s.teamId,s.fixtureId);setMatches(s);s.message='';
  }catch(error){s.message=error.message||'Could not check the selected team.';}finally{s.busy=false;draw(s);}
  if(s.context?.enabled&&ready(s)&&s.context.card.status==='completed'&&s.context.card.teams.find(t=>t.id===s.teamId)?.lineup_available)await preview(s);
 }
 async function apply(s){
  if(s.busy||!s.plan&&!s.pending)return;
  s.pending||={...payload(s),expected:s.plan.expected,request_id:crypto.randomUUID()};s.busy=true;s.message='Updating teams…';draw(s);
  try{const result=await rpc(s,'apply',s.pending);if(!result.saved)throw Error('Team update was not confirmed. Retry the same update.');s.pending=null;s.saved=true;s.message='Team updated to match PlayCricket.';
   // Other imported scorecards must be checked again after a transfer.
   for(const entry of entries.values())if(entry!==s&&entry.clubId===s.clubId&&!entry.busy&&!entry.pending){entry.context=null;entry.plan=null;entry.stale=true;}
   if(live(s))try{await s.changed?.(result);}catch{s.message='Team updated. Refresh this page to load the corrected review list.';}
  }catch(error){s.message=error.message||'Update not confirmed. Retry to check the same update.';if(error.code&&error.code!=='PGRST000'&&!String(error.code).startsWith('08')){s.pending=null;s.plan=null;s.stale=true;}}
  finally{s.busy=false;draw(s);}
 }
 function draw(s){
  if(!live(s))return;const ctx=s.context,locked=s.busy||!!s.pending;
  if(ctx?.enabled===false){s.host.innerHTML='';return;}
  const team=ctx?.card.teams.find(t=>t.id===s.teamId),fixture=ctx?.fixtures.find(f=>f.id===s.fixtureId),target=s.plan?.fixtures[0],others=s.plan?.fixtures.slice(1)||[],players=team?.players||[];
  const missing=players.some(p=>!s.matches?.[p.player_id]||!s.days?.[p.player_id]?.length),canCheck=ctx&&ctx.card.status==='completed'&&team?.lineup_available;
  const changes=target?[target.added.length?'In: '+target.added.join(', '):'',target.removed.length?'Out: '+target.removed.join(', '):''].filter(Boolean):[];
  const warning=!!s.plan?.changed&&!s.saved;
  s.host.innerHTML=`<section class="pc-team ${warning?'pc-team-warning':''}" aria-label="PlayCricket team check">
   <style>.pc-team{margin:12px 0;border:1px solid #ccd7df;border-radius:8px;padding:12px}.pc-team-warning{border:2px solid #b86a00;background:#fff8e9}.pc-team p{margin:6px 0}.pc-team label{display:block;margin:8px 0}.pc-team select{max-width:100%;width:100%;min-height:40px}.pc-team button{min-height:40px;margin:8px 8px 0 0}.pc-team summary{cursor:pointer;padding:7px 0}.pc-team-player{border-top:1px solid #dce2e8;padding:7px 0}.pc-team-days{display:flex;flex-wrap:wrap;gap:12px}.pc-team-days label{display:flex;align-items:center;gap:5px}.pc-team-days input{width:20px;height:20px}</style>
   <strong>${s.saved?'Team matches PlayCricket ✓':warning?'The team that played differs from the selected team.':s.plan?'Team matches PlayCricket':'Check team against PlayCricket'}</strong>
   ${ctx&&!ctx.fixtures.length?'<p>No fixture has these match dates. Add or correct the fixture in Teams, then check again.</p>':ctx?`
   ${!s.teamId?`<label>Our PlayCricket team<select data-pc-team ${locked?'disabled':''}>${option('','Choose our team',true)}${ctx.card.teams.map(t=>option(t.id,t.name,false)).join('')}</select></label>`:''}
   ${ctx.fixtures.length?`<label>Club fixture<select data-pc-fixture ${locked?'disabled':''}>${option('','Choose the matching fixture',!s.fixtureId)}${ctx.fixtures.map(f=>option(f.id,f.grade+' v '+f.opposition+' · '+f.days.map(d=>d.date).join(' / '),f.id===s.fixtureId)).join('')}</select></label>`:''}
   ${ctx.card.status!=='completed'?'<p>The team can be updated when the scorecard is complete.</p>':team&&!team.lineup_available?'<p>Refresh the scorecard to load its full listed team.</p>':''}
   ${canCheck&&fixture&&!s.saved?`<details data-pc-matches ${missing||s.open?'open':''}><summary>Check player matches · ${players.length} listed</summary>${players.map(p=>`<div class="pc-team-player"><label>${esc(p.name)}<select data-pc-player="${esc(p.player_id)}" ${locked?'disabled':''}>${option('','Choose club player',!s.matches[p.player_id])}${ctx.roster.map(r=>option(r.id,r.name+(!r.active?' (inactive)':''),s.matches[p.player_id]===r.id)).join('')}${option('new','Add '+p.name+' to playing list',s.matches[p.player_id]==='new')}</select></label>${fixture.brackets?`<div class="pc-team-days">${fixture.days.map(d=>`<label><input type="checkbox" data-pc-day="${esc(p.player_id)}" value="${esc(d.date)}" ${(s.days[p.player_id]||[]).includes(d.date)?'checked':''} ${locked?'disabled':''}>Played ${esc(d.date)}</label>`).join('')}</div>`:''}</div>`).join('')}</details>`:''}
   ${changes.map(t=>`<p>${esc(t)}</p>`).join('')}
   ${others.map(f=>`<p><strong>${esc(f.grade)}:</strong> ${esc([...new Set(f.departures.map(p=>p.name))].join(', '))} will be removed. The gap stays highlighted until this team's scorecard is checked.</p>`).join('')}
   ${warning?'<p>Update the team to match PlayCricket?</p>':''}
   ${s.plan&&!s.saved&&!s.pending?`<button type="button" class="btn" data-pc-apply ${locked?'disabled':''}>${s.busy?'Updating…':warning?'Update team to match PlayCricket':'Confirm team matches'}</button>`:''}
   ${canCheck&&fixture&&!s.plan&&!s.pending&&!s.saved?`<button type="button" class="btn secondary" data-pc-check ${locked||!ready(s)?'disabled':''}>${s.busy?'Checking…':'Check team changes'}</button>`:''}`:''}
   <p role="status" aria-live="polite">${esc(s.message||'')}</p>
   ${s.pending?`<button type="button" class="btn" data-pc-apply ${s.busy?'disabled':''}>${s.busy?'Updating…':'Retry team update'}</button>`:''}
   ${(!ctx||s.stale||ctx&&!ctx.fixtures.length)&&!s.busy&&!s.pending?'<button type="button" class="btn secondary" data-pc-reload>Check again</button>':''}
   </section>`;
  s.host.querySelector('[data-pc-apply]')?.addEventListener('click',()=>void apply(s));
  s.host.querySelector('[data-pc-check]')?.addEventListener('click',()=>void preview(s));
  s.host.querySelector('[data-pc-reload]')?.addEventListener('click',()=>{s.stale=false;void load(s);});
  s.host.querySelector('[data-pc-matches]')?.addEventListener('toggle',e=>s.open=e.target.open);
  s.host.querySelector('[data-pc-team]')?.addEventListener('change',e=>{s.teamId=e.target.value;s.fixtureId=scorecardFixture(ctx,s.teamId,s.fixtureId);setMatches(s);draw(s);void preview(s);});
  s.host.querySelector('[data-pc-fixture]')?.addEventListener('change',e=>{s.fixtureId=e.target.value;s.saved=false;setMatches(s);draw(s);void preview(s);});
  s.host.querySelectorAll('[data-pc-player]').forEach(el=>el.onchange=()=>{const id=el.dataset.pcPlayer;s.matches[id]=el.value;s.plan=null;s.open=true;s.message='';draw(s);});
  s.host.querySelectorAll('[data-pc-day]').forEach(el=>el.onchange=()=>{const id=el.dataset.pcDay,days=new Set(s.days[id]);el.checked?days.add(el.value):days.delete(el.value);s.days[id]=[...days].sort();s.plan=null;s.open=true;s.message='';draw(s);});
 }
 return {mount(host,options){
  if(!host||!options.snapshotId)return;const scope=h.scope(),key=scope+':'+options.clubId+':'+options.snapshotId;let s=entries.get(key);
  if(!s){s={...options,scope,matches:{},days:{},busy:false,context:null};entries.set(key,s);}
  s.host=host;s.here=options.here;s.changed=options.changed;
  if(options.teamId&&options.teamId!==s.teamId&&!s.pending&&!s.busy){s.teamId=options.teamId;s.context=null;s.plan=null;s.saved=false;}
  draw(s);if(!s.context&&!s.busy&&!s.pending)void load(s);
 }};
}
