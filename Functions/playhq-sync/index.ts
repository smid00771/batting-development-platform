import {sharedScorecard} from './shared-scorecard.mjs';
import {publicAPI,clubTeams,gradeFixtures,gameSummary} from './public-api.mjs';
const origins=new Set(['https://clubbatting.com','https://www.clubbatting.com','https://clubbatting.com.au','https://www.clubbatting.com.au']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://clubbatting.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'Use Club Batting to connect.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const auth=req.headers.get('authorization')||'';
 async function rpc(name:string,data:unknown,backend=false){
  const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:backend?service:anon,Authorization:backend?'Bearer '+service:auth,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
  const value=await r.json();if(!r.ok)throw Error(value.message||'PlayHQ connection request failed');return value;
 }
 let club:string|undefined,connection:any;
 const worker=(action:string,data:unknown={})=>rpc('playhq_sync_worker',{p_action:action,p_data:{club_id:club,generation:connection?.generation,...data as object}},true);
 async function checkJob(job:any){
  const api=publicAPI({key:connection.key});
  try{
   let result:any;
   if(job.kind==='fixtures')result=gradeFixtures(await api.fixtures(job.source_id),{teamId:job.team_id,gradeId:job.source_id,timezone:connection.timezone});
   else {
    const context=await worker('scorecard_context',{match_id:job.source_id,team_id:job.team_id});
    const body=await api.summary(job.source_id);
    result={...gameSummary(body,job.source_id),shared_scorecard:await sharedScorecard(body,context)};
   }
   await worker('finish',{job,result});return reply({checked:1});
  }catch(error){
   const status=(error as any).status||null;
   await worker('job_error',{job,status,error:status?`PlayHQ request failed (${status})`:'PlayHQ could not be checked. Review fixture details or retry later.'});
   return reply({checked:0,error:status?`PlayHQ request failed (${status})`:'PlayHQ could not be checked. Review fixture details or retry later.'},502);
  }
 }
 try{
  const raw=await req.text();if(raw.length>10000)return reply({error:'Request too large'},400);
  const input=JSON.parse(raw);
  if(input.action==='run'){
   if(typeof input.token!=='string'||input.token.length!==64||typeof input.run_id!=='string')return reply({error:'Scheduled check token required'},403);
   // One leased job per invocation bounds work and prevents overlapping writes.
   const job=await worker('claim',{run_id:input.run_id,token:input.token});if(!job)return reply({checked:0});
   club=job.club_id;connection=await worker('connection');
   return await checkJob(job);
  }
  club=input.club_id;
  // This user-scoped RPC checks membership and selector/admin authority before key access.
  await rpc('playhq_sync_api',{p_club_id:club,p_action:'status',p_data:{}});
  connection=await worker('connection');const api=publicAPI({key:connection.key});
  if(input.action==='check'){
   const job=await worker('claim_fixture',{fixture_id:input.fixture_id,kind:input.kind});return await checkJob(job);
  }
  if(input.action==='seasons'){
   const seasons=await api.seasons(connection.association_id);await worker('verified');return reply({seasons});
  }
  if(input.action==='teams'){
   const [teams,grades]=await Promise.all([api.teams(input.season_id),api.grades(input.season_id)]);
   return reply({teams:clubTeams(teams,connection.organisation_id),grades});
  }
  if(input.action==='preview'){
   const teams=clubTeams(await api.teams(input.season_id),connection.organisation_id);
   if(!teams.some((t:any)=>t.id===input.team_id&&t.grade?.id===input.grade_id))return reply({error:'Choose a team belonging to this club and season.'},400);
   const result=gradeFixtures(await api.fixtures(input.grade_id),{teamId:input.team_id,gradeId:input.grade_id,timezone:connection.timezone});
   const stored=await worker('preview',{season_id:input.season_id,grade_id:input.grade_id,team_id:input.team_id,fixtures:result.fixtures});
   return reply({...stored,...result});
  }
  return reply({error:'Unknown PlayHQ action'},400);
 }catch(error){
  const status=(error as any).status;
  if(connection&&status)await worker('error',{status,error:`PlayHQ request failed (${status})`}).catch(()=>{});
  return reply({error:status?`PlayHQ request failed (${status}). Manual fixture entry is still available.`:'Could not complete the PlayHQ request. Check the connection and try again.'},status===401||status===403?403:400);
 }
});
