import {buildSeasonStats, resolveSelectionStatsTeams, statsOvers, STATS_FORMATS} from './season-stats.js?v=0.8.62.275';
import {buildSelectionEvidence, battingRoleLabel, bowlingRoleLabel, fieldingLabel, bowlingEconomyRules, NDCA_GUIDE, NDCA_BENCHMARKS} from './selection-evidence.js?v=0.8.62.262';
import {returningPlayers, returningComparison, returningForm} from './selection-returning.js?v=0.8.62.277';

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const number=value=>Number.isFinite(value)?value.toLocaleString('en-AU',{maximumFractionDigits:1}):'—';
const decimal=value=>Number.isFinite(value)?value.toFixed(2):'—';
const states={strong:['↑','Strong'],low:['↓','Below guide'],slow:['·','Slow start'],building:['·','Not yet rated'],steady:['','Within guide']};
export const evidenceStyles=`<style>
.se-evidence-button{border:0;border-radius:6px;background:transparent;display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:3px;min-height:44px;min-width:44px;max-width:110px;padding:4px;cursor:pointer;color:#24344c;font:600 11px/1.3 system-ui}.se-evidence-button:hover{background:#eef2f7}.se-evidence-button:focus-visible{outline:2px solid #17245f;outline-offset:2px}.se-evidence-button .se-evidence-chip{display:inline-flex;gap:3px;align-items:center;border:1px solid transparent;border-radius:4px;padding:2px 4px;white-space:nowrap;font-size:11px;line-height:1.3;margin:0}.se-evidence-chip.strong{background:#d9f2e7;color:#175c41;border-color:#a7d6c0}.se-evidence-chip.low{background:#fff0cf;color:#784500;border-color:#e6c37b}.se-evidence-chip.slow{background:#fff9ed;color:#78664b;border-color:#eee3ce}.se-evidence-chip.building{background:#edf0f4;color:#526074;border-color:#d3dae3}.se-evidence-link{color:#81520c;background:#fff2d9}.se-evidence-link.tradeoff{color:#596477;background:#edf0f4}.se-evidence:empty{display:none}.se-has-evidence{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px}.se-has-evidence>.se-conversation-status{grid-column:1/-1}.se-has-evidence>.se-evidence .se-evidence-button{max-width:72px}.se-evidence-dialog{box-sizing:border-box;width:min(560px,calc(100% - 24px));max-height:85dvh;overflow:auto;border:1px solid #cdd6e3;border-radius:12px;padding:16px;color:#24344c;background:white;box-shadow:0 12px 60px #17245f30;font:14px/1.4 system-ui}.se-evidence-dialog::backdrop{background:#15233a66}.se-evidence-dialog h2{font-size:18px;margin:0}.se-evidence-dialog h3{font-size:15px;margin:12px 0 4px}.se-evidence-heading{display:flex;align-items:start;justify-content:space-between;gap:10px}.se-evidence-close{min-width:44px;min-height:44px;border:1px solid #cdd6e3;border-radius:6px;background:white;color:#24344c;cursor:pointer}.se-evidence-dialog p{margin:7px 0}.se-evidence-dialog p>small{display:block}.se-evidence-small{color:#52627a;font-size:12px}.se-evidence-metrics{display:flex;gap:12px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid #e1e7ee}.se-evidence-metrics>div{flex:1;min-width:150px}.se-evidence-metrics strong{display:block}.se-evidence-pair{border-bottom:1px solid #e1e7ee;padding:4px 0}.se-evidence-pair>summary,.se-evidence-help>summary{cursor:pointer;min-height:44px;align-content:center}.se-evidence-pair>summary small{display:block;margin-left:15px;color:#52627a}.se-evidence-pair-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.se-evidence-pair-grid>div{min-width:0;overflow-wrap:anywhere}.se-evidence-pair-grid strong,.se-evidence-pair-grid small{display:block}.se-evidence-target{background:#eef2fb;padding:8px;border-radius:6px}.se-evidence-help{font-size:12px;color:#52627a}.se-evidence-help ul{padding-left:18px;margin:4px 0 10px}.se-evidence-help li{margin:5px 0}.se-evidence-dialog .se-evidence-chip{display:inline-block;padding:2px 5px;border-radius:4px}.ss-name .se-evidence-button{vertical-align:middle;margin-left:4px}.ss-compare-cell .se-evidence-button{justify-content:flex-start;padding-left:0}.se-evidence-inline{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.se-evidence-button{flex-direction:column;align-items:stretch;gap:2px;max-width:100%;padding:3px;text-align:left}.se-evidence-button .se-evidence-chip{white-space:normal;font-size:11px;gap:2px;padding:1px 3px}.se-evidence-button .se-evidence-title{font-size:10px;line-height:1.3;margin:0;color:#526074;font-weight:600}.se-evidence-title .se-evidence-link{display:inline-block;margin-left:3px;font-size:10px}.se-evidence-chip.steady{color:#526074;background:transparent}.se-has-evidence>.se-evidence .se-evidence-button{max-width:160px}.ss-name .se-evidence-button{margin-left:0}.se-evidence-sample{font-size:11px;color:#526074}.se-evidence-close{flex-shrink:0;white-space:nowrap;padding:6px 10px}.se-evidence-source{margin:8px 0;color:#52627a;font-size:12px}
.se-evidence-button.se-evidence-compact{flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center;gap:3px;max-width:84px;min-width:44px;min-height:44px;padding:3px}.se-evidence-compact .se-evidence-mark{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:21px;height:21px;padding:2px;flex-shrink:0}.se-evidence-mark svg{display:block;width:16px;height:16px}.se-evidence-mark.steady{border-color:#cbd5e1}.se-evidence-compact .se-evidence-link{font-size:12px;line-height:1;border-radius:3px;padding:1px}.se-has-evidence>.se-evidence .se-evidence-compact{max-width:84px}
.se-evidence-links-host{position:relative}.se-evidence-connectors{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:2}.se-evidence-connectors g{stroke:#b47a24;fill:#b47a24;stroke-width:2;opacity:.55}.se-evidence-connectors g.tradeoff{stroke:#66768f;fill:#66768f;stroke-dasharray:4 3}.se-evidence-connectors g.close{stroke-dasharray:2 3}.se-evidence-connectors g.se-comparison-active{stroke-width:3;opacity:1}.se-comparison-linked{box-shadow:inset 0 0 0 1px #d9b879;border-radius:6px}.se-comparison-linked.se-comparison-active{box-shadow:inset 0 0 0 2px #b47a24;background-color:#fff9ed}
.se-evidence-compact:has(.se-evidence-link){display:grid;grid-template-columns:repeat(2,21px);align-content:center;gap:1px 3px}.se-evidence-compact .se-evidence-link{grid-column:1/-1;text-align:center;white-space:normal;font-size:10px;line-height:12px;overflow-wrap:anywhere}
.se-evidence-connectors .se-evidence-hit{stroke:transparent;stroke-width:24;stroke-dasharray:none;fill:none;pointer-events:stroke;cursor:pointer}.se-evidence-connectors [role=button]:focus-visible{outline:none;opacity:1;stroke-width:3}.se-evidence-connectors [role=button]:focus-visible .se-evidence-line{stroke:#17245f}
.se-other-grades{font-size:13px;overflow-wrap:anywhere}.se-other-grades small{color:#52627a;font-size:12px}
.se-return-linked{box-shadow:inset 0 0 0 1px #38857d;border-radius:6px}.se-return-mark{color:#21665f;font-weight:700}.se-evidence-compact .se-return-mark{white-space:nowrap}.se-return-choice{display:block;min-height:44px;width:100%;margin:4px 0;padding:7px;text-align:left;border:1px solid #cdd6e3;border-radius:6px;background:white;color:#24344c;font:inherit;cursor:pointer}.se-return-choice small{display:block;font-size:12px;color:#52627a}
.se-returns{margin:6px 0;padding:4px 6px;border-left:3px solid #38857d;background:#f1f8f5;border-radius:5px}.se-return-heading,.se-return-row{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(0,1.2fr);gap:6px;align-items:start}.se-return-heading{font-size:11px;font-weight:700;color:#21665f;line-height:18px}.se-return-row+.se-return-row{border-top:1px solid #d0e5dc}.se-return-targets{display:flex;align-items:center;flex-wrap:wrap;gap:2px 4px;min-width:0}.se-return-person,.se-return-target,#app .se-return-person,#app .se-return-target{box-sizing:border-box;display:inline-flex;align-items:center;min-height:44px;min-width:44px;max-width:100%;margin:0;padding:4px;border:0;border-radius:5px;background:transparent;color:#175b53;font:600 12px/1.3 system-ui;text-align:left;white-space:normal;overflow-wrap:anywhere;cursor:pointer;gap:4px}.se-return-person{width:100%;justify-content:flex-start}.se-return-target,#app .se-return-target{font-size:11px;font-weight:500;text-decoration:underline;text-underline-offset:3px}.se-return-person:hover,.se-return-target:hover{background:#dceee5}.se-return-person:focus-visible,.se-return-target:focus-visible{outline:2px solid #21665f;outline-offset:-2px}.se-return-unmatched{font-size:11px;line-height:1.4;color:#52627a;align-self:center}.se-return-active{box-shadow:inset 0 0 0 2px #21665f;background:#e8f5ed}

</style>`;

export function renderEvidenceBadges(item,key=item?.key,{compact=false,form=true}={}) {
  if (!item || !key) return '';
  const parts=[], labels=[];let link='';
  for (const [kind,label] of form?[['bat','Batting'],['ball','Bowling']]:[]) {
    const evidence=item[kind]; if (!evidence) continue;
    const icon=kind==='bat'?'<path d="m14 3 3 3-8 11-5-5Z"/><path d="m16 4 3-3"/>':'<circle cx="10" cy="10" r="7"/><path d="M6 4c5 3 3 9 8 12"/>';
    parts.push(compact?`<span class="se-evidence-chip se-evidence-mark ${evidence.state}" data-evidence-kind="${kind}" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">${icon}</svg></span>`:`<span class="se-evidence-chip ${evidence.state}">${label}: ${states[evidence.state][0]} ${states[evidence.state][1]}</span>`);
    labels.push(label+': '+states[evidence.state][1]+(evidence.early?' (early sample)':''));
  }
  if (form&&item.links.some(p=>p.number)) {
    const shown=item.links.filter(p=>p.number);
    const tradeoff=shown.every(p=>p.kind==='tradeoff');
    link=compact?`<span class="se-evidence-link ${tradeoff?'tradeoff':''}" aria-hidden="true">${tradeoff?'≈':'↔'}${shown.map(p=>p.number).join('·')}</span>`:`<span class="se-evidence-chip se-evidence-link ${tradeoff?'tradeoff':''}">${shown.map(p=>(p.kind==='tradeoff'?'≈':'↔')+p.number).join(' ')}</span>`;
    labels.push(...shown.map(p=>'Comparison '+p.number+' with '+(p.higher.key===item.key?p.lower:p.higher).person.name));
  }
  if(item.returns?.length){
    const names=[...new Set(item.returns.map(pair=>pair.entry.person.name))];
    labels.push('Potential in: '+names.join(', '));
    const mark=`<span class="se-return-mark" aria-hidden="true">↩${names.length}</span>`;
    link=link?link.replace('</span>',' · '+mark+'</span>'):`<span class="se-evidence-link">${compact?mark:'Potential in '+mark}</span>`;
  }
  return parts.length||link?`<button type="button" class="se-evidence-button${compact?' se-evidence-compact':''}" data-evidence-open="${escape(key)}" aria-label="${escape(item.person.name+': Form guide. '+labels.join('; ')+'. View performance details')}" title="${escape(labels.join(' · '))}">${compact?parts.join('')+link:`<span class="se-evidence-title">Form guide${item.bat?.early||item.ball?.early?' · early':''}${link}</span>${parts.join('')}`}</button>`:'';
}
function record(item) {
  const s=item.stats;
  if (!s) return '';
  const batting=s.batting_complete===false?'Figures incomplete':`${s.runs} runs · ${s.innings} inns · ${s.not_outs} not out`;
  const bowling=s.bowling_complete===false?'Figures incomplete':`${s.wickets} wickets · ${statsOvers(s.bowling_balls)??'—'} overs · ${s.bowling_innings} inns · ${s.wickets?decimal(s.conceded/s.wickets):'—'} average · ${decimal(s.economy)} economy`;
  return `<p><strong>${number(s.average)} batting average</strong><small>${escape(batting)}</small></p>${item.ball?.applicable?`<p><strong>${escape(bowling)}</strong></p>`:''}`;
}
const returnDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'';
const returnDays=pair=>pair.entry.team.days.length>1?' · '+pair.target.days.map(day=>'Day '+(day+1)).join(' / '):'';
function returnRecord(stats,person,{bowlingFirst=false}={}) {
  if(!stats.matches)return '<p class="se-evidence-small">No saved figures for this period.</p>';
  const batting=`<p><strong>Batting · ${number(stats.average)} average</strong><small>${stats.batting_complete?`${stats.runs} runs · ${stats.innings} inns · ${stats.not_outs} not out`:'Figures incomplete'}</small></p>`;
  const bowling=['pace','spin'].includes(person?.bowling)||stats.bowling_balls>0?`<p><strong>Bowling · ${stats.bowling_complete?`${stats.wickets} wickets`:'Figures incomplete'}</strong>${stats.bowling_complete?`<small>${statsOvers(stats.bowling_balls)??'—'} overs · ${stats.bowling_innings} inns · ${stats.conceded} runs</small><small>Avg ${stats.wickets?decimal(stats.conceded/stats.wickets):'—'} · Econ ${decimal(stats.economy)}</small>${stats.bowling_balls?`<small>${decimal(stats.wickets*100/stats.bowling_balls)} wickets/100 balls</small>`:''}`:''}</p>`:'';
  return bowlingFirst?bowling+batting:batting+bowling;
}
function returnDetails(pair,index=0){
  const {entry,target,incoming,current,notes}=pair,other=target.incumbent;
  return `<details class="se-evidence-pair" ${index===0?'open':''}><summary><strong>${escape(entry.person.name)} → ${escape(other?.name||'Vacant place')} · No. ${target.position}${escape(returnDays(pair))}</strong><small>Potential in · available again${pair.early?' · early samples':''}${target.joinedDuringAbsence?' · current player joined this team during the absence':''}</small></summary><p class="se-evidence-small">${escape(entry.person.name)} was unavailable for ${entry.missed.length} ${entry.missed.length===1?'game':'games'} in ${escape(entry.team.grade)}; last selected ${escape(returnDate(entry.previous.days[0].date))} at No. ${entry.position}.</p><div class="se-evidence-pair-grid"><div><strong>${escape(entry.person.name)}</strong><small>Before absence · last ${incoming.matches} recorded ${incoming.matches===1?'game':'games'} (up to 3)</small><small>${escape(battingRoleLabel(entry.person))} · ${escape(bowlingRoleLabel(entry.person))}</small><small>Fielding: ${escape(fieldingLabel(entry.person))}</small>${returnRecord(incoming,entry.person,{bowlingFirst:target.focus==='bowling'||entry.person.bowling_load==='frontline'})}</div><div><strong>${escape(other?.name||'Vacant place')}</strong>${other?`<small>While away · ${current.matches} of ${entry.missed.length} ${entry.missed.length===1?'game':'games'} recorded</small><small>${escape(battingRoleLabel(other))} · ${escape(bowlingRoleLabel(other))}</small><small>Fielding: ${escape(fieldingLabel(other))}</small>${returnRecord(current,other,{bowlingFirst:target.focus==='bowling'||entry.person.bowling_load==='frontline'})}`:'<p>This place is currently vacant.</p>'}</div></div>${target.focus==='bowling'?'<p class="se-evidence-small">Bowling comparison · matching type and frontline workload. Batting and fielding remain separate considerations.</p>':''}${notes.map(note=>`<p class="se-evidence-small">${escape(note)}</p>`).join('')}<p class="se-evidence-small">Separate periods in the same grade and format. These figures support a selection discussion; returning availability does not reserve a place.</p></details>`;
}
function returnTeamDetails(entry,pairs,summary){
  const before=returningForm(entry,summary);
  return `<div class="se-evidence-heading"><div><h2 id="seEvidenceTitle">${escape(entry.person.name)}</h2><p class="se-evidence-small">Returning · ${escape(entry.team.grade)} · ${escape(returnDate(entry.team.days[0].date))}</p></div><button type="button" class="se-evidence-close" data-evidence-close>Close</button></div><p class="se-evidence-small">Available again after ${entry.missed.length} ${entry.missed.length===1?'game':'games'} unavailable. Last selected at No. ${entry.position}.</p><p class="se-evidence-small">${escape(battingRoleLabel(entry.person))} · ${escape(bowlingRoleLabel(entry.person))} · Fielding: ${escape(fieldingLabel(entry.person))}</p><h3>Before absence</h3><p class="se-evidence-small">Last ${before.matches} recorded ${before.matches===1?'game':'games'} (up to 3) · ${before.matches<5?'early sample':''}</p>${returnRecord(before,entry.person,{bowlingFirst:entry.person.bowling_load==='frontline'})}<h3>Compare with current XI</h3>${pairs.flatMap((pair,index)=>pair.entry.key===entry.key?[`<button class="se-return-choice" type="button" data-return-compare="${index}">${escape(pair.target.incumbent?.name||'Vacant place')} · No. ${pair.target.position}${escape(returnDays(pair))}<small>${pair.target.focus==='bowling'?'Bowling comparison':pair.target.joinedDuringAbsence?'Joined this team during the absence':'Matching recorded role and place'}</small></button>`]:[]).join('')||'<p class="se-evidence-small">No matching place identified from the saved roles and available dates. Review the playing-list attributes and team balance.</p>'}`;
}
function returnComparisonDetails(pair){return `<div class="se-evidence-heading"><h2 id="seEvidenceTitle">${pair.target.focus==='bowling'?'Bowling comparison':'Returning player comparison'}</h2><button type="button" class="se-evidence-close" data-evidence-close>Close</button></div>${returnDetails(pair)}`;}

function otherGradeRecords(item) {
  const stats=item.otherGrades?.[0];
  if (!stats) return '';
  const date = value => {
    const parsed=/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(value+'T12:00:00Z') : null;
    return parsed && Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'}).format(parsed) : '';
  };
  const scores = (match,kind) => {
    const figures=(match[kind] || []).map(p => kind==='batting' ? p.dnb ? 'DNB' : `${p.runs}${p.not_out?'*':''}`
      : `${p.wickets}/${p.runs}`);
    if(match[kind+'_incomplete']) figures.push('Figures incomplete');
    return figures.join(' & ') || (match[kind+'_available'] ? kind==='batting'?'DNB':'Did not bowl' : 'Not recorded');
  };
  const innings=`${number(stats.innings)} ${stats.innings===1?'inn':'inns'}`;
  const batting=stats.batting_complete===false?'Bat: incomplete':!stats.innings?'Yet to bat'
    : stats.not_outs===stats.innings?`Bat: ${number(stats.runs)} runs (${innings}, unbeaten)`:`Bat avg ${number(stats.average)} (${innings})`;
  const bowling=stats.bowling_complete===false?'Bowl: incomplete':!stats.bowling_innings?'Yet to bowl'
    : `Bowl avg ${stats.wickets?decimal(stats.conceded/stats.wickets):'—'} (${number(stats.wickets)} ${stats.wickets===1?'wkt':'wkts'})`;
  const recent=[...(stats.history || [])].sort((a,b)=>String(b.date || '').localeCompare(String(a.date || '')))[0];
  return `<p class="se-other-grades" aria-label="Recent form in another grade"><strong>${escape(stats.grade)}</strong> · ${escape(batting)} · ${escape(bowling)}${recent?`<small>Latest${date(recent.date)?' · '+escape(date(recent.date)):''}: Bat ${escape(scores(recent,'batting'))} · Bowl ${escape(scores(recent,'bowling'))}</small>`:''}</p>`;
}
function pairDetails(pair,index=0) {
  const {higher,lower}=pair, symbol=pair.kind==='tradeoff'?'≈':'↔';
  return `<details class="se-evidence-pair" ${pair.number&&index===0?'open':''}><summary><strong>${pair.number?symbol+pair.number+' ':''}${escape(higher.person.name)} / ${escape(lower.person.name)}</strong><small>${escape(pair.reason)}</small></summary><p class="se-evidence-small">Discussion only · this link does not recommend dropping ${escape(higher.person.name)}. A player can have a case to move up while another presses for their place.</p><div class="se-evidence-pair-grid">${[higher,lower].map(item=>`<div><strong>${escape(item.person.name)}</strong><small>${escape(item.team.grade)} · ${item.position ? 'selected at '+item.position : 'season record'}</small><small>${escape(battingRoleLabel(item.person))}${item.ball?.applicable?' · '+escape(bowlingRoleLabel(item.person)):''}</small><small>Fielding: ${escape(fieldingLabel(item.person))} · selector rating</small>${record(item)}</div>`).join('')}</div>${pair.focus!=='bowling'&&pair.targetAverage!==null?`<p class="se-evidence-target">Rough batting target in ${escape(lower.team.grade)}: <strong>${number(pair.targetAverage)} average</strong>.<br>${escape(lower.person.name)}: roughly <strong>${number(pair.equivalentBat)}</strong> in ${escape(higher.team.grade)}.</p>`:''}${higher.ball?.applicable?`<p class="se-evidence-small"><strong>Bowling comparison in ${escape(higher.team.grade)}</strong><br>${escape(higher.person.name)} (actual): ${decimal(higher.stats?.bowling_balls ? higher.stats.wickets*100/higher.stats.bowling_balls : null)} wickets per 100 balls · ${decimal(higher.stats?.bowling_balls ? higher.stats.conceded*6/higher.stats.bowling_balls : null)} economy.<br>${escape(lower.person.name)} (rough equivalent): ${decimal(pair.equivalentWickets)} wickets per 100 balls · ${decimal(pair.equivalentEconomy)} economy.${pair.focus==='bowling'?' Batting and fielding are separate considerations for this bowling comparison.':' Compare actual overs and the bowling job as well.'}</p>`:''}<p class="se-evidence-small">Check availability, actual batting opportunities, recorded fielding observations and team balance. Fielding is a selector rating, considered alongside the figures and especially relevant in shorter formats. Selected positions show the proposed order, not historical batting positions.</p></details>`;
}
function help() {
  return `<details class="se-evidence-help"><summary>How to read the guide</summary><ul><li>The small bat and ball markers show batting and bowling form. Tap them for the assessment and sample size.</li><li><span class="se-evidence-chip strong">↑ Strong</span>, <span class="se-evidence-chip low">↓ Below guide</span> and Within guide compare this season's figures with fixed NDCA ${NDCA_BENCHMARKS.seasons} grade benchmarks. These are performance assessments, not player roles.</li><li>The benchmarks pool runs per dismissal, wickets per 100 balls and runs per six balls across the grade. Ducks, not-outs and wicketless records are retained. All batting positions, bowling types and match formats are combined; current player figures stay in the chosen format.</li><li><span class="se-evidence-chip building">· Not yet rated</span> means the player's figures, role or grade benchmark are insufficient. Positive batting flags can start after 2 innings, even when the batting role is unset. With fewer than 2 dismissals, the early check uses runs per innings; the displayed average stays unchanged. A faint <span class="se-evidence-chip slow">· Slow start</span> appears only after 2 innings and 2 dismissals when the average is below half the grade reference. Below-guide batting flags and batting-led swaps need 3 innings and 2 dismissals. Players marked lower order keep positive highlights but receive no Slow start or Below guide batting warnings: there is no separate lower-order benchmark. Bowling needs 2 innings bowled and a workload suited to the format and role. Strong bowling can be highlighted with an unset type or workload; an unset workload uses the frontline minimum. Other bowling ratings and swap comparisons still need the playing-list role. Fewer than 5 innings, or an early batting flag with fewer than 2 dismissals, is labelled an early sample.</li><li>Full batting flags use roughly 25% above or below the grade average. Bowling balances wicket-taking and economy. In the limited-overs trial, strong wicket-taking allows economy up to 35% above the pooled reference; the expensive-bowling check starts at 50% above it. Long form and T20 retain the 10% allowance and 25% expensive-bowling threshold. A limited-overs comparison can also flag at least 15% better economy with wicket-taking within 15% of the incumbent after the rough grade adjustment; it is labelled a trade-off. These are trial allowances, not measured format-specific benchmarks. Economical containment can offset fewer wickets. These are rough starting rules, not selection decisions.</li><li>Matching ↔ numbers link a selection conversation, including close calls within the rough 15% comparison range; ≈ flags a performance trade-off. A line joins the linked players when their grades are side by side. Click or tap the line to compare those players. No team changes are made.</li><li>Separate grade-conversion guides use the same players within each historical season. Batting averages below need roughly 2×, 1½× and 2× the average above for first/second, second/third and third/fourth comparisons. Opposition is unadjusted.</li><li>Batting-led comparisons preserve batting roles. Frontline quicks can be compared on bowling alone regardless of batting-order labels; batting and fielding remain separate considerations. Quick/spin type is preserved. Long-form comparisons preserve frontline/part-time roles and check observed workload. Opening/first-change and off-spin/leg-spin jobs are not yet recorded.</li></ul></details>`;
}
function assessmentDetails(item,key,label,job) {
  const evidence=item[key],base=evidence.baseline;
  const reason=item.stats ? evidence.reason : `No ${item.team.grade} figures in this format this season`;
  const reference=base ? key==='bat' ? `${number(base.average)} batting average · ${number(base.records)} historical records`
    : `${number(base.average)} bowling average · ${decimal(base.economy)} economy · ${decimal(base.wickets)} wickets/100 balls · ${number(base.records)} historical records${bowlingEconomyRules(item.team.format).trial ? ` · Limited-overs trial: strong wicket-taking allows economy up to ${decimal(base.economy*bowlingEconomyRules(item.team.format).strongMaximum)}` : ''}` : '';
  const actual=key==='bat' ? `${number(item.stats?.innings)} innings · ${number((item.stats?.innings??0)-(item.stats?.not_outs??0))} dismissals`
    : `${number(item.stats?.bowling_innings)} innings · ${statsOvers(item.stats?.bowling_balls)??'—'} overs`;
  return `<div><strong>${label} <span class="se-evidence-chip ${evidence.state}">${states[evidence.state][0]} ${states[evidence.state][1]}</span></strong><span class="se-evidence-small">${escape(job)}</span><p class="se-evidence-small">${escape(reason)}</p>${base?`<small class="se-evidence-small">Grade reference: ${escape(reference)}</small>`:''}${evidence.ready||evidence.early?`<p class="se-evidence-sample">${evidence.early?'Early sample · ':''}${escape(actual)}</p>`:''}</div>`;
}
export function renderEvidenceDetails(item) {
  return `<div class="se-evidence-heading"><div><h2 id="seEvidenceTitle">${escape(item.person.name)}</h2><p class="se-evidence-small">Form guide · ${escape(item.team.grade)} · ${escape(STATS_FORMATS[item.team.format]||item.team.format)} · current season</p></div><button type="button" class="se-evidence-close" data-evidence-close aria-label="Close performance details">Close</button></div>${item.returns?.length?'<h3>Potential ins</h3>'+item.returns.map(returnDetails).join(''):''}${item.bat?.baseline||item.ball?.baseline?`<p class="se-evidence-source">NDCA ${NDCA_BENCHMARKS.seasons} grade benchmark · All roles and match formats</p>`:''}<div class="se-evidence-metrics">${[['bat','Batting',battingRoleLabel(item.person)],['ball','Bowling',bowlingRoleLabel(item.person)]].filter(([key])=>item[key]).map(([key,label,job])=>assessmentDetails(item,key,label,job)).join('')}</div>${record(item)}<p class="se-evidence-small">Fielding: <strong>${escape(fieldingLabel(item.person))}</strong> · selector rating</p>${otherGradeRecords(item)}${item.links.length?`<h3>Selection conversations</h3>${item.links.map(pairDetails).join('')}`:'<p class="se-evidence-small">No selection conversation meets the rough grade, role and opportunity checks in these line-ups.</p>'}${help()}`;
}
export function renderEvidenceComparison(pair) {
  const early=[pair.higher,pair.lower].some(item=>item.bat?.early||item.ball?.early);
  return `<div class="se-evidence-heading"><div><h2 id="seEvidenceTitle">Selection comparison</h2><p class="se-evidence-small">${escape(STATS_FORMATS[pair.higher.team.format]||pair.higher.team.format)} · current season${early?' · early sample':''}</p></div><button type="button" class="se-evidence-close" data-evidence-close aria-label="Close performance details">Close</button></div>${pairDetails(pair)}${help()}`;
}
function showEvidenceDialog(host,content,trigger) {
  host.querySelector('.se-evidence-dialog')?.remove();
  const dialog=host.ownerDocument.createElement('dialog');dialog.className='se-evidence-dialog';dialog.setAttribute('aria-labelledby','seEvidenceTitle');dialog.innerHTML=content;host.append(dialog);
  const close=()=>{dialog.close?.();dialog.remove();if(trigger.isConnected)trigger.focus({preventScroll:true});};
  dialog.querySelector('[data-evidence-close]').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  dialog.querySelector('[data-evidence-close]').focus();
}
// Keep the relationship on the board. Lines occupy the existing column gap;
// stacked cards retain the same numbered markers without a misleading line.
const evidenceLinkBindings = new WeakMap();
let evidenceClipSequence=0;
export function clearEvidenceLinks(host) { evidenceLinkBindings.get(host)?.(); }
export function bindEvidenceLinks(host, model, here = () => true) {
  clearEvidenceLinks(host);
  const roots = [...host.querySelectorAll('.se-grid,.ss-compare')];
  const pairs = (model.pairs || []).filter(pair => pair.number);
  if (!roots.length || !pairs.length) return;
  const view = host.ownerDocument.defaultView, ns = 'http://www.w3.org/2000/svg';
  const layers = [], marked = new Set(), listeners = [];
  let observer, frame, disposed = false;
  const make = (tag, attributes) => {
    const node = host.ownerDocument.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  function cleanup() {
    if (disposed) return;
    disposed = true; observer?.disconnect();
    if (frame !== undefined) view.cancelAnimationFrame?.(frame);
    view.removeEventListener('resize', schedule);
    listeners.forEach(([node, type, fn]) => node.removeEventListener(type, fn));
    layers.forEach(({root,svg}) => {svg.remove(); root.classList.remove('se-evidence-links-host');});
    marked.forEach(row => row.classList.remove('se-comparison-linked','se-comparison-active'));
    evidenceLinkBindings.delete(host);
  }
  function highlight(key,number) {
    const active = new Set(pairs.filter(pair => number!==undefined ? pair.number===number : pair.higher.key === key || pair.lower.key === key).map(pair => String(pair.number)));
    const activeRows=new Set();
    layers.forEach(({links}) => links.forEach(({pair,group,ends}) => {
      const on = active.has(String(pair.number));
      group.classList.toggle('se-comparison-active', on);
      if(on)ends.forEach(end => activeRows.add(end.row));
    }));
    marked.forEach(row => row.classList.toggle('se-comparison-active',activeRows.has(row)));
  }
  for (const root of roots) {
    const buttons = [...root.querySelectorAll('[data-evidence-open]')];
    const endpoint = key => {
      const button = buttons.find(button => button.dataset.evidenceOpen === key);
      const row = button?.closest('.se-player-cell,[data-evidence-row]');
      const column = row?.closest('[data-se-team],.ss-compare-cell');
      const anchor = root.matches('.ss-compare') ? row?.querySelector('[data-evidence-anchor]') || button : button;
      return row && column ? {button,row,column,anchor} : null;
    };
    const links = pairs.map(pair => ({pair,ends:[endpoint(pair.higher.key),endpoint(pair.lower.key)]})).filter(link => link.ends.every(Boolean));
    if (!links.length) continue;
    const svg = make('svg', {'class':'se-evidence-connectors',role:'group','aria-label':'Selection comparisons',focusable:'false'});
    const defs=make('defs',{});svg.append(defs);
    root.classList.add('se-evidence-links-host'); root.append(svg);
    for (const link of links) {
      const clipId='se-evidence-hit-'+(++evidenceClipSequence),clip=make('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});
      link.clip=make('rect',{});clip.append(link.clip);defs.append(clip);
      link.group = make('g', {'data-evidence-connection':link.pair.number,'class':link.pair.kind,role:'button',tabindex:0,focusable:'true','aria-label':`Compare ${link.pair.higher.person.name} and ${link.pair.lower.person.name}. ${link.pair.reason}`});
      link.path = make('path', {fill:'none','class':'se-evidence-line','aria-hidden':'true'});
      link.hit=make('path',{'class':'se-evidence-hit','clip-path':`url(#${clipId})`,'aria-hidden':'true'});
      link.dots = [make('circle', {r:3,'aria-hidden':'true'}),make('circle', {r:3,'aria-hidden':'true'})];
      link.group.append(link.path,...link.dots,link.hit); svg.append(link.group);
      const open=event=>{
        event.preventDefault();event.stopPropagation();
        if(!here()||link.group.style.display==='none')return;
        showEvidenceDialog(host,renderEvidenceComparison(link.pair),link.group);
      };
      for(const [type,fn] of [['click',open],['keydown',event=>{if(event.key==='Enter'||event.key===' ')open(event);}],['pointerenter',()=>highlight('',link.pair.number)],['focus',()=>highlight('',link.pair.number)],['pointerleave',()=>highlight('')],['blur',()=>highlight('')]]){
        link.group.addEventListener(type,fn);listeners.push([link.group,type,fn]);
      }
      link.ends.forEach(end => {marked.add(end.row); end.row.classList.add('se-comparison-linked');});
    }
    layers.push({root,svg,links});
    for (const button of buttons) {
      for (const [type,fn] of [['pointerenter',()=>highlight(button.dataset.evidenceOpen)],['focus',()=>highlight(button.dataset.evidenceOpen)],['pointerleave',()=>highlight('')],['blur',()=>highlight('')]]) {
        button.addEventListener(type,fn); listeners.push([button,type,fn]);
      }
    }
  }
  if (!layers.length) return;
  function draw() {
    frame = undefined;
    if (!host.isConnected || !here() || layers.every(layer => !layer.root.isConnected)) {cleanup(); return;}
    for (const {root,svg,links} of layers) {
      const bounds = root.getBoundingClientRect();
      svg.setAttribute('width', String(bounds.width)); svg.setAttribute('height', String(bounds.height));
      svg.setAttribute('viewBox', `0 0 ${bounds.width || 1} ${bounds.height || 1}`);
      for (const link of links) {
        const ends = link.ends.map(end => ({...end,box:end.row.getBoundingClientRect(),card:end.column.getBoundingClientRect(),anchorBox:end.anchor.getBoundingClientRect()})).sort((a,b)=>a.box.left-b.box.left);
        const [left,right] = ends;
        // Board cards must share a grid row. Compare-grade cells can be at
        // different batting positions, but must still be in separate columns.
        const board = left.column.hasAttribute('data-se-team');
        const sideBySide = left.box.width > 0 && right.box.width > 0 && right.box.left >= left.box.right + 4
          && (!board || Math.abs(left.card.top-right.card.top) < 4);
        link.group.style.display = sideBySide ? '' : 'none';
        if (!sideBySide) continue;
        const x1 = left.box.right-bounds.left, x2 = right.box.left-bounds.left;
        const y1 = left.anchorBox.top+left.anchorBox.height/2-bounds.top, y2 = right.anchorBox.top+right.anchorBox.height/2-bounds.top;
        const middle = (x1+x2)/2;
        const curve=`M ${x1} ${y1} C ${middle} ${y1} ${middle} ${y2} ${x2} ${y2}`;
        link.path.setAttribute('d',curve);link.hit.setAttribute('d',curve);
        // The wider hit area stays inside the gap and cannot cover player controls.
        for(const [key,value] of Object.entries({x:x1,y:0,width:x2-x1,height:bounds.height}))link.clip.setAttribute(key,String(value));
        link.dots.forEach((dot,index)=>{dot.setAttribute('cx',String(index?x2:x1));dot.setAttribute('cy',String(index?y2:y1));});
      }
    }
  }
  function schedule() {
    if (disposed || frame !== undefined) return;
    if (view.requestAnimationFrame) frame = view.requestAnimationFrame(draw); else draw();
  }
  evidenceLinkBindings.set(host,cleanup);
  if (view.ResizeObserver) {
    observer = new view.ResizeObserver(schedule);
    layers.forEach(({root,links}) => {observer.observe(root);links.forEach(link=>link.ends.forEach(end=>observer.observe(end.row)));});
  }
  view.addEventListener('resize',schedule);
  draw();
}

export function bindEvidenceDetails(host,model,here=()=>true) {
  host.querySelectorAll('[data-evidence-open]').forEach(button=>button.onclick=event=>{
    event.preventDefault();event.stopPropagation(); if(!here())return;
    const item=model.players.get(button.dataset.evidenceOpen);if(!item)return;
    showEvidenceDialog(host,renderEvidenceDetails(item),button);
  });
  bindEvidenceLinks(host,model,here);
}

export function createSelectionEvidence(h) {
  let board=null,cache=null,pending=null,generation=0;
  const preferences=new Map(),preferenceKey=scope=>'club-selections-form-indicators:'+scope;
  const here=b=>board===b && b.host.isConnected && h.here(b);
  function clear(b) {
    clearEvidenceLinks(b.host);
    b.host.querySelector('.se-evidence-dialog')?.remove();
    b.host.querySelectorAll('[data-se-evidence]').forEach(slot=>{slot.replaceChildren();slot.closest('.se-player-cell')?.classList.remove('se-has-evidence');});
    b.host.querySelectorAll('[data-return-control]').forEach(el=>el.remove());
    b.host.querySelectorAll('.se-return-linked,.se-return-active').forEach(el=>el.classList.remove('se-return-linked','se-return-active'));
  }
  function bindVisibility(b) {
    let storage;
    try {storage=b.host.ownerDocument.defaultView.localStorage;}catch{}
    if(!preferences.has(b.scope)){
      let visible=true;try{visible=storage?.getItem(preferenceKey(b.scope))!=='0';}catch{}
      preferences.set(b.scope,visible);
    }
    b.visible=preferences.get(b.scope);
    const toggle=b.visibilityToggle||b.host.querySelector('[data-evidence-toggle]');
    if(!toggle)return;
    toggle.checked=b.visible;
    toggle.onchange=()=>{
      if(!here(b))return;
      b.visible=toggle.checked;preferences.set(b.scope,b.visible);
      try{storage?.setItem(preferenceKey(b.scope),b.visible?'1':'0');}catch{}
      if(b.visible||b.returningEnabled)void load(b);else clear(b);
    };
  }
  function paint(b,data) {
    if(!here(b)||!b.visible&&!b.returningEnabled)return;
    const teams=resolveSelectionStatsTeams(b.teams,data.season,b.referenceTeams||b.teams);
    const summary=buildSeasonStats(data),model=buildSelectionEvidence(summary,teams,b.roster);
    const returns=b.returningEnabled?returningPlayers({teams,references:resolveSelectionStatsTeams(b.referenceTeams||[],data.season),roster:b.roster,season:data.season,today:b.today||data.today,noPlay:data.fixtures.filter(f=>f.no_play).map(f=>f.id),eligible:b.returningEligible}):[];
    const returnPairs=returns.flatMap(entry=>entry.targets.map(target=>returningComparison(entry,target,summary)));
    for(const item of model.players.values())item.returns=returnPairs.filter(pair=>pair.entry.team.id===item.team.id&&pair.target.incumbent?.id===item.person.id);
    if(!b.visible){model.pairs=[];for(const item of model.players.values())item.links=[];}
    b.host.querySelector('.se-evidence-dialog')?.remove();
    b.host.querySelector('[data-evidence-styles]')?.remove();
    const styles=b.host.ownerDocument.createElement('div');styles.dataset.evidenceStyles='';styles.innerHTML=evidenceStyles;b.host.append(styles);
    b.host.querySelectorAll('[data-se-evidence]').forEach(slot=>{
      const item=model.player(slot.dataset.evidenceFixture,slot.dataset.evidencePlayer);
      slot.innerHTML=renderEvidenceBadges(item,item?.key,{compact:true,form:b.visible});
      slot.closest('.se-player-cell')?.classList.toggle('se-has-evidence',!!slot.innerHTML);
      slot.closest('.se-player-cell')?.classList.toggle('se-return-linked',!!item?.returns?.length);
    });
    bindEvidenceDetails(b.host,model,()=>here(b));
    b.host.querySelectorAll('[data-return-control]').forEach(el=>el.remove());
    const highlight=pairs=>{
      b.host.querySelectorAll('.se-return-active').forEach(el=>el.classList.remove('se-return-active'));
      if(!here(b))return;
      b.host.querySelectorAll('[data-se-evidence]').forEach(slot=>{
        if(pairs.some(pair=>slot.dataset.evidenceFixture===pair.entry.team.id&&slot.dataset.evidencePlayer===pair.target.incumbent?.id))slot.closest('.se-player-cell')?.classList.add('se-return-active');
      });
    };
    highlight([]);
    const compare=(pair,trigger)=>{if(!here(b)||!pair)return;showEvidenceDialog(b.host,returnComparisonDetails(pair),trigger);};
    for(const card of b.host.querySelectorAll('[data-se-team]')){
      const entries=returns.filter(entry=>entry.team.id===card.dataset.seTeam);
      if(!entries.length)continue;
      const control=card.ownerDocument.createElement('section');control.dataset.returnControl='';control.className='se-returns';control.setAttribute('aria-label','Returning players for '+entries[0].team.grade);
      control.innerHTML='<div class="se-return-heading"><span>Returning players</span><span>Compare with</span></div>'+entries.map((entry,index)=>`<div class="se-return-row"><button type="button" class="se-return-person" data-return-person="${index}" aria-label="${escape(entry.person.name+': available again. View pre-absence batting and bowling')}"><span aria-hidden="true">↩</span><strong>${escape(entry.person.name)}</strong></button><div class="se-return-targets">${returnPairs.flatMap((pair,i)=>pair.entry.key===entry.key?[`<button type="button" class="se-return-target" data-return-compare="${i}" aria-label="${escape('Compare '+entry.person.name+' with '+(pair.target.incumbent?.name||'vacant place'))}">${escape(pair.target.incumbent?.name||'Vacant place')}${escape(returnDays(pair))}</button>`]:[]).join('')||'<span class="se-return-unmatched">No matching place yet</span>'}</div></div>`).join('');
      const anchor=card.querySelector(':scope > .se-actions')||card.querySelector('[data-se-order-list]')||card.querySelector(':scope > ol');
      if(anchor)anchor.after(control);else card.append(control);
      control.querySelectorAll('[data-return-person]').forEach(button=>{
        const entry=entries[Number(button.dataset.returnPerson)],pairs=returnPairs.filter(pair=>pair.entry.key===entry.key);
        button.onclick=()=>{if(!here(b))return;showEvidenceDialog(b.host,returnTeamDetails(entry,returnPairs,summary),button);
          b.host.querySelectorAll('.se-evidence-dialog [data-return-compare]').forEach(choice=>choice.onclick=()=>compare(returnPairs[Number(choice.dataset.returnCompare)],button));
        };
        button.onmouseenter=button.onfocus=()=>highlight(pairs);button.onmouseleave=button.onblur=()=>highlight([]);
      });
      control.querySelectorAll('[data-return-compare]').forEach(button=>{
        const pair=returnPairs[Number(button.dataset.returnCompare)];
        button.onclick=()=>compare(pair,button);
        button.onmouseenter=button.onfocus=()=>highlight([pair]);button.onmouseleave=button.onblur=()=>highlight([]);
      });
    }
  }

  async function load(b) {
    if(!here(b)||!b.visible&&!b.returningEnabled)return;
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
    catch {if(here(b))clear(b);}
    finally {if(pending===task)pending=null;}
  }
  return {
    mount(host,options){if(!host)return;if(board)clearEvidenceLinks(board.host);const b={...options,host};if(board?.scope!==b.scope){if(board)clear(board);cache=null;generation++;}board=b;bindVisibility(b);if(b.visible||b.returningEnabled)void load(b);else clear(b);},
    invalidate(){cache=null;generation++;if(board&&here(board))void load(board);},
    adopt(scope,data){if(board?.scope!==scope)return;cache={scope,data,time:Date.now()};generation++;if(here(board))paint(board,data);}
  };
}
