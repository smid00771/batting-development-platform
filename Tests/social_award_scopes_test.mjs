import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createSocialAwardScopes,awardScopeKey,scopedAwardLabel} from '../social-award-scopes.js';
import {createSharedMatchResults,weeklyResultCoverage} from '../shared-match-results.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(choices){
 const dom=new JSDOM('<div id="controls"></div><div id="socialResults"></div>');globalThis.window=dom.window;globalThis.document=dom.window.document;
 const host=document.getElementById('controls'),s={scope:'user:club',view:'team_week'},calls=[],changed=[],saved=new Map();let fail=false,definite=false,ui;
 const all={mode:'all',ids:[],grade_ids:[],key:'all',label:'All'},options=choices||{groups:[{id:'grade',name:'Grade cricket'},{id:'masters',name:'Masters'}],grades:[{id:'first',name:'First XI',group_id:'grade'},{id:'second',name:'Second XI',group_id:'grade'},{id:'master',name:'Masters XI',group_id:'masters'}]};
 const canonical=v=>({...v,key:awardScopeKey(v),grade_ids:v.mode==='all'?[]:v.mode==='grades'?v.ids:options.grades.filter(g=>v.ids.includes(g.group_id)).map(g=>g.id),label:v.mode==='all'?'All':(v.mode==='groups'?options.groups:options.grades).filter(x=>v.ids.includes(x.id)).map(x=>x.name).join(', ')});
 const api={rpc:async(_,args)=>{calls.push(structuredClone(args));const d=args.p_data,base=saved.get(d.kind)||{kind:d.kind,award_scope:all,revision:0,...options};if(args.p_action==='scope_context')return {data:structuredClone(base)};if(fail)return {error:{message:'Lost confirmation',...(definite?{code:'P0001'}:{})}};const data={...base,award_scope:canonical(d.award_scope),revision:base.revision+1};saved.set(d.kind,data);return {data:structuredClone(data)};}};
 const draw=()=>{host.innerHTML=ui.controls(s,String,false);ui.bind(s,host);};
 ui=createSocialAwardScopes({supabase:api,here:()=>true,canEdit:()=>true,locked:()=>false,draw,message:(_,m)=>s.message=m,changed:async(_,k)=>changed.push(k)});
 return {s,ui,host,calls,changed,draw,dom,fail:(v,d=false)=>{fail=v;definite=d;}};
}
test('group choices are per award, can combine groups, and snapshot the request',async()=>{
 const t=setup();await t.ui.load(t.s,'team_week');await t.ui.save(t.s,'team_week',{mode:'groups',ids:['grade']});
 const q=await t.ui.request(t.s,'team_week');assert.equal(q.award_scope.label,'Grade cricket');assert.deepEqual(q.award_scope.grade_ids,['first','second']);
 assert.equal((await t.ui.request(t.s,'player_week')).award_scope.key,'all');
 q.award_scope.ids.push('masters');assert.deepEqual((await t.ui.request(t.s,'team_week')).award_scope.ids,['grade'],'A pending image cannot mutate the current preference');
 await t.ui.save(t.s,'team_week',{mode:'groups',ids:['grade','masters']});assert.equal((await t.ui.request(t.s,'team_week')).award_scope.grade_ids.length,3);
 assert.equal(scopedAwardLabel('Week 2',q.award_scope),'Week 2 · Grade cricket');assert.equal(scopedAwardLabel('Week 2',{mode:'all'}),'Week 2');
});
test('compact picker previews choices, cancels, rejects empty choices and applies individual grades',async()=>{
 const t=setup();await t.ui.load(t.s,'team_week');t.draw();const el=id=>document.getElementById(id);
 assert.equal(el('awardScope').open,false);assert.match(t.host.textContent,/Teams included/);assert.equal(el('awardScopeMode'),null);
 el('awardScope').open=true;el('awardScopeAll').click();assert.equal(t.ui.canLeave(t.s),false);assert.equal(t.calls.filter(c=>c.p_action==='save_scope').length,0);
 el('awardScopeApply').click();await tick();assert.match(t.host.textContent,/at least one/);assert.equal(t.calls.filter(c=>c.p_action==='save_scope').length,0);
 document.querySelector('[data-award-scope-group="grade"]').click();el('awardScopeCancel').click();assert.equal(t.ui.canLeave(t.s),true);assert.equal((await t.ui.request(t.s,'team_week')).award_scope.mode,'all');
 el('awardScopeAll').click();document.querySelector('[data-award-scope-id="first"]').click();el('awardScopeApply').click();await tick();
 assert.deepEqual((await t.ui.request(t.s,'team_week')).award_scope.ids,['first']);assert.equal(el('awardScope').open,false);assert.deepEqual(t.changed,['team_week']);
});
test('each award can split a six-team group and combine its remaining teams with another group',async()=>{
 const senior=['first','second','third','fourth','dev-navy','dev-sky'];
 const choices={groups:[{id:'senior',name:'Senior Grade Teams'},{id:'masters',name:'Masters'}],grades:[...senior.map(id=>({id,name:id,group_id:'senior'})),{id:'masters-xi',name:'Masters XI',group_id:'masters'}]};
 for(const kind of ['team_week','player_week','results','century','five_wickets']){
  const t=setup(choices);t.s.view=kind;await t.ui.load(t.s,kind);t.draw();const el=id=>document.getElementById(id),team=id=>document.querySelector(`[data-award-scope-id="${id}"]`),group=id=>document.querySelector(`[data-award-scope-group="${id}"]`);
  el('awardScopeAll').click();group('senior').click();team('dev-navy').click();team('dev-sky').click();
  assert.equal(group('senior').indeterminate,true);assert.equal(group('senior').getAttribute('aria-checked'),'mixed');
  assert.equal(el('awardScopeCount').textContent,'4 selected');el('awardScopeApply').click();await tick();
  const firstImage=await t.ui.request(t.s,kind);assert.deepEqual(firstImage.award_scope.ids,senior.slice(0,4));
  group('senior').click();group('senior').click();team('dev-navy').click();team('dev-sky').click();group('masters').click();
  assert.equal(group('masters').checked,true);assert.equal(group('senior').indeterminate,true);assert.equal(el('awardScopeCount').textContent,'3 selected');
  el('awardScopeApply').click();await tick();const secondImage=await t.ui.request(t.s,kind);
  assert.equal(secondImage.award_scope.mode,'grades');assert.deepEqual(secondImage.award_scope.ids,['dev-navy','dev-sky','masters-xi']);
  assert.deepEqual(firstImage.award_scope.grade_ids,senior.slice(0,4),'An earlier image retains its own teams');
  assert.notEqual(awardScopeKey(firstImage.award_scope),awardScopeKey(secondImage.award_scope),'Both images retain distinct collection identities');
  await t.ui.load(t.s,kind,{reload:true});t.draw();assert.equal(team('dev-navy').checked,true);assert.equal(team('first').checked,false);assert.equal(group('senior').indeterminate,true);
 }
});
test('whole groups, ungrouped teams and unchanged saved choices retain their intended scope',async()=>{
 const t=setup({groups:[{id:'a',name:'Group A'},{id:'b',name:'Group B'}],grades:[{id:'one',name:'One',group_id:'a'},{id:'two',name:'Two',group_id:'b'},{id:'loose',name:'Unassigned',group_id:null}]});await t.ui.load(t.s,'results');t.s.view='results';t.draw();
 document.getElementById('awardScopeAll').click();document.querySelector('[data-award-scope-group="a"]').click();document.querySelector('[data-award-scope-group="b"]').click();document.getElementById('awardScopeApply').click();await tick();
 assert.deepEqual((await t.ui.request(t.s,'results')).award_scope.ids,['a','b']);assert.equal((await t.ui.request(t.s,'results')).award_scope.mode,'groups');
 document.querySelector('[data-award-scope-id="loose"]').click();document.getElementById('awardScopeApply').click();await tick();
 assert.equal((await t.ui.request(t.s,'results')).award_scope.mode,'grades');assert.equal((await t.ui.request(t.s,'results')).award_scope.grade_ids.length,3);
 const saves=t.calls.filter(c=>c.p_action==='save_scope').length;
 document.querySelector('[data-award-scope-id="one"]').click();document.querySelector('[data-award-scope-id="one"]').click();document.getElementById('awardScopeApply').click();await tick();
 assert.equal(t.calls.filter(c=>c.p_action==='save_scope').length,saves,'Reselecting the same teams must not replace an existing image identity');
 document.getElementById('awardScopeAll').click();document.getElementById('awardScopeAll').click();document.getElementById('awardScopeApply').click();await tick();assert.equal((await t.ui.request(t.s,'results')).award_scope.mode,'all');
});
test('uncertain saves retry the exact choice; definite conflicts can reload',async()=>{
 const t=setup();await t.ui.load(t.s,'team_week');t.fail(true);await t.ui.save(t.s,'team_week',{mode:'groups',ids:['grade']});
 assert.equal(t.ui.canLeave(t.s),false);const pending=structuredClone(t.ui.state(t.s).pending);t.fail(false);await t.ui.save(t.s,'team_week',{mode:'groups',ids:['masters']});
 const commands=t.calls.filter(x=>x.p_action==='save_scope');assert.deepEqual(commands.at(-1).p_data,pending);assert.deepEqual((await t.ui.request(t.s,'team_week')).award_scope.ids,['grade']);
 t.fail(true,true);await t.ui.save(t.s,'team_week',{mode:'groups',ids:['masters']});assert.equal(t.ui.state(t.s).pending,null);t.fail(false);await t.ui.load(t.s,'team_week',{reload:true});assert.equal(t.ui.canLeave(t.s),true);
});
test('applying the existing choice leaves the award draft intact',async()=>{
 const t=setup();await t.ui.load(t.s,'team_week');await t.ui.save(t.s,'team_week',{mode:'all',ids:[]});assert.equal(t.changed.length,0);assert.equal(t.calls.filter(c=>c.p_action==='save_scope').length,0);
});
test('saved editions reopen their scope without rewriting the club preference',async()=>{
 const t=setup();await t.ui.load(t.s,'century');const before=t.ui.identity(t.s);await t.ui.review(t.s,'century',{mode:'groups',ids:['masters'],grade_ids:['master'],key:'groups:masters',label:'Masters'});
 assert.equal((await t.ui.request(t.s,'century')).award_scope.key,'groups:masters');assert.equal(t.calls.filter(c=>c.p_action==='save_scope').length,0);assert.notEqual(t.ui.identity(t.s),before);
 t.s.view='award_collection';t.s.awards={selected:new Set(['edition-a'])};assert.deepEqual(await t.ui.resultsRequest(t.s),{award_edition_ids:['edition-a']});
});
test('abandoned fixtures and a selected group with no games require no missing-score acknowledgement',()=>{
 const coverage=weeklyResultCoverage({week_end:'2026-10-18',fixtures:[{id:'abandoned',grade:'Masters',days:[{date:'2026-10-14'}],no_play:'abandoned'}],cards:[]});
 assert.equal(coverage.total,0);assert.equal(coverage.complete,true);assert.equal(coverage.unknown,false);
 assert.equal(weeklyResultCoverage({fixtures:[],cards:[],award_scope:{mode:'groups',ids:['masters']}}).unknown,false);
});
test('score checks send the chosen scope and a post checks saved edition IDs without replacing editor context',async()=>{
 setup();const calls=[],s={scope:'user:club',view:'team_week'},data={week_end:'2026-10-18',fixtures:[{id:'abandoned',grade:'Masters',days:[{date:'2026-10-14'}],no_play:'abandoned'}],cards:[]};let warnings=0;
 const results=createSharedMatchResults({supabase:{rpc:async(_,a)=>{calls.push(a.p_data);return {data};}},escape:String,here:()=>true,scopeIdentity:()=>s.view,scopeRequest:async()=>({award_scope:{mode:'groups',ids:['grade']}}),confirm:()=>{warnings++;return true;}});
 results.mount(s,data.week_end);while(s.results.busy)await tick();assert.deepEqual(calls[0].award_scope,{mode:'groups',ids:['grade']});
 assert.equal(await results.check(s,data.week_end),true);const editor=s.results.context;
 assert.equal(await results.check(s,data.week_end,{award_edition_ids:['e1']}),true);assert.deepEqual(calls.at(-1).award_edition_ids,['e1']);assert.equal(s.results.context,editor);assert.equal(warnings,0);
});
