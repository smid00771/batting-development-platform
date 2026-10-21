import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {selectionGroupDraft,createSelectionGroups} from '../selection-groups.js';
const require=createRequire(import.meta.url),{JSDOM}=require('jsdom'),settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,0));};
const context=()=>({can_edit:true,revision:2,selection_groups:[],grades:[{id:'grade-a',name:'First XI'},{id:'grade-b',name:'Second XI'}],mappings:[],expected_grades:[{id:'grade-a',name:'First XI'},{id:'grade-b',name:'Second XI'}]});
const teams=[{id:'team-a',grade:{id:'source-a',name:'First XI'}},{id:'team-b',grade:{id:'source-b',name:'Second XI'}},{id:'team-c',name:'Club blue',grade:{id:'source-c',name:'Evening Cup'}}];
function harness({ctx=context(),sourceTeams=teams,save,confirm=()=>true}={}){const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.querySelector('#host'),calls=[],alerts=[];let captains=0;
 const ui=createSelectionGroups({here:()=>true,alert:x=>alerts.push(x),confirm,save:async data=>{calls.push(structuredClone(data));if(save)return save(data);return {...ctx,saved:true,revision:3,selection_groups:data.groups,grades:data.grades,mappings:data.grades.filter(g=>g.team_id).map(g=>({season_id:'season',team_id:g.team_id,grade_id:g.id}))};},captains:()=>captains++,manual:()=>{},fixtures:()=>{}});
 ui.mount(host,{context:ctx,teams:sourceTeams,season:'season',catalogue:'catalogue'});
 return {dom,host,ui,calls,alerts,captains:()=>captains,change(q,value){const el=host.querySelector(q);assert.ok(el,q);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));},input(q,value){const el=host.querySelector(q);assert.ok(el,q);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));},add(name){host.querySelector('[data-sg-new-name]').value=name;host.querySelector('[data-sg-new]').click();return [...host.querySelectorAll('[data-sg-group-name]')].at(-1).dataset.sgGroupName;},submit(){host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}};
}
function assignImports(h,group,ids=['team-a','team-b']){for(const id of ids)h.change(`[data-sg-import-group="${id}"]`,group);}
test('initial season setup saves empty groups without choosing source teams',async()=>{
 const ctx={...context(),grades:[],expected_grades:[]},h=harness({ctx});h.add('Future competition');assert.match(h.host.querySelector('form .se-actions .btn').textContent,/Save groups/);h.submit();await settle();assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].grades,[]);assert.equal(h.calls[0].groups[0].name,'Future competition');assert.match(h.host.textContent,/Selection Groups saved/);
});
test('a club without any season connection can create and reopen an empty group',async()=>{
 const dom=new JSDOM('<div id="host"></div>'),host=dom.window.document.querySelector('#host');let ctx={...context(),grades:[],expected_grades:[]},calls=[];
 const ui=createSelectionGroups({here:()=>true,alert:()=>{},confirm:()=>true,manage:async(action,data)=>{calls.push({action,data});ctx={...ctx,revision:3,selection_groups:[{id:'future',name:data.name}]};return ctx;}});
 ui.mount(host,{context:ctx});assert.ok(host.querySelector('[data-sgm-add-group]'));host.querySelector('[data-sgm-add-group]').click();const input=host.querySelector('[data-field="name"]');input.value='Future teams';input.dispatchEvent(new dom.window.Event('input'));host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await settle();assert.equal(calls[0].action,'add_group');assert.equal(calls[0].data.season_id,'');assert.match(host.textContent,/Future teams.*No teams yet/s);ui.mount(host,{context:ctx});assert.match(host.textContent,/Future teams/);assert.equal(host.querySelector('[data-sg-form]'),null);
});
test('imported teams define groups first; existing grades inherit matches on screen two; only final save writes',async()=>{
 const h=harness(),first=h.add('Weekend teams');assignImports(h,first);const second=h.add('Evening teams');assignImports(h,second,['team-c']);
 assert.equal(h.host.querySelectorAll('input[type=checkbox]').length,0);assert.equal(h.host.querySelectorAll('[data-sg-grade],[data-sg-align],[data-sg-existing-name]').length,0,'First screen only groups imported teams');
 h.submit();assert.equal(h.calls.length,0,'Next never writes setup');assert.match(h.host.textContent,/2. Match existing grades/);
 assert.equal(h.host.querySelector('[data-sg-align="grade-a"]').value,'team-a');assert.equal(h.host.querySelectorAll('[data-sg-grade]').length,0,'Matched grades need no second group assignment');
 assert.equal(h.host.querySelector('[data-sg-name="team-c"]').value,'Evening Cup');
 h.submit();await settle();assert.equal(h.calls.length,1);const data=h.calls[0];assert.deepEqual(data.grades.slice(0,2).map(g=>[g.id,g.selection_group_id]),[['grade-a',first],['grade-b',first]]);assert.equal(data.grades[2].selection_group_id,second);assert.equal(data.catalogue_id,'catalogue');assert.equal(h.ui.hasChanges(),false);
 h.host.querySelector('[data-sg-captains]').click();assert.equal(h.captains(),1);assert.ok(!h.host.textContent.includes('Newcastle'));
});
test('back preserves matches/names and moving an imported team changes its matched grade group',async()=>{
 const h=harness(),group=h.add('Main squad'),other=h.add('Other squad');assignImports(h,group);h.submit();
 h.input('[data-sg-existing-name="grade-a"]','Firsts');h.host.querySelector('[data-sg-back]').click();
 assert.equal(h.host.querySelector('[data-sg-import-group="team-a"]').value,group);assignImports(h,other,['team-a']);h.submit();
 assert.equal(h.host.querySelector('[data-sg-existing-name="grade-a"]').value,'Firsts');assert.equal(h.calls.length,0);h.submit();await settle();assert.equal(h.calls[0].grades[0].selection_group_id,other);
});
test('ambiguous names require existing-grade-to-imported-team matching, with imported choices grouped',async()=>{
 const d=selectionGroupDraft(context(),[{id:'t1',grade:{id:'s',name:'First XI (Sponsor)'}},{id:'t2',grade:{id:'s',name:'First XI (Sponsor)'}}],'season');assert.equal(d.available.length,2);assert.ok(d.rows.every(g=>!g.team_id));
 const ctx=context();ctx.grades[0].name='Firsts';const h=harness({ctx}),group=h.add('Main squad'),other=h.add('Other squad');assignImports(h,group,['team-a']);assignImports(h,other,['team-b']);h.submit();
 assert.equal(h.host.querySelector('[data-sg-align="grade-a"]').value,'');assert.equal(h.host.querySelector('[data-sg-align="grade-a"] optgroup').label,'Main squad');
 h.submit();await settle();assert.equal(h.calls.length,0,'Unresolved existing grades cannot write');
 h.change('[data-sg-align="grade-a"]','team-a');h.input('[data-sg-existing-name="grade-a"]','Our First XI');h.submit();await settle();assert.deepEqual(h.calls[0].grades[0],{id:'grade-a',name:'Our First XI',selection_group_id:group,team_id:'team-a'});
});
test('unconfirmed save retries the same request and blocks navigation or edits',async()=>{
 let attempts=0;const h=harness({save:async data=>{if(++attempts===1)throw Error('Connection lost');return {...context(),selection_groups:data.groups,grades:data.grades,mappings:[],saved:true};}}),g=h.add('Club squad');assignImports(h,g);h.submit();h.submit();await settle();
 assert.equal(h.ui.canLeave(),false);assert.equal(h.alerts.length,1);assert.equal(h.host.querySelector('[data-sg-back]').disabled,true);assert.equal(h.host.querySelector('[data-sg-existing-name]').disabled,true);h.submit();await settle();assert.deepEqual(h.calls[0],h.calls[1]);assert.equal(h.ui.hasChanges(),false);
});
test('server rejection preserves choices for correction and unsaved navigation is guarded',async()=>{
 const h=harness({save:async()=>{throw Object.assign(Error('Club setup changed. Reload before saving'),{code:'P0001'});},confirm:()=>false}),g=h.add('Senior teams');assignImports(h,g);h.submit();h.submit();await settle();
 assert.equal(h.ui.canLeave(),false);assert.equal(h.host.querySelector('[data-sg-existing-name="grade-a"]').disabled,false);assert.equal(h.host.querySelector('[data-sg-align="grade-a"]').value,'team-a');assert.match(h.host.textContent,/Club setup changed/);h.host.querySelector('[data-sg-back]').click();assert.equal(h.host.querySelector('[data-sg-import-group="team-a"]').value,g);
});
test('saved mappings win over names; reload never duplicates a confirmed grade',()=>{
 const ctx=context();ctx.mappings=[{season_id:'season',team_id:'team-c',grade_id:'grade-a'}];const draft=selectionGroupDraft(ctx,teams,'season');assert.equal(draft.rows.find(g=>g.id==='grade-a').team_id,'team-c');assert.equal(draft.available.some(t=>t.id==='team-c'),false);assert.equal(draft.rows.length,2);
});
test('Women teams with no provider grade join groups and become new club grades without duplicate controls',async()=>{
 const women=[{id:'women-first',name:"Example Women's 1st Grade",grade:null},{id:'women-second',name:"Example Women's 2nd Grade"}];
 const h=harness({sourceTeams:[...teams,...women]}),senior=h.add('Saturday teams');assignImports(h,senior);const group=h.add("Women's teams");
 for(const team of women){const source=h.host.querySelector(`[data-sg-source="${team.id}"]`);assert.equal(source.textContent.split(team.name).length-1,1);assignImports(h,group,[team.id]);}
 h.submit();assert.equal(h.calls.length,0);assert.equal(h.host.querySelectorAll(`[data-sg-match-group="${group}"] select`).length,0);
 h.input('[data-sg-name="women-first"]',"Women's First XI");h.submit();await settle();const added=h.calls[0].grades.slice(2);assert.equal(added.length,2);assert.deepEqual(added.map(g=>[g.name,g.team_id,g.selection_group_id]),[["Women's First XI",women[0].id,group],[women[1].name,women[1].id,group]]);assert.ok(added.every(g=>!g.source_grade_id));
});
test('ungraded team can match an existing grade while another grade is explicitly retained without an import',async()=>{
 const pending={id:'team-women',name:"Example Women's first team",grade:null},ctx=context(),h=harness({ctx,sourceTeams:[pending]}),group=h.add('Club squad');assignImports(h,group,[pending.id]);h.submit();
 h.change('[data-sg-align="grade-a"]',pending.id);h.change('[data-sg-align="grade-b"]','manual');h.change('[data-sg-grade="grade-b"]',group);h.submit();await settle();const saved=h.calls[0];assert.equal(saved.grades[0].id,'grade-a');assert.equal(saved.grades[0].team_id,pending.id);assert.equal(saved.grades[1].team_id,undefined);
 const later={...ctx,selection_groups:saved.groups,grades:saved.grades,mappings:[{season_id:'season',team_id:pending.id,grade_id:'grade-a',source_grade_id:null}]};const draft=selectionGroupDraft(later,[{...pending,grade:{id:'source-women',name:'New competition grade name'}}],'season');assert.equal(draft.rows.length,2);assert.equal(draft.rows[0].team_id,pending.id);assert.equal(draft.available.length,0);
});
test('existing Navy/Sky align to distinct imported teams in a shared source grade and retain names on reload',async()=>{
 const ctx=context();ctx.grades[0].name='Dev League Navy';ctx.grades[1].name='Dev League Sky';const sourceTeams=['Navy','Sky'].map(colour=>({id:'dev-'+colour,name:`Example Dev (${colour})`,grade:{id:'shared-source-grade',name:'Sponsored Development League'}}));
 const h=harness({ctx,sourceTeams}),group=h.add('Senior Saturday grades');assignImports(h,group,sourceTeams.map(t=>t.id));h.submit();
 for(const [i,t] of sourceTeams.entries()){h.change(`[data-sg-align="${ctx.grades[i].id}"]`,t.id);assert.ok(h.host.querySelector(`[data-sg-existing="${ctx.grades[i].id}"]`).textContent.includes(t.name));}
 assert.equal(h.host.querySelector('[data-sg-align="grade-b"] option[value="dev-Navy"]'),null,'One imported team cannot attach to two existing grades');assert.equal(h.host.querySelectorAll('[data-sg-new-team]').length,0,'Matching removes duplicate new-grade previews');
 h.submit();await settle();assert.deepEqual(h.calls[0].grades.map(g=>[g.id,g.name,g.team_id]),[['grade-a','Dev League Navy','dev-Navy'],['grade-b','Dev League Sky','dev-Sky']]);
 const saved={...ctx,selection_groups:h.calls[0].groups,grades:h.calls[0].grades,mappings:h.calls[0].grades.map(g=>({season_id:'season',team_id:g.team_id,grade_id:g.id}))};const reload=harness({ctx:saved,sourceTeams:sourceTeams.map(t=>({...t,grade:{...t.grade,name:'Renamed competition'}}))});reload.host.querySelector('[data-sg-edit]').click();assert.equal(reload.host.querySelector('[data-sg-import-group="dev-Navy"]').disabled,false,'Saved team can move to another Selection Group');reload.submit();assert.equal(reload.host.querySelector('[data-sg-align="grade-a"]').disabled,true,'Saved identity stays linked');assert.equal(reload.host.querySelector('[data-sg-existing-name="grade-a"]').value,'Dev League Navy');
});
test('new clubs need only groups and preferred names; unchosen imports never create grades',async()=>{
 const sourceTeams=['Navy','Sky'].map(colour=>({id:'new-'+colour,name:`Example Dev (${colour})`,grade:{id:'shared',name:'Development League'}})),ctx={...context(),grades:[],expected_grades:[]};const h=harness({ctx,sourceTeams:[...sourceTeams,{id:'omitted',name:'Cup team'}]}),group=h.add('Club teams');assignImports(h,group,sourceTeams.map(t=>t.id));h.submit();
 assert.equal(h.host.querySelectorAll('[data-sg-align]').length,0);assert.deepEqual([...h.host.querySelectorAll('[data-sg-name]')].map(el=>el.value),sourceTeams.map(t=>t.name));h.submit();await settle();assert.equal(h.calls[0].grades.length,2);
});
test('unmatched existing grades require a group; all manual fallback works without a season import',async()=>{
 const h=harness({sourceTeams:[]}),group=h.add('Club teams');h.submit();h.submit();await settle();assert.equal(h.calls.length,0);assert.match(h.host.textContent,/Choose a Selection Group/);
 for(const id of ['grade-a','grade-b'])h.change(`[data-sg-grade="${id}"]`,group);h.submit();await settle();assert.equal(h.calls[0].grades.length,2);assert.ok(h.calls[0].grades.every(g=>!g.team_id));
});
test('duplicate preferred names are rejected before writing any records',async()=>{
 const h=harness(),group=h.add('Club teams');assignImports(h,group,['team-a','team-b','team-c']);h.submit();h.input('[data-sg-name="team-c"]','First XI');h.submit();await settle();assert.equal(h.calls.length,0);assert.match(h.host.textContent,/distinct preferred name/);h.input('[data-sg-name="team-c"]','Evening XI');h.submit();await settle();assert.equal(h.calls[0].grades[2].name,'Evening XI');
});
