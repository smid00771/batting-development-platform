const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8');
function part(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a);return text.slice(a,b);}
const boundaries=[['function socialGuidePreparation(', 'function socialGuidePreparationFeedback('],['function socialFixtureCompleted(','async function socialRPC('],['function socialGuideSteps(','function socialGuideLook('],['function socialGuideReturnToTeam(','function socialGuidePreview('],['async function socialGuideSaveAndContinue(','async function socialFindUploadedImage('],['function socialGuideSwitch(',"window.addEventListener('beforeunload'"],['function socialCards(','function socialDate('],['function socialPrepCard(','async function socialPrepPaint(']];
function setup(step=0){
 const nodes=new Map(),frames=[],scrolls=[],s={view:'guide',design:{},data:{assets:[{kind:'background'}],fixtures:[],players:[]},guide:{step,kind:step===2?'photo':'master',person:step===2?'player':'',context:{jobs:[]},available:true,returnCard:step===2?'second:1':''}},calls=[];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',dataset:{previewState:'ready'},style:{},addEventListener(event,fn){this['on'+event]=fn;},scrollIntoView(){scrolls.push(id);}});return nodes.get(id);};
 const document={getElementById:id=>element(id),querySelectorAll:()=>[],querySelector:selector=>selector==='.nav'?{getBoundingClientRect:()=>({bottom:64})}:selector.startsWith('[data-social-canvas=')?{closest:()=>element('team-card:'+selector)}:element(selector)};
 const c=vm.createContext({console,document,CSS:{escape:x=>x},requestAnimationFrame:fn=>frames.push(fn),crypto:require('node:crypto').webcrypto,appNavigationBack:fn=>fn(),clearTimeout(){},clearInterval(){},setTimeout(){},setInterval(){},URL,
  socialHere:()=>true,socialGuideState:s=>s.guide,socialAsset:(s,kind)=>s.data.assets.find(a=>a.kind===kind),seEsc:String,socialGuideStyles:()=>'',socialGuideIcon:()=>'',socialGuideLook(){},socialGuidePrepare(){},socialGuideFinish(){},socialCanLeave:()=>!s.pending&&!s.busy,
  socialTeamWorkflow:{state:s=>s.teamWorkflow||(s.teamWorkflow={})},socialLock(){},socialMessage:(_,message)=>calls.push({message}),supabase:{storage:{from:()=>({download:async()=>({data:new Blob(['saved cutout'])})})}},Blob,
  socialDraw:s=>{calls.push({render:s.view,step:s.guide.step});},socialSave:async()=>true,
  socialGuideOriginalApprove:async s=>{calls.push({save:'upload'});s.guide.local=null;},socialPrepApprove:async s=>{calls.push({save:'prepared'});s.guide.preview=null;}});
 vm.runInContext(boundaries.map(([a,b])=>part(app,a,b)).join('\n'),c);
 return {s,c,nodes,element,frames,scrolls,calls};
}

test('Guided setup advances from background to design confirmation without a Players step',async()=>{
 const h=setup(1);h.c.socialGuide(h.s);
 const html=h.element('socialContent').innerHTML;
 assert.match(html,/Step 2 of 3/);assert.doesNotMatch(html,/>Players</);assert.match(html,/Next: confirm design/);
 await h.element('prepNext').onclick();assert.equal(h.s.guide.step,3);
 h.c.socialGuide(h.s);await h.element('prepBack').onclick();assert.equal(h.s.guide.step,1);
});

test('saving a background advances directly to design confirmation',async()=>{
 const h=setup(1);h.s.guide.local={kind:'master'};
 await h.c.socialGuideSaveAndContinue(h.s);
 assert.equal(h.s.guide.step,3);assert.equal(h.s.view,'guide');assert.equal(h.calls[0].save,'upload');
});

test('the team photo editor has no setup progress and saving returns to the originating team',async()=>{
 for(const prepared of [false,true]){
  const h=setup(2);if(prepared){h.s.guide.preview='job';h.s.guide.context.jobs=[{id:'job',state:'ready',kind:'photo'}];}else h.s.guide.local={kind:'photo'};
  h.c.socialGuide(h.s);const html=h.element('socialContent').innerHTML;
  assert.match(html,/Player photo preparation/);assert.doesNotMatch(html,/Guided setup steps|Step \d of/);
  assert.equal(h.element('prepNext').textContent,'Save photo & back to team →');
  await h.element('prepNext').onclick();assert.equal(h.s.view,'graphics');assert.equal(h.s.guide.returnCard,'');
  assert.equal(h.s.notice,'Player photo saved ✓');h.frames.forEach(fn=>fn());
  assert.deepEqual(h.scrolls,['team-card:[data-social-canvas="second:1"]']);
 }
});

test('failed and unconfirmed photo saves keep the editor and the team target',async()=>{
 for(const pending of [false,true]){
  const h=setup(2);h.s.guide.local={kind:'photo'};
  h.c.socialGuideOriginalApprove=async s=>{if(pending){s.pending={action:'save'};s.guide.local=null;}};
  await h.c.socialGuideSaveAndContinue(h.s);
  assert.equal(h.s.view,'guide');assert.equal(h.s.guide.returnCard,'second:1');assert.equal(h.frames.length,0);
 }
});

test('Back to Team Graphics keeps an unsaved upload for the same player',()=>{
 const h=setup(2),image={kind:'photo',blob:'draft'};h.s.guide.local=image;
 assert.equal(h.c.socialGuideReturnToTeam(h.s),true);assert.equal(h.s.view,'graphics');
 h.c.socialGuideEnter(h.s,0);h.c.socialGuideEnter(h.s,2,'player','second:1');
 assert.equal(h.s.guide.local,image);assert.equal(h.s.guide.returnCard,'second:1');
});

test('background preparation returns to the single artwork page after saving',async()=>{
 const h=setup(1);h.s.guide.workflowReturn='artwork';h.s.guide.local={kind:'master'};
 h.c.socialGuide(h.s);assert.doesNotMatch(h.element('socialContent').innerHTML,/Guided setup steps|Step \d of/);
 await h.c.socialGuideSaveAndContinue(h.s);assert.equal(h.s.view,'graphics');assert.equal(h.s.teamWorkflow.step,'artwork');
 assert.equal(h.s.notice,'Background saved ✓');
});

test('photo previews use the selected grade and match day without changing other day choices',()=>{
 const h=setup(2);h.s.data.players=[{id:'player',name:'Selected Player'}];
 const fixture=id=>({id,features:[{day:1,mode:'player',roster_id:'first-player',asset_id:'first-photo'},{day:2,mode:'player',roster_id:'player',asset_id:'old-photo'}],published:{details:{grade:id,days:[{},{}]},slots:[{d1:'first-player',d2:'player'}]}});
 h.s.data.fixtures=[fixture('first'),fixture('second')];
 const before=structuredClone(h.s.data.fixtures);
 const {card,sample}=h.c.socialPrepCard(h.s,{roster_id:'player',kind:'photo'});
 assert.equal(sample,false);assert.equal(card.f.id,'second');assert.equal(card.day,1);
 assert.equal(card.f.features.find(f=>f.day===2).asset_id,'prepared-preview');
 assert.equal(card.f.features.find(f=>f.day===1).asset_id,'first-photo');
 assert.deepEqual(h.s.data.fixtures,before);
});

test('production and demo retain identical setup navigation and team photo handling',()=>{
 for(const [a,b] of boundaries)assert.equal(part(app,a,b),part(demo,a,b));
});

test('award cut-outs return the saved photo to the selected award and keep the team fixture untouched',async()=>{
 const h=setup(2);let applied;h.s.guide.returnCard='';h.s.guide.awardReturn={view:'century',savedAsset:{path:'saved.png',label:'Cut-out'},apply:async asset=>{applied=asset;}};
 h.c.socialGuide(h.s);assert.match(h.element('socialContent').innerHTML,/Socials Awards · Player photo/);
 await h.c.socialGuideReturnToTeam(h.s,'Photo saved');assert.equal(h.s.view,'century');assert.equal(await applied.blob.text(),'saved cutout');assert.equal(h.s.guide.awardReturn,null);assert.equal(h.s.busy,false);assert.equal(h.s.data.fixtures.length,0);
});
test('failed return keeps the prepared photo available for retry',async()=>{
 const h=setup(2);h.s.guide.awardReturn={view:'five_wickets',savedAsset:{path:'saved.png'},apply:async()=>{throw Error('Connection lost');}};
 assert.equal(await h.c.socialGuideReturnToTeam(h.s),false);assert.equal(h.s.view,'guide');assert.ok(h.s.guide.awardReturn.savedAsset);assert.equal(h.s.busy,false);
});

test('reusing an example opens that source and does not substitute an older prepared image',()=>{
 for(const source of [app,demo])for(const loaded of [false,true]){
  const prepare=part(source,'function socialGuidePrepare(','async function socialPrepStart(');
  const h=setup(1),jobs=[{id:'old-ready',kind:'master',state:'ready'}];
  h.s.data.assets.push({id:'example',kind:'reference_extra',label:'Previous team list'});
  h.s.guide.context=loaded?{jobs}:null;
  Object.assign(h.c,{socialGuideSources:s=>s.data.assets,socialPlayerPhotos:()=>[],socialGalleryCard:()=>'',socialGuidePreview:()=>'',socialGuideUploadStatus:()=>'',socialBindUploads(){},socialGuideSourcePaint:async()=>{},socialPrepPaint:async()=>{}});
  h.element('prepStep').querySelectorAll=()=>[];
  vm.runInContext(part(app,'function socialGuideResetImage(','function socialGuideReturnToTeam(')+prepare,h.c);
  h.c.socialGuideEnter(h.s,1,'','','example');
  h.s.guide.context={jobs};h.c.socialGuidePrepare(h.s);
  assert.equal(h.s.guide.source,'asset:example');assert.equal(h.s.guide.preview,null);
  assert.equal(h.s.guide.workflowReturn,'artwork');assert.match(h.element('prepStep').innerHTML,/<form id="prepForm" >/);
  jobs.push({id:'new-ready',kind:'master',state:'ready'});h.s.guide.preparation={id:'new-ready'};h.c.socialGuidePrepare(h.s);
  assert.equal(h.s.guide.preview,'new-ready','A subsequent preparation still opens for review');
 }
});

test('award background saves return to the award without changing team-list artwork',async()=>{
 for(const prepared of [false,true]){
  const h=setup(1),before=JSON.stringify(h.s.data),blob=new Blob(['award background']);let applied;
  h.s.guide.local=prepared?null:{blob,kind:'master'};h.s.guide.preview=prepared?'prepared-job':null;
  const job=prepared?{id:'prepared-job',kind:'master',state:'ready',result_path:'prepared.png'}:null;
  h.s.guide.context.jobs=job?[job]:[];h.s.guide.workflowReturn='artwork';
  h.s.guide.awardReturn={kind:'background',view:'results',apply:async asset=>{applied=asset;}};
  h.c.socialGuideUploadNote=()=>{};
  vm.runInContext(part(app,'function socialGuideResetImage(','function socialGuideReturnToTeam('),h.c);
  await h.c.socialGuideSaveAndContinue(h.s);
  assert.equal(h.s.view,'results');assert.equal(h.s.guide.awardReturn,null);assert.equal(applied.name,'Prepared background.png');
  assert.equal(JSON.stringify(h.s.data),before);assert.equal(h.calls.some(c=>c.save),false,'No team artwork approval is called');assert.equal(h.s.busy,false);
 }
});

test('a failed award background save keeps the preview and target available for retry',async()=>{
 const h=setup(1);h.s.guide.local={blob:new Blob(['background']),kind:'master'};h.s.guide.awardReturn={kind:'background',view:'century',apply:async()=>{throw Error('Save failed');}};
 h.c.socialGuideUploadNote=()=>{};await h.c.socialGuideSaveAndContinue(h.s);
 assert.equal(h.s.view,'guide');assert.ok(h.s.guide.local);assert.equal(h.s.guide.awardReturn.view,'century');assert.equal(h.s.busy,false);
});

test('background approval enters the award scope before its guarded upload and preserves the editor on failure',async()=>{
 for(const view of ['player_week','team_week']){
  const h=setup(1),blob=new Blob(['prepared background']);let saved=false,fail=true;
  h.s.guide.local={blob,kind:'master'};h.c.socialGuideUploadNote=()=>{};
  h.s.guide.awardReturn={kind:'background',view,apply:async asset=>{
   // Award upload callbacks only accept a result while their own view is current.
   await Promise.resolve();if(h.s.view!==view)return;
   if(fail)throw Error('Layout changed elsewhere');
   saved=await asset.blob.text()==='prepared background';
  }};
  vm.runInContext(part(app,'function socialGuideResetImage(','function socialGuideReturnToTeam('),h.c);
  await h.c.socialGuideSaveAndContinue(h.s);
  assert.equal(saved,false);assert.equal(h.s.view,'guide');assert.equal(h.s.guide.local.blob,blob);assert.ok(h.s.guide.awardReturn);
  fail=false;await h.c.socialGuideSaveAndContinue(h.s);
  assert.equal(saved,true);assert.equal(h.s.view,view);assert.equal(h.s.notice,'Background saved ✓');assert.equal(h.s.guide.awardReturn,null);
 }
});

test('leaving an award during approval never reports a background saved or replaces the new view',async()=>{
 const h=setup(1);h.s.guide.local={blob:new Blob(['background']),kind:'master'};
 h.c.socialGuideUploadNote=()=>{};h.s.guide.awardReturn={kind:'background',view:'player_week',apply:async()=>{h.s.view='responsibility';}};
 await h.c.socialGuideSaveAndContinue(h.s);
 assert.equal(h.s.view,'responsibility');assert.ok(h.s.guide.local);assert.ok(h.s.guide.awardReturn);assert.notEqual(h.s.notice,'Background saved ✓');
});
