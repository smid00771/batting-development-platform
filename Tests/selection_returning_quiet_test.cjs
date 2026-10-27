const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('app.js','utf8');
function fn(name){const a=source.indexOf('function '+name+'('),next=/\n(?:async )?function /.exec(source.slice(a+9));return source.slice(a,next?a+9+next.index:source.length);}
async function setup(){
 const {selectionReturningFixture}=await import('./fixtures/selection_returning_fixture.mjs'),{returningPlayers}=await import('../selection-returning.js');
 const f=selectionReturningFixture(),dom=new JSDOM('<div id="seContent"><article data-se-team="next-first"><div class="se-actions"></div><ol></ol></article></div>');
 const fixtures=f.references.map(team=>({id:team.id,details:team,slots:team.slots,published:team.published}));
 const s={date:'2026-10-31',selectionGroup:'senior',view:'board',data:{can_view_board:true,roster:f.roster,fixtures,returning_context:{season:f.context.season,no_play:[]}}};let scans=0,clashes=false;
 const c=vm.createContext({document:dom.window.document,currentTab:'teams',ensureSelections:()=>s,seClubDate:()=>f.context.today,seBoardAccess:d=>d.can_view_board,seSelectionFixtures:()=>s.data.fixtures,seFixtureLocked:()=>false,seUsed:()=>clashes,seDate:v=>v,seEsc:v=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),returningPlayers:args=>{scans++;return returningPlayers(args);},supabase:{rpc:()=>assert.fail('Reminders must not request season figures')},setInterval:()=>assert.fail('Reminders must not poll')});
 vm.runInContext(fn('seReturningEntries')+'\n'+fn('seMountReturningPlayers'),c);
 const refresh=()=>{s.data={...s.data};c.seMountReturningPlayers();};
 return {f,s,c,dom,refresh,scans:()=>scans,clashes:v=>clashes=v};
}
test('quiet reminders show saved availability without form, comparisons, requests or repeated scans',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());h.c.seMountReturningPlayers();
 const host=h.dom.window.document.querySelector('[data-se-returning]');assert.ok(host);assert.match(host.textContent,/Available again.*Alex Rowan.*2 games unavailable/s);assert.equal(host.previousElementSibling.className,'se-actions');
 const entries=h.c.seReturningEntries();assert.equal(entries.length,1);assert.equal(entries[0].targets.length,0,'No replacement comparisons are built');
 host.querySelector('summary').click();assert.equal(host.querySelector('details').open,true);
 for(let i=0;i<10;i++){h.c.seMountReturningPlayers();assert.equal(h.c.seReturningEntries(),entries);}
 assert.equal(h.scans(),1,'Board redraws reuse the reminder result');assert.equal(h.dom.window.document.querySelector('[data-evidence-open],[data-return-compare]'),null);
});
test('using the player updates the reminder after a confirmed save; undo restores it',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());h.c.seMountReturningPlayers();
 h.f.draft.slots[0].d1=h.f.person.id;h.refresh();assert.equal(h.dom.window.document.querySelector('[data-se-returning]'),null);assert.equal(h.scans(),2);
 h.f.draft.slots[0].d1='cover';h.refresh();assert.ok(h.dom.window.document.querySelector('[data-se-returning]'));assert.equal(h.scans(),3);
 h.f.person.availability.unavailable_dates.push('2026-10-31');h.refresh();assert.equal(h.dom.window.document.querySelector('[data-se-returning]'),null);
});
test('quiet reminders retain no-play, overlap, season, access and club-context boundaries',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());h.c.seMountReturningPlayers();assert.ok(h.c.seReturningEntries().length);
 h.clashes(true);h.refresh();assert.equal(h.c.seReturningEntries().length,0);h.clashes(false);
 h.s.data.returning_context.no_play=h.f.references.filter(f=>['2026-10-17','2026-10-24'].includes(f.days[0].date)).map(f=>f.id);h.refresh();assert.equal(h.c.seReturningEntries().length,0);
 h.s.data.returning_context.no_play=[];h.s.data.returning_context.season={start:'2026-10-11',end:'2027-06-30'};h.refresh();assert.equal(h.c.seReturningEntries().length,0);
 h.s.data={can_view_board:false};assert.equal(h.c.seReturningEntries().length,0,'Old reminders are not returned after losing access');
 h.s.data={can_view_board:true,returning_context:{season:h.f.context.season},fixtures:[],roster:[]};h.refresh();assert.equal(h.c.seReturningEntries().length,0,'Another club context cannot reuse old reminders');
});
test('returning names remain escaped and expandable without statistical work',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());h.f.person.name='<img src=x onerror=alert(1)>';h.c.seMountReturningPlayers();
 assert.equal(h.dom.window.document.querySelector('img'),null);assert.match(h.dom.window.document.querySelector('summary').textContent,/<img src=x/);assert.match(h.dom.window.document.querySelector('summary').getAttribute('aria-label'),/available again/);
});
test('delivered demo keeps reminders during a meeting and updates only after selecting or undoing',async t=>{
 const {openDemo}=require('./helpers/demo_harness.cjs'),h=await openDemo('selections');t.after(h.close);h.window.scrollBy=()=>{};
 const calls=[],db=h.window.__fixtureDb,original=db.rpc;db.rpc=async function(name,args){calls.push({name,action:args?.p_action});return original.call(this,name,args);};
 const reminder=()=>h.document.querySelector('[data-se-returning]');assert.match(reminder().textContent,/Sam Ellison/);
 const entries=h.window.seReturningEntries();await h.click('#seMeeting');assert.match(h.document.getElementById('seMeeting').textContent,/End selection meeting/);assert.equal(h.window.seReturningEntries(),entries);
 const card=h.document.querySelector('[data-se-team="selection-first"]');await h.click('[data-se-team="selection-first"] [data-se-slot="0"]');
 const input=h.document.getElementById('seSearch');input.value='Sam Ellison';input.dispatchEvent(new h.window.Event('input'));await h.settle();assert.equal(h.window.seReturningEntries(),entries);assert.equal(h.document.querySelector('[data-se-team="selection-first"]'),card);
 await h.click('[data-se-player="demo-returner"]');assert.equal(reminder(),null);assert.ok(calls.some(c=>c.name==='club_selections_api'&&c.action==='save_board'));
 await h.click('#seUndo');assert.match(reminder().textContent,/Sam Ellison/);
 assert.equal(calls.filter(c=>c.name==='club_season_stats_api').length,0,'Showing, selecting and undoing never restart optional analysis');assert.deepEqual(h.errors,[]);
});
