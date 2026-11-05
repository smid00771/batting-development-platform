const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID:uuid}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('standings isolate member access, calculate weighted clubs and protect cached jobs/settings',async t=>{
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
