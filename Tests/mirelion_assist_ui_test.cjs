const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function setup(){
 const dom=new JSDOM('<main id="host"></main>',{pretendToBeVisual:true}),document=dom.window.document;
 let context={userId:'a',clubId:'club',name:'Alice',clubName:'Test Club'},handler;
 const calls=[],badges=[];
 const c=vm.createContext({document,crypto:webcrypto,setTimeout,clearTimeout,alert(){},console,Date,Map,Set,Error,JSON,Number,String,Math});
 vm.runInContext(fs.readFileSync('mirelion-assist-demo.js','utf8').replace(/^export /gm,'')+'\n'+fs.readFileSync('mirelion-assist.js','utf8').replace(/^export /gm,''),c);
 const demo=c.createMirelionAssistDemo(()=>context);
 handler=(name,args)=>demo.rpc(name,args);
 const api=c.createMirelionAssist({supabase:{rpc:async(name,args)=>{calls.push(structuredClone(args));return handler(name,args);}},getContext:()=>context,onUnread:(n,c)=>badges.push({n,c}),demo:false});
 const host=document.getElementById('host');
 const input=(name,value)=>{const f=host.querySelector('[data-assist-compose]'),e=f.elements[name];e.value=value;f.oninput();};
 const click=async sel=>{const b=host.querySelector(sel);assert.ok(b,sel);b.click();await settle();};
 const create=async()=>{await api.mount(host);input('subject','Help for our club');input('body','Could we adjust this?');await click('[data-assist-send]');};
 return {api,dom,document,host,calls,badges,input,click,create,demo,context:()=>context,setContext:x=>context=x,setHandler:f=>handler=f,close(){api.reset();dom.window.close();}};
}
test('two-way replies, unread badges, resolve and reopening use the same stored conversation',async t=>{
 const h=setup();t.after(()=>h.close());await h.create();assert.equal(h.host.querySelectorAll('[data-assist-message]').length,1);
 const id=h.calls.find(c=>c.p_action==='create');assert.equal(id.p_data.club_id,'club');
 const thread=h.host.querySelector('[data-assist-thread]').dataset.assistThread;
 await h.demo.rpc('mirelion_assist',{p_action:'example_reply',p_data:{club_id:'club',thread_id:thread}});
 await h.api.unread();assert.equal(h.badges.at(-1).n,1);await h.api.refresh();assert.equal(h.host.querySelectorAll('[data-assist-message]').length,2);assert.equal(h.badges.at(-1).n,0);
 await h.click('[data-assist-resolve]');assert.equal(h.host.querySelector('[data-assist-filter]').value,'resolved');assert.match(h.host.textContent,/Resolved/);
 h.input('body','A follow-up');await h.click('[data-assist-send]');assert.equal(h.host.querySelector('[data-assist-filter]').value,'open');assert.equal(h.host.querySelectorAll('[data-assist-message]').length,3);
 assert.equal(h.host.querySelector('a[href^="mailto:"]').getAttribute('href'),'mailto:support@mirelionhq.com');
});
test('refresh preserves unsent text, focus and cursor while appending a reply',async t=>{
 const h=setup();t.after(()=>h.close());await h.create();h.input('body','Still typing my request');
 const box=h.host.querySelector('textarea');box.focus();box.setSelectionRange(5,5);
 const thread=h.host.querySelector('[data-assist-thread]').dataset.assistThread;
 await h.demo.rpc('mirelion_assist',{p_action:'example_reply',p_data:{club_id:'club',thread_id:thread}});
 await h.api.refresh();assert.equal(h.host.querySelector('textarea'),box);assert.equal(box.value,'Still typing my request');assert.equal(h.document.activeElement,box);assert.equal(box.selectionStart,5);
});
test('lost response retries the same command without duplicating a message',async t=>{
 const h=setup();t.after(()=>h.close());await h.api.mount(h.host);h.input('subject','Retry');h.input('body','Keep this draft');let lost=true;
 h.setHandler(async(name,args)=>{const r=await h.demo.rpc(name,args);if(args.p_action==='create'&&lost){lost=false;throw Error('Connection lost');}return r;});
 await h.click('[data-assist-send]');assert.equal(h.host.querySelector('textarea').value,'Keep this draft');assert.equal(h.host.querySelector('textarea').disabled,true);assert.match(h.host.textContent,/Retry sending/);
 await h.click('[data-assist-send]');const sends=h.calls.filter(c=>c.p_action==='create');assert.equal(sends.length,2);assert.deepEqual(sends[0],sends[1]);assert.equal(h.host.querySelectorAll('[data-assist-message]').length,1);assert.equal(h.host.querySelector('textarea').value,'');
});
test('a confirmed rejection releases editing and keeps the draft',async t=>{
 const h=setup();t.after(()=>h.close());await h.api.mount(h.host);h.input('subject','Edit after error');h.input('body','Unsent');
 h.setHandler(async(name,args)=>args.p_action==='create'?{error:{code:'P0001',message:'Please wait a moment.'}}:h.demo.rpc(name,args));
 await h.click('[data-assist-send]');assert.equal(h.host.querySelector('textarea').disabled,false);assert.equal(h.host.querySelector('textarea').value,'Unsent');assert.match(h.host.textContent,/Please wait/);
});
test('an uncertain resolve offers a working idempotent status retry',async t=>{
 const h=setup();t.after(()=>h.close());await h.create();let lost=true;
 h.setHandler(async(name,args)=>{const r=await h.demo.rpc(name,args);if(args.p_action==='status'&&lost){lost=false;throw Error('Connection lost');}return r;});
 await h.click('[data-assist-resolve]');assert.equal(h.host.querySelector('[data-assist-resolve]').textContent,'Retry status change');assert.equal(h.host.querySelector('[data-assist-resolve]').disabled,false);
 await h.click('[data-assist-resolve]');assert.equal(h.host.querySelector('[data-assist-filter]').value,'resolved');const actions=h.calls.filter(c=>c.p_action==='status');assert.equal(actions.length,2);assert.deepEqual(actions[0],actions[1]);
});
test('HTML in a message is rendered as text',async t=>{
 const h=setup();t.after(()=>h.close());await h.api.mount(h.host);h.input('subject','<img src=x onerror=alert(1)>');h.input('body','<script>bad()</script>');await h.click('[data-assist-send]');assert.equal(h.host.querySelector('script,img'),null);assert.match(h.host.textContent,/<script>bad/);
});
test('stale loads cannot replace another screen or a different club',async t=>{
 const h=setup();t.after(()=>h.close());await h.create();let release;
 h.setHandler((name,args)=>args.p_action==='list'?new Promise(r=>release=r):h.demo.rpc(name,args));
 const refresh=h.api.refresh();await settle();h.host.innerHTML='<h1>Another screen</h1>';release({data:{threads:[{id:'private',subject:'Do not display'}]}});await refresh;assert.equal(h.host.textContent,'Another screen');
 h.setContext({userId:'b',clubId:'other'});h.api.start();h.setHandler((n,a)=>h.demo.rpc(n,a));await h.api.mount(h.host);assert.doesNotMatch(h.host.textContent,/Could we adjust|Help for our club/);
});
test('drafts survive navigation but are cleared when the signed-in identity changes',async t=>{
 const h=setup();t.after(()=>h.close());await h.api.mount(h.host);h.input('subject','Private draft');h.input('body','Not sent');h.host.innerHTML='<h1>Another page</h1>';await h.api.mount(h.host);assert.equal(h.host.querySelector('textarea').value,'Not sent');
 h.setContext({userId:'b',clubId:'club'});await h.api.mount(h.host);assert.equal(h.host.querySelector('textarea').value,'');h.setContext({userId:'a',clubId:'club'});await h.api.mount(h.host);assert.equal(h.host.querySelector('textarea').value,'');
});
test('platform inbox replies are explicitly sent from the platform context',async t=>{
 const h=setup();t.after(()=>h.close());await h.create();h.setContext({userId:'staff',platform:true});await h.api.mount(h.host);assert.match(h.host.textContent,/Test Club/);assert.equal(h.host.querySelector('[data-assist-new]'),null);
 await h.click('[data-assist-thread]');h.input('body','A real team reply');await h.click('[data-assist-send]');const sent=h.calls.filter(c=>c.p_action==='send').at(-1);assert.equal(sent.p_data.platform,true);assert.equal(sent.p_data.club_id,undefined);assert.match(h.host.querySelector('[data-assist-messages]').textContent,/Mirelion.*A real team reply/s);
});
test('an email destination opens the stored thread and survives a remount',async t=>{
 const h=setup();t.after(()=>h.close());await h.create();const thread=h.api.navigation().threadId;assert.ok(thread);
 await h.click('[data-assist-resolve]');h.api.home();await h.api.mount(h.host,{threadId:thread});
 assert.match(h.host.querySelector('[data-assist-subject]').textContent,/Help for our club/);assert.match(h.host.querySelector('[data-assist-thread-meta]').textContent,/Resolved/);
 assert.equal(h.api.navigation().threadId,thread);const saved=h.api.navigation();h.api.home();await h.api.mount(h.host,saved);assert.equal(h.host.querySelectorAll('[data-assist-message]').length,1);
 h.setContext({userId:'staff',platform:true});await h.api.mount(h.host,{threadId:thread});assert.equal(h.api.navigation(true).threadId,thread);assert.equal(h.api.navigation().threadId,null);
});
