import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicAPI,clubTeams,gradeFixtures,gameSummary,fixturePlan,nextResultsCheck,oversToBalls} from '../Functions/playhq-sync/public-api.mjs';
const sample=name=>JSON.parse(readFileSync(new URL(`fixtures/playhq/${name}.json`,import.meta.url)));
const team='d3d78789-31b2-498a-a24d-3a76502acd94',grade='d1f9c41d-cb8f-4faa-a338-cb714ba97a8c';
test('public client paginates and never sends bearer credentials',async()=>{
 let calls=0;
 const api=publicAPI({key:'test-only',fetchImpl:async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers['x-phq-tenant'],'ca');assert.equal(url.origin,'https://api.playhq.com');
  assert.equal(url.searchParams.get('cursor'),calls?'a+b/c=':null);
  return new Response(JSON.stringify({data:[++calls],metadata:{hasMore:calls===1,nextCursor:'a+b/c='}}));
 }});
 assert.deepEqual(await api.seasons(grade),[1,2]);
});
test('403 is surfaced once without retry or response-body disclosure',async()=>{
 let calls=0;const api=publicAPI({key:'test-only',fetchImpl:async()=>{calls++;return new Response('private provider diagnostics',{status:403});}});
 await assert.rejects(api.seasons(grade),e=>e.status===403&&!e.retryable&&!e.message.includes('private'));assert.equal(calls,1);
});
test('repeating pagination stops without returning a partial list',async()=>{
 const api=publicAPI({key:'test-only',fetchImpl:async()=>new Response(JSON.stringify({data:[],metadata:{hasMore:true,nextCursor:'loop'}}))});
 await assert.rejects(api.teams(grade),/pagination cursor/);
});
test('club filter uses organisation IDs, not similar names',()=>{
 assert.deepEqual(clubTeams([{id:'ours',club:{id:grade}},{id:'other',club:{id:team,name:'Newcastle City'}}],grade).map(t=>t.id),['ours']);
});
test('documented two-day fixture preserves each day and converts UTC to venue timezone',()=>{
 const out=gradeFixtures(sample('grade-v2'),{teamId:team,gradeId:grade,timezone:'Australia/Sydney'});
 assert.equal(out.fixtures.length,2);const long=out.fixtures[1];
 assert.equal(long.format,'long_form');assert.deepEqual(long.days.map(d=>d.day),[1,2]);
 assert.deepEqual(long.days.map(d=>d.date),['2022-01-11','2022-01-12']);assert.equal(long.days[0].ground,'Test ground');
});
test('venue changes do not overwrite selections or delete missing matches',()=>{
 const row=gradeFixtures(sample('grade-v2'),{teamId:team,gradeId:grade,timezone:'Australia/Sydney'}).fixtures[0];
 const existing={...row,id:'local',days:[],slots:[{player:'keep me'}],published:{keep:true}};
 const plan=fixturePlan([row],[existing,{id:'absent',source_match_id:'not-returned'}]);
 assert.equal(plan.length,1);assert.equal(plan[0].action,'review_update');assert.equal(plan[0].patch.slots,undefined);assert.equal(plan[0].patch.published,undefined);assert.equal(existing.slots[0].player,'keep me');
 assert.equal(fixturePlan([row],[{...row,id:'local'}])[0].action,'unchanged');
 assert.equal(fixturePlan([row],[{id:'manual',days:row.days}])[0].action,'review_new');
});
test('summary preserves real zeros, missing figures, and hidden names',()=>{
 const body=sample('summary-v2');const out=gameSummary(body,body.data.id);
 assert.equal(out.complete,true);assert.equal(out.has_figures,true);
 const bowling=out.periods[0].teams.find(t=>t.discipline==='BOWLING').players[0];
 assert.equal(bowling.name,null);assert.equal(bowling.balls_bowled,17);assert.equal(bowling.statistics.WICKETS,2);assert.equal(bowling.statistics.WIDES,0);
 assert.equal(bowling.statistics.UNKNOWN,undefined);
});
test('Day 1 stays provisional and uses the same match and period IDs on completion',()=>{
 const body=sample('summary-v2'),final=gameSummary(body,body.data.id);body.data.status='IN_PROGRESS';
 const day1=gameSummary(body,body.data.id);assert.equal(day1.complete,false);assert.ok(day1.periods.every(p=>p.provisional));
 assert.equal(day1.source_match_id,final.source_match_id);assert.deepEqual(day1.periods.map(p=>p.source_period_id),final.periods.map(p=>p.source_period_id));
});
test('wrong matches and cross-team appearances are rejected',()=>{
 const body=sample('summary-v2');assert.throws(()=>gameSummary(body,grade),/mismatched/);
 body.data.appearances[0].teamId='wrong';assert.throws(()=>gameSummary(body,body.data.id),/Unmatched/);
});
test('delayed scores keep getting checked; forbidden access stops automatic retries',()=>{
 const opts={now:'2026-10-25T00:00:00Z',lastPlayingDate:'2026-10-24',complete:true,hasFigures:false};
 assert.equal(nextResultsCheck(opts),'2026-10-25T04:00:00.000Z');
 assert.equal(nextResultsCheck({...opts,now:'2026-11-20T00:00:00Z'}),'2026-11-27T00:00:00.000Z');
 assert.equal(nextResultsCheck({...opts,httpStatus:403}),null);
});
test('cricket overs use six balls, not decimals',()=>{assert.equal(oversToBalls(2.5),17);assert.equal(oversToBalls(2.6),null);assert.equal(oversToBalls(null),null);});
