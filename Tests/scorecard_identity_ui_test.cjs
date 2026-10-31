const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),demo=fs.readFileSync(path.join(root,'demo.html'),'utf8');
const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const importer=s=>section(s,'let scorecardTeamController;','function matchReviewImportCommand(){');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settle=async()=>{for(let n=0;n<6;n++)await new Promise(r=>setImmediate(r));};
function harness({reply,refreshError=false,source=app}={}){
 const dom=new JSDOM('<main></main>'),host=dom.window.document.querySelector('main'),calls=[];
 const players=[{player_id:'original',display_name:'Sulaiman Muhammad',can_edit:true,can_record_score:true},{player_id:'other',display_name:'Alice Jones',can_edit:true,can_record_score:true}];
 const batters=[{player_id:'source',name:'Sulaiman Moin Muhammad',importable:true,runs:42,status:'played'},{player_id:'source-other',name:'Alice Jones',importable:true,runs:7,status:'played'}];
 const s={scope:'club:user',fixtureId:'fixture',sessionId:'same-review',reviewCanEdit:true,innings_number:1,match_date:'2026-10-10',drafts:{other:{batting_to_plan:'mostly'}},removed:[],importer:{teamId:'ours',url:'https://play.cricket.com.au/match/example',mapping:{},selected:{},reason:'',preview:{snapshot_id:'snapshot',player_links:[],scorecard:{teams:[{id:'ours',name:'Our club'},{id:'theirs',name:'Visitors'}],dates:['2026-10-10'],innings:[{team_id:'ours',number:1,complete:true,batters}]}}}};
 let confirmed=false,c;
 const render=()=>{host.innerHTML=c.renderMatchReviewImporter();c.bindMatchReviewImporter();};
 c=vm.createContext({URL,crypto:webcrypto,document:dom.window.document,club:{id:'club'},currentTab:'team_review',matchArrivalsService:null,renderMatchReplay:()=>'',teamReviewState:s,teamReviewCache:{players},ensureTeamReviewState:()=>s,teamReviewRows:()=>players,teamReviewControlsLocked:()=>false,esc,formatDateShort:x=>x,todayIso:()=> '2026-10-17',renderTeamReviewContent:render,
  renderTeamReview:async()=>{if(refreshError)throw Error('Refresh disconnected');if(confirmed)players[0].display_name=batters[0].name;},
  supabase:{rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});const r=reply?await reply(name,args):{data:{confirmed:true,source_player_id:'source',player_id:'original',roster_id:'roster',name:batters[0].name}};confirmed=!!r.data?.confirmed;return r;}}});
 vm.runInContext(section(app,'function teamReviewSavePending(){','function confirmLeaveTeamReview(){')+importer(source),c);
 c.mountScorecardTeam=()=>{};c.matchReviewClubTeam=()=> 'ours';c.matchReviewMapScores();render();
 return {c,s,dom,host,players,batters,calls,render};
}
for(const [label,source] of [['app',app],['demo',demo]])test(label+': one unmatched player is shown; confirmation retains player and review IDs',async()=>{
 const h=harness({source}),draft=h.s.drafts;assert.equal(h.host.querySelectorAll('.match-review-map-row').length,1);assert.doesNotMatch(h.host.querySelector('.match-review-mapping').textContent,/Alice/);
 assert.equal(h.calls.length,0);assert.equal(h.s.importer.mapping.source,'');h.host.querySelector('[data-import-same]').click();assert.ok(h.host.querySelector('[data-import-same]').disabled);await settle();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'confirm_scorecard_player');assert.equal(h.calls[0].args.p_values.player_id,'original');assert.equal(h.calls[0].args.p_values.expected_name,'Sulaiman Muhammad');
 assert.equal(h.players[0].display_name,'Sulaiman Moin Muhammad');assert.equal(h.s.importer.mapping.source,'original');assert.equal(h.s.importer.selected.source,true);assert.equal(h.s.sessionId,'same-review');assert.equal(h.s.drafts,draft);assert.equal(h.host.querySelector('.match-review-mapping'),null);
 assert.match(h.c.matchReviewScoreCell(h.players[0]),/<strong>42<\/strong>/,'Confirmed name immediately displays the score against the original player');
});
test('No and Skip do not rename anyone or write a match',async()=>{
 const h=harness();h.host.querySelector('[data-import-different]').click();assert.ok(h.host.querySelector('[data-import-player]'));h.host.querySelector('[data-import-skip]').click();await settle();assert.equal(h.calls.length,0);assert.equal(h.host.querySelector('.match-review-mapping'),null);assert.equal(h.players[0].display_name,'Sulaiman Muhammad');
});
test('manual identity selection still needs explicit named confirmation',()=>{
 const h=harness();h.host.querySelector('[data-import-different]').click();const el=h.host.querySelector('[data-import-player]');el.value='original';el.dispatchEvent(new h.dom.window.Event('change'));assert.ok(h.host.querySelector('[data-import-same]'));assert.equal(h.calls.length,0);
});
test('a confirmed late replacement proceeds to team correction instead of asking the same identity question again',async()=>{
 const h=harness();h.c.teamReviewRows=()=>h.players.filter(p=>p.player_id!=='original');let teamChecks=0;h.c.mountScorecardTeam=()=>{teamChecks++;};h.c.matchReviewMapScores();h.render();assert.ok(h.host.querySelector('[data-import-same]'));assert.equal(teamChecks,0);
 h.host.querySelector('[data-import-same]').click();await settle();assert.equal(h.host.querySelector('[data-import-same]'),null);assert.equal(h.s.importer.awaitingTeam.source,'original');assert.equal(h.s.importer.mapping.source,'');assert.ok(teamChecks>0,'The actual team correction is now available');
 h.c.teamReviewRows=()=>h.players;await h.c.matchReviewTeamChanged();assert.equal(h.s.importer.mapping.source,'original');assert.equal(Object.keys(h.s.importer.awaitingTeam).length,0);
});
test('an uncertain identity confirmation blocks navigation and retries the exact request',async()=>{
 let attempt=0;const h=harness({reply:async()=>++attempt===1?{error:{message:'Connection interrupted'}}:{data:{confirmed:true,source_player_id:'source',player_id:'original'}}});
 h.host.querySelector('[data-import-same]').click();await settle();assert.ok(h.c.teamReviewSavePending());assert.ok(h.host.querySelector('#loadMatchScorecard').disabled);h.host.querySelector('#retryPlayerIdentity').click();await settle();
 assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(h.c.teamReviewSavePending(),false);assert.equal(h.s.importer.mapping.source,'original');
});
test('a confirmed link stays confirmed if refreshing the review fails',async()=>{
 const h=harness({refreshError:true});h.host.querySelector('[data-import-same]').click();await settle();assert.equal(h.s.importer.identityPending,null);assert.equal(h.host.querySelector('#retryPlayerIdentity'),null);assert.match(h.host.textContent,/Player linked\. Refresh scores/);assert.equal(h.calls.length,1);
});
test('unchanged name-matching helpers and the parked demo remain consistent',()=>{
 // The generated demo uses the same scorecard importer as the live source.
 assert.equal(importer(app),importer(demo));const helpers=section(app,'function matchReviewNameParts','function matchReviewSuggestPlayers').trim();
 assert.equal(helpers,section(importer(demo),'function matchReviewNameParts','function matchReviewSuggestPlayers').trim());
 const module=fs.readFileSync(path.join(root,'player-name-matching.js'),'utf8').replaceAll('export ','');assert.equal(helpers,module.slice(module.indexOf('function matchReviewNameParts')).trim());
 // The live team UI now resolves inactive registration duplicates; its behaviour is tested separately.
 const adapter=fs.readFileSync(path.join(root,'playcricket-team-demo.js'),'utf8').replaceAll('export ','');assert.ok(demo.includes(adapter.slice(adapter.indexOf('function createScorecardTeamDemo')).trim()));
});


test('all inline demo scripts parse as a complete page',()=>{
 let count=0;for(const match of demo.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(/src\s*=/.test(match[1])||/application\/(?:json|ld\+json)/.test(match[1])||!match[2].trim())continue;
  new vm.Script(match[2]);count++;
 }assert.ok(count>0);
});

test('scorecard stays collapsed and unchanged saved scores have no import action',()=>{
 const h=harness();
 h.s.importer.preview.player_links=h.batters.map((b,n)=>({source_player_id:b.player_id,player_id:h.players[n].player_id}));
 h.players.forEach((p,n)=>p.scorecard={...h.batters[n]});h.c.matchReviewMapScores(false);h.render();
 assert.equal(h.host.querySelector('#matchReviewScorecard').open,false);
 assert.equal(h.host.querySelector('#useMatchScores'),null);
 h.batters[1].runs=8;h.render();assert.match(h.host.querySelector('#useMatchScores').textContent,/Add 1 new or updated score to review/);
 assert.equal(h.s.importer.dirty,false);assert.equal(h.calls.length,0,'Viewing changed scores never saves them');
 const details=h.host.querySelector('#matchReviewScorecard');details.open=true;details.dispatchEvent(new h.dom.window.Event('toggle'));h.render();
 assert.equal(h.host.querySelector('#matchReviewScorecard').open,true,'An explicitly opened scorecard survives redraw');
 h.players[1].can_record_score=false;h.render();assert.equal(h.host.querySelector('#useMatchScores'),null);
 h.players[1].can_record_score=true;h.s.importer.preview.scorecard.innings[0].complete=false;h.render();assert.equal(h.host.querySelector('#useMatchScores'),null,'Unfinished scores remain preview only');
});

for(const [label,source] of [['app',app],['demo',demo]])test(label+': two saved DNB players need no further score action',()=>{
 const h=harness({source});
 h.s.importer.preview.player_links=h.batters.map((b,n)=>({source_player_id:b.player_id,player_id:h.players[n].player_id}));
 h.batters.forEach((b,n)=>{
  Object.assign(b,{status:'did_not_bat',runs:null,balls:null,fours:null,sixes:null,not_out:null,dismissal:'did not bat'});
  h.players[n].scorecard={...b,not_out:false};
 });
 h.c.matchReviewMapScores(false);h.render();
 assert.equal(h.host.querySelector('#matchReviewScorecard>summary').textContent,'Scorecard');
 assert.equal(h.host.querySelector('#useMatchScores'),null);
 assert.doesNotMatch(h.host.textContent,/Review the selected scores|scores to save|Reason for corrected/);
 assert.equal(h.calls.length,0);
 h.c.matchReviewMapScores();
 assert.equal(h.c.matchReviewImportCount(),0,'Neither saved DNB is selected as a changed score');
 for(const p of h.players)assert.match(h.c.matchReviewScoreCell(p),/<strong>DNB<\/strong>/);

 // A result changing between batting and DNB is still a real correction.
 Object.assign(h.batters[1],{status:'played',runs:0,not_out:true,balls:0,dismissal:'not out'});
 h.c.matchReviewMapScores(false);h.render();
 assert.match(h.host.querySelector('#matchReviewScorecard>summary').textContent,/1 score to save/);
 h.host.querySelector('#useMatchScores').click();
 assert.equal(h.c.matchReviewImportCount(),1);
 assert.equal(h.s.importer.selected['source-other'],true);
 assert.equal(h.s.importer.selected.source,false);
 assert.equal(h.c.matchReviewScoreChanged(h.batters[1],h.players[1].scorecard),true);
 assert.equal(h.c.matchReviewScoreChanged(null,h.players[0].scorecard),true,'An unsaved DNB can still be recorded');
 const played=h.batters[1];
 for(const update of [{not_out:false},{runs:1},{balls:1},{fours:1},{sixes:1},{dismissal:'retired hurt'}]){
  assert.equal(h.c.matchReviewScoreChanged(played,{...played,...update}),true,'Keep genuine batting corrections');
 }
});

test('score figures show labelled runs, balls, strike rate and boundaries without inventing missing figures',()=>{
 const h=harness();
 const figures=scorecard=>{
  const player={player_id:'independent',scorecard};
  const table=h.dom.window.document.createElement('table');table.innerHTML='<tbody><tr>'+h.c.matchReviewScoreCell(player)+'</tr></tbody>';
  return Array.from(table.querySelectorAll('dl>div'),el=>[el.querySelector('dt').textContent,el.querySelector('dd').textContent]);
 };
 assert.deepEqual(figures({status:'played',runs:5,balls:8,fours:0,sixes:0,not_out:false}),[['Runs','5'],['Balls','8'],['SR','62.50'],['4s','0'],['6s','0']]);
 assert.deepEqual(figures({status:'played',runs:104,balls:72,fours:10,sixes:4,not_out:true}),[['Runs','104*'],['Balls','72'],['SR','144.44'],['4s','10'],['6s','4']]);
 assert.deepEqual(figures({status:'played',runs:0,balls:0,not_out:true}),[['Runs','0*'],['Balls','0'],['SR','—'],['4s','—'],['6s','—']]);
 assert.deepEqual(figures({status:'played',runs:8,balls:null}),[['Runs','8'],['Balls','—'],['SR','—'],['4s','—'],['6s','—']]);
 assert.deepEqual(figures({status:'did_not_bat',not_out:false}),[],'DNB does not claim a zero-run innings');
});
