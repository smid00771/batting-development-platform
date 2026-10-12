-- Read original saved post images for a chosen fixture date. No regeneration or writes.
-- Existing membership checks, storage policies, completed locks and function grants remain.
do $migration$
declare definition text:=pg_get_functiondef('club_selection_private.social_api(uuid,text,jsonb)'::regprocedure);
begin
 if md5(definition)<>'249dfd71077e02847e1594b1610c9d4e' then raise exception 'Social API changed; review before applying image history';end if;
 definition:=replace(definition,$old$if p_action not in ('context','validate_export') then$old$,$new$if p_action not in ('context','validate_export','history') then$new$);
 definition:=replace(definition,$old$ elsif p_action='settings' then$old$,$new$ elsif p_action='history' then
 if jsonb_typeof(p_data->'fixtures') is distinct from 'array' or jsonb_array_length(p_data->'fixtures') not between 1 and 32 then raise exception 'Choose between 1 and 32 fixtures';end if;
 for x in select * from jsonb_array_elements(p_data->'fixtures') loop
  if not exists(select 1 from club_selection_private.fixtures where club_id=c and id=(x->>'id')::uuid and published is not null) then raise exception 'Choose published fixtures from this club';end if;
 end loop;
 return jsonb_build_object('posts',coalesce((
  select jsonb_agg(jsonb_build_object('id',p.id,'state',p.state,'caption',p.caption,'created_at',p.created_at,
   'posted',exists(select 1 from club_selection_private.social_post_destinations d where d.post_id=p.id and d.state='published'),
   'images',(select jsonb_agg(i order by ord) from jsonb_array_elements(p.images) with ordinality a(i,ord)
    where exists(select 1 from jsonb_array_elements(p_data->'fixtures') requested where requested->>'id'=i->>'fixture_id')))
   order by p.created_at desc,p.id)
  from (select p.* from club_selection_private.social_posts p where p.club_id=c and exists(
   select 1 from jsonb_array_elements(p.images) i join jsonb_array_elements(p_data->'fixtures') requested on requested->>'id'=i->>'fixture_id')
   order by p.created_at desc,p.id limit 100) p),'[]'::jsonb));
 elsif p_action='settings' then$new$);
 execute definition;
end
$migration$;
