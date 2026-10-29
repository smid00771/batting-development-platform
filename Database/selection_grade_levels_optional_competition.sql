-- Manually edited fixtures can legitimately have an empty competition label.
-- Rank their named teams using the same explicit club settings as imported teams.
do $patch$
declare definition text:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 old_guard text:=$old$if length(btrim(coalesce(x->>'competition',''))) not between 1 and 120 or length(btrim(coalesce(x->>'grade',''))) not between 1 and 120$old$;
 new_guard text:=$new$if jsonb_typeof(x->'competition') is distinct from 'string' or length(btrim(coalesce(x->>'competition',''))) not between 0 and 120 or length(btrim(coalesce(x->>'grade',''))) not between 1 and 120$new$;
begin
 if position(old_guard in definition)=0 then raise exception 'Unexpected grade-level validation';end if;
 definition:=replace(definition,old_guard,new_guard);
 definition:=replace(definition,
  $old$select 1 from jsonb_array_elements(p_data->'rows') x group by lower(btrim(x->>'competition')),lower(btrim(x->>'grade')) having count(*)>1$old$,
  $new$select 1 from jsonb_array_elements(p_data->'rows') levels(value) group by lower(btrim(levels.value->>'competition')),lower(btrim(levels.value->>'grade')) having count(*)>1$new$);
 definition:=replace(definition,'Use a competition, grade and level from 1 to 99','Use a grade and level from 1 to 99; competition may be blank');
 execute definition;
end $patch$;
