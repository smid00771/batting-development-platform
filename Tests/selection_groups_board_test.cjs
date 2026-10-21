const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('app.js','utf8'),extract=name=>{const i=source.search(new RegExp('(?:async )?function '+name+'\\(')),rest=source.slice(i);assert.ok(i>=0,name);return rest.slice(0,rest.slice(1).search(/\n(?:async )?function /)+1);};
function setup(){const dom=new JSDOM('<div id="seContent"></div>'),s={selectionGroup:'a',date:'2099-10-17',boardDateChosen:true,view:'board',data:{admin:true,selection_setup:{selection_groups:[{id:'a',name:'Weekend teams'},{id:'b',name:'Evening teams'},{id:'c',name:'Cup'}]},access:{timezone:'UTC'},fixtures:[
 {id:'a-old',selection_group_id:'a',details:{grade:'First XI',days:[{date:'2099-10-10'}]}},
 {id:'a-new',selection_group_id:'a',details:{grade:'First XI',days:[{date:'2099-10-17'}]}},
 {id:'b-new',selection_group_id:'b',details:{grade:'Evening XI',days:[{date:'2099-10-19'}]}}
 ]}},calls=[];let mayLeave=true;
 const c=vm.createContext({Date,Intl,document:dom.window.document,ensureSelections:()=>s,seClubDate:()=> '2099-10-15',seOpt:(opts,v)=>opts.map(([id,n])=>`<option value="${id}" ${id===v?'selected':''}>${n}</option>`).join(''),confirmLeaveSelections:()=>mayLeave,recordSelectionNavigation:()=>calls.push('navigation'),seEditSelectionGroups:()=>calls.push('setup'),seBoard:()=>calls.push(c.seBoardFixtures().map(f=>f.id))});
 vm.runInContext(['seSelectionFixtures','seBoardFixtures','seBoardGroupControl','seBindGroupControl'].map(extract).join('\n'),c);return {s,c,calls,dom,mayLeave:v=>mayLeave=v};}
test('board date, stats fixture input and group dropdown share a single group scope',()=>{
 const h=setup();assert.deepEqual(Array.from(h.c.seSelectionFixtures(),f=>f.id),['a-old','a-new']);assert.deepEqual(Array.from(h.c.seBoardFixtures(),f=>f.id),['a-new']);
 h.dom.window.document.querySelector('#seContent').innerHTML=h.c.seBoardGroupControl();h.c.seBindGroupControl();const select=h.dom.window.document.querySelector('select');select.value='b';select.dispatchEvent(new h.dom.window.Event('change'));
 assert.equal(h.s.selectionGroup,'b');assert.equal(h.s.date,'2099-10-19');assert.deepEqual(Array.from(h.c.seBoardFixtures(),f=>f.id),['b-new']);assert.equal(h.s.statsFilters,null);
 h.mayLeave(false);select.value='a';select.dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.s.selectionGroup,'b');assert.equal(select.value,'b');
 h.mayLeave(true);select.value='c';select.dispatchEvent(new h.dom.window.Event('change'));assert.equal(h.s.date,'');assert.equal(h.c.seBoardFixtures().length,0,'Empty group never falls back to another group');
});
test('before setup the existing board is retained; unmatched legacy fixtures stay discoverable',()=>{
 const h=setup();h.s.data.selection_setup.selection_groups=[];assert.equal(h.c.seSelectionFixtures().length,3);assert.match(h.c.seBoardGroupControl(),/Create Selection Groups/);
 h.s.data.selection_setup.selection_groups=[{id:'a',name:'Weekend teams'}];h.s.data.fixtures.push({id:'legacy',details:{grade:'Old grade',days:[{date:'2099-10-20'}]}});h.s.selectionGroup='';assert.deepEqual(Array.from(h.c.seSelectionFixtures(),f=>f.id),['legacy']);assert.match(h.c.seBoardGroupControl(),/Grades to organise/);
});
test('direct transfer is rejected between Selection Groups without weakening date conflicts',()=>{
 const a={id:'one',selection_group_id:'a',details:{days:[{date:'2099-10-17'}]},slots:[{d1:'player'}]},b={id:'two',selection_group_id:'b',details:{days:[{date:'2099-10-17'}]},slots:[]};
 const c=vm.createContext({seFixtureLocked:()=>false});vm.runInContext(extract('seTransferProblem'),c);assert.match(c.seTransferProblem(a,b,0,{roster:[]}),/same Selection Group/);
});
