import test from 'node:test';
import assert from 'node:assert/strict';
import {teamLogos,summaryLogoTeams,seasonLogoCache} from '../Functions/playhq-sync/team-logos.mjs';
const org='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const small='https://res.cloudinary.com/playhq/image/upload/h_32,w_32/v1/test.png',large='https://assets.playhq.com/ca/example/256_256_logo.png';
const row={id:'source',grade:{id:'grade'},club:{id:org,logo:{sizes:[{url:small,dimensions:{width:32,height:32}},{url:large,dimensions:{width:256,height:256}}]}}};
const team={id:'saved',source_team_id:'source'};
test('uses the largest safe club logo and keeps match-scoped team identities',async()=>{
 const [logo]=await teamLogos([team],[row,row],'grade');
 assert.equal(logo.id,'saved');assert.equal(logo.logo_url,large);assert.equal(logo.source_organisation_id,org);assert.notEqual(logo.organisation_id,org);
 const [next]=await teamLogos([{id:'other-grade',source_team_id:'old-team',source_organisation_id:org}],[row],'old-grade');
 assert.equal(next.logo_url,large);assert.equal(next.organisation_id,logo.organisation_id);
});
test('names, wrong grades, conflicting clubs and unrelated teams never select a badge',async()=>{
 for(const [t,rows,grade] of [[team,[row],'wrong-grade'],[{...team,source_team_id:'other'},[row],'grade'],[{...team,source_organisation_id:other},[row],'grade'],[team,[row,{...row,club:{...row.club,id:other}}],'grade']])assert.equal((await teamLogos([t],rows,grade))[0].logo_url,null);
});
test('unsafe logo URLs are omitted, including credentials and lookalike hosts',async()=>{
 for(const url of ['http://assets.playhq.com/ca/logo.png','https://assets.playhq.com.evil.invalid/ca/logo.png','https://user:pass@assets.playhq.com/ca/logo.png','https://res.cloudinary.com/other/image.png','https://assets.playhq.com:8443/ca/logo.png','data:image/png;base64,a','https://assets.playhq.com/bv/logo.png']){
  assert.equal((await teamLogos([team],[{...row,club:{id:org,logo:{sizes:[{url}]}}}],'grade'))[0].logo_url,null);
 }
});
test('old cards recover organisation only from the exact match, grade and source team',()=>{
 const body={data:{id:'match',gradeId:'grade',teams:[{id:'source',organisation:{id:org}}]}};
 assert.equal(summaryLogoTeams([team],body,'match','grade')[0].source_organisation_id,org);
 for(const [teams,match,grade] of [[[team],'other','grade'],[[team],'match','other'],[[{...team,source_team_id:'other'}],'match','grade'],[[{...team,source_organisation_id:other}],'match','grade']])assert.throws(()=>summaryLogoTeams(teams,body,match,grade));
});
test('season metadata is deduplicated, isolated, expired and retryable without retaining player data',async()=>{
 let now=0,calls=0;const cached=seasonLogoCache({now:()=>now,ttl:10,limit:2}),load=async()=>{calls++;return [{...row,players:['private']}];};
 const [a,b]=await Promise.all([cached('club:generation:season',load),cached('club:generation:season',load)]);
 assert.equal(calls,1);assert.equal(a,b);assert.equal(a[0].players,undefined);
 await cached('other:generation:season',load);assert.equal(calls,2);
 now=11;await cached('club:generation:season',load);assert.equal(calls,3);
 await assert.rejects(cached('failure',async()=>{throw Error('temporary');}));await cached('failure',load);assert.equal(calls,4);
});
