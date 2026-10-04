/* Club Batting .77. Cache only public offline assets, never authenticated screens or API data. */
const CACHE='club-batting-offline-v77';
const ROOT=new URL('./',self.location.href);
const STATIC=['offline.html','icons/club-batting-192.png','icons/club-batting-512.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{await (await caches.open(CACHE)).addAll(STATIC);await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('club-batting-offline-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 // All application and API requests remain fresh network requests. Navigation gets an honest offline fallback.
 if(event.request.mode==='navigate'&&new URL(event.request.url).origin===ROOT.origin)
  event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('offline.html',ROOT).href)));
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
