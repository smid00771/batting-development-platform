-- Synthetic accounts and records only. Run in a transaction and roll back.
-- To compare a candidate, run setup + snapshot, the migration, then snapshot
-- again and assert the complete permission matrix is identical.
create temporary table coaching_perf_scope(label text primary key,id uuid,club_id uuid);
create temporary table coaching_perf_baseline(label text,player text,view_ok boolean,edit_ok boolean,recipient boolean);
do $setup$
declare c uuid:=gen_random_uuid();u uuid;head uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();other_pid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();caprid uuid:=gen_random_uuid();g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();d jsonb;slots jsonb;actor_label text;
begin
 insert into auth.users(id,email) values(head,'performance-admin-'||head||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(head,'Synthetic admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic loading test','loading-'||c,head);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,head,'admin','admin');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',head);
 insert into coaching_perf_scope values('admin',head,c);
 foreach actor_label in array array['owner','peer','whole','grade','group','roster','captain','season','outsider'] loop
  u:=gen_random_uuid();insert into auth.users(id,email) values(u,'performance-'||u||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Synthetic '||actor_label);
  insert into coaching_perf_scope values(actor_label,u,c);
  if actor_label<>'outsider' then insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'player','none','player');end if;
 end loop;
 insert into public.playing_groups(id,club_id,name,active,created_by) values(g1,c,'First',true,head),(g2,c,'Second',true,head);
 insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg,c,'Synthetic group',true);
 insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g1,sg),(c,g2,sg);
 insert into public.players(id,club_id,user_id,display_name,grade) values(pid,c,(select id from coaching_perf_scope where label='owner'),'Synthetic player','First'),(other_pid,c,(select id from coaching_perf_scope where label='peer'),'Synthetic peer','Other');
 insert into coaching_perf_scope values('player',pid,c),('other_player',other_pid,c);
 insert into public.player_playing_groups(club_id,player_id,playing_group_id) values(c,pid,g1);
 insert into club_selection_private.roster(id,club_id,name,user_id) values(rid,c,'Synthetic player',(select id from coaching_perf_scope where label='owner')),(caprid,c,'Synthetic captain',(select id from coaching_perf_scope where label='captain'));
 insert into club_batting_private.roster_players(club_id,roster_id,player_id) values(c,rid,pid);
 insert into public.club_access_grants(club_id,user_id,scope,grade,playing_group_id,can_view,can_edit) values
 (c,(select id from coaching_perf_scope where label='whole'),'whole_club',null,null,true,true),
 (c,(select id from coaching_perf_scope where label='grade'),'grade','First',null,true,false),
 (c,(select id from coaching_perf_scope where label='group'),'playing_group',null,g1,true,true),
 (c,(select id from coaching_perf_scope where label='roster'),'playing_group',null,g2,true,false);
 insert into club_selection_private.season_appointments(group_id,club_id,captain_user_id,updated_by) values(g1,c,(select id from coaching_perf_scope where label='season'),head);
 d:=jsonb_build_object('grade','Second','grade_group_id',g2,'format','limited_overs','opposition','Synthetic visitors','days',jsonb_build_array(jsonb_build_object('date',(current_date+1)::text)),'captain_id',(select id from coaching_perf_scope where label='captain'));
 slots:=jsonb_build_array(jsonb_build_object('d1',rid),jsonb_build_object('d1',caprid));
 insert into club_selection_private.fixtures(club_id,details,slots,published) values(c,d,slots,jsonb_build_object('details',d,'slots',slots));
 -- Enough unrelated fixtures to reveal accidental repeated roster rebuilding.
 insert into club_selection_private.fixtures(club_id,details,slots) select c,jsonb_set(d,'{days}',jsonb_build_array(jsonb_build_object('date',(current_date-30-i)::text))),'[]'::jsonb from generate_series(1,40) i;
 insert into public.player_coaching_actions(id,club_id,player_id,signal_key,source_at,outcome,task,recorded_by,is_player_request,preferred_user_id) values(aid,c,pid,'synthetic-loading',now(),'conversation','Synthetic conversation',head,true,(select id from coaching_perf_scope where label='peer'));
 insert into coaching_perf_scope values('action',aid,c);
end $setup$;

create function pg_temp.coaching_perf_matrix()
returns table(label text,player text,view_ok boolean,edit_ok boolean,recipient boolean)
language plpgsql as $matrix$
declare actor record;target record;
begin
 for actor in select * from coaching_perf_scope s where s.label not in ('player','other_player','action') loop
  perform set_config('request.jwt.claim.sub',actor.id::text,true);
  for target in select * from coaching_perf_scope s where s.label in ('player','other_player') loop
   return query select actor.label,target.label,public.can_view_player(target.id),public.can_edit_player(target.id),club_batting_private.coaching_message_recipient((select s.id from coaching_perf_scope s where s.label='action'),actor.id);
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 return query select 'anonymous','player',public.can_view_player((select s.id from coaching_perf_scope s where s.label='player')),public.can_edit_player((select s.id from coaching_perf_scope s where s.label='player')),club_batting_private.coaching_message_recipient((select s.id from coaching_perf_scope s where s.label='action'),null::uuid);
end $matrix$;
