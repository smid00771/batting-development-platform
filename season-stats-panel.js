import {buildSeasonStats, compareSelectedGrades, STATS_FORMATS, statsOvers} from './season-stats.js?v=0.8.62.205';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const numeric = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-AU', {maximumFractionDigits:2});
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('en-AU', {day:'numeric', month:'short', timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z')) : '';
const link = value => {try {const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'play.cricket.com.au' && /^\/match\/[0-9a-f-]{36}(?:\/|$)/i.test(u.pathname) && !u.username && !u.password && !u.port ? u.href : '';} catch {return '';}};
const css = `<style>
.season-stats{margin:12px 0;padding:16px;border:1px solid #dbe3ed;border-radius:10px;background:white;color:#24344c}.season-stats h2{margin:0}.ss-top,.ss-filters,.ss-modes,.ss-season form{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ss-top{justify-content:space-between}.ss-filters{align-items:end;margin:12px 0}.ss-filters label{display:grid;gap:4px;flex:1;min-width:130px}.ss-filters input,.ss-filters select{width:100%}.ss-modes{gap:4px}.ss-modes [aria-pressed=true]{background:var(--navy,#17245f);color:#fff}.season-stats .btn{min-height:44px}.ss-season{font-size:13px;margin:8px 0}.ss-season summary{cursor:pointer;min-height:36px;align-content:center}.ss-season form{margin:8px 0}.ss-caption{font-size:13px;color:#52627a;margin:8px 0}.ss-status:empty{display:none}.ss-issues{background:#fff8e8;border:1px solid #e7c684;border-radius:7px;padding:8px 12px;margin:12px 0}.ss-issues summary{cursor:pointer;min-height:36px;align-content:center;font-weight:600}.ss-issue{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #e7d5b3}.ss-issue small{display:block}.ss-row{border-top:1px solid #e1e7ee}.ss-row summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;min-height:64px;cursor:pointer;list-style:none;padding:10px 2px}.ss-row summary::-webkit-details-marker{display:none}.ss-row summary:focus-visible{outline:2px solid #17245f;outline-offset:2px}.ss-name{font-weight:650;overflow-wrap:anywhere}.ss-name small{display:block;font-weight:400;font-size:12px;color:#52627a;margin-top:3px}.ss-values{text-align:right;font-size:13px;white-space:nowrap}.ss-values strong{display:block;font-size:17px}.ss-values small{display:block;margin-top:4px}.ss-row summary .ss-name:before{content:'▸ ';color:#52627a}.ss-row[open] summary .ss-name:before{content:'▾ '}.ss-detail{padding:0 2px 12px}.ss-metrics{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;margin:0 0 12px}.ss-metrics dt{color:#52627a}.ss-metrics dd{margin:2px 0 0;font-weight:600}.ss-match{display:flex;justify-content:space-between;align-items:start;gap:12px;padding:8px 0;border-top:1px solid #edf0f5;font-size:13px}.ss-match small{display:block;color:#52627a;margin-top:3px}.ss-match-score{text-align:right;flex-shrink:0}.ss-search{max-width:280px}.ss-empty{margin:16px 0}.ss-refresh{margin-left:auto}@media(max-width:480px){.season-stats{padding:12px}.ss-filters{gap:8px}.ss-filters label{min-width:110px}.ss-search{max-width:none}.ss-values{font-size:12px}.ss-values strong{font-size:16px}.ss-row summary{gap:6px}.ss-match{gap:8px}}
</style>`;

export function renderGradeComparison(summary, first, second, roster) {
  const rows = compareSelectedGrades(summary, first, second, roster);
  if (!rows.length) return '<p class="ss-empty">Choose two teams in the same competition and format.</p>';
  const cell = players => players.length ? players.map(player => `<div><strong>${escape(player.name)}</strong>${player.day ? `<small>Day ${player.day}</small>` : ''}${player.stats ? `<span>${numeric(player.stats.average)} average</span><small>${player.stats.batting_complete === false ? 'Figures incomplete' : player.stats.runs + ' runs · ' + player.stats.innings + ' inns' + (player.stats.not_outs ? ' · ' + player.stats.not_outs + ' not out' : '')}</small>` : '<small>No linked season figures</small>'}</div>`).join('') : '<small>Vacant</small>';
  return `<style>.ss-compare{margin:12px 0}.ss-compare-row{display:grid;grid-template-columns:20px minmax(0,1fr) minmax(0,1fr);gap:10px;border-top:1px solid #e1e7ee;padding:10px 0;align-items:start}.ss-compare-cell{min-width:0;overflow-wrap:anywhere}.ss-compare-cell strong,.ss-compare-cell span,.ss-compare-cell small{display:block}.ss-compare-cell strong{font-size:14px}.ss-compare-cell span{margin-top:5px;font-size:14px}.ss-compare-cell small{font-size:12px;color:#52627a;margin:3px 0}.ss-compare-cell>div+div{border-top:1px dashed #dbe3ed;margin-top:8px;padding-top:8px}.ss-position{font-size:12px;color:#52627a;padding-top:2px}.ss-compare-head{font-weight:700}.ss-compare-controls{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.ss-compare-controls label{flex:1;min-width:110px}.ss-compare-controls select{width:100%}</style><p class="ss-caption">Selected batting order · season figures in each grade. Averages are not adjusted for grade strength.</p><div class="ss-compare" role="table" aria-label="Selected batting orders and season figures"><div class="ss-compare-row ss-compare-head" role="row"><span role="columnheader">#</span><span role="columnheader">${escape(first.grade)}</span><span role="columnheader">${escape(second.grade)}</span></div>${rows.map(row => `<div class="ss-compare-row" role="row"><span class="ss-position" role="rowheader">${row.position}</span><div class="ss-compare-cell" role="cell">${cell(row.first)}</div><div class="ss-compare-cell" role="cell">${cell(row.second)}</div></div>`).join('')}</div>`;
}

export function renderStatsRows(rows, mode = 'batting') {
  const metric = (label, value) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`;
  return rows.map(row => {
    const batting = mode === 'batting', incomplete = (batting ? row.batting_complete : row.bowling_complete) === false;
    const high = row.high_score ? row.high_score.runs + (row.high_score.not_out ? '*' : '') : '—';
    const best = row.best_bowling ? row.best_bowling.wickets + '/' + row.best_bowling.runs : '—';
    const metrics = batting
      ? [['Matches',row.matches],['Innings',row.innings],['Not out',row.not_outs],['High score',high],['Strike rate',numeric(row.strike_rate)],['50s',row.fifties],['100s',row.hundreds],['Ducks',row.ducks]]
      : [['Matches',row.matches],['Innings bowled',row.bowling_innings],['Overs',statsOvers(row.bowling_balls) ?? '—'],['Runs conceded',row.conceded],['Average',numeric(row.bowling_average)],['Strike rate',numeric(row.bowling_strike_rate)],['Best',best],['5 wickets',row.five_wickets]];
    return `<details class="ss-row" data-stats-player="${escape(row.id)}"><summary><span class="ss-name">${escape(row.name)}<small>${escape(row.grade)}${row.competition ? ' · ' + escape(row.competition) : ''}</small></span><span class="ss-values"><strong>${batting ? row.runs + ' runs' : row.wickets + ' wickets'}${incomplete ? ' recorded' : ''}</strong>${batting ? numeric(row.average) + ' average · ' + row.innings + ' inns' : numeric(row.economy) + ' economy · ' + (statsOvers(row.bowling_balls) ?? '—') + ' overs'}${incomplete ? '<small>Figures incomplete</small>' : ''}</span></summary><div class="ss-detail"><dl class="ss-metrics">${metrics.map(([label,value]) => metric(label, value)).join('')}</dl>${row.history.map(match => {
      const scores = batting ? match.batting.map(x => x.dnb ? 'DNB' : x.runs + (x.not_out ? '*' : '') + (x.balls === null ? '' : ' (' + x.balls + ')')) : match.bowling.map(x => x.wickets + '/' + x.runs + (x.balls === null ? '' : ' · ' + statsOvers(x.balls) + ' ov'));
      if (batting ? match.batting_incomplete : match.bowling_incomplete) scores.push('Figures incomplete');
      const score = scores.join(' & ') || (batting ? match.batting_available ? 'DNB' : 'Batting unavailable' : match.bowling_available ? 'Did not bowl' : 'Bowling unavailable');
      const url = link(match.url);
      return `<div class="ss-match"><span>${escape(date(match.date))} · v ${escape(match.opposition)}${url ? `<small><a href="${escape(url)}" target="_blank" rel="noopener">Scorecard</a></small>` : ''}</span><span class="ss-match-score">${escape(score)}</span></div>`;
    }).join('')}</div></details>`;
  }).join('');
}

export function createSeasonStatsPanel(h) {
  let active = null;
  const here = s => active === s && s.host.isConnected && h.here(s);
  function canLeave() {
    const s = active;
    if (!s || !here(s)) return true;
    if (s.busy && s.savingSeason) {h.alert?.('Please wait for the season dates to save.'); return false;}
    const draft = s.state.seasonDraft;
    if (draft && (draft.start !== s.context?.season.start || draft.end !== s.context?.season.end) && !h.confirm?.('Leave these unsaved season dates?')) return false;
    delete s.state.seasonDraft;
    return true;
  }
  async function request(s, action = 'context', data = {}) {
    const result = await h.supabase.rpc('club_season_stats_api', {p_club_id:s.clubId, p_action:action, p_data:data});
    if (result.error) throw Error(result.error.message);
    if (!Array.isArray(result.data?.cards) || !Array.isArray(result.data?.fixtures) || !result.data?.season?.start) throw Error('Season stats could not be loaded.');
    return result.data;
  }
  function draw(s) {
    if (!here(s)) return;
    const state = s.state, data = s.context, totals = data ? buildSeasonStats(data, state) : null;
    const open = new Set([...s.host.querySelectorAll('[data-stats-player][open]')].map(el => el.dataset.statsPlayer));
    const disabled = s.busy ? 'disabled' : '';
    const teams = (s.teams || []).filter(t => !t.cancelled).sort((a,b) => (a.level ?? 999) - (b.level ?? 999) || a.grade.localeCompare(b.grade, undefined, {numeric:true}));
    const primary = teams.find(t => t.id === state.firstTeam) || teams.find(t => t.format === state.format) || teams[0];
    const lower = primary ? teams.filter(t => t.id !== primary.id && t.competition === primary.competition && t.format === primary.format) : [];
    const secondary = lower.find(t => t.id === state.secondTeam) || lower.find(t => t.level > primary?.level) || lower[0];
    if (primary) state.firstTeam = primary.id;
    if (secondary) state.secondTeam = secondary.id;
    if (!lower.length) state.compare = false;
    s.host.innerHTML = css + `<section class="season-stats" aria-label="Season stats"><div class="ss-top"><h2 tabindex="-1">Season stats</h2><button type="button" class="btn ghost" data-stats-close>Close stats</button></div>${data ? `
      ${data.can_set_season ? `<details class="ss-season" ${state.seasonDraft ? 'open' : ''}><summary>${escape(data.season.label)} · ${escape(date(data.season.start))}–${escape(date(data.season.end))}</summary><form data-stats-season><label>Starts<input type="date" name="start" value="${escape(state.seasonDraft?.start ?? data.season.start)}" required ${disabled}></label><label>Ends<input type="date" name="end" value="${escape(state.seasonDraft?.end ?? data.season.end)}" required ${disabled}></label><button type="submit" class="btn secondary" ${disabled}>${s.savingSeason ? 'Saving…' : 'Save season dates'}</button></form></details>` : `<p class="ss-caption">${escape(data.season.label)} · ${escape(date(data.season.start))}–${escape(date(data.season.end))}</p>`}
      ${!state.compare ? `<div class="ss-filters">${totals.groups.length > 1 ? `<label>Grade<select data-stats-filter="grade" ${disabled}><option value="">All grades</option>${totals.groups.map(g => `<option value="${escape(g.id)}" ${state.grade === g.id ? 'selected' : ''}>${escape(g.grade)}${totals.groups.some(other => other.id !== g.id && other.grade === g.grade) ? ' · ' + escape(g.competition || 'Competition unknown') : ''}</option>`).join('')}</select></label>` : ''}${totals.formats.length > 1 ? `<label>Format<select data-stats-filter="format" ${disabled}>${totals.formats.map(f => `<option value="${escape(f)}" ${state.format === f ? 'selected' : ''}>${escape(STATS_FORMATS[f] || f)}</option>`).join('')}</select></label>` : ''}</div>` : ''}
      <div class="ss-modes" aria-label="Statistics type"><button class="btn ghost" type="button" data-stats-mode="batting" aria-pressed="${state.mode !== 'bowling' && !state.compare}">Batting</button><button class="btn ghost" type="button" data-stats-mode="bowling" aria-pressed="${state.mode === 'bowling' && !state.compare}">Bowling</button>${lower.length ? `<button class="btn ghost" type="button" data-stats-compare aria-pressed="${!!state.compare}">Compare grades</button>` : ''}<button class="btn ghost ss-refresh" type="button" data-stats-refresh ${disabled}>${s.busy ? 'Updating…' : 'Update totals'}</button></div>
      <p class="ss-caption">${totals.included} completed ${totals.included === 1 ? 'scorecard' : 'scorecards'} · ${escape(STATS_FORMATS[state.format] || 'Current season')}${totals.playing ? ' · ' + totals.playing + ' in progress' : ''}</p>
      ${totals.issues.length ? `<details class="ss-issues"><summary>${totals.issues.length} ${totals.issues.length === 1 ? 'match needs' : 'matches need'} attention</summary>${totals.issues.map(issue => `<div class="ss-issue"><span>${escape(issue.grade)} · ${escape(date(issue.date))}<small>${escape(issue.messages.join(' · '))}</small></span>${issue.fixture_id ? `<button type="button" class="btn ghost" data-stats-fixture="${escape(issue.fixture_id)}">Fixture details</button>` : link(issue.url) ? `<a href="${escape(link(issue.url))}" target="_blank" rel="noopener">Scorecard</a>` : ''}</div>`).join('')}</details>` : ''}
      ${state.compare ? `<div class="ss-compare-controls"><label>Team<select data-stats-team="firstTeam">${teams.map(t => `<option value="${escape(t.id)}" ${t.id === primary.id ? 'selected' : ''}>${escape(t.grade)} · ${escape(t.competition)}</option>`).join('')}</select></label><label>Compare with<select data-stats-team="secondTeam">${lower.map(t => `<option value="${escape(t.id)}" ${t.id === secondary?.id ? 'selected' : ''}>${escape(t.grade)}</option>`).join('')}</select></label></div>${renderGradeComparison(buildSeasonStats(data), primary, secondary, s.roster)}` : `${totals.rows.length > 12 ? `<label class="ss-search">Find player<input type="search" data-stats-search value="${escape(state.search || '')}"></label>` : ''}<div data-stats-rows></div>`}` : ''}<p class="ss-status" role="${s.error ? 'alert' : 'status'}" aria-live="polite">${escape(s.message)}</p>${!data && !s.busy ? '<button class="btn" type="button" data-stats-refresh>Try again</button>' : ''}</section>`;
    if (totals && !state.compare) renderRows(s, totals, open);
    s.host.querySelector('[data-stats-close]').onclick = () => {if (canLeave()) h.close(s);};
    s.host.querySelector('[data-stats-refresh]')?.addEventListener('click', () => {if (canLeave()) void load(s);});
    s.host.querySelectorAll('[data-stats-filter]').forEach(el => el.onchange = () => {state[el.dataset.statsFilter] = el.value; draw(s); h.navigate?.();});
    s.host.querySelectorAll('[data-stats-mode]').forEach(el => el.onclick = () => {state.mode = el.dataset.statsMode; state.compare = false; draw(s); h.navigate?.();});
    s.host.querySelector('[data-stats-compare]')?.addEventListener('click', () => {state.compare = !state.compare; state.mode = 'batting'; state.grade = ''; state.format = primary.format; draw(s); h.navigate?.();});
    s.host.querySelectorAll('[data-stats-team]').forEach(el => el.onchange = () => {state[el.dataset.statsTeam] = el.value; if (el.dataset.statsTeam === 'firstTeam') {state.secondTeam = ''; state.format = teams.find(t => t.id === el.value)?.format || state.format;} draw(s); h.navigate?.();});
    s.host.querySelector('[data-stats-search]')?.addEventListener('input', e => {state.search = e.target.value; renderRows(s, totals, open);});
    s.host.querySelectorAll('[data-stats-fixture]').forEach(el => el.onclick = () => {if (canLeave()) h.openFixture(s, el.dataset.statsFixture);});
    s.host.querySelectorAll('[data-stats-season] input').forEach(el => el.addEventListener('input', () => {
      const form = el.closest('form'); state.seasonDraft = {start:form.querySelector('[name=start]').value, end:form.querySelector('[name=end]').value};
    }));
    s.host.querySelector('[data-stats-season]')?.addEventListener('submit', e => {
      e.preventDefault(); if (s.busy) return;
      const form = e.currentTarget, start = form.elements.start.value, end = form.elements.end.value;
      if (end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) {s.message = 'Choose season dates in order, up to one year apart.'; s.error = true; draw(s); return;}
      void load(s, {start, end, expected_revision:data.season.revision});
    });
  }
  function renderRows(s, totals, open = new Set()) {
    const state = s.state, bowling = state.mode === 'bowling';
    const rows = totals.rows.filter(row => (!bowling || row.bowling_innings > 0 || row.bowling_complete === false) && (!state.search || row.name.toLowerCase().includes(state.search.trim().toLowerCase())))
      .sort((a,b) => bowling ? b.wickets - a.wickets || (a.bowling_average ?? Infinity) - (b.bowling_average ?? Infinity) || a.name.localeCompare(b.name) : b.runs - a.runs || b.innings - a.innings || a.name.localeCompare(b.name));
    const host = s.host.querySelector('[data-stats-rows]'); if (!host) return;
    host.innerHTML = rows.length ? renderStatsRows(rows, state.mode) : `<p class="ss-empty">${state.search ? 'No matching players.' : bowling ? 'No bowling figures in the loaded scorecards.' : 'No completed scorecards in this season yet. Add scores in Fixture details or Match Review.'}</p>`;
    host.querySelectorAll('[data-stats-player]').forEach(el => {el.open = open.has(el.dataset.statsPlayer);});
  }
  async function load(s, settings = null) {
    if (s.busy || !here(s)) return;
    s.busy = true; s.savingSeason = !!settings; s.error = false; s.message = settings ? 'Saving season dates…' : 'Loading latest saved scores…'; draw(s);
    try {
      const data = await request(s, settings ? 'set_season' : 'context', settings || {});
      if (!here(s)) return;
      s.context = data;
      if (settings) delete s.state.seasonDraft;
      const all = buildSeasonStats(data);
      if (!all.groups.some(g => g.id === s.state.grade)) s.state.grade = '';
      if (!all.formats.includes(s.state.format)) s.state.format = all.formats.includes(s.preferredFormat) ? s.preferredFormat : all.formats.includes('limited_overs') ? 'limited_overs' : all.formats[0] || 'limited_overs';
      s.message = settings ? 'Season dates saved.' : '';
    } catch (error) {if (here(s)) {s.error = true; s.message = error.message || 'Season stats could not be loaded.';}}
    finally {s.busy = false; s.savingSeason = false; draw(s);}
  }
  return {canLeave, mount(host, options) {
    if (active?.host === host && active.scope === options.scope) {Object.assign(active,options); draw(active); return active;}
    const s = {...options, host, state:options.state || {}, context:null, busy:false, message:'', error:false}; active = s; void load(s); return s;
  }};
}
