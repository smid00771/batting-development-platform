const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');const {createCanvas,loadImage}=require('@napi-rs/canvas');
const {functionSource}=require('./helpers/social-source.cjs');
const source=fs.readFileSync('social-workspace.js','utf8');
test('20 MB camera photo uploads only a resized PNG under 2 MB; larger and unreadable originals never upload',async()=>{
 const photo=createCanvas(6000,4000);const ctx=photo.getContext('2d');const grad=ctx.createLinearGradient(0,0,6000,4000);grad.addColorStop(0,'#145a80');grad.addColorStop(1,'#f2ca80');ctx.fillStyle=grad;ctx.fillRect(0,0,6000,4000);
 const jpg=photo.toBuffer('image/jpeg');const original=new File([jpg,Buffer.alloc(20*1024*1024-jpg.length)],'camera.jpg',{type:'image/jpeg'});
 const uploads=[],messages=[],revoked=[];
 class BrowserImage{set src(url){fetch(url).then(r=>r.arrayBuffer()).then(bytes=>loadImage(Buffer.from(bytes))).then(image=>{this.image=image;this.width=image.width;this.height=image.height;this.onload();},()=>this.onerror());}}
 const s={scope:'user:club'},card={f:{id:'fixture'}};
 const c=vm.createContext({Blob,File,crypto:webcrypto,Image:BrowserImage,URL:{createObjectURL:URL.createObjectURL,revokeObjectURL:u=>{revoked.push(u);URL.revokeObjectURL(u);}},document:{createElement:()=>{const canvas=createCanvas(1,1),draw=canvas.getContext('2d').drawImage.bind(canvas.getContext('2d'));canvas.getContext('2d').drawImage=(i,...args)=>draw(i.image||i,...args);canvas.toBlob=fn=>fn(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));return canvas;}},socialGuardArtwork:()=>true,socialFeatured:()=>({id:'player',person:{}}),socialHere:()=>true,socialLock:()=>{},socialMessage:(_,m)=>messages.push(m),socialSave:async()=>{},socialFeatureRequest:()=>({}),socialDraw:()=>{},supabase:{storage:{from:()=>({upload:async(path,blob)=>{uploads.push({path,blob});return {data:{path}};}})}}});
 vm.runInContext(functionSource(source,'socialNormaliseUpload')+'\n'+functionSource(source,'socialUploadTeamPhoto'),c);
 await c.socialUploadTeamPhoto(s,card,original);assert.equal(uploads.length,1);const saved=uploads[0].blob;assert.notEqual(saved,original);assert.ok(saved.size<=2*1024*1024);assert.equal(saved.type,'image/png');const image=await loadImage(Buffer.from(await saved.arrayBuffer()));assert.equal(image.width,1400);assert.equal(image.height,933);assert.equal(revoked.length,1);
 await c.socialUploadTeamPhoto(s,card,new File([Buffer.alloc(20*1024*1024+1)],'too-big.jpg',{type:'image/jpeg'}));assert.equal(uploads.length,1);assert.match(messages.at(-1),/20 MB/);
 await c.socialUploadTeamPhoto(s,card,new File(['bad bytes'],'broken.jpg',{type:'image/jpeg'}));assert.equal(uploads.length,1);assert.match(messages.at(-1),/could not be read/);
});
