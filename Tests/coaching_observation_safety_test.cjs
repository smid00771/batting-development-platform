const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),demo=fs.readFileSync(path.join(__dirname,'../demo.html'),'utf8');
function fn(src,name){let start=src.indexOf('function '+name+'(');assert.ok(start>=0,name);if(src.slice(start-6,start)==='async ')start-=6;const next=src.slice(start+15).search(/\n(?:async )?function /);assert.ok(next>=0,name);return src.slice(start,start+15+next);}
function setup({observation=null,responses=[]}={}){
 const dom=new JSDOM('<main id="page"></main>'),document=dom.window.document,calls=[],saved=[],alerts=[];
 const c=vm.createContext({document,queueMicrotask,crypto:require('node:crypto').webcrypto,club:{id:'club'},session:{user:{id:'coach'}},coachingActionSavePending:false,matchArrivalsService:null,feedbackEntryBaselines:new WeakMap(),esc:x=>String(x??''),todayIso:()=> '2026-10-16',publishedEnabledFormats:()=>[['limited_overs','Limited Overs']],TRAINING_OBSERVATION_LABELS:{right_shots_right_balls:'Right shots to the right balls'},coachingVideoFields:()=>'',coachingVideoValues:()=>({video_url:null,video_note:null}),val:id=>document.getElementById(id)?.value.trim()||'',confirmLeaveWeeklyLoop:()=>true,confirmLeaveTeamReview:()=>true,confirmLeaveEngagement:()=>true,fixtureCorrectionState:null,confirm:()=>true,alert:message=>alerts.push(message),matchDraftAttachObservation(){},matchDraftConfirmed(){},matchDraftAfterAttempt(){},staffObservationStatus:(form,text)=>form.querySelector('#staffDevelopmentStatus').textContent=text,matchDraftRpc:async(form,name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args))});return responses.shift()||{data:{observation_id:'observation'}};}});
 for(const name of ['radioChoiceHtml','observationPurposeField','observationReviewField','observationConversationField','renderStaffTrainingObservationForm','freezeCoachingForm','feedbackEntryValues','wireObservationSave','confirmLeaveFeedbackEntry'])vm.runInContext(fn(source,name),c);
 document.getElementById('page').innerHTML=c.renderStaffTrainingObservationForm({id:'player',display_name:'Example Player'},{training_observations:observation?[observation]:[]},observation?.id);
 c.wireObservationSave({id:'player'},'training',async result=>saved.push(result));
 return {c,document,calls,saved,alerts,form:document.getElementById('staffDevelopmentForm'),save:()=>document.getElementById('saveTrainingObservation').onclick(),choose:()=>{document.querySelector('[name="staffTrainingToPlan"][value="mostly"]').checked=true;document.querySelector('[name="staffObservationType"]').checked=true;}};
}
test('new training assessments start unanswered and cannot save assumed judgements',async()=>{
 const h=setup();assert.equal(h.document.querySelectorAll('input[type="radio"]:checked').length,0);await h.save();assert.equal(h.calls.length,0);assert.match(h.document.getElementById('staffDevelopmentStatus').textContent,/Choose the two/);
 h.choose();await h.save();assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.p_values.training_to_plan,'mostly');
});
test('editing training preserves saved assessment choices',()=>{
 const h=setup({observation:{id:'saved',observer_user_id:'coach',training_to_plan:'yes',observation_type:'right_shots_right_balls',note:'Saved note'}});
 assert.equal(h.document.querySelector('[name="staffTrainingToPlan"]:checked').value,'yes');assert.equal(h.document.querySelector('[name="staffObservationType"]:checked').value,'right_shots_right_balls');assert.equal(h.document.getElementById('staffTrainingNote').value,'Saved note');
});
test('general training notes remain independent of Player Plan assessments',async()=>{
 const h=setup();h.document.getElementById('staffObservationGeneral').checked=true;h.document.getElementById('staffTrainingNote').value='Good communication';await h.save();assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.p_values.plan_related,false);assert.equal(h.calls[0].args.p_values.training_to_plan,undefined);
});
test('uncertain training save locks editing and resolves the same receipt before leaving',async()=>{
 const h=setup({responses:[{error:{message:'Response lost'}},{data:{observation_id:'saved'}}]});h.choose();h.document.getElementById('staffTrainingNote').value='Original note';await h.save();
 assert.equal(h.document.getElementById('staffTrainingNote').disabled,true);assert.equal(h.document.getElementById('cancelStaffDevelopment').disabled,true);assert.equal(h.document.getElementById('saveTrainingObservation').disabled,false);assert.equal(h.document.getElementById('saveTrainingObservation').textContent,'Retry save');assert.equal(h.c.confirmLeaveFeedbackEntry(),false);assert.equal(h.alerts.length,1);
 // Even a non-user DOM alteration cannot turn a retry into a second create.
 h.document.getElementById('staffTrainingNote').value='Later text';await h.save();assert.equal(h.calls.length,2);assert.deepEqual(h.calls[1],h.calls[0]);assert.equal(h.saved.length,1);assert.equal(h.form.dataset.observationSaveUnconfirmed,undefined);
});
test('missing receipt remains uncertain; definite rejection permits correction',async()=>{
 const h=setup({responses:[{data:{}},{error:{code:'P0001',message:'Correct this observation'}}]});h.choose();await h.save();assert.equal(h.form.dataset.observationSaveUnconfirmed,'true');await h.save();assert.equal(h.form.dataset.observationSaveUnconfirmed,undefined);assert.equal(h.document.getElementById('staffTrainingNote').disabled,false);assert.equal(h.document.getElementById('saveTrainingObservation').textContent,'Save observation');assert.deepEqual(h.calls[1],h.calls[0]);
});
test('production and demo share training assessment and save safety',()=>{
 for(const name of ['renderStaffTrainingObservationForm','wireObservationSave','confirmLeaveFeedbackEntry'])assert.equal(fn(source,name),fn(demo,name),name);
});
