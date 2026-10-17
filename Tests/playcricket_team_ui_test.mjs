import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createScorecardTeams,scorecardPlayerMatches,scorecardFixture} from '../playcricket-team.js';
import {createScorecardTeamDemo} from '../playcricket-team-demo.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function settle(){for(let i=0;i<8;i++)await tick();}
function context(){return {enabled:true,our_team:'ours',card:{status:'completed',match_id:'match',grade:'First Grade',teams:[{id:'ours',name:'Our club',lineup_available:true,players:[{player_id:'source-a',name:'Alice'},{player_id:'source-b',name:'Bob'}]}]},fixtures:[{id:'fixture',grade:'First Grade',opposition:'Visitors',days:[{date:'2026-10-10'}],slots:[{d1:'a'},{d1:'c'}]}],roster:[{id:'a',name:'Alice',active:true},{id:'b',name:'Bob',active:true},{id:'c',name:'Chris',active:true}],links:[]};}
function preview(){return {changed:true,expected:'revision-check',fixtures:[{id:'fixture',grade:'First Grade',added:['Bob'],removed:['Chris']},{id:'other',grade:'Second Grade',departures:[{name:'Bob',date:'2026-10-10'}]}]};}
function harness(respond){
 const dom=new JSDOM('<main id="host"></main>',{url:'https://clubbatting.com'});globalThis.document=dom.window.document;globalThis.window=dom.window;
 const calls=[],host=document.getElementById('host');let here=true,changed=0;
 const ui=createScorecardTeams({escape:esc,scope:()=> 'user',supabase:{rpc:async(name,args)=>{calls.push({name,args});return respond?respond(args):{data:args.p_action==='context'?context():args.p_action==='preview'?preview():{saved:true}};}}});
 const options={clubId:'club',snapshotId:'snapshot',here:()=>here,changed:()=>{changed++;}};ui.mount(host,options);
 return {dom,host,calls,ui,options,leave(){here=false;},get changed(){return changed;}};
}
test('identity matching respects remembered registrations and leaves ambiguous names unresolved',()=>{
 const roster=[{id:'a',name:'Alex',external_id:'uuid-a'},{id:'b',name:'Alex'}];
 assert.equal(scorecardPlayerMatches([{player_id:'uuid-a',name:'A. Smith'}],roster)['uuid-a'],'a');
 assert.equal(scorecardPlayerMatches([{player_id:'new',name:'Alex'}],roster).new,'');
 assert.equal(scorecardPlayerMatches([{player_id:'new',name:'Alias'}],roster,[{source_id:'new',roster_id:'b'}]).new,'b');
});
test('fixture suggestion prioritises existing source identity; ambiguous grades require a choice',()=>{
 const ctx=context();assert.equal(scorecardFixture(ctx,'ours'),'fixture');ctx.fixtures.push({...ctx.fixtures[0],id:'other'});assert.equal(scorecardFixture(ctx,'ours'),'');ctx.fixtures[1].sync={match_id:'match',team_id:'ours'};assert.equal(scorecardFixture(ctx,'ours','fixture'),'other');
});
test('import checks show incoming, outgoing and affected team; save requires an explicit click',async()=>{
 const h=harness();await settle();assert.match(h.host.textContent,/In: Bob/);assert.match(h.host.textContent,/Out: Chris/);assert.match(h.host.textContent,/Second Grade/);assert.equal(h.calls.filter(c=>c.args.p_action==='apply').length,0);
 assert.equal(h.host.querySelector('[data-pc-check],[data-pc-player],[data-pc-fixture]'),null,'Already matched players and fixture do not create more work');assert.equal(h.host.querySelector('[data-pc-apply]').textContent,'Update team');assert.equal(h.host.querySelector('[data-pc-later]').textContent,'Not now');
 h.host.querySelector('[data-pc-apply]').click();assert.match(h.host.textContent,/Updating/);assert.ok(h.host.querySelector('[data-pc-apply]').disabled);await settle();assert.equal(h.changed,1);assert.match(h.host.textContent,/Team matches PlayCricket ✓/);assert.equal(h.host.querySelector('[data-pc-apply]'),null);
 const save=h.calls.find(c=>c.args.p_action==='apply');assert.equal(save.args.p_data.expected,'revision-check');assert.equal(save.args.p_data.mapping.length,2);
});
test('uncertain save is retried with the same command and only one action button',async()=>{
 let attempt=0;const h=harness(async args=>args.p_action==='context'?{data:context()}:args.p_action==='preview'?{data:preview()}:++attempt===1?{error:{message:'Connection interrupted'}}:{data:{saved:true}});await settle();h.host.querySelector('[data-pc-apply]').click();await settle();assert.equal(h.host.querySelectorAll('[data-pc-apply]').length,1);assert.match(h.host.textContent,/Retry team update/);h.host.querySelector('[data-pc-apply]').click();await settle();const saves=h.calls.filter(c=>c.args.p_action==='apply');assert.deepEqual(saves[0].args,saves[1].args);assert.equal(h.changed,1);
});
test('changed revisions discard the preview and require a new check',async()=>{
 const h=harness(async args=>args.p_action==='context'?{data:context()}:args.p_action==='preview'?{data:preview()}:{error:{code:'P0001',message:'A team or player match changed. Review the updated changes before confirming'}});await settle();h.host.querySelector('[data-pc-apply]').click();await settle();assert.equal(h.host.querySelector('[data-pc-apply]'),null);assert.ok(h.host.querySelector('[data-pc-reload]'));assert.match(h.host.textContent,/changed/);
 h.host.querySelector('[data-pc-reload]').click();await settle();assert.equal(h.calls.filter(c=>c.args.p_action==='context').length,2);assert.ok(h.host.querySelector('[data-pc-apply]'));assert.equal(h.calls.filter(c=>c.args.p_action==='apply').length,1,'Refreshing the preview does not apply it');
});
test('unmatched player and bracketed day both need a human choice before preview',async()=>{
 const ctx=context();ctx.card.teams[0].players[1].name='Replacement';ctx.fixtures[0].brackets=true;ctx.fixtures[0].days.push({date:'2026-10-17'});
 const h=harness(async args=>({data:args.p_action==='context'?ctx:preview()}));await settle();assert.equal(h.calls.length,1);assert.equal(h.host.querySelector('[data-pc-check]'),null);assert.equal(h.host.querySelectorAll('[data-pc-player]').length,1,'Only the unmatched replacement needs attention');
 const select=h.host.querySelector('[data-pc-player="source-b"]');select.value='new';select.dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.calls.length,1);
 const days=h.host.querySelector('[data-pc-days="source-b"]');days.value='2026-10-10,2026-10-17';days.dispatchEvent(new h.dom.window.Event('change'));await settle();assert.equal(h.calls.at(-1).args.p_action,'preview');assert.equal(h.calls.at(-1).args.p_data.mapping[1].roster_id,'new');assert.deepEqual(h.calls.at(-1).args.p_data.mapping[1].days,['2026-10-10','2026-10-17']);assert.equal(h.host.querySelector('[data-pc-player]'),null);
});
test('matching teams need no confirmation or player-by-player form',async()=>{
 const h=harness(async args=>({data:args.p_action==='context'?context():{...preview(),changed:false,fixtures:[{...preview().fixtures[0],added:[],removed:[]}]}}));await settle();assert.match(h.host.textContent,/Team matches PlayCricket ✓/);assert.equal(h.host.querySelector('button,select,details'),null);assert.equal(h.calls.filter(c=>c.args.p_action==='apply').length,0);
});
test('Not now keeps selections unchanged and Review change checks again',async()=>{
 const h=harness();await settle();h.host.querySelector('[data-pc-later]').click();assert.match(h.host.textContent,/Team left unchanged/);assert.equal(h.host.querySelector('[data-pc-apply]'),null);assert.equal(h.calls.filter(c=>c.args.p_action==='apply').length,0);
 h.host.querySelector('[data-pc-review]').click();assert.match(h.host.textContent,/Checking the selected team/);await settle();assert.equal(h.calls.filter(c=>c.args.p_action==='preview').length,2);assert.ok(h.host.querySelector('[data-pc-apply]'));
});
test('the final unmatched name triggers the comparison automatically',async()=>{
 const ctx=context();ctx.card.teams[0].players[1].name='B. Player';const h=harness(async args=>({data:args.p_action==='context'?ctx:preview()}));await settle();assert.equal(h.calls.length,1);assert.equal(h.host.querySelectorAll('select').length,1);
 const select=h.host.querySelector('[data-pc-player]');select.value='b';select.dispatchEvent(new h.dom.window.Event('change'));await settle();assert.equal(h.calls.at(-1).args.p_action,'preview');assert.equal(h.host.querySelector('select'),null);assert.match(h.host.textContent,/Update the team to match PlayCricket/);assert.equal(h.host.ownerDocument.activeElement,h.host.querySelector('[data-pc-result]'));
});
test('a failed or unconfirmed automatic check gives a visible error and a working retry',async()=>{
 for(const failure of [{error:{message:'Connection interrupted'}},{data:{}}]){let fail=true;const h=harness(async args=>args.p_action==='context'?{data:context()}:fail?(fail=false,failure):{data:preview()});await settle();assert.ok(h.host.querySelector('[role=alert]'));assert.equal(h.host.querySelector('[data-pc-apply]'),null);const retry=h.host.querySelector('[data-pc-reload]');assert.equal(retry.textContent,'Retry team check');retry.click();assert.match(h.host.textContent,/Checking the selected team/);await settle();assert.ok(h.host.querySelector('[data-pc-apply]'));assert.equal(h.calls.filter(c=>c.args.p_action==='apply').length,0);}
});
test('eleven already matched players produce one compact confirmation',async()=>{
 const ctx=context();ctx.roster=Array.from({length:11},(_,i)=>({id:'p'+i,name:'Player '+i,active:true}));ctx.card.teams[0].players=ctx.roster.map((r,i)=>({player_id:'source-'+i,name:r.name}));const h=harness(async args=>({data:args.p_action==='context'?ctx:preview()}));await settle();assert.equal(h.host.querySelectorAll('select').length,0);assert.equal(h.host.querySelectorAll('button').length,2);assert.equal(h.calls.filter(c=>c.args.p_action==='preview').length,1);assert.equal(h.host.querySelector('[data-pc-check]'),null);
});
test('a later team correction invalidates a previously confirmed team check',async()=>{
 const h=harness();await settle();h.host.querySelector('[data-pc-apply]').click();await settle();assert.match(h.host.textContent,/Team matches PlayCricket/);
 h.ui.mount(h.host,{...h.options,snapshotId:'another-scorecard'});await settle();h.host.querySelector('[data-pc-apply]').click();await settle();
 h.ui.mount(h.host,h.options);await settle();assert.match(h.host.textContent,/differs from the selected team/);assert.ok(h.host.querySelector('[data-pc-apply]'));assert.equal(h.calls.filter(c=>c.args.p_action==='context').length,3);
});
test('unfinished and unavailable full lineups never offer a destructive team update',async()=>{
 for(const value of ['unfinished','missing']){const ctx=context();if(value==='unfinished')ctx.card.status='in_progress';else ctx.card.teams[0].lineup_available=false;const h=harness(async()=>({data:ctx}));await settle();assert.equal(h.calls.length,1);assert.equal(h.host.querySelector('[data-pc-apply]'),null);assert.equal(h.host.querySelector('[data-pc-check]'),null);}
});
test('source names are escaped and leaving the screen prevents late rendering',async()=>{
 const ctx=context();ctx.card.teams[0].players[0].name='<img src=x onerror=alert(1)>';const h=harness(async args=>({data:args.p_action==='context'?ctx:preview()}));await settle();assert.equal(h.host.querySelector('img'),null);h.leave();const before=h.host.innerHTML;h.ui.mount(h.host,h.options);await settle();assert.equal(h.host.innerHTML,before);
});
test('fictional demo corrects the published list, preserves history, flags a gap and retries once',async()=>{
 const state={roster:[{id:'a',name:'Alice'},{id:'b',name:'Bob'},{id:'c',name:'Chris'}],fixtures:[{id:'f1',revision:1,publication:1,details:{grade:'First',days:[{date:'2026-10-10'}]},slots:[{d1:'a',d2:null}]},{id:'f2',revision:1,publication:1,details:{grade:'Second',days:[{date:'2026-10-10'}]},slots:[{d1:'b',d2:null}]}]};for(const f of state.fixtures)f.published={slots:structuredClone(f.slots),details:structuredClone(f.details)};
 const card={status:'completed',match_id:'match',dates:['2026-10-10'],teams:[{id:'ours',lineup_available:true,players:[{player_id:'source-b',name:'Bob'}]}]},rpc=createScorecardTeamDemo(()=>state,()=>card),req={snapshot_id:'snapshot',fixture_id:'f1',team_id:'ours',mapping:[{source_id:'source-b',roster_id:'b',days:['2026-10-10']}]};
 const plan=await rpc('preview',req);assert.equal(state.fixtures[0].slots[0].d1,'a');const command={...req,expected:plan.expected,request_id:'once'},result=await rpc('apply',command);assert.equal(state.fixtures[0].published.slots[0].d1,'b');assert.equal(state.fixtures[1].published.slots[0].d1,null);assert.equal(state.fixtures[1].scorecard_sync.pending[0].name,'Bob');assert.equal(state.scorecard_history[0].snapshot.slots[0].d1,'a');assert.deepEqual(await rpc('apply',command),result);assert.equal(state.fixtures[0].revision,2);
});
