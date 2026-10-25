/* Basic TOTW uses recorded figures only. Keep Smart's match-context guide separate. */
const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
const total=(rows,key)=>rows.length&&rows.every(row=>number(row[key])!==null)?rows.reduce((n,row)=>n+number(row[key]),0):null;
export function rawAwardFigures(p){
 const batting=p.batting||[],bowling=p.bowling||[];
 const runs=number(p.runs)??total(batting,'runs'),wickets=number(p.wickets)??total(bowling,'wickets'),conceded=number(p.conceded)??total(bowling,'runs');
 return {runs,wickets,conceded,points:(runs??0)+20*(wickets??0),batting:batting.length>0&&runs!==null,bowling:bowling.length>0&&wickets!==null,allround:batting.length>0&&bowling.length>0&&runs>0&&wickets>0};
}
export function teamWeekBasicRank(candidates,mode='overall'){
 const facts=new Map(candidates.map(p=>[p,rawAwardFigures(p)])),stable=(a,b)=>a.key.localeCompare(b.key);
 const sorted=[...candidates].filter(p=>mode==='batting'?facts.get(p).batting:mode==='bowling'?facts.get(p).bowling:mode==='allround'?facts.get(p).allround:true).sort((a,b)=>{
  const x=facts.get(a),y=facts.get(b);
  if(mode==='batting')return y.runs-x.runs||stable(a,b);
  if(mode==='bowling')return y.wickets-x.wickets||(x.conceded??Infinity)-(y.conceded??Infinity)||stable(a,b);
  return y.points-x.points||y.wickets-x.wickets||y.runs-x.runs||stable(a,b);
 });
 return sorted.map((p,i)=>{
  const f=facts.get(p),reason=[f.batting?`${f.runs} runs`:'',f.bowling?`${f.wickets}/${f.conceded??'—'}`:''].filter(Boolean).join(' · ')||'No recorded figures';
  return {...p,bowlingStandout:false,rank:i+1,points:mode==='batting'?f.runs:mode==='bowling'?f.wickets:f.points,reason};
 });
}
export function teamWeekBasicRecommendations(candidates){
 const used=new Set(),groups={batting:[],bowling:[],allround:[]};
 const take=(mode,count)=>{
  for(const p of teamWeekBasicRank(candidates,mode)){
   if(used.has(p.player_id))continue;
   const f=rawAwardFigures(p),both=f.batting&&f.bowling&&f.runs>=20&&f.wickets>0;
   used.add(p.player_id);groups[mode].push({...p,basicRole:mode,display:mode==='allround'||both?'both':mode});
   if(groups[mode].length===count)break;
  }
 };
 // Reserve the best combined contribution, then fill six batting and six bowling
 // places from the next eligible people. A second match cannot duplicate a person.
 take('allround',1);take('batting',6);take('bowling',6);
 const contenders=[...groups.batting,...groups.allround,...groups.bowling];
 return {mode:'basic',groups,contenders,shortlist:contenders,strong:[],proposed:[],clear:false,qualifying:contenders.length};
}
