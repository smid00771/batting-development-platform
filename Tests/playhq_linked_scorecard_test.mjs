import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {linkedScorecard} from '../Functions/playhq-sync/linked-scorecard.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/playhq/summary-v2.json',import.meta.url),'utf8'));
const source={source_match_id:raw.data.id,source_grade_id:raw.data.gradeId,source_team_id:raw.data.teams[0].id,format:'t20',days:[{date:'2023-11-25',ground:'Oval 1'}]};
const mid='11111111-1111-4111-8111-111111111111',team='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',pid='44444444-4444-4444-8444-444444444444';
const card=()=>({id:mid,status:'COMPLETED',matchType:'T20',matchSchedule:[{startDateTime:'2023-11-25T12:00:00'}],teams:[{id:team,name:'Our club',players:[{participantId:pid,name:'Alex Player'}]},{id:other,name:'Visitors',players:[]}],innings:[{id:'55555555-5555-4555-8555-555555555555',battingTeamId:team,inningsNumber:1,batting:[{participantId:pid,dismissalType:'NotOut',runsScored:42}],runsScored:42,totalExtras:0,numberOfWicketsFallen:0}]});
const ctx={timezone:'Australia/Melbourne',source_fixture:source,canonical_match:{provider:'playcricket_au',match_id:mid,team_id:team}};
test('a confirmed legacy scorecard is refreshed with its identities and no provider key forwarding',async()=>{
 let url,options;const result=await linkedScorecard(raw,ctx,async(u,o)=>{url=u;options=o;return Response.json(card());});
 assert.match(url,new RegExp('/matches/'+mid+'\\?'));assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.redirect,'error');assert.equal(result.match_id,mid);assert.equal(result.our_team_id,team);assert.equal(result.innings[0].batters[0].player_id,pid);assert.equal(result.upstream_match_id,raw.data.id);
});
test('a new API scorecard stays namespaced and never guesses a legacy identity',async()=>{
 const result=await linkedScorecard(raw,{...ctx,canonical_match:null},()=>{throw Error('No legacy fetch');});assert.equal(result.provider,'playhq_au');assert.notEqual(result.match_id,raw.data.id);assert.notEqual(result.match_id,mid);
});
test('a changed date, team or invalid link is rejected instead of replacing existing scores',async()=>{
 await assert.rejects(linkedScorecard(raw,{...ctx,canonical_match:{...ctx.canonical_match,match_id:'https://elsewhere.invalid'}},()=>{throw Error('No fetch');}),/saved scorecard link/);
 await assert.rejects(linkedScorecard(raw,ctx,async()=>Response.json({...card(),matchSchedule:[{startDateTime:'2023-11-26T12:00:00'}]})),/changed scorecard/);
 await assert.rejects(linkedScorecard(raw,{...ctx,canonical_match:{...ctx.canonical_match,team_id:pid}},async()=>Response.json(card())),/changed scorecard/);
});
