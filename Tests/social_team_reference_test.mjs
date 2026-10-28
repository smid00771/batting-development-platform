import socialSource from './helpers/social-source.cjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {teamSelectionText} from '../social-team-layout.js';
import {graphicGrade,checkGraphicLabel} from '../social-graphic-design.js';
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
 assert.deepEqual(teamSelectionText(card({days})).lines,['DAY 1: 10AM / DAY 2: 10:30AM // EXAMPLE OVAL','SATURDAY 24TH OCTOBER','SATURDAY 31ST OCTOBER']);
 assert.deepEqual(teamSelectionText(card({days,split:true,day:1})).lines,['10:30AM // EXAMPLE OVAL','SATURDAY 31ST OCTOBER']);
 assert.deepEqual(teamSelectionText(card({days:[...days,{date:'2026-11-01'}],split:true,day:2})).lines,['EXAMPLE OVAL','SUNDAY 1ST NOVEMBER']);
});
function renderHarness({portrait=true,layout='portrait'}={}){
 const bg=createCanvas(1080,1350),b=bg.getContext('2d'),glow=b.createLinearGradient(0,0,900,1350);glow.addColorStop(0,'#032e47');glow.addColorStop(1,'#648ba2');b.fillStyle=glow;b.fillRect(0,0,1080,1350);b.fillStyle='#dce6ed';b.font='700 36px sans-serif';b.fillText('CLUB LOGO',64,110);b.fillText('SPONSORS',430,110);
 const photo=createCanvas(470,950),p=photo.getContext('2d');p.fillStyle='#007ac2';p.beginPath();p.ellipse(235,650,210,400,0,0,Math.PI*2);p.fill();p.fillStyle='#ccd5dd';p.beginPath();p.ellipse(235,160,95,145,0,0,Math.PI*2);p.fill();
 const texts=[],markers=[],asset={id:'photo'},s={design:{font:'bold',layout,frame:'cutout',photo_scale:100,photo_shift:0,primary:'#202F78',accent:'#D8232A',marker:'arrows',header_layout:'integrated',header_height:310},data:{brand:{name:'Example Club'}}};
 const context=vm.createContext({console,Intl,Date,graphicGrade,checkGraphicLabel,teamSelectionText,
  socialAsset:(_,kind)=>kind==='background'?{id:'background'}:null,socialAssetURL:async(_,a)=>a?.id,socialImage:async(_,url)=>url==='background'?bg:url==='photo'?photo:null,
  socialFontReady:async()=>true,socialFeatured:()=>({id:'3',asset:portrait?asset:null}),socialPhotoPosition:()=>({x:0,y:0}),socialPhotoBounds:()=>({x:0,y:0,w:470,h:950,transparent:true}),
  socialInk:()=> '#FFFFFF',socialNameProtection:()=>({alpha:.4,shade:0}),socialDrawNameProtection(){throw Error('Integrated reference artwork must not receive a names panel');},
  socialFitImage(ctx,img,x,y,w,h){ctx.drawImage(img,x,y,w,h);},socialMarker(ctx,kind,x,y){markers.push({x,y});ctx.fillText('»',x-26,y+10);}
 });
 vm.runInContext(part('function socialSurname(','function socialPhotoId(')+part('function socialText(','async function socialPaintAll('),context);
 const original=context.socialText;context.socialText=(ctx,text,x,y,width,size,...rest)=>{const actual=original(ctx,text,x,y,width,size,...rest);texts.push({text,x,y,width,size:actual,pixels:Math.min(width,ctx.measureText(text).width)});return actual;};
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
 const date=h.texts.find(r=>r.text==='SATURDAY 31ST OCTOBER'),names=h.texts.filter(r=>source.f.published.players.some(p=>r.text.startsWith(p.name.toUpperCase())));
 assert.equal(names.length,11);assert.ok(names[0].y-names[0].size>date.y);assert.ok(names.at(-1).y<=1315);
});
