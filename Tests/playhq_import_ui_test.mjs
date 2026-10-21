import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createPlayHQImport} from '../playhq-import.js';import {createFixtureResults} from '../fixture-results.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,0));};
test('import preserves grade mapping and applies only a reviewed fixture change',async()=>{
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.getElementById('host'),calls=[];
 const day={date:'2099-12-27',time:'12:00',ground:'Oval'},details={days:[{...day,start:day.time}],opposition:'Visitors',format:'limited_overs'};
 const ctx={can_edit:true,revision:0,selection_groups:[{id:'selection-group',name:'Club teams'}],grades:[{id:'group',name:'Firsts',selection_group_id:'selection-group'}],expected_grades:[{id:'group',name:'Firsts'}],mappings:[]};
 const api={rpc:async(name,a)=>{calls.push({name,...a});if(name==='club_selection_groups'){if(a.p_action==='save')ctx.mappings=[{season_id:'season',team_id:'team',grade_id:'group'}];return {data:ctx};}return {data:name==='playhq_fixture_review'?a.p_action==='list'?{changes:[{fixture_id:'fixture',grade:'Firsts',opposition:'Visitors',pending:true}]}:a.p_action==='preview'?{fixture_id:'fixture',revision:4,token:'review-token',before:details,after:{...details,opposition:'New visitors'},blockers:[],warnings:[],can_apply:true}:{saved:true}:a.p_action==='status'?{configured:true,admin:false,verified:false}:{fixture_ids:['fixture']}};},functions:{invoke:async(name,{body})=>{calls.push({name,body});return {data:body.action==='seasons'?{seasons:[{id:'season',name:'2026/27'}]}:body.action==='teams'?{teams:[{id:'team',grade:{id:'grade',name:'1st Grade'}}]}:{preview_id:'preview',fixtures:[{source_match_id:'match',days:[day],opposition:'Visitors',format:'limited_overs'}]}};}}};
 let refreshed=0,manual=0;const ui=createPlayHQImport({supabase:api,clubId:()=> 'club',confirm:()=>true,alert:()=>{},refresh:async()=>refreshed++,manual:()=>manual++,here:()=>true,openFixture:()=>{},back:()=>{}});
 ui.mount(host,{groups:[{id:'group',name:'Firsts'}],existing:[]});await settle();host.querySelector('[data-phq-seasons]').click();await settle();const season=host.querySelector('[data-phq-season]');season.value='season';season.dispatchEvent(new dom.window.Event('change'));await settle();
 let group=host.querySelector('[data-sg-import-group]');group.value='selection-group';group.dispatchEvent(new dom.window.Event('change'));host.querySelector('[data-sg-form]').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));assert.equal(calls.filter(c=>c.p_action==='save').length,0);let match=host.querySelector('[data-sg-align]');match.value='team';match.dispatchEvent(new dom.window.Event('change'));host.querySelector('[data-sg-form]').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await settle();
 host.querySelector('[data-sg-fixtures]').click();await settle();assert.ok(host.querySelector('[data-phq-import]'));assert.equal(calls.filter(c=>c.p_action==='import').length,0,'Preview does not import');host.querySelector('[data-phq-import]').click();await settle();assert.equal(calls.find(c=>c.p_action==='import').p_data.group_id,'group');
 host.querySelector('[data-phq-review]').click();await settle();assert.match(host.textContent,/New visitors/);assert.equal(calls.filter(c=>c.p_action==='apply').length,0);host.querySelector('[data-phq-apply]').click();await settle();assert.deepEqual(calls.find(c=>c.p_action==='apply').p_data,{fixture_id:'fixture',revision:4,token:'review-token'});assert.equal(refreshed,3);host.querySelector('[data-phq-manual]').click();assert.equal(manual,1);
});
test('Check scores now uses the linked fixture and keeps manual import available',async()=>{
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.getElementById('host'),calls=[];
 const ui=createFixtureResults({escape:v=>String(v??''),here:()=>true,alert:()=>{},confirm:()=>true,extractUrl:()=>'',supabase:{rpc:async()=>({data:{playhq:{linked:true,can_check:true,pending_change:true},fixtures:[{id:'fixture',grade:'Firsts',days:[{date:'2026-10-17'}],format:'limited_overs'}],cards:[],candidates:[],can_import:true}}),functions:{invoke:async(name,{body})=>{calls.push({name,body});return {data:{checked:1}};}}}});
 ui.mount(host,{clubId:'club',fixtureId:'fixture'});await settle();host.querySelector('[data-phq-check="results"]').click();await settle();assert.deepEqual(calls,[{name:'playhq-sync',body:{club_id:'club',fixture_id:'fixture',action:'check',kind:'results'}}]);assert.ok(host.querySelector('[data-fixture-score-url]'),'Manual PlayCricket link fallback remains available');assert.ok(host.querySelector('[data-phq-review]'));
});
for(const mixed of [false,true])test(`fixture preview handles ${mixed?'mixed ready and pending':'only pending'} source grades without blocking saved groups`,async()=>{
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.getElementById('host'),calls=[];
 let sourceTeams=[{id:'pending',name:"Example Women's team",grade:null},...(mixed?[{id:'ready',grade:{id:'source-grade',name:'First XI'}}]:[])];
 const ctx={can_edit:true,revision:1,selection_groups:[{id:'squad',name:'Club squad'}],expected_grades:[],
  grades:sourceTeams.map(t=>({id:'local-'+t.id,name:t.name||t.grade.name,selection_group_id:'squad'})),
  mappings:sourceTeams.map(t=>({season_id:'season',team_id:t.id,grade_id:'local-'+t.id,source_grade_id:t.grade?.id||null}))};
 const api={rpc:async(name,a)=>({data:name==='club_selection_groups'?ctx:name==='playhq_fixture_review'?{changes:[]}:a.p_action==='status'?{configured:true,admin:false}:{fixture_ids:['fixture']}}),
  functions:{invoke:async(name,{body})=>{calls.push(body);return {data:body.action==='seasons'?{seasons:[{id:'season',name:'Current season'}]}:body.action==='teams'?{catalogue_id:'catalogue',teams:sourceTeams}:{preview_id:'preview-'+body.team_id,fixtures:[{source_match_id:'match-'+body.team_id,days:[{date:'2099-10-03'}],opposition:'Visitors',format:'limited_overs'}]}};}}};
 const ui=createPlayHQImport({supabase:api,clubId:()=> 'club',confirm:()=>true,alert:()=>{},refresh:async()=>{},manual:()=>{},here:()=>true,back:()=>{}});
 ui.mount(host,{groups:ctx.grades,existing:[]});await settle();host.querySelector('[data-phq-seasons]').click();await settle();
 const choose=()=>{const el=host.querySelector('[data-phq-season]');el.value='season';el.dispatchEvent(new dom.window.Event('change'));};choose();await settle();
 host.querySelector('[data-sg-fixtures]').click();await settle();
 assert.match(host.querySelector('[data-phq-awaiting]').textContent,/Example Women's team/);
 assert.equal(host.querySelector('[role="alert"]'),null);assert.equal(!!host.querySelector('[data-phq-import]'),mixed);
 assert.deepEqual(calls.filter(c=>c.action==='preview').map(c=>c.team_id),mixed?['ready']:[],'Pending teams never make an invalid fixture request');
 assert.ok(host.querySelector('[data-phq-manual]'),'Manual fixtures remain available');
 sourceTeams=sourceTeams.map(t=>t.id==='pending'?{...t,grade:{id:'new-source-grade',name:'Published grade'}}:t);
 choose();await settle();host.querySelector('[data-sg-fixtures]').click();await settle();
 assert.equal(host.querySelector('[data-phq-awaiting]'),null);assert.ok(host.querySelector('[data-phq-import]'));
 const preview=calls.find(c=>c.action==='preview'&&c.team_id==='pending');assert.equal(preview.grade_id,'new-source-grade');
 assert.equal(ctx.grades.length,mixed?2:1,'Later source details reuse the saved club grades');
});
