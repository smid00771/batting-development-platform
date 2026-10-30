// Loaded only in a match workspace or when its late-arrivals roll is opened.
export function createMatchArrivals({rpc,scope,formatDate,storage=localStorage}){
 const controllers=new WeakMap(),commands=new Map();
 const key=s=>'mirelion:match-arrivals:'+s.club+':'+s.user;
 const current=s=>{const now=scope();return now?.club===s.club&&now?.user===s.user;};
 const read=s=>{try{return JSON.parse(storage.getItem(key(s))||'{}');}catch{return {};}};
 const pending=s=>{if(!commands.has(key(s)))commands.set(key(s),read(s));return commands.get(key(s));};
 const keep=(s,id,value)=>{const saved=pending(s);if(value)saved[id]=value;else delete saved[id];try{if(Object.keys(saved).length)storage.setItem(key(s),JSON.stringify(saved));else storage.removeItem(key(s));}catch{}};
 const definite=e=>['P0001','42501','40001','22P02','23514'].includes(e?.code);
 const call=async(s,action,data)=>{if(!current(s))throw Error('Your club or account changed. Reopen this match.');const result=await rpc('match_arrivals_api',{p_club_id:s.club,p_action:action,p_data:data});if(result.error)throw result.error;return result.data;};
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
 const button=(text,fn)=>{const b=el('button',text,'btn ghost');b.type='button';b.onclick=fn;return b;};
 function styles(){if(document.getElementById('match-arrival-style'))return;const css=el('style');css.id='match-arrival-style';css.textContent=`.match-arrival-control label{display:flex;align-items:center;gap:7px;min-height:44px;margin:0;font-size:13px;font-weight:400}.match-arrival-control input{width:18px;min-height:18px;height:18px;margin:0}.match-arrival-control [role=status]:empty{display:none}.match-arrival-control [role=status]{display:block;font-size:12px;max-width:26em}.arrival-roll{width:min(850px,calc(100vw - 24px));max-height:88vh;border:1px solid #ccd4c7;border-radius:12px;padding:16px;color:var(--ink,#16423b);background:var(--card,#fffefb)}.arrival-roll::backdrop{background:#18312e70}.arrival-roll header,.arrival-roll-tools,.arrival-roll-card>div{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.arrival-roll h2{margin:0}.arrival-roll-tools{margin:12px 0}.arrival-roll-tools input[type=search]{flex:1;min-width:130px;min-height:44px;padding:8px 10px;border:1px solid #bdc9b8;border-radius:6px;font:inherit;font-size:16px}.arrival-roll-tools label{display:flex;align-items:center;gap:6px;min-height:44px}.arrival-roll-tools input[type=checkbox]{width:18px;height:18px;margin:0}.arrival-roll .btn{min-height:44px;padding:8px 12px;font-size:13px}.arrival-roll-body{max-height:60vh;overflow:auto}.arrival-roll-card{padding:12px 0;border-top:1px solid #d7dfd4}.arrival-roll-card p{margin:3px 0;font-size:13px}.arrival-roll-card summary{min-height:32px;cursor:pointer}.arrival-repeat{font-weight:700;color:#843717}.arrival-roll-card ul{margin:4px 0;padding-left:20px;font-size:13px}.arrival-roll [role=status]:empty{display:none}@media(max-width:480px){.arrival-roll{padding:12px}.arrival-roll-tools{gap:5px}.arrival-roll h2{font-size:22px}}`;document.head.append(css);}
 function mount(root,{owner=root,fixture_id=null,group_id=null,identity=null,players=[],onResolved=()=>{}}={}){
  styles();const s=scope();if(!s||!root?.isConnected)return;
  const context={fixture_id,group_id,identity},contextKey=JSON.stringify(context);
  let state=controllers.get(owner);
  if(!state||state.key!==contextKey||!current(state.scope)){state={key:contextKey,scope:s,context,values:new Map(),loaded:false,loading:null,root};controllers.set(owner,state);}
  state.root=root;state.onResolved=onResolved;state.players=players;
  const relevant=()=>current(s)&&controllers.get(owner)===state&&state.root.isConnected;
  const commandKey=id=>contextKey+':'+id;
  const paint=()=>{
   if(!relevant())return;
   for(const host of state.root.querySelectorAll('[data-match-arrival]')){
    const id=host.dataset.matchArrival;if(!players.some(p=>p.id===id))continue;
    const value=state.values.get(id),saved=pending(s)[commandKey(id)],saving=state.saving===id;
    host.replaceChildren();host.classList.add('match-arrival-control');
    const label=el('label'),input=el('input');input.type='checkbox';input.dataset.matchArrivalInput='';input.checked=saved?.data?.late??!!value?.late;input.disabled=!value||!!saved||!!state.saving||!!state.error;input.setAttribute('aria-label','Late to ground — '+(players.find(p=>p.id===id)?.name||'player'));
    label.title='Shared for this player and match. Saves when checked or unchecked.';label.append(input,document.createTextNode('Late to ground'));host.append(label);
    const status=el('span',saving?'Saving…':saved?'Save unconfirmed. Retry to confirm.':state.error||state.notices?.[id]||'');status.role='status';host.append(status);
    if(saved&&!saving)host.append(button('Retry arrival save',()=>save(id,saved)));
    else if(state.error)host.append(button('Reload arrivals',()=>load(true)));
    input.onchange=()=>save(id,{action:'save',data:{...context,player_ids:[id],late:input.checked,revision:value.revision,request_id:crypto.randomUUID()}});
   }
  };
  async function load(force=false){
   if(state.loading)return state.loading;if(state.loaded&&!force){paint();return;}
   state.error='';
   state.loading=(async()=>{try{const result=await call(s,'get',{...context,player_ids:players.map(p=>p.id)});if(!Array.isArray(result?.players))throw Error('Could not check saved arrivals.');if(!relevant())return;for(const p of result.players)state.values.set(p.player_id,p);state.loaded=true;}catch(e){if(relevant())state.error=e.message||'Could not load arrivals.';}finally{state.loading=null;paint();}})();return state.loading;
  }
  async function save(id,command){
   if(state.saving||!relevant())return;keep(s,commandKey(id),command);state.saving=id;paint();
   try{
    const result=await call(s,command.action,command.data);
    if(!result?.fixture_id||result.player_id!==id||typeof result.late!=='boolean'||!Number.isInteger(result.revision))throw Error('Could not confirm the arrival save.');
    keep(s,commandKey(id),null);if(!relevant())return;
    state.values.set(id,result);state.notices||={};state.notices[id]='Saved';
    if(!fixture_id)state.onResolved(result.fixture_id);
    // A retried receipt can be older than another coach's correction. Read the current fact.
    state.loaded=false;await load(true);
   }catch(e){if(definite(e)){keep(s,commandKey(id),null);state.error=e.message;state.loaded=false;}else if(relevant())state.error='';}
   finally{state.saving=null;paint();}
  }
  paint();if(players.length)void load();
 }
 async function openRoll(){
  styles();const s=scope();if(!s)return;
  const dialog=el('dialog',null,'arrival-roll');dialog.setAttribute('aria-labelledby','arrival-roll-title');
  const head=el('header'),title=el('h2','Late arrivals');title.id='arrival-roll-title';head.append(title,button('Close',()=>dialog.close()));
  const period=el('p','Loading this season…','help'),tools=el('div',null,'arrival-roll-tools'),search=el('input');search.type='search';search.placeholder='Find a player';search.setAttribute('aria-label','Find a player in late arrivals');
  const label=el('label'),only=el('input');only.type='checkbox';label.append(only,document.createTextNode('Needs a chat'));tools.append(search,label);
  const status=el('p');status.role='status';const body=el('div',null,'arrival-roll-body');dialog.append(head,period,tools,status,body);document.body.append(dialog);
  dialog.onclose=()=>dialog.remove();dialog.showModal();let rows=[],busy=false;
  const valid=()=>dialog.isConnected&&current(s);
  const draw=()=>{
   if(!valid())return;body.replaceChildren();
   const shown=rows.filter(p=>(!only.checked||p.outstanding>0)&&p.display_name.toLowerCase().includes(search.value.trim().toLowerCase()));
   if(!shown.length){body.append(el('p',rows.length?'No players match these filters.':'No late arrivals recorded this season.'));return;}
   for(const p of shown){
    const card=el('section',null,'arrival-roll-card'),line=el('div'),name=el('strong',p.display_name),facts=el('p',`${p.count} ${p.count===1?'match':'matches'} late${p.count>=2&&p.outstanding?' · Repeated lateness':''}${!p.outstanding?' · Discussed':''}`,p.count>=2&&p.outstanding?'arrival-repeat':'');
    const text=el('span');text.append(name,facts);line.append(text);card.append(line);
    const cmdKey='discuss:'+p.player_id,saved=pending(s)[cmdKey];
    if(p.outstanding||saved){const b=button(saved?'Retry discussed save':'Mark discussed',async()=>{
     if(busy||!valid())return;const command=saved||{action:'discuss',data:{player_id:p.player_id,matches:p.matches.filter(m=>!m.discussed_at).map(m=>({fixture_id:m.fixture_id,revision:m.revision})),request_id:crypto.randomUUID()}};
     keep(s,cmdKey,command);busy=true;b.disabled=true;status.textContent='Saving…';
     try{const result=await call(s,'discuss',command.data);if(result?.discussed!==true||result.player_id!==p.player_id)throw Error('Could not confirm the save.');keep(s,cmdKey,null);await load();}
     catch(e){if(definite(e))keep(s,cmdKey,null);if(valid())status.textContent=e.message||'Save unconfirmed. Retry the same save.';}
     finally{busy=false;draw();}
    });b.disabled=busy;line.append(b);}
    const details=el('details'),summary=el('summary','Match dates'),list=el('ul');details.append(summary,list);for(const m of p.matches)list.append(el('li',`${formatDate(m.match_date)} · ${m.grade} · ${m.opposition}${m.discussed_at?' · discussed':''}`));card.append(details);body.append(card);
   }
  };
  async function load(){try{const result=await call(s,'roll',{});if(!Array.isArray(result?.players))throw Error('Could not load late arrivals.');if(!valid())return;rows=result.players;period.textContent=`This season · ${formatDate(result.season_from)} – ${formatDate(result.season_to)}`;status.textContent='';draw();}catch(e){if(valid()){status.textContent=e.message||'Could not load late arrivals.';body.replaceChildren(button('Retry loading',load));}}}
  search.oninput=draw;only.onchange=draw;await load();
 }
 return {mount,openRoll,hasPending:()=>{const s=scope();return !!s&&Object.keys(pending(s)).length>0;},invalidate:owner=>controllers.delete(owner)};
}
