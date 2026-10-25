import {awardPerformance} from './award-performance.js?v=0.8.62.266';
import {rawAwardFigures} from './team-week-basic.js?v=0.8.62.270';
/* Suggestions cover different kinds of achievement; the club chooses the winner. */
export function playerWeekFigures(p){
 const batting=(p.batting||[]).map(b=>`${b.runs}${b.not_out?'*':''}`).join(' & '),bowling=(p.bowling||[]).map(b=>`${b.wickets}/${b.runs}`).join(' & ');
 return {batting,bowling,text:[batting&&`${batting} runs`,bowling&&`${bowling} bowling`].filter(Boolean).join(' · ')};
}
function basicPerformance(p){
 const f=rawAwardFigures(p);
 return {points:f.points,battingPoints:f.runs??0,bowlingPoints:20*(f.wickets??0),allround:f.allround,bowlingStandout:false,reason:`${f.points} raw points`,rawConceded:f.conceded,rawRuns:f.runs,rawWickets:f.wickets};
}
function uniquePeople(rows){const seen=new Set();return rows.filter(p=>{if(seen.has(p.player_id))return false;seen.add(p.player_id);return true;});}
function flagStandouts(rows){
 const people=uniquePeople(rows.filter(p=>p.points>0));
 // A visible guide to separation, never an automatic winner. Require another
 // person to compare, a worthwhile score, and a clear gap after a small group.
 for(let n=1;n<=Math.min(3,people.length-1);n++){
  const first=people[0],last=people[n-1],next=people[n],gap=Math.max(12,last.points*.2);
  if(last.points<60||first.points-last.points>Math.max(12,first.points*.2)||last.points-next.points<gap)continue;
  for(const p of people.slice(0,n))p.standout=true;
  return;
 }
}
export function playerWeekRecommendations(candidates,profiles={},history=[],end,preferNew=false,cards=[],mode='smart'){
 const basic=mode==='basic';
 const number=v=>Number.isFinite(Number(v))?Number(v):0;
 const latest=new Map();for(const e of [...history].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))))if(!latest.has(e.week_end))latest.set(e.week_end,e);
 const recent=[...latest.values()].filter(e=>e.week_end<end&&(new Date(end+'T12:00:00Z')-new Date(e.week_end+'T12:00:00Z'))/86400000<=28);
 const rows=candidates.map(p=>{
  const rating=basic?basicPerformance(p):awardPerformance(p,cards),profile=profiles[p.player_id]||{},prior=(p.previous||[]).filter(q=>p.format&&q.format===p.format&&q.grade===p.grade),bats=prior.filter(q=>q.batting?.length),bowls=prior.filter(q=>q.bowling?.length);
  const avg=(xs,key)=>xs.reduce((n,q)=>n+number(q[key]),0)/xs.length;
  const runAverage=bats.length>=3?avg(bats,'runs'):null,wicketAverage=bowls.length>=3?avg(bowls,'wickets'):null;
  const aboveBat=runAverage!==null&&p.runs>=25&&p.runs>=Math.max(runAverage*1.5,runAverage+15),aboveBowl=wicketAverage!==null&&p.wickets>=2&&p.wickets>=Math.max(wicketAverage*1.5,wicketAverage+1);
  return {...p,profile,...rating,runAverage,wicketAverage,priorBatCount:bats.length,priorBowlCount:bowls.length,aboveForm:!basic&&(aboveBat||aboveBowl),recentWins:recent.filter(e=>e.winner?.player_id===p.player_id).map(e=>e.week_end),reasons:[],standout:false};
 }).sort((a,b)=>b.points-a.points||(basic?b.rawWickets-a.rawWickets:b.wickets-a.wickets)||(basic?b.rawRuns-a.rawRuns:b.runs-a.runs)||(basic?(a.rawConceded??Infinity)-(b.rawConceded??Infinity):0)||a.key.localeCompare(b.key));
 rows.forEach((p,i)=>{p.rank=i+1;});flagStandouts(rows);
 const leaders=uniquePeople(rows.filter(p=>p.points>0)),cutoff=leaders[4]?.points;
 const leading=leaders.filter((p,i)=>i<5||p.points===cutoff);
 if(basic)return {shortlist:leading,all:rows,standouts:rows.filter(p=>p.standout)};
 const chosen=new Map(),worth=p=>p.runs>=25||p.wickets>=2||(p.runs>=20&&p.wickets>=1)||p.bowlingStandout;
 const add=(p,reason)=>{if(!p)return;const old=chosen.get(p.player_id);if(old){if(reason&&old.key===p.key&&!old.reasons.includes(reason))old.reasons.push(reason);return;}if(reason)p.reasons.push(reason);chosen.set(p.player_id,p);};
 const pool=rows.filter(worth);
 const prioritise=xs=>preferNew?[...xs].sort((a,b)=>Number(!!a.recentWins.length)-Number(!!b.recentWins.length)):xs;
 for(const p of leading)add(p);
 for(const p of prioritise([...pool].sort((a,b)=>b.battingPoints-a.battingPoints)).filter(p=>p.runs>=25).slice(0,2))add(p,'Batting option');
 for(const p of prioritise([...pool].sort((a,b)=>b.bowlingPoints-a.bowlingPoints)).filter(p=>p.bowlingStandout).slice(0,2))add(p,'Bowling option');
 add(prioritise(pool).find(p=>p.allround),'All-round contribution');
 const grades=new Set();for(const p of prioritise(pool)){if(grades.has(p.grade))continue;grades.add(p.grade);add(p,'Strong performance in '+p.grade);}
 for(const p of prioritise(pool).filter(p=>p.aboveForm).slice(0,2))add(p,'Above recent returns');
 for(const p of prioritise(rows).filter(p=>p.profile.stage==='emerging'&&(p.runs>=15||p.wickets>=1)).slice(0,2))add(p,'Emerging player to consider');
 const shortlist=prioritise([...chosen.values()]).sort((a,b)=>(preferNew?Number(!!a.recentWins.length)-Number(!!b.recentWins.length):0)||b.points-a.points);
 return {shortlist,all:rows,standouts:rows.filter(p=>p.standout)};
}
