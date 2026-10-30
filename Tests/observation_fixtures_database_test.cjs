const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('saved fixture context and fixture-specific innings preserve club/player access and match identity',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('Tests/fixtures/observation_fixtures_baseline.sql','utf8'));await db.exec(fs.readFileSync('Database/observation_saved_fixtures.sql','utf8'));
 const c=id(1),other=id(2),coach=id(3),stranger=id(4),p=id(5),q=id(6),g=id(7),off=id(8),f=id(9),second=id(10),foreign=id(11),cancelled=id(12),opted=id(13),m=id(20);
 await db.query('insert into players values($1,$2,true),($3,$4,true)',[p,c,q,other]);await db.query('insert into test_access values($1,$2,$3)',[coach,c,p]);
 await db.query("insert into playing_groups values($1,$2,'First Grade',true,0,true),($3,$2,'Opted out',true,1,false)",[g,c,off]);
 const details={grade_group_id:g,grade:'First Grade',format:'t20',opposition:'Visitors',days:[{date:'2026-10-31',start:'10:00',ground:'Oval'},{date:'2026-11-07'}]};
 for(const [fid,club,d] of [[f,c,details],[second,c,{...details,opposition:'Afternoon visitors'}],[foreign,other,details],[cancelled,c,{...details,cancelled:true}],[opted,c,{...details,grade_group_id:off}]])await db.query('insert into club_selection_private.fixtures values($1,$2,$3)',[fid,club,JSON.stringify(d)]);
 await db.query("insert into player_match_entries values($1,$2,$3,'2026-10-31','t20','Visitors',1)",[m,c,p]);await db.query('insert into club_batting_private.fixture_innings values($1,$2,$3)',[m,c,f]);
 const as=user=>db.query("select set_config('test.user',$1,false)",[user||'']);
 const context=async(match=null,player=p,club=c)=>(await db.query('select club_batting_private.get_individual_match_fixtures($1,$2,$3) v',[club,player,match])).rows[0].v;
 const values={match_date:'2026-10-31',format_key:'t20',innings_number:1,opposition:'Visitors',fixture_id:f};
 const find=async v=>(await db.query('select club_batting_private.find_shared_innings($1,null,$2) v',[p,JSON.stringify(v)])).rows[0].v;
 await as(coach);const list=await context();assert.deepEqual(list.fixtures.map(x=>x.id).sort(),[f,second].sort());assert.equal(list.fixtures.find(x=>x.id===f).days[1].date,'2026-11-07');assert.equal(list.fixtures.find(x=>x.id===f).ground,'Oval');assert.deepEqual(list.player_innings,[{match_id:m,innings_number:1,fixture_id:f}]);
 assert.equal((await context(m)).linked_fixture_id,f);assert.equal(await find(values),m);
 assert.equal(await find({...values,fixture_id:second,opposition:'Afternoon visitors'}),null,'Separate saved same-day match permits its own first innings');
 assert.equal(await find({...values,innings_number:2}),null,'Second innings remains inside the same fixture');
 await assert.rejects(find({...values,fixture_id:foreign}),/saved fixture/);await assert.rejects(find({...values,opposition:'Wrong visitors'}),/saved fixture/);
 await assert.rejects(context(null,q,c),/Coaching edit access/);await assert.rejects(context(m,q,other),/Coaching edit access/);
 await as(stranger);await assert.rejects(context(),/Coaching edit access/);await as(null);await assert.rejects(context(),/Coaching edit access/);await as(coach);
 // A cancelled/opted-out historical fixture remains readable only through its linked innings.
 await db.query('update club_selection_private.fixtures set details=$1 where id=$2',[JSON.stringify({...details,cancelled:true,grade_group_id:off}),f]);
 assert.ok(!(await context()).fixtures.some(x=>x.id===f));assert.ok((await context(m)).fixtures.some(x=>x.id===f));
 assert.equal((await db.query("select has_function_privilege('anon','club_batting_private.get_individual_match_fixtures(uuid,uuid,uuid)','EXECUTE') v")).rows[0].v,false);
});
