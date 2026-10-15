-- Exercise public APIs with fictional users. The inner transaction always rolls back.
do $test$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();mgr uuid:=gen_random_uuid();second_mgr uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();cap uuid:=gen_random_uuid();u uuid;res jsonb;request jsonb;denied boolean;mid uuid;post uuid:=gen_random_uuid();count_before bigint;
begin
 select count(*) into count_before from club_selection_private.social_managers;
 begin
  foreach u in array array[adm,mgr,second_mgr,ordinary,cap] loop
   insert into auth.users(id,email) values(u,'permissions-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic permissions tester');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic permissions club','permissions-'||c,adm),(other_c,'Other synthetic club','permissions-'||other_c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,mgr,'player','none'),(c,second_mgr,'player','none'),(c,ordinary,'player','none'),(c,cap,'captain','captain');
  insert into club_selection_private.access(club_id,mode,status) values(c,'standalone','active');
  insert into club_selection_private.social_managers values(c,mgr);
  perform set_config('request.jwt.claim.sub',cap::text,true);
  res:=public.club_selections_api(c,'context');
  assert (res->>'captain')::boolean and not (res->>'selector')::boolean and not (res->>'admin')::boolean,'Captain has explicit context without selector/admin escalation';
  assert not (public.club_socials_api(c,'access')->>'allowed')::boolean,'Captain alone has no socials permission';
  perform set_config('request.jwt.claim.sub',mgr::text,true);
  assert not club_batting_private.team_review_staff(c),'Social-only manager has no unrelated Match Review access';
  res:=public.club_socials_api(c,'context');
  assert (res->>'can_manage_managers')::boolean and jsonb_array_length(res->'members')=5,'Permanent manager can see appointment choices';
  assert not exists(select 1 from jsonb_array_elements(res->'members') m where m ? 'email'),'Appointment list does not disclose account emails';
  assert (public.team_of_week_api(c,'access')->>'allowed')::boolean,'Social-only manager can use Team of the Week';
  perform public.team_of_week_api(c,'context','{"week_end":"2026-10-18"}');
  perform public.player_of_week_api(c,'context','{"week_end":"2026-10-18"}');
  assert club_selection_private.team_week_storage_allowed(c||'/backgrounds/'||gen_random_uuid()||'.png',true),'Social-only manager can save team award artwork';
  assert club_selection_private.player_week_storage_allowed(c||'/artwork/'||gen_random_uuid()||'.png',true),'Social-only manager can save player award artwork';
  assert not club_selection_private.team_week_storage_allowed(other_c||'/backgrounds/'||gen_random_uuid()||'.png',true),'Foreign club artwork remains private';
  perform club_batting_private.stage_match_review_scorecard(c,mgr,jsonb_build_object('provider','playcricket_au','status','completed','match_id',gen_random_uuid(),'innings','[]'::jsonb));
  assert not club_batting_private.team_review_staff(c),'Importing award scores does not grant coaching permission';
  assert (public.club_socials_publish_api(c,'context')->>'can_disconnect')::boolean,'Permanent manager can manage accounts';
  perform public.club_socials_publish_api(c,'disconnect');
  denied:=false;begin perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',mgr,'enabled',false,'request_id',gen_random_uuid()));exception when sqlstate 'P0192' then denied:=true;end;assert denied,'Last manager cannot silently remove themself';
  request:=jsonb_build_object('user_id',mgr,'operation','request','request_id',gen_random_uuid());res:=public.club_socials_api(c,'manager_handover',request);
  assert public.club_socials_api(c,'manager_handover',request)=res,'Retrying handover request returns its receipt';
  perform public.club_socials_api(c,'manager_handover',request||jsonb_build_object('request_id',gen_random_uuid()));
  assert (select count(*)=1 from club_batting_private.club_messages where club_id=c and title='Socials handover needs attention'),'Repeated request sends only one handover notification';
  assert exists(select 1 from club_batting_private.club_message_recipients r join club_batting_private.club_messages m on m.id=r.message_id where m.club_id=c and m.title='Socials handover needs attention' and r.user_id=adm),'Club Admin receives the flag';
  assert exists(select 1 from club_selection_private.social_managers where club_id=c and user_id=mgr),'Requesting handover retains access';
  assert (public.club_socials_api(c,'access')->>'handover_count')::int=1,'Pending handover is visible on Teams';
  perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',second_mgr,'enabled',true,'request_id',gen_random_uuid()));
  assert exists(select 1 from club_selection_private.social_managers where club_id=c and user_id=second_mgr),'Manager can appoint another manager';
  insert into club_selection_private.social_posting_delegations(club_id,delegated_by,delegate_id,starts_on,ends_on) values(c,mgr,ordinary,current_date-1,current_date+1);
  denied:=false;begin perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',mgr,'enabled',false,'request_id',gen_random_uuid()));exception when sqlstate 'P0192' then denied:=sqlerrm like 'Hand back temporary cover%';end;assert denied,'A manager cannot strand their current temporary cover';
  assert club_selection_private.social_allowed_at(c,ordinary),'Cover access remains active while its manager hands over';
  delete from club_selection_private.social_posting_delegations where club_id=c;
  -- A scheduled post cannot be orphaned by removing its approver.
  insert into club_selection_private.social_posts(id,club_id,created_by,renderer,fixtures,images,caption,state,approved_by,approved_at,scheduled_for)
   values(post,c,mgr,'0.8.62.143','[]','[]','Synthetic scheduled post','approved',mgr,now(),now()+interval '1 day');
  insert into club_selection_private.social_post_destinations(post_id,platform,account_id) values(post,'facebook','synthetic-page');
  denied:=false;begin perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',mgr,'enabled',false,'request_id',gen_random_uuid()));exception when sqlstate 'P0192' then denied:=true;end;assert denied,'Scheduled posts must be handed over first';
  update club_selection_private.social_post_destinations set state='blocked' where post_id=post;
  request:=jsonb_build_object('user_id',mgr,'enabled',false,'request_id',gen_random_uuid());res:=public.club_socials_api(c,'manager',request);
  assert (res->>'access_removed')::boolean,'Self-removal tells the client to return to remaining club roles';
  assert public.club_socials_api(c,'manager',request)=res,'Removed manager can recover their own saved receipt';
  assert (select resolved_at is not null from club_selection_private.social_manager_handovers where club_id=c and user_id=mgr),'Replacement handover is resolved';
  perform set_config('request.jwt.claim.sub',second_mgr::text,true);
  denied:=false;begin perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',second_mgr,'enabled',false,'request_id',gen_random_uuid()));exception when sqlstate 'P0192' then denied:=true;end;assert denied,'Sequential removals cannot leave zero managers';
  perform public.club_socials_api(c,'manager_handover',jsonb_build_object('user_id',second_mgr,'operation','request','request_id',gen_random_uuid()));
  perform set_config('request.jwt.claim.sub',adm::text,true);
  denied:=false;begin perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',second_mgr,'enabled',false,'request_id',gen_random_uuid()));exception when sqlstate 'P0192' then denied:=true;end;assert denied,'Admin must explicitly acknowledge taking over the last manager';
  perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',second_mgr,'enabled',false,'take_responsibility',true,'request_id',gen_random_uuid()));
  assert (select resolution='admin_takeover' and resolved_by=adm from club_selection_private.social_manager_handovers where club_id=c and user_id=second_mgr),'Admin takeover is recorded';
  assert club_selection_private.social_allowed(c),'Admin retains socials access after takeover';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  denied:=false;begin perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',ordinary,'enabled',true,'request_id',gen_random_uuid()));exception when raise_exception then denied:=true;end;assert denied,'Ordinary member cannot self-appoint';
  denied:=false;begin perform public.team_of_week_api(c,'access');exception when raise_exception then denied:=true;end;assert denied,'Ordinary member cannot access awards';
  -- Cover stays temporary and cannot create permanent appointments.
  insert into club_selection_private.social_posting_delegations(club_id,delegated_by,delegate_id,starts_on,ends_on) values(c,adm,ordinary,current_date-1,current_date+1);
  assert club_selection_private.social_allowed(c),'Current temporary cover can use socials';
  denied:=false;begin perform public.club_socials_api(c,'manager',jsonb_build_object('user_id',ordinary,'enabled',true,'request_id',gen_random_uuid()));exception when sqlstate 'P0192' then denied:=true;end;assert denied,'Temporary cover cannot make itself permanent';
  raise exception using errcode='ZX192',message='rollback synthetic permissions data';
 exception when sqlstate 'ZX192' then null;
 end;
 assert (select count(*)=count_before from club_selection_private.social_managers),'Existing appointments unchanged';
 assert not exists(select 1 from public.clubs where id in(c,other_c)),'All synthetic data rolled back';
end $test$;
