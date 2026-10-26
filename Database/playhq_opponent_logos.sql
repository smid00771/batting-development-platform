-- Only the Edge Function can call this; it checks Socials access first.
create function public.playhq_logo_context(p_club_id uuid,p_snapshot_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
 if current_setting('request.jwt.claims',true)::jsonb->>'role' is distinct from 'service_role' then raise exception 'Backend access required';end if;
 select jsonb_build_object('season_id',l.season_id,'match_id',l.match_id,'grade_id',l.grade_id,'teams',(
  select jsonb_agg(jsonb_build_object('id',t->>'id','source_team_id',t->>'source_team_id','source_organisation_id',t->>'source_organisation_id'))
  from jsonb_array_elements(s.scorecard->'teams') t
 )) into answer
 from public.match_review_scorecards s join club_selection_private.playhq_links l
 on l.club_id=s.club_id and l.match_id::text=s.scorecard->>'upstream_match_id'
 and l.team_id::text=s.scorecard->>'upstream_team_id' and l.grade_id::text=s.scorecard->>'upstream_grade_id'
 where s.id=p_snapshot_id and s.club_id=p_club_id and s.scorecard->>'provider'='playhq_au';
 if answer is null then raise exception 'Linked scorecard unavailable';end if;
 return answer;
end;
$$;
revoke all on function public.playhq_logo_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.playhq_logo_context(uuid,uuid) to service_role;

-- Preserve the current worker, including canonical score links and scheduling.
do $$
declare definition text:=pg_get_functiondef('public.playhq_sync_worker(text,jsonb)'::regprocedure);
 old text:=$old$'source_fixture',l.source_fixture,'grade'$old$;
begin
 if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then raise exception 'Unexpected scorecard context definition';end if;
 execute replace(definition,old,$new$'season_id',l.season_id,'source_fixture',l.source_fixture,'grade'$new$);
end;
$$;
