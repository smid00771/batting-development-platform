// Attach provider viewing links to an explicitly identified match/innings/player
// mapping. This does not infer identities, fetch video or merge player histories.
import {normalizeScorecard} from '../Functions/playcricket-scorecard/scorecard.mjs';
import {scorecardReplayThumbnail} from '../scorecard-replays.js';
const name=value=>String(value??'').trim().replace(/\s+/g,' ').toLowerCase();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unique=(rows,key)=>{
 const map=new Map();
 for(const row of rows||[]){if(!row[key]||map.has(row[key]))throw Error('Missing or duplicate identity');map.set(row[key],row);}
 return map;
};
export function linkScorecardDismissals(saved,raw,binding){
 if(saved.provider!=='playhq_au'||saved.upstream_match_id!==binding.playhq_match_id||raw.id!==binding.playcricket_match_id)throw Error('The explicit match link does not match these scorecards');
 const video=normalizeScorecard(raw,binding.playcricket_match_id);
 let poster=null;
 if(binding.thumbnail_url){
  const stream=raw.matchStreams?.length===1?new URL(raw.matchStreams[0].streamUrl):null,id=stream?.searchParams.get('v');
  poster=scorecardReplayThumbnail(binding.thumbnail_url);
  if(!poster||stream?.protocol!=='https:'||!['www.youtube.com','youtube.com'].includes(stream?.hostname)||stream?.pathname!=='/watch'||!id||poster!==`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)throw Error('Thumbnail is not from the verified match stream');
 }
 if(saved.status!=='completed'||video.status!=='completed'||!same(saved.dates,video.dates)||saved.format_key!==video.format_key)throw Error('Match dates, format or completion differ');
 const target=structuredClone(saved),teams=unique(binding.teams,'source_team_id'),videoTeams=unique(video.teams,'id');
 if(teams.size!==2||target.teams.length!==2||unique(binding.teams,'video_team_id').size!==2)throw Error('Both teams must be linked explicitly');
 for(const team of target.teams){
  const linked=videoTeams.get(teams.get(team.id)?.video_team_id);
  if(!linked||!name(team.name)||name(team.name)!==name(linked.name)||!name(team.organisation)||name(team.organisation)!==name(linked.organisation))throw Error('Team details differ');
 }
 const innings=unique(binding.innings,'source_innings_id'),videoInnings=unique(video.innings,'id');
 if(innings.size!==target.innings.length||innings.size!==video.innings.length||unique(binding.innings,'video_innings_id').size!==innings.size)throw Error('Every innings must be linked explicitly');
 for(const inn of target.innings){
  const link=innings.get(inn.id),other=videoInnings.get(link?.video_innings_id);
  if(!other||!inn.complete||!other.complete||other.team_id!==teams.get(inn.team_id)?.video_team_id||other.number!==inn.number)throw Error('Innings identities differ');
  for(const field of ['runs','wickets','extras'])if(!Number.isInteger(inn[field])||inn[field]!==other[field])throw Error('Innings totals differ');
  const people=unique(link.players,'source_player_id'),videoPeople=unique(other.batters,'player_id');
  if(people.size!==inn.batters.length||people.size!==other.batters.length||unique(link.players,'video_player_id').size!==people.size)throw Error('Every batter must be linked explicitly');
  unique(inn.batters,'player_id');
  for(const [position,batter] of inn.batters.entries()){
   const playerLink=people.get(batter.player_id),played=videoPeople.get(playerLink?.video_player_id);
   if(!played||other.batters[position].player_id!==played.player_id||!name(batter.name)||name(batter.name)!==name(played.name)||batter.status!==played.status)throw Error('Batter identity or order differs');
   if(batter.status!=='did_not_bat')for(const field of ['runs','not_out','balls','fours','sixes'])if((batter[field]??null)!==(played[field]??null))throw Error('Batting figures differ');
   if(played.dismissal_video_url){
    if(batter.dismissal_video_url&&batter.dismissal_video_url!==played.dismissal_video_url)throw Error('A different dismissal is already linked');
    batter.dismissal_video_url=played.dismissal_video_url;
    if(poster)batter.dismissal_video_thumbnail_url=poster;
    batter.dismissal_replay_source={provider:'playcricket_au',match_id:video.match_id,innings_id:other.id,player_id:played.player_id};
   }
  }
 }
 target.replay_url=`https://play.cricket.com.au/match/${video.match_id}?tab=highlights`;
 return target;
}

export function dismissalLinkSQL(row,next){
 const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
 if(![row.id,row.club_id,row.source_match_id].every(x=>uuid.test(x))||!/^[0-9a-f]{32}$/.test(row.original_hash))throw Error('Invalid snapshot guard');
 const data=Buffer.from(JSON.stringify(next)).toString('base64');
 return `begin;\nDO $links$\ndeclare affected integer;\nbegin\nupdate public.match_review_scorecards s set scorecard=convert_from(decode('${data}','base64'),'UTF8')::jsonb where s.id='${row.id}' and s.club_id='${row.club_id}' and s.source_match_id='${row.source_match_id}' and md5(s.scorecard::text)='${row.original_hash}' and not exists(select 1 from public.match_review_scorecards newer where newer.club_id=s.club_id and newer.source_match_id=s.source_match_id and (newer.created_at,newer.id)>(s.created_at,s.id));\nget diagnostics affected=row_count; if affected<>1 then raise exception 'Snapshot changed; reload before linking dismissals'; end if;\nend $links$;\ncommit;`;
}
