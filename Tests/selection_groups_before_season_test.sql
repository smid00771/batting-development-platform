begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();g uuid:=gen_random_uuid();ctx jsonb;req jsonb;
begin
 insert into auth.users(id,email) values(u,'empty-groups-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Any club','empty-groups-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'admin','admin','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 ctx:=public.club_selection_groups(c,'context');
 ctx:=public.club_selection_group_manage(c,'add_group',jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','name','Future competition'));
 assert jsonb_array_length(ctx->'selection_groups')=1 and ctx->'grades'='[]','An empty group can be created without a connection or any grades';
 req:=jsonb_build_object('request_id',gen_random_uuid(),'revision',ctx->'revision','expected_grades',ctx->'expected_grades','groups',(ctx->'selection_groups')||jsonb_build_array(jsonb_build_object('id',g,'name','Another future group')),'grades','[]'::jsonb);
 ctx:=public.club_selection_groups(c,'save',req);
 assert ctx=public.club_selection_groups(c,'save',req),'Empty setup retry is idempotent';
 ctx:=public.club_selection_groups(c,'context');
 assert jsonb_array_length(ctx->'selection_groups')=2 and ctx->'grades'='[]' and ctx->'mappings'='[]','Both saved groups return without source links';
 assert not exists(select 1 from club_selection_private.playhq_connections where club_id=c),'No association connection needed';
 assert not exists(select 1 from club_selection_private.fixtures where club_id=c),'Empty groups create no fixtures';
end $tests$;
rollback;
select 'Empty groups save and reopen without a season, association connection, team or fixture.' result;
