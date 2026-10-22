import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createSocialAwardLabels} from '../social-award-labels.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
function setup(){
 const dom=new JSDOM('<main></main>'),host=dom.window.document.querySelector('main'),end='2026-10-18';
 const s={scope:'user:club-a',week:{end},playerWeek:{end},awards:{end}},requests=[],saved=new Map();let fail=false;
 const base=()=>({week_end:end,mode:'round',revision:1,label:'Round 2',override:'Round 2',suggested_round:null,needs_label:false,reason:'Teams have different round numbers.'});
 const api={rpc:async(_,args)=>{requests.push(structuredClone(args));const key=args.p_club_id+':'+args.p_data.week_end;if(args.p_action==='context')return {data:saved.get(key)||{...base(),week_end:args.p_data.week_end,label:args.p_data.week_end===end?'Round 2':null,needs_label:args.p_data.week_end!==end}};if(fail)return {error:{message:'Connection lost'}};const data={...base(),week_end:args.p_data.week_end,label:args.p_data.label,mode:args.p_data.mode,revision:args.p_data.revision+1};saved.set(key,data);return {data};}};
 let labels;const draw=()=>{host.innerHTML=labels.controls(s,end,String,false);labels.bind(s,end,host);};
 labels=createSocialAwardLabels({supabase:api,here:()=>true,draw,canEdit:()=>true,message:(_,m)=>s.notice=m});
 return {s,end,host,dom,labels,draw,requests,setFail:v=>fail=v};
}
test('one accepted label is shared by all five award types and persists across a fresh club session',async()=>{
 const h=setup();await h.labels.load(h.s,h.end);await h.labels.save(h.s,h.end,'Round 2');
 for(const w of [h.s.week,h.s.playerWeek,h.s.awards])assert.equal(w.title,'Round 2');
 const fresh={scope:h.s.scope};assert.equal((await h.labels.load(fresh,h.end)).label,'Round 2');
 assert.equal((await h.labels.load(fresh,'2026-10-25')).label,null,'Round 2 is not carried into another week');assert.equal(h.labels.ready(fresh,'2026-10-25'),false);
 const other={scope:'user:club-b'};await h.labels.load(other,h.end);await h.labels.save(other,h.end,'Matchday 7');assert.equal(h.labels.state(h.s).weeks[h.end].label,'Round 2');assert.equal(h.requests.at(-1).p_club_id,'club-b');
});
test('shared label controls preview and undo without a write; Apply uses the displayed proposal',async()=>{
 const h=setup();await h.labels.load(h.s,h.end);h.draw();const input=h.host.querySelector('#awardWeekLabel');input.value='Round 3';input.dispatchEvent(new h.dom.window.Event('change'));
 for(const w of [h.s.week,h.s.playerWeek,h.s.awards])assert.equal(w.title,'Round 3');assert.equal(h.labels.ready(h.s,h.end),false);assert.equal(h.labels.canLeave(h.s),false);assert.equal(h.requests.filter(x=>x.p_action==='save').length,0);
 h.host.querySelector('#awardLabelUndo').click();for(const w of [h.s.week,h.s.playerWeek,h.s.awards])assert.equal(w.title,'Round 2');assert.equal(h.labels.ready(h.s,h.end),true);
});
test('uncertain label saves retry the identical command and never permit a different label',async()=>{
 const h=setup();await h.labels.load(h.s,h.end);h.setFail(true);await assert.rejects(h.labels.save(h.s,h.end,'Round 3'),/Save not confirmed/);const original=h.requests.at(-1).p_data;
 await assert.rejects(h.labels.save(h.s,h.end,'Round 4'),/original/);h.setFail(false);await h.labels.save(h.s,h.end,'Round 3');assert.deepEqual(h.requests.at(-1).p_data,original);assert.equal(h.labels.ready(h.s,h.end),true);
});
