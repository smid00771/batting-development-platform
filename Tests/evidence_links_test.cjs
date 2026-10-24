const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const box=(x,y,width,height)=>({left:x,right:x+width,top:y,bottom:y+height,x,y,width,height});
async function setup(compare=false){
 const ui=await import('../selection-evidence-ui.js');
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs');
 const {buildSelectionEvidence}=await import('../selection-evidence.js');
 const {buildSeasonStats}=await import('../season-stats.js');
 const fixture=selectionEvidenceFixture(),model=buildSelectionEvidence(buildSeasonStats(fixture.context),fixture.teams,fixture.roster);
 const pair=model.pairs.find(p=>p.number),dom=new JSDOM('<main></main>',{url:'https://example.invalid'}),host=dom.window.document.querySelector('main');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const items=[pair.higher,pair.lower];
 host.innerHTML=ui.evidenceStyles+`<div class="${compare?'ss-compare':'se-grid'}">${items.map((item,i)=>`<section ${compare?'class="ss-compare-cell"':`data-se-team="${item.team.id}"`}><div ${compare?'data-evidence-row':'class="se-player-cell"'}>${item.person.name}${ui.renderEvidenceBadges(item,item.key,{compact:!compare})}</div></section>`).join('')}</div>`;
 const root=host.querySelector('.se-grid,.ss-compare'),rows=[...root.querySelectorAll('.se-player-cell,[data-evidence-row]')],buttons=rows.map(r=>r.querySelector('button'));
 let stacked=false,shift=0;
 root.getBoundingClientRect=()=>box(0,0,650,1000);
 rows.forEach((row,i)=>{
  row.getBoundingClientRect=()=>box(i&&!stacked?350:20,100+i*80+shift+(i&&stacked?500:0),280,60);
  row.parentElement.getBoundingClientRect=()=>box(i&&!stacked?330:0,i&&stacked?500:0,320,500);
  buttons[i].getBoundingClientRect=()=>box(i&&!stacked?550:220,110+i*80+shift+(i&&stacked?500:0),80,44);
 });
 ui.bindEvidenceDetails(host,model);
 return {ui,model,pair,dom,host,root,rows,buttons,stack:v=>{stacked=v;dom.window.dispatchEvent(new dom.window.Event('resize'));},shift:v=>{shift=v;dom.window.dispatchEvent(new dom.window.Event('resize'));}};
}
test('the board shows matching numbers, named accessible comparisons and a visible line before a dialog is opened',async()=>{
 const h=await setup(),path=h.root.querySelector('path[fill="none"]'),group=h.root.querySelector('[data-evidence-connection]');
 assert.equal(h.host.querySelector('dialog'),null);
 h.buttons.forEach((button,i)=>{
  assert.match(button.querySelector('.se-evidence-link').textContent,new RegExp(String(h.pair.number)));
  assert.ok(button.getAttribute('aria-label').includes('Comparison '+h.pair.number+' with '+(i?h.pair.higher:h.pair.lower).person.name));
 });
 assert.equal(group.style.display,'');assert.equal(path.getAttribute('d'),'M 300 132 C 325 132 325 212 350 212');
 assert.equal(h.root.querySelector('svg.se-evidence-connectors').getAttribute('aria-hidden'),'true');
 h.buttons[0].focus();assert.ok(h.rows.every(row=>row.classList.contains('se-comparison-active')));
 h.buttons[0].click();assert.ok(h.host.querySelector('.se-evidence-pair').open,'The numbered comparison opens with its evidence visible');
 assert.ok(h.host.querySelector('dialog').textContent.includes(h.pair.lower.person.name));
 h.ui.clearEvidenceLinks(h.host);h.dom.window.close();
});
test('stacked cards retain their numbered relationship and redraw the connecting line when columns return',async()=>{
 const h=await setup(),group=h.root.querySelector('[data-evidence-connection]');
 h.stack(true);assert.equal(group.style.display,'none');assert.equal(h.host.querySelectorAll('.se-evidence-link').length,2);
 h.stack(false);assert.equal(group.style.display,'');
 h.shift(20);assert.match(group.querySelector('path').getAttribute('d'),/^M 300 152 /);
 h.ui.bindEvidenceLinks(h.host,h.model);assert.equal(h.root.querySelectorAll('.se-evidence-connectors').length,1,'Redraw does not duplicate connections');
 h.ui.clearEvidenceLinks(h.host);assert.equal(h.root.querySelector('.se-evidence-connectors'),null);
 assert.ok(h.rows.every(row=>!row.classList.contains('se-comparison-linked')));h.dom.window.close();
});
test('Compare grades uses the same connection and detached views release their overlays',async()=>{
 const h=await setup(true);assert.equal(h.root.querySelector('[data-evidence-connection]').style.display,'');
 h.host.remove();h.dom.window.dispatchEvent(new h.dom.window.Event('resize'));
 assert.equal(h.root.querySelector('.se-evidence-connectors'),null);h.dom.window.close();
});
