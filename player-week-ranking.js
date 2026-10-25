import {awardPerformance} from './award-performance.js?v=0.8.62.265';
/* Suggestions cover different kinds of achievement; the club chooses the winner. */
export function playerWeekFigures(p){
 const batting=(p.batting||[]).map(b=>`${b.runs}${b.not_out?'*':''}`).join(' & '),bowling=(p.bowling||[]).map(b=>`${b.wickets}/${b.runs}`).join(' & ');
 return {batting,bowling,text:[batting&&`${batting} runs`,bowling&&`${bowling} bowling`].filter(Boolean).join(' · ')};
}
export function playerWeekRecommendations(candidates,profiles={},history=[],end,preferNew=false,cards=[]){
 const number=v=>Number.isFinite(Number(v))?Number(v):0;
 const latest=new Map();for(const e of [...history].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))))if(!latest.has(e.week_end))latest.set(e.week_end,e);
 const recent=[...latest.values()].filter(e=>e.week_end<end&&(new Date(end+'T12:00:00Z')-new Date(e.week_end+'T12:00:00Z'))/86400000<=28);
 const rows=candidates.map(p=>{
  const rating=awardPerformance(p,cards),profile=profiles[p.player_id]||{},prior=(p.previous||[]).filter(q=>p.format&&q.format===p.format&&q.grade===p.grade),bats=prior.filter(q=>q.batting?.length),bowls=prior.filter(q=>q.bowling?.length);
  const avg=(xs,key)=>xs.reduce((n,q)=>n+number(q[key]),0)/xs.length;
  const runAverage=bats.length>=3?avg(bats,'runs'):null,wicketAverage=bowls.length>=3?avg(bowls,'wickets'):null;
  const aboveBat=runAverage!==null&&p.runs>=25&&p.runs>=Math.max(runAverage*1.5,runAverage+15),aboveBowl=wicketAverage!==null&&p.wickets>=2&&p.wickets>=Math.max(wicketAverage*1.5,wicketAverage+1);
  return {...p,profile,...rating,runAverage,wicketAverage,priorBatCount:bats.length,priorBowlCount:bowls.length,aboveForm:aboveBat||aboveBowl,recentWins:recent.filter(e=>e.winner?.player_id===p.player_id).map(e=>e.week_end),reasons:[]};
 }).sort((a,b)=>b.points-a.points||b.wickets-a.wickets||a.conceded-b.conceded||b.runs-a.runs||a.key.localeCompare(b.key));
 const chosen=new Map(),worth=p=>p.runs>=25||p.wickets>=2||(p.runs>=20&&p.wickets>=1);
 const add=(p,reason)=>{if(!p)return;const old=chosen.get(p.player_id);if(old){if(old.key===p.key&&!old.reasons.includes(reason))old.reasons.push(reason);return;}p.reasons.push(reason);chosen.set(p.player_id,p);};
 const pool=rows.filter(worth);
 const prioritise=xs=>preferNew?[...xs].sort((a,b)=>Number(!!a.recentWins.length)-Number(!!b.recentWins.length)):xs;
 for(const p of prioritise([...pool].sort((a,b)=>b.battingPoints-a.battingPoints)).filter(p=>p.runs>=25).slice(0,2))add(p,'Standout batting');
 for(const p of prioritise([...pool].sort((a,b)=>b.bowlingPoints-a.bowlingPoints)).filter(p=>p.wickets>=2).slice(0,2))add(p,'Standout bowling');
 add(prioritise(pool).find(p=>p.allround),'All-round contribution');
 const grades=new Set();for(const p of prioritise(pool)){if(grades.has(p.grade))continue;grades.add(p.grade);add(p,'Strong performance in '+p.grade);}
 for(const p of prioritise(pool).filter(p=>p.aboveForm).slice(0,2))add(p,'Above recent returns');
 for(const p of prioritise(rows).filter(p=>p.profile.stage==='emerging'&&(p.runs>=15||p.wickets>=1)).slice(0,2))add(p,'Emerging player to consider');
 const shortlist=prioritise([...chosen.values()]).sort((a,b)=>(preferNew?Number(!!a.recentWins.length)-Number(!!b.recentWins.length):0)||b.points-a.points);
 return {shortlist,all:rows};
}
