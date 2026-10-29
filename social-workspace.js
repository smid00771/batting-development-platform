// Downloaded only when an authorised user opens the socials workspace.
export function createSocialWorkspace(h){
 const {appNavigationBack,club,drawSelections,ensureSelections,matchReviewExtractUrl,mountScorecardTeam,normaliseHex,platformRole,recordSelectionNavigation,renderSocialPlatformSetup,restoreSocialNavigation,seDownload,seEsc,seFormatLabel,seNotice,seOpt,seReload,selectionsScopeKey,session,socialCanLeave,socialEnsure,socialHere,socialOpenFixture,socialState,supabase}=h;
function socialFixtureCompleted(s,f,now=new Date()){
 const dates=(f.published?.details?.days||f.details?.days||[]).map(d=>d.date).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')).sort();
 return f.completed===true||!!dates.length&&dates.at(-1)<now.toLocaleDateString('en-CA',{timeZone:s.data?.timezone||'Australia/Sydney'});
}
function socialCalendarCompleted(s,item){
 const fixture=s.data.fixtures.find(f=>f.id===item.id);if(fixture)return socialFixtureCompleted(s,fixture);
 return item.completed===true||!!(item.last_date||item.date)&&(item.last_date||item.date)<new Date().toLocaleDateString('en-CA',{timeZone:s.data.timezone||'Australia/Sydney'});
}
function socialGuardArtwork(s,action,data){
 const ids=action==='feature'?[data.fixture_id]:action==='add_asset'?[data.feature?.fixture_id]:action==='guide:import'?[data.asset?.feature?.fixture_id]:['validate_export','record_export'].includes(action)?(data.fixtures||[]).map(f=>f.id):[];
 if(!s.data?.fixtures?.some(f=>ids.includes(f.id)&&socialFixtureCompleted(s,f)))return true;
 socialMessage(s,'Completed fixtures are read-only. Open Team-list artwork to preview designs.');return false;
}
async function socialRPC(s,action,data={}){if(!socialGuardArtwork(s,action,data))throw Object.assign(Error('Completed fixtures are read-only. Open Team-list artwork to preview designs.'),{code:'P0159'});if(action==='guide:import')return socialGuideImportSave(s,data);if(action.startsWith('prepare:'))return socialPrepRPC(s,action.slice(8),data);const clubId=s.scope.split(':').slice(1).join(':'),r=await supabase.rpc('club_socials_api',{p_club_id:clubId,p_action:action,p_data:data});if(r.error)throw Object.assign(Error(r.error.message||'Could not load social artwork.'),{code:r.error.code});return r.data;}
function socialDefaults(d){
 return {header_layout:'separate',header_height:310,photo_scale:100,photo_shift:0,layout:'portrait',photo_policy:'choose',primary:normaliseHex(d.brand?.primary,'#073554'),accent:normaliseHex(d.brand?.accent,'#128FD2'),footer:'',theme:'gradient',frame:'cutout',font:'bold',marker:'arrows',brief:'',...(d.design||{})};
}
async function socialRefresh(s){
 const drafts=s.photoPositions||{},previous=new Map((s.data?.fixtures||[]).flatMap(socialCards).map(card=>[card.key,socialPhotoPositionContext(s,card)]));
 const [data,awards,rounds]=await Promise.all([socialRPC(s,'context'),socialAwards.settings(s),supabase.rpc('club_social_award_label_api',{p_club_id:s.scope.split(':').slice(1).join(':'),p_action:'team_rounds',p_data:{}})]);if(rounds.error)throw Error(rounds.error.message);for(const f of data.fixtures||[])f.round=rounds.data?.[f.id]||null;data.awards=awards;if(!socialHere(s))return false;s.data=data;s.design=socialDefaults(data);s.dirty=false;
 const logo=socialAsset(s,'logo');if(logo)data.brand={...data.brand,logo:await socialAssetURL(s,logo)};if(!socialHere(s))return false;
 s.photoPositions=Object.fromEntries(data.fixtures.flatMap(socialCards).filter(card=>!socialFixtureCompleted(s,card.f)&&drafts[card.key]&&previous.get(card.key)===socialPhotoPositionContext(s,card)).map(card=>[card.key,drafts[card.key]]));
 return true;
}
async function socialOpen(){const s=socialEnsure();if(!s.awardScopes?.pending&&!s.awardScopes?.draft)delete s.awardScopes;if(s.results){s.results.context=null;s.results.attempted=false;}for(const key of ['week','playerWeek','awards'])if(s[key]?.context)s[key].sharedStale=true;const host=document.getElementById('seContent');host.innerHTML='<div class="se-card">Loading social graphics…</div>';try{await initialiseSocialFeatures();if(!socialHere(s)||!host.isConnected)return;if(s.deferredNavigation){const route=s.deferredNavigation;delete s.deferredNavigation;restoreSocialNavigation(route);}if(s.startAtArtwork){delete s.startAtArtwork;socialTeamWorkflow.state(s).step='artwork';}if(await socialRefresh(s)){if(s.pendingMilestone){await socialAwards.openMilestone(s,s.pendingMilestone);if(!socialHere(s)||!host.isConnected)return;delete s.pendingMilestone;}if(s.guide){s.guide.context=null;s.guide.available=null;s.guide.error='';}s.styleStatus=null;socialDraw(s);}}catch(e){if(!socialHere(s)||!host.isConnected)return;host.innerHTML=`<section class="se-card"><h2>Social graphics</h2><p>${seEsc(e.message)}</p><button class="btn" id="socialRetry">Try again</button></section>`;document.getElementById('socialRetry').onclick=socialOpen;}}
function socialMessage(s,message){s.notice=message;if(socialHere(s)){const e=document.getElementById('socialNotice');if(e)e.textContent=message;}}
async function socialSave(s,action,data,photoPositionKey=null){
 if(s.busy)return false;const command=s.pending||{action,data:{...data,request_id:crypto.randomUUID()},...(photoPositionKey?{photoPositionKey}:{})};s.pending=command;s.busy=true;const button=s.actionButton;s.actionButton=null;if(button){button.textContent='Saving…';button.setAttribute('aria-busy','true');}socialMessage(s,'Saving…');socialLock(true);
 try{const result=await socialRPC(s,command.action,command.data);if(!socialHere(s))return false;if(result.access_removed){s.pending=null;await seReload();ensureSelections().view='published';ensureSelections().notice=result.message||'Socials access ended. Your other club roles are unchanged.';drawSelections();return true;}if(!await socialRefresh(s))return false;s.pending=null;
 const positionKey=command.action==='feature'?command.photoPositionKey:null;
 if(positionKey){const card=s.data.fixtures.flatMap(socialCards).find(card=>card.key===positionKey);if(card){delete s.photoPositions[positionKey];(s.photoPositionConfirmed||={})[positionKey]=socialPhotoPositionContext(s,card);(s.photoPositionOpen||={})[positionKey]=false;}}
 if(['manager','manager_handover'].includes(command.action)){ensureSelections().data.social_handover_count=s.data.manager_handovers?.length||0;}socialGuideSaved(s,command,result);if(command.action==='guide:import'){const g=socialGuideState(s),note=g.uploadNote;socialGuideResetImage(g);g.uploadNote=note;}if(command.action==='prepare:approve'){const g=socialGuideState(s),note=g.uploadNote;socialGuideResetImage(g);g.uploadNote=note;}if(command.action.startsWith('prepare:'))await socialGuideReload(s);socialMessage(s,positionKey?'Photo adjustments saved ✓':result.message||'Saved');socialGuideRemember(socialGuideState(s));
 if(result.old_path&&result.old_path!==(command.data.path||command.data.asset?.path)){try{await supabase.storage.from('club-socials').remove([result.old_path]);}catch{}}
 return true;
 }catch(e){if(e.code==='P0192'){s.pending=null;try{await socialRefresh(s);}catch{}socialMessage(s,e.message);return false;}if(e.code==='P0159'){s.pending=null;try{await socialRefresh(s);}catch{}for(const card of (s.data?.fixtures||[]).flatMap(socialCards))if(socialFixtureCompleted(s,card.f)&&s.photoPositions)delete s.photoPositions[card.key];socialMessage(s,e.message);socialGuideUploadNote(s,e.message,'error');return false;}if(socialHere(s)){socialMessage(s,'Save not confirmed. Retry uses the same change. '+e.message);socialGuideUploadNote(s,'Save not confirmed. Use Retry save above.','error');}return false;}
 finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
function socialLock(locked){document.querySelectorAll('#socialPage button,#socialPage input,#socialPage select,#socialPage textarea').forEach(e=>{if(locked){e.dataset.socialDisabled=e.disabled?'1':'0';e.disabled=true;}else if(e.dataset.socialDisabled!==undefined){e.disabled=e.dataset.socialDisabled==='1';delete e.dataset.socialDisabled;}});}
function socialStyles(){return `<style>.social-create{margin:18px 0}.social-ready{padding:10px 14px;background:#edf7f0;border:1px solid #cce3d3;border-radius:8px;margin:14px 0;font-size:14px}.social-ready span{display:block;color:#52627a;font-size:13px;margin-top:4px}.social-notice:empty{display:none}.social-managers-list summary{cursor:pointer;font-weight:600}.social-managers-list{margin:18px 0}.social-manager-list{max-height:420px;overflow:auto;padding-right:8px}.sa-menu{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.sa-menu select{font:inherit;padding:9px;max-width:100%}
 .social-guide label{display:block;margin:12px 0}.social-guide input,.social-guide select,.social-guide textarea{box-sizing:border-box;max-width:100%;width:100%}.social-guide input[type=color]{height:42px}.social-guide textarea{font:inherit}.social-tabs [aria-current=step]{background:var(--navy,#17245f);color:white}.social-comparison{display:grid;grid-template-columns:1fr 1fr;gap:15px}.social-comparison img{width:100%;height:auto;object-fit:contain}.social-comparison canvas{width:100%;height:auto}.social-comparison figcaption{font-size:13px;margin:8px 0}.social-comparison figure{margin:0;min-width:0} .social-feature{padding:10px;background:#f4f7fb;border-radius:7px;margin:10px 0}.social-card .social-feature label{display:block;font-size:13px;margin:8px 0}.social-feature select,.social-feature input{display:block;width:100%;box-sizing:border-box;min-width:0;max-width:100%}.social-feature input{font-size:12px}.social-fields textarea{width:100%;box-sizing:border-box;font:inherit}.social-presets{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0 18px}.social-small{font-weight:400!important} .social-top{display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap}.social-top p{margin:6px 0 14px}.sa-menu{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sa-menu select{font:inherit;padding:9px;max-width:100%}.social-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 18px}.social-tabs [aria-pressed=true]{background:var(--navy,#17245f);color:white}.social-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:18px}.social-card{padding:12px;min-width:0;background:white;border:1px solid #dce2ee;border-radius:10px}.social-card canvas{display:block;width:100%;height:auto;background:#073554;border-radius:6px;margin:10px 0}.social-card label{font-weight:700;display:flex;gap:9px;align-items:center}.social-card input[type=checkbox]{width:20px;height:20px;flex-shrink:0}.social-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:16px 0}.social-controls{display:flex;gap:14px;align-items:end;flex-wrap:wrap}.social-controls select{max-width:100%}.social-status{font-size:13px;line-height:1.5;margin:8px 0;color:#52627a}.social-changed{color:#814912;background:#fff3dc;padding:6px 8px;border-radius:5px}.social-editor{max-width:950px}.social-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.social-fields input[type=text],.social-fields select{width:100%}.social-colour{display:flex;align-items:center;gap:8px}.social-colour input[type=color]{height:44px;width:62px;min-width:62px;padding:3px}.social-upload-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;margin-top:18px}.social-upload{padding:14px;border:1px solid #dce2ee;border-radius:9px;background:#f8fafc}.social-upload h3{margin:0 0 5px;font-size:16px}.social-upload p{font-size:13px;color:#52627a}.social-upload img{display:block;max-width:100%;max-height:230px;object-fit:contain;margin:10px auto;background:repeating-conic-gradient(#e3e7ed 0% 25%,white 0% 50%) 50%/18px 18px}.social-upload input{width:100%;font-size:13px}.social-manager{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #e4e8ef}.social-manager input{width:20px;height:20px}.social-preview{max-width:430px;margin:20px auto}.social-preview canvas{width:100%;height:auto;display:block}.social-notice{white-space:pre-wrap;overflow-wrap:anywhere}.social-reference-note{max-width:680px;font-size:14px;color:#52627a}.social-empty{padding:24px 0}.social-captions{width:100%;box-sizing:border-box;min-height:170px;font-family:inherit}.social-download-state:empty,#socialManagerCopyStatus:empty,#prepStyleStatus:empty{display:none}.social-card .btn{width:100%}
 .social-photo-position{margin-top:12px;border-top:1px solid #dce2ee;padding-top:10px}.social-photo-position h4{margin:0 0 6px;font-size:17px}.social-card .social-photo-position label{display:block;font-weight:600}.social-photo-position output{display:block;font-size:12px;font-weight:400;color:#52627a}.social-photo-position input[type=range]{width:100%;min-height:36px;cursor:ew-resize;accent-color:var(--navy,#17245f)}
 @media(min-width:1200px){.social-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.social-fields{grid-template-columns:1fr}.social-actions .btn{flex-grow:1}.social-controls{display:block}.social-controls label{margin:10px 0}.social-top h2{font-size:23px}}
 </style>`;}
function socialTeamReady(s){
 if(!['graphics','managers'].includes(s.view))return '';
 const calendar=socialFixtureCalendar(s).filter(f=>!socialCalendarCompleted(s,f)),dates=[...new Set(calendar.map(f=>f.date))].sort(),date=dates.includes(s.date)?s.date:dates[0],mode=s.teamWorkflow?.teamScope||'date',ready=calendar.filter(f=>f.published&&(mode==='all'||(mode==='teams'?s.selected.has(f.id):f.date===date))),waiting=mode==='date'?calendar.filter(f=>f.date===date&&!f.published):[];
 if(!ready.length)return '';
 return `<aside class="social-ready" role="status"><strong>${ready.length} published team${ready.length===1?'':'s'} ready for posts</strong><span>${mode==='all'?'All upcoming dates':mode==='teams'?'Chosen teams':seEsc(socialDate(date))}${waiting.length?' · '+waiting.length+' awaiting publication':''}</span></aside>`;
}
function socialDraw(s){
 if(!socialHere(s)||!s.data)return;const host=document.getElementById('seContent');
 if(['artwork','photos','sandbox'].includes(s.view)){socialTeamWorkflow.state(s).step=s.view==='photos'?'photos':'artwork';s.view='graphics';}
 const creationViews=['graphics','team_week','player_week','results','five_wickets','century','award_collection'],creating=creationViews.includes(s.view);if(creating)s.creationView=s.view;s.render++;
 const usesResults=['awards','team_week','player_week','results','five_wickets','century','award_collection'].includes(s.view);if(usesResults)socialAdoptResultsWeek(s,s.resultsWeek||socialAwards.state(s).end);
 const active=creating||s.view==='publish_review'||s.view==='guide'?'graphics':s.view==='publish_handover'?'managers':s.view;
 host.innerHTML=socialStyles()+`<section id="socialPage"><div class="social-top"><h2>Social graphics</h2><button class="btn ghost" id="socialRefresh">Refresh</button></div><nav class="social-tabs" aria-label="Social graphics sections">${[['managers','Who handles socials'],['accounts','Social accounts'],['awards','Socials Awards'],['graphics','Create posts']].map(([key,title])=>`<button class="btn ghost" data-social-view="${key}" aria-pressed="${active===key}">${title}</button>`).join('')}</nav>${socialTeamReady(s)}${usesResults?'<div id="socialResults"></div>':''}${creating?`<div class="social-create">${socialAwards.menu(s)}</div>`:''}<p id="socialNotice" class="social-notice" role="status" aria-live="polite">${seEsc(s.notice)}</p>${s.pending?'<div class="se-recovery"><strong>Artwork save not confirmed</strong><p>Your change is retained in this tab. Retry it, or keep a copy and reload the saved version.</p><div class="social-actions"><button class="btn" id="socialRetrySave">Retry save</button><button class="btn ghost" id="socialRecover">Download changes &amp; reload</button></div></div>':''}<div id="socialContent"></div></section>`;
 const page=document.getElementById('socialPage'),rememberAction=e=>{const button=e.submitter||e.target.closest?.('button');if(!button||!page.contains(button)||button.disabled)return;s.actionButton=button;setTimeout(()=>{if(s.actionButton===button)s.actionButton=null;},0);};page.addEventListener('click',rememberAction,true);page.addEventListener('submit',rememberAction,true);
 document.querySelectorAll('[data-social-view]').forEach(b=>b.onclick=async()=>{if(!socialCanLeave())return;recordSelectionNavigation();b.disabled=true;b.textContent='Loading…';b.setAttribute('aria-busy','true');s.view=b.dataset.socialView;if(s.view==='graphics'){s.creationView='graphics';socialTeamWorkflow.state(s).step='artwork';}s.notice='';if(s.view==='awards'){socialAwards.state(s).message='';await socialAwards.load(s,false);}else if(s.view==='award_collection')await socialAwards.load(s,false);socialDraw(s);});
 document.getElementById('socialRefresh').onclick=()=>{if(socialCanLeave())socialOpen();};document.getElementById('socialRetrySave')?.addEventListener('click',()=>socialSave(s,s.pending.action,s.pending.data));
 document.getElementById('socialRecover')?.addEventListener('click',()=>{seDownload('Social-artwork-recovery.json',JSON.stringify(s.pending,null,2),'application/json');s.pending=null;s.dirty=false;s.notice='Proposed changes downloaded. Review the current saved artwork.';void socialOpen();});
 socialAwards.bindMenu(s);if(usesResults)socialResults.mount(s,s.resultsWeek);
 ({awards:socialAwards.render,award_collection:socialAwards.render,results:socialAwards.render,five_wickets:socialAwards.render,century:socialAwards.render,player_week:socialPlayerWeek.render,team_week:socialWeek.render,guide:socialGuide,graphics:socialGraphics,accounts:socialPublishing.accounts,publish_review:socialPublishing.review,social_attention:socialPublishing.attention,publish_handover:socialPublishing.handover,managers:socialManagers}[s.view]||socialGraphics)(s);
 if(s.busy||s.pending){document.querySelectorAll('#socialContent button,#socialContent input,#socialContent select,#socialContent textarea').forEach(e=>e.disabled=true);document.getElementById('socialRetrySave')?.removeAttribute('disabled');}
 if(!s.deferNavigation)recordSelectionNavigation();
}
function socialCards(f){
 const snap=f.published,d=snap.details,roles=d.match_roles||{},choices=f.features||[];
 const signature=day=>{const a=choices.find(x=>x.day===day);return JSON.stringify([a?.mode||'default',a?.roster_id||null,a?.asset_id||null,a?.photo_x||0,a?.photo_y||0,a?.photo_scale??null]);};
 const shared=d.days.length<2||snap.slots.every(slot=>slot.d1===slot.d2)&&['captain_id','keeper_id'].every(k=>roles.d1?.[k]===roles.d2?.[k])&&signature(1)===signature(2);
 return (shared?[0]:d.days.map((_,i)=>i)).map(day=>({f,day,split:!shared,key:f.id+':'+day}));
}
function socialDate(v){return new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));}
function socialTime(v){if(!/^\d{2}:\d{2}$/.test(v||''))return v||'';const [h,m]=v.split(':').map(Number);return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''}${h<12?'am':'pm'}`;}
function socialFixtureDates(card){const ds=card.f.published.details.days;return (card.split?[ds[card.day]]:ds).map((d,i)=>(ds.length>1?'Day '+(card.split?card.day+1:i+1)+' · ':'')+socialDate(d.date)+(d.start?' · '+socialTime(d.start):''));}
function socialSurname(name){
 const text=String(name||'').trim();if(text.includes(','))return text.split(',')[0].trim();
 const words=text.split(/\s+/);while(words.length>1&&/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(words.at(-1)))words.pop();
 return words.at(-1)||'';
}
function socialNames(card){
 const snap=card.f.published,role=snap.details.match_roles?.['d'+(card.day+1)]||{},compare=(a,b)=>a.localeCompare(b,'en-AU',{sensitivity:'base',ignorePunctuation:true,numeric:true});
 return (snap.slots||[]).map(slot=>{const id=slot['d'+(card.day+1)],p=snap.players.find(x=>x.id===id);return {id,name:p?.name||'To be confirmed',marks:(id&&role.captain_id===id?' (C)':'')+(id&&role.keeper_id===id?' (WK)':'')};})
  .sort((a,b)=>Number(!a.id)-Number(!b.id)||compare(socialSurname(a.name),socialSurname(b.name))||compare(a.name,b.name));
}
function socialPhotoId(s,card){return socialFeatured(s,card).id;}
function socialSelection(s){const mode=s.teamWorkflow?.teamScope||'date';return s.data.fixtures.filter(f=>s.selected.has(f.id)&&f.published&&(mode!=='date'||f.published.details.days[0].date===s.date)&&!socialFixtureCompleted(s,f)).sort((a,b)=>a.published.details.days[0].date.localeCompare(b.published.details.days[0].date)||a.published.details.grade.localeCompare(b.published.details.grade,'en',{numeric:true})||a.id.localeCompare(b.id));}
function socialFixtureCalendar(s){
 return s.data.fixture_calendar||s.data.fixtures.map(f=>({id:f.id,date:f.published.details.days[0].date,grade:f.published.details.grade,opposition:f.published.details.opposition,published:true,completed:socialFixtureCompleted(s,f)}));
}
function socialOpenSelectionDate(s){
 if(!socialCanLeave())return;const board=ensureSelections();board.date=s.date;board.boardDateChosen=true;board.view=board.data.selector?'board':'fixtures';drawSelections();
}
async function socialShowHistory(s,fixtures,host){
 const token=s.historyRender=(s.historyRender||0)+1,current=()=>socialHere(s)&&s.view==='graphics'&&host.isConnected&&s.historyRender===token;
 host.dataset.loaded='';host.innerHTML='<p role="status">Loading saved images…</p>';
 try{
  const result=await socialRPC(s,'history',{fixtures:fixtures.map(f=>({id:f.id}))});if(!current())return;
  const images=(result.posts||[]).flatMap(post=>(post.images||[]).map(img=>({...img,post})));
  host.dataset.loaded='true';
  if(!images.length){host.innerHTML='<p>No saved social images for this date.</p>';return;}
  host.innerHTML=images.map(img=>`<article class="social-card"><h3>${seEsc(img.label)}</h3><p class="social-status">${img.post.state==='draft'?'Saved draft · not posted':img.post.posted?'Posted':'Saved post · not posted'} · ${seEsc(new Date(img.post.created_at).toLocaleDateString('en-AU',{timeZone:s.data.timezone||'Australia/Sydney'}))}</p><img data-social-saved-image="${seEsc(img.path)}" alt="Saved ${seEsc(img.label)} social image" style="display:block;width:100%;height:auto;border-radius:8px"><p class="social-status" data-social-saved-status role="status">Loading image…</p><details><summary>Saved caption</summary><p style="white-space:pre-wrap">${seEsc(img.post.caption||'')}</p></details></article>`).join('');
  await Promise.all([...host.querySelectorAll('[data-social-saved-image]')].map(async img=>{
   const path=img.dataset.socialSavedImage,key='saved-post:'+path,status=img.nextElementSibling;
   try{
    let url=s.urls.get(key);
    if(!url){const response=await supabase.storage.from('club-social-posts').download(path);if(response.error||!response.data)throw Error('Saved image could not load.');if(!current())return;url=URL.createObjectURL(response.data);s.urls.set(key,url);}
    if(!current())return;img.onload=()=>{if(current())status.textContent='Original saved image · read only';};img.onerror=()=>{if(current()){status.textContent='Saved image could not load.';img.hidden=true;}};img.src=url;
   }catch(error){if(current()){img.hidden=true;status.textContent=error.message;}}
  }));
 }catch(error){if(current()){host.innerHTML='<p role="alert">'+seEsc(error.message)+'</p><button class="btn ghost" data-social-history-retry>Retry loading images</button>';host.querySelector('[data-social-history-retry]')?.addEventListener('click',()=>socialShowHistory(s,fixtures,host));}}
}
function socialGraphics(s){socialTeamWorkflow.render(s);}
function socialBindTeamPhotos(s,fixtures){
 const cardFor=key=>fixtures.flatMap(socialCards).find(c=>c.key===key);
 document.querySelectorAll('[data-social-person]').forEach(e=>e.onchange=()=>{const card=cardFor(e.dataset.socialPerson),value=e.value,mode=['default','none'].includes(value)?value:'player';void socialSave(s,'feature',socialFeatureRequest(card,mode,mode==='player'?value:null,mode==='player'?(socialPlayerPhotos(s,value)[0]?.id||null):null));});
 document.querySelectorAll('[data-social-photo]').forEach(e=>e.onchange=()=>{const card=cardFor(e.dataset.socialPhoto),person=socialFeatured(s,card).id;void socialSave(s,'feature',socialFeatureRequest(card,'player',person,e.value||null));});
 document.querySelectorAll('[data-social-guide-player]').forEach(b=>b.onclick=()=>socialGuideEnter(s,2,b.dataset.socialGuidePlayer,b.dataset.socialGuideCard));
 document.querySelectorAll('[data-social-team-photo]').forEach(e=>e.onchange=()=>{const card=cardFor(e.dataset.socialTeamPhoto);if(card&&e.files[0])void socialUploadTeamPhoto(s,card,e.files[0]);});
 socialBindPhotoPosition(s,cardFor);
}
async function socialUploadTeamPhoto(s,card,file){
 if(s.busy||s.pending||!socialGuardArtwork(s,'feature',{fixture_id:card.f.id}))return;
 const featured=socialFeatured(s,card);if(!featured.person)return;
 s.busy=true;socialLock(true);socialMessage(s,'Saving player photo…');
 try{const blob=await socialNormaliseUpload(file);if(!socialHere(s))return;const path=s.scope.split(':').slice(1).join(':')+'/photo/'+crypto.randomUUID()+'.png',result=await supabase.storage.from('club-socials').upload(path,blob,{contentType:'image/png',upsert:false});if(result.error)throw Error(result.error.message);if(!socialHere(s))return;s.busy=false;await socialSave(s,'add_asset',{kind:'photo',roster_id:featured.id,path,label:file.name.slice(0,120),feature:socialFeatureRequest(card,'player',featured.id)});
 }catch(e){socialMessage(s,e.message);}finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
function socialAsset(s,kind,roster=null){return s.data.assets.find(a=>a.kind===kind&&(kind!=='portrait'||a.roster_id===roster));}
async function socialAssetURL(s,asset){if(!asset)return null;if(s.urls.has(asset.path))return s.urls.get(asset.path);const r=await supabase.storage.from('club-socials').download(asset.path);if(r.error||!r.data)throw Error('An artwork image could not load. Refresh and try again.');if((s!==socialState&&s.previewOf!==socialState)||s.scope!==selectionsScopeKey())throw Error('Club changed');const url=URL.createObjectURL(r.data);s.urls.set(asset.path,url);return url;}
async function socialImage(s,url){
 if(!url)return null;if(s.images.has(url))return s.images.get(url);
 const img=await new Promise((resolve,reject)=>{const image=new Image(),timer=setTimeout(()=>{image.onload=image.onerror=null;reject(Error('The image took too long to load. Try preview again.'));},15000);image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(Error('This image could not load. Choose it again or retry the preview.'));};image.src=url;});s.images.set(url,img);return img;
}
async function socialAssetImage(s,kind,roster=null){return socialImage(s,await socialAssetURL(s,socialAsset(s,kind,roster)));}
function socialFitImage(ctx,img,x,y,w,h,cover=false){if(!img)return;const r=(cover?Math.max:Math.min)(w/img.width,h/img.height),iw=img.width*r,ih=img.height*r;ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);ctx.restore();}
function socialText(ctx,text,x,y,width,size,weight='700',min=18){text=String(text??'');let fs=size;do{ctx.font=`${weight} ${fs}px ${ctx.socialFont||'Arial,sans-serif'}`;if(ctx.measureText(text).width<=width)break;fs--;}while(fs>min);ctx.fillText(text,x,y,width);return fs;}
function socialWrap(ctx,text,width,size,max=3){ctx.font=`600 ${size}px ${ctx.socialFont||'Arial,sans-serif'}`;const words=String(text||'').split(/\s+/),lines=[];let line='';for(const word of words){const test=line?line+' '+word:word;if(line&&ctx.measureText(test).width>width){lines.push(line);line=word;}else line=test;}if(line)lines.push(line);if(lines.length>max&&size>16)return socialWrap(ctx,text,width,size-2,max+1);return {lines,size};}
async function socialRender(s,card,canvas){
 const d=card.f.published.details,design={...s.design},featured=socialFeatured(s,card),showPortrait=design.layout!=='list',left=design.layout==='portrait_left';
 const logoURL=/^data:image\/(png|jpeg|webp);base64,/.test(s.data.brand.logo||'')?s.data.brand.logo:null;
 const warnings=[],integratedLayout=!!socialAsset(s,'background')&&design.header_layout==='integrated';
 const load=async(asset,label)=>{try{return await socialImage(s,await socialAssetURL(s,asset));}catch(e){if(!s.previewOf||asset?.id===s.requiredPreviewAsset)throw e;warnings.push(label+' unavailable');return null;}};
 const [bg,sponsors,portrait,logo,fontLoaded]=await Promise.all([load(socialAsset(s,'background'),'Saved background'),integratedLayout?null:load(socialAsset(s,'sponsors'),'Saved banner'),showPortrait?load(featured.asset,'Player photo'):null,integratedLayout?null:(socialAsset(s,'logo')?load(socialAsset(s,'logo'),'Team-list logo'):socialImage(s,logoURL)).catch(()=>{warnings.push('Club logo unavailable');return null;}),design.font==='bold'?socialFontReady():true]);
 if(!fontLoaded)warnings.push('Standard lettering');
 const ctx=canvas.getContext('2d');canvas.width=1080;canvas.height=1350;canvas.graphicLabelWarnings=[];ctx.socialFont=design.font==='classic'?'Georgia,serif':design.font==='clean'?'Arial,sans-serif':fontLoaded?'"Club Sporting",sans-serif':'Arial,sans-serif';
 const ink=socialInk(design.primary),integrated=!!bg&&design.header_layout==='integrated',combined=!!sponsors&&design.header_layout==='banner',headerH=integrated?Math.max(200,Math.min(440,Number(design.header_height)||310)):combined?Math.min(380,1080*sponsors.height/sponsors.width):249;
 ctx.fillStyle=design.primary;ctx.fillRect(0,0,1080,1350);
 if(bg){if(integrated)ctx.drawImage(bg,0,0,1080,1350);else socialFitImage(ctx,bg,0,0,1080,1350,true);}
 if(!integrated&&design.theme==='gradient'){const glow=ctx.createRadialGradient(590,730,15,480,660,940);glow.addColorStop(0,design.accent+(bg?'70':'C0'));glow.addColorStop(1,design.primary+'E6');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,1350);}
 else if(!integrated&&design.theme==='split'){ctx.fillStyle=design.accent+(bg?'85':'CC');ctx.beginPath();ctx.moveTo(680,0);ctx.lineTo(1080,0);ctx.lineTo(1080,1350);ctx.lineTo(350,1350);ctx.fill();}
 // A complete background contains its own header: no strip, tint or seam is painted over it.
 if(combined)socialFitImage(ctx,sponsors,0,0,1080,headerH);
 else if(!integrated){if(logo)socialFitImage(ctx,logo,45,28,185,200);else{ctx.fillStyle=ink;socialText(ctx,s.data.brand.name.toUpperCase(),50,105,sponsors?230:975,sponsors?27:44,'700');}if(sponsors)socialFitImage(ctx,sponsors,265,24,765,225);else if(logo){ctx.fillStyle=ink;const t=socialWrap(ctx,s.data.brand.name.toUpperCase(),730,38,2);t.lines.forEach((l,i)=>socialText(ctx,l,282,100+i*(t.size+10),730,t.size));}}
 const bounds=portrait?socialPhotoBounds(portrait):null,largeCutout=!!bounds?.transparent&&design.frame==='cutout',listX=showPortrait&&left?581:64,listWidth=showPortrait?(left?435:510):952,detailsX=showPortrait&&left?listX:64,detailsWidth=largeCutout?listWidth:1080-detailsX-64;
 const metaY=headerH+29,titleY=headerH+170,footer=String(design.footer||'').trim(),bottom=footer?1275:1315;
 const position=socialPhotoPosition(s,card),scale=position.scale/100;
 let photoX=left?20:590,photoY=headerH+266,photoW=470,photoH=(footer?1300:1350)-photoY;
 if(largeCutout){const shift=Math.max(-100,Math.min(100,Number(design.photo_shift)||0)),end=footer?1300:1350;
  photoH=(end-(headerH+95))*scale;photoW=photoH*bounds.w/bounds.h;photoY=end-photoH;photoX=(left?1080-1160:1160-photoW)+shift;
 }else{photoX-=photoW*(scale-1)/2;photoY-=photoH*(scale-1);photoW*=scale;photoH*=scale;}
 photoX+=1080*position.x/100;photoY+=1350*position.y/100;
 if(showPortrait&&portrait){
  ctx.save();if(largeCutout){
   // Height controls the player's presence. Natural overflow crops at the poster edge, like a club-designed post.
   ctx.drawImage(portrait,bounds.x,bounds.y,bounds.w,bounds.h,photoX,photoY,photoW,photoH);
  }else if(design.frame==='circle'){ctx.beginPath();ctx.ellipse(photoX+photoW/2,photoY+photoH/2,photoW/2,photoW/2,0,0,Math.PI*2);ctx.clip();socialFitImage(ctx,portrait,photoX,photoY+(photoH-photoW)/2,photoW,photoW,true);}
  else socialFitImage(ctx,portrait,photoX,photoY,photoW,photoH,design.frame==='rectangle');ctx.restore();
 }
 ctx.fillStyle=ink;const headingX=showPortrait&&left?listX:64,headingWidth=largeCutout?690:952,textLines=[],matchText=teamSelectionText(card);
 checkGraphicLabel(canvas,ctx,{source:matchText.match,label:matchText.match,width:952,size:32});textLines.push([matchText.match,64,metaY,952,32,'700']);
 const gradeLabel=graphicGrade(d.grade,design).toUpperCase()+(card.split?' · DAY '+(card.day+1):''),gradeWidth=showPortrait&&left?435:headingWidth,gradeSize=design.font==='bold'?144:94;checkGraphicLabel(canvas,ctx,{source:d.grade,label:gradeLabel,shortLabel:graphicGrade(d.grade,design),width:gradeWidth,size:gradeSize,grade:true});textLines.push([gradeLabel,headingX-4,titleY,gradeWidth,gradeSize,'700',35]);
 let y=titleY+48;
 for(const text of matchText.lines){const wrapped=socialWrap(ctx,text,detailsWidth,32,2);for(const line of wrapped.lines){textLines.push([line,detailsX,y,detailsWidth,wrapped.size,'700']);y+=wrapped.size+4;}}
 const names=socialNames(card),baseY=Math.max(headerH+330,y+32),line=Math.min(62,(bottom-baseY)/Math.max(names.length-1,1)),font=Math.min(design.font==='bold'?58:42,line*.94),boxes=d.cancelled?[]:names.map((p,i)=>({x:listX,y:baseY+i*line-font,w:listWidth,h:font+3})),protection=socialNameProtection(ctx,boxes,ink);
 if(!integrated)socialDrawNameProtection(ctx,{x:listX-12,y:baseY-font-10,w:listWidth+24,h:(names.length-1)*line+font+24},protection);ctx.fillStyle=ink;textLines.forEach(args=>socialText(ctx,...args));
 if(d.cancelled){socialText(ctx,'MATCH',52,baseY+100,960,76,'700');socialText(ctx,'CANCELLED',52,baseY+190,960,76,'700');}
 else{ctx.save();if(integrated&&protection.alpha){ctx.shadowColor=protection.shade===0?'#000000CC':'#FFFFFFCC';ctx.shadowBlur=4;ctx.shadowOffsetY=1.5;}names.forEach((p,i)=>{const row=baseY+i*line,marked=!!portrait&&p.id===featured.id,name=(p.name+p.marks).toUpperCase();socialText(ctx,name,listX,row,listWidth,font,'700',18);if(marked){const end=listX+Math.min(listWidth,ctx.measureText(name).width);socialMarker(ctx,design.marker,left?listX-28:end+37,row-font*.30,design.marker==='arrows'?ink:design.accent,ink,left);}});ctx.restore();}
 if(portrait&&!d.cancelled&&design.marker==='badge')socialMarker(ctx,'badge',left?55:1025,photoY+40,design.accent,ink);
 if(footer){checkGraphicLabel(canvas,ctx,{source:footer,label:footer,width:975,size:21});ctx.fillStyle=design.primary;ctx.fillRect(0,1300,1080,50);ctx.fillStyle=ink;socialText(ctx,footer,52,1331,975,21,'500');}
 Object.assign(canvas.dataset,{featuredPlayer:portrait?featured.id||'':'',photoMarker:portrait?design.marker:'',headerLayout:integrated?'integrated':combined?'banner':'separate',headerHeight:String(headerH),nameProtection:protection.alpha?(integrated?'text-shadow':'automatic'):'none',nameProtectionAlpha:protection.alpha.toFixed(2),largeCutout:String(largeCutout),photoLeft:photoX.toFixed(1),photoTop:photoY.toFixed(1),photoShiftX:String(position.x),photoShiftY:String(position.y),photoHeight:photoH.toFixed(1),photoWidth:photoW.toFixed(1),typeface:design.font==='bold'?(fontLoaded?'Club Sporting':'Arial'):design.font});
 return {warnings,missingPhoto:showPortrait&&!portrait,photoExpected:!!featured.asset,invalid:featured.invalid};
}
async function socialPaintAll(s,fs){
 const render=s.render;for(const f of fs){let missing=false,invalid=false;try{for(const card of socialCards(f)){const canvas=document.querySelector(`[data-social-canvas="${CSS.escape(card.key)}"]`);if(!canvas||!socialHere(s)||s.render!==render)return;const result=await socialRender(s,card,canvas);missing||=result.missingPhoto;invalid||=result.invalid;}if(!socialHere(s)||s.render!==render)return;const label=document.querySelector(`[data-social-image-status="${CSS.escape(f.id)}"]`);if(label)label.textContent=invalid?'The featured player is no longer selected. Choose another player.':missing?'No player photo chosen.':'';}catch(e){if(socialHere(s)&&s.render===render){const label=document.querySelector(`[data-social-image-status="${CSS.escape(f.id)}"]`);if(label)label.textContent=e.message;}}}
}
function socialCaption(s,f){const d=f.published.details;return [s.data.brand.name+' — '+d.grade,d.cancelled?'MATCH CANCELLED':'Teams published',d.competition,'v '+d.opposition,seFormatLabel(d),...d.days.map((day,i)=>(d.days.length>1?'Day '+(i+1)+': ':'')+socialDate(day.date)+(day.start?' · '+socialTime(day.start):'')),d.ground,...(d.cancelled?[]:socialCards(f).flatMap(card=>[...(card.split?['','Day '+(card.day+1)+' team']:[]),...socialNames(card).map((p,i)=>(i+1)+'. '+p.name+p.marks)])),s.design.footer].filter(Boolean).join('\n');}
function socialUploadCard(s,kind,title,description,roster=null,preview={}){
 const a=socialAsset(s,kind,roster)||preview.asset,src=/^data:image\/(png|jpeg|webp);base64,/.test(preview.src||'')?preview.src:'',saved=!!(a||src);
 return `<section class="social-upload"><h3>${title}</h3><p>${description}</p>${saved?`<img ${a?`data-social-asset="${seEsc(a.id)}"`:`src="${seEsc(src)}"`} alt="${title}"><p class="social-status">Image saved</p>`:''}<label>${saved?'Replace image':'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp" data-social-upload="${kind}" ${roster?'data-roster="'+seEsc(roster)+'"':''}></label>${a?`<button class="btn ghost" data-social-remove="${seEsc(a.id)}" style="margin-top:10px">Remove image</button>`:''}${preview.content||''}</section>`;
}
function socialArtwork(s){socialGuideEnter(s,1);}
function socialPhotos(s){socialGuideEnter(s,2,s.player||'');}
function socialManagers(s){
 const members=s.data.members||[],managers=members.filter(m=>m.manager&&!m.admin),me=session.user.id,canManage=s.data.can_manage_managers??s.data.admin,handovers=s.data.manager_handovers||[],mine=managers.some(m=>m.user_id===me),requested=handovers.some(h=>h.user_id===me);
 const stamp=value=>new Intl.DateTimeFormat('en-AU',{timeZone:s.data.timezone||'Australia/Sydney',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 const pending=handovers.map(h=>{
  const posts=s.data.manager_posts?.[h.user_id]||[],blocking=posts.some(p=>p.blocks_hand_back),last=managers.length===1&&managers[0].user_id===h.user_id;
  return `<section class="notice"><h4>Handover requested · ${seEsc(h.name)}</h4><p class="se-muted">${seEsc(stamp(h.requested_at))} · club time</p><p>${seEsc(h.name)} remains a Socials Manager until this handover is completed.</p>${posts.length?`<p>Review these posts before completing the handover. Take responsibility for each scheduled post, or cancel its schedule.</p>${posts.map(p=>`<p><button class="btn ghost" data-social-handover-post="${seEsc(p.id)}">Review ${seEsc(p.images?.map(i=>i.label).join(', ')||'scheduled post')}</button></p>`).join('')}`:''}${last?`<p>Add another manager below${s.data.admin?', or take responsibility as Club Admin':''}.</p>`:''}<div class="social-actions">${h.user_id===me?'<button class="btn ghost" id="socialCancelHandover">Cancel my request</button>':''}${canManage&&(!last||s.data.admin)?`<button class="btn secondary" data-social-complete-handover="${seEsc(h.user_id)}" data-take-responsibility="${last?'1':'0'}" ${blocking?'disabled':''}>${last?'Take responsibility as Club Admin':'Complete handover'}</button>`:''}</div></section>`;
 }).join('');
 document.getElementById('socialContent').innerHTML=`<section class="se-card social-editor"><h3>Who handles socials?</h3>${canManage?`<p><strong>${managers.length?'Appointed Socials Managers: '+managers.map(m=>seEsc(m.name)).join(', '):'Club Admin handles socials'}</strong></p><p class="se-muted">Managers handle graphics, accounts and posts, and can add other managers. Club Admin also has access.</p>${pending}${mine&&!requested?`<button class="btn ghost" id="socialRequestHandover">Request handover${managers.length===1?' · last manager':''}</button>${managers.length===1?'<p class="se-muted">You stay appointed until a replacement is added or Club Admin takes responsibility.</p>':''}`:''}<details class="social-managers-list" ${s.managerListOpen?'open':''}><summary>Choose Socials Managers</summary><div class="social-manager-list">${members.map(m=>`<label class="social-manager"><input type="checkbox" data-social-manager="${seEsc(m.user_id)}" ${m.manager||m.admin?'checked':''} ${m.admin||m.manager&&managers.length===1?'disabled':''}><span>${seEsc(m.name)}${m.admin?' · Club Admin':m.manager&&managers.length===1?' · last manager — handover required':''}</span></label>`).join('')}</div><p class="se-muted">Saves automatically and notifies new managers.${s.data.admin?' Add missing members through People &amp; sign-up.':' Ask Club Admin to add any missing members.'}</p><button class="btn ghost" id="socialManagerCopy">Copy setup message</button><p id="socialManagerCopyStatus" role="status"></p><textarea id="socialManagerMessage" hidden readonly rows="5"></textarea></details>`:'<p>You are covering socials temporarily. A permanent Socials Manager or Club Admin can appoint permanent managers.</p>'}</section><div id="socialResponsibilityCover" class="social-editor"></div>`;
 document.querySelector('.social-managers-list')?.addEventListener('toggle',e=>s.managerListOpen=e.target.open);
 document.querySelectorAll('[data-social-manager]:not(:disabled)').forEach(e=>e.onchange=()=>socialSave(s,'manager',{user_id:e.dataset.socialManager,enabled:e.checked}));
 document.getElementById('socialRequestHandover')?.addEventListener('click',()=>socialSave(s,'manager_handover',{operation:'request',user_id:me}));
 document.getElementById('socialCancelHandover')?.addEventListener('click',()=>socialSave(s,'manager_handover',{operation:'cancel',user_id:me}));
 document.querySelectorAll('[data-social-complete-handover]').forEach(b=>b.onclick=()=>socialSave(s,'manager',{user_id:b.dataset.socialCompleteHandover,enabled:false,take_responsibility:b.dataset.takeResponsibility==='1'}));
 document.querySelectorAll('[data-social-handover-post]').forEach(b=>b.onclick=()=>socialPublishing.managerPost(s,b.dataset.socialHandoverPost));
 document.getElementById('socialManagerCopy')?.addEventListener('click',async event=>{const button=event.currentTarget;if(button.disabled)return;button.disabled=true;button.textContent='Copying…';const status=document.getElementById('socialManagerCopyStatus'),area=document.getElementById('socialManagerMessage');const url=new URL('./app.html',location.href);url.searchParams.set('club',s.scope.split(':').slice(1).join(':'));url.searchParams.set('tab','teams');url.searchParams.set('social_accounts','1');const message=`Please set up ${s.data.brand.name}’s social accounts in Teams. Connect the club Facebook Page and Instagram account in Social accounts. Create team-list posts through Create posts. Add managers or arrange a handover in Who handles socials.\n\n${url.href}`;try{await navigator.clipboard.writeText(message);if(button.isConnected){button.textContent='Copied';status.textContent='Setup message copied.';}}catch{if(button.isConnected){button.textContent='Copy setup message';area.hidden=false;area.value=message;status.textContent='Select and copy the message below.';area.focus();area.select();}}});
 socialPublishing.responsibility(s,document.getElementById('socialResponsibilityCover'));
}
async function socialNormaliseUpload(file){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Choose a PNG, JPG or WebP image up to 20 MB.');const url=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('This image could not be read.'));i.src=url;});if(img.width*img.height>65000000)throw Error('Choose a smaller image.');let limit=1400;while(limit>=450){const c=document.createElement('canvas'),scale=Math.min(1,limit/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(blob&&blob.size<=2097152)return blob;limit=Math.floor(limit*.78);}throw Error('This image is too detailed. Try a smaller copy.');}finally{URL.revokeObjectURL(url);}}
function socialBindUploads(s){document.querySelectorAll('[data-social-download-image]').forEach(b=>b.onclick=()=>socialDownloadImage(s,b.dataset.socialDownloadImage));
 document.querySelectorAll('[data-social-asset]').forEach(async e=>{const render=s.render;try{const a=s.data.assets.find(a=>a.id===e.dataset.socialAsset),url=await socialAssetURL(s,a);if(socialHere(s)&&s.render===render)e.src=url;}catch(error){socialMessage(s,error.message);}});
 document.querySelectorAll('[data-social-upload]').forEach(input=>input.onchange=async()=>{if(s.busy||s.pending||!input.files[0])return;if(s.dirty){socialMessage(s,'Save the template settings before uploading an image.');input.value='';return;}s.busy=true;socialLock(true);socialMessage(s,'Preparing image…');let path;
 try{const blob=await socialNormaliseUpload(input.files[0]);if(!socialHere(s))return;const kind=input.dataset.socialUpload,roster=input.dataset.roster||null,old=socialAsset(s,kind,roster);path=club.id+'/'+kind+'/'+crypto.randomUUID()+'.png';const result=await supabase.storage.from('club-socials').upload(path,blob,{contentType:'image/png',upsert:false});if(result.error)throw Error(result.error.message);if(!socialHere(s))return;s.busy=false;await socialSave(s,'save_asset',{kind,roster_id:roster,revision:old?.revision||0,asset_id:old?.id||null,path});
 }catch(error){socialMessage(s,error.message);s.busy=false;socialLock(false);}finally{s.busy=false;if(socialHere(s)&&!s.pending)socialDraw(s);}});
 document.querySelectorAll('[data-social-remove]').forEach(b=>b.onclick=()=>{const a=s.data.assets.find(a=>a.id===b.dataset.socialRemove);if(s.dirty){socialMessage(s,'Save the template settings before removing an image.');return;}if(a&&confirm('Remove this saved image? Any announcements using it will need another photo.'))void socialSave(s,['photo','reference_extra'].includes(a.kind)?'remove_gallery_asset':'remove_asset',{kind:a.kind,roster_id:a.roster_id,revision:a.revision,asset_id:a.id});});
}
function socialSlug(v){return String(v).normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,75)||'Team';}
function socialBlobDownload(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function socialCRC(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
async function socialZip(files){const parts=[],central=[],encoder=new TextEncoder();let offset=0,size=0;for(const file of files){const name=encoder.encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer()),crc=socialCRC(data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);parts.push(h,data);const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);c.set(name,46);central.push(c);size+=c.length;offset+=h.length+data.length;}const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,size,true);ev.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});}
async function socialDownload(s,fixtures,pack){
 if(fixtures.flatMap(socialCards).some(card=>s.photoPositions?.[card.key])){socialMessage(s,'Confirm the photo position before downloading.');return;}
 if(s.busy||s.pending||!fixtures.length)return;if(fixtures.some(f=>f.feature_valid===false)){socialMessage(s,'A featured player is no longer in the published team. Choose another player before downloading.');return;}if(fixtures.length>32){socialMessage(s,'Choose up to 32 fixtures at a time.');return;}s.busy=true;socialLock(true);socialMessage(s,'Preparing graphics…');const checks=fixtures.map(f=>({id:f.id,artwork_key:f.artwork_key}));
 try{const files=[];for(const f of fixtures){for(const card of socialCards(f)){if(!socialHere(s))return;const canvas=document.createElement('canvas');await socialRender(s,card,canvas);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not create the image. Try again.');files.push({name:socialSlug(f.published.details.grade)+'-'+f.published.details.days[0].date+'-'+f.id.slice(0,8)+(card.split?'-Day-'+(card.day+1):'')+'.png',blob});}}
 const caption=fixtures.map(f=>socialCaption(s,f)).join('\n\n———\n\n');let output;
 if(pack||files.length>1){files.push({name:'Captions.txt',blob:new Blob([caption],{type:'text/plain;charset=utf-8'})});output={name:socialSlug(s.data.brand.name)+'-Teams-'+s.date+'.zip',blob:await socialZip(files)};}else output=files[0];
 await socialRPC(s,'validate_export',{fixtures:checks});if(!socialHere(s))return;socialBlobDownload(output.name,output.blob);socialMessage(s,'Download ready. Check the images and captions before posting.');
 try{await socialRPC(s,'record_export',{fixtures:checks,request_id:crypto.randomUUID()});if(socialHere(s)){for(const f of fixtures)f.last_export={artwork_key:f.artwork_key,at:new Date().toISOString()};}}catch(e){socialMessage(s,'Downloaded, but the download record could not be saved. '+e.message);}
 }catch(e){if(socialHere(s))socialMessage(s,e.message);}finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
function socialPlayerPhotos(s,id){return s.data.assets.filter(a=>['portrait','photo'].includes(a.kind)&&a.roster_id===id).sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||'')||a.id.localeCompare(b.id));}
function socialFeatured(s,card){
 const choice=(card.f.features||[]).find(x=>x.day===card.day+1),names=socialNames(card);let id=null,asset=null;
 if(choice?.mode==='player'){id=choice.roster_id;asset=s.data.assets.find(a=>a.id===choice.asset_id&&a.roster_id===id&&['portrait','photo'].includes(a.kind))||null;}
 else if(!choice||choice.mode==='default'){
  id=s.design.photo_policy==='match'?card.f.published.details.match_roles?.['d'+(card.day+1)]?.captain_id:s.design.photo_policy==='season'?card.f.season_portrait_id:null;
  asset=socialPlayerPhotos(s,id)[0]||null;
 }
 const person=names.find(p=>p.id&&p.id===id)||null;
 return {choice,id:person?.id||null,person,asset:person?asset:null,invalid:choice?.mode==='player'&&!person};
}
function socialOversNotice(s,f){
 const d=f.published.details,r=(s.data.grade_defaults||[]).find(r=>r.format===d.format&&(d.grade_group_id?r.grade_group_id===d.grade_group_id||!r.grade_group_id&&r.grade?.toLowerCase()===d.grade?.toLowerCase():r.grade?.toLowerCase()===d.grade?.toLowerCase()));
 if(!r||String(r.overs??'')===String(d.overs??''))return '';
 return `<p class="social-status social-changed">This published fixture uses ${seEsc(d.overs==null?'no fixed overs limit':d.overs+' overs')}; the grade default is ${seEsc(r.overs==null?'no fixed limit':r.overs+' overs')}. ${d.overs_source==='fixture'?'A fixture override is set.':'Check the fixture details if this difference is unintended.'}</p>`;
}
function socialFeatureRequest(card,mode,person=null,asset=null,position=null){
 const days=card.split?[card.day+1]:card.f.published.details.days.map((_,i)=>i+1),revisions={};
 for(const day of days)revisions['d'+day]=(card.f.features||[]).find(a=>a.day===day)?.revision||0;
 return {fixture_id:card.f.id,publication:card.f.publication,days,revisions,mode,roster_id:person,asset_id:asset,photo_x:socialPhotoOffset(position?.x),photo_y:socialPhotoOffset(position?.y),...(position?.scale!=null?{photo_scale:socialPhotoScale(position.scale)}:{})};
}
function socialPhotoOffset(value){const number=Number(value);return Number.isFinite(number)?Math.max(-30,Math.min(30,Math.round(number))):0;}
function socialPhotoScale(value){const number=Number(value??100);return Number.isFinite(number)?Math.max(50,Math.min(150,Math.round(number))):100;}
function socialPhotoPosition(s,card){
 const choice=(card.f.features||[]).find(x=>x.day===card.day+1),draft=s.photoPositions?.[card.key];
 return {x:socialPhotoOffset(draft?.x??choice?.photo_x),y:socialPhotoOffset(draft?.y??choice?.photo_y),scale:socialPhotoScale(draft?.scale??choice?.photo_scale??s.design.photo_scale)};
}
function socialPhotoPositionLabel(axis,value){return axis==='scale'?value+'%':value?`${Math.abs(value)}% ${axis==='x'?(value<0?'left':'right'):(value<0?'up':'down')}`:'Original position';}
function socialPhotoPositionContext(s,card){
 const featured=socialFeatured(s,card),choice=featured.choice;
 return JSON.stringify([card.f.publication,card.split,featured.id,featured.asset?.id||null,choice?.photo_x||0,choice?.photo_y||0,socialPhotoScale(choice?.photo_scale??s.design.photo_scale),s.design.photo_shift||0]);
}
function socialPhotoPositionControls(s,card){
 const featured=socialFeatured(s,card);if(!featured.asset||s.design.layout==='list')return '';
 const position=socialPhotoPosition(s,card),key=seEsc(card.key),name=seEsc(featured.person?.name||'player'),confirmed=s.photoPositionConfirmed?.[card.key]===socialPhotoPositionContext(s,card)&&!s.photoPositions?.[card.key];
 return `<section class="social-photo-position" data-social-position-panel="${key}" aria-label="Adjust player photo"><h4 tabindex="-1">Adjust player photo</h4><p class="social-status">Adjust ${name} in this team’s preview, then save.</p>${[['scale','Size'],['x','Left / right'],['y','Up / down']].map(([axis,label])=>`<label>${label}<output data-social-position-value="${key}" data-axis="${axis}">${socialPhotoPositionLabel(axis,position[axis])}</output><input type="range" min="${axis==='scale'?50:-30}" max="${axis==='scale'?150:30}" step="1" value="${position[axis]}" data-social-position="${key}" data-axis="${axis}" aria-label="${axis==='scale'?'Size of '+name:'Move '+name+' '+(axis==='x'?'left or right':'up or down')}" aria-valuetext="${socialPhotoPositionLabel(axis,position[axis])}"></label>`).join('')}<div class="social-actions"><button type="button" class="btn ghost" data-social-position-reset="${key}" ${position.x||position.y||position.scale!==socialPhotoScale(s.design.photo_scale)?'':'disabled'}>Reset photo</button><button type="button" class="btn secondary" data-social-position-confirm="${key}" ${confirmed?'disabled':''}>${confirmed?'Photo adjustments saved ✓':'Save photo adjustments'}</button></div><p class="social-status" data-social-position-status="${key}" role="status" aria-live="polite">${s.photoPositions?.[card.key]?'Preview only — save these adjustments.':''}</p></section>`;
}
function socialPreviewPhotoPosition(s,card,position){
 if(socialFixtureCompleted(s,card.f)){socialMessage(s,'Completed fixtures are read-only. Open Team-list artwork to preview designs.');socialDraw(s);return;}
 (s.photoPositions||={})[card.key]={x:socialPhotoOffset(position.x),y:socialPhotoOffset(position.y),scale:socialPhotoScale(position.scale??socialPhotoPosition(s,card).scale)};
 const value=s.photoPositions[card.key],key=CSS.escape(card.key),choice=(card.f.features||[]).find(x=>x.day===card.day+1);
 if(value.x===socialPhotoOffset(choice?.photo_x)&&value.y===socialPhotoOffset(choice?.photo_y)&&value.scale===socialPhotoScale(choice?.photo_scale??s.design.photo_scale))delete s.photoPositions[card.key];
 if(s.photoPositionConfirmed)delete s.photoPositionConfirmed[card.key];
 const confirm=document.querySelector(`[data-social-position-confirm="${key}"]`),status=document.querySelector(`[data-social-position-status="${key}"]`);
 if(confirm){confirm.disabled=false;confirm.textContent='Save photo adjustments';}
 if(status)status.textContent=s.photoPositions[card.key]?'Preview only — save these adjustments.':'';
 document.querySelectorAll(`[data-social-position="${key}"]`).forEach(input=>{input.value=value[input.dataset.axis];input.setAttribute('aria-valuetext',socialPhotoPositionLabel(input.dataset.axis,Number(input.value)));});
 document.querySelectorAll(`[data-social-position-value="${key}"]`).forEach(output=>{output.textContent=socialPhotoPositionLabel(output.dataset.axis,value[output.dataset.axis]);});
 const reset=document.querySelector(`[data-social-position-reset="${key}"]`);if(reset)reset.disabled=!value.x&&!value.y&&value.scale===socialPhotoScale(s.design.photo_scale);
 s.photoPaintScheduled||=new Set();if(s.photoPaintScheduled.has(card.key))return;s.photoPaintScheduled.add(card.key);
 requestAnimationFrame(()=>{
  s.photoPaintScheduled.delete(card.key);if(s.busy||s.pending||!socialHere(s))return;
  const canvas=document.querySelector(`[data-social-canvas="${key}"]`),currentCard=s.data.fixtures.flatMap(socialCards).find(c=>c.key===card.key);
  if(canvas&&currentCard)void socialRender(s,currentCard,canvas).catch(e=>socialMessage(s,e.message));
 });
}
async function socialSavePhotoPosition(s,card,position){
 if(s.busy||s.pending||!card)return false;
 const featured=socialFeatured(s,card);if(!featured.asset)return false;
 const choice=featured.choice,mode=choice?.mode||'default',key=CSS.escape(card.key);
 const button=document.querySelector(`[data-social-position-confirm="${key}"]`),status=document.querySelector(`[data-social-position-status="${key}"]`);
 if(button)button.textContent='Saving…';if(status)status.textContent='Saving photo adjustments…';
 const result=await socialSave(s,'feature',socialFeatureRequest(card,mode,mode==='player'?choice.roster_id:null,mode==='player'?choice.asset_id:null,position),card.key);
 if(result&&socialHere(s))document.querySelector(`[data-social-position-panel="${key}"] h4`)?.focus({preventScroll:true});
 return result;
}
function socialBindPhotoPosition(s,cardFor){
 document.querySelectorAll('[data-social-position]').forEach(input=>{
  input.oninput=()=>{if(s.busy||s.pending)return;const card=cardFor(input.dataset.socialPosition);if(card)socialPreviewPhotoPosition(s,card,{...socialPhotoPosition(s,card),[input.dataset.axis]:Number(input.value)});};
  input.onchange=input.oninput;
 });
 document.querySelectorAll('[data-social-position-reset]').forEach(button=>button.onclick=()=>{if(s.busy||s.pending)return;const card=cardFor(button.dataset.socialPositionReset);if(!card)return;socialPreviewPhotoPosition(s,card,{x:0,y:0,scale:socialPhotoScale(s.design.photo_scale)});});
 document.querySelectorAll('[data-social-position-confirm]').forEach(button=>button.onclick=()=>{const card=cardFor(button.dataset.socialPositionConfirm);if(card)void socialSavePhotoPosition(s,card,socialPhotoPosition(s,card));});
}
function socialPhotoControls(s,card){
 if(socialFixtureCompleted(s,card.f))return '<p class="social-status">Completed · read only. Preview designs in Team-list artwork.</p>';
 const featured=socialFeatured(s,card),choice=featured.choice,people=[...new Map(socialNames(card).filter(p=>p.id).map(p=>[p.id,p])).values()],photos=socialPlayerPhotos(s,featured.id),selected=choice?.mode==='player'?choice.roster_id:choice?.mode||'default';
 const match=s.design.photo_policy==='match',season=s.design.photo_policy==='season',defaultLabel=match?'Match captain (default)':season?'Season captain (default)':'Choose a player';
 let guidance='Choose a player from this team.';
 if(selected==='none')guidance='This graphic will have no player photo.';
 else if(selected==='default'&&(match||season))guidance=featured.person
  ? `${featured.person.name} · ${match?'captain for '+(card.split?'this day':'this game'):'season captain'}.`
  : `No ${match?'match':'season'} captain is in this published team. Choose a player to feature.`;
 return `<div class="social-feature"><label>Featured player${card.split?' · Day '+(card.day+1):''}<select data-social-person="${seEsc(card.key)}"><option value="default" ${selected==='default'?'selected':''}>${defaultLabel}</option><option value="none" ${selected==='none'?'selected':''}>No player photo</option>${featured.invalid?`<option selected value="${seEsc(selected)}">Previously featured player is no longer selected</option>`:''}${people.map(p=>`<option value="${seEsc(p.id)}" ${selected===p.id?'selected':''}>${seEsc(p.name)}</option>`).join('')}</select></label>${featured.invalid?'<p class="social-status social-changed">Choose a currently selected player before downloading.</p>':selected==='default'||!featured.person?`<p class="social-status">${seEsc(guidance)}</p>`:''}${featured.person?`${photos.length?`<label>Photo of ${seEsc(featured.person.name)}<select data-social-photo="${seEsc(card.key)}"><option value="">Choose a saved photo</option>${photos.map((a,i)=>`<option value="${seEsc(a.id)}" ${featured.asset?.id===a.id?'selected':''}>${seEsc(a.label||'Photo '+(i+1))}</option>`).join('')}</select></label>`:`<p class="social-status">No saved photo for ${seEsc(featured.person.name)} yet.</p>`}<label>Upload player photo (up to 20 MB)<input type="file" accept="image/png,image/jpeg,image/webp" data-social-team-photo="${seEsc(card.key)}" aria-label="Upload photo of ${seEsc(featured.person.name)}"></label><button class="btn ghost" data-social-guide-player="${seEsc(featured.person.id)}" data-social-guide-card="${seEsc(card.key)}">Create a cut-out</button>`:''}${socialPhotoPositionControls(s,card)}</div>`;
}
function socialInk(hex){const v=hex.match(/[a-f0-9]{2}/gi)?.map(x=>parseInt(x,16)/255)||[0,0,0],l=v.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*l[0]+.7152*l[1]+.0722*l[2]>.179?'#101E30':'#FFFFFF';}
function socialMarker(ctx,kind,x,y,accent,ink,left=false){
 ctx.save();ctx.fillStyle=accent;ctx.strokeStyle=accent;ctx.lineWidth=4;
 if(kind==='arrows'){const direction=left?-1:1;for(let i=0;i<2;i++){ctx.beginPath();ctx.moveTo(x-direction*(i*15+11),y-10);ctx.lineTo(x-direction*i*15,y);ctx.lineTo(x-direction*(i*15+11),y+10);ctx.stroke();}}
 else if(kind==='badge'){ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);ctx.fill();ctx.fillStyle=socialInk(accent);ctx.font='bold 21px Arial';ctx.textAlign='center';ctx.fillText('1',x,y+7);}
 else{ctx.fillStyle=ink;ctx.font='600 14px Arial';ctx.textAlign=left?'right':'left';ctx.fillText('PHOTO',x,y+5);}
 ctx.restore();
}
function socialPhotoBounds(img){
 const cache=socialPhotoBounds.cache||(socialPhotoBounds.cache=new WeakMap());if(cache.has(img))return cache.get(img);
 const scale=Math.min(1,300/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.ceil(img.width*scale);c.height=Math.ceil(img.height*scale);const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,c.width,c.height);
 const a=x.getImageData(0,0,c.width,c.height).data;let minX=c.width,minY=c.height,maxX=-1,maxY=-1,clear=0;
 for(let y=0;y<c.height;y++)for(let p=0;p<c.width;p++){if(a[(y*c.width+p)*4+3]<32){clear++;continue;}minX=Math.min(minX,p);maxX=Math.max(maxX,p);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 const transparent=clear>c.width*c.height*.02&&maxX>=0,result=transparent?{x:Math.max(0,minX-1)*img.width/c.width,y:Math.max(0,minY-1)*img.height/c.height,w:(Math.min(c.width,maxX+2)-Math.max(0,minX-1))*img.width/c.width,h:(Math.min(c.height,maxY+2)-Math.max(0,minY-1))*img.height/c.height,transparent:true}:{x:0,y:0,w:img.width,h:img.height,transparent:false};cache.set(img,result);return result;
}
function socialNameProtection(ctx,boxes,ink){
 // Measure the actual rendered artwork beneath each name, including photo edges.
 const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;},lum=(r,g,b)=>.2126*linear(r)+.7152*linear(g)+.0722*linear(b),rgb=ink.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)),textL=lum(...rgb),shade=textL>.5?0:255,levels=[];
 for(const box of boxes){const x=Math.max(0,Math.floor(box.x)),y=Math.max(0,Math.floor(box.y)),w=Math.min(ctx.canvas.width-x,Math.ceil(box.w)),h=Math.min(ctx.canvas.height-y,Math.ceil(box.h));if(w<=0||h<=0)continue;const pixels=ctx.getImageData(x,y,w,h).data,row=[];
  for(let py=0;py<h;py+=8)for(let px=0;px<w;px+=8){const i=(py*w+px)*4;let alpha=0;for(;alpha<.86;alpha+=.02){const l=lum(...[0,1,2].map(k=>pixels[i+k]*(1-alpha)+shade*alpha));if((Math.max(l,textL)+.05)/(Math.min(l,textL)+.05)>=4.5)break;}row.push(alpha);}
  row.sort((a,b)=>a-b);levels.push(row[Math.floor(row.length*.98)]||0);
 }
 return {alpha:Math.min(.9,Math.max(0,...levels)+(levels.some(a=>a>0)?.04:0)),shade};
}
function socialDrawNameProtection(ctx,box,protection){
 if(!protection.alpha)return;
 const pad=44,c=document.createElement('canvas');c.width=Math.ceil(box.w+pad*2);c.height=Math.ceil(box.h+pad*2);const x=c.getContext('2d'),colour=protection.shade===0?'0,0,0':'255,255,255',g=x.createLinearGradient(0,0,c.width,0);
 for(const [stop,alpha] of [[0,0],[pad/c.width,protection.alpha],[1-pad/c.width,protection.alpha],[1,0]])g.addColorStop(stop,`rgba(${colour},${alpha})`);x.fillStyle=g;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='destination-in';const v=x.createLinearGradient(0,0,0,c.height);for(const [stop,alpha] of [[0,0],[pad/c.height,1],[1-pad/c.height,1],[1,0]])v.addColorStop(stop,`rgba(0,0,0,${alpha})`);x.fillStyle=v;x.fillRect(0,0,c.width,c.height);ctx.drawImage(c,box.x-pad,box.y-pad);
}
function socialGalleryCard(s,a,actions=''){
 const person=s.data.players.find(p=>p.id===a.roster_id),title=a.label||person?.name||'Design example';
 return `<section class="social-upload"><img data-social-asset="${seEsc(a.id)}" alt="${seEsc(title)}"><strong>${seEsc(person?.name||title)}</strong>${person&&a.label?'<p>'+seEsc(a.label)+'</p>':''}${['photo','portrait'].includes(a.kind)?'<button class="btn ghost" data-social-download-image="'+seEsc(a.id)+'">Download PNG</button>':''}<button class="btn ghost" data-social-remove="${seEsc(a.id)}">Remove image</button>${actions}</section>`;
}
function socialBindGallery(s){
 document.querySelectorAll('[data-social-gallery]').forEach(input=>input.onchange=async()=>{
  if(s.busy||s.pending||!input.files[0])return;
  const file=input.files[0],kind=input.dataset.socialGallery,person=input.dataset.roster||null;
  if(s.dirty&&!await socialSave(s,'settings',{revision:s.data.revision,design:s.design}))return;
  s.busy=true;socialLock(true);socialGuideUploadNote(s,'Preparing image…');
  try{
   const blob=await socialNormaliseUpload(file),existing=await socialFindUploadedImage(s,kind,person,blob);if(!socialHere(s))return;
   if(existing){socialGuideState(s).exampleId=existing.id;socialGuideState(s).showStylePreview=false;socialGuideUploadNote(s,'Already uploaded — using your saved image','saved');return;}
   const path=s.scope.split(':').slice(1).join(':')+'/'+kind+'/'+crypto.randomUUID()+'.png';
   socialGuideUploadNote(s,'Uploading image…');
   const result=await supabase.storage.from('club-socials').upload(path,blob,{contentType:'image/png',upsert:false});if(result.error)throw Error(result.error.message);if(!socialHere(s))return;
   s.uploadHashes.set(path,await socialUploadFingerprint(blob));socialGuideUploadNote(s,'Saving image…');
   const card=input.dataset.socialCard?s.data.fixtures.flatMap(socialCards).find(c=>c.key===input.dataset.socialCard):null;
   s.busy=false;await socialSave(s,'add_asset',{kind,roster_id:person,path,label:file.name.replace(/\.[^.]+$/,'').slice(0,120),...(card?{feature:socialFeatureRequest(card,'player',person)}:{})});
  }catch(e){socialGuideUploadNote(s,'Upload not completed. '+e.message,'error');socialMessage(s,e.message);}
  finally{s.busy=false;if(socialHere(s))socialDraw(s);}
 });
}
function socialStyleMessage(s,message,error=false){
 s.styleStatus={message,error};socialMessage(s,message);if(!socialHere(s))return;
 const status=document.getElementById('prepStyleStatus');if(status){status.textContent=message;status.setAttribute('role',error?'alert':'status');}
 const button=document.getElementById('prepSuggest');if(button){button.textContent=s.styleLoading?'Suggesting…':'Suggest a style';button.setAttribute('aria-busy',s.styleLoading?'true':'false');}
}
async function socialSuggestStyle(s){
 if(s.busy||s.pending)return;const refs=s.data.assets.filter(a=>['reference','reference_extra'].includes(a.kind));if(!refs.length&&!s.design.brief.trim()){socialStyleMessage(s,'Add an example above or describe the look you want.',true);return;}
 s.busy=true;s.styleLoading=true;socialLock(true);socialStyleMessage(s,'Looking at your examples and preparing a style. This can take up to a minute…');
 try{
  // Refresh just the allowance flags: retain the user's unsaved design and its revision.
  if(typeof window.__socialStyleDemo!=='function'){const context=await socialRPC(s,'context');if(!socialHere(s))return;s.data.style_suggestions_available=context.style_suggestions_available;s.data.artwork_ai_paused=context.artwork_ai_paused;if(context.style_suggestions_available===false)throw Error('AI assistance is paused or the club’s allowance is used. Ask the platform owner to check AI access.');}
  const body={club_id:s.scope.split(':').slice(1).join(':'),brief:s.design.brief,reference_ids:refs.map(a=>a.id)},response=typeof window.__socialStyleDemo==='function'?await window.__socialStyleDemo(body):await supabase.functions.invoke('club-social-style',{body});
  if(response.error){let message=response.data?.error;try{message||=(await response.error.context?.clone().json())?.error;}catch{}throw Error(message||response.error.message||'The style suggestion could not be prepared.');}const result=response.data;if(result?.error||!result?.design)throw Error(result?.error||'No style was returned.');if(!socialHere(s))return;
  const allowed={layout:['portrait','portrait_left','list'],theme:['gradient','solid','split'],font:['bold','clean','classic'],frame:['cutout','rectangle','circle'],marker:['arrows','badge','name']},patch={};for(const [k,options] of Object.entries(allowed)){if(!options.includes(result.design[k]))throw Error('The suggested style could not be used. Your settings are unchanged.');patch[k]=result.design[k];}for(const k of ['primary','accent']){if(!/^#[0-9A-Fa-f]{6}$/.test(result.design[k]))throw Error('The suggested colours could not be used.');patch[k]=result.design[k].toUpperCase();}
  patch.marker=s.design.marker;s.design={...s.design,...patch};socialGuideState(s).showStylePreview=true;s.dirty=Object.keys(s.design).some(k=>s.design[k]!==socialDefaults(s.data)[k]);s.styleNote=String(result.explanation||'').slice(0,800);socialStyleMessage(s,'Your suggested style is shown in the preview. The player marker is kept. Review it, then choose Save style.');
 }catch(e){if(socialHere(s))socialStyleMessage(s,e.message+' You can still adjust the design controls.',true);}finally{s.busy=false;s.styleLoading=false;if(socialHere(s)){socialLock(false);socialDraw(s);}}
}
async function socialFontReady(){
 if(!socialFontReady.promise)socialFontReady.promise=(async()=>{
  const load=async(source)=>{let timer;try{
   const bundled=source.startsWith('data:font/ttf;base64,'),font=new FontFace('Club Sporting',bundled?Uint8Array.from(atob(source.slice(source.indexOf(',')+1)),c=>c.charCodeAt(0)):'url("'+source+'")',{weight:'700'});
   const loaded=await Promise.race([font.load().then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),4000);})]);
   if(loaded)document.fonts.add(font);return loaded;
  }catch{return false;}finally{clearTimeout(timer);}};
  return await load(new URL('assets/fonts/BarlowCondensed-Bold.ttf',document.baseURI).href)||await load((await import('./social-font-fallback.js?v=0.8.62.288')).SOCIAL_FONT_DATA);
 })();
 return socialFontReady.promise;
}
function socialGuideState(s){
 if(!s.guide){let pending=null;try{pending=JSON.parse(sessionStorage.getItem('social-prep:'+s.scope)||'null');}catch{}s.guide={step:0,kind:'master',person:'',brief:'',source:'',file:null,uploaded:null,context:null,loading:false,available:null,startCommand:pending,preview:null};}return s.guide;
}
async function socialPrepRPC(s,action,data={}){const r=await supabase.rpc('club_socials_prepare_api',{p_club_id:s.scope.split(':').slice(1).join(':'),p_action:action,p_data:data});if(r.error)throw Error(r.error.message||'Could not load image preparation.');return r.data;}
async function socialPrepInvoke(s,body){const response=typeof window.__socialPrepareDemo==='function'?await window.__socialPrepareDemo(body):await supabase.functions.invoke('club-social-prepare',{body});if(response.error||response.data?.error){let message=response.data?.error;try{message||=(await response.error.context?.clone().json())?.error;}catch{}throw Object.assign(Error(message||response.error?.message||'Image preparation could not connect.'),{retryable:![400,401,403,404,409,422,429,503].includes(response.error?.context?.status||response.status)});}return response.data;}
async function socialGuideReload(s){
 const g=socialGuideState(s);if(g.loading)return;g.loading=true;for(const id of ['prepReload','prepCheckRequest']){const button=document.getElementById(id);if(button){button.disabled=true;button.textContent='Checking…';button.setAttribute('aria-busy','true');}}
 try{const data=await socialPrepRPC(s,'context');if(!socialHere(s))return;g.context=data;g.error='';
  const request=g.startCommand||g.preparation,found=data.jobs.find(j=>request&&(j.id===request.id||j.request_id===request.request_id));
  if(found){g.preparation={id:found.id,request_id:found.request_id};g.preparationError=null;g.startCommand=null;sessionStorage.removeItem('social-prep:'+s.scope);s.notice='';
   if(['ready','approved'].includes(found.state))g.preview=found.id;
   if(found.state==='failed')g.uploadNote={state:'error',text:found.error||'Changes could not be prepared.'};
   socialGuideRemember(g);
  }
 }catch(e){g.error=e.message;}finally{g.loading=false;if(socialHere(s)&&s.view==='guide')socialDraw(s);}
}
async function socialPrepURL(s,bucket,path){const key=bucket+':'+path;if(s.urls.has(key))return s.urls.get(key);const r=await supabase.storage.from(bucket).download(path);if(r.error||!r.data)throw Error('This image could not load. Refresh to try again.');if(!socialHere(s))throw Error('Club changed');const url=URL.createObjectURL(r.data);s.urls.set(key,url);return url;}
function socialGuideSteps(g){
 const steps=[{id:0,label:'Style'},{id:1,label:'Artwork'},{id:3,label:'Confirm design'}],index=steps.findIndex(step=>step.id===g.step);
 return {steps,index,photo:g.step===2,next:steps[index+1]?.id,back:steps[index-1]?.id};
}
function socialGuide(s){
 const g=socialGuideState(s),host=document.getElementById('socialContent'),context=g.context,jobs=context?.jobs||[],paused=context?.mode==='paused',flow=socialGuideSteps(g);
 clearTimeout(g.poll);clearInterval(g.clock);
 const saved={0:!!(s.design.brief||s.data.assets.some(a=>['reference','reference_extra'].includes(a.kind))),1:!!socialAsset(s,'background'),3:false};
 const remaining=context?.total_limit!=null?Math.max(0,context.total_limit-context.total_used):null;
 const progress=flow.photo||g.workflowReturn?'':'<nav class="sg-progress" aria-label="Guided setup steps">'+flow.steps.map((step,i)=>'<div class="sg-step '+(saved[step.id]?'is-done':'')+'" aria-current="'+(g.step===step.id?'step':'false')+'"><span>'+(saved[step.id]&&g.step!==step.id?socialGuideIcon('check'):i+1)+'</span>'+step.label+'</div>').join('')+'</nav>';
 const returnLabel=g.awardReturn?(g.awardReturn.view==='graphics'?'team-list artwork':'award graphic'):g.workflowReturn==='artwork'?'team-list artwork':'player photos';
 const back=flow.photo||g.workflowReturn?'<button class="btn ghost" id="prepReturn">← Back to '+returnLabel+'</button>':flow.back!==undefined?'<button class="btn ghost" id="prepBack">← Back</button>':'<small>Step 1 of 3</small>';
 const next=flow.photo||g.workflowReturn?'<button class="btn" id="prepNext">Back to '+returnLabel+' →</button>':flow.next!==undefined?'<button class="btn" id="prepNext">'+(s.dirty?'Save &amp; next':'Next: '+flow.steps[flow.index+1].label.toLowerCase())+' →</button>':'';
 host.innerHTML=socialGuideStyles()+'<div class="social-guide"><div class="sg-head"><span class="sg-hint">'+(flow.photo?(g.awardReturn?'Socials Awards · Player photo':'Player photo preparation'):g.workflowReturn?'Background preparation':'Step '+(flow.index+1)+' of 3')+'</span>'+(context?'<span class="sg-pill">'+(paused?'Saved images ready':remaining!=null?remaining+' AI credits':'Image preparation')+'</span>':'')+'</div>'+progress+(g.error?'<p class="notice" role="alert">'+seEsc(g.error)+'</p><button class="btn ghost" id="prepReload">Try again</button>':'')+(context?.demo?'<p class="sg-credits">Demo preview · no AI charge</p>':'')+'<div id="prepStep"></div><div class="sg-footer">'+back+'<div class="sg-footer-end">'+next+'</div></div></div>';
 document.getElementById('prepBack')?.addEventListener('click',()=>appNavigationBack(()=>socialGuideGo(s,flow.back)));
 document.getElementById('prepReturn')?.addEventListener('click',()=>appNavigationBack(()=>socialGuideReturnToTeam(s)));
 document.getElementById('prepReload')?.addEventListener('click',()=>socialGuideReload(s));
 if(g.step===0)socialGuideLook(s);else if(g.step===3)socialGuideFinish(s);else socialGuidePrepare(s);
 socialGuideNextState(s);
 if(!context&&!g.loading&&!g.error)void socialGuideReload(s);
 if(g.available===null&&!g.checking){g.checking=true;void socialPrepInvoke(s,{action:'status',club_id:s.scope.split(':').slice(1).join(':')}).then(r=>{g.available=r.available;g.providerError=r.available?'':r.error||'AI preparation is unavailable.';}).catch(e=>{g.available=false;g.providerError=e.message;}).finally(()=>{g.checking=false;if(socialHere(s)&&s.view==='guide')socialDraw(s);});}
 if(g.startCommand||['pending','processing'].includes(socialGuidePreparation(g)?.state)||jobs.some(j=>['pending','processing'].includes(j.state))){
  g.poll=setTimeout(()=>{if(socialHere(s)&&s.view==='guide')void socialGuideReload(s);},4000);
  g.clock=setInterval(()=>{if(!socialHere(s)||s.view!=='guide'){clearInterval(g.clock);return;}document.querySelectorAll('[data-prep-elapsed]').forEach(e=>{const j=jobs.find(j=>j.id===e.dataset.prepElapsed);if(j)e.textContent='Preparing · '+Math.max(0,Math.floor((Date.now()-new Date(j.started_at||j.created_at).getTime())/1000))+'s';});},1000);
 }
}
function socialGuideLook(s){
 const host=document.getElementById('prepStep'),refs=s.data.assets.filter(a=>['reference','reference_extra'].includes(a.kind)),d=s.design,g=socialGuideState(s);const selectedExample=refs.find(a=>a.id===g.exampleId)||refs[refs.length-1];
 const lookPreview=g.showStylePreview||!refs.length&&s.data.assets.some(a=>['background','sponsors'].includes(a.kind))?socialGuidePreview():refs.length?'<aside class="sg-preview"><figure><figcaption>Your example</figcaption><img class="sg-example-image" data-social-asset="'+seEsc(selectedExample.id)+'" alt="Your club design example"></figure></aside>':'<aside class="sg-preview"><div class="sg-empty">'+socialGuideIcon('image')+'<span>Your example will appear here</span></div></aside>';
 const select=(key,label,values)=>'<label>'+label+'<select data-guide-setting="'+key+'">'+seOpt(values,d[key])+'</select></label>';
 host.innerHTML='<section class="sg-panel"><h3>Set up your social design</h3><p class="sg-hint">Add previous posts for reference. Your logo and colours come from Club look.</p><div class="sg-split"><div>'+socialGuideUploadStatus(s)+(refs.length?'<details class="sg-details"><summary>Your examples ('+refs.length+')</summary><div class="social-upload-grid">'+refs.map(a=>socialGalleryCard(s,a)).join('')+'</div></details>':'')+(refs.length<4?'<label class="sg-drop">'+socialGuideIcon('upload')+'<strong>'+(refs.length?'Add another example':'Upload an example')+'</strong><small>JPG, PNG or WebP</small><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload a design example" data-social-gallery="reference_extra"></label>':'')+'<label>What would you change? <span class="se-muted">(optional)</span><textarea id="prepStyleBrief" rows="2" maxlength="1500" placeholder="Larger player, blue background, sponsors at the top…">'+seEsc(d.brief)+'</textarea></label><div class="social-actions"><button class="btn ghost" id="prepSuggest" aria-describedby="prepStyleStatus" aria-busy="'+(s.styleLoading?'true':'false')+'">'+socialGuideIcon('spark')+' '+(s.styleLoading?'Suggesting…':'Suggest a style')+'</button><button class="btn ghost" id="prepSaveStyle" '+(!s.dirty?'disabled':'')+'>'+(s.dirty?'Save style':'Saved')+'</button></div><p id="prepStyleStatus" class="sg-hint" role="'+(s.styleStatus?.error?'alert':'status')+'" aria-live="polite">'+seEsc(s.styleStatus?.message||(s.data.style_suggestions_available===false?'AI allowance unavailable. Try Suggest a style to check again.':''))+'</p><details class="sg-details" id="prepFineTune"><summary>Adjust the layout &amp; colours</summary><div class="sg-layouts">'+[['portrait_left','Photo left'],['list','Names only'],['portrait','Photo right']].map(([value,label])=>'<button class="sg-layout" data-guide-layout="'+value+'" aria-pressed="'+(d.layout===value)+'"><span class="sg-mini">'+(value==='portrait_left'?socialGuideIcon('person'):'')+'<span class="sg-mini-lines"></span>'+(value==='portrait'?socialGuideIcon('person'):'')+'</span>'+label+'</button>').join('')+'</div><div class="sg-fields"><label>Main colour<input type="color" data-guide-setting="primary" value="'+seEsc(d.primary)+'"></label><label>Highlight colour<input type="color" data-guide-setting="accent" value="'+seEsc(d.accent)+'"></label>'+select('photo_policy','Default player',[['match','Match captain'],['season','Season captain'],['choose','Choose each time']])+select('theme','Background',[['solid','Use artwork as supplied'],['gradient','Stadium glow'],['split','Angled colours']])+select('font','Lettering',[['bold','Sporting'],['clean','Modern'],['classic','Classic']])+select('frame','Photo treatment',[['cutout','Full cutout / photo'],['rectangle','Rectangle'],['circle','Circle']])+select('marker','Player marker',[['arrows','Arrows'],['badge','Number'],['name','Photo label']])+'<label>Header height<input type="number" data-guide-setting="header_height" min="200" max="440" value="'+d.header_height+'"></label>'+select('header_layout','Logo &amp; sponsors',[['integrated','Included in background'],['banner','Separate full banner'],['separate','Club logo + sponsors']])+'</div><label>Footer <span class="se-muted">(optional)</span><input type="text" data-guide-setting="footer" maxlength="100" value="'+seEsc(d.footer)+'"></label></details>'+(s.styleNote?'<details class="sg-details"><summary>About this suggestion</summary><p class="sg-hint">'+seEsc(s.styleNote)+'</p></details>':'')+'</div><div id="prepLookPreview">'+lookPreview+'</div></div></section>';
 const changed=(showDesign=false)=>{if(showDesign)g.showStylePreview=true;if(showDesign&&!document.getElementById('prepCanvas'))document.getElementById('prepLookPreview').innerHTML=socialGuidePreview();s.dirty=Object.keys(socialDefaults(s.data)).some(k=>s.design[k]!==socialDefaults(s.data)[k]);const b=document.getElementById('prepSaveStyle');b.disabled=!s.dirty;b.textContent=s.dirty?'Save style':'Saved';document.getElementById('prepNext').textContent=s.dirty?'Save & next →':'Next: background →';void socialPrepPaint(s);};
 document.getElementById('prepStyleBrief').oninput=e=>{s.design.brief=e.target.value;changed();};
 host.querySelectorAll('[data-guide-setting]').forEach(e=>e.oninput=()=>{const k=e.dataset.guideSetting;s.design[k]=['header_height','photo_scale','photo_shift'].includes(k)?Number(e.value):['primary','accent'].includes(k)?e.value.toUpperCase():e.value;changed(true);});
 host.querySelectorAll('[data-guide-layout]').forEach(b=>b.onclick=()=>{s.design.layout=b.dataset.guideLayout;host.querySelectorAll('[data-guide-layout]').forEach(e=>e.setAttribute('aria-pressed',e===b?'true':'false'));changed(true);});
 document.getElementById('prepSuggest').onclick=()=>socialSuggestStyle(s);
 document.getElementById('prepSaveStyle').onclick=()=>socialSave(s,'settings',{revision:s.data.revision,design:s.design});
 socialBindUploads(s);socialBindGallery(s);void socialPrepPaint(s);
}
function socialGuidePrepare(s){
 const g=socialGuideState(s),host=document.getElementById('prepStep'),jobs=g.context?.jobs||[],photo=g.step===2,kind=photo?'photo':g.kind,paused=g.context?.mode==='paused';
 const labels={master:'Complete background',banner:'Logo & sponsor banner',background:'Background only',photo:'Player photo'},sources=socialGuideSources(s,kind),relevant=jobs.filter(j=>j.kind===kind&&(kind!=='photo'||j.roster_id===g.person)&&j.state!=='discarded');
 const request=socialGuidePreparation(g),active=!!s.busy||jobs.some(j=>['pending','processing'].includes(j.state)),waiting=active||request?.state==='unconfirmed'||!!g.awardReturn?.proposal?.saveUncertain;
 if(g.skipReady===null&&g.context)g.skipReady=jobs.filter(j=>j.state==='ready').map(j=>j.id);
 if(!g.source&&!g.file&&!photo&&g.awardReturn?.kind!=='background'&&sources.length&&!request){const source=sources.find(a=>a.kind==='background')||sources.find(a=>a.id===g.exampleId)||sources[0];g.source='asset:'+source.id;g.needsHelp=false;}
 if(paused&&!request)g.needsHelp=false;
 if(['ready','approved'].includes(request?.state))g.preview=request.id;
 else if(request&&request.state!=='approved')g.preview=null;

 const ready=relevant.find(j=>j.id===g.preview&&['ready','approved'].includes(j.state)),local=g.local,previous=relevant.find(j=>j.id===g.previousPreview&&['ready','approved'].includes(j.state)),display=ready||previous||local;
 const saved=photo?socialPlayerPhotos(s,g.person):s.data.assets.filter(a=>['background','sponsors'].includes(a.kind)),people=s.data.players.filter(p=>p.active||socialPlayerPhotos(s,p.id).length),selectedPlayer=s.data.players.find(p=>p.id===g.person),teamCard=g.returnCard?s.data.fixtures.flatMap(socialCards).find(card=>card.key===g.returnCard):null;
 const failed=request&&['failed','rejected'].includes(request.state),refining=!!g.previousPreview||g.source.startsWith('job:'),canChange=ready||previous||local,revert=ready||previous,resultsBackground=g.awardReturn?.view==='results';
 if(ready)g.uploadNote={state:'ready',text:'New version ready to review.'};
 else if(failed)g.uploadNote={state:'error',text:request.error||'No new version was created.'};
 const startLabel=request?.state==='unconfirmed'?'Retry same request':waiting?'Preparing changes…':failed?'Retry changes':refining||g.preparationMode==='edit'?'Preview changes':photo?'Create cutout':'Prepare background';
 const inputForm=(!photo||g.person)?`<form id="prepForm" ${ready?'hidden':''}>
  ${!photo&&g.awardReturn?.kind!=='background'?`<label>Artwork type<select id="prepKind">${[['master','Complete background · includes logo & sponsors'],['background','Background only · use club logo'],['banner','Logo & sponsor banner']].map(([v,l])=>`<option value="${v}" ${kind===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}
  ${!refining&&sources.length?`<details class="sg-details"><summary>Choose a saved image</summary><div class="sg-thumbs" aria-label="Choose a source image">${sources.map(a=>`<button type="button" class="sg-thumb" data-prep-source="asset:${seEsc(a.id)}" aria-pressed="${g.source==='asset:'+a.id}"><img data-social-asset="${seEsc(a.id)}" alt="${seEsc(a.label||labels[kind])}"><span>${seEsc(a.label||({background:'Saved background',sponsors:'Saved banner',photo:selectedPlayer?.name,portrait:selectedPlayer?.name}[a.kind])||'Your example')}</span></button>`).join('')}</div></details>`:''}
  ${refining?'<p class="sg-hint">Your next changes will use the version shown here.</p>':`<label class="sg-drop ${g.file||g.source?'sg-drop-compact':''}">${socialGuideIcon('upload')}<strong>${g.file?'Change image':'Upload '+(photo?'a photo':'an image')}</strong><small>${seEsc(g.file?.name||'JPG, PNG or WebP')}</small><input id="prepFile" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload ${photo?'a player photo':'a background source'}"></label>`}
  <img id="prepSourceImage" class="sg-source-preview" hidden alt="Image used for these changes">
  ${!refining?`<label class="sg-help-choice"><input id="prepNeedsHelp" type="checkbox" ${g.needsHelp?'checked':''} ${paused?'disabled':''}><span>${photo?'Remove the background for me':'Prepare or change this background for me'}</span></label>`:''}
  <label ${!g.needsHelp?'hidden':''}>${refining?'What needs changing in this version?':'What needs changing?'}<textarea id="prepBrief" rows="3" maxlength="1500" placeholder="${photo?'Tell us what to keep or adjust.':'For example: move Results down slightly so it clears the top edge. Keep everything else in place.'}">${seEsc(g.brief)}</textarea></label>
  <button class="btn" type="submit" id="prepStart" ${g.local&&!g.needsHelp&&!g.startCommand?'hidden':''} ${(s.busy||active||g.needsHelp&&(paused||g.available!==true))?'disabled':''}>${socialGuideIcon('spark')} ${g.needsHelp||g.startCommand?startLabel:'Preview image'}</button>
  <p class="sg-credits">${g.needsHelp?'AI assistance by OpenAI · 1 credit per completed preview. Failed attempts use no credit.':'Use as supplied · no AI credit'}</p>
  ${paused?'<p class="sg-credits">AI is paused. You can still upload and save finished images.</p>':g.available===false?`<p class="sg-credits">${seEsc(g.providerError||'AI preparation is unavailable.')}</p><button class="sg-quiet" type="button" id="prepCheck">Check again</button>`:''}
 </form>`:'<div class="sg-empty">'+socialGuideIcon('person')+'<span>Select a player to add their photo</span></div>';
 const feedback=socialGuidePreparationFeedback(g,request,ready);
 const reviewActions=display||g.awardReturn?.proposal?`<div class="sg-review-actions">${ready||local&&!g.needsHelp&&!request?`<button class="btn" id="prepSaveVersion">${g.awardReturn?.proposal?'Apply changes':resultsBackground?'Use background &amp; preview Results':'Apply changes'}</button>`:''}${g.awardReturn?.proposal?`<button class="btn ghost" id="prepUndoProposal" ${waiting||g.awardReturn.proposal.saveUncertain?'disabled':''}>Undo changes</button>`:''}${canChange?`<button class="btn ghost" id="prepChange" ${waiting||paused?'disabled':''}>${ready||local&&!g.needsHelp?'Edit this version':'Edit request'}</button>`:''}${revert?.source_path?`<button class="btn ghost" id="prepRevert" ${waiting?'disabled':''}>Revert to previous image</button>`:''}${previous&&!ready?`<button class="btn ghost" id="prepKeepVersion" ${waiting?'disabled':''}>Keep previous version</button>`:''}${photo&&!g.returnCard&&!g.awardReturn&&ready?'<button class="btn ghost" id="prepSaveAnother">Save &amp; add another player</button>':''}</div>`:'';
 host.innerHTML=`<section class="sg-panel"><h3>${photo?'Photo for '+seEsc(selectedPlayer?.name||'selected player'):'Prepare your background'}</h3><p class="sg-hint">${photo?(teamCard?seEsc(teamCard.f.published.details.grade)+'. ':'')+'Review the photo, request any changes, then save the version you want.':'Upload an example, review each version, and adjust it until you are happy to save.'}</p>
  <div class="sg-split"><div>${request?'':socialGuideUploadStatus(s)}${photo&&!g.returnCard?`<label>Player<select id="prepPerson"><option value="">Choose a player</option>${people.map(p=>`<option value="${seEsc(p.id)}" ${g.person===p.id?'selected':''}>${seEsc(p.name)}</option>`).join('')}</select></label>`:''}
   ${inputForm}${ready?'<div class="sg-review-title">Before this change</div><img id="prepReviewSource" class="sg-review-source" alt="Image before the requested changes">':''}</div>
   <aside class="sg-preview" id="prepReview"><div class="sg-review-title">${ready?'Proposed changes':request?'Previous image':'Image preview'}</div>${feedback}
    ${reviewActions}${resultsBackground?'<p class="sg-hint" id="prepResultsNote">Background only. Scores, player figures and WIN/DEF labels are added from PlayCricket when you preview Results.</p>':''}
    <canvas id="prepCanvas" width="1080" height="1350" aria-label="Artwork preview"></canvas><p id="prepPreviewLabel"></p>
   </aside></div>
  ${saved.length?`<details class="sg-saved sg-details"><summary>${socialGuideIcon('check')} ${photo?'Saved for '+seEsc(selectedPlayer?.name||'this player'):'Saved images'}</summary><div class="social-upload-grid">${saved.map(a=>socialGalleryCard(s,a)).join('')}</div></details>`:''}
  ${photo&&!g.returnCard&&!g.awardReturn&&g.person&&saved.length?'<button class="btn ghost" id="prepAnother" style="margin-top:16px">Add another player</button>':''}
 </section>${relevant.length?`<details class="sg-jobs sg-details"><summary>Previous versions &amp; attempts · ${relevant.length}</summary><div class="social-upload-grid">${relevant.map(j=>`<article class="social-upload"><strong>${labels[j.kind]}</strong>${j.brief?`<p class="sg-request-brief">${seEsc(j.brief)}</p>`:''}${['pending','processing'].includes(j.state)?`<p role="status" data-prep-elapsed="${seEsc(j.id)}">Preparing…</p>`:j.state==='failed'?`<p role="status">${seEsc(j.error||'Could not finish.')} ${j.credit_used?'':'No AI credit used.'}</p>`:`<img data-prep-image="${seEsc(j.id)}" alt="Prepared ${seEsc(labels[j.kind])}"><span class="sg-badge">${j.state==='approved'?'Saved':'Ready to review'}${j.credit_used?' · 1 AI credit used':''}</span>`}<div class="social-actions">${['ready','approved'].includes(j.state)?`<button class="btn" data-prep-review="${seEsc(j.id)}" ${waiting?'disabled':''}>Review this version</button><button class="btn ghost" data-prep-refine="${seEsc(j.id)}" ${paused||waiting?'disabled':''}>Edit this version</button>`:''}${!['approved','discarded'].includes(j.state)?`<button class="sg-quiet" data-prep-discard="${seEsc(j.id)}" ${waiting?'disabled':''}>Discard</button>`:''}</div></article>`).join('')}</div></details>`:''}`;
 document.getElementById('prepPerson')?.addEventListener('change',e=>{socialGuideSwitch(g,2,e.target.value);socialDraw(s);});
 document.getElementById('prepAnother')?.addEventListener('click',()=>{socialGuideSwitch(g,2,'');socialDraw(s);document.getElementById('prepPerson')?.focus();});
 document.getElementById('prepKind')?.addEventListener('change',e=>{const value=e.target.value;socialGuideResetImage(g);g.kind=value;socialDraw(s);});
 host.querySelectorAll('[data-prep-source]').forEach(b=>b.onclick=()=>{socialGuideResetImage(g);g.source=b.dataset.prepSource;g.needsHelp=false;socialDraw(s);});
 document.getElementById('prepFile')?.addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;socialGuideResetImage(g);g.file=file;g.fileURL=URL.createObjectURL(file);socialDraw(s);void socialGuideOriginalPreview(s);});
 document.getElementById('prepBrief')?.addEventListener('input',e=>g.brief=e.target.value);
 document.getElementById('prepNeedsHelp')?.addEventListener('change',e=>{g.needsHelp=e.target.checked;if(!g.needsHelp&&!waiting){g.preparation=null;g.preparationError=null;g.uploadNote=null;}socialDraw(s);});
 document.getElementById('prepForm')?.addEventListener('submit',e=>{e.preventDefault();void(g.needsHelp||g.startCommand?socialPrepStart(s):socialGuideOriginalPreview(s));});
 document.getElementById('prepCheck')?.addEventListener('click',()=>{g.available=null;socialDraw(s);});
 document.getElementById('prepCheckRequest')?.addEventListener('click',()=>socialGuideReload(s));
 host.querySelectorAll('[data-prep-review]').forEach(b=>b.onclick=()=>socialGuideReviewVersion(s,b.dataset.prepReview));
 host.querySelectorAll('[data-prep-refine]').forEach(b=>b.onclick=()=>socialGuideRefineVersion(s,b.dataset.prepRefine));
 host.querySelectorAll('[data-prep-discard]').forEach(b=>b.onclick=async()=>{if(s.busy||s.pending||waiting)return;s.busy=true;b.textContent='Removing…';b.setAttribute('aria-busy','true');socialLock(true);try{await socialPrepRPC(s,'discard',{id:b.dataset.prepDiscard,request_id:crypto.randomUUID()});if(g.preview===b.dataset.prepDiscard)g.preview=null;if(g.preparation?.id===b.dataset.prepDiscard)g.preparation=null;await socialGuideReload(s);}catch(e){socialMessage(s,e.message);}finally{s.busy=false;if(socialHere(s))socialDraw(s);}});
 host.querySelectorAll('[data-prep-image]').forEach(img=>{const j=jobs.find(j=>j.id===img.dataset.prepImage);void socialPrepURL(s,'club-social-prep',j.result_path).then(url=>{if(img.isConnected)img.src=url;}).catch(e=>socialMessage(s,e.message));});
 document.getElementById('prepSaveVersion')?.addEventListener('click',()=>socialGuideSaveAndContinue(s));
 document.getElementById('prepUndoProposal')?.addEventListener('click',()=>{if(!waiting&&!g.awardReturn?.proposal?.saveUncertain)void socialGuideReturnToAward(s,g);});
 document.getElementById('prepSaveAnother')?.addEventListener('click',()=>socialGuideSaveAndContinue(s,true));
 document.getElementById('prepChange')?.addEventListener('click',()=>{if(waiting||paused)return;if(ready)socialGuideRefineVersion(s,ready.id);else{g.needsHelp=true;socialGuideRemember(g);socialDraw(s);document.getElementById('prepBrief')?.focus();}});
 document.getElementById('prepRevert')?.addEventListener('click',()=>socialGuideRevertVersion(s,revert.id));
 document.getElementById('prepKeepVersion')?.addEventListener('click',()=>socialGuideReviewVersion(s,previous.id));
 if(waiting)host.querySelectorAll('#prepForm input,#prepForm textarea,#prepForm select,[data-prep-source],#prepPerson').forEach(e=>e.disabled=true);
 socialBindUploads(s);void socialGuideSourcePaint(s);void socialPrepPaint(s,display);
 if(!display&&!request&&!g.needsHelp&&g.uploadNote?.state!=='saved'&&(g.file||g.source)&&g.failedSource!==(g.file||g.source)&&!s.busy)queueMicrotask(()=>socialGuideOriginalPreview(s));
 if(g.autoStart&&g.awardReturn?.proposal&&!waiting&&!request&&g.available===true&&!paused&&(g.file||g.source)){g.autoStart=false;queueMicrotask(()=>{if(socialHere(s)&&s.view==='guide'&&socialGuideState(s)===g&&g.awardReturn?.proposal)void socialPrepStart(s);});}
}
function socialGuidePreparation(g){
 const request=g.preparation||g.startCommand;if(!request)return g.preparationError?{state:'rejected',error:g.preparationError,brief:g.brief}:null;
 const job=g.context?.jobs.find(j=>request.id&&j.id===request.id||request.request_id&&j.request_id===request.request_id);
 return job||{...request,state:g.preparationError?(g.startCommand?'unconfirmed':'rejected'):'pending',error:g.preparationError,credit_used:false};
}
function socialGuidePreparationFeedback(g,request,ready){
 const job=request||ready;if(!job)return '';
 let title,detail,state='working';
 if(['pending','processing'].includes(job.state)){title='Preparing your changes…';detail='This can take a couple of minutes.';}
 else if(job.state==='unconfirmed'){title='Request not yet confirmed';detail=job.error+' Check status, or retry the same request.';state='error';}
 else if(['failed','rejected'].includes(job.state)){title='Changes could not be prepared';detail=(job.error||'Please try again.')+' '+(job.credit_used?'':'No AI credit used.')+' The image below is unchanged.';state='error';}
 else if(job.state==='discarded'){title='Attempt discarded';detail='Choose an earlier version or prepare another image.';state='error';}
 else{title=job.state==='approved'?'Saved version':'New version ready to review';detail='Save, edit again or undo.'+(job.credit_used?' 1 AI credit used.':'');state='ready';}
 return `<div id="prepRequestFeedback" class="sg-request-feedback ${state}" role="status" aria-live="polite"><strong>${state==='working'?'<span class="sg-spinner" aria-hidden="true"></span> ':''}${title}</strong>${job.brief?`<p class="sg-request-brief"><b>Your request:</b> ${seEsc(job.brief)}</p>`:''}<p>${seEsc(detail)}</p>${['pending','processing','unconfirmed'].includes(job.state)?'<button class="btn ghost" id="prepCheckRequest" type="button">Check status</button>':''}</div>`;
}
function socialGuideReviewVersion(s,id){
 const g=socialGuideState(s),job=g.context?.jobs.find(j=>j.id===id&&['ready','approved'].includes(j.state));if(!job||s.busy||s.pending||g.awardReturn?.proposal?.saveUncertain)return;
 g.kind=job.kind;g.person=job.roster_id||g.person;g.local=null;g.preview=id;g.previousPreview=null;g.preparation={id,request_id:job.request_id};g.preparationError=null;g.needsHelp=false;g.source='job:'+id;g.brief=job.brief||'';socialGuideRemember(g);socialDraw(s);document.getElementById('prepReview')?.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function socialGuideRefineVersion(s,id){
 const g=socialGuideState(s),job=g.context?.jobs.find(j=>j.id===id&&['ready','approved'].includes(j.state));if(!job||s.busy||s.pending||g.awardReturn?.proposal?.saveUncertain)return;
 socialGuideResetImage(g);g.kind=job.kind;g.person=job.roster_id||g.person;g.previousPreview=id;g.skipPreview=id;g.skipReady=(g.context?.jobs||[]).filter(j=>j.state==='ready').map(j=>j.id);g.needsHelp=true;g.preparationMode='edit';g.source='job:'+id;socialGuideRemember(g);socialDraw(s);document.getElementById('prepBrief')?.focus();
}
async function socialGuideRevertVersion(s,id){
 const g=socialGuideState(s),job=g.context?.jobs.find(j=>j.id===id&&['ready','approved'].includes(j.state));
 if(!job?.source_path||s.busy||s.pending||g.awardReturn?.proposal?.saveUncertain||g.startCommand||g.context?.jobs.some(j=>['pending','processing'].includes(j.state)))return;
 const parent=g.context.jobs.find(j=>j.result_path===job.source_path&&job.source_bucket==='club-social-prep'&&['ready','approved'].includes(j.state));
 if(parent){socialGuideReviewVersion(s,parent.id);return;}
 s.busy=true;socialLock(true);
 try{
  const bucket=job.source_bucket||'club-social-prep',r=await supabase.storage.from(bucket).download(job.source_path);
  if(r.error||!r.data)throw Error(r.error?.message||'The previous image could not load.');
  if(!socialHere(s)||socialGuideState(s)!==g||s.view!=='guide')return;
  const asset=bucket==='club-socials'?s.data.assets.find(a=>a.path===job.source_path):null,mode=g.preparationMode||'template';
  socialGuideResetImage(g);g.kind=job.kind;g.person=job.roster_id||g.person;g.preparationMode=mode;
  g.file=new File([r.data],'Previous image.png',{type:r.data.type||'image/png'});g.fileURL=URL.createObjectURL(g.file);
  if(asset)g.source='asset:'+asset.id;else if(bucket==='club-social-prep'&&job.source_path.includes('/source/'))g.uploaded=job.source_path;
  const key='local-preview:'+crypto.randomUUID();s.urls.set(key,URL.createObjectURL(r.data));
  g.local={kind:g.kind,roster_id:g.kind==='photo'?g.person:null,result_path:key,local:true,blob:r.data,label:'Previous image'};
  g.skipReady=g.context.jobs.filter(j=>j.state==='ready').map(j=>j.id);
  socialGuideUploadNote(s,'Previous image restored. No AI credit used.','ready');socialGuideRemember(g);
 }catch(e){socialMessage(s,'Could not revert. '+e.message+' Your current version is still available.');}
 finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
async function socialPrepStart(s){
 const g=socialGuideState(s);if(s.busy||s.pending||g.awardReturn?.proposal?.saveUncertain)return;if(s.dirty&&!g.awardReturn?.proposal){socialMessage(s,'Save your style before preparing an image.');return;}
 if(!g.startCommand&&(g.kind==='photo'&&!g.person||!g.source&&!g.file)){socialMessage(s,g.kind==='photo'&&!g.person?'Choose the player in the photo.':'Upload an image or choose a saved example.');return;}
 s.busy=true;g.preparationError=null;socialLock(true);socialMessage(s,'');socialGuideUploadNote(s,'Sending your change request…');
 try{
  if(!g.startCommand){const p={request_id:crypto.randomUUID(),kind:g.kind,roster_id:g.kind==='photo'?g.person:null,brief:g.brief,mode:g.preparationMode||(g.source.startsWith('job:')||s.data.assets.some(a=>g.source==='asset:'+a.id&&['background','sponsors'].includes(a.kind))?'edit':'template')};if(['results','five_wickets','century','team_week','player_week'].includes(g.awardReturn?.view))p.graphic_kind=g.awardReturn.view;
   if(g.source.startsWith('asset:'))p.source_asset_id=g.source.slice(6);else if(g.source.startsWith('job:'))p.source_job_id=g.source.slice(4);else{if(!g.uploaded){const blob=await socialNormaliseUpload(g.file);if(!socialHere(s))return;const path=s.scope.split(':').slice(1).join(':')+'/source/'+crypto.randomUUID()+'.png',r=await supabase.storage.from('club-social-prep').upload(path,blob,{contentType:'image/png',upsert:false});if(r.error)throw Error(r.error.message);g.uploaded=path;}p.source_path=g.uploaded;}
   g.startCommand=p;g.preparation={...p};g.preview=null;socialGuideRemember(g);sessionStorage.setItem('social-prep:'+s.scope,JSON.stringify(p));
  }
  const result=await socialPrepInvoke(s,{action:'start',club_id:s.scope.split(':').slice(1).join(':'),data:g.startCommand});g.preparation={...g.startCommand,id:result.id};g.startCommand=null;sessionStorage.removeItem('social-prep:'+s.scope);socialGuideRemember(g);
 }catch(e){g.preparationError=e.message;if(e.retryable===false){g.startCommand=null;sessionStorage.removeItem('social-prep:'+s.scope);}socialGuideUploadNote(s,e.message,'error');socialGuideRemember(g);}finally{s.busy=false;if(socialHere(s)){socialDraw(s);await socialGuideReload(s);}}
}
async function socialPrepApprove(s){
 const g=socialGuideState(s),job=g.context?.jobs.find(j=>j.id===g.preview);if(!job||s.busy||s.pending)return;if(s.dirty){socialMessage(s,'Save your style before approving this artwork.');return;}
 s.busy=true;socialLock(true);socialMessage(s,'Saving approved artwork…');
 try{const r=await supabase.storage.from('club-social-prep').download(job.result_path);if(r.error)throw Error(r.error.message);const blob=await socialNormaliseUpload(new File([r.data],'prepared.png',{type:'image/png'}));if(!socialHere(s))return;
  const kind=job.kind==='banner'?'sponsors':job.kind==='master'?'background':job.kind,path=s.scope.split(':').slice(1).join(':')+'/'+kind+'/'+crypto.randomUUID()+'.png',upload=await supabase.storage.from('club-socials').upload(path,blob,{contentType:'image/png',upsert:false});if(upload.error)throw Error(upload.error.message);if(!socialHere(s))return;
  const old=socialAsset(s,kind);s.busy=false;const ok=await socialSave(s,'prepare:approve',{id:job.id,path,asset_id:old?.id||null,asset_revision:old?.revision||0,design_revision:s.data.revision,design:s.design});if(ok){g.preview=null;const card=g.returnCard?s.data.fixtures.flatMap(socialCards).find(c=>c.key===g.returnCard):null,asset=s.data.assets.find(a=>a.path===path);if(job.kind==='photo'&&card&&asset)await socialSave(s,'feature',socialFeatureRequest(card,'player',job.roster_id,asset.id));await socialGuideReload(s);}
 }catch(e){socialMessage(s,e.message);}finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
function socialPrepCard(s,job){
 const person=job?.roster_id?s.data.players.find(p=>p.id===job.roster_id):null,returnCard=socialGuideState(s).returnCard,target=returnCard?s.data.fixtures.flatMap(socialCards).find(card=>card.key===returnCard):null,fixture=target?.f;
 if(fixture){const card=target||socialCards(fixture)[0];if(!person)return {card,sample:false};const f={...fixture,features:[...(fixture.features||[]).filter(choice=>choice.day!==card.day+1),{day:card.day+1,mode:'player',roster_id:person.id,asset_id:'prepared-preview'}]};return {card:{...card,f},sample:false};}
 const people=Array.from({length:11},(_,i)=>({id:i===3&&person?person.id:'sample-'+i,name:i===3&&person?person.name:'Example player '+(i+1)})),f={id:'layout-example',round:'1',features:person?[{day:1,mode:'player',roster_id:person.id,asset_id:'prepared-preview'}]:[],published:{details:{grade:'EXAMPLE GRADE',opposition:'Example opposition',format:'limited_overs',overs:40,ground:'Example ground',days:[{date:new Date(Date.now()+7*86400000).toISOString().slice(0,10),start:'10:00'}],match_roles:{d1:{captain_id:people[0].id,keeper_id:people[1].id}}},players:people,slots:people.map(p=>({d1:p.id,d2:null}))}};return {card:{f,day:0,split:false,key:'layout-example:0'},sample:true};
}
async function socialPrepPaint(s,job=null){
 const canvas=document.getElementById('prepCanvas'),label=document.getElementById('prepPreviewLabel');if(!canvas)return;
 const token=crypto.randomUUID();canvas.dataset.paintToken=token;canvas.dataset.previewState='loading';canvas.hidden=true;
 let status=canvas.parentElement.querySelector('.sg-preview-status');if(!status){status=document.createElement('div');status.className='sg-preview-status';status.setAttribute('role','status');canvas.before(status);}
 status.innerHTML='<span class="sg-spinner" aria-hidden="true"></span> Loading preview…';socialGuideNextState(s);
 try{
  if(socialGuideState(s).awardReturn?.kind==='background'){
   if(!job&&socialGuideState(s).fileURL){const key='source-preview:'+socialGuideState(s).fileURL;s.urls.set(key,socialGuideState(s).fileURL);job={local:true,result_path:key};}
   if(!job){status.textContent='Upload an example or background to prepare.';canvas.dataset.previewState='empty';if(label)label.textContent='';return;}
   const source=job.local?s.urls.get(job.result_path):await socialPrepURL(s,'club-social-prep',job.result_path),img=await socialImage(s,source);
   if(!canvas.isConnected||canvas.dataset.paintToken!==token)return;
   canvas.width=img.naturalWidth||img.width;canvas.height=img.naturalHeight||img.height;canvas.getContext('2d').drawImage(img,0,0);canvas.hidden=false;canvas.dataset.previewState='ready';status.textContent='';if(label){const request=socialGuidePreparation(socialGuideState(s));label.textContent=request&&!['ready','approved'].includes(request.state)?'Previous image · requested changes are not shown yet':job.local?'Uploaded image · no AI changes':'Prepared background · review before saving';}return;
  }
  const preview={...s,previewOf:s,requiredPreviewAsset:job?'prepared-preview':null,design:{...s.design},data:{...s.data,assets:[...s.data.assets]},urls:s.urls,images:s.images};
  if(job){
   const kind=job.kind==='banner'?'sponsors':job.kind==='master'?'background':job.kind,url=job.local?s.urls.get(job.result_path):await socialPrepURL(s,'club-social-prep',job.result_path);
   preview.urls.set(job.result_path,url);preview.data.assets=preview.data.assets.filter(a=>kind==='photo'||a.kind!==kind);preview.data.assets.push({id:'prepared-preview',kind,roster_id:job.roster_id,path:job.result_path});
   if(job.kind==='banner')preview.design.header_layout='banner';if(['background','master'].includes(job.kind))preview.design.theme='solid';if(job.kind==='master')preview.design.header_layout='integrated';if(job.kind==='photo'&&preview.design.layout==='list')preview.design.layout='portrait';
  }
  const {card,sample}=socialPrepCard(preview,job);
  const result=await socialRender(preview,card,canvas);
  if(!canvas.isConnected||canvas.dataset.paintToken!==token)return;
  canvas.hidden=false;canvas.dataset.previewState='ready';status.textContent='';
  if(label)label.textContent=(sample?'Sample names · preview only':'Preview with your published team')+(result.warnings?.length?' · '+result.warnings.join(' · '):'');
 }catch(e){
  if(!canvas.isConnected||canvas.dataset.paintToken!==token)return;
  canvas.hidden=true;canvas.dataset.previewState='error';status.innerHTML='<span>Preview could not load. '+seEsc(e.message)+'</span><button type="button" class="btn ghost" id="prepRetryPreview">Retry preview</button>';
  status.querySelector('button').onclick=()=>socialPrepPaint(s,job);
 }finally{if(canvas.isConnected&&canvas.dataset.paintToken===token)socialGuideNextState(s);}
}
function socialGuideFinish(s){
 const g=socialGuideState(s),jobs=g.context?.jobs||[],active=jobs.some(j=>['pending','processing'].includes(j.state)),unreviewed=jobs.filter(j=>j.state==='ready'&&j.kind!=='photo'),background=socialAsset(s,'background');
 document.getElementById('prepStep').innerHTML='<section class="sg-panel"><h3>Confirm your club design</h3><p class="sg-hint">This style and background will be used for your team graphics.</p><div class="sg-split"><div><div class="sg-checklist"><button data-guide-edit="0">Review style</button><button data-guide-edit="1">'+(background?'✓ Background saved':'Add a background')+'</button></div>'+(unreviewed.length?'<p class="notice">'+unreviewed.length+' unused preview'+(unreviewed.length===1?'':'s')+'. Only saved images will be used.</p><button class="btn ghost" id="prepUnreviewed">Review previews</button>':'')+'<p class="sg-hint">Choose each team’s featured player and add their photo on Team Graphics. You can return here whenever your club’s design changes.</p>'+(g.context?.mode==='setup'?'<p class="sg-credits">Finishing pauses AI preparation. Saved images and new uploads remain available.</p>':'')+'<button class="btn" id="prepFinish" '+(active||s.dirty?'disabled':'')+'>Confirm design &amp; open Team Graphics →</button>'+(active?'<p role="status">Your image is still preparing.</p>':'')+'</div>'+socialGuidePreview('Your saved club design')+'</div></section>';
 document.querySelectorAll('[data-guide-edit]').forEach(b=>b.onclick=()=>socialGuideGo(s,Number(b.dataset.guideEdit)));
 document.getElementById('prepUnreviewed')?.addEventListener('click',()=>{const job=unreviewed[0];socialGuideSwitch(g,1);g.kind=job.kind;g.preview=job.id;g.local=null;socialDraw(s);});
 document.getElementById('prepFinish').onclick=async()=>{if(s.busy||s.pending)return;s.busy=true;socialLock(true);try{await socialPrepRPC(s,'complete_setup',{request_id:crypto.randomUUID()});if(!socialHere(s))return;await socialRefresh(s);g.context=null;g.returnCard='';s.view='graphics';socialDraw(s);}catch(e){socialMessage(s,e.message);}finally{s.busy=false;if(socialHere(s))socialDraw(s);}};
 void socialPrepPaint(s);
}
function socialPrepComparison(){return '<div class="social-comparison"><figure><figcaption id="prepReferenceNote">Your club’s example</figcaption><img id="prepReference" hidden alt="Your uploaded design example"></figure><figure><figcaption>Generated announcement preview</figcaption><canvas id="prepCanvas" width="1080" height="1350" aria-label="Prepared artwork preview"></canvas></figure></div>';}
function socialGuideIcon(name){
 const paths={upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',person:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',check:'<path d="m5 12 4 4L19 6"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>'};
 return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.image)+'</svg>';
}
function socialGuideStyles(){return '<style>'+
 '.sg-request-feedback{padding:10px;border-radius:8px;background:#e7eff8;margin:8px 0;font-size:14px}.sg-request-feedback p{margin:6px 0}.sg-request-feedback.error{background:#fff0ee;color:#862c25}.sg-request-feedback.ready{background:#eaf6ee;color:#185b38}.sg-request-brief{white-space:pre-wrap;overflow-wrap:anywhere}.sg-review-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.sg-upload-status{display:flex;align-items:center;gap:9px;min-height:24px;margin:12px 0;font-size:14px;line-height:1.4}.sg-upload-status:empty{display:none}.sg-upload-status.saved{color:#17623d;background:#edf8f0;padding:11px;border-radius:8px}.sg-upload-status.error{color:#962c28;background:#fff0ee;padding:11px;border-radius:8px}.sg-upload-status svg{width:20px;height:20px;flex-shrink:0}.sg-spinner{display:inline-block;width:17px;height:17px;border:2px solid #c5d6e8;border-top-color:#1c5e90;border-radius:50%;animation:sg-spin .8s linear infinite;flex-shrink:0}.sg-preview-status:not(:empty){min-height:250px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;text-align:center;padding:18px;box-sizing:border-box;color:#365a7b}.sg-step{cursor:default!important}.sg-source-preview{height:220px!important}.sg-example-image{display:block;width:100%;height:auto;max-height:570px;object-fit:contain;border-radius:8px}.social-guide .sg-help-choice{display:flex;align-items:center;gap:10px}.social-guide .sg-help-choice input{width:20px;height:20px;flex-shrink:0}.social-guide [hidden]{display:none!important}.sg-footer{background:#fff;border-top:1px solid #e1e7ee;padding:14px 0}.sg-drop.sg-drop-compact{min-height:56px;flex-direction:row;padding:10px}.sg-drop.sg-drop-compact small{display:none}.sg-drop.sg-drop-compact svg{width:22px;height:22px}.sg-review-source{max-height:470px!important}.sg-saved summary{display:flex;align-items:center;gap:8px}.social-guide{max-width:1100px}.sg-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:6px 0 18px}.sg-head h3{font-size:24px;margin:0}.sg-head p{margin:5px 0;color:#576479}.sg-pill{font-size:12px;font-weight:700;border-radius:30px;padding:7px 12px;background:#edf3fa;color:#20426c;white-space:nowrap}.sg-progress{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:20px 0 28px}.sg-step{position:relative;background:none;border:0;color:#58687d;cursor:pointer;font:inherit;display:grid;justify-items:center;gap:8px;padding:0 4px;font-size:13px}.sg-step:before{content:"";position:absolute;top:18px;left:-50%;width:100%;height:2px;background:#dfe6ef}.sg-step:first-child:before{display:none}.sg-step span{position:relative;z-index:1;display:grid;place-items:center;width:36px;height:36px;background:white;border:2px solid #dfe6ef;border-radius:50%;font-weight:750}.sg-step[aria-current=step]{color:#153d6c;font-weight:750}.sg-step[aria-current=step] span{background:#153d6c;border-color:#153d6c;color:white;box-shadow:0 0 0 5px #e9f0f8}.sg-step.is-done span{background:#eaf6ef;border-color:#d0eadb;color:#197045}.sg-step:focus-visible,.sg-thumb:focus-visible,.sg-layout:focus-visible{outline:3px solid #2c8dce;outline-offset:4px}.sg-panel{background:#fff;border:1px solid #dfe5ee;border-radius:16px;padding:24px;min-width:0}.sg-panel h3{margin:0 0 7px;font-size:21px}.sg-hint{color:#617187;font-size:14px;line-height:1.5;margin:4px 0 18px}.sg-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.94fr);gap:26px;align-items:start}.sg-split>*{min-width:0}.sg-preview{background:#f0f4f9;border:1px solid #e2e8f0;border-radius:13px;padding:15px;min-width:0}.sg-preview canvas{display:block;width:100%;height:auto;border-radius:7px;box-shadow:0 4px 18px #15304a1f}.sg-preview figcaption{font-size:13px;font-weight:700;margin-bottom:10px}.sg-preview figure{margin:0}.sg-preview #prepPreviewLabel{font-size:12px;margin:10px 0 0;color:#596b7c}.sg-drop{position:relative;display:flex!important;align-items:center;justify-content:center;flex-direction:column;gap:10px;min-height:135px;padding:20px;border:2px dashed #b8c9dc;border-radius:12px;background:#f7fafd;text-align:center;cursor:pointer;box-sizing:border-box;margin:12px 0!important}.sg-drop:hover,.sg-drop:focus-within{background:#eef5fb;border-color:#2c79b3}.sg-drop>svg{width:30px;height:30px;color:#2b658e}.sg-drop small{font-size:12px;color:#6d7988}.sg-drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.sg-source-preview{width:100%;height:180px;object-fit:contain;display:block;margin-top:12px;background:#f0f4f9;border-radius:10px}.sg-source-preview[hidden]{display:none}.sg-thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;margin:12px 0}.sg-thumb{background:#fff;border:2px solid #e3e9f1;border-radius:10px;padding:6px;cursor:pointer;font:inherit;min-width:0;text-align:left}.sg-thumb[aria-pressed=true]{border-color:#276da3;background:#eef6fc}.sg-thumb img{display:block;width:100%;height:95px;object-fit:contain;background:#eff3f8;border-radius:5px}.sg-thumb span{display:block;font-size:12px;line-height:1.3;padding:5px 2px;overflow-wrap:anywhere}.sg-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px}.sg-fields label{font-size:13px}.social-guide input:not([type=file]):not([type=range]):not([type=color]),.social-guide select,.social-guide textarea{font:inherit;border:1px solid #becada;border-radius:7px;padding:9px;background:white}.social-guide label{font-weight:600;font-size:14px}.social-guide textarea{display:block;margin-top:7px}.sg-details{border-top:1px solid #e3e9f1;margin-top:18px;padding-top:15px}.sg-details summary{cursor:pointer;font-size:14px;color:#315a80;font-weight:600}.sg-layouts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 16px}.sg-layout{background:white;border:2px solid #dfe6ef;border-radius:9px;padding:8px;font:inherit;font-size:12px;cursor:pointer;color:#364f67}.sg-layout[aria-pressed=true]{border-color:#2873aa;background:#eef6fc}.sg-mini{height:68px;border-radius:5px;background:#193d62;display:flex;align-items:center;gap:6px;padding:9px;margin-bottom:6px;box-sizing:border-box}.sg-mini-lines{height:40px;flex:1;background:repeating-linear-gradient(to bottom,#dae6f2 0px,#dae6f2 2px,transparent 2px,transparent 7px);opacity:.8}.sg-mini svg{width:27px;height:38px;color:#8bb9d8}.sg-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:20px;padding-top:16px}.sg-footer .btn{min-height:44px}.sg-footer-end{display:flex;gap:10px;align-items:center}.sg-footer small{color:#607187}.sg-quiet{border:0;background:none;color:#315f85;text-decoration:underline;cursor:pointer;font:inherit;font-size:13px;padding:8px 0}.sg-credits{font-size:12px;color:#68788b;margin:10px 0}.sg-jobs{margin-top:20px}.sg-jobs .social-upload{background:white}.sg-jobs img{height:180px}.sg-badge{display:inline-block;font-size:12px;border-radius:20px;padding:5px 9px;background:#ecf6ef;color:#267047}.sg-review-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.sg-review-actions .btn{flex:1}.sg-empty{min-height:300px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;color:#6c7f94;text-align:center;border:1px dashed #b8c9dc;border-radius:10px}.sg-empty svg{width:50px;height:50px;color:#9bb1c8}.sg-saved{margin-top:20px}.sg-saved h4{margin:0 0 10px;font-size:14px}.sg-saved .social-upload-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-top:10px}.sg-saved .social-upload{padding:10px}.sg-saved img{height:130px}.sg-saved .btn{font-size:12px;padding:7px}.sg-saved strong{font-size:13px}.sg-checklist{display:flex;flex-wrap:wrap;gap:9px;margin:18px 0}.sg-checklist button{border:1px solid #d6e2ee;border-radius:20px;background:#f5f8fb;padding:8px 12px;color:#34576d;font:inherit;font-size:13px;cursor:pointer}.sg-review-source{max-height:220px;display:block;width:100%;object-fit:contain;background:#eff3f7;border-radius:9px}.sg-review-title{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;margin-bottom:12px}.sg-nav-spacer{flex:1}.social-tabs .sg-manager-link{margin-left:auto;font-size:13px}.social-notice:empty{display:none}'+
 '@keyframes sg-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.sg-spinner{animation:none}}@media(max-width:720px){.sg-split{grid-template-columns:1fr;gap:18px}.sg-panel{padding:17px}.sg-head{align-items:flex-start}.sg-head h3{font-size:21px}.sg-pill{font-size:12px;padding:6px 8px}.sg-head p{font-size:13px}.sg-step{font-size:12px}.sg-progress{margin:18px 0 23px}.sg-fields{gap:9px}.sg-footer small{display:none}.sg-footer-end{margin-left:auto}.sg-preview{max-width:460px;width:100%;box-sizing:border-box;margin:auto}.sg-empty{min-height:170px}.social-tabs .sg-manager-link{margin-left:0}.sg-thumbs{grid-template-columns:repeat(3,minmax(0,1fr))}}'+
 '</style>';}
function socialGuideResetImage(g){
 if(g.fileURL)URL.revokeObjectURL(g.fileURL);
 if(g.drafts)delete g.drafts[socialGuideDraftKey(g)];g.failedSource=null;g.uploadNote=null;g.fileURL=null;g.file=null;g.uploaded=null;g.source='';g.brief='';g.preview=null;g.local=null;g.needsHelp=false;g.preparation=null;g.preparationError=null;g.previousPreview=null;g.preparationMode=null;g.autoStart=false;
}
function socialGuideReturnToTeam(s,message=''){
 if(!socialCanLeave())return false;const g=socialGuideState(s),key=g.returnCard;socialGuideRemember(g);
 if(g.awardReturn)return socialGuideReturnToAward(s,g,message);
 if(g.workflowReturn)socialTeamWorkflow.state(s).step=g.workflowReturn;if(key){socialTeamWorkflow.state(s).fixture=key.slice(0,key.lastIndexOf(':'));socialTeamWorkflow.state(s).day=Number(key.slice(key.lastIndexOf(':')+1));}g.returnCard='';g.workflowReturn=null;s.view='graphics';s.notice=message;socialDraw(s);
 requestAnimationFrame(()=>{
  if(!socialHere(s)||s.view!=='graphics')return;
  const canvas=key?document.querySelector(`[data-social-canvas="${CSS.escape(key)}"]`):null,target=canvas?.closest('.social-card')||document.getElementById('socialPage');
  if(!target)return;target.style.scrollMarginTop=Math.max(16,(document.querySelector('.nav')?.getBoundingClientRect().bottom||0)+16)+'px';target.scrollIntoView({block:'start'});
 });return true;
}
async function socialGuideReturnToAward(s,g,message){const target=g.awardReturn;if(target.proposal?.saveUncertain){socialMessage(s,'Save not confirmed. Retry Apply changes before leaving.');return false;}if(target.proposal){target.proposal.undo();socialGuideResetImage(g);g.awardReturn=null;g.workflowReturn=null;s.view=target.view;s.notice='Changes undone.';socialDraw(s);return true;}s.busy=true;socialLock(true);try{if(target.savedAsset){const response=await supabase.storage.from('club-socials').download(target.savedAsset.path);if(response.error)throw Error(response.error.message);await target.apply({blob:response.data,name:target.savedAsset.label||'Player cut-out.png'});}g.awardReturn=null;s.view=target.view;s.notice=message||'Returned to the award graphic.';}catch(e){socialMessage(s,e.message);return false;}finally{s.busy=false;if(socialHere(s))socialDraw(s);}return true;}
async function socialGuideGo(s,step){
 if(s.busy||s.pending)return;const g=socialGuideState(s);
 if(s.dirty&&!await socialSave(s,'settings',{revision:s.data.revision,design:s.design}))return;
 if(!socialHere(s))return;
 if(g.step!==step)socialGuideSwitch(g,step);
 s.notice='';socialDraw(s);document.querySelector('.sg-progress')?.scrollIntoView({block:'start',behavior:'smooth'});
}
function socialGuideEnter(s,step=0,person='',card='',example='',proposal=false){
 if(card&&!socialGuardArtwork(s,'feature',{fixture_id:card.slice(0,card.lastIndexOf(':'))}))return;
 if(!proposal&&!socialCanLeave())return;const g=socialGuideState(s);g.navigationId=crypto.randomUUID();
 if(g.step!==step||step===2&&g.person!==person)socialGuideSwitch(g,step,person);
 if(example){const asset=s.data.assets.find(a=>a.id===example&&['reference','reference_extra'].includes(a.kind));if(!asset)return;socialGuideResetImage(g);g.kind='master';g.source='asset:'+asset.id;g.exampleId=asset.id;g.needsHelp=true;g.skipReady=g.context?g.context.jobs.filter(j=>j.state==='ready').map(j=>j.id):null;socialGuideRemember(g);}
 g.awardReturn=null;g.workflowReturn=step===2?'photos':'artwork';g.returnCard=card;s.view='guide';s.notice='';socialDraw(s);
 document.getElementById('socialPage')?.scrollIntoView({block:'start',behavior:'smooth'});
}
function socialGuidePreview(title='Your team graphic'){
 return '<aside class="sg-preview"><figure><figcaption>'+title+'</figcaption><canvas id="prepCanvas" width="1080" height="1350" aria-label="Team graphic preview"></canvas></figure><p id="prepPreviewLabel"></p></aside>';
}
function socialGuideSources(s,kind){
 const g=socialGuideState(s);
 return s.data.assets.filter(a=>kind==='photo'?(['photo','portrait'].includes(a.kind)&&a.roster_id===g.person)||['reference','reference_extra'].includes(a.kind):['sponsors','background','reference','reference_extra'].includes(a.kind));
}
async function socialGuideSourcePaint(s){
 const g=socialGuideState(s),images=[...document.querySelectorAll('#prepSourceImage,#prepReviewSource')];if(!images.length)return;
 try{let url=g.fileURL;if(!url&&g.source.startsWith('asset:'))url=await socialAssetURL(s,s.data.assets.find(a=>a.id===g.source.slice(6)));else if(!url&&g.source.startsWith('job:')){const j=g.context?.jobs.find(j=>j.id===g.source.slice(4));if(j)url=await socialPrepURL(s,'club-social-prep',j.result_path);}
  const current=g.context?.jobs.find(j=>j.id===g.preview),before=current?.source_path?await socialPrepURL(s,current.source_bucket||'club-social-prep',current.source_path):url;
  for(const img of images)if(img.isConnected&&(img.id==='prepReviewSource'?before:url)){img.src=img.id==='prepReviewSource'?before:url;img.hidden=false;}
 }catch(e){socialMessage(s,e.message);}
}
async function socialGuideOriginalPreview(s){
 const g=socialGuideState(s);if(s.busy||s.pending)return;
 if(g.kind==='photo'&&!g.person||!g.file&&!g.source)return;
 s.busy=true;socialLock(true);socialGuideUploadNote(s,'Preparing preview…');
 try{
  let blob;if(g.file)blob=await socialNormaliseUpload(g.file);
  else{const asset=g.source.startsWith('asset:')?s.data.assets.find(a=>a.id===g.source.slice(6)):null,job=g.source.startsWith('job:')?g.context?.jobs.find(j=>j.id===g.source.slice(4)):null,r=await supabase.storage.from(asset?'club-socials':'club-social-prep').download(asset?.path||job?.result_path);if(r.error)throw Error(r.error.message);blob=await socialNormaliseUpload(new File([r.data],'image.png',{type:'image/png'}));}
  if(!socialHere(s))return;
  const key='local-preview:'+crypto.randomUUID();s.urls.set(key,URL.createObjectURL(blob));
  g.local={kind:g.kind,roster_id:g.kind==='photo'?g.person:null,result_path:key,local:true,blob,label:g.file?.name||'Uploaded image'};g.preview=null;g.failedSource=null;
  socialGuideUploadNote(s,'Image ready — check the preview, then save','ready');socialGuideRemember(g);
 }catch(e){g.failedSource=g.file||g.source;socialGuideUploadNote(s,'Could not prepare this image. '+e.message,'error');}
 finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
async function socialGuideImportSave(s,data){
 // Retain both request IDs in the pending command. A lost reply can be retried
 // without uploading twice or applying the settings revision a second time.
 const asset=await socialRPC(s,data.asset_action,{...data.asset,request_id:data.asset_request_id});
 if(data.design)await socialRPC(s,'settings',{revision:data.design_revision,design:data.design,request_id:data.settings_request_id});
 return asset;
}
async function socialGuideOriginalApprove(s){
 const g=socialGuideState(s),image=g.local;if(!image||g.needsHelp||s.busy||s.pending)return;
 s.busy=true;socialLock(true);socialGuideUploadNote(s,'Saving image…');
 try{
  const kind=image.kind==='master'?'background':image.kind==='banner'?'sponsors':image.kind;
  const existing=await socialFindUploadedImage(s,kind,image.roster_id,image.blob),card=g.returnCard?s.data.fixtures.flatMap(socialCards).find(c=>c.key===g.returnCard):null;
  if(!socialHere(s))return;
  if(existing&&kind==='photo'){
   if(g.awardReturn)g.awardReturn.savedAsset=existing;
   s.busy=false;if(card&&!await socialSave(s,'feature',socialFeatureRequest(card,'player',image.roster_id,existing.id)))return;
   socialGuideResetImage(g);socialGuideUploadNote(s,'Photo already saved — using the existing image','saved');socialGuideRemember(g);return;
  }
  if(!image.savedPath){
   if(existing)image.savedPath=existing.path;
   else{const path=s.scope.split(':').slice(1).join(':')+'/'+kind+'/'+crypto.randomUUID()+'.png';socialGuideUploadNote(s,'Uploading image…');const r=await supabase.storage.from('club-socials').upload(path,image.blob,{contentType:'image/png',upsert:false});if(r.error)throw Error(r.error.message);image.savedPath=path;s.uploadHashes.set(path,await socialUploadFingerprint(image.blob));}
  }
  if(!socialHere(s))return;
  socialGuideUploadNote(s,'Saving image…');const old=socialAsset(s,kind),photo=kind==='photo',design=photo?null:{...s.design,...(image.kind==='master'?{header_layout:'integrated',theme:'solid'}:image.kind==='banner'?{header_layout:'banner'}:{theme:'solid'})};
  s.busy=false;
  await socialSave(s,'guide:import',{asset_action:photo?'add_asset':'save_asset',asset:{kind,path:image.savedPath,...(photo?{roster_id:image.roster_id,label:image.label.replace(/\.[^.]+$/,'').slice(0,120),...(card?{feature:socialFeatureRequest(card,'player',image.roster_id)}:{})}:{asset_id:old?.id||null,revision:old?.revision||0})},design,design_revision:s.data.revision,asset_request_id:crypto.randomUUID(),settings_request_id:crypto.randomUUID()});
 }catch(e){socialGuideUploadNote(s,'Save not completed. '+e.message,'error');}
 finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
async function socialDownloadImage(s,id){
 const asset=s.data.assets.find(a=>a.id===id);if(!asset||s.pending)return;const button=document.querySelector('[data-social-download-image="'+CSS.escape(id)+'"]');if(button?.disabled)return;if(button){button.disabled=true;button.textContent='Downloading…';button.setAttribute('aria-busy','true');}
 try{const response=await supabase.storage.from('club-socials').download(asset.path);if(response.error||!response.data)throw Error(response.error?.message||'The image could not download.');if(!socialHere(s))return;const person=s.data.players.find(p=>p.id===asset.roster_id),cutout=/cut.?out/i.test(asset.label||'');socialBlobDownload(socialSlug(person?.name||asset.label||'Club-image')+(person?(cutout?'-cutout':'-photo'):'')+'.png',response.data);socialMessage(s,'Download started');if(button?.isConnected)button.textContent='Download started';}catch(e){if(socialHere(s))socialMessage(s,e.message);if(button?.isConnected)button.textContent='Download PNG';}finally{if(button?.isConnected){if(button.dataset.socialDisabled!==undefined)button.dataset.socialDisabled='0';else button.disabled=false;button.removeAttribute('aria-busy');}}
}
async function socialGuideSaveAndContinue(s,another=false){
 const g=socialGuideState(s),step=g.step;if(s.busy||s.pending||document.getElementById('prepCanvas')?.dataset.previewState!=='ready')return;
 if(g.returnCard&&!socialGuardArtwork(s,'feature',{fixture_id:g.returnCard.slice(0,g.returnCard.lastIndexOf(':'))}))return;
 const request=socialGuidePreparation(g),job=g.context?.jobs.find(j=>j.id===g.preview&&['ready','approved'].includes(j.state));if(request&&!job)return;
 if(g.awardReturn?.kind==='background')return socialSaveAwardBackground(s,job);
 if(job?.state==='approved'){try{const r=await supabase.storage.from('club-social-prep').download(job.result_path);if(r.error||!r.data)throw Error(r.error?.message||'Saved version could not load.');g.local={kind:job.kind,roster_id:job.roster_id,blob:r.data,label:'Prepared photo.png'};g.preview=null;g.preparation=null;g.needsHelp=false;await socialGuideOriginalApprove(s);}catch(e){socialGuideUploadNote(s,e.message,'error');return;}}else if(job)await socialPrepApprove(s);else await socialGuideOriginalApprove(s);
 if(!socialHere(s)||s.pending||g.local||g.preview)return;
 if(another&&!g.returnCard&&!g.awardReturn){socialGuideSwitch(g,2,'');socialDraw(s);}else if(step===2||g.workflowReturn)await socialGuideReturnToTeam(s,step===2?'Player photo saved ✓':'Background saved ✓');else await socialGuideGo(s,socialGuideSteps(g).next);
}
async function socialSaveAwardBackground(s,job){
 const g=socialGuideState(s),target=g.awardReturn;if(!target||(!job&&(!g.local||g.needsHelp)))return;
 s.busy=true;socialLock(true);socialGuideUploadNote(s,'Saving background…');
 try{
  const result=job?await supabase.storage.from('club-social-prep').download(job.result_path):{data:g.local.blob};
  if(result.error||!result.data)throw Error(result.error?.message||'The prepared background could not load.');
  if(!socialHere(s)||s.view!=='guide'||g.awardReturn!==target)return;
  s.view=target.view;
  if(target.proposal){target.proposal.saveUncertain=true;await target.proposal.beforeApply?.();}
  await target.apply({blob:result.data,name:'Prepared background.png'});
  target.proposal?.applied();
  if(!socialHere(s)||s.view!==target.view||g.awardReturn!==target)return;
  socialGuideResetImage(g);g.awardReturn=null;g.workflowReturn=null;socialGuideRemember(g);s.view=target.view;s.notice='Background saved ✓';
 }catch(e){if(socialHere(s)&&g.awardReturn===target&&s.view===target.view)s.view='guide';socialGuideUploadNote(s,'Save not completed. '+e.message,'error');}
 finally{s.busy=false;if(socialHere(s))socialDraw(s);}
}
function socialAwardBackground(s,file,apply,options={}){
 if(!options.proposal&&!socialCanLeave())return;if(options.proposal&&!file)throw Error('Upload a background or example before requesting an artwork change.');const view=s.view;s.deferNavigation=true;socialGuideEnter(s,1,'','','',!!options.proposal);s.deferNavigation=false;const g=socialGuideState(s);socialGuideResetImage(g);
 g.kind='master';g.awardReturn={kind:'background',view,apply,proposal:options.proposal};g.autoStart=!!options.proposal;g.file=file||null;g.fileURL=file?URL.createObjectURL(file):null;g.needsHelp=true;g.preparationMode=options.mode||'template';g.brief=String(options.brief||'').slice(0,1500);
 g.skipReady=g.context?g.context.jobs.filter(j=>j.state==='ready').map(j=>j.id):null;socialGuideRemember(g);socialDraw(s);
}
function socialGuideNextState(s){
 const g=socialGuideState(s),button=document.getElementById('prepNext');if(!button)return;
 const request=socialGuidePreparation(g),ready=g.context?.jobs.find(j=>j.id===g.preview&&['ready','approved'].includes(j.state)),draft=ready||g.local,active=['pending','processing','unconfirmed'].includes(request?.state)||g.context?.jobs.some(j=>j.kind===g.kind&&['pending','processing'].includes(j.state));
 button.hidden=g.step===2&&!draft&&!active;button.disabled=!!(s.busy||s.pending);button.onclick=()=>g.step===2||g.workflowReturn?socialGuideReturnToTeam(s):socialGuideGo(s,socialGuideSteps(g).next);
 if(draft){
  button.textContent=g.step===2?(g.awardReturn?'Save photo & back to award →':'Save photo & back to team →'):'Use this background →';
  button.disabled||=!!(g.needsHelp&&!ready)||document.getElementById('prepCanvas')?.dataset.previewState!=='ready';
  button.onclick=()=>socialGuideSaveAndContinue(s);
 }else if(active){button.disabled=true;button.textContent='Preparing image…';}
 else if(g.step===1&&!socialAsset(s,'background')){button.disabled=true;button.textContent='Choose your background';}
 if(active||request&&!ready||g.uploadNote?.state==='error'&&(g.file||g.source)){button.disabled=true;}
 const save=document.getElementById('prepSaveVersion');if(save){save.disabled=button.disabled;button.hidden=true;}
 const another=document.getElementById('prepSaveAnother');if(another)another.disabled=button.disabled;
}
async function socialFindUploadedImage(s,kind,person,blob){
 const hash=await socialUploadFingerprint(blob);s.uploadHashes||=new Map();
 const refs=['reference','reference_extra'].includes(kind);
 const candidates=s.data.assets.filter(a=>refs?['reference','reference_extra'].includes(a.kind):a.kind===kind&&(a.roster_id||null)===(person||null));
 for(const a of candidates){
  let saved=s.uploadHashes.get(a.path);
  if(!saved){try{const result=await supabase.storage.from('club-socials').download(a.path);if(result.error||!result.data)continue;saved=await socialUploadFingerprint(result.data);s.uploadHashes.set(a.path,saved);}catch{continue;}}
  if(saved===hash)return a;
 }
 return null;
}
async function socialUploadFingerprint(blob){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
}
function socialGuideSaved(s,command,result){
 const g=socialGuideState(s);
 if(g.awardReturn&&['guide:import','prepare:approve'].includes(command.action)){
  const asset=s.data.assets.find(a=>a.id===result?.id)||s.data.assets.find(a=>a.path===(command.data.asset?.path||command.data.path));
  if(asset&&['photo','portrait'].includes(asset.kind)&&asset.roster_id===g.person)g.awardReturn.savedAsset=asset;
 }
 if(command.action==='add_asset'){
  g.exampleId=result.id;g.showStylePreview=false;
  socialGuideUploadNote(s,command.data.kind==='photo'?'Photo uploaded and saved':'Example uploaded and saved','saved');
 }else if(['guide:import','prepare:approve'].includes(command.action)){
  socialGuideUploadNote(s,g.step===2?'Player photo saved':'Background saved','saved');
 }
}
function socialGuideUploadStatus(s){
 const note=socialGuideState(s).uploadNote;
 return '<div id="prepUploadStatus" class="sg-upload-status '+(note?.state||'')+'" role="status" aria-live="polite">'+(note?(note.state==='working'?'<span class="sg-spinner" aria-hidden="true"></span>':note.state==='saved'?socialGuideIcon('check'):'')+'<span>'+seEsc(note.text)+'</span>':'')+'</div>';
}
function socialGuideUploadNote(s,text,state='working'){
 const g=socialGuideState(s);g.uploadNote={text,state};
 const host=document.getElementById('prepUploadStatus');if(host){host.className='sg-upload-status '+state;host.innerHTML=(state==='working'?'<span class="sg-spinner" aria-hidden="true"></span>':state==='saved'?socialGuideIcon('check'):'')+'<span>'+seEsc(text)+'</span>';}
}
function socialGuideSwitch(g,step,person){
 socialGuideRemember(g);if(g.step===2)g.lastPerson=g.person;g.step=step;
 if(step===2&&person===undefined)person=g.lastPerson||'';
 if(person!==undefined)g.person=person;
 const key=socialGuideDraftKey(g),draft=g.drafts[key];
 Object.assign(g,{kind:step===2?'photo':'master',brief:'',source:'',file:null,fileURL:null,uploaded:null,preview:null,local:null,needsHelp:false,skipPreview:null,skipReady:[],uploadNote:null,failedSource:null,preparation:null,preparationError:null,previousPreview:null,preparationMode:null},draft||{});
}
function socialGuideRemember(g){
 g.drafts||={};const draft={};
 for(const key of ['kind','person','brief','source','file','fileURL','uploaded','preview','local','needsHelp','skipPreview','skipReady','uploadNote','failedSource','preparation','preparationError','previousPreview','preparationMode'])draft[key]=g[key];
 g.drafts[socialGuideDraftKey(g)]=draft;
}
function socialGuideDraftKey(g){return g.step+':'+(g.step===2?g.person||'':'');}
async function socialReviewUpdatedAward(s,edition){
 if(!socialHere(s)||!socialCanLeave())return false;
 if(!['team_week','player_week','results','five_wickets','century'].includes(edition.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(edition.week_end||''))return false;
 const api=edition.kind==='team_week'?socialWeek:edition.kind==='player_week'?socialPlayerWeek:socialAwards,w=api.state(s);
 const different=w.end!==edition.week_end||(w.context?.award_scope?.key||'all')!==(edition.award_scope?.key||'all');
 const draft=w.designDirty===true||w.layoutDirty||w.rows?.length||w.winner||w.photo||w.blurb;
 if(different&&draft&&!confirm('Open this saved award’s week and selection groups? Your current award draft will be replaced.'))return false;
 try{
  await socialAwardScopes.review(s,edition.kind,edition.award_scope);
  if(!socialHere(s))return false;
  socialAdoptResultsWeek(s,edition.week_end);s.view=edition.kind;
  if(different)await socialAwardScopeChanged(s,edition.kind);
  else if(api===socialAwards)await api.load(s,false);else await api.load(s,{preserve:true});
  socialDraw(s);return true;
 }catch(e){socialMessage(s,e.message);return false;}
}
async function socialAwardScopeChanged(s,kind){
 const api=kind==='team_week'?socialWeek:kind==='player_week'?socialPlayerWeek:socialAwards,w=api.state(s);
 Object.assign(w,{context:null,sharedStale:false,attempted:false,loadAttempted:false,rows:[],winner:null,photo:null,blurb:'',saved:null,savedImage:null,prepared:null,preparedImage:null,contextPlayer:null,focus:null,chosen:new Set(),graphicAssistant:null,previewReady:false,includeDay1:api===socialAwards?{}:false});
 if(s.results){s.results.context=null;s.results.attempted=false;s.results.ack=null;s.results.token++;}
 if(api===socialAwards)await api.load(s,false);else await api.load(s,{preserve:false});
}
let socialAwardScopes,socialAwardLabels,socialAwardLabelHooks,socialResults,socialAwards,socialPlayerWeek,socialWeek,socialSandbox,socialTeamWorkflow,socialPublishing,graphicGrade,checkGraphicLabel,teamSelectionText;
let socialFeaturesTask=null;
async function initialiseSocialFeatures(){
 if(socialPublishing)return;
 if(!socialFeaturesTask)socialFeaturesTask=(async()=>{
  const modules=await Promise.all([import('./social-award-scopes.js?v=0.8.62.288'),import('./social-awards.js?v=0.8.62.304'),import('./social-team-workflow.js?v=0.8.62.303'),import('./social-publishing.js?v=0.8.62.303'),import('./team-of-week.js?v=0.8.62.288'),import('./shared-match-results.js?v=0.8.62.288'),import('./social-award-labels.js?v=0.8.62.288'),import('./player-of-week.js?v=0.8.62.288'),import('./social-sandbox.js?v=0.8.62.288'),import('./social-graphic-design.js?v=0.8.62.288'),import('./social-team-layout.js?v=0.8.62.288')]);
  const {createSocialAwardScopes}=modules[0];
  const {createSocialAwards}=modules[1];
  const {createTeamSocialWorkflow}=modules[2];
  const {createSocialPublishing}=modules[3];
  const {createTeamOfWeek,teamWeekLayout}=modules[4];
  const {createSharedMatchResults}=modules[5];
  const {createSocialAwardLabels}=modules[6];
  const {createPlayerOfWeek}=modules[7];
  const {createSocialSandbox}=modules[8];
  ({graphicGrade,checkGraphicLabel}=modules[9]);
  ({teamSelectionText}=modules[10]);
socialAwardScopes=createSocialAwardScopes({supabase,here:socialHere,draw:socialDraw,canEdit:s=>{if(s.view==='team_week'&&s.week?.designDirty||s.view==='player_week'&&s.playerWeek?.layoutDirty){socialMessage(s,'Save the award layout before changing selection groups.');return false;}return socialCanLeave();},message:socialMessage,changed:socialAwardScopeChanged,locked:s=>!!(s.busy||s.results?.busy||s.week?.busy||s.week?.pending||s.playerWeek?.busy||s.playerWeek?.pending||s.awards?.busy||s.awards?.pending||s.awards?.loading)});
socialAwardLabels=createSocialAwardLabels({supabase,here:socialHere,draw:socialDraw,canEdit:socialCanLeave,message:socialMessage});
socialAwardLabelHooks={scopeRequest:socialAwardScopes.request,adoptScope:socialAwardScopes.adopt,loadLabel:socialLoadAwardLabel,reloadLabel:(s,end)=>socialAwardLabels.load(s,end,{reload:true}),saveLabel:(s,end,label)=>socialAwardLabels.save(s,end,label),labelReady:(s,end)=>socialAwardLabels.ready(s,end)&&!(s.awardScopes?.draft||s.awardScopes?.pending||s.awardScopes?.busy)};
socialResults=createSharedMatchResults({scopeControls:socialAwardScopes.controls,bindScope:socialAwardScopes.bind,scopeIdentity:socialAwardScopes.identity,scopeRequest:socialAwardScopes.resultsRequest,labelControls:socialAwardLabels.controls,bindLabels:socialAwardLabels.bind,locked:s=>!!(s.busy||s.week?.busy||s.week?.pending||s.playerWeek?.busy||s.playerWeek?.pending||s.awards?.busy||s.awards?.pending),supabase,openFixture:socialOpenFixture,escape:seEsc,here:socialHere,canLeave:socialCanLeave,setWeek:socialSetResultsWeek,adoptWeek:socialAdoptResultsWeek,changed:socialResultsChanged,extractUrl:matchReviewExtractUrl,teamCheck:mountScorecardTeam,message:socialMessage,confirm:message=>confirm(message)});
socialAwards=createSocialAwards({...socialAwardLabelHooks,sharedResults:true,checkResults:(s,end)=>socialResults.check(s,end),reviewUpdatedAward:socialReviewUpdatedAward,navigation:recordSelectionNavigation,supabase,openBackground:socialAwardBackground,escape:seEsc,here:socialHere,draw:socialDraw,message:socialMessage,canLeave:socialCanLeave,image:socialImage,fontReady:socialFontReady,text:socialText,download:socialBlobDownload,
 openScores:(s)=>socialResults.open(s),
 savedPhotos:s=>s.data.assets.filter(a=>['portrait','photo'].includes(a.kind)).map(a=>({id:a.id,name:(s.data.players.find(p=>p.id===a.roster_id)?.name||'Player')+' · '+(a.label||'Photo')})),
 savedPhoto:async(s,id)=>{const a=s.data.assets.find(a=>a.id===id);if(!a)throw Error('Photo not found');const r=await supabase.storage.from('club-socials').download(a.path);if(r.error)throw Error(r.error.message);return {blob:r.data,name:a.label||'Saved player photo.png'};},
 openCutout:async(s,item,file,apply)=>{const view=s.view,matches=s.data.players.filter(p=>p.active!==false&&(p.external_id===item.player_id||p.name.trim().toLowerCase()===item.name.trim().toLowerCase())),person=matches.length===1?matches[0].id:'';s.deferNavigation=true;socialGuideEnter(s,2,person);s.deferNavigation=false;const g=socialGuideState(s);g.awardReturn={view,apply,savedAsset:null};if(file){socialGuideResetImage(g);g.file=file;g.fileURL=URL.createObjectURL(file);g.needsHelp=true;socialGuideRemember(g);}s.notice=person?'Create and save the cut-out, then return to the award.':'Select '+item.name+' from your players before creating the cut-out.';socialDraw(s);},
 reviewAwards:async(s,items,caption)=>{const w=s.awards;if(w.busy)return;w.busy=true;const button=document.getElementById('saReviewPost'),label=button?.textContent;if(button){button.disabled=true;button.textContent='Checking results…';}try{if(await socialResults.check(s,w.end,{award_edition_ids:items.map(e=>e.id)}))return await socialPublishing.startAwards(s,items,caption);}finally{w.busy=false;if(socialHere(s)&&['awards','award_collection','results','five_wickets','century'].includes(s.view))socialAwards.render(s);else if(button?.isConnected){button.disabled=false;button.textContent=label;}}},postingHistory:(s,host)=>socialPublishing.awardsHistory(s,host)});
socialPlayerWeek=createPlayerOfWeek({...socialAwardLabelHooks,sharedResults:true,postPreview:(s,host,locked)=>socialAwards.mountPost(s,host,locked),savedAward:(s,id)=>socialAwards.addToPost(s,id),checkResults:(s,end)=>socialResults.check(s,end),navigation:recordSelectionNavigation,supabase,openBackground:socialAwardBackground,escape:seEsc,here:socialHere,normalize:socialNormaliseUpload,download:socialBlobDownload,image:socialImage,fontReady:socialFontReady,text:socialText,openScores:(s)=>socialResults.open(s),savedPhotos:s=>s.data.assets.filter(a=>['portrait','photo'].includes(a.kind)).map(a=>({id:a.id,name:(s.data.players.find(p=>p.id===a.roster_id)?.name||'Player')+' · '+(a.label||'Photo')})),savedPhoto:async(s,id)=>{const asset=s.data.assets.find(a=>a.id===id);if(!asset)throw Error('Photo not found');return await (await fetch(await socialAssetURL(s,asset))).blob();}});
socialWeek=createTeamOfWeek({...socialAwardLabelHooks,sharedResults:true,postPreview:(s,host,locked)=>socialAwards.mountPost(s,host,locked),savedAward:(s,id)=>socialAwards.addToPost(s,id),checkResults:(s,end)=>socialResults.check(s,end),teamCheck:mountScorecardTeam,navigation:recordSelectionNavigation,supabase,openBackground:socialAwardBackground,escape:seEsc,here:socialHere,extractUrl:matchReviewExtractUrl,normalize:socialNormaliseUpload,download:socialBlobDownload,image:socialImage,fontReady:socialFontReady,fitImage:socialFitImage,text:socialText});
socialSandbox=createSocialSandbox({here:socialHere,escape:seEsc,defaults:socialDefaults,groups:()=>ensureSelections().data?.groups||[],cards:socialCards,featured:socialFeatured,renderImage:socialRender,normalize:socialNormaliseUpload,message:socialMessage,download:socialBlobDownload,applyDesign:async(s,design)=>{if(s.busy||s.pending)return;if(await socialSave(s,'settings',{revision:s.data.revision,design}))socialMessage(s,'Club layout saved for upcoming teams.');}});
socialTeamWorkflow=createTeamSocialWorkflow({supabase,refresh:socialRefresh,editBackground:socialTeamEditBackground,navigation:recordSelectionNavigation,escape:seEsc,date:socialDate,calendar:socialFixtureCalendar,calendarCompleted:socialCalendarCompleted,completed:socialFixtureCompleted,here:socialHere,canLeave:socialCanLeave,draw:socialDraw,save:socialSave,defaults:socialDefaults,asset:socialAsset,uploadCard:socialUploadCard,galleryCard:socialGalleryCard,bindUploads:socialBindUploads,bindGallery:socialBindGallery,cards:socialCards,sample:socialPrepCard,renderImage:socialRender,photoControls:socialPhotoControls,bindPhotos:socialBindTeamPhotos,oversNotice:socialOversNotice,prepare:socialGuideEnter,prepareExample:(s,id)=>socialGuideEnter(s,1,'','',id),selection:socialSelection,caption:socialCaption,download:socialDownload,history:socialShowHistory,rpc:socialRPC,message:socialMessage,posting:s=>socialPublishing.mount(s)});
socialPublishing=createSocialPublishing({canSetupPlatform:()=>platformRole==='owner',renderPlatformSetup:host=>renderSocialPlatformSetup({supabase,host,escape:seEsc}),back:appNavigationBack,supabase,escape:seEsc,date:socialDate,here:socialHere,draw:socialDraw,message:socialMessage,lock:socialLock,selection:socialSelection,cards:socialCards,renderImage:socialRender,artwork:socialRPC,refresh:socialRefresh,current:()=>socialState,returnToTeams:()=>{ensureSelections().view='published';drawSelections();void seReload().then(()=>drawSelections()).catch(()=>seNotice('Refresh Teams to check your current access.'));},demo:false});
 })().catch(error=>{socialFeaturesTask=null;throw error;});
 return socialFeaturesTask;
}
function socialAdoptResultsWeek(s,end){
 s.resultsWeek=end;
 for(const api of [socialAwards,socialWeek,socialPlayerWeek]){
  const w=api.state(s);if(w.end===end)continue;
  Object.assign(w,{end,context:null,attempted:false,loadAttempted:false,title:'',blurb:'',message:'',rows:[],winner:null,photo:null,saved:null,savedImage:null,contextPlayer:null,focus:null,caption:'',drafts:{},refinements:{},graphicAssistant:null,selectedSources:new Set(),selected:new Set(),chosen:new Set()});
 }
}
async function socialResultsChanged(s){
 const api=s.view==='team_week'?socialWeek:s.view==='player_week'?socialPlayerWeek:socialAwards;
 api.state(s).sharedStale=false;
 if(api===socialAwards){await api.load(s,false);if(socialHere(s))api.render(s);}else{socialAwards.state(s).sharedStale=false;await socialAwards.load(s,false);await api.load(s,{preserve:true});}
 for(const other of [socialWeek,socialPlayerWeek])if(other!==api)other.state(s).sharedStale=true;
}
function socialSetResultsWeek(s,end){socialAdoptResultsWeek(s,end);socialDraw(s);}
async function socialLoadAwardLabel(s,end){const label=await socialAwardLabels.load(s,end);if(socialHere(s)&&s.resultsWeek===end)socialResults.mount(s,end);return label;}
async function socialTeamEditBackground(s,brief,options={}){
 if(!options.proposal&&!socialCanLeave())return;const asset=socialAsset(s,'background')||socialAsset(s,'reference');
 try{const saved=asset?await supabase.storage.from('club-socials').download(asset.path):null;if(saved?.error)throw Error(saved.error.message);if(!socialHere(s))return;
 socialAwardBackground(s,saved?.data?new File([saved.data],asset.label||'Team background.png',{type:saved.data.type||'image/png'}):null,async output=>{
  const path=s.scope.split(':').slice(1).join(':')+'/background/'+crypto.randomUUID()+'.png',upload=await supabase.storage.from('club-socials').upload(path,output.blob,{contentType:'image/png',upsert:false});if(upload.error)throw Error(upload.error.message);
  const previous=socialAsset(s,'background');s.busy=false;try{if(!await socialSave(s,'save_asset',{kind:'background',path,asset_id:previous?.id||null,revision:previous?.revision||0}))throw Error('The background save was not confirmed. Use Retry save.');}finally{s.busy=true;}
 },{mode:asset?.kind==='background'?'edit':'template',brief,...options});
 }catch(e){if(options.proposal)throw e;socialMessage(s,e.message);}
}
return {socialOpen:socialOpen,socialGuideState:socialGuideState,socialGuideSwitch:socialGuideSwitch,socialAdoptResultsWeek:socialAdoptResultsWeek,socialResultsChanged:socialResultsChanged,socialDefaults:socialDefaults,socialStyles:socialStyles,loadSocialFeatures:initialiseSocialFeatures,get controllers(){return {socialAwardScopes,socialAwardLabels,socialResults,socialAwards,socialPlayerWeek,socialWeek,socialSandbox,socialTeamWorkflow,socialPublishing};}};
}
