import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
// This worker has custom token authentication. It is never called from the browser.
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const safeEndpoint=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&
 (['fcm.googleapis.com','updates.push.services.mozilla.com'].includes(u.hostname)||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}};
const sameToken=(a:string,b:string)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=req.headers.get('x-club-batting-worker')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'Unauthorised'},401);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply({error:'Worker unavailable'},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(action:string,data:unknown={})=>{const r=await db.rpc('phone_notification_worker',{p_action:action,p_data:data});if(r.error)throw new Error('Notification queue unavailable');return r.data;};
 let stage='configuration',processed=0,sent=0,deferred=0,cancelled=0;
 try{
  const config=await rpc('config');
  if(!config?.worker_token||!sameToken(token,config.worker_token))return reply({error:'Unauthorised'},401);
  if(!config.public_key||!config.private_key)return reply({error:'Notifications not configured'},503);
  const body=await req.json().catch(()=>({}));
  const action=body.action||'dispatch';
  // Health checks are read-only: never collect, claim, retry or deliver messages.
  if(action==='health')return reply({ok:true,configured:true,mode:'read_only_health'});
  if(action!=='dispatch')return reply({error:'Unknown action'},400);
  const deliver=async(jobs:any[])=>{
  processed+=jobs.length;
  // Bounded concurrency avoids one slow endpoint blocking every device.
  for(let offset=0;offset<jobs.length;offset+=8)await Promise.all(jobs.slice(offset,offset+8).map(async(job:any)=>{
   let code='error';
   try{
    if(!safeEndpoint(job.endpoint)||!(await rpc('check',{id:job.id,lease:job.lease})).valid){code='cancelled';cancelled++;}
    else{
     const details=webpush.generateRequestDetails({endpoint:job.endpoint,keys:job.keys},JSON.stringify(job.payload),{
      TTL:3600,urgency:'normal',contentEncoding:'aes128gcm',vapidDetails:{subject:'https://clubbatting.com',publicKey:config.public_key,privateKey:config.private_key}});
     const res=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:new Uint8Array(details.body),redirect:'error',signal:AbortSignal.timeout(10000)});
     code=res.ok?'sent':String(res.status);await res.body?.cancel();if(res.ok)sent++;else deferred++;
    }
   }catch{code='network_error';deferred++;}
   await rpc('finish',{id:job.id,lease:job.lease,code});
  }));
  };
  // Commit message delivery before unrelated coaching/email scans. A slow scan
  // must not roll back collection or prevent already opted-in phones being sent.
  stage='club_messages';
  await rpc('collect_messages');
  await deliver(await rpc('claim_messages'));
  stage='email_retry';
  const pendingEmails=await rpc('email_pending');
  await Promise.all(pendingEmails.map(async(id:string)=>{
   try{const r=await fetch(url+'/functions/v1/dispatch-outbox',{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({type:'INSERT',schema:'public',table:'outbound_messages',record:{id}}),signal:AbortSignal.timeout(12000)});await r.body?.cancel();}catch{/* Existing outbox lock and idempotency key protect retries. */}
  }));
  stage='coaching_followup';
  await rpc('collect');
  await deliver(await rpc('claim'));
  return reply({ok:true,processed,sent,deferred,cancelled});
 }catch{
  console.error('Notification worker stage failed:',stage);
  return reply({error:'Notification worker could not finish; queued deliveries will retry',stage,processed,sent,deferred,cancelled},503);
 }
});
