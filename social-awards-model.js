import {AWARD_FONTS,AWARD_FONT_WEIGHTS,awardFont,awardFontsReady} from './social-award-fonts.js?v=0.8.62.290';
import {graphicGrade,checkGraphicLabel} from './social-graphic-design.js?v=0.8.62.225';
import {safeAwardStyle,resultLabel,matchingResultBadgeCrops} from './social-awards-design.js?v=0.8.62.290';

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
  logo_x:50,logo_y:19,logo_size:11,opponent_logos:{},...saved,...safeAwardStyle(saved)};
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
 const text=(value,x,y,width,size,colour=layout.text_colour,role='player')=>{const font=awardFont(layout,role);ctx.socialFont=AWARD_FONTS[font];ctx.fillStyle=colour;h.text(ctx,String(value),x,y,width,size,AWARD_FONT_WEIGHTS[font]||'700');};
 const title=value=>layout.title_case==='title'?value.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()):value.toUpperCase();
 const image=(img,x,y,size,maxHeight=.7)=>{if(!img)return;const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,fit=Math.min(1080*size/100/iw,height*maxHeight/ih),w=iw*fit,ht=ih*fit;ctx.drawImage(img,(1080-w)*x/100,(height-ht)*y/100,w,ht);};
 if(kind!=='results'){
  const item=items[0];image(portrait,photo?.x??50,photo?.y??40,photo?.size??65);
  if(layout.text_panel){ctx.fillStyle='rgba(0,0,0,.35)';const top=Math.min(layout.name_y,layout.figures_y,layout.grade_y)*height/100-60;ctx.fillRect(0,top,1080,height-top);}
  image(logo,layout.logo_x,layout.logo_y,layout.logo_size,.25);
  if(!layout.includes_title)text(title(awardLabel(kind)),540,height*layout.title_y/100,990,layout.title_size,layout.text_colour,'title');
  text(week,540,height*layout.week_y/100,980,layout.week_size,layout.text_colour,'week');
  text((item?.name||'CHOOSE A PERFORMANCE').toUpperCase(),540,height*layout.name_y/100,980,layout.name_size);
  text(item?awardFigures(item)+(kind==='century'?' RUNS':''):'',540,height*layout.figures_y/100,980,layout.figures_size,layout.text_colour,'score');
  ctx.socialFont=AWARD_FONTS[awardFont(layout,'grade')];ctx.font=`${AWARD_FONT_WEIGHTS[awardFont(layout,'grade')]||'700'} 30px ${ctx.socialFont}`;const grade=graphicGrade(item?.grade,layout);checkGraphicLabel(canvas,ctx,{source:item?.grade,label:grade,width:980-ctx.measureText(item?.opposition?' · v '+item.opposition:'').width,size:30,grade:true});text([grade,item?.opposition&&'v '+item.opposition].filter(Boolean).join(' · '),540,height*layout.grade_y/100,980,30,layout.text_colour,'grade');return;
 }
 if(!layout.includes_title)text(title(items.some(x=>x.provisional)?'MATCH UPDATE':'RESULTS'),540,height*layout.title_y/100,990,layout.title_size,layout.text_colour,'title');
 checkGraphicLabel(canvas,ctx,{source:week,label:week,width:970,size:layout.week_size});text(week,540,height*layout.week_y/100,970,layout.week_size,layout.text_colour,'week');
 const sharedOpponent=resultsShareOpponent(items,images.opponentKeys);
 const logoPair=(opponent,summary,x,y,size,gap,colour)=>{
  const badge=(img,name,cx)=>{if(!img){text(name,cx,y,size,Math.min(26,size*.3),colour);return;}const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,fit=Math.min(size/iw,size/ih);ctx.drawImage(img,cx-iw*fit/2,y-ih*fit/2,iw*fit,ih*fit);};
  badge(logo,summary.ourName,x-(size+gap)/2);text('VS',x,y,gap-8,Math.min(60,size*.5),colour);badge(opponent,summary.opposition,x+(size+gap)/2);
 };
 if(sharedOpponent){
  let size=Math.min(1080*layout.logo_size/100,height*.11),y=(height-size)*layout.logo_y/100+size/2;
  if(layout.layout_mode==='template'){
   const top=Math.max(height*layout.week_y/100+layout.week_size*.65,!layout.includes_title?height*layout.title_y/100+layout.title_size*.6:0)+8,bottom=height*layout.rows_top/100-20;
   size=Math.min(size,Math.max(24,bottom-top));y=Math.max(top+size/2,Math.min(y,bottom-size/2));
  }
  const gap=Math.max(50,size*.6),width=size*2+gap;
  logoPair(items.map(item=>images.opponents?.[item.key]).find(Boolean),resultsSummary(items[0]),(1080-width)*layout.logo_x/100+width/2,y,size,gap,layout.text_colour);
 }
 const top=height*layout.rows_top/100,bottom=height*layout.rows_bottom/100,gap=layout.row_gap,rowHeight=(bottom-top-gap*(Math.max(items.length,1)-1))/Math.max(items.length,1),inset=layout.row_inset;
 for(let n=0;n<items.length;n++){
  const item=items[n],r=resultsSummary(item),y=top+n*(rowHeight+gap),outcome=r.outcome;
  ctx.fillStyle=layout.panel_colour;ctx.globalAlpha=layout.row_opacity/100;
  if(layout.row_radius){ctx.beginPath();ctx.roundRect(inset,y,1080-2*inset,rowHeight,Math.min(layout.row_radius,rowHeight/2));ctx.fill();}else ctx.fillRect(inset,y,1080-2*inset,rowHeight);ctx.globalAlpha=1;
  ctx.fillStyle=layout.grade_colour||s.design?.primary||'#073554';
  if(layout.grade_style==='ribbon'){ctx.beginPath();ctx.moveTo(290,y-12);ctx.lineTo(790,y-12);ctx.lineTo(774,y+11);ctx.lineTo(790,y+33);ctx.lineTo(290,y+33);ctx.lineTo(306,y+11);ctx.closePath();ctx.fill();}
  else if(layout.grade_style==='bar')ctx.fillRect(540-layout.grade_width/2,y-12,layout.grade_width,45);
  const sourceGrade=graphicGrade(item.grade,layout),grade=layout.grade_case==='preserve'?sourceGrade:sourceGrade.toUpperCase();ctx.socialFont=AWARD_FONTS[awardFont(layout,'grade')];ctx.font=`${AWARD_FONT_WEIGHTS[awardFont(layout,'grade')]||'700'} ${layout.grade_size}px ${ctx.socialFont}`;checkGraphicLabel(canvas,ctx,{source:item.grade,label:grade,width:layout.grade_width-25,size:layout.grade_size,grade:true});text(grade,540,y+10,layout.grade_width-25,layout.grade_size,layout.grade_style==='text'?(layout.grade_colour||layout.score_colour):layout.grade_text_colour,'grade');
  const template=layout.layout_mode==='template',scoreY=template?rowHeight*layout.score_y/100:56;
  text(r.ourScore,225,y+scoreY,360,layout.score_size,layout.score_colour,'score');text(r.theirScore,855,y+scoreY,360,layout.score_size,layout.score_colour,'score');
  const playerTop=template?rowHeight*layout.player_top/100:95,line=template?Math.min(42,(rowHeight-playerTop-18)/2):Math.min(42,(rowHeight-92)/3),font=Math.min(layout.player_size,Math.max(19,line*.8)),left=inset+28,right=1080-inset-27;
  for(let j=0;j<3;j++){
   const bat=r.batting[j],bowl=r.bowling[j];ctx.textAlign='left';
   if(bat)text(bat.name,left,y+playerTop+j*line,402-left,font,layout.player_colour);if(bowl)text(bowl.name,678,y+playerTop+j*line,right-749,font,layout.player_colour);
   ctx.textAlign='right';if(bat)text(`${bat.runs}${bat.not_out?'*':''}`,458,y+playerTop+j*line,70,font,layout.player_colour);if(bowl)text(`${bowl.wickets}/${bowl.runs}`,right,y+playerTop+j*line,100,font,layout.player_colour);ctx.textAlign='center';
  }
  if(!sharedOpponent){const size=Math.max(12,Math.min(template?layout.row_logo_size:72,rowHeight*.3));logoPair(images.opponents?.[item.key],r,552,template?y+rowHeight*layout.row_logo_y/100:y+38+size/2,size,30,layout.player_colour);}
  drawResultBadge(ctx,text,{outcome,label:resultLabel(outcome,layout),x:552,y:y+rowHeight*layout.badge_y/100,maxHeight:Math.min(100,rowHeight*.4),layout,example:images.example});
  if(layout.show_margin&&r.margin)text(r.margin,552,y+rowHeight*layout.margin_y/100,220,layout.margin_size,layout.margin_colour,'margin');
  else if(!sharedOpponent)text(r.opposition,552,y+rowHeight*.87,195,18,layout.player_colour);
 }
}

// The label is always computed from the imported outcome, never from a design request.
function drawResultBadge(ctx,text,{outcome,label,x,y,maxHeight,layout:d,example}){
 const crop=example&&d.badge_source===d.example_path&&matchingResultBadgeCrops(d).find(c=>c.label===label),colour=outcome==='WIN'?d.win_colour:outcome==='LOSS'?d.loss_colour:d.score_colour;
 if(crop){const iw=example.naturalWidth||example.width,ih=example.naturalHeight||example.height,sw=iw*crop.width,sh=ih*crop.height,fit=Math.min(d.badge_width/sw,maxHeight/sh);ctx.drawImage(example,iw*crop.x,ih*crop.y,sw,sh,x-sw*fit/2,y-sh*fit/2,sw*fit,sh*fit);return;}
 const badgeText=(value,tx,ty,width,size,colour)=>text(value,tx,ty,width,size,colour,'badge');
 const size=label.length>4?Math.min(26,d.badge_size):d.badge_size;
 if(d.badge_style==='glow'&&['WIN','LOSS'].includes(outcome)){ctx.save();ctx.shadowColor=colour;ctx.shadowBlur=Math.min(28,size*.45);ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;badgeText(label,x,y,d.badge_width,size,d.badge_text_colour);badgeText(label,x,y,d.badge_width,size,d.badge_text_colour);ctx.restore();return;}
 if(!['WIN','LOSS'].includes(outcome)||(d.badge_style==='plain'&&!d.badge_angle)){badgeText(label,x,y,d.badge_width,size,colour);return;}
 ctx.save();ctx.translate(x,y);const angle=d.badge_angle*Math.PI/180,w=d.badge_width,ht=Math.min(maxHeight,Math.max(54,size*1.45)),fit=Math.min(1,178/(Math.abs(Math.cos(angle))*w+Math.abs(Math.sin(angle))*ht));ctx.rotate(angle);ctx.scale(fit,fit);ctx.fillStyle=colour;ctx.strokeStyle=colour;ctx.lineWidth=4;
 if(d.badge_style==='plain'){badgeText(label,0,0,w,size,colour);ctx.restore();return;}
 if(d.badge_style==='circle'){ctx.beginPath();ctx.ellipse(0,0,w/2,ht/2,0,0,Math.PI*2);ctx.fill();}
 else if(d.badge_style==='outline'){ctx.strokeRect(-w/2+3,-ht/2+3,w-6,ht-6);}
 else{ctx.beginPath();const points=d.badge_style==='ribbon'?[[-.5,-.5],[.5,-.5],[.42,0],[.5,.5],[-.5,.5],[-.42,0]]:[[-.49,-.4],[-.13,-.5],[.46,-.44],[.43,-.22],[.5,-.1],[.46,.22],[.49,.4],[.1,.49],[-.5,.4],[-.46,.2],[-.5,.1],[-.46,-.12]];points.forEach(([a,b],i)=>i?ctx.lineTo(a*w,b*ht):ctx.moveTo(a*w,b*ht));ctx.closePath();ctx.fill();}
 badgeText(label,0,0,w-24,Math.min(size,ht*.72),d.badge_style==='outline'?colour:d.badge_text_colour);ctx.restore();
}
