const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs');
 const engine=await import('../selection-evidence.js'),ui=await import('../selection-evidence-ui.js'),stats=await import('../season-stats.js');
 const fixture=selectionEvidenceFixture(),dom=new JSDOM('<main id="host"></main>',{url:'https://example.invalid'}),host=dom.window.document.querySelector('main');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const markup=()=>'<label><input type="checkbox" data-evidence-toggle checked>Show form indicators</label>'+fixture.teams.map(t=>t.slots.map(slot=>`<div class="se-player-cell"><button class="pick">${slot.d1}</button><span data-se-evidence data-evidence-fixture="${t.id}" data-evidence-player="${slot.d1}"></span></div>`).join('')).join('');
 host.innerHTML=markup();let calls=0,allowed=true,reply=async()=>({data:fixture.context});
 const controller=ui.createSelectionEvidence({here:()=>allowed,supabase:{rpc:async(name,args)=>{calls++;assert.equal(name,'club_season_stats_api');assert.equal(args.p_action,'context');return reply(args);}}});
 const options={scope:'user:club',clubId:'club',roster:fixture.roster,teams:fixture.teams};
 return {fixture,dom,host,engine,ui,stats,controller,options,calls:()=>calls,allowed:v=>allowed=v,reply:v=>reply=v,markup};
}
test('board colours and paired markers open actual figures without choosing or moving a player',async()=>{
 const h=await setup(),before=JSON.stringify(h.fixture);let picks=0;h.host.querySelector('.pick').onclick=()=>picks++;
 h.controller.mount(h.host,h.options);await tick();
 const button=h.host.querySelector('[data-evidence-player="g1p0"] button');assert.ok(button.classList.contains('se-evidence-compact'));assert.doesNotMatch(button.textContent,/Form guide|Batting|Bowling|Below guide/);assert.match(button.getAttribute('aria-label'),/Batting: Below guide/);assert.ok(button.querySelector('[data-evidence-kind=bat].low svg'));assert.equal(button.querySelector('[data-evidence-kind=ball]'),null);assert.match(button.textContent,/↔/);
 button.click();const dialog=h.host.querySelector('dialog');assert.ok(dialog.open);assert.match(dialog.textContent,/Alex Rowan/);assert.match(dialog.textContent,/10 batting average/);
 const link=dialog.querySelector('.se-evidence-pair');link.open=true;assert.match(link.textContent,/Rough batting target in 2nd Grade: 20 average/);
 assert.equal(picks,0);assert.equal(JSON.stringify(h.fixture),before);
 dialog.querySelector('[data-evidence-close]').click();assert.equal(h.host.querySelector('dialog'),null);assert.equal(h.dom.window.document.activeElement,button);
});
test('small samples show building markers, and status has accessible text as well as colour',async()=>{
 const h=await setup();h.controller.mount(h.host,h.options);await tick();
 const button=h.host.querySelector('[data-evidence-player="g1p2"] button');assert.ok(button.querySelector('[data-evidence-kind=bat].building'));assert.doesNotMatch(button.textContent,/Not yet rated/);assert.match(button.getAttribute('aria-label'),/Not yet rated/);assert.doesNotMatch(button.textContent,/↔/);
 button.click();assert.match(h.host.querySelector('dialog').textContent,/Not yet rated/);
 h.host.querySelector('dialog').dispatchEvent(new h.dom.window.Event('cancel',{cancelable:true}));assert.equal(h.host.querySelector('dialog'),null);
});
test('a promoted player keeps their actual lower-grade season totals and recent match visible after a board redraw',async()=>{
 const h=await setup(),p=h.fixture.roster.find(p=>p.id==='g2p0');
 Object.assign(p,{batting:'middle',bowling:'pace',bowling_load:'frontline'});
 const card=h.fixture.context.cards.find(c=>c.scorecard.match_id==='match-2-2');
 h.fixture.context.cards=[card];card.scorecard.format_key='limited_overs';
 h.fixture.context.fixtures.find(f=>f.id===card.fixture_id).format='limited_overs';
 card.scorecard.innings[0].batters.find(b=>b.player_id==='source-'+p.id).runs=57;
 card.scorecard.innings[1].bowlers.push({player_id:'source-'+p.id,team_id:'us',wickets:2,runs:40,balls:48,maidens:0,importable:true});
 h.fixture.teams.forEach(t=>t.format='limited_overs');
 h.fixture.teams[0].slots[0]={d1:p.id};h.fixture.teams[1].slots[0]={d1:null};h.host.innerHTML=h.markup();
 const before=JSON.stringify(h.fixture.context);h.controller.mount(h.host,h.options);await tick();
 const button=h.host.querySelector(`[data-evidence-player="${p.id}"] button`);button.click();
 let dialog=h.host.querySelector('dialog'),other=dialog.querySelector('.se-other-grades');
 assert.match(dialog.querySelector('.se-evidence-heading').textContent,/1st Grade · Limited overs/);
 assert.match(dialog.querySelector('.se-evidence-metrics').textContent,/No 1st Grade figures in this format this season/);
 assert.doesNotMatch(dialog.querySelector('.se-evidence-metrics').textContent,/57 batting average/);
 assert.equal(other.querySelector('strong').textContent,'2nd Grade');
 assert.match(other.textContent,/Bat avg 57 \(1 inn\) · Bowl avg 20.00 \(2 wkts\)/);
 assert.match(other.querySelector('small').textContent,/Latest · 17 Oct: Bat 57 · Bowl 2\/40/);
 assert.equal(other.querySelectorAll('button,details,ul,h3,h4').length,0,'Keep the context to two compact text rows');
 assert.doesNotMatch(dialog.textContent,/No linked season figures/);assert.equal(JSON.stringify(h.fixture.context),before);
 // Returning to the original grade uses the same scores as the main record.
 h.fixture.teams[0].slots[0]={d1:null};h.fixture.teams[1].slots[0]={d1:p.id};h.host.innerHTML=h.markup();
 h.controller.mount(h.host,h.options);await tick();assert.equal(h.calls(),1);
 h.host.querySelector(`[data-evidence-player="${p.id}"] button`).click();dialog=h.host.querySelector('dialog');
 assert.match(dialog.querySelector('.se-evidence-heading').textContent,/2nd Grade · Limited overs/);
 assert.match(dialog.textContent,/57 batting average/);assert.equal(dialog.querySelector('.se-other-grades'),null);
 assert.equal(JSON.stringify(h.fixture.context),before);
});
test('compact other-grade context shows only the latest grade and match, preserves not-outs and labels incomplete figures',async()=>{
 const h=await setup(),p=h.fixture.roster[0],current={roster_id:p.id,competition:'NDCA',grade:'1st Grade',format:'limited_overs',runs:0,innings:0,not_outs:0,bowling_balls:0,bowling_innings:0,wickets:0,conceded:0};
 const other={...current,grade:'2nd Grade',runs:57,innings:1,not_outs:1,average:null,batting_complete:false,bowling_complete:false,bowling_innings:1,history:[
  {date:'2026-10-03',opposition:'Old match',batting:[{runs:1,not_out:false}],bowling:[],bowling_available:false},
  {date:'2026-10-17',opposition:'<img src=x onerror=alert(1)>',batting:[{runs:57,not_out:true},{dnb:true}],bowling:[{wickets:2,runs:40,balls:47}],batting_incomplete:true},
  {date:'2026-10-10',opposition:'Earlier match',batting:[],batting_available:true,bowling:[],bowling_available:true},
  {date:'2026-10-24',opposition:'Latest match',batting:[],bowling:[]}
 ]};
 const older={...other,grade:'3rd Grade',history:[{date:'2026-09-26',batting:[{runs:999}],bowling:[]}]};
 const before=JSON.stringify(other),item=h.engine.buildSelectionEvidence({rows:[current,other,older]},[],[p]).forRow(current);
 h.host.innerHTML=h.ui.renderEvidenceDetails(item);let section=h.host.querySelector('.se-other-grades');
 assert.equal(h.host.querySelectorAll('.se-other-grades').length,1);assert.equal(section.querySelectorAll('small').length,1);
 assert.match(section.textContent,/Bat: incomplete · Bowl: incomplete/);
 assert.match(section.querySelector('small').textContent,/24 Oct: Bat Not recorded · Bowl Not recorded/);
 assert.doesNotMatch(section.textContent,/3rd Grade|999|Old match|20.00|57/);assert.equal(JSON.stringify(other),before);
 other.history=other.history.filter(m=>m.date!=='2026-10-24');h.host.innerHTML=h.ui.renderEvidenceDetails(item);section=h.host.querySelector('.se-other-grades');
 assert.match(section.querySelector('small').textContent,/Bat 57\* & DNB & Figures incomplete · Bowl 2\/40/);assert.equal(section.querySelector('img'),null);
 Object.assign(other,{batting_complete:true,bowling_complete:true,wickets:0});h.host.innerHTML=h.ui.renderEvidenceDetails(item);section=h.host.querySelector('.se-other-grades');
 assert.match(section.textContent,/Bat: 57 runs \(1 inn, unbeaten\)/);assert.match(section.textContent,/Bowl avg — \(0 wkts\)/);assert.doesNotMatch(section.textContent,/Bat avg 0|Bowl avg 0/);
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
test('strong bowling with an unset role remains visible and explains the missing swap information',async()=>{
 const h=await setup(),p={...h.fixture.roster[0],batting:'unknown',bowling:'unknown',bowling_load:'unknown'};
 const stats={roster_id:p.id,competition:'NDCA',grade:'3rd Grade',format:'limited_overs',runs:4,innings:2,not_outs:1,average:4,
  batting_complete:true,bowling_complete:true,bowling_balls:78,bowling_innings:2,wickets:7,conceded:41,economy:41*6/78};
 const item=h.engine.buildSelectionEvidence({rows:[stats]},[],[p]).forRow(stats);item.key='unset-bowler';
 h.host.innerHTML=h.ui.renderEvidenceBadges(item);
 assert.match(h.host.querySelector('.se-evidence-chip.strong').textContent,/Bowling: ↑ Strong/);
 assert.match(h.host.querySelector('button').getAttribute('aria-label'),/Bowling: Strong \(early sample\)/);
 h.ui.bindEvidenceDetails(h.host,{players:new Map([[item.key,item]])});h.host.querySelector('button').click();
 const text=h.host.querySelector('dialog').textContent;
 assert.match(text,/Bowling role not set/);assert.match(text,/Bowling role needed for swap comparisons/);
 assert.match(text,/7 wickets · 13.0 overs · 2 inns · 5.86 average · 3.15 economy/);
 assert.match(text,/Early sample · 2 innings · 13.0 overs/);assert.doesNotMatch(text,/Set the playing-list role before showing a form flag/);
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
test('two unbeaten batting innings show a positive early flag with an unset role and no invented average',async()=>{
 const h=await setup(),p={...h.fixture.roster[0],batting:'unknown'};
 const stats={roster_id:p.id,competition:'NDCA',grade:'4th Grade',format:'limited_overs',runs:64,innings:2,not_outs:2,average:null,
  batting_complete:true,bowling_complete:true,bowling_balls:0,bowling_innings:0,wickets:0,conceded:0};
 const item=h.engine.buildSelectionEvidence({rows:[stats]},[],[p]).forRow(stats);item.key='unbeaten-batter';
 h.host.innerHTML=h.ui.renderEvidenceBadges(item);
 assert.match(h.host.querySelector('.se-evidence-chip.strong').textContent,/Batting: ↑ Strong/);
 assert.match(h.host.querySelector('button').getAttribute('aria-label'),/Batting: Strong \(early sample\)/);
 h.ui.bindEvidenceDetails(h.host,{players:new Map([[item.key,item]])});h.host.querySelector('button').click();
 const text=h.host.querySelector('dialog').textContent;
 assert.match(text,/Batting role not set/);assert.match(text,/Early positive flag: runs per innings/);
 assert.match(text,/— batting average/);assert.match(text,/64 runs · 2 inns · 2 not out/);
 assert.match(text,/Early sample · 2 innings · 0 dismissals/);
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
test('lower-order batting withholds warning colours and explains the missing role benchmark',async()=>{
 const h=await setup(),p={...h.fixture.roster[0],batting:'lower'};
 for(const innings of [2,4]){
  const stats={roster_id:p.id,competition:'NDCA',grade:'1st Grade',format:'limited_overs',runs:0,innings,not_outs:0,average:0,
   batting_complete:true,bowling_complete:true,bowling_balls:0,bowling_innings:0,wickets:0,conceded:0};
  const item=h.engine.buildSelectionEvidence({rows:[stats]},[],[p]).forRow(stats);item.key='lower-batter';
  h.host.innerHTML=h.ui.renderEvidenceBadges(item);
  assert.equal(h.host.querySelector('.se-evidence-chip.slow,.se-evidence-chip.low'),null);assert.match(h.host.textContent,/Batting: · Not yet rated/);
  h.ui.bindEvidenceDetails(h.host,{players:new Map([[item.key,item]])});h.host.querySelector('button').click();
  const text=h.host.querySelector('dialog').textContent;
  assert.match(text,/Lower order/);assert.match(text,/No lower-order batting benchmark · negative flags withheld/);
  assert.match(text,/0 batting average/);
 }
});
test('repeated board redraws reuse saved figures; refresh corrections clear old markers and modal details',async()=>{
 const h=await setup();h.controller.mount(h.host,h.options);await tick();h.controller.mount(h.host,h.options);await tick();assert.equal(h.calls(),1);
 h.host.querySelector('[data-evidence-open]').click();h.reply(async()=>({data:{...h.fixture.context,cards:[]}}));h.controller.invalidate();await tick();
 assert.equal(h.calls(),2);assert.equal(h.host.querySelector('dialog'),null);assert.equal(h.host.querySelector('.se-evidence-chip.low'),null);
});
test('hiding form removes its space and dialog, survives redraws and reloads, and is personal to the club scope',async()=>{
 const h=await setup();h.controller.mount(h.host,h.options);await tick();
 h.host.querySelector('[data-evidence-open]').click();assert.ok(h.host.querySelector('dialog'));
 let toggle=h.host.querySelector('[data-evidence-toggle]');toggle.checked=false;toggle.dispatchEvent(new h.dom.window.Event('change'));
 assert.equal(h.host.querySelector('[data-evidence-open],.se-has-evidence,dialog'),null);
 h.host.innerHTML=h.markup();h.controller.mount(h.host,h.options);await tick();
 assert.equal(h.host.querySelector('[data-evidence-toggle]').checked,false);assert.equal(h.calls(),1);
 let reads=0;const reloaded=h.ui.createSelectionEvidence({here:()=>true,supabase:{rpc:async()=>{reads++;return {data:h.fixture.context};}}});
 h.host.innerHTML=h.markup();reloaded.mount(h.host,h.options);await tick();assert.equal(reads,0);assert.equal(h.host.querySelector('[data-evidence-toggle]').checked,false);
 reloaded.mount(h.host,{...h.options,scope:'another-user:club'});await tick();assert.equal(h.host.querySelector('[data-evidence-toggle]').checked,true);assert.equal(reads,1);
 reloaded.mount(h.host,h.options);await tick();toggle=h.host.querySelector('[data-evidence-toggle]');assert.equal(toggle.checked,false);
 toggle.checked=true;toggle.dispatchEvent(new h.dom.window.Event('change'));await tick();assert.ok(h.host.querySelector('[data-evidence-open]'));assert.equal(reads,2);
});
test('the form checkbox in More retains its preference and controls the board after redraw',async()=>{
 const h=await setup(),toggle=h.host.querySelector('[data-evidence-toggle]');h.host.before(toggle);
 const options={...h.options,visibilityToggle:toggle};h.controller.mount(h.host,options);await tick();assert.ok(h.host.querySelector('[data-evidence-open]'));
 toggle.checked=false;toggle.dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.host.querySelector('[data-evidence-open]'),null);
 h.host.innerHTML=h.markup();h.host.querySelector('[data-evidence-toggle]').remove();h.controller.mount(h.host,options);await tick();assert.equal(toggle.checked,false);assert.equal(h.host.querySelector('[data-evidence-open]'),null);
 toggle.checked=true;toggle.dispatchEvent(new h.dom.window.Event('change'));await tick();assert.ok(h.host.querySelector('[data-evidence-open]'));assert.equal(h.calls(),1);
});
test('a pending response and Season stats updates cannot reveal indicators after the checkbox is cleared',async()=>{
 const h=await setup();let finish;h.reply(()=>new Promise(resolve=>finish=resolve));h.controller.mount(h.host,h.options);
 const toggle=h.host.querySelector('[data-evidence-toggle]');toggle.checked=false;toggle.dispatchEvent(new h.dom.window.Event('change'));
 finish({data:h.fixture.context});await tick();assert.equal(h.host.querySelector('[data-evidence-open]'),null);
 h.controller.adopt(h.options.scope,h.fixture.context);assert.equal(h.host.querySelector('[data-evidence-open]'),null);
 toggle.checked=true;toggle.dispatchEvent(new h.dom.window.Event('change'));await tick();assert.ok(h.host.querySelector('[data-evidence-open]'));assert.equal(h.calls(),1);
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
