-- Keep existing single links and add ordered clips to the same protected action.
alter table public.coaching_video_links add column additional_links jsonb not null default '[]'::jsonb;
alter table public.coaching_video_links add constraint coaching_video_links_additional_array
 check(jsonb_typeof(additional_links)='array' and jsonb_array_length(additional_links)<=19);

create or replace function club_batting_private.save_coach_observation(p_player_id uuid,p_kind text,p_observation_id uuid,p_expected_updated_at timestamptz,p_request_id uuid,p_values jsonb,p_review_on date,p_expected_action_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare result jsonb;url text;note text:=trim(coalesce(p_values->>'video_note',''));links jsonb:='[]'::jsonb;clip jsonb;multiple boolean:=p_values ? 'videos';aid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first';end if;
 if multiple then
  if jsonb_typeof(p_values->'videos') is distinct from 'array' then raise exception 'Provide a list of YouTube links';end if;
  if jsonb_array_length(p_values->'videos')>20 then raise exception 'Keep each observation to 20 video links';end if;
  for clip in select value from jsonb_array_elements(p_values->'videos') loop
   if jsonb_typeof(clip) is distinct from 'object' or jsonb_typeof(clip->'url') is distinct from 'string'
    or (clip ? 'note' and jsonb_typeof(clip->'note') is distinct from 'string') then raise exception 'Provide a YouTube link and a short description for each clip';end if;
   url:=public.normalise_coaching_youtube_url(clip->>'url');note:=trim(coalesce(clip->>'note',''));
   if length(note)>500 or (url is null and note<>'') then raise exception 'Add a YouTube link and keep its description within 500 characters';end if;
   if url is not null then links:=links||jsonb_build_array(jsonb_build_object('url',url,'note',note));end if;
  end loop;
  url:=links->0->>'url';note:=coalesce(links->0->>'note','');
  -- The base saver and original receipt include the complete clip list.
  p_values:=p_values||jsonb_build_object('video_url',url,'video_note',note);
 elsif p_values ? 'video_url' then
  url:=public.normalise_coaching_youtube_url(p_values->>'video_url');
  if length(note)>500 or (url is null and note<>'') then raise exception 'Add a YouTube link for the video note, or leave both blank';end if;
 end if;
 result:=club_batting_private.save_coach_observation_base(p_player_id,p_kind,p_observation_id,p_expected_updated_at,p_request_id,p_values,p_review_on,p_expected_action_revision);
 if not coalesce((result->>'already_saved')::boolean,false) and (multiple or p_values ? 'video_url') then
  aid:=(result->>'action_id')::uuid;
  if url is null then
   if not multiple and exists(select 1 from public.coaching_video_links where action_id=aid and jsonb_array_length(additional_links)>0) then raise exception 'Refresh the app before removing videos from this observation';end if;
   delete from public.coaching_video_links where action_id=aid;
  elsif multiple then
   insert into public.coaching_video_links(action_id,url,note,additional_links) values(aid,url,note,links-0)
   on conflict(action_id) do update set url=excluded.url,note=excluded.note,additional_links=excluded.additional_links,updated_at=clock_timestamp();
  else
   -- Older clients may edit their visible first link without erasing later clips.
   insert into public.coaching_video_links(action_id,url,note) values(aid,url,note)
   on conflict(action_id) do update set url=excluded.url,note=excluded.note,updated_at=clock_timestamp();
  end if;
 end if;
 return result;
end $function$;

create or replace function public.coaching_conversation_video(p_action_id uuid)
returns jsonb language sql stable security definer set search_path='' as $function$
 select jsonb_build_object('url',v.url,'note',v.note,'links',jsonb_build_array(jsonb_build_object('url',v.url,'note',v.note))||v.additional_links)
 from public.coaching_video_links v
 join public.player_coaching_actions a on a.id=v.action_id
 join public.players p on p.id=a.player_id
 where a.id=p_action_id and public.can_read_coaching_conversation(a.id)
  and not(p.user_id=auth.uid() and exists(
   select 1 from public.player_match_coach_feedback f where f.id=a.match_feedback_id
    and f.plan_related and f.author_user_id<>auth.uid() and not exists(
     select 1 from public.player_match_reflections r where r.match_entry_id=f.match_entry_id and r.player_id=p.id)))
$function$;
