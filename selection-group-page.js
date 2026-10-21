import {createSelectionGroupManager} from './selection-group-manager.js?v=0.8.62.241';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Read saved groups and the cached source names. Opening this page never imports.
export function createSelectionGroupPage(h){
 let s;
 const live=state=>s===state&&state.host.isConnected&&h.here?.()!==false&&h.clubId()===state.club;
 async function rpc(state,name,args){const r=await h.supabase.rpc(name,{p_club_id:state.club,...args});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;}
 async function source(state,action,data){const r=await h.supabase.functions.invoke('playhq-sync',{body:{club_id:state.club,action,...data}});if(r.error||r.data?.error){let detail;try{detail=await r.error?.context?.json();}catch{}throw Error(detail?.error||r.data?.error||r.error?.message||'Could not load team details.');}return r.data;}
 async function mount(host,{selectionGroupId=null}={}){
  const state=s={host,club:h.clubId(),loading:true,manager:null};host.innerHTML='<p role="status">Loading saved Selection Groups…</p>';
  try{
   const context=await rpc(state,'selection_group_management_context');if(!live(state))return;
   host.innerHTML='<div data-group-management></div><p role="status" data-group-message></p>';
   state.manager=createSelectionGroupManager({here:()=>live(state),alert:h.alert,confirm:h.confirm,
    manage:(action,data)=>rpc(state,'club_selection_group_manage',{p_action:action,p_data:data}),
    previewTeam:t=>source(state,'preview',{season_id:context.season,grade_id:t.grade.id,team_id:t.id}),
    loadSeason:groupId=>h.loadSeason?.(groupId),manual:h.manual,captains:h.captains,
    saved:async(result,action)=>{
     let message='';
     if(action==='add_team'){
      const mapping=result.mappings.find(m=>m.grade_id===result.changed_grade_id&&m.season_id===context.season),team=context.teams.find(t=>t.id===mapping?.team_id);
      if(team?.grade?.id){try{const preview=await source(state,'preview',{season_id:context.season,grade_id:team.grade.id,team_id:team.id});await rpc(state,'playhq_sync_api',{p_action:'import_all',p_data:{preview_id:preview.preview_id}});}catch(e){message='Team saved. Fixtures will be checked automatically. '+e.message;}}
      else message='Team saved. Fixtures will load when PlayHQ supplies the draw.';
     }
     await h.saved?.(result);if(live(state))host.querySelector('[data-group-message]').textContent=message;
    }});
   state.manager.mount(host.querySelector('[data-group-management]'),{context,teams:context.teams,season:context.season||'',catalogue:context.catalogue,management:true});
   if(selectionGroupId)state.manager.addTeam(selectionGroupId);
  }catch(e){if(live(state)){host.innerHTML=`<p role="alert">${esc(e.message)}</p><button class="btn" data-group-retry>Reload saved groups</button>`;host.querySelector('[data-group-retry]').onclick=()=>void mount(host);}}
  finally{state.loading=false;}
 }
 return {mount,hasChanges:()=>!!(s&&live(s)&&s.manager?.hasChanges()),canLeave:()=>!s||!live(s)||!s.manager||s.manager.canLeave()};
}
