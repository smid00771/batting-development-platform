begin;
do $$
declare c uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); newcomer uuid:=gen_random_uuid();
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();m1 uuid:=gen_random_uuid();m2 uuid:=gen_random_uuid();
 fixture uuid:=gen_random_uuid();other_fixture uuid:=gen_random_uuid();ra uuid:=gen_random_uuid();rb uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();
 source uuid:=gen_random_uuid();old_card uuid:=gen_random_uuid();new_card uuid:=gen_random_uuid();team uuid:=gen_random_uuid();
 notea uuid:=gen_random_uuid();noteb uuid:=gen_random_uuid();result jsonb;before_rows text;denied boolean;
begin
 insert into auth.users(id) values(a),(b),(newcomer);
 insert into public.user_profiles values(a,'Alex'),(b,'Blake'),(newcomer,'Casey');
 insert into public.clubs(id,name) values(c,'Example Club'),(stranger,'Other Club');
 insert into public.club_memberships(club_id,user_id,permission_role) values(c,a,'admin'),(c,b,'coach'),(c,newcomer,'coach');
 insert into public.players(id,club_id,display_name) values(p1,c,'Player One'),(p2,c,'Player Two');
 insert into club_selection_private.fixtures(id,club_id,details) values(fixture,c,'{"grade":"First XI"}'),(other_fixture,c,'{"grade":"First XI"}');
 insert into public.player_match_entries(id,club_id,player_id,match_date,format_key,opposition,innings_number,score_text) values
  (m1,c,p1,'2026-10-10','limited_overs','Visitors',1,'45'),(m2,c,p2,'2026-10-10','limited_overs','Visitors',1,'78*');
 insert into public.player_match_coach_feedback(id,player_id,match_entry_id,author_user_id,batting_to_plan,plan_related) values
  (notea,p1,m1,a,'yes',true),(noteb,p1,m1,b,'mostly',true);
 insert into public.match_review_scorecards(id,club_id,source_match_id,scorecard,created_at) values
  (old_card,c,source,jsonb_build_object('match_id',source,'dates',jsonb_build_array('2026-10-10'),'teams',jsonb_build_array(jsonb_build_object('id',team)),'innings','[]'::jsonb),'2026-10-12'),
  (new_card,c,source,jsonb_build_object('match_id',source,'dates',jsonb_build_array('2026-10-10'),'teams',jsonb_build_array(jsonb_build_object('id',team)),'innings','[]'::jsonb,'schema_version',2),'2026-10-13');
 insert into public.team_review_sessions(id,club_id,author_user_id,fixture_id,match_date,format_key,opposition,innings_number,scorecard_id,source_team_id) values
  (ra,c,a,fixture,'2026-10-10','limited_overs','Visitors',1,old_card,team),
  (rb,c,b,fixture,'2026-10-10','limited_overs','Visitors',1,null,null),
  (r2,c,b,fixture,'2026-10-10','limited_overs','Visitors',2,null,null);
 insert into public.team_review_items(review_id,player_id,match_id,feedback_id) values(ra,p1,m1,notea),(ra,p2,m2,null),(rb,p1,m1,noteb),(r2,p1,m1,null);
 select md5(string_agg(row_to_json(x)::text,'' order by id)) into before_rows from public.player_match_coach_feedback x;
 perform set_config('request.jwt.claim.sub',a::text,true);
 result:=public.get_shared_team_review(c,rb);
 assert result->>'own_review_id'=ra::text,'Opening another contribution resolves the caller own save target';
 assert jsonb_array_length(result->'contributors')=2,'Two contributors, one shared match innings';
 assert jsonb_array_length(result->'sibling_reviews')=2,'Second innings is selectable without duplicating the match';
 assert result#>>'{scorecard_preview,snapshot_id}'=new_card::text,'Latest saved scorecard loads without external refresh';
 assert (select count(*)=2 from jsonb_array_elements(result->'players') p where p->>'score_text' in ('45','78*')),'All player scores are retained';
 assert (select p#>>'{shared_observations,0,author_name}'='Blake' from jsonb_array_elements(result->'players') p where p->>'player_id'=p1::text),'Other assessment retains author';
 perform set_config('request.jwt.claim.sub',b::text,true);
 result:=public.get_shared_team_review(c,ra);
 assert result->>'own_review_id'=rb::text,'Coach edits their existing contribution';
 assert (select p->>'batting_to_plan'='mostly' from jsonb_array_elements(result->'players') p where p->>'player_id'=p1::text),'Other author does not replace editable values';
 assert jsonb_array_length(result->'players')=2,'An author who assessed one player sees the whole match';
 perform set_config('request.jwt.claim.sub',newcomer::text,true);
 result:=public.get_shared_team_review(c,ra);
 assert result->'own_review_id'='null'::jsonb,'New contributor has no borrowed save ID';
 assert not exists(select 1 from jsonb_array_elements(result->'players') p where nullif(p->>'batting_to_plan','') is not null),'New coach starts with own assessment blank';
 assert jsonb_array_length(result->'contributors')=2,'Viewing never creates another saved contribution';
 denied:=false;begin perform public.get_shared_team_review(stranger,ra);exception when others then denied:=true;end;assert denied,'Wrong club rejected';
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 denied:=false;begin perform public.get_shared_team_review(c,ra);exception when others then denied:=true;end;assert denied,'Nonmember rejected';
 perform set_config('request.jwt.claim.sub',a::text,true);
 assert club_selection_private.shared_result_cards(c,'2026-10-05','2026-10-11')->0->>'fixture_id'=fixture::text,'Older imports use saved fixture identity despite different grade names';
 update public.team_review_sessions set fixture_id=other_fixture where id=rb;
 result:=public.get_shared_team_review(c,ra);assert jsonb_array_length(result->'contributors')=1,'A separate fixture is not merged';
 assert (select md5(string_agg(row_to_json(x)::text,'' order by id)) from public.player_match_coach_feedback x)=before_rows,'All original observations stay unchanged';
 assert not has_function_privilege('anon','public.get_shared_team_review(uuid,uuid)','execute'),'Anonymous access stays closed';
end $$;
rollback;
