const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
const data=()=>({season:{start:'2026-07-01',end:'2027-06-30',label:'2026/27',revision:0},today:'2026-10-17',can_set_season:true,fixtures:[],cards:[],identities:[]});
const teams=[{id:'first',level:1,grade:'First',competition:'District',format:'long_form',slots:[{d1:'r1'}]},{id:'second',level:2,grade:'Second',competition:'District',format:'long_form',slots:[{d1:'r2'}]}];
async function harness(response=data(), overrides={}, hooks={}) {
 const {createSeasonStatsPanel}=await import('../season-stats-panel.js'),dom=new JSDOM('<main><div id="stats"></div></main>'),host=dom.window.document.getElementById('stats'),calls=[],messages=[];
 let close=0,navigations=0,allowed=true,inside=true,reply=async()=>({data:response,error:null});
 const panel=createSeasonStatsPanel({supabase:{rpc:async(name,args)=>{calls.push({name,args});return reply(name,args);}},here:()=>inside,close:()=>close++,navigate:()=>navigations++,alert:m=>messages.push(m),confirm:()=>allowed,openFixture:(s,id)=>messages.push(id),...hooks});
 const options={clubId:'club',scope:'club:user',state:{mode:'batting',format:'long_form'},teams:structuredClone(teams),roster:[{id:'r1',name:'Alex'},{id:'r2',name:'Jordan'}],...overrides},s=panel.mount(host,options);await tick();
 return {panel,s,options,dom,host,calls,messages,close:()=>close,navigations:()=>navigations,reply:fn=>reply=fn,inside:v=>inside=v,allow:v=>allowed=v,click:sel=>host.querySelector(sel).click(),input(sel,value){const el=host.querySelector(sel);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));},submit(){host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}};
}
test('modes and grade comparison visibly change state, with no invented promotion rating',async()=>{
 const h=await harness();assert.equal(h.host.querySelector('[data-stats-mode=batting]').getAttribute('aria-pressed'),'true');
 h.click('[data-stats-mode=bowling]');assert.equal(h.host.querySelector('[data-stats-mode=bowling]').getAttribute('aria-pressed'),'true');assert.match(h.host.textContent,/No bowling figures/);
 h.click('[data-stats-compare]');assert.equal(h.host.querySelector('[data-stats-compare]').getAttribute('aria-pressed'),'true');assert.equal(h.host.querySelectorAll('[role=row]').length,2);assert.match(h.host.textContent,/Alex/);assert.match(h.host.textContent,/Jordan/);assert.match(h.host.textContent,/No linked season figures/);assert.doesNotMatch(h.host.textContent,/Promote|Worth reviewing/);
 assert.equal(h.host.querySelector('[data-stats-compare-mode=bowling]').getAttribute('aria-pressed'),'true');
 h.click('[data-stats-mode=batting]');assert.equal(h.s.state.compare,false);assert.equal(h.host.querySelector('[role=table]'),null);assert.equal(h.navigations(),3);
});
test('comparison names open the exact player and respect draft and access guards',async()=>{
 const opened=[],h=await harness(data(),{}, {canOpenPlayer:()=>true,openPlayer:(s,id)=>opened.push(id)});
 h.click('[data-stats-compare]');h.click('[data-stats-open-player="r2"]');assert.deepEqual(opened,['r2']);
 assert.match(h.host.querySelector('[data-stats-open-player="r1"]').getAttribute('aria-label'),/Player attributes for Alex/);
 h.input('[name=start]','2026-08-01');h.allow(false);h.click('[data-stats-open-player="r1"]');assert.deepEqual(opened,['r2']);
 h.allow(true);h.click('[data-stats-open-player="r1"]');assert.deepEqual(opened,['r2','r1']);
 h.inside(false);h.click('[data-stats-open-player="r2"]');assert.deepEqual(opened,['r2','r1']);
 const denied=await harness(data(),{}, {canOpenPlayer:()=>false,openPlayer:()=>assert.fail('No attribute access')});
 denied.click('[data-stats-compare]');assert.equal(denied.host.querySelector('[data-stats-open-player]'),null);
});
test('stats links use confirmed roster IDs and do not toggle match history',async()=>{
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),f=selectionEvidenceFixture(),opened=[];
 const h=await harness(f.context,{teams:f.teams,roster:f.roster},{canOpenPlayer:()=>true,openPlayer:(s,id)=>opened.push(id)});
 const button=h.host.querySelector('[data-stats-open-player]'),row=button.closest('details');
 assert.ok(f.roster.some(p=>p.id===button.dataset.statsOpenPlayer));assert.equal(row.open,false);
 button.click();assert.deepEqual(opened,[button.dataset.statsOpenPlayer]);assert.equal(row.open,false);
 h.click('[data-stats-refresh]');await tick();h.click('[data-stats-open-player]');assert.equal(opened.length,2);
 const unlinked=structuredClone(f.context);unlinked.identities=[];
 const other=await harness(unlinked,{teams:f.teams,roster:f.roster},{canOpenPlayer:()=>true,openPlayer:()=>assert.fail('Unconfirmed source identity')});
 assert.equal(other.host.querySelector('[data-stats-rows] [data-stats-open-player]'),null);
});
test('batting leads with descending average and visible SR, keeping missing and unbeaten figures honest',async()=>{
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),f=selectionEvidenceFixture();
 const cards=f.context.cards.filter(c=>c.fixture_id.startsWith('match-1-'));
 cards.forEach((card,index)=>{
  const bat=card.scorecard.innings[0].batters;
  Object.assign(bat[0],{runs:100,status:index?'did_not_bat':'played',balls:80});
  Object.assign(bat[1],{runs:80});
  bat[2].not_out=true;
  bat[3].runs=0;
  bat[4].balls=null;
  if(index===0)bat[5].importable=false;
 });
 const h=await harness(f.context,{teams:f.teams,roster:f.roster});
 const rows=()=>[...h.host.querySelectorAll('[data-stats-player]')];
 const value=(row,key)=>row.querySelector(`summary [data-stat="${key}"] strong`).textContent;
 const named=name=>rows().find(row=>row.querySelector('.ss-name').textContent.startsWith(name));
 assert.equal(rows()[0],named('Alex Rowan'),'One innings at 100 ranks above 320 runs at an average of 80');
 assert.equal(rows()[1],named('Jamie Quinn'));
 assert.equal(value(rows()[0],'average'),'100.00');assert.equal(value(rows()[0],'strike_rate'),'125.00');
 assert.equal(value(rows()[0],'innings'),'1');assert.equal(value(rows()[0],'not_outs'),'0');
 assert.equal(value(named('Morgan Lee'),'average'),'—');assert.match(named('Morgan Lee').textContent,/No dismissals yet/);
 assert.equal(value(named('Riley Hart'),'strike_rate'),'—');
 assert.equal(value(named('Taylor Blake'),'average'),'0.00');assert.equal(value(named('Taylor Blake'),'strike_rate'),'0.00');
 assert.equal(value(named('Casey Reid'),'average'),'—');assert.equal(value(named('Casey Reid'),'strike_rate'),'—');
 const firstMissing=rows().findIndex(row=>value(row,'average')==='—');
 assert.ok(rows().slice(firstMissing).every(row=>value(row,'average')==='—'));
 assert.equal(rows()[0].querySelector('summary [data-evidence-open]'),null);
 assert.ok(rows()[0].querySelector('.ss-detail [data-evidence-open]'),'Full form labels remain in the expanded detail');
 h.click('[data-stats-refresh]');await tick();assert.equal(rows()[0],named('Alex Rowan'));
 assert.equal(h.calls.length,2);
});
test('player search stays available for small and empty results and preserves opened history',async()=>{
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),f=selectionEvidenceFixture();
 const h=await harness(f.context,{teams:f.teams,roster:f.roster});
 const first=h.host.querySelector('.ss-row'),name=first.querySelector('.ss-name').textContent.split('1st Grade')[0].split('2nd Grade')[0];
 first.open=true;h.input('[data-stats-search]',name);
 assert.equal(h.host.querySelector('.ss-row').open,true);assert.equal(h.calls.length,1);
 h.input('[data-stats-search]','zzzz-no-player');assert.match(h.host.querySelector('[data-stats-rows]').textContent,/No matching players/);
 assert.ok(h.host.querySelector('[data-stats-search]'));
 h.input('[data-stats-search]','');assert.ok(h.host.querySelectorAll('.ss-row').length>1);
 h.click('[data-stats-mode=bowling]');assert.ok(h.host.querySelector('summary [data-stat=bowling_average]'));assert.equal(h.calls.length,1);
 const empty=await harness();assert.ok(empty.host.querySelector('[data-stats-search]'));
});
test('comparison toggles batting and bowling without losing teams, date, focus or navigation state',async()=>{
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),f=selectionEvidenceFixture();
 const h=await harness(f.context,{teams:f.teams,roster:f.roster});h.click('[data-stats-compare]');
 assert.equal(h.host.querySelector('[data-stats-date]').value,'published');assert.equal(h.host.querySelector('[data-stats-compare-mode=batting]').getAttribute('aria-pressed'),'true');
 change(h,'[data-stats-date]','2026-10-24');change(h,'[data-stats-team=firstTeam]','team-2');
 const selection=()=>[h.s.state.firstTeam,h.s.state.secondTeam,h.s.state.compareDate,h.s.state.format];
 const chosen=selection(),cell=()=>h.host.querySelectorAll('[role=cell]')[8].textContent;
 assert.match(cell(),/Pat Hart35 average140 runs · 4 inns/);
 h.click('[data-stats-compare-mode=bowling]');assert.equal(h.s.state.compare,true);assert.equal(h.s.state.mode,'bowling');assert.deepEqual(selection(),chosen);
 assert.match(cell(),/Pat Hart8 average12 wickets · 32\.0 overs · 4 inns3 Econ · 16 S\/R/);assert.doesNotMatch(cell(),/140 runs/);
 assert.match(h.host.querySelector('.ss-compare').getAttribute('aria-label'),/bowling figures/);assert.equal(h.dom.window.document.activeElement.dataset.statsCompareMode,'bowling');
 assert.equal(h.host.querySelector('[data-stats-compare]').getAttribute('aria-pressed'),'true');assert.equal(h.calls.length,1);assert.equal(h.navigations(),4);
 assert.ok(h.host.querySelector('.ss-compare [data-evidence-open]'),'Existing evidence details remain available');
 h.click('[data-stats-refresh]');await tick();assert.equal(h.s.state.mode,'bowling');assert.deepEqual(selection(),chosen);assert.match(cell(),/12 wickets/);
 h.click('[data-stats-compare-mode=batting]');assert.deepEqual(selection(),chosen);assert.match(cell(),/140 runs · 4 inns/);assert.equal(h.dom.window.document.activeElement.dataset.statsCompareMode,'batting');
 h.panel.mount(h.host,{...h.options,state:{...h.s.state,mode:'bowling'}});assert.match(cell(),/12 wickets/);assert.equal(h.host.querySelector('[data-stats-compare-mode=bowling]').getAttribute('aria-pressed'),'true');
});

test('all season players shows both grade records after a player moves, without inventing a batting position',async()=>{
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),f=selectionEvidenceFixture();
 const moved=f.roster[0];
 f.context.identities.find(p=>p.source_id==='source-g2p0').roster_id=moved.id;
 f.teams[0].slots[0]={};f.teams[0].published.slots[0]={};
 f.teams[1].slots[0]={d1:moved.id};f.teams[1].published.slots[0]={d1:moved.id};
 const opened=[],h=await harness(f.context,{teams:f.teams,roster:f.roster},{canOpenPlayer:()=>true,openPlayer:(s,id)=>opened.push(id)});
 h.click('[data-stats-compare]');assert.equal(h.host.querySelectorAll(`[data-stats-open-player="${moved.id}"]`).length,1);
 const selected=[h.s.state.firstTeam,h.s.state.secondTeam];
 change(h,'[data-stats-date]','season');
 assert.deepEqual([h.s.state.firstTeam,h.s.state.secondTeam],selected);
 assert.equal(h.host.querySelectorAll(`[data-stats-open-player="${moved.id}"]`).length,2);
 const records=[...h.host.querySelectorAll(`[data-stats-open-player="${moved.id}"]`)].map(n=>n.closest('[data-evidence-row]').textContent);
 assert.ok(records.some(text=>text.includes('10 average')&&text.includes('40 runs')));
 assert.ok(records.some(text=>text.includes('38 average')&&text.includes('152 runs')));
 assert.equal(h.host.querySelectorAll('.ss-position').length,0);
 assert.doesNotMatch(h.host.querySelector('.ss-compare').textContent,/Vacant|Line-up:/);
 const historic=h.host.querySelector(`[data-stats-open-player="${moved.id}"]`).closest('[data-evidence-row]');
 historic.querySelector('[data-evidence-open]').click();
 assert.match(h.host.querySelector('dialog').textContent,/Form guide · 1st Grade/);
 h.host.querySelector('[data-evidence-close]').click();
 h.click('[data-stats-compare-mode=bowling]');assert.equal(h.host.querySelector('[data-stats-date]').value,'season');
 h.click('[data-stats-refresh]');await tick();assert.equal(h.host.querySelectorAll(`[data-stats-open-player="${moved.id}"]`).length,2);
 h.click(`[data-stats-open-player="${moved.id}"]`);assert.deepEqual(opened,[moved.id]);
 change(h,'[data-stats-date]','published');assert.equal(h.host.querySelectorAll(`[data-stats-open-player="${moved.id}"]`).length,1);
 assert.equal(h.host.querySelector('[data-stats-compare-mode=bowling]').getAttribute('aria-pressed'),'true');
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
 assert.deepEqual(h.calls.at(-1).args.p_data,{start:'2026-08-01',end:'2027-06-30',expected_revision:0,on_demand:true});
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
test('grade comparison counts only scorecards and issues in the two displayed grades',async()=>{
 const matches=['First','Third'].map((grade,i)=>({id:'missing-'+i,grade,format:'long_form',competition:'District',days:[{date:'2026-10-10'}]}));
 const third={...structuredClone(teams[0]),id:'third',level:3,grade:'Third'};
 const h=await harness({...data(),fixtures:matches},{teams:[...structuredClone(teams),third]});
 assert.match(h.host.querySelector('.ss-issues summary').textContent,/2 matches need attention/);
 h.click('[data-stats-compare]');
 assert.equal(h.host.querySelector('.ss-issues summary').textContent,'1 match needs attention');
 assert.equal(h.host.querySelector('[data-stats-fixture]').dataset.statsFixture,'missing-0');
 const second=h.host.querySelector('[data-stats-team=secondTeam]');second.value='third';second.dispatchEvent(new h.dom.window.Event('change'));
 assert.equal(h.host.querySelector('.ss-issues summary').textContent,'2 matches need attention');
 h.click('[data-stats-mode=batting]');assert.equal(h.host.querySelector('.ss-issues summary').textContent,'2 matches need attention');
});
test('withheld source details remain visible without an actionable warning',async()=>{
 const c={snapshot_id:'hidden',our_team:'us',fixture_id:'f',scorecard:{provider:'playhq_au',match_id:'m',status:'completed',dates:['2026-10-10'],grade:'First',competition:'District',format_key:'long_form',teams:[{id:'us',players:[]}],innings:[{id:'i',number:1,team_id:'us',complete:true,batters:[{player_id:null,name:null,runs:30,importable:false}]}]}};
 const h=await harness({...data(),cards:[c],fixtures:[{id:'f',grade:'First',competition:'District',format:'long_form',days:[{date:'2026-10-10'}]}]});
 assert.equal(h.host.querySelector('.ss-issues summary').textContent,'1 source note');
 assert.ok(h.host.querySelector('.ss-source-notes'));assert.match(h.host.textContent,/those figures cannot be assigned/);
 assert.doesNotMatch(h.host.textContent,/needs attention|matches need/);
});
test('parked demo retains the statistics engine and adapter; live presentation may change independently',()=>{
 const demo=fs.readFileSync('demo.html','utf8');for(const file of ['season-stats.js','season-stats-demo.js']){
  const source=fs.readFileSync(file,'utf8').replace(/^import .*\n/,'').replaceAll('export ','').trim();assert.ok(demo.includes(source),file+' must be rebundled');
 }
});
test('new shared scores refresh an open stats panel and preserve unsaved season edits',async()=>{
 const h=await harness();h.reply(async()=>({data:{...data(),season:{...data().season,label:'Updated scores'}}}));h.panel.invalidate();await tick();assert.match(h.host.textContent,/Updated scores/);assert.equal(h.calls.length,2);
 h.input('[name=start]','2026-08-01');h.panel.invalidate();assert.equal(h.calls.length,2);assert.equal(h.host.querySelector('[name=start]').value,'2026-08-01');assert.equal(h.s.stale,true);
 h.panel.canLeave();h.panel.mount(h.host,h.options);await tick();assert.equal(h.calls.length,3);assert.equal(h.s.stale,false);
});
test('an import during a stats request reloads once after the old response arrives',async()=>{
 const h=await harness();let finish;h.reply(()=>new Promise(r=>finish=r));h.click('[data-stats-refresh]');h.panel.invalidate();h.panel.invalidate();assert.equal(h.calls.length,2);
 h.reply(async()=>({data:{...data(),season:{...data().season,label:'Newest scores'}}}));finish({data:data()});await tick();assert.equal(h.calls.length,3);assert.match(h.host.textContent,/Newest scores/);
});

const datedTeams=(day,selected=true)=>teams.map(t=>({...structuredClone(t),id:t.id+'-'+day,days:[{date:day}],competition:'NDCA',slots:selected?structuredClone(t.slots):Array.from({length:11},()=>({d1:null,d2:null}))}));
const publishedTeams=day=>datedTeams(day).map(t=>({...t,published:{details:{grade:t.grade,competition:t.competition,format:t.format,days:structuredClone(t.days)},slots:structuredClone(t.slots)}}));
const change=(h,selector,value)=>{const el=h.host.querySelector(selector);el.value=value;el.dispatchEvent(new h.dom.window.Event('change',{bubbles:true}));};
test('empty upcoming teams open the latest populated lineups, with a visible independent date choice',async()=>{
 const previous=datedTeams('2026-10-17'),upcoming=datedTeams('2026-10-24',false);
 const h=await harness(data(),{boardDate:'2026-10-24',teams:[...datedTeams('2026-10-10'),...previous,...upcoming]});
 h.click('[data-stats-compare]');
 assert.equal(h.host.querySelector('[data-stats-date]').value,'2026-10-17');
 assert.match(h.host.querySelector('[role=table]').textContent,/Alex/);assert.match(h.host.querySelector('[role=table]').textContent,/Jordan/);
 assert.equal(h.options.boardDate,'2026-10-24','Comparison does not change the Selection Board date');
 assert.deepEqual([...h.host.querySelectorAll('[data-stats-team]')].map(el=>el.selectedOptions[0].textContent),['First','Second']);
 change(h,'[data-stats-date]','2026-10-24');
 assert.equal(h.host.querySelector('[role=table]'),null);assert.match(h.host.textContent,/No players selected for these teams yet/);assert.doesNotMatch(h.host.textContent,/Vacant/);
 h.panel.mount(h.host,h.options);assert.equal(h.host.querySelector('[data-stats-date]').value,'2026-10-24','Explicit empty date remains selected after redraw');
 change(h,'[data-stats-date]','2026-10-10');assert.match(h.host.querySelector('[role=table]').textContent,/Alex/);
 assert.equal(h.calls.length,1,'Changing lineups reuses the same saved season figures');
});
test('current board lineups win when selected; partial teams retain real vacancies and day-two players',async()=>{
 const selected=datedTeams('2026-10-24');selected[0].slots=[{d1:null,d2:'r1'},{d1:null,d2:null}];
 const h=await harness(data(),{boardDate:'2026-10-24',teams:[...datedTeams('2026-10-17'),...selected]});h.click('[data-stats-compare]');
 assert.equal(h.host.querySelector('[data-stats-date]').value,'2026-10-24');assert.match(h.host.textContent,/Alex/);assert.match(h.host.textContent,/Vacant/);
});
test('cancelled and out-of-season lineups are unavailable; competition labels and boundaries stay consistent',async()=>{
 const valid=datedTeams('2026-10-17'),other=valid.map(t=>({...t,id:'other-'+t.id,competition:'Other competition'}));
 const excluded=[...datedTeams('2025-10-17'),...datedTeams('2026-10-24').map(t=>({...t,cancelled:true}))];
 const h=await harness(data(),{boardDate:'2026-10-24',teams:[...valid,...other,...excluded]});h.click('[data-stats-compare]');
 assert.deepEqual([...h.host.querySelector('[data-stats-date]').options].map(o=>o.value),['season','2026-10-17']);
 assert.deepEqual([...h.host.querySelectorAll('[data-stats-team]')].map(el=>el.selectedOptions[0].textContent),['First · NDCA','Second · NDCA']);
 const second=h.host.querySelector('[data-stats-team=secondTeam]');assert.ok([...second.options].every(o=>o.textContent.endsWith(' · NDCA')));
 change(h,'[data-stats-team=firstTeam]',other[0].id);
 assert.ok([...h.host.querySelector('[data-stats-team=secondTeam]').options].every(o=>o.textContent.endsWith(' · Other competition')));
});
test('the NDCA display label does not affect confirmed player statistics in either grade',async()=>{
 const selected=datedTeams('2026-10-17'),players=[{source_id:'source-one',roster_id:'r1',name:'Alex'},{source_id:'source-two',roster_id:'r2',name:'Jordan'}];
 const cards=selected.map((team,i)=>({snapshot_id:team.id,our_team:'us',fixture_id:team.id,scorecard:{match_id:team.id,status:'completed',dates:['2026-10-17'],grade:team.grade,competition:team.competition,format_key:team.format,teams:[{id:'us',players:[{player_id:players[i].source_id,name:players[i].name}]},{id:'them',name:'Visitors'}],innings:[{id:'batting',number:1,team_id:'us',complete:true,batters:[{player_id:players[i].source_id,name:players[i].name,status:'played',runs:40+i,not_out:false,balls:50,importable:true}]}]}}));
 const h=await harness({...data(),cards,identities:players,fixtures:selected.map(t=>({...t,match_id:t.id}))},{boardDate:'2026-10-24',teams:[...selected,...datedTeams('2026-10-24',false)]});
 h.click('[data-stats-compare]');const table=h.host.querySelector('[role=table]').textContent;
 assert.match(table,/Alex40 average40 runs/);assert.match(table,/Jordan41 average41 runs/);assert.doesNotMatch(table,/No linked season figures/);
});
test('last published teams are the default even when upcoming draft teams already have players',async()=>{
 const published=publishedTeams('2026-10-17'),draft=datedTeams('2026-10-24');draft[0].slots=[{d1:'r2'}];
 const h=await harness(data(),{boardDate:'2026-10-24',teams:[...publishedTeams('2026-10-10'),...published,...draft]});h.click('[data-stats-compare]');
 assert.equal(h.host.querySelector('[data-stats-date]').value,'published');assert.equal(h.s.state.firstTeam,'first-2026-10-17');
 assert.match(h.host.querySelector('[role=table]').textContent,/FirstLine-up: 17 Oct/);assert.match(h.host.querySelectorAll('[role=cell]')[0].textContent,/Alex/);
 change(h,'[data-stats-date]','2026-10-24');assert.match(h.host.querySelectorAll('[role=cell]')[0].textContent,/Jordan/);
 change(h,'[data-stats-date]','published');assert.match(h.host.querySelectorAll('[role=cell]')[0].textContent,/Alex/);
});
test('each grade uses its latest published snapshot and order, excluding unpublished edits',async()=>{
 const previous=publishedTeams('2026-10-17'),first=publishedTeams('2026-10-24')[0];
 first.published.slots=[{d1:'r2',d2:'r1'},{d1:'r1'}];first.slots=[{d1:'r1'}];
 const h=await harness(data(),{boardDate:'2026-10-24',teams:[...previous,first]});h.click('[data-stats-compare]');
 assert.equal(h.s.state.firstTeam,first.id);assert.equal(h.s.state.secondTeam,previous[1].id);
 const table=h.host.querySelector('[role=table]');assert.match(table.textContent,/FirstLine-up: 24 Oct/);assert.match(table.textContent,/SecondLine-up: 17 Oct/);
 const cells=table.querySelectorAll('[role=cell]');assert.match(cells[0].textContent,/JordanDay 1.*AlexDay 2/);assert.match(cells[2].textContent,/Alex/);
 first.published.slots=[{d1:'r1'}];h.panel.mount(h.host,h.options);assert.match(h.host.querySelectorAll('[role=cell]')[0].textContent,/Alex/);assert.doesNotMatch(h.host.querySelectorAll('[role=cell]')[0].textContent,/Jordan/);
});
test('cancelled and prior-season publications never replace current eligible published teams',async()=>{
 const older=publishedTeams('2025-10-17'),valid=publishedTeams('2026-10-17'),cancelled=publishedTeams('2026-10-24');
 cancelled.forEach(t=>t.published.details.cancelled=true);
 const h=await harness(data(),{boardDate:'2026-10-24',teams:[...older,...valid,...cancelled]});h.click('[data-stats-compare]');
 assert.equal(h.s.state.firstTeam,valid[0].id);assert.equal(h.s.state.secondTeam,valid[1].id);
});
test('published teams are selected within the explicit format and never switch formats implicitly',async()=>{
 const long=publishedTeams('2026-10-17'),short=publishedTeams('2026-10-24');short.forEach(t=>{t.format='t20';t.published.details.format='t20';});
 const h=await harness(data(),{boardDate:'2026-10-24',teams:[...long,...short]});h.click('[data-stats-compare]');
 const first=h.host.querySelector('[data-stats-team=firstTeam]');assert.equal(first.options.length,2);assert.ok([...first.options].every(o=>long.some(t=>t.id===o.value)));
 change(h,'[data-stats-filter=format]','t20');
 assert.equal(h.host.querySelector('[data-stats-team=firstTeam]').value,short[0].id);assert.equal(h.s.state.format,'t20');assert.equal(h.s.state.secondTeam,short[1].id);
 assert.ok([...h.host.querySelector('[data-stats-team=secondTeam]').options].every(o=>short.some(t=>t.id===o.value)));
 h.click('[data-stats-mode=batting]');h.s.state.format='long_form';h.panel.mount(h.host,h.options);h.click('[data-stats-compare]');
 assert.equal(h.s.state.firstTeam,long[0].id);assert.equal(h.s.state.secondTeam,long[1].id);
});

test('limited overs is the current-format default and long form stays an explicit empty reference view',async()=>{
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),f=selectionEvidenceFixture();
 f.context.cards.forEach(c=>c.scorecard.format_key='limited_overs');
 f.context.fixtures.forEach(t=>t.format='limited_overs');
 f.teams.forEach(t=>{t.format='limited_overs';t.published.details.format='limited_overs';});
 const h=await harness(f.context,{teams:f.teams,roster:f.roster,state:{},preferredFormat:'limited_overs'});
 assert.equal(h.host.querySelector('[data-stats-filter=format]').value,'limited_overs');
 h.click('[data-stats-compare]');assert.match(h.host.querySelector('[role=table]').textContent,/Alex Rowan10 average/);
 assert.ok(h.host.querySelector('[data-stats-filter=format]'));
 change(h,'[data-stats-filter=format]','long_form');
 assert.equal(h.s.state.compare,true);assert.equal(h.host.querySelector('[role=table]'),null);
 assert.match(h.host.textContent,/0 completed scorecards · Long form/);
 assert.match(h.host.textContent,/No comparable Long form line-ups/);
 assert.doesNotMatch(h.host.textContent,/Alex Rowan|10 average/);
 h.click('[data-stats-refresh]');await tick();assert.equal(h.s.state.format,'long_form');
 h.click('[data-stats-mode=bowling]');assert.match(h.host.textContent,/No bowling figures for Long form/);
 change(h,'[data-stats-filter=format]','limited_overs');
 assert.match(h.host.querySelector('[data-stats-rows]').textContent,/wickets/);
 h.click('[data-stats-compare]');assert.equal(h.s.state.mode,'bowling');
 assert.equal(h.s.state.firstTeam,f.teams[0].id);assert.equal(h.s.state.secondTeam,f.teams[1].id);
});

test('a published long-form lineup cannot replace the limited-overs selection and figures',async()=>{
 const {selectionEvidenceFixture}=await import('./fixtures/selection_evidence_fixture.mjs'),f=selectionEvidenceFixture();
 const short=structuredClone(f.teams).map(t=>({...t,id:'short-'+t.id,format:'limited_overs',published:{...t.published,details:{...t.published.details,format:'limited_overs'}}}));
 const shortCards=structuredClone(f.context.cards).map(c=>({...c,snapshot_id:'short-'+c.snapshot_id,fixture_id:'short-'+c.fixture_id,scorecard:{...c.scorecard,match_id:'short-'+c.scorecard.match_id,format_key:'limited_overs'}}));
 shortCards.forEach(c=>c.scorecard.innings[0].batters.forEach(b=>{if(b.status!=='did_not_bat')b.runs+=20;}));
 const shortFixtures=structuredClone(f.context.fixtures).map(t=>({...t,id:'short-'+t.id,match_id:'short-'+t.match_id,format:'limited_overs'}));
 const h=await harness({...f.context,cards:[...f.context.cards,...shortCards],fixtures:[...f.context.fixtures,...shortFixtures]},
  {teams:[...f.teams,...short],roster:f.roster,state:{format:'limited_overs',mode:'batting'}});
 h.click('[data-stats-compare]');assert.match(h.host.querySelector('[role=table]').textContent,/Alex Rowan30 average120 runs/);
 change(h,'[data-stats-filter=format]','long_form');assert.match(h.host.querySelector('[role=table]').textContent,/Alex Rowan10 average40 runs/);
 assert.doesNotMatch(h.host.querySelector('[role=table]').textContent,/30 average120 runs/);
 change(h,'[data-stats-filter=format]','limited_overs');assert.match(h.host.querySelector('[role=table]').textContent,/Alex Rowan30 average120 runs/);
 assert.equal(h.calls.length,1);
});
