-- Exercise the existing save API only. No schema or real club data changes;
-- the synthetic records and any queued messages roll back before returning.
do $tests$
declare c uuid:=gen_random_uuid();head_id uuid:=gen_random_uuid();player_user uuid:=gen_random_uuid();u uuid;
 p uuid:=gen_random_uuid();q uuid:=gen_random_uuid();fs uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
 day date:=(now() at time zone 'Australia/Sydney')::date+14;d jsonb;picks jsonb;req jsonb;res jsonb;original jsonb;f club_selection_private.fixtures%rowtype;rejected boolean;
begin
 begin
  foreach u in array array[head_id,player_user] loop
   insert into auth.users(id,email) values(u,'vacancy-save-test-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic vacancy test');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Vacancy save test','vacancy-save-'||c,head_id);
  insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values(c,head_id,'admin','admin',null),(c,player_user,'player','none','player');
  insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',head_id,'Australia/Sydney');
  insert into club_selection_private.roster(id,club_id,name,user_id,keeper,active) values(p,c,'Unavailable player',player_user,true,true),(q,c,'Unanswered player',null,false,true);
  insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates) values(p,jsonb_build_array((day+7)::text,(day+21)::text),jsonb_build_array(day::text,(day+14)::text));
  for i in 1..2 loop
   d:=jsonb_build_object('grade','Test Grade','competition','Test','format','long_form','opposition','Test opponent','days',jsonb_build_array(jsonb_build_object('date',(day+(i-1)*14)::text),jsonb_build_object('date',(day+(i-1)*14+7)::text)),'brackets',true,'min_quicks',0,'min_batters',0,
    'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',p,'captain_manual',true,'keeper_id',p,'keeper_manual',true),'d2',jsonb_build_object('captain_id',p,'captain_manual',true,'keeper_id',p,'keeper_manual',true)));
   select jsonb_agg(jsonb_build_object('d1',case when n=4 then p when n=5 then q end,'d2',case when n=4 then p when n=5 then q end) order by n) into picks from generate_series(1,11) n;
   insert into club_selection_private.fixtures(id,club_id,details,slots) values(fs[i],c,d,picks);
  end loop;
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=fs[2];
  select published into original from club_selection_private.fixtures where id=fs[2];
  perform set_config('request.jwt.claim.sub',head_id::text,true);
  for i in 1..2 loop
   select * into f from club_selection_private.fixtures where id=fs[i];
   d:=jsonb_set(f.details,'{match_roles,d1}',jsonb_build_object('captain_id',null,'captain_manual',false,'keeper_id',null,'keeper_manual',false));
   picks:=jsonb_set(f.slots,'{3,d1}','null');
   req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',f.id,'revision',f.revision,'details',d,'slots',picks)));
   if i=2 then
    rejected:=false;begin perform public.club_selections_api(c,'save_board',req);exception when raise_exception then rejected:=sqlerrm like 'Published team is locked.%';end;assert rejected,'Vacancy save respects the publication lock';
    res:=public.club_selections_api(c,'fixture_lock',jsonb_build_object('id',f.id,'revision',f.revision,'unlock',true,'request_id',gen_random_uuid()));
    req:=jsonb_set(req,'{fixtures,0,revision}',res->'revision');
   end if;
   res:=public.club_selections_api(c,'save_board',req);assert res->>'saved'='true';
   assert (select slots->3->>'d1' is null and slots->3->>'d2'=p::text and slots->4->>'d1'=q::text and jsonb_array_length(slots)=11 from club_selection_private.fixtures where id=f.id),'Exact day vacated; order, partner and unknown availability retained';
   assert (select details->'match_roles'->'d1'->>'captain_id' is null and details->'match_roles'->'d2'->>'captain_id'=p::text from club_selection_private.fixtures where id=f.id),'Appointments follow selected days';
   assert public.club_selections_api(c,'save_board',req)=res,'Interrupted save retries the same receipt';
   rejected:=false;begin perform public.club_selections_api(c,'save_board',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm like 'A team changed in another session%';end;assert rejected,'Stale teams cannot overwrite a newer choice';
  end loop;
  assert (select published=original and publication=1 from club_selection_private.fixtures where id=fs[2]),'Published selection remains unchanged until Head republishes';
  perform set_config('request.jwt.claim.sub',player_user::text,true);
  rejected:=false;begin perform public.club_selections_api(c,'save_board',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=sqlerrm='Selector access required';end;assert rejected,'Ordinary player cannot save teams';
  raise exception using errcode='P0228',message='Rollback vacancy save tests';
 exception when sqlstate 'P0228' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic records removed';
end $tests$;
select 'Existing draft-save API vacancy checks passed; synthetic records rolled back.' result;
