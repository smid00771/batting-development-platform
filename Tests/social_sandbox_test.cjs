const socialSource=require('./helpers/social-source.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=socialSource(fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8')),demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8'),moduleSource=fs.readFileSync(path.join(__dirname,root,'social-sandbox.js'),'utf8');
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
test('completed fixtures stay out of export selection and remain available in the history calendar',()=>{
 const rendered=[],c=vm.createContext({Date:FixedDate,socialTeamWorkflow:{render:s=>rendered.push(s)}});
 vm.runInContext(part(app,'function socialFixtureCompleted(','async function socialRPC(')+part(app,'function socialSelection(','function socialOpenSelectionDate(')+socialSource.functionSource(app,'socialGraphics'),c);
 const s={data:{timezone:'Australia/Sydney',fixtures:[fixture('past',['2026-10-10']),fixture('future',['2026-10-17'])]},date:'2026-10-10',selected:new Set(['past','future'])};
 assert.equal(c.socialSelection(s).length,0);assert.equal(c.socialFixtureCalendar(s).find(f=>f.id==='past').completed,true);
 s.date='2026-10-17';assert.equal(c.socialSelection(s)[0].id,'future');c.socialGraphics(s);assert.equal(rendered[0],s);
});

function sandbox(){
 const nodes=new Map(),stamps=[],draws=[],applied=[],downloads=[],revoked=[],inputs=[{dataset:{sandboxSetting:'primary'},type:'color',value:'#AA3344'}];const positions=['x','y'].map(axis=>({dataset:{sandboxPosition:axis},value:0}));let confirmed=false;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',isConnected:true,width:1080,height:1350,dataset:{},addEventListener(event,fn){this['on'+event]=fn;},querySelectorAll:selector=>selector==='[data-sandbox-setting]'?inputs:selector==='[data-sandbox-position]'?positions:[],getContext:()=>({save(){},restore(){},fillRect(){},fillText:text=>stamps.push(text),drawImage(){}}),toBlob:fn=>fn({type:'image/png'})});return nodes.get(id);};
 const c=vm.createContext({console,Date:FixedDate,crypto:webcrypto,document:{getElementById:node,createElement:()=>node('temp-'+nodes.size)},window:{confirm:()=>confirmed},URL:{createObjectURL:()=> 'blob:trial-'+nodes.size,revokeObjectURL:url=>revoked.push(url)}});
 vm.runInContext(part(app,'function socialCards(','function socialDate(')+part(app,'function socialSurname(','function socialPhotoId(')+part(app,'function socialPlayerPhotos(','function socialOversNotice(')+moduleSource.replace('export function','function'),c);
 const api=c.createSocialSandbox({here:()=>true,escape:String,defaults:d=>({...d.design}),groups:s=>s.data.groups||[],cards:c.socialCards,featured:c.socialFeatured,renderImage:async(s,card)=>draws.push({s,card}),normalize:async()=>({type:'image/png'}),message(){},download:(...args)=>downloads.push(args),applyDesign:async(s,d)=>applied.push(d)});
 const s={view:'sandbox',urls:new Map(),images:new Map(),data:{design:{layout:'portrait',frame:'cutout',primary:'#123456',accent:'#abcdef',font:'clean',marker:'arrows',photo_scale:100,photo_shift:0,theme:'solid',header_layout:'integrated',header_height:310,footer:''},brand:{name:'Example Club'},players:[{id:'real-player',name:'Real Player'}],assets:[{id:'real-photo',kind:'photo',roster_id:'real-player',path:'saved-photo',label:'Saved'}],fixtures:[fixture('real-fixture',['2026-10-10'])]}};
 const f=s.data.fixtures[0];f.published.players=structuredClone(s.data.players);f.published.slots=[{d1:'real-player',d2:null}];f.features=[{day:1,mode:'player',roster_id:'real-player',asset_id:'real-photo',photo_x:4,photo_y:-3}];s.design={...s.data.design};
 return {api,s,node,draws,stamps,applied,downloads,inputs,positions,revoked,confirm:()=>{confirmed=true;}};
}
test('sandbox edits, player choices and uploads remain isolated from real club data',async()=>{
 const h=sandbox(),before=JSON.stringify(h.s.data);h.api.render(h.s);h.inputs[0].oninput();h.node('sandboxPhoto').onchange({target:{value:'real-photo'}});
 await h.node('sandboxPhotoUpload').onchange({target:{files:[{name:'Trial.png'}]}});await new Promise(setImmediate);
 const p=h.api.preview(h.s);assert.match(p.card.f.id,/^sandbox-/);assert.equal(p.state.data.players[0].name,'Real Player');assert.equal(p.card.f.published.details.grade,'Test XI');
 assert.equal(p.state.design.primary,'#AA3344');assert.ok(p.state.data.assets.some(a=>a.id==='sandbox-photo'&&a.roster_id==='real-player'));
 assert.equal(JSON.stringify(h.s.data),before);assert.equal(h.applied.length,0);assert.ok(h.stamps.every(x=>x==='TRIAL · DESIGN SANDBOX'));
 h.node('sandboxDownload').onclick();assert.equal(h.downloads[0][0],'Club-design-TRIAL.png');
 h.api.release(h.s);assert.ok(h.revoked.length>0);
});
test('saving a sandbox design requires the explicit confirmed Apply action',async()=>{
 const h=sandbox();h.api.render(h.s);h.inputs[0].oninput();await h.node('sandboxApply').onclick();assert.equal(h.applied.length,0);
 h.confirm();await h.node('sandboxApply').onclick();assert.equal(h.applied.length,1);assert.equal(h.applied[0].primary,'#AA3344');assert.equal(h.applied[0].fixtures,undefined);assert.equal(h.applied[0].assets,undefined);
});
test('team choices reuse club grades, prefer upcoming lineups and isolate copies',()=>{
 const h=sandbox(),past=h.s.data.fixtures[0],next=structuredClone(past),later=structuredClone(past);
 next.id='next';next.published.details.days=[{date:'2026-10-15'}];next.published.details.opposition='Next visitors';
 later.id='later';later.published.details.days=[{date:'2026-11-01'}];
 h.s.data.fixtures.push(later,next);h.s.data.groups=[{name:'Test XI',active:true},{name:'New XI',active:true},{name:'Inactive XI',active:false}];
 h.s.data.grade_defaults=[{grade:'Test XI',format:'t20'},{grade:'Test XI',format:'limited_overs'}];
 h.api.render(h.s);assert.equal(h.s.sandbox.teams.length,2);
 const p=h.api.preview(h.s);assert.equal(p.card.f.published.details.opposition,'Next visitors');
 assert.equal(p.state.photoPositions[p.card.key].x,4);assert.equal(p.state.photoPositions[p.card.key].y,-3);
 p.card.f.published.players[0].name='Trial only';p.card.f.published.details.grade='Trial grade';p.state.data.assets[0].label='Trial asset';
 assert.equal(next.published.players[0].name,'Real Player');assert.equal(next.published.details.grade,'Test XI');assert.equal(h.s.data.assets[0].label,'Saved');
 h.node('sandboxTeam').onchange({target:{value:h.s.sandbox.teams[1].id}});
 const sample=h.api.preview(h.s);assert.equal(sample.card.f.published.details.grade,'New XI');assert.ok(sample.state.data.players.every(p=>p.name.endsWith('Sample')));
 assert.match(h.node('socialContent').innerHTML,/Sample lineup until a team is published/);
});
test('a club without grades or fixtures starts with one sample team',()=>{
 const h=sandbox();h.s.data.fixtures=[];h.s.data.assets=[];h.api.render(h.s);
 assert.equal(h.s.sandbox.teams.length,1);assert.equal(h.api.preview(h.s).card.f.published.details.grade,'Sample team');
});
test('two-day copies keep the correct player photos and independent slider positions',()=>{
 const h=sandbox(),f=h.s.data.fixtures[0];f.published.details.days.push({date:'2026-10-17'});
 f.published.players.push({id:'day-two',name:'Day Two Player'});f.published.slots[0].d2='day-two';
 h.s.data.assets.push({id:'day-two-photo',roster_id:'day-two',kind:'photo',path:'day-two-photo'});
 h.api.render(h.s);h.positions[0].value=-8;h.positions[0].oninput();
 h.node('sandboxDay').onchange({target:{value:'1'}});let p=h.api.preview(h.s);
 assert.equal(p.card.day,1);assert.equal(p.card.split,true);assert.equal(p.card.f.features[1].roster_id,'day-two');assert.equal(p.state.photoPositions[p.card.key].x,0);
 h.positions[1].value=6;h.positions[1].oninput();h.node('sandboxDay').onchange({target:{value:'0'}});p=h.api.preview(h.s);
 assert.equal(p.state.photoPositions[p.card.key].x,-8);assert.equal(p.state.photoPositions[p.card.key].y,-3);assert.equal(f.features[0].photo_x,4);
});
test('the photo adjustment group has one size slider and one control for each axis',()=>{
 const h=sandbox();h.api.render(h.s);const html=h.node('socialContent').innerHTML;
 const group=html.slice(html.indexOf('<div class="sandbox-sliders">'),html.indexOf('</div></div><div class="sandbox-fields">'));
 assert.match(group,/data-sandbox-setting="photo_scale"/);assert.match(group,/data-sandbox-position="x"/);assert.match(group,/data-sandbox-position="y"/);assert.doesNotMatch(html,/data-sandbox-setting="photo_shift"/);
 assert.equal(h.node('sandboxApply').disabled,true);h.inputs[0].oninput();assert.equal(h.node('sandboxApply').disabled,false);
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
