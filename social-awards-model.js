import {resultsLayoutPlan,resultsRowPlan} from './social-results-layout.js?v=0.8.62.293';
import {referenceBadgePair} from './social-award-lettering.js?v=0.8.62.294';
import {AWARD_FONTS,AWARD_FONT_WEIGHTS,awardFont,awardFontsReady} from './social-award-fonts.js?v=0.8.62.293';
import {graphicGrade,checkGraphicLabel} from './social-graphic-design.js?v=0.8.62.225';
import {safeAwardStyle,resultLabel,matchingResultBadgeCrops} from './social-awards-design.js?v=0.8.62.293';

export const SOCIAL_AWARDS = [
 {key:'team_week',label:'Team of the Week',description:'Choose your XI from the round.'},
 {key:'player_week',label:'Player of the Week',description:'Choose and recognise one player.'},
 {key:'results',label:'Results',description:'Scores, results and standout performances by grade.'},
 {key:'five_wickets',label:'5 Wickets',description:'Every haul of five or more wickets in an innings.'},
 {key:'century',label:'Century',description:'Every innings of 100 runs or more.'}
];
export const awardLabel=kind=>SOCIAL_AWARDS.find(x=>x.key===kind)?.label||'Social graphic';
export function awardLayout(kind,saved={}){
 return {includes_title:false,show_logo:!saved.background_path,text_panel:true,text_colour:'#FFFFFF',title_y:9,title_size:kind==='results'?112:104,
  week_y:kind==='results'?15:18,name_y:77,name_size:76,figures_y:86,figures_size:94,grade_y:94,rows_top:29,rows_bottom:96,
  logo_x:50,logo_y:19,logo_size:11,opponent_logos:{},...saved,...safeAwardStyle(saved),show_week:typeof saved.show_week==='boolean'?saved.show_week:kind!=='results'};
}
export function awardFigures(item){return item.kind==='century'?`${item.stat.runs}${item.stat.not_out?'*':''}`:`${item.stat.wickets}/${item.stat.runs}`;}
export function awardCaption(items){return items.map(x=>x.label).join('\n');}
export function awardBatches(items,size=10){if(!Number.isInteger(size)||size<1)throw Error('Invalid batch size');const batches=[];for(let i=0;i<items.length;i+=size)batches.push(items.slice(i,i+size));return batches;}
export function resultsShareOpponent(items,keys={}){
 const clubs=items.map(item=>{const team=(item.teams||[]).find(t=>t.id!==item.our_team);return keys[item.key]||team?.organisation_id||team?.name?.trim().toLowerCase()||team?.id;});
 return clubs.length>0&&clubs.every(key=>key&&key===clubs[0]);
}
export function resultsOutcome(item){
 // Use the imported result, never totals, example artwork or last week's selection.
 const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
 const text=normalize(item.result),teams=item.teams||[];
 if(!text||!teams.some(t=>t.id===item.our_team))return '';
 const outcomes=new Set();
 for(const team of teams)for(const alias of new Set([team.name,team.organisation].map(normalize).filter(Boolean))){
  if(!text.startsWith(alias+' '))continue;
  const rest=text.slice(alias.length).trim();
  const lost=/^(?:lost\b|(?:was |were )?defeated by\b|(?:was |were )?beaten by\b|forfeited\b)/.test(rest);
  const won=!lost&&/^(?:won\b|wins?\b|defeated\b|beat\b|def(?:\.|\s))/.test(rest);
  if(won||lost)outcomes.add((team.id===item.our_team)===won?'WIN':'LOSS');
 }
 if(outcomes.size===1)return [...outcomes][0];
 if(outcomes.size>1)return '';
 if(/\bno result\b|\babandon(?:ed|ment)?\b|\bwash[ -]?out\b/.test(text))return 'NO RESULT';
 if(/\btied?\b/.test(text))return 'TIE';
 if(/\bdraw(?:n)?\b/.test(text))return 'DRAW';
 return '';
}
export function resultsMargin(item){
 if(item.provisional||!['WIN','LOSS'].includes(resultsOutcome(item)))return '';
 // Only expose a recorded result margin. Never turn scores or an example into a result.
 const text=String(item.result||'').normalize('NFKC').replace(/\s+/g,' ').trim();
 const matches=[...text.matchAll(/\bby\s+((?:an?\s+innings(?:\s+(?:and|&)\s+[1-9]\d{0,3}\s+runs?)?)|(?:[1-9]\d{0,3}\s+(?:runs?|wickets?)))\b(\s*\((?:DLS(?: method)?|Duckworth[^)]{0,50}|VJD(?: method)?)\))?/gi)];
 if(matches.length!==1)return '';
 const match=matches[0];if(/^(\d+) wickets?$/i.test(match[1])&&Number(match[1].split(' ')[0])>10)return '';
 return ('BY '+match[1]+(match[2]||'')).toUpperCase();
}
export function resultsSummary(item){
 const ours=(item.innings||[]).filter(i=>i.team_id===item.our_team),theirs=(item.innings||[]).filter(i=>i.team_id!==item.our_team);
 const names=item.teams||[],ourName=names.find(t=>t.id===item.our_team)?.name||'Our club',opposition=names.filter(t=>t.id!==item.our_team).map(t=>t.name).join(' / ');
 const score=innings=>innings.map(i=>Number.isFinite(i.runs)&&Number.isFinite(i.wickets)?`${i.wickets}/${i.runs}${/declared/i.test(i.closure||'')?' dec':''}`:'Score unavailable').join(' & ')||'Score unavailable';
 const batting=ours.flatMap(i=>(i.batters||[]).filter(b=>b.importable&&b.status==='played'&&Number.isFinite(b.runs)).map(b=>({...b,innings:i.number}))).sort((a,b)=>b.runs-a.runs||a.name.localeCompare(b.name)).slice(0,3);
 const bowling=theirs.flatMap(i=>(i.bowlers||[]).filter(b=>b.team_id===item.our_team&&b.importable&&Number.isFinite(b.wickets)&&b.wickets>0).map(b=>({...b,innings:i.number}))).sort((a,b)=>b.wickets-a.wickets||a.runs-b.runs||a.name.localeCompare(b.name)).slice(0,3);
 const text=item.provisional?'Match in progress':(item.result||'').trim(),outcome=item.provisional?'IN PROGRESS':resultsOutcome(item);
 return {ourName,opposition,ourScore:score(ours),theirScore:score(theirs),batting,bowling,outcome,margin:resultsMargin(item),result:text||'Result not supplied'};
}
export async function drawAwardGraphic(h,s,canvas,{kind,items,layout,photo,week,images={}}){
 layout=awardLayout(kind,layout);
 const bg=images.background,portrait=images.photo,logo=layout.show_logo?images.logo:null;
 await h.fontReady();await awardFontsReady(layout);canvas.width=bg?(bg.naturalWidth||bg.width):1080;canvas.height=bg?(bg.naturalHeight||bg.height):1350;
 const ctx=canvas.getContext('2d');canvas.graphicLabelWarnings=[];if(bg)ctx.drawImage(bg,0,0);else{const g=ctx.createLinearGradient(0,0,canvas.width,canvas.height);g.addColorStop(0,s.design?.primary||'#073554');g.addColorStop(1,s.design?.accent||'#128fd2');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);}
 const scale=canvas.width/1080,height=canvas.height/scale;ctx.scale(scale,scale);ctx.socialFont=AWARD_FONTS[layout.font];ctx.textAlign='center';ctx.textBaseline='middle';
 const text=(value,x,y,width,size,colour=layout.text_colour,role='player')=>{
  value=String(value);const font=awardFont(layout,role),weight=AWARD_FONT_WEIGHTS[font]||'700';ctx.socialFont=AWARD_FONTS[font];ctx.fillStyle=colour;
  // Include italic/script overhang, not just the advance width. This protects
  // neighbouring columns without cutting the final letter off at the clip edge.
  while(size>18){ctx.font=`${weight} ${size}px ${ctx.socialFont}`;const m=ctx.measureText(value),ink=ctx.textAlign==='center'?2*Math.max(m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.width/2):Math.max(m.width,m.actualBoundingBoxLeft+m.actualBoundingBoxRight);if(ink<=width-4)break;size--;}
  ctx.font=`${weight} ${size}px ${ctx.socialFont}`;const bounds=ctx.measureText(value);
  if(role==='title'||role==='week')y=Math.max(24+bounds.actualBoundingBoxAscent,Math.min(height-24-bounds.actualBoundingBoxDescent,y));
  h.text(ctx,value,x,y,width-4,size,weight);
  return {top:y-bounds.actualBoundingBoxAscent,bottom:y+bounds.actualBoundingBoxDescent};
 };
 const title=value=>layout.title_case==='title'?value.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()):value.toUpperCase();
 const image=(img,x,y,size,maxHeight=.7)=>{if(!img)return;const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,fit=Math.min(1080*size/100/iw,height*maxHeight/ih),w=iw*fit,ht=ih*fit;ctx.drawImage(img,(1080-w)*x/100,(height-ht)*y/100,w,ht);};
 if(kind!=='results'){
  const item=items[0];image(portrait,photo?.x??50,photo?.y??40,photo?.size??65);
  if(layout.text_panel){ctx.fillStyle='rgba(0,0,0,.35)';const top=Math.min(layout.name_y,layout.figures_y,layout.grade_y)*height/100-60;ctx.fillRect(0,top,1080,height-top);}
  image(logo,layout.logo_x,layout.logo_y,layout.logo_size,.25);
  if(!layout.includes_title)text(title(awardLabel(kind)),540,height*layout.title_y/100,990,layout.title_size,layout.text_colour,'title');
  if(layout.show_week)text(week,540,height*layout.week_y/100,980,layout.week_size,layout.text_colour,'week');
  text((item?.name||'CHOOSE A PERFORMANCE').toUpperCase(),540,height*layout.name_y/100,980,layout.name_size);
  text(item?awardFigures(item)+(kind==='century'?' RUNS':''):'',540,height*layout.figures_y/100,980,layout.figures_size,layout.text_colour,'score');
  ctx.socialFont=AWARD_FONTS[awardFont(layout,'grade')];ctx.font=`${AWARD_FONT_WEIGHTS[awardFont(layout,'grade')]||'700'} 30px ${ctx.socialFont}`;const grade=graphicGrade(item?.grade,layout);checkGraphicLabel(canvas,ctx,{source:item?.grade,label:grade,width:980-ctx.measureText(item?.opposition?' · v '+item.opposition:'').width,size:30,grade:true});text([grade,item?.opposition&&'v '+item.opposition].filter(Boolean).join(' · '),540,height*layout.grade_y/100,980,30,layout.text_colour,'grade');return;
 }
 const titleBounds=!layout.includes_title?text(title(items.some(x=>x.provisional)?'MATCH UPDATE':'RESULTS'),540,height*layout.title_y/100,990,layout.title_size,layout.text_colour,'title'):null;
 let weekBounds=null;
 if(layout.show_week){checkGraphicLabel(canvas,ctx,{source:week,label:week,width:970,size:layout.week_size});const weekY=Math.max(height*layout.week_y/100,titleBounds?titleBounds.bottom+layout.week_size*.6+12:0);weekBounds=text(week,540,weekY,970,layout.week_size,layout.text_colour,'week');}
 const sharedOpponent=resultsShareOpponent(items,images.opponentKeys);
 const logoPair=(opponent,summary,x,y,size,gap,colour)=>{
  const badge=(img,name,cx)=>{if(!img){text(name,cx,y,size,Math.min(26,size*.3),colour);return;}const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,fit=Math.min(size/iw,size/ih);ctx.drawImage(img,cx-iw*fit/2,y-ih*fit/2,iw*fit,ih*fit);};
  badge(logo,summary.ourName,x-(size+gap)/2);text('VS',x,y,gap-8,Math.min(60,size*.5),colour);badge(opponent,summary.opposition,x+(size+gap)/2);
 };
 const headerBottom=Math.max(weekBounds?.bottom||0,titleBounds?.bottom??height*layout.title_y/100+layout.title_size*.6);
 const plan=resultsLayoutPlan(layout,height,items.length,sharedOpponent,headerBottom),{top,bottom,gap,rowHeight,columns}=plan,inset=layout.row_inset;
 canvas.resultsLayout={...plan,sharedOpponent};
 const crops=images.example?matchingResultBadgeCrops(layout):[],lettering=crops.length?referenceBadgePair(images.example,crops,()=>canvas.ownerDocument?canvas.ownerDocument.createElement('canvas'):new canvas.constructor(1,1)):null;
 canvas.resultsLetteringFallback=crops.length>0&&!lettering;
 if(plan.header){const {x,y,size,gap}=plan.header;logoPair(items.map(item=>images.opponents?.[item.key]).find(Boolean),resultsSummary(items[0]),x,y,size,gap,layout.text_colour);}
 const measure=(value,role,size)=>{const font=awardFont(layout,role);ctx.save();ctx.textAlign='left';ctx.font=`${AWARD_FONT_WEIGHTS[font]||'700'} ${size}px ${AWARD_FONTS[font]}`;const m=ctx.measureText(value);ctx.restore();return m;};
 const marginLines=(value,d=layout,scale=1)=>{
  let size=Math.min(d.margin_size,34*scale),lines=[];
  if(!value)return {lines,size};
  if(/^BY \d+ (?:RUNS?|WICKETS?)$/.test(value)){
   while(size>18&&measure(value,'margin',size).width>columns.centreWidth-4)size--;
   return {lines:[value],size:Math.max(18,size)};
  }
  do{
   lines=[];let line='';
   for(const word of value.split(' ')){const next=line?line+' '+word:word;if(line&&measure(next,'margin',size).width>columns.centreWidth-4){lines.push(line);line=word;}else line=next;}
   if(line)lines.push(line);if(lines.length<=2)break;
  }while(--size>=18);
  return {lines:lines.length<=2?lines:[value],size:Math.max(18,size)};
 };
 const band=(x,width,y,fn)=>{ctx.save();ctx.beginPath();ctx.rect(x,y,width,rowHeight);ctx.clip();fn();ctx.restore();};

 const rowScale=plan.rowScale,d={...layout};
 for(const key of ['grade_size','grade_width','score_size','player_size','badge_size','badge_width','margin_size'])d[key]*=rowScale;
 d.badge_width=Math.min(columns.centreWidth,d.badge_width);
 for(let n=0;n<items.length;n++){
  const item=items[n],r=resultsSummary(item),y=top+n*(rowHeight+gap+plan.logoBand),outcome=r.outcome;
  if(plan.mixedLogos){const {size,gap:logoGap,offset}=plan.mixedLogos;logoPair(images.opponents?.[item.key],r,columns.centre,y+offset,size,logoGap,d.text_colour);}
  ctx.fillStyle=d.panel_colour;ctx.globalAlpha=d.row_opacity/100;
  if(d.row_radius){ctx.beginPath();ctx.roundRect(inset,y,1080-2*inset,rowHeight,Math.min(d.row_radius,rowHeight/2));ctx.fill();}else ctx.fillRect(inset,y,1080-2*inset,rowHeight);ctx.globalAlpha=1;
  ctx.fillStyle=d.grade_colour||s.design?.primary||'#073554';
  if(d.grade_style==='ribbon'){ctx.beginPath();ctx.moveTo(290,y-12*rowScale);ctx.lineTo(790,y-12*rowScale);ctx.lineTo(774,y+11*rowScale);ctx.lineTo(790,y+33*rowScale);ctx.lineTo(290,y+33*rowScale);ctx.lineTo(306,y+11*rowScale);ctx.closePath();ctx.fill();}
  else if(d.grade_style==='bar')ctx.fillRect(540-d.grade_width/2,y-12*rowScale,d.grade_width,45*rowScale);
  const sourceGrade=graphicGrade(item.grade,d),grade=d.grade_case==='preserve'?sourceGrade:sourceGrade.toUpperCase();ctx.socialFont=AWARD_FONTS[awardFont(layout,'grade')];ctx.font=`${AWARD_FONT_WEIGHTS[awardFont(layout,'grade')]||'700'} ${d.grade_size}px ${ctx.socialFont}`;checkGraphicLabel(canvas,ctx,{source:item.grade,label:grade,width:d.grade_width-25,size:d.grade_size,grade:true});text(grade,540,y+10*rowScale,d.grade_width-25,d.grade_size,d.grade_style==='text'?(d.grade_colour||d.score_colour):d.grade_text_colour,'grade');
  const margin=d.show_margin?r.margin:'',{lines,size:marginSize}=marginLines(margin,d,rowScale),marginHeight=lines.length*marginSize*1.15;
  const badgeLabel=resultLabel(outcome,d),badgeImage=lettering?.[badgeLabel];
  const m=measure(badgeLabel,'badge',d.badge_size),badgeHeight=badgeImage?Math.min(100*rowScale,d.badge_width*badgeImage.height/badgeImage.width):['plain','glow'].includes(d.badge_style)?Math.max(30,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent):Math.min(100,d.badge_size*1.45);
  const row=resultsRowPlan(d,rowHeight,sharedOpponent,marginHeight,badgeHeight,rowScale),bodyInk=measure('Alex Player','player',d.player_size),inkHeight=bodyInk.actualBoundingBoxAscent+bodyInk.actualBoundingBoxDescent;
  const font=Math.min(d.player_size,inkHeight>0?d.player_size*Math.max(18,row.line-5)/inkHeight:row.line*.8),left=columns.left,right=columns.right;
  const playerName=(value,start,y,width)=>{ctx.textAlign=d.player_align;const x=d.player_align==='center'?start+width/2:d.player_align==='right'?start+width:start;text(value,x,y,width,font,d.player_colour);};
  band(left,columns.leftFigures-left,y,()=>{
   text(r.ourScore,(left+columns.leftFigures)/2,y+row.scoreY,columns.leftFigures-left,d.score_size,d.score_colour,'score');
   const figureWidth=Math.max(54,...r.batting.map(p=>Math.min(96,measure(`${p.runs}${p.not_out?'*':''}`,'player',font).width+8)));
   for(let j=0;j<r.batting.length;j++){const bat=r.batting[j];playerName(bat.name,left,y+row.playerTop+j*row.line,columns.leftFigures-figureWidth-16-left);ctx.textAlign='right';text(`${bat.runs}${bat.not_out?'*':''}`,columns.leftFigures,y+row.playerTop+j*row.line,figureWidth,font,d.player_colour);}
  });
  band(columns.rightNames,right-columns.rightNames,y,()=>{
   ctx.textAlign='center';text(r.theirScore,(columns.rightNames+right)/2,y+row.scoreY,right-columns.rightNames,d.score_size,d.score_colour,'score');
   const figureWidth=Math.max(70,...r.bowling.map(p=>Math.min(112,measure(`${p.wickets}/${p.runs}`,'player',font).width+8)));
   for(let j=0;j<r.bowling.length;j++){const bowl=r.bowling[j];playerName(bowl.name,columns.rightNames,y+row.playerTop+j*row.line,right-figureWidth-16-columns.rightNames);ctx.textAlign='right';text(`${bowl.wickets}/${bowl.runs}`,right,y+row.playerTop+j*row.line,figureWidth,font,d.player_colour);}
  });
  ctx.textAlign='center';
  band(columns.centre-100,200,y,()=>{
   drawResultBadge(ctx,text,{outcome,label:badgeLabel,x:columns.centre,y:y+row.badgeY,maxHeight:row.badgeHeight,layout:d,badgeImage});
   if(lines.length)lines.forEach((line,i)=>text(line,columns.centre,y+row.marginTop+marginSize*.6+i*marginSize*1.15,columns.centreWidth,marginSize,d.margin_colour,'margin'));
   else if(!sharedOpponent&&!d.show_margin)text(r.opposition,columns.centre,y+rowHeight*.91,columns.centreWidth,18,d.player_colour);
  });

 }
}

// The label is always computed from the imported outcome, never from a design request.
function drawResultBadge(ctx,text,{outcome,label,x,y,maxHeight,layout:d,badgeImage}){
 const colour=outcome==='WIN'?d.win_colour:outcome==='LOSS'?d.loss_colour:d.score_colour;
 if(badgeImage){const fit=Math.min(d.badge_width/badgeImage.width,maxHeight/badgeImage.height);ctx.drawImage(badgeImage,x-badgeImage.width*fit/2,y-badgeImage.height*fit/2,badgeImage.width*fit,badgeImage.height*fit);return;}
 const badgeText=(value,tx,ty,width,size,colour)=>text(value,tx,ty,width,size,colour,'badge');
 const size=label.length>4?Math.min(26,d.badge_size):Math.min(d.badge_size,maxHeight*1.1);
 if(d.badge_style==='glow'&&['WIN','LOSS'].includes(outcome)){ctx.save();ctx.shadowColor=colour;ctx.shadowBlur=Math.min(28,size*.45);ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;badgeText(label,x,y,d.badge_width,size,d.badge_text_colour);badgeText(label,x,y,d.badge_width,size,d.badge_text_colour);ctx.restore();return;}
 if(!['WIN','LOSS'].includes(outcome)||(d.badge_style==='plain'&&!d.badge_angle)){badgeText(label,x,y,d.badge_width,size,colour);return;}
 ctx.save();ctx.translate(x,y);const angle=d.badge_angle*Math.PI/180,w=d.badge_width,ht=Math.min(maxHeight,Math.max(54,size*1.45)),fit=Math.min(1,178/(Math.abs(Math.cos(angle))*w+Math.abs(Math.sin(angle))*ht));ctx.rotate(angle);ctx.scale(fit,fit);ctx.fillStyle=colour;ctx.strokeStyle=colour;ctx.lineWidth=4;
 if(d.badge_style==='plain'){badgeText(label,0,0,w,size,colour);ctx.restore();return;}
 if(d.badge_style==='circle'){ctx.beginPath();ctx.ellipse(0,0,w/2,ht/2,0,0,Math.PI*2);ctx.fill();}
 else if(d.badge_style==='outline'){ctx.strokeRect(-w/2+3,-ht/2+3,w-6,ht-6);}
 else{ctx.beginPath();const points=d.badge_style==='ribbon'?[[-.5,-.5],[.5,-.5],[.42,0],[.5,.5],[-.5,.5],[-.42,0]]:[[-.49,-.4],[-.13,-.5],[.46,-.44],[.43,-.22],[.5,-.1],[.46,.22],[.49,.4],[.1,.49],[-.5,.4],[-.46,.2],[-.5,.1],[-.46,-.12]];points.forEach(([a,b],i)=>i?ctx.lineTo(a*w,b*ht):ctx.moveTo(a*w,b*ht));ctx.closePath();ctx.fill();}
 badgeText(label,0,0,w-24,Math.min(size,ht*.72),d.badge_style==='outline'?colour:d.badge_text_colour);ctx.restore();
}
