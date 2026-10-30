const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const clean=h=>assert.deepEqual(h.errors.map(e=>e.message),[]);
async function messages(h){await h.window.eval('openClubMessages()');await h.settle();}

async function openAlex(h){
 await messages(h);
 const row=plain(h.window.eval("clubMessageState.data.inbox.find(x=>x.coaching_player_id==='player-alex')"));assert.ok(row);
 await h.click('[data-message-id="'+row.id+'"] summary');
 await h.click('[data-message-record="'+row.id+'"]');
 return row;
}
test('assigned conversations are real messages; Messages never downloads the shared player follow-up list',async t=>{
 const h=await openDemo({product:'both',role:'coach'},{traceRpc:true});t.after(h.close);
 const before=h.rpcCalls.length;await h.window.eval('refreshClubMessageBadge()');await messages(h);
 assert.ok(!h.rpcCalls.slice(before).some(c=>['get_feedback_workspace','get_coaching_action_alerts'].includes(c.name)));
 const rows=plain(h.window.eval('clubMessageState.data.inbox'));assert.ok(rows.some(r=>r.coaching_action_id));
 assert.ok(rows.filter(r=>r.coaching_action_id).every(r=>r.user_ids.includes(h.window.eval('session.user.id'))));
 assert.equal(h.document.querySelector('[data-message-coaching]'),null);
 assert.ok(!h.rpcCalls.slice(before).some(c=>['send','open','delete'].includes(c.args?.p_action)||c.name==='mark_my_coaching_update_seen'));
 clean(h);
});

test('a coaching inbox row opens the correct player with evidence collapsed and two main actions',async t=>{
 const h=await openDemo({product:'both',role:'coach'});t.after(h.close);await openAlex(h);
 assert.equal(h.window.eval('playersWorkspaceSelectedId'),'player-alex');
 assert.equal(h.document.querySelector('#staffInningsHistory').open,false);
 const card=h.document.querySelector('#sharedCoachingActions>article');assert.ok(card);
 assert.equal(card.querySelector('[data-conversation-history]').open,false);
 assert.deepEqual([...card.querySelectorAll('.conversation-controls button')].map(b=>b.textContent),['Add update','Mark discussed']);
 assert.ok(card.querySelector('[data-open-focus-review]').closest('details'));
 clean(h);
});

test('routine notes collapse, but a conflicting player reflection still brings its note forward',async t=>{
 const h=await openDemo({product:'both',role:'coach'});t.after(h.close);
 await h.window.eval(`for(const a of fixtureRows.feedback['player-alex'].coaching_actions){a.follow_up_requested=false;a.review_on=null;if(a.is_player_request)a.status='completed';}
 const f=fixtureRows.feedback['player-alex'],m=f.matches.find(m=>m.coach_feedback.length);m.player_reflection={...m.coach_feedback[0],batting_to_plan:'no',updated_at:new Date().toISOString()};`);
 await h.window.eval("openWeeklyLoopConversation('player-alex',fixtureRows.feedback['player-alex'].coaching_actions[0].id)");await h.settle();
 const routine=h.document.querySelector('#otherCoachingNotes');assert.ok(routine);assert.equal(routine.open,false);
 assert.ok(routine.querySelector('[data-review-coaching-action]'));
 assert.ok(h.document.querySelector('#sharedCoachingActions>article [data-coach-signal-card]'));
 assert.equal(h.document.querySelector('#pastCoachingNotes').open,false);clean(h);
});

test('an update can complete the conversation in one revision-checked save and removes it from follow-up',async t=>{
 const h=await openDemo({product:'both',role:'coach'},{traceRpc:true});t.after(h.close);await openAlex(h);
 const button=h.document.querySelector('#sharedCoachingActions>article [data-review-coaching-action]'),id=button.dataset.reviewCoachingAction;
 await h.click('[data-review-coaching-action="'+id+'"]');
 const note=h.document.querySelector('#coachingReviewNote');note.value='Discussed the reset and agreed a useful practice.';note.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 await h.click('#coachingReviewComplete');assert.equal(h.document.querySelector('#saveCoachingReview').textContent,'Save and mark discussed');
 await h.click('#saveCoachingReview');
 const saved=h.rpcCalls.filter(c=>c.name==='review_coaching_action').at(-1);
 assert.equal(saved.args.p_action_id,id);assert.equal(saved.args.p_outcome,'completed');assert.equal(saved.args.p_note,note.value);assert.ok(saved.args.p_expected_revision>=1);assert.ok(saved.args.p_request_id);
 assert.ok(h.document.querySelector('#pastCoachingNotes [data-coaching-action-card="'+id+'"]'));
 assert.equal(h.window.eval(`workspaceCoachConversations('player-alex').some(i=>i.action?.id===${JSON.stringify(id)})`),false);clean(h);
});

test('personal updates appear in Messages without staff downloads or premature read acknowledgements',async t=>{
 const h=await openDemo({product:'both',role:'player'},{traceRpc:true});t.after(h.close);
 await h.window.eval("fixtureRows.feedback['player-alex'].matches.find(m=>m.coach_feedback.length).player_reflection=null");
 const before=h.rpcCalls.length;await messages(h);
 const rows=plain(h.window.eval('clubMessageState.coaching.rows'));
 assert.ok(rows.some(r=>r.unread));assert.ok(rows.every(r=>r.kind!=='player'));
 assert.ok(!h.rpcCalls.slice(before).some(c=>['get_feedback_workspace','get_coaching_action_alerts','mark_my_coaching_update_seen'].includes(c.name)));
 const gated=rows.find(r=>r.update?.can_open===false);assert.ok(gated);
 await h.click('[data-message-coaching="'+gated.key+'"]');
 assert.equal(h.window.eval('currentTab'),'innings');assert.ok(h.document.querySelector('#myReflectionForm'));clean(h);
});

test('Select-only members do not download or see Club Batting coaching data',async t=>{
 const h=await openDemo({product:'select',role:'admin'},{traceRpc:true});t.after(h.close);
 const before=h.rpcCalls.length;await messages(h);
 assert.equal(h.document.querySelector('.message-coaching'),null);
 assert.ok(!h.rpcCalls.slice(before).some(c=>['get_feedback_workspace','get_coaching_action_alerts','get_my_coaching_updates','get_my_coach_conversations'].includes(c.name)));clean(h);
});

test('partial coaching errors keep club messages usable and provide a retry',async t=>{
 const h=await openDemo({product:'both',role:'player'});t.after(h.close);
 await h.window.eval(`window.savedInboxRpc=window.__fixtureRpc;window.__fixtureRpc=async(name,args)=>name==='get_my_coaching_updates'?{error:{message:'Offline'}}:window.savedInboxRpc(name,args);`);
 await messages(h);assert.ok(h.document.querySelector('#retryMessageCoaching'));assert.ok(h.document.querySelector('.messages-page'));
 await h.window.eval('window.__fixtureRpc=window.savedInboxRpc');await h.click('#retryMessageCoaching');
 assert.equal(h.document.querySelector('#retryMessageCoaching'),null);assert.ok(h.document.querySelector('[data-message-coaching]'));clean(h);
});

test('late Messages loads cannot replace a newer screen or club',async t=>{
 const h=await openDemo({product:'both',role:'player'});t.after(h.close);
 await h.window.eval(`window.savedInboxRpc=window.__fixtureRpc;window.__fixtureRpc=(name,args)=>name==='club_messages_api'&&args.p_action==='list'?new Promise(resolve=>window.releaseInbox=()=>resolve(window.savedInboxRpc(name,args))):window.savedInboxRpc(name,args);`);
 const pending=h.window.eval('openClubMessages()');await h.settle();
 h.window.eval("club={...club,id:'other-club'};currentTab='teams';document.getElementById('page').innerHTML='<p>Other club</p>';window.releaseInbox()");
 await pending;assert.equal(h.document.querySelector('#page').textContent,'Other club');clean(h);
});
