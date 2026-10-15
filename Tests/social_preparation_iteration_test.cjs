const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto');
const app=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function fn(name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(app);assert.ok(m,name);const rest=app.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return end<0?rest.split("\n")[0]:rest.slice(0,end+1);}
const functions=['socialGuidePrepare','socialGuidePreparation','socialGuidePreparationFeedback','socialGuideReviewVersion','socialGuideRefineVersion','socialGuideRevertVersion','socialPrepStart','socialGuideReload','socialGuideResetImage','socialGuideRemember','socialGuideDraftKey','socialGuideNextState','socialGuideSaveAndContinue','socialSaveAwardBackground'];
function setup(){
 const dom=new JSDOM('<div id="prepStep"></div><button id="prepNext"></button>',{url:'https://example.test'}),document=dom.window.document,jobs=[],calls=[],applied=[];
 dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 const s={scope:'u:c',view:'guide',data:{assets:[],players:[],fixtures:[]},design:{},urls:new Map(),guide:{step:1,kind:'master',person:'',brief:'Move Results lower',source:'asset:original',needsHelp:true,available:true,context:{mode:'included',jobs:[]},awardReturn:{kind:'background',view:'results',apply:async x=>applied.push(x)}}};
 let invoke=async body=>{calls.push(structuredClone(body));const id='job-'+calls.length;jobs.unshift({...body.data,id,state:'pending',source_path:body.data.source_job_id?'result-'+body.data.source_job_id:'original.png',source_bucket:'club-social-prep'});return{id,state:'pending'};};
 const c=vm.createContext({document,console,crypto:webcrypto,sessionStorage:dom.window.sessionStorage,URL,Blob,File,setTimeout,clearTimeout,queueMicrotask,
  socialGuideState:()=>s.guide,socialHere:()=>true,socialGuideSources:()=>[],socialPlayerPhotos:()=>[],socialGalleryCard:()=>'',socialGuideIcon:()=>'',seEsc:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),socialGuideUploadStatus:()=>'',socialBindUploads(){},socialGuideSourcePaint(){},socialPrepURL:async()=>'',socialCards:()=>[],socialGuideUploadNote:(_,text,state='working')=>s.guide.uploadNote={text,state},socialGuideSteps:()=>({next:3}),socialGuideReturnToTeam(){},socialGuideGo(){},socialLock(){},socialMessage:(_,x)=>s.notice=x,socialAsset:()=>null,socialGuideOriginalApprove(){throw Error('Must not save the old image');},socialPrepApprove(){throw Error('Must not approve a team background');},
  socialPrepInvoke:(_,body)=>invoke(body),socialPrepRPC:async()=>({mode:'included',jobs:structuredClone(jobs)}),supabase:{storage:{from:()=>({download:async path=>({data:new Blob([path])})})}}
 });
 vm.runInContext(functions.map(fn).join('\n'),c);
 c.socialPrepPaint=()=>{document.getElementById('prepCanvas').dataset.previewState='ready';c.socialGuideNextState(s);};c.socialDraw=()=>c.socialGuidePrepare(s);
 c.socialDraw();return{s,c,jobs,calls,document,applied,setInvoke:x=>invoke=x,feedback:()=>document.getElementById('prepRequestFeedback')?.textContent||''};
}
test('failed request is visible beside the unchanged preview and cannot save the old source',async()=>{
 const h=setup();h.s.guide.local={kind:'master',local:true,result_path:'old.png'};await h.c.socialPrepStart(h.s);
 assert.match(h.feedback(),/Preparing your changes/);assert.equal(h.document.getElementById('prepStart').disabled,true);
 Object.assign(h.jobs[0],{state:'failed',error:'Image service account access failed',credit_used:false});await h.c.socialGuideReload(h.s);
 assert.match(h.feedback(),/Changes could not be prepared/);assert.match(h.feedback(),/No AI credit used/);assert.match(h.feedback(),/Move Results lower/);assert.doesNotMatch(h.feedback(),/Preparing your changes/);
 assert.equal(h.s.guide.preview,null);assert.equal(h.document.getElementById('prepSaveVersion'),null);await h.c.socialGuideSaveAndContinue(h.s);assert.equal(h.applied.length,0);
});
test('each refinement uses the last reviewed image and only the selected finished version is saved',async()=>{
 const h=setup();for(let version=1;version<=3;version++){
  await h.c.socialPrepStart(h.s);const job=h.jobs[0];Object.assign(job,{state:'ready',result_path:'version-'+version+'.png',credit_used:true});await h.c.socialGuideReload(h.s);
  assert.match(h.feedback(),/New version ready/);assert.equal(h.s.guide.preview,job.id);assert.equal(h.document.getElementById('prepSaveVersion').disabled,false);
  if(version<3){h.document.getElementById('prepChange').click();assert.equal(h.s.guide.source,'job:'+job.id);assert.equal(h.s.guide.preview,null);assert.equal(h.s.guide.brief,'');h.s.guide.brief='Refinement '+version;}
 }
 assert.equal(h.calls[1].data.source_job_id,'job-1');assert.equal(h.calls[2].data.source_job_id,'job-2');assert.equal(h.calls[2].data.brief,'Refinement 2');
 await h.c.socialGuideSaveAndContinue(h.s);assert.equal(h.applied.length,1);assert.equal(await h.applied[0].blob.text(),'version-3.png');assert.equal(h.s.view,'results');assert.equal(h.calls.length,3);
});
test('an uncertain response retries the same request ID and keeps changes frozen until resolved',async()=>{
 const h=setup();let tries=0,ids=[];h.setInvoke(async body=>{ids.push(body.data.request_id);if(++tries===1)throw Object.assign(Error('Connection lost'),{retryable:true});h.jobs.push({...body.data,id:'recovered',state:'pending'});return{id:'recovered'};});
 await h.c.socialPrepStart(h.s);assert.match(h.feedback(),/Request not yet confirmed/);assert.equal(h.document.getElementById('prepBrief').disabled,true);assert.equal(h.document.getElementById('prepStart').disabled,false);
 await h.c.socialPrepStart(h.s);assert.equal(ids[0],ids[1]);assert.equal(h.s.guide.preparation.id,'recovered');assert.equal(h.s.guide.startCommand,null);
});
test('unrelated ready jobs never replace a failed request; an earlier version can be explicitly retained',async()=>{
 const h=setup();await h.c.socialPrepStart(h.s);Object.assign(h.jobs[0],{state:'failed',error:'Unavailable',credit_used:false});h.jobs.push({id:'earlier',kind:'master',state:'ready',result_path:'earlier.png'});h.s.guide.previousPreview='earlier';await h.c.socialGuideReload(h.s);
 assert.equal(h.s.guide.preview,null);h.document.getElementById('prepKeepVersion').click();assert.equal(h.s.guide.preview,'earlier');assert.match(h.feedback(),/New version ready/);await h.c.socialGuideSaveAndContinue(h.s);assert.equal(await h.applied[0].blob.text(),'earlier.png');assert.equal(h.calls.length,1);
});

test('Edit and Revert appear before the preview, and reverting the original uses no AI or save',async()=>{
 const h=setup();await h.c.socialPrepStart(h.s);Object.assign(h.jobs[0],{state:'ready',source_path:'c/source/original.png',result_path:'changed.png'});await h.c.socialGuideReload(h.s);
 const edit=h.document.getElementById('prepChange'),revert=h.document.getElementById('prepRevert'),canvas=h.document.getElementById('prepCanvas');
 assert.equal(edit.textContent,'Edit this version');assert.ok(edit.compareDocumentPosition(canvas)&4);assert.ok(revert.compareDocumentPosition(canvas)&4);
 assert.match(h.document.getElementById('prepResultsNote').textContent,/PlayCricket/);assert.match(h.document.getElementById('prepSaveVersion').textContent,/preview Results/);
 await h.c.socialGuideRevertVersion(h.s,h.jobs[0].id);
 assert.equal(h.s.guide.preview,null);assert.equal(h.s.guide.preparation,null);assert.equal(h.s.guide.uploaded,'c/source/original.png');assert.equal(await h.s.guide.local.blob.text(),'c/source/original.png');assert.equal(h.calls.length,1);assert.equal(h.applied.length,0);assert.equal(h.s.guide.context.jobs[0].result_path,'changed.png');
 assert.equal(h.document.getElementById('prepSaveVersion').disabled,false);h.document.getElementById('prepChange').click();h.s.guide.brief='Small gap only';await h.c.socialPrepStart(h.s);
 assert.equal(h.calls[1].data.source_path,'c/source/original.png');assert.equal(h.calls[1].data.graphic_kind,'results');
});

test('Revert follows the exact parent image through several AI edits',async()=>{
 const h=setup();await h.c.socialPrepStart(h.s);Object.assign(h.jobs[0],{state:'ready',result_path:'first.png'});await h.c.socialGuideReload(h.s);h.c.socialGuideRefineVersion(h.s,'job-1');h.s.guide.brief='Tiny adjustment';await h.c.socialPrepStart(h.s);
 Object.assign(h.jobs[0],{state:'ready',source_path:'first.png',result_path:'second.png'});await h.c.socialGuideReload(h.s);assert.equal(h.calls[1].data.mode,'edit');
 await h.c.socialGuideRevertVersion(h.s,'job-2');assert.equal(h.s.guide.preview,'job-1');assert.equal(h.calls.length,2);assert.equal(h.applied.length,0);await h.c.socialGuideSaveAndContinue(h.s);assert.equal(await h.applied[0].blob.text(),'first.png');
});

test('Revert restores a saved asset and keeps the current image if its source is unavailable',async()=>{
 const h=setup();h.s.data.assets=[{id:'original',path:'club/background/original.png'}];await h.c.socialPrepStart(h.s);Object.assign(h.jobs[0],{state:'ready',source_bucket:'club-socials',source_path:'club/background/original.png',result_path:'changed.png'});await h.c.socialGuideReload(h.s);
 const download=h.c.supabase.storage.from;h.c.supabase.storage.from=()=>({download:async()=>({error:{message:'Offline'}})});await h.c.socialGuideRevertVersion(h.s,'job-1');assert.equal(h.s.guide.preview,'job-1');assert.equal(h.s.guide.local,undefined);assert.match(h.s.notice,/Could not revert/);
 h.c.supabase.storage.from=download;await h.c.socialGuideRevertVersion(h.s,'job-1');assert.equal(h.s.guide.source,'asset:original');assert.equal(await h.s.guide.local.blob.text(),'club/background/original.png');assert.equal(h.calls.length,1);
});

test('an unresolved generation prevents reverting or submitting different artwork',async()=>{
 const h=setup();h.jobs.push({id:'earlier',kind:'master',state:'ready',source_path:'original.png',result_path:'earlier.png'});await h.c.socialPrepStart(h.s);h.s.guide.previousPreview='earlier';h.c.socialDraw();
 assert.equal(h.document.getElementById('prepRevert').disabled,true);await h.c.socialGuideRevertVersion(h.s,'earlier');assert.equal(h.s.guide.source,'asset:original');assert.equal(h.calls.length,1);
});
