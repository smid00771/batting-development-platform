CREATE OR REPLACE FUNCTION club_selection_private.draft_snapshot(f uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('details',m.details,'slots',case when coalesce((m.details->>'cancelled')::boolean,false) then '[]'::jsonb else m.slots end,
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'batting',p.batting,'bowling',p.bowling,'bowling_load',p.bowling_load,'keeper',p.keeper) order by p.id)
 from club_selection_private.roster p where p.club_id=m.club_id and exists(select 1 from jsonb_array_elements(m.slots) s where s->>'d1'=p.id::text or s->>'d2'=p.id::text)),'[]'))
 from club_selection_private.fixtures m where m.id=f
$function$
;
