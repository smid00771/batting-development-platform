import test from 'node:test';
import assert from 'node:assert/strict';
import {gameNoPlay,gradeFixtures,gameSummary} from '../Functions/playhq-sync/public-api.mjs';
import {sharedScorecard} from '../Functions/playhq-sync/shared-scorecard.mjs';
const ours='11111111-1111-4111-8111-111111111111',theirs='22222222-2222-4222-8222-222222222222',match='33333333-3333-4333-8333-333333333333',grade='44444444-4444-4444-8444-444444444444';
const game=()=>({id:match,gradeId:grade,status:'FINAL',type:'oneDay',teams:[{id:theirs,outcome:'LOST_BY_FORFEIT'},{id:ours,outcome:'WON_BY_FORFEIT'}],appearances:[],periods:[{id:'empty-innings',sequenceNo:1,teams:[{id:theirs,discipline:'BATTING',statistics:[{type:'OVER_LIMIT',value:35}],appearances:[]}]}],schedule:[{dateTime:'2099-11-14T02:30:00Z'}]});
test('future forfeit comes from exact team outcomes, not home/away order or venue',()=>{
 const g=game(),body={rounds:[{name:'Round 5',games:[g]}],teams:[{id:theirs,name:'Visitors'},{id:ours,name:'Example Navy'}],playingSurfaces:[]};
 assert.equal(gameNoPlay(g,ours),'won_by_forfeit');assert.equal(gameNoPlay(g,theirs),'lost_by_forfeit');
 const f=gradeFixtures(body,{teamId:ours,gradeId:grade,timezone:'Australia/Sydney'}).fixtures[0];
 assert.equal(f.no_play,'won_by_forfeit');assert.equal(f.cancelled,true);assert.equal(f.requires_review,false);assert.equal(f.opposition,'Visitors');assert.equal(f.days[0].ground,null);
 g.status='UPCOMING';assert.equal(gradeFixtures(body,{teamId:ours,gradeId:grade,timezone:'Australia/Sydney'}).fixtures[0].no_play,null);
});
test('both feed innings wrappers protect actual play; FINAL alone does not infer a result',()=>{
 for(const wrapper of ['statistics','outcome']){
  const g=game(),t=g.periods[0].teams[0];delete t.statistics;
  if(wrapper==='statistics')t.statistics=[{type:'TOTAL_SCORE',value:1}];else t.outcome={statistics:[{type:'TOTAL_OVERS',value:0.1}]};
  assert.equal(gameNoPlay(g,ours),null);
 }
 for(const change of [g=>g.teams[0].outcome='LOST',g=>g.teams[1].outcome='WON',g=>g.teams.push({id:ours,outcome:'WON_BY_FORFEIT'}),g=>g.periods[0].teams[0].appearances.push({id:'actual-batter'})]){
  const g=game();change(g);assert.equal(gameNoPlay(g,ours),null);
 }
 assert.equal(gameNoPlay(game(),'other-team'),null);
});
test('explicit bye stays distinct from a win by forfeit',()=>{
 const g=game();g.status='BYE';g.teams=[{id:ours}];assert.equal(gameNoPlay(g,ours),'bye');
 g.status='FINAL';g.teams[0].outcome='BYE';assert.equal(gameNoPlay(g,ours),'bye');
 g.teams[0].outcome=null;assert.equal(gameNoPlay(g,ours),null);
});
test('summary preserves official outcome without inventing a scorecard or player figures',async()=>{
 const g=game(),summary=gameSummary({data:g},match,ours);
 assert.equal(summary.no_play,'won_by_forfeit');assert.equal(summary.has_figures,false);assert.equal(summary.source_team_id,ours);
 assert.equal(await sharedScorecard({data:g},{source_fixture:{source_match_id:match,source_grade_id:grade,source_team_id:ours}}),null);
});
