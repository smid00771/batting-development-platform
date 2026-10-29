-- Synthetic club and accounts; no saved club settings survive this transaction.
begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();member_id uuid:=gen_random_uuid();outsider_id uuid:=gen_random_uuid();res jsonb;rejected boolean;
begin
 insert into auth.users(id,email) values(member_id,'prediction-menu-'||member_id||'@example.invalid'),(outsider_id,'prediction-menu-'||outsider_id||'@example.invalid');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic prediction menu','prediction-menu-'||c,member_id);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,member_id,'player','none','player');
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 delete from public.club_call_settings where club_id=c;
 res:=public.club_selections_api(c,'access');assert res->'predictions_enabled'='false'::jsonb,'Absent settings do not expose the menu';
 insert into public.club_call_settings(club_id,enabled) values(c,false);
 res:=public.club_selections_api(c,'access');assert res->'predictions_enabled'='false'::jsonb,'Unchecked feature is unavailable';
 update public.club_call_settings set enabled=true where club_id=c;
 res:=public.club_selections_api(c,'access');assert res->'predictions_enabled'='true'::jsonb,'Enabled feature is available to the member';
 assert not(res ? 'calls' or res ? 'awards' or res ? 'settings'),'Access never includes the prediction engine payload';
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 rejected:=false;begin perform public.club_selections_api(c,'access');exception when raise_exception then rejected:=true;end;assert rejected,'Other accounts cannot read club settings';
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;begin perform public.club_selections_api(c,'access');exception when raise_exception then rejected:=true;end;assert rejected,'Anonymous access stays denied';
end $tests$;
rollback;
