-- Explicit equal-grade settings and missing competition labels. Synthetic only.
begin;
set local statement_timeout='15s';
do $tests$
declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();viewer uuid:=gen_random_uuid();
 sg uuid:=gen_random_uuid();g4 uuid:=gen_random_uuid();gn uuid:=gen_random_uuid();gs uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid();prior uuid:=gen_random_uuid();target uuid:=gen_random_uuid();day date:=current_date+14;
 rows jsonb:='[{"competition":"District","grade":"Dev Navy","level":5},{"competition":"District","grade":"Dev Sky","level":5},{"competition":"","grade":"Dev Navy","level":5},{"competition":"","grade":"Dev Sky","level":5}]';
 d jsonb;previous jsonb;slots jsonb;res jsonb;rev integer;rejected boolean;bad_rows jsonb;
begin
 insert into auth.users(id,email) values(u,'levels-'||u||'@example.invalid'),(viewer,'levels-'||viewer||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic admin'),(viewer,'Synthetic selector');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic equal grades','equal-grades-'||c,u);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin'),(c,viewer,'player','none');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id) values(c,'standalone','active',u);
 insert into club_selection_private.selectors values(c,viewer);
 insert into public.playing_groups(id,club_id,name,active) values(g4,c,'4th Grade',true),(gn,c,'Dev Navy',true),(gs,c,'Dev Sky',true);
 insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,'Senior teams');
 insert into club_selection_private.selection_group_grades values(c,g4,sg),(c,gn,sg),(c,gs,sg);
 insert into club_selection_private.roster(id,club_id,name,active) values(p,c,'Synthetic dropped player',true);
 perform set_config('request.jwt.claim.sub',u::text,true);
 select revision into rev from club_selection_private.access where club_id=c;
 res:=public.club_selections_api(c,'grade_levels',jsonb_build_object('rows',rows,'revision',rev,'request_id',gen_random_uuid()));
 assert res->>'saved'='true','Named teams can be ranked with blank competition labels';
 assert club_selection_private.grade_level(c,'','Dev Sky')=5 and club_selection_private.grade_level(c,'District','Dev Navy')=5;
 slots:=jsonb_build_array(jsonb_build_object('d1',p,'d2',null));
 previous:=jsonb_build_object('grade','4th Grade','grade_group_id',g4,'competition','District','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',day-7)));
 d:=jsonb_build_object('grade','Dev Sky','grade_group_id',gs,'competition','','format','limited_overs','days',jsonb_build_array(jsonb_build_object('date',day)));
 insert into club_selection_private.fixtures(id,club_id,details,slots,published) values(prior,c,previous,slots,jsonb_build_object('details',previous,'slots',slots)),(target,c,d,slots,null);
 assert exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=target and roster_id=p),'Fourth to either lower Dev team is a drop within the same selection group';
 previous:=previous||jsonb_build_object('grade','Dev Navy','grade_group_id',gn);
 update club_selection_private.fixtures f set details=previous,published=jsonb_build_object('details',previous,'slots',f.slots) where id=prior;
 assert not exists(select 1 from club_selection_private.lower_grade_moves(c) where fixture_id=target),'Dev Navy and Sky are equal, not drops';
 perform set_config('request.jwt.claim.sub',viewer::text,true);
 select revision into rev from club_selection_private.access where club_id=c;
 rejected:=false;begin perform public.club_selections_api(c,'grade_levels',jsonb_build_object('rows',rows,'revision',rev,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;
 assert rejected,'Selector cannot change administrator grade configuration';
 perform set_config('request.jwt.claim.sub',u::text,true);
 for bad_rows in select value from jsonb_array_elements(jsonb_build_array(
  '[{"competition":"","grade":"Dev Sky","level":0}]'::jsonb,
  '[{"competition":null,"grade":"Dev Sky","level":5}]'::jsonb,
  '[{"competition":"","grade":"Dev Sky","level":5},{"competition":" ","grade":"dev sky","level":6}]'::jsonb
 )) loop
  rejected:=false;begin perform public.club_selections_api(c,'grade_levels',jsonb_build_object('rows',bad_rows,'revision',rev,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;
  assert rejected,'Blank labels do not weaken numeric, string or duplicate validation';
 end loop;
end $tests$;
rollback;
