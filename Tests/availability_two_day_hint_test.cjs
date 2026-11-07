const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDemo}=require('./helpers/demo_harness.cjs');
// These existing delayed home badges may finish after demoReady; fixture and
// availability reads/writes must still remain absent while changing the hint.
const extraRequests=h=>h.window.hintRpc.filter(r=>!['club_messages_api','get_selection_signup_followup','mirelion_assist'].includes(r.name));

async function setup(t){
 const h=await openDemo({product:'select',role:'head',journey:'availability'});t.after(h.close);
 h.window.eval(`
  const first=selectionState.data.fixtures.find(f=>f.id==='selection-first');
  first.details.days=[{date:'2099-11-14',start:'12:00'},{date:'2099-11-21',start:'12:00'}];first.details.format='long_form';first.details.cancelled=false;
  window.hintGrade=first.details.grade;window.hintGradeId=first.details.grade_group_id;
  selectionState.data.fixtures=[first];selectionState.date='2099-11-14';selectionState.bulkAvailabilityDate='2099-11-14';
  window.beforeHint=JSON.stringify(selectionState.data.roster.map(p=>p.availability));
  window.hintRpc=[];const originalHintRpc=supabase.rpc;supabase.rpc=(name,args)=>{window.hintRpc.push({name,args});return originalHintRpc(name,args);};
 `);
 return h;
}

test('bulk availability flags both playing dates immediately and follows the chosen teams and dates locally',async t=>{
 const h=await setup(t);await h.click('#seSetAvailabilityDate');let hint=h.document.getElementById('seBulkMatchHint');
 assert.equal(hint.hidden,false);assert.match(hint.textContent,/Two-day match.*14\/11\/2099 & 21\/11\/2099.*Each playing day/);
 await h.choose('#seBulkSource','usual');assert.equal(hint.hidden,true,'No team is selected yet');
 await h.click('[name="team"][value="group:'+h.window.hintGradeId+'"]');assert.equal(hint.hidden,false);assert.ok(hint.textContent.includes(h.window.hintGrade));
 await h.choose('#seBulkMode','individual');assert.equal(hint.hidden,false,'The individual-player option gets the same date warning');
 await h.choose('#seBulkDate','2099-11-21');assert.equal(hint.hidden,false,'The second day identifies the first day too');
 await h.choose('#seBulkDate','2099-11-28');assert.equal(hint.hidden,true,'Unrelated dates stay compact');
 assert.equal(extraRequests(h).length,0,JSON.stringify(extraRequests(h)));assert.equal(h.window.eval('JSON.stringify(selectionState.data.roster.map(p=>p.availability))'),h.window.beforeHint);assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('a player calendar flags the other day without marking it available or sending a request',async t=>{
 const h=await setup(t);
 h.window.eval(`const person=selectionState.data.roster.find(p=>seUsualGrades(p).includes(window.hintGrade));window.hintPlayer=person.id;person.availability.available_dates=[];person.availability.unavailable_dates=[];selectionState.availabilityMonth='2099-11';seAvailability(person.id);`);
 await h.click('[data-se-date="2099-11-14"]');
 const hint=h.document.getElementById('seCalendarMatchHint');assert.equal(hint.hidden,false);assert.match(hint.textContent,/21\/11\/2099/);
 assert.equal(h.document.querySelector('[data-se-date="2099-11-14"]').dataset.seAvailability,'available');assert.equal(h.document.querySelector('[data-se-date="2099-11-21"]').dataset.seAvailability,'unknown');
 assert.equal(extraRequests(h).length,0);assert.deepEqual(h.errors.map(e=>e.message),[]);
});

test('cancelled fixtures and teams outside the chosen scope do not create a warning',async t=>{
 const h=await setup(t);assert.equal(h.window.eval("seAvailabilityMatchHint(selectionState.data,'2099-11-14',[{name:'Unrelated team'}])"),'');
 h.window.eval('selectionState.data.fixtures[0].details.cancelled=true');await h.click('#seSetAvailabilityDate');assert.equal(h.document.getElementById('seBulkMatchHint').hidden,true);
});
