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

function roleMatch(team,incumbent,candidate,position,previousPosition,days) {
  if (!incumbent || incumbent.active===false) return false;
  const keeps=incumbent.keeper || days.some(day=>team.match_roles?.['d'+(day+1)]?.keeper_id===incumbent.id);
  if (keeps && !candidate.keeper) return false;
  // Top/middle-order batters can be discussed together on their batting.
  // Keep openers/lower-order jobs separate and expose the two actual positions.
  const batting=battingPositionFits({person:incumbent,position},{person:candidate,position:previousPosition})
    || [incumbent,candidate].every(p=>['top','middle'].includes(p.batting))
      && position>=3&&position<=6&&previousPosition>=3&&previousPosition<=6;
  if (['pace','spin'].includes(incumbent.bowling)&&incumbent.bowling_load!=='part_time') {
    if (!bowlingJobFits(incumbent,candidate,team.format)) return false;
    // A returning frontline spinner needs the same bowling-led comparison as
    // a frontline quick. Keep type/workload and keeper cover; show batting and
    // fielding differences separately rather than requiring identical batting roles.
    const frontline=[incumbent,candidate].every(p=>p.bowling_load==='frontline');
    return frontline ? 'bowling' : batting ? 'all_round' : false;
  }
  // Occasional bowling is not a required replacement job. Saved frontline
  // bowling and keeping cover still take priority; no player roles are changed.
  return (incumbent.bowling==='none'||incumbent.bowling_load==='part_time') && batting ? 'batting' : false;
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
          const focus=id?roleMatch(team,incumbent,person,index+1,position,days):'place';
          if (id ? !focus : index+1!==position) continue;
          const joinedDuringAbsence=!!id&&firstMissed.historyConfirmed&&selected(firstMissed,id)&&!selected(previous,id);
          targets.push({incumbent:incumbent||null,position:index+1,days,joinedDuringAbsence,focus});
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
const returnRow=(entry,summary,id)=>summary.rows.find(row=>row.roster_id===id&&row.grade===entry.team.grade&&row.competition===entry.team.competition&&row.format===entry.team.format);
export function returningForm(entry,summary) {
  const start=date(entry.missed.at(-1));
  const before=(returnRow(entry,summary,entry.person.id)?.history || []).filter(match=>match.date<start).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
  return returningPeriod(before);
}
export function returningComparison(entry,target,summary) {
  const whileAway=(returnRow(entry,summary,target.incumbent?.id)?.history || []).filter(match=>entry.missed.some(team=>match.fixture_id
    ? match.fixture_id===team.id : match.date===date(team)&&entry.missed.filter(other=>date(other)===match.date).length===1));
  const incoming=returningForm(entry,summary),current=returningPeriod(whileAway),notes=[];
  let assessment='insufficient',assessmentText='Not enough comparable figures.';
  if (target.incumbent) {
    if(target.focus!=='bowling'){
    const batA=battingEvidence(incoming),batB=battingEvidence(current);
    if (incoming.batting_complete&&current.batting_complete&&Number.isFinite(incoming.average)&&Number.isFinite(current.average)) {
      const comparison=incoming.average>current.average?'higher':incoming.average<current.average?'lower':'the same';
      notes.push(`${entry.person.name} had ${comparison==='the same'?'the same':'a '+comparison} batting average in these samples.`);
      if (!batA.ready||!batB.ready) notes.push('Too few batting opportunities for a firm statistical preference.');
      assessment=batA.ready&&batB.ready?(incoming.average>current.average?'returner':incoming.average<current.average?'incumbent':'level'):'early';
      assessmentText=assessment==='early'?'Early batting samples · no statistical preference.'
        :assessment==='level'?'Equal batting averages in these samples.'
        :`${assessment==='returner'?entry.person.name:target.incumbent.name} has the stronger batting figures in these samples.`;
    } else notes.push('Batting averages cannot yet be compared reliably.');
    }
    if(target.focus==='bowling'||target.focus==='all_round'){
    const a=bowlingEvidence(incoming,entry.person,entry.team.format),b=bowlingEvidence(current,target.incumbent,entry.team.format),bowlingNotes=[];
    if (incoming.bowling_complete&&current.bowling_complete&&incoming.bowling_balls&&current.bowling_balls) {
      const wickets=a.wickets>b.wickets?'more':a.wickets<b.wickets?'fewer':'the same',economy=a.economy<b.economy?'lower':a.economy>b.economy?'higher':'the same';
      bowlingNotes.push(`${entry.person.name}: ${wickets} wickets per ball; ${economy} economy.`);
      if (!a.ready||!b.ready) bowlingNotes.push('Too little bowling for a firm statistical preference.');
      const stronger=a.wickets>=b.wickets&&a.economy<=b.economy&&(a.wickets>b.wickets||a.economy<b.economy),weaker=b.wickets>=a.wickets&&b.economy<=a.economy&&(b.wickets>a.wickets||b.economy<a.economy);
      assessment=!a.ready||!b.ready?'early':stronger?'returner':weaker?'incumbent':a.wickets===b.wickets&&a.economy===b.economy?'level':'tradeoff';
      assessmentText=assessment==='early'?'Early bowling samples · no statistical preference.'
        :assessment==='level'?'Equal bowling rates in these samples.'
        :assessment==='tradeoff'?'Bowling trade-off · wicket-taking and economy favour different players.'
        :`${assessment==='returner'?entry.person.name:target.incumbent.name} has the stronger bowling figures in these samples.`;
    } else if (target.focus==='bowling') {
      bowlingNotes.push(!incoming.bowling_complete||!current.bowling_complete?'Bowling figures are incomplete for these periods.':`No recorded bowling for ${!incoming.bowling_balls?entry.person.name:target.incumbent.name} in this period; bowling rates cannot be compared.`);
    }
    if(target.focus==='bowling')notes.unshift(...bowlingNotes);else notes.push(...bowlingNotes);
    }
  }
  const early=[incoming,...(target.incumbent?[current]:[])].some(row=>target.focus==='bowling'?row.bowling_innings<5:row.innings<5);
  return {entry,target,incoming,current,notes,early,assessment,assessmentText};
}
