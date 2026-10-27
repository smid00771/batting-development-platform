-- The board no longer displays the old captain-review snapshot collection.
-- Keep the default API response for other clients; omit only on an explicit
-- board request from a selector/captain. Fixture permissions and writes are unchanged.
do $patch$
declare definition text;first text:=$old$'reviews',coalesce((select jsonb_agg($old$;
 last text:=$old$from club_selection_private.fixtures f where f.club_id=c and club_selection_private.review_audience(f.id,me)),'[]'::jsonb),$old$;
begin
 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,first,'')))/length(first)<>1 or (length(definition)-length(replace(definition,last,'')))/length(last)<>1 then raise exception 'Unexpected review snapshot context';end if;
 definition:=replace(definition,first,$new$'reviews',case when p_data->>'review_snapshots'='false' and (sel or cap) then '[]'::jsonb else coalesce((select jsonb_agg($new$);
 definition:=replace(definition,last,$new$from club_selection_private.fixtures f where f.club_id=c and club_selection_private.review_audience(f.id,me)),'[]'::jsonb) end,$new$);
 execute definition;
end $patch$;
