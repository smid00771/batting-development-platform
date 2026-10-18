import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSeasonStats,compareSelectedGrades,statsOvers} from '../season-stats.js';
import {renderStatsRows,renderGradeComparison} from '../season-stats-panel.js';
import {createSeasonStatsDemo} from '../season-stats-demo.js';

const clone = x => structuredClone(x);
const batter = (id='p1',runs=50,not_out=false,extra={}) => ({player_id:id,name:id,status:'played',runs,not_out,balls:40,fours:4,sixes:1,importable:true,...extra});
const bowler = (id='p2',extra={}) => ({player_id:id,name:id,team_id:'us',wickets:3,runs:30,balls:41,maidens:1,importable:true,...extra});
const card = (id='m1',extra={}) => ({snapshot_id:id,our_team:'us',fetched_at:'2026-10-11T00:00:00Z',scorecard:{provider:'playcricket_au',match_id:id,status:'completed',dates:['2026-10-10'],grade:'1st Grade',competition:'District',format_key:'long_form',teams:[{id:'us',lineup_available:true,players:[{player_id:'p1',name:'Alex'},{player_id:'p2',name:'Jamie'}]},{id:'them',name:'Visitors'}],innings:[{id:id+'i1',number:1,team_id:'us',complete:true,batters:[batter()]},{id:id+'i2',number:1,team_id:'them',complete:true,bowling_available:true,bowlers:[bowler()]}],...extra}});
const fixture = (id='f1',extra={}) => ({id,grade:'1st Grade',competition:'District',format:'long_form',opposition:'Visitors',days:[{date:'2026-10-10'}],match_id:'m1',...extra});
const context = (cards=[card()],extra={}) => ({season:{start:'2026-07-01',end:'2027-06-30',label:'2026/27',revision:0},today:'2026-10-17',cards,fixtures:[],identities:[{source_id:'p1',roster_id:'r1',name:'Alex'},{source_id:'p2',roster_id:'r2',name:'Jamie'}],...extra});
const player = (summary,id='r1') => summary.rows.find(p=>p.roster_id===id);

test('corrections replace the entire match; duplicate imports never add totals',()=>{
 const old=card(),updated=clone(old);updated.snapshot_id='new';updated.fetched_at='2026-10-12T00:00:00Z';updated.scorecard.innings[0].batters[0].runs=80;
 const result=buildSeasonStats(context([old,updated,old,updated]));
 assert.equal(result.included,1);assert.equal(player(result).runs,80);assert.equal(player(result).matches,1);
 assert.equal(player(buildSeasonStats(context([updated]))).runs,80);
});
test('batting uses runs per dismissal; DNB, not out and ducks remain distinct',()=>{
 const a=card('m1'),b=card('m2'),c=card('m3');a.scorecard.innings[0].batters=[batter('p1',60)];b.scorecard.innings[0].batters=[batter('p1',40,true)];c.scorecard.innings[0].batters=[batter('p1',0,true),batter('p2',0,false,{status:'did_not_bat'})];
 const result=buildSeasonStats(context([a,b,c])),r=player(result);
 assert.deepEqual([r.runs,r.innings,r.matches,r.not_outs,r.dismissals,r.average,r.ducks],[100,3,3,2,1,100,0]);
 assert.equal(player(result,'r2').innings,0);assert.equal(player(result,'r2').average,null);
 c.scorecard.innings[0].batters[0].not_out=false;assert.equal(player(buildSeasonStats(context([c]))).ducks,1);
});
test('all-not-out average is undefined; high score prefers not out at equal runs',()=>{
 const a=card(),b=card('m2');b.scorecard.innings[0].batters[0].not_out=true;
 assert.deepEqual(player(buildSeasonStats(context([a,b]))).high_score,{runs:50,not_out:true});
 assert.equal(player(buildSeasonStats(context([b]))).average,null);
});
test('bowling comes from the opposition innings, with base-six overs and aggregate rates',()=>{
 const a=card(),b=card('m2');b.scorecard.innings[1].bowlers=[bowler('p2',{balls:31,runs:18,wickets:2})];
 const r=player(buildSeasonStats(context([a,b])),'r2');
 assert.equal(r.wickets,5);assert.equal(r.conceded,48);assert.equal(statsOvers(r.bowling_balls),'12.0');assert.equal(r.economy,4);assert.equal(r.bowling_average,9.6);assert.equal(r.bowling_strike_rate,14.4);
 assert.deepEqual(r.best_bowling,{wickets:3,runs:30});
});
test('unknown balls do not become zero or produce false rates',()=>{
 const a=card();a.scorecard.innings[0].batters[0].balls=null;a.scorecard.innings[1].bowlers[0].balls=null;
 const r=buildSeasonStats(context([a]));assert.equal(player(r).strike_rate,null);assert.equal(player(r,'r2').economy,null);assert.equal(player(r,'r2').bowling_strike_rate,null);assert.equal(statsOvers(null),null);
});
test('unfinished, future, cancelled, no-play and superseded fixture links are excluded',()=>{
 const a=card(),b=card('m2',{status:'live',dates:['2026-10-09']}),future=card('future',{dates:['2026-10-20']});
 let r=buildSeasonStats(context([a,b,future],{fixtures:[fixture('f1',{cancelled:true})]}));assert.equal(r.included,0);assert.equal(r.playing,1);
 r=buildSeasonStats(context([a],{fixtures:[fixture('f1',{no_play:'washed_out'})]}));assert.equal(r.included,0);
 a.fixture_id='f1';r=buildSeasonStats(context([a],{fixtures:[fixture('f1',{match_id:'replacement'})]}));assert.equal(r.included,0);assert.ok(r.issues[0].messages.includes('Scorecard missing'));
});
test('season membership uses the match start and missing alerts wait until the final day',()=>{
 const previous=card('old',{dates:['2026-06-30','2026-07-07']}),current=card('new',{dates:['2027-06-30','2027-07-07']});
 const c=context([previous,current],{today:'2027-07-08',fixtures:[fixture('past',{match_id:null}),fixture('today',{match_id:null,days:[{date:'2027-07-08'}]})]});
 assert.equal(buildSeasonStats(c).included,1);
 const r=buildSeasonStats(context([],{fixtures:[fixture('past',{match_id:null}),fixture('ongoing',{match_id:null,days:[{date:'2026-10-10'},{date:'2026-10-17'}]})]}));
 assert.deepEqual(r.issues.map(x=>x.fixture_id),['past']);
});
test('names never merge identities; confirmed IDs merge across matches, conflicts exclude figures',()=>{
 const a=card(),b=card('m2');b.scorecard.teams[0].players=[{player_id:'new-id',name:'Alex'}];b.scorecard.innings[0].batters=[batter('new-id')];b.scorecard.innings[1].bowlers=[];
 let c=context([a,b]);assert.equal(buildSeasonStats(c).rows.length,3);
 c.identities.push({source_id:'new-id',roster_id:'r1',name:'Alex Official'});assert.equal(player(buildSeasonStats(c)).runs,100);
 a.scorecard.innings[0].batters.push(batter('new-id'));let r=buildSeasonStats(c);assert.equal(player(r).runs,50);assert.ok(r.issues.some(x=>x.messages.includes('Check player identity links')));
 c.identities[0].conflict=true;r=buildSeasonStats(context([card()],{identities:c.identities}));assert.equal(player(r),undefined);
});
test('grades, competitions and formats remain separate',()=>{
 const cards=[card(),card('m2',{grade:'2nd Grade'}),card('m3',{format_key:'t20'}),card('m4',{competition:'Other District'})];
 const r=buildSeasonStats(context(cards));assert.equal(r.rows.filter(x=>x.roster_id==='r1').length,4);
 const filtered=buildSeasonStats(context(cards),{format:'long_form',grade:JSON.stringify(['District','1st Grade'])});assert.equal(player(filtered).runs,50);assert.equal(filtered.included,1);
});
test('missing or invalid player figures are flagged, not displayed as DNB or a complete average',()=>{
 const a=card();a.scorecard.innings[0].batters[0].importable=false;a.scorecard.innings[1].bowlers[0].importable=false;
 const r=buildSeasonStats(context([a]));assert.equal(player(r).average,null);assert.equal(player(r).batting_complete,false);
 const html=renderStatsRows([player(r)]);assert.match(html,/Figures incomplete/);assert.doesNotMatch(html,/ss-match-score">DNB/);
 assert.match(renderStatsRows([player(r,'r2')],'bowling'),/Figures incomplete/);
});
test('unavailable bowling figures suppress complete season rates, including past valid matches',()=>{
 const a=card(),b=card('m2');b.scorecard.innings[1].bowling_available=false;b.scorecard.innings[1].bowlers=[];
 const r=player(buildSeasonStats(context([a,b])),'r2');assert.equal(r.wickets,3);assert.equal(r.economy,null);assert.equal(r.bowling_complete,false);
});
test('comparison uses current selected positions and confirmed links; brackets stay explicit',()=>{
 const c=context([card(),card('m2',{grade:'2nd Grade'})]),summary=buildSeasonStats(c);
 const one={id:'f1',competition:'District',grade:'1st Grade',format:'long_form',slots:[{d1:'r1',d2:'r2'},{d1:null}]};
 const two={...one,id:'f2',grade:'2nd Grade',slots:[{d1:'r1'}]};
 const rows=compareSelectedGrades(summary,one,two,[{id:'r1',name:'Alex'},{id:'r2',name:'Jamie'}]);
 assert.equal(rows[0].first[0].stats.runs,50);assert.equal(rows[0].first[0].day,1);assert.equal(rows[0].first[1].day,2);assert.deepEqual(rows[1].first,[]);
 assert.equal(compareSelectedGrades(summary,one,{...two,format:'t20'}).length,0);assert.equal(compareSelectedGrades(summary,one,{...two,competition:'Elsewhere'}).length,0);
 assert.match(renderGradeComparison(summary,one,two,[]),/Averages are not adjusted for grade strength/);
});
test('bowling comparison uses grade-specific bowling rates and keeps bracketed players explicit',()=>{
 const first=card(),second=card('m2',{grade:'2nd Grade'});second.scorecard.innings[1].bowlers=[bowler('p2',{wickets:2,runs:18,balls:31})];
 const summary=buildSeasonStats(context([first,second]));
 const one={id:'f1',competition:'District',grade:'1st Grade',format:'long_form',slots:[{d1:'r1',d2:'r2'},{d1:'unlinked'}]},two={...one,id:'f2',grade:'2nd Grade',slots:[{d1:'r2'}]};
 const html=renderGradeComparison(summary,one,two,[],undefined,'bowling');
 assert.match(html,/season bowling figures/);assert.match(html,/Day 1<\/small><small>No bowling recorded/);assert.match(html,/Day 2<\/small><span>10 average/);
 assert.match(html,/3 wickets · 6\.5 overs · 1 inns/);assert.match(html,/4\.39 Econ · 13\.67 S\/R/);
 assert.match(html,/9 average/);assert.match(html,/2 wickets · 5\.1 overs · 1 inns/);assert.match(html,/3\.48 Econ · 15\.5 S\/R/);
 assert.match(html,/No linked season figures/);assert.match(html,/Vacant/);assert.doesNotMatch(html,/50 average|50 runs/);
 assert.match(renderGradeComparison(summary,one,{...two,competition:'Other'},[],undefined,'bowling'),/same competition and format/);
 assert.match(renderGradeComparison(summary,one,{...two,format:'t20'},[],undefined,'bowling'),/same competition and format/);
});
test('bowling comparison distinguishes zero wickets, unknown balls and incomplete figures',()=>{
 const one={id:'f1',competition:'District',grade:'1st Grade',format:'long_form',slots:[{d1:'r2'}]},two={...one,id:'f2',grade:'2nd Grade'};
 const a=card(),b=card('m2',{grade:'2nd Grade'});a.scorecard.innings[1].bowlers[0].wickets=0;b.scorecard.innings[1].bowlers[0].balls=null;
 const render=()=>renderGradeComparison(buildSeasonStats(context([a,b])),one,two,[],undefined,'bowling');
 let html=render();assert.match(html,/— average/);assert.match(html,/0 wickets · 6\.5 overs/);assert.match(html,/4\.39 Econ · — S\/R/);assert.match(html,/3 wickets · — overs/);assert.match(html,/— Econ · — S\/R/);assert.doesNotMatch(html,/No bowling recorded|NaN|Infinity/);
 a.scorecard.innings[1].bowling_available=false;a.scorecard.innings[1].bowlers=[];html=render();assert.match(html,/Figures incomplete/);assert.doesNotMatch(html,/No bowling recorded|>0 wickets|>0 average/);
});
test('player and competition text is escaped and scorecard links cannot run scripts',()=>{
 const c=card();c.scorecard.url='javascript:alert(1)';const r=buildSeasonStats(context([c],{identities:[{source_id:'p1',roster_id:'r1',name:'<img src=x onerror=alert(1)>'}]}));
 const html=renderStatsRows(r.rows);assert.doesNotMatch(html,/<img|javascript:/);assert.match(html,/&lt;img/);
});
test('demo seeds shared fictional data once, reuses corrections and enforces role/date actions',()=>{
 const state={access:{status:'pilot',head_selector_id:'u'},selectors:['u'],roster:[{id:'r1',name:'Fictional Alex'}],fixtures:[{id:'f',details:{grade:'First',competition:'Demo',format:'long_form',days:[{date:'2026-10-17'}]},slots:[{d1:'r1'}]}]},cards={};let member={user_id:'u',permission_role:'admin'};
 const rpc=createSeasonStatsDemo(()=>state,()=>cards,()=>[],()=>member,()=> 'club',()=> '2026-10-17');
 const args={p_club_id:'club',p_action:'context'};let first=rpc(args);assert.equal(first.cards.length,3);assert.equal(rpc(args).cards.length,3);assert.equal(buildSeasonStats(first).included,3);
 const key=Object.keys(cards)[0],changed=clone(cards[key]);changed.innings[0].batters[0].runs=100;cards['corrected']=changed;
 assert.equal(buildSeasonStats(rpc(args)).included,3);assert.equal(buildSeasonStats(rpc(args)).rows[0].hundreds,1);
 member={user_id:'nobody',permission_role:'none'};assert.throws(()=>rpc(args),/access/);member={user_id:'u',permission_role:'none'};
 assert.throws(()=>rpc({...args,p_action:'set_season',p_data:{}}),/Admin/);
});
