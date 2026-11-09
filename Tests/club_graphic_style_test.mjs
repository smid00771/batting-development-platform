import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createClubGraphicSetup,preferredTeamRows,clubGraphicLayout,changedGradeLabels} from '../social-club-style.js';
import {graphicGrade} from '../social-graphic-design.js';
const context=()=>({preferences:{revision:0,grade_labels:[],style:{}},teams:[{id:'masters',name:'Masters'},{id:'women',name:'Women’s 2nd Grade'},{id:'dev',name:'Development League Navy'}],designs:{team_week:{revision:19,layout:{grade_labels:[{grade:'Masters',label:'MASTERS'},{grade:"Women's 2nd Grade",label:'W 2ND'},{grade:'Rippit Development League',label:'DEV'}]}},results:{revision:28,layout:{grade_labels:[{grade:'Masters',label:'MSTRs'}]}}}});
test('club setup surfaces disagreements, preserves women grades and confirms source variants without guessing Masters',()=>{
 const rows=preferredTeamRows(context());assert.equal(rows[0].label,'');assert.equal(rows[0].conflict,true);assert.equal(rows[1].label,'W 2ND');assert.equal(rows[2].label,'DEV');
 const pref={grade_labels:rows.map(r=>({grade:r.grade,label:r.label||'MASTERS'})),style:{title_font:'condensed'}},old={title_y:19,grade_labels:[{grade:'Gilmour Cup Masters',label:'MSTRs'},{grade:'Rippit Development League',label:'Old'},{grade:"Women's 1st Grade",label:'W 1ST'}]};
 const result=clubGraphicLayout(old,pref);assert.equal(graphicGrade('Gilmour Cup Masters',result),'MASTERS');assert.equal(graphicGrade('Rippit Development League',result),'DEV');assert.equal(graphicGrade("Newcastle Women's 1st Grade",result),'W 1ST');assert.equal(graphicGrade("Newcastle Women's 2nd Grade",result),'W 2ND');assert.equal(result.title_y,19);assert.equal(old.grade_labels[0].label,'MSTRs');assert.deepEqual(changedGradeLabels(result,{...result,title_size:50}),[]);
});
test('preference saves retain uncertain request IDs, visible Undo and saved history restores',async()=>{
 const dom=new JSDOM('<main id="socialContent"></main>');globalThis.document=dom.window.document;globalThis.confirm=()=>true;const c=context(),requests=[],s={scope:'user:club',view:'club_award_setup',data:{}};let lost=true;
 const api=createClubGraphicSetup({supabase:{rpc:async(_,a)=>{requests.push(structuredClone(a));if(a.p_action==='context')return {data:structuredClone(c)};if(a.p_action==='save_preferences'){if(lost){lost=false;return {error:{message:'Connection lost'}};}c.preferences={...a.p_data,revision:1};return {data:structuredClone(c)};}if(a.p_action==='history')return {data:{versions:[{id:'v1',revision:0,saved_at:'2026-11-09'}]}};if(a.p_action==='restore')return {data:structuredClone(c)};throw Error('Unexpected action');}},escape:v=>String(v).replaceAll('"','&quot;'),here:()=>true,message:(_,m)=>s.notice=m,invalidate:()=>{},open:()=>{}});
 await api.load(s);api.render(s);const input=document.getElementById('cgLabel0');assert.equal(input.value,'');input.value='MASTERS';input.dispatchEvent(new dom.window.Event('input'));assert.equal(document.getElementById('cgUndo').disabled,false);assert.equal(api.canLeave(s),false);
 await document.getElementById('cgSave').onclick();assert.ok(api.state(s).pending);assert.equal(document.getElementById('cgSave').disabled,false);assert.equal(document.getElementById('cgLabel0').disabled,true);await document.getElementById('cgSave').onclick();assert.equal(api.canLeave(s),true);
 const saves=requests.filter(x=>x.p_action==='save_preferences');assert.deepEqual(saves[0].p_data,saves[1].p_data);assert.equal(s.data.graphic_preferences.grade_labels[0].label,'MASTERS');
 await document.getElementById('cgPreferencesHistory').onclick();await document.querySelector('[data-cg-restore]').onclick();assert.equal(requests.at(-1).p_action,'restore');assert.equal(api.state(s).pending,null);
});
