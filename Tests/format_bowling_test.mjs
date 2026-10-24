import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSelectionEvidence} from '../selection-evidence.js';

const person={id:'example',name:'Example bowler',active:true,batting:'lower',bowling:'spin',bowling_load:'frontline'};
function assess(format,extra={},role={}) {
 const row={roster_id:person.id,competition:'NDCA',grade:'1st Grade',format,runs:18,innings:2,not_outs:0,
  wickets:8,conceded:118,bowling_balls:161,bowling_innings:3,batting_complete:true,bowling_complete:true,...extra};
 return buildSelectionEvidence({rows:[row]},[],[{...person,...role}]).forRow(row);
}
test('strong wicket-taking at 4.4 economy receives an early limited-overs flag, with long form and T20 unchanged',()=>{
 assert.equal(assess('limited_overs').ball.state,'strong');
 assert.equal(assess('limited_overs').ball.early,true);
 assert.equal(assess('long_form').ball.state,'steady');
 assert.equal(assess('t20').ball.state,'steady');
 assert.deepEqual(assess('limited_overs').bat,assess('long_form').bat);
});
test('the relaxed green boundary still requires strong wicket-taking and does not excuse an unlimited economy',()=>{
 const sample={bowling_balls:600,bowling_innings:5,wickets:20};
 assert.equal(assess('limited_overs',{...sample,conceded:455}).ball.state,'strong');
 assert.equal(assess('limited_overs',{...sample,conceded:456}).ball.state,'steady');
 assert.equal(assess('limited_overs',{...sample,wickets:16,conceded:440}).ball.state,'steady');
 assert.equal(assess('long_form',{...sample,wickets:16,conceded:440}).ball.state,'low');
 assert.equal(assess('limited_overs',{...sample,wickets:16,conceded:506}).ball.state,'steady');
 assert.equal(assess('limited_overs',{...sample,wickets:16,conceded:507}).ball.state,'low');
});
test('format allowances preserve opportunity, completeness, role and supported-competition safeguards',()=>{
 for(const change of [{bowling_innings:1},{bowling_balls:59},{bowling_complete:false},{wickets:null},{competition:'Other'},{format:'unknown'}])
  assert.equal(assess('limited_overs',change).ball.state,'building');
 assert.equal(assess('limited_overs',{}, {bowling:'unknown',bowling_load:'unknown'}).ball.state,'strong');
 assert.equal(assess('limited_overs',{wickets:0}).ball.state,'low');
});

function compare(format='limited_overs',candidate={},incumbent={},roles={}) {
 const people=[{...person,id:'higher',name:'First-grade spinner'}, {...person,id:'lower',name:'Second-grade spinner',...roles}];
 const teams=people.map((p,i)=>({id:'team'+i,competition:'NDCA',grade:i?'2nd Grade':'1st Grade',format,
  days:[{date:'2026-10-24'}],slots:[...Array(8).fill({}),{d1:p.id}]}));
 const row={competition:'NDCA',format,runs:1,innings:1,not_outs:0,batting_complete:true,bowling_complete:true,bowling_innings:3};
 const rows=[{...row,roster_id:'higher',grade:'1st Grade',wickets:8,conceded:118,bowling_balls:161,...incumbent},
  {...row,roster_id:'lower',grade:'2nd Grade',wickets:8,conceded:49,bowling_balls:144,...candidate}];
 return buildSelectionEvidence({rows},teams,people);
}
test('a strong limited-overs economy case links comparable wicket-taking as a trade-off while both form ratings remain green',()=>{
 const model=compare(),pair=model.pairs[0];
 assert.equal(model.pairs.length,1);assert.equal(pair.kind,'tradeoff');
 assert.equal(pair.reason,'Economy gain · wicket-taking trade-off');assert.equal(pair.number,1);
 assert.equal(pair.higher.ball.state,'strong');assert.equal(pair.lower.ball.state,'strong');
 assert.ok(pair.equivalentWickets<pair.higher.ball.wickets);
 assert.ok(pair.equivalentEconomy<pair.higher.ball.economy*.85);
 assert.equal(pair.lower.stats.conceded,49,'Actual figures are retained, not replaced by rough equivalents');
 assert.equal(compare('long_form').pairs[0].kind,'close');assert.equal(compare('t20').pairs[0].kind,'close');
});
test('economy-led comparisons require comparable wickets, a material saving, workload and the same bowling job',()=>{
 assert.equal(compare('limited_overs',{wickets:7}).pairs.length,0,'Too large a wicket-taking trade-off');
 assert.equal(compare('limited_overs',{conceded:72}).pairs[0].kind,'close','A smaller saving is a close call, not an economy-led gain');
 assert.equal(compare('limited_overs',{conceded:71}).pairs[0].kind,'tradeoff');
 assert.equal(compare('limited_overs',{conceded:98}).pairs.length,0,'A material economy disadvantage is not a close bowling call');
 for(const change of [{bowling_innings:1},{bowling_complete:false},{bowling_balls:59},{bowling_innings:5}])
  assert.equal(compare('limited_overs',change).pairs.length,0);
 for(const role of [{bowling:'pace'},{bowling:'unknown'},{bowling_load:'part_time'},{batting:'middle'}])
  assert.equal(compare('limited_overs',{}, {},role).pairs.length,0);
});
