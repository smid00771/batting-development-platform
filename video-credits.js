// Balances are participant-seconds; show the equivalent time for four people.
export function videoTime(seconds){
 const minutes=Math.floor(Math.max(0,Number(seconds)||0)/240);
 if(!minutes)return seconds>0?'Less than 1 min':'0 min';
 return [Math.floor(minutes/60)?Math.floor(minutes/60)+' hr':'',minutes%60?minutes%60+' min':''].filter(Boolean).join(' ');
}
export function videoDuration(seconds){
 const n=Math.max(0,Math.round(Number(seconds)||0));
 return [n>=3600?Math.floor(n/3600)+' hr':'',n>=60?Math.floor(n/60)%60+' min':'',n%60?n%60+' sec':''].filter(Boolean).join(' ')||'0 min';
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountVideoCredits(host,{rpc,compact=false,timezone='Australia/Sydney',openWindow=(...args)=>window.open(...args)}={}){
 let balance,loading=false,busy=false,disposed=false,expanded=false,detailsOpen=false,request=null,message='',checkoutUrl='',activePack='';
 const money=(amount,currency='aud')=>new Intl.NumberFormat('en-AU',{style:'currency',currency:currency.toUpperCase(),currencyDisplay:'code',maximumFractionDigits:0}).format(amount/100).replace('AUD','A$').replace(/\s/g,'');
 function render(){
  if(disposed||!host.isConnected)return;
  if(!balance){host.innerHTML='<p class="help" role="status">'+esc(loading?'Loading video balance…':message||'Loading video balance…')+'</p>'+(message?'<button class="btn ghost" type="button" data-vc="refresh" '+(loading?'disabled':'')+'>'+(loading?'Loading…':'Retry balance')+'</button>':'');bind();return;}
  const b=balance,pilot=b.kind==='complimentary',date=b.renews_at?new Date(b.renews_at).toLocaleDateString('en-AU',{timeZone:timezone,day:'numeric',month:'short',year:'numeric'}):'';
  const held=b.held_seconds>0?` · ${esc(videoTime(b.held_seconds))} reserved`:'';
  const last=b.latest_call,lastDate=last?.created_at?new Date(last.created_at).toLocaleDateString('en-AU',{timeZone:timezone,day:'numeric',month:'short'}):'';
  const usage=last?(last.status==='confirmed'?`${last.call_seconds==null?'':videoDuration(last.call_seconds)+' connected · '}${last.people} ${last.people===1?'person':'people'} · ${videoDuration(last.participant_seconds/4)} credit used`:last.status==='review'?'Usage needs checking; time remains reserved.':`Usage pending; room closes ${new Date(last.expires_at).toLocaleTimeString('en-AU',{timeZone:timezone,hour:'numeric',minute:'2-digit'})}.`):'';
  host.innerHTML=`${compact?`<details data-vc="details" ${detailsOpen?'open':''} style="margin:6px 0;font:12px/1.45 system-ui;color:#24344c"><summary style="cursor:pointer;padding:7px 9px;border:1px solid ${b.low?'#d7a642':'#dce2ee'};border-radius:7px;background:${b.low?'#fff8e9':'#f6f8fb'}"><strong>${b.low?'Low video time':'Video'}: ${esc(videoTime(b.available_seconds))} available${held}</strong></summary><div style="padding:8px 2px 2px">`:`<div style="border:1px solid ${b.low?'#d7a642':'#dce2ee'};border-radius:8px;padding:14px;margin:8px 0;background:${b.low?'#fff8e9':'#f6f8fb'};font:13px/1.45 system-ui;color:#24344c">`}
   ${compact?'':'<h2 style="font-size:18px;margin:0 0 8px">Selection Room video</h2>'}
   ${compact?(pilot?'<p style="margin:0 0 4px">Complimentary video</p>':''):`<strong>${esc(videoTime(b.available_seconds))} available${held}${pilot?' · complimentary':''}</strong>`}
   <p style="margin:4px 0;font-size:12px">Time for four people; more people use it faster.</p>
   ${pilot?'':`<p style="margin:4px 0;font-size:12px">Included: ${esc(videoTime(b.included_remaining_seconds))} · Purchased: ${esc(videoTime(b.purchased_remaining_seconds))}</p>`}
   ${b.held_seconds>0?'<p style="margin:4px 0;font-size:12px">Reserved time is temporary. Only verified connected time is used; unused credit returns after the room closes and the usage check completes.</p>':''}
   ${last?`<p data-vc="latestCall" style="margin:4px 0;font-size:12px">Latest call (${esc(lastDate)}): ${esc(usage)}</p>`:''}
   ${b.debt_seconds>0?'<p style="margin:4px 0">A refunded purchase has reduced your available time.</p>':''}
   ${b.low?`<p role="status" style="margin:6px 0"><strong>${b.available_seconds?'Video time is running low.':'No video time is currently available.'}</strong> ${b.can_manage&&!pilot?'Add time below.':pilot?'Your complimentary allowance renews automatically.':'Ask Club Admin to add time.'} Selection chat stays available.</p>`:''}
   ${!compact?`<p style="margin:6px 0;font-size:12px">${pilot?'Complimentary allowance renews':'Six included hours renew'} ${esc(date||'when access starts')}.${pilot?'':' Purchased time carries forward.'}</p>`:''}
   <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:8px">${b.can_top_up?'<button class="btn ghost" type="button" data-vc="toggle" aria-expanded="'+expanded+'">'+(expanded?'Close top-ups':'Add video time')+'</button>':''}<button class="btn ghost" type="button" data-vc="refresh" ${loading||busy?'disabled':''}>${loading?'Refreshing…':'Refresh balance'}</button></div>
   ${expanded&&b.can_top_up?`<div style="margin-top:10px"><p style="margin:4px 0">One-off purchase via Stripe.</p><div style="display:flex;flex-wrap:wrap;gap:7px">${(b.packs||[]).map(p=>`<button class="btn ghost" type="button" data-vc-pack="${esc(p.code)}" ${busy?'disabled':''}>${busy&&activePack===p.code?'Opening checkout…':'Buy '+esc(p.label)+' — '+esc(money(p.amount_cents,p.currency))}</button>`).join('')}</div></div>`:''}
   ${b.can_manage&&!pilot&&!b.payments_ready?'<p style="font-size:12px;margin:7px 0">Top-ups are not available yet.</p>':''}
   ${message||checkoutUrl?`<p role="status" style="margin:6px 0 0">${esc(message)}${checkoutUrl?` <a href="${esc(checkoutUrl)}" target="_blank" rel="noopener noreferrer">Open secure checkout ↗</a>`:''}</p>`:''}
   ${!compact&&b.history?.length?`<details style="margin-top:10px"><summary>Recent purchases</summary><ul>${b.history.map(p=>`<li>${esc(new Date(p.paid_at).toLocaleDateString('en-AU',{timeZone:timezone}))} · ${esc(videoTime(p.seconds))} · ${esc(money(p.amount_cents,p.currency))}${p.refunded_cents?' · '+esc(money(p.refunded_cents,p.currency))+' refunded':''}</li>`).join('')}</ul></details>`:''}
  </div>${compact?'</details>':''}${compact&&!detailsOpen&&message&&!checkoutUrl?`<p role="status" style="margin:4px 0;font-size:12px">${esc(message)}</p>`:''}`;bind();
 }
 function bind(){
  const details=host.querySelector('[data-vc="details"]');
  details?.addEventListener('toggle',()=>{if(details.isConnected)detailsOpen=details.open;});
  host.querySelector('[data-vc="refresh"]')?.addEventListener('click',()=>void reload({feedback:true}));
  host.querySelector('[data-vc="toggle"]')?.addEventListener('click',()=>{expanded=!expanded;render();});
  host.querySelectorAll('[data-vc-pack]').forEach(b=>b.addEventListener('click',()=>void buy(b.dataset.vcPack)));
 }
 async function reload({feedback=false}={}){
  if(disposed||loading||busy)return;loading=true;render();
  try{const next=await rpc('balance',{});if(disposed)return;balance=next;message=checkoutUrl?'Your balance updates when payment is confirmed.':feedback?'Balance refreshed.':'';}
  catch(e){message=e.message||'Video balance could not load.';}
  finally{loading=false;render();}
 }
 async function buy(code){
  if(busy||disposed||!balance?.can_top_up)return;
  busy=true;activePack=code;message='Opening secure checkout…';checkoutUrl='';
  if(request?.pack_code!==code)request={request_id:crypto.randomUUID(),pack_code:code};
  render();let popup;
  try{popup=openWindow('about:blank','_blank');if(popup){popup.opener=null;try{popup.document.body.textContent='Opening secure checkout…';}catch{}}}catch{popup=null;}
  try{
   const result=await rpc('checkout',request);if(disposed){popup?.close();return;}
   const url=new URL(result.url);if(url.origin!=='https://buy.stripe.com'||url.username||url.password||!url.searchParams.get('client_reference_id'))throw Error('Checkout could not be verified.');
   checkoutUrl=url.href;message='Complete payment in Stripe. Credit appears here after confirmation.';request=null;
   try{if(popup&&!popup.closed)popup.location.replace(url.href);}catch{/* The checkout link remains available below. */}
  }catch(e){popup?.close();message=e.message||'Checkout could not open. Try again.';if(/expired/i.test(message))request=null;}
  finally{busy=false;activePack='';render();}
 }
 const focus=()=>{if(host.isConnected)void reload();else destroy();};window.addEventListener('focus',focus);
 const observer=new MutationObserver(()=>{if(!host.isConnected)destroy();});observer.observe(document.body,{childList:true,subtree:true});
 function destroy(){disposed=true;window.removeEventListener('focus',focus);observer.disconnect();}
 function collapse(){if(compact){detailsOpen=false;expanded=false;render();}}
 void reload();return {reload,destroy,collapse};
}
