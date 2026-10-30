const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
test('message recipients support search, overlapping teams and individual exclusions without losing hidden choices',async t=>{
 const h=await openDemo({product:'both',role:'coach'},{traceRpc:true});t.after(h.close);
 await h.window.eval('openClubMessages({compose:true})');await h.settle();
 await h.window.eval(`clubMessageState.context.players=[
 {id:'player-alex',user_id:'user-alex',name:'Alex Morgan',groups:[{id:'g1',name:'First XI'},{id:'g2',name:'Second XI'}]},
 {id:'player-jordan',user_id:'user-jordan',name:'Jordan Lee',groups:[{id:'g2',name:'Second XI'}]},
 {id:'player-third',user_id:'user-third',name:'Taylor Woods',groups:[{id:'g1',name:'First XI'}]},
 {id:'player-fourth',user_id:'user-fourth',name:'Riley Fox',groups:[]}];
 clubMessageState.draft.include_staff=false;clubMessageState.draft.staff_initialised=true;clubMessageState.draft.staff_user_ids=[];
 drawClubMessages(document.getElementById('page'),clubMessageState);`);
 const query=h.document.querySelector('#messagePlayerSearch');
 query.value='alex';query.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 assert.deepEqual([...h.document.querySelectorAll('[data-message-player-row]')].filter(x=>!x.hidden).map(x=>x.dataset.messagePlayerRow),['player-alex']);
 await h.click('[data-message-player="player-alex"]');
 query.value='';query.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 await h.click('[data-message-team="g1"]');await h.click('[data-message-team="g2"]');
 assert.deepEqual(plain(h.window.eval('clubMessageState.draft.player_ids')).sort(),['player-alex','player-jordan','player-third']);
 assert.match(h.document.querySelector('#messageTeamSummary').textContent,/2 teams/);
 await h.click('[data-message-player="player-alex"]');
 query.value='jordan';query.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 assert.deepEqual(plain(h.window.eval('clubMessageState.draft.player_ids')).sort(),['player-jordan','player-third']);
 await h.click('[data-message-team="g1"]');await h.click('[data-message-team="g1"]');
 assert.ok(!h.document.querySelector('[data-message-player="player-alex"]').checked,'An explicit exception survives team changes');
 await h.click('[data-message-team="__all__"]');
 assert.ok(h.document.querySelector('[data-message-team="g1"]').disabled);
 assert.deepEqual(plain(h.window.eval('clubMessageState.draft.player_ids')).sort(),['player-fourth','player-jordan','player-third']);
 await h.click('#messageClearRecipients');assert.equal(h.window.eval('clubMessageState.draft.player_ids.length'),0);
 await h.click('#messageSelectShown');assert.deepEqual(plain(h.window.eval('clubMessageState.draft.player_ids')),['player-jordan']);
 assert.ok(!h.rpcCalls.some(c=>c.name==='club_messages_api'&&c.args?.p_action==='send'));
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
