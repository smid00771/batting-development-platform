// Read-only preparation for a batting-video pilot. No provider requests or writes.
const review=(code,message)=>({status:'needs_review',code,message});

export function selectBattingInnings({summary,teamId,matchId,format}){
 if(!['limited_overs','t20'].includes(format))return review('format','Choose the innings explicitly for this match format.');
 if(!teamId||!matchId||summary?.source!=='playhq'||summary.source_match_id!==matchId)return review('source','A linked PlayHQ team and matching saved result are required.');
 if(summary.complete!==true)return review('unfinished','Wait for the completed match result.');
 const periods=summary.periods;
 if(!Array.isArray(periods)||periods.length<1||periods.length>2)return review('periods','The result needs review before choosing a batting innings.');
 if(periods.some(p=>p.provisional!==false||!Number.isInteger(p.sequence)||p.sequence<1||!p.source_period_id||!Array.isArray(p.teams)))return review('periods','The innings order is missing or provisional.');
 const ordered=[...periods].sort((a,b)=>a.sequence-b.sequence);
 if(new Set(ordered.map(p=>p.source_period_id)).size!==ordered.length||ordered.some((p,i)=>p.sequence!==i+1))return review('periods','The innings order is missing or ambiguous.');
 if(ordered.some(p=>/super[ _-]?over/i.test(p.name||'')||p.teams.filter(t=>t.discipline==='BATTING').length!==1))return review('periods','Choose the innings explicitly for this result.');
 // Both teams can have a period called FIRST_INNINGS. The linked team ID,
 // BATTING discipline and sequence identify the actual batting innings.
 const candidates=ordered.flatMap((period,i)=>period.teams.filter(t=>t.team_id===teamId&&t.discipline==='BATTING').map(team=>({period,team,ordinal:i+1})));
 if(candidates.length!==1)return review('team','The linked team does not have one unambiguous batting innings.');
 const {period,team,ordinal}=candidates[0];
 return {status:'selected',matchId,teamId,periodId:period.source_period_id,sequence:period.sequence,ordinal,
  battingOrder:ordinal===1?'first':'second',finalScore:{runs:team.statistics?.TOTAL_SCORE??team.statistics?.TOTALS??null,wickets:team.statistics?.TOTAL_OUTS??null,overs:team.statistics?.TOTAL_OVERS??null},
  batters:(team.players||[]).filter(p=>p.status!=='DID_NOT_BAT').map(p=>({appearanceId:p.source_appearance_id||null,name:p.name,position:p.position,runs:p.statistics?.TOTAL_RUNS??null,balls:p.statistics?.BALLS_FACED??null,status:p.status})).sort((a,b)=>(a.position??Infinity)-(b.position??Infinity)),
  videoWindow:null};
}

export function validateBattingVideoWindow({innings,video,window}){
 if(innings?.status!=='selected')return review('innings','Select the batting innings before analysing footage.');
 if(video?.live_status==='post_live')return {status:'waiting_for_video',code:'processing',message:'The finished livestream is still being processed.'};
 if(video?.live_status==='is_live'||video?.live_status==='is_upcoming')return {status:'waiting_for_video',code:'not_finished',message:'Wait for the finished recording.'};
 if(!Number.isFinite(video?.duration)||video.duration<=0)return review('video','Check the recording duration.');
 if(!window)return {status:'needs_timestamps',code:'window',message:'Locate the batting innings in the video. Do not divide the recording in half.'};
 if(window.periodId!==innings.periodId||!['scoreboard','coach_confirmed'].includes(window.source))return review('window','Confirm that these timestamps show the selected batting innings.');
 const {startSeconds,endSeconds}=window;
 if(!Number.isFinite(startSeconds)||!Number.isFinite(endSeconds)||startSeconds<0||endSeconds<=startSeconds||endSeconds>video.duration)return review('window','The innings timestamps are outside this recording.');
 return {status:'ready',innings,videoWindow:{periodId:innings.periodId,startSeconds,endSeconds,source:window.source}};
}
