import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {weeklyResultCoverage,createSharedMatchResults,resultWeekEnd} from '../shared-match-results.js';
import {createSharedResultsDemo} from '../shared-match-results-demo.js';
import {createTeamWeekDemo} from '../team-of-week-demo.js';
import {createPlayerWeekDemo} from '../player-of-week-demo.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const fixture=(id,grade,extra={})=>({id,grade,opposition:'Visitors',format:'limited_overs',days:[{date:'2026-10-17'}],...extra});
const card=(id,grade,extra={})=>({snapshot_id:'snapshot-'+id,our_team:'our',scorecard:{schema_version:2,match_id:id,url:'https://play.cricket.com.au/match/'+id,dates:['2026-10-17'],format_key:'limited_overs',grade,status:'completed',teams:[{id:'our',name:'Example Club'},{id:'their',name:'Visitors'}],innings:[{team_id:'our',complete:true,bowling_available:true},{team_id:'their',complete:true,bowling_available:true}]},...extra});
test('one expected-match checklist handles missing, no play, ongoing and partial scorecards',()=>{
 const c1=card('match-1','1st Grade'),partial=card('match-2','2nd Grade');partial.scorecard.innings[1].bowling_available=false;
 const c={week_end:'2026-10-18',fixtures:[fixture('f1','1st Grade'),fixture('f2','2nd Grade'),fixture('f3','3rd Grade'),fixture('f4','4th Grade',{no_play:'washed_out'}),fixture('f5','5th Grade',{days:[{date:'2026-10-17'},{date:'2026-10-24'}]})],cards:[c1,partial]};
 const result=weeklyResultCoverage(c);assert.equal(result.ready,1);assert.equal(result.total,3);assert.deepEqual(result.missing.map(r=>r.grade),['2nd Grade','3rd Grade']);assert.equal(result.playing.length,1);
 c.cards.push(card('match-3','3rd Grade'));c.cards[1].scorecard.innings[1].bowling_available=true;assert.equal(weeklyResultCoverage(c).complete,true);
});
test('ambiguous scorecards are not silently matched or double counted',()=>{
 const c={week_end:'2026-10-18',fixtures:[fixture('a','First XI'),fixture('b','Second XI')],cards:[card('m','Official Division One')]};
 let r=weeklyResultCoverage(c);assert.equal(r.total,2);assert.equal(r.ready,0);assert.equal(r.rows.at(-1).status,'match');
 c.cards[0].grade_hint='First XI';r=weeklyResultCoverage(c);assert.equal(r.ready,1);assert.equal(r.rows.length,2);
 c.cards[0].fixture_id='b';r=weeklyResultCoverage(c);assert.equal(r.rows.find(x=>x.id==='b').card.snapshot_id,'snapshot-m');
});
test('Sunday week boundaries are stable across time zones',()=>{assert.equal(resultWeekEnd('2026-10-17'),'2026-10-18');assert.equal(resultWeekEnd('2026-10-18'),'2026-10-18');assert.equal(resultWeekEnd('2026-10-19'),'2026-10-25');});
test('fictional demo imports are shared by both weekly awards and Match Review',async()=>{
 const state={fixtures:[{id:'f1',details:fixture('f1','First XI'),slots:Array.from({length:11},(_,n)=>({d1:'p'+n,d2:null}))}],roster:Array.from({length:11},(_,n)=>({id:'p'+n,name:'Player '+n}))},cards={};
 const shared=createSharedResultsDemo(()=>state,()=>cards,()=>[]),s={results:{end:'2026-10-18'}};
 const imported=await shared.fetchCard(s,'https://play.cricket.com.au/match/example','f1');await shared.rpc('link',{fixture_id:'f1',snapshot_id:imported.snapshot_id});
 const review=await shared.rpc('review',{fixture_id:'f1',match_date:'2026-10-17',format_key:'limited_overs'});assert.equal(review.preview.snapshot_id,imported.snapshot_id);
 for(const [name,api] of [['team_of_week_api',createTeamWeekDemo(()=> 'Example',end=>shared.awards(end))],['player_of_week_api',createPlayerWeekDemo(()=> 'Example',end=>shared.awards(end))]]){const response=await api.rpc(name,{p_action:'context',p_data:{week_end:'2026-10-18'}});assert.equal(response.data.cards[0].snapshot_id,imported.snapshot_id);assert.equal(response.data.candidates.length,11);assert.equal(response.data.candidates[0].runs,112);}
});
test('Teams importer saves once, shares updates, retains failed inputs and checks all awards',async()=>{
 const dom=new JSDOM('<main id="socialResults"></main>');globalThis.document=dom.window.document;globalThis.window=dom.window;dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const context={week_end:'2026-10-18',fixtures:[fixture('f1','1st Grade'),fixture('f2','2nd Grade')],cards:[card('m1','1st Grade')]};
 const s={scope:'user:club',view:'awards'},calls=[];let changed=0,fail=false,approval=false,release;
 const api={rpc:async(name,args)=>{calls.push([name,args.p_action]);if(args.p_action==='context')return {data:structuredClone(context)};
  if(args.p_action==='link'){const c=context.cards.find(c=>c.snapshot_id===args.p_data.snapshot_id);c.fixture_id=args.p_data.fixture_id;context.fixtures.find(f=>f.id===c.fixture_id).match_id=c.scorecard.match_id;return {data:{saved:true}};}
  if(args.p_action==='no_play'){context.fixtures.find(f=>f.id===args.p_data.fixture_id).no_play=args.p_data.reason||null;return {data:{saved:true}};}throw Error('Unexpected action');},
  functions:{invoke:async(name,{body})=>{assert.equal(body.purpose,'team_of_week');calls.push(['import',body.url]);if(release)await new Promise(r=>release=r);if(fail)return {error:{message:'Scorecard unavailable'}};const c=card('m2','2nd Grade');context.cards.push(c);return {data:{snapshot_id:c.snapshot_id,scorecard:c.scorecard}};}}};
 const ui=createSharedMatchResults({supabase:api,escape:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),here:()=>true,extractUrl:v=>v[0],canLeave:()=>true,changed:async()=>changed++,confirm:()=>approval});
 const until=async pred=>{for(let n=0;n<100;n++){if(pred())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out');};
 ui.mount(s,'2026-10-18');await until(()=>s.results.context&&!s.results.busy);assert.match(document.body.textContent,/1 of 2/);
 assert.equal(await ui.check(s,'2026-10-18'),false,'Missing team is reviewed before any award can finish');
 approval=true;assert.equal(await ui.check(s,'2026-10-18'),true,'Volunteer may knowingly continue with partial results');
 const input=document.querySelector('[data-result-link="f2"]');input.value='https://play.cricket.com.au/match/m2';input.dispatchEvent(new window.Event('input'));fail=true;document.querySelector('[data-result-load="f2"]').click();await until(()=>!s.results.busy);assert.match(document.body.textContent,/Scorecard unavailable/);assert.equal(document.querySelector('[data-result-link="f2"]').value,input.value);
 fail=false;document.querySelector('[data-result-load="f2"]').click();assert.equal(document.getElementById('sharedResultsRefresh').disabled,true);await until(()=>!s.results.busy);assert.equal(changed,1);assert.match(document.body.textContent,/2 of 2/);assert.equal(context.cards.length,2);assert.equal(document.querySelector('[data-result-load="f2"]'),null);assert.equal(await ui.check(s,'2026-10-18'),true);
});
test('Match Review loads an existing shared snapshot without another external import or subjective edits',async()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const start=app.indexOf('function matchReviewSharedKey('),end=app.indexOf('async function matchReviewShareSource(',start);
 const s={scope:'user:club',loaded:{match_date:'2026-10-17',format_key:'limited_overs'},group:'group',fixtureId:'fixture',drafts:{player:{batting_to_plan:'yes'}}},i={dirty:false};let calls=0,rendered=0;
 const preview={snapshot_id:'shared-snapshot',our_team_id:'our',scorecard:card('m1','1st Grade').scorecard};
 const ctx={JSON,Array,String,Error,club:{id:'club'},currentTab:'team_review',ensureTeamReviewState:()=>s,matchReviewImportState:()=>i,matchReviewClubTeam:(_,id)=>id,matchReviewMapScores:flag=>assert.equal(flag,false),renderTeamReviewContent:()=>rendered++,supabase:{rpc:async(name,args)=>{calls++;assert.equal(name,'club_match_results_api');assert.equal(args.p_action,'review');return {data:{preview,choices:[]}};}}};
 vm.createContext(ctx);vm.runInContext(app.slice(start,end),ctx);await ctx.matchReviewLoadShared();assert.equal(i.preview.snapshot_id,'shared-snapshot');assert.equal(calls,1);assert.equal(s.drafts.player.batting_to_plan,'yes');assert.ok(rendered);await ctx.matchReviewLoadShared();assert.equal(calls,1,'Rendering again does not repeatedly fetch');
 i.dirty=true;s.sharedResultsChecked=null;await ctx.matchReviewLoadShared();assert.equal(calls,1,'Unsaved score confirmations are preserved');
});
test('new shared scores refresh the visible award and mark other awards for refresh',async()=>{
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),start=app.indexOf('async function socialResultsChanged('),end=app.indexOf('function socialSetResultsWeek(',start);
 for(const view of ['team_week','player_week','results','century','five_wickets','award_collection']){
  const s={view},shown=[],make=key=>({state:()=>s[key]||=( {sharedStale:true}),load:async()=>{shown.push('loaded '+key);},render:()=>shown.push('rendered '+key)});
  const ctx={socialWeek:make('week'),socialPlayerWeek:make('playerWeek'),socialAwards:make('awards'),socialHere:()=>true};vm.createContext(ctx);vm.runInContext(app.slice(start,end),ctx);await ctx.socialResultsChanged(s);
  const current=view==='team_week'?'week':view==='player_week'?'playerWeek':'awards';assert.equal(shown[0],'loaded '+current);if(current==='awards')assert.equal(shown[1],'rendered awards','A loaded milestone or result must appear without another click');
  assert.equal(s[current].sharedStale,false);for(const key of ['week','playerWeek','awards'])if(key!==current)assert.equal(s[key].sharedStale,true);
 }
});
