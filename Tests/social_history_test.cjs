const socialSource=require('./helpers/social-source.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=fs.existsSync(path.join(__dirname,'../app.js'))?'../':'../Website_Files/';
const app=socialSource(fs.readFileSync(path.join(__dirname,root,'app.js'),'utf8')),demo=fs.readFileSync(path.join(__dirname,root,'demo.html'),'utf8');
function part(s){return s.slice(s.indexOf('async function socialShowHistory('),s.indexOf('function socialGraphics('));}
function setup(){
 const calls=[],downloads=[],status={textContent:''},img={dataset:{socialSavedImage:'club/post/0.jpg'},nextElementSibling:status},retry={addEventListener(event,fn){this['on'+event]=fn;}},host={innerHTML:'',dataset:{},isConnected:true,querySelectorAll:()=>[img],querySelector:()=>retry};
 let response={posts:[{id:'post',state:'draft',posted:false,created_at:'2026-10-11T00:32:52Z',caption:'Original saved caption',images:[{path:'club/post/0.jpg',label:'1st Grade',fixture_id:'past'}]}]},pending;
 const c=vm.createContext({Date,Promise,URL:{createObjectURL:()=> 'blob:original'},seEsc:String,socialHere:()=>true,
  socialRPC:async(s,action,data)=>{calls.push({action,data});return pending?await pending:response;},
  supabase:{storage:{from:bucket=>({download:async key=>{downloads.push({bucket,key});return {data:{originalBytes:true}};}})}}});
 vm.runInContext(part(app),c);const s={view:'graphics',data:{timezone:'Australia/Sydney'},urls:new Map()};
 return {c,s,host,img,status,retry,calls,downloads,setResponse:x=>response=x,setPending:x=>pending=x};
}
test('past-date history loads original stored images and saved captions without regenerating artwork',async()=>{
 const h=setup();await h.c.socialShowHistory(h.s,[{id:'past'}],h.host);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].action,'history');assert.equal(h.calls[0].data.fixtures[0].id,'past');
 assert.deepEqual(h.downloads,[{bucket:'club-social-posts',key:'club/post/0.jpg'}]);assert.equal(h.img.src,'blob:original');
 assert.match(h.host.innerHTML,/Original saved caption/);assert.match(h.host.innerHTML,/Saved draft · not posted/);assert.doesNotMatch(h.host.innerHTML,/<canvas|<input|<select|<textarea|data-social-person/);
 h.img.onload();assert.equal(h.status.textContent,'Original saved image · read only');
});
test('no archived image is invented when a fixture has no saved image',async()=>{
 const h=setup();h.setResponse({posts:[]});await h.c.socialShowHistory(h.s,[{id:'past'}],h.host);
 assert.equal(h.downloads.length,0);assert.equal(h.host.innerHTML,'<p>No saved social images for this date.</p>');
});
test('a late history result cannot replace a different page or newer request',async()=>{
 for(const change of [h=>h.s.view='sandbox',h=>h.s.historyRender++]){
  const h=setup();let release;h.setPending(new Promise(resolve=>release=resolve));const task=h.c.socialShowHistory(h.s,[{id:'past'}],h.host);change(h);
  release({posts:[{images:[{path:'stale'}]}]});await task;assert.equal(h.downloads.length,0);assert.doesNotMatch(h.host.innerHTML,/stale/);
 }
});
test('production and demo use the same read-only original-image history',()=>assert.equal(part(app),part(demo)));
