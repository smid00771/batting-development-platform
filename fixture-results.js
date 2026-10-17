/* A fixture owns its shared scorecard, independently of selection locks and awards. */
import {weeklyResultCoverage,cardStatus} from './shared-match-results.js?v=0.8.62.201';

export function createFixtureResults(h){
 const esc=h.escape,labels={ready:'Scores loaded',playing:'Still playing',team:'Choose our team',incomplete:'Scores incomplete',bowling:'Bowling missing'};
 let current=null;
 const live=s=>current===s&&s.host.isConnected&&h.here(s);
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('club_match_results_api',{p_club_id:s.clubId,p_action:action,p_data:{fixture_id:s.fixtureId,...data}});if(r.error)throw Error(r.error.message);return r.data;}
 function selected(s){return s.context?weeklyResultCoverage(s.context).rows.find(r=>r.id===s.fixtureId)?.card:null;}
 async function read(s){const result=await rpc(s,'fixture');if(!Array.isArray(result?.fixtures)||!Array.isArray(result?.cards))throw Error('Scorecard could not be checked.');if(live(s)){s.context=result;const c=selected(s);if(!s.dirty)s.url=c?.scorecard.url||'';}return result;}
 function draw(s){
  if(!live(s))return;const c=selected(s),f=s.context?.fixtures[0],locked=s.busy?'disabled':'',candidates=(s.context?.cards||[]).filter(x=>!x.fixture_id||x.fixture_id===s.fixtureId);
  s.host.innerHTML=`<section class="se-card fixture-results" aria-label="Fixture scorecard"><style>.fixture-results{margin:12px 0}.fixture-results h3{margin:0 0 8px}.fixture-results p{margin:8px 0}.fixture-results .fr-input{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.fixture-results .fr-input input{flex:1;min-width:min(240px,100%)}.fixture-results [role=status]:empty{display:none}.fixture-results summary{cursor:pointer;padding:8px 0}.fixture-results label{margin:8px 0}</style><h3>PlayCricket scorecard</h3>${s.context?`
   ${c?`<p><strong>${esc(labels[cardStatus(c)])}</strong> · <a href="${esc(c.scorecard.url)}" target="_blank" rel="noopener">View on PlayCricket</a></p>`:f.no_play?`<p>Marked ${esc(f.no_play.replaceAll('_',' '))}.</p>`:''}
   <div class="fr-input"><input type="url" data-fixture-score-url aria-label="PlayCricket match link" placeholder="Paste PlayCricket match link" value="${esc(s.url)}" ${locked}><button type="button" class="btn secondary" data-fixture-score-load ${locked}>${s.busy?'Saving…':c?'Refresh scores':'Load scores'}</button></div>
   <p class="se-muted">Shared with Match Review and social awards.</p>
   ${!c&&candidates.length?`<label>Already imported<select data-fixture-score-existing ${locked}><option value="">Choose this match’s scorecard</option>${candidates.map(x=>`<option value="${esc(x.snapshot_id)}">${esc(x.scorecard.grade)} · ${esc(x.scorecard.teams.map(t=>t.name).join(' v '))}</option>`).join('')}</select></label>`:''}
   ${c&&!c.our_team?`<label>Our team<select data-fixture-score-team ${locked}><option value="">Choose our team</option>${c.scorecard.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>`:''}
   ${!c?`<details><summary>${f.no_play?'Change no-play status':'Match did not take place?'}</summary><label>No play reason<select data-fixture-score-no-play ${locked}><option value="">Scores expected</option>${[['washed_out','Washed out'],['bye','Bye'],['cancelled','Cancelled']].map(([v,l])=>`<option value="${v}" ${f.no_play===v?'selected':''}>${l}</option>`).join('')}</select></label></details>`:''}
   ${c?.our_team?'<div data-fixture-score-team-check></div>':''}`:''}
   <p role="status" aria-live="polite">${esc(s.message)}</p>${!s.context&&!s.busy?'<button type="button" class="btn ghost" data-fixture-score-retry>Try again</button>':''}</section>`;
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
