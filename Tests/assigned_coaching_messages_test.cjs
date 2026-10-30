const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync('Database/assigned_coaching_messages.sql','utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('coaching messages target assigned people, with access checks and idempotent event delivery',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema club_batting_private;create schema club_selection_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.clubs(id uuid primary key,archived_at timestamptz);
 create table public.club_memberships(club_id uuid,user_id uuid,permission_role text,involvement text);
 create table public.user_profiles(user_id uuid,display_name text);
 create table public.players(id uuid primary key,club_id uuid,user_id uuid,display_name text,grade text,active boolean);
 create table public.club_access_grants(club_id uuid,user_id uuid,can_view boolean,scope text,player_id uuid,playing_group_id uuid,grade text);
 create table public.player_playing_groups(player_id uuid,playing_group_id uuid);
 create table public.player_coaching_actions(id uuid primary key,club_id uuid,player_id uuid,preferred_user_id uuid,is_player_request boolean default false,status text default 'open',follow_up_requested boolean default true,review_on date,match_feedback_id uuid,revision integer default 1,updated_at timestamptz default now(),recorded_by uuid);
 create table public.player_coaching_action_reviews(action_id uuid,reviewed_by uuid,revision int,reviewed_at timestamptz);
 create table public.player_match_coach_feedback(id uuid,player_id uuid,match_entry_id uuid,batting_to_plan text,dismissal_classification text,updated_at timestamptz default now());
 create table public.player_match_reflections(player_id uuid,match_entry_id uuid,batting_to_plan text,dismissal_classification text,updated_at timestamptz default now());
 create table club_batting_private.coaching_duties(club_id uuid,id uuid,title text,sort_order int,primary key(club_id,id));
 create table club_batting_private.coaching_duty_members(club_id uuid,duty_id uuid,user_id uuid,primary key(club_id,duty_id,user_id),foreign key(club_id,duty_id) references club_batting_private.coaching_duties(club_id,id) on delete cascade);
 create table club_batting_private.coaching_staff_settings(club_id uuid primary key,revision int default 0,updated_at timestamptz,updated_by uuid,last_request_id uuid,last_payload jsonb);
 create table club_batting_private.club_messages(id uuid primary key default gen_random_uuid(),club_id uuid,sender_id uuid,request_id uuid,title text,body text,target text,kind text,auto_email_fallback boolean,system_key text,skipped jsonb,created_at timestamptz default now(),constraint club_messages_target_check check(target in ('','myplan')),unique(club_id,system_key));
 create table club_batting_private.club_message_recipients(message_id uuid,user_id uuid,staff_copy boolean,opened_at timestamptz,deleted_at timestamptz,primary key(message_id,user_id));
 create function public.is_club_admin(c uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=auth.uid() and permission_role='admin')$$;
 create function club_batting_private.player_uses_batting(c uuid,p uuid) returns boolean language sql as $$select true$$;
 create function club_batting_private.roster_coaching_access(c uuid,p uuid,u uuid,e boolean) returns boolean language sql as $$select false$$;
 create function club_selection_private.temporary_captain_player(c uuid,p uuid,u uuid) returns boolean language sql as $$select false$$;
 create function club_selection_private.season_captain_player(c uuid,p uuid,u uuid) returns boolean language sql as $$select false$$;
 `);
 const c=id(1),player=id(2),bat=id(3),bowler=id(4),preferred=id(5),admin=id(6),author=id(7),duty=id(8),otherClub=id(9),action=id(10);
 await db.query('insert into public.clubs values($1,null),($2,null)',[c,otherClub]);
 await db.query(`insert into public.players values($1,$2,null,'Synthetic Player','Grade',true)`,[player,c]);
 for(const u of [bat,bowler,preferred,admin,author])await db.query(`insert into public.club_memberships values($1,$2,$3,'coach_captain')`,[c,u,u===admin?'admin':'coach']);
 for(const u of [bat,bowler,author])await db.query(`insert into public.club_access_grants values($1,$2,true,'whole_club',null,null,null)`,[c,u]);
 await db.query(`insert into club_batting_private.coaching_duties values($1,$2,'Batting Coach',0)`,[c,duty]);
 // Apply the real event and assignment functions; unrelated legacy APIs are exercised by the app integration suite.
 const prefix=sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION club_batting_private.message_recipient_allowed'));
 await db.exec(prefix);
 await db.query('insert into club_batting_private.coaching_duty_members values($1,$2,$3)',[c,duty,bat]);
 const recipient=async(a,u)=>(await db.query('select club_batting_private.coaching_message_recipient($1,$2) ok',[a,u])).rows[0].ok;
 await t.test('only the batting coach gets the unassigned follow-up, not other coaches or admins',async()=>{
  await db.query('insert into public.player_coaching_actions(id,club_id,player_id,recorded_by) values($1,$2,$3,$4)',[action,c,player,author]);
  assert.deepEqual((await db.query('select user_id from club_batting_private.club_message_recipients')).rows,[{user_id:bat}]);
  assert.equal(await recipient(action,bowler),false);assert.equal(await recipient(action,admin),false);
  assert.equal((await db.query('select coaching_action_id from club_batting_private.club_messages')).rows[0].coaching_action_id,action);
 });
 await t.test('a chosen person replaces default delivery, while player requests retain their explicit limited access',async()=>{
  const aid=id(11);await db.query('insert into public.player_coaching_actions(id,club_id,player_id,recorded_by,preferred_user_id,is_player_request) values($1,$2,$3,$4,$5,true)',[aid,c,player,author,preferred]);
  assert.equal(await recipient(aid,preferred),true);assert.equal(await recipient(aid,bat),false);
  assert.deepEqual((await db.query('select r.user_id from club_batting_private.club_message_recipients r join club_batting_private.club_messages m on m.id=r.message_id where m.coaching_action_id=$1',[aid])).rows,[{user_id:preferred}]);
 });
 await t.test('repeat events preserve reads; another person’s genuine update makes the same message unread',async()=>{
  await db.query('update club_batting_private.club_message_recipients set opened_at=now()');
  await db.query('select club_batting_private.sync_coaching_message($1)',[action]);
  assert.ok((await db.query('select opened_at from club_batting_private.club_message_recipients where user_id=$1',[bat])).rows[0].opened_at);
  await db.query('update public.player_coaching_actions set revision=revision+1,updated_at=clock_timestamp() where id=$1',[action]);
  assert.equal((await db.query('select opened_at from club_batting_private.club_message_recipients where user_id=$1',[bat])).rows[0].opened_at,null);
  assert.equal((await db.query('select count(*)::int n from club_batting_private.club_messages where coaching_action_id=$1',[action])).rows[0].n,1);
 });
 await t.test('routine notes stay quiet; an independently saved reflection mismatch creates a follow-up',async()=>{
  const a=id(12),f=id(13),m=id(14);
  await db.query(`insert into public.player_match_coach_feedback(id,player_id,match_entry_id,batting_to_plan,dismissal_classification) values($1,$2,$3,'yes','plan_execution')`,[f,player,m]);
  await db.query('insert into public.player_coaching_actions(id,club_id,player_id,recorded_by,follow_up_requested,match_feedback_id) values($1,$2,$3,$4,false,$5)',[a,c,player,author,f]);
  assert.equal((await db.query('select count(*)::int n from club_batting_private.club_messages where coaching_action_id=$1',[a])).rows[0].n,0);
  await db.query(`insert into public.player_match_reflections(player_id,match_entry_id,batting_to_plan,dismissal_classification) values($1,$2,'no','outside_plan')`,[player,m]);
  assert.equal((await db.query('select count(*)::int n from club_batting_private.club_messages where coaching_action_id=$1',[a])).rows[0].n,1);
 });
 await t.test('removed access, club membership and assignment revoke message visibility',async()=>{
  await db.query('delete from public.club_access_grants where user_id=$1',[bat]);assert.equal(await recipient(action,bat),false);
  await db.query(`insert into public.club_access_grants values($1,$2,true,'whole_club',null,null,null)`,[c,bat]);
  await db.query('update club_batting_private.coaching_duties set receives_batting_conversations=false');assert.equal(await recipient(action,bat),false);
  await db.query('update club_batting_private.coaching_duties set receives_batting_conversations=true');
  await db.query('delete from public.club_memberships where user_id=$1',[bat]);assert.equal(await recipient(action,bat),false);
 });
 await t.test('legacy message dispatch checks targeted coaching before its general staff fallback',async()=>{
  const body=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION club_batting_private.message_recipient_allowed'));
  assert.ok(body.indexOf('coaching_message_recipient(m.coaching_action_id,p_user)')<body.indexOf('message_recipient_allowed_before_selections'));
  assert.match(sql,/'coaching_action_id',m.coaching_action_id/);
  assert.doesNotMatch(sql,/create or replace function public.can_(read|review)_coaching_conversation/i);
 });
});
