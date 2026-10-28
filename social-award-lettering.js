// Reuse the supplied lettering, removing its local panel colour. Never OCR or
// regenerate words here: both labelled crops must already pass the shared contract.
const cache=new WeakMap(),median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
export function referenceBadgePair(image,crops,makeCanvas){
 if(crops.length!==2)return null;
 const pair=crops.map(crop=>[crop.label,referenceBadge(image,crop,makeCanvas)]);
 return pair.every(([,badge])=>badge)?Object.fromEntries(pair):null;
}
// Separate the main lettering from detached fragments of adjacent rows. This
// uses visible ink, not a club-specific colour or a fixed percentage crop.
function isolateLettering({data,width,height}){
 const count=width*height,labels=new Int32Array(count),queue=new Int32Array(count),parts=[];
 const neighbours=(p,visit)=>{const x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)visit(p+dy*width+dx);};
 for(let p=0;p<count;p++){
  if(labels[p]||data[p*4+3]<48)continue;
  const id=parts.length+1,part={id,area:0,left:width,right:0,top:height,bottom:0};let head=0,tail=0;queue[tail++]=p;labels[p]=id;
  while(head<tail){const q=queue[head++],x=q%width,y=Math.floor(q/width);part.area++;part.left=Math.min(part.left,x);part.right=Math.max(part.right,x);part.top=Math.min(part.top,y);part.bottom=Math.max(part.bottom,y);neighbours(q,next=>{if(!labels[next]&&data[next*4+3]>=48){labels[next]=id;queue[tail++]=next;}});}
  part.width=part.right-part.left+1;part.height=part.bottom-part.top+1;
  part.rule=part.height<=Math.max(3,height*.15)&&part.width/part.height>=8;
  parts.push(part);
 }
 const candidates=parts.filter(p=>!p.rule&&p.area>=Math.max(3,count*.0004));
 const seed=candidates.sort((a,b)=>b.area*Math.sqrt(b.height)-a.area*Math.sqrt(a.height))[0];
 if(!seed)return false;
 const overlap=(a,b)=>Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)+1);
 const letters=candidates.filter(p=>p.height>=seed.height*.45&&overlap(p,seed)>=Math.min(p.height,seed.height)*.4);
 const left=Math.min(...letters.map(p=>p.left)),right=Math.max(...letters.map(p=>p.right)),top=Math.min(...letters.map(p=>p.top)),bottom=Math.max(...letters.map(p=>p.bottom));
 const area=letters.reduce((sum,p)=>sum+p.area,0),letterHeight=bottom-top+1;
 if(right-left+1<letterHeight*1.15)return false;
 // A second full text line is ambiguous. Use the same generated font for both
 // outcomes instead of risking old factual text or an incorrectly cut word.
 if(candidates.filter(p=>!letters.includes(p)&&p.height>=letterHeight*.7).reduce((sum,p)=>sum+p.area,0)>area*.35)return false;
 const radius=Math.max(2,Math.min(8,Math.ceil(letterHeight*.12))),keep=new Set(letters.map(p=>p.id));
 for(const p of candidates)if(p.height<letterHeight*.45&&p.bottom>=top-radius&&p.top<=bottom&&p.right>=left&&p.left<=right)keep.add(p.id);
 const distance=new Uint8Array(count);distance.fill(255);let head=0,tail=0;
 for(let p=0;p<count;p++)if(keep.has(labels[p])){distance[p]=0;queue[tail++]=p;}
 // Retain the soft halo connected to the lettering, without regrowing rejected
 // dark text or a horizontal bar from a neighbouring part of the example.
 while(head<tail){const p=queue[head++];if(distance[p]>=radius)continue;neighbours(p,next=>{if(distance[next]===255&&data[next*4+3]&&(!labels[next]||keep.has(labels[next]))){distance[next]=distance[p]+1;queue[tail++]=next;}});}
 for(let p=0;p<count;p++)if(distance[p]===255)data[p*4+3]=0;
 return true;
}
export function referenceBadge(image,crop,makeCanvas){
 let saved=cache.get(image);if(!saved){saved=new Map();cache.set(image,saved);}
 const key=JSON.stringify(crop);if(saved.has(key))return saved.get(key);
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,sw=iw*crop.width,sh=ih*crop.height,scale=Math.min(1,1024/sw,512/sh);
 const canvas=makeCanvas();canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
 const ctx=canvas.getContext('2d');ctx.drawImage(image,iw*crop.x,ih*crop.y,sw,sh,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),{data,width,height}=pixels,n=Math.max(1,Math.min(4,Math.floor(Math.min(width,height)/6)));
 const depth=Math.max(n,Math.min(32,Math.floor(height/3)));
 const corner=(right,bottom)=>[0,1,2].map(channel=>{const values=[];for(let y=0;y<depth;y++)for(let x=0;x<n;x++)values.push(data[((bottom?height-1-y:y)*width+(right?width-1-x:x))*4+channel]);return median(values);});
 const tl=corner(false,false),tr=corner(true,false),bl=corner(false,true),br=corner(true,true);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,fx=x/Math.max(1,width-1),fy=y/Math.max(1,height-1),bg=tl.map((v,c)=>(v*(1-fx)+tr[c]*fx)*(1-fy)+(bl[c]*(1-fx)+br[c]*fx)*fy);
  let alpha=0;for(let c=0;c<3;c++){const delta=data[i+c]-bg[c];alpha=Math.max(alpha,delta>=0?delta/Math.max(1,255-bg[c]):-delta/Math.max(1,bg[c]));}
  if(alpha<.12){data[i+3]=0;continue;}
  for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,(data[i+c]-bg[c]*(1-alpha))/alpha));
  data[i+3]=Math.round(data[i+3]*alpha);
 }
 if(!isolateLettering(pixels)){saved.set(key,null);return null;}
 ctx.putImageData(pixels,0,0);
 // The model's rectangle may include generous blank padding. Fit the visible
 // lettering and halo, not that padding, to the requested badge width.
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=40){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
 if(right>=left&&bottom>=top){
  left=Math.max(0,left-2);top=Math.max(0,top-2);right=Math.min(width-1,right+2);bottom=Math.min(height-1,bottom+2);
  const trimmed=makeCanvas();trimmed.width=right-left+1;trimmed.height=bottom-top+1;trimmed.getContext('2d').drawImage(canvas,left,top,trimmed.width,trimmed.height,0,0,trimmed.width,trimmed.height);saved.set(key,trimmed);return trimmed;
 }
 saved.set(key,canvas);return canvas;
}
