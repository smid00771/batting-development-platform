import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const {createSelectionRoom}=await import('../selection-room.js');
const dom=new JSDOM('<main id="app"><nav class="nav"></nav><section id="sePage"></section></main>',{url:'https://clubbatting.com/app.html',pretendToBeVisual:true});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,MutationObserver:dom.window.MutationObserver});
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await tick();}throw Error('Timed out');}
const originalInterval=globalThis.setInterval;let poll;
globalThis.setInterval=(fn,ms,...args)=>{if(ms===3000){poll=fn;return originalInterval(()=>{},60000);}return originalInterval(fn,ms,...args);};
const scope={key:'selector:chat-test',user_id:'selector',club_id:'chat-test',club_name:'Synthetic club',timezone:'Australia/Sydney'};
let session='waiting',active=null,messages=[],id=0,frame,postHold,resolvePost,contextHold,resolveContext,afterPost;
const requests=[];
const comment=body=>({id:String(++id),body,author_name:'Selector',created_at:new Date().toISOString()});
function startCall(){session='call:'+crypto.randomUUID();messages=[];active={mode:'audio',expires_at:new Date(Date.now()+3600000).toISOString()};}
const room=createSelectionRoom({
 scope:()=>scope,
 rpc:async(_,action,data)=>{
  if(action==='context'){
   const result={chat_session:session,active_call:active,messages:structuredClone(messages.filter(m=>!data.after||BigInt(m.id)>BigInt(data.after))),has_older:false,can_manage:false};
   if(contextHold){contextHold=false;await new Promise(resolve=>{resolveContext=resolve;});}return result;
  }
  if(action==='post'){
   requests.push(structuredClone(data));
   if(data.chat_session!==session)throw Object.assign(Error('Chat ended'),{code:'P0230'});
   let message=messages.find(m=>m.request_id===data.request_id);
   if(!message){message={...comment(data.body),request_id:data.request_id};messages.push(message);}
   const result={message:structuredClone(message),chat_session:session};
   if(postHold){postHold=false;await new Promise(resolve=>{resolvePost=resolve;});}
   if(afterPost){const action=afterPost;afterPost=null;action();}return result;
  }
 },
 video:async(_,action)=>{if(action==='status')return {available:true,active_call:active};if(!active)startCall();return {url:'https://test.daily.co/cb-chat',token:'mock-token',user_name:'Selector',expires_at:active.expires_at,call_mode:active.mode};},
 loadDaily:async()=>({createFrame(container){const iframe=document.createElement('iframe');container.append(iframe);frame={handlers:{},on(event,fn){this.handlers[event]=fn;return this;},async join(){this.handlers['joined-meeting']();},participants(){return {local:{local:true,user_name:'Selector'}};},setLocalVideo(){},localAudio(){return true;},async destroy(){iframe.remove();}};return frame;}})
});
const q=key=>document.querySelector('[data-sr="'+key+'"]');
const rows=()=>[...document.querySelectorAll('.sr-message p')].map(n=>n.textContent);
function write(body){q('message').value=body;q('message').dispatchEvent(new window.Event('input'));}
try{
 messages=[comment('Before the call')];await room.open();assert.deepEqual(rows(),['Before the call']);assert.equal(q('older'),null,'No old-chat history control');
 // Even a context response already in flight cannot prevent a join from refreshing the session.
 contextHold=true;poll();await until(()=>resolveContext);q('join').click();await until(()=>frame&&q('subtitle').textContent.includes(' in call'));resolveContext();await until(()=>rows().length===0);
 assert.equal(q('empty').hidden,false,'New call opens with an empty chat');
 write('Current call');q('send').click();await until(()=>q('sendStatus').textContent==='Sent');assert.deepEqual(rows(),['Current call']);assert.equal(requests.at(-1).chat_session,session);
 q('leave').click();await tick();poll();await tick();assert.deepEqual(rows(),['Current call'],'One person leaving cannot discard an ongoing call for others');
 q('join').click();await until(()=>q('subtitle').textContent.includes(' in call'));assert.deepEqual(rows(),['Current call'],'Reconnect to the same room preserves current comments');
 write('Same-call draft');room.close(true);await room.open();assert.equal(q('message').value,'Same-call draft','Same-call draft survives reopening');
 // A response for an old call arriving late must never reinsert its comment.
 postHold=true;write('Old in-flight comment');q('send').click();await until(()=>resolvePost);startCall();poll();await until(()=>rows().length===0);assert.equal(q('message').value,'');resolvePost();await until(()=>q('send').disabled);await tick();assert.deepEqual(rows(),[]);
 write('New call comment');q('send').click();await until(()=>q('sendStatus').textContent==='Sent');assert.deepEqual(rows(),['New call comment']);
 // Expiry removes displayed rows and saved drafts across close/reopen.
 write('Draft from finished call');session='after:'+session.slice(5);active=null;messages=[];room.close(true);await room.open();assert.deepEqual(rows(),[]);assert.equal(q('message').value,'');
 assert.equal(JSON.parse(sessionStorage.getItem('selection-room-draft-'+scope.key)).pending,null);
 // Server-side stale-session rejection is quiet and cannot leave an endless retry button.
 startCall();write('Stale send');q('send').click();await until(()=>q('send').textContent==='Send'&&q('message').value==='');assert.deepEqual(rows(),[]);assert.equal(messages.length,0);
 assert.equal(q('older'),null);assert.ok(!document.querySelector('.sr-chat-heading').textContent.includes('Earlier'));
 console.log('Temporary selection chat: new calls, same-call reconnects, late responses, expired drafts, stale sends and no history control passed.');
}finally{room.close(true);globalThis.setInterval=originalInterval;dom.window.close();}
