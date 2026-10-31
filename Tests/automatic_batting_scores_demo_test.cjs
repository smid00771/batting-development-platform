const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
for(const product of ['both','batting'])test(product+': downloaded scores appear in observations without opening Match Review',async t=>{
 const h=await openDemo({product,role:'coach',journey:'players'},{traceRpc:true});t.after(h.close);
 const info=JSON.parse(h.window.eval(`JSON.stringify((()=>{const m=fixtureRows.feedback['player-alex'].matches.find(m=>m.automatic_score!==undefined);return {id:m.id,fixture:m.fixture_id,score:m.score_text,date:m.match_date};})())`));
 assert.ok(info.score);assert.equal(h.rpcCalls.filter(c=>c.name==='save_team_match_review').length,0);
 await h.window.eval(`(async()=>{currentTab='players';playersWorkspaceSelectedId='player-alex';playersWorkspaceSection='development';playersWorkspaceDevelopmentMode='match';playersWorkspaceDevelopmentMatchId=${JSON.stringify(info.id)};staffObservationEditId=null;await renderPlayersWorkspacePlayer();})()`);await h.settle();
 assert.equal(h.document.querySelector('#staffMatchScore').value,info.score);assert.equal(h.document.querySelector('#staffMatchScore').disabled,true);
 assert.equal(h.document.querySelector('#staffObservationFixture').value,info.fixture);
 await h.choose('#staffMatchNote','A comment alongside the downloaded result');await h.click('#saveStaffMatchFeedback');
 assert.equal(h.document.querySelector('#staffDevelopmentForm'),null);
 assert.equal(h.window.eval(`fixtureRows.feedback['player-alex'].matches.find(m=>m.id===${JSON.stringify(info.id)}).score_text`),info.score);
 assert.equal(h.rpcCalls.filter(c=>c.name==='save_team_match_review').length,0);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
