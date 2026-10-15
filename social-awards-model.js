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
  logo_x:50,logo_y:19,logo_size:11,opponent_logos:{},...saved};
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
export function resultsSummary(item){
 const ours=(item.innings||[]).filter(i=>i.team_id===item.our_team),theirs=(item.innings||[]).filter(i=>i.team_id!==item.our_team);
 const names=item.teams||[],ourName=names.find(t=>t.id===item.our_team)?.name||'Our club',opposition=names.filter(t=>t.id!==item.our_team).map(t=>t.name).join(' / ');
 const score=innings=>innings.map(i=>Number.isFinite(i.runs)&&Number.isFinite(i.wickets)?`${i.wickets}/${i.runs}${/declared/i.test(i.closure||'')?' dec':''}`:'Score unavailable').join(' & ')||'Score unavailable';
 const batting=ours.flatMap(i=>(i.batters||[]).filter(b=>b.importable&&b.status==='played'&&Number.isFinite(b.runs)).map(b=>({...b,innings:i.number}))).sort((a,b)=>b.runs-a.runs||a.name.localeCompare(b.name)).slice(0,3);
 const bowling=theirs.flatMap(i=>(i.bowlers||[]).filter(b=>b.team_id===item.our_team&&b.importable&&Number.isFinite(b.wickets)&&b.wickets>0).map(b=>({...b,innings:i.number}))).sort((a,b)=>b.wickets-a.wickets||a.runs-b.runs||a.name.localeCompare(b.name)).slice(0,3);
 const text=(item.result||'').trim(),outcome=resultsOutcome(item);
 return {ourName,opposition,ourScore:score(ours),theirScore:score(theirs),batting,bowling,outcome,result:text||'Result not supplied'};
}
export async function drawAwardGraphic(h,s,canvas,{kind,items,layout,photo,week,images={}}){
 const bg=images.background,portrait=images.photo,logo=layout.show_logo?images.logo:null;
 await h.fontReady();canvas.width=bg?(bg.naturalWidth||bg.width):1080;canvas.height=bg?(bg.naturalHeight||bg.height):1350;
 const ctx=canvas.getContext('2d');if(bg)ctx.drawImage(bg,0,0);else{const g=ctx.createLinearGradient(0,0,canvas.width,canvas.height);g.addColorStop(0,s.design?.primary||'#073554');g.addColorStop(1,s.design?.accent||'#128fd2');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);}
 const scale=canvas.width/1080,height=canvas.height/scale;ctx.scale(scale,scale);ctx.socialFont='"Club Sporting",Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 const text=(value,x,y,width,size,colour=layout.text_colour)=>{ctx.fillStyle=colour;h.text(ctx,String(value),x,y,width,size);};
 const image=(img,x,y,size,maxHeight=.7)=>{if(!img)return;const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,fit=Math.min(1080*size/100/iw,height*maxHeight/ih),w=iw*fit,ht=ih*fit;ctx.drawImage(img,(1080-w)*x/100,(height-ht)*y/100,w,ht);};
 if(kind!=='results'){
  const item=items[0];image(portrait,photo?.x??50,photo?.y??40,photo?.size??65);
  if(layout.text_panel){ctx.fillStyle='rgba(0,0,0,.35)';const top=Math.min(layout.name_y,layout.figures_y,layout.grade_y)*height/100-60;ctx.fillRect(0,top,1080,height-top);}
  image(logo,layout.logo_x,layout.logo_y,layout.logo_size,.25);
  if(!layout.includes_title)text(awardLabel(kind).toUpperCase(),540,height*layout.title_y/100,990,layout.title_size);
  text(week,540,height*layout.week_y/100,980,28);
  text((item?.name||'CHOOSE A PERFORMANCE').toUpperCase(),540,height*layout.name_y/100,980,layout.name_size);
  text(item?awardFigures(item)+(kind==='century'?' RUNS':''):'',540,height*layout.figures_y/100,980,layout.figures_size);
  text([item?.grade,item?.opposition&&'v '+item.opposition].filter(Boolean).join(' · '),540,height*layout.grade_y/100,980,30);return;
 }
 if(!layout.includes_title)text('RESULTS',540,height*layout.title_y/100,990,layout.title_size);
 text(week,540,height*layout.week_y/100,970,28);
 const sharedOpponent=resultsShareOpponent(items,images.opponentKeys);
 const logoPair=(opponent,summary,x,y,size,gap,colour)=>{
  const badge=(img,name,cx)=>{if(!img){text(name,cx,y,size,Math.min(26,size*.3),colour);return;}const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,fit=Math.min(size/iw,size/ih);ctx.drawImage(img,cx-iw*fit/2,y-ih*fit/2,iw*fit,ih*fit);};
  badge(logo,summary.ourName,x-(size+gap)/2);text('VS',x,y,gap-8,Math.min(60,size*.5),colour);badge(opponent,summary.opposition,x+(size+gap)/2);
 };
 if(sharedOpponent){
  const size=Math.min(1080*layout.logo_size/100,height*.11),gap=Math.max(50,size*.6),width=size*2+gap;
  logoPair(items.map(item=>images.opponents?.[item.key]).find(Boolean),resultsSummary(items[0]),(1080-width)*layout.logo_x/100+width/2,(height-size)*layout.logo_y/100+size/2,size,gap,layout.text_colour);
 }
 const top=height*layout.rows_top/100,bottom=height*layout.rows_bottom/100,gap=28,rowHeight=(bottom-top-gap*(Math.max(items.length,1)-1))/Math.max(items.length,1);
 for(let n=0;n<items.length;n++){
  const item=items[n],r=resultsSummary(item),y=top+n*(rowHeight+gap),outcome=r.outcome;
  ctx.fillStyle='#f5f9ff';ctx.fillRect(34,y,1012,rowHeight);
  ctx.fillStyle=s.design?.primary||'#073554';ctx.fillRect(300,y-12,480,45);
  text(item.grade.toUpperCase(),540,y+10,455,35,'#FFFFFF');
  text(r.ourScore,225,y+56,360,35,'#073554');text(r.theirScore,855,y+56,360,35,'#073554');
  const font=Math.min(28,Math.max(19,(rowHeight-98)/3*.8)),line=Math.min(36,(rowHeight-92)/3);
  for(let j=0;j<3;j++){
   const bat=r.batting[j],bowl=r.bowling[j];ctx.textAlign='left';
   if(bat)text(bat.name,62,y+95+j*line,340,font,'#10253f');if(bowl)text(bowl.name,678,y+95+j*line,270,font,'#10253f');
   ctx.textAlign='right';if(bat)text(`${bat.runs}${bat.not_out?'*':''}`,458,y+95+j*line,70,font,'#10253f');if(bowl)text(`${bowl.wickets}/${bowl.runs}`,1019,y+95+j*line,100,font,'#10253f');ctx.textAlign='center';
  }
  if(!sharedOpponent){const size=Math.max(12,Math.min(72,rowHeight*.3));logoPair(images.opponents?.[item.key],r,552,y+38+size/2,size,30,'#17395a');}
  const outcomeLabel=outcome==='LOSS'?'DEF':outcome||'CHECK RESULT';
  text(outcomeLabel,552,y+rowHeight*.62,180,outcomeLabel.length>4?26:38,outcome==='WIN'?'#087947':outcome==='LOSS'?'#a0313d':'#17395a');
  if(!sharedOpponent)text(r.opposition,552,y+rowHeight*.87,195,18,'#17395a');
 }
}
