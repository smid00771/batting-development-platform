const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8');
const start=app.indexOf('function matchReviewImportState(){'),end=app.indexOf('function matchReviewScoreCell(',start);
assert.ok(start>=0&&end>start);
function setup(names,sourceNames,links=[]){
  const players=names.map((name,n)=>({player_id:'p'+n,display_name:name,can_edit:true,can_record_score:true}));
  const batters=sourceNames.map((name,n)=>({player_id:'b'+n,name,importable:true,status:'played',runs:n+10}));
  const s={innings_number:1,importer:{teamId:'ours',mapping:{},selected:{},preview:{player_links:links,
    scorecard:{innings:[{team_id:'ours',number:1,batters}]}}}};
  const c=vm.createContext({URL,ensureTeamReviewState:()=>s,teamReviewRows:()=>players,teamReviewCache:{players}});
  vm.runInContext(app.slice(start,end),c);
  return {c,s,players,batters,suggest:()=>Array.from(batters,b=>c.matchReviewSuggestPlayers(batters,players,links)[b.player_id]||''),run:(select=true)=>{c.matchReviewMapScores(select);return Array.from(batters,b=>s.importer.mapping[b.player_id]);}};
}

test('initials, first-name abbreviations and common short forms match in either direction',()=>{
  for(const [short,full] of [['A. Smith','Andrew Smith'],['Rob Smith','Robert Smith'],
    ['Matt Jones','Matthew Jones'],['Harry Fleming','Harrison Fleming'],['Arch Freeman','Archer Freeman'],
    ['Zac White','Zachary White'],['Mick Brown','Michael Brown'],['Jake Green','Jacob Green']]){
    assert.deepEqual(setup([short],[full]).suggest(),['p0'],short);
    assert.deepEqual(setup([full],[short]).suggest(),['p0'],full);
  }
});

test('middle initials, punctuation, accents and surname-first formatting are supported',()=>{
  for(const [ours,theirs] of [['A. J. Smith','Andrew James Smith'],['Gurwinder Sidhu','Gurwinder Singh Sidhu'],
    ["José O’Brien",'Jose OBrien'],['Smith, Rob','Robert Smith (c)'],['Matt Jones (wk)','Matthew Jones']]){
    assert.deepEqual(setup([ours],[theirs]).suggest(),['p0'],ours);
  }
});

test('a meaningful first name alone requires a unique match on both lists',()=>{
  assert.deepEqual(setup(['Matt','Rob'],['Robert Smith','Matthew Jones']).suggest(),['p1','p0']);
  assert.deepEqual(setup(['Matt'],['Matthew Jones','Matt Brown']).suggest(),['','']);
  assert.deepEqual(setup(['M'],['Matthew Jones']).suggest(),['']);
  assert.deepEqual(setup(['Blake'],['B. Player']).suggest(),['']);
});

test('the shortened selection-list name is considered alongside the player profile name',()=>{
  const h=setup(['Unrelated profile label'],['R. Smith']);h.players[0].selection_name='Rob Smith';
  assert.deepEqual(h.suggest(),['p0']);
});

test('ambiguous initials and two scorecard players sharing one nickname stay unassigned',()=>{
  assert.deepEqual(setup(['Andrew Smith','Adam Smith'],['A. Smith']).suggest(),['']);
  assert.deepEqual(setup(['Alex Smith'],['Alexander Smith','Alexandra Smith']).suggest(),['','']);
  assert.deepEqual(setup(['Rob Smith','Robert Smith'],['R Smith']).suggest(),['']);
});

test('exact names and confirmed identities take priority; a player is never assigned twice',()=>{
  assert.deepEqual(setup(['Rob Smith','Robert Smith'],['Robert Smith','Rob Smith']).run(),['p1','p0']);
  assert.deepEqual(setup(['Rob Smith'],['Robert Smith','Rob Smith']).run(),['','p0']);
  const h=setup(['Rob Smith','Other Person'],['Robert Smith','Other Person'],[{source_player_id:'b0',player_id:'p1'}]);
  assert.deepEqual(h.run(),['p1','']);
  assert.deepEqual(setup(['Rob Smith'],['Robert Smith','Rob Smith'],[
    {source_player_id:'b0',player_id:'p0'},{source_player_id:'b1',player_id:'p0'}]).run(),['','']);
});

test('different surnames, conflicting middle names and unrelated full names do not match',()=>{
  for(const [ours,theirs] of [['Rob Smith','Robert Jones'],['Adam Smith','Andrew Smith'],
    ['Alexander Smith','Alexandra Smith'],['Harrison Smith','Henry Smith'],['A. J. Smith','Andrew Peter Smith']]){
    assert.deepEqual(setup([ours],[theirs]).suggest(),[''],ours+' / '+theirs);
  }
});

test('confirmed links outside coaching access are not replaced by a name guess',()=>{
  const h=setup(['Rob Smith'],['Robert Smith'],[{source_player_id:'b0',player_id:'outside'}]);
  assert.deepEqual(h.run(),['']);
  h.s.importer.preview.player_links=[];h.players[0].can_edit=false;
  assert.deepEqual(h.run(),['']);
});

test('short-name suggestions preserve score confirmation permissions and unchanged-score behaviour',()=>{
  const h=setup(['Rob Smith','Matt Jones'],['Robert Smith','Matthew Jones'],[{source_player_id:'b0',player_id:'p0'},{source_player_id:'b1',player_id:'p1'}]);
  h.players[0].can_record_score=false;h.players[1].scorecard={...h.batters[1]};
  assert.deepEqual(h.run(),['p0','p1']);
  assert.equal(h.s.importer.selected.b0,false);assert.equal(h.s.importer.selected.b1,false);
  h.players[1].scorecard.runs=1;h.run();assert.equal(h.s.importer.selected.b1,true);
  h.run(false);assert.equal(h.s.importer.selected.b1,false);
});


test('Sulaiman middle names and Ollie need confirmation before scores are mapped',()=>{
 for(const [ours,theirs] of [['Sulaiman Muhammad','Sulaiman Moin Muhammad'],['Ollie Smith','Oliver Smith']]){
  const h=setup([ours],[theirs]);assert.deepEqual(h.run(),['']);assert.equal(h.s.importer.suggestions.b0,'p0');assert.equal(h.s.importer.selected.b0,false);
  h.s.importer.preview.player_links=[{source_player_id:'b0',player_id:'p0'}];assert.deepEqual(h.run(),['p0']);assert.equal(h.s.importer.selected.b0,true);
 }
});
test('a permitted player outside this selection is suggested without silently adding them',()=>{
 const h=setup(['Other Person'],['Sulaiman Moin Muhammad']);h.c.teamReviewCache.players.push({player_id:'original',display_name:'Sulaiman Muhammad',can_edit:true});
 h.c.teamReviewRows=()=>h.players.filter(p=>p.player_id!=='original');assert.deepEqual(h.run(),['']);assert.equal(h.s.importer.suggestions.b0,'original');
});
