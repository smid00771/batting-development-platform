import test from 'node:test';
import assert from 'node:assert/strict';
import {playerWeekRecommendations as recommend} from '../player-week-ranking.js';
import {awardPerformance} from '../award-performance.js';

const end='2026-10-25';
const player=(id,runs=0,wickets=0,conceded=30)=>({key:id,player_id:id,name:id,grade:'Grade A',runs,wickets,conceded,batting:runs?[{runs}]:[],bowling:wickets?[{wickets,runs:conceded,balls:60}]:[]});
const basic=(rows,profiles={},history=[],preferNew=false,cards=[])=>recommend(rows,profiles,history,end,preferNew,cards,'basic');

test('Basic ranks raw combined contributions and fewer conceded breaks otherwise identical bowling figures',()=>{
 const rows=[player('expensive',0,3,36),player('batter',65),player('cheap',0,3,14),player('allround',30,2,30)];
 const result=basic(rows);
 assert.deepEqual(result.all.map(p=>[p.key,p.points]),[['allround',70],['batter',65],['cheap',60],['expensive',60]]);
 assert.equal(result.winner,undefined);assert.equal(result.shortlist.length,4);
 assert.deepEqual(result.standouts,[],'A closely matched field has no fabricated stand-out');
});

test('Basic is independent of cards, grade, experience, history and the Smart recent-winner preference',()=>{
 const rows=[player('a',80),player('b',60),player('c',50)];
 const old=JSON.stringify(rows),history=[{week_end:'2026-10-18',created_at:'2026-10-19',winner:rows[0]}];
 const result=basic(rows,{b:{stage:'emerging'}},history,true,[{unrelated:'ignored'}]);
 assert.deepEqual(result.all.map(p=>[p.key,p.points]),basic(rows).all.map(p=>[p.key,p.points]));
 assert.deepEqual(result.shortlist.map(p=>p.key),['a','b','c']);assert.equal(result.shortlist[0].recentWins.length,1);
 assert.equal(JSON.stringify(rows),old);assert.ok(result.all.every(p=>!p.aboveForm));
});

test('Basic and Smart can reverse bowling order while Smart ratings exactly match the existing engine',()=>{
 const make=(id,runs,peerRuns)=>{
  const p={...player(id,0,3,runs),snapshot_id:id,team_id:'ours',match_id:id};
  return {p,c:{snapshot_id:id,our_team:'ours',scorecard:{match_id:id,innings:[{team_id:'opposition',bowlers:[{player_id:id,wickets:3,runs,balls:60},{player_id:'peer',wickets:5,runs:peerRuns,balls:180}]}]}}};
 };
 const low=make('low',14,45),high=make('high',36,210),rows=[low.p,high.p],cards=[low.c,high.c];
 const smart=recommend(rows,{},[],end,false,cards,'smart');
 assert.equal(basic(rows,{},[],false,cards).all[0].key,'low');assert.equal(smart.all[0].key,'high');
 for(const p of smart.all)assert.equal(p.points,awardPerformance(rows.find(x=>x.key===p.key),cards).points);
 assert.match(smart.all[0].reason,/vs team-mates/);assert.doesNotMatch(basic(rows).all[0].reason,/Econ|vs|SR/);
});

test('shortlists offer five people, retain cutoff ties, and never combine separate matches',()=>{
 const rows=[100,90,80,70,60,60,20].map((runs,i)=>player('p'+i,runs));
 rows.push({...player('second-match',110),player_id:'p0'});
 const result=basic(rows);assert.equal(result.shortlist.length,6);
 assert.equal(new Set(result.shortlist.map(p=>p.player_id)).size,6);
 assert.equal(result.shortlist[0].key,'second-match');assert.equal(result.shortlist[0].points,110);
 assert.equal(result.all.length,8);assert.equal(result.winner,undefined);
});

test('stand-out flags need a meaningful gap, can identify a small group, and ignore recent-winner reordering',()=>{
 assert.deepEqual(basic([120,60,50,40,30].map((n,i)=>player('p'+i,n))).standouts.map(p=>p.key),['p0']);
 assert.deepEqual(basic([120,118,70,60,50].map((n,i)=>player('p'+i,n))).standouts.map(p=>p.key),['p0','p1']);
 assert.deepEqual(basic([100,95,90,85,80].map((n,i)=>player('p'+i,n))).standouts,[]);
 assert.deepEqual(basic([player('one',180)]).standouts,[],'No inferred separation without another person');
 assert.deepEqual(basic([player('one',180),player('unknown')]).standouts,[],'Unscored records do not create a comparison');
 assert.deepEqual(basic([player('one',55),player('two',5)]).standouts,[],'Do not elevate a modest score just because the rest are low');
 const rows=[player('a',120),player('b',60),player('c',50)],history=[{week_end:'2026-10-18',created_at:'2026-10-19',winner:rows[0]}];
 const result=recommend(rows,{},history,end,true,[],'smart');
 assert.notEqual(result.shortlist[0].key,'a');assert.deepEqual(result.standouts.map(p=>p.key),['a']);
});

test('unknown conceded figures stay unknown, empty weeks stay empty and quiet weeks still offer choices',()=>{
 const unknown=player('a-unknown',0,3);unknown.conceded=null;unknown.bowling[0].runs=null;
 assert.equal(basic([unknown,player('z-known',0,3,40)]).all[0].key,'z-known');
 assert.equal(basic([unknown]).all[0].rawConceded,null);
 assert.deepEqual(basic([]).shortlist,[]);
 const quiet=basic([player('a',10),player('b',8),player('c',3)]);assert.equal(quiet.shortlist.length,3);assert.equal(quiet.standouts.length,0);
});
