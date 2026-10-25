import test from 'node:test';
import assert from 'node:assert/strict';
import {awardBalls,awardPerformance} from '../award-performance.js';
import {teamWeekRank,teamWeekRecommendations} from '../team-of-week.js';
import {playerWeekRecommendations} from '../player-week-ranking.js';

// Fictional identities; performance cases exercise the reported ranking failure.
const candidate=(id,runs,wickets,conceded,extra={})=>({key:id,player_id:id,name:'Test '+id,snapshot_id:'snapshot-'+id,match_id:'match-'+id,team_id:'club',grade:'Test Grade',format:'limited_overs',runs,wickets,conceded,batting:runs?[{player_id:id,runs,balls:null,not_out:false}]:[],bowling:wickets?[{player_id:id,wickets,runs:conceded,balls:null,team_id:'club'}]:[],...extra});
function chase(p,{opposition=75,total=79,remainingRuns=14,remainingBalls=15,oppositionBalls=214,otherWickets=9,otherBowlingBalls=166,otherConceded=69}={}){
 return {snapshot_id:p.snapshot_id,our_team:p.team_id,scorecard:{match_id:p.match_id,schema_version:2,status:'completed',format_key:p.format,result:'Test Club won',teams:[{id:'club',name:'Test Club'},{id:'opposition',name:'Visitors'}],innings:[
  {team_id:'opposition',number:1,complete:true,runs:opposition,wickets:p.wickets+otherWickets,batters:[{player_id:'opposition-batter',runs:opposition,balls:oppositionBalls,status:'played'}],bowlers:[...p.bowling,{player_id:'other-bowler',wickets:otherWickets,runs:otherConceded,balls:otherBowlingBalls}]},
  {team_id:'club',number:1,complete:true,runs:total,wickets:0,batters:[...p.batting,{player_id:'partner',runs:remainingRuns,balls:remainingBalls,status:'played'}],bowlers:[]}
 ]}};
}
const finisher=candidate('fast-finisher',60,1,5,{batting:[{player_id:'fast-finisher',runs:60,balls:30,not_out:true,dismissal:'not out'}],bowling:[{player_id:'fast-finisher',wickets:1,runs:5,balls:48,maidens:5}]});
const allrounder=candidate('two-skills',38,2,22,{format:'t20',batting:[{player_id:'two-skills',runs:38,balls:31,not_out:false}],bowling:[{player_id:'two-skills',wickets:2,runs:22,balls:24}]});
const spell=candidate('three-wickets',0,3,14,{format:'t20',bowling:[{player_id:'three-wickets',wickets:3,runs:14,balls:24}]});
const cards=[chase(finisher),chase(allrounder,{opposition:109,total:110,remainingRuns:72,remainingBalls:65,oppositionBalls:120,otherWickets:2,otherBowlingBalls:96,otherConceded:83}),chase(spell,{opposition:114,total:115,remainingRuns:115,remainingBalls:100,oppositionBalls:120,otherWickets:4,otherBowlingBalls:96,otherConceded:100})];

test('fast unbeaten small-chase innings and sustained control outrank a three-wicket-only return',()=>{
 const rows=teamWeekRank([spell,allrounder,finisher],'overall',cards);
 assert.deepEqual(rows.map(p=>p.key),[finisher.key,allrounder.key,spell.key]);
 const r=awardPerformance(finisher,cards);
 assert.ok(r.components.pace>0&&r.components.share>0&&r.components.finish>0&&r.components.control>0);
 assert.match(r.reason,/60 runs from 30 · SR 200/);assert.match(r.reason,/1\/5 in 8 overs · Econ 0.63/);assert.match(r.reason,/76% of 79/);
 assert.ok(teamWeekRank([finisher],'allround',cards).length,'A one-wicket contribution is not discarded');
 const other=candidate('other-spell',0,3,36);
 assert.ok(teamWeekRank([other,finisher],'overall',cards)[0].key===finisher.key);
});
test('both awards use the same context and leave the winner to the club',()=>{
 const pool=[spell,allrounder,finisher],before=JSON.stringify({pool,cards});
 const team=teamWeekRank(pool,'overall',cards),player=playerWeekRecommendations(pool,{},[],'2026-10-25',false,cards);
 assert.deepEqual(player.all.map(p=>[p.key,p.points]),team.map(p=>[p.key,p.points]));
 assert.ok(player.shortlist.some(p=>p.key===finisher.key&&p.reasons.includes('All-round contribution')));
 assert.equal(player.winner,undefined);assert.equal(JSON.stringify({pool,cards}),before);
 assert.ok(teamWeekRecommendations(pool,[],cards).strong.some(p=>p.key===finisher.key));
});
test('unrelated weekly leaders and award scope never change a performance rating',()=>{
 const points=teamWeekRank([finisher],'overall',cards)[0].points;
 const expanded=teamWeekRank([finisher,candidate('outlier',250,10,0)],'overall',cards);
 assert.equal(expanded.find(p=>p.key===finisher.key).points,points);
});
test('eight economical overs receive more credit than a one-over cameo',()=>{
 const long=awardPerformance(finisher),short=awardPerformance({...finisher,bowling:[{...finisher.bowling[0],balls:6}]});
 assert.ok(long.bowlingPoints>short.bowlingPoints);assert.equal(short.components.control,0);
 assert.equal(awardBalls({overs:'7.5'}),47);assert.equal(awardBalls({overs:'8.0'}),48);assert.equal(awardBalls({overs:'7.6'}),null);
 assert.equal(awardBalls({balls:0,overs:'8'}),0,'Recorded balls take precedence');
});
test('economy is compared with the other bowlers in the same innings',()=>{
 const low=chase(spell,{otherConceded:20}),high=chase(spell,{otherConceded:120});
 assert.ok(awardPerformance(spell,[high]).bowlingPoints>awardPerformance(spell,[low]).bowlingPoints);
 const fast={...spell,bowling:[{...spell.bowling[0],balls:12}]},slow={...spell,bowling:[{...spell.bowling[0],balls:48}]};
 assert.ok(awardPerformance(fast,[chase(fast)]).components.strike>awardPerformance(slow,[chase(slow)]).components.strike);
});
test('the same fast innings matters more when it supplies most of a completed small chase',()=>{
 const small=awardPerformance(finisher,[cards[0]]),large=awardPerformance(finisher,[chase(finisher,{total:301,opposition:300,remainingRuns:236,remainingBalls:265,oppositionBalls:300})]);
 assert.ok(small.components.share>large.components.share);
 assert.ok(small.points>large.points);
 const slow={...finisher,batting:[{...finisher.batting[0],balls:90}]};
 assert.ok(small.components.pace>awardPerformance(slow,[chase(slow)]).components.pace);
});
test('unknown, zero and partial figures do not manufacture rates or chase facts',()=>{
 for(const balls of [null,undefined,0]){
  const p={...finisher,batting:[{...finisher.batting[0],balls}],bowling:[{...finisher.bowling[0],balls}]};
  const r=awardPerformance(p);
  assert.ok(Number.isFinite(r.points));assert.equal(r.components.pace,0);assert.equal(r.components.control,0);
  assert.doesNotMatch(r.reason,/SR|Econ|completed chase|NaN|Infinity/);
 }
 const partial=awardPerformance({...finisher,bowling:[{wickets:1,balls:48,runs:null}]});assert.doesNotMatch(partial.reason,/Econ/);
 const incompletePeers=structuredClone(cards[0]);incompletePeers.scorecard.innings[0].bowlers[1].balls=null;
 assert.equal(awardPerformance(finisher,[incompletePeers]).components.control,awardPerformance(finisher).components.control,'Incomplete peers use only the disclosed format guide');
});
test('context matches source identities, not names, grades or arbitrary supplied opinions',()=>{
 for(const edit of [c=>c.snapshot_id='another',c=>c.our_team='another',c=>c.scorecard.match_id='another']){
  const card=structuredClone(cards[0]);edit(card);const r=awardPerformance(finisher,[card]);
  assert.equal(r.components.share,0);assert.equal(r.components.finish,0);
 }
 const base=awardPerformance(finisher,cards);
 const opinions={...finisher,grade:'1st Grade',opposition_rank:1,pitch:'very difficult',match_context:'best innings ever'};
 assert.equal(awardPerformance(opinions,cards).points,base.points);
 assert.doesNotMatch(base.reason,/pitch|pressure|strong opposition|opener|table/i);
});
test('unfinished games, losses, retired batters and long-form matches receive no chase-finish bonus',()=>{
 for(const edit of [c=>c.scorecard.status='in_progress',c=>c.scorecard.award_provisional=true,c=>c.scorecard.innings[0].complete=false,c=>c.scorecard.result='Visitors won',c=>c.scorecard.format_key='long_form']){
  const card=structuredClone(cards[0]);edit(card);assert.equal(awardPerformance(finisher,[card]).components.finish,0);
 }
 const retired={...finisher,batting:[{...finisher.batting[0],dismissal:'retired not out'}]};assert.equal(awardPerformance(retired,[chase(retired)]).components.finish,0);
 const long=structuredClone(cards[0]);long.scorecard.format_key='long_form';assert.equal(awardPerformance(finisher,[long]).components.pace,0);
});
test('context credits stay bounded and do not turn a tiny not-out into a major performance',()=>{
 const tiny=candidate('tiny',2,0,0,{batting:[{player_id:'tiny',runs:2,balls:1,not_out:true}]});
 assert.ok(awardPerformance(tiny,[chase(tiny,{total:2,opposition:1,remainingRuns:0})]).points<3);
 const r=awardPerformance(finisher,cards);
 assert.ok(r.components.pace<=60*.25&&r.components.share<=60*.3&&r.components.finish<=6&&r.components.control<=20&&r.components.strike<=20*.15);
});
