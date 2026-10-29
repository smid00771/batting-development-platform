import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSocialAwards} from '../social-awards.js';
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function setup(t){
 const dom=new JSDOM('<div id="socialContent"></div>',{url:'https://example.test/'});t.after(()=>dom.window.close());
 globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.localStorage=dom.window.localStorage;
 let allowed=true,settings={enabled:['team_week'],revision:0,milestone_alerts:false};const calls=[];
 const candidate={key:'match:century:innings:player',kind:'century',name:'Fictional Batter',player_id:'player',stat:{runs:100,not_out:true},signature:'current'};
 const launch={id:'alert',kind:'century',candidate,week_end:'2026-11-01',award_scope:{mode:'grades',ids:['grade'],key:'grades:grade',label:'1st Grade'}};
 const s={scope:'user:club',view:'awards',data:{awards:settings},urls:new Map()};let api;
 const context=()=>({settings,editions:[],photos:[],designs:{},requests:[],cards:[],candidates:[candidate]});
 api=createSocialAwards({escape:x=>String(x??''),here:()=>allowed,draw:()=>api.render(s),canLeave:()=>true,message(){},scopeRequest:async()=>({award_scope:{mode:'all'}}),
  supabase:{rpc:async(name,args)=>{calls.push(structuredClone(args));const d=args.p_data;
   if(args.p_action==='save_settings'){settings={enabled:d.enabled,revision:settings.revision+1,milestone_alerts:d.milestone_alerts};return {data:settings};}
   if(args.p_action==='milestone')return {data:launch};return {data:context()};
  }}
 });
 api.state(s).context=context();return {api,s,calls,dom,launch,revoke:()=>allowed=false};
}
test('the visible opt-in checkbox saves both achievements and survives a redraw',async t=>{
 const h=setup(t);h.api.render(h.s);let box=document.getElementById('saMilestoneAlerts');assert.equal(box.checked,false);box.click();
 assert.equal(document.querySelector('[data-sa-choice=century]').checked,true);assert.equal(document.querySelector('[data-sa-choice=five_wickets]').checked,true);
 document.getElementById('saSaveChoices').click();await settle();assert.equal(h.calls.find(c=>c.p_action==='save_settings').p_data.milestone_alerts,true);
 assert.equal(document.getElementById('saMilestoneAlerts').checked,true);assert.equal(document.getElementById('saSaveChoices').textContent,'Saved');
 document.getElementById('saMilestoneAlerts').click();document.getElementById('saSaveChoices').click();await settle();assert.equal(h.calls.filter(c=>c.p_action==='save_settings').at(-1).p_data.milestone_alerts,false);
});
test('an alert opens its exact player, award, week and team scope without posting',async t=>{
 const h=setup(t);assert.equal(await h.api.openMilestone(h.s,'alert'),true);const w=h.api.state(h.s);
 assert.equal(h.s.view,'century');assert.equal(w.focus,h.launch.candidate.key);assert.equal(w.end,'2026-11-01');
 const request=h.calls.find(c=>c.p_action==='context');assert.equal(request.p_data.milestone_id,'alert');assert.deepEqual(request.p_data.award_scope,h.launch.award_scope);
 assert.equal(h.calls.some(c=>['reserve_image','finish_image','publish'].includes(c.p_action)),false);
});
test('an alert response cannot change a different account or club screen',async t=>{
 const h=setup(t);h.revoke();assert.equal(await h.api.openMilestone(h.s,'alert'),false);assert.equal(h.s.view,'awards');
});
