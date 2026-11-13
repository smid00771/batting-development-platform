import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graphicPlayerName} from '../social-graphic-design.js';
test('three-part names shorten for every club without changing source records',()=>{
 const record={id:'player',name:'Arun Mohan Kumar'},before=structuredClone(record);
 assert.equal(graphicPlayerName(record.name),'Arun Kumar');assert.deepEqual(record,before);
 for(const [name,expected] of [['Alex John Michael Smith','Alex Smith'],['Alex Smith','Alex Smith'],['Ravi','Ravi'],['Jo-Anne May Smith-Jones','Jo-Anne Smith-Jones'],['Alex de Silva','Alex de Silva'],['Liam James van der Meer','Liam van der Meer'],['Smith, Alex John','Alex Smith'],['Alex John Smith Jr.','Alex Smith Jr.']])assert.equal(graphicPlayerName(name),expected);
});
test('explicit club labels take priority over automatic shortening',()=>{
 assert.equal(graphicPlayerName('Arun Mohan Kumar',{player_name_labels:[{name:'Arun Mohan Kumar',label:'Ari Kumar'}]}),'Ari Kumar');
 assert.equal(graphicPlayerName('Arun Mohan Kumar',{player_name_labels:[{name:'Arun Mohan Kumar',label:'Arun Mohan Kumar'}]}),'Arun Mohan Kumar');
 assert.equal(graphicPlayerName('Arun Mohan Kumar',{player_name_labels:[{name:'Arun Mohan Kumar',label:'<script>'}]}),'Arun Kumar');
});
test('different people cannot become indistinguishable through automatic shortening',()=>{
 const peers=['Alex John Smith','Alex David Smith','Alex Smith'];
 assert.equal(graphicPlayerName(peers[0],{},peers),'Alex J. Smith');assert.equal(graphicPlayerName(peers[1],{},peers),'Alex D. Smith');assert.equal(graphicPlayerName(peers[2],{},peers),'Alex Smith');
 const sameInitial=['Alex John Smith','Alex James Smith'];assert.equal(graphicPlayerName(sameInitial[0],{},sameInitial),sameInitial[0]);assert.equal(graphicPlayerName(sameInitial[1],{},sameInitial),sameInitial[1]);
});
