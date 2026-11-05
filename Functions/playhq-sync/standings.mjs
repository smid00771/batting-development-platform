// Public competition data only. Column positions come from the provider headers.
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
export function normaliseLadders(body,{gradeId,seasonId,teams,grades=[]}){
 if(body?.gradeId!==gradeId||!UUID.test(gradeId)||!UUID.test(seasonId)||!Array.isArray(body.ladders)||body.ladders.length>40)throw Error('Incomplete competition ladder');
 const directory=new Map();
 for(const team of teams||[]){
  if(!UUID.test(team.id)||!UUID.test(team.club?.id))continue;
  const item={id:team.id,club_id:team.club.id,club_name:clean(team.club.name)};
  if(directory.has(item.id)&&directory.get(item.id).club_id!==item.club_id)throw Error('Conflicting competition team');
  directory.set(item.id,item);
 }
 const seen=new Set();
 const ladders=body.ladders.map(ladder=>{
  if(!['overall','oneDay','twoDay','t20'].includes(ladder.type)||!Array.isArray(ladder.headers)||!Array.isArray(ladder.standings)||ladder.standings.length>500)throw Error('Unsupported competition ladder');
  const headers=ladder.headers.map(h=>({key:clean(h.key,80),name:clean(h.name,100),short_name:clean(h.shortName,30)}));
  if(!headers.length||headers.length>60||headers.some(h=>!h.key)||new Set(headers.map(h=>h.key)).size!==headers.length)throw Error('Invalid ladder columns');
  const rows=ladder.standings.map((row,i)=>{
   if(!UUID.test(row.team?.id)||!Array.isArray(row.values)||row.values.length!==headers.length)throw Error('Incomplete ladder row');
   const key=ladder.type+':'+row.team.id;
   if(seen.has(key))throw Error('Team appears twice in the same ladder');seen.add(key);
   const values=Object.fromEntries(headers.map((h,n)=>{
    const value=row.values[n];
    if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('Invalid ladder figure');
    return [h.key,value];
   }));
   const club=directory.get(row.team.id);
   return {team_id:row.team.id,name:clean(row.team.name),club_id:club?.club_id??null,club_name:club?.club_name||null,position:i+1,values};
  });
  return {type:ladder.type,pool_id:ladder.pool?.id??null,pool_name:clean(ladder.pool?.name)||null,headers,rows};
 });
 return {grade_id:gradeId,season_id:seasonId,name:clean(grades.find(g=>g.id===gradeId)?.name)||'Competition',ladders};
}

export function standingsCatalogue(grades){
 if(!Array.isArray(grades)||grades.length>500)throw Error('Incomplete competition list');
 return grades.filter(g=>UUID.test(g.id)).map(g=>({id:g.id,name:clean(g.name)}));
}

export function standingsDirectory(teams){
 if(!Array.isArray(teams)||teams.length>10000)throw Error('Incomplete team directory');
 return teams.filter(t=>UUID.test(t.id)&&UUID.test(t.club?.id)).map(t=>({id:t.id,name:clean(t.name),club:{id:t.club.id,name:clean(t.club.name)},grade:{id:t.grade?.id??null}}));
}

// Some public season directories omit teams that still appear in ladders.
// Recover only an exact team/grade identity from a public game summary. This
// runs in the scheduled worker; no player appearances are retained or returned.
export async function completeStandingsDirectory(ladder,directory,api){
 const missing=new Set(ladder.ladders.flatMap(l=>l.rows.filter(r=>!r.club_id).map(r=>r.team_id)));
 if(!missing.size)return directory;
 const fixtures=await api.fixtures(ladder.grade_id);
 if(!Array.isArray(fixtures?.rounds))throw Error('Incomplete competition fixtures');
 const games=fixtures.rounds.flatMap(r=>r.games||[]),known=new Map(directory.map(t=>[t.id,t])),seen=new Set();
 let requests=0;
 for(const teamId of missing){
  if(known.has(teamId))continue;
  const game=games.find(g=>UUID.test(g.id)&&Array.isArray(g.teams)&&g.teams.some(t=>t.id===teamId)&&!seen.has(g.id));
  if(!game||requests>=10)continue;
  seen.add(game.id);requests++;
  const summary=(await api.summary(game.id))?.data;
  if(summary?.id!==game.id||summary.gradeId!==ladder.grade_id||!Array.isArray(summary.teams))throw Error('Mismatched competition summary');
  const ids=new Set();
  for(const team of summary.teams){
   if(ids.has(team.id)||!game.teams.some(t=>t.id===team.id))throw Error('Mismatched competition team');
   ids.add(team.id);
   if(!UUID.test(team.id)||!UUID.test(team.organisation?.id))continue;
   if(known.has(team.id)&&known.get(team.id).club.id!==team.organisation.id)throw Error('Conflicting competition club');
   if(missing.has(team.id))known.set(team.id,{id:team.id,name:clean(team.name),club:{id:team.organisation.id,name:clean(team.organisation.name)},grade:{id:ladder.grade_id}});
  }
 }
 return [...known.values()];
}
