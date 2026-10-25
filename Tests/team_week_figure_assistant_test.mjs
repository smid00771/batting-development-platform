import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createTeamOfWeek,teamWeekDraft} from '../team-of-week.js';
import {createTeamWeekDemo} from '../team-of-week-demo.js';
import {refineAward} from '../Functions/club-social-style/award-refine.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),{createCanvas,GlobalFonts}=require('@napi-rs/canvas');

test('Dominic’s exact request previews both figures, supports undo and saves the approved display without changing facts',async t=>{
 const dom=new JSDOM('<main id="socialContent"></main>',{url:'https://example.invalid/'});t.after(()=>dom.window.close());
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,CSS:{escape:x=>x}});window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
 const font=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/)[1];GlobalFonts.register(Buffer.from(font,'base64'),'Club Sporting');
 const drawn=[];
 window.HTMLCanvasElement.prototype.getContext=function(){if(!this.backing){this.backing=createCanvas(this.width,this.height);const ctx=this.backing.getContext('2d'),draw=ctx.drawImage.bind(ctx),fill=ctx.fillText.bind(ctx);ctx.drawImage=(img,...args)=>draw(img.backing||img,...args);ctx.fillText=(value,...args)=>{drawn.push(String(value));fill(value,...args);};}if(this.backing.width!==this.width)this.backing.width=this.width;if(this.backing.height!==this.height)this.backing.height=this.height;return this.backing.getContext('2d');};
 window.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new Blob([this.backing.toBuffer('image/png')],{type:'image/png'}));};
 const club='11111111-1111-4111-8111-111111111111',end='2026-10-11',seed=createTeamWeekDemo(()=> 'Test Club'),source=(await seed.rpc('team_of_week_api',{p_action:'context',p_data:{week_end:end}})).data;
 const dominic=source.candidates[4];Object.assign(dominic,{name:'Dominic Wood',grade:'Dev League Sky',runs:47,wickets:2,conceded:8,batting:[{runs:47}],bowling:[{wickets:2,runs:8}]});
 const api=createTeamWeekDemo(()=> 'Test Club',()=>structuredClone(source)),rpc=api.rpc.bind(api),calls=[],modelCalls=[];let responseOverride=null,held=null;
 api.rpc=async(name,args)=>{calls.push(structuredClone(args));return rpc(name,args);};
 const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 const fetcher=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return json({id:'test-user'});
  const body=JSON.parse(options.body);
  if(body.p_action==='access')return json({allowed:true});
  if(body.p_action==='context')return json((await rpc('team_of_week_api',body)).data);
  if(body.p_action==='style_request')return json({brand:{name:'Test Club'}});
  assert.equal(url,'https://api.openai.com/v1/responses');modelCalls.push(body);
  return json({status:'completed',output_text:JSON.stringify(responseOverride||{changes:{},grade_labels:[],graphic_label:null,player_displays:[{key:dominic.key,display:'both'}],explanation:'Show Dominic’s recorded batting and bowling figures.',artwork_brief:null})});
 };
 api.functions={invoke:async(_,request)=>{calls.push(structuredClone(request.body));if(held)return held;const result=await refineAward(request.body,{url:'https://test.supabase.co',anon:'test-public-key',key:'mock-provider-key',model:'mock-model',authorization:'Bearer test-user-token',fetcher});return result.status===200?{data:result.body}:{data:result.body,error:{message:result.body.error}};}};
 const s={scope:'test:'+club,view:'team_week',data:{brand:{name:'Test Club'},timezone:'Australia/Sydney'},design:{primary:'#073554',accent:'#128fd2'},urls:new Map()};
 const mod=createTeamOfWeek({supabase:api,sharedResults:true,here:x=>x===s,escape:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),extractUrl:x=>x[0],fontReady:async()=>{},image:async()=>null,text:(ctx,value,x,y,width,size)=>{ctx.font=`700 ${size}px ${ctx.socialFont}`;while(ctx.measureText(String(value)).width>width&&size>12)ctx.font=`700 ${--size}px ${ctx.socialFont}`;ctx.fillText(String(value),x,y);}}),w=mod.state(s),id=x=>document.getElementById(x);
 const until=async fn=>{for(let i=0;i<600;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+id('twAIStatus')?.textContent);},settled=()=>until(()=>w.context&&!w.busy&&w.previewReady),pixels=()=>id('twCanvas').backing.toBuffer('image/png');
 w.end=end;mod.render(s);await settled();w.rows=teamWeekDraft(w.context.candidates,w.context.cards);assert.equal(w.rows.length,11);assert.ok(w.rows.some(p=>p.key===dominic.key));
 w.rows.find(p=>p.key===dominic.key).display='batting';mod.render(s);await settled();
 const facts=JSON.stringify(w.context.candidates),order=w.rows.map(p=>p.key),before=pixels(),layout=JSON.stringify(w.layout);
 const preview=async()=>{id('twAIBrief').value="Show Dominic Wood's bowling figures also";id('twAIBrief').dispatchEvent(new window.Event('input'));drawn.length=0;id('twAITry').click();await settled();};
 await preview();assert.equal(w.rows.find(p=>p.key===dominic.key).display,'both');assert.ok(drawn.includes('47 & 2/8'));assert.notDeepEqual(pixels(),before);
 assert.deepEqual(w.rows.map(p=>p.key),order);assert.equal(JSON.stringify(w.context.candidates),facts);assert.equal(JSON.stringify(w.layout),layout);
 assert.equal(w.graphicAssistant.candidate,true);assert.equal(id('twSave').disabled,true);assert.equal(mod.canLeave(s),false);assert.ok(!calls.some(c=>c.p_action==='save_design'||c.p_action==='reserve_image'));
 const request=calls.find(c=>c.purpose==='graphic_refine');assert.deepEqual(request.preview_players,w.rows.map(p=>({key:p.key,display:p.key===dominic.key?'batting':p.display})));
 assert.ok(request.preview.startsWith('data:image/png;base64,'));assert.equal(modelCalls.length,1);
 if(process.env.GRAPHIC_PREVIEW_DIR){fs.mkdirSync(process.env.GRAPHIC_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.GRAPHIC_PREVIEW_DIR+'/dominic-both.png',pixels());}
 id('twAIUndo').click();await settled();assert.equal(w.rows.find(p=>p.key===dominic.key).display,'batting');assert.deepEqual(pixels(),before);assert.equal(w.graphicAssistant.candidate,false);
 // Reject a fabricated provider field without applying any part of the proposal.
 responseOverride={changes:{text_colour:'#FFEEDD'},player_displays:[{key:dominic.key,display:'both',wickets:5}]};await preview();assert.equal(w.rows.find(p=>p.key===dominic.key).display,'batting');assert.deepEqual(pixels(),before);assert.equal(w.graphicAssistant.candidate,false);responseOverride=null;
 await preview();id('twAIUse').click();await settled();assert.equal(w.graphicAssistant.candidate,false);assert.equal(id('twSave').disabled,false);assert.ok(!calls.some(c=>c.p_action==='save_design'));
 id('twSave').click();await settled();const saved=calls.find(c=>c.p_action==='reserve_image');assert.ok(saved);assert.equal(saved.p_data.rows.find(p=>p.key===dominic.key).display,'both');assert.deepEqual(saved.p_data.rows.map(p=>p.key),order);assert.equal(JSON.stringify(w.context.candidates),facts);
 assert.ok(calls.some(c=>c.p_action==='finish_image'));assert.equal(w.context.history.length,1);
 // A reply for a stale selection cannot modify the next preview.
 let release;held=new Promise(resolve=>release=resolve);id('twAITry').click();await until(()=>w.busy);w.rows[0].display=w.rows[0].display==='batting'?'bowling':'batting';const changed=JSON.stringify(w.rows);
 release({data:{changes:{},player_displays:[{key:dominic.key,display:'batting'}]}});await settled();assert.equal(JSON.stringify(w.rows),changed);
});
