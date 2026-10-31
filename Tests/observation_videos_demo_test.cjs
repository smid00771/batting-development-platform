const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
async function open(h){
 await h.window.eval("(async()=>{currentTab='players';playersWorkspaceSelectedId='player-alex';playersWorkspaceSection='development';playersWorkspaceDevelopmentMode='match';playersWorkspaceDevelopmentMatchId=null;staffObservationEditId=null;await renderPlayersWorkspacePlayer();})()");await h.settle();
 await h.choose('#staffObservationDate',h.window.eval("demoSelections.fixtures.find(f=>f.id==='selection-first').details.days[0].date"));
}
async function twoClips(h){
 await h.choose('#staffObservationVideoUrl','https://youtu.be/abcdefghijk?t=12');await h.choose('#staffObservationVideoNote','Second ball — shot choice');
 await h.click('[data-add-coaching-video]');await h.choose('#staffObservationVideoUrl1','https://www.youtube.com/watch?v=abcdefghijk&t=1m24s');await h.choose('#staffObservationVideoNote1','Dismissal — footwork');
}
for(const product of ['both','batting'])test(product+': multiple clips save on their own and reopen with descriptions and timestamps',async t=>{
 const h=await openDemo({product,role:'coach',journey:'players'});t.after(h.close);await open(h);await twoClips(h);
 await h.click('#saveStaffMatchFeedback');assert.equal(h.document.querySelector('#staffDevelopmentForm'),null);
 assert.equal(h.document.querySelector('#addNewMatchFeedback').textContent,'Edit / add to match observation');
 assert.equal(h.document.querySelector('#addTrainingObservation'),null,'This page offers only the match observation entry');
 await open(h);const links=[...h.document.querySelectorAll('[data-video-url]')].map(el=>el.value),notes=[...h.document.querySelectorAll('[data-video-note]')].map(el=>el.value);
 assert.deepEqual(links,['https://www.youtube.com/watch?v=abcdefghijk&t=12','https://www.youtube.com/watch?v=abcdefghijk&t=1m24s']);assert.deepEqual(notes,['Second ball — shot choice','Dismissal — footwork']);
 assert.equal(h.document.querySelectorAll('input[name="staffBattingToPlan"]:checked,input[name="staffDismissalClass"]:checked').length,0);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('invalid extra links retain all fields; removing one clip preserves the remaining clips',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);await open(h);await twoClips(h);
 await h.click('[data-add-coaching-video]');await h.choose('#staffObservationVideoUrl2','https://example.com/not-youtube');await h.click('#saveStaffMatchFeedback');
 assert.match(h.document.querySelector('#staffDevelopmentStatus').textContent,/Video 3:/);assert.equal(h.document.querySelector('#staffObservationVideoNote1').value,'Dismissal — footwork');
 await h.click('[data-coaching-video-row="2"] [data-remove-coaching-video]');await h.click('[data-coaching-video-row="0"] [data-remove-coaching-video]');await h.click('[data-add-coaching-video]');
 await h.click('#saveStaffMatchFeedback');await open(h);assert.equal(h.document.querySelectorAll('[data-video-url]').length,1);assert.match(h.document.querySelector('[data-video-url]').value,/t=1m24s$/);
 // Explicitly removing the final link preserves the rest of the observation.
 await h.choose('#staffMatchNote','Retain the coaching note');await h.click('[data-remove-coaching-video]');await h.click('#saveStaffMatchFeedback');await open(h);
 assert.equal(h.document.querySelector('[data-video-url]').value,'');assert.equal(h.document.querySelector('#staffMatchNote').value,'Retain the coaching note');assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('draft recovery recreates added video rows and respects removed rows',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);await open(h);await twoClips(h);
 await h.click('[data-add-coaching-video]');await h.choose('#staffObservationVideoUrl2','https://youtu.be/lmnopqrstuv?t=65');await h.choose('#staffObservationVideoNote2','Calling between wickets');await h.click('[data-coaching-video-row="1"] [data-remove-coaching-video]');
 await h.window.eval('matchDraftOpen(matchDraftEntries().find(e=>e.kind==="observation"))');await h.settle();await h.click('[data-draft-restore]');
 assert.equal(h.document.querySelectorAll('[data-video-url]').length,2);assert.equal(h.document.querySelector('#staffObservationVideoUrl1'),null);assert.equal(h.document.querySelector('#staffObservationVideoNote2').value,'Calling between wickets');
 await h.click('#saveStaffMatchFeedback');await open(h);assert.equal(h.document.querySelectorAll('[data-video-url]').length,2);assert.equal(h.document.querySelector('#staffObservationVideoNote1').value,'Calling between wickets');assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('an uncertain multi-clip save locks added controls and recovers the exact original receipt',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);await open(h);await twoClips(h);
 h.window.eval("window.originalVideoRpc=supabase.rpc;window.videoWrites=[];supabase.rpc=async(name,args)=>{if(name==='save_individual_fixture_observation'){videoWrites.push(structuredClone(args));const out=await originalVideoRpc(name,args);if(videoWrites.length===1&&!out.error)return {error:{message:'Response lost'}};return out;}return originalVideoRpc(name,args);};");
 await h.click('#saveStaffMatchFeedback');assert.equal(h.document.querySelector('[data-add-coaching-video]').disabled,true);assert.equal(h.document.querySelector('[data-remove-coaching-video]').disabled,true);
 await h.window.eval('matchDraftOpen(matchDraftEntries().find(e=>e.command))');await h.settle();await h.click('[data-draft-restore]');
 const writes=JSON.parse(h.window.eval('JSON.stringify(videoWrites)'));assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].p_values.videos.length,2);
 assert.equal(h.document.querySelectorAll('[data-video-url]').length,2);assert.equal(h.document.querySelector('#staffObservationVideoNote1').value,'Dismissal — footwork');assert.equal(h.document.querySelector('[data-add-coaching-video]').disabled,false);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('an existing single video remains editable and both clips appear in shared readback',async t=>{
 const h=await openDemo({product:'both',role:'coach',journey:'players'});t.after(h.close);await open(h);
 await h.choose('#staffMatchNote','Original note');await h.choose('#staffObservationVideoUrl','https://youtu.be/abcdefghijk?t=12');await h.click('#saveStaffMatchFeedback');
 h.window.eval("for(const a of fixtureRows.feedback['player-alex'].coaching_actions)if(a.video?.url){a.video={url:a.video.url,note:'Legacy clip'};}");
 await open(h);assert.equal(h.document.querySelector('#staffObservationVideoNote').value,'Legacy clip');await h.click('[data-add-coaching-video]');await h.choose('#staffObservationVideoUrl1','https://youtu.be/lmnopqrstuv?t=65');await h.choose('#staffObservationVideoNote1','Another moment');await h.click('#saveStaffMatchFeedback');
 const rendered=h.window.eval("renderCoachingVideo(fixtureRows.feedback['player-alex'].coaching_actions.find(a=>a.video?.links?.length===2).video)");
 assert.match(rendered,/Legacy clip/);assert.match(rendered,/Another moment/);assert.match(rendered,/t=12/);assert.match(rendered,/t=65/);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
