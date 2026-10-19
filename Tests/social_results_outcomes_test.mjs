import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resultsOutcome,drawAwardGraphic,awardLayout} from '../social-awards-model.js';

const fixture=result=>({key:'first-grade',grade:'1st Grade',our_team:'city',teams:[{id:'visitors',name:'Toronto Workers',organisation:'Cricket Southern Lakes (Toronto)'},{id:'city',name:'Newcastle City',organisation:'Newcastle City & Eastern Districts Cricket Club'}],result,innings:[{team_id:'city',runs:180,wickets:10},{team_id:'visitors',runs:198,wickets:10}]});

test('the four imported Newcastle City results resolve from the club’s perspective',()=>{
 assert.deepEqual(['Toronto Workers won by 18 runs','Newcastle City won by 5 wickets','Toronto Workers won by 52 runs','Newcastle City won by 7 wickets'].map(text=>resultsOutcome(fixture(text))),['LOSS','WIN','LOSS','WIN']);
});
test('outcome follows the stated result even when totals or team order suggest otherwise',()=>{
 assert.equal(resultsOutcome(fixture('Newcastle City won by 2 runs (DLS method)')),'WIN');
 const next=fixture('Toronto Workers won by an innings and 25 runs');next.teams.reverse();next.innings.push({team_id:'city',runs:400,wickets:10});assert.equal(resultsOutcome(next),'LOSS');
 for(const [text,expected] of [['Newcastle City defeated Toronto Workers','WIN'],['Toronto Workers defeated by Newcastle City','WIN'],['Newcastle City lost to Toronto Workers','LOSS'],['Newcastle City forfeited','LOSS'],['NEWCASTLE   CITY won by 5 wickets','WIN'],['Cricket Southern Lakes (Toronto) won by 18 runs','LOSS'],['Match tied','TIE'],['Match drawn','DRAW'],['Match abandoned','NO RESULT'],['No result','NO RESULT']])assert.equal(resultsOutcome(fixture(text)),expected,text);
 for(const text of ['', 'Awaiting result','Unknown team won by 18 runs'])assert.equal(resultsOutcome(fixture(text)),'',text);
 assert.equal(resultsOutcome({...fixture('Newcastle City won by 5 wickets'),our_team:'unmatched'}),'');
});
test('next week replaces last week’s outcome and ignores any old manual outcome value',async()=>{
 const labels=[],ctx={fillStyle:'',save(){},restore(){},measureText:()=>({width:10}),scale(){},fillRect(){},createLinearGradient:()=>({addColorStop(){}})},canvas={getContext:()=>ctx},h={fontReady:async()=>{},text:(_,value)=>labels.push(value)};
 for(const [result,expected,old] of [['Newcastle City won by 5 wickets','WIN','LOSS'],['Toronto Workers won by 18 runs','DEF','WIN'],['Result awaiting confirmation','CHECK RESULT','WIN']]){
  labels.length=0;await drawAwardGraphic(h,{},canvas,{kind:'results',items:[fixture(result)],layout:awardLayout('results'),week:'THIS WEEK',outcomes:{'first-grade':old}});
  assert.ok(labels.includes(expected));assert.ok(!labels.includes(expected==='WIN'?'DEF':'WIN'));
 }
});
