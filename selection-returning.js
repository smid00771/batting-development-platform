import {battingPositionFits, bowlingJobFits, battingEvidence, bowlingEvidence} from './selection-evidence.js?v=0.8.62.262';

const date = team => team.days?.[0]?.date || '';
const end = team => (team.days || []).map(day=>day.date).sort().at(-1) || '';
const selected = (team,id) => (team.slots || []).some(slot=>slot.d1===id || slot.d2===id);
const status = (person,day) => person.availability?.unavailable_dates?.includes(day.date) ? 'unavailable'
  : person.availability?.available_dates?.includes(day.date) ? 'available' : 'unknown';
const sameGrade = (a,b) => a.grade_group_id && b.grade_group_id ? a.grade_group_id===b.grade_group_id
  : !!a.competition && a.competition===b.competition && a.grade===b.grade;
const snapshot = team => team.published?.details && Array.isArray(team.published.slots)
  ? {...team,...team.published.details,slots:team.published.slots,historyConfirmed:true} : team;
const inSeason = (team,season) => !!season.start && date(team)>=season.start && date(team)<=season.end;

function roleFits(team,incumbent,candidate,position,previousPosition,days) {
  if (!incumbent || incumbent.active===false) return false;
  const keeps=incumbent.keeper || days.some(day=>team.match_roles?.['d'+(day+1)]?.keeper_id===incumbent.id);
  if (keeps && !candidate.keeper) return false;
  const batting=battingPositionFits({person:incumbent,position},{person:candidate,position:previousPosition});
  if (['pace','spin'].includes(incumbent.bowling)) {
    if (!bowlingJobFits(incumbent,candidate,team.format)) return false;
    // Retain the existing frontline-quick comparison. Their batting and
    // fielding differences remain visible rather than inventing a bowling job.
    const quicks=[incumbent,candidate].every(p=>p.bowling==='pace'&&p.bowling_load==='frontline');
    return quicks || batting;
  }
  return incumbent.bowling==='none' && batting;
}

// A return is established by saved unavailability for consecutive missed
// fixtures, following a confirmed selection in this grade and format. Never
// infer injury, poor form or absence from an unanswered availability date.
export function returningPlayers({teams=[],references=[],roster=[],season={},today='',noPlay=[],eligible=()=>false}={}) {
  const history=references.filter(team=>!team.cancelled&&!team.published?.details?.cancelled&&!noPlay.includes(team.id)).map(snapshot).filter(team=>inSeason(team,season));
  const people=new Map(roster.map(p=>[p.id,p])), returns=[];
  for (const team of teams) {
    if (!team.returningEligible || team.cancelled || !inSeason(team,season) || date(team)<today) continue;
    const past=history.filter(old=>old.id!==team.id&&sameGrade(old,team)&&old.format===team.format&&end(old)<date(team)&&end(old)<today)
      .sort((a,b)=>date(b).localeCompare(date(a)) || String(b.days?.[0]?.start||'').localeCompare(String(a.days?.[0]?.start||'')));
    for (const person of roster) {
      if (!person.active || selected(team,person.id)) continue;
      const availableDays=(team.days || []).flatMap((day,i)=>status(person,day)==='available'&&eligible(team,person,i)?[i]:[]);
      if (!availableDays.length || !team.brackets && availableDays.length!==team.days.length) continue;
      const missed=[];let previous=null;
      for (const old of past) {
        if (old.historyConfirmed && selected(old,person.id)) {previous=old;break;}
        if ((old.days || []).some(day=>status(person,day)==='unavailable')) missed.push(old);
        else break;
      }
      if (!missed.length || !previous) continue;
      // A confirmed intervening grade move is not a return from an absence.
      if (history.some(old=>old.historyConfirmed&&!sameGrade(old,team)&&date(old)>date(previous)&&end(old)<date(team)&&selected(old,person.id))) continue;
      const position=previous.slots.findIndex(slot=>slot.d1===person.id||slot.d2===person.id)+1;
      const firstMissed=missed.at(-1), targets=[];
      for (const [index,slot] of (team.slots || []).slice(0,11).entries()) {
        for (const id of new Set((team.days || []).map((_,day)=>slot['d'+(day+1)] || null))) {
          const days=team.days.flatMap((_,day)=>(slot['d'+(day+1)]||null)===id?[day]:[]);
          if (days.some(day=>!availableDays.includes(day)) || !team.brackets && days.length!==team.days.length) continue;
          const incumbent=people.get(id);
          if (id ? !roleFits(team,incumbent,person,index+1,position,days) : index+1!==position) continue;
          const joinedDuringAbsence=!!id&&firstMissed.historyConfirmed&&selected(firstMissed,id)&&!selected(previous,id);
          targets.push({incumbent:incumbent||null,position:index+1,days,joinedDuringAbsence});
        }
      }
      targets.sort((a,b)=>Number(b.joinedDuringAbsence)-Number(a.joinedDuringAbsence)||Math.abs(a.position-position)-Math.abs(b.position-position)||a.position-b.position);
      returns.push({key:JSON.stringify([team.id,person.id]),team,person,previous,position,missed,availableDays,targets});
    }
  }
  return returns.sort((a,b)=>a.team.grade.localeCompare(b.team.grade,undefined,{numeric:true})||a.person.name.localeCompare(b.person.name));
}

const valid = value => Number.isInteger(value)&&value>=0;
export function returningPeriod(history=[]) {
  const row={matches:history.length,runs:0,innings:0,not_outs:0,dismissals:0,average:null,wickets:0,conceded:0,bowling_balls:0,bowling_innings:0,economy:null,
    batting_complete:true,bowling_complete:true,dates:history.map(match=>match.date)};
  for (const match of history) {
    if (!match.batting_available || match.batting_incomplete) row.batting_complete=false;
    if (!match.bowling_available || match.bowling_incomplete) row.bowling_complete=false;
    for (const bat of match.batting || []) {
      if (bat.dnb) continue;
      if (!valid(bat.runs)||typeof bat.not_out!=='boolean') {row.batting_complete=false;continue;}
      row.runs+=bat.runs;row.innings++;row.not_outs+=Number(bat.not_out);row.dismissals+=Number(!bat.not_out);
    }
    for (const ball of match.bowling || []) {
      if (![ball.wickets,ball.runs,ball.balls].every(valid)) {row.bowling_complete=false;continue;}
      row.wickets+=ball.wickets;row.conceded+=ball.runs;row.bowling_balls+=ball.balls;row.bowling_innings++;
    }
  }
  row.average=row.dismissals?row.runs/row.dismissals:null;
  row.economy=row.bowling_balls?row.conceded*6/row.bowling_balls:null;
  return row;
}

// Keep the periods distinct: the returner's latest three recorded matches
// before the absence versus the incumbent's appearances in the missed games.
// All rates use summed runs, dismissals and balls, never averages of averages.
export function returningComparison(entry,target,summary) {
  const rowFor=id=>summary.rows.find(row=>row.roster_id===id&&row.grade===entry.team.grade&&row.competition===entry.team.competition&&row.format===entry.team.format);
  const start=date(entry.missed.at(-1));
  const before=(rowFor(entry.person.id)?.history || []).filter(match=>match.date<start).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  const whileAway=(rowFor(target.incumbent?.id)?.history || []).filter(match=>entry.missed.some(team=>match.fixture_id
    ? match.fixture_id===team.id : match.date===date(team)&&entry.missed.filter(other=>date(other)===match.date).length===1));
  const incoming=returningPeriod(before),current=returningPeriod(whileAway),notes=[];
  if (target.incumbent) {
    const batA=battingEvidence(incoming),batB=battingEvidence(current);
    if (incoming.batting_complete&&current.batting_complete&&Number.isFinite(incoming.average)&&Number.isFinite(current.average)) {
      const comparison=incoming.average>current.average?'higher':incoming.average<current.average?'lower':'the same';
      notes.push(`${entry.person.name} had ${comparison==='the same'?'the same':'a '+comparison} batting average in these samples.`);
      if (!batA.ready||!batB.ready) notes.push('Too few batting opportunities for a firm statistical preference.');
    } else notes.push('Batting averages cannot yet be compared reliably.');
    const a=bowlingEvidence(incoming,entry.person,entry.team.format),b=bowlingEvidence(current,target.incumbent,entry.team.format);
    if (incoming.bowling_complete&&current.bowling_complete&&incoming.bowling_balls&&current.bowling_balls) {
      const wickets=a.wickets>b.wickets?'more':a.wickets<b.wickets?'fewer':'the same',economy=a.economy<b.economy?'lower':a.economy>b.economy?'higher':'the same';
      notes.push(`${entry.person.name}: ${wickets} wickets per ball; ${economy} economy.`);
      if (!a.ready||!b.ready) notes.push('Too little bowling for a firm statistical preference.');
    }
  }
  const early=[incoming,...(target.incumbent?[current]:[])].some(row=>row.innings<5 || row.bowling_innings>0&&row.bowling_innings<5);
  return {entry,target,incoming,current,notes,early};
}
