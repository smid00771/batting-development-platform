import {selectionEvidenceFixture} from './selection_evidence_fixture.mjs';
export function selectionReturningFixture(){
 const f=selectionEvidenceFixture(),person=f.roster.find(p=>p.id==='g1p0'),cover={...structuredClone(person),id:'cover',name:'Chris Vale'};
 f.roster.push(cover);f.context.today='2026-10-26';
 for(const p of f.roster)p.availability.available_dates.push('2026-10-31');
 person.availability.unavailable_dates=['2026-10-17','2026-10-24'];
 person.availability.available_dates=person.availability.available_dates.filter(day=>!person.availability.unavailable_dates.includes(day));
 f.context.identities.push({source_id:'source-cover',roster_id:cover.id,name:cover.name});
 for(const [index,card] of f.context.cards.filter(c=>c.scorecard.grade==='1st Grade').entries()){
  const bat=card.scorecard.innings[0].batters[0];bat.runs=[50,30,10,5][index];
  if(index>=2){Object.assign(bat,{player_id:'source-cover',name:cover.name});Object.assign(card.scorecard.teams[0].players[0],{player_id:'source-cover',name:cover.name});}
 }
 const references=f.context.fixtures.map(fixture=>{
  const original=f.teams.find(team=>team.grade===fixture.grade),slots=structuredClone(original.slots);
  if(fixture.grade==='1st Grade'&&fixture.days[0].date>='2026-10-17')slots[0]={d1:cover.id};
  const team={...structuredClone(fixture),grade_group_id:'grade-'+original.level,slots};
  team.published={details:{...fixture,grade_group_id:team.grade_group_id},slots:structuredClone(slots)};
  return team;
 });
 const last=references.find(team=>team.grade==='1st Grade'&&team.days[0].date==='2026-10-24');
 const draft={...structuredClone(last),id:'next-first',competition:'',days:[{date:'2026-10-31',start:'10:00'}],published:null,returningEligible:true};
 references.push(draft);
 return {...f,person,cover,draft,references};
}
