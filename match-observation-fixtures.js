// One saved fixture supplies the identity for an individual match observation.
// This controller loads only when the observation editor is opened.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normal=v=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const dates=f=>(f.days?.length?f.days:[f.match_date]).map(d=>typeof d==='string'?d:d.date);

export async function mountObservationFixtures(h){
 let form=h.form,context,feedback=h.feedback,selected='',day='',group='',innings=1;
 const initialMatch=form.dataset.matchId||null;
 const live=()=>form.isConnected&&h.current(form);
 const findMatch=id=>(feedback?.matches||[]).find(m=>m.id===id);
 const setLoading=message=>{form.querySelector('#saveStaffMatchFeedback').disabled=true;form.querySelector('#staffDevelopmentStatus').textContent=message;};
 setLoading('Loading fixtures…');form.dataset.playerFixtureLoading='true';form.querySelector('[data-observation-body]').hidden=true;
 try{
  context=await h.load(initialMatch);if(!live())return;
  if(!Array.isArray(context?.fixtures)||!Array.isArray(context?.groups)||!Array.isArray(context?.player_innings))throw Error('The saved fixtures could not be checked. Reopen this observation.');
  if(!feedback)feedback=await h.loadFeedback();if(!live())return;
  if(feedback?.observation_edit_error||feedback?.coaching_actions_error)throw Error('The current observations could not be checked. Reopen this observation.');
  const original=findMatch(initialMatch),linked=context.fixtures.find(f=>f.id===context.linked_fixture_id);
  if(context.linked_fixture_id&&!linked)throw Error('This innings’ fixture is unavailable. Ask your Club Admin to check the team.');
  day=original?.match_date||h.today();innings=Number(original?.innings_number)||1;
  const playerGroups=(h.player.groups||[]).filter(g=>g.active!==false&&context.groups.some(allowed=>allowed.id===g.id));
  group=linked?.group_id||(playerGroups.length===1?playerGroups[0].id:'');
  selected=linked?.id||(initialMatch?'__individual__':context.fixtures.some(f=>f.id===h.initialFixture)?h.initialFixture:'');
  if(!initialMatch&&selected){const restored=context.fixtures.find(f=>f.id===selected);day=restored.match_date;group=restored.group_id;innings=Number(h.initialInnings)||1;}
  function choices(){return context.fixtures.filter(f=>(!group||f.group_id===group)&&(!day||dates(f).includes(day))&&(!initialMatch||f.match_date===original.match_date&&f.format_key===original.format_key&&normal(f.opposition)===normal(original.opposition)));}
  function autoChoose(){const list=choices();selected=list.length===1?list[0].id:'';if(selected)group=list[0].group_id;}
  if(!selected)autoChoose();
  function matchFor(f){
   if(initialMatch)return findMatch(initialMatch);
   const linkedIds=context.player_innings.filter(m=>m.fixture_id===f?.id&&Number(m.innings_number)===innings).map(m=>m.match_id);
   if(linkedIds.length>1)throw Error('More than one innings is linked here. Open the correct entry from All innings.');
   if(linkedIds.length){const match=findMatch(linkedIds[0]);if(!match)throw Error('The player’s innings changed. Reopen this observation.');return match;}
   if(!f)return null;
   // An unlinked legacy innings is only reused when its match identity is unique.
   const sameIdentity=m=>m.match_date===f.match_date&&m.format_key===f.format_key&&normal(m.opposition)===normal(f.opposition);
   const unlinked=(feedback.matches||[]).filter(m=>sameIdentity(m)&&Number(m.innings_number||1)===innings&&!context.player_innings.some(link=>link.match_id===m.id&&link.fixture_id));
   if(unlinked.length&&(unlinked.length>1||context.fixtures.filter(sameIdentity).length!==1))throw Error('Existing innings need checking. Open the correct entry from All innings to link it to this fixture.');
   return unlinked[0]||null;
  }
  function change(next,control,previous){
   if(!live())return;control.value=previous;
   if(h.restoring(form))return;
   if(!h.canLeave())return;
   h.discard(form);
   if('day' in next)day=next.day;if('group' in next)group=next.group;
   if('selected' in next){selected=next.selected;const f=context.fixtures.find(x=>x.id===selected);if(f){group=f.group_id;if(!dates(f).includes(day))day=f.match_date;innings=f.format_key==='long_form'?innings:1;}}
   else if('innings' in next)innings=next.innings;
   else{innings=1;autoChoose();}
   draw();
  }
  function draw(){
   if(!live())return;
   const fixture=context.fixtures.find(f=>f.id===selected),legacy=selected==='__individual__';let match=null,problem='';
   try{match=matchFor(fixture);}catch(error){problem=error.message;}
   const ready=!!(fixture||legacy)&&!problem;
   const replacement=form.ownerDocument.createElement('div');replacement.innerHTML=h.render(feedback,match?.id||null);
   const next=replacement.querySelector('#staffDevelopmentForm');if(!next)throw Error('This observation could not be opened.');
   form.replaceWith(next);form=next;
   form.dataset.fixtureId=fixture?.id||'';
   const head=form.querySelector('.development-form-head'),picker=form.ownerDocument.createElement('div');picker.id='individualMatchFixture';picker.className='observation-fixture-picker';
   const list=choices();
   picker.innerHTML=`<div class="observation-fixture-filters"><div class="field"><label for="staffObservationDate">Date</label><input id="staffObservationDate" type="date" value="${esc(day)}" ${initialMatch?'disabled':''}></div><div class="field"><label for="staffObservationGrade">Team</label><select id="staffObservationGrade" ${initialMatch?'disabled':''}><option value="">All teams</option>${context.groups.map(g=>`<option value="${esc(g.id)}" ${g.id===group?'selected':''}>${esc(g.name)}</option>`).join('')}</select></div></div><div class="field" ${list.length===1&&selected!=='__individual__'&&selected||legacy&&!list.length?'hidden':''}><label for="staffObservationFixture">Match</label><select id="staffObservationFixture" ${context.linked_fixture_id?'disabled':''}><option value="">${list.length?'Choose the match':'No fixture on this date'}</option>${legacy?'<option value="__individual__" selected>Existing innings</option>':''}${list.map(f=>`<option value="${esc(f.id)}" ${selected===f.id?'selected':''}>${esc(f.grade)} · ${esc(f.opposition)}${f.start?' · '+esc(f.start):''} · ${esc(h.format(f.format_key))}</option>`).join('')}</select></div><p class="help observation-fixture-empty" ${ready?'hidden':''}>${esc(problem||(!list.length?(h.linked()?'No saved fixture for this date and team. Check Fixtures in Mirelion Select.':'No saved fixture for this date and team. Your Club Admin can download or add it in Fixtures.'):'Choose a match to add an observation.'))}</p>`;
   head.after(picker);
   const summary=form.querySelector('[data-observation-match-summary]');
   if(fixture){
    const values={staffMatchDate:fixture.match_date,staffMatchFormat:fixture.format_key,staffMatchOpposition:fixture.opposition,staffMatchInningsNumber:innings};
    for(const [id,value] of Object.entries(values)){const field=form.querySelector('#'+id);if(field.tagName==='SELECT'&&![...field.options].some(o=>o.value===String(value))){const option=form.ownerDocument.createElement('option');option.value=value;option.textContent=h.format(value);field.append(option);}field.value=value;}
    summary.textContent=[fixture.opposition,h.format(fixture.format_key),fixture.start,fixture.ground].filter(Boolean).join(' · ');
   }
   summary.hidden=!ready;
   const body=form.querySelector('[data-observation-body]');body.hidden=!ready;
   const inning=form.querySelector('#staffMatchInningsNumber');inning.closest('.field').hidden=!ready||(fixture?.format_key||match?.format_key)!=='long_form'&&innings===1;
   inning.disabled=!!initialMatch;
   picker.querySelector('#staffObservationDate').onchange=e=>change({day:e.target.value},e.target,day);
   picker.querySelector('#staffObservationGrade').onchange=e=>change({group:e.target.value},e.target,group);
   picker.querySelector('#staffObservationFixture').onchange=e=>change({selected:e.target.value},e.target,selected);
   inning.onchange=e=>change({innings:Number(e.target.value)||1},e.target,String(innings));
   form.querySelector('#cancelStaffDevelopment').onclick=h.close;
   h.wireChoices(form);
   h.wireSave({rpcName:legacy?'save_coach_observation':'save_individual_fixture_observation',extraArgs:legacy?{}:{p_club_id:h.clubId,p_group_id:fixture?.group_id||null,p_fixture_id:fixture?.id||null},lockUncertain:true,
    validate:values=>{if(!ready)throw Error(problem||'Choose a saved fixture first.');if(fixture)values.fixture_id=fixture.id;},
    onSaveState:state=>{form.dataset.fixtureSavePending=String(['saving','uncertain'].includes(state));}});
   form.querySelector('#saveStaffMatchFeedback').disabled=!ready;
   const arrival=form.querySelector('[data-match-arrival]');if(arrival)arrival.hidden=!fixture||!ready;
   if(fixture&&ready)h.bindArrivals(form,fixture);
   h.baseline(form);
  }
  draw();
 }catch(error){
  if(!live())return;delete form.dataset.playerFixtureLoading;form.dataset.playerFixtureError='true';setLoading(error.message||'Could not load fixtures.');
  const retry=form.ownerDocument.createElement('button');retry.type='button';retry.className='btn ghost';retry.textContent='Retry fixture loading';retry.onclick=()=>{retry.remove();mountObservationFixtures({...h,form});};form.querySelector('#staffDevelopmentStatus').after(retry);
 }
}
