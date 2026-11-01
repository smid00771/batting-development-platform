// One small, immediate loading indicator for navigation and async controls.
// Background refreshes do not call this controller.
export function createActionFeedback({document,slowAfter=8000}={}){
 const pending=new Map(),wrappers=new WeakMap(),running=new WeakMap();let host,serial=0,navigation=null;
 function draw(){
  const item=[...pending.values()].at(-1);
  if(!host?.isConnected){
   host=document.createElement('div');host.id='appActionProgress';host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.hidden=true;
   document.body.append(host);
  }
  host.hidden=!item;if(item)host.textContent=item.slow?(item.label==='Saving…'?'Still saving…':'Still loading…'):item.label;
 }
 function begin(label='Loading…',{replace=false}={}){
  if(replace){for(const item of pending.values())clearTimeout(item.timer);pending.clear();}
  const id=++serial,item={label,slow:false};pending.set(id,item);
  item.timer=setTimeout(()=>{if(pending.has(id)){item.slow=true;draw();}},slowAfter);draw();
  return ()=>{clearTimeout(item.timer);pending.delete(id);draw();};
 }
 function wrap(fn){
  if(typeof fn!=='function')return fn;if(wrappers.has(fn))return wrappers.get(fn);
  const wrapped=function(...args){
   const node=this?.nodeType===1?this:args[0]?.currentTarget;
   const previous=node&&running.get(node),changing=args[0]?.type==='change';
   if(previous&&!changing){args[0]?.preventDefault?.();return previous.promise;}
   if(changing)previous?.finish();
   const finish=begin(/^(save|send|request|mark|publish|confirm|delete|remove)\b/i.test(node?.textContent?.trim()||'')?'Saving…':'Loading…');
   let result;try{result=fn.apply(this,args);}catch(error){finish();throw error;}
   if(!result||typeof result.then!=='function'){finish();return result;}
   const busy=previous?previous.busy:node?.getAttribute('aria-busy'),record={busy,finish,promise:null};if(node)node.setAttribute('aria-busy','true');
   const done=Promise.resolve(result).finally(()=>{
    finish();if(node&&running.get(node)===record){running.delete(node);if(node.getAttribute('aria-busy')==='true'){if(busy===null)node.removeAttribute('aria-busy');else node.setAttribute('aria-busy',busy);}}
   });
   record.promise=done;if(node)running.set(node,record);return done;
  };
  wrappers.set(fn,wrapped);wrappers.set(wrapped,wrapped);return wrapped;
 }
 function capture(event){
  // Property handlers are installed throughout the app, including lazy modules.
  // Wrap just before dispatch so new controls work on their very first tap.
  for(let node=event.target;node&&node!==document;node=node.parentElement){
   const name='on'+event.type;if(typeof node[name]==='function')node[name]=wrap(node[name]);
   if(running.has(node)&&(event.type==='submit'||event.type==='click'&&node.matches?.('button,[role=button],input[type=button],input[type=submit]'))){event.preventDefault();event.stopImmediatePropagation();return;}
  }
 }
 for(const type of ['click','change','submit'])document.addEventListener(type,capture,true);
 function navigate(key,render){
  if(navigation?.key===key)return navigation.promise;
  const finish=begin('Loading…',{replace:true});
  const task={key,promise:null};navigation=task;
  try{task.promise=Promise.resolve(render()).finally(()=>{finish();if(navigation===task)navigation=null;});}
  catch(error){finish();if(navigation===task)navigation=null;throw error;}
  return task.promise;
 }
 const style=document.createElement('style');style.textContent=`
 #appActionProgress{position:fixed;z-index:10000;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:10px 16px;border:1px solid #cbd5d1;border-radius:24px;background:#fff;color:#173e3b;box-shadow:0 3px 14px #1233;font:600 14px/1.4 system-ui;pointer-events:none;white-space:nowrap}
 #appActionProgress[hidden]{display:none}
 #appActionProgress:before{content:'';display:inline-block;width:12px;height:12px;margin-right:9px;border:2px solid #ccd9d5;border-top-color:#187766;border-radius:50%;vertical-align:-2px;animation:app-loading .8s linear infinite}
 @keyframes app-loading{to{transform:rotate(360deg)}}
 @media(prefers-reduced-motion:reduce){#appActionProgress:before{animation:none}}
 #app :is(button,[role=button]):active{filter:brightness(.9)}
 `;document.head.append(style);
 return {begin,wrap,navigate};
}

// Only for reads: bound waiting and share overlapping identical requests.
// Never time out or automatically retry a save whose result may be uncertain.
export function createCoachingReader({rpc,scope,timeoutMs=15000}={}){
 const pending=new Map();
 return function read(name,args){
  const key=JSON.stringify([scope(),name,args]);if(pending.has(key))return pending.get(key);
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('This is taking too long. Please try again.'));},timeoutMs);});
  const task=Promise.resolve().then(()=>{const query=rpc(name,args);return typeof query?.abortSignal==='function'?query.abortSignal(controller.signal):query;});
  const request=Promise.race([task,timeout]).finally(()=>{clearTimeout(timer);if(pending.get(key)===request)pending.delete(key);});
  pending.set(key,request);return request;
 };
}
