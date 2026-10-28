// Shared geometry for preview and export. No model call or saved-style mutation.
const clamp=(v,min,max)=>Math.max(min,Math.min(v,max));
export function resultsLayoutPlan(d,height,count,shared,headerBottom){
 count=Math.max(1,count);
 if(!shared){
  // Each opponent pair belongs above its own panel, as in a multi-club example.
  // Reduce whitespace before reducing logos; a fourth match scales the pair
  // proportionally instead of squeezing it between the outcome and margin.
  const bottom=height*d.rows_bottom/100,start=headerBottom+16,rowScale=Math.min(1.25,3/count),minRow=180*rowScale;
  const desiredSize=Math.max(144,d.row_logo_size)*rowScale,minSize=48,clearance=24;
  const available=bottom-start;
  const gap=count===1?0:clamp(d.row_gap,12,Math.max(12,(available-count*(minRow+desiredSize+clearance))/(count-1)));
  let logoBand=Math.min(desiredSize+clearance,(available-gap*(count-1))/count-minRow);
  const requested=Number.isFinite(d.mixed_rows_top)?height*d.mixed_rows_top/100:null;
  if(requested!==null&&count>1)logoBand=Math.min(logoBand,Math.max(minSize+clearance,(bottom-requested-count*minRow)/(count-1)-gap));
  logoBand=Math.max(minSize+clearance,logoBand);
  const maxTop=bottom-count*minRow-(count-1)*(gap+logoBand);
  const top=clamp(requested??start+logoBand,start+logoBand,Math.max(start+logoBand,maxTop));
  const rowHeight=(bottom-top-(count-1)*(gap+logoBand))/count;
  if(rowHeight<120)throw Error('This background is too short for these results. Use a taller background or fewer grades.');
  const size=logoBand-clearance;
  return {top,bottom,gap,rowHeight,rowScale,logoBand,header:null,mixedLogos:{size,gap:Math.max(50,size*.6),offset:-clearance-size/2},columns:resultColumns(d)};
 }
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
 return {top,bottom,gap,rowHeight,header,rowScale:1,logoBand:0,columns:resultColumns(d)};
}
const resultColumns=d=>({left:d.row_inset+28,leftFigures:clamp(d.left_column_end*10.8,324,434),centre:540,centreWidth:180,rightNames:clamp(d.right_column_start*10.8,650,756),right:1080-d.row_inset-28});
export function resultsRowPlan(d,rowHeight,shared,marginHeight,badgeHeight,scale=1){
 const gradeBottom=34*scale,pad=6*scale,bottom=rowHeight-12*scale;
 const marginTop=marginHeight?Math.min(Math.max(gradeBottom+48*scale,rowHeight*d.margin_y/100-marginHeight/2),bottom-marginHeight):bottom;
 const room=marginTop-gradeBottom-pad*2;
 const height=Math.min(badgeHeight,Math.max(20,room));
 const contentTop=gradeBottom+pad;
 const badgeY=clamp(rowHeight*d.badge_y/100,contentTop+height/2,marginTop-pad-height/2);
 const scoreY=Math.max((shared?gradeBottom:0)+d.score_size*.6+8*scale,Math.min(rowHeight*(d.layout_mode==='template'?d.score_y:25)/100,72));
 const playerTop=Math.max(scoreY+d.score_size*.6+18*scale,Math.min(rowHeight*d.player_top/100,rowHeight-76*scale));
 const line=Math.min(42*scale,Math.max(20*scale,(rowHeight-playerTop-20*scale)/2));
 return {badgeY,badgeHeight:height,marginTop,scoreY,playerTop,line};
}
