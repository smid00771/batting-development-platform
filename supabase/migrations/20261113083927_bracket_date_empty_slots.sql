do $patch$
declare src text;before text;after text;
begin
 select pg_get_functiondef('club_selection_private.fixture_overs_from_settings()'::regprocedure) into src;
 before:='select jsonb_agg(s-''rep_player_id''-''rep_absent_date'' order by n) into new.slots';
 after:='select coalesce(jsonb_agg(s-''rep_player_id''-''rep_absent_date'' order by n),''[]''::jsonb) into new.slots';
 if strpos(src,before)=0 then raise exception 'Expected representative date cleanup not found';end if;
 execute replace(src,before,after);
end $patch$;
