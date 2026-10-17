const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['app.js','demo.html'])test(file+': room scope ends outside the board and fails closed without settings',()=>{
 const source=fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8'),start=source.indexOf('function seSelectionRoom(){'),end=source.indexOf('\nfunction selectionsScopeKey',start);
 assert.ok(start>=0&&end>start);
 const s={key:'user:club',view:'board',data:{selector:true,access:{timezone:'Europe/London'}}};
 const c=vm.createContext({selectionRoomController:null,createSelectionRoom:h=>h,selectionsScopeKey:()=>s.key,selectionsEnabled:()=>true,selectionState:s,currentTab:'teams',session:{user:{id:'user'}},club:{id:'club',name:'Test club'},seNotice(){}});
 vm.runInContext(source.slice(start,end),c);
 const room=c.seSelectionRoom();assert.equal(room.scope().timezone,'Europe/London');
 for(const view of ['settings','roster','availability','fixtures','socials','published']){s.view=view;assert.equal(room.scope(),null,view);}
 s.view='board';c.currentTab='playerhome';assert.equal(room.scope(),null);
 c.currentTab='teams';s.data.access=null;assert.equal(room.scope(),null);
 s.data.access={};assert.equal(room.scope().timezone,'Australia/Sydney');
 s.data.selector=false;assert.equal(room.scope(),null);
});
