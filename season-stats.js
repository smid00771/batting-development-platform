/* Read-only current-season projection of the shared scorecards.
 * Rebuild from the latest snapshot: imports and corrections never increment totals.
 * Player identity is source-ID based; only confirmed links join two identities.
 */
const key = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const number = value => Number.isInteger(value) && value >= 0;
const dates = fixture => (fixture.days || []).map(day => typeof day === 'string' ? day : day.date).filter(Boolean).sort();
const inSeason = (date, season) => !!date && date >= season.start && date <= season.end;
const groupKey = (competition, grade) => JSON.stringify([String(competition || '').trim(), String(grade || '').trim()]);
export const STATS_FORMATS = {limited_overs:'Limited overs', t20:'T20', long_form:'Long form', unknown:'Format unknown'};
export const statsFormat = value => ({limitedovers:'limited_overs',limitedover:'limited_overs',oneday:'limited_overs',
  longform:'long_form',twoday:'long_form',multiday:'long_form',test:'long_form',t20:'t20',twenty20:'t20'})[key(value)] || 'unknown';
export const statsOvers = balls => number(balls) ? `${Math.floor(balls / 6)}.${balls % 6}` : null;
export const statsRate = (numerator, denominator, factor = 1) => number(numerator) && denominator > 0 ? numerator * factor / denominator : null;

// Imported and older manual fixtures can omit the competition label. Prefer
// their explicit PlayHQ season/grade link; one source grade can play several
// formats. Unlinked fixtures require the same club grade ID, season and format.
// This is a read-only stats projection; dates, line-ups and saved fixtures stay
// untouched. A same-named grade, another season or conflicting labels cannot
// establish the link.
export function resolveSelectionStatsTeams(teams = [], season = {}, references = teams) {
  const competitions = new Map(), sourceLabels = new Map(), localSources = new Map();
  const valid = team => inSeason(dates(team)[0],season) && !team.cancelled && statsFormat(team.format) !== 'unknown';
  const scope = team => valid(team) && team.grade_group_id ? JSON.stringify([team.grade_group_id,statsFormat(team.format)]) : null;
  const source = team => valid(team) && team.playhq_season_id && team.playhq_grade_id
    ? JSON.stringify([team.playhq_season_id,team.playhq_grade_id]) : null;
  const label = team => String(team.competition || '').trim();
  const add = (map,id,value) => { if (id && value) { if (!map.has(id)) map.set(id,new Set()); map.get(id).add(value); } };
  const linked = new Map(references.filter(t=>t.id && source(t)).map(t=>[t.id,t]));
  const withSource = team => {
    const saved = linked.get(team.id);
    return !team.playhq_grade_id && saved && saved.grade_group_id === team.grade_group_id
      ? {...team,playhq_season_id:saved.playhq_season_id,playhq_grade_id:saved.playhq_grade_id} : team;
  };
  const published = team => team.published?.details && {...team.published.details,
    playhq_season_id:team.playhq_season_id,playhq_grade_id:team.playhq_grade_id};
  const refs = references.flatMap(f => { const team=withSource(f); return [team,published(team)].filter(Boolean); });
  for (const team of refs) {
    add(sourceLabels,source(team),label(team));
    add(localSources,scope(team),source(team));
  }
  const fromSource = team => {
    const labels = sourceLabels.get(source(team));
    return !label(team) && labels?.size === 1 ? {...team,competition:[...labels][0]} : team;
  };
  for (const team of refs.map(fromSource)) add(competitions,scope(team),label(team));
  const resolve = team => {
    team=fromSource(team);
    if (label(team)) return team;
    const id=source(team), sources=localSources.get(scope(team));
    if (sourceLabels.get(id)?.size > 1 || (sources && (id ? [...sources].some(s=>s!==id) : sources.size > 1))) return team;
    const labels = competitions.get(scope(team));
    return labels?.size === 1 ? {...team,competition:[...labels][0]} : team;
  };
  return teams.map(team => {
    team=withSource(team);
    const resolved = resolve(team);
    if (!team.published?.details) return resolved;
    const details = resolve(published(team));
    return {...resolved,published:{...team.published,details}};
  });
}

export function latestStatsCards(cards = []) {
  const latest = new Map();
  for (const card of cards) {
    const id = card.scorecard?.match_id;
    if (!id || card.scorecard.provider && !['playcricket_au','playhq_au'].includes(card.scorecard.provider)) continue;
    const previous = latest.get(id);
    const order = value => `${value.fetched_at || ''}:${value.snapshot_id || ''}`;
    if (!previous || order(card) > order(previous)) latest.set(id, card);
  }
  return [...latest.values()];
}

// These positions describe the current selection, never an inferred historical
// batting position. Each figure remains specific to its competition/grade/format.
export function compareSelectedGrades(summary, first, second, roster = []) {
  if (!first || !second || first.id === second.id || first.competition !== second.competition || first.format !== second.format) return [];
  const players = new Map(roster.map(p => [p.id, p]));
  const cell = (team, slot = {}) => [...new Set([slot.d1, slot.d2].filter(Boolean))].map(id => {
    const player = players.get(id), stats = summary.rows.find(row => row.roster_id === id && row.group === groupKey(team.competition, team.grade) && row.format === team.format);
    return {id, name:player?.name || stats?.name || 'Player', stats:stats || null,
      day:slot.d1 && slot.d2 && slot.d1 !== slot.d2 ? slot.d1 === id ? 1 : 2 : null};
  });
  return Array.from({length:Math.max(first.slots?.length || 0,second.slots?.length || 0)}, (_, index) => ({position:index+1, first:cell(first, first.slots?.[index]), second:cell(second, second.slots?.[index])}));
}

// A season comparison includes every recorded appearance, even after a grade
// move. Lists are alphabetical; their row numbers are never batting positions.
export function compareSeasonGrades(summary, first, second, roster = []) {
  if (!first || !second || first.grade === second.grade || first.competition !== second.competition || first.format !== second.format) return [];
  const players = new Map(roster.map(p => [p.id,p]));
  const list = team => summary.rows.filter(row => row.group === groupKey(team.competition,team.grade) && row.format === team.format)
    .map(stats => ({id:stats.roster_id || stats.id,name:players.get(stats.roster_id)?.name || stats.name,stats,day:null}))
    .sort((a,b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const a=list(first),b=list(second);
  return Array.from({length:Math.max(a.length,b.length)},(_,index)=>({position:null,first:a[index]?[a[index]]:[],second:b[index]?[b[index]]:[]}));
}

export function buildSeasonStats(context = {}, filters = {}) {
  const season = context.season || {}, today = context.today || season.end;
  const fixtures = resolveSelectionStatsTeams(context.fixtures || [],season).filter(f => inSeason(dates(f)[0], season)).map(f => ({...f,format:statsFormat(f.format)}));
  const cards = latestStatsCards(context.cards), identities = new Map((context.identities || []).map(x => [x.source_id, x]));
  const rows = new Map(), issues = new Map(), groups = new Map(), formats = new Set(), matched = new Set();
  let included = 0, playing = 0;
  const matchesFilters = (group, format) => (!filters.grade || filters.grade === group)
    && (!Array.isArray(filters.groups) || filters.groups.includes(group))
    && (!filters.format || filters.format === format);
  const problem = (id, message, fixture, card, grade, competition, format, requiresAttention = true) => {
    const group = groupKey(competition, grade);
    if (!matchesFilters(group, format)) return;
    const old = issues.get(id);
    if (old) { if (!old.messages.includes(message)) old.messages.push(message); old.requires_attention ||= requiresAttention; return; }
    issues.set(id, {id, messages:[message], requires_attention:requiresAttention, fixture_id:fixture?.id || null, grade:grade || 'Match', competition:competition || '', date:dates(fixture || {})[0] || card?.dates?.[0], url:card?.url || null});
  };
  const observeGroup = (competition, grade, format) => {
    const id = groupKey(competition, grade);
    groups.set(id, {id, grade:grade || 'Grade unknown', competition:competition || ''});
    formats.add(format || 'unknown');
    return id;
  };
  for (const fixture of fixtures) observeGroup(fixture.competition, fixture.grade, fixture.format);

  for (const wrapped of cards) {
    const card = wrapped.scorecard, date = [...(card.dates || [])].sort()[0];
    if (!inSeason(date, season)) continue;
    let fixture = fixtures.find(f => f.id === wrapped.fixture_id);
    if (!fixture) {
      const linked = fixtures.filter(f => f.match_id === card.match_id);
      if (linked.length === 1) fixture = linked[0];
      else if (linked.length > 1) {
        problem(card.match_id, 'Match linked to more than one fixture', null, card, card.grade, '', card.format_key || 'unknown');
        continue;
      }
    }
    if (!fixture) {
      const candidates = fixtures.filter(f => dates(f)[0] === date && (!card.format_key || f.format === statsFormat(card.format_key)) && (!card.competition || key(f.competition) === key(card.competition)) && key(f.grade) === key(wrapped.grade_hint || card.grade));
      if (candidates.length === 1) fixture = candidates[0];
      else if (candidates.length > 1) {
        problem(card.match_id, 'Match this scorecard to its fixture', null, card, card.grade, '', card.format_key || 'unknown');
        continue;
      }
    }
    // A replaced fixture link must not leave its old scorecard in season totals.
    if (fixture?.match_id && fixture.match_id !== card.match_id) continue;
    if (fixture) matched.add(fixture.id);
    if (fixture?.no_play || fixture?.cancelled) continue;
    const grade = fixture?.grade || wrapped.grade_hint || card.grade || 'Grade unknown';
    const competition = fixture?.competition || card.competition || '';
    const format = statsFormat(card.format_key || fixture?.format);
    const group = observeGroup(competition, grade, format);
    if (!matchesFilters(group, format)) continue;
    const issue = (message, requiresAttention = true) => problem(card.match_id, message, fixture, card, grade, competition, format, requiresAttention);
    if (card.status !== 'completed') { playing++; if (date < today) issue('Scores still in progress'); continue; }
    if (date > today) { issue('Check the match date'); continue; }
    const team = card.teams?.find(t => t.id === wrapped.our_team);
    if (!team) { issue('Choose our team'); continue; }
    const playerKey = source => {
      const link = identities.get(source);
      return link?.roster_id ? 'roster:' + link.roster_id : link?.player_id ? 'player:' + link.player_id : (card.provider==='playhq_au'?'playhq:':'playcricket:') + source;
    };
    const observed = new Map();
    for (const player of team.players || []) if (player.player_id) observed.set(player.player_id, player);
    for (const innings of card.innings || []) {
      for (const player of innings.team_id === team.id ? innings.batters || [] : innings.bowlers || []) {
        if (player.player_id && (innings.team_id === team.id || player.team_id === team.id)) observed.set(player.player_id, player);
      }
    }
    const unlinked = card.provider === 'playhq_au' ? [...observed.keys()].filter(source => !identities.get(source)?.roster_id && !identities.get(source)?.player_id).length : 0;
    if (unlinked) issue(`Link ${unlinked} scorecard player${unlinked === 1 ? '' : 's'} to update their season totals`);
    const seenIdentity = new Map(), conflicts = new Set();
    for (const source of observed.keys()) {
      const id = playerKey(source);
      if (seenIdentity.has(id) && seenIdentity.get(id) !== source || identities.get(source)?.conflict) conflicts.add(id);
      seenIdentity.set(id, source);
    }
    if (conflicts.size) issue('Check player identity links');
    const matchRows = new Map();
    const rowFor = player => {
      if (!player?.player_id) return null;
      const person = playerKey(player.player_id);
      if (conflicts.has(person)) return null;
      const id = JSON.stringify([person, group, format]);
      let row = rows.get(id);
      if (!row) {
        row = {id, person_id:person, roster_id:identities.get(player.player_id)?.roster_id || null,
          name:identities.get(player.player_id)?.name || player.name || 'Player', grade, competition, group, format,
          matches:0, innings:0, runs:0, not_outs:0, dismissals:0, balls:0, fours:0, sixes:0,
          fifties:0, hundreds:0, ducks:0, high_score:null, bowling_innings:0, wickets:0, conceded:0,
          bowling_balls:0, maidens:0, five_wickets:0, best_bowling:null, batting_complete:true, bowling_complete:true, history:[]};
        rows.set(id, row);
      }
      if (!matchRows.has(id)) {
        const match = {match_id:card.match_id, date, opposition:fixture?.opposition || card.teams.find(t => t.id !== team.id)?.name || '',
          url:card.url || null, fixture_id:fixture?.id || null, batting:[], bowling:[], batting_available:false, bowling_available:false, batting_incomplete:false, bowling_incomplete:false};
        row.matches++; row.history.push(match); matchRows.set(id, match);
      }
      return [row, matchRows.get(id)];
    };
    // Scorecard lineups, not selected teams, establish appearances (including DNB).
    if (team.lineup_available) for (const player of team.players || []) rowFor(player);
    const seenInnings = new Set();
    let usable = false;
    for (const innings of card.innings || []) {
      if (!innings.id || seenInnings.has(innings.id)) { issue('Check repeated or missing innings'); continue; }
      seenInnings.add(innings.id);
      if (!innings.complete) {
        issue('Scores incomplete');
        for (const [id,match] of matchRows) {
          const type = innings.team_id === team.id ? 'batting' : 'bowling';
          match[type + '_incomplete'] = true; rows.get(id)[type + '_complete'] = false;
        }
        continue;
      }
      usable = true;
      const batting = innings.team_id === team.id;
      if (!batting && !innings.bowling_available) {
        issue('Bowling figures missing');
        for (const [id,match] of matchRows) {match.bowling_incomplete = true; rows.get(id).bowling_complete = false;}
      }
      const people = batting ? innings.batters || [] : innings.bowlers || [], seen = new Set();
      for (const player of people) {
        if (!player.player_id || seen.has(player.player_id)) {
          const withheld = card.provider === 'playhq_au' && !player.player_id && !player.name;
          issue(withheld ? 'PlayCricket has withheld some player details; those figures cannot be assigned' : 'Check repeated or missing player IDs', !withheld);
          continue;
        }
        seen.add(player.player_id);
        if (!batting && player.team_id !== team.id) { issue('Check the bowling team'); continue; }
        const target = rowFor(player);
        if (!target) continue;
        const [row, match] = target;
        if (batting) {
          if (player.status === 'did_not_bat') { match.batting_available = true; match.batting.push({innings:innings.number, dnb:true}); continue; }
          if (!player.importable || !number(player.runs) || typeof player.not_out !== 'boolean') { issue('Batting figures incomplete'); match.batting_incomplete = true; row.batting_complete = false; continue; }
          match.batting_available = true;
          const performance = {innings:innings.number, runs:player.runs, not_out:player.not_out, balls:number(player.balls) ? player.balls : null, dismissal:player.dismissal_text || player.dismissal || ''};
          row.innings++; row.runs += player.runs; row.not_outs += +player.not_out; row.dismissals += +!player.not_out;
          for (const field of ['balls','fours','sixes']) row[field] = row[field] === null || !number(player[field]) ? null : row[field] + player[field];
          row.fifties += +(player.runs >= 50 && player.runs < 100); row.hundreds += +(player.runs >= 100); row.ducks += +(player.runs === 0 && !player.not_out);
          if (!row.high_score || player.runs > row.high_score.runs || player.runs === row.high_score.runs && player.not_out) row.high_score = {runs:player.runs, not_out:player.not_out};
          match.batting.push(performance);
        } else {
          if (!player.importable || !number(player.wickets) || !number(player.runs)) { issue('Bowling figures incomplete'); match.bowling_incomplete = true; row.bowling_complete = false; continue; }
          match.bowling_available = true;
          const performance = {innings:innings.number, wickets:player.wickets, runs:player.runs, balls:number(player.balls) ? player.balls : null};
          row.bowling_innings++; row.wickets += player.wickets; row.conceded += player.runs;
          row.bowling_balls = row.bowling_balls === null || !number(player.balls) ? null : row.bowling_balls + player.balls;
          row.maidens = row.maidens === null || !number(player.maidens) ? null : row.maidens + player.maidens;
          row.five_wickets += +(player.wickets >= 5);
          if (!row.best_bowling || player.wickets > row.best_bowling.wickets || player.wickets === row.best_bowling.wickets && player.runs < row.best_bowling.runs) row.best_bowling = {wickets:player.wickets, runs:player.runs};
          match.bowling.push(performance);
        }
      }
      for (const match of matchRows.values()) {
        if (batting && Array.isArray(innings.batters)) match.batting_available ||= seen.size > 0;
        if (!batting && innings.bowling_available) match.bowling_available = true;
      }
    }
    if (usable) included++; else issue('Scores incomplete');
  }
  for (const fixture of fixtures) {
    if (matched.has(fixture.id) || fixture.cancelled || fixture.no_play || dates(fixture).at(-1) >= today) continue;
    problem(fixture.id, 'Scorecard missing', fixture, null, fixture.grade, fixture.competition, fixture.format || 'unknown');
  }
  const result = [...rows.values()].map(row => ({...row,
    average:row.batting_complete ? statsRate(row.runs, row.dismissals) : null, strike_rate:row.batting_complete ? statsRate(row.runs, row.balls, 100) : null,
    bowling_average:row.bowling_complete && row.bowling_innings ? statsRate(row.conceded, row.wickets) : null,
    bowling_strike_rate:row.bowling_complete && row.bowling_innings ? statsRate(row.bowling_balls, row.wickets) : null,
    economy:row.bowling_complete && row.bowling_innings ? statsRate(row.conceded, row.bowling_balls, 6) : null,
    history:row.history.sort((a,b) => b.date.localeCompare(a.date) || a.match_id.localeCompare(b.match_id))
  }));
  return {rows:result, groups:[...groups.values()].sort((a,b) => a.grade.localeCompare(b.grade, undefined, {numeric:true}) || a.competition.localeCompare(b.competition)), formats:[...formats], issues:[...issues.values()], included, playing, season};
}
