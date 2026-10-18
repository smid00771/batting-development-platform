import {buildSeasonStats, statsOvers, STATS_FORMATS} from './season-stats.js?v=0.8.62.205';
import {buildSelectionEvidence, battingRoleLabel, bowlingRoleLabel, NDCA_GUIDE, NDCA_BENCHMARKS} from './selection-evidence.js?v=0.8.62.218';

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number=value=>Number.isFinite(value)?value.toLocaleString('en-AU',{maximumFractionDigits:1}):'—';
const decimal=value=>Number.isFinite(value)?value.toFixed(2):'—';
const states={strong:['↑','Strong'],low:['↓','Below guide'],slow:['·','Slow start'],building:['·','Not yet rated'],steady:['','Within guide']};
export const evidenceStyles=`<style>
.se-evidence-button{border:0;border-radius:6px;background:transparent;display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:3px;min-height:44px;min-width:44px;max-width:110px;padding:4px;cursor:pointer;color:#24344c;font:600 11px/1.3 system-ui}.se-evidence-button:hover{background:#eef2f7}.se-evidence-button:focus-visible{outline:2px solid #17245f;outline-offset:2px}.se-evidence-button .se-evidence-chip{display:inline-flex;gap:3px;align-items:center;border:1px solid transparent;border-radius:4px;padding:2px 4px;white-space:nowrap;font-size:11px;line-height:1.3;margin:0}.se-evidence-chip.strong{background:#d9f2e7;color:#175c41;border-color:#a7d6c0}.se-evidence-chip.low{background:#fff0cf;color:#784500;border-color:#e6c37b}.se-evidence-chip.slow{background:#fff9ed;color:#78664b;border-color:#eee3ce}.se-evidence-chip.building{background:#edf0f4;color:#526074;border-color:#d3dae3}.se-evidence-link{color:#243f92;background:#e9edfc}.se-evidence-link.tradeoff{color:#596477;background:#edf0f4}.se-evidence:empty{display:none}.se-has-evidence{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px}.se-has-evidence>.se-conversation-status{grid-column:1/-1}.se-has-evidence>.se-evidence .se-evidence-button{max-width:72px}.se-evidence-dialog{box-sizing:border-box;width:min(560px,calc(100% - 24px));max-height:85dvh;overflow:auto;border:1px solid #cdd6e3;border-radius:12px;padding:16px;color:#24344c;background:white;box-shadow:0 12px 60px #17245f30;font:14px/1.4 system-ui}.se-evidence-dialog::backdrop{background:#15233a66}.se-evidence-dialog h2{font-size:18px;margin:0}.se-evidence-dialog h3{font-size:15px;margin:12px 0 4px}.se-evidence-heading{display:flex;align-items:start;justify-content:space-between;gap:10px}.se-evidence-close{min-width:44px;min-height:44px;border:1px solid #cdd6e3;border-radius:6px;background:white;color:#24344c;cursor:pointer}.se-evidence-dialog p{margin:7px 0}.se-evidence-dialog p>small{display:block}.se-evidence-small{color:#52627a;font-size:12px}.se-evidence-metrics{display:flex;gap:12px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid #e1e7ee}.se-evidence-metrics>div{flex:1;min-width:150px}.se-evidence-metrics strong{display:block}.se-evidence-pair{border-bottom:1px solid #e1e7ee;padding:4px 0}.se-evidence-pair>summary,.se-evidence-help>summary{cursor:pointer;min-height:44px;align-content:center}.se-evidence-pair>summary small{display:block;margin-left:15px;color:#52627a}.se-evidence-pair-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.se-evidence-pair-grid>div{min-width:0;overflow-wrap:anywhere}.se-evidence-pair-grid strong,.se-evidence-pair-grid small{display:block}.se-evidence-target{background:#eef2fb;padding:8px;border-radius:6px}.se-evidence-help{font-size:12px;color:#52627a}.se-evidence-help ul{padding-left:18px;margin:4px 0 10px}.se-evidence-help li{margin:5px 0}.se-evidence-dialog .se-evidence-chip{display:inline-block;padding:2px 5px;border-radius:4px}.ss-name .se-evidence-button{vertical-align:middle;margin-left:4px}.ss-compare-cell .se-evidence-button{justify-content:flex-start;padding-left:0}.se-evidence-inline{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.se-evidence-button{flex-direction:column;align-items:stretch;gap:2px;max-width:100%;padding:3px;text-align:left}.se-evidence-button .se-evidence-chip{white-space:normal;font-size:11px;gap:2px;padding:1px 3px}.se-evidence-button .se-evidence-title{font-size:10px;line-height:1.3;margin:0;color:#526074;font-weight:600}.se-evidence-title .se-evidence-link{display:inline-block;margin-left:3px;font-size:10px}.se-evidence-chip.steady{color:#526074;background:transparent}.se-has-evidence>.se-evidence .se-evidence-button{max-width:160px}.ss-name .se-evidence-button{margin-left:0}.se-evidence-sample{font-size:11px;color:#526074}.se-evidence-close{flex-shrink:0;white-space:nowrap;padding:6px 10px}.se-evidence-source{margin:8px 0;color:#52627a;font-size:12px}@media(max-width:480px){.se-has-evidence{grid-template-columns:minmax(0,1fr);gap:0}.se-has-evidence>.se-evidence .se-evidence-button{padding-left:0}}
</style>`;

export function renderEvidenceBadges(item,key=item?.key) {
  if (!item || !key) return '';
  const parts=[], labels=[];let link='';
  for (const [kind,label] of [['bat','Batting'],['ball','Bowling']]) {
    const evidence=item[kind]; if (!evidence) continue;
    parts.push(`<span class="se-evidence-chip ${evidence.state}">${label}: ${states[evidence.state][0]} ${states[evidence.state][1]}</span>`);
    labels.push(label+': '+states[evidence.state][1]+(evidence.early?' (early sample)':''));
  }
  if (item.links.some(p=>p.number)) {
    const shown=item.links.filter(p=>p.number);
    link=`<span class="se-evidence-chip se-evidence-link ${shown.every(p=>p.kind==='tradeoff')?'tradeoff':''}">${shown.map(p=>(p.kind==='tradeoff'?'≈':'↔')+p.number).join(' ')}</span>`;
    labels.push(item.links.length+' possible '+(item.links.length===1?'comparison':'comparisons'));
  }
  return parts.length||link?`<button type="button" class="se-evidence-button" data-evidence-open="${escape(key)}" aria-label="${escape(item.person.name+': Form guide. '+labels.join('; ')+'. View performance details')}" title="${escape(labels.join(' · '))}"><span class="se-evidence-title">Form guide${item.bat?.early||item.ball?.early?' · early':''}${link}</span>${parts.join('')}</button>`:'';
}
function record(item) {
  const s=item.stats;
  if (!s) return '<p class="se-evidence-small">No linked season figures.</p>';
  const batting=s.batting_complete===false?'Figures incomplete':`${s.runs} runs · ${s.innings} inns · ${s.not_outs} not out`;
  const bowling=s.bowling_complete===false?'Figures incomplete':`${s.wickets} wickets · ${statsOvers(s.bowling_balls)??'—'} overs · ${s.bowling_innings} inns · ${s.wickets?decimal(s.conceded/s.wickets):'—'} average · ${decimal(s.economy)} economy`;
  return `<p><strong>${number(s.average)} batting average</strong><small>${escape(batting)}</small></p>${item.ball?.applicable?`<p><strong>${escape(bowling)}</strong></p>`:''}`;
}
function pairDetails(pair) {
  const {higher,lower}=pair, symbol=pair.kind==='tradeoff'?'≈':'↔';
  return `<details class="se-evidence-pair"><summary><strong>${pair.number?symbol+pair.number+' ':''}${escape(higher.person.name)} / ${escape(lower.person.name)}</strong><small>${escape(pair.reason)}</small></summary><div class="se-evidence-pair-grid">${[higher,lower].map(item=>`<div><strong>${escape(item.person.name)}</strong><small>${escape(item.team.grade)} · selected at ${item.position}</small><small>${escape(battingRoleLabel(item.person))}${item.ball?.applicable?' · '+escape(bowlingRoleLabel(item.person)):''}</small>${record(item)}</div>`).join('')}</div>${pair.targetAverage!==null?`<p class="se-evidence-target">Rough batting target in ${escape(lower.team.grade)}: <strong>${number(pair.targetAverage)} average</strong>.<br>${escape(lower.person.name)}: roughly <strong>${number(pair.equivalentBat)}</strong> in ${escape(higher.team.grade)}.</p>`:''}${higher.ball?.applicable?`<p class="se-evidence-small">Rough bowling equivalent for ${escape(lower.person.name)}: ${number(pair.equivalentWickets)} wickets per 100 balls · ${number(pair.equivalentEconomy)} economy. Compare actual overs and the bowling job as well.</p>`:''}<p class="se-evidence-small">Check availability, actual batting opportunities and team balance. Selected positions show the proposed order, not historical batting positions.</p></details>`;
}
function help() {
  return `<details class="se-evidence-help"><summary>How to read the guide</summary><ul><li><span class="se-evidence-chip strong">↑ Strong</span>, <span class="se-evidence-chip low">↓ Below guide</span> and Within guide compare this season's figures with fixed NDCA ${NDCA_BENCHMARKS.seasons} grade benchmarks. These are performance assessments, not player roles.</li><li>The benchmarks pool runs per dismissal, wickets per 100 balls and runs per six balls across the grade. Ducks, not-outs and wicketless records are retained. All batting positions, bowling types and match formats are combined; current player figures stay in the chosen format.</li><li><span class="se-evidence-chip building">· Not yet rated</span> means the player's figures, role or grade benchmark are insufficient. Positive batting flags can start after 2 innings. With fewer than 2 dismissals, the early check uses runs per innings; the displayed average stays unchanged. A faint <span class="se-evidence-chip slow">· Slow start</span> appears only after 2 innings and 2 dismissals when the average is below half the grade reference. Below-guide batting flags and batting-led swaps need 3 innings and 2 dismissals. Bowling needs 2 innings bowled and a workload suited to the format and role. Strong bowling can be highlighted with an unset type or workload; an unset workload uses the frontline minimum. Other bowling ratings and swap comparisons still need the playing-list role. Fewer than 5 innings, or an early batting flag with fewer than 2 dismissals, is labelled an early sample.</li><li>Full batting flags use roughly 25% above or below the grade average. Bowling balances wicket-taking and economy; strong wicket-taking can offset a higher economy rate, and economical containment can offset fewer wickets. These are rough starting rules, not selection decisions.</li><li>↔ links a possible comparison; ≈ flags a batting/bowling trade-off. No team changes are made.</li><li>Separate grade-conversion guides use the same players within each historical season. Batting averages below need roughly 2×, 1½× and 2× the average above for first/second, second/third and third/fourth comparisons. Opposition is unadjusted.</li><li>Possible swaps preserve batting roles and quick/spin type. Long-form comparisons preserve frontline/part-time roles and check observed workload. Opening/first-change and off-spin/leg-spin jobs are not yet recorded.</li></ul></details>`;
}
function assessmentDetails(item,key,label,job) {
  const evidence=item[key],base=evidence.baseline;
  const reference=base ? key==='bat' ? `${number(base.average)} batting average · ${number(base.records)} historical records`
    : `${number(base.average)} bowling average · ${decimal(base.economy)} economy · ${decimal(base.wickets)} wickets/100 balls · ${number(base.records)} historical records` : '';
  const actual=key==='bat' ? `${number(item.stats?.innings)} innings · ${number((item.stats?.innings??0)-(item.stats?.not_outs??0))} dismissals`
    : `${number(item.stats?.bowling_innings)} innings · ${statsOvers(item.stats?.bowling_balls)??'—'} overs`;
  return `<div><strong>${label} <span class="se-evidence-chip ${evidence.state}">${states[evidence.state][0]} ${states[evidence.state][1]}</span></strong><span class="se-evidence-small">${escape(job)}</span><p class="se-evidence-small">${escape(evidence.reason)}</p>${base?`<small class="se-evidence-small">Grade reference: ${escape(reference)}</small>`:''}${evidence.ready||evidence.early?`<p class="se-evidence-sample">${evidence.early?'Early sample · ':''}${escape(actual)}</p>`:''}</div>`;
}
export function renderEvidenceDetails(item) {
  return `<div class="se-evidence-heading"><div><h2 id="seEvidenceTitle">${escape(item.person.name)}</h2><p class="se-evidence-small">Form guide · ${escape(item.team.grade)} · ${escape(STATS_FORMATS[item.team.format]||item.team.format)} · current season</p></div><button type="button" class="se-evidence-close" data-evidence-close aria-label="Close performance details">Close</button></div>${item.bat?.baseline||item.ball?.baseline?`<p class="se-evidence-source">NDCA ${NDCA_BENCHMARKS.seasons} grade benchmark · All roles and match formats</p>`:''}<div class="se-evidence-metrics">${[['bat','Batting',battingRoleLabel(item.person)],['ball','Bowling',bowlingRoleLabel(item.person)]].filter(([key])=>item[key]).map(([key,label,job])=>assessmentDetails(item,key,label,job)).join('')}</div>${record(item)}${item.links.length?`<h3>Possible comparisons</h3>${item.links.map(pairDetails).join('')}`:'<p class="se-evidence-small">No linked comparison meets the rough grade, role and opportunity checks in these line-ups.</p>'}${help()}`;
}
export function bindEvidenceDetails(host,model,here=()=>true) {
  host.querySelectorAll('[data-evidence-open]').forEach(button=>button.onclick=event=>{
    event.preventDefault();event.stopPropagation(); if(!here())return;
    const item=model.players.get(button.dataset.evidenceOpen);if(!item)return;
    host.querySelector('.se-evidence-dialog')?.remove();
    const dialog=host.ownerDocument.createElement('dialog');dialog.className='se-evidence-dialog';dialog.setAttribute('aria-labelledby','seEvidenceTitle');dialog.innerHTML=renderEvidenceDetails(item);host.append(dialog);
    const close=()=>{dialog.close?.();dialog.remove();if(button.isConnected)button.focus({preventScroll:true});};
    dialog.querySelector('[data-evidence-close]').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    dialog.querySelector('[data-evidence-close]').focus();
  });
}

export function createSelectionEvidence(h) {
  let board=null,cache=null,pending=null,generation=0;
  const here=b=>board===b && b.host.isConnected && h.here(b);
  function paint(b,data) {
    if(!here(b))return;
    const model=buildSelectionEvidence(buildSeasonStats(data),b.teams,b.roster);
    b.host.querySelector('.se-evidence-dialog')?.remove();
    b.host.querySelector('[data-evidence-styles]')?.remove();
    const styles=b.host.ownerDocument.createElement('div');styles.dataset.evidenceStyles='';styles.innerHTML=evidenceStyles;b.host.append(styles);
    b.host.querySelectorAll('[data-se-evidence]').forEach(slot=>{
      slot.innerHTML=renderEvidenceBadges(model.player(slot.dataset.evidenceFixture,slot.dataset.evidencePlayer));
      slot.closest('.se-player-cell')?.classList.toggle('se-has-evidence',!!slot.innerHTML);
    });
    bindEvidenceDetails(b.host,model,()=>here(b));
  }
  async function load(b) {
    if(!here(b))return;
    if(cache?.scope===b.scope && Date.now()-cache.time<120000){paint(b,cache.data);return;}
    const revision=generation;
    if(!pending || pending.scope!==b.scope || pending.revision!==revision) {
      const task={scope:b.scope,revision};pending=task;
      task.promise=h.supabase.rpc('club_season_stats_api',{p_club_id:b.clubId,p_action:'context',p_data:{}}).then(result=>{
        if(result.error)throw Error(result.error.message);
        if(!Array.isArray(result.data?.cards)||!Array.isArray(result.data?.fixtures)||!result.data?.season?.start)throw Error('Season figures unavailable');
        return result.data;
      });
    }
    const task=pending;
    try {const data=await task.promise;if(!here(b)||generation!==revision)return;cache={scope:b.scope,data,time:Date.now()};paint(b,data);}
    catch {if(here(b)){b.host.querySelector('.se-evidence-dialog')?.remove();b.host.querySelectorAll('[data-se-evidence]').forEach(slot=>{slot.replaceChildren();slot.closest('.se-player-cell')?.classList.remove('se-has-evidence');});}}
    finally {if(pending===task)pending=null;}
  }
  return {
    mount(host,options){if(!host)return;const b={...options,host};if(board?.scope!==b.scope){cache=null;generation++;}board=b;void load(b);},
    invalidate(){cache=null;generation++;if(board&&here(board))void load(board);},
    adopt(scope,data){if(board?.scope!==scope)return;cache={scope,data,time:Date.now()};generation++;if(here(board))paint(board,data);}
  };
}
