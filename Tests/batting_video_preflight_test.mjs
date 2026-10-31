import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectBattingInnings,validateBattingVideoWindow} from '../Functions/batting-video-analysis/preflight.mjs';
const batting=(team_id,runs)=>({team_id,discipline:'BATTING',statistics:{TOTAL_SCORE:runs,TOTAL_OUTS:8,TOTAL_OVERS:50},players:[{source_appearance_id:'opener',name:'Example opener',position:1,status:'OUT',statistics:{TOTAL_RUNS:5,BALLS_FACED:8}},{source_appearance_id:'dnb',name:'Did not bat',position:11,status:'DID_NOT_BAT',statistics:{}}]});
function input(){return {teamId:'club-team',matchId:'match',format:'limited_overs',summary:{source:'playhq',source_match_id:'match',complete:true,periods:[
 {source_period_id:'period-1',name:'FIRST_INNINGS',sequence:1,provisional:false,teams:[batting('club-team',242),{team_id:'opposition',discipline:'BOWLING'}]},
 {source_period_id:'period-2',name:'FIRST_INNINGS',sequence:2,provisional:false,teams:[{team_id:'club-team',discipline:'BOWLING'},batting('opposition',225)]}
 ]}};}
test('uses team, discipline and sequence despite identical innings names and reversed array order',()=>{
 const data=input();data.summary.periods.reverse();const before=structuredClone(data),r=selectBattingInnings(data);
 assert.equal(r.battingOrder,'first');assert.equal(r.periodId,'period-1');assert.deepEqual(r.finalScore,{runs:242,wickets:8,overs:50});
 assert.equal(r.videoWindow,null);assert.deepEqual(r.batters.map(p=>p.appearanceId),['opener']);assert.deepEqual(data,before);
});
test('chooses only the chasing team innings for a second-batting linked club',()=>{
 const data=input();data.teamId='opposition';data.format='t20';const r=selectBattingInnings(data);
 assert.equal(r.battingOrder,'second');assert.equal(r.periodId,'period-2');assert.equal(r.finalScore.runs,225);
});
test('does not guess across mismatched, incomplete, provisional or ambiguous results',()=>{
 const changes=[d=>d.matchId='different',d=>d.teamId='unlinked',d=>d.summary.complete=false,d=>d.summary.periods[0].provisional=true,d=>d.summary.periods[1].sequence=1,d=>d.summary.periods[0].teams.push(batting('another-team',10)),d=>d.summary.periods.push({...d.summary.periods[0],sequence:3}),d=>d.summary.periods[1].name='SUPER_OVER',d=>d.format='long_form'];
 for(const change of changes){const d=input();change(d);assert.equal(selectBattingInnings(d).status,'needs_review');}
});
test('does not infer a halfway cut or reject a replay solely from its post_live label',()=>{
 const innings=selectBattingInnings(input());
 assert.equal(validateBattingVideoWindow({innings,video:{duration:30465,live_status:'post_live'}}).status,'needs_timestamps');
 assert.equal(validateBattingVideoWindow({innings,video:{duration:30465,live_status:'was_live'}}).status,'needs_timestamps');
 const window={periodId:'period-1',source:'coach_confirmed',startSeconds:180,endSeconds:13020};
 assert.equal(validateBattingVideoWindow({innings,video:{duration:30465,live_status:'post_live'},window}).status,'ready');
 for(const live_status of ['is_live','is_upcoming'])assert.equal(validateBattingVideoWindow({innings,video:{duration:30465,live_status},window}).status,'waiting_for_video');
});
test('requires observed or coach-confirmed boundaries for the right innings',()=>{
 const innings=selectBattingInnings(input()),video={duration:30465,live_status:'was_live'},window={periodId:'period-1',source:'scoreboard',startSeconds:180,endSeconds:13020};
 assert.equal(validateBattingVideoWindow({innings,video,window}).status,'ready');
 for(const change of [w=>w.periodId='period-2',w=>w.source='half_duration',w=>w.startSeconds=-1,w=>w.endSeconds=40000,w=>w.endSeconds=w.startSeconds]){
  const w={...window};change(w);assert.equal(validateBattingVideoWindow({innings,video,window:w}).status,'needs_review');
 }
});
