// Player navigation and save guards never import the support workspace.
export function createStaffAssistController({load,allowed,scope,create}){
 let modulePromise=null,instance=null,epoch=0;
 const permitted=()=>{if(allowed())return true;if(instance){instance.reset();instance=null;}return false;};
 async function ready(){
  if(!permitted())return null;
  const identity=scope(),version=epoch;
  modulePromise ||= Promise.resolve().then(load).catch(error=>{modulePromise=null;throw error;});
  const module=await modulePromise;
  if(version!==epoch||!permitted()||identity!==scope())return null;
  return instance ||= create(module);
 }
 const api={
  reset(){epoch++;instance?.reset();instance=null;},
  async start(){try{const feature=await ready();feature?.start();}catch{/* Opening Assist offers a visible retry. */}},
  async mount(host,...args){
   if(!permitted())return;
   const identity=scope(),version=epoch,route=host?.parentNode;
   const current=()=>version===epoch&&permitted()&&identity===scope()&&host?.isConnected&&host.parentNode===route;
   if(!instance&&host){const status=host.ownerDocument.createElement('p');status.setAttribute('role','status');status.textContent='Opening Mirelion Assist…';host.replaceChildren(status);}
   try{const feature=await ready();if(feature&&current())return await feature.mount(host,...args);}
   catch{
    if(!current())return;
    const status=host.ownerDocument.createElement('p'),retry=host.ownerDocument.createElement('button');
    status.setAttribute('role','status');status.textContent='Mirelion Assist could not load. Check your connection and try again.';
    retry.type='button';retry.className='btn ghost';retry.textContent='Try again';retry.onclick=()=>void api.mount(host,...args);host.replaceChildren(status,retry);
   }
  }
 };
 for(const [name,fallback] of Object.entries({canLeave:()=>true,hasChanges:()=>false,navigation:()=>({threadId:null}),home:()=>{},unread:()=>{},refresh:()=>{}})){
  api[name]=(...args)=>permitted()&&instance?instance[name](...args):fallback(...args);
 }
 return api;
}
