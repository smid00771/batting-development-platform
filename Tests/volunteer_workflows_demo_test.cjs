const {test}=require('node:test'),assert=require('node:assert/strict');const {openDemo}=require('./helpers/demo_harness.cjs');
test('pasted names require ambiguity review, deduplicate players and preserve scoped retry',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'availability'},{traceRpc:true});t.after(h.close);
 h.window.eval(`window.pasteCalls=[];const previous=supabase.rpc;let lose=true;supabase.rpc=async(n,a)=>{if(a.p_action==='availability_paste')pasteCalls.push(structuredClone(a.p_data));const r=await previous(n,a);if(a.p_action==='availability_paste'&&lose){lose=false;return {error:{message:'Connection interrupted'}};}return r;};window.beforePaste=structuredClone(demoSelections.roster);`);
 await h.click('#sePasteUnavailable');const names=h.document.querySelector('#pasteNames');
 names.value=h.window.eval("demoSelections.roster.filter(p=>p.active)[0].name")+'\n'+h.window.eval("demoSelections.roster.filter(p=>p.active)[0].name")+'\nUnknown Player';names.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 await h.click('#pasteUnavailable button[type=submit]');assert.equal(h.document.querySelector('#pasteSave').disabled,true);
 await h.choose('[data-paste-match="2"]','ignore');assert.match(h.document.querySelector('#pasteSave').textContent,/1 player unavailable/);
 await h.click('#pasteSave');assert.equal(h.window.pasteCalls.length,1);assert.ok(h.document.querySelector('#seRetrySave'));
 await h.click('#seRetrySave');assert.equal(h.window.pasteCalls.length,2);assert.deepEqual(JSON.parse(JSON.stringify(h.window.pasteCalls[0])),JSON.parse(JSON.stringify(h.window.pasteCalls[1])));
 assert.equal(h.window.eval('selectionState.pending'),null);
 assert.equal(h.window.eval('JSON.stringify(beforePaste.filter(p=>!pasteCalls[0].player_ids.includes(p.id)))===JSON.stringify(demoSelections.roster.filter(p=>!pasteCalls[0].player_ids.includes(p.id)))'),true);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('standings settings retain pending receipt, block departure and keep private stats explicit',async t=>{
 const h=await openDemo({product:'both',role:'admin',journey:'selections'},{traceRpc:true});t.after(h.close);
 await h.click('#seSeasonStats');await h.click('[data-season-section="ladders"]');
 assert.ok(h.document.querySelector('#csSettings'));const reads=h.rpcCalls.filter(c=>c.name==='club_standings_api').length;
 h.window.eval(`window.standingsSaves=[];const previous=supabase.rpc;let lose=true;supabase.rpc=async(n,a)=>{if(n==='club_standings_api'&&a.p_action==='save_settings')standingsSaves.push(structuredClone(a.p_data));const r=await previous(n,a);if(n==='club_standings_api'&&a.p_action==='save_settings'&&lose){lose=false;return {error:{message:'Connection interrupted'}};}return r;};`);
 const form=h.document.querySelector('#csSettings'),title=form.elements.title;title.value='Example Championship';title.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 h.window.confirm=()=>false;await h.click('#csBack');assert.ok(h.document.querySelector('#csSettings'));h.window.confirm=()=>true;
 await h.click('#csSettings button[type=submit]');assert.match(h.document.querySelector('#csStatus').textContent,/Retry save/);await h.click('[data-season-section="players"]');assert.ok(h.document.querySelector('#csSettings'),'Pending save blocks view changes');
 await h.click('#csSettings button[type=submit]');assert.deepEqual(JSON.parse(JSON.stringify(h.window.standingsSaves[0])),JSON.parse(JSON.stringify(h.window.standingsSaves[1])));assert.match(h.document.querySelector('.cs-champ h2').textContent,/Example Championship/);
 await h.click('[data-season-section="players"]');assert.ok(h.document.querySelector('.season-stats'));
 assert.ok(reads>0);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
