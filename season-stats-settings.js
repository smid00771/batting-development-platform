import {statsViewSettings,statsCompetitions} from './season-stats.js?v=0.8.62.366';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={auto:'Automatic',competition:'Competition',limited_overs:'Limited overs only',long_form:'Long form only',t20:'T20'};
export const statsSetupChanged=(data,state)=>!!state.viewDraft && JSON.stringify(state.viewDraft)!==JSON.stringify(statsViewSettings(data));
export function renderStatsSetup(data,state,disabled='',pending=false){
 if(!data?.can_set_stats_views)return '';
 const settings=state.viewDraft||statsViewSettings(data),locked=disabled||pending?'disabled':'',names=[...new Set([...statsCompetitions(data),...Object.keys(settings.competitions||{})])].filter(Boolean).sort((a,b)=>a.localeCompare(b));
 const row=(name=null)=>{
  const own=name===null||Object.hasOwn(settings.competitions,name),policy=name===null?settings.default:own?settings.competitions[name]:settings.default;
  const id=JSON.stringify(name),group=own?(policy.combine?'combined':'separate'):'inherit';
  return `<fieldset class="ss-setup-row"><legend>${esc(name??'Club default')}</legend><label>Formats<select data-stats-setup-group="${esc(id)}" ${locked}>${name===null?'':`<option value="inherit" ${group==='inherit'?'selected':''}>Use club default</option>`}<option value="combined" ${group==='combined'?'selected':''}>Combine Limited overs + Long form</option><option value="separate" ${group==='separate'?'selected':''}>Keep formats separate</option></select></label><label>Default view<select data-stats-setup-view="${esc(id)}" ${locked} ${own?'':'disabled'}>${Object.entries(labels).filter(([value])=>value!=='competition'||policy.combine).map(([value,label])=>`<option value="${value}" ${value===policy.default_view?'selected':''}>${esc(label)}</option>`).join('')}</select></label></fieldset>`;
 };
 return `<form data-stats-view-setup><p class="ss-caption">Choose the club default, then any competition exceptions. T20 stays separate. Settings apply to all staff.</p>${row()}${names.map(name=>row(name)).join('')}<div class="ss-setup-actions"><button class="btn secondary" type="submit" ${disabled}>${pending?'Retry save':'Save stats setup'}</button><button class="btn ghost" type="button" data-stats-setup-cancel ${locked}>Cancel changes</button></div></form>`;
}
export function bindStatsSetup(host,data,state,redraw,save,pending=false){
 const change=(el,kind)=>{
  if(pending)return;
  const name=JSON.parse(el.dataset[kind==='group'?'statsSetupGroup':'statsSetupView']);
  const settings=structuredClone(state.viewDraft||statsViewSettings(data));
  let policy=name===null?settings.default:Object.hasOwn(settings.competitions,name)?settings.competitions[name]:{...settings.default};
  if(kind==='group'){
   if(el.value==='inherit'&&name!==null)delete settings.competitions[name];
   else{policy.combine=el.value==='combined';if(!policy.combine&&policy.default_view==='competition')policy.default_view='auto';if(name!==null)settings.competitions[name]=policy;}
  }else{policy.default_view=el.value;if(name!==null)settings.competitions[name]=policy;}
  state.viewDraft=settings;state.setupOpen=true;redraw();
  const attr=kind==='group'?'statsSetupGroup':'statsSetupView';
  [...host.querySelectorAll(kind==='group'?'[data-stats-setup-group]':'[data-stats-setup-view]')].find(x=>x.dataset[attr]===JSON.stringify(name))?.focus({preventScroll:true});
 };
 host.querySelectorAll('[data-stats-setup-group]').forEach(el=>el.onchange=()=>change(el,'group'));
 host.querySelectorAll('[data-stats-setup-view]').forEach(el=>el.onchange=()=>change(el,'view'));
 host.querySelector('[data-stats-setup-cancel]')?.addEventListener('click',()=>{if(!pending){delete state.viewDraft;redraw();}});
 host.querySelector('[data-stats-view-setup]')?.addEventListener('submit',event=>{event.preventDefault();save();});
}
