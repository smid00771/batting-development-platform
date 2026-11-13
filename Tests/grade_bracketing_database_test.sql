-- Synthetic fixtures, authenticated public RPCs, and rollback of all data/messages.
begin;
set local statement_timeout='30s';
do $test$
declare c uuid:=gen_random_uuid();a uuid:=gen_random_uuid();u uuid:=gen_random_uuid();g uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();
 ids uuid[]:=array(select gen_random_uuid() from generate_series(1,12));day date:=current_date+40;
 d jsonb;slots jsonb;req jsonb;res jsonb;ctx jsonb;f jsonb;notes jsonb;snapshot jsonb;rejected boolean;newid uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(a,'bracket-'||a||'@example.invalid'),(u,'bracket-'||u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(a,'Synthetic admin'),(u,'Synthetic member');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic brackets','brackets-'||c,a);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,a,'admin','admin'),(c,u,'player','none');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',a);
 insert into public.playing_groups(id,club_id,name,active,created_by) values(g,c,'Example grade',true,a);
 for i in 1..12 loop
  insert into club_selection_private.roster(id,club_id,name,active,user_id,batting,bowling,bowling_load,keeper)
   values(ids[i],c,'Example player '||i,true,case when i=1 then a end,'middle','pace','frontline',false);
  insert into club_selection_private.availability(roster_id,available_dates,unavailable_dates)
   values(ids[i],jsonb_build_array(day::text)||case when i=2 then '[]'::jsonb else jsonb_build_array((day+7)::text) end,case when i=2 then jsonb_build_array((day+7)::text) else '[]'::jsonb end);
 end loop;
 d:=jsonb_build_object('grade','Example grade','grade_group_id',g,'opposition','Visitors','format','long_form','brackets',false,'min_quicks',0,'min_batters',0,
 'days',jsonb_build_array(jsonb_build_object('date',day),jsonb_build_object('date',day+7)),
 'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',ids[1],'captain_manual',true),'d2',jsonb_build_object('captain_id',ids[1],'captain_manual',true)));
 slots:=(select jsonb_agg(jsonb_build_object('d1',ids[i],'d2',case when i=2 then ids[12] else ids[i] end) order by i) from generate_series(1,11) i);
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,d,slots);
 perform set_config('request.jwt.claim.sub',a::text,true);set local role authenticated;
 ctx:=public.club_selections_api(c,'context');
 req:=jsonb_build_object('request_id',gen_random_uuid(),'revision',(ctx#>>'{access,fixture_defaults,revision}')::int,'rows',jsonb_build_array(jsonb_build_object('grade','Example grade','grade_group_id',g,'format','long_form','overs',null,'bracket_rule','representative')));
 res:=public.club_selections_api(c,'fixture_defaults',req);assert res->>'saved'='true';
 assert public.club_selections_api(c,'fixture_defaults',req)=res,'Defaults retry reuses its receipt';
 ctx:=public.club_selections_api(c,'context');select x into f from jsonb_array_elements(ctx->'fixtures') x where x->>'id'=fid::text;
 assert f#>>'{details,bracket_basis}'='representative' and f#>>'{details,brackets}'='true','Existing unpublished draft inherits its grade rule';
 assert f->'slots'=slots and f->'published'='null'::jsonb,'Defaults preserve picks without publication';
 d:=f->'details';
 notes:=public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(fid)))#>'{fixtures,0,issues}';
 assert exists(select 1 from jsonb_array_elements(notes) n where n->>'code'='rep_bracket_required'),'Unmarked pair needs a rep declaration';
 req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fid),'revisions',jsonb_build_object(fid::text,(f->>'revision')::int),'acknowledge_balance',true);
 rejected:=false;begin perform public.club_selections_api(c,'publish',req);exception when raise_exception then assert sqlerrm like 'Fix selection%';rejected:=true;end;assert rejected,'Rep-only rule is enforced on the server';
 slots:=jsonb_set(slots,'{1}',slots->1||jsonb_build_object('rep_player_id',ids[2],'rep_absent_date',(day+7)::text));
 req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(jsonb_build_object('id',fid,'revision',(f->>'revision')::int,'details',d,'slots',slots)));
 res:=public.club_selections_api(c,'save_board',req);assert res->>'saved'='true';assert public.club_selections_api(c,'save_board',req)=res;
 select x into f from jsonb_array_elements(public.club_selections_api(c,'context')->'fixtures') x where x->>'id'=fid::text;
 assert f->'slots'=slots,'Pair metadata survives the real save';
 notes:=public.club_selections_api(c,'publication_check',jsonb_build_object('ids',jsonb_build_array(fid)))#>'{fixtures,0,issues}';
 assert not exists(select 1 from jsonb_array_elements(notes) n where n->>'level'='error'),'A confirmed rep bracket is publishable';
 -- Forged unrelated player and old fixture date are rejected before saving.
 for i in 1..2 loop
  rejected:=false;begin
   perform public.club_selections_api(c,'save_board',jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(f||jsonb_build_object('slots',jsonb_set(slots,'{1}',slots->1||case when i=1 then jsonb_build_object('rep_player_id',ids[3]) else jsonb_build_object('rep_absent_date',(day-7)::text) end)))));
  exception when raise_exception then assert sqlerrm like 'Choose the bracketed player%';rejected:=true;end;assert rejected;
 end loop;
 -- Reordering moves the entire pair and supports exact Undo.
 req:=jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(f||jsonb_build_object('slots',jsonb_build_array(slots->1,slots->0)||(slots-0-0))));
 perform public.club_selections_api(c,'save_board',req);
 select x into f from jsonb_array_elements(public.club_selections_api(c,'context')->'fixtures') x where x->>'id'=fid::text;
 assert f#>>'{slots,0,rep_player_id}'=ids[2]::text;
 perform public.club_selections_api(c,'save_board',jsonb_build_object('request_id',gen_random_uuid(),'fixtures',jsonb_build_array(f||jsonb_build_object('slots',slots))));
 select x into f from jsonb_array_elements(public.club_selections_api(c,'context')->'fixtures') x where x->>'id'=fid::text;
 req:=jsonb_build_object('request_id',gen_random_uuid(),'ids',jsonb_build_array(fid),'revisions',jsonb_build_object(fid::text,(f->>'revision')::int),'acknowledge_balance',true);
 assert public.club_selections_api(c,'publish',req)->>'published'='true','Authorised publication accepts the confirmed rep bracket';
 select x into f from jsonb_array_elements(public.club_selections_api(c,'context')->'fixtures') x where x->>'id'=fid::text;snapshot:=f->'published';
 ctx:=public.club_selections_api(c,'context');
 perform public.club_selections_api(c,'fixture_defaults',jsonb_build_object('request_id',gen_random_uuid(),'revision',(ctx#>>'{access,fixture_defaults,revision}')::int,'rows',jsonb_build_array(jsonb_build_object('grade','Example grade','grade_group_id',g,'format','long_form','bracket_rule','general'))));
 select x into f from jsonb_array_elements(public.club_selections_api(c,'context')->'fixtures') x where x->>'id'=fid::text;
 assert f->'published'=snapshot and f#>>'{details,bracket_basis}'='representative','Settings never rewrite a published team';
 reset role;
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(newid,c,(d-'bracket_source')||jsonb_build_object('days',jsonb_build_array(jsonb_build_object('date',day+14),jsonb_build_object('date',day+21))),slots);
 assert (select details->>'brackets'='true' and not(details?'bracket_basis') from club_selection_private.fixtures where id=newid),'Imported fixtures inherit general bracketing';
 assert not exists(select 1 from jsonb_array_elements(club_selection_private.issues(newid)) n where n->>'code'='rep_bracket_required'),'General brackets need no rep declaration';
 update club_selection_private.fixtures set details=jsonb_set(details,'{days,1,date}',to_jsonb((day+28)::text)) where id=newid;
 assert (select not (fx.slots->1?'rep_player_id') from club_selection_private.fixtures fx where id=newid),'Changing playing dates clears stale rep metadata';
 assert club_selection_private.fixture_apply_default_brackets(d||'{"bracket_source":"fixture","brackets":false}'::jsonb,'[{"grade":"Example grade","format":"long_form","bracket_rule":"general"}]')#>>'{brackets}'='false','Explicit fixture overrides survive';
 perform set_config('request.jwt.claim.sub',u::text,true);set local role authenticated;
 rejected:=false;begin perform public.club_selections_api(c,'fixture_defaults',req);exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary players cannot set grade rules';
 reset role;
 assert not has_function_privilege('authenticated','club_selection_private.rep_bracket_valid(jsonb,jsonb)','execute');
 assert not has_function_privilege('anon','club_selection_private.fixture_apply_default_brackets(jsonb,jsonb)','execute');
end $test$;
rollback;
select 'Grade defaults, rep-only enforcement, valid publication, private access, retry, reordering, Undo, date invalidation and published snapshots passed; all synthetic data rolled back.' result;
