import test from 'node:test';import assert from 'node:assert/strict';
import {matchPastedPlayers} from '../paste-unavailability.js';
import {ndcaRuleWeight} from '../club-standings.js';
test('paste matching normalizes punctuation while shortened and duplicate names require review',()=>{
 const roster=[{id:'p',name:'Penny O’Shea',active:true},{id:'m',name:'Matthew Burgess',active:true},{id:'v',name:'Vignesh Kumar Kandasamy',active:true},{id:'a',name:'Alex Smith',active:true},{id:'b',name:'Alex Smith',active:true},{id:'old',name:'Penny OShea',active:false}];
 const rows=matchPastedPlayers("• Penny O'Shea\n2. Matt Burgess\nVignesh Kumar\nAlex Smith\nUnknown",roster);
 assert.equal(rows[0].id,'p');assert.equal(rows[1].id,'');assert.deepEqual(rows[1].candidates.map(p=>p.id),['m']);assert.equal(rows[2].id,'');assert.deepEqual(rows[2].candidates.map(p=>p.id),['v']);assert.equal(rows[3].id,'');assert.equal(rows[3].candidates.length,2);assert.equal(rows[4].id,'');assert.equal(rows[4].candidates.length,0);
});
test('NDCA preset proposes the supplied grade multipliers and omits excluded competitions',()=>{
 assert.deepEqual(['1st Grade','2nd Grade','3rd Grade','4th Grade','Development League',"Women's 1st Grade","Women's 2nd Grade",'Gilmour Cup','U16 SG Moore Cup','Women Development League','Denis Broad OAM Cup','U21s'].map(ndcaRuleWeight),[5,4,3,2,1,3,2,2,2,null,null,null]);
});
