const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function extract(name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(m,name);const tail=source.slice(m.index),end=tail.slice(1).search(/\n(?:async )?function /);return tail.slice(0,end+1);}
const plain=value=>JSON.parse(JSON.stringify(value));
function harness(tab='teams'){
 const dom=new JSDOM('<main id="page"><h1>Current section</h1><div id="content"></div></main>',{url:'https://example.invalid'}),document=dom.window.document,opened=[];
 const recovery={prefix:'club-batting-match-draft-v129:',forms:new WeakMap(),contexts:new Set(),ttl:14*86400000,maxBytes:400000};
 const c=vm.createContext({document,localStorage:dom.window.localStorage,session:{user:{id:'user'}},club:{id:'club'},currentTab:tab,Date,matchDraftRecovery:recovery,matchDraftOpen:async entry=>opened.push(entry),esc:value=>String(value??''),matchDraftStart(){},Event:dom.window.Event,queueMicrotask});
 vm.runInContext(['matchDraftScope','matchDraftKey','matchDraftStorageKeys','matchDraftClone','matchDraftEntries','matchDraftRead','matchDraftWrite','matchDraftRemove','matchDraftFields','matchDraftSnapshot','matchDraftCapture','matchDraftContext','matchDraftLock','matchDraftShowForm','matchDraftOfferSaved'].map(extract).join('\n'),c);
 function put(kind,id,route,extra={}){const key=c.matchDraftKey(kind,id),entry={version:129,user:'user',club:'club',kind,id,label:kind==='team'?'Match Review':'match preparation',route,revision:'null',snapshot:{fields:[]},updated:Date.now(),...extra};dom.window.localStorage.setItem(key,JSON.stringify(entry));return {key,...entry};}
 return {c,document,storage:dom.window.localStorage,recovery,opened,put};
}
test('saved match drafts do not insert a banner into Selection Board or unrelated pages, and are not deleted',()=>{
 for(const tab of ['teams','home','make_your_call','messages']){
  const h=harness(tab),entry=h.put('team','match-1',{tab:'team_review'}),before=h.storage.getItem(entry.key);
  h.c.matchDraftOfferSaved();assert.equal(h.document.querySelector('[data-match-draft-banner]'),null,tab);assert.equal(h.storage.getItem(entry.key),before,tab);
 }
});
test('Match Review offers a collapsed neutral draft list, scoped to that section, at the end of the page',async()=>{
 const h=harness('team_review'),entry=h.put('team','match-1',{tab:'team_review'});h.put('preparation','match-2',{tab:'innings'});h.c.matchDraftOfferSaved();
 const box=h.document.querySelector('[data-match-draft-banner="index"]');assert.equal(box.tagName,'DETAILS');assert.equal(box.open,false);assert.equal(box.classList.contains('notice'),false);assert.equal(h.document.getElementById('page').lastElementChild,box);
 assert.equal(box.querySelectorAll('button').length,1);assert.equal(box.querySelector('summary').textContent,'Saved drafts (1)');await box.querySelector('button').onclick();assert.equal(h.opened[0].key,entry.key);
 h.c.matchDraftOfferSaved();assert.equal(h.document.querySelectorAll('[data-match-draft-banner]').length,1);assert.equal(h.storage.length,2);
});
test('innings and player observation drafts remain discoverable only in their relevant sections',()=>{
 for(const [tab,kind] of [['innings','preparation'],['players','observation']]){
  const h=harness(tab);h.put('team','other',{tab:'team_review'});h.put(kind,'current',{tab});h.c.matchDraftOfferSaved();assert.equal(h.document.querySelectorAll('[data-match-draft-banner] button').length,1);
 }
});
test('draft discovery keeps account/club boundaries and recovers from an open failure',async()=>{
 const h=harness('team_review'),entry=h.put('team','own',{tab:'team_review'});h.put('team','foreign',{tab:'team_review'},{user:'other'});h.put('team','other-club',{tab:'team_review'},{club:'other'});h.c.matchDraftOfferSaved();
 const button=h.document.querySelector('button');assert.equal(h.document.querySelectorAll('button').length,1);h.c.matchDraftOpen=async()=>{throw Error('Connection interrupted');};await button.onclick();
 assert.equal(button.disabled,false);assert.match(h.document.querySelector('[role="status"]').textContent,/Connection interrupted/);assert.ok(h.storage.getItem(entry.key));assert.equal(h.storage.length,3);
});
test('a specific unconfirmed save retains recovery controls and blocks conflicting edits',()=>{
 const h=harness('innings');h.document.getElementById('content').innerHTML='<form id="myReflectionForm"><input name="note" value="Existing note"><button type="submit">Save</button></form>';
 const entry=h.put('innings','match-1',{tab:'innings'},{command:{name:'save_my_innings',args:{p_request_id:'request-1'}}}),form=h.document.querySelector('form');
 h.c.matchDraftContext(form,{kind:'innings',id:'match-1',label:'innings and reflection',route:{tab:'innings'},revision:null});const box=form.querySelector('[data-match-draft-banner="form"]');
 assert.ok(box.classList.contains('match-draft-recovery'));assert.equal(box.classList.contains('notice'),false);assert.equal(box.querySelector('[data-draft-restore]').textContent,'Check previous save');assert.equal(box.querySelector('[data-draft-discard]').disabled,true);assert.equal(form.elements.note.disabled,true);assert.ok(h.storage.getItem(entry.key));
 h.c.matchDraftOfferSaved();assert.equal(h.document.querySelector('[data-match-draft-banner="index"]'),null);
});
test('ordinary draft can still be deliberately discarded from its relevant form',()=>{
 const h=harness('innings');h.document.getElementById('content').innerHTML='<form id="myReflectionForm"><input name="note" value="Current saved note"><button type="submit">Save</button></form>';
 const entry=h.put('innings','match-1',{tab:'innings'}),form=h.document.querySelector('form');h.c.matchDraftContext(form,{kind:'innings',id:'match-1',label:'innings and reflection',route:{tab:'innings'},revision:null});
 const discard=form.querySelector('[data-draft-discard]');assert.equal(discard.disabled,false);discard.click();assert.equal(h.storage.getItem(entry.key),null);assert.equal(form.elements.note.disabled,false);assert.equal(form.elements.note.value,'Current saved note');
});
