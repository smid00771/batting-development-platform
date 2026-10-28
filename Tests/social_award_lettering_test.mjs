import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {referenceBadge} from '../social-award-lettering.js';
import {awardLayout} from '../social-awards-model.js';
import {refinedAwardLayout,matchingResultBadgeCrops} from '../social-awards-design.js';
test('reference lettering removes the panel rectangle, preserves foreground and caches the extraction',()=>{
 const image=createCanvas(200,100),ctx=image.getContext('2d');ctx.fillStyle='#aabacc';ctx.fillRect(0,0,200,100);ctx.fillStyle='#fff';ctx.fillRect(70,30,60,40);
 const crop={label:'WON',x:0,y:0,width:1,height:1},badge=referenceBadge(image,crop,()=>createCanvas(1,1)),pixels=badge.getContext('2d');
 assert.equal(pixels.getImageData(0,0,1,1).data[3],0);assert.deepEqual([...pixels.getImageData(90,50,1,1).data],[255,255,255,255]);assert.equal(referenceBadge(image,crop,()=>{throw Error('Cached');}),badge);
});
test('a complete reference pair survives independent font matching; later wording/font edits clear both',()=>{
 const example_path='club/artwork/example.png',base=awardLayout('results',{example_path,font:'classic'}),badges=['WON','LOST'].map((label,i)=>({label,x:.4,y:.3+i*.4,width:.2,height:.06}));
 const next=refinedAwardLayout(base,{changes:{font:'modern',title_font:'condensed',player_font:'sans',badge_font:'script',result_labels:'won_lost'},badges,example_path,reference_lettering:true},'results');
 assert.deepEqual(matchingResultBadgeCrops(next),badges);assert.equal(next.badge_cutout,true);
 for(const changes of [{result_labels:'win_loss'},{badge_font:'sans'},{font:'classic'}]){const changed=refinedAwardLayout(next,{changes,badges:[]},'results');assert.deepEqual(matchingResultBadgeCrops(changed),[]);assert.equal(changed.badge_cutout,undefined);}
 const partial=refinedAwardLayout(base,{changes:{result_labels:'won_lost'},badges:[badges[0]],example_path,reference_lettering:true},'results');assert.deepEqual(matchingResultBadgeCrops(partial),[]);assert.equal(partial.badge_cutout,undefined);
});
