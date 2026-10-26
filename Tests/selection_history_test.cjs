const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
async function seed(){
 const module=await import('../selection-history.js');
 const pair={entry:{person:{id:'return',name:'Alex Rowan'},team:{id:'fixture',grade_group_id:'first'}},target:{incumbent:{id:'current',name:'Chris Vale'},focus:'batting'}};
 const record={source_name:'Rowan, Alex',source_club:'Example Cricket Club',competition:'Example league',grade:'1st Grade',grade_id:'first',season:'2025/26',season_end:'2026-06-30',runs:180,innings:8,not_outs:2,wickets:4,conceded:80,balls:123};
 const data={identity_status:'unconfirmed_name_and_club',players:[{roster_id:'return',records:[record,{...record,season:'2026/27',season_end:'2027-06-30',runs:999}]}]};
 return {module,pair,record,data};
}
test('archive reference is explicitly unconfirmed, grade/season labelled, and never mixes current season or irrelevant discipline',async()=>{
 const {module,pair,data}=await seed(),before=JSON.stringify(data);let html=module.renderReturningHistory(data,pair,'2026-07-01');
 assert.match(html,/unconfirmed/);assert.match(html,/combine formats/);assert.match(html,/1st Grade/);assert.match(html,/2025\/26/);assert.match(html,/Avg 30.00 · 180 runs/);assert.match(html,/8 inns · 2 not out/);
 assert.doesNotMatch(html,/999|wickets|2026\/27/);assert.match(html,/No matching historical reference/);assert.equal(JSON.stringify(data),before);
 pair.target.focus='bowling';html=module.renderReturningHistory(data,pair,'2026-07-01');assert.match(html,/4 wickets · 20.3 overs · 80 runs/);assert.match(html,/Avg 20.00 · Econ 3.90/);assert.doesNotMatch(html,/180 runs/);
});
test('archive display escapes source names and handles unbeaten/wicketless records without inventing averages',async()=>{
 const {module,pair,record,data}=await seed();record.source_name='<img src=x>';record.not_outs=record.innings;
 let html=module.renderReturningHistory(data,pair,'2026-07-01');assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);assert.match(html,/Avg — · 180 runs/);
 pair.target.focus='bowling';record.wickets=0;html=module.renderReturningHistory(data,pair,'2026-07-01');assert.match(html,/0 wickets/);assert.match(html,/Avg — · Econ 3.90/);
});
test('history loads only on expansion, retries a failure, and discards a late reply after access changes',async()=>{
 const {module,pair,data}=await seed(),dom=new JSDOM('<dialog open><details data-return-history><summary>History</summary><div data-return-history-content></div></details></dialog>');
 const dialog=dom.window.document.querySelector('dialog'),details=dialog.querySelector('details');let calls=0,allowed=true,finish,reply=async()=>({error:{message:'offline'}});
 const supabase={rpc:async(name,args)=>{calls++;assert.equal(name,'club_selection_history_api');assert.deepEqual(args.p_data,{fixture_id:'fixture',roster_ids:['return','current']});return reply();}};
 module.bindReturningHistory(dialog,pair,{supabase,clubId:'club',seasonStart:'2026-07-01',here:()=>allowed});assert.equal(calls,0);
 details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));await tick();assert.match(dialog.textContent,/unavailable/);
 details.open=false;details.dispatchEvent(new dom.window.Event('toggle'));reply=()=>new Promise(r=>finish=r);details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));allowed=false;finish({data});await tick();assert.doesNotMatch(dialog.textContent,/180 runs/);
});
