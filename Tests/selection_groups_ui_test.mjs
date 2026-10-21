import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createSelectionGroups,selectionGroupDraft} from '../selection-groups.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));};
const context=()=>({can_edit:true,revision:2,selection_groups:[],grades:[{id:'grade-a',name:'First XI'},{id:'grade-b',name:'Second XI'}],mappings:[],expected_grades:[{id:'grade-a',name:'First XI'},{id:'grade-b',name:'Second XI'}]});
const teams=[{id:'team-a',grade:{id:'source-a',name:'First XI'}},{id:'team-b',grade:{id:'source-b',name:'Second XI'}},{id:'team-c',name:'Club blue',grade:{id:'source-c',name:'Evening Cup'}}];
function harness({ctx=context(),save,confirm=()=>true}={}){const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.querySelector('#host'),calls=[],alerts=[];let captains=0;
 const ui=createSelectionGroups({here:()=>true,alert:x=>alerts.push(x),confirm,save:async data=>{calls.push(structuredClone(data));if(save)return save(data);return {...ctx,saved:true,revision:3,selection_groups:data.groups,grades:data.grades,mappings:data.grades.filter(g=>g.team_id).map(g=>({season_id:'season',team_id:g.team_id,grade_id:g.id}))};},captains:()=>captains++,manual:()=>{},fixtures:()=>{}});
 ui.mount(host,{context:ctx,teams,season:'season',catalogue:'catalogue'});
 return {dom,host,ui,calls,alerts,captains:()=>captains,change(q,value){const el=host.querySelector(q);assert.ok(el,q);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));},add(name){host.querySelector('[data-sg-new-name]').value=name;host.querySelector('[data-sg-new]').click();return host.querySelector('[data-sg-grade] option:last-child').value;},submit(){host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}};
}
test('any club confirms existing grade IDs, adds source grades once, and continues to captains',async()=>{
 const h=harness(),first=h.add('Weekend teams');h.change('[data-sg-grade="grade-a"]',first);h.change('[data-sg-grade="grade-b"]',first);
 const second=h.add('Evening teams');h.change('[data-sg-add="team-c"]',second);
 assert.equal(h.host.querySelectorAll('input[type=checkbox]').length,0);assert.equal(h.host.querySelectorAll('[data-sg-grade]').length,3);
 assert.equal(h.host.querySelector('[data-sg-other]'),null,'Added grades leave the source choices');assert.equal(h.calls.length,0);
 h.submit();await settle();assert.equal(h.calls.length,1);const data=h.calls[0];assert.deepEqual(data.grades.slice(0,2).map(g=>g.id),['grade-a','grade-b']);assert.equal(data.grades[2].name,'Evening Cup');assert.equal(data.grades[2].selection_group_id,second);assert.equal(data.catalogue_id,'catalogue');assert.equal(h.ui.hasChanges(),false);
 h.host.querySelector('[data-sg-captains]').click();assert.equal(h.captains(),1);assert.ok(!h.host.textContent.includes('Newcastle'));
});
test('name differences and duplicate source names require an explicit grade match',()=>{
 const d=selectionGroupDraft(context(),[{id:'t1',grade:{id:'s',name:'First XI (Sponsor)'}},{id:'t2',grade:{id:'s',name:'First XI (Sponsor)'}}],'season');
 assert.equal(d.available.length,2);assert.ok(d.rows.every(g=>!g.team_id));
 const ctx=context();ctx.grades[0].name='Firsts';const h=harness({ctx});const group=h.add('Main squad');h.change('[data-sg-match="team-a"]','grade-a');assert.equal(h.host.querySelector('[data-sg-match="team-a"]'),null);h.change('[data-sg-grade="grade-a"]',group);assert.equal(h.calls.length,0,'Matching is still only a proposal');
});
test('unconfirmed save retries the same request and blocks navigation',async()=>{
 let attempts=0;const h=harness({save:async data=>{if(++attempts===1)throw Error('Connection lost');return {...context(),selection_groups:data.groups,grades:data.grades,mappings:[],saved:true};}}),g=h.add('Club squad');h.change('[data-sg-grade="grade-a"]',g);h.change('[data-sg-grade="grade-b"]',g);h.submit();await settle();assert.equal(h.ui.canLeave(),false);assert.equal(h.alerts.length,1);h.submit();await settle();assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(h.ui.hasChanges(),false);
});
test('server rejection preserves choices for correction and unsaved season switching is guarded',async()=>{
 const h=harness({save:async()=>{throw Object.assign(Error('Club setup changed. Reload before saving'),{code:'P0001'});},confirm:()=>false}),g=h.add('Senior teams');h.change('[data-sg-grade="grade-a"]',g);h.change('[data-sg-grade="grade-b"]',g);h.submit();await settle();assert.equal(h.ui.canLeave(),false);assert.equal(h.host.querySelector('[data-sg-grade="grade-a"]').disabled,false);assert.equal(h.host.querySelector('[data-sg-grade="grade-a"]').value,g);assert.match(h.host.textContent,/Club setup changed/);
});
test('saved mappings win over names; reload never duplicates a confirmed grade',()=>{
 const ctx=context();ctx.mappings=[{season_id:'season',team_id:'team-c',grade_id:'grade-a'}];const draft=selectionGroupDraft(ctx,teams,'season');
 assert.equal(draft.rows.find(g=>g.id==='grade-a').team_id,'team-c');assert.equal(draft.available.some(t=>t.id==='team-c'),false);assert.equal(draft.rows.length,2);
});
