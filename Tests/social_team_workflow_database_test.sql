-- Synthetic clubs and storage metadata only; the inner transaction always rolls back.
do $test$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();mgr uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();u uuid;
 path text;next_path text;foreign_path text;request jsonb;result jsonb;asset uuid;denied boolean;before_count bigint;
begin
 select count(*) into before_count from club_selection_private.social_assets;
 begin
  foreach u in array array[adm,mgr,ordinary] loop
   insert into auth.users(id,email) values(u,'social-workflow-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic workflow tester');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic artwork club','artwork-'||c,adm),(other_c,'Other synthetic club','artwork-'||other_c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,mgr,'player','none'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status) values(c,'standalone','active');
  insert into club_selection_private.social_managers(club_id,user_id) values(c,mgr);
  perform set_config('request.jwt.claim.sub',mgr::text,true);
  path:=c||'/logo/'||gen_random_uuid()||'.png';next_path:=c||'/logo/'||gen_random_uuid()||'.png';foreign_path:=other_c||'/logo/'||gen_random_uuid()||'.png';
  assert club_selection_private.social_storage_allowed(path),'Appointed manager can upload own club logo';
  assert not club_selection_private.social_storage_allowed(foreign_path),'Other club remains denied';
  insert into storage.objects(bucket_id,name,metadata) values('club-socials',path,'{"size":1000,"mimetype":"image/png"}'),('club-socials',next_path,'{"size":1000,"mimetype":"image/png"}');
  request:=jsonb_build_object('kind','logo','path',path,'revision',0,'asset_id',null,'request_id',gen_random_uuid());
  result:=public.club_socials_api(c,'save_asset',request);asset:=(result->>'id')::uuid;
  assert public.club_socials_api(c,'save_asset',request)=result,'Retry returns original receipt';
  assert exists(select 1 from jsonb_array_elements(public.club_socials_api(c,'context')->'assets') a where a->>'kind'='logo' and a->>'path'=path),'Saved logo loads in club artwork';
  assert not club_selection_private.social_storage_allowed(path,true),'Attached logo cannot be deleted from storage';
  denied:=false;begin perform public.club_socials_api(c,'save_asset',request||jsonb_build_object('path',next_path,'request_id',gen_random_uuid()));exception when raise_exception then denied:=true;end;assert denied,'Stale revision cannot replace logo';
  request:=jsonb_build_object('kind','logo','path',next_path,'revision',1,'asset_id',asset,'request_id',gen_random_uuid());
  result:=public.club_socials_api(c,'save_asset',request);assert result->>'old_path'=path,'Replacement returns only old unattached path';
  assert club_selection_private.social_storage_allowed(path,true),'Old unattached logo may be removed';
  denied:=false;begin insert into club_selection_private.social_assets(club_id,kind,path,updated_by) values(c,'logo',c||'/logo/'||gen_random_uuid()||'.png',mgr);exception when unique_violation then denied:=true;end;assert denied,'Only one team-list logo per club';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  assert not club_selection_private.social_storage_allowed(next_path),'Ordinary player cannot access socials artwork';
  denied:=false;begin perform public.club_socials_api(c,'save_asset',request||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then denied:=true;end;assert denied,'Ordinary player cannot save a logo';
  perform set_config('request.jwt.claim.sub',mgr::text,true);
  perform public.club_socials_api(c,'remove_asset',jsonb_build_object('kind','logo','revision',2,'asset_id',asset,'request_id',gen_random_uuid()));
  assert not exists(select 1 from club_selection_private.social_assets where club_id=c and kind='logo'),'Removing social logo allows normal club-logo fallback';
  raise exception using errcode='ZX180',message='rollback synthetic data';
 exception when sqlstate 'ZX180' then null;
 end;
 assert (select count(*)=before_count from club_selection_private.social_assets),'All synthetic artwork rolled back';
 assert not exists(select 1 from public.clubs where id in(c,other_c)),'No synthetic clubs remain';
end $test$;
