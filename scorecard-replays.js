// Link to the provider's player so its sign-in and playback rules still apply.
// Never embed the underlying Frogbox stream or infer a clip from a player name.
export function scorecardReplayUrl(value,dismissal=false){
 try{
  const u=new URL(value),uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const path=u.pathname.split('/'),highlight=u.searchParams.get('highlightId'),tab=u.searchParams.get('tab');
  if(u.protocol!=='https:'||u.hostname!=='play.cricket.com.au'||u.port||u.username||u.password||u.hash||path[1]!=='match'||!uuid.test(path[2]||'')||path.length>4||path[3]&&!/^[a-z0-9-]+$/i.test(path[3])||!['scorecard','highlights'].includes(tab))return null;
  if(dismissal&&!uuid.test(highlight||'')||highlight&&!uuid.test(highlight))return null;
  if([...u.searchParams.keys()].some(k=>!['tab','highlightId'].includes(k)))return null;
  return u.href;
 }catch{return null;}
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderMatchReplay(card){
 const url=scorecardReplayUrl(card?.replay_url);
 return url?`<a class="scorecard-replay" href="${escape(url)}" target="_blank" rel="noopener noreferrer" title="Opens PlayCricket · CricketPlus sign-in may be required">Watch match replays ↗</a>`:'';
}
export function renderDismissalReplay(batter){
 const url=scorecardReplayUrl(batter?.dismissal_video_url,true);
 return url&&batter?.name&&batter.status!=='did_not_bat'&&batter.not_out!==true?`<a class="scorecard-replay" href="${escape(url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch dismissal for ${escape(batter.name)} on PlayCricket" title="Opens PlayCricket · CricketPlus sign-in may be required">Watch dismissal ↗</a>`:'';
}
