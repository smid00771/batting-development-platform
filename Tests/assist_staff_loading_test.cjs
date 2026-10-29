const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(t){
 const {createStaffAssistController}=await import('../assist-loader.js');const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());
 let allowed=false,identity='player:club',loads=0,mounts=0,starts=0,resets=0,resolve,reject;
 const api=createStaffAssistController({allowed:()=>allowed,scope:()=>identity,load:()=>{loads++;return new Promise((a,b)=>{resolve=a;reject=b;});},create:()=>({start(){starts++;},mount(){mounts++;},reset(){resets++;},canLeave:()=>false,hasChanges:()=>true,navigation:()=>({threadId:'private'}),home(){}})});
 return {api,host:dom.window.document.querySelector('main'),permit:(a,id=identity)=>{allowed=a;identity=id;},finish:()=>resolve({}),fail:()=>reject(Error('offline')),counts:()=>({loads,mounts,starts,resets})};
}
test('players cause no Assist download or startup, including forced navigation',async t=>{
 const h=await setup(t);await h.api.start();await h.api.mount(h.host);h.api.home();h.api.reset();assert.equal(h.api.canLeave(),true);assert.equal(h.api.hasChanges(),false);assert.equal(h.counts().loads,0);
});
test('staff share one download and retain loaded save guards',async t=>{
 const h=await setup(t);h.permit(true,'staff:club');const start=h.api.start(),mount=h.api.mount(h.host);await tick();assert.equal(h.counts().loads,1);h.finish();await Promise.all([start,mount]);assert.equal(h.counts().mounts,1);assert.equal(h.counts().starts,1);assert.equal(h.api.canLeave(),false);assert.equal(h.api.hasChanges(),true);
});
test('late downloads cannot mount after role, account, club or screen changes',async t=>{
 for(const change of ['revoked','another-user','another-club','another-screen','reset']){
  const h=await setup(t);h.permit(true,'staff:club:assist');const opening=h.api.mount(h.host);await tick();
  if(change==='reset')h.api.reset();else h.permit(change!=='revoked',change);h.finish();await opening;assert.equal(h.counts().mounts,0,change);
 }
});
test('a failed staff download offers a working retry',async t=>{
 const h=await setup(t);h.permit(true);const opening=h.api.mount(h.host);await tick();h.fail();await opening;assert.match(h.host.textContent,/Try again/);h.host.querySelector('button').click();await tick();h.finish();await tick();assert.equal(h.counts().mounts,1);assert.equal(h.counts().loads,2);
});
test('core startup excludes the Assist workspace and all imports beneath it',()=>{
 const graph=new Set();function visit(file){if(graph.has(file))return;graph.add(file);const source=fs.readFileSync(file,'utf8');for(const [,path] of source.matchAll(/^import\s+\{[^}]*\}\s+from\s+['"](\.\/[^'"]+)['"]/gm))visit(path.split('?')[0]);}visit('app.js');assert.equal([...graph].some(x=>x.endsWith('/mirelion-assist.js')),false);
});
