-- Synthetic data only. Compare the compact board response with the default API.
begin;
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();fid uuid;pid uuid;full_ctx jsonb;board_ctx jsonb;started timestamptz;timings jsonb:='{}';i integer;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic selector');
 insert into public.clubs(id,name,slug,created_by) values(c,'Board context test','board-context-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'player','none');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 insert into club_selection_private.roster(club_id,name) values(c,'Synthetic player') returning id into pid;
 for i in 1..24 loop
  insert into club_selection_private.fixtures(club_id,details,slots)
   values(c,jsonb_build_object('grade','Test grade','format','t20','days',jsonb_build_array(jsonb_build_object('date',(date '2099-01-01'+i)::text,'start','12:00'))),jsonb_build_array(jsonb_build_object('d1',pid,'d2',null))) returning id into fid;
 end loop;
 perform set_config('request.jwt.claim.sub',u::text,true);
 started:=clock_timestamp();full_ctx:=public.club_selections_api(c,'context');timings:=timings||jsonb_build_object('full_ms',round(extract(epoch from clock_timestamp()-started)*1000,1));
 started:=clock_timestamp();board_ctx:=public.club_selections_api(c,'context','{"review_snapshots":false}');timings:=timings||jsonb_build_object('board_ms',round(extract(epoch from clock_timestamp()-started)*1000,1));
 assert jsonb_array_length(full_ctx->'reviews')=24,'Legacy review API remains available';
 assert board_ctx->'reviews'='[]','Unused snapshot construction is skipped on the board';
 assert full_ctx-'reviews'=board_ctx-'reviews','Fixtures, publication state, permissions, availability and roster are identical';
 assert octet_length(board_ctx::text)<octet_length(full_ctx::text),'The board response is smaller';
 assert public.club_selections_api(c,'context','{"review_snapshots":true}')=full_ctx,'Explicit reviews are preserved';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.club_selections_api(c,'context','{"review_snapshots":false}');raise exception 'Anonymous request unexpectedly succeeded';exception when raise_exception then assert sqlerrm='Sign in to use Selections';end;
 perform set_config('test.board_context_timings',timings::text,true);
end $tests$;
select 'Compact board response equivalence verified; synthetic rows rolled back' as result,current_setting('test.board_context_timings')::jsonb timings;
rollback;
