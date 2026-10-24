// Translate the documented public summary into the app's shared scorecard shape.
// IDs have their own namespace. Appearance IDs are match-scoped until the provider
// confirms a stable cross-match player identifier; names never merge histories.
import {gameSummary,matchSchedule} from './public-api.mjs';
const valid=n=>Number.isInteger(n)&&n>=0&&n<=9999;
const number=n=>valid(n)?n:null;
const text=v=>String(v??'').trim().slice(0,200);
// A bowling team's appearances also include fielding-only records. Keep partial
// bowling records for review, but do not invent a spell for a catcher or keeper.
const hasBowling=statistics=>['OVERS','WICKETS','RUNS','MAIDENS','WIDES','NO_BALLS','ECONOMY','HAT_TRICKS'].some(key=>Object.hasOwn(statistics,key));
export async function sourceId(kind,match,id=match){
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`clubbatting:playhq:v1:${kind}:${match}:${id}`)));
 hash[6]=(hash[6]&15)|128;hash[8]=(hash[8]&63)|128;
 const h=[...hash.slice(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export async function sharedScorecard(body,context){
 const fixture=context.source_fixture,match=fixture.source_match_id,summary=gameSummary(body,match),game=body.data;
 if(summary.source_grade_id!==fixture.source_grade_id||!game.teams.some(t=>t.id===fixture.source_team_id))throw Error('Summary belongs to another grade or team');
 if(!summary.has_figures)return null;
 const days=matchSchedule(game.schedule,game.playingSurfaces||[],context.timezone);
 if(JSON.stringify(days.map(d=>d.date))!==JSON.stringify(fixture.days.map(d=>d.date)))throw Error('Review the changed playing dates before importing scores');
 const kind=String(game.type||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const format=({t20:'t20',twenty20:'t20',oneday:'limited_overs',limitedovers:'limited_overs',twoday:'long_form',multiday:'long_form',test:'long_form'})[kind]||null;
 if(format!==fixture.format)throw Error('Review the changed match format before importing scores');
 if(!['FINAL','IN_PROGRESS','INPROGRESS','LIVE','STUMPS'].includes(game.status))return null;
 if(game.teams.length!==2||summary.periods.length>10)throw Error('Unsupported match summary');
 const ids=new Map(),teamIds=new Map();
 for(const t of game.teams)teamIds.set(t.id,await sourceId('team',match,t.id));
 for(const a of game.appearances)ids.set(a.id,await sourceId('appearance',match,a.id));
 const teams=game.teams.map(t=>{
  const members=game.appearances.filter(a=>a.teamId===t.id&&a.roleType==='Player');
  const players=members.map(a=>({player_id:a.visible===true?ids.get(a.id):null,name:a.visible===true?text([a.firstName,a.lastName].filter(Boolean).join(' ')):null}));
  return {id:teamIds.get(t.id),name:text(t.name),organisation:text(t.organisation?.name),organisation_id:null,
   source_team_id:t.id,lineup_available:players.length>0&&players.length<=30&&players.every(p=>p.player_id&&p.name),players};
 });
 const warnings=[],innings=[],counts=new Map();
 for(const p of summary.periods){
  const batting=p.teams.filter(t=>t.discipline==='BATTING'),bowling=p.teams.filter(t=>t.discipline==='BOWLING');
  if(batting.length!==1||bowling.length>1||bowling[0]?.team_id===batting[0].team_id)throw Error('Unsupported innings structure');
  const bat=batting[0],bowl=bowling[0],complete=summary.complete||['ALL_OUT','DECLARED','COMPULSORY_CLOSE','END_OF_INNINGS','END_OF_GAME','END_OF_MATCH'].includes(bat.status);
  const nth=(counts.get(bat.team_id)||0)+1;counts.set(bat.team_id,nth);
  const batters=[...bat.players].sort((a,b)=>(a.position??99)-(b.position??99)).map(a=>{
   const s=a.statistics,dnb=a.status==='DID_NOT_BAT',notOut=['NOT_OUT','RETIRED_NOT_OUT','RETIRED_HURT'].includes(a.status),out=['OUT','RETIRED_OUT'].includes(a.status);
   return {player_id:a.name?ids.get(a.source_appearance_id):null,name:a.name,status:dnb?'did_not_bat':'played',runs:dnb?null:number(s.TOTAL_RUNS),
    not_out:notOut?true:out?false:null,balls:number(s.BALLS_FACED),fours:number(s.FOURS),sixes:number(s.SIXES),dismissal:text(a.status).replaceAll('_',' ').toLowerCase(),
    figures_valid:!!a.name&&(dnb||(notOut||out)&&valid(s.TOTAL_RUNS)),importable:!!a.name&&complete&&(dnb||(notOut||out)&&valid(s.TOTAL_RUNS))};
  });
  const bowlers=(bowl?.players||[]).filter(a=>hasBowling(a.statistics)).map(a=>({player_id:a.name?ids.get(a.source_appearance_id):null,name:a.name,team_id:teamIds.get(a.team_id),
   wickets:valid(a.statistics.WICKETS)&&a.statistics.WICKETS<=10?a.statistics.WICKETS:null,runs:number(a.statistics.RUNS),balls:a.balls_bowled,
   overs:a.balls_bowled===null?null:`${Math.floor(a.balls_bowled/6)}.${a.balls_bowled%6}`,maidens:number(a.statistics.MAIDENS),
   figures_valid:!!a.name&&valid(a.statistics.WICKETS)&&a.statistics.WICKETS<=10&&valid(a.statistics.RUNS),importable:!!a.name&&complete&&valid(a.statistics.WICKETS)&&a.statistics.WICKETS<=10&&valid(a.statistics.RUNS)}));
  if([...batters,...bowlers].some(a=>!a.name))warnings.push('Some player names are withheld by PlayHQ. Their figures remain unidentified.');
  if(!summary.complete)warnings.push('Match in progress. Season totals update after the match is final.');
  innings.push({id:await sourceId('innings',match,p.source_period_id),source_period_id:p.source_period_id,team_id:teamIds.get(bat.team_id),number:nth,
   name:text(p.name),complete,closure:text(bat.status),runs:number(bat.statistics.TOTAL_SCORE),wickets:number(bat.statistics.TOTAL_OUTS),extras:number(bat.statistics.TOTAL_EXTRAS),
   batters,bowlers,bowling_available:!!bowl});
 }
 const winner=game.teams.filter(t=>t.outcome==='WON'),loser=game.teams.filter(t=>t.outcome==='LOST');
 const result=summary.complete&&winner.length===1&&loser.length===1&&winner[0].id!==loser[0].id?`${text(winner[0].name)} won`:'';
 return {schema_version:2,provider:'playhq_au',match_id:await sourceId('match',match),upstream_match_id:match,upstream_grade_id:fixture.source_grade_id,
  upstream_team_id:fixture.source_team_id,our_team_id:teamIds.get(fixture.source_team_id),url:null,status:summary.complete?'completed':'in_progress',source_status:game.status,
  dates:fixture.days.map(d=>d.date),format_key:fixture.format,format_label:fixture.format,grade:context.grade,competition:context.competition,
  venue:fixture.days[0]?.ground||'',result,teams,innings,warnings:[...new Set(warnings)]};
}
