-- Normal team sizes belong to a canonical Selection Group, never a fixture label.
-- Twelve/13-player women's teams need no additional size acknowledgement.
alter table club_selection_private.selection_groups
 add column normal_player_limit smallint not null default 11
 check (normal_player_limit between 11 and 13);

create function club_selection_private.normal_player_limit(c uuid,d jsonb) returns integer
language sql stable security invoker set search_path='' as $$
 select coalesce((select normal_player_limit from club_selection_private.selection_groups
  where club_id=c and id=club_selection_private.fixture_selection_group(c,d)),11)::integer
$$;
revoke all on function club_selection_private.normal_player_limit(uuid,jsonb) from public,anon,authenticated;

do $migration$
declare definition text;before text;after text;changed integer;
begin
 definition:=pg_get_functiondef('club_selection_private.issues(uuid)'::regprocedure);
 before:='notes jsonb:=''[]'';n int;';after:=before||'normal_limit int;';
 if position(before in definition)=0 then raise exception 'Unexpected team-size variables';end if;
 definition:=replace(definition,before,after);
 before:='select * into m from club_selection_private.fixtures where id=f;';
 after:=before||E'\n normal_limit:=club_selection_private.normal_player_limit(m.club_id,m.details);';
 if position(before in definition)=0 then raise exception 'Unexpected team-size fixture lookup';end if;
 definition:=replace(definition,before,after);
 if position('if n=12 then' in definition)=0 or position('elsif n>12 then' in definition)=0 then raise exception 'Unexpected team-size validation';end if;
 definition:=replace(definition,'if n=12 then','if n=12 and normal_limit=11 then');
 definition:=replace(definition,'elsif n>12 then','elsif n>greatest(normal_limit,12) then');
 definition:=replace(definition,'(n-11)','(n-normal_limit)');
 before:='if jsonb_array_length(m.slots)>11';
 if position(before in definition)=0 then raise exception 'Unexpected selection-slot validation';end if;
 definition:=replace(definition,before,'if jsonb_array_length(m.slots)>normal_limit');
 definition:=replace(definition,'''Arrange the selected players into 11 slots before sharing the team''','''Arrange the selected players into ''||normal_limit||'' slots before sharing the team''');
 execute definition;

 definition:=pg_get_functiondef('club_selection_private.api(uuid,text,jsonb)'::regprocedure);
 before:='''Fit the team into 11 slots before sending to captains''';
 after:='''Fit the team into % slots before sending to captains'',club_selection_private.normal_player_limit(c,m.details)';
 if position(before in definition)=0 then raise exception 'Unexpected captain-review size message';end if;
 execute replace(definition,before,after);

 definition:=pg_get_functiondef('club_selection_private.selection_groups_context(uuid)'::regprocedure);
 before:='''batting_enabled'',batting_enabled';after:=before||',''normal_player_limit'',normal_player_limit';
 if position(before in definition)=0 then raise exception 'Unexpected Selection Group context';end if;
 execute replace(definition,before,after);

 definition:=pg_get_functiondef('public.club_selections_api(uuid,text,jsonb)'::regprocedure);
 before:='''selection_group_id'',club_selection_private.fixture_selection_group(p_club_id,coalesce(f->''details'',f#>''{published,details}''))';
 after:=before||',''normal_player_limit'',club_selection_private.normal_player_limit(p_club_id,coalesce(f->''details'',f#>''{published,details}''))';
 if position(before in definition)=0 then raise exception 'Unexpected fixture context';end if;
 execute replace(definition,before,after);

 -- User-confirmed competition allowance for the beta club's women's teams.
 update club_selection_private.selection_groups sg set normal_player_limit=13
 from public.clubs c where c.id=sg.club_id and c.slug='newcastle-city' and sg.name='City Women''s Teams';
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Expected the existing Newcastle City women''s Selection Group';end if;
end $migration$;
