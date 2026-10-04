/* Club Batting .79. Cache only public offline assets, never authenticated screens or API data. */
const CACHE='club-batting-offline-v79';
const ROOT=new URL('./',self.location.href);
const STATIC=['offline.html','icons/club-batting-192.png','icons/club-batting-512.png'].map(p=>new URL(p,ROOT).href);
// Public images/offline assets are best effort: a missing file must not stop push setup.
self.addEventListener('install',event=>event.waitUntil((async()=>{
 try{
  const cache=await caches.open(CACHE);
  await Promise.allSettled(STATIC.map(async url=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
   try{const response=await fetch(url,{cache:'reload',signal:controller.signal});if(response.ok)await cache.put(url,response);}
   finally{clearTimeout(timer);}
  }));
 }catch{}
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 try{for(const key of await caches.keys())if(key.startsWith('club-batting-offline-')&&key!==CACHE)await caches.delete(key);}catch{}
 await self.clients.claim();
})()));
async function phoneOfflineResponse(){
 try{const response=await caches.match(new URL('offline.html',ROOT).href);if(response)return response;}catch{}
 return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Club Batting · Reconnect</title><body style="font:17px/1.5 system-ui;padding:24px;color:#17245f"><h1>You’re offline</h1><p>Club Batting needs an internet connection to load and save your club’s current information.</p><button onclick="location.reload()">Try again</button></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
}
self.addEventListener('fetch',event=>{
 // All application and API requests remain fresh network requests. Navigation gets an honest offline fallback.
 if(event.request.mode==='navigate'&&new URL(event.request.url).origin===ROOT.origin)
  event.respondWith(fetch(event.request).catch(phoneOfflineResponse));
});
function bindingStore(mode,operation){return new Promise((resolve,reject)=>{const req=indexedDB.open('club-batting-phone',1);req.onupgradeneeded=()=>req.result.createObjectStore('device');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('device',mode),r=operation(tx.objectStore('device'));let value;r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
function appUrl(raw){try{const u=new URL(raw,ROOT);return u.origin===ROOT.origin&&u.pathname===new URL('app.html',ROOT).pathname?u:null;}catch{return null;}}
self.addEventListener('message',event=>{
 if(event.data?.type==='CB_BIND')event.waitUntil(bindingStore('readwrite',s=>s.put(event.data.binding||null,'binding')).then(()=>event.ports?.[0]?.postMessage({ok:true})));
 if(event.data?.type==='CB_SIGN_OUT')event.waitUntil((async()=>{await bindingStore('readwrite',s=>s.delete('binding'));for(const n of await self.registration.getNotifications())n.close();try{await self.registration.pushManager.getSubscription().then(s=>s?.unsubscribe());}catch{}event.ports?.[0]?.postMessage({ok:true});})());
});
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data?.json();}catch{return;}
 const binding=await bindingStore('readonly',s=>s.get('binding'));
 if(!binding||data?.binding!==binding)return; // Account changed or explicitly signed out.
 const url=appUrl(data.url);if(!url)return;
 await self.registration.showNotification('Club Batting',{body:data.body==='You have a new club message.'?data.body:'You have a new coaching update.',
  icon:new URL('icons/club-batting-192.png',ROOT).href,tag:String(data.tag||'club-batting').slice(0,180),data:{url:url.href,binding},renotify:false});
 if(self.navigator.setAppBadge)try{await self.navigator.setAppBadge();}catch{}
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const binding=await bindingStore('readonly',s=>s.get('binding'));if(!binding||event.notification.data?.binding!==binding)return;
 const url=appUrl(event.notification.data?.url);if(!url)return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const existing=windows.find(w=>appUrl(w.url));
 if(existing){await existing.focus();existing.postMessage({type:'CB_OPEN',url:url.href});}
 else await self.clients.openWindow(url.href);
})());});
