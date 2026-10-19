import {test} from 'node:test';
import assert from 'node:assert/strict';
import {availability,missingAvailability,replacementOptions,startWithdrawal,replaceInPlan,changedTeams,forecast,shareLink} from '../club-week.js';
import {renderCalendar,createCalendarHandler} from '../Functions/selection-calendar/calendar.mjs';
const dates=['2026-10-24','2026-10-31'];
const person=(id,extra={})=>({id,name:id,active:true,batting:'top',bowling:'pace',bowling_load:'frontline',availability:{available_dates:dates,unavailable_dates:[]},...extra});
const team=(id,people)=>({id,revision:1,details:{grade:id,format:'long_form',brackets:true,days:dates.map(date=>({date}))},slots:Array.from({length:11},(_,i)=>({d1:people[i]||null,d2:people[i]||null}))});
test('explicit unavailability is never chased; unset dates alone need replies',()=>{
 const p=person('a',{availability:{available_dates:[dates[0]],unavailable_dates:[dates[1]]}});
 assert.equal(availability(p,dates[1]),'unavailable');assert.deepEqual(missingAvailability([p],dates),[]);
 assert.deepEqual(missingAvailability([person('b',{availability:{}})],dates)[0].missing,dates);
});
test('a replacement chain leaves the correct vacancy and preserves a bracket partner',()=>{
 const fixtures=[team('1s',['a']),team('2s',['b']),team('3s',['c'])],roster=['a','b','c'].map(id=>person(id));
 const start=startWithdrawal(fixtures,'1s','a',[0]);
 const second=replaceInPlan({fixtures:start,roster,fixtureId:'1s',slot:0,days:[0],playerId:'b'});
 assert.deepEqual(second[0].slots[0],{d1:'b',d2:'a'});assert.deepEqual(second[1].slots[0],{d1:null,d2:'b'});
 const third=replaceInPlan({fixtures:second,roster,fixtureId:'2s',slot:0,days:[0],playerId:'c'});
 assert.equal(third[2].slots[0].d1,null);assert.equal(third[2].slots[0].d2,'c');
 assert.equal(changedTeams(fixtures,third).length,3);assert.equal(fixtures[0].slots[0].d1,'a');
});
test('role ranking makes bowling differences explicit and checks every required date',()=>{
 const fixtures=[team('1s',['a']),team('2s',['b'])],roster=[person('a'),person('b'),person('spinner',{bowling:'spin'}),person('unset',{bowling:'unknown'}),person('partial',{availability:{available_dates:[dates[0]]}})];
 const options=replacementOptions({fixtures,roster,fixtureId:'1s',slot:0,days:[0,1],incumbentId:'a'});
 assert.equal(options[0].person.id,'b');assert.equal(options[0].from.length,2);
 assert.ok(options.find(x=>x.person.id==='spinner').differences.includes('Different bowling type'));
 assert.ok(options.find(x=>x.person.id==='unset').differences.includes('Bowling type not set'));
 assert.ok(!options.some(x=>x.person.id==='partial'));
 assert.throws(()=>replaceInPlan({fixtures,roster,fixtureId:'1s',slot:0,days:[0,1],playerId:'partial'}),/available/);
});
test('forecast distinguishes unanswered dates from unavailable players',()=>{
 const rows=forecast([person('a'),person('b',{availability:{}}),person('c',{availability:{unavailable_dates:dates}})],[team('1s',['a'])],dates[0]);
 assert.deepEqual([rows[0].available,rows[0].unset,rows[0].unavailable],[1,1,1]);
});
test('shared links point to the chosen task with no calendar credential',()=>{
 const u=new URL(shareLink('https://clubbatting.com','club',{view:'availability',date:dates[0]}));
 assert.equal(u.searchParams.get('team_date'),dates[0]);assert.equal(u.searchParams.get('team_view'),'availability');assert.equal(u.searchParams.has('token'),false);
});
test('calendar escaping, stable UIDs, cancellation and UTF-8 folding',()=>{
 const row={uid:'same-uid',sequence:3,updated_at:'2026-10-19T01:00:00Z',event:{date:dates[0],title:'A, B; C\nBEGIN:bad',ground:'é'.repeat(100),status:'CANCELLED',url:'https://clubbatting.com/app.html?club=x'}};
 const ics=renderCalendar({name:'Cricket',events:[row]});
 assert.match(ics,/UID:same-uid\r\n/);assert.match(ics,/SEQUENCE:3/);assert.match(ics,/STATUS:CANCELLED/);
 assert.match(ics,/DTEND;VALUE=DATE:20261025/);assert.match(ics,/SUMMARY:A\\, B\\; C\\nBEGIN:bad/);
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 const updated=renderCalendar({name:'Cricket',events:[{...row,sequence:4,event:{...row.event,date:dates[1],start:'20261031T020000Z',status:'CONFIRMED'}}]});
 assert.match(updated,/UID:same-uid/);assert.match(updated,/DTSTART:20261031T020000Z/);assert.doesNotMatch(updated,/20261024/);
});
test('calendar endpoint fails closed and never leaks a lookup failure',async()=>{
 let calls=0;const handler=createCalendarHandler({feed:async()=>{calls++;return null;}});
 assert.equal((await handler(new Request('https://example.test?token=no'))).status,404);assert.equal(calls,0);
 assert.equal((await handler(new Request('https://example.test?token='+'a'.repeat(64)))).status,404);
 const fail=createCalendarHandler({feed:async()=>{throw Error('secret details');}});
 const response=await fail(new Request('https://example.test?token='+'a'.repeat(64)));
 assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret/);
});
