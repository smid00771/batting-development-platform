const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

test('delivered Basic/Smart controls keep separate drafts, require eleven human picks and survive score reload',async t=>{
 const h=await openDemo({product:'select',role:'socials',journey:'socials'});t.after(h.close);
 const original=h.window.__fixtureDb.rpc.bind(h.window.__fixtureDb);
 const make=(id,runs,wickets=0)=>({key:id,snapshot_id:'basic-card',match_id:'basic-match',team_id:'basic-club',player_id:id,name:id,grade:'Test Grade',runs,wickets,conceded:20,batting:runs?[{runs}]:[],bowling:wickets?[{wickets,runs:20,balls:60}]:[]});
 let players=[...Array.from({length:7},(_,i)=>make('Batter '+i,100-i*5)),...Array.from({length:7},(_,i)=>make('Bowler '+i,0,5-i%3)),make('All-rounder',50,3)];
 const card={snapshot_id:'basic-card',our_team:'basic-club',scorecard:{schema_version:2,match_id:'basic-match',status:'completed',grade:'Test Grade',url:'#',teams:[{id:'basic-club',name:'Test Club'},{id:'visitors',name:'Visitors'}],innings:[{team_id:'basic-club',complete:true,bowling_available:true},{team_id:'visitors',complete:true,bowling_available:true}]}};
 let revision=0;
 h.window.__fixtureDb.rpc=async(name,args)=>{
  const result=await original(name,args);
  if(name==='team_of_week_api'&&args.p_action==='context')return {data:{...result.data,cards:[structuredClone(card)],candidates:players.map(p=>({...structuredClone(p),key:p.key+(revision?'-updated':''),...(revision&&p.player_id==='Batter 0'?{runs:110,batting:[{runs:110}]}:{})}))}};
  return result;
 };
 await h.choose('#socialCreateMenu','team_week');
 const state=()=>h.window.eval('socialWeek.state(socialEnsure())');
 const keys=()=>Array.from(state().rows,p=>p.player_id);
 const smart=keys(),smartPoints=Array.from(state().review.contenders,p=>[p.key,p.points]);
 assert.ok(h.document.querySelector('[name=twMethod][value=smart]').checked);
 await h.click('[name=twMethod][value=basic]');
 assert.equal(h.document.querySelectorAll('[name=twMethod]:checked').length,1);
 assert.equal(state().review.contenders.length,13);assert.equal(state().rows.length,0);
 assert.equal(h.document.getElementById('twUseSuggested'),null);assert.equal(h.document.querySelector('[data-tw-open=strong]'),null);
 assert.match(h.document.getElementById('twShortlistSummary').textContent,/6 batters · 6 bowlers · 1 all-rounder/);
 assert.equal(h.document.querySelector('[data-tw-open=method]').open,false);
 for(let i=0;i<11;i++)await h.click('.tw-choice input:not(:checked):not(:disabled)');
 assert.equal(state().rows.length,11);assert.equal(new Set(keys()).size,11);
 assert.equal(h.document.querySelectorAll('.tw-choice input:not(:checked):disabled').length,2);
 assert.equal(h.document.getElementById('twSave').disabled,false);
 const basic=keys();await h.click('[name=twMethod][value=smart]');assert.deepEqual(keys(),smart);
 assert.deepEqual(Array.from(state().review.contenders,p=>[p.key,p.points]),smartPoints);
 await h.click('[name=twMethod][value=basic]');assert.deepEqual(keys(),basic);
 revision++;await h.window.eval('socialWeek.load(socialEnsure(),{preserve:true})');await h.settle();
 assert.deepEqual(keys(),basic);assert.equal(state().rows.find(p=>p.player_id==='Batter 0').runs,110);
 assert.ok(state().rows.every(p=>p.key.endsWith('-updated')));
 // Restoring the other mode must use refreshed source records as well.
 await h.click('[name=twMethod][value=smart]');assert.ok(state().rows.every(p=>p.key.endsWith('-updated')));
 await h.click('[name=twMethod][value=basic]');assert.deepEqual(keys(),basic);
 await h.choose('#twRankMode','bowling');assert.equal(h.document.querySelector('.tw-table th:last-child').textContent,'Wickets');
 assert.doesNotMatch(h.document.querySelector('.tw-table').textContent,/vs team-mates|rest of match|rating/);
 // Saving/finalising locks the method just like the other selection controls.
 state().pending={};h.window.eval('socialWeek.render(socialEnsure())');await h.settle();
 assert.ok([...h.document.querySelectorAll('[name=twMethod]')].every(e=>e.disabled));state().pending=null;
 // Reopening for this user/club remembers Basic, without bringing in an old XI.
 await h.window.eval('socialEnsure().week=null;socialWeek.render(socialEnsure())');await h.settle();
 assert.equal(state().totwMode,'basic');assert.equal(state().rows.length,0);
 assert.equal(h.errors.length,0,h.errors.map(e=>e.message).join('\n'));
});

test('Basic preference is isolated by account/club and switching weeks cannot restore a prior XI',async t=>{
 const h=await openDemo({product:'select',role:'socials',journey:'socials'});t.after(h.close);
 await h.choose('#socialCreateMenu','team_week');await h.click('[name=twMethod][value=basic]');
 await h.click('.tw-choice input:not(:checked):not(:disabled)');
 const next=h.window.eval("(()=>{const w=socialWeek.state(socialEnsure());w.end='2026-12-20';w.context=null;return socialWeek.load(socialEnsure());})()");
 await next;await h.settle();await h.click('[name=twMethod][value=smart]');await h.click('[name=twMethod][value=basic]');
 assert.equal(h.window.eval('socialWeek.state(socialEnsure()).rows.length'),0);
 assert.equal(h.window.eval("socialWeek.state({scope:'other-user:other-club',data:{timezone:'Australia/Sydney'}}).totwMode"),'smart');
 assert.equal(h.errors.length,0,h.errors.map(e=>e.message).join('\n'));
});
