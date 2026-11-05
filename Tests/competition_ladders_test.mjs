import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normaliseLadders,standingsCatalogue,completeStandingsDirectory} from '../Functions/playhq-sync/standings.mjs';
const gradeId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',seasonId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',teamId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',clubId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const context={gradeId,seasonId,teams:[{id:teamId,club:{id:clubId,name:'Test Club'}}],grades:[{id:gradeId,name:'First Grade'}]};
const body=()=>({gradeId,ladders:[{type:'overall',pool:null,headers:[{key:'quotient',name:'Quotient'},{key:'competitionPoints',name:'Points'},{key:'played',name:'Played'}],standings:[{team:{id:teamId,name:'Test XI'},values:[1.25,19,4]}]}]});
test('ladder uses header keys, keeps source points and maps club by identity',()=>{
 const result=normaliseLadders(body(),context),row=result.ladders[0].rows[0];
 assert.equal(row.values.competitionPoints,19);assert.equal(row.values.played,4);assert.equal(row.club_id,clubId);assert.equal(result.name,'First Grade');
 assert.equal(row.values.adjustments,undefined,'Never add adjustments to an already calculated total');
});
test('missing club identity stays unresolved; it is never inferred from team name',()=>{
 assert.equal(normaliseLadders(body(),{...context,teams:[]}).ladders[0].rows[0].club_id,null);
});
test('mismatched grades, malformed figures and duplicate rows cannot overwrite cache',()=>{
 assert.throws(()=>normaliseLadders({...body(),gradeId:seasonId},context));
 const bad=body();bad.ladders[0].standings[0].values[1]='19';assert.throws(()=>normaliseLadders(bad,context));
 const dup=body();dup.ladders[0].standings.push(dup.ladders[0].standings[0]);assert.throws(()=>normaliseLadders(dup,context));
});
test('different format ladders stay separate and missing values are explicit',()=>{
 const b=body();b.ladders.push({...b.ladders[0],type:'twoDay',standings:[{team:{id:teamId,name:'Test XI'},values:[null,0,0]}]});
 const result=normaliseLadders(b,context);assert.equal(result.ladders.length,2);assert.equal(result.ladders[1].rows[0].values.quotient,null);
 assert.deepEqual(standingsCatalogue(context.grades),[{id:gradeId,name:'First Grade'}]);
});
test('missing directory teams resolve only through exact public game and organisation IDs',async()=>{
 const missing=normaliseLadders(body(),{...context,teams:[]}),gameId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 const api={fixtures:async g=>{assert.equal(g,gradeId);return {rounds:[{games:[{id:gameId,teams:[{id:teamId}]}]}]};},summary:async id=>{assert.equal(id,gameId);return {data:{id,gradeId,teams:[{id:teamId,name:'Test XI',organisation:{id:clubId,name:'Test Club'}}],appearances:[{private:'never retained'}]}};}};
 const directory=await completeStandingsDirectory(missing,[],api);
 assert.equal(normaliseLadders(body(),{...context,teams:directory}).ladders[0].rows[0].club_id,clubId);
 assert.ok(!JSON.stringify(directory).includes('private'));
 const bad={...api,summary:async()=>({data:{id:gameId,gradeId:seasonId,teams:[]}})};
 await assert.rejects(completeStandingsDirectory(missing,[],bad),/Mismatched/);
 assert.deepEqual(await completeStandingsDirectory(missing,[],{...api,fixtures:async()=>({rounds:[]})}),[]);
 let calls=0;await completeStandingsDirectory(normaliseLadders(body(),context),context.teams,{fixtures:async()=>{calls++;}});assert.equal(calls,0);
});
