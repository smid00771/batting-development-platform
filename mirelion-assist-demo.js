// A local-only transport for the same Assist interface. No message leaves the demo.
export function createMirelionAssistDemo(getContext){
 const threads=[],messages=[],receipts=new Map(),reads=new Map();let sequence=0;
 const clone=x=>JSON.parse(JSON.stringify(x));
 function access(d,t){const c=getContext();return !!t&&(d.platform||t.club_id===d.club_id&&t.requester_id===c.userId);}
 function unread(t,d){return messages.filter(m=>m.thread_id===t.id&&m.side===(d.platform?'club':'team')&&m.id>(reads.get(getContext().userId+':'+t.id)||0)).length;}
 async function rpc(name,{p_action:action,p_data:d}={}){
  try{
   if(name!=='mirelion_assist')throw Error('Unknown demo transport.');
   const c=getContext(),key=c.userId+':'+d.request_id;
   if(d.request_id&&receipts.has(key))return {data:clone(receipts.get(key)),error:null};
   let t=threads.find(t=>t.id===d.thread_id),result;
   if(['thread','read','send','status','handover','example_reply'].includes(action)&&!access(d,t))throw Error('Message unavailable.');
   const mine=threads.filter(t=>access(d,t));
   if(action==='legacy')result=[];
   else if(action==='summary')result={unread:mine.reduce((n,t)=>n+unread(t,d),0)};
   else if(action==='list'){
    const list=mine.filter(t=>t.status===(d.status||'open')&&(!d.search||(t.subject+' '+t.club_name).toLowerCase().includes(d.search.toLowerCase()))).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
    result={threads:list.slice(d.offset||0,(d.offset||0)+50).map(t=>({...t,unread:unread(t,d),preview:messages.filter(m=>m.thread_id===t.id).at(-1)?.body||''})),has_more:list.length>(d.offset||0)+50};
   }else if(action==='thread'){
    const all=messages.filter(m=>m.thread_id===t.id&&(!d.before||m.id<d.before));result={thread:t,messages:all.slice(-100),has_older:all.length>100};
   }else if(action==='read'){reads.set(c.userId+':'+t.id,Math.max(d.through,reads.get(c.userId+':'+t.id)||0));result={read:true};}
   else if(action==='handover'){t.assistance='human';t.last_side='club';t.version++;result={thread_id:t.id,status:t.status,version:t.version};}
   else if(action==='status'){if(d.version!==t.version)throw Error('Conversation changed. Read the latest messages.');t.status=d.status;t.version++;result={thread_id:t.id,status:t.status,version:t.version};}
   else if(['create','send','example_reply'].includes(action)){
    if(action==='create'){t={id:'assist-demo-'+(++sequence),club_id:d.club_id,requester_id:c.userId,club_name:c.clubName||'Harbour Cricket Club',requester_name:c.name||'Club member',subject:d.subject,category:d.category,status:'open',version:0,guide_context:[]};threads.push(t);}
    t.status='open';t.version++;t.last_side=action==='example_reply'||d.platform?'team':'club';t.updated_at=new Date().toISOString();
    if(d.platform)t.assistance='human';
    const m={automated:action==='example_reply',id:++sequence,thread_id:t.id,side:t.last_side,created_at:t.updated_at,body:action==='example_reply'?'Fictional automated reply: on the Selection Board, More → Show form indicators runs the calculation once. Ask for a person if this does not help. This is a fictional example reply.':d.body};messages.push(m);if(action==='example_reply')t.assistance='auto';result={thread_id:t.id,message_id:m.id,version:t.version};
   }else throw Error('Unsupported Assist demonstration action.');
   if(d.request_id)receipts.set(key,clone(result));return {data:clone(result),error:null};
  }catch(e){return {data:null,error:{message:e.message,code:'P0001'}};}
 }
 return {rpc,reset:()=>{threads.length=0;messages.length=0;receipts.clear();reads.clear();sequence=0;}};
}
