// Local design trials. Only the explicit Apply action can save club settings.
export function createSocialSandbox(h){
 const names=['Alex Sample','Jordan Sample','Taylor Sample','Casey Sample','Morgan Sample','Riley Sample','Cameron Sample','Sam Sample','Jamie Sample','Charlie Sample','Robin Sample'];
 const current=s=>h.here(s)&&s.view==='sandbox';
 function ensure(s){
  if(!s.sandbox)s.sandbox={design:{...h.defaults(s.data)},team:0,photos:{},positions:{},background:null,urls:new Map(),owned:new Set(),busy:false,paint:0};
  return s.sandbox;
 }
 function preview(s){
  const b=ensure(s),team=b.team,id='sandbox-team-'+team,people=names.map((name,i)=>({id:'sandbox-'+team+'-player-'+i,name})),person=people[3];
  const assets=s.data.assets.filter(a=>!b.background||a.kind!=='background').map(a=>({...a}));
  if(b.background)assets.push({...b.background});
  const photo=b.photos[team],source=typeof photo==='string'?s.data.assets.find(a=>a.id===photo):photo;
  if(source)assets.push({...source,id:'sandbox-photo',kind:'photo',roster_id:person.id});
  const f={id,publication:1,features:[{day:1,mode:source?'player':'none',roster_id:source?person.id:null,asset_id:source?'sandbox-photo':null}],published:{
   details:{grade:['SAMPLE 1ST XI','SAMPLE 2ND XI','SAMPLE 3RD XI'][team],opposition:'Sample visitors',format:'limited_overs',overs:50,ground:'Example ground',days:[{date:new Date(Date.now()+7*86400000).toISOString().slice(0,10),start:'10:00'}],match_roles:{d1:{captain_id:people[0].id,keeper_id:people[2].id}}},players:people,slots:people.map(p=>({d1:p.id,d2:null}))}};
  return {state:{...s,previewOf:s,design:{...b.design},data:{...s.data,players:people,fixtures:[f],assets},photoPositions:{[id+':0']:{...(b.positions[team]||{x:0,y:0})}},urls:new Map([...s.urls,...b.urls])},card:{f,day:0,split:false,key:id+':0'}};
 }
 async function paint(s){
  const b=ensure(s),token=++b.paint,target=document.getElementById('sandboxCanvas'),status=document.getElementById('sandboxStatus');if(!target)return;
  const download=document.getElementById('sandboxDownload');if(download)download.disabled=true;
  if(status)status.textContent='Preparing your trial image…';
  try{
   const p=preview(s),canvas=document.createElement('canvas');await h.renderImage(p.state,p.card,canvas);
   if(!current(s)||token!==b.paint||!target.isConnected)return;
   const ctx=canvas.getContext('2d');ctx.save();ctx.fillStyle='rgba(10,24,47,.9)';ctx.fillRect(0,0,canvas.width,68);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='700 30px Arial';ctx.fillText('SAMPLE · DESIGN SANDBOX',canvas.width/2,44);ctx.restore();
   target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);
   target.dataset.ready='true';if(download)download.disabled=false;if(status)status.textContent='Sample preview';
  }catch(e){if(current(s)&&token===b.paint){target.dataset.ready='false';if(status)status.textContent='Preview could not load. '+e.message;}}
 }
 function release(s){if(!s.sandbox)return;for(const url of s.sandbox.owned)URL.revokeObjectURL(url);s.sandbox=null;}
 async function upload(s,kind,file){
  if(!file)return;const b=ensure(s);if(b.busy)return;b.busy=true;const team=b.team;
  try{
   const blob=await h.normalize(file);if(s.sandbox!==b)return;
   const url=URL.createObjectURL(blob),asset={id:'sandbox-'+kind+'-'+crypto.randomUUID(),kind,path:url,label:file.name};b.owned.add(url);b.urls.set(url,url);
   if(kind==='background'){b.background=asset;b.design.header_layout='integrated';b.design.theme='solid';}else{b.photos[team]=asset;b.positions[team]={x:0,y:0};}
   if(current(s))render(s);
  }catch(e){h.message(s,'Trial image could not load. '+e.message);}finally{b.busy=false;if(current(s))render(s);}
 }
 function render(s){
  const b=ensure(s),esc=h.escape,host=document.getElementById('socialContent'),photo=b.photos[b.team],position=b.positions[b.team]||{x:0,y:0};
  const select=(key,label,options)=>'<label>'+label+'<select data-sandbox-setting="'+key+'">'+options.map(([v,t])=>'<option value="'+v+'" '+(b.design[key]===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
  const range=(key,label,min,max)=>'<label>'+label+'<input type="range" data-sandbox-setting="'+key+'" min="'+min+'" max="'+max+'" value="'+b.design[key]+'"></label>';
  const photos=s.data.assets.filter(a=>['photo','portrait'].includes(a.kind));
  host.innerHTML='<style>.sandbox-banner{padding:16px 18px;background:#eef3ff;border:1px solid #aebce3;border-radius:9px;margin-bottom:20px}.sandbox-banner h3{margin:0 0 6px}.sandbox-banner p{margin:5px 0}.sandbox-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,430px);gap:24px}.sandbox-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sandbox-fields label,.sandbox-photos label{display:block;font-weight:600;margin-bottom:12px}.sandbox-fields input,.sandbox-fields select,.sandbox-photos select{width:100%;box-sizing:border-box}.sandbox-fields input[type=range]{min-height:36px}.sandbox-preview canvas{width:100%;height:auto;border-radius:8px;display:block}.sandbox-preview{margin:0}.sandbox-photos{margin:20px 0;padding:15px;border:1px solid #dce2ee;border-radius:8px}.sandbox-apply{border-top:1px solid #dce2ee;padding-top:16px;margin-top:20px}.sandbox-apply p{font-size:13px;line-height:1.5;color:#52627a}@media(max-width:720px){.sandbox-grid{grid-template-columns:1fr}.sandbox-preview{max-width:430px;margin:auto}}</style>'+
   '<section class="sandbox-banner"><h3>Design sandbox</h3><p>Try designs with sample teams. Nothing is posted.</p><p class="se-muted">Trials last until you close this page.</p></section><div class="sandbox-grid"><section><div class="sandbox-fields">'+
   select('layout','Photo layout',[['portrait_left','Photo left'],['portrait','Photo right'],['list','Names only']])+select('frame','Photo treatment',[['cutout','Cutout / photo'],['rectangle','Rectangle'],['circle','Circle']])+
   '<label>Main colour<input type="color" data-sandbox-setting="primary" value="'+esc(b.design.primary)+'"></label><label>Highlight colour<input type="color" data-sandbox-setting="accent" value="'+esc(b.design.accent)+'"></label>'+
   select('font','Lettering',[['bold','Sporting'],['clean','Modern'],['classic','Classic']])+select('marker','Player marker',[['arrows','Arrows'],['badge','Number'],['name','Photo label']])+range('photo_scale','Player size',80,125)+range('photo_shift','Player position',-100,100)+
   select('theme','Background treatment',[['solid','Use as supplied'],['gradient','Stadium glow'],['split','Angled colours']])+select('header_layout','Logo and sponsors',[['integrated','Included in background'],['banner','Separate banner'],['separate','Club logo + sponsors']])+range('header_height','Header height',200,440)+'<label>Footer<input type="text" maxlength="100" data-sandbox-setting="footer" value="'+esc(b.design.footer)+'"></label></div>'+
   '<div class="sandbox-photos"><label>Sample team<select id="sandboxTeam">'+['1st XI','2nd XI','3rd XI'].map((label,i)=>'<option value="'+i+'" '+(b.team===i?'selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Try a saved player photo<select id="sandboxPhoto"><option value="">No photo</option>'+photos.map(a=>'<option value="'+esc(a.id)+'" '+(photo===a.id?'selected':'')+'>'+esc((s.data.players.find(p=>p.id===a.roster_id)?.name||'Player')+' · '+(a.label||'Saved photo'))+'</option>').join('')+(photo&&typeof photo==='object'?'<option value="trial" selected>Trial upload · '+esc(photo.label)+'</option>':'')+'</select></label><label>Upload a trial photo<input type="file" id="sandboxPhotoUpload" accept="image/png,image/jpeg,image/webp"></label>'+[['x','Left / right'],['y','Up / down']].map(([axis,label])=>'<label>'+label+'<input type="range" min="-30" max="30" step="1" data-sandbox-position="'+axis+'" value="'+position[axis]+'" '+(!photo?'disabled':'')+'></label>').join('')+'<label>Upload a trial background<input type="file" id="sandboxBackgroundUpload" accept="image/png,image/jpeg,image/webp"></label><p class="se-muted">Trial images stay here.</p></div>'+
   '<button class="btn ghost" id="sandboxReset">Reset to saved club design</button><div class="sandbox-apply"><button class="btn" id="sandboxApply">Use design for upcoming teams</button><p>Saves layout, colours and lettering. Trial images stay here.</p></div></section><figure class="sandbox-preview"><canvas id="sandboxCanvas" width="1080" height="1350" aria-label="Fictional team design sandbox preview"></canvas><figcaption id="sandboxStatus" role="status" aria-live="polite"></figcaption><button class="btn ghost" id="sandboxDownload" disabled>Download trial image</button></figure></div>';
  host.querySelectorAll('[data-sandbox-setting]').forEach(input=>input.oninput=()=>{b.design[input.dataset.sandboxSetting]=input.type==='range'?Number(input.value):input.value;void paint(s);});
  document.getElementById('sandboxTeam').onchange=e=>{b.team=Number(e.target.value);render(s);};
  document.getElementById('sandboxPhoto').onchange=e=>{if(e.target.value==='trial')return;b.photos[b.team]=e.target.value;b.positions[b.team]={x:0,y:0};render(s);};
  host.querySelectorAll('[data-sandbox-position]').forEach(input=>input.oninput=()=>{(b.positions[b.team]||={x:0,y:0})[input.dataset.sandboxPosition]=Number(input.value);void paint(s);});
  document.getElementById('sandboxPhotoUpload').onchange=e=>upload(s,'photo',e.target.files[0]);document.getElementById('sandboxBackgroundUpload').onchange=e=>upload(s,'background',e.target.files[0]);
  document.getElementById('sandboxReset').onclick=()=>{if(b.busy||!window.confirm('Reset this sandbox and discard its trial images?'))return;release(s);render(s);};
  document.getElementById('sandboxApply').onclick=async()=>{if(b.busy||s.busy||s.pending)return;if(!window.confirm('Apply layout, colours and lettering to upcoming teams? Trial images stay here.'))return;await h.applyDesign(s,{...b.design});};
  document.getElementById('sandboxDownload').onclick=()=>{const canvas=document.getElementById('sandboxCanvas');if(canvas?.dataset.ready!=='true')return;canvas.toBlob(blob=>{if(blob)h.download('Club-design-SAMPLE.png',blob);},'image/png');};
  if(b.busy)host.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);void paint(s);
 }
 return {render,preview,release};
}
