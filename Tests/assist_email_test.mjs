import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderAssistNotification} from '../Functions/dispatch-outbox/assist-email.mjs';
import {assistLaunchFromSearch} from '../assist-routing.js';
const thread='11111111-1111-4111-8111-111111111111',club='22222222-2222-4222-8222-222222222222';
test('reply alerts open the same club thread without copying private content',()=>{
 const mail=renderAssistNotification({side:'team',thread_id:thread,club_id:club,body:'PRIVATE BODY',subject:'PRIVATE SUBJECT',guide_context:'PRIVATE GUIDE'},'https://clubbatting.com/');
 assert.doesNotMatch(mail.html+mail.text,/PRIVATE/);
 const url=new URL(mail.text.match(/Open conversation: (\S+)/)[1]);
 assert.equal(url.pathname,'/app.html');assert.equal(url.searchParams.get('club'),club);
 assert.equal(url.searchParams.get('tab'),'assist');assert.equal(url.searchParams.get('assist_thread'),thread);
 assert.deepEqual(assistLaunchFromSearch(url.search),{platform:false,threadId:thread});
 assert.match(mail.text,/Direct email replies go to our support inbox/);
});
test('staff alerts open the platform inbox, not a requester identity',()=>{
 const mail=renderAssistNotification({side:'club',thread_id:thread,club_id:club},'https://clubbatting.com/');
 const url=new URL(mail.text.match(/Open conversation: (\S+)/)[1]);
 assert.equal(url.searchParams.get('platform'),'1');assert.equal(url.searchParams.get('club'),null);
 assert.deepEqual(assistLaunchFromSearch(url.search),{platform:true,threadId:thread});
});
test('invalid notification identities and insecure destinations cannot produce mail',()=>{
 for(const data of [{side:'team',thread_id:'bad',club_id:club},{side:'other',thread_id:thread},{side:'team',thread_id:thread,club_id:'bad'}])assert.throws(()=>renderAssistNotification(data,'https://clubbatting.com/'));
 assert.throws(()=>renderAssistNotification({side:'club',thread_id:thread},'http://clubbatting.com/'));
 assert.equal(assistLaunchFromSearch('?tab=teams&assist_thread='+thread),null);
 assert.deepEqual(assistLaunchFromSearch('?tab=assist&assist_thread=bad'),{platform:false,threadId:null});
});
