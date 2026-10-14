import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const {createSelectionRoom,selectionCallLink,selectionRoomGeometry}=await import('../Website_Files/selection-room.js');
const dom=new JSDOM('<main id="app"><section id="sePage"><input id="boardInput"></section></main>',{url:'https://clubbatting.com/app.html',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,MutationObserver:dom.window.MutationObserver});
const tick=()=>new Promise(r=>setTimeout(r,5));
async function until(f){for(let i=0;i<200;i++){if(f())return;await tick();}throw Error('Timed out');}
for(const url of ['https://meet.google.com/abc-defg-hij','https://teams.microsoft.com/l/meetup-join/abc','https://club.zoom.us/j/123?pwd=abc'])assert.equal(selectionCallLink(url),url);
for(const url of ['javascript:alert(1)','https://meet.google.com.evil.test/a','https://user@meet.google.com/a','https://evil.test/','https://meet.google.com\\@evil.test/a','https://zoom.us:8443/j/123'])assert.throws(()=>selectionCallLink(url));
assert.equal(selectionCallLink(''), '');
// Typical laptop windows, browser zoom, and a phone with its keyboard open.
for(const [width,height,left,top] of [[1366,768,0,0],[1280,600,0,0],[1093,614,0,0],[911,512,0,0],[900,400,0,0],[390,320,0,180],[320,568,0,0],[700,450,120,90]]){
 for(const docked of [true,false]){const box=selectionRoomGeometry({width,height,left,top},docked);assert.ok(box.left>=left&&box.top>=top);assert.ok(box.left+box.width<=left+width);assert.ok(box.top+box.height<=top+height);assert.ok(box.width>0&&box.height>0);}
}
for(const [width,height] of [[1366,768],[911,512],[390,560]]){
 for(const docked of [true,false]){const box=selectionRoomGeometry({width,height,insetTop:145},docked);assert.ok(box.top>=153,'Room header clears the demo toolbar');assert.ok(box.top+box.height<=height);}
}
let scope={key:'selector:club',user_id:'selector',club_id:'club',club_name:'Test club',timezone:'Australia/Sydney'},ready=true,posts=[],messages=[],revision=0,backup='',failPost=true,joinCount=0,destroyCount=0,frame,joinDelay,failExpired=false,joinFailure=null,destroyDelay=null;
const videoRequests=[];
let roster={local:{local:true,user_name:'Selector',session_id:'local'}},rosterUnavailable=false;
let refreshCallback;
const originalInterval=globalThis.setInterval;
globalThis.setInterval=(fn,ms,...args)=>{if(ms===3000){refreshCallback=fn;return originalInterval(()=>{},60000);}return originalInterval(fn,ms,...args);};
const q=key=>document.querySelector('[data-sr="'+key+'"]');
const room=createSelectionRoom({
 scope:()=>scope,
 rpc:async(_,action,data)=>{
  if(action==='context')return {messages:structuredClone(messages),has_older:false,can_manage:true,backup_url:backup,revision};
  if(action==='post'){posts.push(structuredClone(data));if(!messages.some(m=>m.request_id===data.request_id))messages.push({id:String(messages.length+1),request_id:data.request_id,author_name:'<img src=x onerror=alert(1)>',body:data.body,created_at:new Date().toISOString()});if(failPost){failPost=false;throw Error('Network interrupted after commit');}return {message:messages.at(-1)};}
  if(action==='save_backup'){assert.equal(data.revision,revision);backup=data.url;revision++;return {backup_url:backup,revision};}
 },
 video:async(_,action,data)=>{if(action==='status')return {available:ready};joinCount++;videoRequests.push(data.request_id);if(joinDelay)await joinDelay;if(failExpired){failExpired=false;throw Error('This call has ended. Join a new call');}return {url:'https://test.daily.co/cb-test',token:'private-token',expires_at:new Date(Date.now()+3600000).toISOString(),user_name:'Selector'};},
 loadDaily:async()=>({createFrame(container){const iframe=document.createElement('iframe');container.append(iframe);frame={handlers:{},on(e,fn){this.handlers[e]=fn;return this;},async join(){if(joinFailure)return joinFailure(this);this.handlers['joined-meeting']();},participants(){if(rosterUnavailable)throw Error('Unavailable');return roster;},async destroy(){destroyCount++;await destroyDelay;iframe.remove();},iframe};return frame;}})
});
try{
 await room.open();assert.equal(room.isOpen(),true);assert.equal(q('join').hidden,false);assert.equal(q('presence').hidden,true,'Do not claim the call is empty before joining');
 const draft='Keep this draft <script>bad()</script>';q('message').value=draft;q('message').dispatchEvent(new window.Event('input'));
 refreshCallback();await tick();assert.equal(q('message').value,draft,'Polling preserves draft');
 q('send').click();await until(()=>q('send').textContent==='Retry send');assert.equal(q('message').disabled,true);assert.ok(q('sendStatus').textContent.includes('not confirmed'));
 q('send').click();await until(()=>q('sendStatus').textContent==='Sent');assert.equal(posts[0].request_id,posts[1].request_id,'Retry is exactly the same request');assert.equal(document.querySelectorAll('.sr-message').length,1);assert.equal(q('message').value,'');assert.equal(document.querySelector('.sr-message img'),null);assert.equal(document.querySelector('.sr-message script'),null);
 q('editBackup').click();q('backupUrl').value='https://meet.google.com/abc-defg-hij';q('saveBackup').click();await until(()=>q('backupForm').hidden);assert.equal(q('backupLink').href,backup);assert.equal(q('backupStatus').textContent,'Backup call saved.');
 q('join').click();await until(()=>q('subtitle').textContent.startsWith('In video'));const initialFrame=frame.iframe;
 assert.equal(q('callPresence').textContent,'Only you are in the call.');assert.equal(q('people').hidden,true);
 roster.other={local:false,user_name:'Alex',session_id:'other'};frame.handlers['participant-joined']();
 assert.equal(q('callPresence').textContent,'In this call · 2');assert.deepEqual([...q('people').children].map(n=>n.textContent),['You','Alex']);
 roster.other.user_name='<img src=x onerror=alert(1)>';frame.handlers['participant-updated']();assert.equal(q('people').querySelector('img'),null,'Participant names are text, never HTML');
 rosterUnavailable=true;frame.handlers['participant-updated']();assert.match(q('callPresence').textContent,/unavailable/);assert.equal(q('people').children.length,0);
 rosterUnavailable=false;frame.handlers['participant-updated']();assert.equal(q('callPresence').textContent,'In this call · 2','Participant list recovers even when names are unchanged');
 delete roster.other;frame.handlers['participant-left']();assert.equal(q('callPresence').textContent,'Only you are in the call.');
 q('layout').click();assert.equal(q('layout').textContent,'Board + video');assert.equal(document.body.classList.contains('sr-docked'),false);assert.equal(initialFrame.isConnected,true);
 q('layout').click();assert.equal(q('layout').textContent,'Expand video');assert.equal(document.body.classList.contains('sr-docked'),true);assert.equal(initialFrame.isConnected,true,'Changing layout keeps the existing call');
 const viewport=Object.assign(new window.EventTarget(),{width:1093,height:614,offsetLeft:0,offsetTop:0});Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});window.dispatchEvent(new window.Event('resize'));await until(()=>document.querySelector('.sr-room').classList.contains('sr-short'));
 const panel=document.querySelector('.sr-room');assert.ok(parseFloat(panel.style.top)+parseFloat(panel.style.height)<=614);assert.ok(parseFloat(panel.style.left)+parseFloat(panel.style.width)<=1093);assert.equal(initialFrame.isConnected,true,'Resizing preserves the call iframe');
 delete window.visualViewport;window.dispatchEvent(new window.Event('resize'));await until(()=>!panel.classList.contains('sr-short'));
 q('message').value='Call stays connected';q('message').dispatchEvent(new window.Event('input'));
 document.getElementById('app').innerHTML='<section id="sePage">Updated board</section>';await tick();assert.equal(frame.iframe,initialFrame);assert.equal(initialFrame.isConnected,true);assert.equal(destroyCount,0);assert.equal(q('message').value,'Call stays connected');
 q('toggle').click();assert.equal(initialFrame.isConnected,true);assert.equal(q('toggle').textContent,'Show room');q('toggle').click();assert.equal(q('toggle').textContent,'Hide room');
 window.confirm=()=>false;assert.equal(room.close(),false);assert.equal(initialFrame.isConnected,true);
 q('leave').click();assert.equal(initialFrame.isConnected,false);assert.equal(q('videoStatus').textContent,'You left the call.');assert.equal(q('presence').hidden,true);assert.equal(q('people').children.length,0);frame.handlers['participant-joined']();assert.equal(q('presence').hidden,true,'Late participant events cannot restore a call after leaving');
 ready=false;q('checkVideo').click();await tick();assert.equal(q('join').hidden,true);assert.match(q('videoStatus').textContent,/not connected/);ready=true;q('checkVideo').click();await tick();
 failExpired=true;q('join').click();await until(()=>q('videoStatus').textContent.includes('call has ended'));q('join').click();await until(()=>q('subtitle').textContent.startsWith('In video'));q('leave').click();
 // Late token responses cannot create a call after the user leaves.
 let resolveJoin;joinDelay=new Promise(r=>resolveJoin=r);q('join').click();await until(()=>joinCount===4);q('leave').click();resolveJoin();await tick();assert.equal(document.querySelector('.sr-video iframe'),null);joinDelay=null;
 // A real Daily failure emits error, then left-meeting, and can reject with a string.
 // Keep its explanation and preview visible instead of briefly flashing and closing.
 joinFailure=async call=>{call.handlers.error({errorMsg:'Daily could not open the room.',error:{type:'not-allowed'}});call.handlers['left-meeting']();throw 'Daily could not open the room.';};
 q('join').click();await until(()=>q('videoStatus').textContent.includes('Daily could not open the room.'));
 const failedFrame=frame.iframe,failedRequest=videoRequests.at(-1);
 assert.equal(failedFrame.isConnected,true);assert.equal(q('video').hidden,false);assert.equal(q('join').textContent,'Retry video');assert.equal(q('join').disabled,false);assert.equal(q('presence').hidden,true,'Fatal errors clear connected presence');
 const realNow=Date.now;try{Date.now=()=>realNow()+31000;refreshCallback();await tick();}finally{Date.now=realNow;}
 assert.match(q('videoStatus').textContent,/Daily could not open the room/,'Polling must not replace the error with Video ready');
 let finishDestroy;destroyDelay=new Promise(resolve=>finishDestroy=resolve);joinFailure=null;q('join').click();await tick();
 assert.equal(frame.iframe,failedFrame,'Retry waits for the old Daily instance to finish closing');finishDestroy();destroyDelay=null;
 await until(()=>q('subtitle').textContent.startsWith('In video'));assert.equal(videoRequests.at(-1),failedRequest,'A failed attempt reuses its reserved minutes');assert.equal(failedFrame.isConnected,false);
 frame.handlers['camera-error']({error:{type:'permissions'}});assert.equal(frame.iframe.isConnected,true);assert.match(q('videoStatus').textContent,/camera|microphone/i);q('leave').click();await tick();
 joinFailure=async()=>{throw 'Camera test failed at https://test.daily.co/cb-test?t=private-token';};
 q('join').click();await until(()=>q('videoStatus').textContent.includes('Camera test failed'));
 assert.ok(!q('videoStatus').textContent.includes('private-token'),'Diagnostics must not expose meeting tokens');q('leave').click();joinFailure=null;await tick();
 room.close(true);await room.open();assert.equal(q('message').value,'Call stays connected','Draft survives reopening');
 q('join').click();await until(()=>q('subtitle').textContent.startsWith('In video'));scope=null;document.getElementById('app').innerHTML='Signed out';await until(()=>!room.isOpen());assert.equal(document.querySelector('.sr-room'),null);assert.equal(document.querySelector('iframe'),null);assert.equal(document.body.classList.contains('sr-docked'),false);
 // Parse both entry points, including the embedded demo module and adapter.
 const app=fs.readFileSync(new URL('../Website_Files/app.js',import.meta.url),'utf8');
 assert.ok(app.includes("document.activeElement?.closest('#sePage')"),'Typing in chat must not pause the board refresh');
 const demo=fs.readFileSync(new URL('../Website_Files/demo.html',import.meta.url),'utf8');
 for(const script of demo.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
 console.log('Selection Room UI: call presence, board/video layout switching, access cleanup, retry, XSS, draft retention, board redraw, video cancellation and demo syntax passed.');
}finally{room.close(true);globalThis.setInterval=originalInterval;dom.window.close();}
