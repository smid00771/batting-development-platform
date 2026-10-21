begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();g uuid:=gen_random_uuid();ctx jsonb;denied boolean:=false;
begin
 insert into auth.users(id,email) values(u,'manage-groups-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Any club','manage-groups-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,u,'admin','admin','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 insert into club_selection_private.selection_groups(id,club_id,name) values(g,c,'Future group');
 perform set_config('request.jwt.claim.sub',u::text,true);
 ctx:=public.selection_group_management_context(c);
 assert jsonb_array_length(ctx->'selection_groups')=1 and ctx->'teams'='[]' and ctx->>'season' is null,'Saved groups open before any season connection';
 assert not exists(select 1 from club_selection_private.playhq_connections where club_id=c),'Viewing does not connect or import';
 assert not exists(select 1 from club_selection_private.fixtures where club_id=c),'Viewing creates no fixtures';
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.selection_group_management_context(c);exception when others then denied:=true;end;
 assert denied,'Unrelated users cannot read the management context';
end $tests$;
rollback;
select 'Management reads saved groups without a provider connection or fixture import; unrelated users denied.' result;
