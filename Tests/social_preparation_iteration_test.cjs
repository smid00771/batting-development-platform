const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{webcrypto}=require('node:crypto');
const app=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function fn(name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(app);assert.ok(m,name);const rest=app.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return end<0?rest.split("\n")[0]:rest.slice(0,end+1);}
const functions=['socialGuidePrepare','socialGuidePreparation','socialGuidePreparationFeedback','socialGuideReviewVersion','socialGuideRefineVersion','socialPrepStart','socialGuideReload','socialGuideResetImage','socialGuideRemember','socialGuideDraftKey','socialGuideNextState','socialGuideSaveAndContinue','socialSaveAwardBackground'];
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
