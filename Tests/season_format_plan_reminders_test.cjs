const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function setup(t){
 const db=await require('./helpers/plan_date_db.cjs')(t);
 await db.exec(`alter table club_selection_private.roster add column grade text;
 alter table club_selection_private.fixtures add column slots jsonb default '[]';
 alter table club_selection_private.playhq_links add column team_id uuid,add column source_fixture jsonb,add column pending_fixture jsonb;
 create table club_selection_private.playhq_grade_mappings(club_id uuid,season_id uuid,team_id uuid,grade_id uuid);
 create table club_selection_private.fixture_result_sources(club_id uuid,fixture_id uuid,source_match_id uuid,team_id uuid,no_play text);
 create table public.match_review_scorecards(id uuid primary key,club_id uuid,source_match_id uuid,scorecard jsonb,created_at timestamptz default now());
 create table club_selection_private.scorecard_roster_links(club_id uuid,source_player_id uuid,roster_id uuid);
 create table public.match_review_player_links(club_id uuid,source_player_id uuid,player_id uuid);
 create or replace function club_selection_private.fixture_group_id(c uuid,d jsonb) returns uuid language sql stable as $$
 select min(id::text)::uuid from public.playing_groups where club_id=c and active and (id::text=d->>'grade_group_id' or name=d->>'grade') having count(*)=1$$;
 `);
 await db.exec(fs.readFileSync('Database/dropped_player_actual_lineups.sql','utf8').split('create or replace function club_selection_private.lower_grade_moves')[0]);
 await db.exec(fs.readFileSync('Database/season_format_plan_reminders.sql','utf8'));
 const c=id(1),season=id(50),admin=id(10),groups={senior:id(40),dev:id(41),cup:id(42),masters:id(43)},players={};
 await db.query('insert into public.clubs values($1,null)',[c]);
 await db.query("insert into club_selection_private.access values($1,'bundle','active','UTC')",[c]);
 await db.query("insert into public.club_call_settings values($1,'UTC',7)",[c]);
 await db.query('insert into club_selection_private.playhq_connections values($1,$2)',[c,season]);
 await db.query('insert into auth.users values($1,now(),null,null)',[admin]);
 await db.query("insert into public.club_memberships values($1,$2,'admin','both')",[c,admin]);
 for(const [name,g] of Object.entries(groups)){
  await db.query('insert into public.playing_groups values($1,$2,$3,true,true,1)',[g,c,name]);
  await db.query('insert into club_selection_private.playhq_grade_mappings values($1,$2,$3,$3)',[c,season,g]);
 }
 await db.query('insert into club_batting_private.selection_plan_settings(club_id,team_ids) values($1,$2)',[c,[groups.senior,groups.dev,groups.cup]]);
 await db.query('insert into public.philosophy_versions values($1,1)',[c]);
 await db.query('insert into public.how_we_bat_versions values($1,1)',[c]);
 await db.query('insert into public.philosophy_profiles values($1,$2)',[c,{t20:true,limited_overs:true,long_form:true}]);
 await db.query('insert into public.player_plan_structure_versions values($1,$2,1)',[c,{formats:Object.fromEntries(['t20','limited_overs','long_form'].map(f=>[f,[{id:'intent',required:true,active:true}]]))}]);
 const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);let serial=100;
 async function player(name,normal='senior',{complete=false,linked=true}={}){
  const p={id:id(serial++),user:id(serial++),roster:id(serial++)};players[name]=p;
  if(linked){await db.query('insert into auth.users values($1,now(),null,null)',[p.user]);await db.query("insert into public.club_memberships values($1,$2,'player','player')",[c,p.user]);}
  await db.query('insert into public.players values($1,$2,$3,$4,true)',[p.id,c,linked?p.user:null,name]);
  await db.query('insert into club_selection_private.roster(id,club_id,user_id,active,grade) values($1,$2,$3,true,$4)',[p.roster,c,linked?p.user:null,normal]);
  await db.query('insert into club_batting_private.roster_players values($1,$2,$3)',[p.roster,c,p.id]);
  if(complete)await db.query('insert into public.player_plan_workflows values($1,$2)',[p.id,{formats:{long_form:{intent:{comment:'Already ready'}},t20:{intent:{comment:'Already ready'}}}}]);
  return p;
 }
 async function fixture(team,format,offset,{published=[],actual=null,old=false,cancelled=false,manual=false}={}){
  const fid=id(serial++),mid=id(serial++),days=[{date:day(offset),start:'12:00'}];if(format==='two_day')days.push({date:day(offset+7),start:'12:00'});
  const details={grade_group_id:groups[team],grade:team,format,days,cancelled},slots=published.map(name=>({d1:players[name].roster}));
  await db.query('insert into club_selection_private.fixtures(id,club_id,details,published) values($1,$2,$3,$4)',[fid,c,details,published.length?{details,slots}:null]);
  if(!manual)await db.query('insert into club_selection_private.playhq_links values($1,$2,$3,$4,$5,null)',[fid,c,old?id(51):season,groups[team],{format,days:days.map(d=>({date:d.date,time:d.start})),cancelled}]);
  if(actual!==null){
   await db.query('insert into club_selection_private.fixture_result_sources values($1,$2,$3,$4,null)',[c,fid,mid,groups[team]]);
   const people=[];for(const name of actual){const source=id(serial++);people.push({player_id:source});await db.query('insert into club_selection_private.scorecard_roster_links values($1,$2,$3)',[c,source,players[name].roster]);}
   await db.query('insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard) values($1,$2,$3,$4)',[id(serial++),c,mid,{provider:'playhq_au',match_id:mid,status:'completed',format_key:format,dates:days.map(d=>d.date),teams:[{id:groups[team],lineup_available:true,players:people}]}]);
  }
  return {id:fid,details};
 }
 const refresh=()=>db.query('select club_batting_private.refresh_changed_plan_dates() n');
 const rows=async(name)=> (await db.query('select format_key,first_fixture::text,due_date::text,reminder_id from club_batting_private.selection_plan_dates where active and player_id=$1 order by format_key',[players[name].id])).rows;
 return {db,c,season,admin,groups,players,player,fixture,day,refresh,rows};
}

test('Normal team uses fixture formats before the opening XI; later T20 cups wait for publication',async t=>{
 const x=await setup(t),{db,c}=x;
 await x.player('new senior');await x.player('dev only','dev');
 await x.fixture('senior','limited_overs',21);await x.fixture('senior','two_day',56);await x.fixture('dev','limited_overs',21);
 const cup=await x.fixture('cup','t20',2);
 await x.fixture('senior','two_day',1,{old:true});await x.fixture('dev','two_day',3,{cancelled:true});await x.fixture('dev','two_day',4,{manual:true});
 await x.refresh();let rows=await x.rows('new senior');
 assert.deepEqual(rows.map(r=>r.format_key),['limited_overs','long_form']);assert.equal(rows[0].due_date,x.day(14));assert.equal(rows[1].first_fixture,x.day(56));
 assert.deepEqual((await x.rows('dev only')).map(r=>r.format_key),['limited_overs'],'No long-form fixture means no long-form requirement');
 await db.query('update club_selection_private.fixtures set published=$1 where id=$2',[{details:cup.details,slots:[{d1:x.players['new senior'].roster}]},cup.id]);
 assert.equal((await x.rows('new senior')).some(r=>r.format_key==='t20'),false,'Publication only records a change; no synchronous history scan');
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,1);
 assert.equal((await x.rows('new senior')).find(r=>r.format_key==='t20').due_date,x.day(-5));
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,0);
});

test('Week 6 uses all relevant season teams, prefers actual line-ups, and excludes Dev-only players',async t=>{
 const x=await setup(t),{db,c}=x;
 await x.player('senior regular');await x.player('promoted dev','dev');await x.player('dev only','dev');await x.player('normal senior but played dev');await x.player('actual dev','dev');await x.player('completed','dev',{complete:true});await x.player('unlinked','dev',{linked:false});
 await x.fixture('senior','limited_overs',-28,{published:['senior regular','promoted dev','completed','unlinked']});
 await x.fixture('senior','limited_overs',-21,{published:['dev only'],actual:['actual dev']});
 await x.fixture('dev','limited_overs',-21,{published:['dev only','normal senior but played dev']});
 await x.fixture('senior','two_day',7);await x.fixture('dev','limited_overs',7);
 await x.fixture('masters','two_day',7,{published:['dev only']});
 await x.refresh();
 for(const name of ['senior regular','promoted dev','actual dev','completed','unlinked'])assert.equal((await x.rows(name)).find(r=>r.format_key==='long_form').due_date,x.day(0),name);
 for(const name of ['dev only','normal senior but played dev'])assert.equal((await x.rows(name)).some(r=>r.format_key==='long_form'),false,name);
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,5,'Three incomplete linked long-form plans plus two Dev limited-overs plans');
 const recipients=(await db.query("select p.display_name,m.title from club_batting_private.club_messages m join club_batting_private.club_message_recipients r on r.message_id=m.id join public.players p on p.id=r.player_id where m.title like 'Long-form%' order by p.display_name")).rows;
 assert.deepEqual(recipients.map(r=>r.display_name),['actual dev','promoted dev','senior regular']);
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,0);
});

test('an opening-season T20 can use Normal team, while completed and overlapping cups stay deduplicated',async t=>{
 const x=await setup(t),{db,c}=x;await x.player('opening');await x.player('finished','senior',{complete:true});
 await x.fixture('senior','t20',7);await x.fixture('senior','limited_overs',21);
 await x.fixture('cup','t20',8,{published:['opening','finished']});
 await x.refresh();assert.equal((await x.rows('opening')).find(r=>r.format_key==='t20').due_date,x.day(0));
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,1);
 await x.fixture('cup','t20',35,{published:['opening']});
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,0);
});

test('source corrections and Normal team edits coalesce; ordinary draft edits remain quiet and access stays private',async t=>{
 const x=await setup(t),{db,c}=x;await x.player('new senior');await x.fixture('senior','limited_overs',20);const long=await x.fixture('senior','two_day',40);await x.fixture('dev','limited_overs',20);await x.refresh();
 await db.query('update club_selection_private.fixtures set slots=$1,details=details||$2 where id=$3',[[{d1:x.players['new senior'].roster}],{ground:'Changed ground'},long.id]);
 assert.equal((await db.query('select count(*)::int n from club_batting_private.selection_plan_dirty')).rows[0].n,0);
 await db.query('update club_selection_private.playhq_links set pending_fixture=$1 where fixture_id=$2',[{format:'two_day',days:[{date:x.day(50)},{date:x.day(57)}]},long.id]);
 await db.query('update club_selection_private.playhq_links set pending_fixture=pending_fixture where fixture_id=$1',[long.id]);
 assert.equal((await db.query('select count(*)::int n from club_batting_private.selection_plan_dirty')).rows[0].n,1);
 await x.refresh();assert.equal((await x.rows('new senior')).find(r=>r.format_key==='long_form').due_date,x.day(43));
 await db.query("update club_selection_private.roster set grade='dev' where id=$1",[x.players['new senior'].roster]);await x.refresh();
 assert.equal((await x.rows('new senior')).some(r=>r.format_key==='long_form'),false);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[x.admin]);
 const context=(await db.query("select public.club_plan_reminder_settings($1,'context') data",[c])).rows[0].data;
 assert.equal(context.teams.find(g=>g.id===x.groups.senior).formats.find(f=>f.format==='long_form').first_fixture,x.day(50));
 await assert.rejects(db.query('select * from club_batting_private.selection_plan_dirty'),/permission denied/);
 await assert.rejects(db.query('select club_batting_private.refresh_changed_plan_dates()'),/permission denied/);
 await db.exec('reset role');
 await db.query('update club_selection_private.playhq_connections set active_season_id=$1 where club_id=$2',[id(99),c]);await x.refresh();assert.deepEqual(await x.rows('new senior'),[]);
});

test('roster additions refresh requirements and failed source refreshes withhold stale reminders until repaired',async t=>{
 const x=await setup(t),{db,c}=x,p=await x.player('late join');
 const f=await x.fixture('senior','two_day',7);await x.refresh();
 await db.query('delete from club_batting_private.roster_players where roster_id=$1',[p.roster]);
 await db.query('delete from club_selection_private.roster where id=$1',[p.roster]);await x.refresh();
 assert.deepEqual(await x.rows('late join'),[]);
 await db.query('insert into club_selection_private.roster(id,club_id,user_id,active,grade) values($1,$2,$3,true,$4)',[p.roster,c,p.user,'senior']);
 await x.refresh();assert.equal((await x.rows('late join'))[0].due_date,x.day(0));
 await db.query('update club_selection_private.playhq_links set pending_fixture=$1 where fixture_id=$2',[{format:'two_day',days:[{date:'2099-13-01'}]},f.id]);
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,0);
 assert.ok((await db.query('select last_error from club_batting_private.selection_plan_dirty where club_id=$1',[c])).rows[0].last_error);
 assert.equal((await db.query('select count(*)::int n from club_batting_private.club_messages')).rows[0].n,0);
 await db.query('update club_selection_private.playhq_links set pending_fixture=null where fixture_id=$1',[f.id]);
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from club_batting_private.selection_plan_dirty')).rows[0].n,0);
});
