import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {graphicGrade} from '../social-graphic-design.js';
import {teamWeekGrade} from '../team-of-week.js';
import {awardLayout,drawAwardGraphic} from '../social-awards-model.js';

const labels=[
 {grade:'Rippit Development League',label:'DEV'},
 {grade:'Dev League Navy',label:'DEV'},
 {grade:'Dev League Sky',label:'DEV'},
 {grade:'Gilmour Cup Masters',label:'MSTRs'},
 {grade:'U16 SG Moore Cup',label:'SGs'},
 {grade:'Denis Broad OAM Cup',label:'DBs'}
];
const layout={grade_labels:labels};

test('saved club labels cover known imported/team-name variants and retain their agreed case',()=>{
 const before=JSON.stringify(layout);
 for(const [expected,names] of [
  ['DEV',['Rippit Development League','Development League','Dev League Navy','Dev League Sky','Dev Navy','Dev Sky','  DEV   LEAGUE NAVY  ']],
  ['MSTRs',['Gilmour Cup Masters','Masters']],
  ['SGs',['U16 SG Moore Cup','S.G. Moore Cup','Simon Moore Cup','Moore Cup']],
  ['DBs',['Denis Broad OAM Cup','Denis Broad Cup']]
 ])for(const name of names){
  assert.equal(teamWeekGrade(name,layout),expected,name);
  assert.equal(graphicGrade(name,layout,false,true),expected,name+' in an uppercase heading');
 }
 assert.equal(teamWeekGrade('1st Grade (Rippit Premiership)',layout),'1ST');
 assert.equal(graphicGrade('U21s',layout),'U21s');
 assert.equal(graphicGrade("Women's 1st Grade",layout),"Women's 1st Grade");
 assert.equal(JSON.stringify(layout),before);
});

test('other clubs and explicit team distinctions remain independent',()=>{
 assert.equal(graphicGrade('Dev League Navy',{}),'Dev League Navy');
 assert.equal(graphicGrade('Masters',{},false,true),'MASTERS');
 const distinct={grade_labels:[{grade:'Dev League Navy',label:'Navy XI'},{grade:'Dev League Sky',label:'Sky XI'}]};
 assert.equal(graphicGrade('Dev League Navy',distinct,false,true),'Navy XI');
 assert.equal(graphicGrade('Dev League Sky',distinct,false,true),'Sky XI');
 assert.equal(graphicGrade('Rippit Development League',distinct),'Dev League');
 assert.equal(graphicGrade('Unrelated Development Squad',layout),'Unrelated Development Squad');
});

test('Results, Century and Five wickets render the saved labels without changing scores or source grades',async()=>{
 const grades=['Dev League Navy','Gilmour Cup Masters','U16 SG Moore Cup','Denis Broad OAM Cup'];
 const items=grades.map((grade,i)=>({key:'match-'+i,grade,name:'Example Player '+i,our_team:'home',result:'Home won by 20 runs',opposition:'Visitors',stat:{runs:120,wickets:5,not_out:true},teams:[{id:'home',name:'Home'},{id:'away',name:'Visitors'}],innings:[{team_id:'home',runs:160,wickets:6,batters:[]},{team_id:'away',runs:140,wickets:10,bowlers:[]}]}));
 const before=JSON.stringify(items),s={design:{primary:'#073554',accent:'#128fd2'},data:{brand:{name:'Example Club'}}};
 for(const kind of ['results','century','five_wickets']){
  const batches=kind==='results'?[items]:items.map(item=>[item]);
  for(const batch of batches){
   const canvas=createCanvas(1080,1350),drawn=[];
   const h={fontReady:async()=>{},text:(ctx,value,x,y,width,size)=>{drawn.push(value);ctx.font=`700 ${size}px Arial`;ctx.fillText(value,x,y,width);}};
   await drawAwardGraphic(h,s,canvas,{kind,items:batch,layout:awardLayout(kind,{...layout,grade_case:'upper',show_logo:false}),week:'Week 5',images:{}});
   for(const item of batch){const expected=graphicGrade(item.grade,layout);assert.ok(drawn.some(text=>text===expected||text.startsWith(expected+' · ')),kind+': '+expected);}
   assert.equal(drawn.some(text=>['MSTRS','SGS','DBS'].includes(text)),false);
  }
 }
 assert.equal(JSON.stringify(items),before);
});
