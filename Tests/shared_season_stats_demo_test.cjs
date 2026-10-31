const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const statsCalls=h=>h.window.__statsCalls||[];
function trackStats(h){h.window.eval("(()=>{window.__statsCalls=[];const original=supabase.rpc;supabase.rpc=async(name,args)=>{if(name==='club_season_stats_api')window.__statsCalls.push({name,args});return original(name,args);};})()");}
test('Select and linked clubs expose one working Season stats entry under More, with quiet startup and return',async()=>{
 for(const product of ['select','both']){
  const h=await openDemo({product,role:'admin',journey:'products'},{traceRpc:true});
  try{
   trackStats(h);
   assert.equal(h.document.querySelector('[data-tab="season_stats"]'),null);
   assert.equal(statsCalls(h).length,0);
   await h.click('[data-tab="teams"]');
   assert.equal(h.document.querySelectorAll('#seSeasonStats').length,1);
   assert.ok(h.document.querySelector('#seMore #seSeasonStats'));
   assert.equal(h.document.querySelector('#seSeasonStats').disabled,false);
   assert.equal(statsCalls(h).length,0);
   await h.click('#seSeasonStats');
   assert.ok(h.document.querySelector('[aria-label="Season stats"]'));
   assert.equal(statsCalls(h).length,1);assert.equal(statsCalls(h)[0].args.p_data.on_demand,true);
   await h.click('[data-stats-mode="bowling"]');assert.equal(statsCalls(h).length,1);
   await h.click('[data-stats-close]');assert.ok(h.document.querySelector('#seMore').open);
   assert.equal(statsCalls(h).length,1);assert.equal(h.document.querySelector('.season-stats'),null);
   assert.deepEqual(h.errors.map(e=>e.message),[]);
  }finally{h.close();}
 }
});
test('Club Batting-only staff use the same view without enabling or fetching Select',async()=>{
 for(const role of ['admin','coach']){
  const h=await openDemo({product:'batting',role,journey:'products'},{traceRpc:true});
  try{
   trackStats(h);
   assert.ok(h.document.querySelector('[data-tab="season_stats"]'));
   assert.equal(h.document.querySelector('[data-tab="teams"]'),null);
   assert.equal(statsCalls(h).length,0);
   await h.click('[data-tab="season_stats"]');
   assert.ok(h.document.querySelector('[data-stats-mode="batting"]'));
   assert.equal(statsCalls(h).length,1);assert.equal(h.window.eval('selectionsEnabled()'),false);
   assert.equal(h.rpcCalls.filter(c=>c.name==='club_selections_api'&&c.args.p_action==='context').length,0);
   if(role==='coach')assert.equal(h.document.querySelector('[data-stats-season]'),null);
   await h.click('[data-stats-mode="bowling"]');
   assert.equal(h.document.querySelector('[data-stats-mode="bowling"]').getAttribute('aria-pressed'),'true');
   await h.click('[data-stats-compare]');
   assert.equal(h.document.querySelector('[data-stats-date]').value,'season');
   assert.doesNotMatch(h.document.querySelector('[data-stats-date]').textContent,/Current|Last published/);
   assert.ok(h.document.querySelector('[data-stats-team="secondTeam"]').options.length);
   assert.deepEqual(h.errors.map(e=>e.message),[]);
  }finally{h.close();}
 }
});
test('ordinary players cannot open stats or request its totals in any product',async()=>{
 for(const product of ['batting','select','both']){
  const h=await openDemo({product,role:'player',journey:'player_home'},{traceRpc:true});
  try{assert.equal(h.window.eval("canOpenClubTab('season_stats')"),false);assert.equal(h.document.querySelector('[data-tab="season_stats"]'),null);assert.equal(statsCalls(h).length,0);}finally{h.close();}
 }
});
test('season-date edits block navigation and Back/Forward retains stats filters',async()=>{
 const h=await openDemo({product:'batting',role:'admin',journey:'products'},{traceRpc:true});
 try{
   trackStats(h);
  await h.click('[data-tab="season_stats"]');await h.choose('[data-stats-filter="format"]','t20');await h.click('[data-stats-mode="bowling"]');
  const marker=h.window.history.state.clubBattingNavigation,route=h.window.eval('clubNavigationRoute()');assert.equal(route.seasonStats.filters.format,'t20');assert.equal(route.seasonStats.filters.mode,'bowling');
  const el=h.document.querySelector('[name="start"]');el.value='2026-08-01';el.dispatchEvent(new h.window.Event('input',{bubbles:true}));h.window.confirm=()=>false;
  await h.click('[data-tab="batting_fixtures"]');assert.ok(h.document.querySelector('.season-stats'));assert.equal(h.document.querySelector('[name="start"]').value,'2026-08-01');
  h.window.confirm=()=>true;await h.click('[data-tab="batting_fixtures"]');assert.equal(h.document.querySelector('.season-stats'),null);
  h.window.history.go(marker.index-h.window.history.state.clubBattingNavigation.index);await new Promise(resolve=>setTimeout(resolve,70));await h.settle();
  assert.equal(h.document.querySelector('[data-stats-filter="format"]').value,'t20');
  assert.equal(h.document.querySelector('[data-stats-mode="bowling"]').getAttribute('aria-pressed'),'true');
 }finally{h.close();}
});
