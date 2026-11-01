const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const calls=h=>plain(h.window.observationCalls);
const clean=h=>assert.deepEqual(h.errors.map(e=>e.message),[]);
async function example(t,patch={}){
 const h=await openDemo({product:'both',role:'player'},{traceRpc:true});t.after(h.close);
 h.window.eval(`{
  const m=fixtureRows.feedback['player-alex'].matches.find(m=>m.id==='alex-pull');
  m.player_reflection=null;m.player_note='My saved innings note';m.player_video={url:normaliseCoachingYouTubeUrl('https://youtu.be/abcdefghijk?t=12'),note:'My saved video'};
  Object.assign(m.coach_feedback[0],{note:'Coach comment to read',batting_to_plan:null,dismissal_classification:null,main_issue:null,next_training_focus:'',innings_note:'',plan_related:false,...${JSON.stringify(patch)}});
 }`);
 await h.window.eval('refreshMyCoachingUpdates()');h.window.eval("window.observationCalls=[];window.observationRpc=supabase.rpc.bind(supabase);supabase.rpc=(name,args)=>{window.observationCalls.push({name,args});return window.observationRpc(name,args);};");return h;
}
async function openNote(h){await h.window.eval("openCoachingUpdate(myCoachingUpdates.updates.find(u=>u.source_id==='alex-pull-coach'))");await h.settle();}

test('a comment opens by itself even when another observation on that innings requires reflection',async t=>{
 const h=await example(t);
 h.window.eval("fixtureRows.feedback['player-alex'].matches.find(m=>m.id==='alex-pull').coach_feedback.push({id:'another-coach',author_name:'Another coach',plan_related:true,batting_to_plan:'no',note:'Separate assessed feedback'})");
 const start=calls(h).length;await openNote(h);
 const page=h.document.querySelector('#page');assert.match(page.textContent,/Coach comment to read/);assert.doesNotMatch(page.textContent,/Separate assessed feedback|Your view first|Main issue|Season|Prepare for a match|Current focus|General coaching note/);
 assert.equal(page.querySelectorAll('input,textarea,select').length,0);assert.equal(page.querySelector('#myReflectionForm'),null);
 assert.equal(page.querySelectorAll('[data-coach-feedback-id]').length,1);
 assert.equal(calls(h).slice(start).filter(c=>c.name==='get_my_coaching_observation').length,1);assert.ok(!calls(h).slice(start).some(c=>['get_my_innings','get_my_match_preparations','get_player_focus','get_player_engagement','get_feedback_workspace','get_coach_observation_context','get_player_innings_details'].includes(c.name)));
 assert.ok(calls(h).slice(start).some(c=>c.name==='mark_my_coaching_update_seen'));clean(h);
});

test('dismissal and issue notes without an overall plan answer do not request reflection',async t=>{
 const h=await example(t,{plan_related:true,dismissal_classification:'plan_execution',main_issue:'execution'});
 assert.equal(h.window.eval("myCoachingUpdates.updates.find(u=>u.source_id==='alex-pull-coach').can_open"),true);
 await openNote(h);assert.match(h.document.querySelector('#page').textContent,/Coach comment to read/);assert.equal(h.document.querySelector('#myReflectionForm'),null);clean(h);
});

test('an explicit plan assessment opens only two quick questions and retains safe retry and existing innings facts',async t=>{
 const h=await example(t,{plan_related:true,batting_to_plan:'yes'});
 const before=plain(h.window.eval("(()=>{const m=fixtureRows.feedback['player-alex'].matches.find(m=>m.id==='alex-pull');return {date:m.match_date,score:m.score_text,note:m.player_note,video:m.player_video};})()"));
 const start=calls(h).length;await openNote(h);
 const page=h.document.querySelector('#page'),form=page.querySelector('#myReflectionForm');assert.ok(form);
 assert.equal(form.dataset.reflectionOnly,'true');assert.equal(form.querySelectorAll('fieldset').length,2);assert.equal(form.querySelectorAll('input[type=radio]').length,6);assert.equal(form.querySelector('details').open,false);
 assert.doesNotMatch(page.textContent,/Coach comment to read|Update this innings|Who can see my preparation|Keep one or two priorities|Season|YouTube link/);
 assert.equal(page.querySelectorAll('#reflectionDate,#reflectionScore,#inningsVideoUrl,.innings-table').length,0);
 assert.equal(calls(h).slice(start).filter(c=>c.name==='get_my_coaching_observation').length,1);assert.ok(!calls(h).slice(start).some(c=>['get_my_innings','get_my_match_preparations','get_player_focus','get_player_engagement','get_feedback_workspace','get_coach_observation_context','get_player_innings_details'].includes(c.name)));
 assert.ok(!calls(h).slice(start).some(c=>c.name==='mark_my_coaching_update_seen'));
 await h.click('#saveMyReflection');assert.match(h.document.querySelector('#myReflectionStatus').textContent,/Choose one answer for each/);
 await h.click('[name=myBattingToPlan][value=mostly]');await h.click('#saveMyReflection');assert.ok(h.document.querySelector('#myReflectionForm'));
 await h.click('[name=myDismissalClass][value=plan_execution]');
 h.window.eval(`window.originalObservationRpc=window.__fixtureRpc;window.failObservationOnce=true;window.__fixtureRpc=async(name,args)=>{const result=await window.originalObservationRpc(name,args);if(name==='save_my_fixture_innings'&&window.failObservationOnce){window.failObservationOnce=false;return {error:{message:'Connection interrupted'}};}return result;}`);
 await h.click('#saveMyReflection');assert.match(h.document.querySelector('#myReflectionStatus').textContent,/Check previous save/);
 assert.equal(h.document.querySelector('#saveMyReflection').disabled,true);assert.match(h.document.querySelector('[data-draft-restore]').textContent,/Check previous save/);
 await h.click('[data-draft-restore]');assert.equal(h.document.querySelector('#myReflectionForm'),null,h.document.querySelector('#myReflectionStatus')?.textContent);assert.match(h.document.querySelector('#page').textContent,/Coach comment to read/);
 const writes=calls(h).filter(c=>c.name==='save_my_fixture_innings');assert.equal(writes.length,2);assert.deepEqual(plain(writes[0].args),plain(writes[1].args));
 assert.equal(writes[0].args.p_values.reflection.batting_to_plan,'mostly');assert.equal(writes[0].args.p_values.reflection.dismissal_classification,'plan_execution');assert.ok(writes[0].args.p_expected_updated_at);
 const after=plain(h.window.eval("(()=>{const m=fixtureRows.feedback['player-alex'].matches.find(m=>m.id==='alex-pull');return {date:m.match_date,score:m.score_text,note:m.player_note,video:m.player_video};})()"));assert.deepEqual(after,before);
 const comparison=h.document.querySelector('.player-observation-page [data-assessment-comparison]');assert.ok(comparison);assert.equal(comparison.closest('details'),null);assert.match(comparison.textContent,/Mostly/);assert.match(comparison.textContent,/Yes/);clean(h);
});

test('View innings leaves the focused comment and loads preparation only on that explicit visit',async t=>{
 const h=await example(t);await openNote(h);
 assert.equal(h.window.eval('clubNavigationRoute().innings.observationId'),'alex-pull-coach');
 const start=calls(h).length;await h.click('#observationInnings');
 assert.equal(h.window.eval('ensureMyInningsState().observationId'),null);assert.ok(h.document.querySelector('.innings-table'));
 assert.ok(calls(h).slice(start).some(c=>c.name==='get_my_match_preparations'));clean(h);
});

test('a missing or inaccessible observation never falls back to another comment',async t=>{
 const h=await example(t);h.window.eval("myCoachingUpdates.updates.find(u=>u.source_id==='alex-pull-coach').source_id='missing-comment'");
 await h.window.eval("openCoachingUpdate(myCoachingUpdates.updates.find(u=>u.source_id==='missing-comment'))");await h.settle();
 assert.match(h.document.querySelector('#page').textContent,/no longer available/);assert.doesNotMatch(h.document.querySelector('#page').textContent,/Coach comment to read/);assert.equal(h.document.querySelector('#myReflectionForm'),null);clean(h);
});


test('Coach Conversations opens the same focused review and history restores its exact comment',async t=>{
 const h=await example(t,{plan_related:true,batting_to_plan:'yes'});
 await h.window.eval('openCoachConversations()');await h.settle();
 await h.click('[data-edit-my-reflection][data-observation-id="alex-pull-coach"]');
 assert.equal(h.document.querySelector('#myReflectionForm')?.dataset.reflectionOnly,'true');
 h.window.eval('window.savedObservationRoute=clubNavigationRoute()');
 await h.click('#cancelMyReflection');assert.equal(h.window.eval('ensureMyInningsState().observationId'),null);
 await h.window.eval('restoreClubNavigationState(window.savedObservationRoute);renderMyInnings()');await h.settle();
 assert.equal(h.document.querySelector('#myReflectionForm')?.dataset.reflectionOnly,'true');
 assert.equal(h.window.eval('ensureMyInningsState().observationId'),'alex-pull-coach');clean(h);
});
