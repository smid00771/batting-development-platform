-- Add only completion metadata to fixtures already returned by the guarded API.
-- The latest explicitly linked, club-scoped saved scorecard is authoritative.
-- No fixture, selection, lock, publication or permission is changed.
do $patch$
declare definition text;old_text text;new_text text;before_acl aclitem[];
begin
 old_text:=$old$jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')))$old$;
 new_text:=$new$jsonb_build_object('selection_group_id',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->'details',f#>'{published,details}')),
  'result_complete',coalesce((select latest.scorecard->>'status'='completed'
   from club_selection_private.fixture_result_sources src
   join lateral (select sc.scorecard from public.match_review_scorecards sc
    where sc.club_id=src.club_id and sc.source_match_id=src.source_match_id
    order by sc.created_at desc,sc.id desc limit 1) latest on true
   where src.club_id=p_club_id and src.fixture_id=(f->>'id')::uuid and src.no_play is null),false))$new$;
 select pg_get_functiondef(oid),proacl into definition,before_acl from pg_proc where oid='public.club_selections_api(uuid,text,jsonb)'::regprocedure;
 if length(definition)-length(replace(definition,old_text,''))<>length(old_text) then raise exception 'Unexpected selection context definition';end if;
 execute replace(definition,old_text,new_text);
 assert (select proacl is not distinct from before_acl from pg_proc where oid='public.club_selections_api(uuid,text,jsonb)'::regprocedure),'Existing API grants are preserved';
end $patch$;

-- Assertions are atomic with this migration; synthetic rows are rolled back.
do $tests$
declare c uuid:=gen_random_uuid();other uuid:=gen_random_uuid();u uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();g uuid:=gen_random_uuid();sg uuid:=gen_random_uuid();
 finished uuid:=gen_random_uuid();playing uuid:=gen_random_uuid();missing uuid:=gen_random_uuid();no_play uuid:=gen_random_uuid();mid uuid:=gen_random_uuid();pmid uuid:=gen_random_uuid();missing_mid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();
 d jsonb;ctx jsonb;before_fixtures jsonb;rejected boolean:=false;
begin
 begin
 insert into auth.users(id,email) values(u,'completed-ui-'||u||'@example.invalid'),(outsider,'completed-ui-'||outsider||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(u,'Synthetic selector'),(outsider,'Other club member');
 insert into public.clubs(id,name,slug,created_by) values(c,'Completed UI test','completed-ui-'||c,u),(other,'Other UI test','completed-ui-'||other,outsider);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,u,'admin','admin'),(other,outsider,'admin','admin');
 insert into club_selection_private.access(club_id,mode,status,head_selector_id,timezone) values(c,'standalone','active',u,'Australia/Sydney');
 insert into public.playing_groups(id,club_id,name) values(g,c,'First XI');
 insert into club_selection_private.selection_groups(id,club_id,name) values(sg,c,'Senior cricket');
 insert into club_selection_private.selection_group_grades values(c,g,sg);
 d:=jsonb_build_object('grade','First XI','grade_group_id',g,'format','t20','competition','Test cup','opposition','Visitors','days',jsonb_build_array(jsonb_build_object('date',to_char(now() at time zone 'Australia/Sydney','YYYY-MM-DD'),'start','10:00')));
 insert into club_selection_private.fixtures(id,club_id,details,slots,published)
 select id,c,details,'[]',jsonb_build_object('details',details,'slots','[]'::jsonb) from (values
 (finished,d),
 (playing,jsonb_set(d,'{days}','[{"date":"2026-10-17"},{"date":"2099-10-24"}]')||'{"opposition":"Playing Visitors"}'::jsonb),
 (missing,d||'{"opposition":"Missing Visitors"}'::jsonb),
 (no_play,d||'{"opposition":"No Play Visitors"}'::jsonb)) fixtures(id,details);
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,source_match_id,team_id,updated_by) values(finished,c,mid,tid,u),(playing,c,pmid,tid,u),(missing,c,missing_mid,tid,u);
 insert into club_selection_private.fixture_result_sources(fixture_id,club_id,no_play,updated_by) values(no_play,c,'washed_out',u);
 insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by,created_at) values
 (c,mid,'{"status":"completed"}',u,now()-interval '2 minutes'),(c,pmid,'{"status":"in_progress"}',u,now()),
 (other,missing_mid,'{"status":"completed"}',outsider,now());
 select jsonb_agg(to_jsonb(f) order by f.id) into before_fixtures from club_selection_private.fixtures f where f.club_id=c;
 perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 ctx:=public.club_selections_api(c,'context');
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') f where f->>'id'=finished::text and f->>'result_complete'='true'),'Today''s downloaded completed match is recognised';
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') f where f->>'id'=playing::text and f->>'result_complete'='false'),'An unfinished two-day scorecard is not completed';
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') f where f->>'id'=missing::text and f->>'result_complete'='false'),'Another club''s saved match cannot supply the result';
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') f where f->>'id'=no_play::text and f->>'result_complete'='false'),'A no-play marker is not a downloaded completed scorecard';
 insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by,created_at) values(c,mid,'{"status":"in_progress"}',u,now()-interval '1 minute');
 ctx:=public.club_selections_api(c,'context');
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') f where f->>'id'=finished::text and f->>'result_complete'='false'),'The latest saved status overrides an older final result';
 insert into public.match_review_scorecards(club_id,source_match_id,scorecard,fetched_by,created_at) values(c,mid,'{"status":"completed"}',u,now());
 ctx:=public.club_selections_api(c,'context');
 assert exists(select 1 from jsonb_array_elements(ctx->'fixtures') f where f->>'id'=finished::text and f->>'result_complete'='true'),'A refreshed completed result restores the flag';
 assert before_fixtures=(select jsonb_agg(to_jsonb(f) order by f.id) from club_selection_private.fixtures f where f.club_id=c),'Context reads do not alter selections, locks or publication';
 perform set_config('request.jwt.claim.sub',outsider::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 begin perform public.club_selections_api(c,'context');exception when raise_exception then rejected:=true;end;
 assert rejected,'Another club member cannot read this context';
 raise exception using errcode='ZX001',message='Synthetic completion state checks passed';
 exception when sqlstate 'ZX001' then null;
 end;
end $tests$;
