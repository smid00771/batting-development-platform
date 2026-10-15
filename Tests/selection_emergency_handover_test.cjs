const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8');
function fn(name){const m=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(m);const rest=source.slice(m.index),end=rest.slice(1).search(/\n(?:async )?function /);return rest.slice(0,end+1);}
test('Club Admin has an explicit emergency handover without gaining an ordinary unlock',async()=>{
 const dom=new JSDOM('<main id="seContent"></main>'),document=dom.window.document,calls=[],s={data:{admin:true,selector:false,head_selector:false,can_delegate:true,access:{head_selector_id:'head',timezone:'UTC',revision:7},members:[{user_id:'head',name:'Existing Head',selector:true},{user_id:'replacement',name:'Replacement',selector:true}],fixtures:[]}};
 const c=vm.createContext({document,FormData:dom.window.FormData,session:{user:{id:'admin'}},ensureSelections:()=>s,recordSelectionDrawer(){},queueMicrotask(){},bindSelectionBackButtons(){},seEsc:String,seDate:String,seFixtureCompleted:()=>false,seFixtureLocked:()=>true,seDraftChanged:()=>false,confirmLeaveSelections:()=>true,seChangeView:view=>calls.push({view}),seMutate:async(action,data)=>calls.push({action,data})});
 vm.runInContext(['sePublicationWorkflow','seDelegationEditor','seFixtureLockControls'].map(fn).join('\n'),c);
 assert.match(c.sePublicationWorkflow(s.data),/Emergency handover/);assert.doesNotMatch(c.seFixtureLockControls({id:'f',published:{}}),/Unlock for changes/);
 c.seDelegationEditor(true);assert.match(document.body.textContent,/Published teams stay locked/);assert.equal(calls.length,0);
 document.querySelector('[name=user_id]').value='replacement';document.querySelector('[name=from]').value='2099-10-15';document.querySelector('[name=until]').value='2099-10-17';
 await document.getElementById('seDelegationForm').onsubmit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0].action,'publication_delegate');assert.equal(calls[0].data.user_id,'replacement');assert.equal(calls[0].data.revision,7);assert.equal(calls.some(x=>x.action==='fixture_lock'||x.action==='publish'),false);
 document.getElementById('seReplaceHead').click();assert.equal(calls.at(-1).view,'settings');
});
