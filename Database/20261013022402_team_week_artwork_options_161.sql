-- Add optional reference, logo and blurb to the existing weekly-artwork flow.
-- Access rules and immutable image storage are unchanged.
do $patch$
declare src text:=pg_get_functiondef('club_selection_private.team_week_api(uuid,text,jsonb)'::regprocedure);
 needle text:='  insert into club_selection_private.team_week_design values(c,path,layout,1)';
begin
 if position(needle in src)=0 or position('select id,week_end,title,rows,image_path,created_at' in src)=0 then raise exception 'Weekly API changed; review artwork extension';end if;
 src:=replace(src,'select id,week_end,title,rows,image_path,created_at','select id,week_end,title,rows,image_path,created_at,request->>''blurb'' blurb');
 src:=replace(src,'if length(btrim(coalesce(p_data->>''title'','''')))=0','if length(coalesce(p_data->>''blurb'',''''))>2000 or length(btrim(coalesce(p_data->>''title'','''')))=0');
 src:=replace(src,needle,$validation$
  if coalesce(layout->>'font_scale','100')!~'^[0-9]{2,3}$' or coalesce((layout->>'font_scale')::integer,100) not between 75 and 120
   or coalesce(layout->>'logo_scale','100')!~'^[0-9]{2,3}$' or coalesce((layout->>'logo_scale')::integer,100) not between 70 and 150
   or coalesce(layout->>'text_colour','#FFFFFF')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Check text and logo sizing';end if;
  for candidate in select * from jsonb_array_elements(jsonb_build_array(layout->'example_path',layout->'logo_path')) loop
   if candidate#>>'{}' is not null and ((candidate#>>'{}') !~ ('^'||c::text||'/backgrounds/[0-9a-f-]{36}\.png$')
    or not exists(select 1 from storage.objects where bucket_id='club-team-week' and name=candidate#>>'{}')) then raise exception 'Upload artwork from this club before saving';end if;
  end loop;
$validation$||needle);
 execute src;
end $patch$;
