const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
async function openMatch(h,index=0){
 if(h.document.querySelector('#newSavedTeamReview'))await h.click('#newSavedTeamReview');
 await h.choose('#teamReviewGroup','group-first');
 const ids=h.window.eval("demoSelections.fixtures.filter(f=>f.details.grade_group_id==='group-first'&&f.details.days[0].date<todayIso()).map(f=>f.id)");
 await h.choose('#teamReviewFixture',ids[index]);return ids[index];
}
const control=h=>h.document.querySelector('[data-match-arrival="player-jordan"] input');
async function waitForControl(h,selector){for(let i=0;i<100&&!h.document.querySelector(selector);i++){await new Promise(resolve=>setTimeout(resolve,10));await h.settle();}assert.ok(h.document.querySelector(selector),'Expected ready control '+selector);}
test('review and individual observation share the flag across innings; repeat roll preserves discussed history',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'team_review'},{traceRpc:true});t.after(h.close);
 assert.equal(h.rpcCalls.filter(c=>c.name==='match_arrivals_api').length,0,'No arrival downloads before a match or roll is opened');
 const first=await openMatch(h);assert.equal(control(h).disabled,false);assert.equal(control(h).checked,false);
 await h.click('[data-match-arrival="player-jordan"] input');assert.equal(control(h).checked,true);
 assert.equal(h.window.eval('teamReviewHasUnsavedChanges()'),false,'Arrival is saved separately from coaching choices');
 await h.click('[data-team-observation="player-jordan"]');assert.equal(control(h).checked,true);
 assert.equal(h.window.eval("feedbackEntryBaselines.get(document.getElementById('staffDevelopmentForm'))===feedbackEntryValues(document.getElementById('staffDevelopmentForm'))"),true);
 await h.click('[data-match-arrival="player-jordan"] input');await h.click('#backToFixture');assert.equal(control(h).checked,false,'Correction is visible back in the team review');
 await h.click('[data-match-arrival="player-jordan"] input');await waitForControl(h,'#teamReviewInnings');await h.choose('#teamReviewInnings','2');assert.equal(control(h).checked,true);
 assert.equal(h.window.eval(`Object.values(demoArrivalRows).filter(r=>r.fixture_id===${JSON.stringify(first)}&&r.player_id==='player-jordan').length`),1);
 await openMatch(h,1);await h.click('[data-match-arrival="player-jordan"] input');await h.click('#teamArrivalRoll');
 assert.match(h.document.querySelector('.arrival-roll').textContent,/2 matches late · Repeated lateness/);
 const discussed=[...h.document.querySelectorAll('.arrival-roll button')].find(b=>b.textContent==='Mark discussed');discussed.click();await h.settle();
 assert.match(h.document.querySelector('.arrival-roll').textContent,/2 matches late · Discussed/);
 assert.equal(h.document.querySelectorAll('.arrival-roll li').length,2);
 assert.ok(!h.rpcCalls.some(c=>['save_team_match_review','save_fixture_match_observation','save_coach_observation'].includes(c.name)),'Only the arrival fact was saved');
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('unconfirmed arrival writes survive redraw and retry the same request without undoing a newer correction',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'team_review'},{traceRpc:true});t.after(h.close);await openMatch(h);
 h.window.eval(`window.arrivalRpc=supabase.rpc;window.arrivalCalls=[];supabase.rpc=async function(name,args){if(name==='match_arrivals_api'&&args.p_action==='save'){arrivalCalls.push(structuredClone(args));const result=await arrivalRpc(name,args);if(arrivalCalls.length===1)return {data:null,error:{message:'Connection lost'}};return result;}return arrivalRpc(name,args);};`);
 await h.click('[data-match-arrival="player-jordan"] input');assert.equal(control(h).disabled,true);assert.match(h.document.querySelector('[data-match-arrival="player-jordan"]').textContent,/Save unconfirmed/);
 assert.equal(h.window.eval('confirmLeaveFeedbackEntry()'),false);
 h.window.eval("for(const r of Object.values(demoArrivalRows)){r.late=false;r.revision++;}matchArrivalsService=null;matchArrivalsLoading=null;renderTeamReviewContent();");await h.settle();
 const retry=[...h.document.querySelectorAll('[data-match-arrival="player-jordan"] button')].find(b=>b.textContent==='Retry arrival save');assert.ok(retry);retry.click();await h.settle();
 assert.equal(control(h).disabled,false);assert.equal(control(h).checked,false,'Receipt is followed by reading the latest shared state');
 const commands=JSON.parse(h.window.eval('JSON.stringify(arrivalCalls)'));assert.equal(commands.length,2);assert.deepEqual(commands[0],commands[1]);
 assert.equal(h.window.eval('matchArrivalsService.hasPending()'),false);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
