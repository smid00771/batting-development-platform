// Factual availability reminders only: no scorecards or comparison dependencies.
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

export function findReturningPlayers({teams=[],references=[],roster=[],season={},today='',noPlay=[],eligible=()=>false}={}) {
  const history=references.filter(team=>!team.cancelled&&!team.published?.details?.cancelled&&!noPlay.includes(team.id)).map(snapshot).filter(team=>inSeason(team,season));
  const returns=[];
  for (const team of teams) {
    if (!team.returningEligible || team.cancelled || !inSeason(team,season) || date(team)<today) continue;
    const past=history.filter(old=>old.id!==team.id&&sameGrade(old,team)&&old.format===team.format&&end(old)<date(team)&&end(old)<today)
      .sort((a,b)=>date(b).localeCompare(date(a)) || String(b.days?.[0]?.start||'').localeCompare(String(a.days?.[0]?.start||'')));
    for (const person of roster) {
      if (!person.active || selected(team,person.id)) continue;
      let availableDays=(team.days || []).flatMap((day,i)=>status(person,day)==='available'?[i]:[]);
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
      // Check clashes only for established returns, not every player on every draw.
      availableDays=availableDays.filter(day=>eligible(team,person,day));
      if (!availableDays.length || !team.brackets && availableDays.length!==team.days.length) continue;
      const position=previous.slots.findIndex(slot=>slot.d1===person.id||slot.d2===person.id)+1;
      const targets=[];
      returns.push({key:JSON.stringify([team.id,person.id]),team,person,previous,position,missed,availableDays,targets});
    }
  }
  return returns.sort((a,b)=>a.team.grade.localeCompare(b.team.grade,undefined,{numeric:true})||a.person.name.localeCompare(b.person.name));
}
