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
 assert.ok(mixed.plan.top-mixed.plan.logoBand<shared.plan.top-100,'Mixed logos start below the title without a redundant shared header');assert.equal(shared.plan.top,1350*.29);
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
  for(const band of ['WON','WIN','LOST','DEF'])for(const b of r.text.filter(t=>t.value===band))for(const margin of r.text.filter(t=>t.value.startsWith('BY ')&&Math.abs(t.y-b.y)<90))assert.ok(b.bottom+2<margin.top||margin.bottom+2<b.top,JSON.stringify({font,height,shared,b,margin,plan:r.plan}));
 }
});
test('an intentional mixed-opponent start adjustment does not move shared-opponent layouts',async()=>{
 const saved={mixed_rows_top:24},mixed=await render(fixture(),saved),shared=await render(fixture(true),saved);
 assert.equal(mixed.plan.top,1350*.24);assert.equal(shared.plan.top,1350*.29);assert.equal(saved.mixed_rows_top,24);
});
test('compact shared results honour a high score position and keep the requested body size',async()=>{
 const saved={layout_mode:'template',title_font:'condensed',title_size:158,title_y:6.8,rows_top:25.8,rows_bottom:89.3,row_gap:65,row_inset:49,grade_font:'condensed',grade_size:48,grade_width:390,score_size:48,score_y:14,player_top:40,player_size:24,player_font:'sporting',score_font:'sporting',logo_size:9,logo_y:16,margin_size:43,margin_font:'condensed'};
 const r=await render(fixture(true),saved,1364),scores=r.text.filter(t=>t.value==='8/180');
 assert.equal(scores.length,4);
 assert.ok(scores.every((s,i)=>s.y-(r.plan.top+i*(r.plan.rowHeight+r.plan.gap))<45),'Side totals sit near the panel top');
 const names=r.text.filter(t=>t.value==='Alexandra Henderson');assert.ok(names.every(n=>n.size>=22),'Three player lines retain readable type');
 assert.ok(r.plan.header.y+r.plan.header.size/2<r.plan.top-40,'Header logos clear the first grade ribbon');
 for(let i=0;i<4;i++){const y=r.plan.top+i*(r.plan.rowHeight+r.plan.gap),lines=r.text.filter(t=>t.value==='Samantha Chamberlain'&&t.y>y&&t.y<y+r.plan.rowHeight);assert.equal(lines.length,1);assert.ok(lines[0].bottom<y+r.plan.rowHeight,'Last player stays within its panel');}
});
test('centred reference lists stay compact and not-out markers do not shift the figure column',async()=>{
 const saved={layout_mode:'template',title_font:'condensed',title_size:158,title_y:6.8,rows_top:25.8,rows_bottom:89.3,row_gap:65,row_inset:49,grade_font:'condensed',grade_size:48,grade_width:390,score_size:36,score_y:19,player_top:44,player_size:28,player_font:'sans',player_align:'center',score_font:'condensed',left_column_end:32.9,right_column_start:65.8,logo_size:9,logo_y:16,margin_size:43,margin_font:'condensed'};
 const items=fixture(true);items.forEach((item,i)=>{item.innings[0].batters.forEach((b,j)=>{b.name=['Alex Example','Casey Sample','Jamie Player'][j];b.runs=[i===0?112:58,52,9][j];b.not_out=j===0;});item.innings[1].bowlers.forEach((b,j)=>b.name=['Jordan Example','Taylor Sample','Morgan Player'][j]);});
 const before=JSON.stringify(items),r=await render(items,saved,1350);
 const names=r.text.filter(t=>['Alex Example','Casey Sample','Jamie Player'].includes(t.value));
 assert.ok(names.every(n=>Math.abs(n.x-names[0].x)<.01),'Names share one centre across rows and grades');
 const ourScores=r.text.filter(t=>t.value==='8/180'),theirScores=r.text.filter(t=>t.value==='10/78'),bowlNames=r.text.filter(t=>['Jordan Example','Taylor Sample','Morgan Player'].includes(t.value));
 const leftCentre=(saved.row_inset+440)/2,rightCentre=(640+1080-saved.row_inset)/2;
 assert.ok([...ourScores,...names].every(t=>Math.abs(t.x-leftCentre)<.01),'Left scores and names share the pale side centre');
 assert.ok([...theirScores,...bowlNames].every(t=>Math.abs(t.x-rightCentre)<.01),'Right scores and names share the pale side centre');
 assert.equal(ourScores.length,4);assert.equal(theirScores.length,4);assert.equal(bowlNames.length,12);
 assert.ok(names.every(n=>n.size===28),'Reference body type keeps its intended size');
 const digits=r.text.filter(t=>['112','58','52','9'].includes(t.value)),stars=r.text.filter(t=>t.value==='*');
 assert.equal(digits.length,12);assert.equal(stars.length,4);
 assert.ok(digits.every(n=>Math.abs(n.x-digits[0].x)<.01&&Math.abs(n.left-n.x)<2),'Every score starts at the same left anchor, including 112 and 58*');
 const bowls=r.text.filter(t=>/^[1-3]\/2[4-6]$/.test(t.value));assert.equal(bowls.length,12);assert.ok(bowls.every(n=>Math.abs(n.x-bowls[0].x)<.01&&Math.abs(n.left-n.x)<2),'Bowling figures also start at one left anchor');
 assert.equal(r.plan.gap,65,'Reference panel gaps are no longer squeezed by an oversized minimum panel');
 for(const star of stars){const number=digits.find(n=>n.y===star.y);assert.ok(star.left>=number.right-1,'The star hangs after the digits');assert.ok(star.right<r.plan.columns.centre-100,'The star cannot enter the result column');}
 for(let i=0;i<4;i++){
  const first=names[i*3],second=names[i*3+1],third=names[i*3+2];
  assert.ok(second.y-first.y<=35&&third.y-second.y<=35,'Player lines use compact reference leading');
  assert.ok(first.bottom<second.top&&second.bottom<third.top,'Larger type does not overlap');
  for(const name of [first,second,third])assert.ok(name.right+10<digits.find(n=>n.y===name.y).left,'Names and figures remain distinct');
 }
 assert.equal(JSON.stringify(items),before,'Layout cannot alter imported match facts');
});

test('short and long player names share one readable size with figures across all grades',async()=>{
 const saved={layout_mode:'template',font:'sporting',title_font:'condensed',title_size:158,title_y:6.8,rows_top:25.8,rows_bottom:89.3,row_gap:65,row_inset:49,grade_font:'condensed',grade_size:48,grade_width:390,score_size:36,score_y:19,player_top:44,player_size:28,player_font:'sans',player_align:'center',score_font:'condensed',left_column_end:32.9,right_column_start:65.8,logo_size:14,logo_y:14.5,margin_size:43,margin_font:'condensed'};
 const bowlingNames=[['Callan Fowler','Jonah Rhineberger','Izaac Coyle'],['Anthonie Clement','Anik Arya','Izaan Mohammed'],['Mitch King','Brendon Young','Callum van Huisstede'],["Bradley O'Dell",'John Sinclair','Stephan du Plooy']];
 for(const shared of [true,false]){
  const items=fixture(shared);items.forEach((item,i)=>{item.grade=(i+1)+'st Grade';item.innings[0].batters.forEach((b,j)=>{b.name=['Alex Example','Casey Sample','Jamie Player'][j];b.runs=[i===0?112:58,52,9][j];b.not_out=j===0;});item.innings[1].bowlers.forEach((b,j)=>b.name=bowlingNames[i][j]);});
  const before=JSON.stringify(items),r=await render(items,saved),names=new Set(items.flatMap(item=>[...item.innings[0].batters,...item.innings[1].bowlers].map(p=>p.name)));
  const body=r.text.filter(t=>names.has(t.value)||['112','58','52','9','*'].includes(t.value)||/^[1-3]\/2[4-6]$/.test(t.value));
  assert.equal(body.length,52,'Every complete name, figure and not-out is retained');
  assert.equal(new Set(body.map(t=>t.size)).size,1,'All names and figures use one type size, regardless of name length or grade');
  assert.ok(body[0].size>=(shared?22:20),'Common type remains readable: '+body[0].size);
  for(const n of body.filter(t=>names.has(t.value))){
   const figure=body.find(t=>t.y===n.y&&/^\d/.test(t.value)&&t.x>n.x);
   assert.ok(figure&&n.right+8<figure.left,'A complete name stays clear of its figure: '+n.value);
  }
  const bat=body.filter(t=>['112','58','52','9'].includes(t.value)),bowl=body.filter(t=>/^[1-3]\/2[4-6]$/.test(t.value));
  assert.equal(new Set(bat.map(t=>t.x)).size,1);assert.equal(new Set(bowl.map(t=>t.x)).size,1);
  for(const [total,sideNames,centre] of [['8/180',['Alex Example','Casey Sample','Jamie Player'],(saved.row_inset+440)/2],['10/78',bowlingNames.flat(),(640+1080-saved.row_inset)/2]]){const aligned=r.text.filter(t=>t.value===total||sideNames.includes(t.value));assert.equal(aligned.length,16);assert.ok(aligned.every(t=>Math.abs(t.x-centre)<.01),'Totals and names stay centred for shared and mixed opponents');}
  assert.ok(bat.every(t=>t.right<440)&&bowl.every(t=>t.right<1080-saved.row_inset),'Figures remain inside their own pale side');
  assert.equal(JSON.stringify(items),before,'Sizing does not change any source facts');
  if(process.env.AWARDS_PREVIEW_DIR){fs.mkdirSync(process.env.AWARDS_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/results-uniform-type-'+(shared?'shared':'mixed')+'.png',r.canvas.toBuffer('image/png'));}
 }
});
