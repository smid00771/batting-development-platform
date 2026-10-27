import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spinStyle,spinLabel,spinProfile,spinProfileText,spinBalanceChange} from '../player-bowling.js';
const p=(id,style='leg_spin',extra={})=>({id,batting:'lower',bowling:'spin',spin_style:style,bowling_load:'frontline',...extra});
const team=ids=>({days:[{date:'2026-10-31'}],slots:ids.map(id=>({d1:id}))});
test('spin style never infers handedness, role or workload from an unset or invalid value',()=>{
 assert.equal(spinStyle(p('a',undefined)),'leg_spin');
 for(const value of [undefined,null,'leg spin','pace',{}])assert.equal(spinStyle({...p('a'),spin_style:value}),'unknown');
 assert.equal(spinStyle(p('a','leg_spin',{bowling:'pace'})),'unknown');assert.equal(spinLabel(p('a','left_arm_wrist')),'LH wrist-spin');
});
test('top/middle-order frontline spinners count in both roles; part-time and unset workload stay separate',()=>{
 const profile=spinProfile([p('a','leg_spin',{batting:'top'}),p('b','off_spin',{batting:'middle'}),p('c','left_arm_orthodox',{bowling_load:'part_time'}),p('d','left_arm_wrist',{bowling_load:undefined})]);
 assert.equal(profile.frontline.count,2);assert.equal(profile.frontline.batters,2);assert.equal(profile.partTime.count,1);assert.equal(profile.unset.count,1);
 assert.match(spinProfileText(profile).join(' '),/1 off-spin, 1 leg-spin.*2 also have.*Part-time options: 1 LH orthodox.*Workload not set: 1 LH wrist-spin/);
});
test('a third leg-spinner replacing the sole frontline off-spinner is a visible team-balance trade-off',()=>{
 const roster=[p('off','off_spin'),p('leg1'),p('leg2'),p('candidate')],before=JSON.stringify(roster),result=spinBalanceChange(team(['off','leg1','leg2']),roster,roster[0],roster[3]);
 assert.equal(result.status,'tradeoff');assert.match(result.notes.join(' '),/only frontline Off-spin.*fewer different spin types/);assert.equal(result.reports[0].after.frontline.types.leg_spin,3);assert.equal(JSON.stringify(roster),before);
});
test('multiple genuine all-rounders do not create a maximum-spinner warning',()=>{
 const roster=Array.from({length:7},(_,i)=>p('p'+i,i%2?'off_spin':'leg_spin',{batting:'middle'}));
 const result=spinBalanceChange(team(roster.slice(0,6).map(x=>x.id)),roster,roster[0],roster[6]);assert.equal(result.status,'retained');assert.equal(result.reports[0].after.frontline.batters,6);assert.doesNotMatch(result.notes.join(' '),/too many|maximum|batting cover/);
});
test('part-time off-spin does not preserve the only frontline off-spin option',()=>{
 const roster=[p('off','off_spin'),p('part','off_spin',{bowling_load:'part_time'}),p('leg'),p('new')];const result=spinBalanceChange(team(['off','part','leg']),roster,roster[0],roster[3]);assert.equal(result.status,'tradeoff');assert.match(result.notes.join(' '),/only frontline Off-spin/);
});
test('unknown type remains uncertainty and batting cover is separate from spin variety',()=>{
 const roster=[p('a','unknown',{batting:'top'}),p('b','leg_spin')];const result=spinBalanceChange(team(['a']),roster,roster[0],roster[1]);assert.equal(result.status,'tradeoff');assert.match(result.notes.join(' '),/recorded batting cover.*not set/);
 roster[0].batting='lower';assert.equal(spinBalanceChange(team(['a']),roster,...roster).status,'unknown');
});
test('two-day brackets assess only the days being replaced, including different spin mixes',()=>{
 const roster=[p('off','off_spin'),p('leg'),p('second','off_spin'),p('new')],t={days:[{},{}],slots:[{d1:'off',d2:'off'},{d1:'leg',d2:'second'}]};
 const result=spinBalanceChange(t,roster,roster[0],roster[3]);assert.equal(result.reports[0].status,'tradeoff');assert.equal(result.reports[1].status,'change');assert.match(result.notes.join(' '),/Day 1:.*Day 2:/);
 assert.equal(spinBalanceChange(t,roster,roster[0],roster[3],[1]).status,'change');
});
