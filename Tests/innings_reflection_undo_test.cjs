const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,'../demo.html'),'utf8');
function fn(source,name){
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const next=source.slice(start+10).search(/\n(?:async )?function /);assert.ok(next>=0,name);
  return source.slice(start,start+10+next);
}
const names=['radioChoiceHtml','wireQuickChoices','coachingVideoFields','renderMyReflectionForm','freezeCoachingForm','inningsCommittedSnapshot','expectedInningsSnapshot','bindMyInningsSave'];
function setup({match=null,failure=null}={}){
  const dom=new JSDOM('<main id="page"></main>'),document=dom.window.document,calls=[],state={};
  const c=vm.createContext({document,Event:dom.window.Event,esc:x=>String(x??''),todayIso:()=> '2026-10-15',
    FORMATS:[['limited_overs','Limited Overs']],publishedEnabledFormats:()=>[['limited_overs','Limited Overs']],DEVELOPMENT_ISSUE_LABELS:{execution:'Execution'},
    coachingActionSavePending:false,confirmLeaveWeeklyLoop:()=>true,playerFixtureReady:()=>true,playerFixtureId:()=>null,club:{id:'club'},
    val:id=>document.getElementById(id)?.value.trim()||'',myInningsCache:{matches:[],preparations:[]},preparationUuid:()=> 'request-1',
    coachingVideoValues:()=>({video_url:document.getElementById('inningsVideoUrl').value,video_note:document.getElementById('inningsVideoNote').value}),
    matchDraftRpc:async(_form,name,args)=>{calls.push({name,args});return failure?{error:failure}:{data:{match_id:'saved-match'}};},
    matchDraftConfirmed(){},matchDraftAfterAttempt(){},definiteInningsSaveFailure:()=>false,
    feedbackEntryBaselines:new WeakMap(),feedbackEntryValues:form=>JSON.stringify([...form.querySelectorAll('input,select,textarea')].map(f=>[f.id,f.value,f.checked])),
    inningsSeason:()=> '2026',renderMyInnings:async options=>calls.push({render:options}),refreshMyCoachingUpdates:async()=>{}
  });
  for(const name of names)vm.runInContext(fn(app,name),c);
  document.getElementById('page').innerHTML=c.renderMyReflectionForm(match,{innings:true});
  c.wireQuickChoices(document);c.bindMyInningsSave(match,state,()=>true);
  const form=document.getElementById('myReflectionForm');
  const field=(id,value)=>{const element=document.getElementById(id);element.value=value;element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));return element;};
  const clickAnswer=(name,value)=>document.querySelector(`[name="${name}"][value="${value}"]`).click();
  return {c,document,form,calls,state,field,clickAnswer,button:()=>document.getElementById('clearInningsReflection'),save:()=>document.getElementById('saveMyReflection').onclick()};
}

test('an accidental reflection answer can be cleared without losing the innings draft',async()=>{
  const h=setup();assert.equal(h.button().hidden,true);
  h.field('reflectionScore','34*');h.field('reflectionDismissal','Pulled the short ball');
  h.field('inningsVideoUrl','https://youtu.be/abcdefghijk');h.field('inningsVideoNote','Watch the last over');
  h.clickAnswer('myBattingToPlan','yes');assert.equal(h.button().hidden,false);
  await h.save();assert.equal(h.calls.length,0);assert.match(h.document.getElementById('myReflectionStatus').textContent,/Choose both/);
  h.field('reflectionMainIssue','execution');h.field('reflectionNextFocus','Pull shot');h.field('reflectionNote','Optional reflection note');
  let draftChanges=0;h.form.addEventListener('change',()=>draftChanges++);
  h.button().click();
  assert.equal(h.document.querySelectorAll('#inningsReflectionPanel input:checked').length,0);
  assert.equal(h.document.querySelectorAll('#inningsReflectionPanel .selected').length,0);
  for(const id of ['reflectionMainIssue','reflectionNextFocus','reflectionNote'])assert.equal(h.document.getElementById(id).value,'');
  assert.equal(h.document.getElementById('reflectionScore').value,'34*');
  assert.equal(h.document.getElementById('reflectionDismissal').value,'Pulled the short ball');
  assert.equal(h.document.getElementById('inningsVideoUrl').value,'https://youtu.be/abcdefghijk');
  assert.equal(h.document.getElementById('inningsVideoNote').value,'Watch the last over');
  assert.equal(draftChanges,1);assert.equal(h.button().hidden,true);
  await h.save();const write=h.calls.find(call=>call.args);
  assert.equal(write.name,'save_my_fixture_innings');assert.equal(write.args.p_values.reflection,null);
  assert.equal(write.args.p_values.score_text,'34*');assert.equal(write.args.p_values.player_note,'Pulled the short ball');
  assert.equal(write.args.p_values.video_note,'Watch the last over');
});

test('the clear action also appears for optional reflection text without selected answers',()=>{
  const h=setup();h.field('reflectionNextFocus','Practise the cut');assert.equal(h.button().hidden,false);
  h.button().click();assert.equal(h.document.getElementById('reflectionNextFocus').value,'');assert.equal(h.button().hidden,true);
});

test('existing innings without a saved reflection can clear draft answers',()=>{
  const h=setup({match:{id:'match',score_text:'22',player_note:'Saved innings note',format_key:'limited_overs',match_date:'2026-10-10'}});
  h.clickAnswer('myDismissalClass','outside_plan');h.button().click();
  assert.equal(h.document.querySelectorAll('#inningsReflectionPanel input:checked').length,0);
  assert.equal(h.document.getElementById('reflectionScore').value,'22');assert.equal(h.document.getElementById('reflectionDismissal').value,'Saved innings note');
});

test('an existing saved reflection does not offer a misleading removal action',()=>{
  const h=setup({match:{id:'match',player_reflection:{batting_to_plan:'yes',dismissal_classification:'plan_execution',note:'Saved reflection'}}});
  assert.equal(h.button(),null);assert.equal(h.document.querySelectorAll('#inningsReflectionPanel input:checked').length,2);
  assert.equal(h.document.getElementById('reflectionNote').value,'Saved reflection');
});

test('clearing waits while a save is running or its result is uncertain',async()=>{
  const h=setup({failure:{message:'Connection interrupted'}});h.clickAnswer('myBattingToPlan','yes');h.clickAnswer('myDismissalClass','not_applicable');
  h.c.coachingActionSavePending=true;h.button().onclick();assert.equal(h.document.querySelectorAll('#inningsReflectionPanel input:checked').length,2);
  h.c.coachingActionSavePending=false;await h.save();h.button().click();
  assert.equal(h.document.querySelectorAll('#inningsReflectionPanel input:checked').length,2);
  assert.match(h.document.getElementById('myReflectionStatus').textContent,/Confirm the previous save/);
});

test('production and demo share the same reflection form and undo behavior',()=>{
  for(const name of ['renderMyReflectionForm','bindMyInningsSave'])assert.equal(fn(app,name),fn(demo,name));
});
