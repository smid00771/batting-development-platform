export const SPIN_STYLES=Object.freeze([
  ['unknown','Not set'],['off_spin','Off-spin'],['left_arm_orthodox','LH orthodox'],
  ['leg_spin','Leg-spin'],['left_arm_wrist','LH wrist-spin']
]);
export const spinStyle=person=>person?.bowling==='spin'&&SPIN_STYLES.some(([key])=>key===person.spin_style)?person.spin_style:'unknown';
export const spinLabel=person=>spinStyle(person)==='unknown'?'Spinner':SPIN_STYLES.find(([key])=>key===spinStyle(person))[1];
export const isBatter=person=>['top','middle'].includes(person?.batting);
const types=players=>Object.fromEntries(SPIN_STYLES.map(([key])=>[key,players.filter(p=>spinStyle(p)===key).length]));
export function spinProfile(players=[]){
  const spin=players.filter(p=>p?.bowling==='spin');
  const group=load=>{const people=spin.filter(p=>load==='unknown'?!['frontline','part_time'].includes(p.bowling_load):p.bowling_load===load);return {count:people.length,batters:people.filter(isBatter).length,types:types(people)};};
  return {frontline:group('frontline'),partTime:group('part_time'),unset:group('unknown')};
}
export function spinTypeCounts(group){
  return SPIN_STYLES.filter(([key])=>group.types[key]).map(([key,label])=>`${group.types[key]} ${key==='unknown'?'type not set':label.startsWith('LH')?label:label.toLowerCase()}`).join(', ')||'none';
}
export function spinProfileText(profile){
  const lines=[`Frontline: ${spinTypeCounts(profile.frontline)}.`];
  if(profile.frontline.batters)lines.push(`${profile.frontline.batters} also ${profile.frontline.batters===1?'has a':'have'} top/middle-order batting role (all-rounders).`);
  if(profile.partTime.count)lines.push(`Part-time options: ${spinTypeCounts(profile.partTime)}.`);
  if(profile.unset.count)lines.push(`Workload not set: ${spinTypeCounts(profile.unset)}.`);
  return lines;
}
// Evaluate the actual selected days. Batting and bowling are independent:
// top/middle-order frontline spinners count as both batters and frontline bowlers.
// There is no maximum-spinner rule, and part-time options never stand in for
// frontline cover. Unknown styles cannot establish a like-for-like bowling job.
export function spinBalanceChange(team,people,outgoing,incoming,days){
  if(!outgoing||!incoming)return null;
  if(outgoing.bowling!=='spin'&&incoming.bowling!=='spin')return null;
  const roster=new Map(people.map(p=>[p.id,p])),reports=[];
  const indexes=days||((team.days||[]).map((_,i)=>i));
  for(const day of indexes){
    const ids=[...new Set((team.slots||[]).map(slot=>slot['d'+(day+1)]).filter(Boolean))];
    if(!ids.includes(outgoing.id)||ids.includes(incoming.id))continue;
    const before=spinProfile(ids.map(id=>roster.get(id)).filter(Boolean));
    const after=spinProfile(ids.map(id=>id===outgoing.id?incoming:roster.get(id)).filter(Boolean));
    const lost=SPIN_STYLES.filter(([key])=>key!=='unknown'&&before.frontline.types[key]&&!after.frontline.types[key]).map(([,label])=>label);
    const beforeKinds=SPIN_STYLES.filter(([key])=>key!=='unknown'&&before.frontline.types[key]).length;
    const afterKinds=SPIN_STYLES.filter(([key])=>key!=='unknown'&&after.frontline.types[key]).length;
    const changed=JSON.stringify(before.frontline.types)!==JSON.stringify(after.frontline.types);
    const uncertain=before.frontline.types.unknown>0||after.frontline.types.unknown>0||before.unset.count>0||after.unset.count>0||ids.some(id=>!roster.has(id));
    const battingLost=isBatter(outgoing)&&!isBatter(incoming);
    const frontlineLost=after.frontline.count<before.frontline.count;
    const reduced=changed&&lost.length>0&&afterKinds<beforeKinds;
    const status=battingLost||frontlineLost||reduced?'tradeoff':uncertain?'unknown':changed?'change':'retained';
    const notes=[];
    if(changed)notes.push(`Frontline spin: ${spinTypeCounts(before.frontline)} → ${spinTypeCounts(after.frontline)}.`);
    if(lost.length)notes.push(`Removes the only frontline ${lost.join(' / ')} option${reduced?'; fewer different spin types':''}.`);
    if(frontlineLost)notes.push('Fewer frontline spin options; part-time bowling is separate cover.');
    if(battingLost)notes.push('The current player also has a top/middle-order batting role; this change loses that recorded batting cover.');
    if(uncertain)notes.push('Some spin types or workloads are not set; check team balance.');
    if(!changed&&!uncertain&&!battingLost)notes.push('Frontline spin variety retained.');
    if(!changed&&JSON.stringify(before.partTime.types)!==JSON.stringify(after.partTime.types))notes.push(`Part-time spin options: ${spinTypeCounts(before.partTime)} → ${spinTypeCounts(after.partTime)}.`);
    reports.push({day,status,before,after,notes});
  }
  if(!reports.length)return {status:'unknown',reports:[],notes:['No selected line-up is available to assess spin balance.']};
  const priority=['tradeoff','unknown','change','retained'],status=priority.find(s=>reports.some(r=>r.status===s));
  const same=reports.every(r=>JSON.stringify(r.notes)===JSON.stringify(reports[0].notes));
  return {status,reports,notes:same?reports[0].notes:reports.flatMap(r=>r.notes.map(note=>`Day ${r.day+1}: ${note}`))};
}

export function bindSpinBreakdowns(root){
  for(const wrap of root?.querySelectorAll('[data-spin-breakdown]')||[]){
    const button=wrap.querySelector('button'),tip=wrap.querySelector('[role=tooltip]');let pinned=false,suppressed=false;
    const show=value=>{tip.hidden=!value;button.setAttribute('aria-expanded',String(value));};
    button.onclick=event=>{event.preventDefault();event.stopPropagation();pinned=!pinned;suppressed=!pinned;show(pinned);};
    wrap.onpointerenter=()=>{if(!suppressed)show(true);};
    wrap.onpointerleave=()=>{suppressed=false;if(!pinned&&!wrap.contains(wrap.ownerDocument.activeElement))show(false);};
    button.onfocus=()=>{suppressed=false;show(true);};
    button.onblur=()=>{pinned=false;show(false);};
    button.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();pinned=false;suppressed=true;show(false);}};
  }
}
