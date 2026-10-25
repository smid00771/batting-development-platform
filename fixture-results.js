/* A fixture owns its shared scorecard, independently of selection locks and awards. */
import {weeklyResultCoverage,cardStatus} from './shared-match-results.js?v=0.8.62.235';

const escapeScore = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const scoreNumber = value => Number.isInteger(value) && value >= 0 ? String(value) : '—';
const scoreOvers = balls => Number.isInteger(balls) && balls >= 0 ? `${Math.floor(balls / 6)}.${balls % 6}` : '—';
const scoreRate = (runs, balls, factor) => Number.isInteger(runs) && runs >= 0 && Number.isInteger(balls) && balls > 0 ? (runs * factor / balls).toFixed(2) : '—';
export function renderFixtureScorecard(wrapped, openTeams = null) {
 const card=wrapped?.scorecard;
 if(!card?.teams?.length)return '';
 const teams=[...card.teams].sort((a,b)=>Number(b.id===wrapped.our_team)-Number(a.id===wrapped.our_team));
 const innings=card.innings||[];
 const batting=i=>`<div class="fr-table-wrap"><table class="fr-score-table"><caption>Batting${innings.filter(x=>x.team_id===i.team_id).length>1?' · innings '+escapeScore(i.number):''}${i.complete?'':' · in progress'}</caption><thead><tr><th scope="col">Batter</th><th scope="col">R</th><th scope="col">B</th><th scope="col">4s</th><th scope="col">6s</th><th scope="col" title="Strike rate · runs per 100 balls">S/R</th></tr></thead><tbody>${(i.batters||[]).map(p=>`<tr><th scope="row">${escapeScore(p.name||'Name withheld')}<small>${escapeScore(p.status==='did_not_bat'?'Did not bat':p.dismissal_text||p.dismissal||(!i.complete?'In progress':''))}</small></th><td><strong>${p.status==='did_not_bat'?'DNB':scoreNumber(p.runs)+(p.not_out?'*':'')}</strong></td><td>${p.status==='did_not_bat'?'—':scoreNumber(p.balls)}</td><td>${p.status==='did_not_bat'?'—':scoreNumber(p.fours)}</td><td>${p.status==='did_not_bat'?'—':scoreNumber(p.sixes)}</td><td>${p.status==='did_not_bat'?'—':scoreRate(p.runs,p.balls,100)}</td></tr>`).join('')||'<tr><td colspan="6">Batting figures unavailable.</td></tr>'}</tbody></table></div><p class="fr-total">Extras ${scoreNumber(i.extras)} · Total ${scoreNumber(i.wickets)}/${scoreNumber(i.runs)}${/declared/i.test(i.closure||'')?' declared':''}</p>`;
 const bowling=(i,team)=>`<div class="fr-table-wrap"><table class="fr-score-table"><caption>Bowling${innings.filter(x=>x.team_id!==team.id).length>1?' · innings '+escapeScore(i.number):''}${i.complete?'':' · in progress'}</caption><thead><tr><th scope="col">Bowler</th><th scope="col">O</th><th scope="col">M</th><th scope="col">R</th><th scope="col">W</th><th scope="col" title="Economy · runs per over">Econ</th></tr></thead><tbody>${(i.bowlers||[]).filter(p=>p.team_id===team.id).map(p=>`<tr><th scope="row">${escapeScore(p.name||'Name withheld')}</th><td>${scoreOvers(p.balls)}</td><td>${scoreNumber(p.maidens)}</td><td>${scoreNumber(p.runs)}</td><td><strong>${scoreNumber(p.wickets)}</strong></td><td>${scoreRate(p.runs,p.balls,6)}</td></tr>`).join('')||`<tr><td colspan="6">${i.bowling_available?'No bowling figures recorded.':'Bowling figures unavailable.'}</td></tr>`}</tbody></table></div>`;
 return `<div class="fr-scores" aria-label="Player scorecard">${card.result?`<p class="fr-result">${escapeScore(card.result)}</p>`:''}${teams.map((team,index)=>{
  const ours=innings.filter(i=>i.team_id===team.id),theirs=innings.filter(i=>i.team_id!==team.id);
  const totals=ours.map(i=>`${scoreNumber(i.wickets)}/${scoreNumber(i.runs)}`).join(' & ');
  const open=openTeams?openTeams.has(team.id):index===0;
  return `<details class="fr-team-scores" data-score-team="${escapeScore(team.id)}" ${open?'open':''}><summary><strong>${escapeScore(team.name)}</strong><span>${totals}</span></summary>${ours.map(batting).join('')||'<p>Batting figures unavailable.</p>'}${theirs.map(i=>bowling(i,team)).join('')}</details>`;
 }).join('')}</div>`;
}

export function createFixtureResults(h){
 const esc=h.escape,labels={ready:'Scores loaded',playing:'Still playing',team:'Choose our team',incomplete:'Scores incomplete',bowling:'Bowling missing'};
 let current=null;
 const live=s=>current===s&&s.host.isConnected&&h.here(s);
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('club_match_results_api',{p_club_id:s.clubId,p_action:action,p_data:{fixture_id:s.fixtureId,...data}});if(r.error)throw Error(r.error.message);return r.data;}
 function selected(s){return s.context?weeklyResultCoverage(s.context).rows.find(r=>r.id===s.fixtureId)?.card:null;}
 async function read(s){const result=await rpc(s,'fixture');if(!Array.isArray(result?.fixtures)||!Array.isArray(result?.cards))throw Error('Scorecard could not be checked.');if(live(s)){s.context=result;const c=selected(s);if(!s.dirty)s.url=c?.scorecard.url||'';h.loaded?.(s,c);}return result;}
 function draw(s){
  if(!live(s))return;const c=selected(s),f=s.context?.fixtures[0],locked=s.busy?'disabled':'',candidates=(s.context?.cards||[]).filter(x=>!x.fixture_id||x.fixture_id===s.fixtureId);
  const previous=s.host.querySelectorAll('[data-score-team]'),openTeams=previous.length?new Set([...previous].filter(el=>el.open).map(el=>el.dataset.scoreTeam)):null;
  s.host.innerHTML=`<section class="se-card fixture-results" aria-label="Fixture scorecard"><style>.fixture-results{margin:12px 0}.fixture-results h3{margin:0 0 8px}.fixture-results p{margin:8px 0}.fixture-results .fr-input{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.fixture-results .fr-input input{flex:1;min-width:min(240px,100%)}.fixture-results [role=status]:empty{display:none}.fixture-results summary{cursor:pointer;padding:8px 0}.fixture-results label{margin:8px 0}</style><div class="se-top" style="align-items:center;margin-bottom:8px"><h3 style="margin:0">Match scorecard</h3>${s.context?.can_review&&h.openMatchReview?`<button class="btn ghost" type="button" data-fixture-match-review ${locked}>Match Review</button>`:''}</div>${s.context?`
   ${c?`<p><strong>${esc(labels[cardStatus(c)])}</strong>${c.scorecard.url?` · <a href="${esc(c.scorecard.url)}" target="_blank" rel="noopener">View on PlayCricket</a>`:c.scorecard.provider==='playhq_au'?' · PlayHQ':''}</p>`:f.no_play?`<p>Marked ${esc(f.no_play.replaceAll('_',' '))}.</p>`:''}
   ${s.context.playhq?.linked?`<div class="se-actions">${s.context.playhq.can_check?`<button type="button" class="btn ghost" data-phq-check="results" ${locked}>Check scores now</button><button type="button" class="btn ghost" data-phq-check="fixtures" ${locked}>Check fixture changes</button>`:''}${s.context.playhq.pending_change&&s.context.playhq.can_check?'<button type="button" class="btn ghost" data-phq-review>Review fixture change</button>':''}</div>${s.context.playhq.error?`<p role="alert">${esc(s.context.playhq.error)}</p>`:''}`:''}
   <details ${!c&&!s.context.playhq?.linked?'open':''}><summary>Use a PlayCricket match link</summary><div class="fr-input"><input type="url" data-fixture-score-url aria-label="PlayCricket match link" placeholder="Paste PlayCricket match link" value="${esc(s.url)}" ${locked}><button type="button" class="btn secondary" data-fixture-score-load ${locked}>${s.busy?'Saving…':c?'Refresh scores':'Load scores'}</button></div></details>
   ${c?renderFixtureScorecard(c,openTeams):''}
   ${!c&&candidates.length?`<label>Already imported<select data-fixture-score-existing ${locked}><option value="">Choose this match’s scorecard</option>${candidates.map(x=>`<option value="${esc(x.snapshot_id)}">${esc(x.scorecard.grade)} · ${esc(x.scorecard.teams.map(t=>t.name).join(' v '))}</option>`).join('')}</select></label>`:''}
   ${c&&!c.our_team?`<label>Our team<select data-fixture-score-team ${locked}><option value="">Choose our team</option>${c.scorecard.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>`:''}
   ${!c?`<details><summary>${f.no_play?'Change no-play status':'Match did not take place?'}</summary><label>No play reason<select data-fixture-score-no-play ${locked}><option value="">Scores expected</option>${[['washed_out','Washed out'],['bye','Bye'],['cancelled','Cancelled']].map(([v,l])=>`<option value="${v}" ${f.no_play===v?'selected':''}>${l}</option>`).join('')}</select></label></details>`:''}
   ${c?.our_team?'<div data-fixture-score-team-check></div>':''}`:''}
   <p role="status" aria-live="polite">${esc(s.message)}</p>${!s.context&&!s.busy?'<button type="button" class="btn ghost" data-fixture-score-retry>Try again</button>':''}</section>`;
  s.host.querySelectorAll('[data-phq-check]').forEach(el=>el.onclick=()=>void run(s,async()=>{const r=await h.supabase.functions.invoke('playhq-sync',{body:{club_id:s.clubId,action:'check',fixture_id:s.fixtureId,kind:el.dataset.phqCheck}});if(r.error||r.data?.error){let detail;try{detail=await r.error?.context?.json();}catch{}throw Error(detail?.error||r.data?.error||(['FunctionsFetchError','FunctionsRelayError'].includes(r.error?.name)||/Failed to send a request to the Edge Function/.test(r.error?.message||'')?'The score check could not connect. Try again in five minutes; saved scores are unchanged.':r.error?.message)||'PlayHQ check failed');}}));
  s.host.querySelector('[data-fixture-match-review]')?.addEventListener('click',()=>h.openMatchReview(s));
  s.host.querySelector('[data-phq-review]')?.addEventListener('click',()=>h.reviewPlayHQ?.(s));
  s.host.querySelector('[data-fixture-score-url]')?.addEventListener('input',e=>{s.url=e.target.value;s.dirty=true;s.host.querySelector('[data-fixture-score-load]').textContent=c&&s.url===c.scorecard.url?'Refresh scores':'Load scores';});
  s.host.querySelector('[data-fixture-score-load]')?.addEventListener('click',()=>void importScores(s));
  s.host.querySelector('[data-fixture-score-retry]')?.addEventListener('click',()=>void load(s));
  s.host.querySelector('[data-fixture-score-existing]')?.addEventListener('change',e=>{if(e.target.value)void run(s,()=>rpc(s,'link',{snapshot_id:e.target.value,expected_match_id:f.match_id||null}));});
  s.host.querySelector('[data-fixture-score-team]')?.addEventListener('change',e=>{if(e.target.value)void run(s,()=>rpc(s,'identify',{snapshot_id:c.snapshot_id,team_id:e.target.value}));});
  s.host.querySelector('[data-fixture-score-no-play]')?.addEventListener('change',e=>void run(s,()=>rpc(s,'no_play',{reason:e.target.value})));
  const teamHost=s.host.querySelector('[data-fixture-score-team-check]');if(teamHost&&!s.busy)h.teamCheck?.(teamHost,{clubId:s.clubId,snapshotId:c.snapshot_id,teamId:c.our_team,fixtureId:s.fixtureId,here:()=>live(s),changed:async()=>{await h.teamChanged?.(s);}});
 }
 async function load(s){if(s.busy)return;s.busy=true;s.message='Checking saved scores…';draw(s);try{await read(s);s.message='';}catch(error){s.message=error.message;}finally{s.busy=false;draw(s);}}
 async function run(s,work){if(s.busy||!live(s))return;s.busy=true;s.message='Saving scores…';draw(s);try{await work();s.dirty=false;if(!live(s))return;await read(s);if(!live(s))return;s.message='Saved. Scores are available across the club.';await h.changed?.(s);}catch(error){s.message=error.message;}finally{s.busy=false;draw(s);}}
 async function importScores(s){const url=h.extractUrl([s.url]);if(!url){s.message='Paste one full PlayCricket match link.';draw(s);return;}
  const expected=s.context.fixtures[0].match_id||null;
  await run(s,async()=>{let result;if(h.fetchCard)result=await h.fetchCard(s,url,s.fixtureId);else{const r=await h.supabase.functions.invoke('playcricket-scorecard',{body:{club_id:s.clubId,fixture_id:s.fixtureId,url,purpose:'fixture_result'}});if(r.error){let detail;try{detail=await r.error.context?.json();}catch{}throw Error(detail?.error||r.error.message);}result=r.data;}
   if(!result?.snapshot_id||result.error)throw Error(result?.error||'Scorecard load was not confirmed.');await rpc(s,'link',{snapshot_id:result.snapshot_id,expected_match_id:expected});
  });
 }
 return {mount(host,options){const s={...options,host,url:'',dirty:false,busy:false,context:null,message:''};current=s;void load(s);return s;},canLeave(){const s=current;if(!s||!live(s))return true;if(s.busy){h.alert('Please wait for the scorecard to finish.');return false;}if(s.dirty&&!h.confirm('Leave this unsaved scorecard link?'))return false;s.dirty=false;return true;}};
}
