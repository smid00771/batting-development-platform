import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSelectionRoom} from '../selection-room.js';
test('slow chat reads never queue; failures back off and explicit reconnect recovers the draft',async()=>{
 const dom=new JSDOM('<main id="app"></main>',{url:'https://example.test',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,MutationObserver:dom.window.MutationObserver});
 const interval=globalThis.setInterval,clear=globalThis.clearInterval;let poll,reads=0,statuses=0,resolve,fail=false;
 globalThis.setInterval=(fn,ms)=>{if(ms===3000)poll=fn;return 1;};globalThis.clearInterval=()=>{};
 const scope={key:'u:c',user_id:'u',club_id:'c',club_name:'Test'},q=k=>document.querySelector('[data-sr="'+k+'"]'),settle=()=>new Promise(setImmediate);
 const room=createSelectionRoom({scope:()=>scope,rpc:async()=>{reads++;if(fail)throw Error('Timeout');return new Promise(r=>resolve=r);},video:async()=>{statuses++;return {available:false};}});
 try{
  const opening=room.open();assert.equal(reads,1);for(let i=0;i<12;i++)poll();assert.equal(reads,1);
  q('message').value='Keep my selection notes';q('message').dispatchEvent(new window.Event('input'));
  resolve({messages:[],can_post:true});await opening;await settle();assert.equal(reads,1,'No queued read runs after the slow request finishes');
  fail=true;poll();await settle();assert.equal(reads,2);for(let i=0;i<12;i++)poll();assert.equal(reads,2,'Failed reads back off');assert.equal(q('retry').hidden,false);assert.equal(q('message').value,'Keep my selection notes');
  fail=false;q('retry').click();assert.equal(reads,3,'Explicit reconnect ignores backoff');resolve({messages:[{id:'1',body:'Connected',author_name:'Selector',created_at:new Date().toISOString()}],can_post:true});await settle();
  assert.equal(q('retry').hidden,true);assert.match(q('messages').textContent,/Connected/);assert.equal(q('message').value,'Keep my selection notes');assert.equal(statuses,1,'Chat polling does not recalculate call status or credit');
 }finally{room.close(true);globalThis.setInterval=interval;globalThis.clearInterval=clear;dom.window.close();}
});
