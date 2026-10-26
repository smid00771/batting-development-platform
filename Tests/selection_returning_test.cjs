const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
 const {selectionReturningFixture}=await import('./fixtures/selection_returning_fixture.mjs');
 const engine=await import('../selection-returning.js'),stats=await import('../season-stats.js'),f=selectionReturningFixture();
 const find=(extra={})=>engine.returningPlayers({teams:stats.resolveSelectionStatsTeams([f.draft],f.context.season,f.references),references:stats.resolveSelectionStatsTeams(f.references,f.context.season),roster:f.roster,season:f.context.season,today:f.context.today,eligible:()=>true,...extra});
 return {f,engine,stats,find};
}
test('a confirmed player returning after two unavailable games is matched to current role-compatible places',async()=>{
 const {f,find}=await setup(),before=JSON.stringify(f),rows=find();
 assert.equal(rows.length,1);const entry=rows[0];assert.equal(entry.person.id,f.person.id);assert.equal(entry.missed.length,2);
 assert.equal(entry.previous.days[0].date,'2026-10-10');assert.equal(entry.position,1);
 assert.equal(entry.targets[0].incumbent.id,'cover');assert.equal(entry.targets[0].joinedDuringAbsence,true);
 assert.deepEqual(entry.targets.map(t=>t.position),[1,2]);assert.equal(JSON.stringify(f),before);
});
test('unanswered dates, unavailable now, inactive players and unconfirmed old drafts cannot establish a return',async()=>{
 for(const mutate of [
  f=>f.person.availability.unavailable_dates=[],
  f=>f.person.availability.unavailable_dates=['2026-10-17'],
  f=>f.person.availability.available_dates=[],
  f=>f.person.availability.unavailable_dates.push('2026-10-31'),
  f=>f.person.active=false,
  f=>f.references.forEach(t=>t.published=null),
  f=>f.draft.returningEligible=false,
  f=>f.draft.days[0].date='2026-10-25',
  f=>f.draft.cancelled=true
 ]){const h=await setup();mutate(h.f);assert.equal(h.find().length,0);}
});
test('returns respect current selection, overlap eligibility, grade IDs, formats and season boundaries',async()=>{
 for(const mutate of [
  f=>f.draft.slots[0].d1=f.person.id,
  f=>f.draft.grade_group_id='unrelated-grade',
  f=>f.draft.format='t20',
  f=>f.context.season.start='2026-10-11'
 ]){const h=await setup();mutate(h.f);assert.equal(h.find().length,0);}
 const h=await setup();let checked=0;assert.equal(h.find({eligible:()=>{checked++;return false;}}).length,0);assert.ok(checked>0);
 assert.equal(h.find({eligible:undefined}).length,0,'Missing overlap check fails closed');
 // A later confirmed move to another grade must not be described as an absence.
 const other=h.f.references.find(t=>t.grade==='2nd Grade'&&t.days[0].date==='2026-10-24');other.published.slots[0]={d1:h.f.person.id};
 assert.equal(h.find().length,0);
});
test('two-day returns respect each selected day and keep an unbracketed XI together',async()=>{
 const h=await setup(),f=h.f;f.draft.days.push({date:'2026-11-07',start:'10:00'});f.draft.brackets=true;
 f.draft.slots.forEach(slot=>slot.d2=slot.d1);f.draft.slots[0].d2='g1p1';
 let entry=h.find()[0];assert.ok(entry);assert.deepEqual(entry.availableDays,[0]);assert.deepEqual(entry.targets[0].days,[0]);
 f.draft.brackets=false;assert.equal(h.find().length,0);
 f.person.availability.available_dates.push('2026-11-07');f.draft.slots[0].d2='cover';
 entry=h.find()[0];assert.deepEqual(entry.targets[0].days,[0,1]);
});
test('keeping, bowling type/workload and batting position checks constrain possible replacements',async()=>{
 const h=await setup(),{person,cover,draft}=h.f;
 cover.keeper=true;assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id===cover.id));
 cover.keeper=false;draft.match_roles={d1:{keeper_id:cover.id}};assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id===cover.id));
 person.keeper=true;assert.equal(h.find()[0].targets[0].incumbent.id,cover.id);
 Object.assign(cover,{bowling:'pace',bowling_load:'frontline'});Object.assign(person,{bowling:'spin',bowling_load:'frontline'});
 assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id===cover.id));
 person.bowling='pace';person.bowling_load='part_time';assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id===cover.id));
 person.bowling_load='frontline';assert.equal(h.find()[0].targets[0].incumbent.id,cover.id);
 Object.assign(person,{bowling:'none',batting:'unknown'});assert.equal(h.find()[0].targets.length,0,'Keep the return reminder without inventing a role');
});
test('a vacant previous place is identified without nominating somebody to drop',async()=>{
 const h=await setup();h.f.draft.slots[0]={d1:null};const target=h.find()[0].targets.find(t=>t.position===1);
 assert.ok(target);assert.equal(target.incumbent,null);
});
test('a single missed game qualifies, while cancelled and no-play fixtures do not count as missed games',async()=>{
 const h=await setup(),f=h.f,previous=f.references.find(t=>t.grade==='1st Grade'&&t.days[0].date==='2026-10-17');
 previous.published.slots[0]={d1:f.person.id};f.person.availability.unavailable_dates=['2026-10-24'];
 assert.equal(h.find()[0].missed.length,1);
 const missed=f.references.find(t=>t.grade==='1st Grade'&&t.days[0].date==='2026-10-24');
 assert.equal(h.find({noPlay:[missed.id]}).length,0);
 missed.cancelled=true;assert.equal(h.find().length,0,'An old published snapshot does not undo a cancellation');
});
test('comparison separates pre-absence form from the incumbent’s exact cover games and exposes small samples',async()=>{
 const h=await setup(),entry=h.find()[0],summary=h.stats.buildSeasonStats(h.f.context),pair=h.engine.returningComparison(entry,entry.targets[0],summary);
 assert.equal(pair.incoming.matches,2);assert.equal(pair.incoming.average,40);assert.equal(pair.incoming.runs,80);
 assert.equal(pair.current.matches,2);assert.equal(pair.current.average,7.5);assert.equal(pair.current.runs,15);
 assert.match(pair.notes.join(' '),/higher batting average/);assert.match(pair.notes.join(' '),/Too few batting opportunities/);
 // Strong cover performances must favour the current player in the raw comparison.
 for(const card of h.f.context.cards)for(const bat of card.scorecard.innings[0].batters)if(bat.player_id==='source-cover')bat.runs=60;
 const changed=h.engine.returningComparison(entry,entry.targets[0],h.stats.buildSeasonStats(h.f.context));
 assert.equal(changed.current.average,60);assert.match(changed.notes.join(' '),/lower batting average/);
});
test('period metrics preserve not-outs, DNBs, wicketless spells, partial overs and incomplete figures',async()=>{
 const {engine}=await setup();
 const row=engine.returningPeriod([{date:'2026-10-10',batting_available:true,bowling_available:true,batting:[{runs:30,not_out:true},{dnb:true}],bowling:[{runs:17,wickets:0,balls:23}]}]);
 assert.equal(row.innings,1);assert.equal(row.not_outs,1);assert.equal(row.average,null);assert.equal(row.wickets,0);assert.equal(row.bowling_balls,23);assert.equal(row.economy,17*6/23);
 const incomplete=engine.returningPeriod([{batting_available:true,batting_incomplete:true,bowling_available:true,batting:[{runs:5,not_out:false}],bowling:[{runs:10,wickets:1,balls:null}]}]);
 assert.equal(incomplete.batting_complete,false);assert.equal(incomplete.bowling_complete,false);assert.equal(incomplete.economy,null);
});
test('bowling comparisons use each period’s pooled wicket-taking and economy, including cases favouring the incumbent',async()=>{
 const h=await setup();for(const person of [h.f.person,h.f.cover])Object.assign(person,{bowling:'pace',bowling_load:'frontline'});
 for(const [index,card] of h.f.context.cards.filter(c=>c.scorecard.grade==='1st Grade').entries())card.scorecard.innings[1].bowlers.push({player_id:index<2?'source-g1p0':'source-cover',team_id:'us',wickets:index<2?3:1,runs:index<2?20:35,balls:index<2?65:48,importable:true});
 const entry=h.find()[0],pair=h.engine.returningComparison(entry,entry.targets[0],h.stats.buildSeasonStats(h.f.context));
 assert.equal(pair.incoming.wickets,6);assert.equal(pair.incoming.bowling_balls,130);assert.equal(pair.current.wickets,2);assert.equal(pair.current.bowling_balls,96);
 assert.match(pair.notes.join(' '),/more wickets per ball; lower economy/);
 for(const card of h.f.context.cards)for(const ball of card.scorecard.innings[1].bowlers)if(ball.player_id==='source-cover'){ball.wickets=5;ball.runs=10;}
 const better=h.engine.returningComparison(entry,entry.targets[0],h.stats.buildSeasonStats(h.f.context));
 assert.match(better.notes.join(' '),/fewer wickets per ball; higher economy/);
});
test('pre-absence form uses no more than three recent games and never includes another grade or format',async()=>{
 const h=await setup(),entry=h.find()[0],summary=h.stats.buildSeasonStats(h.f.context),row=summary.rows.find(r=>r.roster_id===entry.person.id);
 for(const day of ['2026-09-05','2026-09-12','2026-09-19'])row.history.push({date:day,batting_available:true,bowling_available:true,batting:[{runs:100,not_out:false}],bowling:[]});
 const pair=h.engine.returningComparison(entry,entry.targets[0],summary);assert.deepEqual(pair.incoming.dates,['2026-10-10','2026-10-03','2026-09-19']);assert.equal(pair.incoming.runs,180);
 row.format='t20';assert.equal(h.engine.returningComparison(entry,entry.targets[0],summary).incoming.matches,0);
});
async function uiSetup(compare=true){
 const h=await setup(),{createSelectionEvidence}=await import('../selection-evidence-ui.js');
 const dom=new JSDOM('<main></main>',{url:'https://example.invalid'}),host=dom.window.document.querySelector('main');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 let calls=0,allowed=true,reply=async()=>({data:h.f.context});
 const controller=createSelectionEvidence({here:()=>allowed,supabase:{rpc:async(name,args)=>{assert.equal(name,'club_season_stats_api');assert.equal(args.p_action,'context');calls++;return reply();}}});
 const options={scope:'user:club',clubId:'club',teams:[h.f.draft],referenceTeams:h.f.references,roster:h.f.roster,today:h.f.context.today,returningEnabled:true,returningEligible:()=>true};
 if(compare)dom.window.localStorage.setItem('club-selections-compare-returning:user:club','1');
 const mount=async()=>{host.innerHTML='<label><input data-evidence-toggle type="checkbox" checked>Show form indicators</label><label><input data-returning-toggle type="checkbox">Compare returning players</label><section data-se-team="next-first"><div class="se-team-head"><small class="se-team-state">Draft</small></div>'+h.f.draft.slots.filter(s=>s.d1).map(s=>`<div class="se-player-cell"><span data-se-evidence data-evidence-fixture="next-first" data-evidence-player="${s.d1}"></span></div>`).join('')+'<div class="se-actions"><button>Copy previous team</button></div></section>';controller.mount(host,options);await tick();};
 await mount();return {...h,dom,host,mount,controller,options,calls:()=>calls,allowed:v=>allowed=v,reply:fn=>reply=fn};
}
test('the current team and incumbent expose returning comparisons without saving or changing any player',async()=>{
 const h=await uiSetup(),before=JSON.stringify(h.f),button=h.host.querySelector('.se-return-person');
 assert.match(button.textContent,/↩Alex Rowan/);assert.equal(button.closest('details').open,false);assert.equal(h.host.querySelector('.se-team-head [data-return-control]'),null);assert.equal(h.host.querySelector('[data-return-control]').previousElementSibling.className,'se-actions');assert.match(h.host.querySelector('[data-return-control]').textContent,/Alex Rowan.*Similar roles in the current XI.*Chris Vale/s);assert.match(button.getAttribute('aria-label'),/Alex Rowan/);
 const marker=h.host.querySelector('[data-evidence-player="cover"] button');assert.match(marker.getAttribute('aria-label'),/Returning player comparison: Alex Rowan/);
 assert.ok(marker.closest('.se-return-linked'));marker.click();assert.match(h.host.querySelector('dialog').textContent,/Alex Rowan \/ Chris Vale/);
 assert.match(h.host.querySelector('dialog').textContent,/Before absence.*While away/s);assert.match(h.host.querySelector('dialog').textContent,/Batting · 40 average/);assert.match(h.host.querySelector('dialog').textContent,/Batting · 7.5 average/);
 h.host.querySelector('[data-evidence-close]').click();button.click();h.host.querySelector('[data-return-compare]').click();assert.match(h.host.querySelector('dialog').textContent,/Chris Vale/);
 assert.equal(JSON.stringify(h.f),before);assert.equal(h.calls(),1);
});
test('return prompts remain available with form colours hidden, and disappear when the player is selected or no longer available',async()=>{
 const h=await uiSetup(),toggle=h.host.querySelector('[data-evidence-toggle]');toggle.checked=false;toggle.dispatchEvent(new h.dom.window.Event('change'));await tick();
 assert.ok(h.host.querySelector('.se-return-person'));assert.ok(h.host.querySelector('[data-evidence-player="cover"] .se-return-mark'));
 assert.equal(h.host.querySelector('[data-evidence-kind]'),null);
 h.f.draft.slots[0].d1=h.f.person.id;await h.mount();assert.equal(h.host.querySelector('.se-return-person,.se-return-linked,.se-return-mark'),null);
 h.f.draft.slots[0].d1='cover';h.f.person.availability.unavailable_dates.push('2026-10-31');await h.mount();assert.equal(h.host.querySelector('.se-return-person'),null);
});
test('permission errors remove return prompts and late responses cannot restore private return comparisons',async()=>{
 const h=await uiSetup();assert.ok(h.host.querySelector('.se-return-person'));
 h.reply(async()=>({error:{message:'No selection access'}}));h.controller.invalidate();await tick();assert.equal(h.host.querySelector('.se-return-person,.se-return-mark,.se-return-linked'),null);
 let finish;h.reply(()=>new Promise(resolve=>finish=resolve));h.controller.invalidate();h.allowed(false);finish({data:h.f.context});await tick();assert.equal(h.host.querySelector('.se-return-person'),null);
});
test('returning player text is escaped in the team list, markers and comparison',async()=>{
 const h=await uiSetup();h.f.person.name='<img src=x onerror=alert(1)>';await h.mount();
 h.host.querySelector('.se-return-person').click();assert.equal(h.host.querySelector('img'),null);assert.match(h.host.querySelector('.se-return-person').textContent,/<img src=x/);
 h.host.querySelector('[data-return-compare]').click();assert.equal(h.host.querySelector('img'),null);
});

test('returning frontline spinners can compare bowling across batting roles without losing type, workload or keeper checks',async()=>{
 const h=await setup();Object.assign(h.f.person,{batting:'middle',bowling:'spin',bowling_load:'frontline'});Object.assign(h.f.cover,{batting:'lower',bowling:'spin',bowling_load:'frontline'});
 let target=h.find()[0].targets.find(t=>t.incumbent?.id==='cover');assert.equal(target?.focus,'bowling');
 h.f.cover.bowling='pace';assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id==='cover'));
 h.f.cover.bowling='spin';h.f.person.bowling_load='part_time';assert.equal(h.find()[0].targets.length,0);
 h.f.person.bowling_load='frontline';h.f.cover.keeper=true;assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id==='cover'));
 h.f.cover.keeper=false;h.f.cover.bowling_load='unknown';assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id==='cover'));
});
test('named returns below Copy previous team open bowling first, direct opponents, and independent form when no place matches',async()=>{
 const h=await uiSetup();Object.assign(h.f.person,{batting:'middle',bowling:'spin',bowling_load:'frontline'});Object.assign(h.f.cover,{batting:'lower',bowling:'spin',bowling_load:'frontline'});
 for(const [i,card] of h.f.context.cards.filter(c=>c.scorecard.grade==='1st Grade').entries())card.scorecard.innings[1].bowlers.push({player_id:i<2?'source-g1p0':'source-cover',team_id:'us',wickets:i<2?2:1,runs:i<2?9:25,balls:48,importable:true});
 h.controller.invalidate();await tick();await h.mount();
 const button=h.host.querySelector('.se-return-person');button.click();let text=h.host.querySelector('.se-return-info').textContent;
 assert.match(text,/Bowling · 4 wickets/);assert.match(text,/16.0 overs · 2 inns · 18 runs/);assert.ok(text.indexOf('Bowling ·')<text.indexOf('Batting ·'));assert.match(text,/Avg 4.50 · Econ 1.13/);
 const target=h.host.querySelector('[data-return-control] [data-return-compare]');target.focus();assert.ok(h.host.querySelector('[data-evidence-player="cover"]').closest('.se-return-active'));target.click();text=h.host.querySelector('dialog').textContent;
 assert.match(text,/Bowling comparison/);assert.match(text,/Alex Rowan \/ Chris Vale/);assert.match(text,/Bowling · 4 wickets/);assert.match(text,/Bowling · 2 wickets/);assert.doesNotMatch(text,/Batting ·|batting average/);
 h.host.querySelector('[data-evidence-close]').click();for(const person of h.f.roster)if(person.id!==h.f.person.id)person.bowling='pace';await h.mount();assert.equal(h.host.querySelector('[data-return-control] [data-return-compare]'),null);assert.match(h.host.querySelector('[data-return-control]').textContent,/No similar role identified/);
 h.host.querySelector('.se-return-person').click();assert.match(h.host.querySelector('.se-return-info').textContent,/Bowling · 4 wickets/);
});
test('a bowling return explicitly distinguishes a missing spell from poor bowling',async()=>{
 const h=await setup();Object.assign(h.f.person,{bowling:'spin',bowling_load:'frontline'});Object.assign(h.f.cover,{bowling:'spin',bowling_load:'frontline'});
 for(const card of h.f.context.cards.filter(c=>c.scorecard.grade==='1st Grade'&&c.scorecard.innings[0].batters[0].player_id==='source-g1p0'))card.scorecard.innings[1].bowlers.push({player_id:'source-g1p0',team_id:'us',wickets:2,runs:9,balls:48,importable:true});
 const entry=h.find()[0],pair=h.engine.returningComparison(entry,entry.targets[0],h.stats.buildSeasonStats(h.f.context));
 assert.match(pair.notes[0],/No recorded bowling for Chris Vale/);assert.doesNotMatch(pair.notes.join(' '),/more wickets per ball|lower economy/);
});

test('return comparisons default off, switch independently of form, and remember only the current user and club',async()=>{
 const h=await uiSetup(false);let toggle=h.host.querySelector('[data-returning-toggle]');
 assert.equal(toggle.checked,false);assert.ok(h.host.querySelector('.se-return-person'));
 assert.equal(h.host.querySelector('.se-return-mark,.se-return-linked,[data-return-compare]'),null);
 h.host.querySelector('.se-return-person').focus();assert.equal(h.host.querySelector('.se-return-active'),null);
 h.host.querySelector('.se-return-person').click();assert.equal(h.host.querySelector('.se-return-row').open,true);
 assert.doesNotMatch(h.host.querySelector('.se-return-info').textContent,/Similar roles|Chris Vale/);
 toggle.checked=true;toggle.dispatchEvent(new h.dom.window.Event('change'));await tick();
 assert.ok(h.host.querySelector('.se-return-mark'));assert.equal(h.host.querySelector('.se-return-row').open,true);
 h.host.querySelector('.se-return-person').focus();assert.ok(h.host.querySelector('.se-return-active'));
 assert.equal(h.calls(),1,'Preference changes reuse authorised cached figures');
 await h.mount();assert.equal(h.host.querySelector('[data-returning-toggle]').checked,true);
 toggle=h.host.querySelector('[data-returning-toggle]');toggle.checked=false;toggle.dispatchEvent(new h.dom.window.Event('change'));await tick();
 assert.equal(h.host.querySelector('.se-return-mark,.se-return-linked,.se-return-active,[data-return-compare]'),null);
 assert.ok(h.host.querySelector('[data-evidence-kind]'),'Form stays independently enabled');
 await h.mount();assert.equal(h.host.querySelector('[data-returning-toggle]').checked,false);
 h.options.scope='other-user:club';await h.mount();assert.equal(h.host.querySelector('[data-returning-toggle]').checked,false);
});
test('batting comparisons allow top versus middle order and ignore optional bowling without removing frontline or opener cover',async()=>{
 const h=await setup();Object.assign(h.f.person,{batting:'middle',bowling:'none'});Object.assign(h.f.cover,{batting:'top',bowling:'pace',bowling_load:'part_time'});
 for(const t of h.f.references.filter(t=>t.published&&t.grade==='1st Grade'&&t.days[0].date<='2026-10-10'))[t.published.slots[0],t.published.slots[5]]=[t.published.slots[5],t.published.slots[0]];
 [h.f.draft.slots[0],h.f.draft.slots[2]]=[h.f.draft.slots[2],h.f.draft.slots[0]];
 let entry=h.find()[0],target=entry.targets.find(t=>t.incumbent?.id==='cover');assert.equal(entry.position,6);assert.equal(target.position,3);assert.equal(target.focus,'batting');
 const pair=h.engine.returningComparison(entry,target,h.stats.buildSeasonStats(h.f.context));assert.doesNotMatch(pair.notes.join(' '),/wickets|economy|bowling/);
 h.f.cover.bowling_load='frontline';assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id==='cover'));
 h.f.cover.bowling_load='part_time';[h.f.draft.slots[0],h.f.draft.slots[2]]=[h.f.draft.slots[2],h.f.draft.slots[0]];assert.ok(!h.find()[0].targets.some(t=>t.incumbent?.id==='cover'));
});
test('bowling-led comparisons never use batting to favour a returner and recognise stronger current bowling',async()=>{
 const h=await setup();for(const p of [h.f.person,h.f.cover])Object.assign(p,{bowling:'spin',bowling_load:'frontline'});
 for(const [i,card] of h.f.context.cards.filter(c=>c.scorecard.grade==='1st Grade').entries())card.scorecard.innings[1].bowlers.push({player_id:i<2?'source-g1p0':'source-cover',team_id:'us',wickets:i<2?1:4,runs:i<2?40:10,balls:60,importable:true});
 const entry=h.find()[0],pair=h.engine.returningComparison(entry,entry.targets[0],h.stats.buildSeasonStats(h.f.context));
 assert.equal(pair.assessment,'incumbent');assert.match(pair.assessmentText,/Chris Vale has the stronger bowling/);assert.doesNotMatch(pair.notes.join(' '),/batting average/);
 const broken=structuredClone(h.f.context);for(const card of broken.cards)for(const ball of card.scorecard.innings[1].bowlers)if(ball.player_id==='source-cover')ball.balls=null;
 assert.equal(h.engine.returningComparison(entry,entry.targets[0],h.stats.buildSeasonStats(broken)).assessment,'insufficient');
});
