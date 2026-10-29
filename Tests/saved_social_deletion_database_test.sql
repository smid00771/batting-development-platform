-- Synthetic metadata only; no real files are deleted or Storage metadata modified.
begin;
set local statement_timeout='20s';
do $tests$
declare c uuid:=gen_random_uuid();other uuid:=gen_random_uuid();adm uuid:=gen_random_uuid();ordinary uuid:=gen_random_uuid();
 eid uuid:=gen_random_uuid();older uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();pid uuid:=gen_random_uuid();postid uuid:=gen_random_uuid();pendingid uuid:=gen_random_uuid();
 r jsonb;blocked boolean;imagepath text;
begin
 insert into auth.users(id,email) values(adm,'delete-'||adm||'@example.invalid'),(ordinary,'delete-'||ordinary||'@example.invalid');
 insert into public.user_profiles(user_id,display_name) values(adm,'Synthetic Admin'),(ordinary,'Synthetic Player');
 insert into public.clubs(id,name,slug,created_by) values(c,'Saved Image Test','image-delete-'||c,adm),(other,'Other Image Test','image-delete-'||other,adm);
 insert into public.club_memberships(club_id,user_id,role,permission_role) values(c,adm,'admin','admin'),(c,ordinary,'player','none');
 insert into club_selection_private.access(club_id,mode,status) values(c,'standalone','active');
 insert into club_selection_private.social_award_editions(id,club_id,kind,week_end,label,sources,image_path,image_sha,image_bytes,request,created_by,sealed_at) values
 (older,c,'results',current_date,'Old Results','[{"key":"same-match"}]',c||'/editions/'||older||'.png',repeat('a',64),1000,'{}',adm,now()-interval '1 day'),
 (eid,c,'results',current_date,'Results','[{"key":"same-match"}]',c||'/editions/'||eid||'.png',repeat('b',64),1000,'{}',adm,now());
 insert into club_selection_private.team_week_editions(id,club_id,week_end,title,rows,image_path,image_sha,image_bytes,request,created_by,sealed_at)
 values(tid,c,current_date,'Week', '[]',c||'/editions/'||tid||'.png',repeat('c',64),1000,'{}',adm,now());
 insert into club_selection_private.player_week_editions(id,club_id,week_end,title,winner,image_path,image_sha,image_bytes,request,created_by,sealed_at)
 values(pid,c,current_date,'Week','{"name":"Player"}',c||'/editions/'||pid||'.png',repeat('d',64),1000,'{}',adm,now());
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 blocked:=false;begin perform public.club_social_awards_api(c,'delete_image',jsonb_build_object('id',eid));exception when raise_exception then blocked:=true;end;assert blocked,'Ordinary member cannot delete artwork';
 perform set_config('request.jwt.claim.sub',adm::text,true);
 blocked:=false;begin perform public.club_social_awards_api(other,'delete_image',jsonb_build_object('id',eid));exception when raise_exception then blocked:=true;end;assert blocked,'Other club cannot delete artwork';
 r:=public.club_social_awards_api(c,'delete_image',jsonb_build_object('id',eid));imagepath:=r->>'path';
 assert r->>'bucket'='club-social-awards' and imagepath=c||'/editions/'||eid||'.png','Server derives the exact stored object';
 assert club_selection_private.saved_image_delete_allowed('club-social-awards',imagepath),'Only prepared file may be removed';
 assert not club_selection_private.saved_image_delete_allowed('club-social-awards',c||'/artwork/'||eid||'.png'),'Reusable artwork is protected';
 assert not club_selection_private.saved_image_delete_allowed('club-player-week',imagepath),'Wrong bucket is protected';
 assert exists(select 1 from club_selection_private.social_award_collection(c,current_date) where id=eid),'Pending removal remains available for Retry';
 assert not exists(select 1 from club_selection_private.social_award_sources(c) where id=eid),'Pending removal cannot start a new post';
 r:=public.club_social_awards_api(c,'delete_image',jsonb_build_object('id',eid,'finish',true));
 assert r->>'deleted'='true','Absent file confirms cleanup';
 assert not exists(select 1 from club_selection_private.social_award_collection(c,current_date) where id in(eid,older)),'Deleting latest does not revive its old version';
 assert public.club_social_awards_api(c,'delete_image',jsonb_build_object('id',eid))->>'deleted'='true','Delete retry is idempotent';
 assert public.club_social_awards_api(c,'delete_image',jsonb_build_object('id',tid))->>'bucket'='club-team-week','Team award bucket';
 assert public.club_social_awards_api(c,'delete_image',jsonb_build_object('id',pid))->>'bucket'='club-player-week','Player award bucket';
 insert into club_selection_private.social_posts(id,club_id,created_by,renderer,fixtures,images,state)
 values(postid,c,adm,'social-awards.178','[]',jsonb_build_array(jsonb_build_object('path',c||'/'||postid||'/0.jpg'),jsonb_build_object('path',c||'/'||postid||'/1.jpg')),'approved'),
 (pendingid,c,adm,'social-awards.178','[]','[]','approved');
 insert into club_selection_private.social_post_destinations(post_id,platform,account_id,state) values(postid,'facebook','synthetic','published'),(pendingid,'facebook','synthetic','queued');
 assert club_selection_private.social_post_view(postid)->>'can_delete'='true','Completed post offers delete';
 assert club_selection_private.social_post_view(pendingid)->>'can_delete'='false','Queued post has no delete';
 blocked:=false;begin perform public.club_socials_publish_api(c,'delete_post',jsonb_build_object('id',pendingid));exception when raise_exception then blocked:=true;end;assert blocked,'Server protects pending deliveries';
 r:=public.club_socials_publish_api(c,'delete_post',jsonb_build_object('id',postid));
 assert jsonb_array_length(r->'paths')=2 and r->>'bucket'='club-social-posts','All post copies are included';
 assert club_selection_private.saved_post_delete_allowed(c||'/'||postid||'/1.jpg'),'Prepared post image can be removed';
 blocked:=false;begin perform public.club_socials_publish_api(c,'retry',jsonb_build_object('id',postid));exception when raise_exception then blocked:=true;end;assert blocked,'Deleting post cannot restart publishing';
 r:=public.club_socials_publish_api(c,'delete_post',jsonb_build_object('id',postid,'finish',true));
 assert r->>'deleted'='true','Post cleanup finishes';
 assert not exists(select 1 from jsonb_array_elements(public.club_socials_publish_api(c,'context')->'posts') p where p->>'id'=postid::text),'Deleted post is removed from history';
 assert exists(select 1 from club_selection_private.social_post_destinations where post_id=postid and state='published'),'Remote publication record is retained';
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 assert not club_selection_private.saved_image_delete_allowed('club-team-week',c||'/editions/'||tid||'.png'),'Member cannot bypass RPC via Storage';
 assert not club_selection_private.saved_post_delete_allowed(c||'/'||postid||'/0.jpg'),'Member cannot remove post copies';
end $tests$;
rollback;
