-- Run after the migration inside BEGIN/ROLLBACK. No HTTP requests or real sends.
-- Make any accidental coaching lookup fail, to exercise the reported isolation.
create or replace function club_batting_private.phone_source_updates(p_user uuid,p_club uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Synthetic slow coaching lookup';end $$;

do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();manager uuid:=gen_random_uuid();
 mid uuid:=gen_random_uuid();ours uuid:=gen_random_uuid();theirs uuid:=gen_random_uuid();batter uuid:=gen_random_uuid();bowler uuid:=gen_random_uuid();
 main_device uuid:=gen_random_uuid();disabled_device uuid:=gen_random_uuid();off_device uuid:=gen_random_uuid();late_device uuid:=gen_random_uuid();
 card jsonb;result jsonb;claimed jsonb;job jsonb;message uuid;century_message uuid;five_message uuid;coaching_delivery uuid;
 original_role text:=current_user;today date:=(now() at time zone 'Australia/Sydney')::date;blocked boolean:=false;
begin
 insert into auth.users(id,email,email_confirmed_at) values(admin_id,'phone-admin-'||admin_id||'@example.invalid',now()),(manager,'phone-manager-'||manager||'@example.invalid',now());
 insert into public.clubs(id,name,slug,created_by) values(c,'Fictional phone club','qa-'||c,admin_id),(other_c,'Other fictional phone club','qa-'||other_c,admin_id);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,admin_id,'admin','admin'),(c,manager,'player','none'),(other_c,manager,'player','none');
 insert into club_selection_private.access(club_id,status,mode,timezone) values(c,'pilot','bundle','Australia/Sydney');
 insert into club_selection_private.social_managers values(c,manager);
 insert into club_selection_private.social_award_settings(club_id,enabled,milestone_alerts,milestone_alerts_since)
 values(c,array['century','five_wickets'],true,now()-interval '1 hour');
 card:=jsonb_build_object('schema_version',2,'provider','playhq_au','match_id',mid,'status','completed','format_key','limited_overs','grade','Fictional grade','dates',jsonb_build_array(today),
  'teams',jsonb_build_array(jsonb_build_object('id',ours,'name','Our team'),jsonb_build_object('id',theirs,'name','Visitors')),
  'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'number',1,'team_id',ours,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',batter,'name','Fictional Batter','status','played','runs',100,'not_out',true,'importable',true,'figures_valid',true))),
   jsonb_build_object('id',gen_random_uuid(),'number',1,'team_id',theirs,'complete',true,'bowlers',jsonb_build_array(jsonb_build_object('player_id',bowler,'name','Fictional Bowler','team_id',ours,'wickets',5,'runs',20,'importable',true)))));
 insert into club_selection_private.team_week_sources(club_id,source_match_id,team_id,updated_by) values(c,mid,ours,admin_id);
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,admin_id,card);
 set constraints all immediate;
 assert (select count(*) from club_selection_private.social_milestone_alerts where club_id=c)=2,'A completed scorecard creates both achievement messages';
 select message_id into century_message from club_selection_private.social_milestone_alerts where club_id=c and kind='century';
 select message_id into five_message from club_selection_private.social_milestone_alerts where club_id=c and kind='five_wickets';
 insert into club_batting_private.phone_subscriptions(id,user_id,endpoint,p256dh,auth_key,created_at,disabled_at)
 select id,manager,'https://example.invalid/'||id,'test','test',case when id=late_device then now()+interval '1 hour' else now()-interval '1 hour' end,case when id=disabled_device then now() end
 from unnest(array[main_device,disabled_device,off_device,late_device]) id;
 insert into club_batting_private.phone_preferences(subscription_id,club_id,messages,coaching,messages_since,coaching_since)
 select id,c,id<>off_device,true,now()-interval '1 hour',now()-interval '1 hour' from unnest(array[main_device,disabled_device,off_device,late_device]) id;
 insert into club_batting_private.phone_preferences(subscription_id,club_id,messages,coaching,messages_since,coaching_since) values(main_device,other_c,true,false,now()-interval '1 hour',now()-interval '1 hour');
 insert into club_batting_private.club_messages(club_id,sender_id,request_id,title,body,target) values(other_c,admin_id,gen_random_uuid(),'Fictional other club message','Test','teams') returning id into message;
 insert into club_batting_private.club_message_recipients(message_id,user_id) values(message,manager);
 insert into club_batting_private.phone_deliveries(subscription_id,club_id,kind,source_key,source_at) values(main_device,c,'coaching','synthetic-coaching',now()) returning id into coaching_delivery;

 assert has_function_privilege('service_role','public.phone_notification_worker(text,jsonb)','execute');
 assert not has_function_privilege('anon','public.phone_notification_worker(text,jsonb)','execute');
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform set_config('role','service_role',true);
 assert current_user='service_role','Use the real worker role through the public RPC';
 result:=public.phone_notification_worker('collect_messages',jsonb_build_object('club_id',c));
 perform set_config('role',original_role,true);
 assert (result->>'queued')::int=2,'Only the opted-in active device is queued for both achievements';
 assert not exists(select 1 from club_batting_private.phone_deliveries where club_id=other_c),'Scoped collection cannot cross clubs';
 perform set_config('role','service_role',true);
 result:=public.phone_notification_worker('collect_messages',jsonb_build_object('club_id',c));
 perform set_config('role',original_role,true);
 assert (result->>'queued')::int=0,'Collection is idempotent';

 -- A correction between collection and delivery must still cancel the century.
 insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,admin_id,jsonb_set(card,'{innings,0,batters,0,runs}','99'));
 perform set_config('role','service_role',true);
 claimed:=public.phone_notification_worker('claim_messages',jsonb_build_object('club_id',c));
 perform set_config('role',original_role,true);
 assert jsonb_array_length(claimed)=1,'Only the still-valid five-wicket achievement is claimed';
 job:=claimed->0;
 assert (select source_key=five_message::text from club_batting_private.phone_deliveries where id=(job->>'id')::uuid);
 assert (select status='cancelled' from club_batting_private.phone_deliveries where source_key=century_message::text and subscription_id=main_device),'Corrected-away achievement cannot be delivered';
 assert (select status='queued' and attempts=0 from club_batting_private.phone_deliveries where id=coaching_delivery),'Message claims never enter the coaching lookup';
 perform set_config('role','service_role',true);
 result:=public.phone_notification_worker('check',job);
 perform set_config('role',original_role,true);
 assert result->>'valid'='true','The claimed achievement passes the existing final permission check';
 delete from club_selection_private.social_managers where club_id=c and user_id=manager;
 perform set_config('role','service_role',true);
 result:=public.phone_notification_worker('check',job);
 perform set_config('role',original_role,true);
 assert result->>'valid'='false','Removing Socials Manager access cancels an already claimed notification';
 insert into club_selection_private.social_managers values(c,manager);
 update club_batting_private.phone_preferences set messages=false where subscription_id=main_device and club_id=c;
 perform set_config('role','service_role',true);
 result:=public.phone_notification_worker('check',job);
 perform set_config('role',original_role,true);
 assert result->>'valid'='false','Turning messages off cancels an already claimed notification';
 update club_batting_private.phone_preferences set messages=true where subscription_id=main_device and club_id=c;
 perform set_config('role','service_role',true);
 result:=public.phone_notification_worker('finish',job||'{"code":"sent"}'::jsonb);
 claimed:=public.phone_notification_worker('claim_messages',jsonb_build_object('club_id',c));
 perform set_config('role',original_role,true);
 assert result->>'updated'='true' and claimed='[]','A confirmed delivery is never resent';
 perform set_config('role','authenticated',true);
 begin perform public.phone_notification_worker('collect_messages',jsonb_build_object('club_id',c));exception when insufficient_privilege then blocked:=true;end;
 perform set_config('role',original_role,true);
 assert blocked,'A browser account cannot enter the worker';
end $tests$;
