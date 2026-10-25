import test from 'node:test';
import assert from 'node:assert/strict';
import {teamWeekBasicRank,teamWeekBasicRecommendations} from '../team-week-basic.js';
import {teamWeekRank} from '../team-of-week.js';

const player=(id,runs=0,wickets=0,conceded=30)=>({key:id,player_id:id,name:id,grade:'Test grade',runs,wickets,conceded,batting:runs?[{runs,not_out:false}]:[],bowling:wickets?[{wickets,runs:conceded}]:[]});
const pool=()=>[...Array.from({length:8},(_,i)=>player('bat-'+i,90-i*5)),...Array.from({length:8},(_,i)=>player('bowl-'+i,0,5-i%3,20+i)),player('allround',40,3,21)];

test('Basic offers six batters, six bowlers and the best all-rounder, leaving the XI unchosen',()=>{
 const r=teamWeekBasicRecommendations(pool());
 assert.equal(r.contenders.length,13);assert.equal(new Set(r.contenders.map(p=>p.player_id)).size,13);
 assert.deepEqual(Object.fromEntries(Object.entries(r.groups).map(([k,v])=>[k,v.length])),{batting:6,bowling:6,allround:1});
 assert.equal(r.groups.allround[0].key,'allround');assert.equal(r.groups.allround[0].display,'both');
 assert.deepEqual(r.groups.batting.map(p=>p.runs),[90,85,80,75,70,65]);
 assert.equal(r.proposed.length,0);assert.equal(r.strong.length,0);
});
test('Basic bowlers rank by wickets then runs conceded, regardless of match pace or batting',()=>{
 const cheap=player('cheap',0,3,14),expensive=player('expensive',90,3,36),more=player('more',0,4,70);
 cheap.bowling[0].balls=12;expensive.bowling[0].balls=60;
 assert.deepEqual(teamWeekBasicRank([expensive,cheap,more],'bowling').map(p=>p.key),['more','cheap','expensive']);
 assert.equal(teamWeekBasicRank([cheap,expensive],'batting')[0].key,'expensive');
});
test('Basic and Smart retain distinct rankings for the same real match comparisons',()=>{
 function match(id,runs,peerRuns){
  const p={...player(id,0,3,runs),snapshot_id:id,team_id:'ours',match_id:id};p.bowling[0].balls=60;
  const c={snapshot_id:id,our_team:'ours',scorecard:{match_id:id,innings:[{team_id:'other',bowlers:[{player_id:id,wickets:3,runs,balls:60},{player_id:'peer',wickets:5,runs:peerRuns,balls:180}]}]}};
  return {p,c};
 }
 const low=match('low',14,45),high=match('high',36,210),rows=[low.p,high.p],cards=[low.c,high.c];
 const smart=teamWeekRank(rows,'bowling',cards);
 assert.equal(smart[0].key,'high');assert.equal(teamWeekBasicRank(rows,'bowling')[0].key,'low');
 teamWeekBasicRecommendations(rows);assert.deepEqual(teamWeekRank(rows,'bowling',cards),smart,'Basic must not mutate Smart inputs or ratings');
});
test('overlaps and second matches consume one place, with the next eligible person filling each category',()=>{
 const rows=pool();rows.push({...player('allround-again',160,4),player_id:'allround'}, {...player('bat-0-again',120,3),player_id:'bat-0'});
 const r=teamWeekBasicRecommendations(rows);
 assert.equal(r.groups.allround[0].key,'allround-again');assert.equal(r.contenders.length,13);
 assert.equal(new Set(r.contenders.map(p=>p.player_id)).size,13);
 assert.equal(r.groups.batting[0].key,'bat-0-again');assert.ok(!r.groups.bowling.some(p=>p.player_id==='bat-0'));
});
test('all-rounder uses raw runs plus twenty per wicket, requiring a contribution in both skills',()=>{
 const onlyBat=player('bat',160),onlyBowl=player('bowl',0,6),one=player('one',60,1),three=player('three',40,3);
 assert.deepEqual(teamWeekBasicRank([onlyBat,onlyBowl,one,three],'allround').map(p=>[p.key,p.points]),[['three',100],['one',80]]);
});
test('missing runs conceded are not treated as a cheaper spell and exact ties remain in the full ranking',()=>{
 const unknown=player('a-missing',0,3),known=player('z-known',0,3,40);unknown.conceded=null;unknown.bowling[0].runs=null;
 assert.deepEqual(teamWeekBasicRank([unknown,known],'bowling').map(p=>p.key),['z-known','a-missing']);
 assert.match(teamWeekBasicRank([unknown],'bowling')[0].reason,/3\/—/);
 const tied=Array.from({length:9},(_,i)=>player('tied-'+i,40));
 assert.equal(teamWeekBasicRank(tied,'batting').length,9);assert.equal(teamWeekBasicRecommendations(tied).groups.batting.length,6);
 assert.deepEqual(teamWeekBasicRecommendations(tied).contenders,teamWeekBasicRecommendations([...tied].reverse()).contenders);
});
test('quiet weeks and missing categories never invent players or combine separate performances',()=>{
 const batter=player('bat',10),bowler={...player('bowl',0,1),player_id:'bat'};
 const r=teamWeekBasicRecommendations([batter,bowler]);
 assert.equal(r.groups.allround.length,0);assert.equal(r.contenders.length,1);
 const none=teamWeekBasicRecommendations([]);assert.equal(none.contenders.length,0);
});
