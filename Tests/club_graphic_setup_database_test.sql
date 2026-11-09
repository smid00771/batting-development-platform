-- Every assertion uses the actual authenticated role. Synthetic fixtures are rolled back.
begin;
do $$
declare c uuid:=gen_random_uuid(); other_c uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); ordinary uuid:=gen_random_uuid();u uuid;
begin
 foreach u in array array[adm,ordinary] loop
  insert into auth.users(id,email) values(u,'graphic-setup-'||u||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(u,'Synthetic graphic setup test');
 end loop;
 insert into public.clubs(id,name,slug,created_by) values(c,'Graphic Setup Test','graphic-setup-'||c,adm),(other_c,'Other Graphic Test','graphic-other-'||other_c,ordinary);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,ordinary,'player','none');
 insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
 insert into public.playing_groups(club_id,name,active,created_by) values(c,'Women’s 2nd Grade',true,adm),(c,'Development League Navy',true,adm),(c,'Masters',true,adm);
 perform set_config('test.graphic_club',c::text,true);perform set_config('test.graphic_other',other_c::text,true);perform set_config('test.graphic_admin',adm::text,true);perform set_config('test.graphic_member',ordinary::text,true);
 perform set_config('request.jwt.claim.sub',adm::text,true);
end $$;
set local role authenticated;
do $$
declare c uuid:=current_setting('test.graphic_club')::uuid;other_c uuid:=current_setting('test.graphic_other')::uuid;r jsonb;q jsonb;p jsonb;v uuid;k text;rejected boolean;rev int;
begin
 assert current_user='authenticated';
 r:=public.club_graphic_setup_api(c,'context');assert jsonb_array_length(r->'teams')=3 and r#>>'{preferences,revision}'='0';
 q:=jsonb_build_object('revision',0,'grade_labels','[{"grade":"Women’s 2nd Grade","label":"W 2ND"},{"grade":"Development League Navy","label":"DEV"},{"grade":"Masters","label":"MASTERS"}]'::jsonb,'style','{}'::jsonb,'request_id',gen_random_uuid());
 r:=public.club_graphic_setup_api(c,'save_preferences',q);assert r#>>'{preferences,revision}'='1';assert public.club_graphic_setup_api(c,'save_preferences',q)=r,'Retry returns the original receipt';
 rejected:=false;begin perform public.club_graphic_setup_api(c,'save_preferences',q||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Stale save blocked';
 rejected:=false;begin perform public.club_graphic_setup_api(c,'save_preferences',q||'{"style":{"text_colour":"#000000"}}');exception when raise_exception then rejected:=true;end;assert rejected,'A retry cannot change its payload';
 rejected:=false;begin perform public.club_graphic_setup_api(other_c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'Other club cannot be read';
 rejected:=false;begin perform count(*) from club_selection_private.social_graphic_preferences;exception when insufficient_privilege then rejected:=true;end;assert rejected,'Private preference tables are inaccessible';
 foreach k in array array['team_week','player_week','results','century','five_wickets'] loop
  p:=case when k='team_week' then '{"includes_title":false,"top":620,"bottom":1230,"font_scale":100,"logo_scale":100,"text_colour":"#FFFFFF","grade_labels":[{"grade":"Newcastle Women''s 2nd Grade","label":"2ND"},{"grade":"Rippit Development League","label":"OLD"},{"grade":"Masters","label":"MSTRs"}]}'::jsonb else '{"includes_title":false,"title_y":15,"text_colour":"#FFFFFF","grade_labels":[{"grade":"Newcastle Women''s 2nd Grade","label":"2ND"},{"grade":"Rippit Development League","label":"OLD"},{"grade":"Masters","label":"MSTRs"}]}'::jsonb end;
  q:=jsonb_build_object('kind',k,'revision',0,'shared_revision',1,'layout',p,'background_path',null,'request_id',gen_random_uuid());r:=public.club_graphic_setup_api(c,'save_design',q);assert r->>'revision'='1';assert r#>>'{layout,grade_labels,0,label}'='W 2ND','Canonical women label';assert not (r->'layout'->'grade_labels') @> '[{"label":"MSTRs"}]','Older wording cannot replace preferences';
  assert public.club_graphic_setup_api(c,'save_design',q)=r,'Design retries are idempotent';
  q:=q||jsonb_build_object('revision',1,'layout',p||'{"text_colour":"#00FF00"}', 'request_id',gen_random_uuid());r:=public.club_graphic_setup_api(c,'save_design',q);assert r->>'revision'='2';
  r:=public.club_graphic_setup_api(c,'history',jsonb_build_object('kind',k));assert jsonb_array_length(r->'versions')=1;v:=(r#>>'{versions,0,id}')::uuid;
  r:=public.club_graphic_setup_api(c,'restore',jsonb_build_object('kind',k,'version_id',v,'revision',2,'shared_revision',1,'request_id',gen_random_uuid()));assert r#>>array['designs',k,'layout','text_colour']='#FFFFFF';assert r#>>array['designs',k,'revision']='3';
  r:=case when k='team_week' then public.team_of_week_api(c,'context','{"week_end":"2026-11-08"}') when k='player_week' then public.player_of_week_api(c,'context','{"week_end":"2026-11-08"}') else public.club_social_awards_api(c,'context','{"week_end":"2026-11-08"}') end;
  assert r#>>'{graphic_preferences,revision}'='1','Legacy public contexts include the shared revision';
 end loop;
 -- New global preferences do not mutate source names or labels in stored historical images.
 q:=jsonb_build_object('revision',1,'grade_labels','[{"grade":"Masters","label":"MSTRs"}]'::jsonb,'style','{"title_font":"condensed"}'::jsonb,'request_id',gen_random_uuid());r:=public.club_graphic_setup_api(c,'save_preferences',q);assert r#>>'{designs,team_week,layout,title_font}'='condensed';
 r:=public.club_graphic_setup_api(c,'history','{"kind":"preferences"}');v:=(r#>>'{versions,0,id}')::uuid;
 r:=public.club_graphic_setup_api(c,'restore',jsonb_build_object('kind','preferences','version_id',v,'revision',2,'request_id',gen_random_uuid()));assert r#>>'{preferences,grade_labels,2,label}'='MASTERS';assert r#>>'{preferences,revision}'='3';
 rejected:=false;begin perform public.club_graphic_setup_api(c,'save_design',jsonb_build_object('kind','player_week','revision',3,'shared_revision',3,'layout',jsonb_build_object('background_path',other_c||'/artwork/'||gen_random_uuid()||'.png'),'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Foreign artwork blocked';
 perform set_config('request.jwt.claim.sub',current_setting('test.graphic_member'),true);
 rejected:=false;begin perform public.club_graphic_setup_api(c,'context');exception when raise_exception then rejected:=true;end;assert rejected,'An ordinary member cannot manage designs';
 assert not has_function_privilege('anon','public.club_graphic_setup_api(uuid,text,jsonb)','execute');
end $$;
reset role;
do $$begin assert (select count(*) from public.playing_groups where club_id=current_setting('test.graphic_club')::uuid and name in ('Women’s 2nd Grade','Development League Navy','Masters'))=3,'Source team names are unchanged';end $$;
rollback;
