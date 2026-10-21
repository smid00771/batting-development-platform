import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createTeamOfWeek} from '../team-of-week.js';
import {createPlayerOfWeek} from '../player-of-week.js';
import {createSocialAwards} from '../social-awards.js';
import {drawAwardGraphic,resultsSummary} from '../social-awards-model.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),{createCanvas}=require('@napi-rs/canvas');
const dom=new JSDOM('<div id="socialContent"></div>',{url:'https://clubbatting.com'});
globalThis.window=dom.window;globalThis.document=window.document;globalThis.localStorage=window.localStorage;window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
window.HTMLCanvasElement.prototype.getContext=function(){if(!this.backing){this.backing=createCanvas(this.width,this.height);const ctx=this.backing.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(i,...args)=>draw(i.backing||i,...args);}this.backing.width=this.width;this.backing.height=this.height;return this.backing.getContext('2d');};
const el=id=>document.getElementById(id),settle=async fn=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('UI did not settle: '+document.body.textContent.slice(-600));};
const bat={player_id:'p',name:'Day One Batter',runs:100,not_out:true,status:'played',importable:true},bowl={player_id:'p',team_id:'our',name:'Day One Batter',wickets:5,runs:40,importable:true};
const card={schema_version:2,match_id:'match',format_key:'long_form',grade:'Test grade',status:'in_progress',dates:['2026-10-17','2026-10-24'],teams:[{id:'our',name:'Club'},{id:'their',name:'Visitors'}],innings:[{team_id:'our',number:1,complete:false,batters:[bat],bowlers:[],runs:200,wickets:4},{team_id:'their',number:1,complete:false,batters:[],bowlers:[bowl],runs:100,wickets:5,bowling_available:true}]};
const p={key:'snapshot:our:p',snapshot_id:'snapshot',match_id:'match',team_id:'our',player_id:'p',name:bat.name,grade:'Test grade',batting:[bat],bowling:[bowl],runs:100,wickets:5,conceded:40,provisional:true};
const result={...card,key:'match:results',kind:'results',our_team:'our',provisional:true,result:'Club won'};
const milestone={key:'match:century',kind:'century',name:bat.name,player_id:'p',grade:'Test grade',opposition:'Visitors',innings_number:1,stat:bat,provisional:true,signature:'day1'};
const calls=[],labels=[];let available=false,current,ui;
const h={escape:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),here:s=>s===current,sharedResults:true,fontReady:async()=>{},text:(ctx,text,x,y,width,size)=>{labels.push(text);ctx.font=`700 ${size}px Arial`;ctx.fillText(String(text),x,y,width);},savedPhotos:()=>[],navigation:()=>{},draw:s=>ui.render(s),canLeave:()=>true,message:()=>{},image:async()=>null,extractUrl:()=>'',supabase:{functions:{invoke:async()=>({data:{teams:[]}})},rpc:async(name,{p_action,p_data})=>{
 calls.push({name,p_action,p_data});assert.equal(p_action,'context');const selected=p_data.include_provisional;
 const cards=[{snapshot_id:'snapshot',our_team:'our',scorecard:{...card,...(selected?{award_provisional:true}:{})}}];
 const common={provisional_available:available,cards,design:{layout:{},revision:0},history:[],profiles:{}};
 return {data:name==='club_social_awards_api'?{...common,settings:{enabled:['century','results','five_wickets'],revision:0},designs:{},photos:[],editions:[],requests:[],candidates:selected?[milestone,result]:[]}: {...common,candidates:selected?[p]:[]}};
}}};
for(const [view,factory,checkbox] of [['team_week',createTeamOfWeek,'twDay1'],['player_week',createPlayerOfWeek,'pwDay1'],['century',createSocialAwards,'saDay1']]){
 current={scope:'user:club',view,data:{brand:{name:'Club'},timezone:'Australia/Sydney'},design:{primary:'#073554',accent:'#128fd2'},urls:new Map()};ui=factory(h);available=false;ui.state(current).end='2026-10-18';await ui.load(current);ui.render(current);
 assert.equal(el(checkbox),null,view+' hides the option when no eligible Day 1 scores exist');
 available=true;await ui.load(current);ui.render(current);assert.equal(el(checkbox).checked,false);assert.equal(el(checkbox).closest('label').textContent.trim(),'Include Day 1 scores');
 el(checkbox).click();await settle(()=>!ui.state(current).busy&&!ui.state(current).loading);assert.equal(calls.at(-1).p_data.include_provisional,true);assert.equal(el(checkbox).checked,true);
 assert.doesNotMatch(document.body.textContent,/provisional/i);assert.ok(document.body.textContent.includes(bat.name),view+' admits achievement without provisional label');
 if(view==='team_week')assert.equal(el('twSuggest').disabled,false,'Unfinished innings do not block opted-in awards');
 if(view==='century'){
  current.view='results';await ui.load(current);ui.render(current);assert.equal(el('saDay1').checked,false,'Each award choice is independent');el('saDay1').click();await settle(()=>!ui.state(current).loading);assert.match(document.body.textContent,/Match in progress/);
 }
 available=false;await ui.load(current);ui.render(current);assert.equal(el(checkbox),null,'Option disappears after completion');
}
assert.equal(resultsSummary(result).outcome,'IN PROGRESS','An imported unfinished game cannot claim a final win');
const canvas=createCanvas(1080,1350),s={design:{primary:'#073554',accent:'#128fd2'}};
for(const [kind,item] of [['century',milestone],['five_wickets',{...milestone,kind:'five_wickets',stat:bowl}]]){
 labels.length=0;await drawAwardGraphic(h,s,canvas,{kind,items:[item],layout:{},week:'Week 1'});assert.doesNotMatch(labels.join(' '),/provisional|in progress/i);assert.ok(labels.some(x=>String(x).includes(kind==='century'?'100*':'5/40')));
}
labels.length=0;await drawAwardGraphic(h,s,canvas,{kind:'results',items:[result],layout:{},week:'Week 1'});assert.ok(labels.includes('MATCH UPDATE'));assert.ok(labels.includes('IN PROGRESS'));assert.ok(!labels.includes('WIN'));
console.log('Passed: compact conditional checkbox in all award screens, independent choices, normal milestone graphics, explicit unfinished match update.');
