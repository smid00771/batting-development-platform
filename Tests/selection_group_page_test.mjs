import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createSelectionGroupPage} from '../selection-group-page.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));};
function harness(){
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.querySelector('#host'),calls=[],downloads=[];
 let context={can_edit:true,revision:1,season:'season',catalogue:'cached',selection_groups:[{id:'sg',name:'Saturday'},{id:'summer',name:'Summer Bash'}],grades:[{id:'g',name:'First XI',selection_group_id:'sg'}],mappings:[{season_id:'season',team_id:'first',grade_id:'g'}],teams:[{id:'first',name:'City',grade:{id:'grade',name:'First Grade'}},{id:'sabres',name:'Sabres',grade:null}]};
 const ui=createSelectionGroupPage({clubId:()=> 'club',here:()=>true,alert:()=>{},confirm:()=>true,saved:async()=>{},supabase:{rpc:async(name,args)=>{calls.push({name,args});if(name==='selection_group_management_context')return {data:context};if(args.p_action==='rename_group')context={...context,revision:2,selection_groups:context.selection_groups.map(g=>g.id===args.p_data.selection_group_id?{...g,name:args.p_data.name}:g)};return {data:context};},functions:{invoke:async(...args)=>{downloads.push(args);throw Error('No provider call expected');}}}});
 return {dom,host,calls,downloads,ui};
}
test('management opens saved source names and edit actions without downloading or importing',async()=>{
 const h=harness();await h.ui.mount(h.host);assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'selection_group_management_context');assert.equal(h.downloads.length,0);
 assert.match(h.host.textContent,/First Grade.*City/);assert.ok(h.host.querySelector('[data-sgm-move]'));assert.ok(h.host.querySelector('[data-sgm-disconnect]'));assert.equal(h.host.querySelector('[data-sgm-manage]'),null);
 h.host.querySelector('[data-sgm-rename="summer"]').click();const input=h.host.querySelector('[data-field="name"]');input.value='City Summer Bash';input.dispatchEvent(new h.dom.window.Event('input'));h.host.querySelector('form').dispatchEvent(new h.dom.window.Event('submit',{cancelable:true}));await settle();
 assert.equal(h.calls[1].args.p_action,'rename_group');assert.equal(h.calls[1].args.p_data.selection_group_id,'summer');assert.equal(h.downloads.length,0);assert.match(h.host.textContent,/City Summer Bash/);assert.ok(h.host.querySelector('[data-sgm-move]'));
});
test('an empty saved group can link a cached source team in place without entering season setup',async()=>{
 const h=harness();await h.ui.mount(h.host,{selectionGroupId:'summer'});assert.equal(h.host.querySelector('[data-field="selection_group_id"]').value,'summer');assert.match(h.host.querySelector('[data-field="team_id"]').textContent,/Sabres/);assert.equal(h.calls.length,1);assert.equal(h.downloads.length,0);
});
