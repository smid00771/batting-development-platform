export const AWARD_FONTS={sporting:'"Club Sporting",Arial,sans-serif',modern:'Arial,sans-serif',classic:'Georgia,serif',condensed:'"Club Display",sans-serif',sans:'"Club Sans",sans-serif',script:'"Club Brush",cursive'};
export const AWARD_FONT_WEIGHTS={condensed:'400',sans:'600',script:'400'};
const loading=new Map();
export function awardFont(layout,role){const key=layout[role+'_font'];return key&&key!=='inherit'?key:layout.font||'sporting';}
export async function awardFontsReady(layout){
 if(typeof FontFace==='undefined'||typeof document==='undefined'||!document.fonts)return;
 const names=[...new Set(['title','week','grade','score','player','badge','margin'].map(role=>awardFont(layout,role)))].filter(k=>Object.hasOwn(AWARD_FONT_WEIGHTS,k));
 await Promise.all(names.map(async key=>{
  if(!loading.has(key))loading.set(key,(async()=>{
   const {AWARD_FONT_DATA}=await import('./social-award-font-data.js?v=0.8.62.290'),f=AWARD_FONT_DATA[key];
   const face=new FontFace(f.family,Uint8Array.from(atob(f.data),c=>c.charCodeAt(0)),{weight:f.weight});
   const loaded=await face.load();document.fonts.add(loaded);
  })().catch(error=>{loading.delete(key);throw error;}));
  try{await loading.get(key);}catch{throw Error('The graphic font could not load. Refresh the preview to retry.');}
 }));
}
export async function awardFontSpecimen(){
 await awardFontsReady({title_font:'condensed',player_font:'sans',badge_font:'script'});
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=660;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1080,660);ctx.fillStyle='#10253f';
 const keys=['sporting','condensed','sans','script','modern','classic'];
 keys.forEach((key,i)=>{const x=24+(i%2)*540,y=28+Math.floor(i/2)*220,weight=AWARD_FONT_WEIGHTS[key]||'700';ctx.font='18px Arial';ctx.fillText(key.toUpperCase(),x,y);ctx.font=`${weight} 58px ${AWARD_FONTS[key]}`;ctx.fillText('Results',x,y+66);ctx.font=`${weight} 30px ${AWARD_FONTS[key]}`;ctx.fillText('Alex Player  66*   Jordan  3/24',x,y+112);ctx.font=`${weight} 32px ${AWARD_FONTS[key]}`;ctx.fillText('WON · LOST · BY 20 RUNS',x,y+160);});
 return canvas;
}
