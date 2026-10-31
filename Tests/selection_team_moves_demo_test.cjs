const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(new URL('../demo.html','file://'+__filename),'utf8');
function extract(name){const match=new RegExp('^(?:async )?function '+name+'\\(','m').exec(source);assert.ok(match,'Missing helper: '+name);const tail=source.slice(match.index),end=tail.slice(1).search(/\n(?:async )?function /);return tail.slice(0,end+1);}
const plain=value=>JSON.parse(JSON.stringify(value)),dates=['2099-10-17','2099-10-24'];
function team(id,{twoDays=false}={}){
 return {id,club_id:'club',revision:3,publication:0,published:null,details:{grade:id,competition:'Test',days:dates.slice(0,twoDays?2:1).map(date=>({date})),brackets:twoDays,min_quicks:0,min_batters:0,match_roles:Object.fromEntries((twoDays?['d1','d2']:['d1']).map(day=>[day,{captain_id:id+'-0',captain_manual:true,keeper_id:id+'-1',keeper_manual:true}]))},slots:Array.from({length:11},(_,i)=>({d1:id+'-'+i,d2:twoDays?id+'-'+i:null}))};
}
function harness({twoDays=false}={}){
 const fixtures=[team('A',{twoDays}),team('B',{twoDays})],roster=fixtures.flatMap(f=>f.slots.map((slot,i)=>({id:slot.d1,name:slot.d1,active:true,user_id:null,batting:'top',bowling:'none',keeper:i===1,availability:{available_dates:[...dates]}})));
 const state={access:{mode:'standalone',status:'pilot',head_selector_id:'coach',timezone:'UTC'},roster,roster_revision:1,fixtures,selectors:['coach'],receipts:{},posts:{},review_posts:{},history:{},group_links:[]};
 const c=vm.createContext({Date,Intl,structuredClone,crypto,console,club:{id:'club'},session:{user:{id:'coach'}},membership:{permission_role:'coach'},userProfile:{display_name:'Test coach'},fixtureRows:{club_memberships:[{club_id:'club',user_id:'coach',permission_role:'coach'}],user_profiles:[{user_id:'coach',display_name:'Test coach'}]},demoSelections:state,ensureSelections:()=>({data:state}),fixtureNow:()=>new Date().toISOString(),window:{__fixtureRpc:async()=>({data:null,error:{message:'Unexpected RPC'}})},demoCaptainUsers:()=>['coach'],demoSeasonGroups:()=>[],demoTemporaryCaptainDays:()=>[],demoSharedFixtureGroup:()=>null,demoMatchGroups:()=>[],demoMatchSelectionAccounts(){},demoSyncRepublicationAlerts:()=>0,demoConversations:()=>[],demoSavedDrops:()=>[],demoSelectionAccountEmail:()=>null,demoPublicationHead:()=> 'coach'});
 vm.runInContext(fs.readFileSync('player-bowling.js','utf8').replace(/^export /gm,''),c);
 const helpers=['seDayStatus','seClockMinutes','seMatchDuration','seDayWindow','seOverlap','seCounts','seShortTeams','seFixtureCompleted','seFixtureLocked','seMatchGroup','seMatchRoles','sePrepareMatch','seMatchRoleIssues','seTrimSlots','seMovePlan','demoDuplicateSelection','demoSelectionIssues'];
 vm.runInContext(helpers.map(extract).join('\n'),c);
 const start=source.indexOf('const previousSelectionFixtureRpc=window.__fixtureRpc;'),end=source.indexOf('// Fictional quote for exploring the form.',start);assert.ok(start>0&&end>start);
 vm.runInContext(source.slice(start,end),c);
 let request=0;return {c,state,rpc:(action,data={})=>c.window.__fixtureRpc('club_selections_api',{p_club_id:'club',p_action:action,p_data:{request_id:'request-'+(++request),...data}})};
}
const occupied=(f,key='d1')=>f.slots.map(slot=>slot[key]).filter(Boolean);
function publicationData(state,ids=state.fixtures.map(f=>f.id)){return {ids,revisions:Object.fromEntries(state.fixtures.map(f=>[f.id,f.revision]))};}

test('demo RPC saves and reverses a full-team transfer atomically, with per-team revisions and preserved players',async()=>{
 const h=harness(),original=plain(h.state.fixtures),plan=h.c.seMovePlan(...h.state.fixtures,3,4),data={fixtures:plan.fixtures,request_id:'same-move'};
 const saved=await h.rpc('save_board',data);assert.equal(saved.error,null);assert.deepEqual(plain(saved.data.revisions),{A:4,B:4});assert.deepEqual(h.state.fixtures.map(f=>occupied(f).length),[10,12]);
 assert.deepEqual(h.state.fixtures.flatMap(f=>occupied(f)).sort(),original.flatMap(f=>occupied(f)).sort());assert.equal(h.state.fixtures[1].slots[4].d1,'A-3');
 const replay=await h.rpc('save_board',data);assert.equal(replay.error,null);assert.deepEqual(h.state.fixtures.map(f=>f.revision),[4,4]);
 const context=await h.rpc('context');assert.equal(context.error,null);assert.deepEqual(plain(context.data.fixtures.find(f=>f.id==='B').issues),[]);assert.ok(h.c.demoSelectionIssues(h.state.fixtures.find(f=>f.id==='B')).some(i=>i.code==='twelve_team'&&i.level==='warning'));
 const back=h.c.seMovePlan(h.state.fixtures[1],h.state.fixtures[0],4,3);assert.equal((await h.rpc('save_board',{fixtures:back.fixtures})).error,null);
 assert.deepEqual(h.state.fixtures.map(f=>f.revision),[5,5]);assert.deepEqual(h.state.fixtures.map(f=>f.slots.length),[11,11]);assert.deepEqual(plain(h.state.fixtures.map(f=>f.slots)),original.map(f=>f.slots));
});

test('demo permits a twelve-player captain check but requires explicit acknowledgement to publish',async()=>{
 const h=harness(),plan=h.c.seMovePlan(...h.state.fixtures,3,4);assert.equal((await h.rpc('save_board',{fixtures:plan.fixtures})).error,null);
 const data=publicationData(h.state);const review=await h.rpc('send_review',data);assert.equal(review.error,null);assert.ok(h.state.fixtures.every(f=>f.review));
 const published=await h.rpc('publish',{...data,acknowledge_short:['A','B']});assert.match(published.error.message,/12 players/);assert.ok(h.state.fixtures.every(f=>!f.published&&f.publication===0));
 const back=h.c.seMovePlan(h.state.fixtures[1],h.state.fixtures[0],4,3);assert.equal((await h.rpc('save_board',{fixtures:back.fixtures})).error,null);
 const final=publicationData(h.state);assert.equal((await h.rpc('send_review',final)).error,null);assert.ok(h.state.fixtures.every(f=>f.review));assert.equal((await h.rpc('publish',final)).data.published,true);assert.ok(h.state.fixtures.every(f=>f.publication===1));
});

test('demo rejects a stale target revision without removing the player from the source',async()=>{
 const h=harness(),before=plain(h.state.fixtures),plan=h.c.seMovePlan(...h.state.fixtures,3,4);plan.fixtures[1].revision--;
 const result=await h.rpc('save_board',{fixtures:plan.fixtures});assert.match(result.error.message,/another session/);assert.deepEqual(plain(h.state.fixtures),before);
});

test('demo prepares both teams before mutating either, even if preparation fails',async()=>{
 const h=harness(),before=plain(h.state.fixtures),plan=h.c.seMovePlan(...h.state.fixtures,3,4),prepare=h.c.sePrepareMatch;
 h.c.sePrepareMatch=(f,data)=>{if(f.id==='B')throw Error('Preparation failed');return prepare(f,data);};
 await assert.rejects(h.rpc('save_board',{fixtures:plan.fixtures}),/Preparation failed/);assert.deepEqual(plain(h.state.fixtures),before);
});

test('demo rejects an unavailable transferred player without changing either fixture',async()=>{
 const h=harness(),before=plain(h.state.fixtures),plan=h.c.seMovePlan(...h.state.fixtures,3,4);h.state.roster.find(p=>p.id==='A-3').availability.available_dates=[];
 const result=await h.rpc('save_board',{fixtures:plan.fixtures});assert.match(result.error.message,/availability/);assert.deepEqual(plain(h.state.fixtures),before);
});

test('demo saves and publishes one player in separate same-day T20s',async()=>{
 const h=harness(),[morning,afternoon]=h.state.fixtures;for(const [fixture,start] of [[morning,'10:00'],[afternoon,'14:00']]){fixture.details.format='t20';fixture.details.days[0].start=start;}
 const next=structuredClone(afternoon);next.slots[2].d1='A-0';let result=await h.rpc('save_board',{fixtures:[next]});assert.equal(result.error,null,'10:00 and 14:00 do not clash');
 assert.ok(!h.c.demoSelectionIssues(h.state.fixtures[1]).some(issue=>/overlapping game/.test(issue.text)));
 const overlap=structuredClone(h.state.fixtures[1]);overlap.details.days[0].start='12:00';result=await h.rpc('save_board',{fixtures:[overlap]});assert.match(result.error.message,/overlapping games/);
 result=await h.rpc('publish',{...publicationData(h.state,['B']),acknowledge_balance:true});assert.equal(result.error,null);assert.equal(result.data.published,true);
});

test('demo retains explicit acknowledgment for a short team and permits its captain check',async()=>{
 const h=harness(),a=structuredClone(h.state.fixtures[0]);a.slots[3]={d1:null,d2:null};assert.equal((await h.rpc('save_board',{fixtures:[a]})).error,null);
 const data=publicationData(h.state,['A']);assert.equal((await h.rpc('send_review',data)).error,null);const denied=await h.rpc('publish',data);assert.match(denied.error.message,/vacant places/);assert.equal(h.state.fixtures[0].published,null);
 const saved=await h.rpc('publish',{...data,acknowledge_short:['A']});assert.equal(saved.data.published,true);assert.equal(occupied(h.state.fixtures[0].published).length,10);
});

test('demo checks a twelve-player Day 2 independently and still blocks thirteen',async()=>{
 const h=harness({twoDays:true});h.state.roster.push({id:'extra',name:'Extra',active:true,availability:{available_dates:[...dates]}});
 const b=structuredClone(h.state.fixtures[1]);b.slots.push({d1:null,d2:'extra'});assert.equal((await h.rpc('save_board',{fixtures:[b]})).error,null);
 const loaded=await h.rpc('context'),issues=h.c.demoSelectionIssues(h.state.fixtures.find(f=>f.id==='B')).filter(i=>i.code==='twelve_team');assert.equal(issues.length,1);assert.match(issues[0].text,/Day 2: 12/);
 const data=publicationData(h.state,['B']);assert.equal((await h.rpc('send_review',data)).error,null);assert.match((await h.rpc('publish',data)).error.message,/12 players/);
 h.state.roster.push({id:'extra-13',name:'Extra 13',active:true,availability:{available_dates:[...dates]}});
 const thirteen=structuredClone(h.state.fixtures[1]);thirteen.slots.push({d1:null,d2:'extra-13'});assert.equal((await h.rpc('save_board',{fixtures:[thirteen]})).error,null);
 const over=publicationData(h.state,['B']);assert.match((await h.rpc('send_review',over)).error.message,/extra players/);assert.match((await h.rpc('publish',{...over,acknowledge_twelve:['B']})).error.message,/issues/);
});

test('demo bounds draft slots and rejects duplicate fixture entries before mutation',async()=>{
 for(const mode of ['too-many','duplicate']){const h=harness(),before=plain(h.state.fixtures),f=structuredClone(h.state.fixtures[0]);if(mode==='too-many')while(f.slots.length<101)f.slots.push({d1:null,d2:null});const result=await h.rpc('save_board',{fixtures:mode==='duplicate'?[f,f]:[f]});assert.ok(result.error);assert.deepEqual(plain(h.state.fixtures),before);}
});

test('demo blocks extra draft rows even when each playing day has eleven players',async()=>{
 for(const kind of ['split-pair','blank-extra']){
  const h=harness({twoDays:true}),b=structuredClone(h.state.fixtures[1]);
  if(kind==='split-pair'){const moved=b.slots[3].d1;b.slots[3].d1=null;b.slots.push({d1:moved,d2:null});}else b.slots.push({d1:null,d2:null});
  assert.equal((await h.rpc('save_board',{fixtures:[b]})).error,null);
  assert.equal(occupied(h.state.fixtures[1]).length,11);assert.equal(occupied(h.state.fixtures[1],'d2').length,11);
  const loaded=await h.rpc('context'),issues=h.c.demoSelectionIssues(h.state.fixtures.find(f=>f.id==='B'));assert.ok(issues.some(i=>i.code==='over_slots'&&i.level==='error'),kind);assert.ok(!issues.some(i=>i.code==='over_team'),kind);
  const data=publicationData(h.state,['B']);assert.match((await h.rpc('send_review',data)).error.message,/extra players or places/);assert.match((await h.rpc('publish',data)).error.message,/issues/);
  assert.equal(h.state.fixtures[1].review,undefined);assert.equal(h.state.fixtures[1].published,null);
 }
});
