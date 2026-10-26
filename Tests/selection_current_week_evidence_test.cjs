const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(){
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs');
 const f=selectionEvidenceFixture();
 for(const team of f.teams){team.grade_group_id='grade-'+team.level;team.published.details.grade_group_id=team.grade_group_id;}
 const drafts=f.teams.map(team=>({...structuredClone(team),id:'next-'+team.id,competition:'',days:[{date:'2026-10-31'}],published:null,lineupPublished:false}));
 return {...f,drafts,references:[...f.teams,...drafts]};
}
async function board(f){
 const {createSelectionEvidence}=await import('../selection-evidence-ui.js');
 const dom=new JSDOM('<main></main>',{url:'https://example.invalid'}),host=dom.window.document.querySelector('main');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 let reads=0;
 const controller=createSelectionEvidence({here:()=>true,supabase:{rpc:async(name,args)=>{
  assert.equal(name,'club_season_stats_api');assert.equal(args.p_action,'context');reads++;return {data:f.context};
 }}});
 const mount=async()=>{
  host.innerHTML='<div class="se-grid">'+f.drafts.map(team=>`<article data-se-team="${team.id}">${team.slots.flatMap(slot=>[...new Set([slot.d1,slot.d2].filter(Boolean))]).map(id=>`<div class="se-player-cell"><span data-se-evidence data-evidence-fixture="${team.id}" data-evidence-player="${id}"></span></div>`).join('')}</article>`).join('')+'</div>';
  controller.mount(host,{scope:'user:club',clubId:'club',teams:f.drafts,referenceTeams:f.references,roster:f.roster});await tick();
 };
 await mount();return {host,mount,reads:()=>reads};
}
test('copied new-week drafts show the same statistical cases on current players, without changing saved teams',async()=>{
 const f=await fixture(),before=JSON.stringify(f),h=await board(f);
 const marker=h.host.querySelector('[data-evidence-player="g1p0"] button');
 assert.match(marker.getAttribute('aria-label'),/Batting: Below guide.*Comparison \d+ with Pat Rowan/);
 assert.ok(h.host.querySelector('[data-evidence-player="g2p0"] .se-evidence-chip.strong'));
 assert.ok(h.host.querySelectorAll('.se-evidence-link').length>1);
 assert.ok([...h.host.querySelectorAll('[data-evidence-open]')].every(el=>JSON.parse(el.dataset.evidenceOpen)[0].startsWith('next-')));
 marker.click();const dialog=h.host.querySelector('dialog');
 assert.match(dialog.textContent,/10 batting average/);assert.match(dialog.textContent,/Pat Rowan/);
 assert.match(dialog.textContent,/Rough batting target in 2nd Grade: 20 average/);
 assert.equal(JSON.stringify(f),before);assert.equal(h.reads(),1);
});
test('current-week cases recalculate after a swap or vacancy instead of reusing last published line-ups',async()=>{
 const f=await fixture(),h=await board(f),[high,low]=f.drafts;
 assert.match(h.host.querySelector('[data-evidence-player="g1p0"] button').getAttribute('aria-label'),/with Pat Rowan/);
 // The published source still contains the old players; only draft places move.
 [high.slots[0],low.slots[0]]=[low.slots[0],high.slots[0]];await h.mount();
 const moved=h.host.querySelector('[data-evidence-player="g2p0"] button');
 assert.equal(JSON.parse(moved.dataset.evidenceOpen)[0],high.id);moved.click();
 assert.match(h.host.querySelector('dialog').textContent,/No 1st Grade figures/);
 assert.match(h.host.querySelector('.se-other-grades').textContent,/2nd Grade.*Bat avg 38/);
 assert.doesNotMatch(h.host.querySelector('[data-evidence-player="g1p0"] button').getAttribute('aria-label'),/with Pat Rowan/);
 high.slots[0]={};low.slots[0]={};await h.mount();
 assert.equal(h.host.querySelector('[data-evidence-player="g1p0"],[data-evidence-player="g2p0"]'),null);
 assert.ok([...h.host.querySelectorAll('[data-evidence-open]')].every(el=>!/with (Alex Rowan|Pat Rowan)/.test(el.getAttribute('aria-label'))));
 assert.equal(h.reads(),1,'Only the source statistics are cached; each current line-up is reassessed');
 assert.equal(f.teams[0].published.slots[0].d1,'g1p0');
});
test('a blank competition is resolved only by an unambiguous grade ID in the same season and format',async()=>{
 const {resolveSelectionStatsTeams}=await import('../season-stats.js'),f=await fixture(),target=f.drafts[0],source=f.teams[0];
 const resolve=refs=>resolveSelectionStatsTeams([target],f.context.season,refs)[0];
 assert.equal(resolve([source]).competition,'NDCA');
 for(const changed of [
  {grade_group_id:'another-grade'},
  {format:'t20'},
  {days:[{date:'2025-10-24'}]},
  {cancelled:true},
  {grade_group_id:null}
 ]) assert.equal(resolve([{...source,...changed,published:null}]).competition,'');
 assert.equal(resolve([source,{...source,competition:'Other association',published:null}]).competition,'');
 assert.equal(resolveSelectionStatsTeams([{...target,grade_group_id:null}],f.context.season,[source])[0].competition,'');
 assert.equal(resolveSelectionStatsTeams([{...target,competition:'Other association'}],f.context.season,[source])[0].competition,'Other association');
 assert.equal(resolveSelectionStatsTeams([target],undefined,[source])[0].competition,'');
 // A saved published label can supply metadata without supplying its players.
 const projected=resolve([{...source,competition:'',slots:[]}]);
 assert.equal(projected.competition,'NDCA');assert.deepEqual(projected.slots,target.slots);
 assert.equal(target.competition,'');
});
test('Season stats can compare the new-week draft with its real figures and preserves last published as the default',async()=>{
 const {createSeasonStatsPanel}=await import('../season-stats-panel.js'),f=await fixture();
 const dom=new JSDOM('<main></main>'),host=dom.window.document.querySelector('main');
 const panel=createSeasonStatsPanel({here:()=>true,close(){},supabase:{rpc:async()=>({data:f.context})}});
 panel.mount(host,{scope:'user:club',clubId:'club',state:{format:'long_form',compare:true},boardDate:'2026-10-31',roster:f.roster,teams:f.references});await tick();
 let dates=host.querySelector('[data-stats-date]');assert.equal(dates.value,'published');
 dates.value='2026-10-31';dates.dispatchEvent(new dom.window.Event('change'));
 assert.equal(host.querySelector('[data-stats-team="firstTeam"]').value,'next-team-1');
 assert.match(host.querySelector('.ss-compare').textContent,/Line-up: 31 Oct/);
 assert.match(host.querySelector('.ss-compare').textContent,/40 runs · 4 inns/);
 assert.ok(host.querySelector('.ss-compare .se-evidence-link'));
 assert.doesNotMatch(host.querySelector('.ss-compare').textContent,/No linked season figures/);
 host.querySelector('[data-stats-compare-mode="bowling"]').click();
 assert.equal(host.querySelector('[data-stats-date]').value,'2026-10-31');
 assert.match(host.querySelector('.ss-compare').textContent,/12 wickets · 32.0 overs · 4 inns/);
 assert.equal(f.drafts[0].competition,'');
});
