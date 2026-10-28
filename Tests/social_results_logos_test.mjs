import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {awardLayout,drawAwardGraphic} from '../social-awards-model.js';

const require=createRequire(import.meta.url),{createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const font=fs.readFileSync(new URL('../social-font-fallback.js',import.meta.url),'utf8').match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/)[1];
GlobalFonts.register(Buffer.from(font,'base64'),'Club Sporting');
function badge(label,colour,width=100,height=100){const image=createCanvas(width,height),ctx=image.getContext('2d');ctx.fillStyle=colour;ctx.fillRect(0,0,width,height);ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.font='bold 22px Arial';ctx.fillText(label,width/2,height/2+8);return image;}
const club=badge('CITY','#df2148'),opposition=badge('VISITORS','#146741',160,100),other=badge('OTHER','#1951a5',80,120);
const fixture=(n,org='opposition')=>({key:'match-'+n,grade:n+'st Grade',our_team:'city',teams:[{id:'city',name:'Newcastle City'},{id:'grade-team-'+n,organisation_id:org,name:org==='opposition'?'Visitors':'Other Club'}],innings:[{team_id:'city',runs:180,wickets:10,batters:[{name:'Liam Simpson',runs:49,not_out:true,status:'played',importable:true},{name:'Haydon Mustard',runs:27,status:'played',importable:true},{name:'Archie Lenham',runs:25,status:'played',importable:true}]},{team_id:'grade-team-'+n,runs:198,wickets:10,bowlers:[{name:'Archie Lenham',team_id:'city',wickets:4,runs:35,importable:true},{name:'Jonah Roser',team_id:'city',wickets:3,runs:36,importable:true},{name:'Callan Fowler',team_id:'city',wickets:2,runs:20,importable:true}]}],result:'Visitors won by 18 runs'});
async function render(items,{layout={},images={}}={}){
 const canvas=createCanvas(1080,1350),draws=[],labels=[],ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx);
 ctx.drawImage=(image,...box)=>{draws.push({image,box});draw(image,...box);};
 const h={fontReady:async()=>{},text:(ctx,value,x,y,width,size)=>{ctx.font=`700 ${size}px "Club Sporting"`;while(ctx.measureText(value).width>width&&size>10)ctx.font=`700 ${--size}px "Club Sporting"`;labels.push({value,x,y,size});ctx.fillText(value,x,y);}};
 const d=awardLayout('results',layout);
 await drawAwardGraphic(h,{design:{primary:'#292d75',accent:'#a8223d'}},canvas,{kind:'results',items,layout:d,week:'WEEK ENDING 11/10/2026',images:{logo:club,opponents:Object.fromEntries(items.map(x=>[x.key,opposition])),...images}});
 return {canvas,draws,labels,layout:d};
}
function checkPair(result,left,right,vs){
 assert.ok(left&&right&&vs,'Both badges and VS are rendered');
 const [lx,ly,lw,lh]=left.box,[rx,ry,rw,rh]=right.box;
 assert.ok(lx+lw<vs.x&&vs.x<rx,'VS sits between the badges');
 assert.ok(Math.abs(ly+lh/2-vs.y)<.01&&Math.abs(ry+rh/2-vs.y)<.01,'Both badges align with VS');
 assert.ok(lx>=0&&rx+rw<=1080&&ly>=0&&ry>=0,'Both badges fit inside the graphic');
 assert.ok(Math.abs(lw/lh-left.image.width/left.image.height)<1e-9,'Club badge keeps its proportions');
 assert.ok(Math.abs(rw/rh-right.image.width/right.image.height)<1e-9,'Opposition badge keeps its proportions');
}
function preview(name,result){if(process.env.AWARDS_PREVIEW_DIR){fs.mkdirSync(process.env.AWARDS_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/'+name+'.png',result.canvas.toBuffer('image/png'));}}

test('Grades against the same club share both header badges with VS',async()=>{
 const items=[1,2,3,4].map(n=>fixture(n));
 // Grade-specific team IDs can differ; the resolved club IDs must decide the header.
 for(const item of items){delete item.teams[1].organisation_id;item.teams[1].name+=' '+item.grade;item.result=item.teams[1].name+' won by 18 runs';}
 const result=await render(items,{images:{opponentKeys:Object.fromEntries(items.map(x=>[x.key,'same-club']))}}),versus=result.labels.filter(t=>t.value==='VS');
 assert.equal(versus.length,1);assert.equal(result.draws.filter(d=>d.image===club).length,1);assert.equal(result.draws.filter(d=>d.image===opposition).length,1);
 checkPair(result,result.draws.find(d=>d.image===club),result.draws.find(d=>d.image===opposition),versus[0]);
 assert.ok(versus[0].y<1350*result.layout.rows_top/100,'Pair is above all grades');
 preview('results-shared-opponent',result);
});

test('Different opponents get the correct pair and VS in each result',async()=>{
 const items=[fixture(1),fixture(2,'other')],result=await render(items,{images:{opponents:{'match-1':opposition,'match-2':other}}}),versus=result.labels.filter(t=>t.value==='VS'),ours=result.draws.filter(d=>d.image===club);
 assert.equal(versus.length,2);assert.equal(ours.length,2);
 checkPair(result,ours[0],result.draws.find(d=>d.image===opposition),versus[0]);
 checkPair(result,ours[1],result.draws.find(d=>d.image===other),versus[1]);
 assert.ok(versus.every(t=>t.y>1350*result.layout.rows_top/100),'No single opposition is presented as applying to every grade');
 preview('results-mixed-opponents',result);
});

test('Header positioning moves both badges and VS together on a saved background',async()=>{
 const background=createCanvas(1170,1445),result=await render([fixture(1)],{layout:{logo_x:75,logo_y:20,logo_size:15},images:{background}}),vs=result.labels.find(t=>t.value==='VS');
 assert.equal(result.canvas.width,1170);assert.equal(result.canvas.height,1445);
 checkPair(result,result.draws.find(d=>d.image===club),result.draws.find(d=>d.image===opposition),vs);assert.ok(vs.x>540);
});

test('Missing opposition artwork uses its name without borrowing another club’s badge',async()=>{
 const result=await render([fixture(1)],{images:{opponents:{}}});
 assert.equal(result.draws.filter(d=>d.image===club).length,1);assert.ok(result.labels.some(t=>t.value==='Visitors'));assert.ok(result.labels.some(t=>t.value==='VS'));
});

test('each grade displays its own imported result, and a later round can reverse all outcomes',async()=>{
 const items=[1,2,3,4].map(n=>fixture(n));
 for(const [i,item] of items.entries())item.result=(i%2?'Newcastle City':'Visitors')+' won by 18 runs';
 const first=await render(items);assert.deepEqual(first.labels.filter(t=>['WIN','DEF'].includes(t.value)).map(t=>t.value),['DEF','WIN','DEF','WIN']);preview('results-playcricket-outcomes',first);
 for(const [i,item] of items.entries())item.result=(i%2?'Visitors':'Newcastle City')+' won by 18 runs';
 const next=await render(items);assert.deepEqual(next.labels.filter(t=>['WIN','DEF'].includes(t.value)).map(t=>t.value),['WIN','DEF','WIN','DEF']);
});
