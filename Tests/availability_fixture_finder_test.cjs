const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),{openDemo}=require('./helpers/demo_harness.cjs');
const tick=()=>new Promise(r=>setTimeout(r,10));
async function player(t){const h=await openDemo({product:'both',role:'player',journey:'player_home'});t.after(h.close);h.window.eval(`window.calendarRequests=[];const calendarTestRpc=supabase.rpc;supabase.rpc=async(name,args)=>{calendarRequests.push({name,args});return calendarTestRpc(name,args);};`);return h;}
const lookups=h=>h.window.calendarRequests.filter(r=>r.name==='club_availability_fixtures').length;
const fixtureData=h=>JSON.parse(h.window.eval('JSON.stringify(demoAvailabilityFixtures())'));
function closeDialog(h){const dialog=h.document.querySelector('dialog');if(dialog)dialog.dispatchEvent(new h.window.Event('close'));}
test('fixture finder stays unloaded until requested, caches browsing/saves and refreshes explicitly',async t=>{
 const h=await player(t);assert.equal(h.window.eval('availabilityFixturesModule'),null);assert.equal(lookups(h),0);
 await h.click('#playerHomeAvailability');assert.equal(h.window.eval('availabilityFixturesModule'),null);assert.equal(lookups(h),0);
 await h.click('#seFindFixtures');assert.equal(lookups(h),1);const data=fixtureData(h),team=data.teams.find(t=>t.suggested),fixture=data.fixtures.find(f=>f.team_id===team.id);
 assert.equal(h.document.querySelector(`[data-fixture-team="${team.id}"]`).checked,true);
 await h.choose('#seMonth',fixture.days[0].date.slice(0,7));assert.ok(h.document.querySelector(`[data-se-date="${fixture.days[0].date}"]`).dataset.seFixture);
 await h.click('[data-fixture-done]');assert.equal(h.document.getElementById('seFixturePicker').hidden,true);
 await h.click('#seMonthNext');await h.click('#seMonthPrev');assert.equal(lookups(h),1);
 const date=fixture.days[0].date,before=h.document.querySelector(`[data-se-date="${date}"]`).dataset.seAvailability;
 await h.click(`[data-se-date="${date}"]`);assert.ok(h.document.querySelector('.se-fixture-day'));assert.equal(h.document.querySelector(`[data-se-date="${date}"]`).dataset.seAvailability,before,'Viewing a fixture never changes availability');
 await h.click('[data-fixture-status="unavailable"]');closeDialog(h);assert.equal(h.document.querySelector(`[data-se-date="${date}"]`).dataset.seAvailability,'unavailable');
 await h.click('#seSaveAvailability');assert.equal(lookups(h),1);assert.ok(h.document.querySelector(`[data-se-date="${date}"]`).dataset.seFixture,'Markers survive saving');
 await h.click('#seFindFixtures');await h.click('[data-fixture-refresh]');assert.equal(lookups(h),2);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('multi-team choices retain both match days and same-date games, and remember an explicit empty choice',async t=>{
 const h=await player(t);await h.click('#playerHomeAvailability');await h.click('#seFindFixtures');const data=fixtureData(h),selected=data.teams.filter(t=>t.suggested);
 for(const team of selected)await h.click(`[data-fixture-team="${team.id}"]`);
 const targets=data.teams.filter(t=>['Harbour Cup','Under 21s'].includes(t.name));assert.equal(targets.length,2);
 for(const team of targets)await h.click(`[data-fixture-team="${team.id}"]`);
 const fixture=data.fixtures.find(f=>f.team_id===targets[0].id),date=fixture.days[0].date;await h.choose('#seMonth',date.slice(0,7));await h.click(`[data-se-date="${date}"]`);
 const details=h.document.querySelector('.se-fixture-day').textContent;assert.match(details,/Harbour Cup/);assert.match(details,/Under 21s/);await h.click('[data-fixture-close]');closeDialog(h);
 for(const team of targets)await h.click(`[data-fixture-team="${team.id}"]`);
 await h.click('#playerHomeShortcut');await h.click('#playerHomeAvailability');await h.click('#seFindFixtures');assert.equal(h.document.querySelectorAll('[data-fixture-team]:checked').length,0);
 assert.equal(lookups(h),1);assert.equal(h.document.querySelectorAll('[data-se-fixture]').length,0);
 const twoDay=data.fixtures.find(f=>f.days.length===2);await h.click(`[data-fixture-team="${twoDay.team_id}"]`);
 for(const day of twoDay.days){await h.choose('#seMonth',day.date.slice(0,7));assert.ok(h.document.querySelector(`[data-se-date="${day.date}"]`).dataset.seFixture);}
 assert.equal(lookups(h),1);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('Add Trial game saves whole-club or multiple-team audiences without creating a selection team',async t=>{
 const h=await openDemo({product:'both',role:'admin',journey:'selection_admin'});t.after(h.close);
 const original=h.window.eval('demoSelections.fixtures.length');h.window.eval('seFixtures()');await h.settle();assert.equal(h.document.getElementById('seClubTrials').textContent,'Add Trial game');await h.click('#seClubTrials');
 let form=h.document.getElementById('calendarTrialForm');assert.ok(form);assert.equal(form.elements.audience.value,'club');assert.equal(form.elements.included.checked,false);assert.equal(form.querySelector('[name="grade"]'),null);
 const date=h.window.eval('demoAddDay(demoUpcomingSaturday(),2)');form.elements.date0.value=date;form.elements.title.value='Whole club trial';await h.click('#calendarTrialForm [name="included"]');await h.click('[data-trial-save]');assert.equal(h.window.eval('demoCalendarTrials.length'),1);
 await h.click('[data-trial-new]');form=h.document.getElementById('calendarTrialForm');form.elements.title.value='1st and 2nd trial';form.elements.date0.value=date;await h.choose('#calendarTrialForm [name="audience"]','teams');
 await h.click('#calendarTrialForm [name="team_ids"][value="group-first"]');await h.click('#calendarTrialForm [name="team_ids"][value="group-second"]');await h.click('#calendarTrialForm [name="included"]');await h.click('[data-trial-save]');
 assert.equal(h.window.eval('demoSelections.fixtures.length'),original);assert.equal(h.window.eval('demoCalendarTrials.length'),2);
 await h.click('[data-trial-close]');closeDialog(h);await h.choose('#demoPersona','player');await h.click('#playerHomeAvailability');await h.click('#seFindFixtures');
 for(const input of [...h.document.querySelectorAll('[data-fixture-team]:checked')])await h.click(`[data-fixture-team="${input.dataset.fixtureTeam}"]`);
 await h.choose('#seMonth',date.slice(0,7));await h.click(`[data-se-date="${date}"]`);assert.match(h.document.querySelector('.se-fixture-day').textContent,/Whole club trial/);assert.match(h.document.querySelector('.se-fixture-day').textContent,/1st and 2nd trial/,'Usual-team trials appear even when no match teams are followed');await h.click('[data-fixture-close]');closeDialog(h);
 await h.click('[data-fixture-team="group-second"]');await h.click(`[data-se-date="${date}"]`);assert.match(h.document.querySelector('.se-fixture-day').textContent,/1st and 2nd trial/);assert.match(h.document.querySelector('.se-fixture-day').textContent,/1st Grade \+ 2nd Grade/);await h.click('[data-fixture-close]');closeDialog(h);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('manual team fixtures require the explicit include checkbox and retain it when reopened',async t=>{
 const h=await openDemo({product:'both',role:'admin',journey:'selection_admin'});t.after(h.close);h.window.eval('seFixtureEditor()');await h.settle();
 const form=h.document.getElementById('seFixtureForm');assert.equal(form.elements.include_in_fixture_calendar.checked,false);assert.equal(h.document.getElementById('seManualClubTrial').textContent,'Add Trial game');
 const grade=[...form.elements.grade.options].find(o=>o.textContent==='1st Grade');await h.choose('#seFixtureForm [name="grade"]',grade.value);await h.choose('#seFixtureForm [name="format"]','t20');form.elements.opposition.value='Trial visitors';form.elements.date0.value=h.window.eval('demoAddDay(demoUpcomingSaturday(),3)');await h.click('[name="include_in_fixture_calendar"]');await form.onsubmit({preventDefault(){}});await h.settle();
 assert.equal(h.window.eval("demoSelections.fixtures.find(f=>f.details.opposition==='Trial visitors').details.include_in_fixture_calendar"),true);
 h.window.eval("seFixtureEditor({...ensureSelections().data.fixtures.find(f=>f.details.opposition==='Trial visitors'),can_edit:true})");await h.settle();assert.equal(h.document.querySelector('[name="include_in_fixture_calendar"]').checked,true);assert.equal(h.document.getElementById('seFixtureCalendarChoice').hidden,false);
 assert.deepEqual(h.errors.map(e=>e.message),[]);
});
test('fixture errors retry and a late or wrong-account response cannot draw markers',async t=>{
 const {createAvailabilityFixtureFinder}=await import('../availability-fixtures.js');
 const dom=new JSDOM('<form><button id="find"></button><div id="panel" hidden></div><button data-se-date="2099-01-01" aria-label="2099-01-01, availability not set">1</button></form>',{url:'https://example.test'});t.after(()=>dom.window.close());
 const form=dom.window.document.querySelector('form');let calls=0,current=true,resolve;const payload={club_id:'club',player_id:'player',season_id:'season',from_date:'2099-01-01',teams:[{id:'team',name:'Team',suggested:true}],fixtures:[{id:'fixture',team_id:'team',days:[{date:'2099-01-01'}]}]};
 const h={form,button:form.querySelector('#find'),panel:form.querySelector('#panel'),workspace:{},scope:'scope',clubId:'club',playerId:'player',storage:dom.window.localStorage,current:()=>current,instruction:'Choose dates',status:()=> 'unknown',setStatus(){},paint:()=>finder.decorate(),fetch:()=>{calls++;if(calls===1)throw Error('offline');return new Promise(r=>resolve=r);}};
 const finder=createAvailabilityFixtureFinder(h);finder.open();await tick();assert.match(h.panel.textContent,/Could not load/);h.panel.querySelector('[data-fixture-refresh]').click();await tick();current=false;resolve(payload);await tick();assert.equal(form.querySelector('[data-se-fixture]'),null);
 current=true;h.fetch=async()=>({...payload,player_id:'someone-else'});finder.open();finder.open();await tick();assert.match(h.panel.textContent,/Could not load/);assert.equal(form.querySelector('[data-se-fixture]'),null);
 h.fetch=async()=>payload;h.panel.querySelector('[data-fixture-refresh]').click();await tick();assert.ok(form.querySelector('[data-se-fixture]'));
});
