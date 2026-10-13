import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const {createSelectionRoom,selectionCallLink}=await import('../Website_Files/selection-room.js');
const dom=new JSDOM('<main id="app"><section id="sePage"><input id="boardInput"></section></main>',{url:'https://clubbatting.com/app.html'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,MutationObserver:dom.window.MutationObserver});
const tick=()=>new Promise(r=>setTimeout(r,5));
async function until(f){for(let i=0;i<200;i++){if(f())return;await tick();}throw Error('Timed out');}
for(const url of ['https://meet.google.com/abc-defg-hij','https://teams.microsoft.com/l/meetup-join/abc','https://club.zoom.us/j/123?pwd=abc'])assert.equal(selectionCallLink(url),url);
for(const url of ['javascript:alert(1)','https://meet.google.com.evil.test/a','https://user@meet.google.com/a','https://evil.test/','https://meet.google.com\\@evil.test/a','https://zoom.us:8443/j/123'])assert.throws(()=>selectionCallLink(url));
assert.equal(selectionCallLink(''), '');
let scope={key:'selector:club',user_id:'selector',club_id:'club',club_name:'Test club',timezone:'Australia/Sydney'},ready=true,posts=[],messages=[],revision=0,backup='',failPost=true,joinCount=0,destroyCount=0,frame,joinDelay,failExpired=false;
let refreshCallback;
const originalInterval=globalThis.setInterval;
globalThis.setInterval=fn=>{refreshCallback=fn;return originalInterval(()=>{},60000);};
const q=key=>document.querySelector('[data-sr="'+key+'"]');
const room=createSelectionRoom({
 scope:()=>scope,
 rpc:async(_,action,data)=>{
  if(action==='context')return {messages:structuredClone(messages),has_older:false,can_manage:true,backup_url:backup,revision};
  if(action==='post'){posts.push(structuredClone(data));if(!messages.some(m=>m.request_id===data.request_id))messages.push({id:String(messages.length+1),request_id:data.request_id,author_name:'<img src=x onerror=alert(1)>',body:data.body,created_at:new Date().toISOString()});if(failPost){failPost=false;throw Error('Network interrupted after commit');}return {message:messages.at(-1)};}
  if(action==='save_backup'){assert.equal(data.revision,revision);backup=data.url;revision++;return {backup_url:backup,revision};}
 },
 video:async(_,action,data)=>{if(action==='status')return {available:ready};joinCount++;if(joinDelay)await joinDelay;if(failExpired){failExpired=false;throw Error('This call has ended. Join a new call');}return {url:'https://test.daily.co/cb-test',token:'private-token',expires_at:new Date(Date.now()+3600000).toISOString(),user_name:'Selector'};},
 loadDaily:async()=>({createFrame(container){const iframe=document.createElement('iframe');container.append(iframe);frame={handlers:{},on(e,fn){this.handlers[e]=fn;return this;},async join(){this.handlers['joined-meeting']();},destroy(){destroyCount++;iframe.remove();},iframe};return frame;}})
});
try{
 await room.open();assert.equal(room.isOpen(),true);assert.equal(q('join').hidden,false);
 const draft='Keep this draft <script>bad()</script>';q('message').value=draft;q('message').dispatchEvent(new window.Event('input'));
 refreshCallback();await tick();assert.equal(q('message').value,draft,'Polling preserves draft');
 q('send').click();await until(()=>q('send').textContent==='Retry send');assert.equal(q('message').disabled,true);assert.ok(q('sendStatus').textContent.includes('not confirmed'));
 q('send').click();await until(()=>q('sendStatus').textContent==='Sent');assert.equal(posts[0].request_id,posts[1].request_id,'Retry is exactly the same request');assert.equal(document.querySelectorAll('.sr-message').length,1);assert.equal(q('message').value,'');assert.equal(document.querySelector('.sr-message img'),null);assert.equal(document.querySelector('.sr-message script'),null);
 q('editBackup').click();q('backupUrl').value='https://meet.google.com/abc-defg-hij';q('saveBackup').click();await until(()=>q('backupForm').hidden);assert.equal(q('backupLink').href,backup);assert.equal(q('backupStatus').textContent,'Backup call saved.');
 q('join').click();await until(()=>q('subtitle').textContent.startsWith('In video'));const initialFrame=frame.iframe;
 q('message').value='Call stays connected';q('message').dispatchEvent(new window.Event('input'));
 document.getElementById('app').innerHTML='<section id="sePage">Updated board</section>';await tick();assert.equal(frame.iframe,initialFrame);assert.equal(initialFrame.isConnected,true);assert.equal(destroyCount,0);assert.equal(q('message').value,'Call stays connected');
 q('toggle').click();assert.equal(initialFrame.isConnected,true);assert.equal(q('toggle').textContent,'Show room');q('toggle').click();assert.equal(q('toggle').textContent,'Show board');
 window.confirm=()=>false;assert.equal(room.close(),false);assert.equal(initialFrame.isConnected,true);
 q('leave').click();assert.equal(initialFrame.isConnected,false);assert.equal(q('videoStatus').textContent,'You left the call.');
 ready=false;q('checkVideo').click();await tick();assert.equal(q('join').hidden,true);assert.match(q('videoStatus').textContent,/not connected/);ready=true;q('checkVideo').click();await tick();
 failExpired=true;q('join').click();await until(()=>q('videoStatus').textContent.includes('call has ended'));q('join').click();await until(()=>q('subtitle').textContent.startsWith('In video'));q('leave').click();
 // Late token responses cannot create a call after the user leaves.
 let resolveJoin;joinDelay=new Promise(r=>resolveJoin=r);q('join').click();await until(()=>joinCount===4);q('leave').click();resolveJoin();await tick();assert.equal(document.querySelector('.sr-video iframe'),null);joinDelay=null;
 room.close(true);await room.open();assert.equal(q('message').value,'Call stays connected','Draft survives reopening');
 q('join').click();await until(()=>q('subtitle').textContent.startsWith('In video'));scope=null;document.getElementById('app').innerHTML='Signed out';await until(()=>!room.isOpen());assert.equal(document.querySelector('.sr-room'),null);assert.equal(document.querySelector('iframe'),null);
 // Parse both entry points, including the embedded demo module and adapter.
 const app=fs.readFileSync(new URL('../Website_Files/app.js',import.meta.url),'utf8');
 assert.ok(app.includes("document.activeElement?.closest('#sePage')"),'Typing in chat must not pause the board refresh');
 const demo=fs.readFileSync(new URL('../Website_Files/demo.html',import.meta.url),'utf8');
 for(const script of demo.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
 console.log('Selection Room UI: access cleanup, retry, XSS, draft retention, board redraw, video cancellation and demo syntax passed.');
}finally{room.close(true);globalThis.setInterval=originalInterval;dom.window.close();}
