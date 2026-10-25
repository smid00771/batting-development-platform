const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');

test('both delivered award screens use scorecard context, including Team of the Week after reload',async t=>{
 const h=await openDemo({product:'select',role:'socials',journey:'socials'});t.after(h.close);
 const p={key:'context-player',snapshot_id:'context-card',match_id:'context-match',team_id:'context-club',player_id:'context-player',name:'Test Finisher',grade:'Test Grade',format:'limited_overs',runs:60,wickets:1,conceded:5,batting:[{player_id:'context-player',runs:60,balls:30,not_out:true,dismissal:'not out'}],bowling:[{player_id:'context-player',wickets:1,runs:5,balls:48}]};
 const card={snapshot_id:p.snapshot_id,our_team:p.team_id,scorecard:{schema_version:2,match_id:p.match_id,status:'completed',format_key:'limited_overs',grade:p.grade,result:'Test Club won',teams:[{id:p.team_id,name:'Test Club'},{id:'visitors',name:'Visitors'}],innings:[
  {team_id:'visitors',complete:true,bowling_available:true,runs:75,wickets:10,batters:[{player_id:'visitor',runs:75,balls:214}],bowlers:[...p.bowling,{player_id:'other',wickets:9,runs:69,balls:166}]},
  {team_id:p.team_id,complete:true,bowling_available:true,runs:79,wickets:0,batters:[...p.batting,{player_id:'partner',runs:14,balls:15}],bowlers:[]}
 ]}};
 const original=h.window.__fixtureDb.rpc.bind(h.window.__fixtureDb);
 h.window.__fixtureDb.rpc=async(name,args)=>{
  const result=await original(name,args);
  if(['team_of_week_api','player_of_week_api'].includes(name)&&args.p_action==='context')return {data:{...result.data,cards:[structuredClone(card)],candidates:[structuredClone(p)]}};
  return result;
 };
 await h.choose('#socialCreateMenu','team_week');
 assert.match(h.document.querySelector('.tw-table tbody').textContent,/76% of 79/);
 assert.match(h.document.querySelector('.tw-table tbody').textContent,/1\/5 in 8 overs · Econ 0.63 vs team-mates 2.49/);
 assert.match(h.document.querySelector('.tw-table tbody').textContent,/SR 200 vs rest of match 39/);
 await h.click('#twSuggest');
 const before=h.window.eval('socialWeek.state(socialEnsure()).review.strong[0].points');
 await h.window.eval('socialWeek.load(socialEnsure(),{preserve:true})');await h.settle();
 assert.equal(h.window.eval('socialWeek.state(socialEnsure()).review.strong[0].points'),before,'Refreshing scores must retain context in the shortlist as well as the ranking');
 await h.choose('#socialCreateMenu','player_week');
 assert.match(h.document.querySelector('.pw-contenders').textContent,/76% of 79/);
 assert.match(h.document.querySelector('.pw-contenders').textContent,/SR 200 vs rest of match 39/);
 assert.match(h.document.querySelector('.pw-contenders').textContent,/Econ 0.63 vs team-mates 2.49/);
 assert.equal(h.window.eval('socialPlayerWeek.state(socialEnsure()).winner'),null);
 assert.equal(h.document.getElementById('pwSave').disabled,true);
 // The qualifying wicketless spell must survive both automatic and manual picks.
 Object.assign(p,{runs:0,wickets:0,conceded:15,batting:[{player_id:p.player_id,runs:0,balls:2,not_out:false}],bowling:[{player_id:p.player_id,wickets:0,runs:15,balls:60}]});
 Object.assign(card.scorecard.innings[0],{runs:275,wickets:9,batters:[{player_id:'visitor',runs:275,balls:300}],bowlers:[...p.bowling,{player_id:'other',wickets:9,runs:260,balls:240}]});
 Object.assign(card.scorecard.innings[1],{runs:276,wickets:1,batters:[...p.batting,{player_id:'partner',runs:276,balls:298}]});
 await h.choose('#socialCreateMenu','team_week');
 await h.window.eval('socialWeek.load(socialEnsure())');await h.settle();
 assert.equal(h.window.eval('socialWeek.state(socialEnsure()).rows[0].display'),'bowling');
 await h.click('[data-tw-pick="context-player"]');
 assert.equal(h.window.eval('socialWeek.state(socialEnsure()).rows.length'),0);
 await h.click('[data-tw-pick="context-player"]');
 assert.equal(h.window.eval('socialWeek.state(socialEnsure()).rows[0].display'),'bowling','A manual pick must highlight the exceptional 0/15 spell, not the batting duck');
 await h.window.eval('socialWeek.load(socialEnsure(),{preserve:true})');await h.settle();
 assert.equal(h.window.eval('socialWeek.state(socialEnsure()).rows[0].display'),'bowling');
 await h.choose('#socialCreateMenu','player_week');
 await h.window.eval('socialPlayerWeek.load(socialEnsure())');await h.settle();
 assert.match(h.document.querySelector('.pw-contenders').textContent,/Standout bowling/);
 assert.match(h.document.querySelector('.pw-contenders').textContent,/0\/15/);
 assert.equal(h.window.eval('socialPlayerWeek.state(socialEnsure()).winner'),null);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
