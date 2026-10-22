-- Synthetic records only; rolled back even when run without an outer transaction.
do $tests$
declare c uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();u uuid;
 request jsonb;result jsonb;rejected boolean;card jsonb;mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();
begin
 begin
  foreach u in array array[adm,ordinary] loop
   insert into auth.users(id,email) values(u,'award-label-'||u||'@example.invalid');
   insert into public.user_profiles(user_id,display_name) values(u,'Synthetic award label test');
  end loop;
  insert into public.clubs(id,name,slug,created_by) values(c,'Award Label Test','award-label-'||c,adm),(other_c,'Other Label Test','other-label-'||other_c,ordinary);
  insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,ordinary,'player','none');
  insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
  perform set_config('request.jwt.claim.sub',adm::text,true);
  result:=public.club_social_award_label_api(c,'context','{"week_end":"2026-10-18"}');assert result->>'mode'='week' and result->>'revision'='0';
  request:=jsonb_build_object('week_end','2026-10-18','mode','round','label','Round 2','revision',0,'request_id',gen_random_uuid());
  result:=public.club_social_award_label_api(c,'save',request);assert result->>'label'='Round 2' and result->>'revision'='1';
  assert public.club_social_award_label_api(c,'save',request)->>'revision'='1','Lost-response retry must not write twice';
  result:=public.club_social_award_label_api(c,'context','{"week_end":"2026-10-25"}');assert result->>'label' is null and (result->>'needs_label')::boolean,'Never increment or repeat a round by calendar';
  rejected:=false;begin perform public.club_social_award_label_api(c,'save',request||jsonb_build_object('request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Stale revision';
  rejected:=false;begin perform public.club_social_award_label_api(c,'save',request||'{"label":"Round 9"}'::jsonb);exception when raise_exception then rejected:=true;end;assert rejected,'Reused ID with different content';
  rejected:=false;begin perform public.club_social_award_label_api(c,'save',request||jsonb_build_object('label','<script>','revision',1,'request_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;assert rejected,'Invalid label';
  rejected:=false;begin perform public.club_social_award_label_api(other_c,'context','{"week_end":"2026-10-18"}');exception when raise_exception then rejected:=true;end;assert rejected,'Cross-club access';
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  rejected:=false;begin perform public.club_social_award_label_api(c,'save',request);exception when raise_exception then rejected:=true;end;assert rejected,'Ordinary member cannot edit';
  perform set_config('request.jwt.claim.sub','',true);
  rejected:=false;begin perform public.club_social_award_label_api(c,'context','{"week_end":"2026-10-18"}');exception when raise_exception then rejected:=true;end;assert rejected,'Anonymous request';
  perform set_config('request.jwt.claim.sub',adm::text,true);
  card:=jsonb_build_object('schema_version',2,'match_id',mid,'dates',jsonb_build_array('2026-10-24'),'round','Round 3','status','completed','grade','First Grade','teams',jsonb_build_array(jsonb_build_object('id',tid,'name','Award Label Test')),'innings','[]'::jsonb);
  insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,adm,card);
  insert into club_selection_private.team_week_sources(club_id,source_match_id,team_id,updated_by) values(c,mid,tid,adm);
  result:=public.club_social_award_label_api(c,'context','{"week_end":"2026-10-25"}');assert result->>'label'='Round 3','Common source round';
  mid:=gen_random_uuid();card:=card||jsonb_build_object('match_id',mid,'round','Round 2');
  insert into public.match_review_scorecards(club_id,source_match_id,fetched_by,scorecard) values(c,mid,adm,card);
  insert into club_selection_private.team_week_sources(club_id,source_match_id,team_id,updated_by) values(c,mid,tid,adm);
  result:=public.club_social_award_label_api(c,'context','{"week_end":"2026-10-25"}');assert result->>'label' is null and (result->>'needs_label')::boolean,'Mixed rounds require a shared choice';
  assert public.club_social_award_label_api(c,'context','{"week_end":"2026-10-18"}')->>'label'='Round 2','Past explicit label stays attached to its week';
  request:=jsonb_build_object('week_end','2026-10-18','mode','week_number','label','Week 2','revision',1,'request_id',gen_random_uuid());
  result:=public.club_social_award_label_api(c,'save',request);assert result->>'label'='Week 2' and result->>'mode'='week_number';
  result:=public.club_social_award_label_api(c,'context','{"week_end":"2026-10-25"}');assert result->>'label'='Week 3' and not (result->>'needs_label')::boolean,'Award weeks advance independently of mixed fixture rounds';
  assert public.club_social_award_label_api(c,'context','{"week_end":"2026-10-11"}')->>'label'='Week 1','Shared numbering anchor';
  assert not has_function_privilege('anon','public.club_social_award_label_api(uuid,text,jsonb)','execute');
  assert not has_table_privilege('authenticated','club_selection_private.social_award_week_labels','select');
  raise exception using errcode='ZX248',message='award label checks passed';
 exception when sqlstate 'ZX248' then raise notice 'All award label database checks passed; synthetic data rolled back.';end;
end;
$tests$;
