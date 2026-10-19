import {NDCA_BENCHMARKS} from './ndca-grade-benchmarks.js?v=0.8.62.215';
export {NDCA_BENCHMARKS};
/* Rough selection guides, not forecasts or automatic team changes.
 * Historical parameters: NDCA 2021/22–2025/26, same player/club/season
 * in adjacent grades. Only aggregate parameters belong in this repository.
 * Batting uses runs per dismissal; bowling uses wickets/100 balls and economy.
 */
export const NDCA_GUIDE = Object.freeze({
  version:'2026-10-18.1', seasons:'2021/22–2025/26',
  pairs:Object.freeze({
    1:Object.freeze({batting:0.5, wickets:0.78, economy:1.25}),
    2:Object.freeze({batting:2/3, wickets:0.78, economy:1.2}),
    3:Object.freeze({batting:0.5, wickets:0.88, economy:1.2})
  })
});
const normal = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const ndca = value => ['ndca','newcastledistrictcricketassociation','newcastledistrictcricketassociationinc'].includes(normal(value));
export function evidenceGrade(value) {
  const grade = normal(value).replace(/^ndca/,'').replace(/ndca$/,'').replace(/gradecompetition$|grade$/,'');
  return ({'1':1,'1st':1,first:1,'2':2,'2nd':2,second:2,'3':3,'3rd':3,third:3,'4':4,'4th':4,fourth:4})[grade] || null;
}
export function gradeGuide(first, second) {
  if (!first || !second || first.competition !== second.competition || !ndca(first.competition)
    || first.format !== second.format || !['t20','limited_overs','long_form'].includes(first.format)) return null;
  const a = evidenceGrade(first.grade), b = evidenceGrade(second.grade);
  if (!a || !b || Math.abs(a-b) !== 1) return null;
  return {higher:a < b ? first : second, lower:a < b ? second : first, ...NDCA_GUIDE.pairs[Math.min(a,b)]};
}
const role = person => ['top','middle','lower'].includes(person?.batting) ? person.batting : null;
const bowler = person => ['pace','spin'].includes(person?.bowling);
const bowlingRole = person => bowler(person) && ['frontline','part_time'].includes(person.bowling_load) ? person.bowling + ':' + person.bowling_load : null;
export const battingRoleLabel = person => ({top:'Top order',middle:'Middle order',lower:'Lower order'})[person?.batting] || 'Batting role not set';
export const bowlingRoleLabel = person => bowler(person) ? (person.bowling === 'pace' ? 'Quick' : 'Spinner') + (person.bowling_load === 'frontline' ? ' · frontline' : person.bowling_load === 'part_time' ? ' · part time' : ' · workload not set') : person?.bowling === 'none' ? 'Does not bowl' : 'Bowling role not set';
const integer = value => Number.isInteger(value) && value >= 0;
export function battingEvidence(row) {
  if (!row || row.batting_complete === false) return {ready:false,reason:row ? 'Batting figures incomplete' : 'No linked season figures'};
  if (![row.runs,row.innings,row.not_outs].every(integer) || row.not_outs > row.innings) return {ready:false,reason:'Check batting figures'};
  const dismissals=row.innings-row.not_outs, average=dismissals ? row.runs/dismissals : null;
  // A positive early flag may use two innings. With fewer than two
  // dismissals, runs per innings is a conservative floor, not a replacement
  // for the player's actual average. Full comparisons retain the old gate.
  const positiveUsesInnings=dismissals < 2;
  const positiveAverage=row.innings >= 2 ? positiveUsesInnings ? row.runs/row.innings : average : null;
  return {average,dismissals,positiveAverage,positiveUsesInnings,ready:row.innings >= 3 && dismissals >= 2,
    reason:!row.innings ? 'Yet to bat' : row.innings < 2 ? 'Building a record · 2 innings needed for an early flag'
      : row.innings < 3 || dismissals < 2 ? 'Building a record · 3 innings and 2 dismissals needed for the full guide' : ''};
}
export function bowlingEvidence(row, person, format) {
  if (person?.bowling === 'none' && !row?.bowling_balls) return {applicable:false,ready:false};
  if (!row || row.bowling_complete === false) return {applicable:true,ready:false,reason:row ? 'Bowling figures incomplete' : 'No linked season figures'};
  if (![row.wickets,row.bowling_balls,row.conceded,row.bowling_innings].every(integer)) return {applicable:true,ready:false,reason:'Check bowling figures'};
  const minimum = ({t20:24,limited_overs:60,long_form:120})[format];
  const ballsNeeded = person?.bowling_load === 'part_time' ? minimum / 2 : minimum;
  const ready = !!minimum && row.bowling_balls >= ballsNeeded && row.bowling_innings >= 2;
  return {applicable:bowler(person) || row.bowling_balls > 0,ready,
    wickets:row.bowling_balls ? row.wickets * 100/row.bowling_balls : null,
    economy:row.bowling_balls ? row.conceded * 6/row.bowling_balls : null,
    workload:row.bowling_innings ? row.bowling_balls/row.bowling_innings : 0,
    reason:ready ? '' : minimum ? `Building a record · ${ballsNeeded/6} overs and 2 innings bowled needed` : 'Match format needed'};
}
const matchingRow = (summary,team,id) => summary.rows.find(row => row.roster_id === id && row.competition === team.competition && row.grade === team.grade && row.format === team.format);
// Keep the player's other-grade record visible after a selection move. These
// rows are context only: the selected grade still supplies all ratings/swaps.
const otherGradeRows = (summary,team,id) => {
  const latest = row => (row.history || []).reduce((date,match) => match.date > date ? match.date : date,'');
  return summary.rows.filter(row => row.roster_id === id && row.competition === team.competition && row.format === team.format && row.grade !== team.grade)
    .sort((a,b) => latest(b).localeCompare(latest(a)) || a.grade.localeCompare(b.grade,undefined,{numeric:true}));
};
const eligibleTeam = (team,season={}) => !team.cancelled && (!season.start || !team.days?.[0]?.date || team.days[0].date >= season.start && team.days[0].date <= season.end);
// Grade-wide historical totals set a stable reference, independent of this
// club's results. The exports cannot separate roles or match formats.
export function gradeBenchmark(team, discipline) {
  if (!ndca(team?.competition) || !['t20','limited_overs','long_form'].includes(team?.format)) return null;
  const grade=NDCA_BENCHMARKS.grades[evidenceGrade(team.grade)];
  if (!grade) return null;
  if (discipline==='bat') return {...grade.batting,average:grade.batting.runs/grade.batting.dismissals};
  if (discipline==='ball') return {...grade.bowling,average:grade.bowling.conceded/grade.bowling.wickets,
    wickets:grade.bowling.wickets*100/grade.bowling.balls,economy:grade.bowling.conceded*6/grade.bowling.balls};
  return null;
}
function assess(team,person,row) {
  const bat=battingEvidence(row), ball=bowlingEvidence(row,person,team.format);
  const evaluate = (discipline,evidence) => {
    if (discipline === 'ball' && !evidence.applicable) return null;
    const base=gradeBenchmark(team,discipline), knownRole=discipline === 'bat' ? role(person) : bowlingRole(person);
    if (!evidence.ready) {
      if (discipline==='bat' && base && Number.isFinite(evidence.positiveAverage)
        && evidence.positiveAverage > base.average && evidence.positiveAverage >= 1.25*base.average) {
        return {...evidence,state:'strong',baseline:base,early:true,reason:(evidence.positiveUsesInnings
          ? 'Early positive flag: runs per innings at least 25% above the grade reference; fewer than 2 dismissals'
          : 'Early positive flag: average at least 25% above the grade reference')
          +(knownRole?'':' · Batting role needed for swap comparisons')};
      }
      if (discipline==='bat' && base && knownRole && row?.innings===2 && evidence.dismissals===2
        && Number.isFinite(evidence.average) && evidence.average < .5*base.average) {
        if (knownRole==='lower') return {...evidence,state:'building',baseline:base,
          reason:'No lower-order batting benchmark · negative flags withheld'};
        return {...evidence,state:'slow',baseline:base,early:true,
          reason:'Average below half the grade reference after 2 innings and 2 dismissals; an early signal only'};
      }
      return {...evidence,state:'building',baseline:base};
    }
    if (!base) return {...evidence,state:'building',baseline:base,
      reason:'No historical benchmark for this competition, grade or format'};
    let state='steady',reason='Within the broad grade range';
    if (discipline === 'bat') {
      if (evidence.average > base.average && evidence.average >= 1.25*base.average) {state='strong';reason='Average at least 25% above the grade reference';}
      else if (evidence.average < base.average && evidence.average <= .75*base.average) {
        state=knownRole==='lower'?'building':'low';
        reason=knownRole==='lower'?'No lower-order batting benchmark · negative flags withheld':'Average at least 25% below the grade reference';
      }
    } else {
      const wicketsStrong=evidence.wickets > base.wickets && evidence.wickets >= 1.25*base.wickets;
      const economyStrong=evidence.economy < base.economy && evidence.economy <= .8*base.economy;
      const wicketsLow=evidence.wickets < base.wickets && evidence.wickets <= .75*base.wickets;
      const economyLow=evidence.economy > base.economy && evidence.economy >= 1.25*base.economy;
      if (wicketsStrong && evidence.economy <= 1.1*base.economy || economyStrong && evidence.wickets >= .9*base.wickets) {
        state='strong';reason=wicketsStrong && economyStrong?'Strong wicket-taking and economy':wicketsStrong?'Strong wicket-taking with economy in range':'Strong economy with wicket-taking in range';
      } else if (wicketsLow && evidence.economy >= .9*base.economy || economyLow && evidence.wickets <= 1.1*base.wickets) {
        state='low';reason=wicketsLow?'Fewer wickets per ball without enough economy advantage':'Higher economy without enough wicket-taking advantage';
      } else if (wicketsStrong && evidence.economy > 1.1*base.economy) reason='Strong wicket-taking offsets higher economy';
      else if (economyStrong && evidence.wickets < .9*base.wickets) reason='Economical bowling offsets fewer wickets';
    }
    // Missing playing-list roles must not hide strong recorded performances.
    // Keep other assessments and like-for-like swaps dependent on the role.
    if (!knownRole) {
      const name=discipline==='bat'?'Batting':'Bowling';
      if (state!=='strong') return {...evidence,state:'building',baseline:base,
        reason:`Set the playing-list ${name.toLowerCase()} role for the full guide`};
      reason+=` · ${name} role needed for swap comparisons`;
    }
    return {...evidence,state,baseline:base,early:(discipline==='bat'?row.innings:row.bowling_innings)<5,reason};
  };
  return {bat:evaluate('bat',bat),ball:evaluate('ball',ball)};
}
export function battingPositionFits(higher, lower) {
  if (!role(higher.person) || role(higher.person) !== role(lower.person)) return false;
  if (higher.position <= 2) return lower.position <= 2;
  if (higher.position <= 4) return lower.position >= 3 && Math.abs(lower.position-higher.position) <= 1;
  if (higher.position <= 6) return lower.position >= 3 && Math.abs(lower.position-higher.position) <= 2;
  return lower.position >= 6;
}
export function bowlingJobFits(higher, lower, format) {
  if (!bowlingRole(higher) || !bowlingRole(lower) || higher.bowling !== lower.bowling) return false;
  // Longer games preserve the recorded bowling job exactly. A frontline
  // bowler can cover part-time work in shorter formats, never the reverse.
  return format === 'long_form' ? higher.bowling_load === lower.bowling_load : higher.bowling_load !== 'frontline' || lower.bowling_load === 'frontline';
}
const closeEnough = (candidate, incumbent) => incumbent === 0 ? candidate === 0 : candidate <= incumbent*1.15;
function possiblePair(higher,lower,guide) {
  if (higher.person.id === lower.person.id || higher.person.active === false || lower.person.active === false) return null;
  if (higher.person.keeper && !lower.person.keeper) return null;
  const dates=team=>(team.days||[]).map(day=>day.date).join(',');
  if (dates(higher.team) && dates(higher.team)===dates(lower.team) && higher.selectedDays.some(day=>!lower.selectedDays.includes(day))) return null;
  const hb=battingEvidence(higher.stats),lb=battingEvidence(lower.stats),hw=bowlingEvidence(higher.stats,higher.person,higher.team.format),lw=bowlingEvidence(lower.stats,lower.person,lower.team.format);
  const needBowling=bowler(higher.person) || !!higher.stats?.bowling_balls;
  if (needBowling && !bowlingJobFits(higher.person,lower.person,higher.team.format)) return null;
  if (!needBowling && higher.person.bowling !== 'none') return null;
  const batFit=battingPositionFits(higher,lower);
  const equivalentBat=lb.average === null || lb.average === undefined ? null : lb.average*guide.batting;
  const equivalentWickets=lw.wickets === null || lw.wickets === undefined ? null : lw.wickets*guide.wickets;
  const equivalentEconomy=lw.economy === null || lw.economy === undefined ? null : lw.economy*guide.economy;
  const batGain=batFit && hb.ready && lb.ready && equivalentBat > 0 && equivalentBat >= hb.average;
  const workloadFit=hw.ready && lw.ready && lw.workload >= hw.workload*(higher.team.format === 'long_form' ? .8 : .65);
  const bowlComparable=workloadFit && equivalentWickets >= hw.wickets*.85 && closeEnough(equivalentEconomy,hw.economy);
  const bowlGain=workloadFit && equivalentWickets >= hw.wickets && closeEnough(equivalentEconomy,hw.economy)
    && (equivalentWickets > hw.wickets || equivalentEconomy < hw.economy);
  if (needBowling && (!hw.ready || !lw.ready)) return null;
  let kind='',reason='';
  if (batGain) {kind=!needBowling || bowlComparable ? 'fit' : 'tradeoff';reason=kind === 'fit' ? needBowling ? 'Batting case · bowling cover retained' : 'Batting case' : 'Batting gain · bowling trade-off';}
  else if (needBowling && bowlGain) {
    // Preserve an all-rounder's batting job. A lower-order bowler can be
    // compared on bowling without inventing a batting average from DNBs.
    if (['top','middle'].includes(role(higher.person))) {
      if (!batFit || !hb.ready || !lb.ready) return null;
      kind=equivalentBat >= hb.average*.85 ? 'fit' : 'tradeoff';reason=kind === 'fit' ? 'Bowling case · batting cover retained' : 'Bowling gain · batting trade-off';
    } else if (role(higher.person) === 'lower' && role(lower.person) === 'lower' && lower.position >= 6) {kind='fit';reason='Bowling case';}
  }
  if (!kind) return null;
  return {higher,lower,kind,reason,guide,equivalentBat,equivalentWickets,equivalentEconomy,
    targetAverage:hb.average === null || hb.average === undefined ? null : hb.average/guide.batting};
}
export function buildSelectionEvidence(summary,teams=[],people=[]) {
  const roster=new Map(people.map(person=>[person.id,person])), players=new Map(), pairs=[];
  const validTeams=teams.filter(team=>eligibleTeam(team,summary.season));
  const playerKey=(teamId,playerId)=>JSON.stringify([teamId,playerId]);
  for (const team of validTeams) {
    for (const [index,slot] of (team.slots || []).entries()) for (const id of new Set([slot.d1,slot.d2].filter(Boolean))) {
      const person=roster.get(id); if (!person || person.active === false || players.has(playerKey(team.id,id))) continue;
      const stats=matchingRow(summary,team,id);
      const selectedDays=(team.days||[]).filter((_,day)=>slot['d'+(day+1)]===id).map(day=>day.date);
      players.set(playerKey(team.id,id),{key:playerKey(team.id,id),team,person,position:index+1,selectedDays,stats,otherGrades:otherGradeRows(summary,team,id),links:[],...assess(team,person,stats)});
    }
  }
  for (let i=0;i<validTeams.length;i++) for (let j=i+1;j<validTeams.length;j++) {
    const guide=gradeGuide(validTeams[i],validTeams[j]); if (!guide) continue;
    const high=[...players.values()].filter(p=>p.team.id===guide.higher.id), low=[...players.values()].filter(p=>p.team.id===guide.lower.id);
    for (const higher of high) for (const lower of low) {
      if (high.some(p=>p.person.id===lower.person.id)) continue;
      const pair=possiblePair(higher,lower,guide); if (pair) pairs.push(pair);
    }
  }
  pairs.sort((a,b)=>a.higher.position-b.higher.position || (a.kind==='fit'?0:1)-(b.kind==='fit'?0:1) || (b.equivalentBat || 0)-(a.equivalentBat || 0) || a.lower.person.name.localeCompare(b.lower.person.name));
  // One numbered comparison per person keeps both ends recognisable on the
  // board. Other valid options remain in the opened comparison details.
  const linked=new Set();let next=1;
  for (const pair of [...pairs].sort((a,b)=>(a.kind==='fit'?0:1)-(b.kind==='fit'?0:1))) {
    if(!linked.has(pair.higher.key)&&!linked.has(pair.lower.key)){pair.number=next++;linked.add(pair.higher.key);linked.add(pair.lower.key);}
  }
  pairs.forEach(pair=>{pair.id=JSON.stringify([pair.higher.key,pair.lower.key]);pair.higher.links.push(pair);pair.lower.links.push(pair);});
  return {players,pairs,player:(teamId,playerId)=>players.get(playerKey(teamId,playerId)),
    forRow(row) {const person=roster.get(row.roster_id);return person && person.active !== false ? {person,stats:row,team:row,otherGrades:otherGradeRows(summary,row,person.id),links:[],...assess(row,person,row)} : null;}};
}
