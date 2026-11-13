import socialSource from './helpers/social-source.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {teamSelectionText} from '../social-team-layout.js';
import {graphicPlayerName,graphicGrade,checkGraphicLabel} from '../social-graphic-design.js';
const require=createRequire(import.meta.url),{createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const app=socialSource(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'));
const part=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const font=fs.readFileSync(new URL('../social-font-fallback.js',import.meta.url),'utf8').match(/data:font\/ttf;base64,([A-Za-z0-9+/=]+)/)[1];GlobalFonts.register(Buffer.from(font,'base64'),'Club Sporting');
function card({round='Round 2',split=false,day=0,days=[{date:'2026-10-24',start:'10:00'}],ground='Example Oval'}={}){
 const players=['Alex Archer','Blake Brown','Chris Carter','Drew Davis','Evan Edwards','Finley Fisher','George Green','Harper Hill','Indy Irving','Jordan Jones','Kai King'].map((name,i)=>({id:String(i),name}));
 return {day,split,key:'example:0',f:{id:'example',round,features:[],published:{details:{grade:'FIRST GRADE',opposition:'Visitors',competition:'Example Competition',format:'limited_overs',overs:40,ground,days,match_roles:{d1:{captain_id:'3',keeper_id:'0'},d2:{captain_id:'3',keeper_id:'0'}}},players,slots:players.map(p=>({d1:p.id,d2:p.id}))}}};
}
test('one-day facts follow the reference and never include format, overs or competition',()=>{
 const source=card(),before=structuredClone(source);
 assert.deepEqual(teamSelectionText(source),{match:'ROUND 2 V VISITORS',lines:['10AM // EXAMPLE OVAL','SATURDAY 24TH OCTOBER']});assert.deepEqual(source,before);
});
test('each team keeps its source round and missing facts produce no invented round or stray separators',()=>{
 assert.equal(teamSelectionText(card({round:'1'})).match,'ROUND 1 V VISITORS');
 assert.equal(teamSelectionText(card({round:'Semi-final'})).match,'ROUND SEMI-FINAL V VISITORS');
 assert.deepEqual(teamSelectionText(card({round:'',ground:'',days:[{date:'2026-10-31'}]})),{match:'V VISITORS',lines:['SATURDAY 31ST OCTOBER']});
 assert.equal(teamSelectionText(card({days:[{date:'2026-10-22',start:'13:30'}]})).lines[0],'1:30PM // EXAMPLE OVAL');
});
test('two-day graphics retain both dates and differing start times; split graphics show their own day',()=>{
 const days=[{date:'2026-10-24',start:'10:00'},{date:'2026-10-31',start:'10:30'}];
 assert.deepEqual(teamSelectionText(card({days})).lines,['DAY 1: 10AM / DAY 2: 10:30AM // EXAMPLE OVAL','SATURDAY 24TH & 31ST OCTOBER']);
 assert.deepEqual(teamSelectionText(card({days,split:true,day:1})).lines,['10:30AM // EXAMPLE OVAL','SATURDAY 31ST OCTOBER']);
 assert.deepEqual(teamSelectionText(card({days:[...days,{date:'2026-11-01'}],split:true,day:2})).lines,['EXAMPLE OVAL','SUNDAY 1ST NOVEMBER']);
});
function renderHarness({portrait=true,layout='portrait',transparent=true,frame='cutout'}={}){
 const bg=createCanvas(1080,1350),b=bg.getContext('2d'),glow=b.createLinearGradient(0,0,900,1350);glow.addColorStop(0,'#032e47');glow.addColorStop(1,'#648ba2');b.fillStyle=glow;b.fillRect(0,0,1080,1350);b.fillStyle='#dce6ed';b.font='700 36px sans-serif';b.fillText('CLUB LOGO',64,110);b.fillText('SPONSORS',430,110);
 const photo=createCanvas(470,950),p=photo.getContext('2d');p.fillStyle='#007ac2';p.beginPath();p.ellipse(235,650,210,400,0,0,Math.PI*2);p.fill();p.fillStyle='#ccd5dd';p.beginPath();p.ellipse(235,160,95,145,0,0,Math.PI*2);p.fill();
 const texts=[],markers=[],asset={id:'photo'},s={design:{font:'bold',layout,frame,photo_scale:100,photo_shift:0,primary:'#202F78',accent:'#D8232A',marker:'arrows',header_layout:'integrated',header_height:310},data:{brand:{name:'Example Club'}}};
 const context=vm.createContext({console,Intl,Date,graphicPlayerName,graphicGrade,checkGraphicLabel,teamSelectionText,
  socialAsset:(_,kind)=>kind==='background'?{id:'background'}:null,socialAssetURL:async(_,a)=>a?.id,socialImage:async(_,url)=>url==='background'?bg:url==='photo'?photo:null,
  socialFontReady:async()=>true,socialFeatured:()=>({id:'3',asset:portrait?asset:null}),socialPhotoPosition:()=>({x:0,y:0,scale:100}),socialPhotoBounds:()=>({x:0,y:0,w:470,h:950,transparent}),
  socialInk:()=> '#FFFFFF',socialNameProtection:()=>({alpha:.4,shade:0}),socialDrawNameProtection(){throw Error('Integrated reference artwork must not receive a names panel');},
  socialFitImage(ctx,img,x,y,w,h){ctx.drawImage(img,x,y,w,h);},socialMarker(ctx,kind,x,y){markers.push({x,y});ctx.fillText('»',x-26,y+10);}
 });
 vm.runInContext(part('function socialCards(','function socialSurname(')+part('function socialSurname(','function socialPhotoId(')+part('function socialText(','async function socialPaintAll(')+socialSource.functionSource(app,'socialCaption'),context);
 context.seFormatLabel=()=> 'Long form';
 const original=context.socialText;context.socialText=(ctx,text,x,y,width,size,...rest)=>{const actual=original(ctx,text,x,y,width,size,...rest);texts.push({text,x,y,width,size:actual,pixels:ctx.measureText(text).width});return actual;};
 const canvas=createCanvas(1080,1350);canvas.dataset={};return {context,s,texts,markers,canvas};
}
test('the actual canvas has the reference hierarchy, compact match details, readable names and adjacent player marker',async()=>{
 const h=renderHarness(),source=card();await h.context.socialRender(h.s,source,h.canvas);
 const row=text=>h.texts.find(r=>r.text===text),match=row('ROUND 2 V VISITORS'),grade=row('FIRST GRADE'),start=row('10AM // EXAMPLE OVAL'),date=row('SATURDAY 24TH OCTOBER'),first=row('ALEX ARCHER (WK)'),last=row('KAI KING'),featured=row('DREW DAVIS (C)');
 assert.ok(match.y<grade.y&&grade.y<start.y&&start.y<date.y&&date.y<first.y);
 assert.equal(match.x,start.x);assert.equal(start.x,first.x);assert.equal(grade.size,144);assert.equal(first.size,58);assert.ok(last.y<1300);
 assert.ok(h.markers[0].x>featured.x+featured.pixels&&h.markers[0].x<featured.x+featured.pixels+40);
 assert.ok(!h.texts.some(r=>/limited overs|40 overs|example competition/i.test(r.text)));assert.equal(h.canvas.dataset.nameProtection,'text-shadow');
 if(process.env.TEAM_REFERENCE_PREVIEW_DIR){fs.mkdirSync(process.env.TEAM_REFERENCE_PREVIEW_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.TEAM_REFERENCE_PREVIEW_DIR,'team-reference-layout.png'),h.canvas.toBuffer('image/png'));}
});
test('long grounds wrap above the players and each day remains visible without colliding with the names',async()=>{
 const h=renderHarness(),source=card({ground:'An unusually long regional cricket ground name',days:[{date:'2026-10-24',start:'10:00'},{date:'2026-10-31',start:'11:00'}]});await h.context.socialRender(h.s,source,h.canvas);
 const date=h.texts.find(r=>r.text==='SATURDAY 24TH & 31ST OCTOBER'),names=h.texts.filter(r=>source.f.published.players.some(p=>r.text.startsWith(p.name.toUpperCase())));
 assert.equal(names.length,11);assert.ok(names[0].y-names[0].size>date.y);assert.ok(names.at(-1).y<=1315);
});
function bracketed(count=3){
 const source=card({days:[{date:'2026-11-14',start:'13:00'},{date:'2026-11-21',start:'13:00'}]}),f=source.f;
 const partners=['Leslie Longsurname','Morgan Mitchell','Robin Rivers','Sam Summers','Taylor Truman','Val West','Winter Young','Yasmin Zee','Ash Abbott','Blair Banks','Cameron Cole'];
 for(let i=0;i<count;i++){const p={id:'partner-'+i,name:partners[i]};f.published.players.push(p);f.published.slots[i].d2=p.id;}
 f.published.details.match_roles={d1:{captain_id:'0',keeper_id:'2'},d2:{captain_id:count?'partner-0':'0',keeper_id:count>2?'partner-2':'2'}};
 f.features=[{day:1,mode:'player',roster_id:'0',asset_id:'one',photo_y:2},{day:2,mode:'player',roster_id:'partner-0',asset_id:'two',photo_y:-7}];
 return source;
}
test('brackets, changing captains and different saved photos still produce one whole-fixture graphic and caption',()=>{
 const h=renderHarness(),source=bracketed(),before=structuredClone(source),cards=h.context.socialCards(source.f);
 assert.equal(cards.length,1);assert.equal(cards[0].split,false);
 const rows=h.context.socialRows(cards[0]),names=h.context.socialNames(cards[0]);
 assert.equal(rows.length,11);assert.equal(names.length,14);assert.equal(new Set(names.map(p=>p.id)).size,14);
 assert.deepEqual(Array.from(rows.at(-3).members,p=>p.id),['0','partner-0']);
 assert.equal(names.find(p=>p.id==='0').marks,' (C) (W1)');assert.equal(names.find(p=>p.id==='partner-0').marks,' (C) (W2)');
 const caption=h.context.socialCaption(h.s,source.f);assert.equal((caption.match(/^\d+\. /gm)||[]).length,11);assert.match(caption,/Alex Archer \(C\) \(W1\) \/ Leslie Longsurname \(C\) \(W2\)/);
 assert.match(caption,/W1: Sat, 14 Nov 2026/);assert.match(caption,/W2: Sat, 21 Nov 2026/);assert.doesNotMatch(caption,/Day [12] team/);assert.deepEqual(source,before);
});
test('both bracket partners use compact display names while the published snapshot retains full names',async()=>{
 const h=renderHarness(),source=bracketed(1);source.f.published.players[0].name='Arun Mohan Kumar';source.f.published.players.at(-1).name='Alex John Smith';const before=structuredClone(source);
 await h.context.socialRender(h.s,source,h.canvas);assert.ok(h.texts.some(r=>r.text==='ARUN KUMAR (C)'));assert.ok(h.texts.some(r=>r.text==='ALEX SMITH (C)'));
 assert.match(h.context.socialCaption(h.s,source.f),/Arun Kumar \(C\) \(W1\) \/ Alex Smith \(C\) \(W2\)/);assert.deepEqual(source,before);
});
test('several bracket pairs have paired names, aligned week labels and no clipped final player',async()=>{
 for(const count of [1,2,3,5,11])for(const layout of ['portrait','portrait_left','list']){
  const h=renderHarness({layout}),source=bracketed(count);await h.context.socialRender(h.s,source,h.canvas);
  const names=h.texts.filter(r=>source.f.published.players.some(p=>r.text.startsWith(p.name.toUpperCase()))),tags=h.texts.filter(r=>/^W[12]$/.test(r.text));
  assert.equal(names.length,11+count);assert.equal(tags.length,count*2);assert.equal(new Set(tags.map(r=>r.x)).size,1);
  assert.equal(new Set(names.map(r=>r.size)).size,1,'Every player uses the same font size, including bracket partners');
  assert.ok(names.every(r=>r.pixels<=r.width),'Complete names must fit without individual shrinking or horizontal compression');
  assert.ok(names.every(r=>r.y<=1315&&r.x+r.pixels<=1016));assert.ok(names.every((r,i)=>!i||r.y-r.size>names[i-1].y),'Rows cannot overlap');
  if(count<=3)assert.ok(names.every(r=>r.size>=34),'Typical bracketed teams retain readable lettering');
  assert.equal(h.canvas.dataset.bracketPairs,String(count));assert.doesNotMatch(h.texts.find(r=>r.text==='FIRST GRADE').text,/DAY/);
  if(process.env.TEAM_REFERENCE_PREVIEW_DIR&&layout==='portrait')fs.writeFileSync(path.join(process.env.TEAM_REFERENCE_PREVIEW_DIR,'team-'+count+'-brackets.png'),h.canvas.toBuffer('image/png'));
 }
});
test('one long name scales the whole roster uniformly while keeping the saved heading',async()=>{
 for(const font of ['bold','clean','classic'])for(const count of [0,2,3]){
  const baseline=renderHarness();baseline.s.design.font=font;await baseline.context.socialRender(baseline.s,bracketed(count),baseline.canvas);
  const h=renderHarness(),source=bracketed(count);h.s.design.font=font;source.f.published.players.at(-1).name='Alexandria Montgomery-Wetherington';const before=structuredClone(source);
  await h.context.socialRender(h.s,source,h.canvas);
  const names=h.texts.filter(r=>source.f.published.players.some(p=>r.text.startsWith(p.name.toUpperCase())));
  assert.equal(names.length,11+count);assert.equal(new Set(names.map(r=>r.size)).size,1);assert.ok(names.every(r=>r.pixels<=r.width&&r.y<=1315));
  assert.deepEqual(source,before);assert.deepEqual(h.texts.find(r=>r.text==='FIRST GRADE'),baseline.texts.find(r=>r.text==='FIRST GRADE'));
 }
});
test('each club keeps its own typography and saved heading size with a missing, transparent or ordinary photo',async()=>{
 for(const font of ['bold','clean','classic'])for(const layout of ['portrait','portrait_left','list']){
  let baseline;
  for(const photo of [{portrait:true},{portrait:false},{portrait:true,transparent:false},{portrait:true,frame:'rectangle'},{portrait:true,frame:'circle'}]){
   const h=renderHarness({...photo,layout});h.s.design.font=font;h.s.design.heading_scale=80;h.s.design.primary=font==='classic'?'#124B32':'#202F78';
   const source=bracketed(3);source.f.published.details.grade='REGIONAL PREMIER RESERVES';const before=structuredClone(h.s.design);
   await h.context.socialRender(h.s,source,h.canvas);
   const heading=h.texts.find(r=>r.text==='REGIONAL PREMIER RESERVES'),date=h.texts.find(r=>r.text==='SATURDAY 14TH & 21ST NOVEMBER'),first=h.texts.find(r=>r.text==='DREW DAVIS');
   const geometry={heading,date,first};if(baseline)assert.deepEqual(geometry,baseline,'Photo changes cannot resize or reflow the heading, dates or names');else baseline=geometry;
   assert.deepEqual(h.s.design,before,'Rendering cannot rewrite this club’s template');
  }
 }
});
test('a saved smaller heading is reused for a simple team and a team with several bracket pairs',async()=>{
 let expected;
 for(const count of [0,1,3]){
  const h=renderHarness();h.s.design.heading_scale=75;await h.context.socialRender(h.s,bracketed(count),h.canvas);
  const heading=h.texts.find(r=>r.text==='FIRST GRADE');assert.equal(heading.size,108);if(expected)assert.deepEqual(heading,expected);expected=heading;
 }
});
test('shared players appear once even with day-specific positions or captain/keeper duties',()=>{
 const h=renderHarness(),source=bracketed(0),snap=source.f.published;
 [snap.slots[0].d2,snap.slots[1].d2]=[snap.slots[1].d2,snap.slots[0].d2];snap.details.match_roles.d2={captain_id:'1',keeper_id:'0'};
 const names=h.context.socialNames(source);assert.equal(names.length,11);assert.equal(new Set(names.map(p=>p.id)).size,11);
 assert.equal(names.find(p=>p.id==='0').marks,' (C W1) (WK W2)');assert.equal(names.find(p=>p.id==='1').marks,' (C W2)');
 snap.slots[2]={d1:null,d2:null};assert.equal(h.context.socialNames(source).filter(p=>!p.id).length,1);
});
test('consecutive days, month and year boundaries retain the correct dates and labels',()=>{
 const h=renderHarness(),source=bracketed(1);source.f.published.details.days[1].date='2026-11-15';
 assert.deepEqual(teamSelectionText(source).lines,['1PM // EXAMPLE OVAL','SATURDAY 14TH & SUNDAY 15TH NOVEMBER']);
 assert.equal(h.context.socialNames(source).find(p=>p.id==='partner-0').tag,'D2');
 source.f.published.details.days=[{date:'2026-10-31'},{date:'2026-11-07'}];assert.deepEqual(teamSelectionText(source).lines,['EXAMPLE OVAL','SATURDAY 31ST OCTOBER','SATURDAY 7TH NOVEMBER']);
 source.f.published.details.days=[{date:'2026-12-26'},{date:'2027-01-02'}];assert.deepEqual(teamSelectionText(source).lines,['EXAMPLE OVAL','SATURDAY 26TH DECEMBER 2026','SATURDAY 2ND JANUARY 2027']);
});
