const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID:uuid}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
async function setup(t,{cache=true}={}){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fs.readFileSync('Tests/fixtures/fielding_test_schema.sql','utf8'));
 await db.exec(`
 create role service_role;
 alter table club_selection_private.roster add column usual_grades text[] default '{}';
 create function public.is_club_admin(c uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role='admin')$$;
 create function club_selection_private.fixtures_enabled(c uuid) returns boolean language sql as $$select club_selection_private.enabled(c)$$;
 create function club_selection_private.shared_products(uuid) returns jsonb language sql as $$select '{"batting":true}'::jsonb$$;
 create function club_batting_private.team_review_staff(c uuid) returns boolean language sql as $$select public.is_club_admin(c)$$;
 create table club_selection_private.playhq_connections(club_id uuid primary key,organisation_id uuid,association_id uuid,secret_id uuid,generation uuid default gen_random_uuid(),verified_at timestamptz default now(),polling_enabled boolean default true,active_season_id uuid);
 create table club_selection_private.playhq_jobs(club_id uuid,kind text constraint playhq_jobs_kind_check check(kind in ('season','fixtures','results')),source_id uuid,team_id uuid,due_at timestamptz default now(),lease_id uuid,leased_until timestamptz,attempts integer default 0,last_error text,checked_at timestamptz,last_result jsonb,primary key(club_id,kind,source_id,team_id));
 create table club_selection_private.playhq_grade_mappings(club_id uuid,season_id uuid,team_id uuid,source_grade_id uuid,grade_id uuid);
 create table club_selection_private.playhq_links(club_id uuid,season_id uuid,grade_id uuid,match_id uuid,team_id uuid,summary jsonb);
 create function public.club_selections_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer as $$declare result jsonb:='{}';begin if p_action='access' then result:=result||'{"enabled":true}';end if;return result;end$$;
 `);
 await db.exec(fs.readFileSync('Database/club_standings.sql','utf8'));
 if(cache)await db.exec(fs.readFileSync('Database/cache_championship_totals.sql','utf8'));
 return db;
}
test('standings isolate member access, calculate weighted clubs and protect cached jobs/settings',async t=>{
 const db=await setup(t);
 const c=uuid(),admin=uuid(),player=uuid(),outsider=uuid(),season=uuid(),org=uuid(),otherOrg=uuid(),grade1=uuid(),grade2=uuid(),local1=uuid(),local2=uuid(),team1=uuid(),team2=uuid(),otherTeam=uuid();
 await db.query('insert into public.clubs(id,name) values($1,$2)',[c,'Example Club']);
 await db.query('insert into auth.users(id) values($1),($2),($3)',[admin,player,outsider]);
 await db.query("insert into public.club_memberships(club_id,user_id,permission_role) values($1,$2,'admin'),($1,$3,'player')",[c,admin,player]);
 await db.query("insert into club_selection_private.access(club_id,status) values($1,'active')",[c]);
 await db.query('insert into public.playing_groups(id,club_id,name,active) values($1,$2,$3,true),($4,$2,$5,true)',[local1,c,'First',local2,'Dev']);
 await db.query('insert into club_selection_private.playhq_connections(club_id,organisation_id,active_season_id) values($1,$2,$3)',[c,org,season]);
 await db.query('insert into club_selection_private.playhq_grade_mappings values($1,$2,$3,$4,$5),($1,$2,$6,$7,$8)',[c,season,team1,grade1,local1,team2,grade2,local2]);
 await db.query('insert into club_standings_private.catalogues(season_id,grades,teams) values($1,$2,$3)',[season,[{id:grade1,name:'First'},{id:grade2,name:'Dev'}],[]]);
 const rows=(point,team=team1,club=org)=>({team_id:team,club_id:club,club_name:club===org?'Example Club':'Other Club',name:'Same team label',values:{competitionPoints:point,pointsAverage:point/2},position:1});
 const ladder=(grade,values)=>({grade_id:grade,season_id:season,name:grade===grade1?'First':'Dev',ladders:[{type:'overall',rows:values},{type:'oneDay',rows:values}]});
 await db.query('insert into club_standings_private.ladders(season_id,grade_id,data,checked_at) values($1,$2,$3,now()),($1,$4,$5,now())',[season,grade1,ladder(grade1,[rows(10),rows(12,otherTeam,otherOrg)]),grade2,ladder(grade2,[rows(3,team2),rows(4,uuid())])]);
 async function api(who,action='context',data={}){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who||'']);await db.exec('set role authenticated');
  try{return (await db.query('select public.club_standings_api($1,$2,$3) result',[c,action,data])).rows[0].result;}finally{await db.exec('reset role');}
 }
 let ctx=await api(admin);assert.equal(ctx.ladders.length,2);assert.equal(ctx.settings.revision,1);
 const rules=[{grade_id:grade1,name:'First',weight:5,type:'auto',points_column:'competitionPoints',aggregation:'sum'},{grade_id:grade2,name:'Dev',weight:1,type:'auto',points_column:'competitionPoints',aggregation:'sum'}];
 const settings={request_id:uuid(),revision:1,season_id:season,ladder_audience:'members',championship_audience:'members',title:'Club Championship',calculation:'total',minimum_teams:1,rules};
 ctx=await api(admin,'save_settings',settings);assert.deepEqual(await api(admin,'save_settings',settings),ctx,'Lost-response retry returns same receipt');
 assert.equal(ctx.championship.complete,true);assert.equal(ctx.championship.rows.find(r=>r.club_id===org).points,57,'Overall is counted once and both Dev teams count');
 assert.equal(ctx.championship.rows[0].club_id,otherOrg,'Source club IDs, never team names, group clubs');
 const ordinary=await api(player);assert.equal(ordinary.settings,null);assert.deepEqual(ordinary.catalogue,[]);assert.equal(ordinary.championship.rows.length,2);
 assert.equal('roster' in ordinary,false);assert.equal('fixtures' in ordinary,false);
 await assert.rejects(api(outsider),/membership/);await assert.rejects(api(null),/membership/);
 await assert.rejects(api(player,'save_settings',settings),/Club Admin/);
 await assert.rejects(api(admin,'save_settings',{...settings,request_id:uuid()}),/changed/);
 await api(admin,'save_settings',{...settings,request_id:uuid(),revision:2,ladder_audience:'staff'});
 assert.deepEqual((await api(player)).ladders,[],'Championship access does not grant ladders');
 await api(admin,'save_settings',{...settings,request_id:uuid(),revision:3,championship_audience:'staff'});
 assert.equal((await api(player)).championship,null,'Ladder access does not grant championship');
 await db.query('update club_standings_private.settings set calculation=$1 where club_id=$2',['per_team',c]);
 assert.equal((await api(admin)).championship.rows.find(r=>r.club_id===org).points,19,'Per-team divisor includes every distinct contributing team');
 await db.query('update club_standings_private.ladders set data=null where season_id=$1 and grade_id=$2',[season,grade2]);
 ctx=await api(admin);assert.equal(ctx.championship.complete,false);assert.ok(ctx.championship.rows.every(r=>r.position===null),'Incomplete totals never claim positions');
 // Worker uses actual backend role, generation and current lease, and shares source cache.
 const generation=(await db.query('select generation from club_selection_private.playhq_connections where club_id=$1',[c])).rows[0].generation;
 const lease=uuid();await db.query("update club_selection_private.playhq_jobs set lease_id=$1,leased_until=now()+interval '5 minutes',attempts=1 where club_id=$2 and source_id=$3",[lease,c,grade2]);
 await db.query('update club_standings_private.ladders set checked_at=null where grade_id=$1',[grade2]);
 const job={source_id:grade2,team_id:org,lease_id:lease};
 async function worker(action,extra={}){await db.exec('set role service_role');try{return (await db.query('select public.club_standings_worker($1,$2) result',[action,{club_id:c,generation,job,...extra}])).rows[0].result;}finally{await db.exec('reset role');}}
 await db.query("select set_config('request.jwt.claims','{}',false)");await assert.rejects(worker('begin'),/Backend/);
 await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");assert.equal((await worker('begin')).season_id,season);
 await assert.rejects(worker('store',{result:ladder(grade1,[])}),/Invalid ladder/);
 assert.equal((await worker('store',{result:ladder(grade2,[rows(7,team2)])})).saved,true);
 await assert.rejects(worker('store',{result:ladder(grade2,[])}),/expired/);
 await db.query("update club_selection_private.playhq_jobs set lease_id=$1,leased_until=now()+interval '5 minutes' where club_id=$2 and source_id=$3",[lease,c,grade2]);
 assert.equal((await worker('begin')).skip,true,'Fresh shared data avoids another provider request');
 await db.exec('set role anon');await assert.rejects(db.query('select public.club_standings_api($1)',[c]),/permission denied/);await db.exec('reset role');
});

test('Championship tables are built on source/config changes, never on reads or unchanged checks',async t=>{
 const db=await setup(t,{cache:false}),clubs=[uuid(),uuid(),uuid(),uuid()],seasons=[uuid(),uuid()],grade=uuid(),unused=uuid(),org=uuid(),team=uuid(),admin=uuid(),member=uuid();
 const rule=weight=>[{grade_id:grade,name:'First',weight,type:'auto',points_column:'competitionPoints',aggregation:'sum'}];
 const ladder=points=>({grade_id:grade,season_id:seasons[0],name:'First',ladders:[{type:'overall',rows:[{team_id:team,club_id:org,club_name:'Example Club',name:'First XI',values:{competitionPoints:points},position:1}]}]});
 for(let i=0;i<4;i++){
  await db.query('insert into public.clubs(id,name) values($1,$2)',[clubs[i],'Club '+i]);
  await db.query('insert into club_standings_private.settings(club_id,season_id,championship_audience,rules) values($1,$2,$3,$4)',[clubs[i],seasons[i===3?1:0],i===2?'off':'members',rule(i===1?2:5)]);
 }
 await db.query('insert into club_standings_private.ladders(season_id,grade_id,data,checked_at) values($1,$2,$3,now())',[seasons[0],grade,ladder(10)]);
 const before=(await db.query('select club_standings_private.championship($1,$2) result',[clubs[0],seasons[0]])).rows[0].result;
 await db.exec(fs.readFileSync('Database/cache_championship_totals.sql','utf8'));
 const read=async(c=clubs[0],sid=seasons[0])=>(await db.query('select club_standings_private.championship($1,$2) result',[c,sid])).rows[0].result;
 const cached=async(c=clubs[0])=>(await db.query('select data,computed_at::text,checked_at::text from club_standings_private.championship_totals where club_id=$1',[c])).rows[0];
 assert.deepEqual(await read(),before,'Migration warms the same standings before the first player opens them');
 assert.equal((await cached(clubs[1])).data.rows[0].points,20);assert.equal(await cached(clubs[2]),undefined,'Off clubs are not calculated');
 assert.equal((await read(clubs[3],seasons[1])).complete,false,'Other seasons do not borrow current rows');
 // Instrument the calculator, not the reader, so even an invisible repeated sum fails the check.
 await db.exec(`create table test_calculations(club_id uuid);
 alter function club_standings_private.calculate_championship(uuid,uuid) rename to original_calculation;
 create function club_standings_private.calculate_championship(c uuid,sid uuid) returns jsonb language plpgsql set search_path='' as $$begin
 insert into public.test_calculations values(c);return club_standings_private.original_calculation(c,sid);end$$;
 revoke all on function club_standings_private.calculate_championship(uuid,uuid) from public,anon,authenticated,service_role;`);
 const calls=async()=>Number((await db.query('select count(*) n from test_calculations')).rows[0].n);
 await db.query('insert into auth.users(id) values($1),($2)',[admin,member]);
 await db.query("insert into public.club_memberships(club_id,user_id,permission_role) values($1,$2,'admin'),($1,$3,'player')",[clubs[0],admin,member]);
 await db.query("insert into club_selection_private.access(club_id,status) values($1,'active')",[clubs[0]]);
 await db.query('insert into club_selection_private.playhq_connections(club_id,organisation_id,active_season_id) values($1,$2,$3)',[clubs[0],org,seasons[0]]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);await db.exec('set role authenticated');
 for(let i=0;i<3;i++)assert.equal((await db.query('select public.club_standings_api($1) result',[clubs[0]])).rows[0].result.championship.rows[0].points,50);
 await db.exec('reset role');assert.equal(await calls(),0,'Repeated authenticated page reads do not call the calculator');
 const initial=await cached();
 await db.query("update club_standings_private.ladders set data=data,checked_at=now()+interval '1 minute' where season_id=$1 and grade_id=$2",[seasons[0],grade]);
 assert.equal(await calls(),0);assert.equal((await cached()).computed_at,initial.computed_at);assert.notEqual((await cached()).checked_at,initial.checked_at);
 await db.query("update club_standings_private.ladders set last_error='Temporary error' where season_id=$1 and grade_id=$2",[seasons[0],grade]);
 assert.equal((await read()).stale,true);assert.equal(await calls(),0,'Errors preserve totals without calculating');
 await db.query("update club_standings_private.ladders set last_error=null,checked_at=now()-interval '2 days' where season_id=$1 and grade_id=$2",[seasons[0],grade]);
 assert.equal((await read()).stale,true,'Age remains visible even though totals are cached');
 await db.query('update club_standings_private.ladders set checked_at=now() where season_id=$1 and grade_id=$2',[seasons[0],grade]);
 assert.equal((await read()).stale,false);assert.equal(await calls(),0,'Freshness recovery does not calculate');
 await db.query("update club_standings_private.settings set rules=rules,revision=revision+1,ladder_audience='staff',championship_audience='staff' where club_id=$1",[clubs[0]]);
 assert.equal(await calls(),0,'Same calculation and audience-only changes reuse the table');
 await db.query('insert into club_standings_private.ladders(season_id,grade_id,data,checked_at) values($1,$2,$3,now())',[seasons[0],unused,ladder(999)]);
 assert.equal(await calls(),0,'Unselected competitions do not calculate');
 await db.query('update club_standings_private.ladders set data=$1 where season_id=$2 and grade_id=$3',[ladder(12),seasons[0],grade]);
 assert.equal(await calls(),2,'Only the two enabled clubs using this season/grade are rebuilt');
 assert.equal((await read()).rows[0].points,60);assert.equal((await read(clubs[1])).rows[0].points,24);
 await db.query('update club_standings_private.settings set rules=$1 where club_id=$2',[rule(3),clubs[0]]);
 assert.equal(await calls(),3);assert.equal((await read()).rows[0].points,36,'Weight changes are ready before the next read');
 await db.query('delete from club_standings_private.ladders where season_id=$1 and grade_id=$2',[seasons[0],grade]);
 assert.equal(await calls(),5);assert.equal((await read()).complete,false);assert.deepEqual((await read()).rows,[],'Removed source cannot leave a fabricated rank');
 await db.query("update club_standings_private.settings set championship_audience='off' where club_id=$1",[clubs[0]]);
 assert.equal(await cached(),undefined);assert.equal(await calls(),5);
 await db.query('insert into club_standings_private.ladders(season_id,grade_id,data,checked_at) values($1,$2,$3,now())',[seasons[0],grade,ladder(13)]);
 assert.equal(await calls(),6,'Disabled club stays idle');
 await db.query("update club_standings_private.settings set championship_audience='members' where club_id=$1",[clubs[0]]);
 assert.equal(await calls(),7);assert.equal((await read()).rows[0].points,39,'Re-enabling builds from the latest sources');
 assert.equal((await read(clubs[0],seasons[1])).complete,false,'Cache lookup is season-specific');
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select * from club_standings_private.championship_totals'),/permission denied/);
 await assert.rejects(db.query('select club_standings_private.refresh_championship($1,true)',[clubs[0]]),/permission denied/);
 await assert.rejects(db.query('select club_standings_private.calculate_championship($1,$2)',[clubs[0],seasons[0]]),/permission denied/);
 await db.exec('reset role');
});
