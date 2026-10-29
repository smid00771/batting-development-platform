import {createTeamWeekDemo} from './team-of-week-demo.js?v=0.8.62.199';
/* Demo records remain in memory; no live club writes or imported-score changes. */
export function createPlayerWeekDemo(clubName,sharedScores=null){
 const scores=createTeamWeekDemo(clubName,sharedScores),files=new Map(),editions=new Map(),profiles={};let design={layout:{},revision:0};
 return {
 collection(end){const seen=new Set(),pool=sharedScores?.(end).candidates;return [...editions.values()].reverse().filter(e=>{const key=e.request.award_scope?.key||'all';if(!e.sealed||e.week_end!==end||seen.has(key))return false;seen.add(key);return true;}).map(e=>({id:e.id,kind:'player_week',week_end:e.week_end,label:'Player of the Week · '+e.winner.name,bucket:'club-player-week',image_path:e.image_path,image_sha:e.request.sha256,award_scope:structuredClone(e.request.award_scope||{mode:'all',ids:[]}),scores_current:!pool||JSON.stringify(e.winner)===JSON.stringify(pool.find(p=>p.key===e.winner.key)),performance_keys:[]}));},
 async rpc(name,args){
  if(name!=='player_of_week_api')return {error:{message:'Unavailable in this demo'}};
  const data=args.p_data,action=args.p_action;
  if(action==='context'){const r=await scores.rpc('team_of_week_api',{...args,p_action:'context'});return {data:{cards:r.data.cards,candidates:r.data.candidates.map(p=>({...p,format:'limited_overs',previous:[],usual_grade:p.grade})),profiles:structuredClone(profiles),design:structuredClone(design),history:[...editions.values()].filter(e=>e.sealed).reverse().map(({request,...e})=>structuredClone(e))}};}
  if(action==='profile'){if((profiles[data.player_id]?.revision||0)!==data.revision)return {error:{message:'Context changed. Reload scores.'}};profiles[data.player_id]={stage:data.stage,note:data.note,revision:data.revision+1};return {data:{saved:true,revision:data.revision+1}};}
  if(action==='save_design'){if(data.revision!==design.revision)return {error:{message:'Layout changed. Reload scores.'}};design={layout:structuredClone(data.layout),revision:design.revision+1};return {data:{saved:true,revision:design.revision}};}
  if(action==='reserve_image'){if(!editions.has(data.id)){const source=await scores.rpc('team_of_week_api',{...args,p_action:'context'}),winner=source.data.candidates.find(p=>p.key===data.key);if(!winner)return {error:{message:'Choose a winner'}};editions.set(data.id,{id:data.id,week_end:data.week_end,winner,title:data.title,blurb:data.blurb,image_path:args.p_club_id+'/editions/'+data.id+'.png',created_at:new Date().toISOString(),request:structuredClone(data),sealed:false});}const e=editions.get(data.id);return {data:{id:e.id,path:e.image_path,sealed:e.sealed}};}
  if(action==='finish_image'){const e=editions.get(data.id);if(!e||!files.has(e.image_path))return {error:{message:'Upload the image first'}};e.sealed=true;return {data:{saved:true}};}
  return {error:{message:'Unknown demo action'}};
 },storage:{from(){return {async upload(path,blob){if(files.has(path))return {error:{message:'Image already exists'}};files.set(path,blob);return {data:{path}};},async remove(paths){for(const path of paths)files.delete(path);return {data:[],error:null};},async download(path){return files.has(path)?{data:files.get(path)}:{error:{message:'Image not found'}};}};}}};
}
