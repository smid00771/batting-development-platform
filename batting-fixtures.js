import {createPlayHQImport} from './playhq-import.js?v=0.8.62.288';
import {createPlayCricketConnection} from './playcricket-connection.js?v=0.8.62.310';
import {createFixtureCalendarTrials} from './fixture-calendar-trials.js?v=0.8.62.304';

// A separate entry point for clubs without Select, using the same fixture services.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formats={limited_overs:'Limited overs',long_form:'Long form',t20:'T20'};
const date=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?d.split('-').reverse().join('/'):d||'';
export function createBattingFixtures(h){
 let active=null;
 const live=s=>s===active&&s.host.isConnected&&s.scope===h.scope()&&h.here();
 const here=view=>()=>!!active&&live(active)&&active.route.view===view;
 const connection=createPlayCricketConnection({...h,here:here('connection'),back:()=>go({view:'home'}),season:()=>go({view:'season'})});
 const importer=createPlayHQImport({...h,here:here('season'),connect:()=>go({view:'connection'}),manual:()=>go({view:'manual'}),
  manualGrades:()=>h.teams(true),captains:()=>h.teams(false),back:()=>go({view:'home'}),openFixture:id=>go({view:'manual',fixtureId:id}),refresh:async()=>{
   const s=active;if(!s||!live(s))return;const data=await rpc(s,'context');if(live(s))s.data=data;
  }});
 const trials=createFixtureCalendarTrials(h);
 function hasChanges(){const s=active;return !!(s&&live(s)&&(s.busy||s.pending||s.dirty||connection.hasChanges()||importer.hasChanges()||trials.hasChanges()));}
 function canLeave(){const s=active;if(!s||!live(s))return true;
  if(s.busy||s.pending){h.alert(s.pending?'The fixture save is unconfirmed. Retry the same save before leaving.':'Please wait for the fixture request to finish.');return false;}
  if(!connection.canLeave()||!importer.canLeave()||!trials.canLeave())return false;
  if(s.dirty&&!h.confirm('Leave these unsaved fixture changes?'))return false;s.dirty=false;return true;
 }
 async function rpc(s,action,data={}){const r=await h.supabase.rpc('club_batting_fixtures',{p_club_id:s.club,p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});return r.data;}
 function route(s,r){s.route={view:'home',team:'',period:'upcoming',...r};h.route({...s.route});}
 function go(r){const s=active;if(!s||!live(s)||!canLeave())return;route(s,{team:s.route.team,period:s.route.period,...r});draw(s);}
 const styles=`<style>.batting-fixtures .fixture-head,.batting-fixtures .fixture-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.batting-fixtures h1,.batting-fixtures h2{margin:0}.batting-fixtures .fixture-row{padding:12px 0;border-bottom:1px solid var(--line,#d9ddd4)}.batting-fixtures .fixture-row small{display:block;margin-top:4px}.batting-fixtures .fixture-filters,.batting-fixtures .fixture-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.batting-fixtures label{display:block;margin:10px 0}.batting-fixtures input:not([type=checkbox]),.batting-fixtures select{width:100%;min-height:44px;box-sizing:border-box}.batting-fixtures .fixture-check{display:flex;align-items:center;gap:8px;min-height:44px}.batting-fixtures .fixture-check input{width:20px;height:20px;flex:none}.batting-fixtures [hidden]{display:none!important}.batting-fixtures .fixture-editor{max-width:720px}.batting-fixtures .fixture-save{position:sticky;bottom:0;background:var(--paper,#fffffa);padding:10px 0}.batting-fixtures .btn{min-height:44px}@media(max-width:480px){.batting-fixtures .fixture-days{grid-template-columns:1fr}.batting-fixtures .fixture-head{align-items:flex-start}}</style>`;
 function frame(s,html){s.host.innerHTML=styles+`<div class="batting-fixtures">${html}</div>`;}
 function draw(s){
  if(!live(s))return;
  if(!s.data?.admin&&s.route.view!=='home')route(s,{view:'home'});
  if(s.route.view==='manual')return edit(s);
  if(['season','connection'].includes(s.route.view)){
   frame(s,'<div data-fixture-setup></div>');const host=s.host.querySelector('[data-fixture-setup]');
   if(s.route.view==='connection')void connection.mount(host);else importer.mount(host,{groups:s.data.groups,existing:s.data.fixtures});return;
  }
  const rows=s.data.fixtures.filter(f=>(!s.route.team||f.details.grade_group_id===s.route.team)&&
   (s.route.period==='all'||(f.details.days.at(-1)?.date>=h.today())===(s.route.period==='upcoming')));
  frame(s,`<section class="card"><div class="fixture-head"><h1>Fixtures</h1>${s.data.admin?'<button class="btn" data-fixture-season>Season &amp; automatic fixtures</button>':''}</div>
   ${s.data.admin?'<details style="margin-top:12px"><summary>More</summary><div class="fixture-actions" style="justify-content:flex-start;margin-top:8px"><button class="btn ghost" data-fixture-new>Add fixture manually</button><button class="btn ghost" data-fixture-trials>Trial games</button><button class="btn ghost" data-fixture-teams>Manage teams</button></div></details>':''}
   <div class="fixture-filters"><label>Team<select data-fixture-team><option value="">All teams</option>${s.data.groups.map(g=>`<option value="${esc(g.id)}" ${s.route.team===g.id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><label>Matches<select data-fixture-period>${[['upcoming','Upcoming'],['past','Played'],['all','All matches']].map(([k,v])=>`<option value="${k}" ${s.route.period===k?'selected':''}>${v}</option>`).join('')}</select></label></div>
   ${rows.map(f=>`<article class="fixture-row"><div class="fixture-head"><div><strong>${esc(f.details.grade)} · v ${esc(f.details.opposition)}</strong><small>${esc(f.details.days.map(d=>[date(d.date),d.start,d.ground].filter(Boolean).join(' · ')).join(' / '))}</small><small>${esc(formats[f.details.format]||'')}${f.details.cancelled?' · Cancelled':''}</small></div><div class="fixture-actions">${!f.details.cancelled?`<button class="btn ghost" data-fixture-review="${esc(f.id)}">Match review</button>`:''}${s.data.admin?`<details><summary>Details</summary><button class="btn ghost" data-fixture-edit="${esc(f.id)}">Edit fixture</button></details>`:''}</div></div></article>`).join('')||`<p>${s.data.fixtures.length?'No matches in this view.':s.data.admin?'Connect PlayCricket to load your season, or add a fixture from More.':'No fixtures available. Your Club Admin can connect PlayCricket or add fixtures here.'}</p>`}
  </section>`);
  const on=(q,fn)=>s.host.querySelector(q)?.addEventListener('click',fn);
  on('[data-fixture-season]',()=>go({view:'season'}));on('[data-fixture-new]',()=>go({view:'manual'}));on('[data-fixture-teams]',()=>h.teams(false));
  on('[data-fixture-trials]',()=>{const dialog=document.createElement('dialog');s.host.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});trials.mount(dialog,{clubId:s.club,scope:s.scope});dialog.showModal();});
  for(const key of ['team','period'])s.host.querySelector('[data-fixture-'+key+']').onchange=e=>{route(s,{...s.route,[key]:e.target.value});draw(s);};
  s.host.querySelectorAll('[data-fixture-review]').forEach(b=>b.onclick=()=>h.review(b.dataset.fixtureReview));
  s.host.querySelectorAll('[data-fixture-edit]').forEach(b=>b.onclick=()=>go({view:'manual',fixtureId:b.dataset.fixtureEdit}));
 }
 function edit(s){
  const f=s.data.fixtures.find(f=>f.id===s.route.fixtureId);
  if(s.route.fixtureId&&!f){frame(s,'<section class="card"><p>This fixture is unavailable.</p><button class="btn" data-fixture-back>Fixtures</button></section>');s.host.querySelector('button').onclick=()=>go({view:'home'});return;}
  const d=f?.details||{grade_group_id:s.route.team||'',days:[{date:'',start:'',ground:''}],format:'limited_overs',opposition:'',include_in_fixture_calendar:false,cancelled:false};
  const day=(i)=>`<div class="fixture-days" ${i?'data-fixture-day2 '+(d.format==='long_form'?'':'hidden'):''}><label>${i?'Day 2 date (optional)':'Date'}<input type="date" name="date${i}" value="${esc(d.days[i]?.date)}" ${i?'':'required'}></label><label>Start time<input type="time" name="start${i}" value="${esc(d.days[i]?.start)}"></label><label>Ground<input name="ground${i}" maxlength="120" value="${esc(d.days[i]?.ground||d.ground)}"></label></div>`;
  frame(s,`<section class="card fixture-editor"><div class="fixture-head"><h1>${f?'Edit fixture':'Add fixture'}</h1><button class="btn ghost" data-fixture-back>Fixtures</button></div>
   ${!s.data.groups.length?'<p>Add a team before creating its fixture.</p><button class="btn" data-fixture-teams>Add team</button>':`<form data-fixture-form>
   <label>Team<select name="grade_group_id" required><option value="">Choose team</option>${s.data.groups.map(g=>`<option value="${esc(g.id)}" ${g.id===d.grade_group_id?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label>
   <label>Opposition<input name="opposition" required maxlength="160" value="${esc(d.opposition)}"></label><label>Format<select name="format">${Object.entries(formats).map(([k,v])=>`<option value="${k}" ${d.format===k?'selected':''}>${v}</option>`).join('')}</select></label>${day(0)}${day(1)}
   <details><summary>Other details</summary><label>Overs (optional)<input type="number" name="overs" min="1" max="999" value="${esc(d.overs)}"></label><label class="fixture-check"><input type="checkbox" name="include_in_fixture_calendar" ${d.include_in_fixture_calendar?'checked':''}>Include in fixtures calendar</label>${f?`<label class="fixture-check"><input type="checkbox" name="cancelled" ${d.cancelled?'checked':''}>Cancelled</label>`:''}</details>
   <div class="fixture-save"><button class="btn" type="submit" data-fixture-save>Save fixture</button><p role="alert" data-fixture-status></p></div></form>`}</section>`);
  s.host.querySelector('[data-fixture-back]').onclick=()=>go({view:'home'});s.host.querySelector('[data-fixture-teams]')?.addEventListener('click',()=>h.teams(true));
  const form=s.host.querySelector('form');if(!form)return;
  form.oninput=()=>s.dirty=true;form.elements.format.onchange=()=>{s.dirty=true;form.querySelector('[data-fixture-day2]').hidden=form.elements.format.value!=='long_form';};
  form.onsubmit=async e=>{
   e.preventDefault();if(!live(s)||s.busy)return;
   const status=form.querySelector('[data-fixture-status]'),button=form.querySelector('[data-fixture-save]');
   if(!s.pending){const values=new form.ownerDocument.defaultView.FormData(form),format=values.get('format');
    const days=[0,1].filter(i=>values.get('date'+i)&&(!i||format==='long_form')).map(i=>({date:values.get('date'+i),start:values.get('start'+i),ground:values.get('ground'+i).trim()}));
    if(!days.length||days.length===2&&days[1].date<=days[0].date){status.textContent='Day 2 must follow Day 1.';return;}
    s.pending={id:f?.id||h.uuid(),revision:f?.revision||0,request_id:h.uuid(),details:{grade_group_id:values.get('grade_group_id'),opposition:values.get('opposition').trim(),format,days,ground:days[0].ground,overs:values.get('overs')?Number(values.get('overs')):null,cancelled:values.has('cancelled'),include_in_fixture_calendar:values.has('include_in_fixture_calendar')}};
   }
   s.busy=true;status.textContent='';button.textContent='Saving…';for(const control of form.elements)control.disabled=true;
   try{const result=await rpc(s,'save',s.pending);if(result?.saved!==true)throw Error('Save could not be confirmed');if(!live(s))return;
    const team=s.pending.details.grade_group_id;s.pending=null;s.dirty=false;s.busy=false;route(s,{view:'home',period:'all',team});await load(s);
   }catch(error){if(!live(s))return;s.busy=false;if(/^(?:22|23|42|P0001)/.test(error.code||''))s.pending=null;
    status.textContent=s.pending?'Save not confirmed. Retry the same save.':error.message;
    for(const control of form.elements)control.disabled=!!s.pending;button.disabled=false;button.textContent=s.pending?'Retry save':'Save fixture';
   }
  };
 }
 async function load(s){
  frame(s,'<section class="card"><h1>Fixtures</h1><p role="status">Loading fixtures…</p></section>');s.busy=true;
  try{const data=await rpc(s,'context');if(!live(s))return;if(!Array.isArray(data?.fixtures)||!Array.isArray(data?.groups))throw Error('Fixtures could not be checked');s.data=data;s.busy=false;draw(s);}
  catch(error){if(!live(s))return;s.busy=false;frame(s,`<section class="card"><h1>Fixtures</h1><p role="alert">${esc(error.message)}</p><button class="btn" data-fixture-retry>Try again</button></section>`);s.host.querySelector('button').onclick=()=>void load(s);}
 }
 return {canLeave,hasChanges,mount(host,{route:r={}}={}){const s=active={host,scope:h.scope(),club:h.clubId(),dirty:false,busy:false,pending:null};route(s,r);return load(s);}};
}
