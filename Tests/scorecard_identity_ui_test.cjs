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
 c=vm.createContext({URL,crypto:webcrypto,document:dom.window.document,club:{id:'club'},currentTab:'team_review',teamReviewState:s,teamReviewCache:{players},ensureTeamReviewState:()=>s,teamReviewRows:()=>players,teamReviewControlsLocked:()=>false,esc,formatDateShort:x=>x,todayIso:()=> '2026-10-17',renderTeamReviewContent:render,
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
test('name-matching helpers and the actual importer stay identical in production and demo',()=>{
 assert.equal(importer(app),importer(demo));const helpers=section(app,'function matchReviewNameParts','function matchReviewSuggestPlayers').trim();
 assert.equal(helpers,section(demo,'function matchReviewNameParts','function matchReviewSuggestPlayers').trim());
 const module=fs.readFileSync(path.join(root,'player-name-matching.js'),'utf8').replaceAll('export ','');assert.equal(helpers,module.slice(module.indexOf('function matchReviewNameParts')).trim());
 const teams=fs.readFileSync(path.join(root,'playcricket-team.js'),'utf8').replaceAll('export ','');assert.equal(teams.slice(teams.indexOf('const normal=value=>')).trim(),section(demo.slice(demo.indexOf('/* Compare the trusted scorecard')), 'const normal=value=>','return createScorecardTeams;').trim());
 const adapter=fs.readFileSync(path.join(root,'playcricket-team-demo.js'),'utf8').replaceAll('export ','');assert.equal(adapter.slice(adapter.indexOf('function createScorecardTeamDemo')).trim(),section(demo,'function createScorecardTeamDemo','const demoScorecardTeams=').trim());
});


test('all inline demo scripts parse as a complete page',()=>{
 let count=0;for(const match of demo.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  if(/src\s*=/.test(match[1])||/application\/(?:json|ld\+json)/.test(match[1])||!match[2].trim())continue;
  new vm.Script(match[2]);count++;
 }assert.ok(count>0);
});
