import socialSource from './helpers/social-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createTeamOfWeek,teamWeekMatchExample} from '../team-of-week.js';
import {createTeamWeekDemo} from '../team-of-week-demo.js';
import {createPlayerOfWeek} from '../player-of-week.js';
import {createPlayerWeekDemo} from '../player-of-week-demo.js';
import {createTeamSocialWorkflow} from '../social-team-workflow.js';
import {graphicGrade,checkGraphicLabel,withGradeLabels} from '../social-graphic-design.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),{createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const dom=new JSDOM('<main id="socialContent"></main>',{url:'https://example.invalid/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,CSS:{escape:x=>x}});window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
const font=fs.readFileSync(new URL('../social-font-fallback.js',import.meta.url),'utf8').match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/)[1];GlobalFonts.register(Buffer.from(font,'base64'),'Club Sporting');
window.HTMLCanvasElement.prototype.getContext=function(){if(!this.backing){this.backing=createCanvas(this.width,this.height);const ctx=this.backing.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(img,...args)=>draw(img.backing||img,...args);}if(this.backing.width!==this.width)this.backing.width=this.width;if(this.backing.height!==this.height)this.backing.height=this.height;return this.backing.getContext('2d');};
window.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new Blob([this.backing.toBuffer('image/png')],{type:'image/png'}));};
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),id=x=>document.getElementById(x),tick=()=>new Promise(r=>setTimeout(r,5));
async function until(fn){for(let i=0;i<600;i++){if(fn())return;await tick();}throw Error('Timed out: '+document.querySelector('[id$="Status"]')?.textContent);}
const grade='Rippit Development League',longGrade='North Coast Regional Metropolitan Championship Grade';
assert.equal(graphicGrade(grade),'Dev League');assert.equal(graphicGrade('1st Grade NDCA',{},true),'1ST');
assert.equal(graphicGrade('First Grade'), 'First Grade');
assert.equal(teamWeekMatchExample([{player_id:'alex',name:'Alex Example',grade}],{names:[{name:'Alex Example',grade:'Dev'}]},withGradeLabels({},[{grade,label:'Dev'}],[grade])).matched.length,1,'An abbreviated previous example still matches the source grade');
assert.throws(()=>withGradeLabels({},[{grade:'Unknown',label:'Dev'}],[grade]),/does not match/);
for(const [kind,create,apiCreate,prefix,canvasId] of [['team_week',createTeamOfWeek,createTeamWeekDemo,'twAI','twCanvas'],['player_week',createPlayerOfWeek,createPlayerWeekDemo,'pwAI','pwCanvas']]){
 const api=apiCreate(()=> 'Test Club'),rpc=api.rpc.bind(api),calls=[];let failSave=false,release=null,answer=null,sharedLabel;
 api.rpc=async(name,args)=>{calls.push(structuredClone(args));if(args.p_action==='save_design'&&failSave)return {error:{message:'Connection lost'}};const result=await rpc(name,args);if(args.p_action==='context')for(const p of result.data.candidates)p.grade=grade;return result;};
 api.functions={invoke:async(_,request)=>{calls.push(request.body);if(release)return await release;return {data:answer||{changes:{},grade_labels:[{grade,label:'Dev'}],explanation:'Shortened the grade label.'}};}};
 const s={scope:'test:club-test',view:kind,data:{brand:{name:'Test Club'},timezone:'Australia/Sydney'},design:{primary:'#073554',accent:'#128fd2'},urls:new Map()};
 let backgroundHelp;const mod=create({supabase:api,sharedResults:true,loadLabel:async()=>sharedLabel,here:x=>x===s,escape:esc,extractUrl:x=>x[0],fontReady:async()=>{},image:async()=>null,text:(ctx,t,x,y,width,size)=>{ctx.font=`700 ${size}px ${ctx.socialFont}`;while(ctx.measureText(String(t)).width>width&&size>12)ctx.font=`700 ${--size}px ${ctx.socialFont}`;ctx.fillText(String(t),x,y);},savedPhotos:()=>[],openBackground:(_,file,apply,options)=>backgroundHelp={file,apply,options}}),w=mod.state(s);
 w.end='2026-10-11';mod.render(s);const settled=()=>until(()=>w.context&&!w.busy&&w.previewReady);await settled();
 if(kind==='team_week'){id('twUseSuggested')?.click();}else document.querySelector('[data-pw-choose]').click();await settled();
 assert.ok(id(prefix+'Brief'),'Assistant is visible without opening a hidden editor');
 const facts=JSON.stringify(w.context.candidates),before=id(canvasId).backing.toBuffer('image/png');
 id(prefix+'Brief').value='Shorten Development League to Dev';id(prefix+'Brief').dispatchEvent(new window.Event('input'));id(prefix+'Try').click();await settled();
 assert.equal(w.layout.grade_labels[0].label,'Dev');assert.equal(w.graphicAssistant.candidate,true);assert.equal(mod.canLeave(s),false);assert.equal(id(kind==='team_week'?'twSave':'pwSave').disabled,true);assert.notDeepEqual(id(canvasId).backing.toBuffer('image/png'),before);assert.equal(JSON.stringify(w.context.candidates),facts);
 const request=calls.find(c=>c.purpose==='graphic_refine');assert.equal(request.kind,kind);assert.ok(request.preview.startsWith('data:image/png;base64,'));assert.ok(request.preview_grades.includes(grade));assert.equal(calls.some(c=>c.p_action==='save_design'),false);
 id(prefix+'Undo').click();await settled();assert.equal(w.graphicAssistant.candidate,false);assert.deepEqual(id(canvasId).backing.toBuffer('image/png'),before);assert.equal(mod.canLeave(s),true);
 id(prefix+'Try').click();await settled();failSave=true;id(prefix+'Use').click();await settled();assert.equal(w.graphicAssistant.saveUncertain,true);assert.equal(id(prefix+'Undo').disabled,true);assert.equal(id(prefix+'Try').disabled,true);assert.equal(id(prefix+'Reload').disabled,false);
 failSave=false;id(prefix+'Use').click();await settled();assert.equal(w.graphicAssistant.candidate,false);assert.equal(w.graphicAssistant.saveUncertain,false);await mod.load(s,{preserve:true});await settled();assert.equal(w.layout.grade_labels[0].label,'Dev');assert.equal(JSON.stringify(w.context.candidates),facts);
 if(process.env.GRAPHIC_PREVIEW_DIR&&kind==='team_week'){fs.mkdirSync(process.env.GRAPHIC_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.GRAPHIC_PREVIEW_DIR+'/team-week-dev.png',id(canvasId).backing.toBuffer('image/png'));}
 // The reported request must change actual pixels before approval, without repainting artwork or changing dates.
 assert.equal(id(prefix+'Try').textContent,'Preview changes');
 const originalLabel=w.title,originalWeek=w.end,labelBefore=id(canvasId).backing.toBuffer('image/png'),layoutBefore=JSON.stringify(w.layout),writesBefore=calls.filter(c=>c.p_action==='save_design').length;
 answer={changes:{},grade_labels:[],graphic_label:'Round 2',artwork_brief:null,explanation:'Show Round 2 in the week label.'};
 id(prefix+'Brief').value='Replace Week ending with the round number - Round 2 for this week';id(prefix+'Brief').dispatchEvent(new window.Event('input'));id(prefix+'Try').click();await settled();
 assert.equal(w.title,'Round 2');assert.equal(w.end,originalWeek);assert.equal(JSON.stringify(w.layout),layoutBefore);assert.equal(JSON.stringify(w.context.candidates),facts);
 assert.notDeepEqual(id(canvasId).backing.toBuffer('image/png'),labelBefore);assert.match(id(prefix+'Status').textContent,/Proposed changes/);assert.equal(id(prefix+'Use').textContent,'Apply changes');assert.equal(id(prefix+'Undo').textContent,'Undo changes');assert.equal(id(prefix+'Artwork'),null);
 assert.equal(calls.filter(c=>c.p_action==='save_design').length,writesBefore);assert.equal(calls.filter(c=>c.purpose==='graphic_refine').at(-1).graphic_label,originalLabel);
 if(process.env.GRAPHIC_PREVIEW_DIR){fs.mkdirSync(process.env.GRAPHIC_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.GRAPHIC_PREVIEW_DIR+'/'+kind+'-round-2.png',id(canvasId).backing.toBuffer('image/png'));}
 id(prefix+'Undo').click();await settled();assert.equal(w.title,originalLabel);assert.deepEqual(id(canvasId).backing.toBuffer('image/png'),labelBefore);
 id(prefix+'Try').click();await settled();id(prefix+'Use').click();await settled();assert.equal(w.title,'Round 2');assert.equal(w.graphicAssistant.candidate,false);assert.equal(calls.filter(c=>c.p_action==='save_design').length,writesBefore,'This week’s label is not saved in the reusable club design');
 // Clubs can use their own round wording; no City-specific label is built into the renderer.
 for(const label of ['Matchday 7','Finals – Week 1']){answer={changes:{},grade_labels:[],graphic_label:label,explanation:'Change the label.'};id(prefix+'Brief').value='Use '+label;id(prefix+'Brief').dispatchEvent(new window.Event('input'));id(prefix+'Try').click();await settled();assert.equal(w.title,label);assert.equal(w.end,originalWeek);id(prefix+'Undo').click();await settled();assert.equal(w.title,'Round 2');}
 answer={changes:{},grade_labels:[],explanation:'No supported changes.'};id(prefix+'Try').click();await settled();assert.match(id(prefix+'Status').textContent,/No changes were made/);assert.equal(w.graphicAssistant.candidate,false);
 // A real artwork request continues automatically, but no artwork is saved before approval.
 answer={changes:{text_colour:'#FFEEDD'},grade_labels:[],artwork_brief:'Move only the painted heading lower.',explanation:'Move the heading.'};backgroundHelp=null;
 id(prefix+'Try').click();await until(()=>!!backgroundHelp);assert.ok(backgroundHelp.options.proposal);assert.equal(backgroundHelp.options.brief,answer.artwork_brief);assert.equal(w.graphicAssistant.artworkPending,true);assert.equal(calls.filter(c=>c.p_action==='save_design').length,writesBefore);
 backgroundHelp.options.proposal.undo();mod.render(s);await settled();assert.equal(JSON.stringify(w.layout),layoutBefore);assert.equal(w.title,'Round 2');assert.equal(w.graphicAssistant.artworkPending,false);answer=null;
 // An overlong, unfamiliar grade asks for the club's wording; choosing it is free.
 if(kind==='team_week'){w.rows[0].grade=longGrade;w.layout.figures_right=910;w.layout.grade_right=1015;mod.render(s);await settled();const input=document.querySelector('#'+prefix+'Labels input');assert.ok(input);assert.equal(input.value,'');const count=calls.filter(c=>c.purpose==='graphic_refine').length;input.value='Regional';input.dispatchEvent(new window.Event('input'));input.nextElementSibling.click();await settled();assert.equal(graphicGrade(longGrade,w.layout),'Regional');assert.equal(calls.filter(c=>c.purpose==='graphic_refine').length,count);id(prefix+'Undo').click();await settled();}
 sharedLabel={label:'Week 2',mode:'week_number',revision:1};await mod.load(s);await settled();assert.equal(w.title,'Week 2');if(process.env.GRAPHIC_PREVIEW_DIR)fs.writeFileSync(process.env.GRAPHIC_PREVIEW_DIR+'/'+kind+'-week-2.png',id(canvasId).backing.toBuffer('image/png'));
 // Delayed responses cannot change a different week.
 let resolve;release=new Promise(r=>resolve=r);id(prefix+'Try').click();await until(()=>w.busy);const layout=JSON.stringify(w.layout);w.end='2026-10-18';resolve({data:{changes:{text_colour:'#221144'},grade_labels:[],explanation:'New colour'}});await settled();assert.equal(JSON.stringify(w.layout),layout);release=null;
 console.log('Passed: '+kind+' direct editing, saved labels, unchanged facts, undo, save recovery, readable-label choices and stale-response guard.');
}
// The team-selection workflow exposes the same editor at every stage, including each day of a split team.
{
 const future='2099-10-17',fixture={id:'fixture',published:{details:{grade,opposition:'Visitors',days:[{date:future},{date:'2099-10-24'}]},players:[],slots:[]}},s={scope:'test:club',view:'graphics',date:future,selected:new Set(['fixture']),data:{brand:{name:'Test Club'},assets:[],fixtures:[fixture],revision:1,design:{layout:'list',font:'bold',primary:'#073554',accent:'#128FD2',header_layout:'separate',theme:'solid',frame:'cutout',marker:'name',header_height:310,photo_scale:100,photo_shift:0}},busy:false};s.design=structuredClone(s.data.design);
 const calls=[],receipts=new Map();let failSave=false,module;const cards=f=>[0,1].map(day=>({f,day,split:true,key:f.id+':'+day}));
 const h={supabase:{functions:{invoke:async(_,request)=>{calls.push(request.body);return {data:{changes:{},grade_labels:[{grade,label:'Dev'}],explanation:'Short label.'}};}}},escape:esc,here:()=>true,date:String,calendar:()=>[{id:'fixture',date:future,published:true}],calendarCompleted:()=>false,completed:()=>false,cards,sample:()=>({card:cards(fixture)[0]}),canLeave:()=>module.canLeave(s),draw:()=>module.render(s),defaults:d=>structuredClone(d.design),asset:()=>null,uploadCard:(_,kind,title,desc,roster,o)=>o.content||'',galleryCard:()=>'',bindUploads:()=>{},bindGallery:()=>{},prepare:()=>{},photoControls:()=>'',oversNotice:()=>'',bindPhotos:()=>{},selection:()=>[fixture],caption:()=>'',posting:()=>{},history:()=>{},message:(_,m)=>s.notice=m,
 renderImage:async(_,card,canvas)=>{canvas.width=1080;canvas.height=1350;canvas.graphicLabelWarnings=[];const ctx=canvas.getContext('2d');ctx.fillStyle='#073554';ctx.fillRect(0,0,1080,1350);ctx.fillStyle='white';ctx.socialFont='"Club Sporting"';const label=graphicGrade(card.f.published.details.grade,s.design);checkGraphicLabel(canvas,ctx,{source:grade,label,width:447,size:108,grade:true});ctx.font='700 80px "Club Sporting"';ctx.fillText(label,40,300);return {};},
 rpc:async(_,action,data)=>{assert.equal(action,'settings');calls.push(structuredClone(data));if(!receipts.has(data.request_id)){assert.equal(data.revision,s.data.revision);s.data.design=structuredClone(data.design);s.data.revision++;receipts.set(data.request_id,true);}if(failSave)throw Error('Response lost');return {saved:true};},refresh:async()=>{s.design=structuredClone(s.data.design);s.dirty=false;return true;},editBackground:async()=>{},save:async()=>true};
 module=createTeamSocialWorkflow(h);module.render(s);const settled=()=>until(()=>!s.busy&&[...document.querySelectorAll('[data-st-ai]')].every(c=>c.dataset.assistantReady==='true'));await settled();
 const facts=JSON.stringify(fixture);id('stAIArtworkBrief').value='Shorten Development League to Dev';id('stAIArtworkBrief').dispatchEvent(new window.Event('input'));id('stAIArtworkTry').click();await settled();assert.equal(s.design.grade_labels[0].label,'Dev');assert.equal(id('stNextPhotos').disabled,true);
 failSave=true;id('stAIArtworkUse').click();await settled();assert.equal(s.teamWorkflow.graphicAssistant.saveUncertain,true);failSave=false;id('stAIArtworkUse').click();await settled();const writes=calls.filter(c=>c.request_id);assert.equal(writes[0].request_id,writes[1].request_id);assert.equal(s.data.revision,2);assert.equal(JSON.stringify(fixture),facts);
 id('stNextPhotos').click();await settled();assert.ok(id('stAIPhotoBrief'));id('stReviewAll').click();await settled();assert.equal(document.querySelectorAll('.graphic-assistant').length,2);assert.ok(id('stAIReview0-0Brief'));assert.ok(id('stAIReview0-1Brief'));id('stAIReview0-0Brief').value='First day request';id('stAIReview0-0Brief').dispatchEvent(new window.Event('input'));module.render(s);await settled();assert.equal(id('stAIReview0-0Brief').value,'First day request');assert.equal(id('stAIReview0-1Brief').value,'');
 console.log('Passed: team-selection assistant at artwork, photo and both-day review; one idempotent save; unchanged published team.');
}

// The new team-background handoff uses the existing image editor and optimistic asset save.
{
 const app=socialSource(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')),source=socialSource.functionSource(app,'socialTeamEditBackground');
 const asset={id:'background',kind:'background',path:'club/background/saved.png',revision:4},s={scope:'user:club',busy:false},requests=[];let handoff,failed=false;
 const c=vm.createContext({File,crypto,socialCanLeave:()=>true,socialHere:()=>true,socialAsset:(_,kind)=>kind==='background'?asset:null,socialMessage:(_,message)=>requests.push(message),
 supabase:{storage:{from:bucket=>({download:async path=>{assert.equal(bucket,'club-socials');assert.equal(path,asset.path);return {data:new Blob(['saved image'],{type:'image/png'})};},upload:async(path,blob,options)=>{assert.match(path,/^club\/background\/[0-9a-f-]+\.png$/);assert.equal(options.upsert,false);return {data:{path}};}})}},socialAwardBackground:(_,file,apply,options)=>{handoff={file,apply,options};},socialSave:async(state,action,data)=>{assert.equal(state.busy,false);requests.push({action,data});return !failed;}});
 vm.runInContext(source,c);await c.socialTeamEditBackground(s,'Move the painted heading lower.');assert.equal(handoff.options.mode,'edit');assert.equal(handoff.options.brief,'Move the painted heading lower.');assert.equal(await handoff.file.text(),'saved image');
 s.busy=true;await handoff.apply({blob:new Blob(['revised image']),name:'Edited.png'});assert.equal(requests[0].action,'save_asset');assert.equal(requests[0].data.asset_id,'background');assert.equal(requests[0].data.revision,4);assert.equal(s.busy,true);
 failed=true;await assert.rejects(()=>handoff.apply({blob:new Blob(['revised image']),name:'Edited.png'}),/save was not confirmed/);assert.equal(s.busy,true);
 console.log('Passed: team artwork brief, saved-background edit, scoped upload, optimistic asset save and failed-save recovery.');
}
