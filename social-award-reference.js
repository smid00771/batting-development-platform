import {AWARD_STYLE_FIELDS,referenceGeometry,visualPatch} from './social-awards-design.js?v=0.8.62.292';
import {AWARD_FONTS,AWARD_FONT_WEIGHTS,awardFont} from './social-award-fonts.js?v=0.8.62.292';

// Convert observed ink proportions, not guessed point sizes, to our 1080px design.
// The caller has loaded the selected fonts. This runs once per requested match.
export function referenceStylePatch(ctx,layout,measurements,dimensions,kind){
 const ref=referenceGeometry(measurements),patch={};
 if(!dimensions||!Number.isFinite(dimensions.width)||!Number.isFinite(dimensions.height)||dimensions.width<=0||dimensions.height<=0)return patch;
 const height=1080*dimensions.height/dimensions.width;
 const put=(key,value)=>{const rule=AWARD_STYLE_FIELDS[key];patch[key]=typeof rule?.[0]==='number'?Math.max(rule[0],Math.min(rule[1],value)):value;};
 const label=kind==='results'?'Results':kind==='century'?'Century':'Five Wickets',title=layout.title_case==='title'?label:label.toUpperCase();
 ctx.save();
 for(const [role,sample,sizeKey] of [['title',title,'title_size'],['grade','1st GRADE','grade_size'],['score','4/265','score_size'],['player','Alex Player','player_size'],['margin','BY 20 RUNS','margin_size']]){
  if(ref[role+'_height']==null)continue;
  const font=awardFont(layout,role);ctx.font=`${AWARD_FONT_WEIGHTS[font]||'700'} 100px ${AWARD_FONTS[font]}`;ctx.textBaseline='alphabetic';
  const m=ctx.measureText(sample),ink=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent;
  if(!Number.isFinite(ink)||ink<=0)continue;
  let size=ref[role+'_height']*height*100/ink;
  if(role==='title'&&ref.title_width!=null)size=Math.min(size,ref.title_width*1080*100/m.width);
  put(sizeKey,Math.round(size));
 }
 ctx.restore();
 if(ref.title_top!=null&&ref.title_height!=null)put('title_y',(ref.title_top+ref.title_height/2)*100);
 if(kind==='results'){
  for(const key of ['rows_top','rows_bottom','left_column_end','right_column_start'])if(ref[key]!=null)put(key,ref[key]*100);
  if(ref.row_inset!=null)put('row_inset',Math.round(ref.row_inset*1080));
  if(ref.row_gap!=null)put('row_gap',Math.round(ref.row_gap*height));
  if(ref.badge_width!=null)put('badge_width',Math.round(ref.badge_width*1080));
  if(ref.player_align)put('player_align',ref.player_align);
  // A crop can omit panels or contain too few rows. Keep the safe prior bounds.
  if((patch.rows_bottom??layout.rows_bottom)-(patch.rows_top??layout.rows_top)<40){delete patch.rows_top;delete patch.rows_bottom;}
 }
 return visualPatch(patch);
}
