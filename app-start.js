// The branded HTML is already visible before this small loader runs.
// Keep the original URL intact: invitation and password callbacks need it.
export async function startApp({load=()=>import('./app.js?v=0.8.62.308'),doc=document,view=window}={}){
 const host=doc.getElementById('app'),status=doc.getElementById('appStartStatus'),retry=doc.getElementById('appStartRetry');
 if(!host||!status||!retry)return;
 let running=false;
 async function open(){
  if(running)return;running=true;retry.hidden=true;status.textContent='Opening your club…';
  try{
   // Give the initial shell a paint before parsing the application.
   await new Promise(resolve=>{const timer=view.setTimeout(resolve,100);view.requestAnimationFrame(()=>view.requestAnimationFrame(()=>{view.clearTimeout(timer);resolve();}));});
   const module=await load();
   if(module.appReady)await module.appReady;
  }catch(error){
   if(!status.isConnected)return;
   status.textContent='Mirelion could not open. Check your connection and try again.';retry.hidden=false;
  }finally{running=false;}
 }
 // A reload also clears a failed module evaluation; never start two app boots.
 retry.onclick=()=>view.location.reload();
 return open();
}
if(typeof document!=='undefined')void startApp();
