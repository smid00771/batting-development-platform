const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const {openDemo}=require('./helpers/demo_harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
const source=fs.readFileSync('app.js','utf8'),extract=name=>{const i=source.search(new RegExp('(?:async )?function '+name+'\\(')),s=source.slice(i);assert.ok(i>=0,name);return s.slice(0,s.slice(1).search(/\n(?:async )?function /)+1);};

test('grade levels show each canonical team once and save aliases within independent groups',async t=>{
 const dom=new JSDOM('<details id="seGradeLevels"></details>');t.after(()=>dom.window.close());const calls=[];
 const grades=[{id:'m1',name:'1st Grade',selection_group_id:'men'},{id:'dev',name:'Dev Navy',selection_group_id:'men'},{id:'w1',name:"Women's 1st Grade",selection_group_id:'women'},{id:'w2',name:"Women's 2nd Grade",selection_group_id:'women'}];
 const s={data:{selection_setup:{grades,selection_groups:[{id:'men',name:'Senior Teams'},{id:'women',name:"Women's Teams"}]},access:{revision:7,grade_levels:[{competition:'NDCA',grade:'Dev Navy',level:5},{competition:'',grade:'Dev Navy',level:5},{competition:'Old',grade:'Historic team',level:9}]},fixtures:[{details:{competition:'NDCA',grade:'1st Grade',grade_group_id:'m1'}},{details:{competition:'',grade:'1st Grade',grade_group_id:'m1'}},{details:{competition:'NDCA',grade:'Dev Navy',grade_group_id:'dev'}}]}};
 const c=vm.createContext({document:dom.window.document,ensureSelections:()=>s,seEsc:String,seSettingsSaveState(){},seMutate:async(action,data)=>{calls.push({action,data});return true;}});
 vm.runInContext(['seGradeLevel','seGradeLevelRows','seGradeLevels'].map(extract).join('\n'),c);c.seGradeLevels();
 const doc=dom.window.document;assert.equal(doc.querySelectorAll('[data-se-level]').length,4);assert.equal(doc.querySelectorAll('fieldset').length,2);
 assert.deepEqual([...doc.querySelectorAll('legend')].map(n=>n.textContent),['Senior Teams',"Women's Teams"]);
 assert.equal(doc.querySelector('[aria-label="Grade level for Dev Navy"]').value,'5');
 for(const [name,level] of [["Women's 1st Grade",1],["Women's 2nd Grade",2]])doc.querySelector(`[aria-label="Grade level for ${name}"]`).value=level;
 await doc.querySelector('form').onsubmit({preventDefault(){}});
 const rows=plain(calls[0].data.rows);assert.equal(calls[0].data.revision,7);
 assert.equal(rows.filter(r=>r.grade==='Dev Navy'&&r.level===5).length,2,'Both fixture labels stay equal');
 assert.equal(rows.filter(r=>r.grade==='1st Grade'&&r.level===1).length,2);
 assert.ok(rows.some(r=>r.grade==='Historic team'&&r.level===9),'Historical settings survive');
 assert.ok(rows.some(r=>r.grade==="Women's 2nd Grade"&&r.level===2));
 s.data.access.grade_levels.push({competition:'NDCA',grade:'1st Grade',level:2},{competition:'',grade:'1st Grade',level:1});
 c.seGradeLevels();assert.equal(doc.querySelector('[aria-label="Grade level for 1st Grade"]').required,true,'Conflicting old values require an explicit choice');
});

test('name correction is a focused edit, rejects duplicates and retries the same player save',async t=>{
 const h=await openDemo({product:'select',role:'admin',journey:'selection_admin'},{traceRpc:true});t.after(h.close);
 h.window.eval("selectionState.view='roster';drawSelections()");await h.settle();
 const button=h.document.querySelector('[data-se-edit-name]');assert.ok(button);const id=button.dataset.seEditName;
 const before=plain(h.window.eval(`demoSelections.roster.find(p=>p.id===${JSON.stringify(id)})`));
 await h.click(`[data-se-edit-name="${id}"]`);
 const form=h.document.querySelector('#sePlayerNameForm'),input=form.elements.name;
 assert.equal(form.querySelectorAll('input').length,1,'Only the name is editable here');assert.equal(input.value,before.name);
 input.value=h.window.eval(`demoSelections.roster.find(p=>p.id!==${JSON.stringify(id)}).name`);input.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 assert.equal(form.querySelector('[type=submit]').disabled,true);assert.match(form.textContent,/already exists/);
 input.value='Corrected Example';input.dispatchEvent(new h.window.Event('input',{bubbles:true}));assert.equal(form.querySelector('[type=submit]').disabled,false);
 h.window.eval(`window.nameSaveRequests=[];const nameRpc=supabase.rpc;let loseNameReply=true;supabase.rpc=async(n,a)=>{if(a.p_action==='save_roster')window.nameSaveRequests.push(structuredClone(a.p_data));const reply=await nameRpc(n,a);if(a.p_action==='save_roster'&&loseNameReply){loseNameReply=false;return {error:{message:'Connection lost'}};}return reply;};`);
 await h.click('#sePlayerNameForm [type=submit]');
 const pending=plain(h.window.eval('selectionState.pending.data'));assert.equal(pending.rows[0].id,id);assert.equal(pending.rows[0].user_id,before.user_id);
 await h.click('#seRetrySave');
 const after=plain(h.window.eval(`demoSelections.roster.find(p=>p.id===${JSON.stringify(id)})`));assert.equal(after.name,'Corrected Example');
 for(const key of ['id','user_id','external_id','grade','batting','bowling','keeper','availability'])assert.deepEqual(after[key],before[key],key);
 const saves=h.window.nameSaveRequests;assert.equal(saves.length,2);assert.deepEqual(plain(saves[0]),plain(saves[1]));
 assert.equal(h.window.eval('selectionState.pending'),null);assert.deepEqual(h.errors.map(e=>e.message),[]);
});
