// Fictional, in-memory adapter. Never writes to a club or contacts PlayCricket.
export function createScorecardTeamDemo(getState,getCard){
 const copy=value=>JSON.parse(JSON.stringify(value));
 return async function(action,data){
  const state=getState(),card=getCard(data.snapshot_id),dates=f=>f.details.days.map(d=>d.date).sort();
  if(!card)throw Error('Load the fictional scorecard again.');
  const fixtures=state.fixtures.filter(f=>!f.details.cancelled&&JSON.stringify(dates(f))===JSON.stringify(card.dates));
  state.scorecard_links||=[];state.scorecard_receipts||={};state.scorecard_new_ids||={};
  if(action==='context')return {enabled:true,card:copy(card),our_team:card.teams[0].id,fixtures:fixtures.map(f=>({id:f.id,grade:f.details.grade,opposition:f.details.opposition,days:copy(f.details.days),brackets:f.details.brackets,slots:copy(f.slots),sync:f.scorecard_sync})),roster:copy(state.roster),links:copy(state.scorecard_links)};
  if(action==='apply'&&state.scorecard_receipts[data.request_id]){const receipt=state.scorecard_receipts[data.request_id];if(JSON.stringify(receipt.data)!==JSON.stringify(data))throw Error('Request already used.');return copy(receipt.result);}
  const target=fixtures.find(f=>f.id===data.fixture_id),team=card.teams.find(t=>t.id===data.team_id),rows=[],newPlayers=[];
  if(!target||card.status!=='completed'||!team?.lineup_available)throw Error('Choose a fixture and a completed, full scorecard.');
  for(const p of team.players){const m=data.mapping.find(m=>m.source_id===p.player_id);if(!m?.roster_id||!m.days?.length||m.days.some(d=>!card.dates.includes(d)))throw Error('Match each player and their playing days.');let id=m.roster_id;
   if(id==='new'){id=state.scorecard_new_ids[p.player_id]||=(crypto.randomUUID());newPlayers.push({id,name:p.name,external_id:p.player_id,active:true,batting:'unknown',bowling:'unknown',keeper:false});}
   else if(!state.roster.some(r=>r.id===id))throw Error('Choose a club player.');if(rows.some(r=>r.roster_id===id))throw Error('Choose each player once.');rows.push({source_id:p.player_id,roster_id:id,name:p.name,days:m.days});
  }
  const oldIds=new Set(target.slots.flatMap(s=>[s.d1,s.d2]).filter(Boolean)),slots=[];
  target.details.days.forEach((d,i)=>{const key='d'+(i+1),picked=rows.filter(r=>r.days.includes(d.date)).sort((a,b)=>{const pos=id=>{const at=target.slots.findIndex(s=>s[key]===id);return at<0?1000:at;};return pos(a.roster_id)-pos(b.roster_id);});for(let j=0;j<Math.max(11,picked.length);j++){slots[j]||={d1:null,d2:null};slots[j][key]=picked[j]?.roster_id||null;}});
  const targetSync={match_id:card.match_id,team_id:team.id,snapshot_id:data.snapshot_id,url:card.url,players:rows,pending:[]},changes=[{id:target.id,revision:target.revision,grade:target.details.grade,slots,sync:targetSync,added:rows.filter(r=>!oldIds.has(r.roster_id)).map(r=>r.name),removed:state.roster.filter(r=>oldIds.has(r.id)&&!rows.some(p=>p.roster_id===r.id)).map(r=>r.name)}];
  for(const f of state.fixtures.filter(f=>f.id!==target.id&&!f.details.cancelled)){const next=copy(f.slots),departures=[];f.details.days.forEach((d,i)=>{const key='d'+(i+1);for(const r of rows.filter(r=>r.days.includes(d.date))){for(const slot of next)if(slot[key]===r.roster_id){slot[key]=null;departures.push({name:r.name,date:d.date,to:target.details.grade});}}});if(departures.length)changes.push({id:f.id,revision:f.revision,grade:f.details.grade,slots:next,departures,sync:{...f.scorecard_sync,pending:[...(f.scorecard_sync?.pending||[]),...departures]}});}
  const plan={fixtures:changes,new_players:newPlayers,changed:JSON.stringify(slots)!==JSON.stringify(target.slots)||changes.length>1||!!target.scorecard_sync?.pending?.length};plan.expected=JSON.stringify(plan);
  if(action==='preview')return copy(plan);if(action!=='apply'||data.expected!==plan.expected)throw Error('A team changed. Check the changes again.');
  state.roster.push(...newPlayers);for(const change of changes){const f=state.fixtures.find(f=>f.id===change.id);f.slots=copy(change.slots);f.scorecard_sync=copy(change.sync);f.revision++;if(f.published){state.scorecard_history||=[];state.scorecard_history.push({fixture_id:f.id,publication:f.publication,snapshot:copy(f.published)});f.published={...f.published,slots:copy(f.slots),players:copy(state.roster),scorecard_sync:copy(change.sync)};f.publication++;}}
  state.scorecard_links=state.scorecard_links.filter(l=>!rows.some(r=>r.source_id===l.source_id)).concat(rows.map(r=>({source_id:r.source_id,roster_id:r.roster_id})));
  const result={saved:true,fixture_id:target.id,affected:changes};state.scorecard_receipts[data.request_id]={data:copy(data),result:copy(result)};return copy(result);
 };
}
