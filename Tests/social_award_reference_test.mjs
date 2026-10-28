import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {AWARD_FONT_DATA} from '../social-award-font-data.js';
import {referenceStylePatch} from '../social-award-reference.js';
import {awardLayout,drawAwardGraphic} from '../social-awards-model.js';
import {referenceGeometry} from '../social-awards-design.js';
for(const f of Object.values(AWARD_FONT_DATA))GlobalFonts.register(Buffer.from(f.data,'base64'),f.family);
const measurements={title_top:.018,title_width:.42,title_height:.095,grade_height:.024,score_height:.021,player_height:.017,badge_width:.17,margin_height:.022,row_inset:.045,row_gap:.048,rows_top:.26,rows_bottom:.89,left_column_end:.34,right_column_start:.61,player_align:'center'};
const base=awardLayout('results',{title_font:'condensed',grade_font:'condensed',score_font:'condensed',player_font:'sans',margin_font:'condensed',title_case:'title'});
test('reference proportions use actual font ink and stay identical across source resolutions',()=>{
 const ctx=createCanvas(1080,1350).getContext('2d'),patch=referenceStylePatch(ctx,base,measurements,{width:640,height:800},'results');
 assert.deepEqual(patch,referenceStylePatch(ctx,base,measurements,{width:1280,height:1600},'results'));
 assert.ok(patch.title_size>=130);ctx.font=`600 ${patch.player_size}px "Club Sans"`;const body=ctx.measureText('Alex Player');assert.ok(Math.abs(body.actualBoundingBoxAscent+body.actualBoundingBoxDescent-1350*.017)<2,'Body ink height matches the reference proportion');assert.equal(patch.player_align,'center');assert.equal(patch.row_gap,65);assert.equal(patch.left_column_end,34);
 ctx.font=`400 ${patch.title_size}px "Club Display"`;assert.ok(ctx.measureText('Results').width<=1080*.42+2);
 assert.throws(()=>referenceGeometry({...measurements,result:'won'}));assert.throws(()=>referenceGeometry({...measurements,title_width:2}));
 assert.deepEqual(referenceStylePatch(ctx,base,measurements,null,'results'),{});
});
test('title cannot clip at the canvas edge and reference name alignment remains inside isolated columns',async()=>{
 const canvas=createCanvas(1080,1350),ctx=canvas.getContext('2d'),text=[];
 const patch=referenceStylePatch(ctx,base,measurements,{width:640,height:800},'results');
 const items=[{key:'m',grade:'1st Grade',our_team:'h',result:'Home won by 25 runs',teams:[{id:'h',name:'Home'},{id:'a',name:'Away'}],innings:[{team_id:'h',runs:175,wickets:4,batters:[{name:'Alex Player',runs:66,importable:true,status:'played'}]},{team_id:'a',runs:150,wickets:10,bowlers:[{name:'Jordan Sample',team_id:'h',wickets:3,runs:24,importable:true}]}]}];
 await drawAwardGraphic({fontReady:async()=>{},text:(c,value,x,y,width,size,weight)=>{c.font=`${weight} ${size}px ${c.socialFont}`;const m=c.measureText(value);text.push({value,x,y,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent,left:x-m.actualBoundingBoxLeft,right:x+m.actualBoundingBoxRight,align:c.textAlign,font:c.font});c.fillText(value,x,y,width);}},{},canvas,{kind:'results',items,layout:{...base,...patch,title_y:0,week_y:0},week:'Week 3'});
 assert.ok(text.find(t=>t.value==='Results').top>=24);assert.ok(text.find(t=>t.value==='Week 3').top>text.find(t=>t.value==='Results').bottom+8);assert.equal(text.find(t=>t.value==='Alex Player').align,'center');assert.match(text.find(t=>t.value==='Alex Player').font,/Club Sans/);
 const figures=text.find(t=>t.value==='66'),name=text.find(t=>t.value==='Alex Player');assert.ok(name.right<figures.left-10);assert.ok(figures.right<440);
});
