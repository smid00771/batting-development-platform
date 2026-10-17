-- Correct the players without publishing unrelated draft fixture edits.
do $migration$
declare body text:=pg_get_functiondef('club_selection_private.scorecard_team_plan(uuid,uuid,text,uuid,jsonb)'::regprocedure);
begin
 if strpos(body,$old$'published_details',f.details,$old$)=0 then raise exception 'Expected target publication details were not found';end if;
 body:=replace(body,$old$'published_details',f.details,$old$,$new$'published_details',coalesce(f.published->'details',f.details),$new$);
 body:=replace(body,$old$ if f.scorecard_sync->>'match_id' is not null$old$,$new$ if f.published is not null and (
  coalesce((f.published->'details'->>'cancelled')::boolean,false)
  or (select jsonb_agg(z.value->>'date' order by z.value->>'date') from jsonb_array_elements(f.published->'details'->'days') z(value)) is distinct from target_dates
  or club_selection_private.fixture_identity(c,f.published->'details')->>'format_key' is distinct from club_selection_private.fixture_identity(c,f.details)->>'format_key'
 ) then raise exception 'The published fixture dates or format have changed. Resolve the fixture details before correcting its team';end if;
 if f.scorecard_sync->>'match_id' is not null$new$);
 execute body;
end $migration$;
