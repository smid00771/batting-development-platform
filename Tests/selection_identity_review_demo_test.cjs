const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));

async function setup(t,{loseConfirmation=false}={}){
 const h=await openDemo({product:'select',role:'head',journey:'selections'});t.after(h.close);
 const s=h.window.ensureSelections(),fixtures=clone(s.data.fixtures.slice(0,2)),players=clone(s.data.roster.filter(p=>p.active).slice(0,3));
 let rows=players.map((p,i)=>({source_id:'review-source-'+i,name:p.name,fixture_id:fixtures[i===2?1:0].id,snapshot_id:i===2?'review-two':'review-one',team_id:'our-team'}));
 const originalRows=clone(rows),calls=[],receipts=new Map(),db=h.window.__fixtureDb,original=db.rpc;let lost=false;
 db.rpc=async function(name,args){
  calls.push({name,args:clone(args)});
  if(name==='playcricket_team_api'){
   assert.equal(args.p_action,'context','Identity review must not preview or apply a team change');
   const matching=originalRows.filter(r=>r.snapshot_id===args.p_data.snapshot_id),f=fixtures.find(f=>f.id===matching[0].fixture_id);
   return {data:{enabled:true,our_team:'our-team',card:{provider:'playcricket_au',status:'completed',match_id:args.p_data.snapshot_id,teams:[{id:'our-team',lineup_available:true,players:matching.map(r=>({player_id:r.source_id,name:r.name}))}]},fixtures:[{id:f.id,...clone(f.details),slots:clone(f.slots)}],roster:clone(players),links:[]},error:null};
  }
  if(name==='confirm_scorecard_player'){
   if(receipts.has(args.p_request_id))return clone(receipts.get(args.p_request_id));
   assert.equal(args.p_values.source_player_id,originalRows.find(r=>r.fixture_id===args.p_values.fixture_id&&r.source_id===args.p_values.source_player_id)?.source_id);
   rows=rows.filter(r=>r.source_id!==args.p_values.source_player_id);const result={data:{confirmed:true},error:null};receipts.set(args.p_request_id,result);
   if(loseConfirmation&&!lost){lost=true;return {error:{message:'Connection interrupted after saving'}};}return result;
  }
  const result=await original.call(this,name,args);
  if(name==='club_selections_api'&&args.p_action==='context'&&result.data)result.data.identity_reviews=clone(rows);
  return result;
 };
 await h.window.seReload();h.window.drawSelections();await h.settle();calls.length=0;
 return {...h,s,players,fixtures,calls,originalRows};
}

test('the real board lists names and match details, resolves each directly and clears the count without changing teams',async t=>{
 const h=await setup(t),before=clone(h.s.data.fixtures),date=h.s.date,group=h.s.selectionGroup;
 assert.match(h.document.querySelector('#seIdentityReview summary').textContent,/3 imported players need matching/);
 await h.click('#seIdentityReview summary');assert.equal(h.calls.length,0,'Opening the list uses loaded data');
 for(const p of h.players)assert.match(h.document.getElementById('seIdentityReview').textContent,new RegExp(p.name));
 assert.match(h.document.getElementById('seIdentityReview').textContent,new RegExp(h.fixtures[0].details.opposition));
 assert.equal(h.document.querySelector('[data-se-match-players]'),null);
 for(let remaining=3;remaining>0;remaining--){
  await h.click('[data-se-review-player]');assert.equal(h.document.querySelectorAll('#seIdentityReview [data-pc-same]').length,1);
  assert.equal(h.document.querySelector('#seIdentityReview [data-pc-apply]'),null);
  await h.click('#seIdentityReview [data-pc-same]');
  assert.equal(h.document.querySelectorAll('[data-se-review-player]').length,remaining-1);
  if(remaining>1)assert.equal(h.document.querySelector('#seIdentityReview details').open,true);
 }
 assert.equal(h.document.getElementById('seIdentityReview').textContent,'');assert.match(h.document.getElementById('seNotice').textContent,/All imported players matched/);
 assert.equal(h.s.date,date);assert.equal(h.s.selectionGroup,group);assert.deepEqual(clone(h.s.data.fixtures),before);
 assert.equal(h.calls.filter(c=>c.name==='playcricket_team_api').length,3);assert.equal(h.calls.filter(c=>c.name==='confirm_scorecard_player').length,3);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('uncertain player links retain the same command and stop date navigation until retry confirms the result',async t=>{
 const h=await setup(t,{loseConfirmation:true});await h.click('#seIdentityReview summary');await h.click('[data-se-review-player]');await h.click('[data-pc-same]');
 assert.match(h.document.getElementById('seIdentityReview').textContent,/Retry player link/);assert.equal(h.document.querySelectorAll('[data-se-review-player]').length,3);
 const date=h.s.date;await h.choose('#seBoardDate',h.document.querySelector('#seBoardDate option').value);assert.equal(h.s.date,date);assert.match(h.alerts.at(-1),/Retry the unconfirmed/);
 await h.click('[data-pc-retry-identity]');assert.equal(h.document.querySelectorAll('[data-se-review-player]').length,2);
 const writes=h.calls.filter(c=>c.name==='confirm_scorecard_player');assert.deepEqual(writes[0].args,writes[1].args);assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('review controls work from another Selection Group and missing local fixture details do not hide a queued player',async t=>{
 const h=await setup(t),group=h.document.getElementById('seBoardGroup'),other=[...group.options].find(o=>o.value!==group.value);
 if(other)await h.choose('#seBoardGroup',other.value);const count=h.calls.length;
 await h.click('#seIdentityReview summary');assert.equal(h.calls.length,count);assert.equal(h.document.querySelectorAll('[data-se-review-player]').length,3);
 h.s.data.fixtures=h.s.data.fixtures.filter(f=>f.id!==h.originalRows[0].fixture_id);h.s.data.identity_reviews[0].name='<img src=x onerror=alert(1)>';h.window.seRefreshIdentityReviewNotice();
 assert.equal(h.document.querySelector('#seIdentityReview img'),null);assert.equal(h.document.querySelectorAll('[data-se-review-player]').length,3);assert.match(h.document.getElementById('seIdentityReview').textContent,/Imported match/);
 await h.click('[data-se-review-player]');assert.ok(h.document.querySelector('[data-pc-same]'));assert.equal(h.document.querySelector('[data-pc-apply]'),null);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
