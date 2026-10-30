const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('linked plans use opted-in published teams, one first-format date and one eligible reminder per season',async t=>{
 const db=await require('./helpers/plan_date_db.cjs')(t);
 const c=id(1),standalone=id(2),admin=id(10),user=id(11),otherUser=id(12),p=id(20),complete=id(21),unlinked=id(22),roster=id(30),rComplete=id(31),rUnlinked=id(32),g1=id(40),g2=id(41),masters=id(42),season=id(50);
 const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 await db.query('insert into public.clubs values($1,null),($2,null)',[c,standalone]);
 for(const u of [admin,user,otherUser])await db.query('insert into auth.users values($1,now(),null,null)',[u]);
 for(const [u,role] of [[admin,'admin'],[user,'player'],[otherUser,'player']])await db.query("insert into public.club_memberships values($1,$2,$3,'player')",[c,u,role]);
 await db.query("insert into club_selection_private.access values($1,'bundle','active','UTC')",[c]);
 await db.query("insert into public.club_call_settings values($1,'UTC',7)",[c]);
 await db.query('insert into club_selection_private.playhq_connections values($1,$2)',[c,season]);
 for(const [g,name] of [[g1,'DBs'],[g2,'U21s'],[masters,'Masters']])await db.query('insert into public.playing_groups values($1,$2,$3,true,false,1)',[g,c,name]);
 for(const [pid,uid,name,rid] of [[p,user,'Overlapping player',roster],[complete,otherUser,'Completed player',rComplete],[unlinked,null,'No account',rUnlinked]]){
  await db.query('insert into public.players values($1,$2,$3,$4,true)',[pid,c,uid,name]);await db.query('insert into club_selection_private.roster values($1,$2,$3,true)',[rid,c,uid]);await db.query('insert into club_batting_private.roster_players values($1,$2,$3)',[rid,c,pid]);
 }
 await db.query("insert into public.philosophy_versions values($1,1);",[c]);await db.query('insert into public.how_we_bat_versions values($1,1)',[c]);
 await db.query('insert into public.philosophy_profiles values($1,$2)',[c,{t20:true,limited_overs:true,long_form:true}]);
 await db.query('insert into public.player_plan_structure_versions values($1,$2,1)',[c,{formats:{t20:[{id:'intent',required:true,active:true}],limited_overs:[{id:'intent',required:true,active:true}],long_form:[{id:'intent',required:true,active:true}]}}]);
 await db.query('insert into public.player_plan_workflows values($1,$2)',[complete,{formats:{t20:{intent:{comment:'Ready for training'}}}}]);
 const config=async(data,who=admin)=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);try{return (await db.query("select public.club_plan_reminder_settings($1,'save',$2) data",[c,data])).rows[0].data;}finally{await db.exec('reset role');}};
 const choice={revision:0,team_ids:[g1,g2],request_id:id(70)};assert.equal((await config(choice)).saved,true);assert.equal((await config(choice)).revision,1);await assert.rejects(config({...choice,team_ids:[masters]}),/different changes/);await assert.rejects(config({...choice,request_id:id(71)},user),/Admin/);
 async function fixture(num,{group=g1,date=day(2),format='t20',published=true,old=false,players=[roster,rComplete,rUnlinked]}={}){
  const details={grade_group_id:group,format,days:[{date,start:'09:00'}]},pub=published?{details,slots:players.map(r=>({d1:r}))}:null;
  // Provider link exists before publication as it does in the real import flow.
  await db.query('insert into club_selection_private.fixtures values($1,$2,$3,null)',[id(num),c,details]);await db.query('insert into club_selection_private.playhq_links values($1,$2,$3)',[id(num),c,old?id(51):season]);
  await db.query('update club_selection_private.fixtures set published=$1 where id=$2',[pub,id(num)]);return id(num);
 }
 const first=await fixture(100),second=await fixture(101,{group:g2,date:day(3)});await fixture(102,{group:masters,date:day(-3)});await fixture(103,{date:day(-9),old:true});await fixture(104,{date:day(-5),published:false});
 let rows=(await db.query('select * from club_batting_private.selection_plan_dates where active')).rows;
 assert.equal(rows.length,3);assert.equal(rows.find(x=>x.player_id===p).first_fixture.toISOString().slice(0,10),day(2));assert.equal(rows.find(x=>x.player_id===p).due_date.toISOString().slice(0,10),day(-5));
 assert.equal((await db.query('select count(*)::int n from club_batting_private.club_messages')).rows[0].n,0,'Saving dates never sends notifications');
 assert.equal((await db.query('select club_batting_private.player_uses_batting($1,$2) allowed',[c,p])).rows[0].allowed,true,'Opted-in cup selections grant plan participation');
 await db.query("insert into public.player_plan_requirements(id,club_id,format_key,target_type,player_id,due_date,active) values($1,$2,'t20','player',$3,$4,true)",[id(80),c,p,day(-30)]);
 assert.equal((await db.query('select due_date from club_batting_private.effective_plan_requirements where player_id=$1',[p])).rows[0].due_date.toISOString().slice(0,10),day(-5),'Linked clubs ignore legacy manual dates');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);const rollout=(await db.query('select public.get_my_player_plan_rollout($1) data',[c])).rows[0].data;
 assert.equal(rollout.requirements.find(r=>r.format_key==='t20').due_date,day(-5));
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,1,'Only incomplete linked players receive a reminder');
 assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,0,'Repeated job cannot duplicate across teams');
 const msg=(await db.query('select * from club_batting_private.club_messages')).rows[0];assert.match(msg.title,/T20.*overdue/);assert.match(msg.body,/training/);
 assert.equal((await db.query('select club_batting_private.message_recipient_allowed($1,$2) ok',[msg.id,user])).rows[0].ok,true);
 await db.query('update club_batting_private.selection_plan_dates set reminder_id=null where player_id=$1',[p]);
 await db.query('select club_batting_private.sync_selection_plan_dates($1)',[c]);
 assert.equal((await db.query('select reminder_id from club_batting_private.selection_plan_dates where player_id=$1',[p])).rows[0].reminder_id,msg.id,'Enabling the feature adopts a reminder already sent through Messages');
 await config({revision:1,team_ids:[],request_id:id(72)});assert.equal((await db.query('select count(*)::int n from club_batting_private.selection_plan_dates where active')).rows[0].n,0);
 assert.equal((await db.query('select club_batting_private.message_recipient_allowed($1,$2) ok',[msg.id,user])).rows[0].ok,false,'Unchecked teams revoke pending delivery eligibility');
 await config({revision:2,team_ids:[g1,g2],request_id:id(73)});assert.equal((await db.query('select club_batting_private.queue_selection_plan_reminders($1) n',[c])).rows[0].n,0,'Re-enabling cannot send a duplicate');
 await db.query('update club_selection_private.fixtures set published=null where id=any($1)',[[first,second]]);assert.equal((await db.query('select count(*)::int n from club_batting_private.selection_plan_dates where active')).rows[0].n,0,'Withdrawn selections remove the automatic requirement');
 await db.query("insert into public.player_plan_requirements(id,club_id,format_key,target_type,due_date,active) values($1,$2,'t20','all',$3,true)",[id(81),standalone,day(7)]);assert.equal((await db.query('select count(*)::int n from club_batting_private.effective_plan_requirements where club_id=$1',[standalone])).rows[0].n,1);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from club_batting_private.selection_plan_dates'),/permission denied/);await assert.rejects(db.query('select club_batting_private.queue_selection_plan_reminders()'),/permission denied/);await db.exec('reset role');
});
