import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {summaryMargin} from '../Functions/playhq-sync/result-margin.mjs';
import {sharedScorecard} from '../Functions/playhq-sync/shared-scorecard.mjs';
function fixture({chase=false,runs=20,outs=4,players=11}={}){
 const game={type:'T20',teams:[{id:'a',outcome:chase?'LOST':'WON'},{id:'b',outcome:chase?'WON':'LOST'}],appearances:Array.from({length:players},(_,i)=>({id:'player-'+i,teamId:'b',roleType:'Player'}))};
 const summary={complete:true,periods:[{sequence:1,teams:[{team_id:'a',discipline:'BATTING',status:'COMPULSORY_CLOSE',statistics:{TOTAL_SCORE:150,TOTAL_OUTS:5,TOTAL_OVERS:20,OVER_LIMIT:20}}]},{sequence:2,teams:[{team_id:'b',discipline:'BATTING',status:chase?'END_OF_MATCH':'ALL_OUT',statistics:{TOTAL_SCORE:chase?151:150-runs,TOTAL_OUTS:chase?outs:10,TOTAL_OVERS:18.3,OVER_LIMIT:20}}]}]};
 return {game,summary};
}
test('ordinary completed limited-overs margins follow the declared winner and innings order',()=>{
 for(const [options,expected] of [[{},'20 runs'],[{runs:1},'1 run'],[{chase:true},'6 wickets'],[{chase:true,outs:9},'1 wicket'],[{chase:true,outs:0},'10 wickets'],[{chase:true,outs:1,players:12},'9 wickets'],[{chase:true,outs:1,players:8},'6 wickets']]){
  const {game,summary}=fixture(options),before=JSON.stringify({game,summary});assert.equal(summaryMargin(game,summary),expected);summary.periods.reverse();assert.equal(summaryMargin(game,summary),expected);summary.periods.reverse();assert.equal(JSON.stringify({game,summary}),before);
 }
});
test('unknown, corrected, adjusted and unfinished data never become guessed margins',()=>{
 const changes=[
  ({summary})=>summary.complete=false,({game})=>game.type='TWO_DAY',({game})=>game.teams[0].outcome='TIED',
  ({game})=>game.resultMethod='DLS',({game})=>game.teams[0].resultMethod='Duckworth Lewis',({game})=>game.target=140,({summary})=>summary.periods[0].teams[0].statistics.EXTRA_PENALTY_RUNS=5,
  ({summary})=>summary.periods[1].teams[0].statistics.REVISED_TARGET=110,
  ({summary})=>summary.periods[1].teams[0].statistics.OVER_LIMIT=18,
  ({summary})=>delete summary.periods[0].teams[0].statistics.OVER_LIMIT,
  ({summary})=>summary.periods.push(structuredClone(summary.periods[0])),
  ({summary})=>summary.periods[1].sequence=1,
  ({summary})=>summary.periods[1].teams[0].statistics.TOTAL_SCORE=155,
  ({summary})=>{summary.periods[0].teams[0].status='IN_PROGRESS';summary.periods[0].teams[0].statistics.TOTAL_OVERS=10;},
  ({summary})=>summary.periods[1].teams[0].statistics.TOTAL_SCORE=null,
 ];
 for(const change of changes){const f=fixture();change(f);assert.equal(summaryMargin(f.game,f.summary),'',String(change));}
 for(const change of [f=>f.game.appearances=[],f=>f.game.appearances[1].id=f.game.appearances[0].id,f=>f.summary.periods[1].teams[0].status='ALL_OUT',f=>f.summary.periods[1].teams[0].statistics.TOTAL_OUTS=10]){
  const f=fixture({chase:true});change(f);assert.equal(summaryMargin(f.game,f.summary),'');
 }
 const f=fixture();f.summary.periods[1].teams[0].statistics.TOTAL_SCORE=125;assert.equal(summaryMargin(f.game,f.summary),'25 runs');
 assert.equal(summaryMargin({},{}),'');
});
test('the shared PlayHQ importer retains the margin and recalculates corrected sources',async()=>{
 const body=JSON.parse(await readFile(new URL('./fixtures/playhq/summary-v2.json',import.meta.url),'utf8')),g=body.data;
 const bat=g.periods.map(p=>p.teams.find(t=>t.discipline==='BATTING'));
 const set=(t,k,value)=>{t.statistics=t.statistics.filter(s=>s.type!==k);t.statistics.push({type:k,value});};
 g.status='FINAL';g.type='T20';g.periods.forEach((p,i)=>p.sequence=i+1);
 // Public summaries use teamId in period entries.
 const firstId=bat[0].teamId||bat[0].id;g.teams.forEach(t=>t.outcome=t.id===firstId?'WON':'LOST');
 for(const [i,t] of bat.entries()){t.status=i?'ALL_OUT':'COMPULSORY_CLOSE';set(t,'OVER_LIMIT',20);set(t,'TOTAL_OVERS',20);set(t,'TOTAL_SCORE',i?130:150);set(t,'TOTAL_OUTS',i?10:5);}
 const context={timezone:'Australia/Melbourne',grade:'Example grade',source_fixture:{source_match_id:g.id,source_grade_id:g.gradeId,source_team_id:g.teams[0].id,format:'t20',days:[{date:'2023-11-25'}]}};
 const card=await sharedScorecard(body,context);assert.match(card.result,/ won by 20 runs$/);assert.equal(card.result_margin_basis,'calculated_from_playhq_innings');
 set(bat[1],'TOTAL_SCORE',129);const corrected=await sharedScorecard(body,context);assert.equal(corrected.match_id,card.match_id);assert.match(corrected.result,/ won by 21 runs$/);
 g.status='STUMPS';assert.equal((await sharedScorecard(body,context)).result,'');
});
