-- Synthetic club, users and scores only; the exception rolls every change back.
do $test$
declare
 c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();coach uuid:=gen_random_uuid();viewer uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();u uuid;
 g1 uuid:=gen_random_uuid();g2 uuid:=gen_random_uuid();sg1 uuid:=gen_random_uuid();sg2 uuid:=gen_random_uuid();p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();
 f1 uuid:=gen_random_uuid();f2 uuid:=gen_random_uuid();fid uuid;gid uuid;source_id uuid;mid uuid;tid uuid;card jsonb;res jsonb;ctx jsonb;before_cards jsonb;denied boolean;
 played date:=current_date-3;i integer;
begin
 begin
  foreach u in array array[adm,coach,viewer,ordinary,outsider] loop
   insert into auth.users(id,email) values(u,'shared-stats-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic stats tester');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Shared Stats Test','shared-stats-'||c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,coach,'player','coach'),(c,viewer,'player','none'),(c,ordinary,'player','none');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  insert into club_selection_private.selection_groups(id,club_id,name,batting_enabled) values(sg1,c,'First group',true),(sg2,c,'Second group',true);
  insert into public.playing_groups(id,club_id,name,active) values(g1,c,'First XI',true),(g2,c,'Second XI',true);
  insert into club_selection_private.selection_group_grades(club_id,grade_id,selection_group_id) values(c,g1,sg1),(c,g2,sg2);
  insert into public.players(id,club_id,display_name,active) values(p1,c,'First Player',true),(p2,c,'Second Player',true);
  insert into public.player_playing_groups(club_id,player_id,playing_group_id,assigned_by) values(c,p1,g1,adm),(c,p2,g2,adm);
  insert into public.club_access_grants(club_id,user_id,scope,playing_group_id,can_view,can_edit) values(c,coach,'playing_group',g1,true,true);
  for i in 1..2 loop
   fid:=case when i=1 then f1 else f2 end;gid:=case when i=1 then g1 else g2 end;
   source_id:=gen_random_uuid();mid:=gen_random_uuid();tid:=gen_random_uuid();
   insert into club_selection_private.fixtures(id,club_id,details,slots) values(fid,c,jsonb_build_object('grade',case when i=1 then 'First XI' else 'Second XI' end,'grade_group_id',gid,'competition','Synthetic District','format','limited_overs','opposition','Visitors','meeting','Private meeting','days',jsonb_build_array(jsonb_build_object('date',played))),'[]');
   card:=jsonb_build_object('provider','playcricket_au','schema_version',2,'status','completed','match_id',mid,'dates',jsonb_build_array(played),'grade',case when i=1 then 'First XI' else 'Second XI' end,'competition','Synthetic District','format_key','limited_overs',
    'teams',jsonb_build_array(jsonb_build_object('id',tid,'name','Shared Stats Test','players',jsonb_build_array(jsonb_build_object('player_id',source_id,'name','Synthetic Batter')))),
    'innings',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'team_id',tid,'number',1,'complete',true,'batters',jsonb_build_array(jsonb_build_object('player_id',source_id,'name','Synthetic Batter','runs',30+i,'not_out',false,'importable',true)),'bowlers','[]'::jsonb)));
   insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,adm,card);
   insert into club_selection_private.fixture_result_sources(club_id,fixture_id,source_match_id,team_id,updated_by) values(c,fid,mid,tid,adm);
  end loop;
  assert not club_selection_private.enabled(c),'Club starts with Batting only';
  set local role authenticated;
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');before_cards:=res->'cards';
  reset role;
  assert jsonb_array_length(res->'cards')=2 and jsonb_array_length(res->'fixtures')=2,'Batting-only admin uses both shared scorecards';
  assert not exists(select 1 from club_selection_private.access where club_id=c),'Stats does not create or enable Select';
  assert res::text not like '%Private meeting%' and not (res->'fixtures'->0 ? 'slots'),'Stats exposes no private arrangements or draft selection slots';
  denied:=false;begin perform public.club_season_stats_api(c);exception when sqlstate 'P0285' then denied:=true;end;assert denied,'Background stats request stays denied';
  perform set_config('request.jwt.claim.sub',coach::text,true);
  set local role authenticated;
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');
  reset role;
  assert jsonb_array_length(res->'cards')=1 and res#>>'{cards,0,fixture_id}'=f1::text,'Batting coach sees only their team scores';
  assert jsonb_array_length(res->'fixtures')=1 and res#>>'{fixtures,0,id}'=f1::text and res->>'can_set_season'='false','Coaching scope also filters fixture metadata and season edits';
  foreach u in array array[ordinary,outsider] loop
   perform set_config('request.jwt.claim.sub',u::text,true);denied:=false;
   set local role authenticated;
   begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;
   reset role;
   assert denied,'Ordinary players and outsiders denied';
  end loop;
  perform set_config('request.jwt.claim.sub',adm::text,true);
  insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'bundle','active',adm);
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');assert res->'cards'=before_cards,'Linking products uses identical scorecards without duplication';
  ctx:=public.selection_group_permissions(c,'context');
  perform public.selection_group_permissions(c,'save_group',jsonb_build_object('group_id',sg2,'head_id',adm,'revision',ctx->>'revision','request_id',gen_random_uuid(),'members',jsonb_build_array(jsonb_build_object('user_id',adm,'access','edit'),jsonb_build_object('user_id',viewer,'access','view'),jsonb_build_object('user_id',coach,'access','view'))));
  perform set_config('request.jwt.claim.sub',viewer::text,true);
  set local role authenticated;
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');
  reset role;
  assert jsonb_array_length(res->'cards')=1 and res#>>'{cards,0,fixture_id}'=f2::text,'Scoped selector sees only their permitted group';
  assert jsonb_array_length(res->'fixtures')=1 and res#>>'{fixtures,0,id}'=f2::text,'Scoped selector metadata stays private';
  perform set_config('request.jwt.claim.sub',coach::text,true);
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');assert jsonb_array_length(res->'cards')=2,'Combined coaching and selector roles are additive, without duplicate cards';
  perform set_config('request.jwt.claim.sub',adm::text,true);
  update club_selection_private.selection_groups set batting_enabled=false where id=sg1;
  perform set_config('request.jwt.claim.sub',coach::text,true);
  res:=public.club_season_stats_api(c,'context','{"on_demand":true}');assert jsonb_array_length(res->'cards')=1 and res#>>'{cards,0,fixture_id}'=f2::text,'Batting opt-out removes only coaching access, preserving legitimate selection scope';
  perform set_config('request.jwt.claim.sub',adm::text,true);
  update club_selection_private.access set mode='standalone',status='disabled' where club_id=c;
  denied:=false;begin perform public.club_season_stats_api(c,'context','{"on_demand":true}');exception when raise_exception then denied:=true;end;assert denied,'No enabled product cannot read stats';
  raise exception using errcode='P0316',message='Rollback synthetic shared stats';
 exception when sqlstate 'P0316' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c),'Synthetic club fully rolled back';
end $test$;
select 'Shared stats product, coaching and selector scopes passed; synthetic data rolled back' result;
