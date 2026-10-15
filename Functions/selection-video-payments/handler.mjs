// Credit is granted only from a verified Stripe event, never a return-page URL.
export function createVideoPaymentHandler({env,verifyEvent,fetcher=fetch}){
 return async req=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  const signature=req.headers.get('stripe-signature');
  if(!signature)return reply({error:'Stripe signature required'},400);
  if(Number(req.headers.get('content-length'))>256000)return reply({error:'Request too large'},413);
  const base=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!key)return reply({error:'Payments unavailable'},503);
  const rpc=async(name,body)=>{
   const r=await fetcher(base+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('Payment storage unavailable');return r.json();
  };
  let event,config;
  try{
   const body=await req.text();if(body.length>256000)return reply({error:'Request too large'},413);
   config=await rpc('selection_video_stripe_secret',{});
   if(!config?.secret)return reply({error:'Payments not configured'},503);
   try{event=await verifyEvent(body,signature,config.secret);}catch{return reply({error:'Invalid Stripe signature'},400);}
   // A dedicated account endpoint must not accept Connect or sandbox events.
   if(event.livemode!==config.livemode||event.account&&event.account!==config.account)return reply({error:'Wrong payment account'},400);
   if(!['checkout.session.completed','checkout.session.async_payment_succeeded','charge.refunded'].includes(event.type))return reply({received:true});
   const object=event.data?.object;
   if(!object||typeof event.id!=='string')return reply({error:'Invalid Stripe event'},400);
   const result=await rpc('selection_video_payment_event',{p_event:{id:event.id,type:event.type,created:event.created,livemode:event.livemode,object}});
   return reply({received:true,status:result.status});
  }catch{return reply({error:'Payment confirmation will retry'},500);}
 };
}
