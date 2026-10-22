const fixtureMemory=()=>{const data=new Map();return {getItem:key=>data.get(String(key))??null,setItem:(key,value)=>data.set(String(key),String(value)),removeItem:key=>data.delete(String(key)),clear:()=>data.clear()};};
const fixtureLocalStorage=fixtureMemory(),fixtureSessionStorage=fixtureMemory();
// Downloaded files and the HTTP preview may not expose randomUUID(). These IDs
// are for fictional in-memory rows only, never authentication or credentials.
if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);};
window.__fixtureLogs=[];
window.__fixtureLog=(kind,value)=>window.__fixtureLogs.push({kind,value});
window.__fixtureError=message=>{window.__fixtureLog('error',message);const node=document.getElementById('demoStatus');if(node){node.textContent=message;node.hidden=false;}};
window.addEventListener('error',event=>window.__fixtureError(event.message));
window.addEventListener('unhandledrejection',event=>window.__fixtureError(event.reason?.message||String(event.reason)));
const demoNetworkError=()=>{throw Error('This fictional demo does not connect to external services.');};
window.fetch=async()=>demoNetworkError();
window.XMLHttpRequest=class{open(){demoNetworkError();}};
window.WebSocket=class{constructor(){this.readyState=3;}addEventListener(){}removeEventListener(){}close(){}send(){demoNetworkError();}};
window.EventSource=class{constructor(){demoNetworkError();}};
if(navigator.sendBeacon)navigator.sendBeacon=()=>false;
const demoBrowserOpen=window.open?.bind(window);
window.open=(url,...args)=>{if(!url||url==='about:blank')return demoBrowserOpen?.(url,...args);window.__fixtureError('Demo only: no messages, invitations or external connections are sent.');return null;};
window.__fixtureUnsupported=(name,args)=>{window.__fixtureLog('unsupported',name);return {data:null,error:{code:'DEMO_ONLY',message:'This action needs a live club. Nothing has been sent or changed outside this demo.'}};};
window.__fixtureDb={from:(...args)=>window.__fixtureFrom(...args),rpc:(...args)=>window.__fixtureRpc(...args),functions:{invoke:async(...args)=>window.__fixtureUnsupported(...args)},auth:{signOut:async()=>window.__fixtureUnsupported('signOut')}};
