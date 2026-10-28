// Shared geometry for preview and export. No model call or saved-style mutation.
const clamp=(v,min,max)=>Math.max(min,Math.min(v,max));
export function resultsLayoutPlan(d,height,count,shared,headerBottom){
 count=Math.max(1,count);
 const bottom=height*d.rows_bottom/100,minRow=180,headerEnd=headerBottom+(shared?60:36);
 const maxTop=bottom-count*minRow-12*(count-1);
 const requested=shared?height*d.rows_top/100:Number.isFinite(d.mixed_rows_top)?height*d.mixed_rows_top/100:headerEnd;
 const top=clamp(requested,headerEnd,Math.max(headerEnd,maxTop));
 const gap=count===1?0:clamp(d.row_gap,12,Math.max(12,(bottom-top-count*minRow)/(count-1)));
 const rowHeight=(bottom-top-gap*(count-1))/count;
 if(rowHeight<174)throw Error('This background is too short for these results. Use a taller background or fewer grades.');
 let header=null;
 if(shared){
  const room=top-20-(headerBottom+8),size=Math.min(1080*d.logo_size/100,height*.11,Math.max(24,room)),gap=Math.max(50,size*.6),width=size*2+gap;
  const y=clamp((height-size)*d.logo_y/100+size/2,headerBottom+8+size/2,top-20-size/2);
  header={size,gap,x:(1080-width)*d.logo_x/100+width/2,y};
 }
 return {top,bottom,gap,rowHeight,header,columns:{left:d.row_inset+28,leftFigures:434,centre:540,centreWidth:180,rightNames:650,right:1080-d.row_inset-28}};
}
export function resultsRowPlan(d,rowHeight,shared,marginHeight,badgeHeight){
 const gradeBottom=34,pad=6,bottom=rowHeight-12;
 const marginTop=marginHeight?Math.min(Math.max(gradeBottom+48,rowHeight*d.margin_y/100-marginHeight/2),bottom-marginHeight):bottom;
 const room=marginTop-gradeBottom-pad*(shared?2:3);
 const logoSize=shared?0:Math.min(d.layout_mode==='template'?d.row_logo_size:44,rowHeight*.20,Math.max(18,room-Math.min(badgeHeight,room*.65)));
 const height=Math.min(badgeHeight,Math.max(20,room-logoSize));
 const logoY=shared?0:clamp(rowHeight*(d.layout_mode==='template'?d.row_logo_y:30)/100,gradeBottom+pad+logoSize/2,marginTop-height-pad*2-logoSize/2);
 const contentTop=shared?gradeBottom+pad:logoY+logoSize/2+pad;
 const badgeY=clamp(rowHeight*d.badge_y/100,contentTop+height/2,marginTop-pad-height/2);
 const scoreY=Math.max(gradeBottom+d.score_size*.6+8,Math.min(rowHeight*(d.layout_mode==='template'?d.score_y:25)/100,72));
 const playerTop=Math.max(scoreY+d.score_size*.6+18,Math.min(rowHeight*d.player_top/100,rowHeight-76));
 const line=Math.min(42,Math.max(24,(rowHeight-playerTop-20)/2));
 return {logoSize,logoY,badgeY,badgeHeight:height,marginTop,scoreY,playerTop,line};
}
