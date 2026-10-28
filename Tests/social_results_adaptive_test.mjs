import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {SOCIAL_FONT_DATA} from '../social-font-fallback.js';
import {AWARD_FONT_DATA} from '../social-award-font-data.js';
import {awardLayout,drawAwardGraphic} from '../social-awards-model.js';
GlobalFonts.register(Buffer.from(SOCIAL_FONT_DATA.split(',')[1],'base64'),'Club Sporting');
for(const f of Object.values(AWARD_FONT_DATA))GlobalFonts.register(Buffer.from(f.data,'base64'),f.family);
const fixture=(shared=false)=>Array.from({length:4},(_,i)=>({key:'m'+i,grade:'Development League '+(i+1),our_team:'home',result:'Home won by '+[9,102,25,9][i]+(i===1||i===2?' runs':' wickets'),teams:[{id:'home',name:'Home'},{id:'away',name:'Visitors '+i,organisation_id:shared?'same-club':'club-'+i}],innings:[{team_id:'home',runs:180,wickets:8,batters:['Christopher Montgomery','Alexandra Henderson','Samantha Chamberlain'].map((name,j)=>({name,status:'played',importable:true,runs:[147,98,21][j],not_out:true}))},{team_id:'away',runs:78,wickets:10,bowlers:['Jordan Constantine','Taylor Montgomery','Morgan Williamson'].map((name,j)=>({name,team_id:'home',importable:true,wickets:3-j,runs:24+j}))}]}));
async function render(items,saved={},height=1350){
 const canvas=createCanvas(1080,height),background=createCanvas(1080,height),text=[];
 const d=awardLayout('results',{font:'classic',row_opacity:72,rows_top:29,rows_bottom:96,row_gap:28,...saved});
 await drawAwardGraphic({fontReady:async()=>{},text:(ctx,value,x,y,width,size,weight='700')=>{ctx.font=`${weight} ${size}px ${ctx.socialFont}`;while(ctx.measureText(value).width>width&&size>18)ctx.font=`${weight} ${--size}px ${ctx.socialFont}`;const m=ctx.measureText(value);text.push({value,x,y,size,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});ctx.fillText(value,x,y,width);}},{design:{primary:'#073554',accent:'#1273a2'}},canvas,{kind:'results',items,layout:d,week:'Week 3',images:{background}});
 return {canvas,text,d,plan:canvas.resultsLayout};
}
test('existing Georgia layout reclaims unused header space automatically and keeps all figures out of margins',async()=>{
 const mixed=await render(fixture()),shared=await render(fixture(true));
 assert.ok(mixed.plan.top<shared.plan.top-100,'Unused shared-logo space is reclaimed');assert.equal(shared.plan.top,1350*.29);
 assert.equal(mixed.plan.header,null);assert.ok(shared.plan.header);
 for(const result of [mixed,shared])for(const margin of result.text.filter(t=>t.value.startsWith('BY '))){
  for(const item of result.text.filter(t=>/^\d/.test(t.value)&&Math.abs(t.y-margin.y)<100))assert.ok(item.right+10<margin.left||item.left>margin.right+10,`${margin.value} must stay clear of ${item.value}`);
 }
 const switched=await render(fixture());assert.equal(switched.plan.top,mixed.plan.top,'Switching back does not accumulate a layout offset');
 if(process.env.AWARDS_PREVIEW_DIR){fs.mkdirSync(process.env.AWARDS_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/reported-layout-fixed.png',mixed.canvas.toBuffer('image/png'));}
});
test('automatic geometry stays in bounds across typefaces, compact backgrounds, row gaps and outcome lengths',async()=>{
 for(const font of ['classic','sporting','modern'])for(const height of [1080,1350])for(const shared of [false,true]){
  const items=fixture(shared);items[1].result='Home won by 102 runs (DLS)';items[2].result='Home won by an innings and 25 runs';
  const r=await render(items,{font,row_gap:90,rows_top:32,margin_size:34,badge_font:'script',badge_style:'glow',badge_size:70},height);
  for(const t of r.text){assert.ok(t.top>=0&&t.bottom<=height,t.value+' fits vertically');if(t.value.startsWith('BY ')||t.value==='(DLS)'||t.value.startsWith('AND '))assert.ok(t.left>=440&&t.right<=640,t.value+' fits in its own column');}
  for(const band of ['WON','WIN','LOST','DEF'])for(const b of r.text.filter(t=>t.value===band))for(const margin of r.text.filter(t=>t.value.startsWith('BY ')&&Math.abs(t.y-b.y)<90))assert.ok(b.bottom+2<margin.top||margin.bottom+2<b.top,'Outcome and margin do not overlap');
 }
});
test('an intentional mixed-opponent start adjustment does not move shared-opponent layouts',async()=>{
 const saved={mixed_rows_top:24},mixed=await render(fixture(),saved),shared=await render(fixture(true),saved);
 assert.equal(mixed.plan.top,1350*.24);assert.equal(shared.plan.top,1350*.29);assert.equal(saved.mixed_rows_top,24);
});
