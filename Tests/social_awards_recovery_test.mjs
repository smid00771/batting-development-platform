import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),{createCanvas,GlobalFonts,loadImage}=require('@napi-rs/canvas');
const {createSocialAwards,renderSocialAwardRequests}=await import('../social-awards.js');
const dom=new JSDOM('<main><div id="menu"></div><div id="socialContent"></div></main>',{url:'https://clubbatting.com/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=window.localStorage;globalThis.FormData=window.FormData;window.HTMLElement.prototype.scrollIntoView=()=>{};
const font=fs.readFileSync(new URL('../social-font-fallback.js',import.meta.url),'utf8').match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/)[1];GlobalFonts.register(Buffer.from(font,'base64'),'Club Sporting');
window.HTMLCanvasElement.prototype.getContext=function(){if(!this.backing){this.backing=createCanvas(this.width,this.height);const ctx=this.backing.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(i,...args)=>draw(i.backing||i,...args);}if(this.backing.width!==this.width)this.backing.width=this.width;if(this.backing.height!==this.height)this.backing.height=this.height;return this.backing.getContext('2d');};
window.HTMLCanvasElement.prototype.toBlob=function(cb,type='image/png'){cb(new Blob([this.backing.toBuffer(type)],{type}));};
const players=['Alex Hunter','Ben Senior','Chris Carter'],milestones=players.map((name,i)=>({key:'match:century:innings:'+i,signature:'signature-'+i,kind:'century',player_id:'player-'+i,name,stat:{runs:100+i*27,not_out:i===1},grade:'1st Grade',opposition:'Visitors',innings_number:1}));
const bowler={...milestones[0],key:'match:five_wickets:innings:0',kind:'five_wickets',stat:{wickets:6,runs:24}};
const resultItems=Array.from({length:5},(_,i)=>({key:'match-'+i+':results',signature:'result-'+i,kind:'results',match_id:'match-'+i,grade:(i+1)+'th Grade',our_team:'ours',teams:[{id:'ours',name:'Test Club'},{id:'theirs-'+i,name:'Visitors '+i,organisation_id:'org-'+i}],innings:[{team_id:'ours',runs:250,wickets:6,batters:[{name:'Alex Hunter',runs:127,not_out:true,status:'played',importable:true},{name:'Ben Senior',runs:63,status:'played',importable:true},{name:'Chris Carter',runs:34,status:'played',importable:true}]},{team_id:'theirs-'+i,runs:220,wickets:10,bowlers:[{name:'Alex Hunter',team_id:'ours',wickets:6,runs:24,importable:true},{name:'Ben Senior',team_id:'ours',wickets:3,runs:61,importable:true},{name:'Chris Carter',team_id:'ours',wickets:1,runs:42,importable:true}]}],result:'Test Club won by 30 runs'}));
resultItems[0].teams[1].organisation_id=null;resultItems[1].teams[1].organisation_id=null;
const sharedLogo=createCanvas(40,40);sharedLogo.getContext('2d').fillStyle='#ff0055';sharedLogo.getContext('2d').fillRect(0,0,40,40);const clubLogo=URL.createObjectURL(new Blob([sharedLogo.toBuffer('image/png')],{type:'image/png'}));
const context={settings:{enabled:['team_week','player_week'],revision:0},candidates:[...milestones,bowler,...resultItems],designs:{},photos:[],editions:[],requests:[]},files=new Map(),pending=new Map(),calls=[];let loseFinish=true,review,backgroundHelp;
const api={storage:{from:bucket=>({upload:async(path,data)=>{if(files.has(bucket+path))return {error:{message:'Already uploaded'}};files.set(bucket+path,data);return {data:{path}};},download:async path=>files.has(bucket+path)?{data:files.get(bucket+path)}:{error:{message:'Missing image'}}})},functions:{invoke:async(_,args)=>{const i=Number(args.body.url.match(/match-(\d+)$/)?.[1]);return {data:{teams:[{id:'theirs-'+i,organisation_id:i<2?'same-opposition-club':'org-'+i,logo_url:null}]}};}},rpc:async(_,args)=>{const {p_action:a,p_data:d}=args;calls.push({action:a,data:structuredClone(d)});let data;
 if(a==='context')data=structuredClone(context);
 else if(a==='settings')data=context.settings;
 else if(a==='save_settings'){context.settings={enabled:d.enabled,revision:context.settings.revision+1};data=context.settings;}
 else if(a==='save_design'){context.designs[d.kind]={layout:structuredClone(d.layout),revision:(context.designs[d.kind]?.revision||0)+1};data=context.designs[d.kind];}
 else if(a==='save_photo'){const old=context.photos.find(p=>p.kind===d.kind&&p.player_id===d.player_id),value={kind:d.kind,player_id:d.player_id,photo:structuredClone(d.photo),revision:(old?.revision||0)+1};if(old)Object.assign(old,value);else context.photos.push(value);data=value;}
 else if(a==='reserve_image'){if(!pending.has(d.id))pending.set(d.id,{...d,path:'club/editions/'+d.id+'.png'});const p=pending.get(d.id);data={id:d.id,path:p.path,sealed:context.editions.some(e=>e.id===d.id)};}
 else if(a==='finish_image'){const p=pending.get(d.id);assert.ok(files.has('club-social-awards'+p.path));if(!context.editions.some(e=>e.id===d.id))context.editions.push({id:d.id,kind:p.kind,week_end:p.week_end,label:p.label,bucket:'club-social-awards',image_path:p.path,image_sha:p.sha256,performance_keys:p.sources.map(x=>x.key),sources:structuredClone(p.sources)});if(loseFinish){loseFinish=false;return {error:{message:'Simulated lost confirmation'}};}data={saved:true};}
 else if(a==='request'){if(!context.requests.some(r=>r.id===d.id))context.requests.push({...d,status:'requested',reply:'',revision:1,updated_at:'2026-10-15T09:00:00Z'});data={saved:true};}
 else if(a==='admin_context')data={requests:context.requests.map(r=>({...r,club_name:'Test Club'}))};
 else if(a==='admin_update'){const r=context.requests.find(r=>r.id===d.id);assert.equal(d.revision,r.revision);Object.assign(r,{status:d.status,reply:d.reply,revision:r.revision+1,updated_at:'2026-10-15T10:00:00Z'});data={revision:r.revision};}
 else throw Error('Unexpected action '+a);return {data};}};
const s={scope:'user:club',view:'awards',data:{brand:{name:'Test Club',logo:clubLogo},awards:context.settings,timezone:'Australia/Sydney'},design:{primary:'#073554',accent:'#128fd2'},urls:new Map()};
let module;const h={supabase:api,here:x=>x===s,escape:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),draw:()=>{document.getElementById('menu').innerHTML=module.menu(s);module.bindMenu(s);module.render(s);},message:(_,text)=>s.notice=text,canLeave:()=>module.canLeave(s),image:async(_,url)=>loadImage(Buffer.from(await (await fetch(url)).arrayBuffer())),fontReady:async()=>{},text:(ctx,text,x,y,width,size)=>{ctx.font=`700 ${size}px "Club Sporting"`;while(ctx.measureText(String(text)).width>width&&size>10)ctx.font=`700 ${--size}px "Club Sporting"`;ctx.fillText(String(text),x,y);},download:()=>{},savedPhotos:()=>[],reviewAwards:(_,items,caption)=>review={items,caption},openScores:()=>{},openBackground:(_,file,apply,options)=>backgroundHelp={file,apply,options},openCutout:()=>{s.cutoutOpened=true;}};
module=createSocialAwards(h);module.state(s).end='2026-10-11';
const tick=()=>new Promise(r=>setTimeout(r,5)),until=async pred=>{for(let i=0;i<1000;i++){if(pred())return;await tick();}throw Error('Timed out: '+document.getElementById('saStatus')?.textContent);},id=x=>document.getElementById(x),settled=()=>until(()=>!s.awards.busy&&!s.awards.loading&&(['awards','award_collection'].includes(s.view)||s.awards.previewReady));

// A correction after confirmation must not leave the old image ready to post.
context.settings.enabled.push('century','results','five_wickets');s.view='century';loseFinish=false;
h.draw();await settled();id('saConfirmGraphic').click();await settled();
assert.equal(context.editions.length,1);const edition=context.editions[0];assert.ok(s.awards.selected.has(edition.id));
context.candidates[0].stat.runs=104;context.candidates[0].signature='corrected-signature';
id('saReload').click();await settled();
assert.equal(s.awards.selected.has(edition.id),false,'A stale edition is deselected on reload');
assert.ok(document.querySelector(`[data-sa-edit="${milestones[0].key}"]`),'The corrected performance returns to Needs creation');
assert.ok(document.querySelector(`[data-sa-select="${edition.id}"]`).disabled);
assert.match(document.querySelector('.sa-card').textContent,/Scores changed—review needed/);
assert.ok(document.querySelector(`[data-sa-download="${edition.id}"]`),'Old image remains downloadable');
s.awards.selected.add(edition.id);id('saReviewPost').onclick();assert.equal(review,undefined,'Review rechecks stale selected IDs');assert.equal(s.awards.selected.has(edition.id),false);
document.querySelector(`[data-sa-updated="${edition.id}"]`).click();await settled();assert.equal(s.awards.focus,milestones[0].key);assert.match(id('saStatus').textContent,/updated figures/);
id('saConfirmGraphic').click();await settled();const replacement=context.editions.at(-1);assert.match(replacement.label,/104/);assert.ok(s.awards.selected.has(replacement.id));
// A performance which no longer qualifies is retained for history, not offered as current.
context.candidates=context.candidates.filter(x=>x.key!==milestones[0].key);id('saReload').click();await settled();
document.querySelector(`[data-sa-updated="${replacement.id}"]`).click();await settled();assert.match(id('saStatus').textContent,/no longer qualifies/);assert.equal(s.awards.selected.has(replacement.id),false);
// Explicit server invalidation also blocks awards without client-side source detail.
context.editions.push({id:'stale-weekly',kind:'team_week',week_end:s.awards.end,label:'Old weekly award',image_path:'missing.png',scores_current:false,performance_keys:[],sources:[]});
await module.load(s);await settled();assert.ok(document.querySelector('[data-sa-select="stale-weekly"]').disabled);
// Legacy responses without scores_current or sources remain usable.
context.editions.push({id:'legacy',kind:'results',week_end:s.awards.end,label:'Legacy graphic',image_path:'missing.png',performance_keys:[]});
await module.load(s);await settled();assert.equal(document.querySelector('[data-sa-select="legacy"]').disabled,false);

// A failed reload must retain the draft and its protection until a successful replacement.
s.view='results';h.draw();await settled();
const title=document.querySelector('[data-sa-layout="title_y"]');title.value=25;title.dispatchEvent(new window.Event('input'));await settled();assert.equal(s.awards.designDirty.results,true);
const oldRpc=api.rpc;let failRead=true;api.rpc=async(...args)=>failRead&&args[1].p_action==='context'?{error:{message:'Test network read failed'}}:oldRpc(...args);
id('saResetLayout').click();await settled();
assert.equal(s.awards.designDirty.results,true);assert.equal(s.awards.layouts.results.title_y,25);assert.equal(id('saSaveLayout').textContent,'Save layout');assert.equal(id('saSaveLayout').disabled,false);assert.match(id('saStatus').textContent,/Could not reload.*changes are still here/);assert.equal(module.canLeave(s),false);
failRead=false;id('saResetLayout').click();await settled();assert.equal(s.awards.layouts.results.title_y,9);assert.equal(s.awards.designDirty.results,false);assert.match(id('saStatus').textContent,/Saved layout reloaded/);

// Photo position recovery follows the same success/failure contract.
s.view='century';h.draw();await settled();const selectedPlayer=context.candidates.find(c=>c.kind==='century');
const photo=createCanvas(40,40);photo.getContext('2d').fillRect(0,0,40,40);const file=new File([photo.toBuffer('image/png')],'Player.png',{type:'image/png'});
Object.defineProperty(id('saPhotoFile'),'files',{value:[file]});id('saPhotoFile').dispatchEvent(new window.Event('change'));await settled();
id('saMovePhoto').click();await settled();const position=document.querySelector('[data-sa-photo="x"]');position.value=74;position.dispatchEvent(new window.Event('input'));await settled();const photoKey='century:'+selectedPlayer.player_id;
failRead=true;id('saResetPosition').click();await settled();assert.equal(s.awards.drafts[photoKey].photo.x,74);assert.equal(s.awards.drafts[photoKey].dirty,true);assert.ok(id('saConfirmPosition'));assert.match(id('saStatus').textContent,/Could not reload the photo position/);
failRead=false;id('saResetPosition').click();await settled();assert.equal(s.awards.drafts[photoKey].photo.x,50);assert.equal(s.awards.drafts[photoKey].dirty,false);assert.equal(id('saConfirmPosition'),null);
api.rpc=oldRpc;

// Unsent request text, uploads and choices survive a page-state restart.
s.view='awards';h.draw();await settled();let form=id('saRequest');form.elements.name.value='Spirit award';form.elements.criteria.value='Nominated by captains';form.elements.artwork_notes.value='Use the attached club background.';form.dispatchEvent(new window.Event('input'));
Object.defineProperty(id('saRequestFiles'),'files',{value:[file]});id('saRequestFiles').dispatchEvent(new window.Event('change'));await settled();const savedArtwork=s.awards.request.files[0].path;
document.querySelector('[data-sa-choice="five_wickets"]').click();assert.ok(module.hasChanges(s));assert.equal(module.canLeave(s),false,'Unsaved award choices need the visible Save choices action');
const uploadsBefore=files.size;delete s.awards;h.draw();await settled();
assert.equal(id('saRequest').elements.name.value,'Spirit award');assert.equal(s.awards.request.files[0].path,savedArtwork);assert.equal(document.querySelector('[data-sa-choice="five_wickets"]').checked,false);assert.equal(id('saSaveChoices').disabled,false);assert.equal(files.size,uploadsBefore,'Previously uploaded artwork is reused');
id('saSaveChoices').click();await settled();assert.equal(module.canLeave(s),true,'Persisted request may be resumed after leaving');assert.ok(module.hasChanges(s),'Unsent request participates in unload recovery protection');
// A lost submit response retains the same id across restart, avoiding duplicate requests.
let loseRequest=true;api.rpc=async(...args)=>{const result=await oldRpc(...args);if(args[1].p_action==='request'&&loseRequest){loseRequest=false;return {error:{message:'Request confirmation interrupted'}};}return result;};
id('saRequest').dispatchEvent(new window.Event('submit',{cancelable:true}));await settled();const retryId=s.awards.request.id;assert.ok(retryId);assert.equal(context.requests.length,1);assert.match(id('saStatus').textContent,/interrupted/);
delete s.awards;h.draw();await settled();assert.equal(s.awards.request.id,retryId);assert.equal(s.awards.request.files[0].path,savedArtwork);
form=id('saRequest');form.dispatchEvent(new window.Event('input'));assert.equal(s.awards.request.id,retryId,'Unchanged inputs do not invalidate the retry identity');form.dispatchEvent(new window.Event('submit',{cancelable:true}));await settled();assert.equal(context.requests.length,1);assert.equal(s.awards.request.name,'');assert.equal(s.awards.request.files.length,0);assert.equal(module.hasChanges(s),false);
delete s.awards;h.draw();await settled();assert.equal(s.awards.request.name,'','Confirmed submission clears the persisted draft');assert.equal(s.awards.request.id,undefined);
// Drafts stay scoped to this user and club.
const other={...s,scope:'another-user:club',awards:undefined};assert.equal(module.state(other).request.name,'');
console.log('Passed: corrected/withdrawn performance recovery, stale review blocking, legacy compatibility, failed layout/photo reload recovery, award draft persistence, uploaded artwork reuse and idempotent request retry.');
