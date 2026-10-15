import {matchIdFromUrl,normalizeScorecard,readLimitedJson,scorecardLogos} from './scorecard.mjs';
const origins=new Set(['https://clubbatting.com','https://www.clubbatting.com','https://clubbatting.com.au','https://www.clubbatting.com.au']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'',cors={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://clubbatting.com','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(origin&&!origins.has(origin))return reply({error:'Use Club Batting to load a scorecard.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
  const auth=req.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(auth))return reply({error:'Sign in to Club Batting.'},401);
  const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userResponse=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:auth},signal:AbortSignal.timeout(10000)});if(!userResponse.ok)return reply({error:'Sign in again to load a scorecard.'},401);const user=await userResponse.json();
  const raw=await req.text();if(raw.length>3000)return reply({error:'Request too large'},400);const input=JSON.parse(raw),club=input.club_id;if(!/^[0-9a-f-]{36}$/i.test(club||''))return reply({error:'Choose a club.'},400);const matchId=matchIdFromUrl(input.url);
  const weekly=input.purpose==='team_of_week',logos=input.purpose==='social_awards_logos';
  const access=await fetch(base+'/rest/v1/rpc/'+(logos?'club_social_awards_api':weekly?'team_of_week_api':'get_team_review_roster'),{method:'POST',headers:{apikey:anon,Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(logos?{p_club_id:club,p_action:'settings',p_data:{}}:weekly?{p_club_id:club,p_action:'access',p_data:{}}:{p_club_id:club}),signal:AbortSignal.timeout(10000)});if(!access.ok)return reply({error:logos?'Club socials access is required.':weekly?'Club Admin or a coach with socials access must import scorecards.':'Current club coaching access is required.'},403);
  const response=await fetch('https://grassrootsapiproxy.cricket.com.au/scores/matches/'+matchId+'?responseModifier=includeScorecard&jsconfig=eccn%3Atrue',{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
  const source=await readLimitedJson(response);
  if(input.purpose==='social_awards_logos')return reply({teams:scorecardLogos(source,matchId)});
  const card=normalizeScorecard(source,matchId);
  const stored=await fetch(base+'/rest/v1/rpc/stage_match_review_scorecard',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_club_id:club,p_actor_id:user.id,p_scorecard:card}),signal:AbortSignal.timeout(10000)});
  const result=await stored.json();if(!stored.ok)throw Error(result.message||'Could not prepare the scorecard.');return reply({snapshot_id:result.id,scorecard:card});
 }catch(e){return reply({error:e instanceof Error?e.message:'Could not load the scorecard.'},400);}
});

