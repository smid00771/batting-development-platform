import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gameSummary} from '../Functions/playhq-sync/public-api.mjs';
import {sharedScorecard} from '../Functions/playhq-sync/shared-scorecard.mjs';
import {repairScorecardOrder,repairSQL} from '../Scripts/repair-playhq-scorecard-order.mjs';
const raw=JSON.parse(await readFile(new URL('./fixtures/playhq/summary-v2.json',import.meta.url)));
raw.data.appearances.forEach((p,i)=>Object.assign(p,{visible:true,firstName:'Example',lastName:String(i)}));
const context={timezone:'Australia/Melbourne',grade:'Example grade',competition:'Test',source_fixture:{source_match_id:raw.data.id,source_grade_id:raw.data.gradeId,source_team_id:raw.data.teams[0].id,format:'t20',days:[{date:'2023-11-25'}]}};
test('repair restores both orders and preserves every saved figure and metadata field',async()=>{
 const expected=await sharedScorecard(raw,context),summary=gameSummary(raw,raw.data.id),saved=structuredClone(expected);
 for(const i of saved.innings){i.batters.reverse();i.bowlers.reverse();}
 saved.innings[0].batters[0].runs=731;saved.replay_url='verified metadata';
 const before=structuredClone(saved),result=await repairScorecardOrder(saved,summary);
 assert.deepEqual(saved,before);
 for(let n=0;n<result.innings.length;n++)for(const key of ['batters','bowlers']){
  assert.deepEqual(result.innings[n][key].map(p=>p.player_id),expected.innings[n][key].map(p=>p.player_id));
  const a=[...result.innings[n][key]].sort((a,b)=>a.player_id.localeCompare(b.player_id)),b=[...saved.innings[n][key]].sort((a,b)=>a.player_id.localeCompare(b.player_id));assert.deepEqual(a,b);
 }
 assert.equal(result.replay_url,saved.replay_url);
 assert.deepEqual(await repairScorecardOrder(result,summary),result);
});
test('repair refuses cross-source/innings mismatches and leaves unidentified rows untouched',async()=>{
 const c=await sharedScorecard(raw,context),summary=gameSummary(raw,raw.data.id);
 await assert.rejects(repairScorecardOrder(c,{...summary,source_match_id:'other'}),/source/);
 const bad=structuredClone(c);bad.innings[0].id='other';await assert.rejects(repairScorecardOrder(bad,summary),/Innings/);
 c.innings[0].batters.reverse();c.innings[0].batters[0].player_id=null;
 assert.deepEqual((await repairScorecardOrder(c,summary)).innings[0].batters,c.innings[0].batters);
});
test('generated repair is atomic, leased to the original latest snapshot and safe for source strings',async()=>{
 const c=await sharedScorecard(raw,context);c.innings[0].batters.reverse();c.result="quote ' $repair$ ";
 const id='00000000-0000-4000-8000-000000000001',r=await repairSQL([{id,club_id:id,source_match_id:c.match_id,scorecard:c,summary:gameSummary(raw,raw.data.id),original_hash:'a'.repeat(32)}]);
 assert.equal(r.changed.length,1);assert.match(r.sql,/md5\(s.scorecard::text\)/);assert.match(r.sql,/newer.created_at,newer.id/);assert.match(r.sql,/if affected<>1 then raise exception/);assert.match(r.sql,/^begin;/);assert.match(r.sql,/commit;/);assert.doesNotMatch(r.sql,/quote '/);
});
