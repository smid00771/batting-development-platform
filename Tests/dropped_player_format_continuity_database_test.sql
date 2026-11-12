-- Synthetic fixtures and identities only. Run atomically; always roll back.
begin;
set local statement_timeout='20s';
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();captain uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();v uuid;
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();p3 uuid:=gen_random_uuid();
 prior uuid:=gen_random_uuid();current_id uuid:=gen_random_uuid();older uuid:=gen_random_uuid();t20 uuid:=gen_random_uuid();higher uuid:=gen_random_uuid();
 day date:=(date_trunc('week',current_date)+interval '19 days')::date;d jsonb;pair jsonb;req jsonb;res jsonb;reminder jsonb;variant record;rejected boolean;
begin
 foreach v in array array[u,captain,ordinary] loop
  insert into auth.users(id,email) values(v,'drop-format-'||v||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(v,'Synthetic drop-format user');
 end loop;
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic drop-format club','drop-format-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'player','none'),(c,captain,'captain','captain'),(c,ordinary,'player','none');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 insert into club_selection_private.roster(id,club_id,name,user_id,active) values(p1,c,'Synthetic Day 1',ordinary,true),(p2,c,'Synthetic Day 2',null,true),(p3,c,'Synthetic older player',captain,true);
 insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates) values
  (p1,jsonb_build_array(day::text),jsonb_build_array((day+7)::text)),
  (p2,jsonb_build_array((day+7)::text),jsonb_build_array(day::text)),(p3,jsonb_build_array(day::text,(day+7)::text),'[]');
 d:=jsonb_build_object('grade','1st Grade','competition','Example competition','season','2026/27','format','limited_overs','opposition','Example opposition','ground','Example ground','min_quicks',0,'min_batters',0,'brackets',false,'captain_id',captain,'days',jsonb_build_array(jsonb_build_object('date',(day-14)::text)));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(prior,c,d,jsonb_build_array(jsonb_build_object('d1',p1,'d2',null),jsonb_build_object('d1',p2,'d2',null)));
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id),publication=1 where id=prior;
 pair:=jsonb_build_array(jsonb_build_object('d1',p1,'d2',p2),jsonb_build_object('d1',p3,'d2',p3))||(select jsonb_agg(jsonb_build_object('d1',null,'d2',null)) from generate_series(1,9));
 d:=d||jsonb_build_object('grade','2nd Grade','format','long_form','brackets',true,'days',jsonb_build_array(jsonb_build_object('date',day::text),jsonb_build_object('date',(day+7)::text)));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(current_id,c,d,pair);

 for variant in select * from (values
  ('limited_overs','long_form',2),('long_form','limited_overs',2),
  ('t20','long_form',0),('limited_overs','t20',0),('long_form','t20',0),('t20','limited_overs',0),('t20','t20',2)
 ) formats(previous_format,current_format,expected) loop
  update club_selection_private.fixtures f set details=jsonb_set(f.details,'{format}',to_jsonb(variant.previous_format)),published=jsonb_set(f.published,'{details,format}',to_jsonb(variant.previous_format)) where id=prior;
  update club_selection_private.fixtures f set details=f.details||jsonb_build_object('format',variant.current_format,'days',case when variant.current_format='long_form' then d->'days' else jsonb_build_array(jsonb_build_object('date',day::text)) end),
   slots=case when variant.current_format='long_form' then pair else jsonb_build_array(jsonb_build_object('d1',p1,'d2',null),jsonb_build_object('d1',p2,'d2',null)) end where id=current_id;
  assert (select count(*)=variant.expected from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Limited overs/long form continuity and T20 separation';
 end loop;
 update club_selection_private.fixtures f set details=jsonb_set(f.details,'{format}','"limited_overs"'),published=jsonb_set(f.published,'{details,format}','"limited_overs"') where id=prior;
 update club_selection_private.fixtures set details=d,slots=pair where id=current_id;
 -- A more recent T20 fixture cannot replace the previous competition round.
 insert into club_selection_private.fixtures(id,club_id,details,slots,published,publication)
  select t20,c,details||jsonb_build_object('grade','2nd Grade','format','t20','days',jsonb_build_array(jsonb_build_object('date',(day-7)::text))),slots,null,1 from club_selection_private.fixtures where id=prior;
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id) where id=t20;
 -- An older same-format team cannot override the latest limited-overs lineup.
 insert into club_selection_private.fixtures(id,club_id,details,slots)
  select older,c,details||jsonb_build_object('format','long_form','days',jsonb_build_array(jsonb_build_object('date',(day-21)::text))),jsonb_build_array(jsonb_build_object('d1',p3,'d2',p3)) from club_selection_private.fixtures where id=prior;
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id) where id=older;
 assert (select count(*)=2 and bool_and(previous_fixture_id=prior) from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Latest eligible round wins, including both bracket partners';
 update club_selection_private.fixtures f set details=jsonb_set(f.details,'{season}','"Other season"') where id=current_id;
 assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Different seasons stay separate';
 update club_selection_private.fixtures set details=d||'{"competition":"Other competition"}' where id=current_id;
 assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Different competitions stay separate';
 update club_selection_private.fixtures set details=d where id=current_id;
 update club_selection_private.fixtures set published=null where id=prior;
 assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Missing latest lineup cannot fall back to older same-format selections';
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id) where id=prior;

 -- A general bracket and a representative-only exception have different eligibility.
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(higher,c,d||'{"grade":"1st Grade","brackets":true}', '[]');
 assert (select count(*)=2 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'General bracketing allows both part-available players to stay in the higher grade';
 update club_selection_private.fixtures f set details=f.details||'{"bracket_basis":"representative"}' where id=higher;
 assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id),'Representative-only exception does not make other part-available players eligible';
 update club_selection_private.availability set unavailable_dates='[]' where roster_id=p1;
 assert exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id and roster_id=p1),'A fully available player is still a grade drop';
 update club_selection_private.availability set unavailable_dates=jsonb_build_array((day+7)::text) where roster_id=p1;
 update club_selection_private.fixtures f set details=f.details||jsonb_build_object('brackets',false,'days',jsonb_build_array(jsonb_build_object('date',(day+7)::text),jsonb_build_object('date',(day+8)::text))) where id=higher;
 assert exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id and roster_id=p2),'Use the higher grade dates; unavailability for the lower grade first day is irrelevant';
 assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=current_id and roster_id=p1),'Unavailable on a required higher-grade day is excluded';
 update club_selection_private.fixtures set details=d||'{"grade":"1st Grade","brackets":true}' where id=higher;
 rejected:=false;begin perform club_selection_private.validate_details(d||'{"bracket_basis":"invented"}');exception when raise_exception then rejected:=true;end;
 assert rejected,'Unknown bracketing rules cannot be saved';

 perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
 assert public.club_selections_api(c,'context')->'conversations'='[]','Page reads do not calculate drops';
 req:=jsonb_build_object('ids',jsonb_build_array(current_id),'request_id',gen_random_uuid());
 res:=public.club_selections_api(c,'show_dropped',req);assert (res->>'count')::int=2,'Both bracketed days show despite unavailability on the other day';
 assert public.club_selections_api(c,'show_dropped',req)=res,'Capture retry is idempotent';
 reset role;
 update club_selection_private.fixtures f set details=f.details||'{"bracket_basis":"representative"}' where id=higher;
 set local role authenticated;
 assert public.club_selections_api(c,'context')->'conversations'='[]','Saved reminders reflect the actual eligibility rule';
 reset role;update club_selection_private.fixtures f set details=f.details-'bracket_basis' where id=higher;set local role authenticated;
 select x into reminder from jsonb_array_elements(public.club_selections_api(c,'context')->'conversations') x where x->>'roster_id'=p2::text;
 assert reminder->>'previous_date'=(day-14)::text,'Uses the limited-overs date, not the newer T20 date';
 perform set_config('request.jwt.claim.sub',captain::text,true);
 assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=2,'Previous captain retains access';
 res:=public.club_selections_api(c,'conversation',reminder||jsonb_build_object('spoken',true,'request_id',gen_random_uuid()));
 assert res->>'spoken'='true','The Day 2 conversation can be marked';
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert jsonb_array_length(public.club_selections_api(c,'context')->'conversations')=1,'Shared completion removes only that player';
 res:=public.club_selections_api(c,'show_dropped',req||jsonb_build_object('request_id',gen_random_uuid()));
 assert (res->>'count')::int=1,'Explicit recalculation preserves spoken-to status';
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 assert public.club_selections_api(c,'context')->'conversations'='[]','Ordinary players cannot read private reminders';
 rejected:=false;begin perform public.club_selections_api(c,'show_dropped',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;
 assert rejected,'Ordinary players cannot capture private reminders';
 reset role;
 assert not has_function_privilege('authenticated','club_selection_private.lower_grade_moves(uuid)','EXECUTE');
 assert not has_function_privilege('authenticated','club_selection_private.drop_previous_grade_available(uuid,uuid,jsonb,jsonb)','EXECUTE');
end $tests$;
rollback;
select 'Format continuity, T20 separation, latest round, bracketed days, availability, permissions and spoken-to persistence passed; synthetic records rolled back.' as result;
