-- Synthetic rows only. All changes are rolled back before returning.
do $tests$
declare c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();eid uuid;latest_team uuid;latest_player uuid;
 result jsonb;refs jsonb;rejected boolean;i integer;k text;
begin
 begin
  insert into auth.users(id,email) values(adm,'award-collection-'||adm||'@example.invalid');
  insert into public.user_profiles(user_id,display_name) values(adm,'Synthetic collection test');
  insert into public.clubs(id,name,slug,created_by) values(c,'Collection Test','collection-test-'||c,adm);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin');
  insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  for i in 1..4 loop
   eid:=gen_random_uuid();if i=3 then latest_team:=eid;end if;
   insert into club_selection_private.team_week_editions(id,club_id,week_end,title,rows,image_path,image_sha,image_bytes,request,created_by,sealed_at)
    values(eid,c,case when i=4 then '2026-10-04'::date else '2026-10-11'::date end,'Team of the Week','[]',c||'/editions/'||eid||'.png',repeat('a',64),1000,'{}',adm,'2026-10-13 01:00Z'::timestamptz+i*interval '1 minute');
  end loop;
  for i in 1..2 loop
   eid:=gen_random_uuid();latest_player:=eid;
   insert into club_selection_private.player_week_editions(id,club_id,week_end,title,winner,image_path,image_sha,image_bytes,request,created_by,sealed_at)
    values(eid,c,'2026-10-11','Player of the Week','{"name":"Test Player"}',c||'/editions/'||eid||'.png',repeat('b',64),1000,'{}',adm,'2026-10-13 02:00Z'::timestamptz+i*interval '1 minute');
  end loop;
  foreach k in array array['century','five_wickets','results'] loop
   for i in 1..2 loop
    eid:=gen_random_uuid();
    insert into club_selection_private.social_award_editions(id,club_id,kind,week_end,label,sources,image_path,image_sha,image_bytes,request,created_by,sealed_at)
     values(eid,c,k,'2026-10-11',k||' '||i,jsonb_build_array(jsonb_build_object('key',k||':'||i)),c||'/editions/'||eid||'.png',repeat('c',64),1000,'{}',adm,now());
   end loop;
  end loop;
  result:=public.club_social_awards_api(c,'context','{"week_end":"2026-10-11"}');
  assert jsonb_array_length(result->'editions')=8,'One weekly team, one weekly player and all six milestone/result images';
  assert exists(select 1 from jsonb_array_elements(result->'editions') e where e->>'id'=latest_team::text),'Latest team version selected';
  assert exists(select 1 from jsonb_array_elements(result->'editions') e where e->>'id'=latest_player::text),'Latest player version selected';
  assert (select count(*)=12 from club_selection_private.social_award_sources(c)),'All saved versions remain available';
  assert jsonb_array_length(public.club_social_awards_api(c,'context','{"week_end":"2026-10-04"}')->'editions')=1,'Weeks stay separate';
  select jsonb_agg(jsonb_build_object('id',e.id,'source_type','award','kind',e.kind,'artwork_key',e.image_sha)) into refs
   from club_selection_private.social_award_sources(c) e where e.week_end='2026-10-11' and e.kind='team_week';
  rejected:=false;
  begin perform club_selection_private.social_post_validate(c,refs);exception when raise_exception then rejected:=true;end;
  assert rejected,'Different saved versions of one weekly award cannot be combined';
  rejected:=false;begin perform club_selection_private.social_post_validate(c,jsonb_build_array(refs->0));exception when raise_exception then rejected:=true;end;assert rejected,'Synthetic images without matching current score facts cannot post';
  select jsonb_agg(jsonb_build_object('id',e.id,'source_type','award','kind',e.kind,'artwork_key',e.image_sha)) into refs
   from club_selection_private.social_award_collection(c,'2026-10-11') e;
  rejected:=false;begin perform club_selection_private.social_post_validate(c,refs);exception when raise_exception then rejected:=true;end;assert rejected,'Synthetic images without matching current score facts cannot post';
  assert not has_function_privilege('authenticated','club_selection_private.social_award_collection(uuid,date)','EXECUTE');
  raise exception using errcode='P0182',message='Rollback successful award collection checks';
 exception when sqlstate 'P0182' then null;
 end;
 assert not exists(select 1 from public.clubs where id=c);
end $tests$;
select 'Current award collection checks passed; all synthetic rows rolled back.' as result;
