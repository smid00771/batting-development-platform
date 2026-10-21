import assert from 'node:assert/strict';
import {createSelectionVideoHandler} from '../Functions/selection-video/handler.mjs';
const club='c6022ec7-00d9-4c91-a208-710272a0b866',request='22222222-2222-4222-8222-222222222222';
const roomName='cb-'+club.replaceAll('-',''),exp=Math.floor(Date.now()/1000)+5400;
const roomData={name:roomName,privacy:'private',url:'https://club-test.daily.co/'+roomName,config:{exp}};
let calls=[],key='server-only-key',allowed=true,enabled=true,missing=true,race=false,roomOverride={},failToken=false,managed=false,callMode='audio',denyConfirm=false,badConfirm=false;
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const handler=createSelectionVideoHandler({env:n=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'anon',DAILY_API_KEY:key,DAILY_PLATFORM_API_KEY:key})[n],fetcher:async(url,options)=>{
 const body=options.body&&JSON.parse(options.body);calls.push({url,...options,body});
 if(url.endsWith('/auth/v1/user'))return response({id:'selector'});
 if(url.includes('/rest/')){
  assert.equal(options.headers.Authorization,'Bearer session-token');
  if(!allowed)return response({code:'42501',message:'Assigned selectors only'},403);
  if(body.p_action==='access')return response({allowed:true,video_enabled:enabled,video_credit:{kind:'annual',enabled:managed}});
  if(body.p_action==='confirm_video'){assert.equal(body.p_data.entry_id,request);assert.equal(body.p_data.room_name,roomName);return denyConfirm?response({code:'42501',message:'Call access revoked'},403):response({confirmed:!badConfirm,entry_id:request});}
  assert.equal(body.p_action,'reserve_video');assert.equal(body.p_data.request_id,request);
  return response({room_name:roomName,entry_id:request,user_name:'Selector',expires_at:new Date(exp*1000).toISOString(),call_mode:callMode});
 }
 assert.equal(options.headers.Authorization,'Bearer server-only-key');assert.equal(options.redirect,'error');
 if(url.endsWith('/rooms/'+roomName)){if(missing){missing=false;return response({},404);}return response({...roomData,...roomOverride});}
 if(url.endsWith('/rooms'))return race?response({},400):response({...roomData,...roomOverride});
 if(url.endsWith('/meeting-tokens'))return failToken?response({error:'bad token'},500):response({token:'test-private-token-long-enough'});
 throw Error('Unexpected network request');
}});
async function invoke(action='join',extra={},headers={}){return handler(new Request('https://test.supabase.co/functions/v1/selection-video',{method:'POST',headers:{origin:'https://clubbatting.com',authorization:'Bearer session-token',...headers},body:JSON.stringify({club_id:club,request_id:request,action,...extra})}));}
let r=await invoke('status');assert.equal(r.status,200);assert.deepEqual(await r.json(),{available:true,reason:'ready',active_call:null});assert.equal(calls.some(c=>c.url.includes('api.daily.co')),false,'Checking status must not contact Daily');
calls=[];key='';r=await invoke();assert.equal(r.status,503);assert.equal(calls.length,2);key='server-only-key';
calls=[];allowed=false;r=await invoke();assert.equal(r.status,403);assert.equal(calls.some(c=>c.url.includes('api.daily.co')),false);allowed=true;
calls=[];enabled=false;r=await invoke();assert.equal(r.status,403);assert.equal(calls.some(c=>c.url.includes('api.daily.co')),false);enabled=true;
calls=[];r=await invoke();assert.equal(r.status,200);const data=await r.json();assert.equal(data.token,'test-private-token-long-enough');assert.equal(JSON.stringify(data).includes(key),false);
const create=calls.find(c=>c.url.endsWith('/rooms'));assert.equal(create.body.privacy,'private');assert.equal(create.body.properties.exp,exp);assert.equal(create.body.properties.eject_at_room_exp,true);assert.equal(create.body.properties.enable_knocking,false);assert.equal(create.body.properties.enforce_unique_user_ids,true);
const token=calls.find(c=>c.url.endsWith('/meeting-tokens')).body.properties;assert.equal(token.room_name,roomName);assert.equal(token.exp,exp);assert.equal(token.is_owner,false);assert.equal(token.eject_at_token_exp,true);assert.equal(token.user_id,request);assert.equal(token.start_cloud_recording,false);assert.equal(token.auto_start_transcription,false);assert.equal(token.permissions.canAdmin,false);assert.equal(token.start_audio_off,false,'Join call enables audio');assert.equal(token.start_video_off,true,'Camera starts off');assert.equal(token.enable_prejoin_ui,false,'The app controls the audio-first join');
assert.equal(data.call_mode,'audio');assert.deepEqual(token.permissions.canSend,['audio']);assert.equal(token.enable_screenshare,false);assert.deepEqual(create.body.properties.permissions.canSend,['audio']);assert.equal(create.body.properties.enable_screenshare,false);
assert.ok(calls.findIndex(c=>c.body?.p_action==='confirm_video')>calls.findIndex(c=>c.url.endsWith('/meeting-tokens')),'Authorization is checked after minting, before disclosure');
calls=[];denyConfirm=true;r=await invoke('join',{selection_group_id:request});assert.equal(r.status,403);assert.equal((await r.json()).token,undefined);assert.ok(calls.some(c=>c.url.endsWith('/meeting-tokens')));assert.ok(calls.filter(c=>c.body?.p_action).every(c=>c.body.p_data.selection_group_id===request));denyConfirm=false;
badConfirm=true;r=await invoke();assert.equal(r.status,400);assert.equal((await r.json()).token,undefined);badConfirm=false;
// A later client cannot override the database's room-wide mode.
calls=[];r=await invoke('join',{use_video:true});assert.equal(r.status,200);assert.equal((await r.json()).call_mode,'audio');assert.deepEqual(calls.find(c=>c.url.endsWith('/meeting-tokens')).body.properties.permissions.canSend,['audio']);
callMode='video';calls=[];r=await invoke('join',{use_video:false});assert.equal(r.status,200);assert.equal((await r.json()).call_mode,'video');assert.equal(calls.find(c=>c.url.endsWith('/meeting-tokens')).body.properties.permissions.canSend,true);callMode='audio';
calls=[];r=await invoke('join',{use_video:'true'});assert.equal(r.status,400);assert.equal(calls.length,0);
missing=true;race=true;calls=[];r=await invoke();assert.equal(r.status,200,'Concurrent first join reuses the same room');assert.equal(calls.filter(c=>c.url.endsWith('/rooms/'+roomName)).length,2);race=false;
for(const bad of [{privacy:'public'},{url:'https://evil.test/'+roomName},{config:{exp:exp+100}}]){roomOverride=bad;calls=[];r=await invoke();assert.equal(r.status,400);assert.equal(calls.some(c=>c.url.endsWith('/meeting-tokens')),false);}roomOverride={};
failToken=true;r=await invoke();assert.equal(r.status,400);assert.match((await r.json()).error,/prepare your place/);failToken=false;
// Other clubs cannot fall back to the pilot's personal billing, even when enabled.
const otherClub='33333333-3333-4333-8333-333333333333';
for(const action of ['status','join']){
 calls=[];r=await invoke(action,{club_id:otherClub,api_key:key,billing_club_id:'c6022ec7-00d9-4c91-a208-710272a0b866'});
 assert.equal(r.status,action==='status'?200:503);
 const blocked=await r.json();if(action==='status')assert.deepEqual(blocked,{available:false,reason:'billing_required',active_call:null});
 assert.equal(calls.some(c=>c.url.includes('api.daily.co')),false,'No provider request without club billing');
 assert.equal(calls.some(c=>c.body?.p_action==='reserve_video'),false,'Do not reserve minutes for unconfigured clubs');
 assert.ok(!JSON.stringify(blocked).includes(key));
}
// Managed billing must come from the authenticated server response.
managed=true;calls=[];r=await invoke('join',{club_id:otherClub});assert.equal(r.status,200);
assert.ok(calls.some(c=>c.url.includes('api.daily.co')));managed=false;
// The existing City key still works and UUID case cannot change its billing scope.
calls=[];r=await invoke('status',{club_id:'C6022EC7-00D9-4C91-A208-710272A0B866'});assert.deepEqual(await r.json(),{available:true,reason:'ready',active_call:null});
assert.equal(calls.find(c=>c.body?.p_action==='access').body.p_club_id,'c6022ec7-00d9-4c91-a208-710272a0b866');
calls=[];r=await invoke('join',{}, {authorization:''});assert.equal(r.status,401);assert.equal(calls.length,0);
r=await invoke('join',{}, {origin:'https://evil.test'});assert.equal(r.status,403);assert.equal(calls.length,0);
r=await invoke('join',{club_id:'not-a-club'});assert.equal(r.status,400);assert.equal(calls.length,0);
console.log('Selection video: club billing isolation, user authorization, disabled/missing setup, private expiring room/tokens, race retry, provider failure and CORS passed.');
