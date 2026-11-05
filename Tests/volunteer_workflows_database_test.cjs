const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID:uuid}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');const read=p=>fs.readFileSync(p,'utf8');
async function setup(t){const db=new PGlite();t.after(()=>db.close());await db.exec(read('Tests/fixtures/fielding_test_schema.sql'));
 await db.exec(`create role service_role;create schema cron;create function cron.schedule(text,text,text) returns integer language sql as $$select 1$$;
 create function public.is_club_admin(c uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role='admin')$$;
 create function club_selection_private.availability_affected(uuid,uuid,jsonb,jsonb) returns uuid[] language sql as $$select '{}'::uuid[]$$;
 create function club_selection_private.notify_availability(uuid) returns integer language sql as $$select 0$$;
 create function club_selection_private.api(uuid,text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.club_selections_api(p_club_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin result:=club_selection_private.api(p_club_id,p_action,p_data);return result;end$$;
 alter table club_selection_private.roster add column usual_grades text[] not null default '{}';
 create table public.match_review_scorecards(id uuid primary key,club_id uuid,source_match_id uuid,scorecard jsonb,created_at timestamptz default clock_timestamp());
 create table public.match_review_player_links(club_id uuid,source_player_id uuid,player_id uuid);
 create table club_selection_private.fixture_result_sources(club_id uuid,fixture_id uuid primary key,source_match_id uuid,team_id uuid,no_play text);
 create table club_selection_private.scorecard_roster_links(club_id uuid,source_player_id uuid,roster_id uuid,primary key(club_id,source_player_id));
 create table club_batting_private.roster_players(club_id uuid,roster_id uuid,player_id uuid);
 create table club_selection_private.season_stats_settings(club_id uuid,starts date,ends date);
 create or replace function club_selection_private.fixture_group_id(c uuid,d jsonb) returns uuid language sql as $$select (d->>'grade_group_id')::uuid$$;
 create function club_selection_private.selection_returning_context(uuid,jsonb) returns jsonb language sql as $$select jsonb_build_object('season',jsonb_build_object('start',date_trunc('year',now())::date,'end',(date_trunc('year',now())+interval '1 year - 1 day')::date))$$;
 create function club_batting_private.consolidate_scorecard_roster(c uuid,old_id uuid,new_id uuid,source_name text) returns void language plpgsql as $$declare original club_selection_private.roster%rowtype;begin
 select * into original from club_selection_private.roster where id=old_id;
 update club_selection_private.roster set name=source_name,active=true,
 usual_grades=club_selection_private.normal_usual_grades(array[grade]||usual_grades||array[original.grade]||original.usual_grades),
 updated_at=now() where id=new_id;end$$;`);
 const identity=read('Database/player_identity_preferences.sql');
 for(const name of ['player_name_key','normal_usual_grades','keep_usual_grades']){const re=new RegExp('create or replace function club_selection_private\\.'+name+'\\([\\s\\S]*?\\$\\$;');await db.exec(identity.match(re)[0]);}
 await db.exec('create trigger roster_usual_grades before insert or update of grade,usual_grades on club_selection_private.roster for each row execute function club_selection_private.keep_usual_grades();');
 await db.exec(read('Database/paste_unavailability.sql'));await db.exec(read('Database/automatic_usual_teams.sql'));return db;}
test('pasted availability is atomic, scoped and safely retried as the authenticated role',async t=>{
 const db=await setup(t),c=uuid(),other=uuid(),admin=uuid(),member=uuid(),ids=[uuid(),uuid(),uuid()];
 await db.query('insert into public.clubs(id) values($1),($2)',[c,other]);await db.query("insert into club_selection_private.access(club_id,status) values($1,'active'),($2,'active')",[c,other]);
 await db.query("insert into public.club_memberships(club_id,user_id,permission_role) values($1,$2,'admin'),($1,$3,'player')",[c,admin,member]);
 for(let i=0;i<3;i++)await db.query('insert into club_selection_private.roster(id,club_id,name) values($1,$2,$3)',[ids[i],i===2?other:c,'Player '+i]);
 await db.query("insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates,blocks,usual_available) values($1,'[\"2026-11-07\",\"2026-11-14\",\"2026-11-21\"]','[\"2026-12-01\"]','[{\"from\":\"2026-12-01\",\"to\":\"2026-12-02\"}]',true)",[ids[0]]);
 async function call(d,who=admin){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);await db.exec('set role authenticated');try{return(await db.query("select public.club_selections_api($1,'availability_paste',$2) result",[c,d])).rows[0].result;}finally{await db.exec('reset role');}}
 const command={request_id:uuid(),roster_revision:0,player_ids:[ids[0]],dates:['2026-11-07','2026-11-14'],revisions:{[ids[0]]:1}};
 const result=await call(command);assert.deepEqual(await call(command),result);
 const a=(await db.query('select * from club_selection_private.availability where roster_id=$1',[ids[0]])).rows[0];
 assert.deepEqual(a.available_dates,['2026-11-21']);assert.deepEqual(a.unavailable_dates,['2026-11-07','2026-11-14','2026-12-01']);assert.equal(a.revision,2);assert.equal(a.usual_available,true);assert.equal(a.blocks.length,1);
 assert.equal((await db.query('select count(*)::integer n from club_selection_private.availability')).rows[0].n,1);
 await assert.rejects(call({...command,request_id:uuid()}),/calendar/);
 await assert.rejects(call({...command,request_id:uuid(),player_ids:[ids[2]]}),/this club/);
 await assert.rejects(call(command,member),/selector/);
 await assert.rejects(call({...command,request_id:uuid(),dates:['2026-11-07','bad']}));
 await assert.rejects(call({...command,dates:['2026-11-21']}),/already used/);
 assert.deepEqual((await db.query('select * from club_selection_private.availability where roster_id=$1',[ids[0]])).rows[0],a);
});
test('usual teams learn only reviewed evidence, preserve manual choices and respect corrections',async t=>{
 const db=await setup(t),c=uuid(),p=uuid(),q=uuid(),g=uuid(),dev=uuid();await db.query('insert into public.clubs(id) values($1)',[c]);await db.query("insert into club_selection_private.access(club_id,status) values($1,'active')",[c]);
 await db.query("insert into public.playing_groups(id,club_id,name,active) values($1,$2,'First',true),($3,$2,'Dev',true)",[g,c,dev]);
 await db.query("insert into club_selection_private.roster(id,club_id,name,usual_grades) values($1,$2,'One',array['First']),($3,$2,'Two',array['First'])",[p,c,q]);
 const today=(await db.query('select current_date::text as day')).rows[0].day;
 const details={grade:'Dev',grade_group_id:dev,format:'t20',days:[{date:today},{date:today}]},slots=[{d1:p,d2:p}];
 const f=uuid();await db.query('insert into club_selection_private.fixtures(id,club_id,details,slots) values($1,$2,$3,$4)',[f,c,details,slots]);
 const teams=async id=>(await db.query('select usual_grades from club_selection_private.roster where id=$1',[id])).rows[0].usual_grades;
 assert.deepEqual(await teams(p),['First'],'Draft selections add nothing');
 await db.query('update club_selection_private.fixtures set published=$1 where id=$2',[{details,slots},f]);assert.deepEqual(await teams(p),['First','Dev']);
 assert.equal((await db.query('select count(*)::integer n from club_selection_private.usual_team_evidence')).rows[0].n,1,'Two playing days count once');
 for(let i=0;i<2;i++)await db.query('insert into club_selection_private.fixtures(id,club_id,details,published) values($1,$2,$3,$4)',[uuid(),c,details,{details,slots}]);assert.deepEqual(await teams(p),['Dev','First'],'Three separate fixtures prioritize observed teams');
 const source=uuid(),team=uuid(),person=uuid();await db.query('insert into club_selection_private.fixture_result_sources values($1,$2,$3,$4,null)',[c,f,source,team]);
 const card={provider:'playhq_au',status:'completed',match_id:source,format_key:'t20',dates:[today,today],teams:[{id:team,lineup_available:true,players:[{player_id:person,name:'Two'}]}]};
 await db.query('insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard) values($1,$2,$3,$4)',[uuid(),c,source,card]);
 assert.equal((await db.query('select roster_id from club_selection_private.usual_team_evidence where fixture_id=$1',[f])).rows[0].roster_id,p,'Unresolved names do not replace a published lineup');
 await db.query('insert into club_selection_private.scorecard_roster_links values($1,$2,$3)',[c,person,q]);
 assert.equal((await db.query('select roster_id from club_selection_private.usual_team_evidence where fixture_id=$1',[f])).rows[0].roster_id,q);assert.deepEqual(await teams(q),['First','Dev']);
 await db.query("update club_selection_private.fixture_result_sources set no_play='abandoned' where fixture_id=$1",[f]);assert.deepEqual(await teams(q),['First'],'Correction removes only automatically inferred team');
 await db.query("update club_selection_private.roster set usual_grades=array['First'] where id=$1",[p]);assert.deepEqual(await teams(p),['First']);await db.query('select club_selection_private.refresh_usual_teams($1)',[c]);assert.deepEqual(await teams(p),['First'],'Deliberate removal stays removed');
 await db.query("update club_selection_private.roster set usual_grades=array['First','Dev'] where id=$1",[p]);await db.query("update club_selection_private.fixtures set published=null where club_id=$1",[c]);assert.deepEqual(await teams(p),['First','Dev'],'Manually added teams survive evidence removal');
 const before=(await db.query('select roster_revision from club_selection_private.access where club_id=$1',[c])).rows[0].roster_revision;await db.query('select club_selection_private.refresh_usual_teams($1)',[c]);assert.equal((await db.query('select roster_revision from club_selection_private.access where club_id=$1',[c])).rows[0].roster_revision,before,'Unchanged evidence does not bump roster revision');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from club_selection_private.usual_team_evidence'),/permission denied/);await db.exec('reset role');
});
