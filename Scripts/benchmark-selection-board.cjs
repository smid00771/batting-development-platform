// Optional first argument: checkout of the previous release with dependencies.
// Measures local JS/DOM work in jsdom, not network time or a user's device.
const path=require('node:path');
async function measure(root){
 const {openDemo}=require(path.join(root,'Tests/helpers/demo_harness.cjs')),h=await openDemo('selections');h.window.scrollBy=()=>{};
 try{
  const open=[],search=[];
  for(let i=0;i<7;i++){
   if(h.document.getElementById('sePicker')){h.document.querySelector('[data-se-close-picker]').click();await h.settle();}
   let start=performance.now();h.document.querySelector('[data-se-slot]').click();open.push(performance.now()-start);await h.settle();
   const input=h.document.getElementById('seSearch');start=performance.now();
   for(const value of ['a','al','alex','Alex Morgan','']){input.value=value;input.dispatchEvent(new h.window.Event('input'));}
   search.push((performance.now()-start)/5);await h.settle();
  }
  if(h.errors.length)throw h.errors[0];const median=a=>Math.round(a.slice(2).sort((a,b)=>a-b)[2]*100)/100;
  return {open_slot_ms:median(open),search_keystroke_ms:median(search)};
 }finally{await h.settle();h.close();}
}
(async()=>{const result={};if(process.argv[2])result.before=await measure(path.resolve(process.argv[2]));result.current=await measure(path.resolve(__dirname,'..'));console.log(JSON.stringify(result,null,2));})().catch(error=>{console.error(error);process.exitCode=1;});
