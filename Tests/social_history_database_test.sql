-- Synthetic saved images only. Roll back test data even when run with a migration.
do $tests$
declare c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();
 fid uuid:=gen_random_uuid();other_fid uuid:=gen_random_uuid();post_id uuid:=gen_random_uuid();
 details jsonb;images jsonb;result jsonb;rejected boolean;request_count integer;u uuid;
begin
 begin
  foreach u in array array[adm,ordinary] loop
   insert into auth.users(id,email) values(u,'social-history-test-'||u::text||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic history test');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Temporary history test','history-test-'||c::text,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  details:=jsonb_build_object('grade','Test XI','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date','2026-01-01')),'format','limited_overs','cancelled',false,'brackets',false,'min_quicks',0,'min_batters',0,'staff','[]'::jsonb);
  insert into club_selection_private.fixtures(id,club_id,details,slots,publication) values(fid,c,details,'[]',1),(other_fid,c,details||jsonb_build_object('grade','Other XI'),'[]',1);
  update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id) where id in(fid,other_fid);
  images:=jsonb_build_array(
   jsonb_build_object('path',c::text||'/'||post_id::text||'/0.jpg','label','Original XI','fixture_id',fid,'sha256',repeat('a',64),'bytes',100),
   jsonb_build_object('path',c::text||'/'||post_id::text||'/1.jpg','label','Other XI','fixture_id',other_fid,'sha256',repeat('b',64),'bytes',120));
  insert into club_selection_private.social_posts(id,club_id,created_by,renderer,fixtures,images,caption,state)
   values(post_id,c,adm,'test',jsonb_build_array(jsonb_build_object('id',fid),jsonb_build_object('id',other_fid)),images,'Original saved caption','draft');
  select count(*) into request_count from club_selection_private.requests where club_id=c;
  result:=public.club_socials_api(c,'history',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',fid))));
  assert jsonb_array_length(result->'posts')=1;
  assert result->'posts'->0->>'caption'='Original saved caption';
  assert result->'posts'->0->>'state'='draft' and result->'posts'->0->>'posted'='false';
  assert jsonb_array_length(result->'posts'->0->'images')=1;
  assert result->'posts'->0->'images'->0=images->0;
  assert (select count(*)=request_count from club_selection_private.requests where club_id=c);
  -- Current design changes cannot rewrite history images or captions.
  update public.clubs set primary_colour='#112233' where id=c;
  assert public.club_socials_api(c,'history',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',fid))))=result;
  rejected:=false;begin
   perform public.club_socials_api(c,'history',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()))));
  exception when raise_exception then rejected:=true;end;assert rejected;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  rejected:=false;begin perform public.club_socials_api(c,'history',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',fid))));
  exception when raise_exception then rejected:=true;end;assert rejected;
  raise exception using errcode='P0161',message='Rollback successful history test';
 exception when sqlstate 'P0161' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end
$tests$;
select 'Saved social image history checks passed' as result;
