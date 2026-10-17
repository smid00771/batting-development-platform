/* Fictional shared scores for the public demo. No network requests or club writes. */
export function createSharedResultsDemo(getState,getCards,getLinks){
 const clone=x=>JSON.parse(JSON.stringify(x));
 function context(end){
  const state=getState(),start=new Date(new Date(end+'T12:00:00Z').getTime()-6*86400000).toISOString().slice(0,10),sources=state.result_sources||={};
  const latest=new Map();for(const [id,card] of Object.entries(getCards()))latest.set(card.match_id,{snapshot_id:id,our_team:card.teams[0].id,scorecard:clone(card)});
  const cards=[...latest.values()].filter(c=>c.scorecard.dates.some(d=>d>=start&&d<=end)).map(c=>{const f=state.fixtures.find(f=>sources[f.id]?.match_id===c.scorecard.match_id||f.scorecard_sync?.match_id===c.scorecard.match_id);return {...c,fixture_id:f?.id||null};});
  const fixtures=state.fixtures.filter(f=>f.details.days.some(d=>d.date>=start&&d.date<=end)).map(f=>({id:f.id,...clone(f.details),match_id:sources[f.id]?.match_id||f.scorecard_sync?.match_id||null,no_play:sources[f.id]?.no_play||null}));
  return {week_end:end,cards,fixtures};
 }
 function awards(end){const data=context(end),pool=[];for(const c of data.cards){if(c.scorecard.status!=='completed')continue;const players=new Map(),player=(id,name)=>{if(!players.has(id))players.set(id,{key:c.snapshot_id+':'+c.our_team+':'+id,snapshot_id:c.snapshot_id,team_id:c.our_team,match_id:c.scorecard.match_id,player_id:id,name,grade:c.scorecard.grade,runs:0,wickets:0,conceded:0,batting:[],bowling:[]});return players.get(id);};for(const inn of c.scorecard.innings){if(inn.team_id===c.our_team)for(const b of inn.batters||[]){const p=player(b.player_id,b.name);if(b.status!=='did_not_bat'){p.runs+=b.runs||0;p.batting.push({runs:b.runs||0,not_out:!!b.not_out});}}else for(const b of inn.bowlers||[]){const p=player(b.player_id,b.name);p.wickets+=b.wickets||0;p.conceded+=b.runs||0;p.bowling.push({...b});}}pool.push(...players.values());}return {cards:data.cards,candidates:pool};}
 async function rpc(action,data){const state=getState(),sources=state.result_sources||={};
  if(action==='context')return context(data.week_end);
  if(action==='fixture'||action==='fixture_access'){
   const f=state.fixtures.find(f=>f.id===data.fixture_id);if(!f)throw Error('Choose a club fixture.');if(action==='fixture_access')return {allowed:true};
   const end=f.details.days.map(d=>d.date).sort().at(-1),all=context(end);
   return {...all,fixtures:all.fixtures.filter(x=>x.id===f.id),cards:all.cards.filter(c=>(!c.fixture_id||c.fixture_id===f.id)&&c.scorecard.dates[0]===f.details.days[0].date&&c.scorecard.format_key===f.details.format)};
  }
  if(action==='review'){
   const all=Object.entries(getCards()).filter(([,c])=>c.dates[0]===data.match_date&&c.format_key===data.format_key),latest=new Map();for(const [id,c] of all)latest.set(c.match_id,[id,c]);const matches=[...latest.values()];
   const fid=data.fixture_id,fixture=state.fixtures.find(f=>f.id===fid),bound=sources[fid]?.match_id||fixture?.scorecard_sync?.match_id||data.existing_match_id;
   const chosen=matches.filter(([id,c])=>data.snapshot_id?id===data.snapshot_id:bound?c.match_id===bound:fixture?.details.grade===c.grade);
   const found=chosen.length===1?chosen[0]:null;
   return {preview:found?{snapshot_id:found[0],scorecard:clone(found[1]),our_team_id:found[1].teams[0].id,player_links:clone(getLinks())}:null,choices:matches.map(([id,c])=>({snapshot_id:id,grade:c.grade,teams:clone(c.teams),match_id:c.match_id}))};
  }
  if(action==='no_play'){if(data.reason)sources[data.fixture_id]={no_play:data.reason};else delete sources[data.fixture_id];return {saved:true};}
  const card=getCards()[data.snapshot_id];if(!card)throw Error('Load a demo scorecard first.');
  if(action==='link'){const f=state.fixtures.find(f=>f.id===data.fixture_id);if(!f||f.details.days[0].date!==card.dates[0]||f.details.format!==card.format_key)throw Error('This scorecard has a different date or format.');sources[f.id]={match_id:card.match_id,team_id:card.teams[0].id};return {saved:true};}
  if(action==='identify')return {saved:true};throw Error('Unknown demo results action');
 }
 async function fetchCard(s,url,fid){const state=getState(),existing=Object.entries(getCards()).find(([,c])=>c.url===url),f=state.fixtures.find(f=>f.id===fid)||state.fixtures.find(f=>(state.result_sources||{})[f.id]?.match_id===existing?.[1].match_id)||state.fixtures.find(f=>f.details.days.some(d=>d.date<=s.results.end)&&!state.result_sources?.[f.id]);if(!f)throw Error('Choose a demo fixture.');
  const our='11111111-2222-4333-8444-555555555555',them='99999999-2222-4333-8444-555555555555',ids=[...new Set(f.slots.flatMap(x=>[x.d1,x.d2]).filter(Boolean))],players=ids.map(id=>({player_id:'demo-'+id,name:state.roster.find(r=>r.id===id)?.name||'Demo player'})),mid=existing?.[1].match_id||crypto.randomUUID();
  const card={schema_version:2,provider:'playcricket_au',match_id:mid,url:'https://play.cricket.com.au/match/'+mid,status:'completed',dates:f.details.days.map(d=>d.date),format_key:f.details.format,format_label:f.details.format,grade:f.details.grade,result:'Example club won',teams:[{id:our,name:'Harbour Example CC',lineup_available:true,players},{id:them,name:f.details.opposition}],warnings:['Fictional demo scores.'],innings:[{id:crypto.randomUUID(),team_id:our,number:1,complete:true,bowling_available:true,batters:players.map((p,n)=>({...p,status:'played',runs:[112,54,35,28,17,12,4,6,2,1,0][n%11],not_out:false,importable:true})),bowlers:[]},{id:crypto.randomUUID(),team_id:them,number:1,complete:true,bowling_available:true,batters:[],bowlers:players.slice(-4).map((p,n)=>({...p,team_id:our,wickets:[5,3,1,1][n],runs:20+n*3,importable:true}))}]};const sid=crypto.randomUUID();getCards()[sid]=card;return {snapshot_id:sid,scorecard:clone(card)};
 }
 return {context,awards,rpc,fetchCard};
}
