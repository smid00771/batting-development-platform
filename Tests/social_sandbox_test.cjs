const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8'),moduleSource=fs.readFileSync(path.join(__dirname,root,'social-sandbox.js'),'utf8');
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-12T11:00:00Z']));}static now(){return new Date('2026-10-12T11:00:00Z').getTime();}};
function fixture(id,dates){return {id,publication:1,features:[],published:{details:{grade:'Test XI',opposition:'Visitors',days:dates.map(date=>({date}))},players:[],slots:[]}};}
test('completed artwork locks at the club-local date boundary and waits for the final match day',()=>{
 const c=vm.createContext({Date});vm.runInContext(part(app,'function socialFixtureCompleted(','async function socialRPC('),c);const s={data:{timezone:'Australia/Sydney'}};
 const f=fixture('one',['2026-10-10']);assert.equal(c.socialFixtureCompleted(s,f,new Date('2026-10-10T12:59:59Z')),false);assert.equal(c.socialFixtureCompleted(s,f,new Date('2026-10-10T13:00:00Z')),true);
 assert.equal(c.socialFixtureCompleted(s,fixture('two',['2026-10-03','2026-10-10']),new Date('2026-10-10T08:00:00Z')),false);
 assert.equal(c.socialFixtureCompleted(s,{...f,completed:true},new Date('2026-10-09T01:00:00Z')),true);
});
test('old pages cannot save a completed feature, attached photo or regenerated export',async()=>{
 const writes=[],c=vm.createContext({Date:FixedDate,socialMessage(){},supabase:{rpc:async(...args)=>{writes.push(args);return {data:{saved:true}};}}});
 vm.runInContext(part(app,'function socialFixtureCompleted(','function socialDefaults('),c);
 const s={scope:'user:club',data:{timezone:'Australia/Sydney',fixtures:[fixture('past',['2026-10-10'])]}};
 for(const [action,data] of [['feature',{fixture_id:'past'}],['add_asset',{feature:{fixture_id:'past'}}],['guide:import',{asset:{feature:{fixture_id:'past'}}}],['validate_export',{fixtures:[{id:'past'}]}],['record_export',{fixtures:[{id:'past'}]}]]){
  await assert.rejects(c.socialRPC(s,action,data),e=>e.code==='P0159');
 }
 assert.equal(writes.length,0);await c.socialRPC(s,'settings',{design:{}});assert.equal(writes.length,1);
});
test('past fixtures render as records with no photo controls, canvas or download action',()=>{
 const nodes=new Map(),painted=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',addEventListener(){}});return nodes.get(id);};
 const c=vm.createContext({Date:FixedDate,document:{getElementById:node,querySelectorAll:()=>[]},seEsc:String,seFormatLabel:()=>'',socialDate:x=>x,socialCaption:()=> 'Published team',socialBindPhotoPosition(){},socialPaintAll:(s,fs)=>painted.push(...fs),socialPublishing:{mount(){}}});
 vm.runInContext(part(app,'function socialFixtureCompleted(','async function socialRPC(')+part(app,'function socialSelection(','function socialOpenSelectionDate(')+part(app,'function socialGraphics(','function socialAsset('),c);
 const s={data:{timezone:'Australia/Sydney',fixtures:[fixture('past',['2026-10-10'])]},date:'2026-10-10',selected:new Set(['past'])};c.socialGraphics(s);
 const html=node('socialContent').innerHTML;assert.match(html,/Completed · read only/);assert.match(html,/Open Design sandbox/);assert.doesNotMatch(html,/<canvas|data-social-person|data-social-download|id="socialPack"/);assert.equal(painted.length,0);assert.equal(c.socialSelection(s).length,0);
 s.date='';c.socialGraphics(s);assert.equal(s.date,'');assert.match(node('socialContent').innerHTML,/Choose a past fixture to view/);
});
function sandbox(){
 const nodes=new Map(),stamps=[],draws=[],applied=[],downloads=[],revoked=[],inputs=[{dataset:{sandboxSetting:'primary'},type:'color',value:'#AA3344'}];let confirmed=false;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',isConnected:true,width:1080,height:1350,dataset:{},addEventListener(){},querySelectorAll:selector=>selector==='[data-sandbox-setting]'?inputs:[],getContext:()=>({save(){},restore(){},fillRect(){},fillText:text=>stamps.push(text),drawImage(){}}),toBlob:fn=>fn({type:'image/png'})});return nodes.get(id);};
 const c=vm.createContext({console,Date:FixedDate,crypto:webcrypto,document:{getElementById:node,createElement:()=>node('temp-'+nodes.size)},window:{confirm:()=>confirmed},URL:{createObjectURL:()=> 'blob:trial-'+nodes.size,revokeObjectURL:url=>revoked.push(url)}});
 vm.runInContext(moduleSource.replace('export function','function'),c);
 const api=c.createSocialSandbox({here:()=>true,escape:String,defaults:d=>({...d.design}),renderImage:async(s,card)=>draws.push({s,card}),normalize:async()=>({type:'image/png'}),message(){},download:(...args)=>downloads.push(args),applyDesign:async(s,d)=>applied.push(d)});
 const s={view:'sandbox',urls:new Map(),images:new Map(),data:{design:{layout:'portrait',frame:'cutout',primary:'#123456',accent:'#abcdef',font:'clean',marker:'arrows',photo_scale:100,photo_shift:0,theme:'solid',header_layout:'integrated',header_height:310,footer:''},brand:{name:'Example Club'},players:[{id:'real-player',name:'Real Player'}],assets:[{id:'real-photo',kind:'photo',roster_id:'real-player',path:'saved-photo',label:'Saved'}],fixtures:[fixture('real-fixture',['2026-10-10'])]}};
 return {api,s,node,draws,stamps,applied,downloads,inputs,revoked,confirm:()=>{confirmed=true;}};
}
test('sandbox edits, player choices and uploads remain isolated from real club data',async()=>{
 const h=sandbox(),before=JSON.stringify(h.s.data);h.api.render(h.s);h.inputs[0].oninput();h.node('sandboxPhoto').onchange({target:{value:'real-photo'}});
 await h.node('sandboxPhotoUpload').onchange({target:{files:[{name:'Trial.png'}]}});await new Promise(setImmediate);
 const p=h.api.preview(h.s);assert.match(p.card.f.id,/^sandbox-/);assert.ok(p.state.data.players.every(x=>x.name.endsWith('Sample')));
 assert.equal(p.state.design.primary,'#AA3344');assert.ok(p.state.data.assets.some(a=>a.id==='sandbox-photo'&&a.roster_id.startsWith('sandbox-')));
 assert.equal(JSON.stringify(h.s.data),before);assert.equal(h.applied.length,0);assert.ok(h.stamps.every(x=>x==='SAMPLE · DESIGN SANDBOX'));
 h.node('sandboxDownload').onclick();assert.equal(h.downloads[0][0],'Club-design-SAMPLE.png');
 h.api.release(h.s);assert.ok(h.revoked.length>0);
});
test('saving a sandbox design requires the explicit confirmed Apply action',async()=>{
 const h=sandbox();h.api.render(h.s);await h.node('sandboxApply').onclick();assert.equal(h.applied.length,0);
 h.confirm();await h.node('sandboxApply').onclick();assert.equal(h.applied.length,1);assert.equal(h.applied[0].primary,'#123456');assert.equal(h.applied[0].fixtures,undefined);assert.equal(h.applied[0].assets,undefined);
});
test('general club-design previews use fictional teams even when real fixtures exist',()=>{
 const c=vm.createContext({Date:FixedDate,socialGuideState:s=>s.guide});vm.runInContext(part(app,'function socialPrepCard(','async function socialPrepPaint('),c);
 const result=c.socialPrepCard({guide:{},data:{players:[],fixtures:[fixture('real-fixture',['2026-10-10'])]}});
 assert.equal(result.sample,true);assert.equal(result.card.f.id,'layout-example');
});
test('the demo embeds the same sandbox and completed-fixture guards',()=>{
 const source=moduleSource.slice(moduleSource.indexOf('export function')).replace('export function','function').trim();assert.ok(demo.includes(source));
 assert.equal(part(app,'function socialFixtureCompleted(','async function socialRPC('),part(demo,'function socialFixtureCompleted(','async function socialRPC('));
});
