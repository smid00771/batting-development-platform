import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {SOCIAL_FONT_DATA} from '../social-font-fallback.js';
import {awardLayout,drawAwardGraphic,resultsOutcome} from '../social-awards-model.js';
import {RESULT_LABELS,resultLabel,refinedAwardLayout,matchingResultBadgeCrops,badgeCrops} from '../social-awards-design.js';

GlobalFonts.register(Buffer.from(SOCIAL_FONT_DATA.split(',')[1],'base64'),'Club Sporting');
const items=['Home won by 20 runs','Visitors won by 3 wickets','Home won by 4 wickets','Visitors won by 10 runs'].map((result,i)=>({
 key:'match-'+i,grade:'Grade '+(i+1),our_team:'home',result,teams:[{id:'home',name:'Home'},{id:'away',name:'Visitors',organisation_id:'visitor-'+i}],
 innings:[{team_id:'home',runs:160,wickets:7,batters:[{name:'Alex Example',runs:60,status:'played',importable:true}]},{team_id:'away',runs:140,wickets:10,bowlers:[{name:'Alex Example',team_id:'home',wickets:3,runs:20,importable:true}]}]
}));
async function render(layout){
 const canvas=createCanvas(1080,1350),text=[];
 await drawAwardGraphic({fontReady:async()=>{},text:(ctx,value,x,y,width,size,weight='700')=>{
  ctx.font=`${weight} ${size}px ${ctx.socialFont}`;while(ctx.measureText(String(value)).width>width&&size>18)ctx.font=`${weight} ${--size}px ${ctx.socialFont}`;
  text.push({value:String(value),font:ctx.font,x,y});ctx.fillText(String(value),x,y);
 }},{design:{primary:'#103768',accent:'#90DFFF'},data:{brand:{name:'Example Club'}}},canvas,{kind:'results',layout,items,week:'WEEK 2',images:{}});return {canvas,text};
}
test('one paired wording edit updates every win/defeat, using the same font and preserving geometry and facts',async()=>{
 const layout=awardLayout('results',{rows_top:25,rows_bottom:95,row_gap:18,badge_size:38,font:'sporting'}),facts=JSON.stringify(items),before=await render(layout);
 for(const [pair,words] of Object.entries(RESULT_LABELS)){
  const next=refinedAwardLayout(layout,{changes:{result_labels:pair},badges:[]},'results'),after=await render(next);
  const labels=after.text.filter(t=>Object.values(words).includes(t.value));
  assert.deepEqual(labels.map(t=>t.value),[words.WIN,words.LOSS,words.WIN,words.LOSS]);assert.equal(new Set(labels.map(t=>t.font)).size,1);
  assert.deepEqual(after.text.filter(t=>!Object.values(words).includes(t.value)),before.text.filter(t=>!['WIN','DEF'].includes(t.value)));
  assert.deepEqual(labels.map(({x,y})=>({x,y})),before.text.filter(t=>['WIN','DEF'].includes(t.value)).map(({x,y})=>({x,y})));
  assert.deepEqual({...next,badge_crops:next.badge_crops||[],result_labels:layout.result_labels},layout);
  if(process.env.AWARDS_PREVIEW_DIR&&pair==='won_lost'){fs.mkdirSync(process.env.AWARDS_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/results-won-lost.png',after.canvas.toBuffer('image/png'));}
 }
 assert.equal(JSON.stringify(items),facts);assert.deepEqual(items.map(resultsOutcome),['WIN','LOSS','WIN','LOSS']);
 for(const outcome of ['DRAW','TIE','NO RESULT','IN PROGRESS'])assert.equal(resultLabel(outcome,{result_labels:'won_lost'}),outcome);
 assert.equal(resultLabel('',{result_labels:'won_lost'}),'CHECK RESULT');
});
test('only a complete matching crop pair is used; wording and font edits remove both old crops',()=>{
 const example_path='club/artwork/example.png',crops=['WIN','DEF'].map((label,i)=>({label,x:.4,y:.2+i*.4,width:.15,height:.05}));
 const base=awardLayout('results',{example_path}),both=refinedAwardLayout(base,{changes:{},badges:crops,example_path},'results');
 assert.deepEqual(matchingResultBadgeCrops(both),crops);
 for(const badges of [[crops[0]],[crops[1]],[{...crops[0],label:'WON'},crops[1]]]){
  const next=refinedAwardLayout(base,{changes:{},badges,example_path},'results');assert.deepEqual(matchingResultBadgeCrops(next),[]);assert.equal(next.badge_source,undefined);
 }
 for(const changes of [{result_labels:'won_lost'},{font:'sporting'},{badge_style:'plain'}]){
  const next=refinedAwardLayout(both,{changes,badges:[]},'results');assert.equal(next.badge_source,undefined);assert.deepEqual(matchingResultBadgeCrops(next),[]);
 }
 assert.deepEqual(matchingResultBadgeCrops({...both,example_path:'replacement.png'}),[]);
 assert.throws(()=>badgeCrops([crops[0],{...crops[1],label:'WON'}]),/labels/);
});
