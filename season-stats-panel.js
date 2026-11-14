import {buildSeasonStats, resolveSelectionStatsTeams, compareSelectedGrades, compareSeasonGrades, STATS_FORMATS, statsOvers, statsFormat, statsMatchesView, defaultStatsView, statsViews, statsViewSettings, statsCompetitions, statsCombineCompetition} from './season-stats.js?v=0.8.62.366';
import {buildSelectionEvidence} from './selection-evidence.js?v=0.8.62.366';
import {evidenceStyles, renderEvidenceBadges, bindEvidenceDetails, clearEvidenceLinks} from './selection-evidence-ui.js?v=0.8.62.366';

import {renderStatsSetup,bindStatsSetup,statsSetupChanged} from './season-stats-settings.js?v=0.8.62.366';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const numeric = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-AU', {maximumFractionDigits:2});
const rate = value => Number.isFinite(value) ? value.toLocaleString('en-AU', {minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('en-AU', {day:'numeric', month:'short', timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z')) : '';
const link = value => {try {const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'play.cricket.com.au' && /^\/match\/[0-9a-f-]{36}(?:\/|$)/i.test(u.pathname) && !u.username && !u.password && !u.port ? u.href : '';} catch {return '';}};
const playerName = (id, name, openable) => openable?.has(id)
  ? `<button type="button" class="ss-player-link" data-stats-open-player="${escape(id)}" aria-label="Open Player attributes for ${escape(name)}">${escape(name)}</button>` : escape(name);
function renderStatsIssues(issues) {
  if (!issues.length) return '';
  const attention = issues.filter(issue => issue.requires_attention !== false).length;
  const notes = issues.length - attention;
  const label = [attention ? `${attention} ${attention === 1 ? 'match needs' : 'matches need'} attention` : '', notes ? `${notes} source ${notes === 1 ? 'note' : 'notes'}` : ''].filter(Boolean).join(' · ');
  return `<details class="ss-issues ${attention ? '' : 'ss-source-notes'}"><summary>${label}</summary>${issues.map(issue => `<div class="ss-issue"><span>${escape(issue.grade)} · ${escape(date(issue.date))}<small>${escape(issue.messages.join(' · '))}</small></span>${issue.fixture_id ? `<button type="button" class="btn ghost" data-stats-fixture="${escape(issue.fixture_id)}">Fixture details</button>` : link(issue.url) ? `<a href="${escape(link(issue.url))}" target="_blank" rel="noopener">Scorecard</a>` : ''}</div>`).join('')}</details>`;
}
const css = `<style>
.season-stats{--ss-line:var(--line,#dbe3e0);--ss-muted:var(--muted,#52627a);--ss-accent:var(--navy,#173d32);margin:8px 0;padding:16px;border:1px solid var(--ss-line);border-radius:10px;background:var(--mirelion-surface,#fff);color:var(--ink,#24344c)}
.season-stats *{box-sizing:border-box}.season-stats h2{margin:0}.ss-top{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 12px}.ss-top-with-setup{grid-template-columns:minmax(140px,400px) max-content minmax(0,1fr)}.ss-top h2{grid-column:1;grid-row:1}.ss-top [data-stats-setup-toggle]{grid-column:2;grid-row:1}.ss-top [data-stats-close]{grid-column:-2;grid-row:1;justify-self:end}.ss-top .ss-season-dates{grid-column:1/-1;margin:0 0 6px;font-size:12px;color:var(--ss-muted)}.season-stats .btn{min-height:44px}.ss-season{font-size:12px;color:var(--ss-muted);margin:0 0 8px}.ss-setup-trigger{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:7px 10px;border:1px solid #aabbb3;border-radius:7px;background:#f3f6ef;color:var(--ss-accent);font-family:inherit;font-size:14px;font-weight:650;white-space:nowrap;cursor:pointer}.ss-setup-trigger svg{width:17px;height:17px;flex-shrink:0}.ss-setup-trigger .ss-setup-chevron{width:14px;height:14px;transition:transform .15s}.ss-setup-trigger[aria-expanded=true] .ss-setup-chevron{transform:rotate(180deg)}.ss-setup-trigger:hover{background:#e8eee1;border-color:var(--ss-accent)}.ss-setup-trigger:focus-visible{outline:2px solid var(--ss-accent);outline-offset:2px}.ss-season-dates{white-space:nowrap}.ss-season form{display:flex;gap:10px;align-items:end;flex-wrap:wrap;padding:8px 0}.ss-season form label{display:grid;gap:4px}.ss-season input{min-height:44px}.ss-season form[data-stats-view-setup]{display:block}.ss-setup-row{display:flex;gap:10px;flex-wrap:wrap;border:0;border-top:1px solid var(--ss-line);padding:8px 0;margin:8px 0;min-width:0}.ss-setup-row legend{font-weight:650;padding:0}.ss-setup-row label{flex:1 1 220px;min-width:0}.ss-setup-row select{width:100%;min-width:0;min-height:44px;font-size:16px}.ss-setup-actions{display:flex;gap:8px;flex-wrap:wrap}
.ss-modes{display:flex;align-items:center;gap:4px;padding:4px 0;border-bottom:1px solid var(--ss-line)}.season-stats .ss-modes .btn{border-color:transparent;background:transparent;border-radius:6px 6px 0 0;padding:9px 16px;color:var(--ss-muted)}.season-stats .ss-modes .btn[aria-pressed=true],#app .season-stats .ss-modes .btn[aria-pressed=true]{background:var(--soft,#edf1e9);color:var(--ss-accent);border-color:transparent;box-shadow:inset 0 -3px var(--ss-accent)}
.ss-filters{display:grid;grid-template-columns:minmax(120px,1fr) minmax(120px,1fr) minmax(180px,1.25fr);align-items:end;gap:12px;margin:12px 0 2px}.ss-filters label{display:grid;gap:4px;min-width:0;font-size:12px;font-weight:600;color:var(--ss-muted)}.ss-filters input,.ss-filters select{width:100%;min-width:0;min-height:44px;margin:0;border:1px solid var(--ss-line);border-radius:7px;padding:8px 10px;font:inherit;font-size:15px;color:var(--ink,#24344c);background:var(--mirelion-surface,#fff)}.ss-search{grid-column:-2/-1}.ss-search input{font-weight:400}
.ss-context{display:flex;align-items:center;gap:6px 16px;flex-wrap:wrap;margin:2px 0 8px}.ss-caption{font-size:12px;color:var(--ss-muted);margin:6px 0}.ss-context .ss-caption{margin:0}.ss-refresh{margin-left:auto}.season-stats .ss-refresh{border:0;background:transparent;color:var(--ss-muted);font-size:12px;padding:6px}.ss-status:empty{display:none}.ss-issues{font-size:12px;margin:0;color:#79531f}.ss-issues.ss-source-notes{color:var(--ss-muted)}.ss-issues>summary{cursor:pointer;min-height:36px;align-content:center;font-weight:600}.ss-issues[open]{flex-basis:100%;order:2;padding:4px 10px;border:1px solid #e7c684;border-radius:6px;background:#fff8e8}.ss-source-notes[open]{border-color:var(--ss-line);background:var(--soft,#f4f5f2)}.ss-issue{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #e7d5b3}.ss-issue small{display:block}
.ss-list-head,.ss-row>summary{display:grid;grid-template-columns:minmax(180px,1fr) minmax(350px,1.35fr) 20px;gap:16px;align-items:center}.ss-list-head{padding:0 12px;background:var(--soft,#f1f4ee);border-radius:6px;font-size:11px;font-weight:600;color:var(--ss-muted);min-height:36px}.ss-head-figures,.ss-figures{display:grid;grid-template-columns:1.35fr 1.1fr 1fr .8fr .9fr;gap:10px;align-items:center;text-align:right}.ss-head-figures>span:first-child{color:var(--ss-accent);font-weight:750}.ss-row{border-bottom:1px solid var(--ss-line)}.ss-row>summary{min-height:70px;cursor:pointer;list-style:none;padding:10px 12px}.ss-row>summary::-webkit-details-marker{display:none}.ss-row>summary:hover,.ss-row[open]>summary{background:var(--soft,#f4f6f0)}.ss-row>summary:focus-visible{outline:2px solid var(--ss-accent);outline-offset:-2px}.ss-name{font-size:15px;font-weight:650;min-width:0;overflow-wrap:anywhere}.ss-name small{display:block;margin-top:2px;font-size:12px;line-height:1.35;font-weight:400;color:var(--ss-muted)}.ss-incomplete{color:#79531f}.ss-figure{min-width:0;font-variant-numeric:tabular-nums;white-space:nowrap}.ss-figure strong{font-size:15px;font-weight:500;line-height:1.3}.ss-primary strong{font-size:23px;font-weight:700;color:var(--ss-accent);letter-spacing:-.025em}.ss-figure-label,.ss-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.ss-chevron{font-size:20px;text-align:center;color:var(--ss-muted);transition:transform .15s}.ss-row[open] .ss-chevron{transform:rotate(180deg)}
.season-stats button.ss-player-link{display:inline-flex;align-items:center;min-height:44px;margin:-9px 0;padding:0;border:0;border-radius:3px;background:transparent;color:inherit;font:inherit;font-weight:650;text-align:left;cursor:pointer;text-decoration:underline;text-decoration-color:#bcc9c0;text-underline-offset:3px}.season-stats button.ss-player-link:hover{color:var(--ss-accent);text-decoration-color:currentColor}.season-stats button.ss-player-link:focus-visible{outline:2px solid var(--ss-accent);outline-offset:2px}
.ss-detail{padding:12px;background:var(--soft,#f6f8f4)}.ss-detail-top{display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap}.ss-metrics{display:flex;flex-wrap:wrap;gap:8px 20px;font-size:12px;margin:0}.ss-metrics dt{color:var(--ss-muted)}.ss-metrics dd{margin:2px 0 0;font-weight:650;font-variant-numeric:tabular-nums}.ss-detail .se-evidence-button{background:var(--mirelion-surface,#fff);padding:6px 8px;border:1px solid var(--ss-line);border-radius:6px}.season-stats .ss-history-title{font-size:12px;margin:14px 0 4px;font-weight:650}.ss-match{display:flex;justify-content:space-between;align-items:start;gap:12px;padding:8px 0;border-top:1px solid var(--ss-line);font-size:13px}.ss-match small{display:block;color:var(--ss-muted);margin-top:3px}.ss-match-score{text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}
.ss-compare-controls{display:flex;align-items:end;gap:8px;flex-wrap:wrap;margin-top:12px}.ss-compare-controls label{display:grid;gap:4px;flex:1;min-width:110px}.ss-compare-mode{display:grid;gap:4px;min-width:0}.ss-compare-mode>span{font-size:13px;font-weight:600;line-height:1.4}.ss-compare-mode>div{display:flex;gap:4px}.ss-compare-mode .btn{flex:1;white-space:nowrap}.ss-compare-mode [aria-pressed=true]{background:var(--ss-accent);color:#fff}.ss-compare-controls select{width:100%;min-height:44px}.ss-empty{margin:16px 0}
@media(max-width:700px){.ss-top-with-setup{grid-template-columns:minmax(0,1fr) auto;gap:4px 8px}.ss-top-with-setup [data-stats-close]{grid-column:2;grid-row:2}.ss-top-with-setup .ss-season-dates{grid-column:1;grid-row:2;margin:0;white-space:normal}.ss-filters{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ss-search{grid-column:1/-1}.ss-filters input,.ss-filters select{font-size:16px}.ss-context{gap:0 10px}.ss-context .ss-caption{font-size:11px}.ss-list-head,.ss-row>summary{grid-template-columns:minmax(0,1fr) 22px;gap:4px 8px;padding-left:8px;padding-right:8px}.ss-list-head{display:flex;justify-content:space-between;padding-right:38px}.ss-head-figures>span:not(:first-child){display:none}.ss-head-figures{display:block}.ss-row>summary{min-height:88px;grid-template-rows:auto auto;align-items:center;padding-top:10px;padding-bottom:10px}.ss-name{grid-column:1;grid-row:1;padding-right:84px;min-height:38px;font-size:14px;align-content:center}.ss-name small{font-size:11px}.ss-figures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-column:1;grid-row:2;text-align:left;gap:4px;position:relative;padding-top:3px}.ss-figure:not(.ss-primary){display:flex;flex-wrap:wrap;align-items:baseline;gap:0 4px}.ss-figure strong{font-size:13px}.ss-figure-label{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto;font-size:10px;color:var(--ss-muted);font-weight:400}.ss-primary{position:absolute;right:0;bottom:calc(100% + 3px);text-align:right}.ss-primary .ss-figure-label{display:block;font-size:10px;line-height:1.3}.ss-primary strong{display:block;font-size:23px}.ss-chevron{grid-column:2;grid-row:1/3}.ss-detail{padding:10px 8px}.ss-metrics{gap:8px 16px}.ss-match{gap:8px}.ss-compare-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.ss-compare-controls label{min-width:0}.ss-compare-mode .btn,#app .ss-compare-mode .btn{padding:8px 3px}}
</style>`;

export function renderGradeComparison(summary, first, second, roster, evidence = buildSelectionEvidence(summary, [first,second].filter(Boolean), roster), mode = 'batting', openable = null, seasonPlayers = false) {
  const rows = (seasonPlayers ? compareSeasonGrades : compareSelectedGrades)(summary, first, second, roster);
  if (!rows.length) return '<p class="ss-empty">'+(seasonPlayers ? 'No recorded appearances for these grades in this format.' : 'Choose two teams in the same competition and format.')+'</p>';
  if (!rows.some(row => row.first.length || row.second.length)) return '<p class="ss-empty">No players selected for these teams yet.</p>';
  const bowling = mode === 'bowling';
  const figures = stats => {
    if (!stats) return '<small>No linked season figures</small>';
    if (!bowling) return `<span>${numeric(stats.average)} average</span><small>${stats.batting_complete === false ? 'Figures incomplete' : stats.runs + ' runs · ' + stats.innings + ' inns' + (stats.not_outs ? ' · ' + stats.not_outs + ' not out' : '')}</small>${Number.isFinite(stats.strike_rate) ? `<small>${rate(stats.strike_rate)} SR</small>` : ''}`;
    if (stats.bowling_complete === false) return '<span>— average</span><small>Figures incomplete</small>';
    if (!stats.bowling_innings) return '<small>No bowling recorded</small>';
    return `<span>${numeric(stats.bowling_average)} average</span><small>${stats.wickets} wickets · ${statsOvers(stats.bowling_balls) ?? '—'} overs · ${stats.bowling_innings} inns</small><small>${numeric(stats.economy)} Econ · ${numeric(stats.bowling_strike_rate)} S/R</small>`;
  };
  const badge = (player,team) => {
    const selected=evidence.player(team.id,player.id);
    if (selected || !seasonPlayers || !player.stats) return renderEvidenceBadges(selected);
    const item=evidence.forRow(player.stats),key='stats:'+player.stats.id;
    if (item) evidence.players.set(key,{...item,key});
    return renderEvidenceBadges(item,key);
  };
  const cell = (players,team) => players.length ? players.map(player => `<div data-evidence-row><strong data-evidence-anchor>${playerName(player.id,player.name,openable)}</strong>${player.day ? `<small>Day ${player.day}</small>` : ''}${figures(player.stats)}${badge(player,team)}</div>`).join('') : seasonPlayers ? '' : '<small>Vacant</small>';
  return evidenceStyles + `<style>.ss-compare{margin:12px 0}
.ss-compare-row{display:grid;grid-template-columns:20px minmax(0,1fr) clamp(44px,6vw,72px) minmax(0,1fr);column-gap:0;row-gap:10px;border-top:1px solid #e1e7ee;padding:10px 0;align-items:start}
.ss-compare-row>:last-child{grid-column:4}
.ss-compare-season .ss-compare-row{grid-template-columns:minmax(0,1fr) clamp(44px,6vw,72px) minmax(0,1fr)}
.ss-compare-season .ss-compare-row>:last-child{grid-column:3}
.ss-compare [data-evidence-row].se-comparison-linked{box-shadow:none;border-radius:0;background:none}
.ss-compare .se-comparison-active>[data-evidence-anchor]{background:#fff4d9;box-shadow:0 0 0 3px #fff4d9;border-radius:3px}
.ss-compare .se-evidence-connectors g{opacity:.75}
.ss-compare .se-evidence-connectors g.se-comparison-active,.ss-compare .se-evidence-connectors [role=button]:focus-visible{opacity:1}.ss-compare-cell{min-width:0;overflow-wrap:anywhere}.ss-compare-cell strong,.ss-compare-cell span,.ss-compare-cell small{display:block}.ss-compare-cell strong{font-size:14px}.ss-compare-cell span{margin-top:5px;font-size:14px}.ss-compare-cell small{font-size:12px;color:#52627a;margin:3px 0}.ss-compare-cell>div+div{border-top:1px dashed #dbe3ed;margin-top:8px;padding-top:8px}.ss-position{font-size:12px;color:#52627a;padding-top:2px}.ss-compare-head{font-weight:700}.ss-compare-head small{display:block;font-size:12px;font-weight:400}</style><p class="ss-caption">${seasonPlayers ? 'All season players, alphabetically' : (first.lineupPublished ? 'Published' : 'Selected')+' batting order'} · ${escape(STATS_FORMATS[first.format] || first.format)} season ${bowling ? 'bowling' : 'batting'} figures in each grade. Averages are not adjusted for grade strength. ${first.format === 'competition' ? 'Choose an individual format for form ratings.' : 'Open Form guide for the rough assessment.'}</p><div class="ss-compare${seasonPlayers ? ' ss-compare-season' : ''}" role="table" aria-label="${seasonPlayers ? 'All season players and' : 'Selected batting orders and'} season ${bowling ? 'bowling' : 'batting'} figures"><div class="ss-compare-row ss-compare-head" role="row">${seasonPlayers ? '' : '<span role="columnheader">#</span>'}<span role="columnheader">${escape(first.grade)}${!seasonPlayers && first.days?.[0]?.date ? `<small>Line-up: ${escape(date(first.days[0].date))}</small>` : ''}</span><span role="columnheader">${escape(second.grade)}${!seasonPlayers && second.days?.[0]?.date ? `<small>Line-up: ${escape(date(second.days[0].date))}</small>` : ''}</span></div>${rows.map(row => `<div class="ss-compare-row" role="row">${seasonPlayers ? '' : `<span class="ss-position" role="rowheader">${row.position}</span>`}<div class="ss-compare-cell" role="cell">${cell(row.first,first)}</div><div class="ss-compare-cell" role="cell">${cell(row.second,second)}</div></div>`).join('')}</div>`;
}

export function renderStatsRows(rows, mode = 'batting', evidence = null, openable = null) {
  const metric = (label, value) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`;
  const figure = (key, label, value, {primary=false,note=''}={}) => `<span class="ss-figure${primary?' ss-primary':''}" data-stat="${key}"${note?` title="${escape(note)}"`:''}><span class="ss-figure-label">${label}</span><strong>${escape(value)}</strong></span>`;
  return rows.map(row => {
    const item=evidence?.forRow(row), evidenceKey='stats:'+row.id;
    if(item)evidence.players.set(evidenceKey,{...item,key:evidenceKey});
    const batting = mode === 'batting', incomplete = (batting ? row.batting_complete : row.bowling_complete) === false;
    const high = row.high_score ? row.high_score.runs + (row.high_score.not_out ? '*' : '') : '—';
    const best = row.best_bowling ? row.best_bowling.wickets + '/' + row.best_bowling.runs : '—';
    const metrics = batting
      ? [['Matches',row.matches],['Balls faced',numeric(row.balls)],['High score',high],['50s',row.fifties],['100s',row.hundreds],['Ducks',row.ducks]]
      : [['Matches',row.matches],['Innings bowled',row.bowling_innings],['Runs conceded',row.conceded],['Strike rate',rate(row.bowling_strike_rate)],['Best',best],['5 wickets',row.five_wickets]];
    const averageNote = incomplete ? 'Figures incomplete' : batting && row.innings && !row.dismissals ? 'No dismissals yet' : '';
    const figures = batting
      ? figure('average','Average',rate(incomplete?null:row.average),{primary:true,note:averageNote}) + figure('strike_rate','SR',rate(incomplete?null:row.strike_rate),{note:incomplete?'Figures incomplete':row.balls===null?'Balls faced unavailable':'Strike rate: runs per 100 balls'}) + figure('runs','Runs',numeric(row.runs)) + figure('innings','Inns',numeric(row.innings)) + figure('not_outs','Not out',numeric(row.not_outs))
      : figure('wickets','Wickets',numeric(row.wickets),{primary:true}) + figure('bowling_average','Average',rate(incomplete?null:row.bowling_average)) + figure('economy','Econ',rate(incomplete?null:row.economy)) + figure('bowling_balls','Overs',statsOvers(row.bowling_balls)??'—') + figure('bowling_innings','Inns',numeric(row.bowling_innings));
    return `<details class="ss-row" data-stats-player="${escape(row.id)}"><summary><span class="ss-name">${playerName(row.roster_id,row.name,openable)}<small>${escape(row.grade)}${row.competition ? ' · ' + escape(row.competition) + (row.format!=='competition'?' · '+escape(STATS_FORMATS[row.format] || row.format):'') : ' · Competition unknown · ' + escape(STATS_FORMATS[row.format] || row.format)}${incomplete ? '<span class="ss-incomplete"> · Figures incomplete</span>' : ''}</small></span><span class="ss-figures">${figures}</span><span class="ss-chevron" aria-hidden="true">⌄</span><span class="ss-sr-only">Match history and form guide</span></summary><div class="ss-detail"><div class="ss-detail-top"><dl class="ss-metrics">${metrics.map(([label,value]) => metric(label, value)).join('')}</dl>${renderEvidenceBadges(item,evidenceKey)}</div>${averageNote ? `<p class="ss-caption">${escape(averageNote)}${averageNote==='No dismissals yet'?'; average is unavailable.':''}</p>` : ''}<h3 class="ss-history-title">Match history</h3>${row.history.map(match => {
      const scores = batting ? match.batting.map(x => x.dnb ? 'DNB' : x.runs + (x.not_out ? '*' : '') + (x.balls === null ? '' : ' (' + x.balls + ')')) : match.bowling.map(x => x.wickets + '/' + x.runs + (x.balls === null ? '' : ' · ' + statsOvers(x.balls) + ' ov'));
      if (batting ? match.batting_incomplete : match.bowling_incomplete) scores.push('Figures incomplete');
      const score = scores.join(' & ') || (batting ? match.batting_available ? 'DNB' : 'Batting unavailable' : match.bowling_available ? 'Did not bowl' : 'Bowling unavailable');
      const url = link(match.url);
      return `<div class="ss-match"><span>${escape(date(match.date))} · v ${escape(match.opposition)}${row.format === 'competition' ? ' · ' + escape(STATS_FORMATS[match.format] || match.format) : ''}${url ? `<small><a href="${escape(url)}" target="_blank" rel="noopener">Scorecard</a></small>` : ''}</span><span class="ss-match-score">${escape(score)}</span></div>`;
    }).join('')}</div></details>`;
  }).join('');
}

export function createSeasonStatsPanel(h) {
  let active = null;
  const here = s => active === s && s.host.isConnected && h.here(s);
  const openablePlayers = s => new Set(h.openPlayer ? (s.roster || []).filter(p => p.active !== false && h.canOpenPlayer?.(s,p.id)).map(p => p.id) : []);
  function bindPlayerLinks(s, host = s.host) {
    host.querySelectorAll('[data-stats-open-player]').forEach(button => button.onclick = event => {
      event.preventDefault(); event.stopPropagation();
      const id = button.dataset.statsOpenPlayer;
      if (here(s) && openablePlayers(s).has(id) && canLeave()) h.openPlayer(s,id);
    });
  }
  function canLeave() {
    const s = active;
    if (!s || !here(s)) return true;
    if (s.pendingViews || s.busy && s.savingViews) {h.alert?.('Confirm the stats setup save before leaving.'); return false;}
    if (statsSetupChanged(s.context,s.state) && !h.confirm?.('Leave these unsaved stats settings?')) return false;
    if (s.busy && s.savingSeason) {h.alert?.('Please wait for the season dates to save.'); return false;}
    const draft = s.state.seasonDraft;
    if (draft && (draft.start !== s.context?.season.start || draft.end !== s.context?.season.end) && !h.confirm?.('Leave these unsaved season dates?')) return false;
    delete s.state.seasonDraft;
    delete s.state.viewDraft;
    return true;
  }
  async function request(s, action = 'context', data = {}) {
    const result = await h.supabase.rpc('club_season_stats_api', {p_club_id:s.clubId, p_action:action, p_data:{...data,on_demand:true}});
    if (result.error) throw Object.assign(Error(result.error.message),{confirmed:/^[A-Z0-9]{5}$/.test(result.error.code || '')});
    if (!Array.isArray(result.data?.cards) || !Array.isArray(result.data?.fixtures) || !result.data?.season?.start) throw Error('Season stats could not be loaded.');
    return result.data;
  }
  function draw(s) {
    if (!here(s)) return;
    clearEvidenceLinks(s.host);
    const state = s.state, data = s.context;
    if (data && !statsViews(data,state.competition).includes(state.format)) state.format=defaultStatsView(data,s.preferredFormat,state.competition);
    const open = new Set([...s.host.querySelectorAll('[data-stats-player][open]')].map(el => el.dataset.statsPlayer));
    const disabled = s.busy ? 'disabled' : '';
    const teamDate = team => team.days?.[0]?.date || '';
    const available = team => !team.cancelled && (!data || !teamDate(team) || teamDate(team) >= data.season.start && teamDate(team) <= data.season.end);
    const sourceTeams = resolveSelectionStatsTeams(s.teams || data?.fixtures || [],data?.season,[...(data?.fixtures || []),...(s.teams || [])]);
    const allTeams = sourceTeams.filter(t=>available(t) && (state.competition == null || String(t.competition || '').trim()===state.competition)).map(t => ({...t,format:statsFormat(t.format)}));
    const viewTeam = team => state.format === 'competition' && statsCombineCompetition(data,team.competition) && statsMatchesView(team.format, 'competition') ? {...team,format:'competition'} : team;
    const latestPublished = new Map();
    for (const fixture of sourceTeams) {
      if (!fixture.published?.details || !Array.isArray(fixture.published.slots)) continue;
      const team = {...fixture, ...fixture.published.details, slots:fixture.published.slots, level:fixture.published.level ?? fixture.level, lineupPublished:true};
      team.format = statsFormat(team.format);
      if (!available(team) || state.competition != null && String(team.competition || '').trim()!==state.competition) continue;
      const projected = viewTeam(team), key = JSON.stringify([team.competition, team.grade, projected.format]), previous = latestPublished.get(key);
      if (!previous || teamDate(team) > teamDate(previous)) latestPublished.set(key, projected);
    }
    const publishedTeams = [...latestPublished.values()];
    const formatTeams = allTeams.filter(t => state.format && statsMatchesView(t.format, state.format)).map(viewTeam);
    const formatPublished = publishedTeams.filter(t => state.format && (t.format === state.format || statsMatchesView(t.format,state.format)));
    const dates = [...new Set(formatTeams.map(teamDate).filter(Boolean))].sort().reverse();
    const populated = dates.filter(day => formatTeams.some(t => teamDate(t) === day && t.slots?.some(slot => slot.d1 || slot.d2)));
    const comparisonDate = state.compareDate === 'season' || !s.teams ? 'season' : dates.includes(state.compareDate) ? state.compareDate
      : formatPublished.length ? 'published'
      : populated.includes(s.boardDate) ? s.boardDate
      : populated.find(day => day <= (s.boardDate || data?.today || '9999-12-31')) || populated[0]
      || (dates.includes(s.boardDate) ? s.boardDate : dates[0]);
    const seasonTeams = new Map();
    [...formatTeams].sort((a,b)=>teamDate(a).localeCompare(teamDate(b))).concat(formatPublished).forEach(t=>seasonTeams.set(JSON.stringify([t.competition,t.grade,t.format]),t));
    const teams = (comparisonDate === 'season' ? [...seasonTeams.values()] : comparisonDate === 'published' ? formatPublished : formatTeams.filter(t => !comparisonDate || teamDate(t) === comparisonDate)).sort((a,b) => (a.level ?? 999) - (b.level ?? 999) || a.grade.localeCompare(b.grade, undefined, {numeric:true}));
    const showCompetition = new Set(teams.map(t => t.competition)).size > 1;
    const teamLabel = team => escape(team.grade) + (showCompetition ? ' · ' + escape(team.competition || 'Competition unknown') : '') + (state.format==='competition' && team.format!=='competition'?' · '+escape(STATS_FORMATS[team.format] || team.format):'');
    const previous = id => [...allTeams,...publishedTeams].find(t => t.id === id);
    const sameGrade = (team, old) => old && team.grade === old.grade && team.competition === old.competition;
    const primary = teams.find(t => t.id === state.firstTeam) || teams.find(t => sameGrade(t,previous(state.firstTeam))) || teams[0];
    const lower = primary ? teams.filter(t => t.id !== primary.id && t.competition === primary.competition && t.format === primary.format) : [];
    const secondary = lower.find(t => t.id === state.secondTeam) || lower.find(t => sameGrade(t,previous(state.secondTeam))) || lower.find(t => t.level > primary?.level) || lower[0];
    if (primary) state.firstTeam = primary.id;
    if (secondary) state.secondTeam = secondary.id;
    const canCompare = publishedTeams.some(t => publishedTeams.some(other => other.grade !== t.grade && other.competition === t.competition && other.format === t.format)) || allTeams.some(t => allTeams.some(other => other.grade !== t.grade && (!s.teams || teamDate(other) === teamDate(t)) && other.competition === t.competition && viewTeam(other).format === viewTeam(t).format));
    if (!canCompare) state.compare = false;
    const allTotals = data ? buildSeasonStats(data, {competition:state.competition,...(state.format === 'competition' ? {format:'competition'} : {})}) : null;
    if (allTotals && state.grade && !allTotals.groups.some(g=>g.id===state.grade)) {
      // Retain the selected grade when an old blank label resolves after sync.
      let grade;try { grade=JSON.parse(state.grade)?.[1]; } catch {}
      const matches=allTotals.groups.filter(g=>g.grade===grade);
      state.grade=matches.length===1?matches[0].id:'';
    }
    const knownFormats = statsViews(data || {},state.competition).filter(f=>f!=='unknown');
    const formats = [...knownFormats,...(allTotals?.formats || []).filter(f => !knownFormats.includes(f))];
    const viewLabel = f => f === 'competition' ? 'Competition' : ['limited_overs','long_form'].includes(f) ? STATS_FORMATS[f] + ' only' : STATS_FORMATS[f] || f;
    const competitionNames=data?statsCompetitions(data):[];
    const competitionPicker=competitionNames.length>1?`<label>Competition<select data-stats-competition ${disabled}><option value="">All competitions</option>${competitionNames.map(name=>`<option value="${escape(JSON.stringify(name))}" ${state.competition===name?'selected':''}>${escape(name || 'Competition unknown')}</option>`).join('')}</select></label>`:'';
    const formatPicker = `<label class="ss-format">Stats view<select data-stats-filter="format" ${disabled}>${formats.map(f => `<option value="${escape(f)}" ${state.format === f ? 'selected' : ''}>${escape(viewLabel(f))}</option>`).join('')}</select></label>`;
    const totals = data ? buildSeasonStats(data, state.compare ? {...state, groups:[primary, secondary].filter(Boolean).map(team => JSON.stringify([String(team.competition || '').trim(), String(team.grade || '').trim()]))} : state) : null;
    s.evidence = allTotals ? buildSelectionEvidence(allTotals,state.compare?[primary,secondary].filter(Boolean):[],s.roster,{seasonPlayers:state.compare && comparisonDate === 'season'}) : null;
    const setupOpen=!!(state.seasonDraft || state.viewDraft || state.setupOpen),setupId='season-stats-setup-'+String(s.clubId).replace(/[^a-zA-Z0-9_-]/g,'');
    s.host.innerHTML = evidenceStyles + css + `<section class="season-stats" aria-label="Season stats"><div class="ss-top ${data?.can_set_season?'ss-top-with-setup':''}"><h2 tabindex="-1">Season stats</h2>${data?.can_set_season?`<button type="button" class="ss-setup-trigger" data-stats-setup-toggle aria-expanded="${setupOpen}" aria-controls="${setupId}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.6 2.2-2 .9L4.8 5.5 2.5 9.4 4 11v2l-1.5 1.6 2.3 3.9 2.1-.6 2 .9.6 2.2h5l.6-2.2 2-.9 2.1.6 2.3-3.9L20 13v-2l1.5-1.6-2.3-3.9-2.1.6-2-.9-.6-2.2z"/><circle cx="12" cy="12" r="3"/></svg>${data.can_set_stats_views?'Stats setup':'Season dates'}<svg class="ss-setup-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button>`: ""}<button type="button" class="btn ghost" data-stats-close>Close stats</button>${data?`<p class="ss-season-dates">${escape(data.season.label)} · ${escape(date(data.season.start))}–${escape(date(data.season.end))}</p>`:""}</div>${data ? `
      ${data.can_set_season ? `<div class="ss-season" id="${setupId}" ${setupOpen ? '' : 'hidden'} data-stats-setup><form data-stats-season><label>Starts<input type="date" name="start" value="${escape(state.seasonDraft?.start ?? data.season.start)}" required ${disabled}></label><label>Ends<input type="date" name="end" value="${escape(state.seasonDraft?.end ?? data.season.end)}" required ${disabled}></label><button type="submit" class="btn secondary" ${disabled}>${s.savingSeason ? 'Saving…' : 'Save season dates'}</button></form>${renderStatsSetup(data,state,s.busy ? 'disabled' : '',!!s.pendingViews)}</div>` : ''}

      <div class="ss-modes" aria-label="Statistics type"><button class="btn ghost" type="button" data-stats-mode="batting" aria-pressed="${state.mode !== 'bowling' && !state.compare}">Batting</button><button class="btn ghost" type="button" data-stats-mode="bowling" aria-pressed="${state.mode === 'bowling' && !state.compare}">Bowling</button>${canCompare ? `<button class="btn ghost" type="button" data-stats-compare aria-pressed="${!!state.compare}">Compare grades</button>` : ''}</div>
      ${!state.compare ? `<div class="ss-filters">${competitionPicker}${totals.groups.length > 1 ? `<label>Grade<select data-stats-filter="grade" ${disabled}><option value="">All grades</option>${totals.groups.map(g => `<option value="${escape(g.id)}" ${state.grade === g.id ? 'selected' : ''}>${escape(g.grade)}${totals.groups.some(other => other.id !== g.id && other.grade === g.grade) ? ' · ' + escape(g.competition || 'Competition unknown') : ''}</option>`).join('')}</select></label>` : ''}${formatPicker}<label class="ss-search">Find player<input type="search" data-stats-search placeholder="Search players…" autocomplete="off" value="${escape(state.search || '')}"></label></div>` : ''}
      <div class="ss-context"><p class="ss-caption">${totals.included} completed ${totals.included === 1 ? 'scorecard' : 'scorecards'} · ${escape(state.format==='competition' && totals.rows.some(r=>r.format!=='competition')?'Competition views':STATS_FORMATS[state.format] || 'Current season')}${totals.playing ? ' · ' + totals.playing + ' in progress' : ''}</p>
      ${renderStatsIssues(totals.issues)}<button class="btn ghost ss-refresh" type="button" data-stats-refresh ${disabled}>${s.busy ? 'Updating…' : 'Update totals'}</button></div>
      ${state.compare ? `<div class="ss-compare-controls">${competitionPicker}${formatPicker}<div class="ss-compare-mode" role="group" aria-label="Comparison figures"><span>Figures</span><div><button type="button" class="btn ghost" data-stats-compare-mode="batting" aria-pressed="${state.mode !== 'bowling'}">Batting</button><button type="button" class="btn ghost" data-stats-compare-mode="bowling" aria-pressed="${state.mode === 'bowling'}">Bowling</button></div></div>${dates.length || formatPublished.length ? `<label>Players<select data-stats-date><option value="season" ${comparisonDate === 'season' ? 'selected' : ''}>All season players</option>${formatPublished.length ? `<option value="published" ${comparisonDate === 'published' ? 'selected' : ''}>Last published teams</option>` : ''}${(s.teams ? dates : []).map(day => `<option value="${escape(day)}" ${day === comparisonDate ? 'selected' : ''}>${escape(date(day))} · Current</option>`).join('')}</select></label>` : ''}<label>Team<select data-stats-team="firstTeam">${teams.map(t => `<option value="${escape(t.id)}" ${t.id === primary?.id ? 'selected' : ''}>${teamLabel(t)}</option>`).join('')}</select></label><label>Compare with<select data-stats-team="secondTeam">${lower.map(t => `<option value="${escape(t.id)}" ${t.id === secondary?.id ? 'selected' : ''}>${teamLabel(t)}</option>`).join('')}</select></label></div>${primary && secondary ? renderGradeComparison(allTotals, primary, secondary, s.roster, s.evidence, state.mode, openablePlayers(s), comparisonDate === 'season') : `<p class="ss-empty">No comparable ${escape(STATS_FORMATS[state.format] || 'matching format')} line-ups in this season.</p>`}` : `<div data-stats-rows></div>`}` : ''}<p class="ss-status" role="${s.error ? 'alert' : 'status'}" aria-live="polite">${escape(s.message)}</p>${!data && !s.busy ? '<button class="btn" type="button" data-stats-refresh>Try again</button>' : ''}</section>`;
    if (totals && !state.compare) renderRows(s, totals, open);
    bindPlayerLinks(s);
    if (s.evidence) bindEvidenceDetails(s.host,s.evidence,()=>here(s));
    bindStatsSetup(s.host,data,state,()=>draw(s),()=>void saveViews(s),!!s.pendingViews);
    const setup=s.host.querySelector('[data-stats-setup]'),setupToggle=s.host.querySelector('[data-stats-setup-toggle]');
    if(setup && setupToggle)setupToggle.onclick=()=>{state.setupOpen=setup.hidden;setup.hidden=!state.setupOpen;setupToggle.setAttribute('aria-expanded',String(state.setupOpen));};
    s.host.querySelector('[data-stats-competition]')?.addEventListener('change',e=>{state.competition=e.target.value?JSON.parse(e.target.value):undefined;state.grade='';state.firstTeam='';state.secondTeam='';state.format=defaultStatsView(data,s.preferredFormat,state.competition);draw(s);h.navigate?.();});
    s.host.querySelector('[data-stats-close]').onclick = () => {if (canLeave()) h.close(s);};
    s.host.querySelector('[data-stats-refresh]')?.addEventListener('click', () => {if (canLeave()) void load(s);});
    s.host.querySelectorAll('[data-stats-filter]').forEach(el => el.onchange = () => {state[el.dataset.statsFilter] = el.value; draw(s); h.navigate?.();});
    s.host.querySelectorAll('[data-stats-mode]').forEach(el => el.onclick = () => {state.mode = el.dataset.statsMode; state.compare = false; draw(s); h.navigate?.();});
    s.host.querySelectorAll('[data-stats-compare-mode]').forEach(el => el.onclick = () => {state.mode = el.dataset.statsCompareMode; draw(s); h.navigate?.(); s.host.querySelector(`[data-stats-compare-mode="${state.mode}"]`)?.focus({preventScroll:true});});
    s.host.querySelector('[data-stats-compare]')?.addEventListener('click', () => {state.compare = !state.compare; state.grade = ''; draw(s); h.navigate?.();});
    s.host.querySelector('[data-stats-date]')?.addEventListener('change', e => {state.compareDate = e.target.value; draw(s); h.navigate?.();});
    s.host.querySelectorAll('[data-stats-team]').forEach(el => el.onchange = () => {state[el.dataset.statsTeam] = el.value; if (el.dataset.statsTeam === 'firstTeam') state.secondTeam = ''; draw(s); h.navigate?.();});
    s.host.querySelector('[data-stats-search]')?.addEventListener('input', e => {state.search = e.target.value; renderRows(s, totals, new Set([...s.host.querySelectorAll('[data-stats-player][open]')].map(el=>el.dataset.statsPlayer)));});
    s.host.querySelectorAll('[data-stats-fixture]').forEach(el => el.onclick = () => {if (canLeave()) h.openFixture(s, el.dataset.statsFixture);});
    s.host.querySelectorAll('[data-stats-season] input').forEach(el => el.addEventListener('input', () => {
      const form = el.closest('form'); state.seasonDraft = {start:form.querySelector('[name=start]').value, end:form.querySelector('[name=end]').value};
    }));
    s.host.querySelector('[data-stats-season]')?.addEventListener('submit', e => {
      e.preventDefault(); if (s.busy || s.pendingViews) return;
      const form = e.currentTarget, start = form.elements.start.value, end = form.elements.end.value;
      if (end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) {s.message = 'Choose season dates in order, up to one year apart.'; s.error = true; draw(s); return;}
      void load(s, {start, end, expected_revision:data.season.revision});
    });
  }
  function renderRows(s, totals, open = new Set()) {
    const state = s.state, bowling = state.mode === 'bowling';
    const rows = totals.rows.filter(row => (!bowling || row.bowling_innings > 0 || row.bowling_complete === false) && (!state.search || row.name.toLowerCase().includes(state.search.trim().toLowerCase())))
      .sort((a,b) => bowling ? b.wickets - a.wickets || (a.bowling_average ?? Infinity) - (b.bowling_average ?? Infinity) || a.name.localeCompare(b.name) : (Number.isFinite(a.average) ? Number.isFinite(b.average) ? b.average - a.average : -1 : Number.isFinite(b.average) ? 1 : 0) || b.runs - a.runs || b.innings - a.innings || a.name.localeCompare(b.name));
    const host = s.host.querySelector('[data-stats-rows]'); if (!host) return;
    const headings = bowling ? ['Wickets ↓','Average','Econ','Overs','Inns'] : ['Average ↓','SR','Runs','Inns','Not out'];
    host.innerHTML = rows.length ? `<div class="ss-list-head" aria-hidden="true"><span>Player</span><span class="ss-head-figures">${headings.map(label=>`<span>${label}</span>`).join('')}</span><span></span></div>` + renderStatsRows(rows, state.mode, s.evidence, openablePlayers(s)) : `<p class="ss-empty">${state.search ? 'No matching players.' : bowling ? 'No bowling figures for '+escape(STATS_FORMATS[state.format] || 'this format')+' in this season yet.' : 'No completed '+escape(STATS_FORMATS[state.format] || 'matching format')+' scorecards in this season yet.'}</p>`;
    host.querySelectorAll('[data-stats-player]').forEach(el => {el.open = open.has(el.dataset.statsPlayer);});
    bindPlayerLinks(s,host);
    if(s.evidence)bindEvidenceDetails(s.host,s.evidence,()=>here(s));
  }
  async function load(s, settings = null) {
    if (s.busy || !here(s)) return;
    s.busy = true; s.stale = false; s.savingSeason = !!settings; s.error = false; s.message = settings ? 'Saving season dates…' : 'Loading latest saved scores…'; draw(s);
    try {
      const data = await request(s, settings ? 'set_season' : 'context', settings || {});
      const names=statsCompetitions(data);if(s.state.competition == null && names.length===1 && names[0])s.state.competition=names[0];
      if (!here(s)) return;
      s.context = data; h.updated?.(s.scope,data);
      if (settings) delete s.state.seasonDraft;
      if (!Object.hasOwn(STATS_FORMATS,s.state.format)) s.state.format = defaultStatsView(data, s.preferredFormat,s.state.competition);
      s.message = settings ? 'Season dates saved.' : '';
    } catch (error) {if (here(s)) {s.error = true; s.message = error.message || 'Season stats could not be loaded.';}}
    finally {s.busy = false; s.savingSeason = false; draw(s); if (s.stale && here(s) && !s.state.seasonDraft && !s.state.viewDraft && !s.pendingViews) void load(s);}
  }
  async function saveViews(s) {
    if(s.busy || !here(s) || !s.context?.can_set_stats_views)return;
    if(!s.pendingViews && !statsSetupChanged(s.context,s.state)){s.message='Stats setup is already saved.';s.error=false;draw(s);return;}
    s.pendingViews ||= {settings:structuredClone(s.state.viewDraft),expected_revision:s.context.stats_views?.revision || 0,request_id:globalThis.crypto.randomUUID()};
    s.busy=true;s.savingViews=true;s.error=false;s.message='Saving stats setup…';draw(s);
    try {
      const data=await request(s,'set_views',s.pendingViews);
      if(!here(s))return;
      s.context=data;h.updated?.(s.scope,data);s.pendingViews=null;delete s.state.viewDraft;
      s.state.format=defaultStatsView(data,s.preferredFormat,s.state.competition);s.message='Stats setup saved.';
    } catch(error) {
      if(here(s)){if(error.confirmed)s.pendingViews=null;s.error=true;s.message=error.confirmed ? error.message : 'Save not confirmed. Retry the same save to check it safely.';}
    } finally {s.busy=false;s.savingViews=false;draw(s);}
  }
  return {canLeave, invalidate() {h.invalidateBoard?.(); if (active) {active.stale = true; if (here(active) && !active.busy && !active.state.seasonDraft && !active.state.viewDraft && !active.pendingViews) void load(active);}}, mount(host, options) {
    if (active?.host === host && active.scope === options.scope) {Object.assign(active,options); draw(active); if (active.stale && !active.busy && !active.state.seasonDraft && !active.state.viewDraft && !active.pendingViews) void load(active); return active;}
    if (active) clearEvidenceLinks(active.host);
    const s = {...options, host, state:options.state || {}, context:null, busy:false, message:'', error:false}; active = s; void load(s); return s;
  }};
}
