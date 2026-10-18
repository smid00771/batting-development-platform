import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSelectionEvidence,battingEvidence,bowlingEvidence,gradeGuide,gradeBenchmark,bowlingJobFits,battingPositionFits,NDCA_BENCHMARKS} from '../selection-evidence.js';

const person=(id,extra={})=>({id,name:id,active:true,batting:'top',bowling:'none',bowling_load:'unknown',keeper:false,...extra});
const team=(id,grade,ids,extra={})=>({id,grade,competition:'NDCA',format:'long_form',days:[{date:'2026-10-17'}],slots:ids.map(id=>({d1:id})),...extra});
const row=(id,grade,average,extra={})=>({id:id+grade,roster_id:id,grade,competition:'NDCA',format:'long_form',runs:average*4,innings:5,not_outs:1,dismissals:4,average,batting_complete:true,bowling_complete:true,bowling_balls:0,bowling_innings:0,wickets:0,conceded:0,history:[],...extra});
function scenario(options={}) {
 const high=team('high','1st Grade',['incumbent','peer']),low=team('low','2nd Grade',['candidate']);
 const roster=[person('incumbent'),person('peer'),person('candidate')];
 const summary={season:{start:'2026-07-01',end:'2027-06-30'},rows:[row('incumbent',high.grade,10),row('peer',high.grade,20),row('candidate',low.grade,70)]};
 const result={high,low,roster,summary,...options};result.build=()=>buildSelectionEvidence(result.summary,[result.high,result.low],result.roster);return result;
}
const bowl={bowling_balls:300,bowling_innings:5,wickets:10,conceded:150,economy:3};
function allrounders(){const s=scenario();for(const p of s.roster)Object.assign(p,{bowling:'pace',bowling_load:'frontline'});Object.assign(s.summary.rows[0],bowl);Object.assign(s.summary.rows[1],bowl);Object.assign(s.summary.rows[2],bowl,{wickets:15,conceded:120,economy:2.4});return s;}

test('real batting averages, not runs per innings, set the rough comparison target',()=>{
 const s=scenario();Object.assign(s.summary.rows[0],{runs:90,innings:8,not_outs:3,average:18});
 Object.assign(s.summary.rows[2],{runs:252,innings:7,not_outs:1,average:42});
 const pair=s.build().pairs.find(p=>p.higher.person.id==='incumbent');
 assert.equal(pair.targetAverage,36);assert.equal(pair.equivalentBat,21);assert.equal(pair.kind,'fit');
});
test('rough guides recognise NDCA labels, handle reversed columns and never leak into other competitions or formats',()=>{
 const s=scenario();assert.equal(gradeGuide(s.low,s.high).higher.id,'high');
 assert.equal(gradeGuide({...s.high,grade:'NDCA 1st Grade'},{...s.low,grade:'Second Grade · NDCA'}).batting,.5);
 assert.equal(gradeGuide({...s.high,grade:'2nd Grade'},{...s.low,grade:'3rd Grade'}).batting,2/3);
 assert.equal(gradeGuide(s.high,{...s.low,grade:'3rd Grade'}),null);
 assert.equal(gradeGuide({...s.high,competition:'Other'},{...s.low,competition:'Other'}),null);
 for(const format of ['t20','unknown'])assert.equal(gradeGuide(s.high,{...s.low,format}),null);
});
test('batting colours use a fixed historical grade benchmark, independent of current club peers',()=>{
 const s=scenario(),model=s.build();assert.equal(model.player('high','incumbent').bat.state,'low');assert.equal(model.player('low','candidate').bat.state,'strong');
 const before=model.player('high','incumbent').bat;assert.equal(before.baseline.average,133474/6530);assert.equal(before.baseline.records,1099);
 s.summary.rows.push(row('incumbent','2nd Grade',500),row('tail','1st Grade',1));s.roster.push(person('tail',{batting:'lower'}));
 assert.deepEqual(s.build().player('high','incumbent').bat,before);
 s.roster[2].batting='lower';s.summary.rows=s.summary.rows.slice(0,1);assert.deepEqual(s.build().player('high','incumbent').bat,before);
 assert.deepEqual(s.build().forRow(s.summary.rows[0]).bat,before);
 s.roster[0].batting='unknown';assert.equal(s.build().player('high','incumbent').bat.state,'building');
});
test('historical benchmark scope is NDCA grades 1–4, and the pooled role/format scope is explicit',()=>{
 const s=scenario();assert.equal(NDCA_BENCHMARKS.season_count,5);assert.equal(NDCA_BENCHMARKS.scope,'All recorded roles and match formats');
 for(const g of [1,2,3,4])for(const format of ['long_form','limited_overs','t20']){
  const t={...s.high,grade:'NDCA '+g,format},b=gradeBenchmark(t,'ball');assert.ok(b.average>0&&b.wickets>0&&b.economy>0);assert.ok(b.wicketless_records>0);
  assert.equal(b.wickets,NDCA_BENCHMARKS.grades[g].bowling.wickets*100/NDCA_BENCHMARKS.grades[g].bowling.balls);
  assert.equal(gradeBenchmark(t,'bat').average,NDCA_BENCHMARKS.grades[g].batting.runs/NDCA_BENCHMARKS.grades[g].batting.dismissals);
 }
});
test('unsupported competitions and grades never fall back to small club peer groups',()=>{
 for(const change of [{competition:'Other League'},{grade:'5th Grade'},{format:'unknown'}]){
  const s=scenario();Object.assign(s.high,change);Object.assign(s.summary.rows[0],change);
  assert.equal(gradeBenchmark(s.high,'bat'),null);assert.equal(s.build().player('high','incumbent').bat.state,'building');
 }
});
test('early bowling uses the whole-grade reference equally for quicks and spinners',()=>{
 const s=allrounders();s.high.format=s.low.format='limited_overs';s.roster.forEach(p=>p.batting='lower');s.summary.rows.forEach(r=>r.format='limited_overs');
 Object.assign(s.roster[0],{bowling:'spin'});Object.assign(s.roster[2],{bowling:'spin'});
 Object.assign(s.summary.rows[0],{wickets:5,conceded:82,bowling_balls:113,bowling_innings:2});
 Object.assign(s.summary.rows[1],{wickets:3,conceded:51,bowling_balls:72,bowling_innings:2});
 Object.assign(s.summary.rows[2],{wickets:5,conceded:35,bowling_balls:96,bowling_innings:2});
 const m=s.build(),spinner=m.player('high','incumbent').ball,quick=m.player('high','peer').ball,lower=m.player('low','candidate').ball;
 assert.equal(spinner.state,'steady');assert.equal(quick.state,'steady');assert.deepEqual(spinner.baseline,quick.baseline);
 assert.equal(lower.state,'strong');assert.equal(lower.early,true);assert.equal(lower.baseline.economy,115400*6/214773);
 s.summary.rows=s.summary.rows.slice(2);assert.deepEqual(s.build().player('low','candidate').ball,lower);
 Object.assign(s.summary.rows[0],{bowling_innings:1});assert.equal(s.build().player('low','candidate').ball.state,'building');
});
test('few innings, a single dismissal, all-not-outs and incomplete figures never create a struggling or promotion label',()=>{
 for(const change of [{innings:2,not_outs:0},{innings:5,not_outs:4},{innings:5,not_outs:5},{batting_complete:false}]){
  const s=scenario();Object.assign(s.summary.rows[0],change);const m=s.build();assert.equal(m.player('high','incumbent').bat.state,'building');assert.ok(!m.pairs.some(p=>p.higher.person.id==='incumbent'));
 }
 assert.equal(battingEvidence(row('no','1st Grade',0,{innings:5,not_outs:5})).average,null);
 assert.equal(battingEvidence(row('duck','1st Grade',0)).average,0);
});
test('two strong batting innings earn a positive early flag without unlocking replacement comparisons',()=>{
 const s=scenario();Object.assign(s.summary.rows[0],{runs:93,innings:2,not_outs:0,average:46.5});
 const m=s.build(),bat=m.player('high','incumbent').bat;
 assert.equal(bat.state,'strong');assert.equal(bat.early,true);assert.equal(bat.ready,false);assert.equal(bat.average,46.5);
 assert.deepEqual(m.forRow(s.summary.rows[0]).bat,bat);assert.ok(!m.pairs.some(p=>p.higher.person.id==='incumbent'));
 Object.assign(s.summary.rows[2],{runs:180,innings:2,not_outs:0,average:90});
 assert.equal(s.build().player('low','candidate').bat.state,'strong');assert.equal(s.build().pairs.length,0);
});
test('an early not-out batting signal uses runs per innings while preserving the true average',()=>{
 for(const not_outs of [1,2]){
  const s=scenario();Object.assign(s.summary.rows[0],{runs:80,innings:2,not_outs,average:not_outs===2?null:80});
  let bat=s.build().player('high','incumbent').bat;
  assert.equal(bat.state,'strong');assert.equal(bat.early,true);assert.equal(bat.positiveAverage,40);assert.equal(bat.average,not_outs===2?null:80);
  assert.match(bat.reason,/runs per innings/);assert.equal(bat.ready,false);
  Object.assign(s.summary.rows[0],{runs:30});bat=s.build().player('high','incumbent').bat;
  assert.equal(bat.state,'building');assert.equal(bat.positiveAverage,15);
 }
});
test('one innings, incomplete figures, unknown roles and missing benchmarks cannot produce an early batting flag',()=>{
 for(const change of [{innings:1},{batting_complete:false},{runs:null},{not_outs:3}]){
  const s=scenario();Object.assign(s.summary.rows[0],{runs:200,innings:2,not_outs:0},change);
  assert.equal(s.build().player('high','incumbent').bat.state,'building');
 }
 const s=scenario();Object.assign(s.summary.rows[0],{runs:200,innings:2,not_outs:0});s.roster[0].batting='unknown';
 assert.equal(s.build().player('high','incumbent').bat.state,'building');s.roster[0].batting='top';s.high.competition=s.summary.rows[0].competition='Other';
 assert.equal(s.build().player('high','incumbent').bat.state,'building');
});
test('a very low two-innings average earns only a mild early flag, without unlocking replacements',()=>{
 const s=scenario();Object.assign(s.summary.rows[0],{runs:2,innings:2,not_outs:0});
 const m=s.build(),bat=m.player('high','incumbent').bat;
 assert.equal(bat.state,'slow');assert.equal(bat.early,true);assert.equal(bat.ready,false);assert.equal(bat.average,1);
 assert.deepEqual(m.forRow(s.summary.rows[0]).bat,bat);assert.ok(!m.pairs.some(p=>p.higher.person.id==='incumbent'));
 s.summary.rows[0].innings=3;
 assert.equal(s.build().player('high','incumbent').bat.state,'low');s.summary.rows[0].not_outs=2;
 assert.equal(s.build().player('high','incumbent').bat.state,'building');
});
test('slow-start flags require an average below half the historical reference in each grade',()=>{
 for(const grade of ['1st Grade','2nd Grade','3rd Grade','4th Grade']){
  const s=scenario();s.high.grade=s.summary.rows[0].grade=grade;
  const baseline=gradeBenchmark(s.high,'bat').average;
  Object.assign(s.summary.rows[0],{runs:Math.floor(baseline),innings:2,not_outs:0});
  assert.equal(s.build().player('high','incumbent').bat.state,'slow');
  s.summary.rows[0].runs=Math.ceil(baseline);
  assert.equal(s.build().player('high','incumbent').bat.state,'building');
 }
});
test('one innings, not-outs, incomplete records, unknown roles and unsupported scopes cannot trigger a slow start',()=>{
 for(const change of [{innings:1},{not_outs:1},{not_outs:2},{batting_complete:false},{runs:null},{not_outs:3}]){
  const s=scenario();Object.assign(s.summary.rows[0],{runs:0,innings:2,not_outs:0},change);
  assert.equal(s.build().player('high','incumbent').bat.state,'building');
 }
 for(const change of [{competition:'Other'},{grade:'5th Grade'},{format:'unknown'}]){
  const s=scenario();Object.assign(s.high,change);Object.assign(s.summary.rows[0],{runs:0,innings:2,not_outs:0},change);
  assert.equal(s.build().player('high','incumbent').bat.state,'building');
 }
 const s=scenario();Object.assign(s.summary.rows[0],{runs:0,innings:2,not_outs:0});s.roster[0].batting='unknown';
 assert.equal(s.build().player('high','incumbent').bat.state,'building');
 s.roster[0].batting='top';assert.equal(s.build().player('high','incumbent').bat.state,'slow');
});
test('unknown roles, inactive people and unlinked records cannot become replacement candidates',()=>{
 for(const change of [{active:false},{batting:'unknown'},{bowling:'unknown'}]){
  const s=scenario();Object.assign(s.roster[0],change);assert.ok(!s.build().pairs.some(p=>p.higher.person.id==='incumbent'));
 }
 const s=scenario();s.summary.rows[2].roster_id=null;assert.equal(s.build().pairs.length,0);
});
test('openers stay with openers; matching widens further down while preserving the recorded batting role',()=>{
 const p=person('p'),a={person:p,position:1};
 assert.equal(battingPositionFits(a,{person:p,position:2}),true);assert.equal(battingPositionFits(a,{person:p,position:3}),false);
 assert.equal(battingPositionFits({...a,position:3},{person:p,position:5}),false);
 assert.equal(battingPositionFits({...a,position:5},{person:p,position:7}),true);
 assert.equal(battingPositionFits({...a,person:person('p',{batting:'lower'}),position:9},{person:person('q',{batting:'lower'}),position:6}),true);
 assert.equal(battingPositionFits({...a,position:7},{person:person('q',{batting:'lower'}),position:7}),false);
});
test('a spinner never replaces a quick in an automatic comparison, even with far better batting',()=>{
 for(const format of ['long_form','limited_overs','t20']){
  const s=allrounders();s.high.format=s.low.format=format;s.summary.rows.forEach(r=>r.format=format);s.roster[2].bowling='spin';
  s.summary.rows[2].runs=800;s.summary.rows[2].average=200;
  assert.equal(s.build().pairs.length,0);
 }
});
test('long-form requires the same workload role; shorter formats allow frontline cover for part-time work only',()=>{
 const pace=person('a',{bowling:'pace',bowling_load:'frontline'}),part={...pace,bowling_load:'part_time'};
 assert.equal(bowlingJobFits(pace,part,'long_form'),false);assert.equal(bowlingJobFits(part,pace,'long_form'),false);
 assert.equal(bowlingJobFits(part,pace,'limited_overs'),true);assert.equal(bowlingJobFits(part,pace,'t20'),true);
 assert.equal(bowlingJobFits(pace,part,'t20'),false);assert.equal(bowlingJobFits(pace,{...pace,bowling_load:'unknown'},'long_form'),false);
});
test('an all-rounder retains both assessments and exposes a bowling trade-off instead of a simple swap',()=>{
 const s=allrounders();let pair=s.build().pairs.find(p=>p.higher.person.id==='incumbent');assert.equal(pair.kind,'fit');
 Object.assign(s.summary.rows[2],{wickets:2,conceded:300,economy:6});pair=s.build().pairs.find(p=>p.higher.person.id==='incumbent');
 assert.equal(pair.kind,'tradeoff');assert.equal(pair.reason,'Batting gain · bowling trade-off');
 s.summary.rows[2].bowling_complete=false;assert.equal(s.build().pairs.length,0);
});
test('a short or token bowling spell cannot claim to cover a frontline workload',()=>{
 const s=allrounders();Object.assign(s.summary.rows[2],{bowling_balls:120,bowling_innings:5,wickets:12,conceded:36});
 const pair=s.build().pairs.find(p=>p.higher.person.id==='incumbent');assert.equal(pair.kind,'tradeoff');
 Object.assign(s.summary.rows[2],{bowling_balls:12,bowling_innings:1});assert.equal(s.build().pairs.length,0);
});
test('bowling colours retain zero wickets and recognise economical containment',()=>{
 const s=allrounders();Object.assign(s.summary.rows[0],{wickets:0,conceded:200,economy:4});let m=s.build();
 assert.equal(m.player('high','incumbent').ball.state,'low');
 Object.assign(s.summary.rows[0],{conceded:30,economy:.6});m=s.build();assert.notEqual(m.player('high','incumbent').ball.state,'low');
 assert.equal(bowlingEvidence(s.summary.rows[0],s.roster[0],'long_form').wickets,0);
});
test('bowling comparisons retain an all-rounder batting trade-off and keeper cover',()=>{
 const s=allrounders();Object.assign(s.summary.rows[0],{runs:160,average:40});Object.assign(s.summary.rows[2],{runs:40,average:10,wickets:30,conceded:90});
 let pair=s.build().pairs.find(p=>p.higher.person.id==='incumbent');assert.equal(pair.kind,'tradeoff');assert.equal(pair.reason,'Bowling gain · batting trade-off');
 s.roster[0].keeper=true;assert.ok(!s.build().pairs.some(p=>p.higher.person.id==='incumbent'));
});
test('a player selected in both grades is not offered as their own or another incumbent replacement',()=>{
 const s=scenario();s.high.slots.push({d1:'candidate'});assert.equal(s.build().pairs.length,0);
});
test('cancelled or prior-season lineups do not produce links and no input data is mutated',()=>{
 const s=scenario(),before=JSON.stringify(s);s.build();assert.equal(JSON.stringify(s),before);
 s.low.cancelled=true;assert.equal(s.build().pairs.length,0);s.low.cancelled=false;s.low.days[0].date='2025-10-17';assert.equal(s.build().pairs.length,0);
});

test('a numbered marker appears at both ends and no person receives multiple numbered swaps',()=>{
 const s=scenario();s.roster.push(person('second-candidate'));s.low.slots.push({d1:'second-candidate'});s.summary.rows.push(row('second-candidate','2nd Grade',60));
 const m=s.build();for(const p of m.players.values())assert.ok(p.links.filter(p=>p.number).length<=1);
 for(const pair of m.pairs.filter(p=>p.number)){assert.ok(pair.higher.links.includes(pair));assert.ok(pair.lower.links.includes(pair));}
});
test('bracketed players must cover the incumbent’s selected days in the same round',()=>{
 const s=scenario();s.high.days=s.low.days=[{date:'2026-10-17'},{date:'2026-10-24'}];s.high.slots[0].d2='incumbent';
 assert.ok(!s.build().pairs.some(p=>p.higher.person.id==='incumbent'));
 s.low.slots[0].d2='candidate';assert.ok(s.build().pairs.some(p=>p.higher.person.id==='incumbent'));
});
