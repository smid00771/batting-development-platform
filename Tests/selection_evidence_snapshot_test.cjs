const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.ok(check(),'Requested analysis did not settle');}
async function setup(returning=false){
 const {createSelectionEvidenceSnapshot}=await import('../selection-evidence-snapshot.js'),{returningPlayers}=await import('../selection-returning.js'),{resolveSelectionStatsTeams}=await import('../season-stats.js');
 const f=returning?(await import('./fixtures/selection_returning_fixture.mjs')).selectionReturningFixture():(await import('./fixtures/selection_evidence_fixture.mjs')).selectionEvidenceFixture();
 const dom=new JSDOM('<button id="form"></button><button id="returns"></button><main></main>',{url:'https://example.invalid'}),host=dom.window.document.querySelector('main');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let calls=0,allowed=true,reply=async()=>({data:f.context}),notices=[];
 const controller=createSelectionEvidenceSnapshot({here:()=>allowed,notice:m=>notices.push(m),supabase:{rpc:async(name,args)=>{calls++;assert.equal(name,'club_season_stats_api');assert.deepEqual(args.p_data,{on_demand:true});return reply();}}});
 const options={scope:'user:club',viewKey:'group:day',clubId:'club',teams:returning?[f.draft]:f.teams,referenceTeams:returning?f.references:f.teams,roster:f.roster,season:f.context.season,today:f.context.today,returningEligible:()=>true,formButton:dom.window.document.getElementById('form'),returningButton:dom.window.document.getElementById('returns')};
 function mount(){
  options.returningEntries=returningPlayers({teams:resolveSelectionStatsTeams(options.teams,options.season,options.referenceTeams),references:options.referenceTeams,roster:options.roster,season:options.season,today:options.today,eligible:()=>true,compare:false});
  host.innerHTML='<div class="se-grid">'+options.teams.map(team=>`<article data-se-team="${team.id}">${team.slots.flatMap(slot=>[...new Set([slot.d1,slot.d2].filter(Boolean))]).map(id=>`<div class="se-player-cell"><span data-se-evidence data-evidence-fixture="${team.id}" data-evidence-player="${id}"></span></div>`).join('')}<div class="se-actions"></div></article>`).join('')+'</div>';
  for(const e of options.returningEntries){const row=dom.window.document.createElement('details');row.dataset.seReturnKey=e.key;row.innerHTML='<summary>'+e.person.name+'</summary><p data-return-facts>Available again</p><div data-return-analysis></div>';host.querySelector(`[data-se-team="${e.team.id}"]`).append(row);}
  controller.mount(host,options);
 }
 mount();return {f,dom,host,controller,options,mount,calls:()=>calls,reply:fn=>reply=fn,allowed:v=>allowed=v,notices,async calculate(kind='form'){const button=options[kind==='form'?'formButton':'returningButton'];button.click();await until(()=>button.getAttribute('aria-busy')!=='true');}};
}
test('analysis runs only once per click and remains a frozen result across redraws, pauses and refreshes',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());assert.equal(h.calls(),0);assert.equal(h.host.querySelector('[data-evidence-open]'),null);
 await h.calculate();assert.equal(h.calls(),1);const marker=h.host.querySelector('[data-evidence-player="g1p0"] button');assert.match(marker.getAttribute('aria-label'),/Below guide.*with Pat Rowan/);
 const label=marker.getAttribute('aria-label');let reads=0;const cards=h.f.context.cards;Object.defineProperty(h.f.context,'cards',{get(){reads++;return cards;}});
 for(let i=0;i<5;i++){h.controller.pause();h.mount();}
 assert.equal(reads,0,'No season aggregation or model rebuilding on mount');assert.equal(h.calls(),1);assert.equal(h.host.querySelector('[data-evidence-player="g1p0"] button').getAttribute('aria-label'),label);
 h.host.querySelector('[data-evidence-player="g1p0"] button').click();assert.match(h.host.querySelector('dialog').textContent,/10 batting average/);assert.equal(h.calls(),1);
 await h.calculate();assert.equal(h.calls(),2,'The same button explicitly updates once');assert.ok(reads>0);
});
test('grade swaps remove affected relationships and moved-player badges without clearing unchanged form or recalculating',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());await h.calculate();
 const untouched=h.host.querySelector('[data-evidence-player="g1p2"] button').getAttribute('aria-label');
 [h.f.teams[0].slots[0],h.f.teams[1].slots[0]]=[h.f.teams[1].slots[0],h.f.teams[0].slots[0]];h.mount();
 assert.equal(h.host.querySelector('[data-evidence-player="g1p0"] button,[data-evidence-player="g2p0"] button'),null);
 assert.equal(h.host.querySelector('[data-evidence-connection]'),null,'Whole-XI balance relationships are invalidated');
 assert.equal(h.host.querySelector('[data-evidence-player="g1p2"] button').getAttribute('aria-label'),untouched);assert.equal(h.calls(),1);
 [h.f.teams[0].slots[0],h.f.teams[1].slots[0]]=[h.f.teams[1].slots[0],h.f.teams[0].slots[0]];h.mount();assert.equal(h.host.querySelector('[data-evidence-connection]'),null,'Undo does not resurrect invalidated analysis');
 await h.calculate();assert.ok(h.host.querySelector('[data-evidence-connection]'));assert.equal(h.calls(),2);
});
test('revision-only changes keep analysis while role, availability, format and season changes invalidate relevant results',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());await h.calculate();const before=h.host.querySelectorAll('[data-evidence-connection]').length;
 h.f.teams[0].revision=99;h.f.teams[0].comment_count=3;h.mount();assert.equal(h.host.querySelectorAll('[data-evidence-connection]').length,before);
 h.f.roster[0].availability.unavailable_dates=['2026-10-24'];h.mount();assert.equal(h.host.querySelector('[data-evidence-player="g1p0"] button'),null);assert.ok(h.host.querySelector('[data-evidence-player="g1p2"] button'));assert.equal(h.calls(),1);
 h.f.roster[2].bowling='spin';h.mount();assert.equal(h.host.querySelector('[data-evidence-player="g1p2"] button'),null);
 h.f.teams[1].format='t20';h.mount();assert.equal(h.host.querySelector('[data-se-team="team-2"] [data-evidence-open]'),null);
 h.options.season={start:'2027-07-01',end:'2028-06-30'};h.mount();assert.equal(h.host.querySelector('[data-evidence-open]'),null);assert.equal(h.calls(),1);
});
test('changing one lineup preserves relationships between unrelated teams',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());
 const other=JSON.parse(JSON.stringify(h.f).replace(/team-/g,'t20-team-').replace(/g([12])p/g,'t20-g$1p').replace(/match-/g,'t20-match-').replace(/long_form/g,'t20'));
 h.f.teams.push(...other.teams);h.f.roster.push(...other.roster);
 for(const name of ['cards','fixtures','identities'])h.f.context[name].push(...other.context[name]);
 h.mount();await h.calculate();
 const marker=()=>h.host.querySelector('[data-evidence-player="t20-g1p0"] button'),before=marker().getAttribute('aria-label');assert.match(before,/with Pat/);
 const links=h.host.querySelectorAll('[data-evidence-connection]').length;
 h.f.teams[0].slots[0].d1=null;h.mount();
 assert.equal(marker().getAttribute('aria-label'),before);assert.ok(h.host.querySelectorAll('[data-evidence-connection]').length>0);assert.ok(h.host.querySelectorAll('[data-evidence-connection]').length<links);assert.equal(h.calls(),1);
});
test('returning comparisons are independent, reused, and removed when the returner is used while the name reminder is always lightweight',async t=>{
 const h=await setup(true);t.after(()=>h.dom.window.close());assert.ok(h.host.querySelector('[data-se-return-key]'));assert.equal(h.calls(),0);
 await h.calculate('returns');assert.equal(h.calls(),1);assert.ok(h.host.querySelector('[data-return-compare]'));assert.equal(h.host.querySelector('[data-evidence-kind]'),null,'Returning comparison does not build/show form indicators');
 const before=h.host.querySelector('[data-return-analysis]').innerHTML;h.mount();assert.equal(h.host.querySelector('[data-return-analysis]').innerHTML,before);assert.equal(h.calls(),1);
 h.host.querySelector('[data-return-compare]').click();assert.match(h.host.querySelector('dialog').textContent,/Before absence.*While away/s);assert.equal(h.calls(),1);
 await h.calculate();assert.ok(h.host.querySelector('[data-evidence-kind]'));assert.equal(h.host.querySelector('[data-return-analysis]').innerHTML,before);assert.equal(h.calls(),2);
 h.f.draft.slots[0].d1=h.f.person.id;h.mount();assert.equal(h.host.querySelector('[data-se-return-key],[data-return-compare],.se-return-mark'),null);assert.equal(h.calls(),2);
 h.f.draft.slots[0].d1='cover';h.mount();assert.ok(h.host.querySelector('[data-se-return-key]'));assert.equal(h.host.querySelector('[data-return-compare]'),null,'Undo restores the reminder, not the comparison');
});
test('requests deduplicate, fail visibly without retry loops, and ignore late responses after edits or account changes',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());let finish;h.reply(()=>new Promise(resolve=>finish=resolve));
 h.options.formButton.click();h.options.formButton.click();h.options.returningButton.click();assert.equal(h.options.formButton.disabled,true);await until(()=>h.calls()===1);assert.equal(h.calls(),1);
 h.controller.pause();h.mount();finish({data:h.f.context});await tick();assert.equal(h.host.querySelector('[data-evidence-open]'),null);assert.equal(h.options.formButton.disabled,false);
 h.reply(async()=>({error:{message:'Temporary network failure'}}));await h.calculate();assert.match(h.notices.at(-1),/Could not calculate/);assert.equal(h.calls(),2);assert.equal(h.options.formButton.disabled,false);
 h.reply(async()=>({data:h.f.context}));await h.calculate();assert.ok(h.host.querySelector('[data-evidence-open]'));
 h.options.scope='another-user:another-club';h.mount();assert.equal(h.host.querySelector('[data-evidence-open]'),null);assert.equal(h.calls(),3);
 h.reply(()=>new Promise(resolve=>finish=resolve));h.options.formButton.click();await until(()=>h.calls()===4);h.allowed(false);finish({data:h.f.context});await tick();assert.equal(h.host.querySelector('[data-evidence-open]'),null);
});
test('leaving during analysis module loading starts no scorecard request',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());h.options.formButton.click();h.controller.pause();h.allowed(false);await tick();
 assert.equal(h.calls(),0);assert.equal(h.host.querySelector('[data-evidence-open]'),null);
});
test('authorisation failures clear private results and busy selections do not start analysis',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());await h.calculate();h.reply(async()=>({error:{code:'42501',message:'Selection access is required'}}));await h.calculate();assert.equal(h.host.querySelector('[data-evidence-open]'),null);
 h.options.canCalculate=()=>false;h.mount();assert.equal(h.options.formButton.disabled,true);await h.calculate();assert.equal(h.calls(),2);
});
