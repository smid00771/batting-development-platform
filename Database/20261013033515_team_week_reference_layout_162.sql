-- Allow movable overlays and validated example guidance. Existing access and image immutability stay intact.
do $patch$
declare src text:=pg_get_functiondef('club_selection_private.team_week_api(uuid,text,jsonb)'::regprocedure);
 needle text:='  insert into club_selection_private.team_week_design values(c,path,layout,1)';
begin
 if position(needle in src)=0 or position('not between 400 and 700' in src)=0 then raise exception 'Weekly API changed; review layout extension';end if;
 src:=replace(src,'coalesce(layout->>''top'','''')!~''^[0-9]{3}$'' or (layout->>''top'')::integer not between 400 and 700','coalesce(layout->>''top'','''')!~''^[0-9]{1,4}$'' or (layout->>''top'')::integer not between 50 and 1200');
 src:=replace(src,'coalesce(layout->>''bottom'','''')!~''^1[0-9]{3}$'' or (layout->>''bottom'')::integer not between 1100 and 1290','coalesce(layout->>''bottom'','''')!~''^[0-9]{1,4}$'' or (layout->>''bottom'')::integer not between 150 and 1320 or (layout->>''bottom'')::integer-(layout->>''top'')::integer<100');
 src:=replace(src,needle,$validation$
  for candidate in select * from jsonb_array_elements('[ ["title_y",0,1300],["title_size",40,160],["week_y",0,1320],["left",20,160],["figures_right",650,910],["grade_right",950,1060],["logo_x",0,100],["logo_y",0,100],["logo_width",3,60] ]') loop
   if layout ? (candidate->>0) and (jsonb_typeof(layout->(candidate->>0)) is distinct from 'number' or layout->>(candidate->>0)!~'^[0-9]{1,4}$' or (layout->>(candidate->>0))::int not between (candidate->>1)::int and (candidate->>2)::int) then raise exception 'Check overlay positions';end if;
  end loop;
  if layout ? 'show_logo' and jsonb_typeof(layout->'show_logo') is distinct from 'boolean' then raise exception 'Choose whether to add a logo';end if;
  if layout ? 'reference' then
   if jsonb_typeof(layout->'reference') is distinct from 'object' or jsonb_typeof(layout#>'{reference,names}') is distinct from 'array' or jsonb_array_length(layout#>'{reference,names}')>20
    or (layout#>>'{reference,week_end}' is not null and layout#>>'{reference,week_end}'!~'^\d{4}-\d{2}-\d{2}$') then raise exception 'Check example names and week';end if;
   for candidate in select * from jsonb_array_elements(layout#>'{reference,names}') loop
    if jsonb_typeof(candidate) is distinct from 'object' or jsonb_typeof(candidate->'name') is distinct from 'string' or length(btrim(candidate->>'name')) not between 1 and 80 or length(coalesce(candidate->>'grade',''))>80 or length(coalesce(candidate->>'figures',''))>100 then raise exception 'Use short player names and grades';end if;
   end loop;
  end if;
$validation$||needle);
 execute src;
end $patch$;
