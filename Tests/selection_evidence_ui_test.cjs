const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs');
 const engine=await import('../selection-evidence.js'),ui=await import('../selection-evidence-ui.js'),stats=await import('../season-stats.js');
 const fixture=selectionEvidenceFixture(),dom=new JSDOM('<main id="host"></main>'),host=dom.window.document.querySelector('main');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const markup=()=>fixture.teams.map(t=>t.slots.map(slot=>`<div class="se-player-cell"><button class="pick">${slot.d1}</button><span data-se-evidence data-evidence-fixture="${t.id}" data-evidence-player="${slot.d1}"></span></div>`).join('')).join('');
 host.innerHTML=markup();let calls=0,allowed=true,reply=async()=>({data:fixture.context});
 const controller=ui.createSelectionEvidence({here:()=>allowed,supabase:{rpc:async(name,args)=>{calls++;assert.equal(name,'club_season_stats_api');assert.equal(args.p_action,'context');return reply(args);}}});
 const options={scope:'user:club',clubId:'club',roster:fixture.roster,teams:fixture.teams};
 return {fixture,dom,host,engine,ui,stats,controller,options,calls:()=>calls,allowed:v=>allowed=v,reply:v=>reply=v,markup};
}
test('board colours and paired markers open actual figures without choosing or moving a player',async()=>{
 const h=await setup(),before=JSON.stringify(h.fixture);let picks=0;h.host.querySelector('.pick').onclick=()=>picks++;
 h.controller.mount(h.host,h.options);await tick();
 const button=h.host.querySelector('[data-evidence-player="g1p0"] button');assert.match(button.textContent,/Form guide/);assert.match(button.textContent,/Batting: ↓ Below guide/);assert.match(button.textContent,/↔/);
 button.click();const dialog=h.host.querySelector('dialog');assert.ok(dialog.open);assert.match(dialog.textContent,/Alex Rowan/);assert.match(dialog.textContent,/10 batting average/);
 const link=dialog.querySelector('.se-evidence-pair');link.open=true;assert.match(link.textContent,/Rough batting target in 2nd Grade: 20 average/);
 assert.equal(picks,0);assert.equal(JSON.stringify(h.fixture),before);
 dialog.querySelector('[data-evidence-close]').click();assert.equal(h.host.querySelector('dialog'),null);assert.equal(h.dom.window.document.activeElement,button);
});
test('small samples show building markers, and status has accessible text as well as colour',async()=>{
 const h=await setup();h.controller.mount(h.host,h.options);await tick();
 const button=h.host.querySelector('[data-evidence-player="g1p2"] button');assert.match(button.textContent,/Batting: · Not yet rated/);assert.match(button.getAttribute('aria-label'),/Not yet rated/);assert.doesNotMatch(button.textContent,/↔/);
 button.click();assert.match(h.host.querySelector('dialog').textContent,/Not yet rated/);
 h.host.querySelector('dialog').dispatchEvent(new h.dom.window.Event('cancel',{cancelable:true}));assert.equal(h.host.querySelector('dialog'),null);
});
test('one form guide control includes neutral bowling and explains the historical reference and early sample',async()=>{
 const h=await setup(),p=h.fixture.roster.find(p=>p.id==='g1p4');
 const stats={roster_id:p.id,competition:'NDCA',grade:'1st Grade',format:'limited_overs',runs:0,innings:0,not_outs:0,batting_complete:true,
  wickets:5,conceded:82,bowling_balls:113,bowling_innings:2,bowling_complete:true,economy:82*6/113};
 const item=h.engine.buildSelectionEvidence({rows:[stats]},[],[p]).forRow(stats);item.key='example';
 h.host.innerHTML=h.ui.renderEvidenceBadges(item);
 assert.equal(h.host.querySelectorAll('button').length,1);assert.match(h.host.textContent,/Bowling:  Within guide/);assert.match(h.host.textContent,/Form guide · early/);
 h.host.innerHTML=h.ui.renderEvidenceDetails(item);assert.match(h.host.textContent,/NDCA 2021\/22–2025\/26/);assert.match(h.host.textContent,/768 historical records/);
 assert.match(h.host.textContent,/All roles and match formats/);assert.match(h.host.textContent,/Early sample · 2 innings · 18.5 overs/);
 assert.doesNotMatch(h.host.textContent,/comparable club records|current club records/);
});
test('the early batting flag shows two innings and the limited evidence in the shared form dialog',async()=>{
 const h=await setup(),p=h.fixture.roster[0];
 const stats={roster_id:p.id,competition:'NDCA',grade:'1st Grade',format:'limited_overs',runs:93,innings:2,not_outs:0,average:46.5,
  batting_complete:true,bowling_complete:true,bowling_balls:0,bowling_innings:0,wickets:0,conceded:0};
 const item=h.engine.buildSelectionEvidence({rows:[stats]},[],[p]).forRow(stats);item.key='early-batter';
 h.host.innerHTML=h.ui.renderEvidenceBadges(item);assert.match(h.host.textContent,/Form guide · early/);assert.match(h.host.textContent,/Batting: ↑ Strong/);
 h.ui.bindEvidenceDetails(h.host,{players:new Map([[item.key,item]])});h.host.querySelector('button').click();
 assert.match(h.host.querySelector('dialog').textContent,/Early sample · 2 innings · 2 dismissals/);
 assert.match(h.host.querySelector('dialog').textContent,/46.5 batting average/);assert.match(h.host.querySelector('dialog').textContent,/93 runs · 2 inns · 0 not out/);
 assert.match(h.host.querySelector('dialog').textContent,/Positive batting flags can start after 2 innings/);
});
test('the mild slow-start flag has explicit accessible text and explains the two-innings threshold',async()=>{
 const h=await setup(),p=h.fixture.roster[0];
 const stats={roster_id:p.id,competition:'NDCA',grade:'1st Grade',format:'limited_overs',runs:8,innings:2,not_outs:0,average:4,
  batting_complete:true,bowling_complete:true,bowling_balls:0,bowling_innings:0,wickets:0,conceded:0};
 const item=h.engine.buildSelectionEvidence({rows:[stats]},[],[p]).forRow(stats);item.key='slow-batter';
 h.host.innerHTML=h.ui.renderEvidenceBadges(item);
 assert.match(h.host.textContent,/Form guide · early/);assert.match(h.host.querySelector('.se-evidence-chip.slow').textContent,/Batting: · Slow start/);
 assert.match(h.host.querySelector('button').getAttribute('aria-label'),/Slow start \(early sample\)/);
 assert.equal(h.host.querySelector('.se-evidence-chip.low'),null);assert.equal(h.host.querySelector('.se-evidence-link'),null);
 h.ui.bindEvidenceDetails(h.host,{players:new Map([[item.key,item]])});h.host.querySelector('button').click();
 const dialog=h.host.querySelector('dialog');
 assert.match(dialog.textContent,/Average below half the grade reference after 2 innings and 2 dismissals; an early signal only/);
 assert.match(dialog.textContent,/Early sample · 2 innings · 2 dismissals/);assert.match(dialog.textContent,/4 batting average/);
 assert.match(dialog.textContent,/Below-guide batting flags and batting-led swaps need 3 innings and 2 dismissals/);
});
test('repeated board redraws reuse saved figures; refresh corrections clear old markers and modal details',async()=>{
 const h=await setup();h.controller.mount(h.host,h.options);await tick();h.controller.mount(h.host,h.options);await tick();assert.equal(h.calls(),1);
 h.host.querySelector('[data-evidence-open]').click();h.reply(async()=>({data:{...h.fixture.context,cards:[]}}));h.controller.invalidate();await tick();
 assert.equal(h.calls(),2);assert.equal(h.host.querySelector('dialog'),null);assert.equal(h.host.querySelector('.se-evidence-chip.low'),null);
});
test('a late response cannot reveal another club’s or a departed board’s private evidence',async()=>{
 const h=await setup();let finish;h.reply(()=>new Promise(r=>finish=r));h.controller.mount(h.host,h.options);
 h.allowed(false);finish({data:h.fixture.context});await tick();assert.equal(h.host.querySelector('[data-evidence-open]'),null);
 h.allowed(true);h.reply(async()=>({data:{...h.fixture.context,cards:[],identities:[]}}));h.controller.mount(h.host,{...h.options,scope:'user:other',clubId:'other'});await tick();
 assert.equal(h.host.querySelector('.se-evidence-chip.low'),null);assert.equal(h.host.querySelector('.se-evidence-link'),null);
});
test('access errors remove evidence and never use a cached rating as if it were current',async()=>{
 const h=await setup();h.controller.mount(h.host,h.options);await tick();assert.ok(h.host.querySelector('[data-evidence-open]'));
 h.reply(async()=>({error:{message:'Selection access is required'}}));h.controller.invalidate();await tick();assert.equal(h.host.querySelector('[data-evidence-open]'),null);
});
test('comparison and normal Season stats markers both open without expanding the wrong player row',async()=>{
 const h=await setup(),{createSeasonStatsPanel}=await import('../season-stats-panel.js');
 const panel=createSeasonStatsPanel({here:()=>true,close(){},supabase:{rpc:async()=>({data:h.fixture.context})}});
 const mounted=panel.mount(h.host,{...h.options,state:{format:'long_form'},boardDate:'2026-10-24'});await tick();
 let button=h.host.querySelector('[data-evidence-open]');button.click();assert.ok(h.host.querySelector('dialog'));assert.equal(h.host.querySelectorAll('[data-stats-player][open]').length,0);
 h.host.querySelector('[data-evidence-close]').click();h.host.querySelector('[data-stats-compare]').click();
 assert.equal(h.host.querySelector('[data-stats-date]').value,'published');
 button=h.host.querySelector('[data-evidence-open]');button.click();assert.match(h.host.querySelector('dialog').textContent,/Possible comparisons/);
 assert.equal(mounted.state.compare,true);
});
test('player text is escaped in markers, dialogs and comparison explanations',async()=>{
 const h=await setup();h.fixture.roster[0].name='<img src=x onerror=alert(1)>';
 const model=h.engine.buildSelectionEvidence(h.stats.buildSeasonStats(h.fixture.context),h.fixture.teams,h.fixture.roster),item=model.player('team-1','g1p0');
 const html=h.ui.renderEvidenceBadges(item)+h.ui.renderEvidenceDetails(item);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
test('live board adapter passes only its visible date and permits captains/selectors, not ordinary players',()=>{
 const source=fs.readFileSync('app.js','utf8');const extract=name=>{const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);};
 const host={},calls=[],s={key:'u:c',view:'board',date:'2026-10-24',data:{captain:true,roster:[],fixtures:[{id:'this',details:{days:[{date:'2026-10-24'}]},slots:[]},{id:'old',details:{days:[{date:'2026-10-17'}]},slots:[]}]}};
 const c=vm.createContext({document:{getElementById:()=>host},currentTab:'teams',club:{id:'c'},ensureSelections:()=>s,selectionEvidence:{mount:(host,options)=>calls.push(options)}});
 vm.runInContext(extract('seBoardAccess')+'\n'+extract('seMountSelectionEvidence'),c);c.seMountSelectionEvidence();assert.deepEqual(Array.from(calls[0].teams,t=>t.id),['this']);
 s.data.captain=false;c.seMountSelectionEvidence();assert.equal(calls.length,1);s.data.selector=true;c.seMountSelectionEvidence();assert.equal(calls.length,2);
 c.currentTab='plan';c.seMountSelectionEvidence();assert.equal(calls.length,2);
});
