const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const source=app.slice(app.indexOf('// BEGIN DEFERRED SOCIAL WORKSPACE'),app.indexOf('// END DEFERRED SOCIAL WORKSPACE')).replace(/import\('\.\/social-workspace\.js\?v=[^']+'\)/,'downloadWorkspace()');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness(){
 let allowed=true,scope='user:club',screen='socials',downloads=0,created=0,initialised=0;const pending=deferred(),state={scope};
 const c={socialState:state,ensureSelections:()=>({data:{socials:allowed}}),selectionsScopeKey:()=>scope,requestedFeatureScope:()=>scope+':'+screen,socialEnsure:()=>c.socialState,downloadWorkspace:()=>{downloads++;return pending.promise;}};
 for(const key of ['appNavigationBack','drawSelections','matchReviewExtractUrl','mountScorecardTeam','normaliseHex','recordSelectionNavigation','renderSocialPlatformSetup','restoreSocialNavigation','seDownload','seEsc','seFormatLabel','seNotice','seOpt','seReload','socialCanLeave','socialHere','socialOpenFixture'])c[key]=()=>{};
 Object.assign(c,{club:{id:'club'},session:{user:{id:'user'}},platformRole:null,supabase:{}});vm.createContext(c);vm.runInContext(source,c);
 const module={createSocialWorkspace(h){created++;assert.equal(h.socialState,c.socialState);return {controllers:{socialPublishing:{}},async loadSocialFeatures(){initialised++;}};}};
 return {c,pending,module,open:()=>c.loadSocialFeatures(),allow:value=>allowed=value,scope:value=>scope=value,screen:value=>screen=value,counts:()=>({downloads,created,initialised})};
}
test('non-socials access refuses the graphics download; passive navigation stays unloaded',async()=>{
 const h=harness();h.allow(false);await assert.rejects(h.open(),/Socials Manager/);assert.deepEqual(h.counts(),{downloads:0,created:0,initialised:0});
 assert.equal(vm.runInContext('socialEngine',h.c),null);
});
test('authorised opens share one import and create one workspace per current state',async()=>{
 const h=harness(),one=h.open(),two=h.open();h.pending.resolve(h.module);assert.equal(await one,await two);await h.open();assert.deepEqual(h.counts(),{downloads:1,created:1,initialised:1});
 h.c.socialState={scope:'user:club'};await h.open();assert.deepEqual(h.counts(),{downloads:2,created:2,initialised:2});
});
test('late downloads do not initialise graphics after access, identity, page or state changes',async()=>{
 for(const change of [h=>h.allow(false),h=>h.scope('other:club'),h=>h.scope('user:other'),h=>h.screen('board'),h=>h.c.socialState={scope:'user:club'}]){
  const h=harness(),opening=h.open();change(h);h.pending.resolve(h.module);assert.equal(await opening,null);assert.equal(h.counts().initialised,0);assert.equal(vm.runInContext('socialEngine',h.c),null);
 }
});
test('failed graphics download can be retried without poisoning the loader',async()=>{
 const h=harness();h.pending.reject(Error('offline'));await assert.rejects(h.open(),/offline/);h.c.downloadWorkspace=async()=>h.module;assert.ok(await h.open());assert.equal(h.counts().initialised,1);
});
function initialGraph(entry){const files=new Set();function visit(file){if(files.has(file))return;files.add(file);for(const [,specifier] of fs.readFileSync(path.join(root,file),'utf8').matchAll(/^import\s+(?:\{[^}]*\}\s+from\s+)?['"]([^'"]+)['"]/gm))if(specifier.startsWith('.'))visit(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier.split('?')[0])));}visit(entry);return files;}
test('post creation and platform award requests have independent download graphs',()=>{
 const initial=initialGraph('app.js'),requests=initialGraph('social-award-requests.js');
 for(const file of ['social-workspace.js','social-awards.js','social-award-font-data.js','social-award-fonts.js','social-font-fallback.js']){assert.equal(initial.has(file),false);assert.equal(requests.has(file),false);}
 assert.equal(requests.size,1);assert.doesNotMatch(app,/function socialRender\(|function socialGuidePrepare\(/);
 assert.ok(fs.statSync(path.join(root,'app.js')).size<2000000);
});
