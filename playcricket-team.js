/* Compare the trusted scorecard automatically; ask only for missing identities and the change. */
import {matchReviewNameParts,matchReviewShortNameMatches} from './player-name-matching.js?v=0.8.62.204';
const normal=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function scorecardPlayerMatches(players,roster,links=[]){
 const matches={},used=new Set();
 for(const p of players){
  const saved=[...new Set(links.filter(l=>l.source_id===p.player_id).map(l=>l.roster_id))],registered=roster.filter(r=>String(r.external_id||'').toLowerCase()===p.player_id.toLowerCase());
  const candidates=saved.length?roster.filter(r=>saved.includes(r.id)):registered.length?registered:roster.filter(r=>normal(r.name)===normal(p.name));
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
export function scorecardPlayerCandidates(players,roster,links=[],matches={}){
 const result={};
 for(const p of players){
  const current=roster.find(r=>r.id===matches[p.player_id]);
  if(current&&!current.imported_stub&&!current.identity_unlinked&&current.active!==false)continue;
  result[p.player_id]=roster.filter(r=>r.active!==false&&!r.imported_stub&&r.id!==current?.id&&
   !players.some(other=>other.player_id!==p.player_id&&matches[other.player_id]===r.id)&&
   matchReviewShortNameMatches(matchReviewNameParts(p.name),matchReviewNameParts(r.name)));
  if(!result[p.player_id].length&&current?.active===false)result[p.player_id]=[current];
 }
 return result;
}
export function createScorecardTeams(h){
 const entries=new Map(),esc=h.escape;
 const option=(value,label,selected)=>`<option value="${esc(value)}" ${selected?'selected':''}>${esc(label)}</option>`;
 async function rpc(s,action,data={}){const result=await h.supabase.rpc('playcricket_team_api',{p_club_id:s.clubId,p_action:action,p_data:{snapshot_id:s.snapshotId,...data}});if(result.error)throw result.error;if(!result.data)throw Error('Could not check the team.');return result.data;}
 function live(s){return s.host?.isConnected&&s.here()&&s.scope===h.scope();}
 function setMatches(s){
  const team=s.context.card.teams.find(t=>t.id===s.teamId),fixture=s.context.fixtures.find(f=>f.id===s.fixtureId);
  s.matches=scorecardPlayerMatches(team?.players||[],s.context.roster,s.context.links);s.candidates=scorecardPlayerCandidates(team?.players||[],s.context.roster,s.context.links,s.matches);s.rejected={};s.days={};s.plan=null;s.deferred=false;s.error=false;s.saved=false;
  for(const [id,candidates] of Object.entries(s.candidates))if(candidates.length)s.matches[id]='';
  for(const p of team?.players||[]){const id=s.matches[p.player_id];s.days[p.player_id]=fixture?.brackets?fixture.days.filter((_,i)=>fixture.slots.some(slot=>slot['d'+(i+1)]===id)).map(d=>d.date):(fixture?.days||[]).map(d=>d.date);}
 }
 function payload(s){return {fixture_id:s.fixtureId,team_id:s.teamId,mapping:(s.context.card.teams.find(t=>t.id===s.teamId)?.players||[]).map(p=>({source_id:p.player_id,roster_id:s.matches[p.player_id],days:s.days[p.player_id]||[]}))};}
 function needsChoice(s,p){const id=s.matches?.[p.player_id];return !id||!s.days?.[p.player_id]?.length||id!=='new'&&Object.values(s.matches).filter(value=>value===id).length>1;}
 async function confirmIdentity(s,sourceId,rosterId){
  if(s.busy||s.pending)return;
  const r=s.context.roster.find(r=>r.id===rosterId);if(!r&&!s.identityPending)return;
  s.identityPending||={p_club_id:s.clubId,p_request_id:crypto.randomUUID(),p_values:{snapshot_id:s.snapshotId,team_id:s.teamId,source_player_id:sourceId,roster_id:rosterId,fixture_id:s.fixtureId||null,expected_name:r.name,prefer_registration:true}};
  s.busy=true;s.error=false;s.message='Linking player…';draw(s);
  try{
   const {data,error}=await h.supabase.rpc('confirm_scorecard_player',s.identityPending);if(error)throw error;if(!data?.confirmed)throw Error('The player link was not confirmed.');
   s.identityPending=null;s.context=null;s.plan=null;s.saved=false;
   for(const entry of entries.values())if(entry!==s&&entry.clubId===s.clubId&&!entry.busy&&!entry.pending&&!entry.identityPending){entry.context=null;entry.plan=null;entry.stale=true;}
   if(live(s))try{await s.changed?.(data);}catch{s.error=true;s.message='Player linked. Refresh this page to load the updated team.';}
  }catch(error){s.error=true;s.message=error.message||'Player link not confirmed. Retry the same confirmation.';if(error.code&&error.code!=='PGRST000'&&!String(error.code).startsWith('08'))s.identityPending=null;}
  finally{s.busy=false;draw(s);}
  if(!s.error&&!s.identityPending)await load(s);
 }
 function ready(s){const team=s.context?.card.teams.find(t=>t.id===s.teamId);return s.fixtureId&&team?.players?.length&&team.players.every(p=>!needsChoice(s,p));}
 function reveal(s){if(!live(s))return;const result=s.host.querySelector('[data-pc-result]');result?.focus({preventScroll:true});result?.scrollIntoView?.({block:'nearest'});}
 async function preview(s,show=false){
  if(s.busy||s.pending||s.identityPending||!ready(s)||s.context.card.status!=='completed'||!s.context.card.teams.find(t=>t.id===s.teamId)?.lineup_available)return;
  s.busy=true;s.error=false;s.deferred=false;s.message='Checking the selected team…';draw(s);
  try{const plan=await rpc(s,'preview',payload(s));if(typeof plan.changed!=='boolean'||!Array.isArray(plan.fixtures)||!plan.fixtures.length||!plan.expected)throw Error('The team check was not confirmed. Please retry.');s.plan=plan;s.message='';}catch(error){s.plan=null;s.error=true;s.message=error.message||'Could not check the selected team.';}finally{s.busy=false;draw(s);if(show)reveal(s);}
 }
 async function load(s){
  if(s.busy||s.pending||s.identityPending)return;s.busy=true;s.error=false;s.message='Checking the selected team…';draw(s);
  try{const ctx=await rpc(s,'context');if(ctx.enabled!==false&&(!Array.isArray(ctx.card?.teams)||!Array.isArray(ctx.fixtures)||!Array.isArray(ctx.roster)))throw Error('The team check could not be loaded. Please retry.');s.context=ctx;s.stale=false;if(!s.context.enabled){s.message='';return;}
   s.teamId=s.context.card.teams.some(t=>t.id===s.teamId)?s.teamId:s.context.our_team||'';
   s.fixtureId=scorecardFixture(s.context,s.teamId,s.fixtureId);setMatches(s);s.message='';
  }catch(error){s.error=true;s.message=error.message||'Could not check the selected team.';}finally{s.busy=false;draw(s);}
  if(!s.error&&s.context?.enabled)await preview(s);
 }
 async function apply(s){
  if(s.busy||s.identityPending||!s.plan&&!s.pending)return;
  s.pending||={...payload(s),expected:s.plan.expected,request_id:crypto.randomUUID()};s.busy=true;s.error=false;s.message='Updating teams…';draw(s);
  try{const result=await rpc(s,'apply',s.pending);if(!result.saved)throw Error('Team update was not confirmed. Retry the same update.');s.pending=null;s.saved=true;s.message='Team updated to match PlayCricket.';
   // Other imported scorecards must be checked again after a transfer.
   for(const entry of entries.values())if(entry!==s&&entry.clubId===s.clubId&&!entry.busy&&!entry.pending&&!entry.identityPending){entry.context=null;entry.plan=null;entry.stale=true;}
   if(live(s))try{await s.changed?.(result);}catch{s.message='Team updated. Refresh this page to load the corrected review list.';}
  }catch(error){s.error=true;s.message=error.message||'Update not confirmed. Retry to check the same update.';if(error.code&&error.code!=='PGRST000'&&!String(error.code).startsWith('08')){s.pending=null;s.plan=null;s.stale=true;}}
  finally{s.busy=false;draw(s);reveal(s);}
 }
 function draw(s){
  if(!live(s))return;const ctx=s.context,locked=s.busy||!!s.pending||!!s.identityPending;
  if(ctx?.enabled===false){s.host.innerHTML='';return;}
  const team=ctx?.card.teams.find(t=>t.id===s.teamId),fixture=ctx?.fixtures.find(f=>f.id===s.fixtureId),target=s.plan?.fixtures[0],others=s.plan?.fixtures.slice(1)||[],players=team?.players||[];
  const unresolved=players.filter(p=>needsChoice(s,p)),canCheck=ctx&&ctx.card.status==='completed'&&team?.lineup_available;
  const changes=target?[target.added.length?'In: '+target.added.join(', '):'',target.removed.length?'Out: '+target.removed.join(', '):''].filter(Boolean):[];
  const warning=!!s.plan?.changed&&!s.saved;
  if((s.saved||s.plan&&!s.plan.changed)&&!s.busy&&!s.error&&!s.pending&&!s.identityPending){s.host.innerHTML='';return;}
  if(s.deferred&&warning&&!s.busy&&!s.pending){s.host.innerHTML='<p data-pc-result tabindex="-1" role="status">Team left unchanged. It differs from PlayCricket.</p><button type="button" class="btn ghost" data-pc-review>Review change</button>';s.host.querySelector('[data-pc-review]').onclick=()=>void preview(s,true);return;}
  s.host.innerHTML=`<section class="pc-team ${warning?'pc-team-warning':''}" aria-label="PlayCricket team check">
   <style>.pc-team{margin:12px 0;border:1px solid #ccd7df;border-radius:8px;padding:12px}.pc-team-warning{border:2px solid #b86a00;background:#fff8e9}.pc-team p{margin:6px 0}.pc-team label{display:block;margin:8px 0}.pc-team select{max-width:100%;width:100%;min-height:44px}.pc-team button{min-height:44px;margin:8px 8px 0 0}.pc-team [role=status]:empty{display:none}.pc-team-player{border-top:1px solid #dce2e8;padding:7px 0}</style>
   <div data-pc-result tabindex="-1" ${warning?'role="alert"':''}><strong>${warning?'The team that played differs from the selected team.':s.error?'Team check needs attention':unresolved.length&&canCheck&&fixture?'Match '+unresolved.length+' player'+(unresolved.length===1?'':'s'):'PlayCricket team check'}</strong>${warning?'<p>Update the team to match PlayCricket?</p>':''}</div>
   ${ctx&&!ctx.fixtures.length?'<p>No fixture has these match dates. Add or correct the fixture in Teams, then check again.</p>':ctx?`
   ${!s.teamId?`<label>Our PlayCricket team<select data-pc-team ${locked?'disabled':''}>${option('','Choose our team',true)}${ctx.card.teams.map(t=>option(t.id,t.name,false)).join('')}</select></label>`:''}
   ${ctx.fixtures.length&&!fixture?`<label>Club fixture<select data-pc-fixture ${locked?'disabled':''}>${option('','Choose the matching fixture',true)}${ctx.fixtures.map(f=>option(f.id,f.grade+' v '+f.opposition+' · '+f.days.map(d=>d.date).join(' / '),false)).join('')}</select></label>`:''}
   ${ctx.card.status!=='completed'?'<p>The team can be updated when the scorecard is complete.</p>':team&&!team.lineup_available?'<p>Refresh the scorecard to load its full listed team.</p>':''}
   ${canCheck&&fixture&&unresolved.length&&!s.saved?unresolved.map(p=>{const candidates=s.rejected?.[p.player_id]?[]:s.candidates?.[p.player_id]||[],candidate=candidates.length===1?candidates[0]:null;return `<div class="pc-team-player">${candidate?`<p>Is <strong>${esc(p.name)}</strong> the same player as <strong>${esc(candidate.name)}</strong>?</p><button type="button" class="btn" data-pc-same="${esc(p.player_id)}" data-roster="${esc(candidate.id)}" ${locked?'disabled':''}>Yes, use PlayCricket name</button><button type="button" class="btn ghost" data-pc-different="${esc(p.player_id)}" ${locked?'disabled':''}>No</button>`:`<label>${esc(p.name)}<select data-pc-player="${esc(p.player_id)}" ${locked?'disabled':''}>${option('','Choose club player',!s.matches[p.player_id])}${ctx.roster.filter(r=>r.active!==false&&!r.imported_stub).map(r=>option(r.id,r.name,s.matches[p.player_id]===r.id)).join('')}${option('new','Add new player',s.matches[p.player_id]==='new')}</select></label>`}${fixture.brackets&&!candidate?`<label>Played on<select data-pc-days="${esc(p.player_id)}" ${locked?'disabled':''}>${option('','Choose playing days',!s.days[p.player_id]?.length)}${fixture.days.map(d=>option(d.date,d.date.split('-').reverse().join('/'),s.days[p.player_id]?.length===1&&s.days[p.player_id][0]===d.date)).join('')}${fixture.days.length>1?option(fixture.days.map(d=>d.date).join(','),'Both days',s.days[p.player_id]?.length===fixture.days.length):''}</select></label>`:''}</div>`;}).join(''):''}
   ${changes.map(t=>`<p>${esc(t)}</p>`).join('')}
   ${others.map(f=>`<p><strong>${esc(f.grade)}:</strong> ${esc([...new Set(f.departures.map(p=>p.name))].join(', '))} will be removed, leaving a highlighted gap.</p>`).join('')}
   ${warning&&!changes.length&&!others.length?'<p>The saved lineup or playing days will be corrected.</p>':''}
   ${warning&&!s.pending?`<button type="button" class="btn" data-pc-apply ${locked?'disabled':''}>${s.busy?'Updating…':'Update team'}</button><button type="button" class="btn ghost" data-pc-later ${locked?'disabled':''}>Not now</button>`:''}`:''}
   <p role="${s.error?'alert':'status'}" aria-live="polite">${esc(s.message||'')}</p>
   ${s.pending?`<button type="button" class="btn" data-pc-apply ${s.busy?'disabled':''}>${s.busy?'Updating…':'Retry team update'}</button>`:''}
   ${s.identityPending?`<button type="button" class="btn" data-pc-retry-identity ${s.busy?'disabled':''}>${s.busy?'Linking…':'Retry player link'}</button>`:''}
   ${(s.error||s.stale||ctx&&!ctx.fixtures.length)&&!s.busy&&!s.pending&&!s.identityPending?'<button type="button" class="btn secondary" data-pc-reload>Retry team check</button>':''}
   </section>`;
  s.host.querySelector('[data-pc-apply]')?.addEventListener('click',()=>void apply(s));
  s.host.querySelectorAll('[data-pc-same]').forEach(b=>b.onclick=()=>void confirmIdentity(s,b.dataset.pcSame,b.dataset.roster));
  s.host.querySelectorAll('[data-pc-different]').forEach(b=>b.onclick=()=>{s.rejected[b.dataset.pcDifferent]=true;draw(s);});
  s.host.querySelector('[data-pc-retry-identity]')?.addEventListener('click',()=>void confirmIdentity(s));
  s.host.querySelector('[data-pc-later]')?.addEventListener('click',()=>{if(s.busy||s.pending)return;s.deferred=true;draw(s);reveal(s);});
  s.host.querySelector('[data-pc-reload]')?.addEventListener('click',()=>{if(ctx&&!s.stale&&ready(s))void preview(s,true);else{s.stale=false;void load(s);}});
  s.host.querySelector('[data-pc-team]')?.addEventListener('change',e=>{s.teamId=e.target.value;s.fixtureId=scorecardFixture(ctx,s.teamId,s.fixtureId);setMatches(s);draw(s);void preview(s,true);});
  s.host.querySelector('[data-pc-fixture]')?.addEventListener('change',e=>{s.fixtureId=e.target.value;s.saved=false;setMatches(s);draw(s);void preview(s,true);});
  s.host.querySelectorAll('[data-pc-player]').forEach(el=>el.onchange=()=>{const id=el.dataset.pcPlayer,r=ctx.roster.find(r=>r.id===el.value);if(r){s.candidates[id]=[r];s.rejected[id]=false;s.matches[id]='';draw(s);return;}s.matches[id]=el.value;s.plan=null;s.message='';s.error=false;draw(s);void preview(s,true);});
  s.host.querySelectorAll('[data-pc-days]').forEach(el=>el.onchange=()=>{s.days[el.dataset.pcDays]=el.value?el.value.split(','):[];s.plan=null;s.message='';s.error=false;draw(s);void preview(s,true);});
 }
 return {mount(host,options){
  if(!host||!options.snapshotId)return;const scope=h.scope(),key=scope+':'+options.clubId+':'+options.snapshotId;let s=entries.get(key);
  if(!s){s={...options,scope,matches:{},days:{},busy:false,context:null};entries.set(key,s);}
  // A reopened scorecard must compare against selections saved since the last visit.
  // Keep unfinished choices and uncertain updates intact.
  if(s.host&&s.host!==host&&(s.plan||s.saved)&&!s.busy&&!s.pending&&!s.identityPending){s.context=null;s.plan=null;s.saved=false;s.deferred=false;}
  s.host=host;s.here=options.here;s.changed=options.changed;
  if(options.teamId&&options.teamId!==s.teamId&&!s.pending&&!s.identityPending&&!s.busy){s.teamId=options.teamId;s.context=null;s.plan=null;s.saved=false;}
  draw(s);if(!s.context&&!s.busy&&!s.pending&&!s.identityPending)void load(s);
 }};
}
