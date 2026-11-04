-- The browser may call the public identity RPC, but its invoker wrapper cannot
-- enter the private confirmation function after that helper's grants were removed.
-- Use the same narrowly scoped definer-wrapper pattern as club_selections_api.
-- The private function still checks the signed-in user, club, staff permissions,
-- exact scorecard identity, expected name and idempotent confirmation receipt.
do $guard$
begin
 if md5(pg_get_functiondef('public.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure))<>'0e05a8addd4e42a987c590ccdb1637f5'
  or md5(pg_get_functiondef('club_batting_private.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure))<>'664b5667fe6a3ce946c1008d4190eeea' then
  raise exception 'Unexpected scorecard confirmation definition; review permissions before applying';
 end if;
 if (select proowner from pg_proc where oid='public.confirm_scorecard_player(uuid,uuid,jsonb)'::regprocedure)<>'postgres'::regrole
  or has_function_privilege('anon','public.confirm_scorecard_player(uuid,uuid,jsonb)','execute')
  or not has_function_privilege('authenticated','public.confirm_scorecard_player(uuid,uuid,jsonb)','execute') then
  raise exception 'Unexpected scorecard confirmation owner or grants';
 end if;
end $guard$;
alter function public.confirm_scorecard_player(uuid,uuid,jsonb) security definer;
