import {prepareSupportReply,HANDOVER} from './assistant.mjs';
import {KNOWLEDGE_VERSION} from './knowledge.mjs';
import {verifyEmailWebhook,incomingSupportEmail,supportEmailPayload} from './email.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function boundedText(message,limit){
 if(Number(message.headers.get('content-length'))>limit)throw Error('Too large');
 const reader=message.body?.getReader();if(!reader)return '';
 const decoder=new TextDecoder();let size=0,text='';
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Too large');}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}
 finally{reader.releaseLock();}
}
export function createSupportHandler({env,fetcher=fetch,now=()=>Date.now()}){
 const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
 async function rpc(action,data={}){
  const response=await fetcher(base+'/rest/v1/rpc/mirelion_support_worker',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Support storage unavailable');return response.json();
 }
 async function deliver(job){
  const key=env('RESEND_SUPPORT_API_KEY')||env('RESEND_API_KEY'),from=env('SUPPORT_FROM_ADDRESS');
  if(!key||!from){await rpc('finish_delivery',{...job,sent:false});return false;}
  try{
   const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'mirelion-support-'+job.message_id},body:JSON.stringify(supportEmailPayload(job,from)),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Delivery unavailable');
   const receipt=await response.json();if(typeof receipt.id!=='string'||!receipt.id)throw Error('Delivery unconfirmed');
   let internetId=null;
   try{
    const sent=await fetcher('https://api.resend.com/emails/'+encodeURIComponent(receipt.id),{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(5000)});
    if(sent.ok)internetId=(await sent.json()).message_id||null;
   }catch{}
   await rpc('finish_delivery',{message_id:job.message_id,lease:job.lease,sent:true,provider_id:receipt.id,internet_id:internetId});return true;
  }catch{
   // Ambiguous sends retry the same immutable message and provider key. The DB
   // stops retries before the provider's 24-hour idempotency window expires.
   await rpc('finish_delivery',{message_id:job.message_id,lease:job.lease,sent:false});return false;
  }
 }
 return async function handle(req){
  if(req.method!=='POST')return json({error:'POST required'},405);
  if(!base||!service)return json({error:'Support is not configured'},503);
  let raw;try{raw=await boundedText(req,65536);}catch{return json({error:'Request too large'},413);}
  const bearer=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  const scheduler=env('OUTBOX_WEBHOOK_TOKEN')||'';
  const authorised=!!bearer&&(bearer===service||scheduler.length>=32&&bearer===scheduler);
  if(!authorised){
   let event;
   try{event=await verifyEmailWebhook(raw,req.headers,env('SUPPORT_INBOUND_WEBHOOK_SECRET'),now());}catch{return json({error:'Authentication required'},401);}
   if(event?.type!=='email.received')return json({ignored:true});
   const id=event.data?.email_id;
   if(!/^[0-9a-f-]{36}$/i.test(id||''))return json({error:'Invalid email event'},400);
   try{
    const status=await rpc('status');if(!status.email_enabled)return json({error:'Email connection not enabled'},503);
    const key=env('RESEND_SUPPORT_API_KEY')||env('RESEND_API_KEY');if(!key)return json({error:'Email connection not configured'},503);
    const response=await fetcher('https://api.resend.com/emails/receiving/'+id+'?html_format=cid',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
    if(!response.ok)return json({error:'Email could not be retrieved'},502);
    let data;try{data=await boundedText(response,1048576);}catch{return json({error:'Email needs manual review'},413);}
    const incoming=incomingSupportEmail(JSON.parse(data),{providerId:id,allowedRecipients:(env('SUPPORT_INBOUND_ADDRESSES')||'').split(',').map(x=>x.trim())});
    if(!incoming)return json({ignored:true});
    await rpc('ingest',incoming);return json({received:true});
   }catch{return json({error:'Email could not be recorded'},503);}
  }
  let input;try{input=JSON.parse(raw);}catch{return json({error:'Invalid request'},400);}
  try{
   if(input.action==='status')return json({...await rpc('status'),model_configured:!!env('OPENAI_API_KEY')&&!!(env('OPENAI_SUPPORT_MODEL')||env('OPENAI_GUIDE_MODEL')),email_configured:!!env('SUPPORT_INBOUND_WEBHOOK_SECRET')&&!!env('SUPPORT_INBOUND_ADDRESSES')&&!!env('SUPPORT_FROM_ADDRESS')});
   if(input.action==='preview')return json(await prepareSupportReply(input.job||{},{key:env('OPENAI_API_KEY'),model:env('OPENAI_SUPPORT_MODEL')||env('OPENAI_GUIDE_MODEL'),fetcher}));
   if(input.action!=='run')return json({error:'Unknown support action'},400);
   const started=now();let replies=0,sent=0;
   const delivery=await rpc('claim_delivery');if(delivery&&await deliver(delivery))sent++;
   for(let n=0;n<2&&now()-started<20000;n++){
    const job=await rpc('claim');if(!job)break;
    const decision=job.budget_exhausted?{kind:'handoff',body:HANDOVER,reason:'limit',topics:[],knowledge_version:KNOWLEDGE_VERSION}:await prepareSupportReply(job,{key:env('OPENAI_API_KEY'),model:env('OPENAI_SUPPORT_MODEL')||env('OPENAI_GUIDE_MODEL'),fetcher});
    const saved=await rpc('finish',{thread_id:job.thread_id,message_id:job.message_id,lease:job.lease,decision});
    if(saved?.message_id)replies++;
   }
   return json({replies,sent});
  }catch{return json({error:'Support worker will retry'},503);}
 };
}
