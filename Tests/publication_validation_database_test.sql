-- Synthetic publication checks and messages only; the transaction is rolled back.
begin;
set local statement_timeout='20s';
do $tests$
declare c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();player_user uuid:=gen_random_uuid();
 ids uuid[]:=array(select gen_random_uuid() from generate_series(1,11));fid uuid:=gen_random_uuid();
 day date:=current_date+14;d jsonb;slots jsonb;check_result jsonb;res jsonb;req jsonb;notes jsonb;rejected boolean;deliveries integer;
begin
 insert into auth.users(id,email) values(head_id,'publish-'||head_id||'@example.invalid'),(player_user,'publish-'||player_user||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(head_id,'Synthetic Head'),(player_user,'Synthetic Player');
 insert into public.clubs(id,name,slug,created_by) values(c,'Publication validation test','publication-'||c,head_id);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,head_id,'player','none','player'),(c,player_user,'player','none','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',head_id);
 for i in 1..11 loop
  insert into club_selection_private.roster(id,club_id,name,active,user_id,batting,bowling,bowling_load,keeper)
   values(ids[i],c,'Synthetic player '||i,true,case when i=1 then head_id when i=2 then player_user end,'middle','pace','frontline',false);
  insert into club_selection_private.availability(roster_id,available_dates) values(ids[i],jsonb_build_array(day::text,(day+7)::text));
 end loop;
 d:=jsonb_build_object('grade','Example XI','competition','Test','format','long_form','brackets',false,'min_quicks',0,'min_batters',0,'days',jsonb_build_array(jsonb_build_object('date',day),jsonb_build_object('date',day+7)),
  'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',ids[1],'captain_manual',true,'keeper_id',null,'keeper_manual',false),'d2',jsonb_build_object('captain_id',ids[1],'captain_manual',true,'keeper_id',null,'keeper_manual',false)));
 slots:=(select jsonb_agg(jsonb_build_object('d1',id,'d2',id)) from unnest(ids) id);
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,d,slots);
 perform set_config('request.jwt.claim.sub',head_id::text,true);
 check_result:=public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(fid)));
 assert check_result#>>'{fixtures,0,id}'=fid::text and check_result#>>'{fixtures,0,revision}'='1';
 notes:=check_result#>'{fixtures,0,issues}';
 assert jsonb_array_length(notes)=2 and not exists(select 1 from jsonb_array_elements(notes) n where n->>'code'<>'missing_keeper' or n->>'level'<>'warning'),'Unnamed keepers are warnings on both playing days';
 assert not exists(select 1 from club_selection_private.requests where club_id=c),'Opening review writes no mutation receipt';
 assert not exists(select 1 from club_batting_private.club_messages where club_id=c),'Opening review sends nothing';
 assert public.club_selections_api(c,'context')#>'{fixtures,0,issues}'='[]'::jsonb,'Normal board context stays quiet';
 perform set_config('request.jwt.claim.sub',player_user::text,true);
 rejected:=false;begin perform public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(fid)));exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary players cannot inspect draft checks';
 perform set_config('request.jwt.claim.sub','',true);
 rejected:=false;begin perform public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(fid)));exception when raise_exception then rejected:=true;end;assert rejected,'Anonymous callers denied';
 perform set_config('request.jwt.claim.sub',head_id::text,true);
 rejected:=false;begin perform public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(gen_random_uuid())));exception when raise_exception then rejected:=true;end;assert rejected,'Unknown or foreign fixtures denied';
 req:=jsonb_build_object('ids',jsonb_build_array(fid),'revisions',jsonb_build_object(fid::text,1),'request_id',gen_random_uuid(),'acknowledge_balance',false);
 update club_selection_private.fixtures set details=jsonb_set(d,'{match_roles,d1,captain_id}','null') where id=fid;
 rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'Missing captain remains a blocker';
 update club_selection_private.fixtures set details=jsonb_set(jsonb_set(d,'{match_roles,d1,keeper_id}',to_jsonb(gen_random_uuid())),'{match_roles,d1,keeper_manual}','true') where id=fid;
 rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then rejected:=true;end;assert rejected,'An invalid named keeper remains a blocker';
 assert not exists(select 1 from club_batting_private.club_messages where club_id=c),'Rejected publication has no notifications';
 update club_selection_private.fixtures set details=d where id=fid;
 res:=public.club_selections_api(c,'publish',req);
 assert res->>'published'='true','Missing keepers allow publication without a warning acknowledgement';
 assert (select publication=1 and published#>>'{details,match_roles,d1,keeper_id}' is null from club_selection_private.fixtures where id=fid),'No keeper is invented';
 select count(*) into deliveries from club_batting_private.club_messages where club_id=c;
 assert public.club_selections_api(c,'publish',req)=res,'Publication retry returns its existing receipt';
 assert (select count(*)=deliveries from club_batting_private.club_messages where club_id=c),'No duplicate notifications';
 assert not has_function_privilege('authenticated','club_selection_private.publication_check(uuid,jsonb)','EXECUTE');
end $tests$;
rollback;
