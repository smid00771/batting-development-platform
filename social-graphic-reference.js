import {GRAPHIC_FIELDS,graphicPatch} from './social-graphic-design.js?v=0.8.62.362';
import {AWARD_FONTS,AWARD_FONT_WEIGHTS,awardFont} from './social-award-fonts.js?v=0.8.62.354';

import {graphicReference} from './social-graphic-reference-contract.js?v=0.8.62.354';

export function graphicReferencePatch(ctx,kind,layout,measurements,dimensions){
 const ref=graphicReference(measurements),fields=GRAPHIC_FIELDS[kind],patch={};if(!fields||!dimensions?.width||!dimensions?.height)return patch;
 const height=1080*dimensions.height/dimensions.width,put=(k,v)=>{const rule=fields[k];if(rule)patch[k]=Math.round(Math.max(rule[0],Math.min(rule[1],v)));};
 ctx.save();ctx.textBaseline='alphabetic';
 for(const [role,sizeKey,posKey,sample] of [['title','title_size','title_y',kind==='team_week'?'TEAM OF THE WEEK':'PLAYER OF THE WEEK'],['week','week_size','week_y','WEEK 5'],['player','name_size','name_y','ALEX PLAYER'],['score','figures_size','figures_y','119*'],['grade','grade_size','grade_y','W 2ND']]){
  const font=awardFont(layout,role);ctx.font=`${AWARD_FONT_WEIGHTS[font]||'700'} 100px ${AWARD_FONTS[font]}`;const m=ctx.measureText(sample),ink=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent;
  if(ref[role+'_height']>0&&ink>0){let size=ref[role+'_height']*height*100/ink;if(role==='title'&&ref.title_width>0)size=Math.min(size,ref.title_width*1080*100/m.width);put(sizeKey,size);}
  if(ref[role+'_top']!=null&&ref[role+'_height']!=null){ctx.textBaseline='middle';const middle=ctx.measureText(sample),size=patch[sizeKey]||layout[sizeKey]||30;put(posKey,(ref[role+'_top']*height+middle.actualBoundingBoxAscent*size/100)/height*(kind==='team_week'?1350:100));ctx.textBaseline='alphabetic';}
 }
 ctx.restore();
 if(kind==='team_week'){
  if(ref.first_row!=null)put('top',ref.first_row*1350);
  if(ref.row_step!=null)put('bottom',(ref.first_row??layout.top/1350)*1350+ref.row_step*1350*10);
  for(const [a,b] of [['names_left','left'],['figures_right','figures_right'],['grades_right','grade_right']])if(ref[a]!=null)put(b,ref[a]*1080);
  if((patch.bottom??layout.bottom)-(patch.top??layout.top)<100){delete patch.top;delete patch.bottom;}
  if((patch.figures_right??layout.figures_right)-(patch.left??layout.left)<400||(patch.grade_right??layout.grade_right)-(patch.figures_right??layout.figures_right)<80){delete patch.left;delete patch.figures_right;delete patch.grade_right;}
 }
 return graphicPatch(kind,patch);
}
