import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {createFixtureResults,renderFixtureScorecard} from '../fixture-results.js';
import {createSharedResultsDemo} from '../shared-match-results-demo.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const escape=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const settle=async()=>{for(let n=0;n<12;n++)await new Promise(r=>setTimeout(r,0));};
test('fixture scorecard shows our batting and bowling, preserves unknowns and escapes source text',()=>{
 const card={our_team:'ours',scorecard:{result:'Club <won>',teams:[{id:'them',name:'Visitors'},{id:'ours',name:'Our club'}],innings:[
  {team_id:'ours',number:1,complete:true,runs:19,wickets:1,extras:0,batters:[{name:'Alex <Smith>',runs:19,balls:26,not_out:false,fours:0,sixes:null,dismissal_text:'c <keeper>'},{name:'Jordan Lee',status:'did_not_bat'}],bowlers:[{team_id:'them',name:'Other Bowler',balls:6,runs:19,wickets:1,maidens:0}]},
  {team_id:'them',number:1,complete:false,batters:[],bowlers:[{team_id:'ours',name:'Our Bowler',balls:23,maidens:0,runs:7,wickets:2}]}]}};
 const doc=new JSDOM(renderFixtureScorecard(card)).window.document,ours=doc.querySelector('[data-score-team=ours]'),them=doc.querySelector('[data-score-team=them]');
 assert.equal(ours.open,true);assert.equal(them.open,false);assert.equal(doc.querySelector('details'),ours);
 assert.match(ours.textContent,/Alex <Smith>/);assert.equal(ours.querySelector('smith'),null);assert.match(ours.textContent,/19/);assert.match(ours.textContent,/DNB/);assert.match(ours.textContent,/Our Bowler3.5072/);assert.doesNotMatch(ours.textContent,/Other Bowler/);assert.match(ours.textContent,/Bowling · in progress/);assert.match(ours.textContent,/—/);
 const reopened=new JSDOM(renderFixtureScorecard(card,new Set(['them']))).window.document;assert.equal(reopened.querySelector('[data-score-team=ours]').open,false);assert.equal(reopened.querySelector('[data-score-team=them]').open,true);
 card.scorecard.innings.push({...card.scorecard.innings[0],number:2});assert.match(renderFixtureScorecard(card),/Batting · innings 2/);
});
test('scorecard rates use recorded balls, handle partial overs and leave missing or zero-ball figures unknown',()=>{
 const batters=[{runs:31,balls:72},{runs:66,balls:80,not_out:true},{runs:0,balls:8},{runs:0,balls:0},{runs:6,balls:null},{runs:null,balls:4},{runs:99,balls:10,status:'did_not_bat'}].map((p,i)=>({name:'Batter '+i,...p}));
 const bowlers=[{runs:30,balls:53},{runs:7,balls:23},{runs:0,balls:6},{runs:10,balls:0},{runs:10,balls:null},{runs:null,balls:6}].map((p,i)=>({name:'Bowler '+i,team_id:'ours',...p}));
 const card={our_team:'ours',scorecard:{teams:[{id:'ours',name:'Our club'},{id:'them',name:'Visitors'}],innings:[{team_id:'ours',complete:true,batters,bowlers:[]},{team_id:'them',complete:true,batters:[],bowlers}]}};
 const before=JSON.stringify(card),doc=new JSDOM(renderFixtureScorecard(card)).window.document,[batting,bowling]=doc.querySelectorAll('[data-score-team=ours] table');
 assert.equal(batting.tHead.rows[0].cells[5].textContent,'S/R');assert.equal(bowling.tHead.rows[0].cells[5].textContent,'Econ');
 assert.deepEqual([...batting.tBodies[0].rows].map(row=>row.cells[5].textContent),['43.06','82.50','0.00','—','—','—','—']);
 assert.deepEqual([...bowling.tBodies[0].rows].map(row=>row.cells[5].textContent),['3.40','1.83','0.00','—','—','—']);
 assert.equal(bowling.tBodies[0].rows[0].cells[1].textContent,'8.5');assert.equal(batting.tBodies[0].rows[1].cells[1].textContent,'66*');assert.equal(JSON.stringify(card),before);
 const empty=doc.querySelectorAll('[data-score-team=them] tbody td[colspan]');assert.equal(empty.length,2);assert.ok([...empty].every(cell=>cell.colSpan===6));
});
function harness(){
 const dom=new JSDOM('<div id="fixtureResults"></div>'),host=dom.window.document.getElementById('fixtureResults');
 const fixture={id:'fixture',published:{details:{}},details:{grade:'First XI',opposition:'Visitors',format:'limited_overs',days:[{date:'2026-10-10'}]},slots:[{d1:'player'}]},state={fixtures:[fixture],roster:[{id:'player',name:'Example Player'}]},cards={};
 const demo=createSharedResultsDemo(()=>state,()=>cards,()=>[]),calls=[],events=[];let fail=false,active=true,confirmed=false;
 const api={rpc:async(name,args)=>{calls.push(args);return {data:await demo.rpc(args.p_action,args.p_data)};}};
 const ui=createFixtureResults({supabase:api,escape,extractUrl:v=>v[0].startsWith('https://')?v[0]:'',here:()=>active,alert:m=>events.push(m),confirm:()=>confirmed,changed:()=>events.push('changed'),fetchCard:async(...args)=>{if(fail)throw Error('Try this scorecard again');return demo.fetchCard(...args);}});
 const options={clubId:'club',fixtureId:'fixture'},entry=ui.mount(host,options);
 const fill=url=>{const e=host.querySelector('[data-fixture-score-url]');e.value=url;e.dispatchEvent(new dom.window.Event('input'));};
 return {dom,host,ui,entry,fixture,state,cards,calls,events,demo,options,fill,fail:value=>fail=value,active:value=>active=value,confirm:value=>confirmed=value};
}
test('a locked fixture imports once and supplies the same scorecard to Match Review and awards',async()=>{
 const h=harness();await settle();h.fill('https://play.cricket.com.au/match/example');h.host.querySelector('[data-fixture-score-load]').click();assert.equal(h.host.querySelector('[data-fixture-score-load]').disabled,true);assert.equal(h.ui.canLeave(),false);await settle();
 assert.match(h.host.textContent,/Scores loaded/);assert.match(h.host.textContent,/Saved/);assert.equal(Object.keys(h.cards).length,1);assert.ok(h.fixture.published,'Publication is retained');assert.equal(h.fixture.selection_unlocked_until,undefined);
 const source=Object.keys(h.cards)[0],review=await h.demo.rpc('review',{fixture_id:'fixture',match_date:'2026-10-10',format_key:'limited_overs'});assert.equal(review.preview.snapshot_id,source);assert.equal(h.demo.awards('2026-10-11').cards[0].snapshot_id,source);assert.ok(h.events.includes('changed'));assert.equal(h.ui.canLeave(),true);
});
test('opening an imported fixture reuses stored scores and offers refresh without importing again',async()=>{
 const h=harness();await settle();const result=await h.demo.fetchCard({},'https://play.cricket.com.au/match/existing','fixture');await h.demo.rpc('link',{fixture_id:'fixture',snapshot_id:result.snapshot_id});h.ui.mount(h.host,h.options);await settle();
 assert.match(h.host.textContent,/Refresh scores/);assert.ok(h.host.querySelector('[aria-label="Player scorecard"]'));assert.equal(h.host.querySelector('[data-fixture-score-url]').value,result.scorecard.url);assert.equal(Object.keys(h.cards).length,1);
});
test('a failed import retains its link, restores controls, and warns before discarding',async()=>{
 const h=harness();await settle();h.fill('https://play.cricket.com.au/match/example');h.fail(true);h.host.querySelector('[data-fixture-score-load]').click();await settle();assert.match(h.host.textContent,/Try this scorecard again/);assert.equal(h.host.querySelector('[data-fixture-score-url]').value,'https://play.cricket.com.au/match/example');assert.equal(h.host.querySelector('[data-fixture-score-load]').disabled,false);assert.equal(h.ui.canLeave(),false);h.confirm(true);assert.equal(h.ui.canLeave(),true);assert.equal(Object.keys(h.cards).length,0);
});
test('no-play status can be recorded and undone without editing the team',async()=>{
 const h=harness();await settle();let select=h.host.querySelector('[data-fixture-score-no-play]');select.value='washed_out';select.dispatchEvent(new h.dom.window.Event('change'));await settle();assert.match(h.host.textContent,/Marked washed out/);select=h.host.querySelector('[data-fixture-score-no-play]');select.value='';select.dispatchEvent(new h.dom.window.Event('change'));await settle();assert.doesNotMatch(h.host.textContent,/Marked washed out/);assert.equal(h.state.result_sources.fixture,undefined);
});
test('Fixture details remains enabled on a locked selection card while player changes stay locked',()=>{
 for(const file of ['app.js','demo.html']){
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),a=source.indexOf('function seTeamCard('),b=source.indexOf('\nfunction ',a+1),f={id:'fixture',details:{grade:'First XI',opposition:'Visitors',days:[{date:'2026-10-10'}]},published:{},slots:[],issues:[]};
  const ctx={ensureSelections:()=>({data:{}}),seMatchRoles:()=>({}),seMatchRoleIssues:()=>[],seDraftChanged:()=>false,seOverflowText:()=>'',seEsc:escape,seFixtureLocked:()=>true,seDate:String,seBoardComments:()=>'',seBoardMatchConversation:()=>'',seScorecardNote:()=>'',seFixtureLockControls:()=>'',seBoardCounts:()=>'',seTeamChangeNotice:()=>'',seMatchRoleFields:()=>'<button data-player-change>Player</button>'};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function '+(file==='app.js'?'seFixtureDetailsAction':'seCopyPublishedAction')+'('),source.indexOf('function seReadOnlyTeamCard('))+source.slice(a,b),ctx);
  const dom=new JSDOM(ctx.seTeamCard(f)),doc=dom.window.document;doc.querySelectorAll('[data-se-locked="true"] button').forEach(x=>x.disabled=true);
  assert.equal(doc.querySelector('[data-se-edit]').disabled,false,file);assert.equal(doc.querySelector('[data-player-change]').disabled,true);assert.equal(doc.querySelector('[data-se-copylast]'),null);if(file==='app.js')assert.equal(doc.querySelector('[data-se-export]'),null);else assert.equal(doc.querySelector('[data-se-export]').disabled,false);
  f.published=null;ctx.seFixtureLocked=()=>false;const draft=new JSDOM(ctx.seTeamCard(f)).window.document;assert.ok(draft.querySelector('[data-se-copylast]'));assert.equal(draft.querySelector('[data-se-export]'),null);
 }
});

test('Match Review link shares the scorecard heading and appears only when the server permits it',async()=>{
 for(const allowed of [true,false]){
  const dom=new JSDOM('<main></main>'),host=dom.window.document.querySelector('main');let opened;
  const ui=createFixtureResults({supabase:{rpc:async()=>({data:{can_review:allowed,fixtures:[{id:'f',days:[],format:'limited_overs'}],cards:[]}})},escape,here:()=>true,openMatchReview:s=>opened=s.fixtureId});
  ui.mount(host,{clubId:'c',fixtureId:'f'});await settle();const button=host.querySelector('[data-fixture-match-review]');
  assert.equal(!!button,allowed);if(button){assert.equal(button.parentElement,host.querySelector('h3').parentElement);button.click();assert.equal(opened,'f');}
 }
});
