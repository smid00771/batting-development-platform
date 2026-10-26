import {statsOvers} from './season-stats.js?v=0.8.62.275';

const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const decimal=value=>Number.isFinite(value)?value.toFixed(2):'—';
// The original exports have no source player IDs, format or batting positions.
// Keep candidate records separate from confirmed current-season form and never
// use these name matches to rank a returner, edit a role or merge an identity.
export function renderReturningHistory(data,pair,seasonStart){
  if(data?.identity_status!=='unconfirmed_name_and_club'||!Array.isArray(data.players))return '';
  const people=[pair.entry.person,pair.target.incumbent].filter(Boolean);
  const columns=people.map(person=>{
    const rows=(data.players.find(p=>p.roster_id===person.id)?.records||[]).filter(row=>row.season_end<seasonStart);
    if(!rows.length)return `<div><strong>${escape(person.name)}</strong><p class="se-evidence-small">No matching historical reference available.</p></div>`;
    const grades=[...new Set(rows.map(row=>row.grade_id))];
    grades.sort((a,b)=>Number(b===pair.entry.team.grade_group_id)-Number(a===pair.entry.team.grade_group_id));
    return `<div><strong>${escape(person.name)}</strong><p class="se-evidence-small">Possible archive match: ${escape(rows[0].source_name)}<small>${escape(rows[0].source_club)}</small></p>${grades.map(id=>{
      const records=rows.filter(row=>row.grade_id===id).sort((a,b)=>b.season.localeCompare(a.season));
      return `<h3>${escape(records[0].grade)}</h3>${records.map(row=>{
        const dismissals=row.innings-row.not_outs;
        const figures=pair.target.focus==='bowling'
          ? `${row.wickets} wickets · ${statsOvers(row.balls)??'—'} overs · ${row.conceded} runs<small>Avg ${row.wickets?decimal(row.conceded/row.wickets):'—'} · Econ ${row.balls?decimal(row.conceded*6/row.balls):'—'}</small>`
          : `Avg ${dismissals>0?decimal(row.runs/dismissals):'—'} · ${row.runs} runs<small>${row.innings} inns · ${row.not_outs} not out</small>`;
        return `<p class="se-evidence-small"><strong>${escape(row.season)}</strong>${figures}</p>`;
      }).join('')}`;
    }).join('')}</div>`;
  });
  return `<p class="se-evidence-small">Source records matched by name and club; player identity is unconfirmed. Check the source names before using this reference. Season totals combine formats and have no batting-position information. These records do not affect the current form assessment.</p><div class="se-evidence-pair-grid">${columns.join('')}</div>`;
}

export function bindReturningHistory(dialog,pair,{supabase,clubId,seasonStart,here}){
  const details=dialog.querySelector('[data-return-history]');if(!details)return;
  let loading=false,loaded=false;
  details.addEventListener('toggle',async()=>{
    if(!details.open||loading||loaded||!here())return;
    loading=true;
    const content=details.querySelector('[data-return-history-content]');content.textContent='Loading historical reference…';
    try{
      const result=await supabase.rpc('club_selection_history_api',{p_club_id:clubId,p_data:{fixture_id:pair.entry.team.id,roster_ids:[pair.entry.person.id,pair.target.incumbent?.id].filter(Boolean)}});
      if(!here()||!dialog.isConnected)return;
      if(result.error)throw Error('History unavailable');
      const html=renderReturningHistory(result.data,pair,seasonStart);
      if(!html)throw Error('History unavailable');
      content.innerHTML=html;loaded=true;
    }catch{if(here()&&dialog.isConnected)content.textContent='Historical reference unavailable. Close and reopen this section to retry.';}
    finally{loading=false;}
  });
}
