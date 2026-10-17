const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function matchIdFromUrl(value){let u;try{u=new URL(String(value).trim());}catch{throw Error('Paste the full Australian PlayCricket match link.');}const id=u.pathname.split('/')[2];if(u.protocol!=='https:'||u.hostname!=='play.cricket.com.au'||u.port||u.username||u.password||u.pathname.split('/')[1]!=='match'||!uuid.test(id||''))throw Error('Use an https://play.cricket.com.au/match/… link.');return id.toLowerCase();}
const text=(v,n=200)=>String(v??'').trim().slice(0,n);
const integer=v=>Number.isInteger(v)&&v>=0&&v<=9999;
export function clubLogoUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='res.cloudinary.com'&&!u.port&&!u.username&&!u.password&&u.pathname.startsWith('/playhq/image/upload/')?u.href:null;}catch{return null;}}
export function scorecardLogos(raw,expectedId){
 if(raw?.id!==expectedId||!Array.isArray(raw.teams)||raw.teams.length!==2)throw Error('PlayCricket could not supply club logos.');
 return raw.teams.filter(t=>uuid.test(t.id||'')).map(t=>({id:t.id,organisation_id:uuid.test(t.owningOrganisation?.id||'')?t.owningOrganisation.id:null,logo_url:clubLogoUrl(t.owningOrganisation?.logoUrl)}));
}
export function oversToBalls(value){
 if(value===null||value===undefined||value==='')return null;
 const m=String(value).match(/^(\d{1,3})(?:\.([0-5]))?$/);return m?Number(m[1])*6+Number(m[2]||0):null;
}
export function normalizeScorecard(raw,expectedId){
 const status=text(raw?.status).toUpperCase().replace(/[^A-Z]/g,'');if(!raw||raw.id!==expectedId||!['COMPLETED','INPROGRESS','STUMPS','LIVE'].includes(status))throw Error('Use a completed or in-progress match scorecard. Upcoming or unavailable matches cannot be imported.');const matchComplete=status==='COMPLETED';
 if(!Array.isArray(raw.teams)||raw.teams.length!==2||!Array.isArray(raw.innings)||!raw.innings.length||raw.innings.length>10)throw Error('The scorecard is incomplete. Enter the results manually or try again later.');
 const dates=[...new Set((raw.matchSchedule||[]).map(x=>text(x.startDateTime).slice(0,10)).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();if(!dates.length)throw Error('The scorecard has no usable match date.');
 const type=text(raw.matchType).toLowerCase(),format=type==='two day'||type==='multi day'||type==='test'?'long_form':/^(t20|twenty20|twenty 20)$/.test(type)?'t20':/^(one day|limited overs|limited over)$/.test(type)?'limited_overs':null;
 const people=new Map(),teams=raw.teams.map(t=>{if(!uuid.test(t.id||''))throw Error('The scorecard team identity is missing.');const seen=new Set(),players=[];let lineup_available=Array.isArray(t.players)&&t.players.length>0&&t.players.length<=30;for(const p of t.players||[]){const valid=uuid.test(p.participantId||'')&&!!text(p.name||p.shortName)&&!seen.has(p.participantId)&&!people.has(p.participantId);if(!valid)lineup_available=false;if(uuid.test(p.participantId||'')){people.set(p.participantId,{name:text(p.name||p.shortName),team:t.id});seen.add(p.participantId);players.push({player_id:p.participantId,name:text(p.name||p.shortName)});}}return {id:t.id,name:text(t.displayName||t.name),organisation:text(t.owningOrganisation?.name),organisation_id:uuid.test(t.owningOrganisation?.id||'')?t.owningOrganisation.id:null,logo_url:clubLogoUrl(t.owningOrganisation?.logoUrl),lineup_available,players};});
 const warnings=[],seenInnings=new Set();
 const innings=raw.innings.map(i=>{
  if(!uuid.test(i.id||'')||seenInnings.has(i.id)||!teams.some(t=>t.id===i.battingTeamId)||!Number.isInteger(i.inningsNumber)||i.inningsNumber<1||i.inningsNumber>10||!Array.isArray(i.batting)||i.batting.length>30)throw Error('The innings identity is incomplete.');seenInnings.add(i.id);
  const closure=text(i.inningsCloseType).toLowerCase().replace(/[^a-z]/g,''),complete=['allout','compulsoryclose','declared','followon','endofgame','endofmatch'].includes(closure)||(matchComplete&&!closure);
  const seen=new Set();let reliableBalls=raw.isBallByBall===true||i.batting.some(b=>Number(b.ballsFaced)>0);
  const batters=i.batting.map(b=>{
   const p=people.get(b.participantId),dismissal=text(b.dismissalType),norm=dismissal.toLowerCase().replace(/[^a-z]/g,''),dnb=norm==='didnotbat',notOut=['notout','retirednotout','retiredhurt'].includes(norm),out=['bowled','caught','caughtandbowled','lbw','runout','stumped','hitwicket','retiredout','obstructingthefield','timedout','hittheballtwice','handledtheball'].includes(norm);
   if(!p||p.team!==i.battingTeamId||seen.has(b.participantId)||b.batInstance>1)throw Error('A batter could not be identified uniquely. Use manual entry for this scorecard.');seen.add(b.participantId);
   const supported=dnb||((notOut||out)&&integer(b.runsScored));if(!supported)warnings.push(`${p.name}: check the dismissal or score manually.`);
   return {player_id:b.participantId,name:p.name,status:dnb?'did_not_bat':'played',runs:dnb?null:integer(b.runsScored)?b.runsScored:null,not_out:notOut,dismissal,dismissal_text:text(b.dismissalText,300),balls:reliableBalls&&integer(b.ballsFaced)?b.ballsFaced:null,fours:integer(b.foursScored)?b.foursScored:null,sixes:integer(b.sixesScored)?b.sixesScored:null,importable:supported&&complete};
  });
  const total=integer(i.runsScored)?i.runsScored:null,extras=integer(i.totalExtras)?i.totalExtras:null,sum=batters.reduce((n,b)=>n+(b.runs||0),0);
  if(complete&&(total===null||extras===null||sum+extras!==total))warnings.push(`${text(i.name)}: PlayCricket’s batting scores and extras differ from its total. Individual figures are imported as shown.`);
  if(!reliableBalls)warnings.push(`${text(i.name)}: balls faced are unavailable.`);
  if(!complete)warnings.push(`${text(i.name)}: still in progress; scores are preview only.`);
  const bowlingTeam=teams.find(t=>t.id!==i.battingTeamId),seenBowlers=new Set();
  if(i.bowling!=null&&(!Array.isArray(i.bowling)||i.bowling.length>30))throw Error('The bowling scorecard is incomplete.');
  const bowlers=(i.bowling||[]).map(b=>{
   const p=people.get(b.participantId);
   if(!p||p.team!==bowlingTeam.id||seenBowlers.has(b.participantId))throw Error('A bowler could not be identified uniquely. Check the scorecard.');
   seenBowlers.add(b.participantId);
   const balls=oversToBalls(b.oversBowled),valid=integer(b.wicketsTaken)&&b.wicketsTaken<=10&&integer(b.runsConceded);
   if(!valid)warnings.push(`${p.name}: bowling figures are unavailable.`);
   return {player_id:b.participantId,name:p.name,team_id:bowlingTeam.id,wickets:integer(b.wicketsTaken)&&b.wicketsTaken<=10?b.wicketsTaken:null,runs:integer(b.runsConceded)?b.runsConceded:null,balls,overs:balls===null?null:`${Math.floor(balls/6)}${balls%6?'.'+balls%6:''}`,maidens:integer(b.maidensBowled)?b.maidensBowled:null,importable:valid&&complete};
  });
  return {bowlers,bowling_available:Array.isArray(i.bowling),complete,closure:text(i.inningsCloseType),id:i.id,team_id:i.battingTeamId,number:i.inningsNumber,name:text(i.name),runs:total,wickets:Number(i.numberOfWicketsFallen),extras,batters};
 });
 return {schema_version:2,provider:'playcricket_au',match_id:expectedId,url:`https://play.cricket.com.au/match/${expectedId}`,status:matchComplete?'completed':'in_progress',dates,format_key:format,format_label:text(raw.matchType),grade:text(raw.grade?.name),venue:text(raw.venue?.name),result:text(raw.matchSummary?.resultText),teams,innings,warnings:[...new Set(warnings)]};
}
export async function readLimitedJson(response,limit=750000){if(!response.ok)throw Error('PlayCricket could not supply this scorecard. Try again later or enter results manually.');if(Number(response.headers.get('content-length'))>limit)throw Error('This scorecard is too large to import.');const reader=response.body.getReader();let bytes=0;const chunks=[];while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit){await reader.cancel();throw Error('This scorecard is too large to import.');}chunks.push(value);}const all=new Uint8Array(bytes);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{throw Error('PlayCricket returned an unreadable scorecard.');}}

