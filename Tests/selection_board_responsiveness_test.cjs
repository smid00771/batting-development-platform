const {test}=require('node:test'),assert=require('node:assert/strict'),{openDemo}=require('./helpers/demo_harness.cjs');
test('opening, switching and closing player pickers preserves every team card and makes no request',async t=>{
 const h=await openDemo('selections');t.after(h.close);h.window.scrollBy=()=>{};
 const cards=[...h.document.querySelectorAll('[data-se-team]')],slots=[...h.document.querySelectorAll('[data-se-slot]')];let scans=0;
 const original=h.window.sePickerEligibilityIndex;h.window.sePickerEligibilityIndex=(...args)=>{scans++;return original(...args);};
 const logs=h.window.__fixtureLogs.length;
 slots[0].click();await h.settle();assert.equal(scans,1);assert.equal(h.document.querySelectorAll('#sePicker').length,1);
 assert.equal(h.document.querySelector('[data-se-team]'),cards[0],'Opening a slot must not rebuild the board');
 const input=h.document.getElementById('seSearch');
 for(const value of ['a','al','alex','Alex Morgan','']){input.value=value;input.dispatchEvent(new h.window.Event('input'));}
 assert.equal(scans,1,'Typing filters the same eligibility result');
 await h.choose('#seRoleFilter','pace');assert.equal(scans,2,'Changing eligibility filters rebuilds once');
 slots[2].click();await h.settle();assert.equal(scans,3);assert.equal(h.document.querySelectorAll('#sePicker').length,1);assert.equal(slots[0].getAttribute('aria-expanded'),'false');
 await h.click('[data-se-close-picker]');assert.equal(h.document.getElementById('sePicker'),null);assert.equal(h.document.activeElement,slots[2]);
 assert.deepEqual([...h.document.querySelectorAll('[data-se-team]')],cards);assert.equal(h.window.__fixtureLogs.length,logs,'Picker interactions have no database work');assert.deepEqual(h.errors,[]);
});
test('indexed eligibility retains overlapping games, missing times, names, unavailable dates and two-day choices',async t=>{
 const h=await openDemo('selections');t.after(h.close);const w=h.window;
 const p=(id,name='Player '+id)=>({id,name,active:true,bowling:'pace',availability:{available_dates:['2099-01-01','2099-01-08']}});
 const players=[p('same'),p('other'),p('duplicate','Player same'),p('later'),p('unknown'),p('away')];players[5].availability={available_dates:[]};
 const team=(id,start,slots,extra={})=>({id,details:{grade:id,format:'t20',days:[{date:'2099-01-01',start}],...extra},slots:slots.map(id=>({d1:id,d2:null}))});
 const f=team('target','12:00',['same',null]),data={roster:players,fixtures:[f,team('earlier','09:00',['later']),team('overlap','14:59',['other']),team('unknown','',['unknown']),team('cancelled','12:00',['away'],{cancelled:true})]},a={id:f.id,slot:1,day:0};
 const rows=()=>{const index=w.sePickerEligibilityIndex(f,a,false,data);return new Map(players.map(p=>[p.id,w.sePickerCandidateInfo(p,f,a,false,data,'',index)]));};
 let out=rows();assert.equal(out.get('later').eligible,true);assert.deepEqual(Array.from(out.get('other').reasons,r=>r.code),['selected']);assert.deepEqual(Array.from(out.get('unknown').reasons,r=>r.code),['selected']);assert.deepEqual(Array.from(out.get('duplicate').reasons,r=>r.code),['duplicate']);assert.deepEqual(Array.from(out.get('away').reasons,r=>r.code),['availability']);
 data.fixtures[2].details.days[0].start='15:00';out=rows();assert.equal(out.get('other').eligible,true,'Adjacent T20 remains valid');
 f.details.days.push({date:'2099-01-08',start:'12:00'});f.details.brackets=true;f.slots[0].d2='other';a.day=1;
 out=rows();assert.equal(out.get('same').eligible,true);assert.equal(out.get('other').eligible,false);
 const both=w.sePickerEligibilityIndex(f,a,true,data);assert.equal(w.sePickerCandidateInfo(players[0],f,a,true,data,'',both).eligible,false,'Both days still checks each date');
 players[0].active=false;assert.equal(w.sePickerCandidateInfo(players[0],f,a,false,data).reasons[0].code,'inactive');
});
