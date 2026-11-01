import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
// Install @electric-sql/pglite@0.5.14 in an isolated test directory, then point
// MIRELION_PGLITE_MODULE to its dist/index.js. No production connection is used.
const {PGlite}=await import(process.env.MIRELION_PGLITE_MODULE?pathToFileURL(process.env.MIRELION_PGLITE_MODULE).href:'@electric-sql/pglite');
const db=new PGlite();
const read=name=>fs.readFile(new URL(name,import.meta.url),'utf8');
try{
 await db.exec('set check_function_bodies=off;'+await read('fixtures/coaching_access_local.sql'));
 await db.exec(await read('fixtures/coaching_access_before_336.sql'));
 await db.exec(await read('coaching_access_performance_test.sql'));
 const before=await db.query('select * from pg_temp.coaching_perf_matrix() order by label,player');
 await db.exec(await read('../supabase/migrations/20261101111311_coaching_player_loading_336.sql'));
 const after=await db.query('select * from pg_temp.coaching_perf_matrix() order by label,player');
 assert.deepEqual(after.rows,before.rows);
 const permission=(label,player='player')=>after.rows.find(x=>x.label===label&&x.player===player);
 assert.equal(permission('owner').view_ok,true);assert.equal(permission('owner').edit_ok,false);
 assert.equal(permission('outsider').view_ok,false);assert.equal(permission('anonymous').view_ok,false);
 assert.equal(permission('roster').view_ok,true);assert.equal(permission('roster').edit_ok,false);
 assert.equal(permission('group').edit_ok,true);assert.equal(permission('grade').edit_ok,false);
 assert.equal(permission('captain').view_ok,true);assert.equal(permission('season').view_ok,true);
 assert.equal(permission('peer').recipient,true);assert.equal(permission('admin').recipient,false);
 await db.exec(`grant usage on schema public,club_batting_private to authenticated;
 do $test$
 declare c uuid;pid uuid;pu uuid;peer uuid;other_pid uuid;mid uuid:=gen_random_uuid();foreign_mid uuid:=gen_random_uuid();oid uuid:=gen_random_uuid();second_oid uuid:=gen_random_uuid();foreign_oid uuid:=gen_random_uuid();data jsonb;denied boolean;
 begin
  select id,club_id into pid,c from coaching_perf_scope where label='player';
  select id into pu from coaching_perf_scope where label='owner';
  select id into peer from coaching_perf_scope where label='peer';
  select id into other_pid from coaching_perf_scope where label='other_player';
  insert into public.player_match_entries values(mid,c,pid),(foreign_mid,c,other_pid);
  insert into public.player_match_coach_feedback values(oid,pid,mid,'Requested note'),(second_oid,pid,mid,'Other note'),(foreign_oid,other_pid,foreign_mid,'Other player');
  perform set_config('request.jwt.claim.sub',pu::text,true);set local role authenticated;
  data:=public.get_my_coaching_observation(c,oid);
  assert jsonb_array_length(data->'matches')=1,'Only one innings';
  assert jsonb_array_length(data#>'{matches,0,coach_feedback}')=1,'Only the requested observation';
  assert data#>>'{matches,0,coach_feedback,0,note}'='Requested note','Exact requested note';
  assert not (data#>'{matches,0}')?'scorecard','No unneeded scorecard in player response';
  assert public.get_my_coaching_observation(c,foreign_oid)->'matches'='[]'::jsonb,'Another player stays inaccessible';
  assert public.get_my_coaching_observation(c,gen_random_uuid())->'matches'='[]'::jsonb,'Missing note has no fallback';
  reset role;
  perform set_config('request.jwt.claim.sub',(select id::text from coaching_perf_scope where label='outsider'),true);set local role authenticated;
  denied:=false;begin perform public.get_my_coaching_observation(c,oid);exception when raise_exception then denied:=true;end;
  assert denied,'No registration cannot read';reset role;
  perform set_config('request.jwt.claim.sub',pu::text,true);
  update public.players set active=false where id=pid;
  denied:=false;begin perform public.get_my_coaching_observation(c,oid);exception when raise_exception then denied:=true;end;assert denied,'Inactive player cannot read';
  update public.players set active=true where id=pid;update public.clubs set archived_at=now() where id=c;
  denied:=false;begin perform public.get_my_coaching_observation(c,oid);exception when raise_exception then denied:=true;end;assert denied,'Archived club cannot read';
 end $test$;`);
 assert.equal((await db.query("select has_function_privilege('anon','public.get_my_coaching_observation(uuid,uuid)','execute') as allowed")).rows[0].allowed,false);
 console.log(`${after.rows.length} unchanged access cases; exact-observation scope, missing/foreign notes, inactive/archived access and anonymous execution passed in local Postgres.`);
}catch(error){console.error(JSON.stringify({message:error.message,detail:error.detail,where:error.where,code:error.code},null,2));process.exitCode=1;}finally{await db.close();}
