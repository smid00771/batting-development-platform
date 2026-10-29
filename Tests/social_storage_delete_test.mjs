import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSocialAwards} from '../social-awards.js';
import {createSocialPublishing} from '../social-publishing.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function idle(s){for(let i=0;i<50;i++){await tick();if(!s.busy&&!s.awards?.busy)return;}throw Error('Delete did not finish');}
function env(){const dom=new JSDOM('<main id="socialContent"></main>',{url:'https://example.test/'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage});return dom;}

test('Delete image confirms first, removes the actual object, and can finish an interrupted deletion',async()=>{
 const dom=env();let confirms=false,failRemove=true,loseFinish=true,deleted=false;globalThis.confirm=()=>confirms;
 const item={id:'image-1',label:'Results',kind:'results',bucket:'club-social-awards',image_path:'club/editions/one.png',scores_current:true};
 const files=new Map([[item.image_path,new Blob(['stored image'])],['club/artwork/template.png',new Blob(['template'])]]),calls=[];
 const s={scope:'user:club',view:'award_collection',data:{awards:{enabled:['results']},brand:{}},urls:new Map()};let awards;
 const api={rpc:async(_,{p_action,p_data})=>{calls.push(p_action+(p_data.finish?':finish':''));assert.equal(p_action,'delete_image');if(p_data.finish){assert.equal(files.has(item.image_path),false);deleted=true;if(loseFinish){loseFinish=false;return {error:{message:'Response lost'}};}}return {data:{id:item.id,bucket:item.bucket,path:item.image_path,deleted}};},storage:{from:b=>({download:async p=>({data:files.get(p)}),remove:async paths=>{calls.push('remove:'+b);assert.deepEqual(paths,[item.image_path]);if(failRemove){failRemove=false;return {error:{message:'Offline'}};}paths.forEach(p=>files.delete(p));return {data:[]};}})}};
 const h={supabase:api,escape:v=>String(v??''),here:x=>x===s,draw:()=>awards.render(s),canLeave:()=>true,message:(_,m)=>s.notice=m};awards=createSocialAwards(h);
 const w=awards.state(s);w.context={editions:[structuredClone(item)],cards:[],settings:s.data.awards,designs:{},photos:[],requests:[],candidates:[]};w.selected.add(item.id);awards.render(s);await tick();
 document.querySelector('[data-sa-delete]').click();await idle(s);assert.equal(calls.length,0);assert.ok(files.has(item.image_path));
 confirms=true;document.querySelector('[data-sa-delete]').click();await idle(s);assert.match(document.querySelector('[data-sa-delete]').textContent,/Retry/);assert.ok(files.has(item.image_path));assert.equal(w.selected.has(item.id),false);
 document.querySelector('[data-sa-delete]').click();await idle(s);assert.equal(files.has(item.image_path),false);assert.match(document.querySelector('[data-sa-delete]').textContent,/Retry/);
 const removedCalls=calls.filter(x=>x.startsWith('remove:')).length;document.querySelector('[data-sa-delete]').click();await idle(s);
 assert.equal(calls.filter(x=>x.startsWith('remove:')).length,removedCalls,'Confirmed retry does not delete another object');
 assert.equal(document.querySelector('[data-sa-delete]'),null);assert.ok(files.has('club/artwork/template.png'));assert.match(document.querySelector('#saStatus').textContent,/stored file has been removed/);dom.window.close();
});

test('old saved post deletion removes every stored copy, retains other files and makes no remote publish/delete call',async()=>{
 const dom=env();globalThis.confirm=()=>true;let fail=true,finished=false,remote=0;
 const post={id:'post-1',state:'approved',created_at:new Date().toISOString(),can_delete:true,images:[{path:'club/post-1/0.jpg',label:'Results'},{path:'club/post-1/1.jpg',label:'Award'}],destinations:[{platform:'facebook',state:'published'}]};
 const files=new Map(post.images.map(i=>[i.path,new Blob(['image'])]));files.set('other.jpg',new Blob(['keep']));
 const s={scope:'user:club',view:'award_collection',publishing:{context:{posts:[post]},loadedAt:Date.now()}};let publisher;
 const api={rpc:async(_,{p_action,p_data})=>{assert.equal(p_action,'delete_post');if(p_data.finish){assert.ok(post.images.every(i=>!files.has(i.path)));finished=true;}return {data:{bucket:'club-social-posts',paths:post.images.map(i=>i.path),deleted:finished}};},storage:{from:bucket=>({remove:async paths=>{assert.equal(bucket,'club-social-posts');assert.equal(paths.length,2);if(fail){fail=false;return {error:{message:'Offline'}};}paths.forEach(p=>files.delete(p));return {data:[]};}})},functions:{invoke:()=>{remote++;throw Error('Unexpected remote request');}}};
 const h={supabase:api,escape:v=>String(v??''),here:x=>x===s,draw:()=>publisher.awardsHistory(s,document.querySelector('#socialContent')),lock:()=>{},message:(_,m)=>s.notice=m};publisher=createSocialPublishing(h);h.draw();
 document.querySelector('[data-sp-delete]').click();await idle(s);assert.match(document.querySelector('[data-sp-delete]').textContent,/Retry/);assert.equal(files.size,3);
 document.querySelector('[data-sp-delete]').click();await idle(s);assert.equal(files.size,1);assert.equal(remote,0);assert.equal(s.publishing.context.posts.length,0);assert.match(s.notice,/stored image files have been removed/);dom.window.close();
});
