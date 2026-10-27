// Selection analysis is a requested snapshot, never a subscription or a mode.
let analysisTask=null;
function loadAnalysis(){
 return analysisTask||=(Promise.all([
  import('./season-stats.js?v=0.8.62.275'),import('./selection-evidence.js?v=0.8.62.288'),
  import('./selection-returning.js?v=0.8.62.288'),import('./selection-evidence-ui.js?v=0.8.62.288'),
  import('./selection-history.js?v=0.8.62.278')
 ]).then(parts=>Object.assign({},...parts)).catch(error=>{analysisTask=null;throw error;}));
}

const key=(team,id)=>JSON.stringify([team,id]);
const personFacts=p=>['id','name','active','batting','bowling','bowling_load','spin_style','keeper','fielding'].map(k=>p?.[k]??null);
const availability=(p,days)=>days.map(d=>p?.availability?.unavailable_dates?.includes(d.date)?'unavailable':p?.availability?.available_dates?.includes(d.date)?'available':'unknown');
const returnFacts=e=>JSON.stringify([e.previous.id,e.position,e.missed.map(t=>t.id),e.availableDays,personFacts(e.person)]);

// These are equality checks on saved facts. They do not rebuild season totals,
// evaluate form, discover pairs, or reintroduce previously removed relationships.
function basis(b){
 const people=new Map(b.roster.map(p=>[p.id,p])),teams=new Map(),players=new Map();
 for(const team of b.teams){
  const days=team.days||[],slots=(team.slots||[]).map(s=>[s.d1||null,s.d2||null]);
  while(slots.length>11&&!slots.at(-1).some(Boolean))slots.pop();
  const meta=[team.id,team.grade_group_id,team.grade,team.competition,team.format,team.level,days,team.brackets,!!team.cancelled,team.overs,
   days.map((_,i)=>[team.match_roles?.['d'+(i+1)]?.captain_id,team.match_roles?.['d'+(i+1)]?.keeper_id])];
  const ids=[...new Set(slots.flat().filter(Boolean))];
  teams.set(team.id,JSON.stringify([meta,slots,ids.map(id=>[personFacts(people.get(id)),availability(people.get(id),days)])]));
  for(const id of ids){
   const positions=slots.flatMap((slot,i)=>slot.includes(id)?[[i,slot.map((pid,j)=>pid===id?j:null).filter(j=>j!==null)]]:[]);
   players.set(key(team.id,id),JSON.stringify([meta,positions,personFacts(people.get(id)),availability(people.get(id),days)]));
  }
 }
 return {teams,players,returns:new Map((b.returningEntries||[]).map(e=>[e.key,returnFacts(e)])),season:JSON.stringify(b.season||null)};
}

export function createSelectionEvidenceSnapshot(h){
 let board=null,view=null,form=null,returns=null,pending=null,generation=0;
 let analysis=null;
 const here=b=>board===b&&b.host.isConnected&&h.here(b);
 const allowed=b=>here(b)&&(!b.canCalculate||b.canCalculate());
 function buttons(){
  if(!board||!here(board))return;
  for(const [kind,button,label] of [['form',board.formButton,'Show form indicators'],['returns',board.returningButton,'Compare returning players']]){
   if(!button)continue;
   button.disabled=!!pending||!allowed(board)||!board.teams.length;
   button.textContent=pending?.kind===kind?'Calculating…':label;
   button.setAttribute('aria-busy',String(pending?.kind===kind));
   const snapshot=kind==='form'?form:returns;
   button.title=snapshot?'Calculated '+snapshot.at+'. Click to calculate once again.':'Calculate once for these teams. Results remain until affected selections change.';
   button.onclick=()=>void run(kind);
  }
 }
 function pause(){generation++;pending?.controller.abort();pending=null;buttons();}
 function prune(b){
  if(!form&&!returns)return;
  const now=basis(b);
  if(form){
   if(form.basis.season!==now.season)form=null;
   else{
    for(const [id] of form.model.players)if(form.basis.players.get(id)!==now.players.get(id))form.model.players.delete(id);
    form.model.pairs=form.model.pairs.filter(p=>form.model.players.has(p.higher.key)&&form.model.players.has(p.lower.key)
     &&form.basis.teams.get(p.higher.team.id)===now.teams.get(p.higher.team.id)&&form.basis.teams.get(p.lower.team.id)===now.teams.get(p.lower.team.id));
    const remaining=new Set(form.model.pairs);
    for(const item of form.model.players.values())item.links=item.links.filter(p=>remaining.has(p));
   }
  }
  if(returns){
   if(returns.basis.season!==now.season)returns=null;
   else for(const [id,entry] of returns.entries)if(returns.basis.returns.get(id)!==now.returns.get(id)||returns.basis.teams.get(entry.team.id)!==now.teams.get(entry.team.id))returns.entries.delete(id);
  }
 }
 function paint(b){
  if(!here(b))return;
  if(!analysis){buttons();return;}
  const {clearEvidenceLinks,evidenceStyles,renderEvidenceBadges,renderEvidenceDetails,showEvidenceDialog,returnDetails,bindEvidenceLinks,returnComparisonDetails,bindReturningHistory}=analysis;
  clearEvidenceLinks(b.host);b.host.querySelector('.se-evidence-dialog')?.remove();
  const pairs=returns?returns.pairs.filter(p=>returns.entries.has(p.entry.key)):[],players=new Map();
  for(const [id,item] of form?.model.players||[])players.set(id,{...item,returns:pairs.filter(p=>p.entry.team.id===item.team.id&&p.target.incumbent?.id===item.person.id)});
  for(const pair of pairs){
   const person=pair.target.incumbent;if(!person)continue;const id=key(pair.entry.team.id,person.id);
   if(!players.has(id))players.set(id,{key:id,person,team:pair.entry.team,links:[],returns:pairs.filter(p=>p.entry.team.id===pair.entry.team.id&&p.target.incumbent?.id===person.id)});
  }
  if((form||returns)&&!b.host.querySelector('[data-evidence-styles]')){
   const styles=b.host.ownerDocument.createElement('div');styles.dataset.evidenceStyles='';styles.innerHTML=evidenceStyles;b.host.append(styles);
  }
  for(const slot of b.host.querySelectorAll('[data-se-evidence]')){
   const id=key(slot.dataset.evidenceFixture,slot.dataset.evidencePlayer),item=players.get(id),hasForm=!!form?.model.players.has(id);
   slot.innerHTML=renderEvidenceBadges(item,id,{compact:true,form:hasForm});
   slot.closest('.se-player-cell')?.classList.toggle('se-has-evidence',!!slot.innerHTML);
   slot.closest('.se-player-cell')?.classList.toggle('se-return-linked',!!item?.returns?.length);
   const button=slot.querySelector('[data-evidence-open]');if(!button)continue;
   button.onclick=event=>{
    event.preventDefault();event.stopPropagation();if(!here(b))return;
    const content=hasForm?renderEvidenceDetails(item):'<div class="se-evidence-heading"><h2 id="seEvidenceTitle">Returning player comparisons</h2><button type="button" class="se-evidence-close" data-evidence-close>Close</button></div>'+item.returns.map(returnDetails).join('');
    showEvidenceDialog(b.host,content,button);
   };
  }
  bindEvidenceLinks(b.host,{pairs:form?.model.pairs||[]},()=>here(b));
  for(const row of b.host.querySelectorAll('[data-se-return-key]')){
   const id=row.dataset.seReturnKey,entry=returns?.entries.get(id),host=row.querySelector('[data-return-analysis]');
   if(!host)continue;host.innerHTML=entry?returns.html.get(id):'';
   const facts=row.querySelector('[data-return-facts]');if(facts)facts.hidden=!!entry;
   row.querySelector('[data-return-count]')?.remove();
   if(!entry)continue;
   const mark=row.ownerDocument.createElement('span');mark.dataset.returnCount='';mark.className='se-return-count';mark.textContent=pairs.filter(p=>p.entry.key===id).length+' similar';row.querySelector('summary').append(mark);
   for(const button of host.querySelectorAll('[data-return-compare]')){
    const pair=returns.pairs[Number(button.dataset.returnCompare)];
    button.onclick=()=>{
     if(!here(b)||!returns?.entries.has(id))return;
     const dialog=showEvidenceDialog(b.host,returnComparisonDetails(pair),button);
     bindReturningHistory(dialog,pair,{supabase:h.supabase,clubId:b.clubId,seasonStart:returns.season.start,here:()=>here(b)&&!!returns?.entries.has(id)&&dialog.isConnected});
    };
   }
  }
  buttons();
 }
 async function run(kind){
  const b=board;if(!b||!allowed(b)||pending||!b.teams.length)return;
  const input={...b,teams:structuredClone(b.teams),referenceTeams:structuredClone(b.referenceTeams||[]),roster:structuredClone(b.roster),returningEntries:structuredClone(b.returningEntries||[])};
  const task={kind,controller:new AbortController(),generation:++generation};pending=task;buttons();
  try{
   analysis=await loadAnalysis();
   if(!here(b)||pending!==task||generation!==task.generation||!allowed(b))return;
   const {buildSeasonStats,resolveSelectionStatsTeams,buildSelectionEvidence,returningPlayers,returningComparison,returnTeamDetails}=analysis;
   const request=h.supabase.rpc('club_season_stats_api',{p_club_id:b.clubId,p_action:'context',p_data:{on_demand:true}});
   const result=await (typeof request.abortSignal==='function'?request.abortSignal(task.controller.signal):request);
   if(!here(b)||pending!==task||generation!==task.generation||!allowed(b))return;
   if(result.error)throw Object.assign(Error(result.error.message),{code:result.error.code});
   const data=result.data;
   if(!Array.isArray(data?.cards)||!Array.isArray(data?.fixtures)||!data?.season?.start)throw Error('Season figures unavailable.');
   const summary=buildSeasonStats(data),teams=resolveSelectionStatsTeams(input.teams,data.season,input.referenceTeams),at=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),saved=basis(input);
   if(kind==='form')form={model:buildSelectionEvidence(summary,teams,input.roster),basis:saved,at};
   else{
    const entries=returningPlayers({teams,references:resolveSelectionStatsTeams(input.referenceTeams,data.season),roster:input.roster,season:data.season,today:b.today||data.today,noPlay:data.fixtures.filter(f=>f.no_play).map(f=>f.id),eligible:b.returningEligible});
    const comparisons=entries.flatMap(entry=>entry.targets.map(target=>returningComparison(entry,target,summary,input.roster)));
    returns={entries:new Map(entries.map(e=>[e.key,e])),pairs:comparisons,html:new Map(entries.map(e=>[e.key,returnTeamDetails(e,comparisons,summary,true)])),season:data.season,basis:saved,at};
    if(!entries.length)h.notice?.('No returning players to compare for these teams.');
   }
   // Reconcile against the current saved facts, without rebuilding the result.
   prune(b);paint(b);
  }catch(error){
   if(!here(b)||pending!==task||generation!==task.generation)return;
   if(['42501','PGRST301'].includes(error.code)||/membership|access is required|sign in/i.test(error.message)){form=null;returns=null;paint(b);}
   h.notice?.('Could not calculate '+(kind==='form'?'form indicators':'returning-player comparisons')+'. '+error.message);
  }finally{if(pending===task){pending=null;buttons();}}
 }
 return {
  mount(host,options){
   if(!host)return;pause();if(board)analysis?.clearEvidenceLinks(board.host);
   const next=JSON.stringify([options.scope,options.viewKey]);
   if(view!==next){form=null;returns=null;view=next;}
   board={...options,host};prune(board);paint(board);
  },
  pause,
  invalidate(){pause();form=null;returns=null;if(board&&here(board))paint(board);},
  adopt(scope){if(board?.scope===scope)this.invalidate();}
 };
}
