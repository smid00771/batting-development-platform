const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID:uuid}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
test('shared stats view settings validate, authorise, preserve dates and safely retry saves',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema club_selection_private;create schema club_batting_private;grant usage on schema club_selection_private to authenticated;
 create table auth.users(id uuid primary key);
 create table clubs(id uuid primary key,archived_at timestamptz);
 create table club_memberships(club_id uuid,user_id uuid,role text);
 create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
 create function is_club_admin(c uuid) returns boolean language sql stable as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and role='admin')$$;
 create function club_selection_private.enabled(uuid) returns boolean language sql as $$select true$$;
 create function club_selection_private.selection_viewer(uuid,uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=$1 and user_id=$2 and role='viewer')$$;
 create function club_selection_private.captain(uuid,uuid) returns boolean language sql as $$select false$$;
 create function club_selection_private.shared_products(uuid) returns jsonb language sql as $$select '{"batting":false}'::jsonb$$;
 create function club_batting_private.team_review_staff(uuid) returns boolean language sql as $$select false$$;
 create function club_batting_private.review_fixture_options(uuid) returns jsonb language sql as $$select '[]'::jsonb$$;
 create function club_selection_private.shared_result_cards(uuid,date,date) returns jsonb language sql as $$select '[]'::jsonb$$;
 create function club_selection_private.filter_result_cards(uuid,jsonb,uuid) returns jsonb language sql as $$select $2$$;
 create function club_selection_private.scoped_selections(uuid) returns boolean language sql as $$select true$$;
 create function club_selection_private.fixture_view(uuid,jsonb,uuid) returns boolean language sql as $$select $2->>'competition'='Public League'$$;
 create table club_selection_private.access(club_id uuid,timezone text);
 create table club_selection_private.season_stats_settings(club_id uuid primary key,starts date,ends date,revision int default 1,updated_by uuid,updated_at timestamptz default now());
 create table club_selection_private.fixtures(id uuid,club_id uuid,details jsonb,published jsonb,scorecard_sync jsonb);
 create table club_selection_private.fixture_result_sources(fixture_id uuid,club_id uuid,source_match_id uuid,no_play text);
 create table club_selection_private.playhq_links(fixture_id uuid,club_id uuid,season_id uuid,grade_id uuid);
 create table club_selection_private.scorecard_roster_links(club_id uuid,source_player_id uuid,roster_id uuid);
 create table club_selection_private.roster(club_id uuid,id uuid,name text);
 create table match_review_player_links(club_id uuid,source_player_id uuid,player_id uuid);
 create table players(club_id uuid,id uuid,display_name text);
 create table club_batting_private.roster_players(club_id uuid,roster_id uuid,player_id uuid);`);
 await db.exec(fs.readFileSync('Database/shared_season_stats.sql','utf8'));
 await db.exec(`create function public.club_season_stats_api(p_club_id uuid,p_action text default 'context',p_data jsonb default '{}') returns jsonb language sql set search_path='' as $$select club_selection_private.season_stats_api(p_club_id,p_action,p_data)$$;revoke all on function public.club_season_stats_api(uuid,text,jsonb) from public;grant execute on function public.club_season_stats_api(uuid,text,jsonb) to authenticated;`);
 await db.exec(fs.readFileSync('Database/season_stats_view_settings.sql','utf8'));
 const c=uuid(),other=uuid(),admin=uuid(),viewer=uuid(),ordinary=uuid();
 await db.query('insert into clubs values($1,null),($2,null)',[c,other]);
 for(const [user,role] of [[admin,'admin'],[viewer,'viewer'],[ordinary,'player']]){await db.query('insert into auth.users values($1)',[user]);await db.query('insert into club_memberships values($1,$2,$3)',[c,user,role]);}
 for(const comp of ['Public League','Private League'])await db.query("insert into club_selection_private.fixtures values($1,$2,$3,null,null)",[uuid(),c,{competition:comp,grade:'First',format:'long_form',days:[{date:new Date().toISOString().slice(0,10)}]}]);
 const rpc=async(user,action='context',data={on_demand:true},club=c)=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
  try{return (await db.query('select public.club_season_stats_api($1,$2,$3) result',[club,action,data])).rows[0].result;}finally{await db.exec('reset role');}
 };
 const cfg={default:{combine:false,default_view:'long_form'},competitions:{'Public League':{combine:true,default_view:'competition'},'Private League':{combine:false,default_view:'limited_overs'}}};
 const save={settings:cfg,expected_revision:0,request_id:uuid()};
 await t.test('legacy fallback, authenticated admin save and unchanged season records',async()=>{
  const before=await rpc(admin);assert.equal(before.stats_views.settings.default.combine,true);
  const after=await rpc(admin,'set_views',save);assert.deepEqual(after.stats_views,{settings:cfg,revision:1});assert.deepEqual(before.season,after.season);
  assert.equal((await db.query('select count(*) n from club_selection_private.season_stats_settings')).rows[0].n,0);
  assert.deepEqual((await rpc(admin)).stats_views,after.stats_views);
 });
 await t.test('uncertain retry is idempotent; stale and reused requests cannot overwrite a newer choice',async()=>{
  assert.equal((await rpc(admin,'set_views',save)).stats_views.revision,1);
  await assert.rejects(rpc(admin,'set_views',{...save,settings:{...cfg,competitions:{}}}),/reused/);
  await assert.rejects(rpc(admin,'set_views',{...save,request_id:uuid()}),/changed/);
  assert.equal((await rpc(admin,'set_views',{...save,expected_revision:1,request_id:uuid()})).stats_views.revision,2);
 });
 await t.test('staff see their allowed policies but cannot save; players and other clubs are denied',async()=>{
  const res=await rpc(viewer);assert.equal(res.can_set_stats_views,false);assert.deepEqual(Object.keys(res.stats_views.settings.competitions),['Public League']);
  await assert.rejects(rpc(viewer,'set_views',save),/Admin/);
  await assert.rejects(rpc(ordinary),/access/);await assert.rejects(rpc(admin,'context',{on_demand:true},other),/membership/);
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from club_selection_private.season_stats_view_settings'),/permission denied/);await db.exec('reset role');
 });
 await t.test('invalid combinations, missing fields, names, revisions and oversized input are rejected',async()=>{
  for(const settings of [null,{}, {...cfg,default:{combine:'true',default_view:'auto'}},{...cfg,default:{combine:false,default_view:'competition'}},{...cfg,default:{combine:true,default_view:'all_formats'}},{...cfg,competitions:{' ':cfg.default}},{...cfg,competitions:Array(51).fill(0).reduce((o,_,i)=>(o['Competition '+i]=cfg.default,o),{})}])await assert.rejects(rpc(admin,'set_views',{...save,expected_revision:2,request_id:uuid(),settings}));
  await assert.rejects(rpc(admin,'set_views',{...save,expected_revision:2,request_id:null}),/request ID/);
  await assert.rejects(rpc(admin,'context',{}),/on request/);
  assert.equal((await rpc(admin)).stats_views.revision,2);
 });
});
