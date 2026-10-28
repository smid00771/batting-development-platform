import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {AWARD_FONT_DATA} from '../social-award-font-data.js';
import {SOCIAL_FONT_DATA} from '../social-font-fallback.js';
import {referenceBadge,referenceBadgePair} from '../social-award-lettering.js';
import {awardLayout,drawAwardGraphic} from '../social-awards-model.js';
import {refinedAwardLayout,matchingResultBadgeCrops} from '../social-awards-design.js';
test('reference lettering removes the panel rectangle, preserves foreground and caches the extraction',()=>{
 const image=createCanvas(200,100),ctx=image.getContext('2d');ctx.fillStyle='#aabacc';ctx.fillRect(0,0,200,100);ctx.fillStyle='#fff';ctx.fillRect(70,30,60,40);
 const crop={label:'WON',x:0,y:0,width:1,height:1},badge=referenceBadge(image,crop,()=>createCanvas(1,1)),pixels=badge.getContext('2d');
 assert.equal(badge.width,64);assert.equal(badge.height,44);assert.equal(pixels.getImageData(0,0,1,1).data[3],0);assert.deepEqual([...pixels.getImageData(30,20,1,1).data],[255,255,255,255]);assert.equal(referenceBadge(image,crop,()=>{throw Error('Cached');}),badge);
});
test('a complete reference pair survives independent font matching; later wording/font edits clear both',()=>{
 const example_path='club/artwork/example.png',base=awardLayout('results',{example_path,font:'classic'}),badges=['WON','LOST'].map((label,i)=>({label,x:.4,y:.3+i*.4,width:.2,height:.06}));
 const next=refinedAwardLayout(base,{changes:{font:'modern',title_font:'condensed',player_font:'sans',badge_font:'script',result_labels:'won_lost'},badges,example_path,reference_lettering:true},'results');
 assert.deepEqual(matchingResultBadgeCrops(next),badges);assert.equal(next.badge_cutout,true);
 for(const changes of [{result_labels:'win_loss'},{badge_font:'sans'},{font:'classic'}]){const changed=refinedAwardLayout(next,{changes,badges:[]},'results');assert.deepEqual(matchingResultBadgeCrops(changed),[]);assert.equal(changed.badge_cutout,undefined);}
 const partial=refinedAwardLayout(base,{changes:{result_labels:'won_lost'},badges:[badges[0]],example_path,reference_lettering:true},'results');assert.deepEqual(matchingResultBadgeCrops(partial),[]);assert.equal(partial.badge_cutout,undefined);
});


GlobalFonts.register(Buffer.from(SOCIAL_FONT_DATA.split(',')[1],'base64'),'Club Sporting');
for(const f of Object.values(AWARD_FONT_DATA))GlobalFonts.register(Buffer.from(f.data,'base64'),f.family);
const makeCanvas=()=>createCanvas(1,1);
function contaminatedExample({dark=false,blankLoss=false}={}){
 const image=createCanvas(800,800),ctx=image.getContext('2d'),crops=[];
 ctx.fillStyle='#bdcbd5';ctx.fillRect(0,0,800,800);
 for(const [i,label] of ['WON','LOST'].entries()){
  const x=210,y=180+i*300,w=330,h=120;crops.push({label,x:x/800,y:y/800,width:w/800,height:h/800});
  if(blankLoss&&i)continue;
  ctx.fillStyle='#303665';ctx.fillRect(x,y,w,7);
  ctx.save();ctx.fillStyle=dark?'#111111':'#ffffff';ctx.shadowColor=i?'#d9798c':'#46c48d';ctx.shadowBlur=dark?0:12;ctx.font='64px "Club Brush"';ctx.textAlign='center';ctx.fillText(label,x+w/2,y+75);ctx.restore();
  // Simulate the clipped top of the old BY ... margin, not new match data.
  ctx.fillStyle='#080808';for(let j=0;j<17;j++)ctx.fillRect(x+35+j*15,y+109,8,11);
 }
 return {image,crops};
}
function ink(badge,predicate){const {data}=badge.getContext('2d').getImageData(0,0,badge.width,badge.height);let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>=48&&predicate(...data.slice(i,i+4)))count++;return count;}
test('copied lettering excludes partial old margins and full-width grade-bar edges, preserving its glow',()=>{
 const {image,crops}=contaminatedExample(),pair=referenceBadgePair(image,crops,makeCanvas);
 assert.ok(pair);
 for(const word of ['WON','LOST']){
  const badge=pair[word];assert.ok(badge.width>110&&badge.height>40,'The complete word remains');
  assert.equal(ink(badge,(r,g,b)=>Math.max(r,g,b)<80),0,'Old black margin fragments are gone');
  assert.equal(ink(badge,(r,g,b)=>b>r+35&&b>g+25&&b>80),0,'No blue heading rule survives');
  assert.ok(ink(badge,(r,g,b)=>Math.min(r,g,b)>220)>100,'White script is retained');
  assert.ok(ink(badge,(r,g,b)=>word==='WON'?g>r+20:g<r-20)>100,'Coloured halo remains');
 }
});
test('isolation is not tied to white lettering or one club palette',()=>{
 const {image,crops}=contaminatedExample({dark:true}),pair=referenceBadgePair(image,crops,makeCanvas);assert.ok(pair);
 for(const badge of Object.values(pair)){assert.ok(badge.height<90);assert.ok(ink(badge,(r,g,b)=>Math.max(r,g,b)<60)>100,'Dark lettering remains');assert.equal(ink(badge,(r,g,b)=>b>r+35&&b>g+25&&b>80),0);}
});
test('ambiguous full text lines or a missing outcome reject the complete crop pair, with cached failures',()=>{
 const image=createCanvas(200,120),ctx=image.getContext('2d');ctx.fillStyle='#bdcbd5';ctx.fillRect(0,0,200,120);ctx.fillStyle='#fff';ctx.fillRect(25,10,150,35);ctx.fillRect(25,75,150,35);
 const crop={label:'WON',x:0,y:0,width:1,height:1};assert.equal(referenceBadge(image,crop,makeCanvas),null);assert.equal(referenceBadge(image,crop,()=>{throw Error('Cached');}),null);
 const partial=contaminatedExample({blankLoss:true});assert.equal(referenceBadgePair(partial.image,partial.crops,makeCanvas),null);
});
test('preview and export clean legacy crops too, draw one current margin, and fall back for both words together',async()=>{
 for(const blankLoss of [false,true]){
  const {image,crops}=contaminatedExample({blankLoss}),canvas=createCanvas(1,1),ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx),draws=[],text=[];
  ctx.drawImage=(image,...box)=>{draws.push({image,box});draw(image,...box);};
  const items=['Home won by 9 wickets','Visitors won by 25 runs','Home won by 20 runs','Visitors won by 4 wickets'].map((result,i)=>({key:'m'+i,grade:'Grade '+i,our_team:'home',teams:[{id:'home',name:'Home'},{id:'away',name:'Visitors',organisation_id:'v'+i}],innings:[],result}));
  const layout=awardLayout('results',{example_path:'example',badge_source:'example',badge_crops:crops,badge_cutout:false,result_labels:'won_lost',badge_font:'script',badge_style:'plain'});
  await drawAwardGraphic({fontReady:async()=>{},text:(ctx,value,x,y,width,size,weight)=>{text.push({value,font:ctx.socialFont});ctx.font=`${weight} ${size}px ${ctx.socialFont}`;ctx.fillText(value,x,y,width);}},{design:{primary:'#123456',accent:'#345678'}},canvas,{kind:'results',items,layout,images:{example:image},week:'Week 1'});
  assert.deepEqual(text.filter(t=>t.value.startsWith('BY ')).map(t=>t.value),['BY 9 WICKETS','BY 25 RUNS','BY 20 RUNS','BY 4 WICKETS']);
  assert.equal(draws.some(d=>d.image===image),false,'Never redraw an unchecked raw example rectangle');
  assert.equal(canvas.resultsLetteringFallback,blankLoss);
  if(blankLoss){assert.equal(draws.length,0);const words=text.filter(t=>['WON','LOST'].includes(t.value));assert.deepEqual(words.map(t=>t.value),['WON','LOST','WON','LOST']);assert.equal(new Set(words.map(t=>t.font)).size,1);}
  else {assert.equal(draws.length,4);for(const d of draws)assert.equal(ink(d.image,(r,g,b)=>Math.max(r,g,b)<80),0);}
 }
});
