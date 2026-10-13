/* Local text recognition. Images are passed to a browser worker, never to a reading service.
   Pinned Tesseract engine/language files download from jsDelivr; no image is sent there. */
export function teamWeekReadWords(tsv){
 return String(tsv||'').split('\n').slice(1).map(line=>{const p=line.split('\t');return {level:Number(p[0]),x:Number(p[6]),y:Number(p[7]),width:Number(p[8]),height:Number(p[9]),confidence:Number(p[10]),text:p.slice(11).join('\t').trim()};}).filter(w=>w.level===5&&w.text&&w.width>0&&w.height>0);
}
export function teamWeekReadLayout(tsv,width,height,candidateNames=[]){
 const normal=v=>String(v).toUpperCase().replace(/[^A-Z0-9]/g,''),known=new Set(candidateNames.map(normal));
 const words=teamWeekReadWords(tsv).sort((a,b)=>(a.y+a.height/2)-(b.y+b.height/2)||a.x-b.x),lines=[];
 for(const word of words){const y=word.y+word.height/2;let line=lines.find(l=>Math.abs(l.y-y)<Math.max(6,Math.min(l.height,word.height)*.55));if(!line){line={y,height:word.height,words:[]};lines.push(line);}line.words.push(word);}
 for(const line of lines){line.words.sort((a,b)=>a.x-b.x);line.text=line.words.map(w=>w.text).join(' ');}
 const title=lines.find(l=>normal(l.text).includes('TEAMOFTHEWEEK')),week=lines.find(l=>/^WEEK\b/i.test(l.text));
 const titleFloor=week?.y||title?.y||height*.25,rows=[];
 const gradeWord=text=>text.toUpperCase().replace(/^[I1][8S5]T$/, '1ST').replace(/^2N[DO0]$/,'2ND').replace(/^3R[DO0]$/,'3RD').replace(/^4T[H4]$/,'4TH');
 for(const line of lines){
  if(line.y<=titleFloor)continue;
  const nameWords=line.words.filter(w=>w.x<width*.53&&/^[A-Za-z][A-Za-z'’.-]*$/.test(w.text)),name=nameWords.map(w=>w.text).join(' ');
  const grade=line.words.filter(w=>w.x>width*.78).map(w=>gradeWord(w.text)).find(v=>/^\d+(ST|ND|RD|TH)$/.test(v));
  if(nameWords.length<2||(!grade&&!known.has(normal(name))))continue;
  const figures=line.words.filter(w=>w.x>=width*.53&&w.x<width*.8);
  rows.push({name,grade:grade||'',y:line.y,left:nameWords[0].x,height:Math.max(...nameWords.map(w=>w.height)),figuresRight:figures.length?Math.max(...figures.map(w=>w.x+w.width)):null,gradeRight:grade?Math.max(...line.words.filter(w=>w.x>width*.78).map(w=>w.x+w.width)):null});
 }
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,Math.round(n))),median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;},layout={};
 if(title){layout.title_y=clamp(title.y/height*1350,0,1300);layout.title_size=clamp(title.height/width*1080/.75,40,160);}
 if(week)layout.week_y=clamp(week.y/height*1350,0,1320);
 if(rows.length>=2){layout.top=clamp(rows[0].y/height*1350,50,1200);layout.bottom=clamp(rows.at(-1).y/height*1350,Math.max(150,layout.top+100),1320);layout.left=clamp(median(rows.map(r=>r.left))/width*1080,20,160);layout.font_scale=clamp(median(rows.map(r=>r.height))/width*1080/.75/49*100,75,120);const figures=median(rows.map(r=>r.figuresRight)),grades=median(rows.map(r=>r.gradeRight));if(figures)layout.figures_right=clamp(figures/width*1080,650,910);if(grades)layout.grade_right=clamp(grades/width*1080,950,1060);}
 return {layout,names:rows.slice(0,20).map(({name,grade})=>({name,grade})),hasTitle:!!title};
}
export async function readTeamWeekReference(example,background,{candidateNames=[],textColour='#FFFFFF',progress=()=>{},workerFactory}={}){
 let worker,expired=false,timer;
 const job=(async()=>{
  progress('Loading image reader…');
  const createWorker=workerFactory||(await import('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.esm.min.js')).default.createWorker;
  worker=await createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0',logger:m=>{if(m.status==='recognizing text')progress('Reading example… '+Math.round(m.progress*100)+'%');}});
  if(expired){await worker.terminate();throw Error('Reading timed out.');}
  await worker.setParameters({tessedit_pageseg_mode:'11'});
  async function recognize(blob,mask){
   const url=URL.createObjectURL(blob);try{const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Image could not load.'));i.src=url;});const scale=Math.min(2,2000/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
    if(mask){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),dark=parseInt(textColour.slice(1,3),16)+parseInt(textColour.slice(3,5),16)+parseInt(textColour.slice(5,7),16)<384;for(let i=0;i<pixels.data.length;i+=4){const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2],ink=dark?Math.max(r,g,b)<95:Math.min(r,g,b)>185&&Math.max(r,g,b)-Math.min(r,g,b)<55;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=ink?0:255;pixels.data[i+3]=255;}ctx.putImageData(pixels,0,0);}
    const {data}=await worker.recognize(canvas,{}, {text:true,tsv:true});return teamWeekReadLayout(data.tsv,canvas.width,canvas.height,candidateNames);
   }finally{URL.revokeObjectURL(url);}
  }
  let result=await recognize(example,true);if(result.names.length<4){const plain=await recognize(example,false);if(plain.names.length>result.names.length)result=plain;}
  if(!result.names.length&&!Object.keys(result.layout).length)throw Error('Text could not be read. Adjust the layout and edit example names.');
  if(background){const bg=await recognize(background,true);result.layout.includes_title=bg.hasTitle;}else result.layout.includes_title=false;
  return {layout:result.layout,names:result.names};
 })();
 try{return await Promise.race([job,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Reading took too long. Adjust the layout and edit example names.'));},60000);})]);}finally{clearTimeout(timer);if(worker)await worker.terminate();}
}
