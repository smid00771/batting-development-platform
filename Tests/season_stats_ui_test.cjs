const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
const data=()=>({season:{start:'2026-07-01',end:'2027-06-30',label:'2026/27',revision:0},today:'2026-10-17',can_set_season:true,fixtures:[],cards:[],identities:[]});
const teams=[{id:'first',level:1,grade:'First',competition:'District',format:'long_form',slots:[{d1:'r1'}]},{id:'second',level:2,grade:'Second',competition:'District',format:'long_form',slots:[{d1:'r2'}]}];
async function harness(response=data()) {
 const {createSeasonStatsPanel}=await import('../season-stats-panel.js'),dom=new JSDOM('<main><div id="stats"></div></main>'),host=dom.window.document.getElementById('stats'),calls=[],messages=[];
 let close=0,navigations=0,allowed=true,inside=true,reply=async()=>({data:response,error:null});
 const panel=createSeasonStatsPanel({supabase:{rpc:async(name,args)=>{calls.push({name,args});return reply(name,args);}},here:()=>inside,close:()=>close++,navigate:()=>navigations++,alert:m=>messages.push(m),confirm:()=>allowed,openFixture:(s,id)=>messages.push(id)});
 const options={clubId:'club',scope:'club:user',state:{mode:'batting',format:'long_form'},teams:structuredClone(teams),roster:[{id:'r1',name:'Alex'},{id:'r2',name:'Jordan'}]},s=panel.mount(host,options);await tick();
 return {panel,s,options,dom,host,calls,messages,close:()=>close,navigations:()=>navigations,reply:fn=>reply=fn,inside:v=>inside=v,allow:v=>allowed=v,click:sel=>host.querySelector(sel).click(),input(sel,value){const el=host.querySelector(sel);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));},submit(){host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}};
}
test('modes and grade comparison visibly change state, with no invented promotion rating',async()=>{
 const h=await harness();assert.equal(h.host.querySelector('[data-stats-mode=batting]').getAttribute('aria-pressed'),'true');
 h.click('[data-stats-mode=bowling]');assert.equal(h.host.querySelector('[data-stats-mode=bowling]').getAttribute('aria-pressed'),'true');assert.match(h.host.textContent,/No bowling figures/);
 h.click('[data-stats-compare]');assert.equal(h.host.querySelector('[data-stats-compare]').getAttribute('aria-pressed'),'true');assert.equal(h.host.querySelectorAll('[role=row]').length,2);assert.match(h.host.textContent,/Alex/);assert.match(h.host.textContent,/Jordan/);assert.match(h.host.textContent,/No linked season figures/);assert.doesNotMatch(h.host.textContent,/Promote|Worth reviewing/);
 h.click('[data-stats-mode=batting]');assert.equal(h.s.state.compare,false);assert.equal(h.host.querySelector('[role=table]'),null);assert.equal(h.navigations(),3);
});
test('refresh acknowledges progress, ignores repeat clicks and recovers from failure',async()=>{
 const h=await harness();let finish;h.reply(()=>new Promise(r=>finish=r));h.click('[data-stats-refresh]');assert.equal(h.host.querySelector('[data-stats-refresh]').disabled,true);assert.match(h.host.textContent,/Updating/);h.click('[data-stats-refresh]');assert.equal(h.calls.length,2);
 finish({data:null,error:{message:'Connection lost'}});await tick();assert.equal(h.host.querySelector('[data-stats-refresh]').disabled,false);assert.match(h.host.querySelector('[role=alert]').textContent,/Connection lost/);
 h.reply(async()=>({data:data()}));h.click('[data-stats-refresh]');await tick();assert.equal(h.host.querySelector('[role=alert]'),null);
});
test('an initial access error exposes a working retry and no protected stats',async()=>{
 const h=await harness();h.inside(false);const host=h.dom.window.document.createElement('div');h.host.replaceWith(host);h.inside(true);h.reply(async()=>({error:{message:'Selection access is required'}}));h.panel.mount(host,h.options);await tick();
 assert.match(host.textContent,/Selection access is required/);assert.equal(host.querySelector('[data-stats-mode]'),null);assert.match(host.querySelector('[data-stats-refresh]').textContent,/Try again/);
 h.reply(async()=>({data:data()}));host.querySelector('[data-stats-refresh]').click();await tick();assert.ok(host.querySelector('[data-stats-mode]'));
});
test('season draft survives redraws and failed saves; saving blocks departure',async()=>{
 const h=await harness();h.input('[name=start]','2026-08-01');h.click('[data-stats-mode=bowling]');assert.equal(h.host.querySelector('[name=start]').value,'2026-08-01');
 let finish;h.reply(()=>new Promise(r=>finish=r));h.submit();assert.equal(h.panel.canLeave(),false);assert.match(h.messages.at(-1),/wait/);assert.match(h.host.querySelector('[type=submit]').textContent,/Saving/);
 assert.deepEqual(h.calls.at(-1).args.p_data,{start:'2026-08-01',end:'2027-06-30',expected_revision:0});
 finish({error:{message:'Dates changed elsewhere'}});await tick();assert.equal(h.host.querySelector('[name=start]').value,'2026-08-01');assert.match(h.host.textContent,/Dates changed elsewhere/);
 h.allow(false);h.click('[data-stats-close]');assert.equal(h.close(),0);
 h.reply(async()=>({data:{...data(),season:{...data().season,start:'2026-08-01',revision:1}}}));h.submit();await tick();assert.equal(h.s.state.seasonDraft,undefined);assert.match(h.host.textContent,/Season dates saved/);h.click('[data-stats-close]');assert.equal(h.close(),1);
});
test('date validation is local and selectors have no date editor',async()=>{
 const h=await harness();h.input('[name=end]','2026-01-01');h.submit();assert.equal(h.calls.length,1);assert.match(h.host.textContent,/dates in order/);
 const selector=await harness({...data(),can_set_season:false});assert.equal(selector.host.querySelector('[data-stats-season]'),null);
});
test('switching clubs or leaving while loading cannot display the old response',async()=>{
 const h=await harness();let resolve;h.reply(()=>new Promise(r=>resolve=r));h.click('[data-stats-refresh]');
 const host=h.dom.window.document.createElement('div');h.host.replaceWith(host);h.reply(async()=>({data:{...data(),season:{...data().season,label:'New club season'}}}));h.panel.mount(host,{...h.options,clubId:'other',scope:'other:user',state:{}});await tick();resolve({data:{...data(),season:{...data().season,label:'Old club private'}}});await tick();assert.match(host.textContent,/New club season/);assert.doesNotMatch(host.textContent,/Old club private/);
});
test('board changes update the compared lineup without another scorecard request',async()=>{
 const h=await harness();h.click('[data-stats-compare]');const count=h.calls.length;
 const changed=structuredClone(teams);changed[0].slots=[{d1:'r2'}];h.panel.mount(h.host,{...h.options,teams:changed});
 assert.equal(h.calls.length,count);assert.doesNotMatch(h.host.querySelector('[role=table]').textContent,/Alex/);assert.match(h.host.querySelector('[role=table]').textContent,/Jordan/);
});
test('fixture attention opens the existing fixture details and normal matches do not add clutter',async()=>{
 const h=await harness({...data(),fixtures:[{id:'missing',grade:'First',format:'long_form',competition:'District',days:[{date:'2026-10-10'}]}]});
 assert.match(h.host.textContent,/1 match needs attention/);h.click('[data-stats-fixture]');assert.equal(h.messages.at(-1),'missing');
 const empty=await harness();assert.equal(empty.host.querySelector('.ss-issues'),null);
});
test('demo bundles exactly the shipped engine, panel and adapter',()=>{
 const demo=fs.readFileSync('demo.html','utf8');for(const file of ['season-stats.js','season-stats-panel.js','season-stats-demo.js']){
  const source=fs.readFileSync(file,'utf8').replace(/^import .*\n/,'').replaceAll('export ','').trim();assert.ok(demo.includes(source),file+' must be rebundled');
 }
});
