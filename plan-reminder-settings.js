// Optional linked-club setup. Dates themselves come from published selections.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createPlanReminderSettings(h){
 let active=null;
 const current=s=>active===s&&s.dialog.isConnected&&h.scope()===s.scope;
 function canLeave(){const s=active;if(!s||!current(s))return true;if(s.busy||s.pending){h.alert('The save is not confirmed. Retry it before closing.');return false;}return !s.dirty||h.confirm('Leave without saving the reminder teams?');}
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('club_plan_reminder_settings',{p_club_id:s.clubId,p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;}
 async function mount(dialog,{clubId,scope}){
  const s={dialog,clubId,scope,busy:false,pending:null,dirty:false};active=s;
  dialog.className='plan-reminder-settings';dialog.setAttribute('aria-labelledby','planReminderHeading');
  dialog.innerHTML='<h2 id="planReminderHeading">Plan reminders</h2><p role="status">Loading teams…</p>';
  dialog.addEventListener('cancel',e=>{if(!canLeave())e.preventDefault();});
  try{const data=await rpc(s,'context');if(!current(s))return;
   dialog.innerHTML=`<style>.plan-reminder-settings{box-sizing:border-box;width:min(540px,calc(100% - 24px));max-height:90dvh;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;padding:16px;color:#24344c}.plan-reminder-settings::backdrop{background:#17243b66}.plan-reminder-settings h2{font-size:22px;margin:0}.plan-reminder-settings p{font-size:13px;line-height:1.45}.plan-reminder-settings label{display:flex;gap:10px;align-items:center;min-height:44px;border-bottom:1px solid #e0e6ed;font-size:14px}.plan-reminder-settings input{width:20px;height:20px;flex:none}.plan-reminder-settings .plan-reminder-teams{max-height:45dvh;overflow:auto}.plan-reminder-settings .btnrow{margin-top:12px}.plan-reminder-settings .btn{min-height:44px}.plan-reminder-settings [role=alert]:empty{display:none}</style><h2 id="planReminderHeading">Plan reminders</h2><p>Choose teams from Mirelion Select. Each selected player’s plan is due <strong>one week before their first fixture of each format this season</strong>.</p><p>Published selections only. One reminder per player and format; completed plans are skipped.</p><form id="planReminderTeamsForm"><div class="plan-reminder-teams">${data.teams.map(t=>`<label><input type="checkbox" name="team_ids" value="${esc(t.id)}" ${data.team_ids.includes(t.id)?'checked':''}>${esc(t.name)}</label>`).join('')||'<p>No active teams are available in Mirelion Select.</p>'}</div><div class="btnrow"><button type="submit" class="btn secondary" id="savePlanReminderTeams">Save teams</button><button type="button" class="btn ghost" id="closePlanReminderTeams">Close</button></div><p role="alert" id="planReminderTeamsStatus"></p></form>`;
   const form=dialog.querySelector('form'),save=form.querySelector('#savePlanReminderTeams'),status=form.querySelector('[role=alert]');
   form.onchange=()=>s.dirty=true;form.querySelector('#closePlanReminderTeams').onclick=()=>{if(canLeave())dialog.close();};
   form.onsubmit=async e=>{e.preventDefault();if(!current(s)||s.busy)return;
    s.pending=s.pending||{revision:data.revision,team_ids:[...form.querySelectorAll('[name=team_ids]:checked')].map(i=>i.value),request_id:h.uuid()};
    s.busy=true;for(const i of form.elements)i.disabled=true;save.textContent='Saving…';status.textContent='';
    try{const answer=await rpc(s,'save',s.pending);if(answer?.saved!==true)throw Error('Save was not confirmed');if(!current(s))return;s.pending=null;s.busy=false;s.dirty=false;dialog.close();await h.saved();}
    catch(error){if(!current(s))return;s.busy=false;if(error.code&&!['PGRST000','PGRST001','PGRST002'].includes(error.code))s.pending=null;status.textContent=s.pending?'Save not confirmed. Retry the same save.':error.message;for(const i of form.elements)i.disabled=!!s.pending;save.disabled=false;save.textContent=s.pending?'Retry save':'Save teams';}
   };
  }catch(error){if(!current(s))return;dialog.innerHTML=`<h2 id="planReminderHeading">Plan reminders</h2><p role="alert">${esc(error.message||'Could not load teams.')}</p><button type="button" class="btn" data-retry>Try again</button><button type="button" class="btn ghost" data-close>Close</button>`;dialog.querySelector('[data-retry]').onclick=()=>mount(dialog,{clubId,scope});dialog.querySelector('[data-close]').onclick=()=>dialog.close();}
 }
 return {mount,canLeave,hasChanges:()=>!!active&&current(active)&&!!(active.dirty||active.pending||active.busy)};
}
