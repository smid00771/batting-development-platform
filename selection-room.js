// Selection Room: stable DOM keeps video and drafts intact while the board redraws.
export function selectionCallLink(value){
 const text=String(value||'').trim();if(!text)return '';
 let u;try{u=new URL(text);}catch{throw Error('Paste a Teams, Google Meet or Zoom meeting link.');}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname.length<2||/[\s\\]/.test(text)||!(/^(teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft|meet\.google\.com)$/.test(host)||/^([a-z0-9-]+\.)*zoom\.(us|com)$/.test(host)))throw Error('Paste a Teams, Google Meet or Zoom meeting link.');
 return u.href;
}

// Fit the visible viewport, including browser zoom and the on-screen keyboard.
export function selectionRoomGeometry(viewport,docked=true){
 const width=Math.max(1,viewport.width),height=Math.max(1,viewport.height),left=viewport.left||0,top=viewport.top||0;
 const gap=Math.min(width/8,height/8,width<600?8:12),wide=width>=900;
 const panelWidth=Math.min(width-2*gap,wide?(docked?Math.max(320,Math.min(420,width*.34)):1100):440);
 const inset=Math.min(height-2*gap,Math.max(wide&&height>=650?76:gap,(viewport.insetTop||0)+gap)),available=height-inset-gap,panelHeight=wide?available:Math.min(720,height*.8,available);
 return {left:left+width-gap-panelWidth,top:top+(wide?inset:height-gap-panelHeight),width:panelWidth,height:panelHeight,gap,wide};
}

export function createSelectionRoom(h){
 let room=null,dailyPromise=null;
 const same=s=>room===s&&h.scope()?.key===s.scope.key;
 const el=(s,key)=>s.panel.querySelector('[data-sr="'+key+'"]');
 const text=(s,key,value)=>{const n=el(s,key);if(n)n.textContent=value;};
 function styles(){
  if(document.getElementById('selection-room-style'))return;
  const style=document.createElement('style');style.id='selection-room-style';
  style.textContent=`
  .sr-room{position:fixed;right:12px;top:76px;bottom:12px;width:min(1100px,calc(100% - 24px));max-width:calc(100% - 16px);max-height:calc(100dvh - 16px);min-width:0;min-height:0;z-index:90;display:flex;flex-direction:column;box-sizing:border-box;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 8px 30px #14244726;color:#24344c;font:14px/1.45 system-ui,sans-serif;overflow:hidden}
  .sr-room *{box-sizing:border-box}.sr-room [hidden]{display:none!important}
  .sr-room button,.sr-room .sr-link{min-height:40px;border:1px solid #cbd5e1;border-radius:7px;padding:8px 10px;background:white;color:#24344c;font-family:inherit;font-weight:600;font-size:13px;line-height:1.25;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
  .sr-room button:disabled{opacity:.55;cursor:default}.sr-room button:focus-visible,.sr-room a:focus-visible{outline:2px solid #335ba7;outline-offset:2px}.sr-room .sr-primary{background:#17245f;color:white;border-color:#17245f}
  .sr-room header{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:10px 12px;border-bottom:1px solid #e2e8f0;flex:none;min-width:0}.sr-room header>div{flex:1;min-width:0;overflow-wrap:anywhere}.sr-room h2{font-size:17px;line-height:1.25;margin:0}.sr-room small{display:block;font-size:11px;color:#64748b}.sr-room header button{padding:6px 8px;flex-shrink:0}.sr-room [data-sr=close]{min-width:36px}
  .sr-room .sr-body{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 290px;flex:1}
  .sr-video-section{min-width:0;min-height:0;display:flex;flex-direction:column;padding:14px 16px;overflow:auto;border-right:1px solid #e2e8f0}
  .sr-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;flex:none}.sr-status{font-size:12px;color:#52647b;margin:7px 0;white-space:pre-wrap;overflow-wrap:anywhere;flex:none}.sr-status:empty{display:none}
  .sr-join-help{font-size:12px;color:#52647b;margin:0 0 8px;flex:none}.sr-presence{flex:none;margin:0 0 8px}.sr-presence p{font-weight:600;font-size:13px;margin:0}.sr-people{list-style:none;display:flex;flex-wrap:wrap;gap:5px;max-height:72px;overflow:auto;margin:6px 0 0;padding:0}.sr-people li{font-size:12px;background:#edf5f1;border:1px solid #cfdfd6;border-radius:20px;padding:3px 9px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sr-video{flex:1;min-height:160px;margin-top:4px;background:#15243d;border-radius:8px;overflow:hidden}.sr-video iframe{display:block;width:100%;height:100%;border:0}.sr-video-empty{flex:1;min-height:100px;display:grid;place-items:center;padding:24px;border:1px dashed #cbd5e1;border-radius:8px;background:#f6f8fb;color:#64748b;text-align:center;font-size:14px}
  .sr-backup{margin-top:10px;flex:none}.sr-backup form{margin-top:8px}.sr-room input,.sr-room textarea{width:100%;font:16px/1.4 system-ui,sans-serif;border:1px solid #bdc9da;border-radius:7px;padding:9px;color:#24344c;background:white}.sr-room label{font-size:12px;display:block;margin-bottom:5px}.sr-backup form .sr-actions{margin-top:7px}
  .sr-chat-section{min-width:0;min-height:0;display:flex;flex-direction:column}.sr-chat-heading{display:flex;justify-content:space-between;align-items:center;padding:14px 12px 0;gap:8px;flex:none}.sr-chat-heading h3{font-size:14px;margin:0}.sr-chat-heading button{font-size:11px;min-height:30px;padding:5px 8px}.sr-chat-section>.sr-status{margin:7px 12px}
  .sr-messages{flex:1;min-height:80px;overflow:auto;padding:8px 12px;overscroll-behavior:contain}.sr-message{padding:8px 0;border-bottom:1px solid #eef2f6}.sr-message>div{display:flex;gap:6px;align-items:baseline;justify-content:space-between}.sr-message strong{font-size:12px;overflow-wrap:anywhere;min-width:0}.sr-message time{font-size:10px;color:#64748b;white-space:nowrap}.sr-message p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.sr-empty{color:#64748b;font-size:13px}
  .sr-compose{padding:9px 12px 12px;border-top:1px solid #e2e8f0;flex:none}.sr-compose textarea{resize:vertical;min-height:65px;max-height:160px}.sr-compose .sr-actions{justify-content:space-between;margin-top:6px}.sr-compose .sr-status{flex:1;margin:0}
  .sr-room.sr-wide.sr-docked header{display:grid;grid-template-columns:minmax(0,1fr) auto auto}.sr-room.sr-wide.sr-docked header>div{grid-column:1/3;grid-row:1}.sr-room.sr-wide.sr-docked [data-sr=close]{grid-column:3;grid-row:1}.sr-room.sr-wide.sr-docked [data-sr=layout]{grid-column:1;grid-row:2;justify-self:start}.sr-room.sr-wide.sr-docked [data-sr=toggle]{grid-column:2/4;grid-row:2;justify-self:end}
  .sr-room.sr-wide.sr-docked .sr-body{display:flex;flex-direction:column;overflow:hidden}.sr-room.sr-wide.sr-docked .sr-video-section{display:block;flex:0 1 auto;max-height:52%;min-height:0;overflow:auto;border-right:0;border-bottom:1px solid #e2e8f0;padding:10px 12px}.sr-room.sr-wide.sr-docked .sr-video{height:clamp(140px,30dvh,280px);min-height:0}.sr-room.sr-wide.sr-docked .sr-video-empty{display:none}.sr-room.sr-wide.sr-docked .sr-chat-section{flex:1;min-height:0;overflow:auto}.sr-room.sr-wide.sr-docked .sr-messages{min-height:30px}.sr-room.sr-wide.sr-docked .sr-compose textarea{min-height:46px;max-height:80px;resize:none}.sr-room.sr-wide.sr-docked .sr-chat-heading{padding-top:8px}.sr-room.sr-wide.sr-docked small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sr-room.sr-wide.sr-short.sr-docked .sr-video-section{max-height:44%}.sr-room.sr-wide.sr-short .sr-compose{padding:7px 12px}.sr-room.sr-wide.sr-short .sr-compose label{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden}.sr-room.sr-wide.sr-short .sr-compose textarea{height:46px;min-height:46px;max-height:46px}
  body.sr-wide.sr-docked:not(.sr-minimized) #sePage{margin-right:calc(var(--selection-room-width,420px) + 20px);max-width:none;min-width:0}body.sr-wide.sr-docked:not(.sr-minimized) .se-board-layout{grid-template-columns:minmax(0,1fr)}
  .sr-room.sr-minimized{height:auto;max-width:calc(100% - 16px)}.sr-room.sr-minimized .sr-body,.sr-room.sr-minimized [data-sr=layout]{display:none}.sr-room.sr-minimized header{border-bottom:0}.sr-room.sr-wide.sr-minimized header{display:flex}.sr-room.sr-wide.sr-minimized header>div{flex:1}
  .sr-room:not(.sr-wide) header{padding:12px}.sr-room:not(.sr-wide) .sr-body{display:flex;flex-direction:column;overflow:auto}.sr-room:not(.sr-wide) .sr-video-section{display:block;flex:none;overflow:visible;padding:10px 12px;border-right:0;border-bottom:1px solid #e2e8f0}.sr-room:not(.sr-wide) .sr-video{height:230px;min-height:0;max-height:28dvh;margin-top:8px}.sr-room:not(.sr-wide) .sr-video-empty{display:none}.sr-room:not(.sr-wide) .sr-chat-section{flex:1;min-height:235px}.sr-room:not(.sr-wide) .sr-chat-heading{padding-top:8px}.sr-room:not(.sr-wide) .sr-compose textarea{max-height:100px}
  `;document.head.append(style);
 }
 function fit(s){
  if(!same(s))return;const v=window.visualViewport,viewport={width:Math.min(document.documentElement.clientWidth||window.innerWidth,v?.width||window.innerWidth),height:v?.height||window.innerHeight,left:v?.offsetLeft||0,top:v?.offsetTop||0};viewport.insetTop=Math.max(0,(document.getElementById('demoToolbar')?.getBoundingClientRect().bottom||0)-viewport.top);const g=selectionRoomGeometry(viewport,s.docked);
  s.panel.classList.toggle('sr-wide',g.wide);s.panel.classList.toggle('sr-short',viewport.height<650);document.body.classList.toggle('sr-wide',g.wide);document.body.style.setProperty('--selection-room-width',g.width+'px');
  const width=s.minimized?Math.min(g.width,380):g.width;Object.assign(s.panel.style,{left:(g.left+g.width-width)+'px',right:'auto',bottom:'auto',width:width+'px',height:s.minimized?'auto':g.height+'px',maxHeight:(viewport.height-2*g.gap)+'px'});
  s.panel.style.top=(s.minimized?viewport.top+viewport.height-g.gap-Math.min(s.panel.getBoundingClientRect().height,viewport.height-2*g.gap):g.top)+'px';
  el(s,'layout').hidden=!g.wide;
 }
 function scheduleFit(s){if(s.layoutFrame)return;s.layoutFrame=window.requestAnimationFrame(()=>{s.layoutFrame=null;fit(s);});}
 function persist(s){try{sessionStorage.setItem('selection-room-draft-'+s.scope.key,JSON.stringify({draft:s.draft,pending:s.pending}));}catch{}}
 function setMinimized(s,value){s.minimized=value;s.panel.classList.toggle('sr-minimized',value);document.body.classList.toggle('sr-minimized',value);text(s,'toggle',value?'Show room':'Hide room');el(s,'toggle').setAttribute('aria-expanded',String(!value));fit(s);}
 function setDocked(s,value){s.docked=value;s.panel.classList.toggle('sr-docked',value);document.body.classList.toggle('sr-docked',value);text(s,'layout',value?'Expand video':'Board + video');el(s,'layout').setAttribute('aria-pressed',String(!value));fit(s);}
 function sync(){if(room&&!same(room))close(true);}
 function close(force=false){
  const s=room;if(!s)return true;
  if(!force&&(s.frame||s.joining)&&!window.confirm('Leave the video call and close Selection Room?'))return false;
  room=null;persist(s);clearInterval(s.timer);s.observer?.disconnect();if(s.layoutFrame)window.cancelAnimationFrame(s.layoutFrame);window.removeEventListener('resize',s.resize);window.visualViewport?.removeEventListener('resize',s.resize);window.visualViewport?.removeEventListener('scroll',s.resize);leave(s,false);s.panel.remove();document.body.classList.remove('sr-open','sr-minimized','sr-docked','sr-wide');document.body.style.removeProperty('--selection-room-width');window.removeEventListener('beforeunload',s.unload);return true;
 }
 function messageRows(s,messages,{older=false}={}){
  const box=el(s,'messages'),height=box.scrollHeight,scroll=box.scrollTop,atBottom=height-scroll-box.clientHeight<70;
  let added=false;
  for(const m of messages||[]){
   if(s.messages.has(m.id))continue;s.messages.set(m.id,m);added=true;
   const article=document.createElement('article');article.className='sr-message';article.dataset.messageId=m.id;
   const line=document.createElement('div'),name=document.createElement('strong'),time=document.createElement('time'),body=document.createElement('p');
   name.textContent=m.author_name;time.dateTime=m.created_at;time.textContent=new Date(m.created_at).toLocaleString('en-AU',{timeZone:s.scope.timezone||'Australia/Sydney',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});body.textContent=m.body;
   line.append(name,time);article.append(line,body);
   const next=[...box.querySelectorAll('[data-message-id]')].find(n=>BigInt(n.dataset.messageId)>BigInt(m.id));box.insertBefore(article,next||null);
  }
  el(s,'empty').hidden=s.messages.size>0;
  if(added){if(older)box.scrollTop=scroll+box.scrollHeight-height;else if(atBottom)box.scrollTop=box.scrollHeight;}
 }
 function backup(s){
  const cfg=s.config||{},link=el(s,'backupLink'),edit=el(s,'editBackup');let url='';try{url=selectionCallLink(cfg.backup_url);}catch{}
  link.hidden=!url;if(url)link.href=url;else link.removeAttribute('href');edit.hidden=!cfg.can_manage;edit.textContent=url?'Change backup call':'Add backup call';
  if(!cfg.can_manage)el(s,'backupForm').hidden=true;
  el(s,'backup').hidden=!url&&!cfg.can_manage;
 }
 async function refresh(s,{older=false}={}){
  if(!same(s)||s.loading)return;s.loading=true;
  const ids=[...s.messages.keys()].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1),data=older?{before:ids[0]}:ids.length?{after:ids.at(-1)}:{};
  try{
   const result=await h.rpc(s.scope,'context',data);if(!same(s))return;
   s.config=result;messageRows(s,result.messages,{older});backup(s);
   if(older||!ids.length)el(s,'older').hidden=!result.has_older;
   text(s,'connection','');el(s,'retry').hidden=true;
  }catch(error){
   if(!same(s))return;
   if(error.code==='42501'||error.status===403){close(true);h.notice?.('Selection Room is available to assigned selectors only.');return;}
   text(s,'connection','Connection lost. Your draft is kept.');el(s,'retry').hidden=false;
  }finally{s.loading=false;}
 }
 function compose(s){
  const area=el(s,'message'),button=el(s,'send');area.disabled=!!s.pending;button.disabled=s.sending||!s.draft.trim();button.textContent=s.sending?'Sending…':s.pending?'Retry send':'Send';
 }
 async function send(s){
  if(!same(s)||s.sending||!s.draft.trim())return;
  if(!s.pending)s.pending={request_id:crypto.randomUUID(),body:s.draft.trim()};persist(s);s.sending=true;compose(s);text(s,'sendStatus','');
  try{
   const result=await h.rpc(s.scope,'post',s.pending);if(!same(s))return;
   messageRows(s,[result.message]);s.pending=null;s.draft='';el(s,'message').value='';persist(s);text(s,'sendStatus','Sent');
  }catch(error){if(same(s))text(s,'sendStatus',error.code==='42501'?'Selector access is required.':'Send not confirmed. Retry sends this message once.');}
  finally{s.sending=false;if(same(s))compose(s);}
 }
 async function saveBackup(s){
  if(s.savingBackup||!same(s))return;
  let url;try{url=selectionCallLink(el(s,'backupUrl').value);}catch(error){text(s,'backupStatus',error.message);return;}
  s.savingBackup=true;el(s,'saveBackup').disabled=true;text(s,'saveBackup','Saving…');
  try{
   const result=await h.rpc(s.scope,'save_backup',{url,revision:s.editRevision});if(!same(s))return;
   s.config={...s.config,...result};el(s,'backupForm').hidden=true;backup(s);text(s,'backupStatus',url?'Backup call saved.':'Backup call removed.');
  }catch(error){if(same(s))text(s,'backupStatus',error.message);}
  finally{s.savingBackup=false;if(same(s)){el(s,'saveBackup').disabled=false;text(s,'saveBackup','Save call link');}}
 }
 function videoControls(s){
  el(s,'join').hidden=!s.videoReady||!!s.frame&&!s.videoError;el(s,'join').disabled=s.joining;text(s,'join',s.joining?'Connecting…':s.videoError?'Retry video':'Join video');
  el(s,'leave').hidden=!s.frame&&!s.joining;el(s,'video').hidden=!s.frame;el(s,'checkVideo').hidden=s.videoReady||s.joining||!!s.frame;
  el(s,'videoEmpty').hidden=!!s.frame;text(s,'videoEmpty',s.joining?'Preparing video…':s.videoReady?'Join video to see who is in the call.':'Selection chat is ready.');
  el(s,'presence').hidden=!s.inCall||!!s.videoError;
 }
 function participants(s,frame){
  if(!same(s)||s.frame!==frame||!s.inCall||s.videoError)return;
  let list;try{list=Object.values(frame.participants());}catch{s.participantSignature=null;text(s,'callPresence','Participant list unavailable.');el(s,'people').replaceChildren();text(s,'subtitle','In video call · '+s.scope.club_name);return;}
  const names=list.filter(Boolean).sort((a,b)=>Number(b.local)-Number(a.local)||String(a.user_name||'').localeCompare(String(b.user_name||''))).map(p=>p.local?'You':String(p.user_name||'Selector').trim()||'Selector');
  const signature=JSON.stringify(names);if(signature===s.participantSignature)return;s.participantSignature=signature;
  const count=names.length,alone=count===1&&list.some(p=>p?.local);
  text(s,'callPresence',alone?'Only you are in the call.':count?'In this call · '+count:'Checking who is in the call…');
  text(s,'subtitle','In video call'+(alone?' · only you':count?' · '+count+' joined':''));
  const people=el(s,'people');people.replaceChildren();people.hidden=count<2;
  for(const name of names){const item=document.createElement('li');item.textContent=name;item.title=name;people.append(item);}
 }
 function videoFailure(s,error){
  const detail=typeof error==='string'?error:error?.errorMsg||error?.error?.msg||error?.message;
  const message=typeof detail==='string'?detail.replace(/https?:\/\/[^\s]+/gi,'[video address]').replace(/\b[A-Za-z0-9_-]{40,}(?:\.[A-Za-z0-9_-]+)*\b/g,'[hidden]').replace(/\s+/g,' ').trim().slice(0,320):'';
  s.videoError=message||'Video could not connect. Try again.';s.joining=false;s.inCall=false;s.participantSignature=null;
  if(['exp-room','exp-token'].includes(error?.error?.type)||/call has ended|room has expired|token has expired/i.test(s.videoError))s.videoRequest=null;
  text(s,'videoStatus',s.videoError);text(s,'subtitle','Selectors only · '+s.scope.club_name);videoControls(s);
 }
 async function videoStatus(s){
  if(!same(s)||s.statusLoading)return;s.statusLoading=true;el(s,'checkVideo').disabled=true;if(!s.frame&&!s.joining&&!s.videoError)text(s,'videoStatus','Checking video…');
  try{
   const result=await h.video(s.scope,'status',{});if(!same(s))return;s.videoReady=result.available===true;
   if(!s.frame&&!s.joining&&!s.videoError)text(s,'videoStatus',s.videoReady?'Video ready · calls last up to 90 minutes.':result.reason==='billing_required'?'Video is not enabled for this club yet. Chat is ready.':result.reason==='demo'?'Demo: chat is local. Live video is available in your club.':'Video is not connected yet. Chat is ready.');
  }catch{if(same(s)&&!s.frame&&!s.videoError)text(s,'videoStatus','Video connection could not be checked. Chat is still available.');}
  finally{s.statusLoading=false;s.statusChecked=Date.now();if(same(s)){el(s,'checkVideo').disabled=false;videoControls(s);}}
 }
 async function daily(){
  if(h.loadDaily)return h.loadDaily();
  if(!dailyPromise)dailyPromise=import('https://cdn.jsdelivr.net/npm/@daily-co/daily-js@0.93.0/dist/daily-esm.js').then(m=>m.default).catch(error=>{dailyPromise=null;throw error;});
  return dailyPromise;
 }
 function leave(s,show=true){
  ++s.joinSequence;const frame=s.frame;s.frame=null;s.joining=false;s.videoRequest=null;s.videoError='';s.inCall=false;s.participantSignature=null;el(s,'people').replaceChildren();
  if(frame)try{s.videoCleanup=Promise.resolve(frame.destroy()).catch(()=>{});}catch{s.videoCleanup=Promise.resolve();}
  if(show&&same(s)){el(s,'video').replaceChildren();videoControls(s);text(s,'videoStatus','You left the call.');text(s,'subtitle','Selectors only · '+s.scope.club_name);}
 }
 async function join(s){
  if(!same(s)||s.joining||s.frame&&!s.videoError||!s.videoReady)return;
  if(s.frame){const request=s.videoRequest;leave(s,false);s.videoRequest=request;}
  s.videoError='';s.joining=true;const sequence=++s.joinSequence;s.videoRequest ||= crypto.randomUUID();videoControls(s);text(s,'videoStatus','Preparing video…');
  try{
   await s.videoCleanup;if(!same(s)||sequence!==s.joinSequence)return;
   const provider=await daily();if(!same(s)||sequence!==s.joinSequence)return;
   const data=await h.video(s.scope,'join',{request_id:s.videoRequest});if(!same(s)||sequence!==s.joinSequence)return;
   const u=new URL(data.url);if(u.protocol!=='https:'||!u.hostname.endsWith('.daily.co')||u.username||u.password)throw Error('The video room could not be verified.');
   const frame=provider.createFrame(el(s,'video'),{iframeStyle:{width:'100%',height:'100%',border:'0'},showLeaveButton:true});s.frame=frame;videoControls(s);text(s,'videoStatus','Check your camera and microphone below.');
   frame.on('joined-meeting',()=>{if(same(s)&&s.frame===frame){s.joining=false;s.inCall=true;videoControls(s);text(s,'subtitle','In video call · '+s.scope.club_name);text(s,'videoStatus','Connected · call ends '+new Date(data.expires_at).toLocaleTimeString('en-AU',{timeZone:s.scope.timezone||'Australia/Sydney',hour:'numeric',minute:'2-digit'}));participants(s,frame);}});
   for(const event of ['participant-joined','participant-updated','participant-left'])frame.on(event,()=>participants(s,frame));
   frame.on('left-meeting',()=>{if(same(s)&&s.frame===frame&&!s.videoError)leave(s);});
   frame.on('error',error=>{if(same(s)&&s.frame===frame)videoFailure(s,error);});
   frame.on('camera-error',()=>{if(same(s)&&s.frame===frame&&!s.videoError)text(s,'videoStatus','Camera or microphone unavailable. Check the device controls below.');});
   await frame.join({url:u.href,token:data.token,userName:data.user_name});
  }catch(error){
   if(same(s)&&sequence===s.joinSequence&&!s.videoError)videoFailure(s,error);
  }finally{if(same(s)&&sequence===s.joinSequence){s.joining=false;videoControls(s);}}
 }
 async function open(){
  const scope=h.scope();if(!scope)return;
  if(room&&same(room)){setMinimized(room,false);return;}
  close(true);styles();
  let saved={};try{saved=JSON.parse(sessionStorage.getItem('selection-room-draft-'+scope.key)||'{}');}catch{}
  if(!saved||typeof saved!=='object')saved={};
  if(!saved.pending||typeof saved.pending.body!=='string'||typeof saved.pending.request_id!=='string')saved.pending=null;
  const panel=document.createElement('aside');panel.className='sr-room';panel.setAttribute('aria-label','Selection Room');
  panel.innerHTML=`<header><div><h2>Selection Room</h2><small data-sr="subtitle"></small></div><button type="button" data-sr="layout" aria-pressed="false">Expand video</button><button type="button" data-sr="toggle" aria-expanded="true" title="Keep the call connected while hiding the room">Hide room</button><button type="button" data-sr="close" aria-label="Close Selection Room" title="Close Selection Room">×</button></header><div class="sr-body"><section class="sr-video-section" aria-label="Selection video"><div class="sr-actions"><button type="button" class="sr-primary" data-sr="join" hidden>Join video</button><button type="button" data-sr="leave" hidden>Leave video</button><button type="button" data-sr="checkVideo">Check video connection</button></div><p data-sr="videoStatus" class="sr-status" role="status">Checking video…</p><p class="sr-join-help">Other selectors join here using <strong>Join video</strong>. No invitations are sent.</p><div data-sr="presence" class="sr-presence" hidden><p data-sr="callPresence" role="status"></p><ul data-sr="people" class="sr-people" aria-label="People in this call" hidden></ul></div><div data-sr="videoEmpty" class="sr-video-empty">Join video to see who is in the call.</div><div data-sr="video" class="sr-video" hidden></div><div data-sr="backup" class="sr-backup" hidden><div class="sr-actions"><a class="sr-link" data-sr="backupLink" target="_blank" rel="noopener noreferrer" hidden>Join backup call ↗</a><button type="button" data-sr="editBackup" hidden>Add backup call</button></div><form data-sr="backupForm" hidden><label for="srBackupUrl">Teams, Google Meet or Zoom link</label><input id="srBackupUrl" data-sr="backupUrl" type="url" maxlength="2048"><div class="sr-actions"><button class="sr-primary" data-sr="saveBackup" type="submit">Save call link</button><button data-sr="cancelBackup" type="button">Cancel</button></div></form><p data-sr="backupStatus" class="sr-status" role="status"></p></div></section><section class="sr-chat-section" aria-label="Selection chat"><div class="sr-chat-heading"><h3>Selection chat</h3><button type="button" data-sr="older" hidden>Earlier messages</button><button type="button" data-sr="retry" hidden>Reconnect chat</button></div><p data-sr="connection" class="sr-status" role="status"></p><div data-sr="messages" class="sr-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Private selector messages"><p data-sr="empty" class="sr-empty">No messages yet.</p></div><form class="sr-compose" data-sr="compose"><label for="srMessage">Message to selectors</label><textarea id="srMessage" data-sr="message" rows="2" maxlength="1500" placeholder="Discuss selections…"></textarea><div class="sr-actions"><p data-sr="sendStatus" class="sr-status" role="status"></p><button type="submit" data-sr="send" class="sr-primary">Send</button></div></form></section></div>`;
  const s={scope,panel,messages:new Map(),draft:typeof saved.draft==='string'?saved.draft:'',pending:saved.pending||null,config:null,frame:null,joining:false,joinSequence:0};room=s;document.body.append(panel);document.body.classList.add('sr-open');
  text(s,'subtitle','Selectors only · '+scope.club_name);el(s,'message').value=s.draft;compose(s);
  setDocked(s,true);el(s,'layout').onclick=()=>{setMinimized(s,false);setDocked(s,!s.docked);};
  s.resize=()=>scheduleFit(s);window.addEventListener('resize',s.resize);window.visualViewport?.addEventListener('resize',s.resize);window.visualViewport?.addEventListener('scroll',s.resize);
  el(s,'close').onclick=()=>close();el(s,'toggle').onclick=()=>setMinimized(s,!s.minimized);
  el(s,'message').oninput=e=>{s.draft=e.target.value;persist(s);compose(s);text(s,'sendStatus','');};
  el(s,'message').onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void send(s);}};
  el(s,'compose').onsubmit=e=>{e.preventDefault();void send(s);};el(s,'older').onclick=()=>void refresh(s,{older:true});el(s,'retry').onclick=()=>void refresh(s);
  el(s,'editBackup').onclick=()=>{el(s,'backupForm').hidden=false;el(s,'backupUrl').value=s.config.backup_url||'';s.editRevision=s.config.revision;text(s,'backupStatus','');el(s,'backupUrl').focus();};
  el(s,'cancelBackup').onclick=()=>{if(!s.savingBackup)el(s,'backupForm').hidden=true;};el(s,'backupForm').onsubmit=e=>{e.preventDefault();void saveBackup(s);};
  el(s,'join').onclick=()=>void join(s);el(s,'leave').onclick=()=>leave(s);el(s,'checkVideo').onclick=()=>void videoStatus(s);
  s.unload=e=>{if(s.frame||s.joining){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',s.unload);
  s.observer=new MutationObserver(sync);s.observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  s.timer=setInterval(()=>{sync();if(!same(s))return;if(document.visibilityState==='hidden'&&!s.frame)return;void refresh(s);if(Date.now()-(s.statusChecked||0)>30000)void videoStatus(s);},3000);
  await Promise.allSettled([refresh(s),videoStatus(s)]);
 }
 return {open,close,sync,isOpen:()=>!!room};
}
