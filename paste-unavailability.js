import {matchReviewNameParts,matchReviewShortNameMatches} from './player-name-matching.js?v=0.8.62.341';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function matchPastedPlayers(text,roster){
 const lines=String(text).split(/\r?\n|;/).map(s=>s.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
 if(lines.length>500)throw Error('Paste up to 500 names at a time.');
 return lines.map(name=>{const parts=matchReviewNameParts(name),key=parts.join(' '),exact=roster.filter(p=>p.active&&matchReviewNameParts(p.name).join(' ')===key),similar=exact.length?exact:roster.filter(p=>p.active&&matchReviewShortNameMatches(parts,matchReviewNameParts(p.name)));return {name,candidates:similar,id:exact.length===1?exact[0].id:'',exact:exact.length===1};});
}
export function mountPasteUnavailability(host,{roster,defaultDate,rosterRevision,here,dirty,save,back,draft}){
 const state=draft||{text:'',dates:[defaultDate],rows:null};
 const changed=()=>dirty(state);
 function draw(){
  if(!here())return;
  host.innerHTML=`<section class="se-card se-drawer"><h2>Paste unavailable players</h2><p class="se-form-note">Choose the dates, then paste one name per line. Review the matches before saving.</p><form id="pasteUnavailable"><div id="pasteDates" class="se-actions">${state.dates.map((d,i)=>`<label>Date ${i+1}<input type="date" data-paste-date="${i}" required value="${esc(d)}"></label>${i?`<button type="button" class="btn ghost" data-remove-date="${i}" aria-label="Remove date ${i+1}">Remove</button>`:''}`).join('')}</div><button type="button" class="btn ghost" id="pasteAddDate" ${state.dates.length>=31?'disabled':''}>Add date</button><label style="display:grid;gap:6px;margin:12px 0">Unavailable players<textarea id="pasteNames" rows="7" maxlength="50000" placeholder="One name per line" required>${esc(state.text)}</textarea></label><button class="btn" type="submit">Review names</button></form><div id="pasteReview"></div><p id="pasteStatus" role="status"></p><button type="button" class="btn ghost" id="sePasteBack">Back to availability</button></section>`;
  host.querySelector('#sePasteBack').onclick=back;
  host.querySelector('#pasteNames').oninput=e=>{state.text=e.target.value;state.rows=null;changed();review();};
  host.querySelectorAll('[data-paste-date]').forEach(input=>input.onchange=e=>{state.dates[Number(input.dataset.pasteDate)]=e.target.value;changed();review();});
  host.querySelector('#pasteAddDate').onclick=()=>{state.dates.push('');changed();draw();};
  host.querySelectorAll('[data-remove-date]').forEach(b=>b.onclick=()=>{state.dates.splice(Number(b.dataset.removeDate),1);changed();draw();});
  host.querySelector('#pasteUnavailable').onsubmit=e=>{e.preventDefault();try{state.rows=matchPastedPlayers(state.text,roster);changed();review();host.querySelector('#pasteReview').scrollIntoView?.({block:'nearest'});}catch(error){host.querySelector('#pasteStatus').textContent=error.message;}};
  review();
 }
 function review(){
  const target=host.querySelector('#pasteReview');if(!state.rows){target.innerHTML='';return;}
  const ids=[...new Set(state.rows.map(r=>r.id).filter(id=>id&&id!=='ignore'))],unresolved=state.rows.filter(r=>!r.id).length,dates=[...new Set(state.dates.filter(Boolean))];
  target.innerHTML=`<h3>Review players</h3>${state.rows.map((r,i)=>`<div style="padding:10px 0;border-bottom:1px solid var(--line,#ddd)"><strong>${esc(r.name)}</strong>${r.exact?`<p style="margin:3px 0">✓ ${esc(roster.find(p=>p.id===r.id)?.name)} <button class="btn ghost" type="button" data-change-match="${i}">Change</button></p>`:`<label style="display:grid;gap:4px">${r.candidates.length?'Choose the player':'No close match — choose a player or skip this line'}<select data-paste-match="${i}"><option value="">Choose player…</option>${r.candidates.length?`<optgroup label="Possible matches">${r.candidates.map(p=>`<option value="${esc(p.id)}" ${r.id===p.id?'selected':''}>${esc(p.name)}${p.grade?' · '+esc(p.grade):''}</option>`).join('')}</optgroup>`:''}<optgroup label="All active players">${roster.filter(p=>p.active&&!r.candidates.some(c=>c.id===p.id)).map(p=>`<option value="${esc(p.id)}" ${r.id===p.id?'selected':''}>${esc(p.name)}${p.grade?' · '+esc(p.grade):''}</option>`).join('')}</optgroup><option value="ignore" ${r.id==='ignore'?'selected':''}>Skip this line</option></select></label>`}</div>`).join('')}<p>${ids.length} player${ids.length===1?'':'s'} · ${dates.length} date${dates.length===1?'':'s'}${unresolved?` · ${unresolved} name${unresolved===1?'':'s'} to review`:''}</p><p class="se-form-note">Only these players will be marked unavailable on the chosen dates.</p><button type="button" class="btn" id="pasteSave" ${unresolved||!ids.length||!dates.length||state.dates.some(d=>!d)?'disabled':''}>Mark ${ids.length} player${ids.length===1?'':'s'} unavailable</button>`;
  target.querySelectorAll('[data-change-match]').forEach(b=>b.onclick=()=>{const r=state.rows[Number(b.dataset.changeMatch)];r.exact=false;r.id='';changed();review();});
  target.querySelectorAll('[data-paste-match]').forEach(select=>select.onchange=()=>{state.rows[Number(select.dataset.pasteMatch)].id=select.value;changed();review();});
  target.querySelector('#pasteSave').onclick=()=>{if(!here()||unresolved||!ids.length||!host.querySelector('#pasteUnavailable').reportValidity())return;save({player_ids:ids,dates:dates.sort(),roster_revision:rosterRevision,revisions:Object.fromEntries(roster.filter(p=>ids.includes(p.id)).map(p=>[p.id,p.availability?.revision||0]))});};
 }
 draw();return state;
}
