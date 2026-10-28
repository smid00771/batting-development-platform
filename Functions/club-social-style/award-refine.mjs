import {visualPatch,badgeCrops,refinedAwardLayout,matchingResultBadgeCrops,awardStyleSchema,awardStyleInstructions,awardExampleInstructions,AWARD_TEMPLATE_FIELDS,awardTemplateInstructions} from '../../social-awards-design.js';
import {GRAPHIC_FIELDS,graphicPatch,refinedGraphicLayout,graphicSchema,graphicInstructions,gradeLabels,gradeLabelSchema,withGradeLabels,graphicGrade,graphicLabel,graphicLabelKinds,graphicLabelSchema,graphicLabelInstructions,graphicPlayerDisplays} from '../../social-graphic-design.js';

const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply=(status,body)=>({status,body}),failure=(status,error)=>reply(status,{error});
function base64(bytes){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}
function png(bytes,maxBytes,maxSide){
 if(bytes.length<24||bytes.length>maxBytes||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))return false;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=view.getUint32(16),height=view.getUint32(20);
 return width>0&&height>0&&width<=maxSide&&height<=maxSide&&width*height<=16000000;
}

// No service key, storage writes or publishing actions. All club data uses the caller's JWT and RLS.
export async function refineAward(body,{url,anon,key,model,authorization,fetcher=fetch}){
 try{
  if(!body||typeof body!=='object')return failure(400,'Choose a graphic and describe the change.');
  const general=Object.hasOwn(GRAPHIC_FIELDS,body.kind||'');
  if(body.reference_review!==undefined&&(body.reference_review!==true||general))return failure(400,'Choose an award example to compare.');
  if(body.example_setup!==undefined&&(body.example_setup!==true||general))return failure(400,'Choose an award example to prepare.');
  if(!uuid(body.club_id)||!general&&!['results','century','five_wickets'].includes(body.kind)||typeof body.brief!=='string'||!body.brief.trim()||body.brief.length>1500||!/^\d{4}-\d{2}-\d{2}$/.test(body.week_end||'')||!Number.isInteger(body.design_revision)||body.design_revision<0)return failure(400,'Choose a graphic and describe the change in a short message.');
  if(typeof body.preview!=='string'||body.preview.length>2800000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.preview))return failure(400,'The graphic preview could not be read. Refresh the preview and try again.');
  let current,preview,label,samples;try{current=general?graphicPatch(body.kind,body.current):visualPatch(body.current);label=graphicLabel(body.graphic_label);if(label&&!graphicLabelKinds.includes(body.kind))throw Error('Unsupported label');preview=Uint8Array.from(atob(body.preview.slice(22)),c=>c.charCodeAt(0));}catch{return failure(400,'The graphic settings could not be read. Refresh and try again.');}
  if(body.font_samples!==undefined){try{if(typeof body.font_samples!=='string'||body.font_samples.length>2800000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.font_samples))throw Error();samples=Uint8Array.from(atob(body.font_samples.slice(22)),c=>c.charCodeAt(0));if(!png(samples,2097152,1600))throw Error();}catch{return failure(400,'The font samples could not be read.');}}
  if(!png(preview,2097152,1600))return failure(400,'Use a smaller graphic preview.');
  const headers={apikey:anon,Authorization:authorization,'Content-Type':'application/json'},call=(path,options={})=>fetcher(url+path,{...options,headers,signal:AbortSignal.timeout(10000)});
  const auth=await call('/auth/v1/user');if(!auth.ok)return failure(401,'Sign in again to modify your club graphics.');
  const access=await call('/rest/v1/rpc/club_socials_api',{method:'POST',body:JSON.stringify({p_club_id:body.club_id,p_action:'access'})});
  if(!access.ok||(await access.json())?.allowed!==true)return failure(403,'Club Admin or socials manager access is required.');
  if(!key||!model)return failure(503,'Graphic assistance is not connected yet. The layout controls are still available.');
  const api=({team_week:'team_of_week_api',player_week:'player_of_week_api',team_selections:'club_socials_api'})[body.kind]||'club_social_awards_api';
  const awards=await call('/rest/v1/rpc/'+api,{method:'POST',body:JSON.stringify({p_club_id:body.club_id,p_action:'context',p_data:{week_end:body.week_end,include_provisional:body.include_provisional===true,...(body.award_scope?{award_scope:body.award_scope}:{})}})});
  if(!awards.ok)return failure(409,'Reload your saved graphics before trying this change.');
  const context=await awards.json(),saved=body.kind==='team_selections'?{layout:context.design,revision:context.revision}:general?context.design:context.designs?.[body.kind];
  if((saved?.revision||0)!==body.design_revision)return failure(409,'The club’s saved artwork changed. Reload the saved layout, then try again.');
  const reference=body.kind==='team_selections'?(context.assets||[]).find(a=>['reference','reference_extra'].includes(a.kind)):null;
  const example=reference?.path||saved?.layout?.example_path||null,folder=body.kind==='team_week'?'backgrounds':body.kind==='team_selections'?'(?:reference|reference_extra)':'artwork',bucket=({team_week:'club-team-week',player_week:'club-player-week',team_selections:'club-socials'})[body.kind]||'club-social-awards';
  if((body.example_setup||body.reference_review)&&!example)return failure(400,'Upload a previous example for this club first.');
  if(example&&!new RegExp('^'+body.club_id+'/'+folder+'/[0-9a-f-]{36}\\.png$','i').test(example))return failure(400,'Upload a previous example for this club first.');
  let grades=[...new Set([...(context.candidates||[]).map(p=>p.grade),...(context.cards||[]).map(c=>c.scorecard?.grade),...(context.fixtures||[]).map(f=>f.published?.details?.grade),...(context.grade_defaults||[]).map(g=>g.grade)].filter(g=>typeof g==='string'&&g.trim()))];
  let labelsNow;try{
   if(body.preview_grades!==undefined){if(!Array.isArray(body.preview_grades)||body.preview_grades.length>40||body.preview_grades.some(g=>typeof g!=='string'||!grades.includes(g)))return failure(400,'The preview grades changed. Reload the scores and try again.');grades=[...new Set(body.preview_grades)];}
   labelsNow=withGradeLabels(saved?.layout||{},gradeLabels(body.grade_labels||[]),null);
  }catch{return failure(400,'The preview labels could not be read.');}
  let players=[];
  if(body.preview_players!==undefined){
   if(body.kind!=='team_week')return failure(400,'Player figure choices are only available for Team of the Week.');
   try{players=graphicPlayerDisplays(body.preview_players,context.candidates||[]).map(choice=>({...context.candidates.find(p=>p.key===choice.key),display:choice.display}));}
   catch(error){return failure(400,error.message);}
  }
  // Existing per-club allowance and rate limits apply to every attempt, with a fresh server ID.
  const counted=await call('/rest/v1/rpc/club_socials_api',{method:'POST',body:JSON.stringify({p_club_id:body.club_id,p_action:'style_request',p_data:{request_id:crypto.randomUUID(),brief:body.brief,reference_ids:[]}})});
  if(!counted.ok){const error=await counted.json().catch(()=>({})),message=String(error.message||'Graphic assistance is unavailable.').slice(0,300);return failure(/allowance|used its style suggestions|paused/i.test(message)?429:400,message);}
  const data=await counted.json(),content=[{type:'input_text',text:JSON.stringify({club:data.brand,graphic:body.kind,design_brief:body.brief,current_settings:current,...(graphicLabelKinds.includes(body.kind)?{graphic_label:label}:{}),...(players.length?{available_players:players.map(p=>({key:p.key,name:p.name,grade:p.grade,display:p.display,available_figures:[...(p.batting?.length?['batting']:[]),...(p.bowling?.length?['bowling']:[])]}))}:{}),available_grades:grades.map(grade=>({grade,label:graphicGrade(grade,labelsNow,body.kind==='team_week')})),title_in_background:typeof body.title_in_background==='boolean'?body.title_in_background:!!saved?.layout?.includes_title})},{type:'input_text',text:'CURRENT PREVIEW. Keep its match facts unchanged.'},{type:'input_image',image_url:body.preview,detail:'high'}];
  if(example){
   const image=await call('/storage/v1/object/authenticated/'+bucket+'/'+example);
   if(!image.ok)return failure(409,'The previous example could not load. Check it in Artwork and try again.');
   if(Number(image.headers.get('Content-Length')||0)>10485760)return failure(400,'Use a previous example under 10 MB.');
   const bytes=new Uint8Array(await image.arrayBuffer());if(!png(bytes,10485760,8192))return failure(400,'Upload a PNG previous example under 10 MB.');
   content.push({type:'input_text',text:'THIS CLUB’S PREVIOUS EXAMPLE. Visual reference only. Old scores and results must never be reused.'},{type:'input_image',image_url:'data:image/png;base64,'+base64(bytes),detail:'high'});
  }
  if(samples)content.push({type:'input_text',text:'SUPPORTED FONT SAMPLES. Match each reference text role to the closest actual font shown here. Sample words are not match facts.'},{type:'input_image',image_url:body.font_samples,detail:'high'});
  const schema=general?graphicSchema(body.kind,grades,players):{...awardStyleSchema,required:[...awardStyleSchema.required,'grade_labels','graphic_label'],properties:{...awardStyleSchema.properties,grade_labels:gradeLabelSchema(grades),graphic_label:graphicLabelSchema}};
  const supportsTemplate=Object.hasOwn(current,'title_font');
  if(!general&&!supportsTemplate){
   schema.properties.changes=structuredClone(schema.properties.changes);
   for(const key of Object.keys(AWARD_TEMPLATE_FIELDS)){delete schema.properties.changes.properties[key];schema.properties.changes.required=schema.properties.changes.required.filter(k=>k!==key);}
   schema.properties.changes.properties.badge_style.enum=schema.properties.changes.properties.badge_style.enum.filter(v=>v!=='glow');
   schema.properties.changes.properties.row_gap.maximum=55;
  }
  const supportsResultLabels=Object.hasOwn(current,'result_labels');
  if(!general&&!supportsResultLabels){
   schema.properties.changes=structuredClone(schema.properties.changes);
   delete schema.properties.changes.properties.result_labels;schema.properties.changes.required=schema.properties.changes.required.filter(k=>k!=='result_labels');
   schema.properties.badges=structuredClone(schema.properties.badges);schema.properties.badges.items.properties.label.enum=['WIN','DEF'];
  }
  const instructions=general?graphicInstructions:awardStyleInstructions+'\n'+graphicLabelInstructions+'\nFor an explicit request to shorten a grade label, return grade_labels with the exact full source grade from available_grades and the requested short label. This affects the graphic only. Otherwise return an empty grade_labels array. Never rename other grades.'+(!supportsResultLabels?'\nThis older client supports only WIN/DEF wording. Do not return result_labels or other badge words. If different wording is requested, explain that the app must be refreshed; do not send the wording change to the image editor.':'')+(body.example_setup?'\n'+awardExampleInstructions:'')+(supportsTemplate?'\n'+awardTemplateInstructions:'')+(body.reference_review?'\nThis is a bounded REVIEW of an already RENDERED proposed template. Compare CURRENT PREVIEW against PREVIOUS EXAMPLE and the original request. Correct only clear mismatches in supported typography, colours, composition and spacing. Inspect the actual pixels, including separate heading/body/script fonts and the margin line. Keep the declared match outcomes and figures intact. Background artwork is prepared separately: ignore differences in texture, logos or baked-in title artwork that layout settings cannot fix. Return only visual changes, badges:[], grade_labels:[], graphic_label:null, artwork_brief:null. Leave all settings null when the supported treatment is already faithful. If a margin is unavailable in current data, do not invent one. Be candid about remaining approximation.':'');
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'club_award_refinement',strict:true,schema}},max_output_tokens:supportsTemplate?5200:3600}),signal:AbortSignal.timeout(55000)});
  if(!response.ok)return failure(response.status===429?429:502,response.status===429?'Graphic assistance is busy. Try again later.':'The change could not be prepared. Your current graphic is still here.');
  const result=await response.json();if(result.status&&result.status!=='completed')return failure(502,'The suggestion was incomplete. Try a smaller change.');
  const output=(result.output||[]).flatMap(m=>m.content||[]);if(output.some(x=>x.type==='refusal'))return failure(422,'This change could not be prepared. Try describing it another way.');
  const value=JSON.parse(result.output_text||output.filter(x=>x.type==='output_text').map(x=>x.text).join(''));
  const changes=general?graphicPatch(body.kind,value.changes):visualPatch(value.changes),badges=badgeCrops(value.badges||[]),labels=gradeLabels(value.grade_labels||[],grades),nextLabel=graphicLabel(value.graphic_label);
  if((body.example_setup||body.reference_review)&&(badges.length||labels.length||nextLabel||value.artwork_brief))throw Error('Example setup can change only the supported visual settings.');
  const playerDisplays=graphicPlayerDisplays(value.player_displays||[],players);
  if(nextLabel&&!graphicLabelKinds.includes(body.kind))throw Error('Unsupported label');
  if(!supportsResultLabels&&(Object.hasOwn(changes,'result_labels')||badges.some(c=>!['WIN','DEF'].includes(c.label))))throw Error('Unsupported result wording');
  if(!supportsTemplate&&(Object.keys(changes).some(k=>Object.hasOwn(AWARD_TEMPLATE_FIELDS,k))||changes.badge_style==='glow'||changes.row_gap>55))throw Error('Refresh the app for template typography.');
  let acceptedBadges=badges;
  if(general){if(badges.length)throw Error('Unexpected badges');refinedGraphicLayout(body.kind,{...saved?.layout,...current},{changes,grade_labels:labels},grades);}
  else {
   const next=withGradeLabels(refinedAwardLayout({rows_top:29,rows_bottom:96,result_labels:'win_def',...current,example_path:example},{changes,badges,example_path:example},body.kind),labels,grades);
   if(badges.length)acceptedBadges=matchingResultBadgeCrops(next);
  }
  const badgeNote=badges.length&&!acceptedBadges.length?' Both result words use the graphic font because a matching pair of crops was not available.':'';
  return reply(200,{changes,badges:acceptedBadges,grade_labels:labels,...(body.preview_players!==undefined?{player_displays:playerDisplays}:{}),...(graphicLabelKinds.includes(body.kind)?{graphic_label:nextLabel}:{}),example_path:example,explanation:(String(value.explanation||'Review the updated preview.')+badgeNote).slice(0,800),artwork_brief:typeof value.artwork_brief==='string'?value.artwork_brief.slice(0,1500):null});
 }catch(error){return failure(502,['TimeoutError','AbortError'].includes(error?.name)?'The change took too long. Your current graphic is still here. Try again later.':'The suggestion could not be applied safely. Your current graphic is still here. Try a smaller change.');}
}
