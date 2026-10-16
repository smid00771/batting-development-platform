// Local design trials. Only the explicit Apply action can save club settings.
export function createSocialSandbox(h){
 const names=['Alex Sample','Jordan Sample','Taylor Sample','Casey Sample','Morgan Sample','Riley Sample','Cameron Sample','Sam Sample','Jamie Sample','Charlie Sample','Robin Sample'];
 const current=s=>h.here(s)&&s.view==='sandbox',copy=value=>JSON.parse(JSON.stringify(value));
 function teams(s){
  const rows=new Map(),add=grade=>{const label=String(grade||'').trim(),key=label.toLowerCase();if(label&&!rows.has(key))rows.set(key,{label});return rows.get(key);};
  for(const row of h.groups(s).filter(g=>g.active!==false))add(row.name);
  for(const row of s.data.grade_defaults||[])add(row.grade);
  for(const row of s.data.fixture_calendar||[])add(row.grade);
  const today=new Date().toLocaleDateString('en-CA',{timeZone:s.data.timezone||'Australia/Sydney'}),date=f=>f.published.details.days.at(-1)?.date||'';
  const fixtures=(s.data.fixtures||[]).filter(f=>f.published?.details?.days?.length).slice().sort((a,b)=>{
   const ad=date(a),bd=date(b),upA=!a.completed&&ad>=today,upB=!b.completed&&bd>=today;
   return upA!==upB?(upA?-1:1):upA?ad.localeCompare(bd):bd.localeCompare(ad);
  });
  for(const f of fixtures){const row=add(f.published.details.grade);if(row&&!row.fixture&&!f.published.details.cancelled)row.fixture=f;}
  if(!rows.size)add('Sample team');
  return [...rows.values()].map((row,i)=>{
   const id='sandbox-team-'+i,hasLineup=!!row.fixture?.published?.slots?.some(slot=>slot.d1||slot.d2);
   if(hasLineup)return {id,label:row.label,sample:false,f:{...copy(row.fixture),id}};
   const people=names.map((name,j)=>({id:id+'-player-'+j,name}));
   return {id,label:row.label,sample:true,f:{id,publication:1,features:[],published:{
    details:{grade:row.label,opposition:'Sample visitors',format:'limited_overs',overs:50,ground:'Example ground',days:[{date:new Date(Date.now()+7*86400000).toISOString().slice(0,10),start:'10:00'}],match_roles:{d1:{captain_id:people[0].id,keeper_id:people[2].id}}},players:people,slots:people.map(p=>({d1:p.id,d2:null}))}}};
  });
 }
 function ensure(s){
  if(!s.sandbox){const options=teams(s);s.sandbox={design:{...h.defaults(s.data)},teams:options,team:options[0].id,day:0,photos:{},people:{},positions:{},background:null,urls:new Map(),owned:new Set(),busy:false,paint:0};}
  return s.sandbox;
 }
 function selection(s){
  const b=ensure(s),team=b.teams.find(t=>t.id===b.team)||b.teams[0],cards=h.cards(team.f),card=cards.find(c=>c.day===b.day)||cards[0],key=card.key;
  const ids=new Set(team.f.published.slots.map(slot=>slot['d'+(card.day+1)]).filter(Boolean));
  const photos=s.data.assets.filter(a=>['photo','portrait'].includes(a.kind)&&(team.sample||ids.has(a.roster_id)));
  if(!Object.hasOwn(b.photos,key)){
   const featured=h.featured({...s,design:b.design},card),photo=featured.asset||photos[0];
   b.photos[key]=photo?.id||'';b.people[key]=ids.has(photo?.roster_id)?photo.roster_id:featured.id||[...ids][3]||[...ids][0];
   b.positions[key]=featured.asset?{x:featured.choice?.photo_x||0,y:featured.choice?.photo_y||0}:{x:0,y:0};
  }
  return {b,team,cards,card,key,photos};
 }
 function preview(s){
  const {b,team,card,key}=selection(s),f=copy(team.f),person=b.people[key];
  const assets=s.data.assets.filter(a=>!b.background||a.kind!=='background').map(a=>({...a}));
  if(b.background)assets.push({...b.background});
  const photo=b.photos[key],source=typeof photo==='string'?s.data.assets.find(a=>a.id===photo):photo;
  if(source)assets.push({...source,id:'sandbox-photo',kind:'photo',roster_id:person});
  f.features=f.published.details.days.map((_,i)=>({day:i+1,mode:source?'player':'none',roster_id:source?person:null,asset_id:source?'sandbox-photo':null}));
  return {state:{...s,previewOf:s,design:{...b.design},data:{...s.data,players:copy(f.published.players),fixtures:[f],assets},photoPositions:{[key]:{...b.positions[key]}},urls:new Map([...s.urls,...b.urls])},card:{...card,f}};
 }
 async function paint(s){
  const b=ensure(s),token=++b.paint,target=document.getElementById('sandboxCanvas'),status=document.getElementById('sandboxStatus');if(!target)return;
  const download=document.getElementById('sandboxDownload');if(download){download.disabled=true;download.textContent='Download trial image';}target.dataset.ready='false';
  if(status)status.textContent='Preparing preview…';
  try{
   const p=preview(s),canvas=document.createElement('canvas');await h.renderImage(p.state,p.card,canvas);
   if(!current(s)||token!==b.paint||!target.isConnected)return;
   const ctx=canvas.getContext('2d');ctx.save();ctx.fillStyle='rgba(10,24,47,.9)';ctx.fillRect(0,0,canvas.width,68);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='700 30px Arial';ctx.fillText('TRIAL · DESIGN SANDBOX',canvas.width/2,44);ctx.restore();
   target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);
   target.dataset.ready='true';if(download)download.disabled=b.busy;if(status&&!b.busy)status.textContent='Trial preview';
  }catch(e){if(current(s)&&token===b.paint){target.dataset.ready='false';if(status)status.textContent='Preview could not load. '+e.message;}}
 }
 function release(s){if(!s.sandbox)return;for(const url of s.sandbox.owned)URL.revokeObjectURL(url);s.sandbox=null;}
 async function upload(s,kind,file){
  if(!file)return;const {b,key}=selection(s);if(b.busy)return;b.busy=true;render(s);const status=document.getElementById('sandboxStatus');if(status)status.textContent='Loading trial '+(kind==='background'?'background':'photo')+'…';
  try{
   const blob=await h.normalize(file);if(s.sandbox!==b)return;
   const url=URL.createObjectURL(blob),asset={id:'sandbox-'+kind+'-'+crypto.randomUUID(),kind,path:url,label:file.name};b.owned.add(url);b.urls.set(url,url);
   if(kind==='background'){b.background=asset;b.design.header_layout='integrated';b.design.theme='solid';}else{b.photos[key]=asset;b.positions[key]={x:0,y:0};}
  }catch(e){h.message(s,'Trial image could not load. '+e.message);}finally{b.busy=false;if(current(s)&&s.sandbox===b)render(s);}
 }
 function render(s){
  const {b,team,cards,card,key,photos}=selection(s),esc=h.escape,host=document.getElementById('socialContent'),photo=b.photos[key],position=b.positions[key],hasPhoto=!!photo&&b.design.layout!=='list';
  const select=(key,label,options)=>'<label>'+label+'<select data-sandbox-setting="'+key+'">'+options.map(([v,t])=>'<option value="'+v+'" '+(b.design[key]===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
  const range=(key,label,min,max,disabled=false)=>'<label>'+label+'<input type="range" data-sandbox-setting="'+key+'" min="'+min+'" max="'+max+'" value="'+b.design[key]+'" '+(disabled?'disabled':'')+'></label>';
  host.innerHTML='<style>.sandbox-banner{padding:16px 18px;background:#eef3ff;border:1px solid #aebce3;border-radius:9px;margin-bottom:20px}.sandbox-banner h3{margin:0 0 6px}.sandbox-banner p{margin:5px 0}.sandbox-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,430px);gap:24px}.sandbox-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sandbox-grid label{display:block;font-weight:600;margin-bottom:12px}.sandbox-grid input,.sandbox-grid select{width:100%;box-sizing:border-box}.sandbox-grid input[type=range]{min-height:36px}.sandbox-preview canvas{width:100%;height:auto;border-radius:8px;display:block}.sandbox-preview{margin:0}.sandbox-photos{margin:20px 0;padding:15px;border:1px solid #dce2ee;border-radius:8px}.sandbox-photos h4{margin:0 0 14px}.sandbox-sliders{border-top:1px solid #dce2ee;padding-top:14px}.sandbox-apply{border-top:1px solid #dce2ee;padding-top:16px;margin-top:20px}.sandbox-apply p{font-size:13px;line-height:1.5;color:#52627a}@media(max-width:720px){.sandbox-grid{grid-template-columns:1fr}.sandbox-preview{max-width:430px;margin:auto}}</style>'+
   '<section class="sandbox-banner"><h3>Design sandbox</h3><p>Preview copies only. Trials stay here.</p></section><div class="sandbox-grid"><section>'+
   '<label>Preview team<select id="sandboxTeam">'+b.teams.map(t=>'<option value="'+esc(t.id)+'" '+(b.team===t.id?'selected':'')+'>'+esc(t.label)+'</option>').join('')+'</select></label>'+
   (cards.length>1?'<label>Match day<select id="sandboxDay">'+cards.map(c=>'<option value="'+c.day+'" '+(card.day===c.day?'selected':'')+'>Day '+(c.day+1)+'</option>').join('')+'</select></label>':'')+
   (team.sample?'<p class="se-muted">Sample lineup until a team is published.</p>':'')+
   '<div class="sandbox-photos"><h4>Player photo</h4><label>Saved photo<select id="sandboxPhoto"><option value="">No photo</option>'+photos.map(a=>'<option value="'+esc(a.id)+'" '+(photo===a.id?'selected':'')+'>'+esc((s.data.players.find(p=>p.id===a.roster_id)?.name||team.f.published.players.find(p=>p.id===a.roster_id)?.name||'Player')+' · '+(a.label||'Saved photo'))+'</option>').join('')+(photo&&typeof photo==='object'?'<option value="trial" selected>Trial upload · '+esc(photo.label)+'</option>':'')+'</select></label><label>Upload a trial photo<input type="file" id="sandboxPhotoUpload" accept="image/png,image/jpeg,image/webp"></label><div class="sandbox-fields">'+
   select('layout','Photo layout',[['portrait_left','Photo left'],['portrait','Photo right'],['list','Names only']])+select('frame','Photo treatment',[['cutout','Cutout / photo'],['rectangle','Rectangle'],['circle','Circle']])+'</div><div class="sandbox-sliders">'+range('photo_scale','Size',80,125,!hasPhoto)+
   [['x','Left / right'],['y','Up / down']].map(([axis,label])=>'<label>'+label+'<input type="range" min="-30" max="30" step="1" data-sandbox-position="'+axis+'" value="'+position[axis]+'" '+(!hasPhoto?'disabled':'')+'></label>').join('')+'</div></div><div class="sandbox-fields">'+
   '<label>Main colour<input type="color" data-sandbox-setting="primary" value="'+esc(b.design.primary)+'"></label><label>Highlight colour<input type="color" data-sandbox-setting="accent" value="'+esc(b.design.accent)+'"></label>'+
   select('font','Lettering',[['bold','Sporting'],['clean','Modern'],['classic','Classic']])+select('marker','Player marker',[['arrows','Arrows'],['badge','Number'],['name','Photo label']])+
   select('theme','Background treatment',[['solid','Use as supplied'],['gradient','Stadium glow'],['split','Angled colours']])+select('header_layout','Logo and sponsors',[['integrated','Included in background'],['banner','Separate banner'],['separate','Club logo + sponsors']])+range('header_height','Header height',200,440)+'<label>Footer<input type="text" maxlength="100" data-sandbox-setting="footer" value="'+esc(b.design.footer)+'"></label></div>'+
   '<label>Upload a trial background<input type="file" id="sandboxBackgroundUpload" accept="image/png,image/jpeg,image/webp"></label><button class="btn ghost" id="sandboxReset">Reset sandbox</button><div class="sandbox-apply"><button class="btn" id="sandboxApply">Save layout as club default</button><p>Trial photos, positions and backgrounds stay here.</p></div></section><figure class="sandbox-preview"><canvas id="sandboxCanvas" width="1080" height="1350" aria-label="Team copy for design trials"></canvas><figcaption id="sandboxStatus" role="status" aria-live="polite"></figcaption><button class="btn ghost" id="sandboxDownload" disabled>Download trial image</button></figure></div>';
  const saveButton=document.getElementById('sandboxApply'),saved=()=>JSON.stringify(b.design)===JSON.stringify(h.defaults(s.data)),saveState=()=>{saveButton.disabled=b.busy||s.busy||!!s.pending||saved();saveButton.textContent=b.saving?'Saving…':saved()?'Layout saved':'Save layout as club default';};
  host.querySelectorAll('[data-sandbox-setting]').forEach(input=>input.oninput=()=>{b.design[input.dataset.sandboxSetting]=input.type==='range'?Number(input.value):input.value;saveState();if(input.dataset.sandboxSetting==='layout')render(s);else void paint(s);});
  document.getElementById('sandboxTeam').onchange=e=>{b.team=e.target.value;b.day=0;render(s);};
  document.getElementById('sandboxDay')?.addEventListener('change',e=>{b.day=Number(e.target.value);render(s);});
  document.getElementById('sandboxPhoto').onchange=e=>{if(e.target.value==='trial')return;b.photos[key]=e.target.value;const asset=photos.find(a=>a.id===e.target.value);if(asset&&!team.sample)b.people[key]=asset.roster_id;b.positions[key]={x:0,y:0};render(s);};
  host.querySelectorAll('[data-sandbox-position]').forEach(input=>input.oninput=()=>{b.positions[key][input.dataset.sandboxPosition]=Number(input.value);void paint(s);});
  document.getElementById('sandboxPhotoUpload').onchange=e=>upload(s,'photo',e.target.files[0]);document.getElementById('sandboxBackgroundUpload').onchange=e=>upload(s,'background',e.target.files[0]);
  document.getElementById('sandboxReset').onclick=()=>{if(b.busy||!window.confirm('Reset to the saved club design and discard trial images?'))return;release(s);render(s);h.message(s,'Sandbox reset.');};
  document.getElementById('sandboxApply').onclick=async()=>{if(b.busy||s.busy||s.pending||saved())return;if(!window.confirm('Save this layout for upcoming teams? Trial photos, positions and backgrounds stay here.'))return;b.busy=true;b.saving=true;saveState();host.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);try{await h.applyDesign(s,{...b.design});}catch(e){h.message(s,e.message);}finally{b.busy=false;b.saving=false;if(current(s)&&s.sandbox===b)render(s);}};
  document.getElementById('sandboxDownload').onclick=()=>{const canvas=document.getElementById('sandboxCanvas'),button=document.getElementById('sandboxDownload');if(button.disabled||canvas?.dataset.ready!=='true')return;button.disabled=true;button.textContent='Preparing…';canvas.toBlob(blob=>{if(blob){h.download('Club-design-TRIAL.png',blob);button.textContent='Download started';h.message(s,'Trial image download started.');}else{button.textContent='Retry download';h.message(s,'Could not prepare the trial image. Try again.');}button.disabled=false;},'image/png');};
  saveState();if(b.busy)host.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);void paint(s);
 }
 return {render,preview,release};
}
