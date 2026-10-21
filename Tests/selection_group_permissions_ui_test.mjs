import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createSelectionGroupPermissions} from '../selection-group-permissions.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));};
const initial=()=>({revision:'1:4:2',club_head_id:'head',members:[{user_id:'head',name:'Club Head'},{user_id:'viewer',name:'Viewer'},{user_id:'editor',name:'Editor'},{user_id:'newhead',name:'New Head'}],groups:[{id:'sat',name:'Saturday',head_id:'head',members:[{user_id:'head',access:'edit'},{user_id:'viewer',access:'view'},{user_id:'editor',access:'edit'}]},{id:'masters',name:'Masters',head_id:'newhead',members:[{user_id:'newhead',access:'edit'}]}],invites:[]});
async function harness({fail=null,confirm=true,savedFail=false,empty=false}={}){
 const dom=new JSDOM('<section id="host"></section>'),host=dom.window.document.querySelector('#host'),calls=[],alerts=[],confirmations=[];
 let context=initial(),attempt=0;if(empty)context.groups=[];
 const ui=createSelectionGroupPermissions({here:()=>true,group:()=> 'sat',alert:message=>alerts.push(message),confirm:message=>{confirmations.push(message);return confirm;},inviteURL:()=> 'https://example.invalid/app.html',copy:async()=>{},saved:async()=>{if(savedFail)throw Error('refresh failed');},rpc:async(action,data)=>{
  if(action==='context')return structuredClone(context);calls.push({action,data:structuredClone(data)});attempt++;if(fail&&attempt===1)throw fail;
  context.revision=String(attempt+1);
  if(action==='save_group'){const g=context.groups.find(g=>g.id===data.group_id);g.head_id=data.head_id;g.members=structuredClone(data.members).filter(m=>m.access!=='none');}
  if(action==='club_head')context.club_head_id=data.user_id;
  if(action==='invite')context.invites.push({id:'invited',selection_group_id:data.group_id,invited_name:data.name,invited_email:data.email,access:data.access,as_head:data.as_head});
  if(action==='revoke_invite')context.invites=context.invites.filter(i=>i.id!==data.invite_id);
  return structuredClone(context);
 }});
 await ui.mount(host);
 const change=(selector,value)=>{const el=host.querySelector(selector);assert.ok(el,selector);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 const input=(name,value)=>{const el=host.querySelector(`[data-gp-invitation] [name="${name}"]`);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 const submit=selector=>host.querySelector(selector).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 return {ui,host,calls,alerts,confirmations,change,input,submit};
}
test('group editor keeps heading and group together, with quiet status and exact access choices',async()=>{
 const h=await harness();assert.equal(h.host.querySelector('h2').parentElement,h.host.querySelector('[data-gp-group]').closest('.gp-toolbar'));
 assert.deepEqual([...h.host.querySelector('[data-gp-member="viewer"]').options].map(o=>o.textContent),['No access','Can view','Can edit']);
 assert.equal(h.host.querySelector('[data-gp-member="head"]').disabled,true);assert.equal(h.host.querySelector('[data-gp-member="head"]').value,'edit');
 assert.ok([...h.host.querySelectorAll('[role=status]')].every(el=>el.classList.contains('sr-only')));
 h.change('[data-gp-member="viewer"]','none');h.submit('[data-gp-form]');await settle();
 assert.equal(h.calls[0].action,'save_group');assert.equal(h.calls[0].data.group_id,'sat');assert.equal(h.calls[0].data.members.find(m=>m.user_id==='viewer').access,'none');assert.equal(h.ui.hasChanges(),false);
 assert.equal(h.host.querySelector('[data-gp-member="viewer"]'),null);assert.match(h.host.querySelector('[data-gp-add]').textContent,/Viewer/);
});
test('head handover saves the replacement and rights together, and never submits an empty head',async()=>{
 const h=await harness();h.change('[data-gp-head]','newhead');assert.equal(h.host.querySelector('[data-gp-member="newhead"]').value,'edit');assert.equal(h.host.querySelector('[data-gp-member="newhead"]').disabled,true);
 h.change('[data-gp-member="head"]','view');h.submit('[data-gp-form]');await settle();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].data.head_id,'newhead');assert.equal(h.calls[0].data.members.find(m=>m.user_id==='head').access,'view');assert.equal(h.calls[0].data.members.find(m=>m.user_id==='newhead').access,'edit');
 h.change('[data-gp-head]','');h.submit('[data-gp-form]');await settle();assert.equal(h.calls.length,1);assert.equal(h.ui.hasChanges(),true);
});
test('group change respects unsaved work and independent club-head edits cannot discard it',async()=>{
 const h=await harness({confirm:false});h.change('[data-gp-member="viewer"]','edit');h.change('[data-gp-group]','masters');assert.equal(h.host.querySelector('[data-gp-group]').value,'sat');assert.equal(h.host.querySelector('[data-gp-member="viewer"]').value,'edit');assert.equal(h.ui.canLeave(),false);
 h.change('[data-gp-club] select','newhead');assert.equal(h.host.querySelector('[data-gp-club] select').value,'head');assert.match(h.alerts.at(-1),/current changes/);assert.equal(h.host.querySelector('[data-gp-member="viewer"]').value,'edit');
 h.host.querySelector('[data-gp-invite]').click();assert.equal(h.host.querySelector('[data-gp-invitation]'),null);assert.equal(h.calls.length,0);
});
test('uncertain save locks edits and retry sends the identical group/request/revision',async()=>{
 const h=await harness({fail:Error('Connection lost')});h.change('[data-gp-member="viewer"]','edit');h.submit('[data-gp-form]');await settle();
 assert.equal(h.ui.canLeave(),false);assert.equal(h.host.querySelector('[data-gp-head]').disabled,true);assert.equal(h.host.querySelector('[data-gp-group]').disabled,true);assert.match(h.host.textContent,/Save not confirmed/);
 h.host.querySelector('[data-gp-retry]').click();await settle();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1],h.calls[0]);assert.equal(h.ui.canLeave(),true);assert.equal(h.host.querySelector('[data-gp-member="viewer"]').value,'edit');
});
test('confirmed stale rejection unlocks correction without treating the mutation as pending',async()=>{
 const h=await harness({fail:Object.assign(Error('Permissions changed. Reload before saving'),{code:'P0001'}),confirm:false});h.change('[data-gp-member="editor"]','view');h.submit('[data-gp-form]');await settle();
 assert.equal(h.host.querySelector('[data-gp-retry]'),null);assert.ok(h.host.querySelector('[data-gp-reload]'));assert.equal(h.host.querySelector('[data-gp-head]').disabled,false);assert.equal(h.host.querySelector('[data-gp-member="editor"]').value,'view');assert.equal(h.ui.hasChanges(),true);
});
test('invited head retains exact scoped rights and a stable token on uncertain retry',async()=>{
 const h=await harness({fail:Error('Connection lost')});h.host.querySelector('[data-gp-invite]').click();h.input('name','Invited Head');h.input('email','head@example.invalid');h.change('[data-gp-invitation] [name="as_head"]',true);
 assert.equal(h.host.querySelector('[name="access"]').disabled,true);assert.equal(h.host.querySelector('[name="access"]').value,'edit');assert.match(h.host.textContent,/current Head keeps publishing rights/);
 h.submit('[data-gp-invitation]');await settle();assert.equal(h.calls[0].action,'invite');assert.equal(h.calls[0].data.group_id,'sat');assert.equal(h.calls[0].data.access,'edit');assert.equal(h.calls[0].data.as_head,true);assert.match(h.calls[0].data.token,/^[0-9a-f]{64}$/);
 h.host.querySelector('[data-gp-retry]').click();await settle();assert.deepEqual(h.calls[1],h.calls[0]);assert.equal(h.host.querySelector('[data-gp-head]').value,'head');
 const link=new URL(h.host.querySelector('[data-gp-link]').value);assert.equal(link.searchParams.get('selection_invite'),h.calls[0].data.token);assert.ok(h.host.querySelector('.gp-invitations'));assert.equal(h.ui.hasChanges(),false);
});
test('club head change is explicit, and a failed refresh cannot turn confirmed save into retry',async()=>{
 const h=await harness({savedFail:true});h.change('[data-gp-club] select','newhead');assert.equal(h.ui.hasChanges(),true);h.submit('[data-gp-club]');await settle();
 assert.deepEqual(h.calls.map(c=>c.action),['club_head']);assert.equal(h.calls[0].data.user_id,'newhead');assert.match(h.host.textContent,/Permissions saved. Reload this page/);assert.equal(h.host.querySelector('[data-gp-retry]'),null);assert.equal(h.ui.canLeave(),true);assert.equal(h.ui.hasChanges(),false);
});
test('no groups provides setup guidance without invalid invitation or group controls',async()=>{
 const h=await harness({empty:true});assert.match(h.host.textContent,/Create a Selection Group/);assert.equal(h.host.querySelector('[data-gp-group]'),null);assert.equal(h.host.querySelector('[data-gp-invite]'),null);assert.equal(h.ui.hasChanges(),false);
});
