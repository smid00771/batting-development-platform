const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const controls=(h,selector,key)=>[...h.document.querySelectorAll(selector)].map(n=>n.dataset[key]);
const input=(h,selector,value)=>{const n=h.document.querySelector(selector);assert.ok(n,selector);n.value=value;n.dispatchEvent(new h.window.Event('input',{bubbles:true}));};
const clean=h=>{assert.deepEqual(h.errors.map(e=>e.message),[]);assert.deepEqual(plain(h.window.__fixtureLogs.filter(e=>['error','unsupported'].includes(e.kind))),[]);assert.equal(h.window.localStorage.length,0);assert.equal(h.window.sessionStorage.length,0);};

test('welcome offers three product entrances and a player in every product',async t=>{
 const h=await openDemo();t.after(h.close);
 assert.deepEqual(controls(h,'[data-demo-product]','demoProduct'),['select','batting','both']);
 for(const product of ['select','batting','both']){
  await h.click('[data-demo-product="'+product+'"]');assert.ok(h.document.querySelector('[data-demo-role="player"]'));assert.match(h.document.querySelector('#demoWelcome h1').textContent,product==='both'?/Both products/:/only/);
  await h.click('[data-demo-products]');
 }
 clean(h);
});

test('browser Back and Forward restore the product chooser, role chooser and selected account',async t=>{
 const h=await openDemo();t.after(h.close);
 const travel=async method=>{await new Promise(resolve=>{h.window.addEventListener('popstate',resolve,{once:true});h.window.history[method]();});await h.settle();};
 await h.click('[data-demo-product=both]');await h.click('[data-demo-role=player]');
 assert.equal(h.document.querySelector('#demoPersona').value,'player');
 await travel('back');assert.match(h.document.querySelector('#demoWelcome h1').textContent,/Both products/);
 await travel('back');assert.equal(h.document.querySelectorAll('[data-demo-product]').length,3);
 await travel('forward');assert.ok(h.document.querySelector('[data-demo-role=player]'));clean(h);
});

test('just a player has product-appropriate navigation and no staff or draft privileges',async()=>{
 for(const product of ['select','batting','both']){
  const h=await openDemo({product,role:'player'});
  try{
   const nav=controls(h,'#clubMainNav button','tab');
   assert.equal(nav.includes('teams'),product!=='batting');assert.equal(nav.includes('myplan'),product!=='select');
   for(const denied of ['players','team_review','permissions','club_settings'])assert.equal(nav.includes(denied),false);
   assert.equal(h.document.querySelector('[data-se-view="board"]'),null);assert.equal(h.document.querySelector('[data-se-view="socials"]'),null);
   assert.equal(h.window.eval('canContributePhilosophy()'),false);
   if(product!=='batting'){
    const result=await h.window.eval("supabase.rpc('club_selections_api',{p_club_id:club.id,p_action:'context'})");
    assert.ok(result.data.fixtures.every(f=>f.published&&f.draft_visible===false&&f.can_edit===false));
    assert.ok(result.data.roster.every(p=>p.user_id==='user-alex'));
    const denied=await h.window.eval("supabase.rpc('club_selections_api',{p_club_id:club.id,p_action:'publish',p_data:{ids:['selection-first']}})");assert.ok(denied.error);
   }
   clean(h);
  }finally{h.close();}
 }
});

test('each role opens its allowed journeys without borrowing another role',async()=>{
 for(const role of ['captain','selector','head','admin','coach','lead','participant','combined','socials']){
  const h=await openDemo({product:'both',role});
  try{
   const identity=h.window.eval('session.user.id'),tasks=plain(h.window.eval('demoTasks()'));
   for(const journey of tasks){await h.choose('#demoStage',journey);assert.equal(h.window.eval('session.user.id'),identity);clean(h);}
   if(role==='admin'){await h.choose('#demoStage','selection_admin');assert.equal(h.document.querySelector('[data-se-view=board]'),null);}
   if(role==='participant'||role==='combined'){assert.equal(h.window.eval('canContributePhilosophy()'),true);assert.equal(h.window.eval('isPlayerUser()'),true);assert.ok(h.document.querySelector('#clubMainNav [data-tab=myplan]'));assert.equal(h.window.eval('isPhilosophyLead()'),false);}
   if(role==='lead')assert.equal(h.window.eval('isPhilosophyLead()'),true);
  }finally{h.close();}
 }
});

test('group grants distinguish view, edit and publication, including an independent Masters head',async t=>{
 const h=await openDemo({product:'select',role:'selector'});t.after(h.close);
 const context=await h.window.eval("supabase.rpc('club_selections_api',{p_club_id:club.id,p_action:'context'})");
 const senior=context.data.fixtures.find(f=>f.id==='selection-first'),masters=context.data.fixtures.find(f=>f.id==='masters-upcoming');
 assert.equal(senior.can_edit,true);assert.equal(senior.can_publish,false);assert.equal(masters.draft_visible,true);assert.equal(masters.can_edit,false);
 assert.ok((await h.window.eval("supabase.rpc('club_selections_api',{p_club_id:club.id,p_action:'publish',p_data:{ids:['selection-first']}})")).error);
 await h.choose('#demoPersona','head');
 const head=await h.window.eval("supabase.rpc('club_selections_api',{p_club_id:club.id,p_action:'context'})");
 assert.equal(head.data.fixtures.find(f=>f.id==='selection-first').can_publish,true);assert.equal(head.data.fixtures.find(f=>f.id==='masters-upcoming').can_publish,false);
 clean(h);
});

test('availability changes persist across role and product switches, and Reset restores the example',async t=>{
 const h=await openDemo({product:'select',role:'player',journey:'availability'});t.after(h.close);
 const day=h.window.eval('demoUpcomingSaturday()'),button='[data-se-date="'+day+'"]';
 await h.click(button);await h.click('#seSaveAvailability');
 assert.equal(h.document.querySelector(button).dataset.seAvailability,'unavailable');
 await h.choose('#demoPersona','selector');await h.choose('#demoPersona','player');await h.choose('#demoProduct','both');await h.choose('#demoStage','availability');
 assert.equal(h.document.querySelector(button).dataset.seAvailability,'unavailable');
 await h.click('#demoReset');assert.equal(h.document.querySelector(button).dataset.seAvailability,'available');clean(h);
});

test('new club request, example credentials and season setup use the delivered UI end to end',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'connection',scenario:'newclub'});t.after(h.close);
 assert.match(h.document.querySelector('.pc-connection').textContent,/Access not requested/);
 assert.equal(h.window.eval('demoSelections.fixtures.length'),0);assert.equal(h.window.eval('fixtureGroups.length'),0);
 await h.click('[data-pc-request]');await h.click('[data-pc-request-form] button');
 assert.ok(h.document.querySelector('[data-pc-request-text]'));assert.equal(h.window.eval('demoConnection.state'),'not_requested');
 h.document.querySelector('[data-pc-sent] [name=authorised]').checked=true;await h.click('[data-pc-sent] button');assert.equal(h.window.eval('demoConnection.state'),'awaiting_key');
 await h.click('[data-pc-key]');await h.click('[data-demo-credentials]');h.document.querySelector('[data-pc-credentials] [name=authorised]').checked=true;await h.click('[data-pc-credentials] button:not([type])');
 assert.equal(h.window.eval('demoConnection.verified'),true);assert.equal(h.window.eval('demoConnection.polling_enabled'),false);assert.equal(h.document.querySelector('[name=api_key]'),null);
 await h.click('[data-pc-season]');await h.click('[data-phq-seasons]');await h.choose('[data-phq-season]','demo-season');
 input(h,'[data-sg-new-name]','Our seniors');await h.click('[data-sg-new]');const group=h.document.querySelector('[data-sg-import-group] option:nth-child(2)').value;
 await h.choose('[data-sg-import-group="source-first"]',group);await h.choose('[data-sg-import-group="source-fifth"]',group);await h.click('[data-sg-form] button:not([type])');
 assert.match(h.document.querySelector('[data-sg-form] h3').textContent,/Match existing grades/);await h.click('[data-sg-form] button:not([type])');
 assert.match(h.document.querySelector('[data-phq-saved]').textContent,/2 fixtures loaded/);assert.equal(h.window.eval('demoConnection.polling_enabled'),true);assert.ok(h.document.querySelector('[data-sgm-captains]'));
 await h.choose('#demoStage','season');assert.match(h.document.querySelector('[data-phq-saved]').textContent,/2 fixtures loaded/);assert.match(h.document.querySelector('#seContent').textContent,/Our seniors/);
 clean(h);
});

test('an empty Selection Group can be saved without a provider connection',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'selection_groups',scenario:'newclub'});t.after(h.close);
 await h.click('[data-sgm-add-group]');input(h,'[data-field=name]','Junior cricket');await h.click('[data-sgm-form] button:not([type])');
 assert.match(h.document.querySelector('#seContent').textContent,/Junior cricket/);assert.equal(h.window.eval('demoConnection.configured'),false);assert.equal(h.window.eval('demoSelections.fixtures.length'),0);
 await h.choose('#demoStage','connection');await h.choose('#demoStage','selection_groups');assert.match(h.document.querySelector('#seContent').textContent,/Junior cricket/);clean(h);
});

test('combined-product group sharing is explicit and survives a page revisit',async t=>{
 const h=await openDemo({product:'both',role:'admin',journey:'selection_groups'});t.after(h.close);
 const box=h.document.querySelector('[data-sgm-batting="sg-senior"]');assert.equal(box.checked,true);box.click();await h.settle();
 await h.choose('#demoStage','selection_admin');await h.choose('#demoStage','selection_groups');assert.equal(h.document.querySelector('[data-sgm-batting="sg-senior"]').checked,false);
 await h.choose('#demoProduct','select');await h.choose('#demoStage','selection_groups');assert.equal(h.document.querySelector('[data-sgm-batting]'),null);clean(h);
});

test('download embeds current UI with no SDK/configuration and blocks live network writes',()=>{
 const html=fs.readFileSync('demo.html','utf8');assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/from ['"]https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase/);assert.doesNotMatch(html,/https:\/\/[a-z]{20}\.supabase\.co/);assert.match(html,/DEMO-KEY-NOT-REAL/);
 const manifest=JSON.parse(fs.readFileSync('Demo/build-manifest.json','utf8'));const version=fs.readFileSync('app.js','utf8').match(/APP_UI_VERSION='([^']+)'/)[1];assert.equal(manifest.appVersion,version);for(const f of ['selection-group-permissions.js','playcricket-connection.js','social-award-scopes.js','social-graphic-assistant.js'])assert.ok(manifest.sources[f]);
});

test('graphic suggestions preview before Apply, and Undo restores the previous design',async t=>{
 const h=await openDemo({product:'select',role:'socials',journey:'socials'});t.after(h.close);
 await h.choose('#socialCreateMenu','team_week');
 const before=plain(h.window.eval('socialState.week.layout'));
 input(h,'#twAIBrief','use gold text');await h.click('#twAITry');
 assert.match(h.document.querySelector('#twAIStatus').textContent,/Proposed changes:/);
 assert.equal(h.document.querySelector('#twAIUse').disabled,false);
 assert.notDeepEqual(plain(h.window.eval('socialState.week.layout')),before);
 await h.click('#twAIUndo');assert.deepEqual(plain(h.window.eval('socialState.week.layout')),before);
 await h.click('#twAITry');await h.click('#twAIUse');
 assert.match(h.document.querySelector('#twAIStatus').textContent,/Changes applied/);
 const applied=plain(h.window.eval('socialState.week.layout'));
 await h.click('[data-social-view=graphics]');await h.choose('#socialCreateMenu','team_week');
 assert.deepEqual(plain(h.window.eval('socialState.week.layout')),applied);clean(h);
});

test('all five awards remember their own scope, use one Week label, and omit abandoned no-play fixtures',async t=>{
 const h=await openDemo({product:'both',role:'socials',journey:'social_awards'});t.after(h.close);
 for(const checkbox of h.document.querySelectorAll('[data-sa-choice]')){checkbox.checked=true;checkbox.dispatchEvent(new h.window.Event('change',{bubbles:true}));}
 await h.click('#saSaveChoices');await h.click('[data-social-view=graphics]');
 for(const kind of ['team_week','player_week','results','century','five_wickets']){
  await h.choose('#socialCreateMenu',kind);assert.ok(h.document.querySelector('#awardScope'));assert.ok(h.document.querySelector('canvas'));
  await h.choose('#awardScopeMode','groups');const box=h.document.querySelector('[data-award-scope-id=sg-senior]');box.checked=true;box.dispatchEvent(new h.window.Event('change',{bubbles:true}));await h.click('#awardScopeApply');
  assert.match(h.document.querySelector('#awardScope summary').textContent,/Senior cricket/);
  assert.equal(h.document.getElementById('awardWeekLabel').value,'Week 2');
  const pool=h.window.eval("socialState.view==='team_week'?socialState.week.context?.candidates:socialState.view==='player_week'?socialState.playerWeek.context?.candidates:socialState.awards.context?.candidates");assert.ok(pool?.length,kind+' has real fictional performances to explore');
  assert.ok(pool.every(p=>p.grade==='First XI'||p.grade==='Fifth Grade'));
  await h.click('[data-social-view=graphics]');
 }
 await h.choose('#socialCreateMenu','results');assert.match(h.document.querySelector('#awardScope summary').textContent,/Senior cricket/);
 input(h,'#awardWeekLabel','Week 7');h.document.getElementById('awardWeekLabel').dispatchEvent(new h.window.Event('change',{bubbles:true}));await h.click('#awardLabelApply');await h.click('[data-social-view=graphics]');await h.choose('#socialCreateMenu','team_week');assert.equal(h.document.getElementById('awardWeekLabel').value,'Week 7');
 const results=h.window.eval('demoSharedResults.context(demoAddDay(demoUpcomingSaturday(),-6))');assert.equal(results.fixtures.find(f=>f.id==='masters-abandoned').no_play,'abandoned');
 clean(h);
});
