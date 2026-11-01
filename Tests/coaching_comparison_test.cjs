const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const clean=h=>assert.deepEqual(h.errors.map(e=>e.message),[]);

test('follow-up flags compare only answers supplied by both people, including partial reflections',async t=>{
 const h=await openDemo({product:'both',role:'coach'});t.after(h.close);
 const fields={batting_to_plan:['yes','mostly','no'],dismissal_classification:['plan_execution','outside_plan','not_applicable']};
 for(const [key,values] of Object.entries(fields))for(const playerValue of [null,'',...values])for(const coachValue of [null,'',...values]){
  const player={batting_to_plan:'yes',dismissal_classification:'plan_execution',[key]:playerValue},coach={id:'coach',batting_to_plan:'yes',dismissal_classification:'plan_execution',[key]:coachValue};
  const rows=plain(h.window.eval(`developmentComparisonRows(${JSON.stringify(player)},${JSON.stringify(coach)})`));
  assert.equal(rows.some(row=>row.different),!!playerValue&&!!coachValue&&playerValue!==coachValue,`${key}: ${playerValue} / ${coachValue}`);
 }
 const evaluate=(reflection,coach)=>plain(h.window.eval(`feedbackDiscussionSignals(${JSON.stringify({players:[{id:'example',matches:[{id:'match',format_key:'limited_overs',player_reflection:reflection,coach_feedback:[coach]}]}]})}).filter(s=>s.key.startsWith('view_mismatch:'))`));
 assert.equal(evaluate({batting_to_plan:'yes',dismissal_classification:'outside_plan'},{batting_to_plan:'yes',dismissal_classification:null}).length,0,'A missing dismissal answer is not disagreement');
 assert.equal(evaluate({batting_to_plan:'yes',dismissal_classification:null},{batting_to_plan:'yes',dismissal_classification:'outside_plan'}).length,0,'A blank player answer is also excluded');
 const actual=evaluate({batting_to_plan:'mostly',dismissal_classification:'outside_plan'},{batting_to_plan:'yes',dismissal_classification:null});
 assert.equal(actual.length,1);assert.match(actual[0].summary,/Batted to plan — player: Mostly; coach: Yes/);assert.doesNotMatch(actual[0].summary,/Dismissal/);
 for(const coach of [{plan_related:false,batting_to_plan:'no'},{batting_to_plan:'no_plan'},{batting_to_plan:null,dismissal_classification:null}])assert.equal(evaluate({batting_to_plan:'yes',dismissal_classification:'outside_plan'},coach).length,0);
 clean(h);
});

async function coachExample(t,reflection={batting_to_plan:'yes',dismissal_classification:'outside_plan'}){
 const h=await openDemo({product:'both',role:'coach'},{traceRpc:true});t.after(h.close);
 const id=h.window.eval(`(()=>{
  const f=fixtureRows.feedback['player-alex'],m=f.matches.find(m=>m.id==='alex-pull'),n=m.coach_feedback.find(n=>n.id==='alex-pull-coach');
  m.player_reflection=${JSON.stringify(reflection)};
  Object.assign(n,{batting_to_plan:'yes',dismissal_classification:null,main_issue:null,next_training_focus:'',note:'Practise a flatter swing arc.',plan_related:true,author_user_id:session.user.id,followup_status:'open'});
  const a=f.coaching_actions.find(a=>a.match_feedback_id===n.id);Object.assign(a,{follow_up_requested:true,review_on:null,task:'Match observation',reviews:[{revision:1,outcome:'continue',note:'Observation recorded. No discussion or completion has been assumed.'}]});return a.id;
 })()`);
 await h.window.eval(`openWeeklyLoopConversation('player-alex',${JSON.stringify(id)})`);await h.settle();
 return {h,id,card:h.document.querySelector('[data-coaching-action-card="'+id+'"]')};
}

test('opening the coaching note shows the recorded choices directly, without a false warning or empty history',async t=>{
 const {h,card}=await coachExample(t);assert.ok(card);
 const comparison=card.querySelector('[data-assessment-comparison]');assert.ok(comparison);assert.equal(comparison.closest('details'),null);
 const answers=key=>[...comparison.querySelectorAll('[data-assessment-question="'+key+'"] td')].map(c=>c.textContent);
 assert.deepEqual(answers('batting_to_plan'),['Yes','Yes']);assert.deepEqual(answers('dismissal_classification'),['Decision outside plan','Not answered']);
 assert.equal(comparison.querySelector('[data-answer-different]'),null);assert.equal(card.querySelector('[data-coach-signal-card^="view_mismatch:"]'),null);
 assert.equal(card.querySelector('[data-conversation-history]'),null,'Do not add a history disclosure containing only automatic recording');
 assert.equal(card.querySelector('[data-open-focus-review]'),null,'A comment with no agreed training task does not need training-focus controls');
 assert.equal(card.querySelector('[data-edit-coach-feedback]').closest('details'),null);
 assert.doesNotMatch(h.document.querySelector('#developmentOverview').textContent,/Details and history|Other saved notes|Past conversations|Talk through the note with the player/);
 assert.equal(h.document.querySelector('#pastCoachingNotes'),null);clean(h);
});

test('real differences identify the question and preserve the exact observation being opened',async t=>{
 const {h,card}=await coachExample(t,{batting_to_plan:'mostly',dismissal_classification:'outside_plan'});
 const comparison=card.querySelector('[data-assessment-comparison="alex-pull-coach"]');assert.ok(comparison);
 assert.equal(comparison.querySelectorAll('[data-answer-different]').length,1);
 assert.equal(comparison.querySelector('[data-answer-different]').dataset.assessmentQuestion,'batting_to_plan');
 assert.deepEqual([...comparison.querySelectorAll('[data-answer-different] td')].map(c=>c.textContent),['Mostly','Yes']);
 assert.equal(comparison.closest('details'),null);assert.match(card.textContent,/Practise a flatter swing arc/);
 assert.equal(card.querySelectorAll('[data-coach-signal-card^="view_mismatch:"]').length,1,'The comparison replaces the repeated warning');
 clean(h);
});

test('the player sees the same comparison only after the saved independent reflection',async t=>{
 const h=await openDemo({product:'both',role:'player'},{traceRpc:true});t.after(h.close);
 h.window.eval(`const m=fixtureRows.feedback['player-alex'].matches.find(m=>m.id==='alex-pull');m.player_reflection={batting_to_plan:'mostly',dismissal_classification:'outside_plan'};Object.assign(m.coach_feedback[0],{batting_to_plan:'yes',dismissal_classification:null,note:'Read this one comment',plan_related:true});`);
 await h.window.eval('refreshMyCoachingUpdates()');const before=h.rpcCalls.length;
 await h.window.eval("openCoachingUpdate(myCoachingUpdates.updates.find(u=>u.source_id==='alex-pull-coach'))");await h.settle();
 const comparison=h.document.querySelector('.player-observation-page [data-assessment-comparison]');assert.ok(comparison);assert.equal(comparison.closest('details'),null);assert.match(comparison.textContent,/You/);assert.match(comparison.textContent,/Mostly/);assert.match(comparison.textContent,/Yes/);assert.match(comparison.textContent,/Not answered/);
 assert.equal(comparison.querySelectorAll('[data-answer-different]').length,1);
 assert.ok(!h.rpcCalls.slice(before).some(c=>['get_feedback_workspace','get_player_focus','get_my_match_preparations'].includes(c.name)));
 clean(h);
});
