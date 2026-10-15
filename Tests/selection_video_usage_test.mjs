import test from 'node:test';
import assert from 'node:assert/strict';
import {collectUsage,createUsageHandler} from '../Functions/selection-video-usage/handler.mjs';

const now=Date.now(),start=Math.floor(now/1000)-10800;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const call={id:id(1),club_id:'c6022ec7-00d9-4c91-a208-710272a0b866',created_at:new Date(start*1000).toISOString(),expires_at:new Date((start+5400)*1000).toISOString(),entries:[1,2,3,4].map(n=>({id:id(10+n),created_at:new Date(start*1000).toISOString(),reserved_minutes:91}))};
const meeting={id:id(2),room:'cb-'+call.id.replaceAll('-',''),start_time:start,duration:1200,ongoing:false};
const people=call.entries.map((e,n)=>({user_id:e.id,participant_id:id(100+n),join_time:start,duration:1200}));
function provider({meetings=[meeting],participants=people,badCount=false,smallPages=false}={}){
 return async path=>{
  const url=new URL('https://api.daily.co/v1'+path);
  if(url.pathname==='/v1/meetings'){
   assert.equal(url.searchParams.get('room'),meeting.room);
   return {total_count:meetings.length+(badCount?1:0),data:url.searchParams.has('starting_after')?[]:meetings};
  }
  const cursor=url.searchParams.get('joined_before');
  assert.ok(!url.searchParams.has('joined_after'));
  const offset=cursor?participants.findIndex(p=>p.participant_id===cursor)+1:0;
  return {data:participants.slice(offset,offset+(smallPages?2:100))};
 };
}

test('four 20-minute participants use 80 minutes, with unused reservations released',async()=>{
 const result=await collectUsage(call,provider(),now);
 assert.equal(result.usage.reduce((n,p)=>n+p.seconds,0),4800);
 assert.equal(call.entries.reduce((n,e)=>n+e.reserved_minutes,0)-4800/60,284);
});
test('reconnections add their actual durations once, including short server pages',async()=>{
 const ps=[...people,{...people[0],participant_id:id(200),join_time:start+1300,duration:300}];
 const result=await collectUsage(call,provider({meetings:[{...meeting,duration:1600}],participants:ps,smallPages:true}),now);
 assert.equal(result.usage.find(p=>p.entry_id===people[0].user_id).seconds,1500);
 assert.equal(result.records.length,5);
});
test('short connections retain exact seconds rather than rounding each entry to a minute',async()=>{
 const result=await collectUsage(call,provider({participants:people.map(p=>({...p,duration:17}))}),now);
 assert.equal(result.usage.reduce((n,p)=>n+p.seconds,0),68);
});
test('room-filtered responses can omit room but cannot include another room or token',async()=>{
 const filtered={...meeting};delete filtered.room;
 const result=await collectUsage(call,provider({meetings:[filtered]}),now);
 assert.equal(result.usage.reduce((n,p)=>n+p.seconds,0),4800);
 await assert.rejects(collectUsage(call,provider({meetings:[{...meeting,room:'another-room'}]}),now),/wrong_meeting_room/);
 await assert.rejects(collectUsage(call,provider({meetings:[filtered],participants:[{...people[0],user_id:id(800)}]}),now),/invalid_participant/);
});
test('a 404 cursor ends paging only when the completed meeting still exists unchanged',async()=>{
 const base=provider();
 const cursor404=check=>async path=>{
  if(path==='/meetings/'+meeting.id)return check();
  if(path.includes('joined_before='))throw Error('daily_http_404');
  return base(path);
 };
 const result=await collectUsage(call,cursor404(()=>meeting),now);
 assert.equal(result.usage.reduce((n,p)=>n+p.seconds,0),4800);
 await assert.rejects(collectUsage(call,cursor404(()=>{throw Error('daily_http_404');}),now),/404/);
 await assert.rejects(collectUsage(call,cursor404(()=>({...meeting,duration:1300})),now),/meeting_changed/);
 await assert.rejects(collectUsage(call,async path=>path.includes('/participants?')?Promise.reject(Error('daily_http_404')):base(path),now),/404/);
 await assert.rejects(collectUsage(call,provider({meetings:[{...meeting,max_participants:5}]}),now),/incomplete_participant/);
});
test('failed joins within retained history produce zero, old missing history stays reserved',async()=>{
 const result=await collectUsage(call,provider({meetings:[]}),now);
 assert.ok(result.usage.every(p=>p.seconds===0));
 await assert.rejects(collectUsage({...call,created_at:new Date(now-25*3600000).toISOString()},provider({meetings:[]}),now),/history_unavailable/);
 await assert.rejects(collectUsage({...call,created_at:new Date(now-25*3600000).toISOString()},provider(),now),/history_unavailable/);
});
test('active calls, unfinished sessions and truncated histories cannot refund credit',async()=>{
 await assert.rejects(collectUsage({...call,expires_at:new Date(now+1000).toISOString()},provider(),now),/call_not_ready/);
 await assert.rejects(collectUsage(call,provider({meetings:[{...meeting,ongoing:true}]}),now),/unfinished/);
 await assert.rejects(collectUsage(call,provider({badCount:true}),now),/incomplete/);
 await assert.rejects(collectUsage(call,provider({participants:[]}),now),/missing_participants/);
});
test('wrong clubs, unknown users, duplicated sessions and invalid durations are rejected',async()=>{
 assert.equal((await collectUsage({...call,club_id:id(80)},provider(),now)).usage.length,4,'Commercial clubs use the same verified accounting');
 await assert.rejects(collectUsage({...call,club_id:'invalid'},provider(),now),/call_not_ready/);
 for(const p of [{...people[0],user_id:id(90)},{...people[0],duration:-1},{...people[0],duration:1200.5},{...people[0],duration:999999}])
  await assert.rejects(collectUsage(call,provider({participants:[p]}),now),/invalid/);
 await assert.rejects(collectUsage(call,provider({participants:[people[0],people[0]]}),now),/invalid/);
});
test('a provider failure preserves reservations',async()=>{
 await assert.rejects(collectUsage(call,async()=>{throw Error('daily_http_503');},now),/503/);
});
test('worker requires a valid one-time capability before contacting Daily',async()=>{
 let requests=[],valid=false;
 const handler=createUsageHandler({env:n=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service',DAILY_API_KEY:'private-daily'})[n],now:()=>now,fetcher:async(url,options)=>{
  requests.push(url);
  assert.equal(options.redirect,'error');
  if(url.endsWith('/rpc/selection_video_usage_worker')){
   assert.equal(options.headers.Authorization,'Bearer private-service');
   const body=JSON.parse(options.body);
   if(body.p_action==='claim')return new Response(JSON.stringify(valid?[call]:{}),{status:valid?200:403});
   assert.equal(body.p_action,'observe');
   assert.equal(body.p_data.usage.reduce((n,p)=>n+p.seconds,0),4800);
   return new Response(JSON.stringify({settled:true}));
  }
  assert.equal(options.headers.Authorization,'Bearer private-daily');
  return new Response(JSON.stringify(await provider()(url.replace('https://api.daily.co/v1',''))));
 }});
 const request=body=>new Request('https://test/usage',{method:'POST',body:JSON.stringify(body)});
 let response=await handler(request({}));assert.equal(response.status,401);assert.equal(requests.length,0);
 const body={run_id:id(700),token:'a'.repeat(64),usage:[{entry_id:id(11),seconds:0}]};
 response=await handler(request(body));assert.equal(response.status,401);assert.equal(requests.length,1);
 valid=true;requests=[];response=await handler(request(body));assert.deepEqual(await response.json(),{settled:1,observed:0,deferred:0});
});
