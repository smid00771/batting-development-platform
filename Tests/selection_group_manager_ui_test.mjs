import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createSelectionGroupManager} from '../selection-group-manager.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r,0));};
function harness({pending=false,failPreview=false,failSave=false}={}){
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.querySelector('#host'),calls=[],previews=[];
 let context={can_edit:true,revision:1,selection_groups:[{id:'sg',name:'Saturday'}],grades:[{id:'g',name:'First XI',selection_group_id:'sg'}],mappings:[{season_id:'season',team_id:'existing',grade_id:'g'}]};
 const teams=[{id:'existing',grade:{id:'first',name:'First Grade'}},{id:'candidate',name:'Sabres',grade:pending?null:{id:'bash',name:'Summer competition'}}];
 const ui=createSelectionGroupManager({here:()=>true,alert:()=>{},confirm:()=>true,manage:async(action,data)=>{calls.push({action,data});if(failSave){failSave=false;throw Error('Connection lost');}if(action==='disconnect_preview')return {remove_count:5,keep_count:1,token:'safe-token'};if(action==='add_group')context={...context,revision:2,selection_groups:[...context.selection_groups,{id:'sg2',name:data.name}]};return {...context,removed:5,retained:1};},previewTeam:async t=>{previews.push(t.id);if(failPreview){failPreview=false;throw Error('Source unavailable');}return {fixtures:[{days:[{date:'2026-11-02'}],opposition:'Visitors'}]};},saved:async()=>{}});
 ui.mount(host,{context,teams,season:'season',catalogue:'catalogue'});
 const field=(key,value)=>{const el=host.querySelector(`[data-field="${key}"]`);el.value=value;el.dispatchEvent(new dom.window.Event('input'));el.dispatchEvent(new dom.window.Event('change'));};
 const submit=()=>host.querySelector('[data-sgm-form]').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));return {ui,host,calls,previews,field,submit};
}
test('saved setup adds one group without reopening or resubmitting existing setup',async()=>{
 const h=harness();assert.equal(h.host.querySelector('[data-sg-align]'),null);h.host.querySelector('[data-sgm-add-group]').click();h.field('name','Summer Bash');h.submit();await settle();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'add_group');assert.equal(h.calls[0].data.name,'Summer Bash');assert.equal(h.calls[0].data.grades,undefined);assert.match(h.host.textContent,/Summer Bash/);assert.match(h.host.textContent,/First XI/);
 h.host.querySelector('[data-sgm-group-team="sg2"]').click();assert.equal(h.host.querySelector('[data-field="selection_group_id"]').value,'sg2');h.field('team_id','candidate');await settle();h.submit();await settle();assert.equal(h.calls[1].action,'add_team');assert.equal(h.calls[1].data.selection_group_id,'sg2');assert.equal(h.calls[1].data.team_id,'candidate');
});
test('adding a team previews its actual source and fixtures before saving only that addition',async()=>{
 const h=harness();h.host.querySelector('[data-sgm-add-team]').click();assert.equal(h.host.querySelector('[data-sgm-form] .btn').disabled,true);h.field('team_id','candidate');await settle();
 assert.deepEqual(h.previews,['candidate']);assert.match(h.host.querySelector('[data-sgm-preview]').textContent,/Summer competition.*Sabres.*02\/11\/2026.*Visitors/s);assert.equal(h.calls.length,0);
 h.field('name','City Summer Bash');h.submit();await settle();assert.equal(h.calls[0].action,'add_team');assert.equal(h.calls[0].data.team_id,'candidate');assert.equal(h.calls[0].data.name,'City Summer Bash');assert.equal(h.calls[0].data.catalogue_id,'catalogue');
});
test('a source without grade details stays explicitly uncertain and does not request invalid fixtures',async()=>{
 const h=harness({pending:true});h.host.querySelector('[data-sgm-add-team]').click();h.field('team_id','candidate');await settle();assert.equal(h.previews.length,0);assert.match(h.host.textContent,/competition cannot yet be confirmed/);h.submit();await settle();assert.equal(h.calls[0].data.team_id,'candidate');
});
test('undo first reviews what will be removed and retains used fixtures; saving supplies the review token',async()=>{
 const h=harness();h.host.querySelector('[data-sgm-manage]').click();h.host.querySelector('[data-sgm-disconnect]').click();await settle();assert.equal(h.calls[0].action,'disconnect_preview');assert.match(h.host.textContent,/5 untouched future fixtures will be removed. 1 existing or used fixtures will be kept/);assert.equal(h.calls.length,1);h.submit();await settle();assert.equal(h.calls[1].action,'disconnect');assert.equal(h.calls[1].data.token,'safe-token');assert.match(h.host.textContent,/5 untouched future fixtures removed; 1 existing fixtures kept/);
});
test('source details can retry without losing the preferred name',async()=>{
 const h=harness({failPreview:true});h.host.querySelector('[data-sgm-add-team]').click();h.field('team_id','candidate');await settle();h.field('name','City Summer Bash');assert.match(h.host.textContent,/Source unavailable/);h.host.querySelector('[data-sgm-retry-preview]').click();await settle();assert.deepEqual(h.previews,['candidate','candidate']);assert.equal(h.host.querySelector('[data-field="name"]').value,'City Summer Bash');assert.match(h.host.querySelector('[data-sgm-preview]').textContent,/Visitors/);
});
test('an uncertain incremental save locks edits and retries the identical request',async()=>{
 const h=harness({failSave:true});h.host.querySelector('[data-sgm-add-group]').click();h.field('name','Summer teams');h.submit();await settle();assert.equal(h.ui.canLeave(),false);assert.equal(h.host.querySelector('[data-field="name"]').disabled,true);assert.match(h.host.textContent,/Save not confirmed/);h.submit();await settle();assert.deepEqual(h.calls[1],h.calls[0]);assert.equal(h.ui.canLeave(),true);assert.match(h.host.textContent,/Summer teams/);
});

test('Club Batting uses one inline group checkbox, hides without the product, and safely retries',async()=>{
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.querySelector('#host'),calls=[];
 let fail=true,ctx={can_edit:true,batting_available:true,revision:3,selection_groups:[{id:'group',name:'Masters',batting_enabled:false}],grades:[],mappings:[]};
 const ui=createSelectionGroupManager({here:()=>true,confirm:()=>true,loadSeason:()=>{},manage:async(action,data)=>{calls.push({action,data});if(fail){fail=false;throw Error('Connection lost');}ctx={...ctx,revision:4,selection_groups:[{...ctx.selection_groups[0],batting_enabled:data.batting_enabled}]};return ctx;}});
 const mount=()=>ui.mount(host,{context:ctx,teams:[],season:'',management:true});mount();
 const rename=host.querySelector('[data-sgm-rename]'),add=host.querySelector('[data-sgm-group-team]'),box=host.querySelector('[data-sgm-batting]');
 assert.equal(rename.nextElementSibling,add);assert.equal(box.closest('.sg-group-heading'),rename.closest('.sg-group-heading'));assert.equal(box.checked,false);
 box.click();await settle();assert.equal(calls[0].action,'set_batting');assert.equal(calls[0].data.batting_enabled,true);assert.equal(ui.canLeave(),false);assert.ok(host.querySelector('[data-sgm-batting]').disabled);
 host.querySelector('[data-sgm-retry-batting]').click();await settle();assert.deepEqual(calls[1],calls[0]);assert.equal(host.querySelector('[data-sgm-batting]').checked,true);assert.equal(ui.canLeave(),true);
 assert.ok([...host.querySelectorAll('[role=status]')].every(el=>el.classList.contains('sr-only')),'Routine status takes no vertical space');
 ctx={...ctx,batting_available:false};mount();assert.equal(host.querySelector('[data-sgm-batting]'),null);assert.doesNotMatch(host.textContent,/Club Batting/);
});
