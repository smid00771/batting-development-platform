const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID:uuid}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('publication notifications compare individual selections while preserving shared arrangements and scoped oversight',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;
 create schema club_selection_private;create schema club_batting_private;
 create table club_selection_private.fixtures(id uuid primary key,club_id uuid,details jsonb,published jsonb);
 create table club_selection_private.roster(id uuid primary key,club_id uuid,user_id uuid,active boolean default true);
 create table public.club_memberships(club_id uuid,user_id uuid,involvement text,selector_group text);
 create table club_batting_private.club_messages(id uuid primary key default gen_random_uuid(),club_id uuid,sender_id uuid,request_id uuid,title text,body text,target text,auto_email_fallback boolean,system_key text);
 create table club_batting_private.club_message_recipients(message_id uuid,user_id uuid,staff_copy boolean,primary key(message_id,user_id));
 create table club_selection_private.notifications(message_id uuid,fixture_id uuid,kind text);
 create function club_selection_private.enabled(uuid) returns boolean language sql as $$select true$$;
 create function club_selection_private.fixture_group_id(uuid,jsonb) returns uuid language sql as $$select null::uuid$$;
 create function club_selection_private.season_captains(uuid,uuid) returns uuid[] language sql as $$select array[]::uuid[]$$;
 create function club_selection_private.captain_expires(uuid,jsonb) returns timestamptz language sql as $$select now()+interval '1 year'$$;
 create function club_selection_private.selection_viewer(c uuid,u uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=u and selector_group is not null)$$;
 create function club_selection_private.selection_view(c uuid,d jsonb,u uuid) returns boolean language sql as $$select exists(select 1 from public.club_memberships where club_id=c and user_id=u and selector_group=d->>'grade')$$;
 create function club_selection_private.publication_fixture_label(d jsonb) returns text language sql as $$select d->>'grade'$$;`);
 await db.exec(fs.readFileSync('Database/selective_publication_notifications.sql','utf8'));
 const c=uuid(),other=uuid(),fid=uuid(),fid2=uuid(),head=uuid(),outsider=uuid();
 const people=Array.from({length:5},()=>({id:uuid(),user:uuid()}));
 for(const p of people){await db.query('insert into club_selection_private.roster(id,club_id,user_id) values($1,$2,$3)',[p.id,c,p.user]);await db.query("insert into public.club_memberships values($1,$2,'player',null)",[c,p.user]);}
 await db.query("insert into public.club_memberships values($1,$2,'both','First'),($1,$3,null,'Other')",[c,head,outsider]);
 const details={grade:'First',ground:'Oval',days:[{date:'2026-11-07',time:'12:00'}],meeting:'11:15',match_roles:{d1:{captain_id:people[0].id,keeper_id:people[1].id}},format:'limited_overs'};
 const snap=ids=>({details:structuredClone(details),slots:ids.map(id=>({d1:id,d2:null})),players:[]});
 let current=snap(people.slice(0,4).map(p=>p.id));
 await db.query('insert into club_selection_private.fixtures values($1,$2,$3,$4)',[fid,c,JSON.stringify(details),JSON.stringify(current)]);
 const send=async(old,next=current,id=fid)=>{await db.exec('truncate club_batting_private.club_messages,club_batting_private.club_message_recipients,club_selection_private.notifications');await db.query('update club_selection_private.fixtures set details=$2,published=$3 where id=$1',[id,JSON.stringify(next.details),JSON.stringify(next)]);await db.query('select club_selection_private.notify_publication_batch($1,$2)',[c,JSON.stringify([{fixture_id:id,old_snapshot:old}])]);return (await db.query('select distinct user_id from club_batting_private.club_message_recipients order by user_id')).rows.map(r=>r.user_id).sort();};
 const expected=(...users)=>[...new Set([head,people[0].user,...users])].sort();
 assert.deepEqual(await send(null),expected(...people.slice(0,4).map(p=>p.user)),'First publication reaches all selected players');
 assert.deepEqual(await send(current),expected(),'Unchanged players are quiet; captain and relevant selector retain oversight');
 let next=structuredClone(current);next.slots[3].d1=people[4].id;
 assert.deepEqual(await send(current,next),expected(people[3].user,people[4].user),'Removed and replacement players only');
 next=structuredClone(current);[next.slots[1],next.slots[2]]=[next.slots[2],next.slots[1]];
 assert.deepEqual(await send(current,next),expected(people[1].user,people[2].user),'Batting-order changes notify those whose places change');
 next=structuredClone(current);next.details.match_roles.d1.keeper_id=people[2].id;
 assert.deepEqual(await send(current,next),expected(people[1].user,people[2].user),'Both former and new keeper');
 next=structuredClone(current);next.details.match_roles.d1.captain_id=people[2].id;
 assert.deepEqual(await send(current,next),expected(people[2].user),'Both former and new captain');
 for(const [key,value] of Object.entries({ground:'New oval',meeting:'11:30',days:[{date:'2026-11-08',time:'12:00'}],opposition:'Different visitors',format:'t20',cancelled:true})){
  next=structuredClone(current);next.details[key]=value;
  assert.deepEqual(await send(current,next),expected(...people.slice(0,4).map(p=>p.user)),key+' affects the whole team');
 }
 next=structuredClone(current);next.players=[{id:people[2].id,name:'Updated display name'}];next.details.min_batters=6;next.details.match_roles.d1.keeper_manual=true;
 assert.deepEqual(await send(current,next),expected(),'Roster metadata, validation settings and assignment provenance do not spam players');
 let two=structuredClone(current);two.details.days.push({date:'2026-11-14'});two.slots.forEach(s=>s.d2=s.d1);
 next=structuredClone(two);next.slots[3].d2=people[4].id;
 assert.deepEqual(await send(two,next),expected(people[3].user,people[4].user),'Day-two change leaves other players quiet');
 // A player moving grades appears once in a combined message covering both fixtures.
 const second=snap([people[4].id]);second.details.grade='Second';second.details.match_roles={};
 await db.query('insert into club_selection_private.fixtures values($1,$2,$3,$4)',[fid2,c,JSON.stringify(second.details),JSON.stringify(second)]);
 const firstAfter=structuredClone(current);firstAfter.slots[3].d1=people[4].id;
 const secondAfter=structuredClone(second);secondAfter.slots[0].d1=people[3].id;
 await db.exec('truncate club_batting_private.club_messages,club_batting_private.club_message_recipients,club_selection_private.notifications');
 for(const [id,s] of [[fid,firstAfter],[fid2,secondAfter]])await db.query('update club_selection_private.fixtures set published=$2 where id=$1',[id,JSON.stringify(s)]);
 await db.query('select club_selection_private.notify_publication_batch($1,$2)',[c,JSON.stringify([{fixture_id:fid,old_snapshot:current},{fixture_id:fid2,old_snapshot:second}])]);
 for(const p of people.slice(3))assert.equal((await db.query('select count(*)::int n from club_batting_private.club_message_recipients where user_id=$1',[p.user])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from club_batting_private.club_message_recipients where user_id=$1',[outsider])).rows[0].n,0,'Unrelated selector is excluded');
 await assert.rejects(()=>db.query('select club_selection_private.notify_publication_batch($1,$2)',[other,JSON.stringify([{fixture_id:fid,old_snapshot:current}])]),/must belong to this club/);
 assert.equal((await db.query("select has_function_privilege('authenticated','club_selection_private.notify_publication_batch(uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
