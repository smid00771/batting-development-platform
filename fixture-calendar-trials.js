// Club trials have an audience, not a team selection list. Loaded on demand.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createFixtureCalendarTrials(h){
 let active=null;
 const live=s=>active===s&&s.host.isConnected&&h.scope()===s.scope;
 function canLeave(){const s=active;if(!s||!live(s))return true;if(s.busy||s.pending){h.alert(s.busy?'Please wait for the trial to save.':'The trial save is unconfirmed. Retry the same save before closing.');return false;}return !s.dirty||h.confirm('Leave the unsaved trial changes?');}
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('club_fixture_calendar_trials',{p_club_id:s.clubId,p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;}
 function frame(s,title,body){s.host.innerHTML=`<style>.calendar-trials{box-sizing:border-box;width:min(650px,calc(100% - 24px));max-height:90dvh;border:1px solid #cad4e0;border-radius:12px;padding:16px;color:#24344c;background:white;overflow:auto}.calendar-trials::backdrop{background:#17243b66}.calendar-trials h2{font-size:22px;margin:0}.calendar-trials p{font-size:13px;line-height:1.4;margin:8px 0}.calendar-trials .trial-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #e0e6ed}.calendar-trials .trial-row small{display:block;margin-top:4px}.calendar-trials label{display:block;font-size:14px;margin:10px 0}.calendar-trials input:not([type=checkbox]),.calendar-trials select{width:100%;box-sizing:border-box;min-height:44px;font:inherit;font-size:16px;padding:8px;border:1px solid #b9c5d5;border-radius:6px}.calendar-trials .trial-date{display:grid;grid-template-columns:1fr 1fr;gap:10px}.calendar-trials .trial-check{display:flex;align-items:center;gap:9px;min-height:44px;margin:2px 0}.calendar-trials .trial-check input{width:20px;height:20px;flex:none}.calendar-trials .trial-team-list{max-height:220px;overflow:auto}.calendar-trials .trial-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.calendar-trials .btn{min-height:44px}.calendar-trials [hidden]{display:none!important}</style><div class="trial-row" style="padding-top:0"><h2 id="calendarTrialsTitle">${esc(title)}</h2><button type="button" class="btn ghost" data-trial-close>Close</button></div>${body}`;
  s.host.querySelector('[data-trial-close]').onclick=()=>{if(canLeave())s.host.close();};
 }
 async function load(s){
  frame(s,'Club trials','<p role="status">Loading trials…</p>');
  try{const data=await rpc(s,'context');if(!live(s))return;if(!Array.isArray(data?.teams)||!Array.isArray(data?.trials))throw Error('Trial setup could not be confirmed');s.data=data;if(s.newTrial){s.newTrial=false;newTrial(s);}else list(s);}
  catch(e){if(!live(s))return;frame(s,'Club trials',`<p role="alert">${esc(e.message||'Could not load trials.')}</p><button type="button" class="btn" data-trial-retry>Try again</button>`);s.host.querySelector('[data-trial-retry]').onclick=()=>void load(s);}
 }
 function list(s){
  const names=ids=>ids.map(id=>s.data.teams.find(t=>t.id===id)?.name||'Team').join(', ');
  frame(s,'Club trials',`<p>Choose the whole club or teams. Team trials use each player’s usual team.</p><button type="button" class="btn" data-trial-new>Add Trial game</button>${s.data.trials.map(t=>`<div class="trial-row"><div><strong>${esc(t.title)}</strong><small>${esc(t.days.map(d=>d.date).join(' / '))} · ${esc(t.audience==='club'?'Whole club':names(t.team_ids))}</small><small>${t.included?'Included in fixtures calendar':'Not included in fixtures calendar'}</small></div><button type="button" class="btn secondary" data-trial-edit="${esc(t.id)}">Edit</button></div>`).join('')||'<p>No upcoming club trials saved.</p>'}`);
  s.host.querySelector('[data-trial-new]').onclick=()=>newTrial(s);
  s.host.querySelectorAll('[data-trial-edit]').forEach(b=>b.onclick=()=>edit(s,s.data.trials.find(t=>t.id===b.dataset.trialEdit)));
 }
 function newTrial(s){edit(s,{id:h.uuid(),revision:0,title:'Club trial',days:[{date:'',start:'',ground:''}],audience:s.data.can_whole_club?'club':'teams',team_ids:[],included:false});}
 function edit(s,trial){
  s.dirty=false;s.trial=trial;
  const day=(d,i)=>`<div class="trial-date"><label>${i?'Day 2 date':'Date'}<input type="date" name="date${i}" value="${esc(d?.date)}" ${i?'':'required'}></label><label>Start time<input type="time" name="start${i}" value="${esc(d?.start)}"></label></div><label>Ground<input name="ground${i}" maxlength="120" value="${esc(d?.ground)}"></label>`;
  frame(s,trial.revision?'Edit Trial game':'Add Trial game',`<form id="calendarTrialForm"><label>Trial name<input name="title" maxlength="120" required value="${esc(trial.title)}"></label><label>Who is this trial for?<select name="audience">${s.data.can_whole_club?`<option value="club" ${trial.audience==='club'?'selected':''}>Whole club</option>`:''}<option value="teams" ${trial.audience==='teams'?'selected':''}>Selected teams</option></select></label><p>Team trials use the player’s usual team, so no selections are needed.</p><div class="trial-team-list" id="calendarTrialTeams" ${trial.audience==='club'?'hidden':''}>${s.data.teams.map(t=>`<label class="trial-check"><input type="checkbox" name="team_ids" value="${esc(t.id)}" ${trial.team_ids.includes(t.id)?'checked':''}>${esc(t.name)}</label>`).join('')}</div>${day(trial.days[0],0)}<details ${trial.days[1]?'open':''}><summary>Another day (optional)</summary>${day(trial.days[1],1)}</details><label class="trial-check"><input type="checkbox" name="included" ${trial.included?'checked':''}>Include in fixtures calendar</label><div class="trial-actions"><button type="submit" class="btn" data-trial-save>Save trial</button><button type="button" class="btn ghost" data-trial-back>Saved trials</button></div><p role="alert" data-trial-status></p></form>`);
  const form=s.host.querySelector('form'),status=form.querySelector('[data-trial-status]'),save=form.querySelector('[data-trial-save]');
  form.oninput=()=>s.dirty=true;
  form.elements.audience.onchange=()=>{s.dirty=true;form.querySelector('#calendarTrialTeams').hidden=form.elements.audience.value==='club';};
  form.querySelector('[data-trial-back]').onclick=()=>{if(canLeave()){s.dirty=false;list(s);}};
  form.onsubmit=async event=>{
   event.preventDefault();if(s.busy||!live(s))return;
   if(!s.pending){
    const values=new form.ownerDocument.defaultView.FormData(form),days=[0,1].filter(i=>values.get('date'+i)).map(i=>({date:values.get('date'+i),start:values.get('start'+i),ground:values.get('ground'+i).trim()})),audience=values.get('audience'),teams=audience==='teams'?values.getAll('team_ids'):[];
    if(!values.get('title').trim()||!days.length||days.length===2&&days[1].date<=days[0].date||audience==='teams'&&!teams.length){status.textContent='Enter a name, valid dates and at least one team for a selected-team trial.';return;}
    s.pending={id:trial.id,revision:trial.revision,title:values.get('title').trim(),days,audience,team_ids:teams,included:values.has('included'),request_id:h.uuid()};
   }
   s.busy=true;status.textContent='';save.textContent='Saving…';for(const control of form.elements)control.disabled=true;
   try{const result=await rpc(s,'save',s.pending);if(result?.saved!==true)throw Error('The save could not be confirmed');if(!live(s))return;s.pending=null;s.dirty=false;s.busy=false;await load(s);}
   catch(error){if(!live(s))return;s.busy=false;if(error.code&&!['PGRST000','PGRST001','PGRST002'].includes(error.code))s.pending=null;status.textContent=s.pending?'Save not confirmed. Retry the same save.':error.message;for(const control of form.elements)control.disabled=!!s.pending;save.disabled=false;save.textContent=s.pending?'Retry save':'Save trial';}
  };
 }
 return {mount(host,{clubId,scope,newTrial=false}){const s={host,clubId,scope,newTrial,busy:false,dirty:false,pending:null,data:null};active=s;host.classList.add('calendar-trials');host.setAttribute('aria-labelledby','calendarTrialsTitle');host.addEventListener('cancel',e=>{if(!canLeave())e.preventDefault();});void load(s);},canLeave,hasChanges:()=>!!active&&live(active)&&!!(active.dirty||active.pending||active.busy)};
}
