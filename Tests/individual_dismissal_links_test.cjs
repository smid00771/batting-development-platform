const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const {normalizeScorecard}=await import('../Functions/playcricket-scorecard/scorecard.mjs');
 const raw={id:id(1),status:'COMPLETED',matchType:'One Day',isBallByBall:true,matchSchedule:[{startDateTime:'2026-10-31T10:00:00'}],matchStreams:[{streamUrl:'https://www.youtube.com/watch?v=abcdefghijk'}],teams:[],innings:[]};
 for(let n=0;n<2;n++){
  const team=id(10+n),players=[0,1,2].map(p=>({participantId:id(20+n*3+p),name:`Example ${n} ${p}`}));
  raw.teams.push({id:team,displayName:`Team ${n}`,owningOrganisation:{name:`Club ${n}`},players});
  raw.innings.push({id:id(30+n),battingTeamId:team,inningsNumber:1,inningsCloseType:'End of Match',runsScored:12,totalExtras:1,numberOfWicketsFallen:1,bowling:[],batting:players.map((p,k)=>({participantId:p.participantId,batOrder:k+1,batInstance:1,dismissalType:['Caught','Not Out','Did Not Bat'][k],runsScored:[5,6,0][k],ballsFaced:[8,9,0][k],foursScored:0,sixesScored:0,...(k===0?{highlight:{id:id(40+n),highLightType:'WICKET'}}:{})}))});
 }
 const card=normalizeScorecard(raw,raw.id),binding={playhq_match_id:id(90),playcricket_match_id:raw.id,thumbnail_url:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',teams:[],innings:[]};
 card.provider='playhq_au';card.upstream_match_id=id(90);card.upstream_grade_id=id(91);card.upstream_team_id=id(92);card.match_id=id(93);
 for(const [n,t]of card.teams.entries()){binding.teams.push({source_team_id:id(100+n),video_team_id:t.id});t.id=id(100+n);}
 for(const [n,i]of card.innings.entries()){
  const mapping={source_innings_id:id(110+n),video_innings_id:i.id,players:[]};i.id=id(110+n);i.team_id=card.teams[n].id;
  for(const [p,b]of i.batters.entries()){mapping.players.push({source_player_id:id(120+n*3+p),video_player_id:b.player_id});b.player_id=id(120+n*3+p);delete b.dismissal_video_url;if(b.status==='did_not_bat'){b.not_out=null;b.balls=b.fours=b.sixes=null;}}
  binding.innings.push(mapping);
 }
 return {raw,card,binding};
}
test('explicit match, team, innings and player bindings attach only verified dismissal viewing links',async()=>{
 const {linkScorecardDismissals}=await import('../Scripts/link-scorecard-dismissals.mjs'),f=await fixture(),before=structuredClone(f.card);
 const linked=linkScorecardDismissals(f.card,f.raw,f.binding);
 assert.deepEqual(f.card,before,'Input and all original player identities remain unchanged');
 assert.equal(linked.innings.flatMap(i=>i.batters).filter(b=>b.dismissal_video_url).length,2);
 assert.equal(linked.innings[0].batters[0].dismissal_replay_source.player_id,f.binding.innings[0].players[0].video_player_id);
 assert.equal(linked.innings[0].batters[0].dismissal_video_thumbnail_url,f.binding.thumbnail_url);
 const cleaned=structuredClone(linked);delete cleaned.replay_url;
 for(const b of cleaned.innings.flatMap(i=>i.batters)){delete b.dismissal_video_url;delete b.dismissal_video_thumbnail_url;delete b.dismissal_replay_source;}
 assert.deepEqual(cleaned,before,'Scores, orders and other metadata are identical');
 assert.deepEqual(linkScorecardDismissals(linked,f.raw,f.binding),linked,'Retry is idempotent');
});
test('linking rejects wrong games, innings, names, orders, partial maps, figures and unrelated thumbnails',async()=>{
 const {linkScorecardDismissals}=await import('../Scripts/link-scorecard-dismissals.mjs');
 const changes=[f=>f.binding.playhq_match_id=id(999),f=>f.card.dates=['2026-10-30'],f=>f.card.format_key='t20',f=>f.card.innings[0].runs++,f=>f.card.innings[0].batters[0].runs++,f=>f.card.innings[0].batters[0].balls++,f=>f.card.innings[0].batters[0].name='Different player',f=>f.card.innings[0].batters.reverse(),f=>f.binding.innings[0].players.pop(),f=>f.binding.innings[0].players[0].video_player_id=f.binding.innings[0].players[1].video_player_id,f=>f.binding.thumbnail_url='https://i.ytimg.com/vi/xxxxxxxxxxx/hqdefault.jpg',f=>f.binding.innings[0].video_innings_id=f.binding.innings[1].video_innings_id];
 for(const change of changes){const f=await fixture();change(f);assert.throws(()=>linkScorecardDismissals(f.card,f.raw,f.binding));}
});
test('score refresh retains exact verified clips and drops them when their source or batter changes',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("create schema club_selection_private; create role anon; create role authenticated;"+fs.readFileSync('Database/retain_individual_dismissal_links.sql','utf8').split('do $patch$')[0]);
 const {linkScorecardDismissals}=await import('../Scripts/link-scorecard-dismissals.mjs'),f=await fixture(),old=linkScorecardDismissals(f.card,f.raw,f.binding);
 const keep=async(next,prior=old)=>(await db.query('select club_selection_private.retain_dismissal_links($1::jsonb,$2::jsonb) as card',[JSON.stringify(next),JSON.stringify(prior)])).rows[0].card;
 assert.deepEqual((await keep(f.card)).innings,old.innings);
 for(const change of [c=>c.innings[0].batters[0].runs++,c=>c.innings[0].batters[0].not_out=true,c=>c.innings[0].batters[0].player_id=id(999),c=>c.innings[0].id=id(999),c=>c.upstream_match_id=id(999),c=>c.upstream_team_id=id(999),c=>c.dates=['2026-10-30']]){
  const next=structuredClone(f.card);change(next);assert.equal((await keep(next)).innings[0].batters[0].dismissal_video_url,undefined);
 }
 const unsafe=structuredClone(old);unsafe.innings[0].batters[0].dismissal_video_url='https://evil.example/clip';assert.equal((await keep(f.card,unsafe)).innings[0].batters[0].dismissal_video_url,undefined);
 assert.equal((await db.query("select has_function_privilege('authenticated','club_selection_private.retain_dismissal_links(jsonb,jsonb)','execute') as allowed")).rows[0].allowed,false);
});
