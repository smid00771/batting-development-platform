const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['app.js','demo.html'])test(file+': room scope preserves the club and selector boundary',()=>{
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8'),start=source.indexOf('function seSelectionRoom(){'),end=source.indexOf('\nfunction selectionsScopeKey',start);
 assert.ok(start>=0&&end>start);
 const s={key:'user:club',view:'board',data:{selector:true,access:{timezone:'Europe/London'}}};
 const c=vm.createContext({selectionRoomController:null,createSelectionRoom:h=>h,selectionsScopeKey:()=>s.key,selectionsEnabled:()=>true,selectionState:s,currentTab:'teams',session:{user:{id:'user'}},club:{id:'club',name:'Test club'},seNotice(){}});
 vm.runInContext(source.slice(start,end),c);
 const room=c.seSelectionRoom();assert.equal(room.scope().timezone,'Europe/London');
 for(const view of ['settings','roster','availability','fixtures','socials','published']){s.view=view;if(file==='app.js'){assert.equal(room.scope().key,s.key,view);assert.equal(room.scope().onBoard,false);}else assert.equal(room.scope(),null,view);}
 s.view='board';c.currentTab='playerhome';if(file==='app.js')assert.equal(room.scope().onBoard,false);else assert.equal(room.scope(),null);
 c.currentTab='teams';s.data.access=null;assert.equal(room.scope(),null);
 s.data.access={};assert.equal(room.scope().timezone,'Australia/Sydney');
 s.data.selector=false;assert.equal(room.scope(),null);
 s.data.selector=true;c.selectionsScopeKey=()=>'other:club';assert.equal(room.scope(),null,'Changing the account or club closes the old call');
});
test('app.js: group room stays pinned while browsing and closes on revoked access',async()=>{
 const source=fs.readFileSync(new URL('../app.js','file://'+__filename),'utf8'),start=source.indexOf('function seSelectionRoom(){'),end=source.indexOf('\nfunction selectionsScopeKey',start);
 const s={key:'user:club',selectionGroup:'first',view:'board',data:{selector:true,group_permissions_enabled:true,access:{timezone:'Australia/Sydney'},selection_setup:{selection_groups:[{id:'first',name:'Saturday'},{id:'second',name:'Masters'}]},selection_group_access:[{id:'first',level:2},{id:'second',level:1}]}},calls=[];let pinned=null;
 const c=vm.createContext({selectionRoomController:null,createSelectionRoom:h=>({...h,activeScope:()=>pinned}),selectionsScopeKey:()=>s.key,selectionsEnabled:()=>true,selectionState:s,currentTab:'teams',session:{user:{id:'user'}},club:{id:'club',name:'Test club'},seNotice(){},supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:{}};},functions:{invoke:async(name,args)=>{calls.push({name,args});return {data:{}};}}}});
 vm.runInContext(source.slice(start,end),c);const room=c.seSelectionRoom(),initial=room.scope();assert.equal(initial.key,'user:club:first');assert.equal(initial.group_name,'Saturday');
 pinned=initial;s.selectionGroup='second';assert.equal(room.scope().selection_group_id,'first','Browsing another group must not move the active call');
 await room.rpc(initial,'context',{});await room.video(initial,'status',{});assert.equal(calls[0].args.p_data.selection_group_id,'first');assert.equal(calls[1].args.body.selection_group_id,'first');
 s.data.selection_group_access[0].level=0;assert.equal(room.scope(),null,'Losing the active group grant closes the room even with another group grant');
 pinned=null;assert.equal(room.scope().selection_group_id,'second');s.selectionGroup='unknown';assert.equal(room.scope(),null,'Unknown group cannot acquire a room scope');
});
