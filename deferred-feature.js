// Load a feature only when it is opened. Navigation/unsaved-work checks remain
// synchronous and never download a feature that has not been used.
export function createDeferredController({load,create,scope,host:findHost=args=>args[0],name='This feature',passive={},onError=()=>{}}){
 let instance=null,loading=null,request=0;
 function ready(){
  if(instance)return Promise.resolve(instance);
  if(!loading)loading=Promise.resolve().then(load).then(module=>instance=create(module)).finally(()=>{loading=null;});
  return loading;
 }
 const api={async mount(...args){
  const host=findHost(args),identity=scope(),version=++request;
  const current=()=>identity===scope()&&version===request&&(!host||host.isConnected);
  if(host&&!instance){const status=host.ownerDocument.createElement('p');status.setAttribute('role','status');status.textContent='Opening '+name+'…';host.replaceChildren(status);}
  try{const feature=await ready();if(current())return await feature.mount(...args);}
  catch(error){
   if(!current())return;
   if(!host){onError(error);return;}
   const message=host.ownerDocument.createElement('p'),retry=host.ownerDocument.createElement('button');
   message.setAttribute('role','status');message.textContent=name+' could not load. Check your connection and try again.';
   retry.type='button';retry.className='btn ghost';retry.textContent='Try again';retry.onclick=()=>void api.mount(...args);
   host.replaceChildren(message,retry);
  }
 }};
 for(const [name,fallback] of Object.entries(passive))api[name]=(...args)=>instance?.[name]?instance[name](...args):fallback(...args);
 return api;
}
