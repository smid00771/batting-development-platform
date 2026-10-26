import {sourceId} from './shared-scorecard.mjs';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function logoUrl(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   (u.hostname==='res.cloudinary.com'&&u.pathname.startsWith('/playhq/image/upload/')||u.hostname==='assets.playhq.com'&&u.pathname.startsWith('/ca/'))?u.href:null;
 }catch{return null;}
}

// Older saved cards omitted organisation IDs too. Recover those only from the
// exact saved match/grade and team identities, without changing saved scores.
export function summaryLogoTeams(teams,body,matchId,gradeId){
 const game=body?.data;
 if(game?.id!==matchId||game.gradeId!==gradeId||!Array.isArray(game.teams))throw Error('Mismatched logo source');
 return teams.map(t=>{
  const matches=game.teams.filter(x=>x.id===t.source_team_id);
  if(matches.length!==1)throw Error('Mismatched logo team');
  const org=matches[0].organisation?.id;
  if(t.source_organisation_id&&t.source_organisation_id!==org)throw Error('Changed logo organisation');
  return {...t,source_organisation_id:org||null};
 });
}

// Public summaries omit logos. Season teams supply club artwork; an exact club
// ID also works when a historical team is absent from the current catalogue.
export async function teamLogos(teams,catalogue,gradeId){
 return Promise.all(teams.map(async team=>{
  const matches=catalogue.filter(t=>t.id===team.source_team_id&&t.grade?.id===gradeId);
  const ids=[...new Set(matches.map(t=>t.club?.id))],org=team.source_organisation_id||(ids.length===1?ids[0]:null);
  if(!uuid.test(org||'')||ids.some(id=>id!==org))return {id:team.id,organisation_id:null,logo_url:null};
  const sizes=catalogue.filter(t=>t.club?.id===org).flatMap(t=>t.club.logo?.sizes||[]).map(s=>({url:logoUrl(s.url),size:Math.min(Number(s.dimensions?.width)||0,Number(s.dimensions?.height)||0)})).filter(s=>s.url).sort((a,b)=>b.size-a.size);
  return {id:team.id,organisation_id:await sourceId('organisation','',org),source_organisation_id:org,logo_url:sizes[0]?.url||null};
 }));
}

// Share a season lookup across grade requests. Keep credentials out of cache
// keys, expire metadata, and discard failed requests so a reload can retry.
export function seasonLogoCache({now=Date.now,ttl=3600000,limit=64}={}){
 const cache=new Map();
 return (scope,load)=>{
  const old=cache.get(scope);if(old&&old.expires>now())return old.promise;
  if(cache.size>=limit)cache.delete(cache.keys().next().value);
  const entry={expires:now()+ttl,promise:null};
  entry.promise=Promise.resolve().then(load).then(teams=>teams.map(t=>({id:t.id,grade:t.grade,club:{id:t.club?.id,logo:t.club?.logo}}))).catch(error=>{if(cache.get(scope)===entry)cache.delete(scope);throw error;});
  cache.set(scope,entry);return entry.promise;
 };
}
