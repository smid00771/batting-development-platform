import assert from 'node:assert/strict';
import {createSelectionVideoHandler} from '../Functions/selection-video/handler.mjs';
const club='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222';
const roomName='cb-'+club.replaceAll('-',''),exp=Math.floor(Date.now()/1000)+5400;
const roomData={name:roomName,privacy:'private',url:'https://club-test.daily.co/'+roomName,config:{exp}};
let calls=[],key='server-only-key',allowed=true,enabled=true,missing=true,race=false,roomOverride={},failToken=false;
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const handler=createSelectionVideoHandler({env:n=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon',DAILY_API_KEY:key})[n],fetcher:async(url,options)=>{
 const body=options.body&&JSON.parse(options.body);calls.push({url,...options,body});
 if(url.endsWith('/auth/v1/user'))return response({id:'selector'});
 if(url.includes('/rest/')){
  assert.equal(options.headers.Authorization,'Bearer session-token');
  if(!allowed)return response({code:'42501',message:'Assigned selectors only'},403);
  if(body.p_action==='access')return response({allowed:true,video_enabled:enabled});
  assert.equal(body.p_action,'reserve_video');assert.equal(body.p_data.request_id,request);
  return response({room_name:roomName,entry_id:request,user_name:'Selector',expires_at:new Date(exp*1000).toISOString()});
 }
 assert.equal(options.headers.Authorization,'Bearer server-only-key');assert.equal(options.redirect,'error');
 if(url.endsWith('/rooms/'+roomName)){if(missing){missing=false;return response({},404);}return response({...roomData,...roomOverride});}
 if(url.endsWith('/rooms'))return race?response({},400):response({...roomData,...roomOverride});
 if(url.endsWith('/meeting-tokens'))return failToken?response({error:'bad token'},500):response({token:'test-private-token-long-enough'});
 throw Error('Unexpected network request');
}});
async function invoke(action='join',extra={},headers={}){return handler(new Request('https://test.supabase.co/functions/v1/selection-video',{method:'POST',headers:{origin:'https://clubbatting.com',authorization:'Bearer session-token',...headers},body:JSON.stringify({club_id:club,request_id:request,action,...extra})}));}
let r=await invoke('status');assert.equal(r.status,200);assert.deepEqual(await r.json(),{available:true,reason:'ready'});assert.equal(calls.some(c=>c.url.includes('api.daily.co')),false,'Checking status must not contact Daily');
calls=[];key='';r=await invoke();assert.equal(r.status,503);assert.equal(calls.length,2);key='server-only-key';
calls=[];allowed=false;r=await invoke();assert.equal(r.status,403);assert.equal(calls.some(c=>c.url.includes('api.daily.co')),false);allowed=true;
calls=[];enabled=false;r=await invoke();assert.equal(r.status,403);assert.equal(calls.some(c=>c.url.includes('api.daily.co')),false);enabled=true;
calls=[];r=await invoke();assert.equal(r.status,200);const data=await r.json();assert.equal(data.token,'test-private-token-long-enough');assert.equal(JSON.stringify(data).includes(key),false);
const create=calls.find(c=>c.url.endsWith('/rooms'));assert.equal(create.body.privacy,'private');assert.equal(create.body.properties.exp,exp);assert.equal(create.body.properties.eject_at_room_exp,true);assert.equal(create.body.properties.enable_knocking,false);assert.equal(create.body.properties.enforce_unique_user_ids,true);
const token=calls.find(c=>c.url.endsWith('/meeting-tokens')).body.properties;assert.equal(token.room_name,roomName);assert.equal(token.exp,exp);assert.equal(token.is_owner,false);assert.equal(token.eject_at_token_exp,true);assert.equal(token.user_id,request);assert.equal(token.start_cloud_recording,false);assert.equal(token.auto_start_transcription,false);assert.equal(token.permissions.canAdmin,false);
missing=true;race=true;calls=[];r=await invoke();assert.equal(r.status,200,'Concurrent first join reuses the same room');assert.equal(calls.filter(c=>c.url.endsWith('/rooms/'+roomName)).length,2);race=false;
for(const bad of [{privacy:'public'},{url:'https://evil.test/'+roomName},{config:{exp:exp+100}}]){roomOverride=bad;calls=[];r=await invoke();assert.equal(r.status,400);assert.equal(calls.some(c=>c.url.endsWith('/meeting-tokens')),false);}roomOverride={};
failToken=true;r=await invoke();assert.equal(r.status,400);assert.match((await r.json()).error,/prepare your place/);failToken=false;
calls=[];r=await invoke('join',{}, {authorization:''});assert.equal(r.status,401);assert.equal(calls.length,0);
r=await invoke('join',{}, {origin:'https://evil.test'});assert.equal(r.status,403);assert.equal(calls.length,0);
r=await invoke('join',{club_id:'not-a-club'});assert.equal(r.status,400);assert.equal(calls.length,0);
console.log('Selection video: user authorization, disabled/missing setup, private expiring room/tokens, race retry, provider failure and CORS passed.');
