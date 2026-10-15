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
export function resultsSummary(item){
 const ours=(item.innings||[]).filter(i=>i.team_id===item.our_team),theirs=(item.innings||[]).filter(i=>i.team_id!==item.our_team);
 const names=item.teams||[],ourName=names.find(t=>t.id===item.our_team)?.name||'Our club',opposition=names.filter(t=>t.id!==item.our_team).map(t=>t.name).join(' / ');
 const score=innings=>innings.map(i=>Number.isFinite(i.runs)&&Number.isFinite(i.wickets)?`${i.wickets}/${i.runs}${/declared/i.test(i.closure||'')?' dec':''}`:'Score unavailable').join(' & ')||'Score unavailable';
 const batting=ours.flatMap(i=>(i.batters||[]).filter(b=>b.importable&&b.status==='played'&&Number.isFinite(b.runs)).map(b=>({...b,innings:i.number}))).sort((a,b)=>b.runs-a.runs||a.name.localeCompare(b.name)).slice(0,3);
 const bowling=theirs.flatMap(i=>(i.bowlers||[]).filter(b=>b.team_id===item.our_team&&b.importable&&Number.isFinite(b.wickets)&&b.wickets>0).map(b=>({...b,innings:i.number}))).sort((a,b)=>b.wickets-a.wickets||a.runs-b.runs||a.name.localeCompare(b.name)).slice(0,3);
 const text=(item.result||'').trim(),lower=text.toLowerCase();let outcome='';
 if(/\btied?\b/.test(lower))outcome='TIE';else if(/\bdraw(n)?\b/.test(lower))outcome='DRAW';else if(/no result|abandon|wash.?out/.test(lower))outcome='NO RESULT';
 else if(lower.includes('won')){if(lower.startsWith(ourName.toLowerCase()+' won'))outcome='WIN';else if(names.some(t=>t.id!==item.our_team&&lower.startsWith(t.name.toLowerCase()+' won')))outcome='LOSS';}
 return {ourName,opposition,ourScore:score(ours),theirScore:score(theirs),batting,bowling,outcome,result:text||'Result not supplied'};
}
export async function drawAwardGraphic(h,s,canvas,{kind,items,layout,photo,week,images={},outcomes={}}){
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
 if(logo)image(logo,layout.logo_x,layout.logo_y,layout.logo_size,.11);
 const top=height*layout.rows_top/100,bottom=height*layout.rows_bottom/100,gap=28,rowHeight=(bottom-top-gap*(Math.max(items.length,1)-1))/Math.max(items.length,1);
 for(let n=0;n<items.length;n++){
  const item=items[n],r=resultsSummary(item),y=top+n*(rowHeight+gap),outcome=outcomes[item.key]||r.outcome;
  ctx.fillStyle='rgba(245,249,255,.84)';ctx.fillRect(34,y,1012,rowHeight);
  ctx.fillStyle=s.design?.primary||'#073554';ctx.fillRect(300,y-12,480,45);
  text(item.grade.toUpperCase(),540,y+10,455,35,'#FFFFFF');
  text(r.ourScore,225,y+56,360,35,'#073554');text(r.theirScore,855,y+56,360,35,'#073554');
  const font=Math.min(28,Math.max(19,(rowHeight-98)/3*.8)),line=Math.min(36,(rowHeight-92)/3);
  for(let j=0;j<3;j++){
   const bat=r.batting[j],bowl=r.bowling[j];ctx.textAlign='left';
   if(bat)text(bat.name,62,y+95+j*line,340,font,'#10253f');if(bowl)text(bowl.name,678,y+95+j*line,270,font,'#10253f');
   ctx.textAlign='right';if(bat)text(`${bat.runs}${bat.not_out?'*':''}`,458,y+95+j*line,70,font,'#10253f');if(bowl)text(`${bowl.wickets}/${bowl.runs}`,1019,y+95+j*line,100,font,'#10253f');ctx.textAlign='center';
  }
  const opponent=images.opponents?.[item.key];if(opponent){const size=Math.min(68,rowHeight*.27),fit=Math.min(size/(opponent.naturalWidth||opponent.width),size/(opponent.naturalHeight||opponent.height)),ow=(opponent.naturalWidth||opponent.width)*fit,oh=(opponent.naturalHeight||opponent.height)*fit;ctx.drawImage(opponent,552-ow/2,y+38,ow,oh);}
  text(outcome||'RESULT',552,y+rowHeight*.62,180,outcome==='NO RESULT'?26:38,outcome==='WIN'?'#087947':outcome==='LOSS'?'#a0313d':'#17395a');
  text('v '+r.opposition,552,y+rowHeight*.87,195,18,'#17395a');
 }
}
