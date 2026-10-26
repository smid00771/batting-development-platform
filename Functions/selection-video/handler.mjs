const origins=new Set(['https://mirelionhq.com','https://www.mirelionhq.com','https://clubbatting.com','https://www.clubbatting.com','https://clubbatting.com.au','https://www.clubbatting.com.au']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Keep the pilot; other clubs require a server-enabled, prepaid annual wallet.
const pilotClub='c6022ec7-00d9-4c91-a208-710272a0b866';

export function createSelectionVideoHandler({env,fetcher=fetch}){
 return async req=>{
  const origin=req.headers.get('origin')||'',cors={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://clubbatting.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(origin&&!origins.has(origin))return reply({error:'Open Selection Room in Club Batting.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  try{
   const auth=req.headers.get('authorization')||'';
   if(!/^Bearer \S+$/.test(auth))return reply({error:'Sign in to Club Batting.'},401);
   const raw=await req.text();if(raw.length>2000)return reply({error:'Request too large'},400);
   const input=JSON.parse(raw);
   if(!uuid.test(input.club_id||'')||!['status','join'].includes(input.action))return reply({error:'Choose a club and video action.'},400);
   if(input.action==='join'&&!uuid.test(input.request_id||''))return reply({error:'Video request required.'},400);
   if(input.use_video!==undefined&&typeof input.use_video!=='boolean')return reply({error:'Choose audio or video before starting the call.'},400);
   if(input.selection_group_id!==undefined&&!uuid.test(input.selection_group_id||''))return reply({error:'Choose a Selection Group.'},400);
   input.club_id=input.club_id.toLowerCase();
   const base=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY');
   const headers={apikey:anon,Authorization:auth,'Content-Type':'application/json'};
   const user=await fetcher(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});
   if(!user.ok)return reply({error:'Sign in again to join Selection Room.'},401);
   const rpc=async(action,data={})=>{
    const r=await fetcher(base+'/rest/v1/rpc/selection_room_api',{method:'POST',headers,body:JSON.stringify({p_club_id:input.club_id,p_action:action,p_data:{...data,selection_group_id:input.selection_group_id}}),signal:AbortSignal.timeout(10000)});
    const d=await r.json();if(!r.ok){const e=Error(d.message||'Selection Room could not connect.');e.status=d.code==='42501'?403:400;throw e;}return d;
   };
   const access=await rpc('access');
   const managed=access.video_credit?.kind==='annual'&&access.video_credit?.enabled===true;
   const key=input.club_id===pilotClub||managed?env('DAILY_API_KEY'):null;
   if(input.action==='status')return reply({available:!!key&&access.video_enabled===true,reason:!access.video_enabled?'not_enabled':!key?'billing_required':'ready',active_call:access.active_call||null});
   if(!access.video_enabled)return reply({error:'Video is not enabled for this club yet.'},403);
   if(!key)return reply({error:'Club Batting video is not enabled for this club yet. Chat and the backup call are available.'},503);
   const reservation=await rpc('reserve_video',{request_id:input.request_id,use_video:input.use_video===true});
   if(!['audio','video'].includes(reservation.call_mode))throw Error('The call type could not be verified. Try again.');
   const video=reservation.call_mode==='video',permissions={canSend:video?true:['audio'],canAdmin:false};
   const name=reservation.room_name,exp=Math.floor(new Date(reservation.expires_at).getTime()/1000);
   if(!/^cb-[0-9a-f]{32}$/.test(name)||!Number.isFinite(exp)||exp<=Date.now()/1000)throw Error('This call has ended. Join a new call.');
   const daily=async(path,method='GET',body)=>{
    const r=await fetcher('https://api.daily.co/v1'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    let data;try{data=await r.json();}catch{data={};}return {ok:r.ok,status:r.status,data};
   };
   let room=await daily('/rooms/'+name);
   if(room.status===404){
    room=await daily('/rooms','POST',{name,privacy:'private',properties:{exp,eject_at_room_exp:true,max_participants:12,enable_knocking:false,enable_chat:false,enable_prejoin_ui:false,enable_screenshare:video,start_audio_off:true,start_video_off:true,permissions,enable_live_captions_ui:false,enable_noise_cancellation_ui:false,enable_dialout:false,enforce_unique_user_ids:true}});
    // Two selectors can be the first to join. Only accept the same private, expiring room.
    if(!room.ok&&room.status===400)room=await daily('/rooms/'+name);
   }
   if(!room.ok)throw Error('Video could not connect to Daily. Try again or use the backup call.');
   const url=new URL(room.data.url);
   if(room.data.name!==name||room.data.privacy!=='private'||Number(room.data.config?.exp)!==exp||url.protocol!=='https:'||!url.hostname.endsWith('.daily.co')||url.pathname!=='/'+name||url.username||url.password)throw Error('The private video room could not be verified.');
   // The database fixes the room's mode before any tokens are issued. Audio-only
   // tokens cannot publish camera, screen or custom video, or grant themselves permission.
   const token=await daily('/meeting-tokens','POST',{properties:{room_name:name,exp,eject_at_token_exp:true,is_owner:false,user_id:reservation.entry_id,user_name:reservation.user_name,start_audio_off:false,start_video_off:true,enable_prejoin_ui:false,enable_screenshare:video,enable_live_captions_ui:false,enable_recording_ui:false,start_cloud_recording:false,auto_start_transcription:false,permissions}});
   if(!token.ok||typeof token.data.token!=='string'||token.data.token.length<20)throw Error('Video could not prepare your place. Try again.');
   // Permission may change while the provider requests are in flight. Never
   // expose this token until the same entry and exact group are re-authorized.
   const confirmed=await rpc('confirm_video',{entry_id:reservation.entry_id,room_name:name});
   if(confirmed.confirmed!==true||confirmed.entry_id!==reservation.entry_id)throw Error('Your call access could not be confirmed. Try again.');
   return reply({url:url.href,token:token.data.token,expires_at:reservation.expires_at,user_name:reservation.user_name,call_mode:reservation.call_mode});
  }catch(error){
   return reply({error:error instanceof SyntaxError?'Check the video request.':error?.message||'Video could not connect.'},error?.status||400);
  }
 };
}
