import test from 'node:test';
import assert from 'node:assert/strict';
import {awardBalls,awardPerformance} from '../award-performance.js';
import {teamWeekRank,teamWeekRecommendations,teamWeekDisplay} from '../team-of-week.js';
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
 const cameo={...finisher,bowling:[{...finisher.bowling[0],balls:6}]};
 const long=awardPerformance(finisher,[chase(finisher)]),short=awardPerformance(cameo,[chase(cameo)]);
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
 assert.equal(awardPerformance(finisher,[incompletePeers]).components.control,0,'Incomplete peers cannot establish relative economy');
 assert.equal(awardPerformance(finisher).components.pace,0);assert.equal(awardPerformance(finisher).components.control,0,'There is no generic cross-grade rate bonus');
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
 assert.ok(r.components.pace<=60*.5&&r.components.share<=60*.3&&r.components.finish<=6&&r.components.control<=60&&r.components.strike<=20*.15);
});

test('three wickets in a high-scoring innings can outrank cheaper figures when the whole attack was economical',()=>{
 const high=candidate('high-total',0,3,25,{bowling:[{player_id:'high-total',wickets:3,runs:25,balls:60}]}),low=candidate('low-total',0,3,14,{bowling:[{player_id:'low-total',wickets:3,runs:14,balls:36}]});
 const highCard=chase(high,{opposition:280,otherConceded:255,otherBowlingBalls:240,otherWickets:4}),lowCard=chase(low,{opposition:78,otherConceded:60,otherBowlingBalls:144,otherWickets:7});
 assert.ok(awardPerformance(high,[highCard]).bowlingPoints>awardPerformance(low,[lowCard]).bowlingPoints);
 assert.match(awardPerformance(high,[highCard]).reason,/Econ 2.50 vs team-mates 6.38/);
 assert.match(awardPerformance(low,[lowCard]).reason,/Econ 2.33 vs team-mates 2.50/);
});

test('sustained control can outrank more wickets and qualify for both awards with one or no wickets',()=>{
 const economical=candidate('one-wicket-control',0,1,20,{batting:[{runs:0,balls:1,not_out:false}],bowling:[{player_id:'one-wicket-control',wickets:1,runs:20,balls:60}]}),zero=candidate('wicketless-control',0,0,15,{batting:[{runs:0,balls:1,not_out:false}],bowling:[{player_id:'wicketless-control',wickets:0,runs:15,balls:60}]}),three=candidate('three-in-collapse',0,3,14,{bowling:[{player_id:'three-in-collapse',wickets:3,runs:14,balls:36}]});
 const cs=[chase(economical,{otherConceded:260,otherBowlingBalls:240,otherWickets:7}),chase(zero,{otherConceded:260,otherBowlingBalls:240,otherWickets:7}),chase(three,{otherConceded:60,otherBowlingBalls:144,otherWickets:7})],pool=[economical,zero,three];
 const ranked=teamWeekRank(pool,'bowling',cs);
 assert.equal(ranked[0].key,economical.key,'One wicket plus an exceptional ten-over spell can beat three wickets in a collapse');
 for(const p of [economical,zero]){
  assert.ok(teamWeekRecommendations(pool,[],cs).contenders.some(x=>x.key===p.key));
  assert.ok(playerWeekRecommendations([p],{},[],'2026-10-25',false,cs).shortlist.some(x=>x.key===p.key&&x.reasons.includes('Bowling option')));
  assert.equal(teamWeekDisplay(teamWeekRank([p],'overall',cs)[0]),'bowling','The graphic must show the qualifying spell, including 0 wickets');
 }
 const combined={...zero,runs:22,batting:[{runs:22,balls:25,not_out:false}]};
 assert.equal(teamWeekDisplay(teamWeekRank([combined],'overall',cs)[0]),'both');
});

test('bowling reference weights team-mates by balls and ignores the opposition attack',()=>{
 const p=candidate('weighted-bowler',0,2,18,{bowling:[{player_id:'weighted-bowler',wickets:2,runs:18,balls:36}]}),card=chase(p);
 card.scorecard.innings[0].bowlers=[...p.bowling,{player_id:'short',wickets:1,runs:12,balls:6},{player_id:'long',wickets:3,runs:18,balls:54}];
 card.scorecard.innings[1].bowlers=[{player_id:'opposition',wickets:0,runs:200,balls:60}];
 const r=awardPerformance(p,[card]);
 assert.equal(r.components.control,0);assert.match(r.reason,/Econ 3.00 vs team-mates 3.00/);
 const partial=structuredClone(card);partial.scorecard.innings[0].bowlers[1].wickets=null;
 assert.equal(awardPerformance(p,[partial]).components.strike,0,'Missing wickets cannot manufacture a peer wicket-taking rate');
 const impossible=structuredClone(card);impossible.scorecard.innings[0].bowlers[1].balls=0;
 assert.equal(awardPerformance(p,[impossible]).components.control,0);assert.doesNotMatch(awardPerformance(p,[impossible]).reason,/vs team-mates/);
});

test('brief spells and extreme peer rates cannot swamp the guide',()=>{
 for(const balls of [6,12,24,60]){
  const p=candidate('bounded',0,0,0,{bowling:[{player_id:'bounded',wickets:0,runs:0,balls}]}),card=chase(p,{otherConceded:1000,otherBowlingBalls:18});
  const r=awardPerformance(p,[card]);
  assert.ok(r.components.control<=Math.min(60,balls));
  if(balls===6)assert.equal(r.components.control,0);
 }
});

test('batting pace compares all other batters by balls and distinguishes two from six times the match rate',()=>{
 const fast=chase(finisher,{opposition:100,oppositionBalls:100,remainingRuns:20,remainingBalls:20});
 const slow=chase(finisher,{opposition:100,oppositionBalls:340,remainingRuns:20,remainingBalls:20});
 const a=awardPerformance(finisher,[fast]),b=awardPerformance(finisher,[slow]);
 assert.ok(b.components.pace>a.components.pace);
 assert.match(a.reason,/SR 200 vs rest of match 100/);assert.match(b.reason,/SR 200 vs rest of match 33/);
 const weighted=chase(finisher,{opposition:10,oppositionBalls:100,remainingRuns:40,remainingBalls:20});
 assert.match(awardPerformance(finisher,[weighted]).reason,/SR 200 vs rest of match 42/,'Use pooled runs/balls, not the mean of player or innings strike rates');
 const missing=structuredClone(weighted);missing.scorecard.innings[0].batters[0].balls=null;
 assert.equal(awardPerformance(finisher,[missing]).components.pace,0);assert.doesNotMatch(awardPerformance(finisher,[missing]).reason,/vs rest of match/);
 const missingInnings=structuredClone(weighted);missingInnings.scorecard.innings[0].batters=[];
 assert.equal(awardPerformance(finisher,[missingInnings]).components.pace,0);assert.doesNotMatch(awardPerformance(finisher,[missingInnings]).reason,/vs rest of match/);
 for(const field of ['runs','balls']){
  const partial=structuredClone(weighted);partial.scorecard.innings[0].batters[0][field]=null;
  assert.equal(awardPerformance(finisher,[partial]).components.pace,0,'A missing batting figure cannot be silently excluded from the match rate');
 }
});

test('unknown workloads cannot turn lower conceded totals into a cross-grade tiebreak',()=>{
 const a=candidate('a',0,3,25),b=candidate('b',0,3,14),pool=[a,b];
 assert.deepEqual(teamWeekRank(pool).map(p=>p.key),['a','b']);
 assert.deepEqual(playerWeekRecommendations(pool,{},[],'2026-10-25').all.map(p=>p.key),['a','b']);
});
