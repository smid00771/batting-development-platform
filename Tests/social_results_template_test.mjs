import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {SOCIAL_FONT_DATA} from '../social-font-fallback.js';
import {AWARD_FONT_DATA} from '../social-award-font-data.js';
import {awardLayout,drawAwardGraphic,resultsMargin} from '../social-awards-model.js';
import {refinedAwardLayout,visualSettings} from '../social-awards-design.js';
GlobalFonts.register(Buffer.from(SOCIAL_FONT_DATA.split(',')[1],'base64'),'Club Sporting');
for(const f of Object.values(AWARD_FONT_DATA))assert.ok(GlobalFonts.register(Buffer.from(f.data,'base64'),f.family));
const makeItems=(shared=false)=>['Home won by 6 wickets','Visitors 1 won by 20 runs','Home won by 4 wickets','Visitors 3 won by 69 runs'].map((result,i)=>({
 key:'example-'+i,grade:['1st Grade','2nd Grade','Development Navy','Under 16 Cup'][i],our_team:'home',result:shared?result.replace(/Visitors \d/g,'Visitors'):result,
 teams:[{id:'home',name:'Home'},{id:'away',name:shared?'Visitors':'Visitors '+i,organisation_id:shared?'visitors':'visitors-'+i}],
 innings:[{team_id:'home',runs:166,wickets:4,batters:['Alex Example','Casey Sample','Jamie Player'].map((name,j)=>({name,runs:66-j*12,not_out:j===2,status:'played',importable:true}))},{team_id:'away',runs:165,wickets:10,bowlers:['Taylor Example','Jordan Sample','Morgan Player'].map((name,j)=>({name,team_id:'home',wickets:3-j,runs:24+j*9,importable:true}))}]
}));
const template={layout_mode:'template',result_labels:'won_lost',title_font:'condensed',title_case:'title',title_size:150,title_y:8,week_font:'sans',week_size:20,week_y:17,grade_font:'condensed',grade_size:40,grade_width:550,grade_case:'preserve',score_font:'condensed',score_size:38,score_colour:'#FFFFFF',player_font:'sans',player_size:31,player_colour:'#111111',badge_font:'script',badge_style:'glow',badge_size:70,badge_width:180,badge_y:62,win_colour:'#2DBF92',loss_colour:'#C56273',badge_text_colour:'#FFFFFF',margin_font:'condensed',margin_size:30,margin_y:88,margin_colour:'#111111',row_logo_size:38,row_logo_y:30,score_y:24,player_top:45,rows_top:25,rows_bottom:94,row_gap:55,row_opacity:72,panel_colour:'#D7E1E9',row_inset:48};
function logo(letter,colour){const c=createCanvas(100,100),x=c.getContext('2d');x.fillStyle=colour;x.beginPath();x.arc(50,50,47,0,Math.PI*2);x.fill();x.fillStyle='#fff';x.textAlign='center';x.font='600 48px "Club Sans"';x.fillText(letter,50,67);return c;}
async function render(items,layout){
 const canvas=createCanvas(1080,1350),text=[],home=logo('H','#105b91'),away=logo('V','#4d577b');
 const h={fontReady:async()=>{},text:(ctx,value,x,y,width,size,weight='700')=>{ctx.font=`${weight} ${size}px ${ctx.socialFont}`;while(ctx.measureText(String(value)).width>width&&size>18)ctx.font=`${weight} ${--size}px ${ctx.socialFont}`;const m=ctx.measureText(value);text.push({value,font:ctx.font,x,y,size,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});ctx.fillText(value,x,y,width);}};
 await drawAwardGraphic(h,{design:{primary:'#073554',accent:'#246eaf'},data:{brand:{name:'Example Club'}}},canvas,{kind:'results',items,layout,week:'WEEK 2',images:{logo:home,opponents:Object.fromEntries(items.map(i=>[i.key,away]))}});
 return {canvas,text};
}
test('recorded margins are separate from outcome lettering, never invented from scores or examples',()=>{
 const item=makeItems()[0];
 for(const [result,expected] of [['Home won by 20 runs','BY 20 RUNS'],['Home won by 1 wicket','BY 1 WICKET'],['Home won by an innings and 20 runs','BY AN INNINGS AND 20 RUNS'],['Home won by 4 runs (DLS)','BY 4 RUNS (DLS)'],['Home won',''],['Home won by 0 runs',''],['Home won by 11 wickets',''],['Home won by 20 runs or by 3 wickets',''],['Match drawn',''],['No result','']])assert.equal(resultsMargin({...item,result}),expected);
 assert.equal(resultsMargin({...item,provisional:true}),'');assert.equal(resultsMargin({...item,result:'Unknown won by 10 runs'}),'');
});
test('reference-like typography renders distinct roles, every margin and clear central spacing',async()=>{
 for(const shared of [false,true]){
  const items=makeItems(shared),facts=JSON.stringify(items),layout=awardLayout('results',template),{canvas,text}=await render(items,layout);
  assert.match(text.find(t=>t.value==='Results').font,/Club Display/);assert.match(text.find(t=>t.value==='Alex Example').font,/Club Sans/);
  const badges=text.filter(t=>['WON','LOST'].includes(t.value)),margins=text.filter(t=>t.value.startsWith('BY '));
  assert.equal(badges.length,8,'Two halo passes for each outcome');assert.equal(margins.length,4);assert.ok(badges.every(t=>t.font.includes('Club Brush')));assert.ok(margins.every(t=>t.font.includes('Club Display')));
  for(let i=0;i<4;i++){assert.ok(badges[i*2].bottom+4<margins[i].top,'Outcome and margin must not overlap');assert.ok(margins[i].left>=458&&margins[i].right<=678,'Margin stays in the central column');}
  for(const t of text)assert.ok(t.left>=0&&t.right<=1080&&t.top>=0&&t.bottom<=1350,t.value+' stays in canvas');
  assert.equal(JSON.stringify(items),facts);
  if(process.env.AWARDS_PREVIEW_DIR){fs.mkdirSync(process.env.AWARDS_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/template-'+(shared?'shared':'mixed')+'.png',canvas.toBuffer('image/png'));}
  const before=visualSettings(layout),next=refinedAwardLayout(layout,{changes:{result_labels:'win_loss'},badges:[]},'results');assert.deepEqual(visualSettings(next),{...before,result_labels:'win_loss'});
 }
});
