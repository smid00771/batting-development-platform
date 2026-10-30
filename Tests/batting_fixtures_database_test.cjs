const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('standalone fixtures reuse the shared importer without granting Select or bypassing history',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('Tests/fixtures/batting_fixtures_baseline.sql','utf8'));
 await db.exec(fs.readFileSync('Database/club_batting_fixtures.sql','utf8'));
 const c=id(1),linked=id(2),expired=id(3),admin=id(10),coach=id(11),player=id(12),other=id(13),g=id(20),f=id(30);
 await db.query('insert into public.test_clubs(id,batting,selects) values($1,true,false),($2,true,true),($3,false,false)',[c,linked,expired]);
 for(const club of [c,linked,expired])for(const [user,role] of [[admin,'admin'],[coach,'coach'],[player,'player']])await db.query('insert into public.club_memberships values($1,$2,$3)',[club,user,role]);
 await db.query("insert into public.playing_groups(id,club_id,name,active,batting_enabled,sort_order) values($1,$2,'First Grade',true,true,0)",[g,c]);
 const as=async user=>db.query("select set_config('test.user',$1,false)",[user]);
 const api=async(action='context',data={},club=c)=>(await db.query('select public.club_batting_fixtures($1,$2,$3) data',[club,action,JSON.stringify(data)])).rows[0].data;
 const details={grade_group_id:g,opposition:'Visitors',format:'limited_overs',days:[{date:'2099-10-30',start:'12:00',ground:'Oval'}],overs:40,cancelled:false,include_in_fixture_calendar:true};
 const command={id:f,revision:0,request_id:id(40),details};
 await t.test('admin bootstrap is disabled, linked clubs use their existing entry and inactive products cannot bootstrap',async()=>{
  await as(admin);assert.equal((await api()).admin,true);
  const access=(await db.query('select mode,status from club_selection_private.access where club_id=$1',[c])).rows[0];assert.deepEqual(access,{mode:'bundle',status:'disabled'});
  await db.query('insert into public.players values($1,$2,$3,true)',[id(70),c,player]);
  assert.equal((await db.query('select club_batting_private.player_uses_batting($1,$2) v',[c,id(70)])).rows[0].v,true,'Storage setup preserves ungrouped player participation');
  await db.query("update club_selection_private.access set status='active' where club_id=$1",[c]);
  assert.equal((await db.query('select club_batting_private.fixture_storage_only($1) v',[c])).rows[0].v,false);
  await db.query("update club_selection_private.access set status='disabled' where club_id=$1",[c]);
  assert.equal((await db.query('select club_selection_private.enabled($1) v',[c])).rows[0].v,false);
  await assert.rejects(api('context',{},linked),/Teams & availability/);await assert.rejects(api('context',{},expired),/coaching access/);
  assert.equal((await db.query('select count(*)::int n from club_selection_private.access')).rows[0].n,1);
 });
 await t.test('manual saves are idempotent and cannot inject selections or cross club/team boundaries',async()=>{
  const first=await api('save',command);assert.equal(first.saved,true);assert.deepEqual(await api('save',command),first);
  await assert.rejects(api('save',{...command,details:{...details,opposition:'Changed'}}),/Request ID already used/);
  await assert.rejects(api('save',{...command,request_id:id(41),slots:[]}),/Invalid fixture request/);
  await assert.rejects(api('save',{...command,id:id(31),request_id:id(41),details:{...details,match_roles:{}}}),/Invalid fixture details/);
  await assert.rejects(api('save',{...command,id:id(31),request_id:id(41),details:{...details,grade_group_id:id(99)}}),/active Club Batting team/);
  await assert.rejects(api('save',{...command,id:id(31),request_id:id(41)}),/already exists/);
  const saved=(await db.query('select slots,published,details from club_selection_private.fixtures where id=$1',[f])).rows[0];assert.equal(saved.slots.length,11);assert.ok(saved.slots.every(s=>!s.d1&&!s.d2));assert.equal(saved.published,null);assert.equal(saved.details.overs_source,'fixture');
 });
 await t.test('coaches only read their allowed fixtures, players/outsiders cannot read or write',async()=>{
  await as(coach);assert.deepEqual((await api()).fixtures,[]);
  await db.query("select set_config('test.options',$1,false)",[JSON.stringify([{id:f,group_id:g}])]);assert.equal((await api()).fixtures.length,1);await assert.rejects(api('save',command),/Club Admin/);
  for(const user of [player,other]){await as(user);await assert.rejects(api(),/coaching access/);}await as(admin);
 });
 await t.test('existing identity guards protect roster, observations and duplicate games',async()=>{
  await db.query('insert into public.team_review_sessions values($1,$2)',[c,f]);
  await assert.rejects(api('save',{...command,revision:1,request_id:id(42),details:{...details,opposition:'Wrong match'}}),/linked match records/);
  await db.query('delete from public.team_review_sessions');await db.query('insert into club_batting_private.fixture_review_rosters(fixture_id,club_id) values($1,$2)',[f,c]);
  await assert.rejects(api('save',{...command,revision:1,request_id:id(43),details:{...details,format:'t20'}}),/saved match player list/);
  await db.query('delete from club_batting_private.fixture_review_rosters');
 });
 await t.test('real season importer reuses a manual fixture and queues results once for Club Batting only',async()=>{
  const season=id(50),team=id(51),sourceGrade=id(52),match=id(53);
  await db.query('insert into club_selection_private.playhq_connections(club_id,active_season_id,updated_by) values($1,$2,$3)',[c,season,admin]);
  await db.query('insert into club_selection_private.playhq_grade_mappings(club_id,season_id,team_id,source_grade_id,grade_id) values($1,$2,$3,$4,$5)',[c,season,team,sourceGrade,g]);
  const rows=[{source_match_id:match,source_team_id:team,source_grade_id:sourceGrade,format:'limited_overs',opposition:'Visitors',days:[{date:'2099-10-30',time:'12:00',ground:'Oval'}],cancelled:false}];
  const run=async r=>(await db.query('select club_selection_private.playhq_import_all($1,$2,$3,$4,$5) data',[c,season,sourceGrade,team,JSON.stringify(r)])).rows[0].data;
  const first=await run(rows);assert.equal(first.linked,1);assert.equal(first.created,0);assert.equal(first.deferred.length,0);
  await run(rows);assert.equal((await db.query('select count(*)::int n from club_selection_private.playhq_jobs')).rows[0].n,1);
  const next=await run([{...rows[0],source_match_id:id(54),days:[{date:'2099-11-06',time:'12:00',ground:'Oval'}]}]);assert.equal(next.created,1);
  assert.equal((await api()).fixtures.length,2);assert.equal((await db.query('select club_selection_private.enabled($1) v',[c])).rows[0].v,false);
 });
 await t.test('standalone admins can use shared setup, while old selector grants cannot open its API',async()=>{
  await as(coach);await assert.rejects(db.query("select public.playhq_sync_api($1,'status')",[c]),/Club Admin or selector/);await as(admin);
  assert.equal((await db.query("select public.playhq_sync_api($1,'status') v",[c])).rows[0].v.admin,true);
  await assert.rejects(db.query("select public.playhq_sync_api($1,'import')",[c]),/season fixture import/);
  await db.query("select public.club_selection_group_manage($1,'add_group',$2)",[c,JSON.stringify({request_id:id(80),selection_group_id:id(81),name:'Senior teams',revision:0})]);
  assert.equal((await db.query('select batting_enabled from club_selection_private.selection_groups where id=$1',[id(81)])).rows[0].batting_enabled,true);
  const newTeam=(await db.query("select public.create_playing_group($1,'Trial XI') g",[c])).rows[0].g;
  assert.equal((await db.query('select batting_enabled from public.playing_groups where id=$1',[newTeam])).rows[0].batting_enabled,true);
 });
 await t.test('source corrections keep linked team identity, stale preview and saved-history guards',async()=>{
  const pending={opposition:'Revised visitors',format:'limited_overs',days:[{date:'2099-10-31',time:'13:00',ground:'New Oval'}],cancelled:false,requires_review:false};
  await db.query('update club_selection_private.playhq_links set pending_fixture=$1 where fixture_id=$2',[JSON.stringify(pending),f]);
  const review=async(action,data)=>(await db.query('select club_selection_private.playhq_fixture_review($1,$2,$3) v',[c,action,JSON.stringify(data)])).rows[0].v;
  const preview=await review('preview',{fixture_id:f});assert.equal(preview.can_apply,true);
  await assert.rejects(review('apply',{fixture_id:f,revision:preview.revision,token:'stale'}),/fresh preview/);
  await db.query('insert into public.team_review_sessions values($1,$2)',[c,f]);
  await assert.rejects(review('apply',{fixture_id:f,revision:preview.revision,token:preview.token}),/linked match records/);await db.query('delete from public.team_review_sessions');
  const result=await review('apply',{fixture_id:f,revision:preview.revision,token:preview.token});assert.equal(result.saved,true);
  assert.equal((await review('apply',{fixture_id:f,revision:preview.revision,token:preview.token})).already_saved,true);
  const changed=(await db.query('select details,revision from club_selection_private.fixtures where id=$1',[f])).rows[0];assert.equal(changed.details.opposition,'Revised visitors');assert.equal(changed.details.grade_group_id,g);
  const newTeam=(await db.query("select id from public.playing_groups where name='Trial XI'")).rows[0].id;
  await assert.rejects(api('save',{...command,revision:changed.revision,request_id:id(83),details:{...details,grade_group_id:newTeam}}),/Keep the team linked/);
 });
 await t.test('worker keeps service-only guard and uses fixture entitlement; all other selection gates stay intact',async()=>{
  const worker=(await db.query("select pg_get_functiondef('public.playhq_sync_worker(text,jsonb)'::regprocedure) s")).rows[0].s;assert.match(worker,/fixtures_enabled\(q.club_id\)/);assert.match(worker,/Backend access required/);
  const sync=(await db.query("select pg_get_functiondef('public.playhq_sync_api(uuid,text,jsonb)'::regprocedure) s")).rows[0].s;assert.match(sync,/not adm and \(not club_selection_private.enabled/);assert.match(sync,/Use season fixture import for Club Batting/);
  const group=(await db.query("select pg_get_functiondef('public.club_selection_group_manage(uuid,text,jsonb)'::regprocedure) s")).rows[0].s;assert.match(group,/fixtures_enabled\(c\)/);assert.match(group,/Club Admin manages/);assert.match(group,/batting_enabled\) values/);
  const grants=(await db.query("select has_function_privilege('anon','public.club_batting_fixtures(uuid,text,jsonb)','execute') anon,has_function_privilege('authenticated','club_selection_private.fixtures_enabled(uuid)','execute') direct")).rows[0];assert.deepEqual(grants,{anon:false,direct:false});
 });
});
