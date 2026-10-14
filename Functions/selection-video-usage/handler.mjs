// Only Daily's server records can settle a reservation. No browser usage reports.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pilotClub='c6022ec7-00d9-4c91-a208-710272a0b866';
const fail=code=>{throw new Error(code);};

export async function collectUsage(call,daily,now=Date.now()){
 const created=Date.parse(call.created_at)/1000,expires=Date.parse(call.expires_at)/1000;
 if(!uuid.test(call.id)||call.club_id!==pilotClub||!Number.isFinite(created)||!Number.isFinite(expires)||expires>now/1000-120)fail('call_not_ready');
 // Daily's shortest analytics retention is one day. Older history may be
 // partially purged, even when the endpoint still returns some meetings.
 if(created<now/1000-23*3600)fail('history_unavailable');
 const room='cb-'+call.id.replaceAll('-','');
 const entries=new Map(call.entries.map(e=>[e.id,e]));
 if(!entries.size||entries.size!==call.entries.length)fail('invalid_entries');
 const totals=new Map([...entries.keys()].map(id=>[id,0]));
 const meetings=[],seenMeetings=new Set();
 let cursor,expected;
 for(let page=0;page<20;page++){
  const query=new URLSearchParams({room,limit:'100',no_participants:'true'});
  if(cursor)query.set('starting_after',cursor);
  const result=await daily('/meetings?'+query);
  if(!Array.isArray(result.data)||!Number.isSafeInteger(result.total_count)||result.total_count<0)fail('invalid_meeting_response');
  if(expected!==undefined&&expected!==result.total_count)fail('meeting_list_changed');
  expected=result.total_count;
  for(const meeting of result.data){
   if(!uuid.test(meeting.id)||seenMeetings.has(meeting.id))fail('invalid_meeting_identity');
   // A room-filtered Daily response can omit its room field. The request is
   // scoped to this exact room; every participant must also match its token.
   if(meeting.room!==undefined&&meeting.room!==room)fail('wrong_meeting_room');
   if(meeting.ongoing!==false)fail('unfinished_meeting');
   if(!Number.isFinite(meeting.start_time)||!Number.isFinite(meeting.duration)||meeting.duration<0)fail('invalid_meeting_duration');
   if(meeting.start_time<created-10)fail('meeting_before_reservation');
   if(meeting.start_time+meeting.duration>expires+60)fail('meeting_after_expiry');
   seenMeetings.add(meeting.id);meetings.push(meeting);
  }
  if(meetings.length===expected)break;
  if(!result.data.length||meetings.length>expected||page===19)fail('incomplete_meeting_history');
  cursor=result.data.at(-1).id;
 }
 const records=[],seenParticipants=new Set();
 for(const meeting of meetings){
  let participantCursor;
  for(let page=0;page<100;page++){
   const query=new URLSearchParams({limit:'100'});
   if(participantCursor)query.set('joined_before',participantCursor);
   let result;
   try{result=await daily('/meetings/'+meeting.id+'/participants?'+query);}
   catch(error){
    if(!participantCursor||error?.message!=='daily_http_404')throw error;
    // Daily can return 404 when a cursor has no remaining participants. Verify
    // the completed meeting still exists unchanged before treating that as EOF.
    const check=await daily('/meetings/'+meeting.id);
    if(check.id!==meeting.id||check.ongoing!==false||check.start_time!==meeting.start_time||check.duration!==meeting.duration
     ||(check.room!==undefined&&check.room!==room))fail('meeting_changed_during_paging');
    result={data:[]};
   }
   if(!Array.isArray(result.data))fail('invalid_participant_response');
   for(const p of result.data){
    const entry=entries.get(p.user_id),identity=meeting.id+':'+p.participant_id;
    if(!entry||!uuid.test(p.participant_id)||seenParticipants.has(identity)||!Number.isSafeInteger(p.duration)||p.duration<0||!Number.isFinite(p.join_time)||p.join_time<Date.parse(entry.created_at)/1000-10||p.join_time+p.duration>expires+60)fail('invalid_participant_history');
    seenParticipants.add(identity);totals.set(p.user_id,totals.get(p.user_id)+p.duration);
    records.push({meeting_id:meeting.id,participant_id:p.participant_id,entry_id:p.user_id,join_time:p.join_time,duration:p.duration});
   }
   // Request one further page even after a short page, so server-side page caps
   // cannot silently truncate reconnects. The endpoint has no total_count.
   if(!result.data.length)break;
   const next=result.data.at(-1).participant_id;
   if(next===participantCursor||page===99)fail('incomplete_participant_history');
   participantCursor=next;
  }
  const count=records.filter(p=>p.meeting_id===meeting.id).length;
  if(!count&&meeting.duration>0)fail('missing_participants');
  if(Number.isSafeInteger(meeting.max_participants)&&count<meeting.max_participants)fail('incomplete_participant_history');
 }
 const usage=[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([entry_id,seconds])=>{
  if(seconds>entries.get(entry_id).reserved_minutes*60)fail('usage_exceeds_reservation');
  return {entry_id,seconds};
 });
 records.sort((a,b)=>(a.meeting_id+':'+a.participant_id).localeCompare(b.meeting_id+':'+b.participant_id));
 return {usage,records};
}

export function createUsageHandler({env,fetcher=fetch,now=Date.now}){
 return async req=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  let input;
  try{
   const raw=await req.text();if(raw.length>1000)return reply({error:'Invalid worker request'},400);
   input=JSON.parse(raw);
   if(!uuid.test(input.run_id||'')||!/^[0-9a-f]{64}$/.test(input.token||''))return reply({error:'Worker authorization required'},401);
  }catch{return reply({error:'Invalid worker request'},400);}
  const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY'),key=env('DAILY_API_KEY');
  if(!base||!service||!key)return reply({error:'Worker unavailable'},503);
  const rpc=async(action,data)=>{
   const r=await fetcher(base+'/rest/v1/rpc/selection_video_usage_worker',{method:'POST',redirect:'error',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)fail('worker_database_error');return r.json();
  };
  let calls;
  try{calls=await rpc('claim',{run_id:input.run_id,token:input.token,club_id:pilotClub});}
  catch{return reply({error:'Worker authorization failed'},401);}
  if(!Array.isArray(calls))return reply({error:'Invalid work list'},500);
  const daily=async path=>{
   const r=await fetcher('https://api.daily.co/v1'+path,{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
   if(!r.ok)fail('daily_http_'+r.status);
   return r.json();
  };
  let settled=0,observed=0,deferred=0;
  for(const call of calls){
   try{
    const result=await collectUsage(call,daily,now());
    const outcome=await rpc('observe',{run_id:input.run_id,call_id:call.id,...result});
    if(outcome.settled)settled++;else observed++;
   }catch(error){
    deferred++;
    const code=/^[a-z_]+(?:_[0-9]{3})?$/.test(error?.message||'')?error.message:'provider_or_database_error';
    try{await rpc('defer',{run_id:input.run_id,call_id:call.id,code});}catch{/* Lease expires; the scheduled worker will retry. */}
   }
  }
  return reply({settled,observed,deferred});
 };
}
