-- Synthetic data only; the whole transaction is rolled back.
begin;
do $test$
declare
 c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();head uuid:=gen_random_uuid();cap uuid:=gen_random_uuid();wrong uuid:=gen_random_uuid();coach uuid:=gen_random_uuid();player uuid:=gen_random_uuid();outside uuid:=gen_random_uuid();u uuid;
 p uuid:=gen_random_uuid();p_down uuid:=gen_random_uuid();p_still uuid:=gen_random_uuid();p_unknown uuid:=gen_random_uuid();p_unavailable uuid:=gen_random_uuid();old_id uuid:=gen_random_uuid();f1 uuid:=gen_random_uuid();f2 uuid:=gen_random_uuid();ongoing uuid:=gen_random_uuid();foreign_fixture uuid:=gen_random_uuid();
 d jsonb;slots jsonb;data jsonb;move jsonb;response jsonb;req jsonb;before jsonb;rejected boolean;ids uuid[];day date:=date_trunc('week',current_date+28)::date+5;
begin
 foreach u in array array[head,cap,wrong,coach,player,outside] loop
  insert into auth.users(id,email) values(u,'board-'||u||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Synthetic staff');
 end loop;
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic board','board-'||c,head),(other_c,'Other board','other-'||other_c,outside);
 insert into public.club_memberships(club_id,user_id,role,permission_role,involvement) values
 (c,head,'player','none','player'),(c,cap,'captain','captain','player'),(c,wrong,'captain','captain','player'),(c,coach,'coach','coach','coach_captain'),(c,player,'player','none','player'),(other_c,outside,'captain','captain','player');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',head),(other_c,'standalone','active',outside);
 insert into club_selection_private.roster(id,club_id,name,user_id,account_email) values(p,c,'Left out',player,'private@example.invalid'),(p_down,c,'Moved down',null,null),(p_still,c,'Still playing',null,null),(p_unknown,c,'Unconfirmed',null,null),(p_unavailable,c,'Unavailable',null,null);
 insert into club_selection_private.availability(roster_id,available_dates) values(p,jsonb_build_array(day::text)),(p_down,jsonb_build_array(day::text)),(p_still,jsonb_build_array(day::text));
 insert into club_selection_private.availability(roster_id,unavailable_dates) values(p_unavailable,jsonb_build_array(day::text));
 d:=jsonb_build_object('competition','Competition','season','Test season','grade','1st Grade','format','long_form','days',jsonb_build_array(jsonb_build_object('date',(day-7)::text)),'captain_id',cap,'staff','[]'::jsonb);
 slots:=jsonb_build_array(jsonb_build_object('d1',p),jsonb_build_object('d1',p_down),jsonb_build_object('d1',p_still),jsonb_build_object('d1',p_unknown),jsonb_build_object('d1',p_unavailable));
 insert into club_selection_private.fixtures(id,club_id,details,slots,published) values(old_id,c,d,slots,jsonb_build_object('details',d,'slots',slots,'players','[]'::jsonb));
 d:=jsonb_set(d,'{days}',jsonb_build_array(jsonb_build_object('date',day::text)));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(f1,c,d,'[]');
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(f2,c,jsonb_set(jsonb_set(d,'{grade}','"2nd Grade"'),'{captain_id}',to_jsonb(wrong::text)),jsonb_build_array(jsonb_build_object('d1',p_down)));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(ongoing,c,jsonb_set(jsonb_set(d,'{grade}','"3rd Grade"'),'{days}',jsonb_build_array(jsonb_build_object('date',(day-7)::text),jsonb_build_object('date',day::text))),jsonb_build_array(jsonb_build_object('d1',p_still,'d2',p_still)));
 insert into club_selection_private.fixtures(id,club_id,details,slots) values(foreign_fixture,other_c,d,'[]');
 perform set_config('request.jwt.claim.sub',cap::text,true);
 data:=public.club_selections_api(c,'context');
 assert (data->>'can_view_board')::boolean,'Captain sees draft board before any share or publish';
 assert exists(select 1 from jsonb_array_elements(data->'fixtures') f where f->>'id'=f1::text and f->'slots'='[]'::jsonb and f->'details' is not null),'Unpublished fixture visible';
 assert not exists(select 1 from jsonb_array_elements(data->'fixtures') f where f->>'id'=foreign_fixture::text),'Foreign fixture hidden';
 assert data->'members'='[]'::jsonb,'Captain cannot read members and emails';
 assert not exists(select 1 from jsonb_array_elements(data->'roster') r where r ? 'account_email'),'Roster emails hidden';
 assert jsonb_array_length(data->'conversations')=4,'One lower grade and three omissions; ongoing player excluded';
 select x into move from jsonb_array_elements(data->'conversations') x where x->>'roster_id'=p::text;
 assert move->>'kind'='left_out' and move->>'availability'='available','Available omitted player flagged';
 assert exists(select 1 from jsonb_array_elements(data->'conversations') x where x->>'roster_id'=p_unknown::text and x->>'availability'='unknown'),'Unmarked availability stays unknown';
 assert exists(select 1 from jsonb_array_elements(data->'conversations') x where x->>'roster_id'=p_unavailable::text and x->>'availability'='unavailable'),'Explicit unavailable distinguished';
 assert club_selection_private.review_audience(f1,cap),'Assigned captain comments without sending';
 assert not club_selection_private.review_audience(f2,cap),'Other team comments stay private';
 select to_jsonb(f) into before from club_selection_private.fixtures f where id=f1;
 foreach req in array array[jsonb_build_object('action','save_board','fixtures',jsonb_build_array(jsonb_build_object('id',f1))),jsonb_build_object('action','publish','ids',jsonb_build_array(f1)),jsonb_build_object('action','fixture_lock','id',f1),jsonb_build_object('action','save_fixture','id',f1)] loop
  rejected:=false;begin perform public.club_selections_api(c,req->>'action',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;
  assert rejected,'Captain cannot edit, unlock or publish teams';
 end loop;
 req:=move||jsonb_build_object('spoken',true,'request_id',gen_random_uuid());response:=public.club_selections_api(c,'conversation',req);
 assert (response->>'spoken')::boolean,'Previous captain can mark omitted player spoken to';
 assert public.club_selections_api(c,'conversation',req)=response,'Follow-up retry idempotent';
 rejected:=false;begin perform public.club_selections_api(c,'conversation',move||jsonb_build_object('spoken',false,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;
 assert rejected,'Stale conversation cannot overwrite new status';
 req:=jsonb_build_object('id',f1,'body','Check this team','review_revision',1,'request_id',gen_random_uuid());response:=public.club_selections_api(c,'review_post',req);
 assert public.club_selections_api(c,'review_post',req)=response,'Comment retry idempotent';
 assert jsonb_array_length(public.club_selections_api(c,'review_posts',jsonb_build_object('id',f1)))=1,'One comment stored';
 assert not exists(select 1 from club_batting_private.club_message_recipients r join club_batting_private.club_messages m on m.id=r.message_id where m.club_id=c and r.user_id<>head),'Comment notification stays within private audience';
 assert (select to_jsonb(f)=before from club_selection_private.fixtures f where id=f1),'Comment and follow-up leave team untouched';
 update club_selection_private.fixtures set details=jsonb_set(details,'{cancelled}','true') where id=f1;
 select x into move from jsonb_array_elements(club_selection_private.conversation_context(c,cap)) x where x->>'roster_id'=p::text;
 assert move->>'fixture_id'=f2::text and move->>'spoken_at' is not null,'Moving the follow-up anchor retains spoken-to status';
 perform public.club_selections_api(c,'conversation',move||jsonb_build_object('spoken',false,'request_id',gen_random_uuid()));
 assert (select count(*) from club_selection_private.player_conversations pc where pc.roster_id=p)=1,'Anchor change updates the same follow-up record';
 update club_selection_private.fixtures set details=details-'cancelled' where id=f1;

 update club_selection_private.fixtures set revision=revision+1 where id=f1;
 rejected:=false;begin perform public.club_selections_api(c,'review_post',req||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Stale draft comment rejected';
 foreach u in array array[wrong,player,outside] loop
  perform set_config('request.jwt.claim.sub',u::text,true);
  assert club_selection_private.conversation_context(c,u)='[]'::jsonb,'Unrelated captain, player and outsider cannot see follow-up';
  rejected:=false;begin perform public.club_selections_api(c,'review_posts',jsonb_build_object('id',f1));exception when raise_exception then rejected:=true;end;assert rejected,'Private comments protected';
 end loop;
 perform set_config('request.jwt.claim.sub',player::text,true);data:=public.club_selections_api(c,'context');
 assert not (data->>'can_view_board')::boolean and not exists(select 1 from jsonb_array_elements(data->'fixtures') f where f->>'id'=f1::text),'Ordinary player cannot see draft';
 perform set_config('request.jwt.claim.sub',coach::text,true);assert jsonb_array_length(club_selection_private.conversation_context(c,coach))=4,'Coach follow-up retained';
 update club_selection_private.fixtures f set slots=f.slots||jsonb_build_array(jsonb_build_object('d1',p)) where id=f1;
 assert not exists(select 1 from jsonb_array_elements(club_selection_private.conversation_context(c,coach)) x where x->>'roster_id'=p::text),'Re-selected player leaves omitted list';
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,no_play,updated_by) values(old_id,c,'washed_out',head);
 assert not exists(select 1 from jsonb_array_elements(club_selection_private.conversation_context(c,coach)) x where x->>'kind'='left_out'),'No-play previous fixture is not evidence of playing';
 update club_selection_private.access set status='disabled' where club_id=c;
 assert club_selection_private.conversation_context(c,coach)='[]'::jsonb,'Disabled club cannot read follow-up';
 raise notice 'Captain board permissions, comments, omissions and ongoing match checks passed';
end $test$;
rollback;
