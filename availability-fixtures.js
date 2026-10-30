// Optional calendar aid. Downloaded only after Find fixtures is opened.
// A cache belongs to one selection workspace/account; only team IDs are saved.
const workspaces=new WeakMap();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function styles(document){
 if(document.getElementById('availabilityFixtureStyles'))return;
 const style=document.createElement('style');style.id='availabilityFixtureStyles';style.textContent=`
 .se-fixture-picker{border:1px solid #dce2ee;border-radius:8px;padding:10px;margin:0 0 10px}.se-fixture-picker p{font-size:12px;margin:4px 0 8px}.se-fixture-choices{max-height:220px;overflow:auto}.se-fixture-choices label{display:flex!important;align-items:center;gap:9px;min-height:44px;padding:3px 4px;border-bottom:1px solid #edf0f4}.se-fixture-choices input{width:20px;height:20px;flex:none}.se-fixture-choices small{display:block;color:#52627a;font-size:11px}.se-fixture-picker .se-actions{justify-content:flex-end;margin-top:6px}.se-fixture-status:empty{display:none}
 .se-calendar button[data-se-fixture]{box-shadow:inset 0 0 0 2px #334c91!important}.se-fixture-dot{position:absolute;left:3px;bottom:1px;font-size:12px;color:#334c91}.se-fixture-day{box-sizing:border-box;width:min(420px,calc(100% - 24px));max-height:85dvh;overflow:auto;border:1px solid #cbd5e1;border-radius:12px;padding:16px;color:#24344c;background:white}.se-fixture-day::backdrop{background:#17243b66}.se-fixture-day h2{font-size:20px;margin:0}.se-fixture-day p{font-size:13px;line-height:1.4;margin:7px 0}.se-fixture-day ul{padding:0;list-style:none;margin:10px 0}.se-fixture-day li{padding:8px 0;border-bottom:1px solid #e3e7ef}.se-fixture-day li span{display:block;font-size:13px;margin-top:3px}.se-fixture-day .se-actions{display:flex;gap:6px;flex-wrap:wrap}.se-fixture-day .btn{min-height:44px;padding:8px 12px}.se-fixture-day [aria-pressed=true]{box-shadow:inset 0 0 0 2px #334c91}.se-fixture-day .se-close{margin-left:auto}
 `;document.head.append(style);
}
export function createAvailabilityFixtureFinder(h){
 const {form,button,panel}=h,document=form.ownerDocument;
 styles(document);
 let scopes=workspaces.get(h.workspace);if(!scopes){scopes=new Map();workspaces.set(h.workspace,scopes);}
 let entry=scopes.get(h.scope);if(!entry){entry={data:null,pending:null};scopes.set(h.scope,entry);}
 let selected=new Set(),byDate=new Map(),opened=false,message='';
 const storageKey=()=>`mirelion_fixture_teams:${h.scope}:${entry.data?.season_id||''}`;
 const remember=()=>{try{h.storage.setItem(storageKey(),JSON.stringify([...selected]));}catch{}};
 function chooseSaved(){
  let saved=null;try{saved=JSON.parse(h.storage.getItem(storageKey()));}catch{}
  selected=new Set(Array.isArray(saved)?saved.filter(id=>typeof id==='string').slice(0,200):(entry.data?.teams||[]).filter(t=>t.suggested).map(t=>t.id));
 }
 function indexDates(){
  byDate=new Map();const teams=new Map((entry.data?.teams||[]).map(t=>[t.id,t]));
  for(const f of entry.data?.fixtures||[]){
   const trial=f.source==='trial',included=trial||selected.has(f.team_id)&&teams.has(f.team_id);
   if(!included)continue;
   const team=trial?f.title:teams.get(f.team_id).name,audience=trial?(f.audience==='club'?'Whole club':(f.team_ids||[]).map(id=>teams.get(id)?.name).filter(Boolean).join(' + ')):'';
   for(const day of f.days||[]){if(!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||day.date<entry.data.from_date)continue;
    const rows=byDate.get(day.date)||[];rows.push({...day,id:f.id,source:f.source,team,audience,opposition:f.opposition});byDate.set(day.date,rows);}
  }
  for(const rows of byDate.values())rows.sort((a,b)=>(a.start||'').localeCompare(b.start||'')||a.team.localeCompare(b.team));
 }
 function caption(){
  const count=(entry.data?.teams||[]).filter(t=>selected.has(t.id)).length;
  button.textContent=(count?`Fixtures (${count})`:entry.data?'Fixtures':'Find fixtures')+(opened?' ▴':' ▾');button.setAttribute('aria-expanded',String(opened));
 }
 function render(){
  if(!h.current())return;panel.hidden=!opened;caption();
  const data=entry.data;
  panel.innerHTML=`<p>This season’s PlayHQ fixtures, plus included manual games. Trials for your usual team or whole club are shown automatically. Markers do not confirm selection.</p><div class="se-fixture-choices">${data?(data.teams.length?data.teams.map(t=>`<label><input type="checkbox" data-fixture-team="${escape(t.id)}" ${selected.has(t.id)?'checked':''}><span>${escape(t.name)}${t.usual?'<small>Usual team</small>':t.suggested?'<small>Previously selected</small>':''}</span></label>`).join(''):data.fixtures.some(f=>f.source==='trial')?'<p>Your eligible trials are highlighted on the calendar.</p>':'<p>No upcoming fixtures are available. Your club can import this season or include a manual game.</p>'):''}</div><p class="se-fixture-status" role="status">${escape(message)}</p><div class="se-actions"><button type="button" class="btn ghost" data-fixture-refresh ${entry.pending?'disabled':''}>${entry.pending?'Loading…':'Refresh fixtures'}</button><button type="button" class="btn secondary" data-fixture-done>Done</button></div>`;
  panel.querySelectorAll('[data-fixture-team]').forEach(input=>input.onchange=()=>{if(!h.current())return;if(input.checked)selected.add(input.dataset.fixtureTeam);else selected.delete(input.dataset.fixtureTeam);remember();indexDates();caption();h.paint();});
  panel.querySelector('[data-fixture-refresh]').onclick=()=>void load(true);
  panel.querySelector('[data-fixture-done]').onclick=()=>{opened=false;render();button.focus();};
 }
 async function load(refresh=false){
  if(!h.current())return;
  if(entry.data&&!refresh){chooseSaved();indexDates();render();h.paint();return;}
  if(!entry.pending)entry.pending=Promise.resolve().then(h.fetch).then(data=>{
   if(!data||data.club_id!==h.clubId||data.player_id!==h.playerId||!Array.isArray(data.teams)||!Array.isArray(data.fixtures))throw Error('Fixture response did not match this player');
   return data;
  }).finally(()=>{entry.pending=null;});
  const request=entry.pending;message='Loading fixtures…';render();
  try{const data=await request;if(!h.current())return;entry.data=data;chooseSaved();indexDates();message='';render();h.paint();}
  catch{if(!h.current())return;message=entry.data?'Could not refresh. Showing the fixtures already loaded. Try again.':'Could not load fixtures. Check your connection and try again.';render();}
 }
 function open(){if(!h.current())return;opened=!opened;render();if(opened)void load();}
 function decorate(){
  if(!h.current())return;
  for(const cell of form.querySelectorAll('[data-se-date]')){
   const rows=byDate.get(cell.dataset.seDate),base=cell.dataset.fixtureBaseLabel||cell.getAttribute('aria-label');cell.dataset.fixtureBaseLabel=base;cell.querySelector('.se-fixture-dot')?.remove();
   if(rows?.length){cell.dataset.seFixture='true';cell.setAttribute('aria-haspopup','dialog');cell.setAttribute('aria-label',base+', fixtures: '+[...new Set(rows.map(r=>r.team))].join(', ')+'. View fixtures and set availability');const dot=document.createElement('span');dot.className='se-fixture-dot';dot.textContent='●';dot.setAttribute('aria-hidden','true');cell.append(dot);}
   else{delete cell.dataset.seFixture;cell.removeAttribute('aria-haspopup');cell.setAttribute('aria-label',base);}
  }
  const legend=form.querySelector('[data-fixture-legend]');if(legend)legend.hidden=!byDate.size;
  const note=form.querySelector('.se-form-note');if(note)note.textContent=byDate.size?'Marked dates show fixtures and availability choices. Then Save.':h.instruction;
 }
 function openDate(date){
  const rows=byDate.get(date);if(!h.current()||!rows?.length)return false;
  const dialog=document.createElement('dialog');dialog.className='se-fixture-day';dialog.setAttribute('aria-labelledby','seFixtureDayTitle');
  const label=new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')),status=h.status(date);
  dialog.innerHTML=`<h2 id="seFixtureDayTitle">${escape(label)}</h2><p>Team fixtures · selection not confirmed</p><ul>${rows.map(r=>`<li><strong>${escape(r.team)}</strong><span>${escape(r.audience||'v '+r.opposition)}</span><span>${r.day>1?'Day '+r.day+' · ':''}${escape(r.start||'Time TBC')}${r.ground?' · '+escape(r.ground):''}</span></li>`).join('')}</ul><p>Your availability</p><div class="se-actions">${[['available','Available'],['unavailable','Unavailable'],['unknown','Not set']].map(([value,text])=>`<button type="button" class="btn secondary" data-fixture-status="${value}" aria-pressed="${status===value}">${text}</button>`).join('')}</div><p>Changes are saved with your calendar’s Save button.</p><div class="se-actions"><button type="button" class="btn ghost se-close" data-fixture-close>Close</button></div>`;
  form.append(dialog);
  dialog.querySelectorAll('[data-fixture-status]').forEach(b=>b.onclick=()=>{if(h.current())h.setStatus(date,b.dataset.fixtureStatus);dialog.close();});
  dialog.querySelector('[data-fixture-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(h.current())form.querySelector(`[data-se-date="${date}"]`)?.focus({preventScroll:true});},{once:true});
  dialog.showModal();return true;
 }
 if(entry.data){chooseSaved();indexDates();}
 button.onclick=open;caption();
 return {open,decorate,openDate};
}
