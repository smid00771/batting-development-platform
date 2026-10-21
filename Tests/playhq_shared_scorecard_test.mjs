import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sharedScorecard,sourceId} from '../Functions/playhq-sync/shared-scorecard.mjs';
import {buildSeasonStats} from '../season-stats.js';
import {renderFixtureScorecard} from '../fixture-results.js';
const raw=JSON.parse(await readFile(new URL('./fixtures/playhq/summary-v2.json',import.meta.url),'utf8'));
const context={timezone:'Australia/Melbourne',grade:'Second grade',competition:'Test',source_fixture:{source_match_id:raw.data.id,source_grade_id:raw.data.gradeId,source_team_id:raw.data.teams[0].id,format:'t20',days:[{date:'2023-11-25',ground:'Oval 1'}]}};
const known=()=>{const b=structuredClone(raw);b.data.appearances.forEach((a,i)=>{a.visible=true;a.firstName='Player';a.lastName=String(i);});return b;};
test('shared scorecard keeps provider IDs separate and hides withheld names',async()=>{
 const c=await sharedScorecard(raw,context);
 assert.equal(c.provider,'playhq_au');assert.notEqual(c.match_id,raw.data.id);
 assert.equal(c.match_id,await sourceId('match',raw.data.id));
 assert.equal(c.teams[0].players[0].name,null);assert.equal(c.teams[0].players[0].player_id,null);
 assert.ok(c.innings.flatMap(x=>x.batters).some(x=>x.not_out===true));
 assert.match(renderFixtureScorecard({scorecard:c,our_team:c.our_team_id}),/Name withheld/);
});
test('Day 1 and corrected final scores replace the same match and innings in season totals',async()=>{
 const b=known(),day1=structuredClone(b);day1.data.status='STUMPS';
 const provisional=await sharedScorecard(day1,context),final=await sharedScorecard(b,context);
 assert.equal(provisional.match_id,final.match_id);assert.equal(provisional.innings[0].id,final.innings[0].id);
 const f={id:'fixture',grade:context.grade,competition:context.competition,format:'t20',days:context.source_fixture.days,match_id:final.match_id};
 const wrap=(c,time)=>({snapshot_id:time,fetched_at:time,fixture_id:f.id,our_team:c.our_team_id,scorecard:c});
 const input={season:{start:'2023-07-01',end:'2024-06-30'},today:'2023-11-26',fixtures:[f],cards:[wrap(provisional,'1')]};
 assert.equal(buildSeasonStats(input).rows.length,0);
 input.cards.push(wrap(final,'2'));
 const once=buildSeasonStats(input);assert.equal(once.included,1);assert.ok(once.rows.length>0);
 const changed=structuredClone(final);changed.innings.find(i=>i.team_id===final.our_team_id).batters[0].runs=20;
 input.cards.push(wrap(changed,'3'));
 const twice=buildSeasonStats(input);assert.equal(twice.included,1);assert.equal(twice.rows.length,once.rows.length);
 assert.notEqual(twice.rows.reduce((n,p)=>n+p.runs,0),once.rows.reduce((n,p)=>n+p.runs,0));
});
test('unknown dismissals and missing balls do not become usable zero figures',async()=>{
 const b=known(),p=b.data.periods[0].teams.find(t=>t.discipline==='BATTING').appearances[0];p.status='UNKNOWN';p.statistics=p.statistics.filter(s=>s.type!=='BALLS_FACED');
 const c=await sharedScorecard(b,context),v=c.innings[0].batters.find(x=>x.name===`${b.data.appearances.find(a=>a.id===p.id).firstName} ${b.data.appearances.find(a=>a.id===p.id).lastName}`);
 assert.equal(v.importable,false);assert.equal(v.not_out,null);assert.equal(v.balls,null);
});
test('wrong team, grade and moved match dates are rejected before sharing',async()=>{
 await assert.rejects(sharedScorecard(raw,{...context,source_fixture:{...context.source_fixture,source_grade_id:'other'}}),/another grade/);
 await assert.rejects(sharedScorecard(raw,{...context,source_fixture:{...context.source_fixture,days:[{date:'2023-11-24'}]}}),/changed playing dates/);
 assert.notEqual(await sourceId('appearance','match-a','same'),await sourceId('appearance','match-b','same'));
});
