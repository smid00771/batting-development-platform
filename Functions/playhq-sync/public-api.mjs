// Public GET contract from the user-supplied PlayHQ OpenAPI specification.
// This module is server-only. Never pass its key to the browser or store it in git.
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const id=value=>{if(!UUID.test(value||''))throw Error('Invalid PlayHQ identifier');return value.toLowerCase();};
export class PlayHQError extends Error {
  constructor(status){super(`PlayHQ request failed (${status})`);this.status=status;this.retryable=status===429||status>=500;}
}
export function publicAPI({key,fetchImpl=fetch,maxPages=100}) {
  if(!key)throw Error('A club PlayHQ API key is required');
  async function get(path,cursor){
    const url=new URL(path,'https://api.playhq.com');
    if(cursor)url.searchParams.set('cursor',cursor);
    const response=await fetchImpl(url,{method:'GET',redirect:'error',headers:{'x-api-key':key,'x-phq-tenant':'ca',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new PlayHQError(response.status);
    const raw=await response.text();
    if(raw.length>5000000)throw Error('PlayHQ response exceeds the size limit');
    return JSON.parse(raw);
  }
  async function list(path){
    const rows=[],cursors=new Set();let cursor;
    for(let page=0;page<maxPages;page++){
      const body=await get(path,cursor);
      if(!Array.isArray(body.data)||typeof body.metadata?.hasMore!=='boolean')throw Error('Incomplete PlayHQ list response');
      rows.push(...body.data);
      if(!body.metadata.hasMore)return rows;
      cursor=body.metadata.nextCursor;
      if(typeof cursor!=='string'||!cursor||cursors.has(cursor))throw Error('Invalid PlayHQ pagination cursor');
      cursors.add(cursor);
    }
    throw Error('PlayHQ pagination limit reached; nothing imported');
  }
  return {
    seasons:organisation=>list(`/v1/organisations/${id(organisation)}/seasons`),
    teams:season=>list(`/v1/seasons/${id(season)}/teams`),
    grades:season=>list(`/v1/seasons/${id(season)}/grades`),
    fixtures:grade=>get(`/v2/grades/${id(grade)}/games`),
    summary:game=>get(`/v2/games/${id(game)}/summary`)
  };
}

export function clubTeams(teams,organisationId){
  const club=id(organisationId);
  return teams.filter(team=>String(team.club?.id||'').toLowerCase()===club);
}

function schedule(rows,surfaces,timezone){
  if(!Array.isArray(rows)||!rows.length)throw Error('Match schedule is unavailable');
  return rows.map(row=>{
    const surface=surfaces.find(s=>s.id===row.playingSurfaceId);
    const zone=surface?.venue?.timezone||timezone;
    if(!zone)throw Error('Choose the club timezone');
    const instant=new Date(row.dateTime);
    if(!Number.isFinite(instant.getTime())||!/(?:Z|[+-]\d\d:\d\d)$/.test(row.dateTime))throw Error('Match time is unavailable');
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
    return {day:row.day??1,start_at:instant.toISOString(),date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`,timezone:zone,playing_surface_id:row.playingSurfaceId||null,ground:surface?.name||null,venue:surface?.venue?.name||null};
  }).sort((a,b)=>a.start_at.localeCompare(b.start_at));
}

export function gradeFixtures(body,{teamId,gradeId,timezone}){
  id(teamId);id(gradeId);
  if(!Array.isArray(body?.rounds)||!Array.isArray(body.teams)||!Array.isArray(body.playingSurfaces))throw Error('Incomplete PlayHQ fixture response');
  const fixtures=[],byes=[],seen=new Set();
  for(const round of body.rounds){
    if((round.byes||[]).some(b=>b.teamID===teamId))byes.push({round_id:round.id,round:round.name});
    if(!Array.isArray(round.games))throw Error('Incomplete PlayHQ round');
    for(const game of round.games){
      if(!Array.isArray(game.teams))throw Error('Incomplete PlayHQ teams');
      if(!game.teams.some(t=>t.id===teamId))continue;
      id(game.id);if(seen.has(game.id))throw Error('Duplicate PlayHQ match');seen.add(game.id);
      const opponent=game.teams.find(t=>t.id!==teamId);
      const kind=String(game.type||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const format=({t20:'t20',twenty20:'t20',oneday:'limited_overs',limitedovers:'limited_overs',twoday:'long_form',multiday:'long_form',test:'long_form'})[kind]||null;
      fixtures.push({source:'playhq',source_match_id:game.id,source_grade_id:gradeId,source_team_id:teamId,source_status:game.status||null,source_updated_at:game.updatedAt||null,round:round.name||'',format,opposition:body.teams.find(t=>t.id===opponent?.id)?.name||null,opposition_id:opponent?.id||null,days:schedule(game.schedule,body.playingSurfaces,timezone),requires_review:!format||!opponent||game.schedule.length>2||!['PENDING','FINAL','IN_PROGRESS','INPROGRESS','LIVE','STUMPS'].includes(game.status)});
    }
  }
  return {fixtures,byes};
}

const stats=values=>Object.fromEntries((values||[]).map(x=>[x.type,typeof x.value==='number'&&Number.isFinite(x.value)?x.value:null]));
export function oversToBalls(value){
  if(value==null)return null;
  const match=String(value).match(/^(\d+)(?:\.([0-5]))?$/);
  return match?Number(match[1])*6+Number(match[2]||0):null;
}

// Keep PlayHQ appearance IDs in their own namespace. They are not assumed to
// equal the participant IDs supplied by the existing PlayCricket importer.
export function gameSummary(body,expectedId){
  const game=body?.data;
  if(game?.id!==id(expectedId)||!Array.isArray(game.teams)||!Array.isArray(game.appearances))throw Error('Incomplete or mismatched PlayHQ summary');
  const complete=game.status==='FINAL';
  const appearances=new Map();
  for(const a of game.appearances){
    if(appearances.has(a.id))throw Error('Duplicate PlayHQ appearance');
    appearances.set(a.id,{source_appearance_id:a.id,team_id:a.teamId,name:a.visible===true?[a.firstName,a.lastName].filter(Boolean).join(' ')||null:null});
  }
  const periods=[],seen=new Set();
  for(const period of game.periods||[]){
    if(!period.id||seen.has(period.id)||!Array.isArray(period.teams))throw Error('Invalid PlayHQ innings');seen.add(period.id);
    periods.push({source_period_id:period.id,sequence:period.sequenceNo,name:period.name,provisional:!complete,teams:period.teams.map(t=>({team_id:t.id,discipline:t.discipline,status:t.status,statistics:stats(t.statistics),players:(t.appearances||[]).map(a=>{
      const person=appearances.get(a.id);
      if(!person||person.team_id!==t.id)throw Error('Unmatched PlayHQ appearance');
      const figures=stats(a.statistics);
      return {...person,position:a.displayOrder,status:a.status,statistics:figures,balls_bowled:t.discipline==='BOWLING'?oversToBalls(figures.OVERS):null,provisional:!complete};
    })}))});
  }
  return {source:'playhq',source_match_id:game.id,source_grade_id:game.gradeId,source_status:game.status,complete,has_figures:periods.some(p=>p.teams.some(t=>t.players.some(a=>Object.values(a.statistics).some(v=>v!==null)))),periods};
}

// Proposed polling policy, not an activated schedule or a claim about provider limits.
export function nextResultsCheck({now,lastPlayingDate,hasFigures=false,complete=false,httpStatus=null}){
  if(httpStatus===401||httpStatus===403)return null; // reconnect/provider resolution, no blind retries
  const current=new Date(now),last=new Date(lastPlayingDate+'T23:59:59Z');
  if(!Number.isFinite(current.getTime())||!Number.isFinite(last.getTime()))throw Error('Invalid check date');
  const days=(current-last)/86400000;
  const hours=days<3?4:days<14?24:168;
  // Final status without figures remains awaiting results. Recheck corrections too.
  return new Date(current.getTime()+(complete&&hasFigures&&days>=14?168:hours)*3600000).toISOString();
}

// Source ID is the only automatic match. A manual fixture must be explicitly linked.
// The patch deliberately excludes slots, publication, captain/keeper and availability.
export function fixturePlan(incoming,existing){
  const links=new Map();
  for(const row of existing){if(!row.source_match_id)continue;if(links.has(row.source_match_id))throw Error('Duplicate local match link');links.set(row.source_match_id,row);}
  return incoming.map(row=>{
    const prior=links.get(row.source_match_id);
    if(!prior)return {action:'review_new',fixture:row};
    const patch={days:row.days,opposition:row.opposition,format:row.format,source_status:row.source_status};
    const changed=Object.keys(patch).some(k=>JSON.stringify(prior[k])!==JSON.stringify(patch[k]));
    return {action:changed?'review_update':'unchanged',fixture_id:prior.id,patch};
  });
}
