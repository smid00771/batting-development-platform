const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);}
async function setup(){
 const engine=await import('../selection-evidence.js'),ui=await import('../selection-evidence-ui.js'),spin=await import('../player-bowling.js');
 const dom=new JSDOM('<form id="seRosterForm"></form>'),p={id:'example',name:'Example player',active:true,grade:'1st Grade',batting:'lower',bowling:'spin',bowling_load:'frontline',keeper:false},state={data:{roster:[p]},rosterOpen:p.id};
 const context=vm.createContext({...spin,document:dom.window.document,ensureSelections:()=>state,SE_FIELDING:engine.FIELDING_RATINGS,fieldingLabel:engine.fieldingLabel,
  SE_BATTING:[['unknown','Not coded'],['lower','Lower order']],SE_BOWLING:[['unknown','Not coded'],['spin','Spinner']],SE_LOAD:[['unknown','Not coded'],['frontline','Frontline']],
  seEsc:value=>String(value??''),seOpt:(choices,value)=>choices.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${label}</option>`).join(''),
  seGradeChoices:()=>[{grade:'1st Grade'}],seRosterGradeKey:x=>x,memberPhoneStatusIcon:()=>'',seSignupFlag:()=>'',seNeedsAccountLink:()=>false});
 for(const name of ['seRosterSummary','seRosterGradeEditor','seRosterRow','seRosterEdits'])vm.runInContext(fn(name),context);
 dom.window.document.querySelector('form').innerHTML=context.seRosterRow(p);
 return {engine,ui,dom,p,state,context};
}
test('fielding is one profile dropdown, defaults to Not assessed and saves only an actual edit',async()=>{
 const h=await setup(),select=h.dom.window.document.querySelector('[name=fielding]');
 assert.equal(select.getAttribute('aria-label'),'Fielding for Example player');assert.equal(select.value,'unknown');
 assert.deepEqual([...select.options].map(o=>o.text),['Not assessed','Needs work','Reliable','Strong']);
 assert.equal(h.context.seRosterEdits().length,0);
 select.value='strong';const edits=h.context.seRosterEdits();assert.equal(edits.length,1);assert.equal(edits[0].fielding,'strong');assert.equal(edits[0].bowling,'spin');
 assert.match(h.context.seRosterSummary(edits[0]),/Fielding: Strong/);
 h.p.fielding='strong';assert.equal(h.context.seRosterEdits().length,0);
 select.value='unknown';assert.equal(h.context.seRosterEdits()[0].fielding,'unknown');h.dom.window.close();
});
test('comparison details identify fielding as selector-rated and changing it never rewrites form ratings or conversation eligibility',async()=>{
 const h=await setup(),{selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),{buildSeasonStats}=await import('../season-stats.js');
 const f=selectionEvidenceFixture(),stats=buildSeasonStats(f.context),before=h.engine.buildSelectionEvidence(stats,f.teams,f.roster),pair=before.pairs[0];
 f.roster.find(p=>p.id===pair.higher.person.id).fielding='strong';f.roster.find(p=>p.id===pair.lower.person.id).fielding='needs_work';
 const after=h.engine.buildSelectionEvidence(stats,f.teams,f.roster);
 assert.deepEqual(after.pairs.map(p=>[p.id,p.kind]),before.pairs.map(p=>[p.id,p.kind]));
 for(const [key,p] of after.players){assert.deepEqual(p.bat,before.players.get(key).bat);assert.deepEqual(p.ball,before.players.get(key).ball);}
 const html=h.ui.renderEvidenceDetails(after.players.get(pair.higher.key));h.dom.window.document.querySelector('form').innerHTML=html;
 const text=h.dom.window.document.querySelector('form').textContent;assert.match(text,/Fielding: Strong · selector rating/);assert.match(text,/Fielding: Needs work · selector rating/);h.dom.window.close();
});
