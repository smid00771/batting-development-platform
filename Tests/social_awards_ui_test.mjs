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
const api={storage:{from:bucket=>({upload:async(path,data)=>{if(files.has(bucket+path))return {error:{message:'Already uploaded'}};files.set(bucket+path,data);return {data:{path}};},download:async path=>files.has(bucket+path)?{data:files.get(bucket+path)}:{error:{message:'Missing image'}}})},functions:{invoke:async(name,args)=>{if(name==='club-social-style'){assert.ok(args.body.example_setup||args.body.reference_review);return {data:{changes:{font:'sporting',result_labels:'won_lost'},badges:[],explanation:'Matched example style.',artwork_brief:null}};}const i=Number(args.body.url.match(/match-(\d+)$/)?.[1]);return {data:{teams:[{id:'theirs-'+i,organisation_id:i<2?'same-opposition-club':'org-'+i,logo_url:null}]}};}},rpc:async(_,args)=>{const {p_action:a,p_data:d}=args;calls.push({action:a,data:structuredClone(d)});let data;
 if(a==='context')data=structuredClone(context);
 else if(a==='settings')data=context.settings;
 else if(a==='save_settings'){context.settings={enabled:d.enabled,revision:context.settings.revision+1};data=context.settings;}
 else if(a==='save_design'){context.designs[d.kind]={layout:structuredClone(d.layout),revision:(context.designs[d.kind]?.revision||0)+1};data=context.designs[d.kind];}
 else if(a==='save_photo'){const old=context.photos.find(p=>p.kind===d.kind&&p.player_id===d.player_id),value={kind:d.kind,player_id:d.player_id,photo:structuredClone(d.photo),revision:(old?.revision||0)+1};if(old)Object.assign(old,value);else context.photos.push(value);data=value;}
 else if(a==='reserve_image'){if(!pending.has(d.id))pending.set(d.id,{...d,path:'club/editions/'+d.id+'.png'});const p=pending.get(d.id);data={id:d.id,path:p.path,sealed:context.editions.some(e=>e.id===d.id)};}
 else if(a==='finish_image'){const p=pending.get(d.id);assert.ok(files.has('club-social-awards'+p.path));if(!context.editions.some(e=>e.id===d.id))context.editions.push({id:d.id,kind:p.kind,week_end:p.week_end,label:p.label,bucket:'club-social-awards',image_path:p.path,image_sha:p.sha256,performance_keys:p.sources.map(x=>x.key)});if(loseFinish){loseFinish=false;return {error:{message:'Simulated lost confirmation'}};}data={saved:true};}
 else if(a==='request'){context.requests.push({...d,status:'requested',reply:'',revision:1,updated_at:'2026-10-15T09:00:00Z'});data={saved:true};}
 else if(a==='admin_context')data={requests:context.requests.map(r=>({...r,club_name:'Test Club'}))};
 else if(a==='admin_update'){const r=context.requests.find(r=>r.id===d.id);assert.equal(d.revision,r.revision);Object.assign(r,{status:d.status,reply:d.reply,revision:r.revision+1,updated_at:'2026-10-15T10:00:00Z'});data={revision:r.revision};}
 else throw Error('Unexpected action '+a);return {data};}};
const s={scope:'user:club',view:'awards',data:{brand:{name:'Test Club',logo:clubLogo},awards:context.settings,timezone:'Australia/Sydney'},design:{primary:'#073554',accent:'#128fd2'},urls:new Map()};
let module;const h={supabase:api,here:x=>x===s,escape:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),draw:()=>{document.getElementById('menu').innerHTML=module.menu(s);module.bindMenu(s);module.render(s);},message:(_,text)=>s.notice=text,canLeave:()=>module.canLeave(s),image:async(_,url)=>loadImage(Buffer.from(await (await fetch(url)).arrayBuffer())),fontReady:async()=>{},text:(ctx,text,x,y,width,size)=>{ctx.font=`700 ${size}px "Club Sporting"`;while(ctx.measureText(String(text)).width>width&&size>10)ctx.font=`700 ${--size}px "Club Sporting"`;ctx.fillText(String(text),x,y);},download:()=>{},savedPhotos:()=>[],reviewAwards:(_,items,caption)=>review={items,caption},openScores:()=>{},openBackground:(_,file,apply,options)=>backgroundHelp={file,apply,options},openCutout:()=>{s.cutoutOpened=true;}};
module=createSocialAwards(h);module.state(s).end='2026-10-11';
const tick=()=>new Promise(r=>setTimeout(r,5)),until=async pred=>{for(let i=0;i<1000;i++){if(pred())return;await tick();}throw Error('Timed out: '+document.getElementById('saStatus')?.textContent);},id=x=>document.getElementById(x),settled=()=>until(()=>!s.awards.busy&&!s.awards.loading&&(['awards','award_collection'].includes(s.view)||s.awards.previewReady));
h.draw();await settled();assert.equal(document.querySelector('#socialContent h3').textContent,'Awards your club uses');assert.equal(id('saRequest').closest('details'),null);for(const name of ['saEnd','saImport','saCaption','saReviewPost','saPostingHistory'])assert.equal(id(name),null,'Settings excludes creation controls: '+name);
for(const key of ['century','five_wickets','results'])document.querySelector(`[data-sa-choice="${key}"]`).click();id('saSaveChoices').click();await settled();assert.equal(id('socialCreateMenu').options.length,7);
id('socialCreateMenu').value='century';id('socialCreateMenu').dispatchEvent(new window.Event('change'));await settled();assert.equal(document.querySelectorAll('[data-sa-edit]').length,3);
assert.ok(id('saPostPreview'));assert.equal(id('saPostPreview').tagName,'SECTION');assert.match(id('saPostHeading').textContent,/Post preview · 0 images/);assert.equal(id('saCaption').closest('details'),null);assert.ok(id('saPostPreview').contains(id('saCaption')));assert.match(id('saCaption').closest('label').textContent,/Club blurb/);assert.equal(document.querySelector('img[alt="Saved club logo"]').src,clubLogo);assert.equal(document.querySelector('[data-sa-check=show_logo]').checked,true);s.awards.message='';h.draw();await settled();assert.equal(window.getComputedStyle(id('saStatus')).display,'none');
const photo=createCanvas(320,400);photo.getContext('2d').fillStyle='#87c677';photo.getContext('2d').fillRect(0,0,320,400);const file=new File([photo.toBuffer('image/png')],'Alex <cutout>.png',{type:'image/png'});
const input=id('saPhotoFile');Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new window.Event('change'));await settled();assert.ok(s.awards.context.photos[0].photo.path);assert.equal(document.querySelector('cutout'),null);
id('saMovePhoto').click();await settled();const range=document.querySelector('[data-sa-photo="x"]');range.value=74;range.dispatchEvent(new window.Event('input'));await settled();assert.equal(id('saConfirmGraphic').disabled,true);assert.equal(module.canLeave(s),false);
id('saConfirmPosition').click();await settled();assert.equal(id('saConfirmPosition'),null);assert.equal(s.awards.context.photos[0].photo.x,74);
if(process.env.AWARDS_PREVIEW_DIR){fs.mkdirSync(process.env.AWARDS_PREVIEW_DIR,{recursive:true});fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/century.png',id('saCanvas').backing.toBuffer('image/png'));}
id('saConfirmGraphic').click();await settled();assert.ok(s.awards.pending);assert.equal(context.editions.length,1);assert.match(id('saCreateStatus').textContent,/lost confirmation/);assert.equal(module.canLeave(s),false);const rid=s.awards.pending[0].request.id;
id('saRetrySave').click();await settled();assert.equal(s.awards.pending,null);assert.equal(context.editions.length,1);assert.equal(document.querySelectorAll('[data-sa-edit]').length,2);assert.ok(s.awards.selected.has(rid));assert.ok(calls.filter(c=>c.action==='reserve_image').every(c=>c.data.id===rid));
id('saConfirmGraphic').click();await settled();assert.equal(context.editions.length,2);assert.equal(document.querySelectorAll('[data-sa-edit]').length,1);assert.equal(context.photos.length,1,'One player’s photo does not leak to another');
id('socialCreateMenu').value='five_wickets';id('socialCreateMenu').dispatchEvent(new window.Event('change'));await settled();id('saConfirmGraphic').click();await settled();assert.equal(context.editions.length,3);
id('saCaption').value='An outstanding round: two centuries and a six-wicket haul.';id('saCaption').dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('.sa-post-images img').length,3);assert.ok(id('saCaption').compareDocumentPosition(document.querySelector('.sa-post-images'))&window.Node.DOCUMENT_POSITION_FOLLOWING);id('saReviewPost').click();assert.equal(review.items.length,3);assert.equal(review.caption,id('saCaption').value);assert.equal(new Set(review.items.map(i=>i.kind)).size,2);
id('socialCreateMenu').value='results';id('socialCreateMenu').dispatchEvent(new window.Event('change'));await settled();await until(()=>document.querySelectorAll('[data-sa-opponent]').length===4);assert.ok(document.querySelector('[data-sa-opponent="same-opposition-club"]'),'Grade teams share one opposition logo control');
const opponentBadge=createCanvas(80,80);opponentBadge.getContext('2d').fillStyle='#ffe000';opponentBadge.getContext('2d').fillRect(0,0,80,80);
const opponentFile=new File([opponentBadge.toBuffer('image/png')],'Opposition logo.png',{type:'image/png'}),opponentInput=id('saOpponent-same-opposition-club');
Object.defineProperty(opponentInput,'files',{value:[opponentFile]});opponentInput.dispatchEvent(new window.Event('change'));await settled();
for(const e of [...document.querySelectorAll('[data-sa-result]')].slice(0,2))e.click();await settled();assert.equal(id('saHeaderLogos').hidden,false);
assert.equal(document.querySelector('select[data-sa-outcome]'),null,'Outcome is supplied by PlayCricket');
const selectedResult=s.awards.context.candidates.find(x=>x.key===resultItems[0].key),originalResult=selectedResult.result;
selectedResult.result='Awaiting result';h.draw();await settled();assert.equal(id('saConfirmGraphic').disabled,true);assert.match(id('saPreviewStatus').textContent,/PlayCricket result needs checking/);
const beforeUnknown=context.editions.length;id('saConfirmGraphic').click();await settled();assert.equal(context.editions.length,beforeUnknown);
selectedResult.result=originalResult;h.draw();await settled();assert.equal(id('saConfirmGraphic').disabled,false);
const pixels=id('saCanvas').backing.getContext('2d').getImageData(0,0,id('saCanvas').width,id('saCanvas').height).data;
let clubPixels=0,opponentPixels=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]===255&&pixels[i+1]===0&&pixels[i+2]===85)clubPixels++;if(pixels[i]===255&&pixels[i+1]===224&&pixels[i+2]===0)opponentPixels++;}
assert.ok(clubPixels>1000&&opponentPixels>1000,'Saved club logo and uploaded opposition logo both appear in the preview');
if(process.env.AWARDS_PREVIEW_DIR)fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/results-saved-logos.png',id('saCanvas').backing.toBuffer('image/png'));
for(const e of document.querySelectorAll('[data-sa-result]:not(:checked)'))e.click();await settled();assert.equal(id('saHeaderLogos').hidden,true);assert.match(id('saPreviewStatus').textContent,/2 Results images/);
if(process.env.AWARDS_PREVIEW_DIR)fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/results.png',id('saCanvas').backing.toBuffer('image/png'));
id('saConfirmGraphic').click();await settled();assert.equal(context.editions.filter(e=>e.kind==='results').length,2);assert.equal(context.editions.find(e=>e.kind==='results').performance_keys.length,4);
id('socialCreateMenu').value='award_collection';id('socialCreateMenu').dispatchEvent(new window.Event('change'));await settled();assert.equal(id('saRequest'),null);assert.equal(document.querySelectorAll('[data-sa-select]').length,5);assert.match(id('saCaption').value,/outstanding round/);s.view='awards';h.draw();await settled();const form=id('saRequest');form.elements.name.value='Spirit of cricket';form.elements.criteria.value='Chosen by the club for sportsmanship.';form.dispatchEvent(new window.Event('input'));form.dispatchEvent(new window.Event('submit',{cancelable:true}));await settled();assert.equal(context.requests.length,1);assert.match(id('saStatus').textContent,/submitted/);
assert.ok(id('saRequestUpdates'));assert.equal(id('saRequestUpdates').closest('details'),null);assert.match(id('saRequestUpdates').textContent,/Submitted/);assert.equal(id('saRequestUpdates').querySelector('select'),null,'Club cannot change the owner’s response');
const owner=document.createElement('div');document.body.append(owner);
await renderSocialAwardRequests({supabase:api,escape:h.escape},owner);
assert.deepEqual([...owner.querySelector('select').options].map(o=>o.textContent),['Submitted','Will do','Not right now','Completed']);
const response=owner.querySelector('form');
for(const [status,label,reply] of [['in_progress','Will do','We will add this award.'],['closed','Not right now','Please send a clearer example.'],['ready','Completed','Choose Spirit of cricket from Create posts.']]){
 response.elements.status.value=status;response.elements.reply.value=reply;response.dispatchEvent(new window.Event('input'));response.dispatchEvent(new window.Event('submit',{cancelable:true}));await until(()=>owner.querySelector('[role=status]').textContent.includes('Update saved')&&context.requests[0].status===status);
 id('saRefreshRequests').click();await settled();assert.match(id('saRequestUpdates').textContent,new RegExp(label));assert.ok(id('saRequestUpdates').textContent.includes(reply));assert.match(id('saRequestUpdates').textContent,/Updated/);
}
owner.remove();
// A refreshed collection must not silently select a replacement for an older revision.
context.editions.push({id:'latest-team',kind:'team_week',week_end:'2026-10-11',label:'Latest Team of the Week',bucket:'club-team-week',image_path:'latest.png',performance_keys:[]});
s.awards.selected.add('old-team-version');await module.load(s,false);assert.equal(s.awards.selected.has('old-team-version'),false);assert.equal(s.awards.selected.has('latest-team'),false);assert.equal(s.awards.selected.size,5,'All individual milestones and Results batches retain their selection');
assert.match(s.awards.message,/Select the current version/);
for(const kind of ['results','century','five_wickets']){
 s.view=kind;h.draw();await settled();const help=id('saPrepareBackground');assert.equal(help.closest('.sa-asset').querySelector('strong').textContent,'Background');help.click();await until(()=>!!backgroundHelp);
 await backgroundHelp.apply({blob:file,name:'Prepared background.png'});backgroundHelp=null;h.draw();await settled();assert.ok(context.designs[kind].layout.background_path);assert.equal(context.designs[kind].layout.background_name,'Prepared background.png');
}
// Editing a saved background starts there; restarting from an example is explicit.
s.view='results';const layout=s.awards.layouts.results;const examplePath='club/artwork/previous-example.png';files.set('club-social-awards'+examplePath,opponentFile);layout.example_path=examplePath;layout.example_name='Old result.png';h.draw();await settled();
id('saPrepareBackground').click();await until(()=>!!backgroundHelp);assert.equal(backgroundHelp.options.mode,'edit');assert.deepEqual(Buffer.from(await backgroundHelp.file.arrayBuffer()),Buffer.from(await files.get('club-social-awards'+layout.background_path).arrayBuffer()));backgroundHelp=null;
id('saPrepareExample').click();await until(()=>!!backgroundHelp);assert.equal(backgroundHelp.options.mode,'template');assert.equal(backgroundHelp.file.name,'Old result.png');assert.deepEqual(Buffer.from(await backgroundHelp.file.arrayBuffer()),Buffer.from(await opponentFile.arrayBuffer()));
// Existing PlayHQ cards must use their saved snapshot, never a fabricated
// PlayCricket URL. Exercise the real screen and canvas, including retry/override.
const savedFetch=globalThis.fetch,logoCalls=[],autoUrl='https://res.cloudinary.com/playhq/image/upload/v1/fixture-test.png';let failLogo=true;
context.candidates=structuredClone(resultItems.slice(0,2));context.designs={};context.editions=[];
for(const [i,item] of context.candidates.entries()){item.snapshot_id='snapshot-'+i;item.teams[1].source_team_id='source-'+i;item.teams[1].organisation_id=null;item.teams[1].name='Visitors';}
api.functions.invoke=async(name,{body})=>{assert.equal(name,'playhq-sync');assert.equal(body.action,'logos');assert.equal(body.url,undefined);logoCalls.push(body.snapshot_id);const i=Number(body.snapshot_id.split('-')[1]);return failLogo?{error:{message:'Temporary failure'}}:{data:{teams:[{id:'theirs-'+i,organisation_id:'verified-visitors',logo_url:autoUrl},{id:'unrelated-team',logo_url:autoUrl}]}};};
globalThis.fetch=async(url,options)=>String(url)===autoUrl?new Response(opponentBadge.toBuffer('image/png'),{headers:{'content-type':'image/png'}}):savedFetch(url,options);
try{
 s.awards=null;s.urls=new Map();s.view='results';module.state(s).end='2026-10-11';h.draw();await settled();await until(()=>s.awards.logoErrors['theirs-0']);
 assert.equal(logoCalls.length,2);assert.match(document.querySelector('.sa-artwork').textContent,/Logo unavailable/);
 failLogo=false;await module.load(s);await settled();await until(()=>s.awards.logos['theirs-0']);
 assert.equal(logoCalls.length,4);assert.equal(s.awards.logos['unrelated-team'],undefined);assert.equal(s.awards.logoErrors['theirs-0'],undefined);
 assert.equal(document.querySelectorAll('[data-sa-opponent]').length,1);assert.match(document.querySelector('.sa-artwork').textContent,/From PlayHQ/);
 for(const e of document.querySelectorAll('[data-sa-result]'))e.click();await settled();
 const countYellow=()=>{const p=id('saCanvas').backing.getContext('2d').getImageData(0,0,id('saCanvas').width,id('saCanvas').height).data;let count=0;for(let i=0;i<p.length;i+=4)if(p[i]===255&&p[i+1]===224&&p[i+2]===0)count++;return count;};
 assert.ok(countYellow()>1000,'Fetched opposition logo is included in the exported canvas');
 if(process.env.AWARDS_PREVIEW_DIR)fs.writeFileSync(process.env.AWARDS_PREVIEW_DIR+'/results-automatic-logos.png',id('saCanvas').backing.toBuffer('image/png'));
 const overridePath='club/artwork/logo-override.png';files.set('club-social-awards'+overridePath,new Blob([sharedLogo.toBuffer('image/png')],{type:'image/png'}));
 s.awards.layouts.results.opponent_logos={'verified-visitors':{path:overridePath,name:'Chosen club badge'}};h.draw();await settled();
 assert.equal(countYellow(),0,'Saved manual override takes precedence');assert.match(document.querySelector('.sa-artwork').textContent,/Chosen club badge/);
}finally{globalThis.fetch=savedFetch;}
console.log('Passed: awards UI, save recovery, Results batches, automatic PlayHQ logos, failed-lookup retry, source isolation and uploaded logo priority.');
