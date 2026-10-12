const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8');
function part(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a);return text.slice(a,b);}
const boundaries=[['function socialFixtureCompleted(','async function socialRPC('],['function socialGuideSteps(','function socialGuideLook('],['function socialGuideReturnToTeam(','function socialGuidePreview('],['async function socialGuideSaveAndContinue(','async function socialFindUploadedImage('],['function socialGuideSwitch(',"window.addEventListener('beforeunload'"],['function socialCards(','function socialDate('],['function socialPrepCard(','async function socialPrepPaint(']];
function setup(step=0){
 const nodes=new Map(),frames=[],scrolls=[],s={view:'guide',design:{},data:{assets:[{kind:'background'}],fixtures:[],players:[]},guide:{step,kind:step===2?'photo':'master',person:step===2?'player':'',context:{jobs:[]},available:true,returnCard:step===2?'second:1':''}},calls=[];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',dataset:{previewState:'ready'},style:{},addEventListener(event,fn){this['on'+event]=fn;},scrollIntoView(){scrolls.push(id);}});return nodes.get(id);};
 const document={getElementById:id=>element(id),querySelectorAll:()=>[],querySelector:selector=>selector==='.nav'?{getBoundingClientRect:()=>({bottom:64})}:selector.startsWith('[data-social-canvas=')?{closest:()=>element('team-card:'+selector)}:element(selector)};
 const c=vm.createContext({console,document,CSS:{escape:x=>x},requestAnimationFrame:fn=>frames.push(fn),clearTimeout(){},clearInterval(){},setTimeout(){},setInterval(){},URL,
  socialHere:()=>true,socialGuideState:s=>s.guide,socialAsset:(s,kind)=>s.data.assets.find(a=>a.kind===kind),seEsc:String,socialGuideStyles:()=>'',socialGuideIcon:()=>'',socialGuideLook(){},socialGuidePrepare(){},socialGuideFinish(){},socialCanLeave:()=>!s.pending&&!s.busy,
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
  assert.match(html,/Team Graphics · Player photo/);assert.doesNotMatch(html,/Guided setup steps|Step \d of/);
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
