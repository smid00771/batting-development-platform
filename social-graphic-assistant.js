import {graphicSettings,refinedGraphicLayout,withGradeLabels} from './social-graphic-design.js?v=0.8.62.225';

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

export function assistantSuggestions(c){
 const r=assistantState(c.owner);labelSuggestions(document.getElementById(c.prefix+'Labels'),c.canvas(),{locked:c.locked()||!c.ready()||r.saveUncertain,apply:(grade,label)=>{
  try{const before=structuredClone(c.layout()),next=withGradeLabels(before,[{grade,label}],c.grades());r.baseline??=structuredClone(before);r.history.push(before);r.history=r.history.slice(-10);c.apply(next);r.candidate=true;r.message='Short label applied. Review the preview, then choose Use this version.';c.render();}catch(e){r.message=e.message;c.render();}
 },request:brief=>{(r.briefs||={})[c.prefix]=brief;c.render();document.getElementById(c.prefix+'Brief')?.focus();}});
}

export function assistantState(owner){return owner.graphicAssistant||(owner.graphicAssistant={brief:'',history:[],candidate:false,message:'',artworkBrief:'',saveUncertain:false});}
export function assistantHTML(owner,escape,prefix){const r=assistantState(owner);return `<section class="graphic-assistant" aria-label="AI graphic assistant">${assistantCSS}<div id="${prefix}Labels"></div><label for="${prefix}Brief">What would you change? <span>AI assistant</span><textarea id="${prefix}Brief" rows="2" maxlength="1500" placeholder="e.g. Shorten Development League to Dev, or make the names larger.">${escape(r.briefs?.[prefix]||'')}</textarea></label><div class="ga-actions"><button type="button" class="btn secondary" id="${prefix}Try" disabled>Apply changes</button>${r.candidate?`<button type="button" class="btn" id="${prefix}Use" disabled>Use this version</button>`:''}${r.history.length?`<button type="button" class="btn ghost" id="${prefix}Undo" disabled>Undo last change</button>`:''}</div><p id="${prefix}Status" role="status" aria-live="polite">${escape(r.message)}</p>${r.saveUncertain?`<button type="button" class="btn ghost" id="${prefix}Reload">Reload saved layout</button>`:''}${r.artworkBrief?`<button type="button" class="btn secondary" id="${prefix}Artwork" disabled>Edit background with AI</button>`:''}<p class="se-muted">AI requests use your club’s allowance. Short-label choices and undo are free.</p></section>`;}
export function assistantControls(owner,prefix,{ready,locked}){const r=assistantState(owner),el=id=>document.getElementById(prefix+id);if(el('Brief'))el('Brief').disabled=locked||r.saveUncertain;
 for(const id of ['Try','Use','Undo','Artwork','Reload'])if(el(id))el(id).disabled=!!(locked||id!=='Reload'&&!ready||(id==='Try'&&(!(r.briefs?.[prefix]||'').trim()||r.saveUncertain))||(id==='Undo'&&r.saveUncertain)||(id==='Artwork'&&(r.candidate||r.saveUncertain)));
}
export async function graphicPreview(canvas){const copy=document.createElement('canvas'),scale=Math.min(1,1400/Math.max(canvas.width,canvas.height));copy.width=Math.max(1,Math.round(canvas.width*scale));copy.height=Math.max(1,Math.round(canvas.height*scale));copy.getContext('2d').drawImage(canvas,0,0,copy.width,copy.height);const blob=await new Promise(resolve=>copy.toBlob(resolve,'image/png'));if(!blob||blob.size>2097152)throw Error('The preview is too large. Try a smaller background.');const bytes=new Uint8Array(await blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:image/png;base64,'+btoa(data);}
export function bindAssistant(c){
 const r=assistantState(c.owner),el=id=>document.getElementById(c.prefix+id),sync=()=>assistantControls(c.owner,c.prefix,{ready:c.ready(),locked:c.locked()});
 el('Brief').oninput=e=>{(r.briefs||={})[c.prefix]=e.target.value;sync();};
 const run=async fn=>{if(c.locked())return;c.busy(true);c.render();try{await fn();}catch(e){if(c.here())r.message=e.message||'The change could not be prepared.';}finally{c.busy(false);if(c.here())c.render();}};
 el('Try').onclick=()=>{if(!c.ready()||c.locked()||r.saveUncertain||!(r.briefs?.[c.prefix]||'').trim())return;const brief=r.briefs[c.prefix].trim(),canvas=c.canvas(),before=structuredClone(c.layout()),identity=c.identity(),grades=c.grades(),revision=c.revision();r.message='Preparing your changes…';void run(async()=>{
  const response=await c.supabase.functions.invoke('club-social-style',{body:{purpose:'graphic_refine',kind:c.kind,club_id:c.club,week_end:c.date(),design_revision:revision,preview_grades:grades,grade_labels:before.grade_labels||[],brief,current:graphicSettings(c.kind,before),title_in_background:!!before.includes_title,preview:await graphicPreview(canvas)}});
  if(response.error||response.data?.error){let message=response.data?.error;try{message||=(await response.error.context?.clone().json())?.error;}catch{}throw Error(message||response.error?.message||'The suggestion could not be prepared.');}
  if(!c.here()||c.identity()!==identity)return;
  const result=response.data,next=refinedGraphicLayout(c.kind,before,result,grades);r.artworkBrief=String(result.artwork_brief||'').slice(0,1500);
  if(JSON.stringify(next)!==JSON.stringify(before)){r.baseline??=structuredClone(before);r.history.push(before);r.history=r.history.slice(-10);c.apply(next);r.candidate=true;}
  r.message=String(result.explanation||'Review the updated preview.').slice(0,800);
 });};
 el('Use')?.addEventListener('click',()=>{if(!r.candidate||!c.ready())return;r.message='Saving this version…';void run(async()=>{try{await c.save();if(!c.here())return;r.candidate=false;r.saveUncertain=false;r.baseline=structuredClone(c.layout());r.message='Version saved. You can make another change or save the finished image.';}catch(e){r.saveUncertain=true;c.conflict?.();throw Error('Save not confirmed. Retry Use this version, or reload the saved layout. '+e.message);}});});
 el('Undo')?.addEventListener('click',()=>{if(c.locked()||r.saveUncertain||!r.history.length)return;c.apply(r.history.pop());r.candidate=JSON.stringify(c.layout())!==JSON.stringify(r.baseline);r.artworkBrief='';r.message=r.candidate?'Previous version restored. Choose Use this version to keep it.':'Change undone.';c.render();});
 el('Reload')?.addEventListener('click',()=>{void run(async()=>{await c.reload();});});
 el('Artwork')?.addEventListener('click',()=>{if(c.locked()||r.candidate||r.saveUncertain||!c.ready())return;void c.artwork(r.artworkBrief);});sync();assistantSuggestions(c);
}
export function assistantCanLeave(owner,notify){const r=owner?.graphicAssistant;if(r?.candidate||r?.saveUncertain){notify('Choose Use this version to keep the preview before leaving. You can undo it first.');return false;}return true;}
