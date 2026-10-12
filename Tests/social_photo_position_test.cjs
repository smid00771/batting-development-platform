const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8');
function part(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a);return text.slice(a,b);}
const boundaries=[['function socialFixtureCompleted(','async function socialRPC('],['function socialCards(','function socialDate('],['function socialNames(','function socialPhotoId('],
 ['function socialPlayerPhotos(','function socialOversNotice('],['function socialFeatureRequest(','function socialInk('],
 ['async function socialRender(','async function socialPaintAll('],['async function socialRefresh(','async function socialOpen('],
 ['async function socialSave(','function socialLock(']];
const code=boundaries.map(([a,b])=>part(app,a,b)).join('\n');
function setup({twoDay=false,split=false,frame='cutout',left=false}={}){
 const people=[{id:'scotty',name:'Scotty Example'},{id:'other',name:'Other Player'}],asset={id:'photo',path:'test-photo',roster_id:'scotty',kind:'photo'};
 const f={id:'fixture',publication:2,features:[],published:{details:{grade:'Third Grade',opposition:'Visitors',format:'t20',days:[{date:'2099-10-10'},...(twoDay?[{date:'2099-10-17'}]:[])],match_roles:{d1:{captain_id:'scotty'},d2:{captain_id:'scotty'}}},players:people,slots:people.map(p=>({d1:p.id,d2:twoDay?p.id:null}))}};
 f.features=[{day:1,mode:'player',roster_id:'scotty',asset_id:'photo',revision:1,photo_x:0,photo_y:0},...(twoDay?[{day:2,mode:'player',roster_id:split?'other':'scotty',asset_id:split?null:'photo',revision:1,photo_x:0,photo_y:0}]:[])];
 const s={scope:'user:club',data:{brand:{name:'Example Club'},fixtures:[f],assets:[asset]},design:{layout:left?'portrait_left':'portrait',frame,photo_scale:110,photo_shift:20,font:'clean',primary:'#073554',accent:'#128FD2',marker:'arrows'},photoPositions:{},urls:new Map(),busy:false,pending:null};
 s.data.design={...s.design};let server=structuredClone(s.data),fail=false;const calls=[],receipts=new Map(),photo={width:500,height:1000},inputs=[],outputs=[],resets=[],panels=[],frames=[];
 const canvas=()=>{const draws=[],ctx={drawImage:(...args)=>draws.push(args),fillRect(){},save(){},restore(){},beginPath(){},rect(){},clip(){},ellipse(){},fillText(){},measureText:()=>({width:10})};return {width:1080,height:1350,dataset:{},getContext:()=>ctx,draws};};
 const preview=canvas(),summary={textContent:'Move photo',focus(){}};
 const document={querySelectorAll:selector=>selector.includes('position-panel')?panels:selector.includes('position-value')?outputs:selector.includes('position-reset')?resets:selector.includes('data-social-position')?inputs:[],querySelector:selector=>selector.includes('position-panel')?summary:selector.includes('data-social-canvas')?preview:selector.includes('position-reset')?resets[0]:inputs.find(i=>selector.includes(`data-axis="${i.dataset.axis}"`))||null};
 const c=vm.createContext({console,URL,crypto:webcrypto,document,CSS:{escape:x=>x},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},
  socialHere:()=>true,socialMessage:(s,message)=>s.notice=message,socialLock(){},socialDraw(){},socialGuideSaved(){},socialGuideUploadNote(){},socialGuideState:()=>({}),socialGuideRemember(){},
  socialDefaults:d=>({...d.design}),socialAsset:()=>null,socialAssetURL:async(s,a)=>a?'photo-url':null,socialImage:async(s,url)=>url?photo:null,
  socialFontReady:async()=>true,socialPhotoBounds:()=>({x:0,y:0,w:500,h:1000,transparent:frame==='cutout'}),socialInk:()=> '#fff',socialFixtureDates:()=>[],
  socialText(){},socialWrap:text=>({lines:[text],size:30}),socialNameProtection:()=>({alpha:0}),socialDrawNameProtection(){},socialMarker(){},seFormatLabel:()=> 'T20',seEsc:String,
  socialFitImage:(ctx,img,x,y,w,h)=>ctx.drawImage(img,x,y,w,h),
  socialRPC:async(s,action,data)=>{calls.push({action,data:structuredClone(data)});if(action==='context')return structuredClone(server);if(receipts.has(data.request_id))return receipts.get(data.request_id);
   assert.equal(action,'feature');const target=server.fixtures.find(x=>x.id===data.fixture_id);for(const day of data.days){const old=target.features.find(x=>x.day===day);if((old?.revision||0)!==data.revisions['d'+day])throw Error('Featured photo changed');}
   for(const day of data.days){const old=target.features.find(x=>x.day===day);Object.assign(old,{mode:data.mode,roster_id:data.roster_id,asset_id:data.asset_id,photo_x:data.photo_x,photo_y:data.photo_y,revision:old.revision+1});}
   const result={saved:true};receipts.set(data.request_id,result);if(fail){fail=false;throw Error('Response lost');}return result;
  }});
 vm.runInContext(code,c);
 const card=()=>c.socialCards(s.data.fixtures[0])[0];
 return {c,s,f,asset,calls,card,canvas,preview,summary,inputs,outputs,resets,panels,frames,fail:()=>{fail=true;}};
}

test('horizontal and vertical offsets move only the photo in cutout, circle and rectangle layouts',async()=>{
 for(const frame of ['cutout','circle','rectangle'])for(const left of [false,true]){
  const h=setup({frame,left}),before=h.canvas(),after=h.canvas();await h.c.socialRender(h.s,h.card(),before);
  h.s.photoPositions[h.card().key]={x:-8,y:-7};await h.c.socialRender(h.s,h.card(),after);
  assert.ok(Math.abs(Number(after.dataset.photoLeft)-Number(before.dataset.photoLeft)+86.4)<1e-8);
  assert.equal(Number(after.dataset.photoTop)-Number(before.dataset.photoTop),-94.5);
  assert.equal(after.dataset.photoWidth,before.dataset.photoWidth);assert.equal(after.dataset.photoHeight,before.dataset.photoHeight);
  const oldDraw=before.draws[0],newDraw=after.draws[0],x=frame==='cutout'?5:1,y=x+1;
  assert.ok(Math.abs((newDraw[x]-oldDraw[x])+86.4)<1e-8);assert.ok(Math.abs((newDraw[y]-oldDraw[y])+94.5)<1e-8);
  assert.equal(h.s.design.photo_shift,20);assert.equal(h.s.design.photo_scale,110);
 }
});

test('position survives saving, context refresh and a newly rendered download canvas',async()=>{
 const h=setup(),before=h.canvas();await h.c.socialRender(h.s,h.card(),before);
 h.s.photoPositions[h.card().key]={x:-10,y:6};assert.equal(await h.c.socialSavePhotoPosition(h.s,h.card(),{x:-10,y:6}),true);
 assert.deepEqual(Object.keys(h.s.photoPositions),[]);
 assert.equal(h.s.data.fixtures[0].features[0].photo_x,-10);assert.equal(h.s.data.fixtures[0].features[0].photo_y,6);
 const output=h.canvas();await h.c.socialRender(h.s,h.card(),output);
 assert.equal(Number(output.dataset.photoLeft)-Number(before.dataset.photoLeft),-108);
 assert.ok(Math.abs(Number(output.dataset.photoTop)-Number(before.dataset.photoTop)-81)<1e-8);
 assert.equal(h.s.data.fixtures[0].features[0].revision,2);
});
test('Size changes the visible photo dimensions in every photo treatment',async()=>{
 for(const frame of ['cutout','circle','rectangle']){
  const h=setup({frame}),before=h.canvas(),after=h.canvas();h.s.design.photo_scale=100;await h.c.socialRender(h.s,h.card(),before);
  h.s.design.photo_scale=120;await h.c.socialRender(h.s,h.card(),after);
  for(const key of ['photoWidth','photoHeight'])assert.ok(Math.abs(Number(after.dataset[key])/Number(before.dataset[key])-1.2)<0.001);
  assert.equal(after.dataset.photoShiftX,before.dataset.photoShiftX);assert.equal(after.dataset.photoShiftY,before.dataset.photoShiftY);
 }
});

test('shared two-day graphics save both days, while independent days remain separate',async()=>{
 const h=setup({twoDay:true});assert.equal(h.c.socialCards(h.f).length,1);
 await h.c.socialSavePhotoPosition(h.s,h.card(),{x:4,y:-3});
 assert.deepEqual(h.calls[0].data.days,[1,2]);assert.ok(h.s.data.fixtures[0].features.every(x=>x.photo_x===4&&x.photo_y===-3));
 h.s.data.fixtures[0].features[1].photo_y=0;assert.equal(h.c.socialCards(h.s.data.fixtures[0]).length,2);
 const split=setup({twoDay:true,split:true});await split.c.socialSavePhotoPosition(split.s,split.card(),{x:-5,y:8});
 assert.deepEqual(split.calls[0].data.days,[1]);assert.equal(split.s.data.fixtures[0].features[1].photo_y,0);
});

test('a lost save response retries the identical request and increments the saved revision once',async()=>{
 const h=setup();h.s.photoPositions[h.card().key]={x:-6,y:3};h.fail();
 assert.equal(await h.c.socialSavePhotoPosition(h.s,h.card(),{x:-6,y:3}),false);
 assert.ok(h.s.pending);assert.equal(h.s.photoPositions[h.card().key].x,-6);
 assert.equal(await h.c.socialSave(h.s,h.s.pending.action,h.s.pending.data),true);
 const writes=h.calls.filter(x=>x.action==='feature');assert.deepEqual(writes[0].data,writes[1].data);
 assert.equal(h.s.data.fixtures[0].features[0].revision,2);assert.equal(h.s.pending,null);
});

test('sliders and reset only preview until Confirm saves the photo position',async()=>{
 const h=setup(),card=h.card();
 for(const axis of ['x','y']){h.inputs.push({dataset:{socialPosition:card.key,axis},value:0,setAttribute(){},focus(){}});h.outputs.push({dataset:{axis},textContent:''});}
 h.resets.push({dataset:{socialPositionReset:card.key},disabled:true});h.panels.push({dataset:{socialPositionPanel:card.key},open:true});
 h.c.socialBindPhotoPosition(h.s,key=>key===card.key?card:null);h.panels[0].ontoggle();
 h.inputs[0].value=-9;h.inputs[0].oninput();h.inputs[1].value=5;h.inputs[1].oninput();
 assert.equal(h.calls.length,0);assert.equal(h.outputs[0].textContent,'9% left');assert.equal(h.outputs[1].textContent,'5% down');
 assert.equal(h.frames.length,1);h.frames.shift()();await new Promise(setImmediate);
 assert.equal(h.preview.dataset.photoShiftX,'-9');assert.equal(h.preview.dataset.photoShiftY,'5');
 h.inputs[1].onchange();await new Promise(setImmediate);assert.equal(h.calls.length,0);
 await h.c.socialSavePhotoPosition(h.s,h.card(),h.c.socialPhotoPosition(h.s,h.card()));assert.equal(h.calls[0].data.photo_y,5);
 assert.match(h.s.notice,/Photo position confirmed/);assert.ok(h.s.photoPositionConfirmed[card.key]);
 h.summary.textContent='Photo position confirmed ✓ · Adjust';
 const fresh=h.card();h.c.socialBindPhotoPosition(h.s,key=>key===fresh.key?fresh:null);h.resets[0].onclick();await new Promise(setImmediate);
 assert.equal(h.summary.textContent,'Move photo');
 assert.equal(h.s.data.fixtures[0].features[0].photo_x,-9);assert.equal(h.s.data.fixtures[0].features[0].photo_y,5);
 await h.c.socialSavePhotoPosition(h.s,h.card(),h.c.socialPhotoPosition(h.s,h.card()));
 assert.equal(h.s.data.fixtures[0].features[0].photo_x,0);assert.equal(h.s.data.fixtures[0].features[0].photo_y,0);
 assert.equal(h.s.photoPositionOpen[card.key],false);
 assert.doesNotMatch(h.c.socialPhotoPositionControls(h.s,h.card()),/data-social-position-panel="[^"]+" open/);
 assert.match(h.c.socialPhotoPositionControls(h.s,h.card()),/Photo position confirmed ✓ · Adjust/);
});

test('confirming one grade preserves another grade’s unconfirmed photo preview',async()=>{
 const h=setup(),other=structuredClone(h.f);other.id='other-fixture';h.s.data.fixtures.push(other);
 // The fixture context is refreshed after every save, including unrelated grade previews.
 const originalRPC=h.c.socialRPC;
 h.c.socialRPC=async(s,action,data)=>{const result=await originalRPC(s,action,data);if(action==='context')result.fixtures.push(structuredClone(other));return result;};
 h.c.socialPreviewPhotoPosition(h.s,h.card(),{x:-3,y:2});
 h.c.socialPreviewPhotoPosition(h.s,h.c.socialCards(other)[0],{x:7,y:-2});
 await h.c.socialSavePhotoPosition(h.s,h.card(),{x:-3,y:2});
 assert.equal(h.s.photoPositions['other-fixture:0'].x,7);assert.equal(h.s.photoPositions['other-fixture:0'].y,-2);
 assert.equal(h.s.photoPositions['fixture:0'],undefined);
});

test('switching a player or photo starts at original placement and missing photos have no controls',()=>{
 const h=setup();const request=h.c.socialFeatureRequest(h.card(),'player','other','new-photo');
 assert.equal(request.photo_x,0);assert.equal(request.photo_y,0);
 const html=h.c.socialPhotoControls(h.s,h.card());assert.match(html,/Move photo/);assert.match(html,/left or right/);assert.match(html,/up or down/);
 h.s.data.assets=[];assert.equal(h.c.socialPhotoPositionControls(h.s,h.card()),'');
});

test('busy or unconfirmed saves cannot be overwritten by a new position',async()=>{
 for(const property of ['busy','pending']){const h=setup();h.s[property]=true;assert.equal(await h.c.socialSavePhotoPosition(h.s,h.card(),{x:1,y:1}),false);assert.equal(h.calls.length,0);}
});

test('production and demo use the same saved-position controls and renderer',()=>{
 for(const [a,b] of boundaries)assert.equal(part(app,a,b),part(demo,a,b));
});

test('a delayed preview uses the saved position after save replaces the fixture context',async()=>{
 const h=setup();const oldCard=h.card();h.c.socialPreviewPhotoPosition(h.s,oldCard,{x:-4,y:5});
 await h.c.socialSavePhotoPosition(h.s,oldCard,{x:-4,y:5});
 h.frames.shift()();await new Promise(setImmediate);
 assert.equal(h.preview.dataset.photoShiftX,'-4');assert.equal(h.preview.dataset.photoShiftY,'5');
});

test('a completed-fixture rejection clears the pending save and expired photo draft',async()=>{
 const h=setup();h.s.photoPositions[h.card().key]={x:-4,y:5};h.s.data.fixtures[0].completed=true;
 h.c.socialRPC=async()=>{throw Object.assign(Error('Completed fixtures are read-only.'),{code:'P0159'});};
 assert.equal(await h.c.socialSavePhotoPosition(h.s,h.card(),{x:-4,y:5}),false);
 assert.equal(h.s.pending,null);assert.equal(Object.keys(h.s.photoPositions).length,0);assert.equal(h.s.notice,'Completed fixtures are read-only.');
});
