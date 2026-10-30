import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {mountObservationFixtures} from '../match-observation-fixtures.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const fixture=(id,extra={})=>({id,group_id:'g1',grade:'First Grade',match_date:'2026-10-31',days:[{date:'2026-10-31'}],format_key:'limited_overs',opposition:'Visitors',start:'10:00',ground:'City Oval',...extra});
async function setup({fixtures=[fixture('f1')],matches=[],links=[],initialMatch='',initialFixture=null,initialInnings=null,linked=true}={}){
 const dom=new JSDOM('<main></main>'),doc=dom.window.document,seen=[],arrivals=[],saves=[];let allow=true,current=true,options;
 const render=(data,id)=>{seen.push(id);const m=data.matches.find(x=>x.id===id);return `<section id="staffDevelopmentForm" data-match-id="${id||''}"><div class="development-form-head"></div><p data-observation-match-summary></p><input id="staffMatchDate" value="${m?.match_date||'2026-10-31'}"><select id="staffMatchFormat"><option value="limited_overs"></option><option value="long_form"></option><option value="t20"></option></select><input id="staffMatchOpposition"><div data-observation-body><div class="field"><select id="staffMatchInningsNumber">${[1,2].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></div><textarea id="staffMatchNote">${m?.note||''}</textarea><div data-match-arrival></div></div><button id="saveStaffMatchFeedback">Save</button><button id="cancelStaffDevelopment">Cancel</button><p id="staffDevelopmentStatus"></p></section>`;};
 const feedback={matches};doc.querySelector('main').innerHTML=render(feedback,initialMatch);
 const h={form:doc.querySelector('section'),player:{id:'p',groups:[{id:'g1'}]},feedback,clubId:'c',current:f=>current&&doc.querySelector('section')===f,today:()=> '2026-10-31',format:v=>v,linked:()=>linked,
  initialFixture,initialInnings,load:async()=>({groups:[{id:'g1',name:'First Grade'},{id:'g2',name:'Second Grade'}],fixtures,player_innings:links,linked_fixture_id:links.find(l=>l.match_id===initialMatch)?.fixture_id||null}),
  loadFeedback:async()=>feedback,render,wireChoices(){},wireSave:o=>{options=o;doc.querySelector('#saveStaffMatchFeedback').onclick=()=>{const values={};o.validate(values);saves.push({...o.extraArgs,values});};},
  close(){},canLeave:()=>allow,discard(){},restoring:()=>false,baseline(){},bindArrivals:(form,f)=>arrivals.push(f.id)};
 await mountObservationFixtures(h);
 const choose=(id,value)=>{const field=doc.getElementById(id);field.value=value;field.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 return {dom,doc,seen,arrivals,saves,choose,options:()=>options,setAllow:v=>allow=v,setCurrent:v=>current=v};
}
test('date and usual team choose the saved fixture, including unpublished teams, without manual identity fields',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());assert.equal(h.doc.querySelector('#staffObservationFixture').value,'f1');
 assert.equal(h.doc.querySelector('#staffMatchDate').value,'2026-10-31');assert.equal(h.doc.querySelector('#staffMatchFormat').value,'limited_overs');assert.equal(h.doc.querySelector('#staffMatchOpposition').value,'Visitors');
 assert.match(h.doc.querySelector('[data-observation-match-summary]').textContent,/Visitors.*10:00.*City Oval/);
 assert.doesNotMatch(h.doc.body.textContent,/New match|New fixture/);h.doc.querySelector('#saveStaffMatchFeedback').click();assert.equal(h.saves[0].p_fixture_id,'f1');assert.equal(h.saves[0].values.fixture_id,'f1');
});
test('date changes auto-select uniquely; Day 2 retains canonical start and separate innings',async t=>{
 const h=await setup({fixtures:[fixture('long',{format_key:'long_form',days:[{date:'2026-10-31'},{date:'2026-11-07'}]}),fixture('later',{match_date:'2026-11-14',days:[{date:'2026-11-14'}],opposition:'Later visitors'})]});t.after(()=>h.dom.window.close());
 h.choose('staffObservationDate','2026-11-07');assert.equal(h.doc.querySelector('#staffObservationFixture').value,'long');assert.equal(h.doc.querySelector('#staffMatchDate').value,'2026-10-31');
 h.choose('staffMatchInningsNumber','2');assert.equal(h.doc.querySelector('#staffMatchInningsNumber').value,'2');assert.equal(h.doc.querySelector('#staffMatchDate').value,'2026-10-31');
 h.choose('staffObservationDate','2026-11-14');assert.equal(h.doc.querySelector('#staffObservationFixture').value,'later');assert.equal(h.doc.querySelector('#staffMatchInningsNumber').value,'1');
});
test('two same-day games require an explicit fixture and distinguish their times',async t=>{
 const h=await setup({fixtures:[fixture('morning',{format_key:'t20'}),fixture('afternoon',{format_key:'t20',start:'14:00'})]});t.after(()=>h.dom.window.close());
 assert.equal(h.doc.querySelector('#staffObservationFixture').value,'');assert.equal(h.doc.querySelector('#saveStaffMatchFeedback').disabled,true);
 assert.match(h.doc.querySelector('#staffObservationFixture').textContent,/10:00.*14:00/);
 h.choose('staffObservationFixture','afternoon');assert.equal(h.options().extraArgs.p_fixture_id,'afternoon');assert.match(h.doc.querySelector('[data-observation-match-summary]').textContent,/14:00/);
});
test('choosing a fixture reopens its existing innings and observation instead of a fresh empty form',async t=>{
 const m={id:'m',innings_number:1,match_date:'2026-10-31',format_key:'limited_overs',opposition:'Visitors',note:'Previously recorded'};
 const h=await setup({matches:[m],links:[{match_id:'m',innings_number:1,fixture_id:'f1'}]});t.after(()=>h.dom.window.close());assert.equal(h.seen.at(-1),'m');assert.equal(h.doc.querySelector('#staffMatchNote').value,'Previously recorded');
});
test('no match offers fixture management guidance and blocks observation writes for either product',async t=>{
 for(const linked of [true,false]){const h=await setup({fixtures:[],linked});t.after(()=>h.dom.window.close());assert.equal(h.doc.querySelector('#saveStaffMatchFeedback').disabled,true);assert.match(h.doc.body.textContent,linked?/Mirelion Select/:/download or add it in Fixtures/);assert.equal(h.doc.querySelector('[data-observation-body]').hidden,true);}
});
test('discard refusal or a pending save retains the old fixture and typed note',async t=>{
 const h=await setup();t.after(()=>h.dom.window.close());h.doc.querySelector('#staffMatchNote').value='Unsaved';h.setAllow(false);h.choose('staffObservationDate','2026-11-01');assert.equal(h.doc.querySelector('#staffObservationDate').value,'2026-10-31');assert.equal(h.doc.querySelector('#staffMatchNote').value,'Unsaved');assert.equal(h.options().extraArgs.p_fixture_id,'f1');
});
test('recovered new-innings drafts reopen the correct fixture and innings before restoring fields',async t=>{
 const h=await setup({fixtures:[fixture('future',{match_date:'2026-11-07',days:[{date:'2026-11-07'}],format_key:'long_form'})],initialFixture:'future',initialInnings:2});t.after(()=>h.dom.window.close());assert.equal(h.doc.querySelector('#staffObservationDate').value,'2026-11-07');assert.equal(h.doc.querySelector('#staffObservationFixture').value,'future');assert.equal(h.doc.querySelector('#staffMatchInningsNumber').value,'2');
});
