// Shared, side-effect-free helpers for club-week planning. Publication remains server-authorised.
export const dayKey = index => `d${index + 1}`;
export function availability(person, date) {
  const a = person?.availability || {};
  return (a.available_dates || []).includes(date) ? 'available' : (a.unavailable_dates || []).includes(date) ? 'unavailable' : 'unset';
}
export function missingAvailability(roster, dates) {
  return roster.filter(p => p.active).map(p => ({...p, missing: dates.filter(date => availability(p,date) === 'unset')})).filter(p => p.missing.length);
}
export function selectedOn(fixtures, playerId, date) {
  return fixtures.flatMap(f => f.details?.cancelled ? [] : (f.details?.days || []).flatMap((d, day) => d.date !== date ? [] : f.slots.flatMap((s, slot) => s[dayKey(day)] === playerId ? [{fixtureId:f.id, grade:f.details.grade, slot, day}] : [])));
}
export function openPlaces(fixtures) {
  return fixtures.flatMap(f => f.details?.cancelled ? [] : (f.details?.days || []).flatMap((d, day) => f.slots.slice(0,11).flatMap((s, slot) => !s[dayKey(day)] ? [{fixtureId:f.id,grade:f.details.grade,date:d.date,day,slot}] : [])));
}
export function roleMatch(incumbent, candidate, format) {
  const differences=[];let score=0;
  if(incumbent?.keeper){if(candidate.keeper)score+=8;else differences.push('Keeping cover changes');}
  if(['pace','spin'].includes(incumbent?.bowling)){
    if(candidate.bowling===incumbent.bowling)score+=8;else differences.push(candidate.bowling==='unknown'?'Bowling type not set':'Different bowling type');
    if(candidate.bowling_load===incumbent.bowling_load)score+=4;
    else if(format==='long_form'||incumbent.bowling_load==='frontline')differences.push('Different bowling workload');
  }
  if(['top','middle','lower'].includes(incumbent?.batting)){
    if(candidate.batting===incumbent.batting)score+=incumbent.batting==='top'?6:3;
    else differences.push(candidate.batting==='unknown'?'Batting role not set':'Different batting role');
  }
  return {score,differences};
}
export function replacementOptions({fixtures,roster,fixtureId,slot,days,incumbentId,excluded=[]}) {
  const target=fixtures.find(f=>f.id===fixtureId);if(!target)return [];
  const dates=days.map(day=>target.details.days[day]?.date).filter(Boolean),incumbent=roster.find(p=>p.id===incumbentId);
  return roster.filter(p=>p.active&&p.id!==incumbentId&&!excluded.includes(p.id)&&dates.every(date=>availability(p,date)==='available')).map(p=>{
    const from=dates.flatMap(date=>selectedOn(fixtures,p.id,date));
    const sameTeam=from.some(x=>x.fixtureId===fixtureId&&x.slot!==slot);
    const splitsFixedTeam=from.some(x=>{const f=fixtures.find(f=>f.id===x.fixtureId);return f.details.days.length===2&&!f.details.brackets&&f.details.days.some(d=>!dates.includes(d.date));});
    return {person:p,from,sameTeam,splitsFixedTeam,...roleMatch(incumbent,p,target.details.format)};
  }).filter(x=>!x.sameTeam&&!x.splitsFixedTeam).sort((a,b)=>b.score-a.score||a.from.length-b.from.length||a.person.name.localeCompare(b.person.name));
}
export function replaceInPlan({fixtures,fixtureId,slot,days,playerId,roster}) {
  const next=structuredClone(fixtures),target=next.find(f=>f.id===fixtureId),person=roster.find(p=>p.id===playerId);
  if(!target||!Number.isInteger(slot)||slot<0||slot>=11||!days.length)throw Error('Choose a valid team place.');
  const dates=days.map(day=>target.details.days[day]?.date);
  if(dates.some(date=>!date)||!person?.active||dates.some(date=>availability(person,date)!=='available'))throw Error('The player must be available for every chosen date.');
  if(target.details.days.length===2&&!target.details.brackets&&days.length!==2)throw Error('This team uses the same XI on both days.');
  if(next.some(f=>f.details.days.length===2&&!f.details.brackets&&f.details.days.some((d,i)=>dates.includes(d.date)&&f.slots.some(s=>s[dayKey(i)]===playerId))&&f.details.days.some(d=>!dates.includes(d.date))))throw Error('This move would split a team that uses the same XI on both days.');
  // Move only the matching playing dates. A bracket partner on another day stays put.
  for(const f of next)if(!f.details.cancelled)f.details.days.forEach((d,day)=>{
    if(!dates.includes(d.date))return;
    for(const s of f.slots)if(s[dayKey(day)]===playerId)s[dayKey(day)]=null;
  });
  for(const day of days)target.slots[slot][dayKey(day)]=playerId;
  return next;
}
export function startWithdrawal(fixtures,fixtureId,playerId,days) {
  const next=structuredClone(fixtures),target=next.find(f=>f.id===fixtureId);
  if(!target||!days.length||days.some(d=>!target.details.days[d]))throw Error('Choose the affected playing days.');
  for(const day of days)for(const s of target.slots)if(s[dayKey(day)]===playerId)s[dayKey(day)]=null;
  return next;
}
export function changedTeams(before,after) {
  return after.filter(f=>{const old=before.find(x=>x.id===f.id);return old&&JSON.stringify(old.slots)!==JSON.stringify(f.slots);});
}
export function shareLink(origin,clubId,{view='published',date='',fixtureId=''}={}) {
  const u=new URL('/app.html',origin);u.searchParams.set('club',clubId);u.searchParams.set('tab','teams');u.searchParams.set('team_view',view);
  if(/^\d{4}-\d{2}-\d{2}$/.test(date))u.searchParams.set('team_date',date);
  if(fixtureId)u.searchParams.set('fixture',fixtureId);return u.href;
}
export function forecast(roster,fixtures,today,days=21) {
  const end=new Date(`${today}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+days);
  const dates=[...new Set(fixtures.filter(f=>!f.details?.cancelled).flatMap(f=>f.details.days.map(d=>d.date)))].filter(d=>d>=today&&d<=end.toISOString().slice(0,10)).sort();
  return dates.map(date=>{
    const matches=fixtures.filter(f=>!f.details?.cancelled&&f.details.days.some(d=>d.date===date)),active=roster.filter(p=>p.active),available=active.filter(p=>availability(p,date)==='available'),unset=active.filter(p=>availability(p,date)==='unset');
    return {date,required:matches.length*11,available:available.length,unset:unset.length,unavailable:active.length-available.length-unset.length,keepers:available.filter(p=>p.keeper).length,unknownRoles:available.filter(p=>p.batting==='unknown'||p.bowling==='unknown').length,teams:matches.length};
  });
}
