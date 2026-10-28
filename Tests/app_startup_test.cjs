const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'app.html'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function shell(t){const dom=new JSDOM(html,{url:'https://example.test/app.html?invite=private#callback'});t.after(()=>dom.window.close());return dom;}
function clock(){const frames=[];let reloads=0;return {frames,get reloads(){return reloads;},location:{reload(){reloads++;}},requestAnimationFrame:fn=>frames.push(fn),setTimeout,clearTimeout};}
test('initial HTML has a visible branded shell and retry even if the loader itself fails',t=>{
 const dom=shell(t),d=dom.window.document;
 assert.equal(d.querySelector('.app-start-brand').textContent,'Mirelion');assert.equal(d.getElementById('appStartStatus').textContent,'Opening your club…');
 assert.equal(d.querySelector('link[rel=stylesheet]'),null);assert.equal(d.querySelectorAll('link[rel=preload][as=style]').length,2);
 assert.match(d.querySelector('script[type=module]').src,/app-start\.js\?v=0\.8\.62\.289$/);
 const handler=new Function('document',d.querySelector('script[type=module]').getAttribute('onerror'));handler(d);
 assert.match(d.getElementById('appStartStatus').textContent,/could not open/);assert.equal(d.getElementById('appStartRetry').hidden,false);
 assert.equal(d.getElementById('appStartRetry').getAttribute('onclick'),'location.reload()');
});
test('shell gets a paint opportunity before core import and remains visible while it loads',async t=>{
 const {startApp}=await import('../app-start.js'),dom=shell(t),view=clock(),download=deferred(),ready=deferred();let loads=0,done=false;
 const url=dom.window.location.href,opening=startApp({doc:dom.window.document,view,load:()=>{loads++;return download.promise;}}).then(()=>done=true);
 assert.equal(loads,0);view.frames.shift()();await tick();assert.equal(loads,0);view.frames.shift()();await tick();assert.equal(loads,1);
 assert.ok(dom.window.document.querySelector('.app-start'));assert.equal(dom.window.location.href,url);assert.equal(done,false);
 download.resolve({appReady:ready.promise});await tick();assert.equal(done,false);ready.resolve();await opening;assert.equal(done,true);assert.equal(loads,1);
});
test('failed core or boot offers one reload without running a second boot',async t=>{
 const {startApp}=await import('../app-start.js');
 for(const kind of ['download','boot']){
  const dom=shell(t),view=clock();let loads=0;
  const opening=startApp({doc:dom.window.document,view,load:async()=>{loads++;if(kind==='download')throw Error('offline');return {appReady:Promise.reject(Error('boot'))};}});
  view.frames.shift()();view.frames.shift()();await opening;
  const retry=dom.window.document.getElementById('appStartRetry');assert.equal(retry.hidden,false);retry.click();assert.equal(view.reloads,1);assert.equal(loads,1);
 }
});
test('a late startup error cannot overwrite a screen that has already opened',async t=>{
 const {startApp}=await import('../app-start.js'),dom=shell(t),view=clock(),download=deferred();
 const opening=startApp({doc:dom.window.document,view,load:()=>download.promise});view.frames.shift()();view.frames.shift()();await tick();
 dom.window.document.getElementById('app').textContent='Sign in';download.reject(Error('late'));await opening;assert.equal(dom.window.document.getElementById('app').textContent,'Sign in');
});
async function feature(t,options={}){
 const {createDeferredController}=await import('../deferred-feature.js'),dom=new JSDOM('<main><p>Existing board</p></main>');t.after(()=>dom.window.close());
 let identity='user:club:board',loads=0,creates=0,dirty=false;const mounts=[],download=deferred();
 const api=createDeferredController({scope:()=>identity,load:()=>{loads++;return download.promise;},create:()=>{creates++;return {mount:host=>{mounts.push(host);},canLeave:()=>!dirty,hasChanges:()=>dirty};},passive:{canLeave:()=>true,hasChanges:()=>false},...options});
 return {dom,api,host:dom.window.document.querySelector('main'),download,mounts,loads:()=>loads,creates:()=>creates,scope:value=>identity=value,dirty:value=>dirty=value};
}
test('passive navigation guards do not download tools; repeated opens share one download',async t=>{
 const h=await feature(t);assert.equal(h.api.canLeave(),true);assert.equal(h.api.hasChanges(),false);assert.equal(h.loads(),0);
 const first=h.api.mount(h.host),second=h.api.mount(h.host);await tick();assert.equal(h.loads(),1);h.download.resolve({});await Promise.all([first,second]);
 assert.equal(h.creates(),1);assert.deepEqual(h.mounts,[h.host]);h.dirty(true);assert.equal(h.api.canLeave(),false);assert.equal(h.api.hasChanges(),true);
});
test('late feature downloads do not mount after account, club, screen or host changes',async t=>{
 for(const target of ['other-user:club:board','user:other-club:board','user:club:settings','removed']){
  const h=await feature(t),opening=h.api.mount(h.host);await tick();if(target==='removed')h.host.remove();else h.scope(target);
  h.download.resolve({});await opening;assert.equal(h.mounts.length,0);
 }
});
test('feature download failures show retry and retry performs a fresh load',async t=>{
 let calls=0,mounts=0;const h=await feature(t,{load:async()=>{if(++calls===1)throw Error('offline');return {};},create:()=>({mount:()=>mounts++})});
 await h.api.mount(h.host);assert.match(h.host.textContent,/could not load/);assert.equal(calls,1);h.host.querySelector('button').click();await tick();assert.equal(calls,2);assert.equal(mounts,1);
});
test('hostless decorators preserve the board while loading and surface a failure once',async t=>{
 let failures=0;const h=await feature(t,{host:()=>null,onError:()=>failures++});const before=h.host.innerHTML,opening=h.api.mount(h.host);await tick();assert.equal(h.host.innerHTML,before);
 h.download.reject(Error('offline'));await opening;assert.equal(h.host.innerHTML,before);assert.equal(failures,1);
});
test('users can leave Socials during its first download without losing loaded save guards',()=>{
 const source=fs.readFileSync(path.join(root,'app.js'),'utf8'),start=source.indexOf('function socialCanLeave(){'),end=source.indexOf('\nfunction ',start);
 const context={socialState:{scope:'club',photoPositions:{}},selectionsScopeKey:()=>'club',socialPublishing:undefined,alert(){},confirm:()=>true};
 require('node:vm').runInNewContext(source.slice(start,end),context);assert.equal(context.socialCanLeave(),true);
 context.socialState.busy=true;assert.equal(context.socialCanLeave(),false);
 context.socialState.busy=false;context.socialPublishing={};for(const name of ['socialAwardScopes','socialAwardLabels','socialAwards','socialWeek','socialPlayerWeek','socialTeamWorkflow'])context[name]={canLeave:()=>true};
 context.socialTeamWorkflow.canLeave=()=>false;assert.equal(context.socialCanLeave(),false);
});
function initialGraph(entry){const files=new Set();function visit(file){if(files.has(file))return;files.add(file);const source=fs.readFileSync(path.join(root,file),'utf8');for(const [,specifier] of source.matchAll(/^import\s+(?:\{[^}]*\}\s+from\s+)?['"]([^'"]+)['"]/gm)){if(specifier.startsWith('.'))visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier.split('?')[0])));}}visit(entry);return files;}
test('startup dependency graph excludes optional tools, Help, graphics font and analysis',()=>{
 const graph=initialGraph('app.js');
 for(const file of ['selection-returning.js','help-catalogue.js','social-font-fallback.js','selection-room.js','selection-evidence.js','selection-evidence-ui.js','season-stats.js','season-stats-panel.js','social-awards.js','social-team-workflow.js','social-publishing.js','team-of-week.js','player-of-week.js','playhq-import.js','fixture-results.js','selection-group-page.js','selection-group-permissions.js','video-credits.js'])assert.equal(graph.has(file),false,file+' must wait for its feature');
 assert.ok(graph.has('selection-returning-availability.js'),'Lightweight returning names stay available');assert.ok(graph.has('password-flow.js'),'Authentication remains essential');
 assert.ok([...graph].reduce((sum,file)=>sum+fs.statSync(path.join(root,file)).size,0)<2400000,'Keep optional payload out of startup');
});
