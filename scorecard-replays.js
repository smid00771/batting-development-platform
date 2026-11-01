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
export function scorecardReplayThumbnail(value){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='i.ytimg.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/vi\/[a-zA-Z0-9_-]{11}\/hqdefault\.jpg$/.test(u.pathname)?u.href:null;}catch{return null;}
}
export function renderDismissalReplay(batter,{thumbnail=false}={}){
 const url=scorecardReplayUrl(batter?.dismissal_video_url,true);
 const poster=thumbnail&&scorecardReplayThumbnail(batter?.dismissal_video_thumbnail_url);
 return url&&batter?.name&&batter.status!=='did_not_bat'&&batter.not_out!==true?`<a class="scorecard-replay${poster?' scorecard-replay-preview':''}" href="${escape(url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch dismissal for ${escape(batter.name)} on PlayCricket" title="Opens PlayCricket · CricketPlus sign-in may be required">${poster?`<img src="${escape(poster)}" alt="Match video preview" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="scorecard-replay-play" aria-hidden="true">▶</span><span class="scorecard-replay-caption">Watch dismissal ↗</span>`:'Watch dismissal ↗'}</a>`:'';
}
export function bindReplayThumbnails(root){
 for(const img of root.querySelectorAll('.scorecard-replay-preview img')){
  const fallback=()=>{const link=img.closest('.scorecard-replay-preview');if(link){link.classList.remove('scorecard-replay-preview');link.textContent='Watch dismissal ↗';}};
  img.addEventListener('error',fallback,{once:true});
  if(img.complete&&!img.naturalWidth)fallback();
 }
}
