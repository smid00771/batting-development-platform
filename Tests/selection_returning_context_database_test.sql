-- Synthetic rows only; every change rolls back.
begin;
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();f1 uuid;f2 uuid;
 meta jsonb;context jsonb;stats jsonb;y integer:=extract(year from current_date)::integer;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic selector');
 insert into public.clubs(id,name,slug,created_by) values(c,'Returning context test','return-context-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'player','none');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',u,'Australia/Sydney');
 insert into club_selection_private.fixtures(club_id,details) values(c,jsonb_build_object('grade','Test','format','t20','days',jsonb_build_array(jsonb_build_object('date',current_date::text)))) returning id into f1;
 insert into club_selection_private.fixtures(club_id,details) values(c,jsonb_build_object('grade','Hidden','format','t20','days',jsonb_build_array(jsonb_build_object('date',current_date::text)))) returning id into f2;
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,no_play,updated_by) values(f1,c,'washed_out',u),(f2,c,'washed_out',u);
 perform set_config('request.jwt.claim.sub',u::text,true);
 meta:=club_selection_private.selection_returning_context(c,jsonb_build_array(jsonb_build_object('id',f1)));
 assert meta->'no_play'=jsonb_build_array(f1),'No-play IDs stay within the already-authorised context';
 stats:=public.club_season_stats_api(c,'context','{"on_demand":true}');
 assert meta#>>'{season,start}'=stats#>>'{season,start}' and meta#>>'{season,end}'=stats#>>'{season,end}','Default season matches the existing analysis window';
 insert into club_selection_private.season_stats_settings(club_id,starts,ends,updated_by) values(c,make_date(y-2,1,1),make_date(y-2,12,31),u);
 context:=public.club_selections_api(c,'context','{"review_snapshots":false}');
 stats:=public.club_season_stats_api(c,'context','{"on_demand":true}');meta:=context->'returning_context';
 assert meta#>>'{season,start}'=stats#>>'{season,start}' and meta#>>'{season,end}'=stats#>>'{season,end}','Custom season rollover matches';
 assert meta#>>'{season,start}'=make_date(y,1,1)::text,'The saved season repeats annually';
 assert not meta ? 'cards' and not meta ? 'roster','Reminder metadata contains no scorecard analysis';
 assert not has_function_privilege('anon','club_selection_private.selection_returning_context(uuid,jsonb)','execute');
 assert not has_function_privilege('authenticated','club_selection_private.selection_returning_context(uuid,jsonb)','execute');
 update club_selection_private.access set head_selector_id=null where club_id=c;
 assert not public.club_selections_api(c,'context') ? 'returning_context','Ordinary members do not receive board metadata';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.club_selections_api(c,'context');raise exception 'Anonymous request unexpectedly succeeded';exception when raise_exception then assert sqlerrm='Sign in to use Selections';end;
end $tests$;
select 'Returning metadata season, scoping and permissions verified; synthetic rows rolled back' result;
rollback;
