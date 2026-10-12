const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8');
const demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8');
const boundaries=[['function teamReviewRows(){','function teamReviewUpdate('],
  ['function teamReviewSelection(','function teamReviewSignupIcon('],
  ['function teamReviewTableRows(','function teamReviewHistoryNotice('],
  ['function matchReviewImportState(){','function matchReviewScoreCell('],
  ['function matchReviewRestoreScorecard(','async function switchMatchReviewInnings(']];
function section(text,a,b){const start=text.indexOf(a),end=text.indexOf(b,start);assert.ok(start>=0&&end>start);return text.slice(start,end);}
const source=text=>boundaries.map(([a,b])=>section(text,a,b)).join('\n');
const ids=rows=>Array.from(rows,p=>p.player_id);
function setup({saved=false,manual=false}={}){
  const players=['Anna','Blake','Corey','Dev','Erin'].map((name,n)=>({player_id:'p'+n,display_name:name,
    can_edit:true,can_record_score:true,included_in_review:saved&&[1,3,4].includes(n)}));
  // API players are alphabetical; selected players are already in slot/day order.
  const picks=[2,0,3,1].map((n,index)=>({player_id:'p'+n,name:players[n].display_name,can_edit:true,slot:index+1,days:[1]}));
  const s={fixtureId:'fixture',sessionId:saved?'review':null,innings_number:1,
    fixtures:[{id:'fixture',selection:{status:manual?'manual':'published',players:picks}}]};
  const c=vm.createContext({URL,ensureTeamReviewState:()=>s,teamReviewCache:{players},
    teamReviewRowHtml:p=>`<tr data-player="${p.player_id}"></tr>`});
  vm.runInContext(source(app),c);
  return {c,s,players,picks,rows:()=>c.teamReviewRows(),render:()=>Array.from(c.teamReviewTableRows(c.teamReviewRows()).matchAll(/data-player="([^"]+)"/g),m=>m[1])};
}
function scorecard(h){
  const i=h.c.matchReviewImportState();i.teamId='ours';i.preview={player_links:[],scorecard:{innings:[
    {team_id:'ours',number:1,batters:[{player_id:'b1',name:'Blake'},{player_id:'b2',name:'Corey'},
      {player_id:'b3',name:'Anna',status:'did_not_bat'}]},
    {team_id:'ours',number:2,batters:[{player_id:'b3',name:'Anna'},{player_id:'b1',name:'Blake'}]},
    {team_id:'theirs',number:1,batters:[{player_id:'opponent',name:'Opponent'}]}
  ]}};h.c.matchReviewMapScores(false);return i;
}

test('new, saved and manual reviews retain selected-team order, including unsaved players',()=>{
  for(const options of [{},{saved:true},{saved:true,manual:true}]){
    const h=setup(options),expected=['p2','p0','p3','p1',...(options.saved?['p4']:[])];
    assert.deepEqual(ids(h.rows()),expected);assert.deepEqual(h.render(),expected);
    assert.deepEqual(h.players.map(p=>p.player_id),['p0','p1','p2','p3','p4']);
  }
});

test('shared slots preserve day-one/day-two partner order',()=>{
  const h=setup({saved:true});h.picks[0].slot=1;h.picks[1].slot=1;h.picks[1].days=[2];
  assert.deepEqual(h.render(),['p2','p0','p3','p1','p4']);
});

test('PlayCricket batting order overrides selection order, with unmatched players and history retained',()=>{
  const h=setup({saved:true});scorecard(h);
  assert.deepEqual(h.render(),['p1','p2','p0','p3','p4']);
  const history=h.rows().find(p=>p.player_id==='p4');
  assert.equal(history.historical_only,true);assert.equal(history.can_edit,false);
  assert.deepEqual(Array.from(h.c.matchReviewMappingPlayers(),p=>p.player_id),['p1','p2','p0','p3']);
  assert.deepEqual(h.picks.map(p=>p.player_id),['p2','p0','p3','p1']);
});

test('changing innings or team recalculates the display without changing team selection',()=>{
  const h=setup(),i=scorecard(h);h.s.innings_number=2;h.c.matchReviewMapScores(false);
  assert.deepEqual(h.render(),['p0','p1','p2','p3']);
  i.teamId='theirs';h.s.innings_number=1;h.c.matchReviewMapScores(false);
  assert.deepEqual(h.render(),['p2','p0','p3','p1']);
  i.teamId='';assert.deepEqual(h.render(),['p2','p0','p3','p1']);
});

test('reopening a saved review restores the scorecard batting order',()=>{
  const h=setup({saved:true}),i=scorecard(h),preview=i.preview;h.s.importer=null;
  h.c.matchReviewRestoreScorecard({scorecard_preview:preview,review:{source_team_id:'ours'},players:h.players});
  assert.deepEqual(h.render(),['p1','p2','p0','p3','p4']);
  assert.equal(h.c.matchReviewImportState().dirty,false);
});

test('manual player matching reorders rows; unmatched names never guess an identity',()=>{
  const h=setup(),i=scorecard(h);i.preview.scorecard.innings[0].batters[0].name='B. Player';
  h.c.matchReviewMapScores(false);assert.deepEqual(h.render(),['p2','p0','p3','p1']);
  i.mapping.b1='p1';assert.deepEqual(h.render(),['p1','p2','p0','p3']);
});

test('lost selection access does not turn saved history into an editable contribution',()=>{
  const h=setup({saved:true});h.picks.find(p=>p.player_id==='p1').can_edit=false;
  const rows=h.rows(),row=rows.find(p=>p.player_id==='p1');
  assert.equal(row.can_edit,false);assert.equal(row.historical_only,true);
  assert.equal(rows.filter(p=>p.player_id==='p1').length,1);
  assert.ok(!h.c.matchReviewMappingPlayers().some(p=>p.player_id==='p1'));
});

test('legacy saved reviews still show their saved players without a fixture',()=>{
  const h=setup({saved:true});h.s.fixtureId=null;
  assert.deepEqual(h.render(),['p1','p3','p4']);
});

test('app and demo have identical match-review ordering and rendering',()=>{
  assert.equal(source(app),source(demo));
});
