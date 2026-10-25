import {graphicSettings,refinedGraphicLayout,withGradeLabels,graphicLabel,graphicPlayerDisplays} from './social-graphic-design.js?v=0.8.62.270';

export const assistantCSS=`<style>.graphic-assistant{margin:10px 0}.graphic-assistant label{display:grid;gap:5px;margin:0!important;font-size:14px;font-weight:600}.graphic-assistant textarea{width:100%;box-sizing:border-box;font:inherit;resize:vertical}.graphic-assistant .ga-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.graphic-assistant .btn{min-height:44px}.graphic-assistant p{font-size:13px;line-height:1.4;margin:6px 0}.graphic-assistant p:empty{display:none}.ga-label-warning{padding:8px;background:#fff3dc;border-radius:6px;margin-bottom:8px}.ga-label-warning input{box-sizing:border-box;max-width:100%;min-height:40px;margin:4px 6px 4px 0}.ga-label-warning .btn{margin-top:4px}</style>`;

// A measured warning offers a choice; it never guesses and saves an abbreviation.
export function labelSuggestions(host,canvas,{locked=false,apply,request}){
 if(!host)return;host.replaceChildren();
 for(const warning of canvas?.graphicLabelWarnings||[]){
  const box=document.createElement('div'),text=document.createElement('p');box.className='ga-label-warning';text.textContent=`“${warning.label}” needs smaller type to fit. ${warning.grade?'Choose a shorter label for this graphic.':'Ask the assistant for a shorter label or more room.'}`;box.append(text);
  if(warning.grade){
   const input=document.createElement('input');input.type='text';input.maxLength=40;input.value=warning.suggestion;input.placeholder='Your preferred short label';input.setAttribute('aria-label','Short label for '+warning.source);input.disabled=locked;box.append(input);
   const button=document.createElement('button');button.type='button';button.className='btn secondary';button.textContent=warning.suggestion?'Use '+warning.suggestion:'Apply short label';button.disabled=locked||!input.value.trim();input.oninput=()=>{button.textContent='Apply short label';button.disabled=locked||!input.value.trim();};button.onclick=()=>{if(!button.disabled)apply(warning.source,input.value.trim());};box.append(button);
  }else{const button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent='Ask assistant';button.disabled=locked;button.onclick=()=>request(`Make the label “${warning.label}” readable. Suggest a shorter label or give it more room.`);box.append(button);}
  host.append(box);
 }
}

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function proposalMessage(result,changed){const explanation=String(result.explanation||'').trim().slice(0,700);return changed?'Proposed changes: '+(explanation||'Review the graphic above.'):'No changes were made to the preview. '+(explanation.match(/(?:^|[.!?]\s+)([^.!?]+\?)\s*$/)?.[1]||'Try a more specific request.');}
const snapshot=c=>({layout:structuredClone(c.layout()),label:c.label?.()??null,...(c.players?{players:c.players().map(p=>({key:p.key,display:p.display}))}:{})});
function restore(c,value){if(value.players&&c.setPlayers)c.setPlayers(value.players);if(!same(c.layout(),value.layout))c.apply(structuredClone(value.layout));if(c.setLabel&&value.label!==null)c.setLabel(value.label);}
function stage(c,r,before,next){r.baseline??=before;r.history.push(before);r.history=r.history.slice(-10);restore(c,next);r.candidate=!same(snapshot(c),r.baseline);}
function undo(c,r){const previous=r.history.pop();if(!previous)return;restore(c,previous);r.candidate=!same(snapshot(c),r.baseline);r.artworkBrief='';r.artworkPending=false;r.message=r.candidate?'Previous proposal restored.':'Changes undone.';}
export function assistantSuggestions(c){
 const r=assistantState(c.owner);labelSuggestions(document.getElementById(c.prefix+'Labels'),c.canvas(),{locked:c.locked()||!c.ready()||r.saveUncertain,apply:(grade,label)=>{
  try{const before=snapshot(c),next={...before,layout:withGradeLabels(before.layout,[{grade,label}],c.grades())};stage(c,r,before,next);r.message='Proposed changes: shorter grade label.';c.render();}catch(e){r.message=e.message;c.render();}
 },request:brief=>{(r.briefs||={})[c.prefix]=brief;c.render();document.getElementById(c.prefix+'Brief')?.focus();}});
}

export function assistantState(owner){return owner.graphicAssistant||(owner.graphicAssistant={brief:'',history:[],candidate:false,message:'',artworkBrief:'',saveUncertain:false});}
export function assistantHTML(owner,escape,prefix){const r=assistantState(owner);return `<section class="graphic-assistant" aria-label="AI graphic assistant">${assistantCSS}<div id="${prefix}Labels"></div><label for="${prefix}Brief">What would you change? <span>AI assistant</span><textarea id="${prefix}Brief" rows="2" maxlength="1500" placeholder="e.g. Shorten Development League to Dev, or make the names larger.">${escape(r.briefs?.[prefix]||'')}</textarea></label><div class="ga-actions"><button type="button" class="btn secondary" id="${prefix}Try" disabled>Preview changes</button>${r.candidate?`<button type="button" class="btn" id="${prefix}Use" disabled>Apply changes</button>`:''}${r.history.length?`<button type="button" class="btn ghost" id="${prefix}Undo" disabled>Undo changes</button>`:''}</div><p id="${prefix}Status" role="status" aria-live="polite">${escape(r.message)}</p>${r.saveUncertain?`<button type="button" class="btn ghost" id="${prefix}Reload">Reload saved layout</button>`:''}<p class="se-muted">AI requests use your club’s allowance. Short-label choices and undo are free.</p></section>`;}
export function assistantControls(owner,prefix,{ready,locked}){const r=assistantState(owner),el=id=>document.getElementById(prefix+id);if(el('Brief'))el('Brief').disabled=locked||r.saveUncertain;
 for(const id of ['Try','Use','Undo','Reload'])if(el(id))el(id).disabled=!!(locked||r.artworkPending||id!=='Reload'&&!ready||(id==='Try'&&(!(r.briefs?.[prefix]||'').trim()||r.saveUncertain))||(id==='Undo'&&r.saveUncertain));
}
export async function graphicPreview(canvas){const copy=document.createElement('canvas'),scale=Math.min(1,1400/Math.max(canvas.width,canvas.height));copy.width=Math.max(1,Math.round(canvas.width*scale));copy.height=Math.max(1,Math.round(canvas.height*scale));copy.getContext('2d').drawImage(canvas,0,0,copy.width,copy.height);const blob=await new Promise(resolve=>copy.toBlob(resolve,'image/png'));if(!blob||blob.size>2097152)throw Error('The preview is too large. Try a smaller background.');const bytes=new Uint8Array(await blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:image/png;base64,'+btoa(data);}
export function bindAssistant(c){
 const r=assistantState(c.owner),el=id=>document.getElementById(c.prefix+id),sync=()=>assistantControls(c.owner,c.prefix,{ready:c.ready(),locked:c.locked()});
 el('Brief').oninput=e=>{(r.briefs||={})[c.prefix]=e.target.value;sync();};
 const run=async fn=>{if(c.locked())return;c.busy(true);c.render();try{await fn();}catch(e){if(c.here())r.message=e.message||'The change could not be prepared.';}finally{c.busy(false);if(c.here())c.render();}};
 el('Try').onclick=()=>{if(!c.ready()||c.locked()||r.artworkPending||r.saveUncertain||!(r.briefs?.[c.prefix]||'').trim())return;const brief=r.briefs[c.prefix].trim(),canvas=c.canvas(),before=snapshot(c),identity=c.identity(),grades=c.grades(),revision=c.revision();let artwork='';r.message='Preparing proposed changes…';void run(async()=>{
  const response=await c.supabase.functions.invoke('club-social-style',{body:{purpose:'graphic_refine',kind:c.kind,club_id:c.club,week_end:c.date(),design_revision:revision,preview_grades:grades,grade_labels:before.layout.grade_labels||[],...(c.players?{preview_players:before.players,include_provisional:c.owner.includeDay1===true,award_scope:c.owner.context?.award_scope}:{}),...(c.label?{graphic_label:before.label||null}:{}),brief,current:graphicSettings(c.kind,before.layout),title_in_background:!!before.layout.includes_title,preview:await graphicPreview(canvas)}});
  if(response.error||response.data?.error){let message=response.data?.error;try{message||=(await response.error.context?.clone().json())?.error;}catch{}throw Error(message||response.error?.message||'The suggestion could not be prepared.');}
  if(!c.here()||c.identity()!==identity)return;
  const result=response.data,label=graphicLabel(result.graphic_label);if(label!==null&&!c.setLabel)throw Error('This graphic does not support that label change.');
  const playerChanges=graphicPlayerDisplays(result.player_displays||[],c.players?.()||[]),displays=new Map(playerChanges.map(p=>[p.key,p.display]));
  const next={...before,layout:refinedGraphicLayout(c.kind,before.layout,result,grades),label:label??before.label,...(before.players?{players:before.players.map(p=>({...p,display:displays.get(p.key)||p.display}))}:{})};artwork=String(result.artwork_brief||'').trim().slice(0,1500);
  if(!same(next,before)||artwork){stage(c,r,before,next);if(artwork){r.candidate=true;r.artworkPending=true;}}
  r.message=artwork?'Preparing proposed artwork changes…':proposalMessage(result,!same(next,before));
 }).then(async()=>{if(!artwork||!c.here())return;try{if(!c.artwork)throw Error('Background editing is unavailable.');await c.artwork(artwork,{proposal:{
   beforeApply:async()=>{if(c.saveBeforeArtwork&&!same(c.layout(),r.baseline.layout))await c.save();if(c.saveLabel&&c.label?.()!==r.baseline.label)await c.saveLabel();},
   applied:()=>{r.candidate=false;r.artworkPending=false;r.saveUncertain=false;r.artworkBrief='';r.baseline=snapshot(c);r.history=[];r.message='Changes applied.';},
   undo:()=>{undo(c,r);},
  }});}catch(e){undo(c,r);r.message='No artwork changes were applied. '+(e.message||'Try again.');if(c.here())c.render();}});};
 el('Use')?.addEventListener('click',()=>{if(!r.candidate||!c.ready()||r.artworkPending||c.locked())return;r.message='Applying changes…';void run(async()=>{try{if(!same(c.layout(),r.baseline.layout))await c.save();if(c.saveLabel&&c.label?.()!==r.baseline.label)await c.saveLabel();if(!c.here())return;r.candidate=false;r.saveUncertain=false;r.baseline=snapshot(c);r.message='Changes applied. You can save the finished image.';}catch(e){r.saveUncertain=true;c.conflict?.();throw Error('Save not confirmed. Retry Apply changes, or reload the saved layout. '+e.message);}});});
 el('Undo')?.addEventListener('click',()=>{if(c.locked()||r.artworkPending||r.saveUncertain||!r.history.length)return;undo(c,r);c.render();});
 el('Reload')?.addEventListener('click',()=>{void run(async()=>{await c.reload();});});
 sync();assistantSuggestions(c);
}
export function assistantCanLeave(owner,notify){const r=owner?.graphicAssistant;if(r?.candidate||r?.saveUncertain){notify('Apply changes or Undo changes before leaving this preview.');return false;}return true;}
