import {normalizeScorecard} from '../../Functions/playcricket-scorecard/scorecard.mjs';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function fixture(){
 const raw={id:id(1),status:'COMPLETED',matchType:'One Day',isBallByBall:true,grade:{name:'Example First Grade'},round:{name:'Round 1'},matchSchedule:[{startDateTime:'2099-10-31T10:00:00+11:00'}],matchStreams:[{streamUrl:'https://www.youtube.com/watch?v=abcdefghijk'}],teams:[],innings:[]};
 for(let n=0;n<2;n++){
  const team=id(10+n),players=[0,1,2].map(p=>({participantId:id(20+n*3+p),name:`Example ${n} ${p}`}));
  raw.teams.push({id:team,displayName:`Team ${n}`,owningOrganisation:{id:id(200+n),name:`Club ${n}`},players});
  raw.innings.push({id:id(30+n),battingTeamId:team,inningsNumber:1,inningsCloseType:'End of Match',runsScored:12,totalExtras:1,numberOfWicketsFallen:1,bowling:[],batting:players.map((p,k)=>({participantId:p.participantId,batOrder:k+1,batInstance:1,dismissalType:['Caught','Not Out','Did Not Bat'][k],runsScored:[5,6,0][k],ballsFaced:[8,9,0][k],foursScored:0,sixesScored:0,...(k===0?{highlight:{id:id(40+n),highLightType:'WICKET'}}:{})}))});
 }
 const card=normalizeScorecard(raw,raw.id);
 Object.assign(card,{provider:'playhq_au',upstream_match_id:id(90),upstream_grade_id:id(91),upstream_team_id:id(92),match_id:id(93)});
 for(const [n,t]of card.teams.entries())Object.assign(t,{id:id(100+n),source_team_id:id(92+n),source_organisation_id:id(300+n)});
 for(const [n,i]of card.innings.entries()){
  Object.assign(i,{id:id(110+n),team_id:card.teams[n].id});
  for(const [p,b]of i.batters.entries()){b.player_id=id(120+n*3+p);delete b.dismissal_video_url;if(b.status==='did_not_bat'){b.not_out=null;b.balls=b.fours=b.sixes=null;}}
 }
 return {raw,card,options:{gradeName:raw.grade.name,sourceFixture:{round:'Round 1',days:[{date:'2099-10-31',start_at:'2099-10-30T23:00:00Z'}]}}};
}
export function provider(f){
 const calls=[],state={matches:[f.raw],orgId:f.card.teams[0].source_organisation_id,fail:false};
 const request=async(url,options)=>{
  const u=new URL(url);calls.push({url,options});
  if(state.fail)throw Error('Unavailable');
  const raw=f.raw;
  if(u.pathname==='/orgsproducts/organisation/search')return Response.json({organisations:[{organisationGuid:raw.teams[0].owningOrganisation.id,playHQId:state.orgId,name:f.card.teams[0].organisation}]});
  if(u.pathname.includes('/fixturesladders/organisations/'))return Response.json({teams:[{id:raw.teams[0].id,grade:raw.grade}]});
  if(u.pathname.includes('/scores/teams/'))return Response.json({matches:state.matches});
  const match=state.matches.find(m=>u.pathname==='/scores/matches/'+m.id);if(match)return Response.json(match);
  const team=raw.teams.find(t=>u.pathname==='/orgsproducts/organisation/'+t.owningOrganisation.id);
  if(team)return Response.json({organisationGuid:team.owningOrganisation.id,playHQId:f.card.teams[raw.teams.indexOf(team)].source_organisation_id});
  throw Error('Unexpected provider route '+u.pathname);
 };
 return {calls,state,request};
}
