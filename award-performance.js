/* A transparent award guide, not a grade-conversion or selection model.
   Keep source figures intact. Missing context supplies no invented match facts. */
const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):null;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const round=value=>Math.round(value*10)/10;
const sum=(rows,key)=>rows.reduce((total,row)=>total+(number(row[key])??0),0);
export function awardBalls(row){
 const balls=number(row.balls);
 if(balls!==null)return Number.isInteger(balls)?balls:null;
 // Cricket's 7.5 overs means 47 balls, never 7.5 decimal overs.
 const overs=/^(\d+)(?:\.([0-5]))?$/.exec(String(row.overs??''));
 return overs?Number(overs[1])*6+Number(overs[2]||0):null;
}
function battingRate(rows,minBalls){
 const innings=rows.filter(row=>row.status!=='did_not_bat');
 if(!innings.length||innings.some(row=>number(row.runs)===null||!Number.isInteger(number(row.balls))||number(row.balls)===0&&number(row.runs)>0))return null;
 const balls=sum(innings,'balls');
 return balls>=minBalls?sum(innings,'runs')/balls:null;
}
function bowlingRate(rows){
 if(!rows.length||rows.some(row=>awardBalls(row)===null||number(row.runs)===null||awardBalls(row)===0&&(number(row.runs)>0||number(row.wickets)>0)))return null;
 const balls=rows.reduce((total,row)=>total+awardBalls(row),0);
 return balls>=18?{rate:sum(rows,'runs')/balls,balls,wickets:rows.every(row=>number(row.wickets)!==null)?sum(rows,'wickets'):null}:null;
}
const overs=balls=>`${Math.floor(balls/6)}${balls%6?'.'+balls%6:''}`;
const won=(card,team)=>{
 const name=card.teams?.find(t=>t.id===team)?.name;
 return name&&String(card.result||'').toLowerCase().startsWith(name.toLowerCase()+' won');
};
export function awardPerformance(p,cards=[]){
 const batting=p.batting||[],bowling=p.bowling||[],runs=number(p.runs)??sum(batting,'runs'),wickets=number(p.wickets)??sum(bowling,'wickets');
 const matches=cards.filter(c=>c.snapshot_id===p.snapshot_id&&c.our_team===p.team_id&&c.scorecard?.match_id===p.match_id);
 const card=matches.length===1?matches[0].scorecard:null;
 const format=card?.format_key||p.format;
 const limited=['limited_overs','t20'].includes(format);
 // Rates are judged within this match, never against a generic format or grade.
 const innings=card?.innings||[],ourInnings=innings.filter(i=>i.team_id===p.team_id);
 const otherBatters=innings.flatMap(i=>i.batters||[]).filter(b=>b.player_id!==p.player_id);
 const matchBatRate=innings.length&&innings.every(i=>i.batters?.length)?battingRate(otherBatters,30):null;
 const notes=[],battingComparisons=[],bowlingComparisons=[],components={runs,wickets:wickets*20,pace:0,share:0,finish:0,control:0,strike:0};
 for(const [index,b] of batting.entries()){
  const value=number(b.runs)??0,balls=number(b.balls),rate=balls>0?value/balls:null;
  const linked=ourInnings.filter(i=>(i.batters||[]).some(x=>x.player_id===p.player_id&&x.runs===b.runs&&x.balls===b.balls&&x.not_out===b.not_out));
  const inning=linked.length===1?linked[0]:null;
  if(inning&&rate!==null&&matchBatRate!==null)battingComparisons[index]=`SR ${(100*rate).toFixed(0)} vs rest of match ${(100*matchBatRate).toFixed(0)}`;
  // No slow-batting penalty: an anchor in a difficult match can be valuable.
  // Half the runs above the other batters' rate over these balls, bounded by
  // half this innings' runs. Unlike the old bonus, it keeps distinguishing
  // twice the match rate from four or six times it.
  if(limited&&inning&&value>=20&&balls>=10&&matchBatRate!==null)components.pace+=value*.5*clamp(1-matchBatRate/rate,0,1);
  if(value>0&&inning?.complete&&number(inning.runs)>=value){
   const share=value/inning.runs;
   components.share+=value*.3*share;
   if(share>=.3)notes.push(`${Math.round(share*100)}% of ${inning.runs}`);
  }
  // Only an unambiguous completed two-innings limited-overs win earns finishing credit.
  // Do not infer a target, pitch difficulty, batting position or wickets at entry.
  const chase=limited&&card?.status==='completed'&&!card.award_provisional&&innings.length===2&&innings.every(i=>i.complete)&&inning===innings[1]&&innings[0].team_id!==p.team_id&&won(card,p.team_id)&&!/retired|hurt|absent/i.test(`${b.dismissal||''} ${b.dismissal_text||''}`);
  if(chase&&b.not_out===true&&value>0){components.finish+=Math.min(6,value*.1);notes.push('Not out in completed chase');}
 }
 for(const [index,b] of bowling.entries()){
  const balls=awardBalls(b),conceded=number(b.runs),taken=number(b.wickets)??0;
  if(!balls||conceded===null)continue;
  const linked=innings.filter(i=>i.team_id!==p.team_id&&(i.bowlers||[]).some(x=>x.player_id===p.player_id&&x.runs===b.runs&&x.wickets===b.wickets&&awardBalls(x)===balls));
  const peers=linked.length===1?bowlingRate((linked[0].bowlers||[]).filter(x=>x.player_id!==p.player_id)):null;
  // Compare total conceded / total legal balls, never an unweighted average of
  // individual economies. Exclude this bowler and the opposition's attack.
  if(peers)bowlingComparisons[index]=`Econ ${(6*conceded/balls).toFixed(2)} vs team-mates ${(6*peers.rate).toFixed(2)}`;
  // One point per run below the rest-of-attack rate over this actual spell.
  // The six-points-per-over and 60-per-innings ceilings stop a brief spell or
  // an extreme peer rate overwhelming the guide. Missing peers earn no credit.
  if(balls>=12&&peers)components.control+=Math.min(60,balls,Math.max(0,peers.rate*balls-conceded));
  if(taken>0&&peers?.wickets>=2){
   const peerStrike=peers.balls/peers.wickets;
   components.strike+=taken*20*.15*clamp(1-balls/taken/peerStrike,0,1);
  }
 }
 const batBalls=batting.length&&batting.every(b=>number(b.balls)!==null)?sum(batting,'balls'):null;
 const bowlBalls=bowling.length&&bowling.every(b=>awardBalls(b)!==null)?bowling.reduce((n,b)=>n+awardBalls(b),0):null;
 const conceded=bowling.length&&bowling.every(b=>number(b.runs)!==null)?sum(bowling,'runs'):null;
 const battingPoints=runs+components.pace+components.share+components.finish,bowlingPoints=components.wickets+components.control+components.strike;
 const allround=runs>=20&&(wickets>=1||components.control>=8);
 const bowlingStandout=wickets>=2||components.control>=20;
 const strikeRate=batting.length===1&&battingComparisons[0]||batBalls>0&&`SR ${(100*runs/batBalls).toFixed(0)}`;
 const economy=bowling.length===1&&bowlingComparisons[0]||bowlBalls>0&&conceded!==null&&`Econ ${(6*conceded/bowlBalls).toFixed(2)}`;
 const comparisons=[...(batting.length>1?battingComparisons.flatMap((text,index)=>text?[`Batting innings ${index+1}: ${text}`]:[]):[]),...(bowling.length>1?bowlingComparisons.flatMap((text,index)=>text?[`Bowling innings ${index+1}: ${text}`]:[]):[])];
 const reason=[runs?`${runs} runs${batBalls>0?` from ${batBalls} · ${strikeRate}`:''}`:'',bowling.length?`${wickets}/${conceded??p.conceded??'—'}${bowlBalls>0?` in ${overs(bowlBalls)} overs${economy?` · ${economy}`:''}`:''}`:'',...notes,...comparisons].filter(Boolean).join(' · ')||'No runs or wickets';
 return {points:round(battingPoints+bowlingPoints),battingPoints:round(battingPoints),bowlingPoints:round(bowlingPoints),allround,bowlingStandout,components,reason};
}
