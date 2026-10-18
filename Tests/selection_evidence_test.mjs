import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSelectionEvidence,battingEvidence,bowlingEvidence,gradeGuide,bowlingJobFits,battingPositionFits} from '../selection-evidence.js';

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
test('colours compare similar current roles, with adjacent-grade adjustments and one record per player',()=>{
 const s=scenario(),model=s.build();assert.equal(model.player('high','incumbent').bat.state,'low');assert.equal(model.player('low','candidate').bat.state,'strong');
 s.summary.rows.push(row('incumbent','2nd Grade',500),row('tail','1st Grade',1));s.roster.push(person('tail',{batting:'lower'}));
 const evidence=s.build().player('high','incumbent').bat;assert.equal(evidence.peers,3);assert.equal(evidence.baseline.average,20);
 s.roster[2].batting='lower';assert.equal(s.build().player('high','incumbent').bat.state,'building');
});
test('few innings, a single dismissal, all-not-outs and incomplete figures never create a struggling or promotion label',()=>{
 for(const change of [{innings:2,not_outs:0},{innings:5,not_outs:4},{innings:5,not_outs:5},{batting_complete:false}]){
  const s=scenario();Object.assign(s.summary.rows[0],change);const m=s.build();assert.equal(m.player('high','incumbent').bat.state,'building');assert.ok(!m.pairs.some(p=>p.higher.person.id==='incumbent'));
 }
 assert.equal(battingEvidence(row('no','1st Grade',0,{innings:5,not_outs:5})).average,null);
 assert.equal(battingEvidence(row('duck','1st Grade',0)).average,0);
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
