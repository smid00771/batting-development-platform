-- Synthetic data only; no messages, uploads or posts. Every row rolls back.
begin;
do $tests$
declare c uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();fid uuid:=gen_random_uuid();
 players uuid[];slots jsonb;details jsonb;request jsonb;answer jsonb;before_key text;after_key text;
 rejected boolean;today date:=(now() at time zone 'Australia/Sydney')::date;
begin
 insert into auth.users(id,email) values(adm,'fixture-graphic-'||adm::text||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(adm,'Synthetic socials admin');
 insert into public.clubs(id,name,slug,created_by) values(c,'Synthetic fixture graphics','fixture-graphic-'||c::text,adm);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin');
 insert into club_selection_private.access(club_id,mode,status,timezone) values(c,'standalone','active','Australia/Sydney');
 perform set_config('request.jwt.claim.sub',adm::text,true);
 players:=array(select gen_random_uuid() from generate_series(1,13));
 for i in 1..13 loop insert into club_selection_private.roster(id,club_id,name,active) values(players[i],c,'Synthetic Player '||i,true);end loop;
 slots:=(select jsonb_agg(jsonb_build_object('d1',players[x],'d2',case when x=1 then players[12] else players[x] end) order by x) from generate_series(1,11) x);
 details:=jsonb_build_object('grade','Test XI','opposition','Synthetic visitors','competition','Test','days',jsonb_build_array(jsonb_build_object('date',(today+2)::text),jsonb_build_object('date',(today+9)::text)),
  'format','long_form','cancelled',false,'brackets',true,'bracket_basis','general','min_quicks',0,'min_batters',0,'staff','[]'::jsonb,
  'match_roles',jsonb_build_object('d1',jsonb_build_object('captain_id',players[1]),'d2',jsonb_build_object('captain_id',players[12])));
 insert into club_selection_private.fixtures(id,club_id,details,slots,publication) values(fid,c,details,slots,1);
 update club_selection_private.fixtures set published=club_selection_private.draft_snapshot(id) where id=fid;
 before_key:=club_selection_private.social_artwork_key(fid);
 request:=jsonb_build_object('request_id',gen_random_uuid(),'fixture_id',fid,'publication',1,'days',jsonb_build_array(1,2),'revisions',jsonb_build_object('d1',0,'d2',0),'mode','player','roster_id',players[12],'photo_scale',110,'photo_x',-3,'photo_y',4);
 -- Week-two-only player is valid for the shared poster, including its week-one record.
 answer:=public.club_socials_api(c,'feature',request);assert answer->>'saved'='true';
 assert public.club_socials_api(c,'feature',request)=answer,'Retry uses its saved receipt';
 assert (select count(*)=2 and bool_and(roster_id=players[12] and revision=1 and photo_scale=110 and photo_x=-3 and photo_y=4) from club_selection_private.social_features where fixture_id=fid);
 assert club_selection_private.social_features_valid(fid);
 after_key:=club_selection_private.social_artwork_key(fid);assert before_key<>after_key;
 assert public.club_socials_api(c,'validate_export',jsonb_build_object('fixtures',jsonb_build_array(jsonb_build_object('id',fid,'artwork_key',after_key))))->>'current'='true';
 -- A stale second-day revision rolls back the entire attempted change.
 rejected:=false;begin perform public.club_socials_api(c,'feature',request||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',1,'d2',0),'photo_y',9));exception when raise_exception then rejected:=sqlerrm like 'Featured photo changed%';end;assert rejected;
 assert (select bool_and(revision=1 and photo_y=4) from club_selection_private.social_features where fixture_id=fid);
 rejected:=false;begin perform public.club_socials_api(c,'feature',request||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',1,'d2',1),'roster_id',players[13]));exception when raise_exception then rejected:=sqlerrm like 'Choose a player selected%';end;assert rejected,'Unselected players cannot feature';
 rejected:=false;begin perform public.club_socials_api(c,'feature',request||jsonb_build_object('request_id',gen_random_uuid(),'publication',2));exception when raise_exception then rejected:=sqlerrm like 'Published team changed%';end;assert rejected;
 -- Switching to the week-one-only partner is also valid on both saved days.
 perform public.club_socials_api(c,'feature',request||jsonb_build_object('request_id',gen_random_uuid(),'revisions',jsonb_build_object('d1',1,'d2',1),'roster_id',players[1]));
 assert (select bool_and(roster_id=players[1] and revision=2) from club_selection_private.social_features where fixture_id=fid);
 assert club_selection_private.social_features_valid(fid);
 -- Removing that player from the published fixture invalidates old artwork.
 update club_selection_private.fixtures set published=jsonb_set(published,'{slots,0,d1}',to_jsonb(players[13]::text)) where id=fid;
 assert not club_selection_private.social_features_valid(fid);
 -- A phantom day-two slot never qualifies a player for a one-day fixture.
 update club_selection_private.fixtures set published=jsonb_set(published,'{details,days}',jsonb_build_array(jsonb_build_object('date',(today+2)::text))) where id=fid;
 rejected:=false;begin perform public.club_socials_api(c,'feature',request||jsonb_build_object('request_id',gen_random_uuid(),'days',jsonb_build_array(1),'revisions',jsonb_build_object('d1',2)));exception when raise_exception then rejected:=sqlerrm like 'Choose a player selected%';end;assert rejected;
 -- Heading adjustments belong to this club's saved template, including future settings saves.
 answer:=public.club_socials_api(c,'context','{}');
 request:=jsonb_build_object('request_id',gen_random_uuid(),'revision',answer->'revision','design',jsonb_build_object('layout','portrait','photo_policy','choose','primary','#225533','accent','#EAC552','heading_scale',80));
 assert public.club_socials_api(c,'settings',request)->>'saved'='true';
 assert public.club_socials_api(c,'context','{}')->'design'->>'heading_scale'='80';
 perform public.club_socials_api(c,'settings',request); -- Same receipt, same revision.
 answer:=public.club_socials_api(c,'context','{}');
 assert answer->>'revision'='1';
 perform public.club_socials_api(c,'settings',jsonb_build_object('request_id',gen_random_uuid(),'revision',1,'design',jsonb_build_object('accent','#DDAA11')));
 answer:=public.club_socials_api(c,'context','{}');assert answer->'design'->>'heading_scale'='80';assert answer->'design'->>'accent'='#DDAA11';
 rejected:=false;begin perform public.club_socials_api(c,'settings',jsonb_build_object('request_id',gen_random_uuid(),'revision',2,'design',jsonb_build_object('heading_scale',999)));exception when raise_exception then rejected:=true;end;assert rejected;
 assert public.club_socials_api(c,'context','{}')->>'revision'='2';
end
$tests$;
select 'Whole-fixture photos, bracket partners, export validation and atomic retries passed' as result;
rollback;
