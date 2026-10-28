// Reuse the supplied lettering, removing its local panel colour. Never OCR or
// regenerate words here: both labelled crops must already pass the shared contract.
const cache=new WeakMap(),median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
export function referenceBadge(image,crop,makeCanvas){
 let saved=cache.get(image);if(!saved){saved=new Map();cache.set(image,saved);}
 const key=JSON.stringify(crop);if(saved.has(key))return saved.get(key);
 const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,sw=iw*crop.width,sh=ih*crop.height,scale=Math.min(1,1024/sw,512/sh);
 const canvas=makeCanvas();canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
 const ctx=canvas.getContext('2d');ctx.drawImage(image,iw*crop.x,ih*crop.y,sw,sh,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),{data,width,height}=pixels,n=Math.max(1,Math.min(4,Math.floor(Math.min(width,height)/6)));
 const corner=(right,bottom)=>[0,1,2].map(channel=>{const values=[];for(let y=0;y<n;y++)for(let x=0;x<n;x++)values.push(data[((bottom?height-1-y:y)*width+(right?width-1-x:x))*4+channel]);return median(values);});
 const tl=corner(false,false),tr=corner(true,false),bl=corner(false,true),br=corner(true,true);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,fx=x/Math.max(1,width-1),fy=y/Math.max(1,height-1),bg=tl.map((v,c)=>(v*(1-fx)+tr[c]*fx)*(1-fy)+(bl[c]*(1-fx)+br[c]*fx)*fy);
  let alpha=0;for(let c=0;c<3;c++){const delta=data[i+c]-bg[c];alpha=Math.max(alpha,delta>=0?delta/Math.max(1,255-bg[c]):-delta/Math.max(1,bg[c]));}
  if(alpha<.12){data[i+3]=0;continue;}
  for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,(data[i+c]-bg[c]*(1-alpha))/alpha));
  data[i+3]=Math.round(data[i+3]*alpha);
 }
 ctx.putImageData(pixels,0,0);saved.set(key,canvas);return canvas;
}
