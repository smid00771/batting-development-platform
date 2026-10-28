import socialSource from './helpers/social-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),{createCanvas,GlobalFonts,loadImage}=require('@napi-rs/canvas');
const {createTeamOfWeek}=await import('../team-of-week.js');
const {createTeamWeekDemo}=await import('../team-of-week-demo.js');
const dom=new JSDOM('<main id="socialContent"></main>',{url:'https://clubbatting.com/'});globalThis.window=dom.window;globalThis.document=dom.window.document;window.scrollTo=()=>{};
const app=socialSource(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8')),font=fs.readFileSync(new URL('../social-font-fallback.js',import.meta.url),'utf8').match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/)[1];GlobalFonts.register(Buffer.from(font,'base64'),'Club Sporting');
dom.window.HTMLCanvasElement.prototype.getContext=function(){if(!this.backing){this.backing=createCanvas(this.width,this.height);const ctx=this.backing.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(i,...args)=>draw(i.backing||i,...args);}if(this.backing.width!==this.width)this.backing.width=this.width;if(this.backing.height!==this.height)this.backing.height=this.height;return this.backing.getContext('2d');};
dom.window.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new Blob([this.backing.toBuffer('image/png')],{type:'image/png'}));};
const api=createTeamWeekDemo(()=> 'Newcastle City'),downloads=[],calls=[];const original=api.rpc.bind(api);let failFinish=true;
api.rpc=async(name,args)=>{calls.push(structuredClone(args));if(args.p_action==='finish_image'&&failFinish){failFinish=false;throw Error('Simulated interrupted save');}const result=await original(name,args);if(args.p_action==='context'){const p=result.data.candidates.find(p=>p.name==='Lee Woods');p.bowling=[{wickets:0,runs:42,overs:'8',balls:48}];p.conceded=42;}return result;};
const s={scope:'user:club-test',view:'team_week',data:{brand:{name:'Newcastle City',logo:null},timezone:'Australia/Sydney'},design:{primary:'#073554',accent:'#128fd2'},urls:new Map()};
const h={supabase:api,demo:true,here:x=>x===s,escape:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),extractUrl:v=>v[0],normalize:async b=>b,download:(name,blob)=>downloads.push({name,blob}),image:async(_,url)=>loadImage(Buffer.from(await (await fetch(url)).arrayBuffer())),fontReady:async()=>true,fitImage:(ctx,img,x,y,w,height)=>ctx.drawImage(img,x,y,w,height),text:(ctx,text,x,y,width,size)=>{let n=size;do{ctx.font=`700 ${n}px "Club Sporting"`;if(ctx.measureText(String(text)).width<=width)break;n--;}while(n>18);ctx.fillText(String(text),x,y,width);}};
const weekly=createTeamOfWeek(h),tick=()=>new Promise(r=>setTimeout(r,5)),until=async pred=>{for(let i=0;i<1000;i++){if(pred())return;await tick();}throw Error('Timed out');};
weekly.state(s).end='2026-10-11';weekly.render(s);await until(()=>s.week?.context&&!s.week.busy&&s.week.previewReady);
assert.equal(document.querySelectorAll('[data-tw-team]').length,0,'Known club must not require a choice');
document.getElementById('twSuggest').click();await until(()=>s.week.previewReady);
assert.ok(s.week.review.shortlist.length>0);assert.ok(s.week.rows.length<11);assert.ok(document.getElementById('twShortlistHeading').textContent.includes(String(s.week.review.contenders.length)));assert.equal(document.getElementById('twSave').disabled,true,'Close calls need a human choice before saving');assert.equal(document.getElementById('twUseSuggested').textContent,'Confirm suggested XI');assert.ok(document.querySelector('.tw-choice'));
const wicketlessCard=[...document.querySelectorAll('.tw-choice')].find(e=>e.querySelector('strong').textContent==='Lee Woods');assert.ok(wicketlessCard.textContent.includes('Bowling: 0/42'),'Wicketless spells must appear in comparison cards');const bowlingMode=document.getElementById('twRankMode');bowlingMode.value='bowling';bowlingMode.dispatchEvent(new window.Event('change'));const wicketlessRow=[...document.querySelectorAll('.tw-table tbody tr')].find(e=>e.querySelector('td:nth-child(3) strong').textContent==='Lee Woods');assert.equal(wicketlessRow.querySelector('td:nth-child(5)').textContent,'0/42','Bowling list includes a bowler with no wickets');document.getElementById('twRankMode').value='overall';document.getElementById('twRankMode').dispatchEvent(new window.Event('change'));await until(()=>s.week.previewReady);
const input=document.querySelector('.tw-choice input:not(:disabled):not(:checked)');input.click();await until(()=>s.week.previewReady);assert.ok(s.week.rows.some(p=>p.key===input.dataset.twPick));
document.getElementById('twUseSuggested').click();await until(()=>s.week.previewReady);assert.equal(s.week.rows.length,11);assert.equal(document.getElementById('twSave').disabled,false);
const before=s.week.rows[1].key;document.querySelector('[data-tw-up="1"]').click();await until(()=>s.week.previewReady);assert.equal(s.week.rows[0].key,before);
const blurb=document.getElementById('twBlurb');blurb.value='Well played across all grades!';blurb.dispatchEvent(new window.Event('input'));assert.equal(s.week.blurb,blurb.value);
document.getElementById('twTitle').value='WEEK 1';document.getElementById('twTitle').dispatchEvent(new window.Event('input'));await until(()=>s.week.previewReady);
if(process.env.TEAM_WEEK_PREVIEW_PATH)fs.writeFileSync(process.env.TEAM_WEEK_PREVIEW_PATH,document.getElementById('twCanvas').backing.toBuffer('image/png'));
document.getElementById('twDownloadImage').click();assert.equal(document.getElementById('twDownloadImage').textContent,'Preparing…');await until(()=>!s.week.busy&&s.week.previewReady);assert.equal(downloads.filter(d=>d.name.endsWith('.png')).length,1);assert.equal(calls.filter(c=>c.p_action==='reserve_image').length,0,'Download must not save an edition');assert.equal(s.week.context.history.length,0);assert.equal(document.getElementById('twSave').textContent,'Save image');
document.getElementById('twSave').click();assert.equal(document.getElementById('twSave').textContent,'Saving…');assert.equal(document.getElementById('twSave').disabled,true);assert.equal(document.getElementById('twSaveStatus').textContent,'Creating image…','Progress appears beside the save button immediately');await until(()=>!s.week.busy&&!!s.week.pending);assert.ok(document.getElementById('twRetry'));assert.ok(document.getElementById('twSaveStatus').textContent.includes('Simulated interrupted save'),'Save errors are visible beside the button');const id=s.week.pending.request.id;
assert.equal(document.getElementById('twDownloadImage').disabled,false,'Download remains available after a save failure');document.getElementById('twDownloadImage').click();await until(()=>!s.week.busy&&s.week.previewReady);assert.equal(downloads.length,2);assert.equal(calls.filter(c=>c.p_action==='reserve_image').length,1,'Download does not retry an unconfirmed save');assert.equal(s.week.pending.request.id,id);
document.getElementById('twRetry').click();await until(()=>!s.week.busy&&!s.week.pending&&s.week.context.history.length===1);
assert.equal(calls.filter(c=>c.p_action==='reserve_image').length,2);assert.ok(calls.filter(c=>c.p_action==='reserve_image').every(c=>c.p_data.id===id));assert.equal(s.week.context.history[0].blurb,'Well played across all grades!');assert.equal(downloads.filter(d=>d.name.endsWith('.png')).length,2);
assert.equal(downloads.length,2,'Saving must not start another download');assert.equal(document.getElementById('twSave').textContent,'Saved');assert.equal(document.getElementById('twSave').disabled,true);assert.equal(document.getElementById('twDownloadImage').disabled,false);assert.equal(document.getElementById('twSaveStatus').textContent,'Saved to Saved weeks.');document.getElementById('twDownloadImage').click();await until(()=>!s.week.busy&&s.week.previewReady);assert.equal(calls.filter(c=>c.p_action==='reserve_image').length,2,'Repeated downloads reuse the saved original');assert.equal(downloads.filter(d=>d.name.endsWith('.png')).length,3);
const savedBlurb=document.getElementById('twBlurb'),originalBlurb=savedBlurb.value;savedBlurb.value+=' Changed';savedBlurb.dispatchEvent(new window.Event('input'));assert.equal(document.getElementById('twSave').textContent,'Save image');assert.equal(document.getElementById('twSaveStatus').textContent,'','Edited work cannot appear saved');savedBlurb.value=originalBlurb;savedBlurb.dispatchEvent(new window.Event('input'));assert.equal(document.getElementById('twSave').textContent,'Saved');
const history=document.querySelector('.tw-history');history.open=true;history.dispatchEvent(new window.Event('toggle'));await tick();document.querySelector('[data-tw-download]').click();await until(()=>!s.week.busy);assert.equal(downloads.filter(d=>d.name.endsWith('.png')).length,4);for(const item of downloads)assert.equal(await item.blob.text(),await downloads[0].blob.text());
assert.ok(document.getElementById('twExample'));assert.ok(document.getElementById('twBackground'));assert.ok(document.getElementById('twLogo'));
const colour=document.getElementById('twColour');colour.value='#e0eaff';colour.dispatchEvent(new window.Event('input'));document.getElementById('twSaveDesign').click();await until(()=>!s.week.busy);assert.equal(s.week.context.design.layout.text_colour,'#e0eaff');
console.log('Passed: automatic club, comparison cards, pick/remove/reorder, blurb, immutable image, lost-response retry, background controls.');

// A real PNG upload must retain every pixel outside overlays and its native aspect ratio.
const background=createCanvas(640,480),bc=background.getContext('2d');bc.fillStyle='#174368';bc.fillRect(0,0,640,480);bc.fillStyle='#ee2255';bc.fillRect(0,0,40,40);bc.fillStyle='#66cc33';bc.fillRect(600,440,40,40);
const png=new File([background.toBuffer('image/png')],'Club <home> & away.png',{type:'image/png'}),upload=async(id,blob)=>{const input=document.getElementById(id);Object.defineProperty(input,'files',{value:[blob],configurable:true});input.dispatchEvent(new window.Event('change'));await until(()=>!s.week.busy&&s.week.previewReady);};
const settings=document.querySelector('.tw-settings');settings.open=false;
assert.equal(document.getElementById('twBackground').closest('details'),null,'Uploads always visible');
assert.equal(document.getElementById('twBackgroundName').textContent,'Club colours in use');assert.equal(document.getElementById('twBackgroundChoose').textContent,'Upload background');
await upload('twBackground',png);assert.equal(document.querySelector('.tw-settings').open,false,'User expansion choice survives upload');assert.equal(s.week.layout.show_logo,false,'Background cannot add duplicate branding');
assert.equal(document.getElementById('twBackgroundName').textContent,png.name);assert.equal(document.querySelector('home'),null,'Filenames render as text');assert.equal(document.getElementById('twBackground').hidden,true,'Native file input must not show misleading no-file text');assert.equal(document.getElementById('twBackgroundChoose').textContent,'Replace background');assert.ok(document.getElementById('twStatus').textContent.includes(png.name));await until(()=>document.getElementById('twBackgroundPreview')?.src.startsWith('blob:'));assert.equal(s.week.context.design.layout.background_name,png.name);
let chooserOpened=false;document.getElementById('twBackground').addEventListener('click',e=>{chooserOpened=true;e.preventDefault();});document.getElementById('twBackgroundChoose').click();assert.equal(chooserOpened,true,'Separate replace button opens its file chooser');
let preview=document.getElementById('twCanvas');assert.equal(preview.width,640);assert.equal(preview.height,480);assert.deepEqual([...preview.getContext('2d').getImageData(2,2,1,1).data],[238,34,85,255]);assert.deepEqual([...preview.getContext('2d').getImageData(637,477,1,1).data],[102,204,51,255]);
const stored=await api.storage.from().download(s.week.background);assert.deepEqual(new Uint8Array(await stored.data.arrayBuffer()),new Uint8Array(await png.arrayBuffer()),'Original PNG bytes retained');
const logo=createCanvas(20,20);logo.getContext('2d').fillStyle='#ff8800';logo.getContext('2d').fillRect(0,0,20,20);await upload('twLogo',new File([logo.toBuffer('image/png')],'Club crest.png',{type:'image/png'}));assert.equal(s.week.layout.show_logo,true);assert.equal(document.getElementById('twLogoName').textContent,'Club crest.png');assert.equal(document.querySelector('#twLogoCurrent .tw-badge').textContent,'In use');
for(const [id,value] of [['twLogoX',100],['twLogoY',100],['twLogoSize',10]]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new window.Event('input'));}await until(()=>s.week.previewReady);preview=document.getElementById('twCanvas');assert.deepEqual([...preview.getContext('2d').getImageData(638,478,1,1).data],[255,136,0,255],'Logo moves to bottom-right');
document.getElementById('twShowLogo').click();await until(()=>s.week.previewReady);assert.equal(s.week.layout.show_logo,false);assert.deepEqual([...document.getElementById('twCanvas').getContext('2d').getImageData(638,478,1,1).data],[102,204,51,255]);
assert.equal(document.querySelector('#twLogoCurrent .tw-badge').textContent,'Saved · not shown');
// Actual upload flow applies reference composition and names, with imported scores untouched.
h.demo=false;let finishReading;const reading=new Promise(resolve=>finishReading=resolve);h.readReference=async()=>{await reading;return {layout:{top:640,bottom:1210,title_y:410,includes_title:false},names:[{name:'Alex Carter',grade:'1st',figures:'1'}]};};
const exampleUpload=upload('twExample',new File([png],'Week 1 example.png',{type:'image/png'}));await until(()=>document.getElementById('twExamplePreview')?.src.startsWith('blob:'));assert.equal(s.week.busy,true,'Example reading is still in progress');assert.equal(document.getElementById('twExampleName').textContent,'Week 1 example.png','Saved artwork is visible before reading finishes');finishReading();await exampleUpload;
assert.equal(s.week.layout.top,640);assert.equal(s.week.rows.find(p=>p.name==='Alex Carter').runs,86);assert.equal(s.week.layout.reference.week_end,s.week.end);assert.ok(document.getElementById('twStatus').textContent.includes('Week 1 example.png'));assert.equal(document.getElementById('twExample').closest('details'),null);
const ranks=[...document.querySelectorAll('.tw-rank')].map(e=>Number(e.textContent));assert.deepEqual(ranks,Array.from({length:ranks.length},(_,i)=>i+1));const rankMode=document.getElementById('twRankMode');rankMode.value='bowling';rankMode.dispatchEvent(new window.Event('change'));assert.equal(document.querySelector('.tw-table tbody tr td:nth-child(3) strong').textContent,'Cameron Hill');
const end=document.getElementById('twEnd');end.value='2026-10-18';end.dispatchEvent(new window.Event('change'));await until(()=>!s.week.busy&&s.week.previewReady);assert.equal(document.getElementById('twExampleWeek').checked,false,'Previous week names cannot silently guide another week');
assert.equal(document.getElementById('twBackgroundName').textContent,png.name,'Background filename survives reloading');assert.equal(document.getElementById('twExampleName').textContent,'Week 1 example.png');assert.equal(document.getElementById('twLogoName').textContent,'Club crest.png');
// A failed replacement keeps the last saved background visibly in use.
const savedBackground=s.week.background,normalRpc=api.rpc.bind(api);api.rpc=async(name,args)=>args.p_action==='save_design'?{error:{message:'Simulated save failure'}}:normalRpc(name,args);
await upload('twBackground',new File([png],'Failed replacement.png',{type:'image/png'}));assert.equal(s.week.background,savedBackground);assert.equal(document.getElementById('twBackgroundName').textContent,png.name);assert.ok(document.getElementById('twStatus').textContent.includes('Simulated save failure'));api.rpc=normalRpc;
// Older images remain identifiable when no original filename was retained.
delete s.week.layout.background_name;weekly.render(s);await until(()=>s.week.previewReady);assert.equal(document.getElementById('twBackgroundName').textContent,'Saved background');assert.ok(document.getElementById('twBackgroundPreview'));assert.equal(document.getElementById('twBackgroundChoose').textContent,'Replace background');
s.data.brand.logo=URL.createObjectURL(new Blob([logo.toBuffer('image/png')],{type:'image/png'}));weekly.render(s);document.getElementById('twClubLogo').click();await until(()=>!s.week.busy&&s.week.previewReady);assert.equal(s.week.layout.logo_name,undefined);assert.equal(document.getElementById('twLogoName').textContent,'Saved club logo');assert.equal(document.getElementById('twClubLogo'),null,'Already active club logo has no redundant use button');
document.getElementById('twClearBackground').click();await until(()=>!s.week.busy&&s.week.previewReady);assert.equal(s.week.context.design.layout.background_name,undefined);assert.equal(document.getElementById('twBackgroundName').textContent,'Club colours in use');assert.equal(document.getElementById('twBackgroundPreview'),null);
let backgroundHelp;h.openBackground=(_,file,apply)=>backgroundHelp={file,apply};
const help=document.getElementById('twPrepareBackground');assert.match(help.closest('.tw-panel').querySelector('h4').textContent,/background/i);help.click();await until(()=>!!backgroundHelp);await backgroundHelp.apply({blob:png,name:'Prepared background.png'});weekly.render(s);await until(()=>s.week.previewReady);assert.equal(s.week.layout.background_name,'Prepared background.png');
console.log('Passed: saved filenames and previews, separate replacement controls, immediate upload feedback, failed replacement recovery, persistent controls, original PNG and aspect, optional movable logo, applied reference layout, week-specific names and visible ranking.');

// Reloading scorecards refreshes facts without rebuilding the editor's chosen XI.
document.getElementById('twUseSuggested')?.click();await until(()=>s.week.previewReady);
assert.equal(s.week.rows.length,11);document.querySelector('[data-tw-up="1"]').click();await until(()=>s.week.previewReady);
const picks=s.week.rows.map(p=>({player_id:p.player_id,display:p.display})),updatedPlayer=picks[0].player_id,oldRuns=s.week.rows[0].runs,designRevision=s.week.context.design.revision;
const draftColour=document.getElementById('twColour');draftColour.value='#aa1177';draftColour.dispatchEvent(new window.Event('input'));await until(()=>s.week.previewReady);
const currentRpc=api.rpc.bind(api);let omitPlayer=false;
api.rpc=async(name,args)=>{const result=await currentRpc(name,args);if(args.p_action==='context'){
 const data=result.data;data.design.revision+=10;
 for(const card of data.cards)card.snapshot_id+='-updated';
 data.candidates=data.candidates.filter(p=>!omitPlayer||p.player_id!==picks[1].player_id).map(p=>({...p,snapshot_id:p.snapshot_id+'-updated',key:p.key+'-updated',...(p.player_id===updatedPlayer?{runs:p.runs+7,batting:p.batting.map((b,i)=>i?b:{...b,runs:b.runs+7})}:{})}));
 }return result;};
document.getElementById('twReload').click();await until(()=>!s.week.busy&&s.week.previewReady);
assert.deepEqual(s.week.rows.map(p=>({player_id:p.player_id,display:p.display})),picks,'Reload keeps manual selection, order and display choice');
assert.equal(s.week.rows[0].runs,oldRuns+7,'Selected rows use refreshed figures');assert.ok(s.week.rows.every(p=>p.key.endsWith('-updated')),'Updated snapshots replace stale source keys');
assert.equal(s.week.layout.text_colour,'#aa1177');assert.equal(s.week.designDirty,true);assert.equal(s.week.context.design.revision,designRevision,'A dirty layout keeps its optimistic-concurrency base');
omitPlayer=true;document.getElementById('twReload').click();await until(()=>!s.week.busy&&s.week.previewReady);
assert.deepEqual(s.week.rows.map(p=>p.player_id),picks.filter((_,i)=>i!==1).map(p=>p.player_id),'Unavailable performance is removed without silently selecting a replacement');assert.match(document.getElementById('twStatus').textContent,/No longer in the selected scorecards/);
api.rpc=currentRpc;
const oldWeekBlurb=document.getElementById('twBlurb');oldWeekBlurb.value='Last week’s specific performance.';oldWeekBlurb.dispatchEvent(new window.Event('input'));
const nextWeek=document.getElementById('twEnd');nextWeek.value='2026-10-25';nextWeek.dispatchEvent(new window.Event('change'));await until(()=>!s.week.busy&&s.week.previewReady);
assert.equal(s.week.blurb,'','Changing weeks clears the old narrative');assert.notEqual(s.week.layout.text_colour,'#aa1177','Explicit week change loads the saved layout');

// Help edits the saved background; restarting from an example is an explicit choice.
h.openBackground=(_,file,apply,options)=>backgroundHelp={file,apply,options};backgroundHelp=null;
const savedBackgroundBlob=(await api.storage.from().download(s.week.background)).data;
assert.equal(document.getElementById('twPrepareBackground').textContent,'Edit background');document.getElementById('twPrepareBackground').click();await until(()=>!!backgroundHelp);
assert.equal(backgroundHelp.options.mode,'edit');assert.equal(backgroundHelp.file.name,s.week.layout.background_name);assert.deepEqual(Buffer.from(await backgroundHelp.file.arrayBuffer()),Buffer.from(await savedBackgroundBlob.arrayBuffer()));
s.week.layout.show_logo=true;s.week.layout.includes_title=true;
await backgroundHelp.apply({blob:png,name:'Edited background.png'});weekly.render(s);await until(()=>s.week.previewReady);
assert.equal(s.week.layout.show_logo,true,'Editing preserves separate logo visibility');assert.equal(s.week.layout.includes_title,true);
backgroundHelp=null;assert.equal(document.getElementById('twPrepareExample').textContent,'Start from previous example');document.getElementById('twPrepareExample').click();await until(()=>!!backgroundHelp);
assert.equal(backgroundHelp.options.mode,'template');assert.equal(backgroundHelp.file.name,s.week.layout.example_name);assert.deepEqual(Buffer.from(await backgroundHelp.file.arrayBuffer()),Buffer.from(await (await api.storage.from().download(s.week.layout.example_path)).data.arrayBuffer()));
console.log('Passed: score refresh preserves manual XI and dirty layout, reconciles changed snapshots, flags missing performances, clears old-week blurb, and separates background edits from example restarts.');

// A concurrent design change has an explicit recovery path; score reload cannot bypass the conflict.
const conflictRpc=api.rpc.bind(api),conflictBase=s.week.context.design.revision;
api.rpc=async(name,args)=>{if(args.p_action==='save_design'){const saved=await conflictRpc(name,{...args,p_action:'context',p_data:{week_end:s.week.end}});if(args.p_data.revision!==saved.data.design.revision)return {error:{message:'The background settings changed. Reload before saving'}};}return conflictRpc(name,args);};
await api.rpc('team_of_week_api',{p_club_id:'club-test',p_action:'save_design',p_data:{revision:conflictBase,background_path:s.week.background,layout:{...s.week.layout,text_colour:'#11aa77'}}});
const conflictRows=s.week.rows.map(({rank,points,reason,bowlingStandout,...p})=>structuredClone(p)),conflictWeek=s.week.end,conflictTitle=s.week.title;s.week.blurb='Keep this week’s caption.';
document.getElementById('twColour').value='#7711aa';document.getElementById('twColour').dispatchEvent(new window.Event('input'));await until(()=>s.week.previewReady);
assert.equal(document.getElementById('twReloadLayout'),null);document.getElementById('twSaveDesign').click();await until(()=>!s.week.busy&&s.week.previewReady);
assert.equal(s.week.layoutConflict,true);assert.equal(s.week.context.design.revision,conflictBase);assert.match(document.getElementById('twStatus').textContent,/Reload saved layout/);assert.ok(document.getElementById('twReloadLayout'));
document.getElementById('twReload').click();await until(()=>!s.week.busy&&s.week.previewReady);assert.equal(s.week.context.design.revision,conflictBase);assert.equal(s.week.layout.text_colour,'#7711aa');assert.ok(document.getElementById('twReloadLayout'));
let confirmLayout=false;window.confirm=()=>confirmLayout;document.getElementById('twReloadLayout').click();await tick();assert.equal(s.week.layout.text_colour,'#7711aa','Cancel keeps the unsaved layout');
confirmLayout=true;document.getElementById('twReloadLayout').click();await until(()=>!s.week.busy&&s.week.previewReady);
assert.equal(s.week.layout.text_colour,'#11aa77');assert.equal(s.week.context.design.revision,conflictBase+1);assert.equal(s.week.designDirty,false);assert.equal(document.getElementById('twReloadLayout'),null);
assert.deepEqual(s.week.rows,conflictRows);assert.equal(s.week.end,conflictWeek);assert.equal(s.week.title,conflictTitle);assert.equal(s.week.blurb,'Keep this week’s caption.');
document.getElementById('twColour').value='#225588';document.getElementById('twColour').dispatchEvent(new window.Event('input'));document.getElementById('twSaveDesign').click();await until(()=>!s.week.busy&&s.week.previewReady);
assert.equal(s.week.context.design.revision,conflictBase+2);assert.equal(s.week.layoutConflict,false);assert.equal(s.week.designDirty,false);api.rpc=conflictRpc;
console.log('Passed: Team of the Week layout conflict, cancelled recovery, confirmed recovery preserving XI/caption/week, and successful subsequent save.');

// Basic uses the same verified graphic-save path and cannot rewrite a saved Smart edition.
const historyBefore=structuredClone(s.week.context.history),smartDraft=s.week.rows.map(p=>p.player_id);
document.querySelector('[name=twMethod][value=basic]').click();await until(()=>s.week.previewReady);
assert.equal(s.week.review.contenders.length,13);assert.equal(s.week.rows.length,0);
for(let i=0;i<11;i++){document.querySelector('.tw-choice input:not(:checked):not(:disabled)').click();await until(()=>s.week.previewReady);}
const basicDraft=s.week.rows.map(p=>p.player_id);
document.getElementById('twSuggest').click();await until(()=>s.week.previewReady);assert.deepEqual(s.week.rows.map(p=>p.player_id),basicDraft,'Refreshing Basic suggestions retains human choices');
document.getElementById('twSave').click();await until(()=>!s.week.busy&&!s.week.pending&&s.week.context.history.length===historyBefore.length+1);
assert.equal(document.getElementById('twSave').textContent,'Saved');
assert.deepEqual(s.week.context.history.slice(1),historyBefore,'Existing editions remain byte-for-byte unchanged');
const basicRequest=calls.filter(c=>c.p_action==='reserve_image').at(-1).p_data;
assert.equal(basicRequest.rows.length,11);assert.deepEqual(basicRequest.rows.map(p=>p.key),s.week.rows.map(p=>p.key));
document.querySelector('[name=twMethod][value=smart]').click();await until(()=>s.week.previewReady);assert.deepEqual(s.week.rows.map(p=>p.player_id),smartDraft);
document.querySelector('[name=twMethod][value=basic]').click();await until(()=>s.week.previewReady);assert.deepEqual(s.week.rows.map(p=>p.player_id),basicDraft);assert.equal(document.getElementById('twSave').textContent,'Saved');
console.log('Passed: Basic thirteen-player pool, eleven manual picks, save/download path, preserved editions and independent Smart draft.');
