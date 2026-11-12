import {normalizeScorecard,readLimitedJson} from '../playcricket-scorecard/scorecard.mjs';
import {linkScorecardDismissals} from './dismissal-links.mjs';

const base='https://grassrootsapiproxy.cricket.com.au';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const name=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const dates=raw=>[...new Set((raw.matchSchedule||[]).map(d=>String(d.startDateTime||'').slice(0,10)))].sort();
const format=v=>({'one day':'limited_overs','limited overs':'limited_overs','t20':'t20','twenty20':'t20','two day':'long_form','multi day':'long_form','test':'long_form'})[name(v)];
const bounded=(value,max)=>{if(!Array.isArray(value)||value.length>max)throw Error('Invalid replay catalogue');return value;};
const one=rows=>rows.length===1?rows[0]:null;
const scheduleMatches=(raw,fixture)=>!fixture?.days||fixture.days.every(day=>{
 if(!day.start_at)return true;
 const match=one((raw.matchSchedule||[]).filter(d=>String(d.startDateTime||'').slice(0,10)===day.date));
 return match&&Number.isFinite(Date.parse(day.start_at))&&Date.parse(match.startDateTime)===Date.parse(day.start_at);
});

// Public metadata is cached only inside the worker. Failed lookups are not
// cached; no club credentials, private roster data or video bytes enter it.
export function replayMetadataCache({now=Date.now,limit=128}={}){
 const cache=new Map();
 return (key,read,ttl=3600000)=>{
  const old=cache.get(key);if(old&&old.until>now())return old.promise;
  if(cache.size>=limit)cache.delete(cache.keys().next().value);
  const entry={until:now()+ttl,promise:null};
  entry.promise=Promise.resolve().then(read).catch(error=>{if(cache.get(key)===entry)cache.delete(key);throw error;});
  cache.set(key,entry);return entry.promise;
 };
}

// Build a media-only correspondence. The official organisation IDs must agree,
// and the existing strict linker then verifies every innings, batter, position
// and figure. This never links club accounts or replaces source/player IDs.
export function replayBinding(saved,raw,organisations,gradeName){
 if(!uuid.test(raw?.id||'')||!gradeName||name(raw.grade?.name)!==name(gradeName))throw Error('Replay grade differs');
 const video=normalizeScorecard(raw,raw.id),teams=[];
 for(const team of saved.teams){
  const other=one(raw.teams.filter(t=>uuid.test(t.owningOrganisation?.id||'')&&organisations[t.owningOrganisation.id]===team.source_organisation_id&&name(t.displayName||t.name)===name(team.name)));
  if(!other||!uuid.test(team.source_organisation_id||''))throw Error('Replay club or team differs');
  teams.push({source_team_id:team.id,video_team_id:other.id});
 }
 const innings=saved.innings.map(inn=>{
  const team=teams.find(t=>t.source_team_id===inn.team_id),other=one(video.innings.filter(i=>i.team_id===team?.video_team_id&&i.number===inn.number));
  if(!other||other.batters.length!==inn.batters.length)throw Error('Replay innings differs');
  // Repeated names within an innings cannot establish a unique media binding.
  if(new Set(inn.batters.map(b=>name(b.name))).size!==inn.batters.length||new Set(other.batters.map(b=>name(b.name))).size!==other.batters.length)throw Error('Ambiguous replay batter');
  return {source_innings_id:inn.id,video_innings_id:other.id,players:inn.batters.map((b,i)=>({source_player_id:b.player_id,video_player_id:other.batters[i].player_id}))};
 });
 let thumbnail;
 if(raw.matchStreams?.length===1){
  try{const u=new URL(raw.matchStreams[0].streamUrl),id=u.searchParams.get('v');
   if(u.protocol==='https:'&&['www.youtube.com','youtube.com'].includes(u.hostname)&&u.pathname==='/watch'&&/^[A-Za-z0-9_-]{11}$/.test(id||''))thumbnail=`https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }catch{}
 }
 return {playhq_match_id:saved.upstream_match_id,playcricket_match_id:raw.id,teams,innings,...(thumbnail?{thumbnail_url:thumbnail}:{})};
}

export function createDismissalEnricher({request=(url,options)=>fetch(url,options),cache=replayMetadataCache(),timeoutMs=30000,onUnavailable=()=>{}}={}){
 return async(saved,{gradeName,sourceFixture}={})=>{
  if(saved?.provider!=='playhq_au'||saved.status!=='completed'||!name(gradeName)||!uuid.test(saved.upstream_match_id||''))return saved;
  try{
   const signal=AbortSignal.timeout(timeoutMs);
   const get=async(path,params={})=>readLimitedJson(await request(base+path+'?'+new URLSearchParams({...params,jsconfig:'eccn:true'}),{headers:{Accept:'application/json'},redirect:'error',signal}));
   const ours=one(saved.teams.filter(t=>t.source_team_id===saved.upstream_team_id));
   if(!ours||!uuid.test(ours.source_organisation_id||'')||!name(ours.organisation))return saved;
   const org=await cache('org:'+ours.source_organisation_id,async()=>{
    const found=await get('/orgsproducts/organisation/search',{searchString:ours.organisation.slice(0,20),limit:'10'});
    return one(bounded(found.organisations,10).filter(o=>o.playHQId===ours.source_organisation_id&&uuid.test(o.organisationGuid||'')));
   });
   if(!org)return saved;
   const teams=await cache('teams:'+org.organisationGuid,async()=>bounded((await get('/fixturesladders/organisations/'+org.organisationGuid+'/teams')).teams,200));
   const eligible=teams.filter(t=>uuid.test(t.id||'')&&[t.grade,...(t.grades||[])].some(g=>name(g?.name)===name(gradeName)));
   if(!eligible.length||eligible.length>6)return saved;
   const candidates=new Map();
   for(const team of eligible){
    const matches=await cache('matches:'+team.id,async()=>bounded((await get('/scores/teams/'+team.id+'/matches')).matches,500),300000);
    for(const match of matches){
     if(!uuid.test(match.id||'')||match.status!=='COMPLETED'||!same(dates(match),saved.dates)||format(match.matchType)!==saved.format_key)continue;
     if(sourceFixture?.round&&name(match.round?.name)!==name(sourceFixture.round)||!scheduleMatches(match,sourceFixture))continue;
     if(!Array.isArray(match.teams)||match.teams.length!==2||!match.teams.some(t=>t.id===team.id&&t.owningOrganisation?.id===org.organisationGuid))continue;
     if(!saved.teams.every(t=>match.teams.some(m=>name(m.displayName||m.name)===name(t.name)&&name(m.owningOrganisation?.name)===name(t.organisation))))continue;
     candidates.set(match.id,match);
    }
   }
   if(!candidates.size||candidates.size>4)return saved;
   const verified=[];
   for(const match of candidates.values()){
    const raw=await get('/scores/matches/'+match.id,{responseModifier:'includeScorecard'});
    if(raw?.id!==match.id||!scheduleMatches(raw,sourceFixture))throw Error('Replay match identity differs');
    const organisations={[org.organisationGuid]:ours.source_organisation_id};
    for(const team of bounded(raw.teams,2)){
     const id=team.owningOrganisation?.id;if(!uuid.test(id||''))throw Error('Replay organisation missing');
     if(!organisations[id]){
      const other=await cache('org-detail:'+id,()=>get('/orgsproducts/organisation/'+id));
      if(other.organisationGuid!==id||!uuid.test(other.playHQId||''))throw Error('Replay organisation differs');
      organisations[id]=other.playHQId;
     }
    }
    try{
     const binding=replayBinding(saved,raw,organisations,gradeName);
     const linked=linkScorecardDismissals(saved,raw,binding);
     verified.push(linked);
    }catch{ /* A candidate that fails full scorecard verification is not linked. */ }
   }
   if(verified.length!==1)return saved;
   const linked=verified[0];
   return linked.innings.some(i=>i.batters.some(b=>b.dismissal_video_url))?linked:saved;
  }catch(error){onUnavailable(error);return saved;}
 };
}
