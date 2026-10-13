/* Demo-only memory store. It never requests or changes a real scorecard. */
export function createTeamWeekDemo(clubName){
 const files=new Map(),editions=new Map();let design={background_path:null,layout:{},revision:0};
 const names=['Alex Carter','Sam Riley','Jordan Lee','Morgan Reed','Taylor James','Casey Brown','Jamie Bell','Robin White','Cameron Hill','Chris Green','Drew Clarke','Pat Wilson','Lee Woods','Rory King','Charlie Young','Jesse Ward'];
 function sample(end){
  const snapshot='sample-'+end,team='sample-club',candidates=names.map((name,n)=>{const runs=[86,72,64,58,47,35,28,24,12,8,0,7,42,21,16,9][n],wickets=[0,0,0,0,0,3,2,2,5,4,3,1,0,0,0,0][n],id='sample-player-'+n;
   return {key:snapshot+':'+team+':'+id,snapshot_id:snapshot,team_id:team,match_id:'sample-match',player_id:id,name,grade:(n%4+1)+['st','nd','rd','th'][n%4]+' Grade',runs,wickets,conceded:20+n,batting:runs?[{runs,not_out:n%3===0}]:[],bowling:wickets?[{wickets,runs:20+n,team_id:team,importable:true}]:[]};});
  return {cards:[{snapshot_id:snapshot,our_team:team,scorecard:{schema_version:2,status:'completed',match_id:'sample-match',url:'#',dates:[end],grade:'Sample grades',teams:[{id:team,name:clubName()},{id:'sample-visitors',name:'Sample visitors'}],innings:[{team_id:team,complete:true,bowling_available:true},{team_id:'sample-visitors',complete:true,bowling_available:true}]}}],candidates,design:structuredClone(design),history:[...editions.values()].filter(e=>e.sealed).map(({request,...e})=>e).reverse()};
 }
 return {
  async rpc(name,args){if(name!=='team_of_week_api')return {error:{message:'Unavailable in this demo'}};const action=args.p_action,data=args.p_data;
   if(action==='context')return {data:sample(data.week_end)};
   if(action==='access')return {data:{allowed:true}};
   if(action==='save_design'){design={background_path:data.background_path,layout:{...data.layout},revision:design.revision+1};return {data:{saved:true}};}
   if(action==='reserve_image'){if(!editions.has(data.id))editions.set(data.id,{id:data.id,request:data,week_end:data.week_end,title:data.title,blurb:data.blurb,rows:data.rows,image_path:args.p_club_id+'/editions/'+data.id+'.png',created_at:new Date().toISOString(),sealed:false});const e=editions.get(data.id);return {data:{id:e.id,path:e.image_path,sealed:e.sealed}};}
   if(action==='finish_image'){const e=editions.get(data.id);if(!e||!files.has(e.image_path))return {error:{message:'Upload the image first'}};e.sealed=true;return {data:{saved:true}};}
   return {error:{message:'Use the live club for scorecard imports.'}};
  },
  storage:{from(){return {async upload(path,blob){if(files.has(path))return {error:{message:'Image already exists'}};files.set(path,blob);return {data:{path}};},async download(path){return files.has(path)?{data:files.get(path)}:{error:{message:'Image not found'}};}};}}
 };
}
