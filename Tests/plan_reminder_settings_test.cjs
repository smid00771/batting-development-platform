const {test}=require('node:test'),assert=require('node:assert/strict'),{openDemo}=require('./helpers/demo_harness.cjs');
async function admin(t,product='both'){const h=await openDemo({product,role:'admin',journey:'club_admin'});t.after(h.close);h.window.eval("currentTab='players';renderTab()");await h.settle();return h;}
test('linked clubs replace manual dates with a saved Select team checklist, including age/cup teams',async t=>{
 const h=await admin(t);assert.equal(h.document.getElementById('managePlanDatesFromPlayers').textContent,'Plan reminders');
 await h.click('#managePlanDatesFromPlayers');const form=h.document.getElementById('planReminderTeamsForm');assert.ok(form);assert.equal(form.querySelector('[type=date]'),null);
 assert.ok(form.querySelector('[value=group-u21]'));assert.equal(form.querySelector('[value=group-masters]').checked,false);
 assert.match(form.querySelector('[value=group-first]').closest('label').textContent,/Long form · \d+ \w+/);
 assert.match(form.querySelector('[value=group-dev-navy]').closest('label').textContent,/Limited overs · \d+ \w+/);
 await h.click('[name=team_ids][value=group-u21]');await h.click('[name=team_ids][value=group-cup]');await h.click('#savePlanReminderTeams');
 assert.equal(h.window.eval('demoPlanReminderSettings.team_ids.includes("group-u21")'),true);assert.equal(h.window.eval('demoPlanReminderSettings.team_ids.includes("group-masters")'),false);
 await h.click('#managePlanDatesFromPlayers');assert.equal(h.document.querySelector('input[value=group-u21]').checked,true);assert.equal(h.document.querySelector('input[value=group-cup]').checked,true);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('Club Batting alone retains manual plan dates',async t=>{
 const h=await admin(t,'batting');assert.equal(h.document.getElementById('managePlanDatesFromPlayers').textContent,'Plan dates');await h.click('#managePlanDatesFromPlayers');assert.ok(h.document.getElementById('planDateValue'));assert.equal(h.document.getElementById('planReminderTeamsForm'),null);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('reminder settings retry the identical request after an uncertain save without duplicating changes',async t=>{
 const h=await admin(t);await h.click('#managePlanDatesFromPlayers');
 h.window.eval(`window.planSaveRequests=[];const realPlanRpc=supabase.rpc;let failPlanOnce=true;supabase.rpc=async(name,args)=>{if(name==='club_plan_reminder_settings'&&args.p_action==='save'){planSaveRequests.push(JSON.stringify(args));const result=await realPlanRpc(name,args);if(failPlanOnce){failPlanOnce=false;throw Error('offline after save');}return result;}return realPlanRpc(name,args);};`);
 await h.click('[name=team_ids][value=group-u21]');await h.click('#savePlanReminderTeams');assert.equal(h.document.getElementById('savePlanReminderTeams').textContent,'Retry save');assert.equal(h.document.querySelector('input[value=group-masters]').disabled,true);
 await h.click('#savePlanReminderTeams');assert.equal(h.window.planSaveRequests.length,2);assert.equal(h.window.planSaveRequests[0],h.window.planSaveRequests[1]);assert.equal(h.window.eval('demoPlanReminderSettings.revision'),2);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
