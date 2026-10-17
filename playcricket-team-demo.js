// Fictional, in-memory adapter. Never writes to a club or contacts PlayCricket.
export function createScorecardTeamDemo(getState,getCard,getPlayers=()=>[]){
 const copy=value=>JSON.parse(JSON.stringify(value));
 return async function(action,data){
  const state=getState(),card=getCard(data.snapshot_id),dates=f=>f.details.days.map(d=>d.date).sort();
  if(!card)throw Error('Load the fictional scorecard again.');
  const fixtures=state.fixtures.filter(f=>!f.details.cancelled&&JSON.stringify(dates(f))===JSON.stringify(card.dates));
  state.scorecard_links||=[];state.scorecard_receipts||={};state.scorecard_new_ids||={};
  if(action==='confirm_identity'){
   const key='identity:'+data.request_id,prior=state.scorecard_receipts[key];if(prior){if(JSON.stringify(prior.data)!==JSON.stringify(data))throw Error('Request already used.');return copy(prior.result);}
   const source=card.teams.find(t=>t.id===data.team_id)?.players?.find(p=>p.player_id===data.source_player_id)||(card.innings||[]).filter(i=>i.team_id===data.team_id).flatMap(i=>i.batters||[]).find(p=>p.player_id===data.source_player_id);
   if(!source)throw Error('Player is unavailable on this scorecard.');
   const people=getPlayers();let player=people.find(p=>p.id===data.player_id),r=state.roster.find(r=>r.id===data.roster_id||(player&&(r.review_player_id===player.id||r.user_id&&r.user_id===player.user_id)));
   const previous=state.scorecard_links.find(l=>l.source_id===source.player_id),stub=state.roster.find(r=>r.id===previous?.roster_id||r.external_id===source.player_id);
   if(!r&&!player)throw Error('Choose an existing club player.');player||=people.find(p=>p.id===r?.review_player_id||p.user_id&&p.user_id===r?.user_id);
   if(data.expected_name!==(data.player_id?player?.display_name:r?.name))throw Error('The player name changed. Reload before confirming.');
   if(stub&&stub.id!==r?.id&&(stub.user_id||stub.review_player_id||stub.account_email?.trim()))throw Error('This identity has another player record. Ask Club Admin to review the links.');
   state.scorecard_player_links||=[];
   if(state.scorecard_player_links.some(l=>l.source_id===source.player_id&&l.player_id!==player?.id||l.player_id===player?.id&&l.source_id!==source.player_id))throw Error('This identity has another player history. Ask Club Admin to review the links.');
   if(!r&&player&&stub)r=stub;
   const f=fixtures.find(f=>f.id===data.fixture_id),old=stub?.id!==r?.id?stub?.id:null,used=x=>[...x.slots,...(x.published?.slots||[])].some(s=>[s.d1,s.d2].includes(r?.id));
   if(data.fixture_id&&r&&!f)throw Error('The fixture changed. Reload before confirming.');
   const conflict=!!old&&state.fixtures.some(x=>!x.details.cancelled&&dates(x).some(d=>card.dates.includes(d))&&used(x));
   if(player){player.display_name=source.name;state.scorecard_player_links=state.scorecard_player_links.filter(l=>l.source_id!==source.player_id).concat({source_id:source.player_id,player_id:player.id});}
   if(r){r.name=source.name;if(player){r.review_player_id=player.id;r.imported_stub=false;}state.scorecard_links=state.scorecard_links.filter(l=>l.source_id!==source.player_id).concat({source_id:source.player_id,roster_id:r.id});}
   let repaired=false;
   if(f&&r&&!conflict&&[...f.slots,...(f.published?.slots||[])].some(s=>[s.d1,s.d2].includes(old||r.id))){
    const replaceSlots=slots=>slots.map(s=>({...s,d1:old&&s.d1===old?r.id:s.d1,d2:old&&s.d2===old?r.id:s.d2})),roles=details=>{const d=copy(details);for(const day of ['d1','d2'])for(const role of ['captain_id','keeper_id'])if(old&&d.match_roles?.[day]?.[role]===old)d.match_roles[day][role]=r.id;return d;},sync=value=>value?{...value,players:(value.players||[]).map(p=>p.source_id===source.player_id?{...p,roster_id:r.id,name:source.name}:p)}:value;
    f.slots=replaceSlots(f.slots);f.details=roles(f.details);f.scorecard_sync=sync(f.scorecard_sync);f.revision++;repaired=true;
    if(f.published){state.scorecard_history||=[];state.scorecard_history.push({fixture_id:f.id,publication:f.publication,snapshot:copy(f.published)});f.published={...f.published,details:roles(f.published.details),slots:replaceSlots(f.published.slots),players:(f.published.players||[]).map(p=>p.id===(old||r.id)?{...p,id:r.id,name:source.name}:p),scorecard_sync:sync(f.published.scorecard_sync)};f.publication++;}
   }
   if(old&&!state.fixtures.some(x=>[...x.slots,...(x.published?.slots||[])].some(s=>[s.d1,s.d2].includes(old))))stub.active=false;
   const result={confirmed:true,source_player_id:source.player_id,player_id:player?.id||null,roster_id:r?.id||null,name:source.name,fixture_repaired:repaired,needs_team_review:conflict};
   state.scorecard_receipts[key]={data:copy(data),result:copy(result)};return result;
  }
  if(action==='context')return {enabled:true,card:copy(card),our_team:card.teams[0].id,fixtures:fixtures.map(f=>({id:f.id,grade:f.details.grade,opposition:f.details.opposition,days:copy(f.details.days),brackets:f.details.brackets,slots:copy(f.slots),sync:f.scorecard_sync})),roster:copy(state.roster),links:copy(state.scorecard_links)};
  if(action==='apply'&&state.scorecard_receipts[data.request_id]){const receipt=state.scorecard_receipts[data.request_id];if(JSON.stringify(receipt.data)!==JSON.stringify(data))throw Error('Request already used.');return copy(receipt.result);}
  const target=fixtures.find(f=>f.id===data.fixture_id),team=card.teams.find(t=>t.id===data.team_id),rows=[],newPlayers=[];
  if(!target||card.status!=='completed'||!team?.lineup_available)throw Error('Choose a fixture and a completed, full scorecard.');
  for(const p of team.players){const m=data.mapping.find(m=>m.source_id===p.player_id);if(!m?.roster_id||!m.days?.length||m.days.some(d=>!card.dates.includes(d)))throw Error('Match each player and their playing days.');let id=m.roster_id;
   if(id==='new'){id=state.scorecard_new_ids[p.player_id]||=(crypto.randomUUID());newPlayers.push({id,name:p.name,external_id:p.player_id,active:true,imported_stub:true,batting:'unknown',bowling:'unknown',keeper:false});}
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
